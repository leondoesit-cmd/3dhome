import test from "node:test";
import assert from "node:assert/strict";
import { createSurfaceSketch,surfacePoint,surfaceNormal,surfaceSketchPolyline } from "../js/core/surface_uv.js";
import { createDefinition } from "../js/core/schema.js";
import { rebuildDefinition } from "../js/core/rebuild.js";

test("cylindrical UV sketches map solved 2D geometry onto the curved face",()=>{
  const descriptor={surface:"cylinder",origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0},radius:10},reference={type:"topology-reference",kind:"face",ownerFeatureId:"body",persistentId:"body:face:side",descriptor};
  const sketch=createSurfaceSketch(reference);sketch.points=[{id:"a",x:0,y:0,fixed:true},{id:"b",x:Math.PI*5,y:20,fixed:true}];sketch.entities=[{id:"line",type:"line",a:"a",b:"b"}];
  const mapped=surfaceSketchPolyline(sketch,sketch.entities[0]);assert.equal(Math.round(mapped[1].y),20);assert.ok(Math.abs(Math.hypot(mapped[1].x,mapped[1].z)-10)<1e-6);assert.ok(Math.abs(Math.hypot(...Object.values(surfaceNormal(descriptor,0,0)))-1)<1e-6);
  const definition=createDefinition({features:[{id:"body",type:"cylinder",inputs:[],params:{x:0,y:0,z:0,r:10,h:30}},{id:"surface-sketch",type:"sketch",inputs:["body"],params:{sketchId:sketch.id}}],sketches:[sketch]});
  const run=rebuildDefinition(definition);assert.equal(run.ok,true,JSON.stringify(run.issues));
});

test("sphere UV uses arc-length coordinates and rejects unsupported surfaces",()=>{
  const point=surfacePoint({surface:"sphere",center:{x:0,y:0,z:0},radius:5},0,Math.PI*2.5);assert.ok(Math.abs(point.y-5)<1e-6);
  assert.throws(()=>createSurfaceSketch({persistentId:"x",descriptor:{surface:"bspline"}}),/supported UV/);
});
