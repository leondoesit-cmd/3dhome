/* Phase-5b gate: the plan dock's arrangement lives in the layout document.
 *
 * The split under test is that the dock keeps everything that makes it look
 * like a dock — flush edges, join borders, the axis that turns a tool column
 * into a tool row, the measure-both-ways fit — while WHICH panel sits in WHICH
 * zone, in what order, becomes part of the same document as the rest of the
 * chrome. What that buys is undo, reset, export and customize-mode editing for
 * an arrangement that previously had none of them.
 *
 * The dock's own suite (tests/plan_tools_dock.browser.mjs) runs with the flag
 * off and still describes the shipped behaviour unchanged. That is the other
 * half of the claim and the reason this is a separate file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

/* Boots with mf_uikit ON, so the dock and uikit come up in the order main.js
   really uses. `seed` writes the dock's own store before load, which is how
   the migration case is set up. */
async function docked({ seed = null, width = 1440, height = 900 } = {}) {
  if (!shared) shared = await openPage({ width, height });
  else await shared.resize(width, height);
  await shared.goto("/");
  await shared.eval((seedValue) => {
    localStorage.setItem("mf_uikit", "1");
    localStorage.removeItem("home3d_uikit:planner");
    if (seedValue) localStorage.setItem("home3d_plan_dock", seedValue);
    else localStorage.removeItem("home3d_plan_dock");
  }, seed ? JSON.stringify(seed) : null);
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const plan = document.getElementById("viewPlanBtn");
    if (plan) plan.click();
    for (let i = 0; i < 400 && !document.querySelector('[data-uikit-slot^="pt:"]'); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const host = await import("/js/uikit_host/index.js");
    window.__ui = host.activeUIKit();
    if (!window.__ui) throw new Error("uikit did not start");
    await window.__ui.edit(true);
    window.__zoneOf = (key) => {
      const wrap = document.querySelector('.pt-panel[data-panel="' + key + '"]');
      const zone = wrap && wrap.closest(".pt-zone");
      return zone ? zone.getAttribute("data-zone") : null;
    };
    window.__docZoneOf = (key) => {
      const doc = window.__ui.doc;
      for (const id of Object.keys(doc.nodes)) {
        if (!id.startsWith("n:pt-")) continue;
        if ((doc.nodes[id].children || []).indexOf("pt:" + key) >= 0) return id.slice(5);
      }
      return null;
    };
    /* The dock's keyboard path: an arrow on a grip sends the panel to that
       edge. Deterministic, unlike a synthetic pointer drag, and it goes
       through exactly the same dock() call. */
    window.__nudge = (key, arrow) => {
      const grip = document.querySelector('.pt-grip[data-grip="' + key + '"]');
      grip.dispatchEvent(new KeyboardEvent("keydown", { key: arrow, bubbles: true, cancelable: true }));
    };
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    window.__frame = frame;
    await frame();
  });
  return shared;
}

test("the dock's zones are uikit slots, and the document holds the arrangement", opts, async () => {
  const page = await docked();
  const result = await page.eval(() => {
    const slots = [...document.querySelectorAll('[data-uikit-slot^="pt:"]')]
      .map((e) => e.getAttribute("data-uikit-slot")).sort();
    const doc = window.__ui.doc;
    return {
      slots,
      zoneNodes: Object.keys(doc.nodes).filter((k) => k.startsWith("n:pt-")).length,
      leftChildren: doc.nodes["n:pt-left"].children,
      domZone: window.__zoneOf("tools"),
      docZone: window.__docZoneOf("tools"),
      tagged: !!document.querySelector('.pt-panel[data-panel="tools"][data-uikit-id]'),
    };
  });

  assert.equal(result.slots.length, 8, "all eight zones are registered: " + result.slots.join(","));
  assert.equal(result.zoneNodes, 8);
  assert.deepEqual(result.leftChildren, ["pt:layers", "pt:status"],
    "the shipped arrangement, as document nodes");
  assert.equal(result.domZone, "top");
  assert.equal(result.docZone, "top", "and the DOM agrees with the document");
  assert.ok(result.tagged, "the panel wrappers are nodes, so customize mode can select them");
});

test("a grip gesture lands in the layout document's history, and undo puts it back", opts, async () => {
  const page = await docked();
  const result = await page.eval(async () => {
    const before = { dom: window.__zoneOf("layers"), doc: window.__docZoneOf("layers") };
    const steps = window.__ui.history.steps().length;

    window.__nudge("layers", "ArrowDown");
    await window.__frame();
    const moved = { dom: window.__zoneOf("layers"), doc: window.__docZoneOf("layers") };

    window.__ui.undo();
    window.__ui.refreshNow();
    await window.__frame();
    return {
      before, moved, steps,
      after: { dom: window.__zoneOf("layers"), doc: window.__docZoneOf("layers") },
      stepsAfter: window.__ui.history.steps().length,
    };
  });

  assert.equal(result.before.dom, "left");
  assert.equal(result.moved.dom, "bottom", "the arrow docked it to the bottom edge");
  assert.equal(result.moved.doc, "bottom", "and the document recorded it");
  assert.equal(result.stepsAfter, result.steps + 1, "one history step for the gesture");
  assert.equal(result.after.doc, "left", "undo moved it back in the document");
  assert.equal(result.after.dom, "left", "and the real panel followed");
});

test("reset all takes the dock back with the rest of the chrome", opts, async () => {
  const page = await docked();
  const result = await page.eval(async () => {
    window.__nudge("walls", "ArrowRight");
    await window.__frame();
    const moved = window.__zoneOf("walls");

    window.__ui.resetAll();
    await window.__frame();
    return { moved, after: window.__zoneOf("walls"), doc: window.__docZoneOf("walls") };
  });

  assert.equal(result.moved, "right");
  assert.equal(result.doc, "top", "reset restored the shipped arrangement");
  assert.equal(result.after, "top", "and the pane was laid out again for it");
});

test("an unversioned dock seed does not override the current layout preset", opts, async () => {
  const page = await docked({
    seed: {
      panels: {
        tools: { zone: "bottom-right", order: 0 },
        layers: { zone: "bottom-right", order: 1 },
        walls: { zone: "left", order: 0 },
        status: { zone: "top", order: 0 },
      },
      zones: { "bottom-right": { axis: "h", flow: "column" } },
    },
  });
  const result = await page.eval(() => ({
    tools: window.__docZoneOf("tools"),
    layers: window.__docZoneOf("layers"),
    walls: window.__docZoneOf("walls"),
    domTools: window.__zoneOf("tools"),
    order: window.__ui.doc.nodes["n:pt-bottom-right"].children,
    orient: window.__ui.doc.nodes["n:pt-bottom-right"].orient,
    flow: window.__ui.doc.nodes["n:pt-bottom-right"].flow,
  }));

  assert.equal(result.tools, "top");
  assert.equal(result.layers, "left");
  assert.equal(result.walls, "top");
  assert.deepEqual(result.order, []);
  assert.equal(result.domTools, "top", "the current preset determines the panel position");
});

test("on a phone the zones stop existing, and the document simply skips them", opts, async () => {
  const page = await docked();
  /* Scoped to `pt:`. The document also describes the model editor's four
     ribbon panes, and those are legitimately absent until the editor is
     opened — counting every skipped container would make this assertion about
     a surface it is not testing. */
  const wide = await page.eval(() => ({
    slots: document.querySelectorAll('[data-uikit-slot^="pt:"]').length,
    missing: window.__ui.missingSlots().filter((m) => m.slot.startsWith("pt:")).length,
  }));
  assert.equal(wide.slots, 8);
  assert.equal(wide.missing, 0);

  await page.resize(390, 844);
  const narrow = await page.eval(async () => {
    for (let i = 0; i < 60; i++) await window.__frame();
    return {
      slots: document.querySelectorAll('[data-uikit-slot^="pt:"]').length,
      zones: document.querySelectorAll(".pt-zone").length,
      missing: window.__ui.missingSlots()
        .map((m) => m.slot).filter((s) => s.startsWith("pt:")).sort(),
      inRail: !!document.querySelector("#plan-tools > #plan-toolbar"),
      strays: document.querySelectorAll("#app > .uikit-node").length,
    };
  });

  assert.equal(narrow.slots, 0, "the zones were unregistered when the dock stood down");
  assert.equal(narrow.zones, 0);
  assert.equal(narrow.missing.length, 8, "and the document reports the eight it skipped");
  assert.ok(narrow.inRail, "the panels went back to the phone rail, as they always did");
  assert.equal(narrow.strays, 0,
    "a container whose slot is gone renders nothing — it does not fall back to a box in the app shell");

  await page.resize(1440, 900);
  const back = await page.eval(async () => {
    for (let i = 0; i < 60; i++) await window.__frame();
    return { slots: document.querySelectorAll('[data-uikit-slot^="pt:"]').length, zone: window.__zoneOf("tools") };
  });
  assert.equal(back.slots, 8, "and they come back");
  assert.equal(back.zone, "top");
});

test("uikit never unhides a panel the app itself hid", opts, async () => {
  const page = await docked();
  const result = await page.eval(async () => {
    await window.__ui.edit(false);
    /* The wall palette comes and goes with the active tool. That visibility is
       the app's business, and a layout pass that wrote hidden=false on every
       node would drag it back on screen a frame after the app hid it. */
    const wrap = document.querySelector('.pt-panel[data-panel="walls"]');
    const palette = document.getElementById("plan-wall-palette");
    palette.hidden = true;
    wrap.hidden = true;

    window.__ui.refreshNow();
    await window.__frame();
    const afterRender = { wrap: wrap.hidden, palette: palette.hidden };

    // and a node uikit DID hide is still uikit's to unhide
    const { ops } = await import("/uikit/index.js");
    window.__ui.apply("Hide", ops.hide(window.__ui.doc, { id: "pt:tools", hidden: true }));
    window.__ui.refreshNow();
    const toolsHidden = document.querySelector('.pt-panel[data-panel="tools"]').hidden;
    window.__ui.undo();
    window.__ui.refreshNow();
    const toolsBack = document.querySelector('.pt-panel[data-panel="tools"]').hidden;

    return { afterRender, toolsHidden, toolsBack };
  });

  assert.equal(result.afterRender.wrap, true, "the app's own hide survived a uikit render");
  assert.equal(result.afterRender.palette, true);
  assert.equal(result.toolsHidden, true, "uikit can still hide");
  assert.equal(result.toolsBack, false, "and unhide what it hid");
});

test("the dock still owns how it looks: flush edges and axis are untouched", opts, async () => {
  const page = await docked();
  const result = await page.eval(async () => {
    window.__nudge("tools", "ArrowDown");
    await window.__frame();
    window.__nudge("tools", "ArrowUp"); // return to top while preserving toolbar orientation
    await window.__ui.edit(false);
    await window.__frame();
    const zone = document.querySelector('.pt-zone[data-zone="top"]');
    const wrap = document.querySelector('.pt-panel[data-panel="tools"]');
    const pane = document.getElementById("view-2d");
    const zr = zone.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    return {
      axis: wrap.getAttribute("data-axis"),
      flush: zone.getAttribute("data-flush"),
      flow: zone.getAttribute("data-flow"),
      flushTop: Math.abs(zr.top - pr.top) < 1.5,
      radius: getComputedStyle(zone).borderTopLeftRadius,
    };
  });

  assert.equal(result.axis, "h", "docking preserves the toolbar row orientation");
  assert.equal(result.flush, "top");
  assert.ok(result.flow, "the fit pass still ran");
  assert.ok(result.flushTop, "and the zone is still flush against the pane edge");
  assert.equal(result.radius, "0px", "the corner that touches the frame is still square");
});
