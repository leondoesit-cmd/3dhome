import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepExtrusion,extractBrepTopology,filletBrep,disposeBrep} from '../js/cad_kernel.js';
import {offsetFaceBoundary,appendBoundarySketch} from '../js/cad_face_offset.js';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {frameFromPlane} from '../js/core/frame.js';
import {solveSketch} from '../js/sketch_solver.js';
import {sketchProfileSegments} from '../js/core/profile_curves.js';
import {toolFeatureRecipe,translateToolRecord} from '../js/core/tool_recipe.js';
import {edgeLiesOnFace} from '../js/core/topology.js';

test('rim face selection excludes edges on a shallow pocket floor',()=>{
 const face={descriptor:{surface:'plane',origin:{x:0,y:10.414,z:0},normal:{x:0,y:1,z:0},measure:4}};
 const edge=y=>({descriptor:{curve:'circle',origin:{x:0,y,z:0},axis:{x:0,y:1,z:0},radius:.889}});
 assert.equal(edgeLiesOnFace(edge(10.414),face),true);
 assert.equal(edgeLiesOnFace(edge(9.906),face),false);
});

test('a frozen arc with unequal endpoint radii remains invalid',()=>{
 const sketch={points:[{id:'c',x:0,y:0,fixed:true},{id:'a',x:1,y:0,fixed:true},{id:'b',x:0,y:2,fixed:true}],entities:[{id:'arc',type:'arc',c:'c',a:'a',b:'b'}],constraints:[]};
 assert.equal(solveSketch(sketch).status,'conflicting');
});

test('battery face inset retains four true lines and four true arcs',async()=>{
 let base,rounded;
 try{
  base=await makeBrepExtrusion({points:[{u:-3.429,v:-3.429},{u:3.429,v:-3.429},{u:3.429,v:3.429},{u:-3.429,v:3.429}],from:0,to:10.414,axis:'y'});
  extractBrepTopology(base);
  const edges=base.topology.filter(e=>e.kind==='edge'&&Math.abs(e.descriptor.axis.y)>.99).map(e=>e.persistentId);
  rounded=await filletBrep(base,1.27,{edgePersistentIds:edges});
  extractBrepTopology(rounded);
  const face=rounded.topology.find(e=>e.kind==='face'&&e.descriptor.surface==='plane'&&e.descriptor.origin.y>10);
  const frame=frameFromPlane({x:0,y:10.414,z:0},{x:0,y:1,z:0});
  const loops=offsetFaceBoundary(rounded,face,frame,-.381);
  assert.equal(loops.length,1);
  assert.equal(loops[0].filter(s=>s.type==='line').length,4);
  assert.equal(loops[0].filter(s=>s.type==='arc').length,4);
  assert.ok(loops[0].filter(s=>s.type==='arc').every(s=>Math.abs(s.radius-.889)<1e-6));
  let n=0;const sketch={points:[],entities:[],constraints:[]};
  appendBoundarySketch(sketch,loops,()=>`p${++n}`);
  assert.equal(solveSketch(sketch).status,'fully-constrained');
  assert.equal(analyzeSketchProfiles(sketch).profiles.length,1);
  const segments=sketchProfileSegments(sketch,sketch.entities.map(e=>e.id));
  const record={axis:'y',from:9.906,to:10.414,loop:analyzeSketchProfiles(sketch).profiles[0].points,segments};
  const recipe=toolFeatureRecipe(record);
  const cutter=await makeBrepExtrusion(recipe.params);
  try {
    extractBrepTopology(cutter);
    assert.equal(cutter.topology.filter(e=>e.kind==='face').length,10);
    assert.equal(cutter.topology.filter(e=>e.kind==='face'&&e.descriptor.surface==='cylinder').length,4);
  } finally {disposeBrep(cutter);}
  const original=structuredClone(record.segments);
  translateToolRecord(record,2,3,4);
  assert.equal(record.segments[0].from.u,original[0].from.u+2);
  assert.equal(record.segments[0].from.v,original[0].from.v+4);
  assert.equal(record.from,12.906);
 }finally{disposeBrep(rounded);disposeBrep(base);}
});
