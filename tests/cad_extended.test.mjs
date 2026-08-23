import test from "node:test";
import assert from "node:assert/strict";
import { createReferencePlane, createReferenceAxis, createCoordinateSystem } from "../js/cad_reference_geometry.js";
import { createExplodedView, addExplodeStep, applyExplodedView } from "../js/cad_exploded_view.js";
import { createMotionStudy, addRotaryMotor, evaluateMotionStudy } from "../js/cad_motion_study.js";
import { detectInterference, generateBOM, computeMassProperties } from "../js/cad_interference.js";
import { measureDistance, evaluateDraftAngle } from "../js/cad_evaluate.js";

test("reference geometry creates persistent plane, axis and coordinate records", () => {
  assert.equal(createReferencePlane().type,"reference_plane");
  assert.equal(createReferenceAxis().type,"reference_axis");
  assert.equal(createCoordinateSystem().type,"coordinate_system");
});

test("exploded views and motion studies drive assembly component transforms", () => {
  const assembly={components:[{id:"a",transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}}]};
  const view=createExplodedView(assembly); addExplodeStep(view,["a"],{x:20,y:0,z:0}); applyExplodedView(assembly,view.id,.5);
  assert.equal(assembly.components[0].explodedOffset.x,10);
  const study=createMotionStudy(assembly); addRotaryMotor(study,"a",10); evaluateMotionStudy(assembly,study.id,2);
  assert.equal(assembly.components[0].transform.ry,120);
});

test("BOM, mass properties and AABB interference produce useful values", async () => {
  const box={kind:"box",x0:0,x1:10,y0:0,y1:10,z0:0,z1:10};
  const assembly={components:[
    {id:"a",modelKey:"box",name:"Box",def:{parts:[box]},transform:{x:0,y:0,z:0}},
    {id:"b",modelKey:"box",name:"Box",def:{parts:[box]},transform:{x:5,y:0,z:0}},
  ]};
  assert.equal(generateBOM(assembly)[0].quantity,2);
  assert.equal(computeMassProperties({parts:[box]}).centerOfMass.x,5);
  const hits=await detectInterference(assembly.components); assert.equal(hits.length,1); assert.equal(hits[0].volume,500);
  assert.deepEqual(hits[0].bounds,{x0:5,y0:0,z0:0,x1:10,y1:10,z1:10});
});

test("evaluation tools report distance and draft", () => {
  assert.equal(measureDistance({x:0,y:0,z:0},{x:3,y:4,z:0}).distance,5);
  assert.equal(evaluateDraftAngle({x:1,y:0,z:0}).draftDeg,0);
});

test("mass properties locate an extrusion instead of parking it at the origin", () => {
  // 20 × 8 profile on the top plane (u→x, v→z), swept 5 cm up in y.
  const slab = { kind:"ext", axis:"y", from:0, to:5, pts:[
    {u:10,v:2},{u:30,v:2},{u:30,v:10},{u:10,v:10},
  ] };
  const solid = computeMassProperties({parts:[slab]});
  assert.equal(solid.volumeCm3, 800);
  assert.deepEqual(solid.centerOfMass, {x:20, y:2.5, z:6});

  // A hole removes both volume and its share of the first moment.
  const bored = computeMassProperties({parts:[{...slab, holes:[[
    {u:12,v:4},{u:16,v:4},{u:16,v:8},{u:12,v:8},
  ]]}]});
  assert.equal(bored.volumeCm3, 720);
  assert.ok(bored.centerOfMass.x > 20, "material left of the hole shifts the centre right");

  // The other two axis conventions must agree with basePartBounds().
  assert.deepEqual(computeMassProperties({parts:[{...slab, axis:"z"}]}).centerOfMass, {x:20, y:6, z:2.5});
  assert.deepEqual(computeMassProperties({parts:[{...slab, axis:"x"}]}).centerOfMass, {x:2.5, y:6, z:20});
});

test("mass properties measure frustums, revolves and unknown bodies honestly", () => {
  // A cone is a third of its bounding cylinder and its centroid sits at h/4.
  const cone = computeMassProperties({parts:[{kind:"cyl",x:0,y:0,z:0,r:3,r2:0,h:12}]});
  assert.ok(Math.abs(cone.volumeCm3 - (Math.PI*9*12)/3) < 0.02);
  assert.equal(cone.centerOfMass.y, 3);

  // Revolving a 2×2 square at radius 4..6 makes a rectangular-section ring.
  const ring = computeMassProperties({parts:[{kind:"rev",x:0,z:0,pts:[
    {u:4,v:0},{u:6,v:0},{u:6,v:2},{u:4,v:2},
  ]}]});
  assert.ok(Math.abs(ring.volumeCm3 - 2*Math.PI*5*4) < 0.02);
  assert.equal(ring.centerOfMass.y, 1);

  // Nothing measurable must not invent a block of steel.
  const unknown = computeMassProperties({parts:[{kind:"mesh"}]});
  assert.equal(unknown.volumeCm3, 0);
  assert.equal(unknown.unmeasured, 1);
});
