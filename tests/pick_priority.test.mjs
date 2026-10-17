/* 2D pick priority: which layer wins the click, and who is allowed to drag.
 *
 * The bug these pin: a TV standing against a wall could not be clicked in the
 * plan, because the wall band draws after the items and every hit test used to
 * scan everything in one undifferentiated pass. The fix is hit PRIORITY, not
 * pickability — see js/layers.js for the rank vocabulary — so the assertions
 * here are about ORDER and PERMISSION, and deliberately not about any layer
 * becoming invisible to the mouse.
 *
 * js/interaction.js cannot be imported in Node (its graph reaches bare "three"
 * specifiers through view3d.js/plan2d.js — see AGENTS.md), so its half is
 * pinned against source with comments blanked. Everything reachable without a
 * canvas is exercised for real.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";
import { S } from "../js/state.js";
import { resetLayers, layerRank } from "../js/layers.js";
import { addMarker, hitMarker } from "../js/markers.js";
import { hitMEP, addNode, ensureMEP } from "../js/mep.js";
import { addSlabOpening, hitSlabOpening } from "../js/slab_openings.js";
import { hitWarning } from "../js/constraint_engine.js";

const interaction = stripComments(
  await readFile(new URL("../js/interaction.js", import.meta.url), "utf8"),
);
const elevationSource = stripComments(
  await readFile(new URL("../js/elevation.js", import.meta.url), "utf8"),
);
const markerSource = stripComments(
  await readFile(new URL("../js/markers.js", import.meta.url), "utf8"),
);
const mepSource = stripComments(
  await readFile(new URL("../js/mep.js", import.meta.url), "utf8"),
);
const slabSource = stripComments(
  await readFile(new URL("../js/slab_openings.js", import.meta.url), "utf8"),
);
const constraintSource = stripComments(
  await readFile(new URL("../js/constraint_engine.js", import.meta.url), "utf8"),
);

/* The policy reads entirely off S, so a work set or a `vis` leaked from one
   case would quietly decide the next. Same reset the layer tests use, plus the
   fields the hit tests themselves need to exist. */
function fresh() {
  resetLayers();
  S.roomMeta = {};
  S.nodes = [];
  S.walls = [];
  S.items = [];
  S.openings = [];
  S.markers = [];
  S.mep = null;
  S.slabOpenings = [];
  S.SC = 1;
}

/* The body of the two-pass select chain, which is where every ordering
   decision lives. Sliced rather than matched against the whole file so that a
   coincidence elsewhere in 5000 lines cannot satisfy an ordering assertion. */
function selectChain() {
  const from = interaction.indexOf("function runSelectPass(pass) {");
  assert.ok(from > 0, "the select-tool pick chain is a function that takes a pass");
  // The tail of the call was `return;` until the drag proxy landed and made it
  // `return void armDragProxy();`. What this slice needs is the pass-numbered
  // call itself — that is what proves the chain is driven twice, once per rank.
  const to = interaction.indexOf("if (runSelectPass(0))", from);
  assert.ok(to > from, "and it is called with an explicit pass number");
  return interaction.slice(from, to);
}

/* ---- 1. every hit test consults the rank ---- */

test("every plan hit test refuses an unreachable layer before it scans", () => {
  // name -> the layer id its guard must ask about
  const guards = {
    hitNode: "structure",
    hitOpening: "structure",
    hitItem: "furniture",
    hitWall: "structure",
    hitRoom: "structure",
  };
  Object.keys(guards).forEach((fn) => {
    const at = interaction.indexOf("function " + fn + "(px, pz)");
    assert.ok(at > 0, fn + " is still declared with the same signature");
    const head = interaction.slice(at, at + 260);
    assert.match(
      head,
      new RegExp('layerRank\\("' + guards[fn] + '"\\) === Infinity\\) return null'),
      fn + " gates on the " + guards[fn] + " layer",
    );
  });
});

test("the hit tests outside interaction.js carry the same gate", () => {
  assert.match(markerSource, /export function hitMarker\(px, pz, scale=S\.SC\) \{\s*if \(layerRank\("annotations"\) === Infinity\) return null;/);
  assert.match(mepSource, /export function hitMEP\(px, pz, scale=S\.SC\) \{\s*if \(layerRank\("mep"\) === Infinity\) return null;/);
  assert.match(slabSource, /export function hitSlabOpening\(px, pz, pad\) \{\s*if \(layerRank\("structure"\) === Infinity\) return null;/);
  assert.match(constraintSource, /export function hitWarning\(px, pz, thr\) \{\s*if \(layerRank\("annotations"\) === Infinity\) return null;/);
});

test("the elevation hit family ranks the same layers the plan does", () => {
  assert.match(elevationSource, /export function elevationHitMarker\(px, py\) \{\s*if \(layerRank\("annotations"\) === Infinity\) return null;/);
  assert.match(elevationSource, /export function elevationHitOpening\(px, py\) \{\s*if \(layerRank\("structure"\) === Infinity\) return null;/);
  assert.match(elevationSource, /export function elevWallAt\(px, py, throughOpenings\) \{\s*if \(layerRank\("structure"\) === Infinity\) return null;/);
  // the composite gates its own two sweeps rather than trusting the callees
  const composite = elevationSource.slice(elevationSource.indexOf("export function elevationHit(px, py)"));
  assert.match(composite, /if \(layerRank\("furniture"\) !== Infinity\) vis\.items\.forEach/);
  assert.match(composite, /if \(layerRank\("structure"\) === Infinity\) return null;\s*var bw = null/);
});

test("pickErase inherits its gates from the hit tests it chains", () => {
  const erase = interaction.slice(
    interaction.indexOf("function pickErase(px, pz, ox, oy)"),
    interaction.indexOf("function eraseKey(hit)"),
  );
  // it calls the gated functions and adds no unguarded scan of its own
  ["hitMEP", "hitMarker", "hitOpening", "hitItem", "hitSlabOpening", "hitWall"].forEach((fn) => {
    assert.ok(erase.includes(fn + "("), "pickErase still goes through " + fn);
  });
  assert.doesNotMatch(erase, /S\.items\.forEach|S\.walls\.forEach/,
    "pickErase never rolls its own scan past a gate");
});

/* ---- 2. the pointerdown chain runs twice ---- */

test("the select-tool pointerdown chain runs a focused pass, then a fallback", () => {
  /* Each pass still returns immediately on a hit; the drag proxy gave both
     returns a tail (`return void armDragProxy();`), so the return statement is
     matched up to its semicolon rather than as the bare word. What is pinned is
     unchanged: two adjacent pass-numbered calls, each of which ends the
     pointerdown, in rank order. */
  assert.match(interaction, /if \(runSelectPass\(0\)\) return[^;]*;\s*if \(runSelectPass\(1\)\) return[^;]*;/);
  // rank 0 must be consulted first, or the fallback would win the click
  assert.ok(
    interaction.indexOf("if (runSelectPass(0))") <
      interaction.indexOf("if (runSelectPass(1))"),
    "the focused pass is asked first",
  );
  // and only when both miss does the click count as blank space
  const after = interaction.slice(interaction.indexOf("if (runSelectPass(1))"));
  assert.match(after.slice(0, 400), /select\(null\);/);
});

test("each band of the chain is gated on its own layer's rank matching the pass", () => {
  const chain = selectChain();
  ["mep", "annotations", "structure", "furniture"].forEach((id) => {
    assert.ok(
      chain.includes('layerRank("' + id + '") === pass'),
      id + " is tested only in the pass that matches its rank",
    );
  });
  // Infinity equals neither 0 nor 1, so a hidden layer costs nothing in either
  // pass and no band is ever tested twice.
  assert.doesNotMatch(chain, /layerRank\([^)]*\) !== Infinity/,
    "the chain splits by rank, it does not re-test reachability");
});

test("the order within a pass is exactly the order it always was", () => {
  const chain = selectChain();
  const order = [
    "hitMEP(px, pz, inputScale())",
    "pickCon(e.offsetX, e.offsetY)",
    "hitNode(px, pz)",
    "hitMarker(px, pz, inputScale())",
    "hitOpening(px, pz)",
    "hitItem(px, pz)",
    "hitSlabOpening(px, pz)",
    "hitWall(px, pz)",
    "hitRoom(px, pz)",
  ];
  let last = -1;
  order.forEach((call) => {
    const at = chain.indexOf(call);
    assert.ok(at > last, call + " keeps its place in the chain");
    last = at;
  });
  /* The two that are easiest to "tidy" into the wrong place, called out by
     name: a device standing on furniture stays grabbable, and a ~12px point
     standing inside its own object's footprint is not buried by it. */
  assert.ok(chain.indexOf("hitMEP(px, pz, inputScale())") < chain.indexOf("hitItem(px, pz)"));
  assert.ok(chain.indexOf("hitMarker(px, pz, inputScale())") < chain.indexOf("hitItem(px, pz)"));
  assert.ok(chain.indexOf("hitMarker(px, pz, inputScale())") < chain.indexOf("hitOpening(px, pz)"));
});

/* ---- 3. drag gating ---- */

test("every band arms its drag behind canDrag and nothing else", () => {
  const chain = selectChain();
  // the structure lock is no longer consulted by hand anywhere in the chain:
  // canDrag reads it through isLayerLocked("structure")
  assert.doesNotMatch(chain, /S\.lockStruct/,
    "the chain asks canDrag, which already folds in the structure lock");
  assert.doesNotMatch(chain, /hi\.locked/,
    "a pinned piece is refused by canDrag on the selection that was made");
  ["nodeSel", "mkSel", "opSel", "voidSel", "wallSel", "roomSel", "edgeSel"].forEach((name) => {
    assert.ok(chain.includes("canDrag(" + name + ")"), name + " asks canDrag");
  });
  assert.ok(chain.includes("canDrag(S.sel)"), "the item band asks about the real selection");
  // every S.action the chain sets is inside a canDrag branch, so the count of
  // canDrag calls cannot fall behind the count of armed gestures
  const armed = chain.match(/S\.action = "(node|marker|opening|item|slabvoid|wall|room)"/g) || [];
  assert.equal(armed.length, 9,
    "nine arming sites — the item band has two, one per selection shape, "
    + "and a room's edge handle arms a wall drag of its own");
  /* Refusing a drag must also CLEAR any stale action, or a gesture that the
     previous pointerdown left armed would run against the thing just refused. */
  const cleared = chain.match(/S\.action = null;/g) || [];
  assert.equal(cleared.length, 11,
    "nine refusal paths clear the action, plus the two ctrl-click multi-selects");
});

test("a refused band still selects, so the inspector fills for a rank-1 hit", () => {
  const chain = selectChain();
  // in every band the select() precedes the permission question
  ["mkSel", "opSel", "voidSel", "roomSel"].forEach((name) => {
    assert.ok(
      chain.indexOf("select(" + name + ")") < chain.indexOf("canDrag(" + name + ")"),
      name + " is selected before it is asked whether it may move",
    );
  });
  assert.ok(chain.indexOf('select({ kind: "wall", ref: hw })') < chain.indexOf("canDrag(wallSel)"));
});

test("begin3DItemDrag answers to canDrag, so both views agree", () => {
  const drag = interaction.slice(
    interaction.indexOf("export function begin3DItemDrag(it)"),
    interaction.indexOf("export function drag3DItemTo"),
  );
  assert.match(drag, /if \(!canDrag\(sel\)\) \{/);
  assert.match(drag, /blockedDrag\(sel\);/);
  assert.doesNotMatch(drag, /it\.locked/, "the piece's own flag is canDrag's business now");
});

test("the elevation pointerdown asks canDrag before arming its three gestures", () => {
  const elev = interaction.slice(
    interaction.lastIndexOf("var eh = elevationHit(ox, oy);"),
  ).slice(0, 1200);
  assert.match(elev, /select\(eh \|\| null\);/);
  assert.match(elev, /if \(!canDrag\(eh\)\) \{\s*blockedDrag\(eh\);/);
  assert.doesNotMatch(elev.slice(0, elev.indexOf('S.action = "openingElev"')), /eh\.ref\.locked/);
});

/* ---- 4. targetLocked ---- */

test("targetLocked understands layers, rooms, groups and any locked object", () => {
  const fn = interaction.slice(
    interaction.indexOf("function targetLocked(sel)"),
    interaction.indexOf("function blockedDrag(sel)"),
  );
  assert.match(fn, /var id = layerOf\(sel\.kind\);\s*if \(id && isLayerLocked\(id\)\) return true;/);
  assert.match(fn, /if \(sel\.kind === "room"\)/, "a room's flag lives in S.roomMeta, not on the ref");
  assert.match(fn, /S\.roomMeta\[sel\.ref\]/);
  assert.match(fn, /Array\.isArray\(sel\.refs\)/);
  assert.match(fn, /sel\.refs\.every\(/, "a multi-selection is locked only when every ref is");
  // refLocked (js/user_layers.js): the object's own pin or its user layer's padlock
  assert.match(fn, /return refLocked\(sel\.ref\);/,
    "the object test is generic, so it reaches walls, openings and MEP nodes");
  // rank is deliberately NOT part of it: refusing to DELETE an off-work-set
  // object is a harsher policy than refusing to drag one, and only canDrag
  // makes that call.
  assert.doesNotMatch(fn, /layerRank/);
});

/* ---- 5. hover ---- */

test("select-tool idle hover lights focused layers only", () => {
  const hover = interaction.slice(
    interaction.indexOf('if (!S.action && S.tool === "select") {'),
  ).slice(0, 3200);
  assert.match(hover, /structure: layerRank\("structure"\) === 0/);
  assert.match(hover, /furniture: layerRank\("furniture"\) === 0/);
  assert.match(hover, /annotations: layerRank\("annotations"\) === 0/);
  assert.match(hover, /S\.hoverItem = focus\.furniture \? hitItem\(px, pz\) : null;/);
  assert.match(hover, /S\.hoverMarker = focus\.annotations \? hitMarker\(px, pz, inputScale\(\)\) : null;/);
  assert.match(hover, /S\.hoverNode = focus\.structure && S\.hoverMarker == null/);
  assert.match(hover, /var hoverCon = focus\.annotations \? pickCon\(/);
  assert.match(hover, /S\.wallHoverHalf =\s*focus\.structure &&/);
  assert.match(hover, /var hoverWarn = focus\.annotations \? hitWarning\(/);
});

/* ---- 6. the refused-drag signal ---- */

test("a refused drag is announced on the window, with the gate that failed", () => {
  const fn = interaction.slice(
    interaction.indexOf("function blockedDrag(sel)"),
    interaction.indexOf("function applyRemove(sel)"),
  );
  assert.match(fn, /new CustomEvent\("layers:blocked-drag"/);
  /* `where` distinguishes the pane so one pill serves both; js/view3d.js
     emits the same four fields with where: "3d". */
  assert.match(fn, /detail: \{ sel: sel, layer: id, reason: reason, ulayer: ul, where: inputIs3D\(\)\?"3d":"2d" \}/);
  // the three reasons, in the order canDrag tests them
  assert.match(fn, /reason = "object"/);
  assert.match(fn, /layerRank\(id\) !== 0\) reason = "rank"/);
  assert.match(fn, /isLayerLocked\(id\)\) reason = "layer"/);
  // this module owns no DOM: it says so and lets the layer UI draw the pill
  assert.doesNotMatch(fn, /document\.createElement|innerHTML/);
});

/* ---- 7. the number keys are still tools ---- */

test("1 to 5 still pick tools — solo is Shift and belongs to the layer UI", () => {
  const keys = { 1: "select", 2: "wall", 3: "door", 4: "window", 5: "passage" };
  Object.keys(keys).forEach((k) => {
    assert.match(
      interaction,
      new RegExp('e\\.key === "' + k + '"\\) setTool\\("' + keys[k] + '"\\)'),
      k + " is still " + keys[k],
    );
  });
});

/* ---- 8. behaviour, where a canvas is not needed ---- */

test("a hidden annotations layer takes points off the pointer; showing it restores them", () => {
  fresh();
  const m = addMarker({ x: 100, z: 100 });
  assert.equal(hitMarker(100, 100), m, "a visible point answers");
  S.layers.annotations.vis = "hide";
  assert.equal(hitMarker(100, 100), null);
  // ghosting is the same answer: you cannot grab what you cannot properly see
  S.layers.annotations.vis = "ghost";
  assert.equal(hitMarker(100, 100), null);
  S.layers.annotations.vis = "show";
  assert.equal(hitMarker(100, 100), m);
});

test("an off-work-set point is rank 1 and still answers the hit test", () => {
  fresh();
  const m = addMarker({ x: 40, z: 40 });
  assert.equal(S.workSet, "furniture", "the default work set is not annotations");
  assert.equal(layerRank("annotations"), 1);
  assert.equal(hitMarker(40, 40), m, "rank 1 selects; only the drag is withheld");
});

test("MEP entities leave the pointer when the MEP layer is not shown", () => {
  fresh();
  const m = ensureMEP();
  m.place = null;
  const n = addNode("elec", "socket", 200, 200, null, null, null);
  assert.equal(hitMEP(200, 200)?.ref, n);
  S.layers.mep.vis = "ghost";
  assert.equal(hitMEP(200, 200), null);
});

test("a slab void answers to the structure layer it is cut in", () => {
  fresh();
  const o = addSlabOpening({ x: 0, z: 0, w: 100, d: 100, rot: 0 });
  assert.equal(hitSlabOpening(0, 0), o);
  S.layers.structure.vis = "hide";
  assert.equal(hitSlabOpening(0, 0), null);
});

test("warning glyphs ride the annotations layer with the dimensions they come from", () => {
  fresh();
  S.layers.annotations.vis = "hide";
  assert.equal(hitWarning(0, 0, 50), null, "no scan at all when annotations are hidden");
});

test("a pickOverride reaches the hit tests, in both directions", () => {
  fresh();
  const m = addMarker({ x: 10, z: 10 });
  S.layers.annotations.vis = "hide";
  S.layers.annotations.pickOverride = true;
  assert.equal(hitMarker(10, 10), m, "the override outranks the visibility state");
  S.layers.annotations.vis = "show";
  S.layers.annotations.pickOverride = false;
  assert.equal(hitMarker(10, 10), null, "and closes a visible layer just as hard");
});
