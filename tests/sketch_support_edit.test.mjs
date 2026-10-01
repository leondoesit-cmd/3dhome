import test from "node:test";
import assert from "node:assert/strict";
import { reattachFeatureSketchSupport, reattachSketchSupport, sketchSupportNeedsUpdate } from "../js/core/sketch_support_edit.js";
import {holeCutRecords} from '../js/core/hole_geometry.js';
import {holeLayoutPoints} from '../js/cad_hole_wizard.js';

test('explicit support replacement retargets its converted boundary only',()=>{
 const sketch={support:{persistentId:'base:end'},boundaryCopies:[{source:{persistentId:'base:end'},associative:true},{source:{persistentId:'other:face'},associative:true}]};
 const attachment={support:{persistentId:'base:start',ownerFeatureId:'base'},plane:'front',frame:{origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:-1}}};
 reattachSketchSupport(sketch,attachment);
 assert.equal(sketch.boundaryCopies[0].source.persistentId,'base:start');
 assert.equal(sketch.boundaryCopies[1].source.persistentId,'other:face');
 assert.equal(sketch.referenceId,'base:start');
 assert.equal(sketch.frame.normal.z,-1);
 attachment.support.persistentId='mutated';
 assert.equal(sketch.support.persistentId,'base:start');
 assert.equal(sketch.boundaryCopies[0].source.persistentId,'base:start');
});

test("a Hole Wizard support edit forks a sketch shared with LensNeck", () => {
  const old = { id: "face-sketch", name: "Face sketch", points: [{ id: 1, x: 0, y: 0 }], entities: [{ id: 2, type: "circle", c: 1, r: 1 }], support: { persistentId: "base-face" }, boundaryCopies: [{ source: { persistentId: "base-face" }, associative: true, entityIds: [2] }], frame: { origin: { x: 0, y: 0, z: -5.08 } } };
  const neck = { id: "neck", name: "LensNeck", params: { sketchId: old.id }, references: { sketches: [old.id] } };
  const hole = { id: "hole", type: "hole", name: "BulbHole", params: { sketchId: old.id }, references: { sketches: [old.id] } };
  const document = { sketches: [old], features: [neck, hole], history: [{ id: "history:feature:neck", kind: "feature", targetId: neck.id }, { id: "history:feature:hole", kind: "feature", targetId: hole.id }] };
  const attachment = { support: { persistentId: "shell-inside", ownerFeatureId: "shell" }, plane: "front", frame: { origin: { x: 0, y: 0, z: -4.445 }, normal: { x: 0, y: 0, z: 1 } }, frameAnchor: "bounds-center" };
  const { sketch, forked } = reattachFeatureSketchSupport(document, hole, attachment, "hole-sketch");
  assert.equal(forked, true);
  assert.equal(neck.params.sketchId, old.id);
  assert.equal(old.frame.origin.z, -5.08);
  assert.equal(hole.params.sketchId, "hole-sketch");
  assert.deepEqual(hole.references.sketches, ["hole-sketch"]);
  assert.equal(sketch.frame.origin.z, -4.445);
  assert.deepEqual(sketch.boundaryCopies, []);
  assert.equal(old.boundaryCopies[0].source.persistentId, "base-face");
  assert.deepEqual(document.history.map((item) => item.targetId), ["neck", "hole-sketch", "hole"]);
  assert.deepEqual(sketch.entities, []);
  assert.equal(sketch.constraints[0].type, 'fixed');
  assert.deepEqual(holeLayoutPoints(hole.params,sketch), [{u:0,v:0}]);
  assert.deepEqual(holeCutRecords(hole.params,sketch)[0].params.centres,[{u:0,v:0}]);
  assert.equal(old.entities[0].type, 'circle');
});

test("reapplying the same support repairs a saved stale frame and converted boundary", () => {
  const sketch = { id: "hole-sketch", points:[{id:1,x:0,y:0}],entities:[{id:2,type:'circle',c:1,r:1}],support: { persistentId: "shell-inside" }, frame: { origin: { x: 0, y: 0, z: -5.08 } }, boundaryCopies: [{ source: { persistentId: "base-face" }, associative: true }] };
  const hole = { id: "hole", type: "hole", params: { sketchId: sketch.id }, references: { sketches: [sketch.id] } };
  const document = { sketches: [sketch], features: [hole], history: [] };
  const attachment = { support: { persistentId: "shell-inside" }, plane: "front", frame: { origin: { x: 0, y: 0, z: -4.445 } }, frameAnchor: "bounds-center" };
  assert.equal(sketchSupportNeedsUpdate(sketch, attachment), true);
  const result = reattachFeatureSketchSupport(document, hole, attachment, "unused");
  assert.equal(result.forked, false);
  assert.equal(document.sketches.length, 1);
  assert.equal(sketch.frame.origin.z, -4.445);
  assert.deepEqual(sketch.boundaryCopies, []);
  assert.equal(sketchSupportNeedsUpdate(sketch, attachment), false);
});
