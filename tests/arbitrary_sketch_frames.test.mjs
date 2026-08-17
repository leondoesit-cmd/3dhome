import test from "node:test";
import assert from "node:assert/strict";

import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { createDefinition } from "../js/core/schema.js";
import { frameDot, frameFromPlane, framePoint, frameProjectPoint } from "../js/core/frame.js";
import { rebuildDefinition } from "../js/core/rebuild.js";
import { createTopologyReference, topologyForFeature } from "../js/core/topology.js";

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const normal = { x: 0.2, y: 0.8, z: 0.565685424949238 };
const profile = [{ u:-20, v:-10 }, { u:20, v:-10 }, { u:20, v:10 }, { u:-20, v:10 }];

test("arbitrary planar frames are orthonormal and round-trip sketch coordinates", () => {
  const frame=frameFromPlane({x:13,y:-8,z:21},normal,{x:1,y:0,z:0});
  close(frameDot(frame.xAxis,frame.yAxis),0);
  close(frameDot(frame.xAxis,frame.normal),0);
  close(frameDot(frame.yAxis,frame.normal),0);
  close(frameDot(frame.xAxis,frame.xAxis),1);
  close(frameDot(frame.yAxis,frame.yAxis),1);
  close(frameDot(frame.normal,frame.normal),1);
  const world=framePoint(frame,12.5,-3.25,7.75), local=frameProjectPoint(frame,world);
  close(local.u,12.5); close(local.v,-3.25); close(local.w,7.75);
});

test("analytic extrusion topology follows an arbitrary frame normal", () => {
  const frame=frameFromPlane({x:3,y:4,z:5},normal);
  const feature={id:"angled",type:"extrude"};
  const topology=topologyForFeature(feature,{axis:"frame",frame,from:2,to:17,points:profile});
  const start=topology.find((item)=>item.persistentId==="angled:face:start");
  const end=topology.find((item)=>item.persistentId==="angled:face:end");
  const expectedStart=framePoint(frame,0,0,2), expectedEnd=framePoint(frame,0,0,17);
  for (const key of ["x","y","z"]) { close(start.descriptor.origin[key],expectedStart[key]); close(end.descriptor.origin[key],expectedEnd[key]); }
  close(frameDot(end.descriptor.normal,frame.normal),1);
  close(frameDot(start.descriptor.normal,frame.normal),-1);
});

function supportedDefinition(depth = 30) {
  const frame=frameFromPlane({x:7,y:11,z:-4},normal);
  const body={id:"body",type:"extrude",inputs:[],params:{axis:"frame",frame,from:0,to:depth,points:profile}};
  const end=topologyForFeature(body,body.params).find((item)=>item.persistentId==="body:face:end");
  const support=createTopologyReference(end.ownerFeatureId,end.kind,end.persistentId,end.descriptor);
  const padFrame=frameFromPlane(end.descriptor.origin,end.descriptor.normal,frame.xAxis);
  return createDefinition({
    id:"definition:angled-support",
    sketches:[{id:"face-sketch",name:"Angled face sketch",plane:"top",frameSpace:"local",frame:padFrame,supportOffset:2,referenceId:support.persistentId,support,points:[],entities:[],constraints:[]}],
    features:[body,{id:"pad",type:"extrude",inputs:["body"],params:{axis:"frame",frame:padFrame,from:2,to:7,baseOffset:2,depth:5,support,points:[{u:-5,v:-4},{u:5,v:-4},{u:5,v:4},{u:-5,v:4}]}}],
  });
}

test("core rebuild moves a local sketch and its pad with an arbitrary support face", () => {
  const first=rebuildDefinition(supportedDefinition(30),{},{now:10});
  const second=rebuildDefinition(supportedDefinition(52),{},{now:10});
  assert.equal(first.ok,true,JSON.stringify(first.issues));
  assert.equal(second.ok,true,JSON.stringify(second.issues));
  const supportEnd=second.topology.find((item)=>item.persistentId==="body:face:end").descriptor;
  const padStart=second.results.get("pad").topology.find((item)=>item.persistentId==="pad:face:start").descriptor.origin;
  const padEnd=second.results.get("pad").topology.find((item)=>item.persistentId==="pad:face:end").descriptor.origin;
  const expectedStart={x:supportEnd.origin.x+supportEnd.normal.x*2,y:supportEnd.origin.y+supportEnd.normal.y*2,z:supportEnd.origin.z+supportEnd.normal.z*2};
  const expectedEnd={x:supportEnd.origin.x+supportEnd.normal.x*7,y:supportEnd.origin.y+supportEnd.normal.y*7,z:supportEnd.origin.z+supportEnd.normal.z*7};
  for (const key of ["x","y","z"]) {close(padStart[key],expectedStart[key]);close(padEnd[key],expectedEnd[key]);close(second.solvedSketches[0].frame.origin[key],expectedStart[key]);}
});

test("exact regeneration extrudes a face-supported pad along an arbitrary normal", async () => {
  const definition=supportedDefinition(35), exact={features:[]};
  definition.features.forEach((feature)=>addFeature(exact,feature));
  const run=await regenerateFeatures(exact);
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    assert.equal(run.topologyBindings.some((binding)=>binding.reference.persistentId==="body:face:end" && binding.status==="exact"),true);
    const supportEnd=run.results.get("body").topology.find((item)=>item.persistentId==="body:face:end").descriptor;
    const padEnd=run.results.get("pad").topology.find((item)=>item.persistentId==="pad:face:end").descriptor;
    const along=(padEnd.origin.x-supportEnd.origin.x)*supportEnd.normal.x+(padEnd.origin.y-supportEnd.origin.y)*supportEnd.normal.y+(padEnd.origin.z-supportEnd.origin.z)*supportEnd.normal.z;
    close(along,7,1e-3);
  } finally { releaseRegeneration(run); }
});

test("a local supported sketch without a complete frame blocks rebuild", () => {
  const definition=supportedDefinition();
  definition.sketches[0].frame={origin:{x:0,y:0,z:0}};
  const run=rebuildDefinition(definition,{},{now:11});
  assert.equal(run.ok,false);
  assert.ok(run.issues.some((issue)=>issue.code==="invalid-sketch-frame"));
});
