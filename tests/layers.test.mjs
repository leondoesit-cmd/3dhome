import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  LAYER_IDS,
  layerOf,
  layerRank,
  layerState,
  canDrag,
  canDelete,
  isLayerVisible,
  isLayerGhosted,
  isLayerHidden,
  isLayerLocked,
  layerAllowsSnapKind,
  initLayers,
  saveLayers,
  resetLayers,
} from "../js/layers.js";

// Every case starts from the shipped defaults; the policy is all about S, so a
// leaked `vis` or work set from one case would quietly decide the next.
function fresh() {
  resetLayers();
  S.roomMeta = {};
}

test("the five layers ship at their documented defaults", () => {
  fresh();
  assert.deepEqual(LAYER_IDS, ["structure", "furniture", "mep", "annotations", "underlay"]);
  LAYER_IDS.forEach((id) => {
    const L = layerState(id);
    assert.equal(L.vis, "show", id + " starts visible");
    assert.equal(L.locked, false, id + " starts unlocked");
    assert.equal(L.pickOverride, null);
    assert.equal(L.snapOverride, null);
  });
  // only the two dense, easy-to-shove layers re-lock themselves on leaving
  assert.equal(layerState("furniture").autoLock, true);
  assert.equal(layerState("mep").autoLock, true);
  assert.equal(layerState("structure").autoLock, false);
  assert.equal(layerState("annotations").autoLock, false);
  assert.equal(layerState("underlay").autoLock, false);
  assert.equal(S.workSet, "furniture");
  assert.equal(S.workSetPinned, false);
});

test("layerOf maps every selection kind, and unknown kinds map to nothing", () => {
  fresh();
  const table = {
    wall: "structure",
    walls: "structure",
    node: "structure",
    nodes: "structure",
    room: "structure",
    opening: "structure",
    slabvoid: "structure",
    item: "furniture",
    items: "furniture",
    mepNode: "mep",
    mepRun: "mep",
    marker: "annotations",
    con: "annotations",
  };
  Object.keys(table).forEach((kind) => {
    assert.equal(layerOf(kind), table[kind], kind + " -> " + table[kind]);
  });
  assert.equal(layerOf("midpoint"), null);
  assert.equal(layerOf(""), null);
  assert.equal(layerOf(undefined), null);
});

test("layerRank ranks the work set 0, other visible layers 1, ghost and hide out", () => {
  fresh();
  S.workSet = "furniture";
  assert.equal(layerRank("furniture"), 0);
  assert.equal(layerRank("structure"), 1, "a wall still selects while furnishing");
  layerState("structure").vis = "ghost";
  assert.equal(layerRank("structure"), Infinity);
  layerState("structure").vis = "hide";
  assert.equal(layerRank("structure"), Infinity);
  // an id we do not know fails closed rather than becoming draggable
  assert.equal(layerRank("nosuchlayer"), Infinity);
});

test('workSet "all" focuses every layer at once', () => {
  fresh();
  S.workSet = "all";
  LAYER_IDS.forEach((id) => assert.equal(layerRank(id), 0, id));
});

test("pickOverride beats the work set in both directions", () => {
  fresh();
  S.workSet = "furniture";
  layerState("structure").pickOverride = true;
  assert.equal(layerRank("structure"), 0, "true forces focus onto an off-work-set layer");
  // and it outranks visibility too — the override is the user meaning it
  layerState("structure").vis = "hide";
  assert.equal(layerRank("structure"), 0);

  layerState("furniture").pickOverride = false;
  assert.equal(layerRank("furniture"), Infinity, "false forces out the work set itself");
});

test("canDrag needs rank 0, an unlocked layer and an unlocked object", () => {
  fresh();
  S.workSet = "furniture";
  const sofa = { id: 1 };
  assert.equal(canDrag({ kind: "item", ref: sofa }), true);

  // off the work set: selectable (rank 1) but never draggable
  assert.equal(canDrag({ kind: "wall", ref: { id: 2 } }), false);

  // locked layer
  layerState("furniture").locked = true;
  assert.equal(canDrag({ kind: "item", ref: sofa }), false);
  layerState("furniture").locked = false;

  // locked object on an unlocked layer
  assert.equal(canDrag({ kind: "item", ref: { id: 3, locked: true } }), false);

  // a multi-selection drags unless EVERY member is pinned
  assert.equal(canDrag({ kind: "items", refs: [{ locked: true }, {}] }), true);
  assert.equal(canDrag({ kind: "items", refs: [{ locked: true }, { locked: true }] }), false);

  // a kind that names no layer is not layer-governed and cannot be dragged
  assert.equal(canDrag({ kind: "midpoint", ref: {} }), false);
  assert.equal(canDrag(null), false);
});

test("canDelete mirrors the drag rules", () => {
  fresh();
  S.workSet = "furniture";
  const sofa = { id: 1 };
  assert.equal(canDelete({ kind: "item", ref: sofa }), true);
  assert.equal(canDelete({ kind: "wall", ref: { id: 2 } }), false, "off-work-set wall");
  layerState("furniture").locked = true;
  assert.equal(canDelete({ kind: "item", ref: sofa }), false, "locked layer");
  layerState("furniture").locked = false;
  assert.equal(canDelete({ kind: "item", ref: { locked: true } }), false, "locked object");
});

test("a locked room reads its flag from roomMeta, not the selection ref", () => {
  fresh();
  S.workSet = "structure";
  S.roomMeta = { "r-1": { locked: true } };
  assert.equal(canDrag({ kind: "room", ref: "r-1" }), false);
  assert.equal(canDrag({ kind: "room", ref: "r-2" }), true);
});

test("S.lockStruct is a live alias of the structure layer lock", () => {
  fresh();
  assert.equal(S.lockStruct, false, "the default stays off — see the note in state.js");
  S.lockStruct = true;
  assert.equal(layerState("structure").locked, true, "writing the alias reaches the layer");
  layerState("structure").locked = false;
  assert.equal(S.lockStruct, false, "reading the alias reflects the layer");
  // the four interaction.js guards and ui.js's toggle assign plain truthiness
  S.lockStruct = 1;
  assert.equal(layerState("structure").locked, true);
  S.lockStruct = false;
});

test("visibility predicates report the three states apart", () => {
  fresh();
  assert.equal(isLayerVisible("mep"), true);
  assert.equal(isLayerGhosted("mep"), false);
  assert.equal(isLayerHidden("mep"), false);
  layerState("mep").vis = "ghost";
  assert.equal(isLayerVisible("mep"), false);
  assert.equal(isLayerGhosted("mep"), true);
  layerState("mep").vis = "hide";
  assert.equal(isLayerHidden("mep"), true);
  assert.equal(isLayerLocked("mep"), false);
  layerState("mep").locked = true;
  assert.equal(isLayerLocked("mep"), true);
});

test("layerAllowsSnapKind excludes MEP outside its own work set", () => {
  fresh();
  S.workSet = "furniture";
  assert.equal(layerAllowsSnapKind("mepNode"), false);
  assert.equal(layerAllowsSnapKind("mepRun"), false);
  S.workSet = "mep";
  assert.equal(layerAllowsSnapKind("mepNode"), true);
});

test("layerAllowsSnapKind drops candidates from a layer you cannot see", () => {
  fresh();
  S.workSet = "furniture";
  assert.equal(layerAllowsSnapKind("marker"), true);
  layerState("annotations").vis = "hide";
  assert.equal(layerAllowsSnapKind("marker"), false);
  layerState("annotations").vis = "ghost";
  assert.equal(layerAllowsSnapKind("marker"), false, "ghosted geometry is unhittable too");
});

test("ordinary snap kinds survive furnishing — centring on a wall must keep working", () => {
  fresh();
  S.workSet = "furniture";
  ["midpoint", "corner", "onwall", "align", "perpendicular", "intersection"].forEach((k) => {
    assert.equal(layerAllowsSnapKind(k), true, k + " is not layer-governed");
  });
  // even with structure ghosted: these kinds name no layer at all, which is
  // the deliberate limit on the policy (no broader snap table ships)
  layerState("structure").vis = "ghost";
  assert.equal(layerAllowsSnapKind("midpoint"), true);
});

test("initLayers tolerates a Node environment with no localStorage", () => {
  fresh();
  assert.equal(typeof globalThis.localStorage, "undefined", "the suite runs without storage");
  layerState("structure").vis = "hide";
  const table = initLayers();
  assert.equal(table.structure.vis, "show", "defaults are restored, not the mutated state");
  assert.equal(S.workSet, "furniture");
  // and the save side is equally inert rather than throwing
  assert.doesNotThrow(() => saveLayers());
});

test("initLayers falls back to defaults on corrupt or hostile stored JSON", () => {
  fresh();
  const store = { home3d_layers: "{not json" };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
  };
  try {
    assert.equal(initLayers().furniture.vis, "show", "corrupt JSON leaves the defaults standing");

    // a stored table with junk fields: valid entries land, junk is ignored
    store.home3d_layers = JSON.stringify({
      layers: {
        structure: { vis: "ghost", locked: true, pickOverride: false },
        furniture: { vis: "sideways", locked: "yes", snapOverride: "maybe" },
        nosuchlayer: { vis: "hide" },
      },
      workSet: "structure",
      workSetPinned: true,
    });
    initLayers();
    assert.equal(layerState("structure").vis, "ghost");
    assert.equal(layerState("structure").locked, true);
    assert.equal(S.lockStruct, true, "the alias sees a restored structure lock");
    assert.equal(layerState("structure").pickOverride, false);
    assert.equal(layerState("furniture").vis, "show", "an invalid vis string is refused");
    assert.equal(layerState("furniture").locked, false, "a non-boolean lock is refused");
    assert.equal(layerState("furniture").snapOverride, null, "overrides are strictly tri-state");
    assert.equal(S.workSet, "structure");
    assert.equal(S.workSetPinned, true);

    // an unknown work set is refused rather than leaving nothing focused
    store.home3d_layers = JSON.stringify({ workSet: "elsewhere" });
    initLayers();
    assert.equal(S.workSet, "furniture");

    // round-trip: what saveLayers writes, initLayers reads back
    layerState("mep").vis = "ghost";
    layerState("mep").snapOverride = true;
    S.workSet = "mep";
    saveLayers();
    resetLayers();
    initLayers();
    assert.equal(layerState("mep").vis, "ghost");
    assert.equal(layerState("mep").snapOverride, true);
    assert.equal(S.workSet, "mep");
  } finally {
    delete globalThis.localStorage;
    fresh();
  }
});

test("layer state stays out of the history snapshot", async () => {
  // Undo must never un-hide a layer or move the work set: snap() whitelists
  // model fields, and none of the layer keys appear in it.
  const src = await (await import("node:fs/promises")).readFile(
    new URL("../js/history.js", import.meta.url),
    "utf8",
  );
  const snapBody = src.slice(src.indexOf("function snap()"), src.indexOf("function apply("));
  assert.ok(snapBody.length > 0, "found snap()");
  ["S.layers", "S.workSet", "S.lockStruct"].forEach((k) => {
    assert.equal(snapBody.includes(k), false, k + " must not be snapshotted");
  });
});
