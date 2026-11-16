/* Walls: Down cuts MEP at the wall height unless services are the work set
   (js/mep/wall_clip.js, used by buildMEP3D). */
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.module.js";
import { S } from "../js/state.js";
import { addNode, addRun, buildMEP3D } from "../js/mep.js";
import { builtMepCut, clipSegmentAtCut, keptUnderCut, mepCutHeight } from "../js/mep/wall_clip.js";

test("the MEP cut follows the wall cut, except with services as the work set", () => {
  assert.equal(mepCutHeight(160, "furniture"), 160);
  assert.equal(mepCutHeight(160, "structure"), 160);
  assert.equal(mepCutHeight(160, "mep"), Infinity);
  assert.equal(mepCutHeight(Infinity, "furniture"), Infinity);
  assert.equal(mepCutHeight(undefined, "furniture"), Infinity);
});

test("segments above the cut drop, below stay, crossing ones end at the cut", () => {
  const a = { x: 0, y: 30, z: 0 }, b = { x: 100, y: 30, z: 0 };
  assert.deepEqual(clipSegmentAtCut(a, b, 160), [a, b]);
  assert.equal(clipSegmentAtCut({ x: 0, y: 258, z: 0 }, { x: 100, y: 258, z: 0 }, 160), null);
  // a drop from the ceiling run to a switch at 110 cm ends at the wall top
  assert.deepEqual(clipSegmentAtCut({ x: 5, y: 258, z: 5 }, { x: 5, y: 110, z: 5 }, 160),
    [{ x: 5, y: 160, z: 5 }, { x: 5, y: 110, z: 5 }]);
  assert.deepEqual(clipSegmentAtCut({ x: 0, y: 100, z: 0 }, { x: 100, y: 200, z: 0 }, 160),
    [{ x: 0, y: 100, z: 0 }, { x: 60, y: 160, z: 0 }]);
  const up = [{ x: 0, y: 258, z: 0 }, { x: 0, y: 110, z: 0 }];
  assert.deepEqual(clipSegmentAtCut(up[0], up[1], Infinity), up, "walls up: untouched");
  assert.equal(keptUnderCut(240, 160), false);
  assert.equal(keptUnderCut(150, 160), true);
  assert.equal(keptUnderCut(258, Infinity), true);
});

function scene() {
  S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.mep = null;
  addRun("power", "circuit", [{ x: 0, z: 0 }, { x: 300, z: 0 }], null, null, "ceiling");
  addRun("power", "circuit", [{ x: 0, z: 100 }, { x: 300, z: 100 }], null, null, "wall");
  addNode("power", "light", 150, 0, null, null, "ceiling");
  addNode("power", "switch", 0, 0, null, null, "wall"); // the ceiling run drops to it
}
function topY(group) {
  group.updateMatrixWorld(true);
  let top = -Infinity;
  group.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); top = Math.max(top, b.max.y); } });
  return top;
}

test("buildMEP3D leaves ceiling services out under Walls: Down and keeps them for the services work set", () => {
  scene();
  const whole = new THREE.Group();
  S.workSet = "furniture";
  buildMEP3D(whole, THREE, Infinity);
  assert.ok(topY(whole) > 240, "walls up: ceiling run and light present");
  const cut = new THREE.Group();
  buildMEP3D(cut, THREE, 160);
  assert.equal(builtMepCut(), 160);
  assert.ok(cut.children.length > 0, "the wall-level run stays");
  assert.ok(topY(cut) <= 162, "nothing stands above the cut walls: " + topY(cut));
  const drop = cut.children.find((o) => { const b = new THREE.Box3().setFromObject(o); return b.max.y - b.min.y > 40; });
  assert.ok(drop, "the drop to the switch is kept, ending at the cut");
  assert.ok(Math.abs(new THREE.Box3().setFromObject(drop).max.y - 160) < 2);
  const mep = new THREE.Group();
  S.workSet = "mep";
  buildMEP3D(mep, THREE, 160);
  assert.equal(builtMepCut(), Infinity);
  assert.equal(mep.children.length, whole.children.length, "services work set: MEP whole");
  S.workSet = "furniture";
});
