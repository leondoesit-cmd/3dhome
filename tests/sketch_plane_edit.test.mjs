import test from "node:test";
import assert from "node:assert/strict";
import { reassignSketchPlane } from "../js/core/sketch_plane_edit.js";
import { framePoint } from "../js/core/frame.js";

test("existing face sketch can move to an angled datum while keeping its constrained profile",()=>{
  const entities=[{id:1,type:"line",p1:1,p2:2}],constraints=[{id:"fix",type:"fix",point:1,x:0,y:0}];
  const sketch={id:"existing",entities,constraints,support:{persistentId:"old"},supportOffset:2,frameAnchor:"bounds-center",offset:2};
  const plane={id:"inclined",type:"plane",origin:{x:4,y:2,z:0},normal:{x:Math.sqrt(3)/2,y:.5,z:0}};
  reassignSketchPlane(sketch,plane,"front");
  assert.equal(sketch.id,"existing");assert.equal(sketch.entities,entities);assert.equal(sketch.constraints,constraints);
  assert.equal(sketch.referenceId,"inclined");assert.equal(sketch.frameSpace,"local");assert.equal(sketch.offset,0);
  assert.equal(sketch.support,undefined);assert.equal(sketch.frameAnchor,undefined);assert.equal(sketch.supportOffset,undefined);
  assert.deepEqual(framePoint(sketch.frame,0,0),plane.origin);
  assert.ok(Math.abs(framePoint(sketch.frame,2,0).x-5)<1e-12);
});
test("switching a datum sketch to a principal plane drops the old local attachment",()=>{
  const sketch={frame:{},frameSpace:"local",support:{},referenceId:"inclined",offset:5};
  reassignSketchPlane(sketch,{type:"plane",id:"plane:right"},"side");
  assert.equal(sketch.plane,"side");assert.equal(sketch.referenceId,"plane:right");assert.equal(sketch.frame,undefined);assert.equal(sketch.frameSpace,undefined);
});
