/* Work the planner used to do and then throw away, each cut without changing
   what reaches the screen:
   - the 3D cutaway's live-wall check (one Set per pass, not indexOf per wall);
   - the plan paint that layout changes asked for while the plan pane is hidden;
   - the cabinet designer's view switch drawing the preview three times;
   - the Drawing view re-parsing an unchanged sheet on every return. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { paintPlanForLayout } from "../js/plan_pane_paint.js";
import { frameCabinetPreview, cabinetFitDistance } from "../js/cabinet/preview_fit.js";
import { AXES } from "../js/ui_cabinet_ctx.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ---- 1. updateSeeThrough ---- */

function seeThroughRun(walls, groups) {
  const set = [];
  let indexOfCalls = 0;
  const live = walls.slice();
  live.indexOf = function () { indexOfCalls++; return Array.prototype.indexOf.apply(this, arguments); };
  const ctx = {
    S: { walls: live, edit3D: false },
    dyn: {}, camera: { position: {} }, tgt: {}, walk: false, extTick: 0, framedInterior: false,
    structureRoot: { children: groups },
    nearCutOn: () => false, cutH: () => Infinity, seeAim: () => ({}), keptWalls: () => [],
    wallGeom: () => null, nearSideWall: () => false, wallThickness: () => 12,
    seeOutOfStep: () => false,
    setSeeThrough: (g, cut) => set.push([g.name, cut]),
    set_needsRender: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(sourceFunctionText(read("js/view3d/see_through.js"), "updateSeeThrough"), ctx);
  vm.runInContext("updateSeeThrough()", ctx);
  return { set, indexOfCalls };
}

test("the cutaway tests wall membership against one set, not indexOf per wall", () => {
  const a = { id: "a" }, b = { id: "b" };
  const twinOfA = { id: "a" }; // equal, not identical: a stale floor's wall
  const groups = [
    { name: "a", userData: { wall: a, seeThrough: true } },
    { name: "stale", userData: { wall: twinOfA, seeThrough: true } },
    { name: "b", userData: { wall: b, seeThrough: true } },
    { name: "plain", userData: {} },
  ];
  const { set, indexOfCalls } = seeThroughRun([a, b], groups);
  // the live walls step back in, the stale group from the old floor is left alone
  assert.deepEqual(set, [["a", false], ["b", false]]);
  assert.equal(indexOfCalls, 0, "membership must not scan S.walls per wall group");
});

/* ---- 2. layout paints of a hidden plan ---- */

test("a layout change paints the plan only while its pane is displayed", () => {
  const calls = [];
  const size = () => calls.push("size"), paint = () => calls.push("paint");
  const hidden = { getClientRects: () => [] }, shown = { getClientRects: () => [{}] };
  assert.equal(paintPlanForLayout(hidden, size, paint), false);
  assert.deepEqual(calls, [], "a display:none plan is neither sized nor painted");
  assert.equal(paintPlanForLayout(shown, size, paint), true);
  assert.deepEqual(calls, ["size", "paint"], "shown again: sized first, then one full paint");
  calls.length = 0;
  assert.equal(paintPlanForLayout(null, size, paint), true, "no pane element: behave as before");
  assert.deepEqual(calls, ["size", "paint"]);
});

test("main.js routes its layout paints through the hidden-pane check", () => {
  const main = read("js/main.js");
  const resize = main.slice(main.indexOf("const resizeAll"), main.indexOf("window.addEventListener(\"vspan:ready\""));
  const sync = sourceFunctionText(main, "syncSurfaces");
  for (const src of [resize, sync]) {
    assert.match(src, /paintPlanForLayout\(.*, sizeCanvas, render2D\)/);
    assert.doesNotMatch(src, /^\s*render2D\(\);/m);
  }
  // showing the pane again goes back through syncSurfaces (setMaximized) and
  // the pane's ResizeObserver (resizeAll), which size and paint it
  assert.match(sourceFunctionText(main, "setMaximized"), /syncSurfaces\(\);/);
  assert.match(main, /new ResizeObserver\(resizeAll\)[\s\S]{0,200}ro\.observe\(v2\)/);
  // export reads paint on demand, whatever the pane is doing
  assert.match(sourceFunctionText(read("js/plan2d.js"), "planImageCanvas"), /render2DNow\(\)/);
});

/* ---- 3. cabinet designer view switch ---- */

function cabinetSwitch(from, to, { legacy = false } = {}) {
  const renders = [];
  const view = {
    az: 0.3, el: 0.2, dist: 400, big: false, target: { set() {} },
    cam: { fov: 42, aspect: 1 },
    invalidateSize() {},
    resize() { this.cam.aspect = this.big ? 1.6 : 1.2; return true; },
    frame(radius) { this.resize(true); this.dist = radius; },
    render() { renders.push({ az: this.az, el: this.el, dist: this.dist, big: this.big, aspect: this.cam.aspect }); },
    // the real contracts (js/editor_view.js): render unless told not to
    setBig(b, render) { this.big = !!b; if (render !== false || legacy) this.render(); },
    orbitTo(az, el, render) { this.az = az; this.el = el; if (render !== false || legacy) this.render(); },
  };
  const node = () => ({ appendChild() {}, insertBefore() {}, parentElement: null, nextSibling: null });
  const wrap = node(), bigHost = node(), panelHost = node();
  wrap.parentElement = panelHost;
  const host = {
    classList: { toggle() {} },
    querySelector: (q) => (q === ".cb-prev-wrap" ? wrap : q === "#cb3dHost" ? bigHost : q === ".cb-right" ? panelHost : null),
    querySelectorAll: () => [],
  };
  const E = { host, pv: view, it: { w: 60, h: 72, d: 56 }, axis: "front", mode: "2d", split: from === "split", modeApplied: true };
  const evs = read("js/editor_view.js");
  const ctx = {
    E, AXES, frameCabinetPreview, viewZoom: 1, viewPanX: 0, viewPanY: 0,
    setTool() {}, sizeCanvas() {}, syncHint() {}, draw() {}, drawElevThumb() {},
    renderPreview: () => E.pv.render(),
  };
  vm.createContext(ctx);
  vm.runInContext(sourceFunctionText(evs, "createViewportSwap"), ctx);
  vm.runInContext(sourceFunctionText(read("js/ui_cabinet_view.js"), "setMode"), ctx);
  if (from === "3d") { E.mode = "3d"; }
  ctx.setMode(to);
  return renders;
}

test("the cabinet view switch draws the preview once, with the same camera", () => {
  for (const to of ["3d", "split"]) {
    const renders = cabinetSwitch("2d", to), before = cabinetSwitch("2d", to, { legacy: true });
    assert.equal(renders.length, 1, "elevation → " + to + ": one frame, after the pane is sized and fitted");
    assert.ok(before.length > 1, "the legacy path drew more than once");
    assert.deepEqual(renders.at(-1), before.at(-1), "elevation → " + to + ": the frame shows the same camera");
    assert.equal(renders[0].big, true);
  }
  // the fitted distance is the one js/cabinet/preview_fit.js asks for
  const last = cabinetSwitch("2d", "3d")[0];
  const d = cabinetFitDistance({ w: 60, h: 72, d: 56 }, 42, 1.6, 0.75, AXES.front.az, AXES.front.el);
  assert.equal(last.dist, Math.min(2500, Math.max(60, d)));
  assert.equal(last.az, AXES.front.az);
});

test("orbitTo and the viewport swap still draw for every other caller", () => {
  const evs = read("js/editor_view.js");
  assert.match(evs, /view\.orbitTo = function \(az, el, render\) \{[\s\S]*?if \(render !== false\) view\.render\(\);/);
  assert.match(evs, /view\.setBig\(big, !\(options && options\.render === false\)\)/);
});

/* ---- 4. Drawing view re-entry ---- */

function drawingHarness() {
  const state = { model: 1, lang: "en", writes: 0, fits: 0, picks: 0, reasons: 0, sources: 0 };
  const controls = { standard: { value: "auto" }, paper: { value: "auto" }, scale: { value: "auto" } };
  function makePane() {
    const page = {};
    let html = "";
    Object.defineProperty(page, "innerHTML", { get: () => html, set: (v) => { html = v; state.writes++; } });
    return {
      isConnected: true, hidden: true, dataset: {}, page,
      querySelector: (q) => {
        if (q === ".sheet-page") return page;
        if (q === ".sheet-viewport") return { focus() {} };
        const m = /data-sheet="(\w+)"/.exec(q);
        return m ? controls[m[1]] : null;
      },
    };
  }
  const ctx = {
    V: { pane: null, active: false, svg: "", page: null, fitted: false, furniture: false, picked: null },
    S: { workspace: {} }, AUTO: "auto", document: { body: { classList: { add() {} } } },
    requestAnimationFrame() {}, hookOnce() {}, fillChoices() {}, applyView() {},
    buildPane() { ctx.V.pane = makePane(); },
    control: (name) => ctx.V.pane.querySelector(`[data-sheet="${name}"]`),
    draftingStandard: (id) => (id === "il" || id === "us" ? { id } : null),
    resolve: (id) => ({ id: id === "auto" ? "il" : id }),
    sheetFor: (o) => `<svg>${o.standard.id}|${o.paper}|${o.scale}|${o.furniture}|${state.model}|${state.lang}</svg>`,
    sheetPageMm: () => ({ w: 420, h: 297 }),
    markPicked: () => state.picks++, explainLayout: () => state.reasons++, fillSources: () => state.sources++,
    fit: () => state.fits++,
  };
  vm.createContext(ctx);
  const src = read("js/ui_pro_drawing.js");
  vm.runInContext(sourceFunctionText(src, "render"), ctx);
  vm.runInContext(sourceFunctionText(src, "showDrawingView").replace("export function", "function"), ctx);
  const enter = () => { vm.runInContext("showDrawingView({})", ctx); };
  const leave = () => { ctx.V.active = false; ctx.V.pane.hidden = true; };
  return { ctx, state, controls, enter, leave };
}

test("returning to an unchanged Drawing keeps the parsed sheet but still fits and marks it", () => {
  const { ctx, state, enter, leave } = drawingHarness();
  enter();
  assert.equal(state.writes, 1);
  const node = ctx.V.pane.page.innerHTML;
  const fits = state.fits, picks = state.picks, reasons = state.reasons, sources = state.sources;
  leave(); enter();
  assert.equal(state.writes, 1, "an unchanged sheet is not re-parsed into the DOM");
  assert.equal(ctx.V.pane.page.innerHTML, node);
  assert.equal(state.fits, fits + 1, "re-entry still fits the page");
  assert.equal(state.picks, picks + 1, "and re-applies the picked mark");
  assert.equal(state.reasons, reasons + 1);
  assert.equal(state.sources, sources + 1);
  // a plain re-render (an event listener passes its Event) stays a no-op
  vm.runInContext("render({ type: 'change' })", ctx);
  assert.equal(state.fits, fits + 1);
});

test("a change made while the Drawing was hidden rebuilds the sheet on return", () => {
  const { ctx, state, controls, enter, leave } = drawingHarness();
  enter();
  const changes = [
    ["model", () => { state.model++; }],
    ["standard", () => { ctx.S.workspace.draftingStandard = "us"; }],
    ["paper", () => { controls.paper.value = "A3"; }],
    ["scale", () => { controls.scale.value = "50"; }],
    // a language change rebuilds the pane (onLangChange), which clears the cache
    ["language", () => { state.lang = "he"; ctx.V.pane.isConnected = false; }],
  ];
  for (const [what, change] of changes) {
    leave();
    const before = state.writes;
    change();
    enter();
    assert.equal(state.writes, before + 1, what + " while hidden: the sheet is rebuilt");
  }
});
