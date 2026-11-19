import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { S } from "../js/state.js";
import {
  LAYER_IDS,
  layerState,
  resetLayers,
  applyAutoLock,
  setWorkLayer,
  selectionAfterHide,
  workSetForNewFloor,
  floorSceneEmpty,
  workSetOnFloorEntry,
  enterFloorWorkSet,
  layerTagKind,
} from "../js/layers.js";
import { sourceFunctionText } from "./helpers/source_function.mjs";

const uiSrc = readFileSync(new URL("../js/ui_layers.js", import.meta.url), "utf8");
const chromeSrc = readFileSync(new URL("../js/planner_chrome.js", import.meta.url), "utf8");

// The real ui_layers functions, run against the real layer state with the
// browser-only services stubbed.
function uiLayers() {
  const ctx = {
    S,
    LAYER_IDS,
    layerState,
    applyAutoLock,
    setWorkLayer,
    selectionAfterHide,
    saveLayers() {},
    window: { dispatchEvent() {} },
    CustomEvent: class {},
    render2D() {},
    flash() {},
    t: (k) => k,
    labelOf: (id) => id,
    setWallMode() {},
    deselects: 0,
    select(s) {
      ctx.deselects += s ? 0 : 1;
      S.sel = s;
    },
    PRESETS: {
      furnish: {
        work: "furniture",
        vis: { structure: "show", furniture: "show", mep: "hide", annotations: "show", underlay: "show" },
        walls: "cut",
      },
      services: {
        work: "mep",
        vis: { structure: "show", furniture: "ghost", mep: "show", annotations: "show", underlay: "show" },
        walls: "cut",
      },
    },
  };
  for (const name of ["commit", "setWorkSet", "applyPreset", "soloed", "solo"]) {
    ctx[name] = runInNewContext("(" + sourceFunctionText(uiSrc, name) + ")", ctx);
  }
  return ctx;
}

function fresh() {
  resetLayers();
  S.sel = null;
}

test("A2: a hidden layer is shown when it becomes the work set; faded stays faded", () => {
  fresh();
  const ui = uiLayers();
  ui.applyPreset("furnish");
  assert.equal(layerState("mep").vis, "hide");
  ui.setWorkSet("mep", true); // the row click and Shift+1..5 come through here
  assert.equal(S.workSet, "mep");
  assert.equal(layerState("mep").vis, "show");

  layerState("annotations").vis = "ghost";
  ui.setWorkSet("annotations", false); // followTool comes through here
  assert.equal(layerState("annotations").vis, "ghost");
});

test("A2: setWorkLayer applies the opt-in lock to the new work set", () => {
  fresh();
  layerState("structure").autoLock = true;
  setWorkLayer("furniture");
  assert.equal(layerState("structure").locked, true);
  setWorkLayer("structure");
  assert.equal(layerState("structure").locked, false);
});

test("A3: selectionAfterHide drops only selections on hidden layers", () => {
  fresh();
  const item = { kind: "item", ref: { id: 1 } };
  const items = { kind: "items", refs: [{ id: 1 }, { id: 2 }] };
  const wall = { kind: "wall", ref: { id: 3 } };
  const run = { kind: "mepRun", ref: { id: 4 } };
  const marker = { kind: "marker", ref: { id: 5 } };
  layerState("furniture").vis = "hide";
  layerState("mep").vis = "ghost";
  assert.equal(selectionAfterHide(item), null);
  assert.equal(selectionAfterHide(items), null);
  assert.equal(selectionAfterHide(wall), wall);
  assert.equal(selectionAfterHide(run), run, "a faded layer keeps its selection");
  assert.equal(selectionAfterHide(marker), marker);
  for (const kind of ["wall", "walls", "opening", "room", "node", "nodes", "slabvoid"]) {
    layerState("structure").vis = "hide";
    assert.equal(selectionAfterHide({ kind, ref: {} }), null, kind);
  }
  layerState("annotations").vis = "hide";
  assert.equal(selectionAfterHide(marker), null);
  layerState("mep").vis = "hide";
  assert.equal(selectionAfterHide({ kind: "mepNode", ref: {} }), null);
  assert.equal(selectionAfterHide(null), null);
});

test("A3: a preset that hides the selected layer deselects; one that fades it does not", () => {
  fresh();
  const ui = uiLayers();
  S.sel = { kind: "mepRun", ref: { id: 7 } };
  ui.applyPreset("services");
  assert.ok(S.sel, "services shows MEP");
  ui.applyPreset("furnish");
  assert.equal(S.sel, null, "furnish hides MEP");
  assert.equal(ui.deselects, 1);

  S.sel = { kind: "item", ref: { id: 8 } };
  ui.applyPreset("services");
  assert.equal(S.sel.kind, "item", "furniture is only faded");
});

test("A3: the eye and the visibility row (both commit) drop a selection on a layer they hide", () => {
  fresh();
  const ui = uiLayers();
  const sel = { kind: "wall", ref: { id: 9 } };
  S.sel = sel;
  layerState("furniture").vis = "hide";
  ui.commit();
  assert.equal(S.sel, sel, "another layer hidden: selection stays");
  layerState("structure").vis = "ghost";
  ui.commit();
  assert.equal(S.sel, sel, "faded: selection stays");
  layerState("structure").vis = "hide";
  ui.commit();
  assert.equal(S.sel, null);
  // both UI entry points end in commit()
  assert.match(sourceFunctionText(uiSrc, "visibilityRow"), /L\.vis = v;\s*\(onChange \|\| commit\)\(\)/);
  assert.match(uiSrc, /L\.vis = L\.vis === "show" \? "hide" : "show";\s*commit\(\);/);
});

test("A3: solo only fades, so it keeps the selection", () => {
  fresh();
  const ui = uiLayers();
  S.sel = { kind: "item", ref: { id: 10 } };
  ui.solo("structure");
  assert.equal(layerState("furniture").vis, "ghost");
  assert.equal(S.sel.kind, "item");
});

test("A4: a new floor clears the pin and works on Structure", () => {
  fresh();
  S.workSet = "mep";
  S.workSetPinned = true;
  layerState("structure").vis = "hide";
  workSetForNewFloor();
  assert.equal(S.workSet, "structure");
  assert.equal(S.workSetPinned, false);
  assert.equal(layerState("structure").vis, "show");
});

test("A4: adding a floor resets the work set; switching does only onto an empty floor", () => {
  assert.match(sourceFunctionText(chromeSrc, "addFloorFromUI"), /workSetForNewFloor\(\);\s*syncWorkSetUI\(\);/);
  const callers = chromeSrc.split("workSetForNewFloor(").length - 1;
  assert.equal(callers, 1, "called once, from addFloorFromUI only");
  // the floor strip's switch goes through the empty-floor decision
  assert.match(sourceFunctionText(chromeSrc, "renderFloorTabs"), /switchFloor\(floor\.id\);\s*\/\/[^\n]*\n\s*if \(enterFloorWorkSet\(S\)\) syncWorkSetUI\(\);/);
  // ...and the ribbon is told to resync even when the work set did not change
  assert.match(sourceFunctionText(chromeSrc, "syncWorkSetUI"), /new CustomEvent\("layers:changed", \{ detail: \{ resync: true \} \}\)/);
  const floors = readFileSync(new URL("../js/floors.js", import.meta.url), "utf8");
  assert.doesNotMatch(floors, /workSetForNewFloor/);
});

test("A4: an empty floor is one with nothing on any layer", () => {
  assert.equal(floorSceneEmpty(null), true);
  assert.equal(floorSceneEmpty({}), true);
  assert.equal(floorSceneEmpty({ nodes: [], walls: [], openings: [], items: [], markers: [], slabOpenings: [], roomMeta: {}, idc: 1 }), true, "addFloor's blank scene");
  assert.equal(floorSceneEmpty({ nodes: [{ x: 0, z: 0 }], walls: [] }), true, "a stray node is not content");
  for (const [key, val] of [
    ["walls", [{}]], ["items", [{}]], ["openings", [{}]], ["markers", [{}]],
    ["annotations", [{}]], ["slabOpenings", [{}]], ["mep", { nodes: [{}] }], ["mep", { runs: [{}] }],
  ])
    assert.equal(floorSceneEmpty({ [key]: val }), false, key);
});

test("A4: arriving on an empty floor resets to Structure; a furnished one keeps its layer", () => {
  assert.equal(workSetOnFloorEntry(true), "structure");
  assert.equal(workSetOnFloorEntry(false), null);

  fresh();
  S.workSet = "furniture";
  S.workSetPinned = true;
  assert.equal(enterFloorWorkSet({ walls: [], items: [] }), true);
  assert.equal(S.workSet, "structure");
  assert.equal(S.workSetPinned, false, "the pin goes, as on a new floor");

  fresh();
  S.workSet = "mep";
  assert.equal(enterFloorWorkSet({ walls: [{}], items: [] }), false);
  assert.equal(S.workSet, "mep", "a floor with walls keeps the layer");
});

test("every Layers row carries a status tag: Editing, else its visibility", () => {
  assert.equal(layerTagKind("structure", "structure", "show"), "edit");
  assert.equal(layerTagKind("structure", "structure", "ghost"), "edit", "the work layer says Editing even when faded");
  assert.equal(layerTagKind("furniture", "structure", "show"), "show");
  assert.equal(layerTagKind("mep", "structure", "ghost"), "ghost");
  assert.equal(layerTagKind("annotations", "structure", "hide"), "hide");
  assert.equal(layerTagKind("structure", "all", "show"), "show", "All layers: no single row is the editing one");
  assert.equal(layerTagKind(null, null, "bogus"), "show");
  // the rows render it: the work layer's tag is "lay_tag_edit", the rest "lay_vis_<kind>"
  const sync = sourceFunctionText(uiSrc, "sync");
  assert.match(sync, /var kind = layerTagKind\(id, S\.workSet, L\.vis\);/);
  assert.match(sync, /r\.tag\.textContent = t\(kind === "edit" \? "lay_tag_edit" : "lay_vis_" \+ kind\);/);
  assert.match(sync, /r\.tag\.setAttribute\("data-kind", kind\);/);
});
