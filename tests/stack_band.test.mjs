// An MEP-only 3D rebuild still sends "scene3d:rebuilt" (every listener keeps
// getting it), marked MEP-only; the whole-house floor stack then keeps the live
// storey's band instead of disposing and rebuilding it, and still refreshes the
// shadows and storey lights exactly as the full sync did.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripComments } from "./source.mjs";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { isMepOnlyRebuild, keepActiveBand, mepRebuiltEvent } from "../js/view3d/stack_band.js";

test("the MEP-only event keeps the name and says it is MEP-only", () => {
  const e = mepRebuiltEvent();
  assert.equal(e.type, "scene3d:rebuilt");
  assert.equal(isMepOnlyRebuild(e), true);
  assert.equal(isMepOnlyRebuild(new Event("scene3d:rebuilt")), false);
  assert.equal(isMepOnlyRebuild(undefined), false);
  assert.equal(isMepOnlyRebuild(new CustomEvent("scene3d:rebuilt", { detail: { mepOnly: 1 } })), false);
});

test("keepActiveBand: only an MEP-only sync, only for the levels and colour it was built for", () => {
  const built = { rise: 300, depth: 20, wallColor: 0xffffff };
  assert.equal(keepActiveBand(built, true, 300, 20, 0xffffff), true);
  assert.equal(keepActiveBand(built, false, 300, 20, 0xffffff), false);
  assert.equal(keepActiveBand(null, true, 300, 20, 0xffffff), false);
  assert.equal(keepActiveBand(built, true, 280, 20, 0xffffff), false);
  assert.equal(keepActiveBand(built, true, 300, 0, 0xffffff), false);
  assert.equal(keepActiveBand(built, true, 300, 20, 0xeeeeee), false);
  assert.equal(keepActiveBand({ rise: null, depth: 20, wallColor: 1 }, true, null, 20, 1), true);
});

test("rebuild3D sends the plain event, rebuildMEP3D the MEP-only one, and the floor stack reads it", () => {
  const src = stripComments(moduleSource("js/view3d.js"));
  assert.match(sourceFunctionText(src, "rebuild3D"), /window\.dispatchEvent\(new Event\("scene3d:rebuilt"\)\);/);
  const only = sourceFunctionText(src, "rebuildMEP3D");
  assert.match(only, /window\.dispatchEvent\(mepRebuiltEvent\(\)\);/);
  assert.doesNotMatch(only, /new Event\("scene3d:rebuilt"\)/);
  const stack = stripComments(readFileSync(new URL("../js/view3d/floor_stack.js", import.meta.url), "utf8"));
  assert.match(stack, /addEventListener\("scene3d:rebuilt", function \(e\) \{ syncFloorStack\(\{ mepOnly: isMepOnlyRebuild\(e\) \}\); \}\)/);
});

// syncFloorStack as written, against stubbed scene pieces
class Group {
  constructor() { this.children = []; this.parent = null; this.position = { y: 0 }; this.userData = {}; this.name = ""; }
  add(o) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); }
  remove(o) { this.children = this.children.filter((c) => c !== o); o.parent = null; }
  getObjectByName() { return null; }
}
function floorStack() {
  const src = readFileSync(new URL("../js/view3d/floor_stack.js", import.meta.url), "utf8");
  const code = sourceFunctionText(src, "syncFloorStack");
  const calls = { dispose: 0, bandWalls: 0, slabs: 0, shadow: 0, refit: 0, tag: 0 };
  const S = { workspace: {}, wallColor: 0xffffff };
  const deps = {
    S, calls, THREE: { Group }, main: new Group(),
    stackedFloors: ((up) => () => [{ floor: up, dy: 300, rise: 300 }])({ id: "up", scene: {} }),
    keepActiveBand, isMepOnlyRebuild,
  };
  const make = new Function("deps", `
    const { S, calls, THREE, main, stackedFloors, keepActiveBand } = deps;
    var fsGroup = null, fsEntries = new Map(), fsActive = null, fsActiveFor = null;
    var groundPlaneRef = null, siteDressRef = null;
    const has3D = () => true, getMainScene = () => main, cutH = () => Infinity;
    const storeyWallTop = () => 270, storedWallTop = () => 270, slabDepth = () => 30;
    const riseAbove = () => 300, liveRooms = () => [{}];
    const buildStorey = () => { const g = new THREE.Group(); g.userData.storeyLight = {}; return g; };
    const disposeStorey = (g) => { calls.dispose++; if (g.parent) g.parent.remove(g); };
    const storeyWallBoxes = () => [], addWallMesh = () => { calls.bandWalls++; };
    const addSlabUndersides = () => { calls.slabs++; };
    const lightSlabUndersides = () => { calls.tag++; }, requestShadowUpdate = () => { calls.shadow++; };
    const refitStoreyLights = () => { calls.refit++; };
    ${code.replace(/^export /, "")}
    return { syncFloorStack, active: () => fsActive };`);
  return Object.assign(make(deps), { calls, S });
}

test("an MEP-only sync keeps the live band and still refreshes shadows and storey lights", () => {
  const fs = floorStack(), c = fs.calls;
  fs.syncFloorStack();
  const band = fs.active();
  assert.ok(band);
  assert.deepEqual([c.dispose, c.bandWalls, c.slabs, c.shadow, c.refit, c.tag], [0, 1, 1, 1, 1, 1]);
  fs.syncFloorStack({ mepOnly: true });
  assert.equal(fs.active(), band, "the same band, not a rebuilt one");
  assert.equal(band.parent && band.parent.name, "floorStack");
  assert.deepEqual([c.dispose, c.bandWalls, c.slabs], [0, 1, 1], "nothing disposed or rebuilt");
  assert.deepEqual([c.shadow, c.refit, c.tag], [2, 2, 2], "the refresh after a sync is unchanged");
  fs.syncFloorStack(); // a full rebuild (or the Whole-house toggle): the band is redone
  assert.notEqual(fs.active(), band);
  assert.deepEqual([c.dispose, c.bandWalls, c.slabs, c.shadow], [1, 2, 2, 3]);
  const band2 = fs.active();
  fs.S.wallColor = 0xeeeeee; // what the band was built for changed: rebuild even MEP-only
  fs.syncFloorStack({ mepOnly: true });
  assert.notEqual(fs.active(), band2);
  assert.deepEqual([c.dispose, c.bandWalls], [2, 3]);
});
