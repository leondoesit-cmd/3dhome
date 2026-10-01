import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepPrimitive,extractBrepTopology,brepFaceLineIntersections,disposeBrep} from '../js/cad_kernel.js';
import {nativeSectionTarget} from '../js/core/native_section_relation.js';
import {resolveSketchRelationSources} from '../js/core/sketch_relation_sources.js';
import {sketchIntersectionOwners} from '../js/sketch_intersection.js';
import {collectNativeSections} from '../js/core/native_section_query.js';

const edge={ownerFeatureId:'stop',kind:'edge',persistentId:'stop:edge',descriptor:{curve:'line',endpoints:[{x:0,y:-8,z:3},{x:0,y:8,z:3}]}};
const sketch={id:'ribpath',plane:'side',offset:1.524,points:[{id:'endpoint',x:3,y:-1}],entities:[],constraints:[]};

test('native surface intersection uses the offset sketch plane, with explicit lower and upper branches',async()=>{
 const body=await makeBrepPrimitive({type:'cylinder',axis:'z',r:5.30225,h:6});
 try {
  const face=extractBrepTopology(body,{ownerFeatureId:'shell'}).topology.find(e=>e.kind==='face'&&e.descriptor.surface==='cylinder');
  const query=(ref,p,d)=>brepFaceLineIntersections(body,ref,p,d);
  const lower=nativeSectionTarget(sketch,edge,face,query,'lower'),upper=nativeSectionTarget(sketch,edge,face,query,'upper');
  const expected=Math.sqrt(5.30225**2-1.524**2);
  assert.ok(Math.abs(lower.x-3)<1e-8);
  assert.ok(Math.abs(lower.y+expected)<1e-6);
  assert.ok(Math.abs(upper.y-expected)<1e-6);
  assert.ok(Math.abs(lower.y+5.30225)>.2,'never use the projected circle diameter or a guessed chord');
 }finally{disposeBrep(body);}
});

test('persisted section relation follows upstream radius changes and records both dependencies',async()=>{
 const source=await makeBrepPrimitive({type:'cylinder',axis:'z',r:5,h:6});
 const edited=await makeBrepPrimitive({type:'cylinder',axis:'z',r:6,h:6});
 try {
  const original=extractBrepTopology(source,{ownerFeatureId:'shell'}).topology.find(e=>e.kind==='face'&&e.descriptor.surface==='cylinder');
  extractBrepTopology(edited,{ownerFeatureId:'shell'});
  const document=JSON.parse(JSON.stringify({sketches:[{...sketch,constraints:[{id:'relation',type:'intersection',point:'endpoint',edgeA:edge,sectionFace:original,sectionBranch:'lower',x:3,y:-1}]}]}));
  const run=body=>resolveSketchRelationSources(document,['ribpath'],()=>edge,(ref,p,d)=>brepFaceLineIntersections(body,ref,p,d));
  run(source);assert.ok(Math.abs(document.sketches[0].points[0].y+Math.sqrt(25-1.524**2))<1e-6);
  run(edited);assert.ok(Math.abs(document.sketches[0].points[0].y+Math.sqrt(36-1.524**2))<1e-6);
  assert.deepEqual(new Set(sketchIntersectionOwners(document.sketches[0])),new Set(['stop','shell']));
 }finally{disposeBrep(source);disposeBrep(edited);}
});

test('native section intersection refuses a line outside the trimmed surface',async()=>{
 const body=await makeBrepPrimitive({type:'cylinder',axis:'z',r:5,h:2});
 try {
  const face=extractBrepTopology(body,{ownerFeatureId:'shell'}).topology.find(e=>e.kind==='face'&&e.descriptor.surface==='cylinder');
  assert.throws(()=>nativeSectionTarget(sketch,edge,face,(ref,p,d)=>brepFaceLineIntersections(body,ref,p,d)),/does not meet/);
 }finally{disposeBrep(body);}
});

test('section worker wire candidates preserve upstream ownership and contain no native handles',async()=>{
 const body=await makeBrepPrimitive({type:'cylinder',axis:'z',r:5.30225,h:6});
 try {
  extractBrepTopology(body,{ownerFeatureId:'shell'});
  const candidates=collectNativeSections({features:[{id:'shell',name:'Shell 1',type:'shell'}]},
   {results:new Map([['shell',body]])},sketch,edge,brepFaceLineIntersections);
  assert.equal(candidates.length,1);
  const candidate=JSON.parse(JSON.stringify(candidates))[0];
  assert.equal(candidate.reference.ownerFeatureId,'shell');
  assert.equal(candidate.name,'Shell 1');
  assert.ok(Math.abs(candidate.lower.y+Math.sqrt(5.30225**2-1.524**2))<1e-6);
  assert.ok(Math.abs(candidate.upper.y-Math.sqrt(5.30225**2-1.524**2))<1e-6);
  assert.equal(candidate.body,undefined);assert.equal(candidate.result,undefined);
  const scoped=collectNativeSections({nativeSectionOwnerId:'shell',features:[{id:'shell',name:'Shell 1'},{id:'later',name:'Later pattern'}]},
   {results:new Map([['shell',body],['later',body]])},sketch,edge,brepFaceLineIntersections);
  assert.equal(scoped.length,1,'an owner-scoped query excludes later copies of the curved face');
  assert.equal(scoped[0].reference.ownerFeatureId,'shell');
 }finally{disposeBrep(body);}
});
