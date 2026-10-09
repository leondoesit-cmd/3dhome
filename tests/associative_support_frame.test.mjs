import test from 'node:test';
import assert from 'node:assert/strict';
import {alignExtrusionToSupport,resolveSketchExtrusion} from '../js/cad_feature_tree.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
const sketch={id:'s',frame:{origin:{x:.25,y:2,z:2},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}},points:[{id:'a',x:0,y:0},{id:'b',x:2,y:0},{id:'c',x:2,y:1},{id:'d',x:0,y:1}],entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'},{id:'cd',type:'line',a:'c',b:'d'},{id:'da',type:'line',a:'d',b:'a'}]};
const support={ownerFeatureId:'body',persistentId:'face'};
const params={sketchId:'s',profileEntityIds:['ab','bc','cd','da'],frame:sketch.frame,support,frameAnchor:'bounds-center',supportOffset:.2,depth:1};
const resolution=[{reference:support,topology:{descriptor:{origin:{x:0,y:0,z:3},normal:{x:0,y:0,z:1},bounds:{min:{x:-2,y:0,z:3},max:{x:3.7,y:4,z:3}}}}}];

test('associative source curves preserve their authored in-plane origin but follow moved support plane and offset',()=>{
  const linked={...sketch,boundaryCopies:[{associative:true,entityIds:['ab','bc','cd','gone']}]};
  const resolved=resolveSketchExtrusion({sketches:[linked]},params);
  const aligned=alignExtrusionToSupport(resolved,resolution);
  assert.equal(resolved.preserveSupportOrigin,true);
  assert.deepEqual(aligned.frame.origin,{x:.25,y:2,z:3.2});
  assert.deepEqual(aligned.points,resolved.points,'source UV coordinates are not translated a second time');
  assert.deepEqual(sketch.frame.origin,{x:.25,y:2,z:2},'input frame remains untouched');
});

test('unlinked fixed-hole or manual profiles retain bounds-relative support behavior',()=>{
  const resolved=resolveSketchExtrusion({sketches:[sketch]},params);
  assert.equal(resolved.preserveSupportOrigin,undefined);
  const origin=alignExtrusionToSupport(resolved,resolution).frame.origin;
  assert.ok(Math.abs(origin.x-.85)<1e-12);assert.equal(origin.y,2);assert.equal(origin.z,3.2);
});

test('a detached, non-associative boundary retains ordinary anchoring',()=>{
  const detached={...sketch,boundaryCopies:[{associative:false,entityIds:['ab','bc','cd']}]};
  assert.equal(resolveSketchExtrusion({sketches:[detached]},params).preserveSupportOrigin,undefined);
});

test('native cache revision covers full and trimmed associative framed copies without invalidating an unlinked profile',()=>{
  for(const ids of [['ab','bc','cd','da'],['ab','bc','cd','gone']]){
    const linked={...sketch,boundaryCopies:[{associative:true,entityIds:ids}]};
    const def={sketches:[linked],features:[{id:'body',type:'box',params:{w:5,h:5,d:5},inputs:[],references:{}},{id:'cut',type:'extrudeCut',params:{...params},inputs:['body'],references:{features:['body'],sketches:['s']}}]};
    const compiled=compileKernelFeatureTree(def),tool=compiled.features.find(f=>f.id==='cut:tool');
    assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
    assert.equal(tool.params.associativeSupportFrameRevision,'1');
    delete linked.boundaryCopies;
    assert.equal(compileKernelFeatureTree(def).features.find(f=>f.id==='cut:tool').params.associativeSupportFrameRevision,undefined);
  }
});
