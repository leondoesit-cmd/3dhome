/* Panels you can actually put where you want them.
 *
 * The dock resolves a drop to one of eight zones, and it used to resolve EVERY
 * drop that way: targetFor() picked the nearest pane edge, and there is always
 * a nearest edge, so a panel released in the middle of the plan flew to a wall.
 * Snapping is worth keeping near an edge and worth not having anywhere else.
 *
 * These are geometric claims about a real pane, so they need a browser.
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;
test.after(async () => { if (shared) await shared.close(); });

async function planner(width = 1440, height = 900) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.eval(() => localStorage.removeItem("home3d_plan_dock"));
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const plan = document.getElementById("viewPlanBtn");
    if (plan) plan.click();
    // Rearranging planner chrome is an explicit Customize UI action.
    localStorage.setItem('mf_uikit','1');
    const host=await import('/js/uikit_host/index.js');
    const ui=host.activeUIKit()||host.initUIKit({force:true});
    await ui.edit(true);

    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    window.__free = {
      frame,
      pane: () => document.getElementById("view-2d"),
      wrap: (key) => document.querySelector('.pt-panel[data-panel="' + key + '"]'),
      zoneOf: (key) => {
        const w = window.__free.wrap(key);
        const z = w && w.closest(".pt-zone");
        return z ? z.getAttribute("data-zone") : null;
      },
      isFree: (key) => window.__free.wrap(key).classList.contains("pt-free"),
      box: (key) => {
        const pr = window.__free.pane().getBoundingClientRect();
        const r = window.__free.wrap(key).getBoundingClientRect();
        return { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height,
                 pw: pr.width, ph: pr.height };
      },
      async dragTo(key, fx, fy, shift) {
        const w = window.__free.wrap(key);
        const g = w.querySelector(".pt-grip");
        const pr = window.__free.pane().getBoundingClientRect();
        const r = g.getBoundingClientRect();
        const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const to = { x: pr.left + pr.width * fx, y: pr.top + pr.height * fy };
        const ev = (type, x, y) => g.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 5, isPrimary: true,
          pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
          clientX: x, clientY: y, shiftKey: !!shift,
        }));
        ev("pointerdown", from.x, from.y);
        await frame();
        for (let i = 1; i <= 6; i++) {
          ev("pointermove", from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6);
          await frame();
        }
        ev("pointerup", to.x, to.y);
        await frame();
      },
    };
  });
  await shared.waitUntil(() => !!document.querySelector('.pt-panel[data-panel="tools"] .pt-grip'),
    { what: "the dockable tool panel" });
  await shared.eval(() => window.__free.frame());
  return shared;
}

test("a panel dropped in open plan stays where it was dropped", opts, async () => {
  const page = await planner();
  const at = await page.eval(async () => {
    await window.__free.dragTo("tools", 0.5, 0.45);
    return { free: window.__free.isFree("tools"), zone: window.__free.zoneOf("tools"), box: window.__free.box("tools") };
  });
  assert.equal(at.zone, null, "a free panel must not be inside a dock zone");
  assert.equal(at.free, true, "the panel should be carrying the free card");
  /* Dropped mid-pane, it must have LANDED mid-pane — the bug was that it flew
     to whichever edge happened to be nearest. The corner is what the drop
     positions (the panel hangs from the grip under the cursor), so that is what
     this measures; the centre would just be measuring the panel's own height. */
  assert.ok(Math.abs(at.box.x - at.box.pw * 0.5) < at.box.pw * 0.15,
    "dropped mid-pane, the panel's left edge is at " + Math.round(at.box.x) + " of " + Math.round(at.box.pw));
  assert.ok(Math.abs(at.box.y - at.box.ph * 0.45) < at.box.ph * 0.15,
    "dropped mid-pane, the panel's top edge is at " + Math.round(at.box.y) + " of " + Math.round(at.box.ph));
  // And it is a whole card again: nothing is flush with anything.
  const sides = await page.eval(() => ({
    flush: window.__free.wrap("tools").getAttribute("data-flush"),
    join: window.__free.wrap("tools").getAttribute("data-join"),
    radius: getComputedStyle(window.__free.wrap("tools")).borderTopLeftRadius,
  }));
  assert.equal(sides.flush, null, "a free panel is flush against nothing");
  assert.equal(sides.join, null, "a free panel joins nothing");
  assert.notEqual(sides.radius, "0px", "a free panel keeps its rounded card");
});

test("dropping near an edge stays free unless Shift is held", opts, async () => {
  const page = await planner();
  const right = await page.eval(async () => {
    await window.__free.dragTo("tools", 0.995, 0.5);
    return { zone: window.__free.zoneOf("tools"), free: window.__free.isFree("tools") };
  });
  assert.equal(right.free, true, "an ordinary drop on the edge must not snap to a preset");
  assert.equal(right.zone, null);

  const docked = await page.eval(async () => {
    await window.__free.dragTo("tools", 0.45, 0.5);
    await window.__free.dragTo("tools", 0.995, 0.5, true);
    return { zone: window.__free.zoneOf("tools"), free: window.__free.isFree("tools") };
  });
  assert.equal(docked.free, false, "Shift-drop on the edge is the opt-in to dock");
  assert.ok(docked.zone && docked.zone.indexOf("right") >= 0,
    "a Shift-drop on the right edge should dock right, got " + docked.zone);
});

test("a free position survives a reload and cannot be resized out of reach", opts, async () => {
  const page = await planner();
  const before = await page.eval(async () => {
    await window.__free.dragTo("layers", 0.55, 0.6);
    return window.__free.box("layers");
  });
  assert.ok(before.x > 0 && before.y > 0, "the panel should be somewhere in the middle to start with");

  await page.goto("/");
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const plan = document.getElementById("viewPlanBtn");
    if (plan) plan.click();
  });
  await page.waitUntil(() => !!document.querySelector('.pt-panel[data-panel="layers"]'),
    { what: "the layer panel after reload" });
  /* The plan pane comes up short and grows to its real height a few frames
     later, and the dock re-places on that growth. Both conditions matter: a
     full-size pane, and a panel that has stopped moving inside it. Settling for
     one without the other reads the panel while it is still clamped into a
     420px pane. */
  await page.waitUntil(() => document.getElementById("view-2d").getBoundingClientRect().height > 600,
    { what: "the plan pane to reach its real height" });
  /* And then one beat longer than the dock's own relayout floor. It schedules
     on rAF with a 120ms timer under it, so the pane growing and the panel being
     re-placed are two different moments; polling for a "stable" top without
     this reads the panel in the gap between them. */
  await page.eval(() => new Promise((r) => setTimeout(r, 260)));
  const after = await page.eval(() => {
    const pr = document.getElementById("view-2d").getBoundingClientRect();
    const w = document.querySelector('.pt-panel[data-panel="layers"]');
    const r = w.getBoundingClientRect();
    return { free: w.classList.contains("pt-free"), x: r.left - pr.left, y: r.top - pr.top,
      dbg: "pane " + Math.round(pr.width) + "x" + Math.round(pr.height) + ", top " + w.style.top };
  });
  assert.equal(after.free, true, "the free position did not survive the reload");
  assert.ok(Math.abs(after.x - before.x) < 24 && Math.abs(after.y - before.y) < 24,
    "restored at " + Math.round(after.x) + "," + Math.round(after.y) +
    " instead of " + Math.round(before.x) + "," + Math.round(before.y) + " | " + after.dbg);

  /* A stored position outlives the pane size it was chosen at. The promise is
     that the panel stays GRABBABLE — its grip runs along the top edge, so the
     top-left corner has to remain inside the pane — not that a tall panel gets
     shoved up the pane to fit whole. */
  await page.resize(1200, 720);
  await page.eval(async()=>{await (await import("/js/uikit_host/index.js")).activeUIKit().edit(true);});
  await page.eval(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 120))));
  const narrow = await page.eval(() => {
    const pr = document.getElementById("view-2d").getBoundingClientRect();
    const w = document.querySelector('.pt-panel[data-panel="layers"]');
    // Below ~1024 the dock is dismantled and the panels go back to the phone
    // rail, which lays them out itself — a different promise, not this one.
    if (!w) return { reachable: true, detail: "dock released to the rail" };
    const g = w.querySelector(".pt-grip").getBoundingClientRect();
    return {
      reachable: g.left >= pr.left - 1 && g.right <= pr.right + 1
        && g.top >= pr.top - 1 && g.top <= pr.bottom - 1,
      detail: Math.round(g.left - pr.left) + "," + Math.round(g.top - pr.top)
        + " in " + Math.round(pr.width) + "x" + Math.round(pr.height),
    };
  });
  assert.equal(narrow.reachable, true, "the grip left the narrowed pane: " + narrow.detail);
});

test("a click on the grip does not cycle through preset docks", opts, async () => {
  const page = await planner();
  const got = await page.eval(async () => {
    const before = window.__free.zoneOf("tools");
    const g = window.__free.wrap("tools").querySelector(".pt-grip");
    const r = g.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = (type) => g.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 6, isPrimary: true,
      pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: x, clientY: y,
    }));
    ev("pointerdown");
    await window.__free.frame();
    ev("pointerup");
    await window.__free.frame();
    return { before, after: window.__free.zoneOf("tools"), free: window.__free.isFree("tools") };
  });
  assert.equal(got.after, got.before, "a click must not walk the dock ring");
  assert.equal(got.free, false);
});

test("a drop a little in from the edge stays free, and does not rotate in the air", opts, async () => {
  const page = await planner();
  const got = await page.eval(async () => {
    const startAxis = window.__free.wrap("tools").getAttribute("data-axis");
    await window.__free.dragTo("tools", 0.42, 0.4);
    return {
      free: window.__free.isFree("tools"),
      zone: window.__free.zoneOf("tools"),
      axis: window.__free.wrap("tools").getAttribute("data-axis"),
      startAxis,
      box: window.__free.box("tools"),
    };
  });
  assert.equal(got.free, true, "well inside the pane is open plan, not a dock preset");
  assert.equal(got.zone, null);
  assert.equal(got.axis, got.startAxis, "a free drop keeps the axis it started with");
  assert.ok(got.box.x > 80, "it actually landed inward, not on the left wall");
});

test("a drop under the top strip stays free and keeps its size", opts, async () => {
  const page = await planner();
  const got = await page.eval(async () => {
    const start = window.__free.box("status");
    const startAxis = window.__free.wrap("status").getAttribute("data-axis");
    /* ~8% down is the band that used to be inside SNAP_PAD 40 and JOIN_PAD 72,
       which is exactly where the Select pill was being sucked back to the top. */
    await window.__free.dragTo("status", 0.5, 0.08);
    const box = window.__free.box("status");
    return {
      free: window.__free.isFree("status"),
      zone: window.__free.zoneOf("status"),
      axis: window.__free.wrap("status").getAttribute("data-axis"),
      startAxis,
      startH: start.h,
      h: box.h,
      y: box.y,
      ph: box.ph,
    };
  });
  assert.equal(got.free, true, "just under the top edge is still open plan");
  assert.equal(got.zone, null);
  assert.equal(got.axis, got.startAxis, "moving it must not flip it into a column");
  assert.ok(Math.abs(got.h - got.startH) < 12, "moving it must not restretch the pill");
  assert.ok(got.y > 20, "it landed down the pane, not back on the top edge");
});

test("every 2D plan overlay is a movable panel", opts, async () => {
  const page = await planner();
  const got = await page.eval(() => {
    const keys = ["tools", "layers", "status", "floors", "cad", "gizmo", "max"];
    const out = {};
    keys.forEach((key) => {
      const w = document.querySelector('.pt-panel[data-panel="' + key + '"]');
      const g = w && w.querySelector(".pt-grip");
      out[key] = {
        wrap: !!w, grip: !!g, hidden: !!(w && w.hidden),
        resize: !!(w && w.querySelector(".pt-rh-se")),
      };
    });
    return out;
  });
  ["tools", "layers", "status", "floors", "cad", "gizmo", "max"].forEach((key) => {
    assert.equal(got[key].wrap, true, key + " should be wrapped as a plan panel");
    assert.equal(got[key].grip, true, key + " should have a move grip");
    assert.equal(got[key].resize, true, key + " should have resize handles");
  });
});

test("a free panel can be resized and the size survives a reload", opts, async () => {
  const page = await planner();
  const before = await page.eval(async () => {
    await window.__free.dragTo("tools", 0.45, 0.4);
    const w = window.__free.wrap("tools");
    const initial = window.__free.box("tools");
    const rh = w.querySelector(".pt-rh-se");
    const pr = window.__free.pane().getBoundingClientRect();
    const r = rh.getBoundingClientRect();
    const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const to = { x: from.x + 48, y: from.y + 36 };
    const ev = (type, x, y) => rh.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, isPrimary: true,
      pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: x, clientY: y,
    }));
    ev("pointerdown", from.x, from.y);
    await window.__free.frame();
    ev("pointermove", to.x, to.y);
    await window.__free.frame();
    ev("pointerup", to.x, to.y);
    await window.__free.frame();
    const box = window.__free.box("tools");
    return { w: box.w, h: box.h, pw: pr.width, initial };
  });
  assert.ok(before.w > before.initial.w && before.h > before.initial.h,
    "resize should grow the tools card: " + JSON.stringify(before));

  await page.goto("/");
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const plan = document.getElementById("viewPlanBtn");
    if (plan) plan.click();
  });
  await page.waitUntil(() => {
    const w = document.querySelector('.pt-panel[data-panel="tools"]');
    return !!(w && w.classList.contains("pt-free") && w.classList.contains("pt-sized"));
  }, { what: "the sized tools panel after reload" });
  await page.eval(() => new Promise((r) => setTimeout(r, 260)));
  const after = await page.eval(() => {
    const w = document.querySelector('.pt-panel[data-panel="tools"]');
    const r = w.getBoundingClientRect();
    return { w: r.width, h: r.height, sized: w.classList.contains("pt-sized") };
  });
  assert.equal(after.sized, true);
  assert.ok(Math.abs(after.w - before.w) < 8 && Math.abs(after.h - before.h) < 8,
    "restored size " + Math.round(after.w) + "x" + Math.round(after.h) +
    " instead of " + Math.round(before.w) + "x" + Math.round(before.h));
});

