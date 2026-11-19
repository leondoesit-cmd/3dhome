/* Less plan work without a different picture (js/plan2d.js,
   js/interaction/plan_move.js):
   - drafting a wall / arc / rectangle moves only HUD state (S.previewPt, the
     snap marks, the wall probe), so its pointer moves ask for a HUD-only paint
     that leaves the spatial index built (requestRenderHUDVisual);
   - the warning-glow and MEP-flow loops stop while their layer band is hidden
     and start again when a paint finds it shown. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

// the minimum DOM that lets the module graph link (as tests/snap_broad_phase.test.mjs)
const frames = [];
const planCanvas = {
  addEventListener() {}, removeEventListener() {}, classList: { add() {}, remove() {}, toggle() {} },
  style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  offsetParent: {}, getContext: () => null,
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { href: "http://localhost/" },
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } };
globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  getElementById: (id) => (id === "plan" ? planCanvas : null),
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ getContext: () => null, style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }),
  addEventListener() {}, body: { classList: { add() {}, remove() {} } },
};

const { S } = await import("../js/state.js");
const { planIndex } = await import("../js/spatial_index.js");
const { interactionLocals } = await import("../js/interaction.js");
const { wirePlanMove } = await import("../js/interaction/plan_move.js");
const plan2d = await import("../js/plan2d.js");

function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [0, 1, 2, 3].map((i) => ({ id: "w" + i, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
  S.openings = []; S.items = []; S.markers = []; S.mep = null; S.slabOpenings = []; S.roomMeta = {};
  S.sel = null; S.action = null; S.SC = 1; S.OX = 0; S.OY = 0; S.CW = 800; S.CH = 600;
  S.tool = "select"; S.drawing = false; S.drawFrom = null; S.arcDraft = null; S.rectDraft = null;
}

interactionLocals.trackLongPress = () => {};
interactionLocals.planPrecisionPoint = (e, x, y) => ({ x, y });
wirePlanMove();
const flush = () => { while (frames.length) frames.shift()(0); }; // run the queued paints (no canvas in Node: they draw nothing)
const move = (x, y) => interactionLocals.planMove({ offsetX: x, offsetY: y, pointerType: "mouse", shiftKey: false });

test("drafting moves repaint the HUD only and keep the spatial index", () => {
  room();
  const drafts = {
    "wall, before the first click": () => { S.tool = "wall"; },
    "wall, rubber band": () => { S.tool = "wall"; S.drawing = true; S.drawFrom = 0; },
    "arc wall": () => { S.tool = "arcwall"; S.arcDraft = { startNode: 0 }; },
    "rectangle": () => { S.tool = "rect"; S.rectDraft = { x: 50, z: 50 }; },
    "slab void": () => { S.tool = "slabvoid"; S.rectDraft = { x: 50, z: 50 }; },
  };
  for (const [name, arm] of Object.entries(drafts)) {
    room(); arm();
    planIndex.stats(); // built, as a hit test leaves it
    flush();
    planIndex.stats();
    assert.equal(planIndex.isStale(), false);
    move(203, 151);
    assert.ok(S.previewPt, name + ": the preview follows the cursor");
    assert.equal(planIndex.isStale(), false, name + ": the index stays built");
    assert.equal(frames.length, 1, name + ": one paint is queued");
    flush();
    move(305, 207);
    assert.equal(planIndex.isStale(), false, name + ": still built after the next move");
    flush();
  }
});

test("a model change in the same frame still invalidates and paints the model", () => {
  room();
  S.tool = "select"; S.action = "pan"; S.panStart = { ox: 0, oy: 0, px: 0, py: 0 };
  flush();
  planIndex.stats();
  move(20, 10); // a pan: the view moved, a full paint
  assert.equal(planIndex.isStale(), true);
  assert.equal(frames.length, 1);
  flush();
});

test("a middle / Space drag pans while a drafting tool is armed", () => {
  for (const tool of ["wall", "arcwall", "rect", "slabvoid", "select"]) {
    room();
    S.tool = tool;
    if (tool === "wall") { S.drawing = true; S.drawFrom = 0; }
    S.action = "pan"; S.panStart = { ox: 5, oy: 7, px: 100, py: 100 }; // as pointerdown arms it (button 1 / spacePan)
    move(130, 90);
    assert.deepEqual([S.OX, S.OY], [35, -3], tool + ": the view follows the drag");
    assert.equal(planIndex.isStale(), true, tool + ": a pan is a full paint");
    flush();
  }
  S.action = null;
});

test("schedulePaint: a HUD-only visual paint skips the model pass and the invalidation", () => {
  const src = moduleSource("js/plan2d.js");
  let invalidations = 0, models = 0, huds = 0;
  const queued = [];
  const ctx = vm.createContext({
    planIndex: { invalidate: () => invalidations++ }, dragProxy: null, afterRender: [],
    plan: { offsetParent: {} }, // the plan pane is on screen
    renderModel: () => models++, renderHUD: () => huds++, requestAnimationFrame: (fn) => queued.push(fn),
  });
  vm.runInContext("var paintLevel = 0, paintQueued = false;\n" +
    ["schedulePaint", "render2D", "requestRenderHUD", "requestRenderHUDVisual"].map((n) => sourceFunctionText(src, n)).join("\n"), ctx);
  ctx.requestRenderHUDVisual();
  ctx.requestRenderHUDVisual();
  queued.shift()();
  assert.deepEqual([invalidations, models, huds], [0, 0, 1], "one coalesced HUD frame, index untouched");
  ctx.requestRenderHUD();
  queued.shift()();
  assert.deepEqual([invalidations, models, huds], [1, 0, 2], "requestRenderHUD as before");
  ctx.requestRenderHUDVisual();
  ctx.render2D();
  queued.shift()();
  assert.deepEqual([invalidations, models, huds], [2, 1, 3], "a full request in the same frame wins");
});

test("the drafting branches of planMove ask for the HUD-only paint (wiring)", () => {
  const src = readFileSync(new URL("../js/interaction/plan_move.js", import.meta.url), "utf8");
  const branch = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
  for (const [from, to] of [
    ['if (S.tool === "wall") {', 'if (S.tool === "walloffset")'],
    ['if (S.tool === "arcwall") {', 'if (S.tool === "rect"'],
    ['if (S.tool === "rect" || S.tool === "slabvoid") {', 'if (S.tool === "roomstamp")'],
  ]) {
    const b = branch(from, to);
    assert.ok(b.length > 40, from);
    assert.match(b, /requestRenderHUDVisual\(\)/, from);
    assert.doesNotMatch(b, /render2D\(\)/, from);
  }
  // auto-pan moves the view, replays the move, then paints in full itself
  assert.match(sourceFunctionText(moduleSource("js/interaction.js"), "apStep"), /planMove\)\([^;]*\);\s*render2D\(\);/);
});

/* ---- the animation loops ---- */
function loops(over) {
  const src = moduleSource("js/plan2d.js");
  const layers = { annotations: "show", mep: "show" };
  const calls = { hud: 0, full: 0, warnings: 0 };
  const queued = [];
  const ctx = vm.createContext(Object.assign({
    S: { mep: { show: true } }, plan: { offsetParent: {} }, isElevation: () => false,
    isLayerVisible: (id) => layers[id] === "show", isLayerGhosted: (id) => layers[id] === "ghost",
    isLayerHidden: (id) => layers[id] === "hide", mepAliveCount: () => 3,
    activeWarnings: () => { calls.warnings++; return [{ key: "end:1" }]; },
    requestRenderHUD: () => calls.hud++,
    // a full paint, next frame: the model pass, then the HUD pass (which runs ensureMEPAnim)
    requestRender2D: () => { calls.full++; queued.push(() => { ctx.mepModelPass(); ctx.ensureMEPAnim(); }); },
    requestAnimationFrame: (fn) => queued.push(fn), matchMedia: () => ({ matches: false }),
  }, over || {}));
  const top = src.slice(src.indexOf("let mepFlowPhase"), src.indexOf("function prefersReducedMotion"))
    + src.slice(src.indexOf("let warnPhase"), src.indexOf("function warnShouldAnimate"));
  vm.runInContext(top + ["prefersReducedMotion", "mepShouldAnimate", "mepAnimStep", "ensureMEPAnim", "mepOnHud", "mepModelPass",
    "warnShouldAnimate", "warnAnimStep", "ensureWarnAnim", "bandAlpha"].map((n) => sourceFunctionText(src, n)).join("\n")
    + "\nthis.phase = () => mepFlowPhase; this.running = () => [mepAnimOn, warnAnimOn];", ctx);
  let now = 0;
  const tick = (ms) => { now += ms; const q = queued.splice(0); q.forEach((fn) => fn(now)); return q.length; };
  return { ctx, layers, calls, tick, queued };
}

test("the warning glow stops while the annotations layer is hidden and restarts when it shows", () => {
  const L = loops();
  L.ctx.ensureWarnAnim();
  for (let i = 0; i < 10; i++) L.tick(16);
  assert.ok(L.calls.hud >= 3, "breathing: HUD frames at ~22 Hz");
  L.layers.annotations = "ghost";
  const ghosted = L.calls.hud;
  for (let i = 0; i < 6; i++) L.tick(16);
  assert.ok(L.calls.hud > ghosted, "a ghosted layer still breathes");
  L.layers.annotations = "hide";
  L.tick(16);
  assert.equal(L.queued.length, 0, "hidden: the loop has stopped");
  const stopped = L.calls.hud;
  for (let i = 0; i < 10; i++) L.tick(16);
  assert.equal(L.calls.hud, stopped, "no HUD frames for a hidden glow");
  assert.equal(L.ctx.running()[1], false);
  // shown again: the layer toggle's paint runs renderHUD, which calls ensureWarnAnim
  L.layers.annotations = "show";
  L.ctx.ensureWarnAnim();
  for (let i = 0; i < 6; i++) L.tick(16);
  assert.ok(L.calls.hud > stopped, "breathing again");
});

test("the warning glow counts the warnings only on the ticks that paint", () => {
  const L = loops();
  L.ctx.ensureWarnAnim();
  const start = L.calls.warnings;
  for (let i = 0; i < 30; i++) L.tick(16); // 480 ms: ~10 paints at 45 ms, 30 ticks
  const counted = L.calls.warnings - start;
  assert.ok(counted <= L.calls.hud + 1, "one count per paint (" + counted + " counts, " + L.calls.hud + " paints)");
  assert.ok(counted < 30);
});

test("MEP flow stops while the MEP layer is hidden; shown again it moves the overlay back to the HUD and continues", () => {
  const L = loops();
  L.ctx.mepModelPass(); // the full paint that found the live runs drew them on the model canvas
  L.ctx.ensureMEPAnim(); // ...and its HUD pass starts the flow
  for (let i = 0; i < 10; i++) L.tick(16);
  assert.equal(L.calls.full, 1, "the start's one full paint");
  assert.ok(L.calls.hud >= 4, "flowing at ~30 Hz");
  L.layers.mep = "ghost";
  const ghosted = L.calls.hud;
  for (let i = 0; i < 6; i++) L.tick(16);
  assert.ok(L.calls.hud > ghosted, "a ghosted layer still flows");
  L.layers.mep = "hide";
  L.tick(16);
  assert.equal(L.calls.full, 2, "stopping puts the overlay back on the model canvas, as before");
  L.tick(16); // that full paint
  assert.equal(L.queued.length, 0, "hidden: the loop has stopped");
  const phase = L.ctx.phase(), stopped = L.calls.hud;
  for (let i = 0; i < 10; i++) L.tick(16);
  assert.equal(L.calls.hud, stopped, "no HUD frames for a hidden flow");
  assert.equal(L.calls.full, 2);
  L.layers.mep = "show";
  L.ctx.mepModelPass(); // the layer toggle's full paint draws it on the model canvas
  L.ctx.ensureMEPAnim();
  assert.equal(L.calls.full, 3, "one full paint takes the overlay off the model canvas");
  L.tick(16);
  const step = L.ctx.phase() - phase;
  assert.ok(step > 0 && step <= 0.027 * 80 + 1e-9, "the phase continues with a capped step (" + step + ")");
  for (let i = 0; i < 6; i++) L.tick(16);
  assert.ok(L.calls.hud > stopped, "flowing again");
  assert.equal(L.calls.full, 3, "no further full paints while it flows");
});

test("MEP flow's first start takes the static copy off the model canvas with exactly one full paint", () => {
  const M = loops();
  M.ctx.mepModelPass(); // first full paint: not animating yet, so the overlay is on the model canvas
  assert.equal(M.ctx.mepOnHud(), false);
  M.ctx.ensureMEPAnim(); // its HUD pass starts the loop: from here on the HUD draws the overlay
  assert.equal(M.ctx.mepOnHud(), true);
  assert.equal(M.calls.full, 1, "one full paint, so the overlay is not drawn on both canvases");
  M.ctx.ensureMEPAnim(); // every later HUD pass asks again: nothing more
  for (let i = 0; i < 30; i++) M.tick(16); // the repaint runs the model pass with the overlay on the HUD
  assert.equal(M.calls.full, 1, "no repaint loop, no full paint per frame");
  assert.ok(M.calls.hud >= 10, "flow frames stay HUD-only");
  // a start after a pass that left the model canvas without the overlay paints nothing extra
  const N = loops();
  N.ctx.ensureMEPAnim();
  assert.equal(N.calls.full, 0);
});

test("schedulePaint: a hidden plan pane paints nothing but still invalidates and runs after-paint hooks", () => {
  const src = moduleSource("js/plan2d.js");
  let invalidations = 0, models = 0, huds = 0, hooks = 0;
  const queued = [];
  const ctx = vm.createContext({
    planIndex: { invalidate: () => invalidations++ }, dragProxy: null, afterRender: [() => hooks++],
    plan: { offsetParent: null }, // 3D maximized / Dollhouse: the pane is display:none
    renderModel: () => models++, renderHUD: () => huds++, requestAnimationFrame: (fn) => queued.push(fn),
  });
  vm.runInContext("var paintLevel = 0, paintQueued = false;\n" +
    ["schedulePaint", "render2D"].map((n) => sourceFunctionText(src, n)).join("\n"), ctx);
  ctx.render2D();
  queued.shift()();
  assert.deepEqual([invalidations, models, huds, hooks], [1, 0, 0, 1]);
});
