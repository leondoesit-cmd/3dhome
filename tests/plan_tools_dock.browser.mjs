/* Dockable panels over the plan: what they do in a real layout.
 *
 * Every claim here is geometric, which is why it needs a layout engine rather
 * than a string match. js/plan_tools_dock.js writes zone boxes and a handful of
 * attributes; everything you can actually see — a panel flush against the pane
 * with no border on that side, two panels tiled with exactly one hairline
 * between them, the tool column becoming a tool row — is CSS resolving against
 * a pane whose size only a browser knows. A rule can exist and still leave a
 * 1px gap, or a rounded corner, against the frame.
 *
 * Drags are driven through each panel's own grip, one animation frame apart,
 * because the dock re-measures on every move: a synchronous burst would land
 * the orientation change and the re-measure in the same frame, which is not
 * how a real drag arrives. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function planner(width = 1440, height = 900) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    // the whole-pane plan: in the split, "does it fit" is a fact about the
    // split rather than about the dock
    const plan = document.getElementById("viewPlanBtn");
    if (plan) plan.click();
    // Rearranging planner chrome is an explicit Customize UI action.
    localStorage.setItem('mf_uikit','1');
    const host=await import('/js/uikit_host/index.js');
    const ui=host.activeUIKit()||host.initUIKit({force:true});
    await ui.edit(true);

    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    window.__dock = {
      frame,
      pane: () => document.getElementById("view-2d"),
      wrap: (key) => document.querySelector('.pt-panel[data-panel="' + key + '"]'),
      zoneOf: (key) => {
        const w = window.__dock.wrap(key);
        const z = w && w.closest(".pt-zone");
        return z ? z.getAttribute("data-zone") : null;
      },
      box: (el) => {
        const pr = window.__dock.pane().getBoundingClientRect();
        const r = (el.getBoundingClientRect ? el : window.__dock.wrap(el)).getBoundingClientRect();
        return { x: r.left - pr.left, y: r.top - pr.top, r: r.right - pr.left, b: r.bottom - pr.top,
                 w: r.width, h: r.height, pw: pr.width, ph: pr.height };
      },
      /* Drop a panel at a point given as a fraction of the pane, so the same
         gesture means the same thing at any window size. */
      async dragTo(key, fx, fy) {
        // Finish layout transitions before taking the drag's starting bounds.
        // Otherwise a busy browser can begin the gesture on a moving panel.
        await Promise.all(document.getAnimations().filter((a) =>
          Number.isFinite(a.effect?.getComputedTiming().endTime)
        ).map((a) => a.finished.catch(() => {})));
        const w = window.__dock.wrap(key);
        const g = w.querySelector(".pt-grip");
        const pr = window.__dock.pane().getBoundingClientRect();
        const r = g.getBoundingClientRect();
        const from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        const to = { x: pr.left + pr.width * fx, y: pr.top + pr.height * fy };
        const ev = (type, x, y) =>
          g.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 3, isPrimary: true,
            pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
            clientX: x, clientY: y, shiftKey: true,
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
      // what the panel looks like on each side, once it is docked
      sides(key) {
        const cs = getComputedStyle(window.__dock.wrap(key));
        return {
          flush: window.__dock.wrap(key).getAttribute("data-flush"),
          join: window.__dock.wrap(key).getAttribute("data-join"),
          border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
          radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius,
                   cs.borderBottomRightRadius, cs.borderBottomLeftRadius],
          shadow: cs.boxShadow,
        };
      },
    };
  });
  return shared;
}

test("each panel docks on its own, to any of the eight positions", opts, async () => {
  const page = await planner();
  // the four edges, then the four corners
  const drops = [
    ["left", 0.008, 0.5], ["right", 0.992, 0.5], ["top", 0.5, 0.01], ["bottom", 0.5, 0.992],
    ["top-left", 0.01, 0.012], ["top-right", 0.99, 0.012],
    ["bottom-left", 0.008, 0.97], ["bottom-right", 0.992, 0.97],
  ];
  for (const [want, fx, fy] of drops) {
    const got = await page.eval(async (k, x, y) => {
      const before = window.__dock.zoneOf("layers");
      await window.__dock.dragTo("tools", x, y);
      return {
        zone: window.__dock.zoneOf("tools"),
        layersMoved: window.__dock.zoneOf("layers") !== before,
        box: window.__dock.box("tools"),
        status: (document.querySelector('.pt-panel[data-panel="cad"]') ||
          document.getElementById("cad-status") || { offsetHeight: 0 }).offsetHeight,
      };
    }, want, fx, fy);
    assert.equal(got.zone, want, `a drop at ${fx}/${fy} must dock ${want}`);
    assert.equal(got.layersMoved, false, "moving one panel must not move the other");
    // FLUSH: against the pane edge exactly, not near it
    if (want.indexOf("left") >= 0) assert.ok(Math.abs(got.box.x) <= 1, want + ": flush left");
    if (want.indexOf("right") >= 0) assert.ok(Math.abs(got.box.r - got.box.pw) <= 2, want + ": flush right");
    if (want.indexOf("top") >= 0) assert.ok(Math.abs(got.box.y) <= 1, want + ": flush top, y=" + got.box.y);
    if (want.indexOf("bottom") >= 0) {
      // flush to the bottom of the pane the user can use: #cad-status owns the
      // strip below it and must never be covered
      assert.ok(Math.abs(got.box.b - (got.box.ph - got.status)) <= 2, want + ": flush above the status bar");
    }
  }
});

test("a docked panel drops the floating card on the sides that touch the frame", opts, async () => {
  const page = await planner();
  const got = await page.eval(async () => {
    await window.__dock.dragTo("tools", 0.01, 0.012); // the top-left corner
    return { corner: window.__dock.sides("tools"), zone: window.__dock.zoneOf("tools") };
  });
  assert.equal(got.zone, "top-left");
  const [bt, br, bb, bl] = got.corner.border;
  assert.equal(bt, "0px", "no border along the top edge it is flush with");
  assert.equal(bl, "0px", "no border along the left edge it is flush with");
  assert.notEqual(br, "0px", "the sides facing the plan keep their border");
  assert.notEqual(bb, "0px");
  const [tl, tr, brr, blr] = got.corner.radius;
  assert.equal(tl, "0px", "the corner in the frame's corner is square");
  assert.equal(tr, "0px");
  assert.equal(blr, "0px");
  assert.notEqual(brr, "0px", "the one corner facing the plan stays rounded");
  assert.equal(got.corner.shadow, "none", "a docked panel is part of the frame, not a card over it");
});

test("panels tile flush, side by side or stacked, with one divider", opts, async () => {
  const page = await planner();
  const beside = await page.eval(async () => {
    await window.__dock.dragTo("tools", 0.008, 0.5); // tools: left edge
    // drop the chips PAST the tool column's right side: "beside", not "under"
    const t = window.__dock.box("tools");
    const pane = window.__dock.pane().getBoundingClientRect();
    await window.__dock.dragTo("layers", (t.r + 10) / pane.width, 0.5);
    return {
      zone: window.__dock.zoneOf("layers"),
      flow: window.__dock.wrap("layers").closest(".pt-zone").getAttribute("data-flow"),
      tools: window.__dock.box("tools"), layers: window.__dock.box("layers"),
      t: window.__dock.sides("tools"), l: window.__dock.sides("layers"),
    };
  });
  assert.equal(beside.zone, "left", "dropped into the zone the tools already hold");
  assert.equal(beside.flow, "row", "past its right side means beside it");
  assert.ok(Math.abs(beside.layers.x - beside.tools.r) <= 1, "no gap between tiled panels");
  assert.ok(Math.abs(beside.tools.y - beside.layers.y) <= 1, "tiled panels start at the same edge");
  // exactly one hairline between them, and no rounding across the join
  assert.equal(beside.t.border[1], "0px", "the panel nearer the edge drops the side it would double");
  assert.notEqual(beside.l.border[3], "0px", "the neighbour's border IS the divider");
  assert.equal(beside.t.radius[1], "0px", "square across a join");
  assert.equal(beside.l.radius[0], "0px");

  const stacked = await page.eval(async () => {
    const t = window.__dock.box("tools");
    const pane = window.__dock.pane().getBoundingClientRect();
    // drop it BELOW the tool column instead, still nearest the left edge
    await window.__dock.dragTo("layers", (t.x + 10) / pane.width, (t.b + 10) / pane.height);
    return {
      zone: window.__dock.zoneOf("layers"),
      flow: window.__dock.wrap("layers").closest(".pt-zone").getAttribute("data-flow"),
      tools: window.__dock.box("tools"), layers: window.__dock.box("layers"),
      t: window.__dock.sides("tools"), l: window.__dock.sides("layers"),
    };
  });
  assert.equal(stacked.zone, "left");
  assert.equal(stacked.flow, "column", "past its bottom means under it");
  assert.ok(Math.abs(stacked.layers.y - stacked.tools.b) <= 1, "no gap between stacked panels");
  assert.equal(stacked.t.border[2], "0px");
  assert.notEqual(stacked.l.border[0], "0px");
  // both are still flush with the edge they share
  assert.ok(Math.abs(stacked.tools.x) <= 1 && Math.abs(stacked.layers.x) <= 1, "both stay flush left");
});

test("a horizontal edge keeps the column's shape", opts, async () => {
  const page = await planner();
  const got = await page.eval(async () => {
    await window.__dock.dragTo("tools", 0.5, 0.01);
    const bar = document.getElementById("plan-toolbar");
    const pane = window.__dock.pane().getBoundingClientRect();
    const wrap = window.__dock.wrap("tools");
    return {
      axis: bar.getAttribute("data-axis"),
      zone: window.__dock.zoneOf("tools"),
      y: window.__dock.box("tools").y,
      w: bar.clientWidth, h: bar.clientHeight,
      offPane: Array.from(bar.querySelectorAll("button.tool")).filter((b) => {
        const r = b.getBoundingClientRect();
        return r.right > pane.right + 1 || r.left < pane.left - 1;
      }).length,
      chipLabels: getComputedStyle(document.querySelector(".lchip .lchip-t")).display,
      chipsAxis: document.getElementById("layer-chips").getAttribute("data-axis"),
      flush: wrap.getAttribute("data-flush"),
    };
  });
  assert.equal(got.zone, "top");
  assert.ok(Math.abs(got.y) <= 1, "it sits on the top edge");
  assert.equal(got.axis, "v", "docking must not restyle the column into a row");
  assert.ok(got.h > got.w, "the tools stay a column");
  assert.equal(got.offPane, 0, "every drawing tool stays inside the plan pane");
  assert.equal(got.chipsAxis, "v", "the chips were not dragged, so they did not change shape");
  assert.notEqual(got.chipLabels, "none", "...and they keep their labels");
});

test("the arrangement survives a reload, and the phone rail takes the panels back", opts, async () => {
  const page = await planner();
  await page.eval(async () => {
    await window.__dock.dragTo("tools", 0.992, 0.5);
    await window.__dock.dragTo("layers", 0.5, 0.992);
  });
  assert.deepEqual(await page.eval(() => [window.__dock.zoneOf("tools"), window.__dock.zoneOf("layers")]),
    ["right", "bottom"], "both drags commit before testing reload persistence");
  await page.goto("/");
  const kept = await page.eval(() => ({
    tools: document.querySelector('.pt-panel[data-panel="tools"]').closest(".pt-zone").getAttribute("data-zone"),
    layers: document.querySelector('.pt-panel[data-panel="layers"]').closest(".pt-zone").getAttribute("data-zone"),
  }));
  assert.equal(kept.tools, "right", "where a panel lives is a view preference and must be restored");
  assert.equal(kept.layers, "bottom");

  // Below 1024px the same element IS the phone rail, laid out by the media
  // queries; the dock has to dismantle itself rather than fight them.
  await page.resize(390, 844, { touch: true, mobile: true });
  await page.goto("/");
  const phone = await page.eval(() => {
    const layer = document.getElementById("plan-tools");
    return {
      dock: layer.classList.contains("pt-dock"),
      zones: document.querySelectorAll(".pt-zone").length,
      grips: document.querySelectorAll(".pt-grip").length,
      kids: Array.from(layer.children).map((c) => c.id),
    };
  });
  assert.equal(phone.dock, false, "the phone rail must keep its own layout");
  assert.equal(phone.zones, 0, "no dock zones left in the rail");
  assert.equal(phone.grips, 0, "no grip that cannot move anything");
  assert.deepEqual(
    phone.kids,
    ["plan-toolbar", "layer-chips", "plan-wall-palette", "plan-room-palette"],
    "the panels go back to being the rail's own children, in their own order",
  );
});

/* A share of the window is not a size. The 3D-heavy end of the split used to
   leave a 140px plan on a 1440px screen, and every one of these panels is sized
   for a window: the 198px layer panel painted straight over the 3D view and the
   inspector, because nothing about that window was narrow. */
test("a split-view plan keeps its chrome inside the pane, however narrow", opts, async () => {
  const page = await planner(1440, 900);
  const state = await page.eval(async () => {
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
    await (await import("/js/uikit_host/index.js")).activeUIKit().edit(false);
    window.__setViewMode("split");
    await settle();
    /* Through the button, not the class: switching orientation is what
       re-applies the ratio, and the ratio is what is being tested. */
    const orient = document.getElementById("splitOrientationBtn");
    if (!document.body.classList.contains("split-side") && orient) orient.click();
    await settle();
    /* Drag the divider as far towards the plan as the app will let it go. The
       resizer is a mouse-era control: it listens for mousedown/mousemove. */
    const canvas = document.getElementById("center-canvas");
    const grip = document.getElementById("view-resizer");
    const rect = canvas.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    const send = (target, type, x) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === "mouseup" ? 0 : 1,
    }));
    send(grip, "mousedown", rect.left + rect.width / 2);
    for (let i = 1; i <= 6; i++) {
      send(window, "mousemove", rect.left + rect.width * (0.5 + (0.5 * i) / 6));
      await settle();
    }
    send(window, "mouseup", rect.right);
    await settle();
    const pane = document.getElementById("view-2d");
    const paneRect = pane.getBoundingClientRect();
    const outside = [];
    document.querySelectorAll("#plan-toolbar, #layer-chips, #plan-wall-palette, #plan-room-palette, #cad-status").forEach((panel) => {
      if (!panel.offsetParent) return;
      const box = panel.getBoundingClientRect();
      if (box.right > paneRect.right + 1 || box.left < paneRect.left - 1 ||
          box.bottom > paneRect.bottom + 1 || box.top < paneRect.top - 1) {
        outside.push(panel.id + " " + Math.round(box.left) + ".." + Math.round(box.right));
      }
    });
    return {
      paneWidth: Math.round(paneRect.width),
      narrow: pane.classList.contains("plan-narrow"),
      tiny: pane.classList.contains("plan-tiny"),
      labels: getComputedStyle(document.querySelector("#layer-chips .lchip-t") || document.body).display,
      outside,
    };
  });
  assert.ok(state.paneWidth >= 300,
    "the divider stops at a plan you could still work in, not at 12% of the window");
  assert.equal(state.narrow, true, "and the pane says so, so its chrome can compact");
  assert.equal(state.labels, "none", "layer names give way before the plan does");
  assert.equal(state.tiny, false, "the narrowest the divider goes still docks its panels");
  assert.deepEqual(state.outside, [], "nothing paints outside the pane it belongs to");
});

/* Every test above moves panels and the arrangement is persisted, so these two
   say where they start from. */
async function arranged(page, panels, zones) {
  await page.eval(async(p,z)=>{
    const host=await import('/js/uikit_host/index.js'),bridge=await import('/js/uikit_host/dock.js');
    const ui=host.activeUIKit();ui.resetAll();
    // The fixture describes a specific arrangement, not the shipped defaults.
    bridge.writeDock('status','bottom','h','row',false);
    for(const [key,value] of Object.entries(p).sort((a,b)=>(a[1].order||0)-(b[1].order||0))){
      const zone=z[value.zone]||{};bridge.writeDock(key,value.zone,zone.axis,zone.flow,false);
    }
    ui.refreshNow();await new Promise(requestAnimationFrame);
  },panels,zones);
  return page;
}

/* Short panels should leave the canvas exposed below their contents, while
   a group too wide for its pane still stacks to keep its controls reachable. */
test("tiled panels keep their content height, and stack when they cannot fit", opts, async () => {
  let page = await planner(1440, 900);
  page = await arranged(page, {
    tools: { zone: "left", order: 0 }, layers: { zone: "left", order: 1 }, walls: { zone: "left", order: 2 },
  }, { left: { axis: "v", flow: "row" } });
  const tiled = await page.eval(() => {
    const tools = window.__dock.box("tools"), layers = window.__dock.box("layers");
    return {
      flow: window.__dock.wrap("layers").closest(".pt-zone").getAttribute("data-flow"),
      heights: [Math.round(tools.h), Math.round(layers.h)],
      layerContentHeight: document.getElementById("layer-chips").getBoundingClientRect().height,
      overlap: tools.r > layers.x + 1 && layers.r > tools.x + 1,
      gap: Math.round(layers.x - tools.r),
    };
  });
  assert.equal(tiled.flow, "row", "they are tiled side by side");
  assert.ok(tiled.heights[1] <= tiled.layerContentHeight + 32,
    "the layer panel follows its own content height: " + JSON.stringify(tiled));
  assert.equal(tiled.overlap, false, "and no part of one is under the other");
  assert.equal(tiled.gap, 0, "flush: one hairline between them, not a gutter");

  /* The same pair on the top edge, laid out ALONG the pane rather than across
     it, and then the pane squeezed until they cannot both fit. */
  page = await arranged(page, {
    tools: { zone: "top", order: 0 }, layers: { zone: "top", order: 1 }, walls: { zone: "top", order: 2 },
  }, { top: { axis: "h", flow: "row" } });
  const stacked = await page.eval(async () => {
    await (await import("/js/uikit_host/index.js")).activeUIKit().edit(false);
    const settle = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 40)));
    window.__setViewMode("split");
    await settle();
    const orient = document.getElementById("splitOrientationBtn");
    if (!document.body.classList.contains("split-side") && orient) orient.click();
    await settle();
    const canvas = document.getElementById("center-canvas");
    const grip = document.getElementById("view-resizer");
    const rect = canvas.getBoundingClientRect(), y = rect.top + rect.height / 2;
    const send = (target, type, x) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === "mouseup" ? 0 : 1,
    }));
    send(grip, "mousedown", rect.left + rect.width / 2);
    for (let i = 1; i <= 6; i++) {
      send(window, "mousemove", rect.left + rect.width * (0.5 + (0.5 * i) / 6));
      await settle();
    }
    send(window, "mouseup", rect.right);
    await settle();
    await settle();
    const pane = window.__dock.pane().getBoundingClientRect();
    const tools = window.__dock.box("tools"), layers = window.__dock.box("layers");
    const scrolls = ["plan-toolbar", "layer-chips"].filter((id) => {
      const el = document.getElementById(id);
      return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    });
    return {
      paneWidth: Math.round(pane.width),
      flow: window.__dock.wrap("layers").closest(".pt-zone").getAttribute("data-flow"),
      widths: [Math.round(tools.w), Math.round(layers.w)],
      inside: tools.r <= pane.width + 1 && layers.r <= pane.width + 1,
      overlap: tools.b > layers.y + 1 && layers.b > tools.y + 1,
      scrolls,
      toolbarOverflow: getComputedStyle(document.getElementById("plan-toolbar")).overflowX,
    };
  });
  assert.ok(stacked.paneWidth < 460, "the pane is now narrower than the pair was wide");
  assert.equal(stacked.flow, "column", "so they move one under the other");
  assert.ok(stacked.widths.every((width) => width > 0), "both stacked panels remain usable");
  assert.equal(stacked.inside, true, "and both are inside the pane");
  assert.equal(stacked.overlap, false, "and neither is on top of the other");
  assert.deepEqual(stacked.scrolls.filter(id => id !== "plan-toolbar"), [],
    "the layer list fits within its stacked panel");
  if (stacked.scrolls.includes("plan-toolbar")) assert.match(stacked.toolbarOverflow, /auto|scroll/,
    "the single-row toolbar exposes overflow commands through scrolling");
});

/* The drop is the one moment the user is choosing between arrangements, so the
   preview has to be the arrangement — the slot, at the size the panel will be
   in it — and not an outline of the thing they happen to be holding. */
test("the drag preview is the slot, in the shape the panel will take there", opts, async () => {
  let page = await planner(1440, 900);
  page = await arranged(page, {
    tools: { zone: "left", order: 0 }, layers: { zone: "left", order: 1 }, walls: { zone: "left", order: 2 },
  }, { left: { axis: "v", flow: "row" } });
  const preview = await page.eval(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 16)));
    const wrap = window.__dock.wrap("layers"), grip = wrap.querySelector(".pt-grip");
    const pane = window.__dock.pane().getBoundingClientRect();
    const start = grip.getBoundingClientRect();
    const send = (type, x, y) => grip.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 9, isPrimary: true, pointerType: "mouse",
      button: 0, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, shiftKey: true,
    }));
    const docked = wrap.getBoundingClientRect().height;
    send("pointerdown", start.left + start.width / 2, start.top + start.height / 2);
    await frame();
    const lifted = wrap.getBoundingClientRect().height;
    const to = { x: pane.left + pane.width * 0.5, y: pane.top + pane.height * 0.01 };
    for (let i = 1; i <= 8; i++) {
      send("pointermove", start.left + (to.x - start.left) * i / 8, start.top + (to.y - start.top) * i / 8);
      await frame();
    }
    const card = wrap.getBoundingClientRect();
    const drop = document.querySelector(".pt-drop").getBoundingClientRect();
    const axis = wrap.getAttribute("data-axis");
    send("pointerup", to.x, to.y);
    await frame();
    await frame();
    const landed = window.__dock.wrap("layers").getBoundingClientRect();
    return {
      docked: Math.round(docked), lifted: Math.round(lifted),
      axis,
      card: { w: Math.round(card.width), h: Math.round(card.height) },
      drop: { w: Math.round(drop.width), h: Math.round(drop.height) },
      landed: { w: Math.round(landed.width), h: Math.round(landed.height) },
      dropHidden: document.querySelector(".pt-drop").hidden,
    };
  });
  assert.ok(preview.lifted < preview.docked,
    "lifted, the card is its own size again rather than the height it was stretched to");
  assert.equal(preview.axis, "v", "in the air the card keeps the column it started as");
  assert.ok(Math.abs(preview.drop.w - preview.card.w) <= 8,
    "the dashed slot is the card they are holding, not a restyled row");
  assert.ok(Math.abs(preview.landed.w - preview.card.w) <= 24,
    "and docking does not restretch it");
  assert.equal(preview.dropHidden, true, "the indicator goes away with the drag");
});
