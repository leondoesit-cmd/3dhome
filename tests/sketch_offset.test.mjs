import test from 'node:test';
import assert from 'node:assert/strict';
import {setSketchOffset,sketchOffsetValue} from '../js/core/sketch_offset.js';
import {createPartDocument,createSketchDefinition,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration,alignExtrusionToSupport} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {resolveOffsetPlanes,resolveOffsetSketch} from '../js/core/offset_planes.js';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';

function rightSketch(){
  const document=createPartDocument();
  const sketch=createSketchDefinition(document,{id:'right-profile',referenceId:'plane:right',frameSpace:'local',frame:{origin:{x:0,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:1,y:0,z:0}},
    points:[{id:'a',x:-1.05,y:0,fixed:true},{id:'b',x:1.05,y:0,fixed:true},{id:'c',x:1.05,y:1.6,fixed:true},{id:'d',x:-1.05,y:1.6,fixed:true}],
    entities:[{id:'ab',type:'line',a:'a',b:'b'},{id:'bc',type:'line',a:'b',b:'c'},{id:'cd',type:'line',a:'c',b:'d'},{id:'da',type:'line',a:'d',b:'a'}],
    constraints:[]});
  sketch.plane='side';sketch.offset=0;
  return {document,sketch};
}

test('face support offset survives canonical compilation and exact support realignment independently of reverse start offset',()=>{
  const {document,sketch}=rightSketch();
  createFeatureDefinition(document,'box',{id:'body',params:{w:12,h:4,d:2}});
  const support={kind:'face',ownerFeatureId:'body',persistentId:'body:face:x39',descriptor:{surface:'plane',origin:{x:3.9,y:0,z:0},normal:{x:1,y:0,z:0}}};
  sketch.support=support;sketch.referenceId=support.persistentId;setSketchOffset(document,sketch.id,.1);
  createFeatureDefinition(document,'extrude',{id:'rib',inputs:['body'],references:{sketches:[sketch.id]},params:{sketchId:sketch.id,direction:'reverse',offset:.2,depth:.5,profileEntityIds:sketch.entities.map(entity=>entity.id)}});
  const compiled=compileKernelFeatureTree(document);assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const params=compiled.features.find(feature=>feature.type==='extrude' && feature.params.sketchId===sketch.id).params;
  assert.equal(params.supportOffset,.1);
  const aligned=alignExtrusionToSupport(params,[{reference:params.support,topology:{descriptor:support.descriptor}}]);
  assert.equal(aligned.frame.origin.x,4);assert.equal(aligned.from,-.2);assert.ok(Math.abs(aligned.to+.7)<1e-12);
  const reopened=JSON.parse(JSON.stringify(document)),again=compileKernelFeatureTree(reopened).features.find(feature=>feature.type==='extrude' && feature.params.sketchId===sketch.id).params;
  assert.equal(again.supportOffset,.1);assert.equal(alignExtrusionToSupport(again,[{reference:again.support,topology:{descriptor:support.descriptor}}]).frame.origin.x,4);
});

test('39 mm Right datum offset updates canonical frame and persists through save/reopen and exact downstream extrusion',async()=>{
  const {document,sketch}=rightSketch(),points=structuredClone(sketch.points),axes=structuredClone({x:sketch.frame.xAxis,y:sketch.frame.yAxis});
  createFeatureDefinition(document,'extrude',{id:'boss',references:{sketches:[sketch.id]},params:{depth:2,profileEntityIds:sketch.entities.map(entity=>entity.id)}});
  assert.equal(setSketchOffset(document,sketch.id,3.9),true);
  assert.equal(sketchOffsetValue(sketch),3.9);assert.equal(sketch.offset,3.9);assert.equal(sketch.frame.origin.x,3.9);
  assert.deepEqual(sketch.points,points);assert.deepEqual({x:sketch.frame.xAxis,y:sketch.frame.yAxis},axes);
  const reopened=JSON.parse(JSON.stringify(document)),lightweight=rebuildParametricDocument(reopened);
  assert.equal(lightweight.ok,true,JSON.stringify(lightweight.issues));
  const compiled=compileKernelFeatureTree(reopened),boss=compiled.features.find(f=>f.id==='boss');
  assert.equal(boss.params.frame.origin.x,3.9);assert.equal(boss.params.from,0,'the frame offset must not be applied twice');
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const mass=await shapeMassProperties(run.finalShape);
    assert.ok(Math.abs(mass.volume-6.72)<1e-7);
    assert.ok(Math.abs(mass.centerOfMass.x-4.9)<1e-7);
  }finally{releaseRegeneration(run);}
  assert.equal(sketchOffsetValue(reopened.sketches[0]),3.9);
});

test('a relative sketch offset survives associative offset-plane rebuild without accumulating',()=>{
  const document=createPartDocument();
  document.references.push({id:'plane:offset',type:'plane',baseReferenceId:'plane:front',offset:2,origin:{x:0,y:0,z:2},normal:{x:0,y:0,z:1}});
  const sketch=createSketchDefinition(document,{id:'profile',referenceId:'plane:offset',frameSpace:'local',frame:{origin:{x:0,y:0,z:2},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}}});
  setSketchOffset(document,sketch.id,.4);
  assert.equal(resolveOffsetPlanes(document).ok,true);assert.equal(sketch.frame.origin.z,2.4);
  document.references.at(-1).offset=3;
  resolveOffsetPlanes(document);resolveOffsetPlanes(document);
  assert.equal(sketch.frame.origin.z,3.4);
  assert.equal(resolveOffsetSketch(sketch,document.references).frame.origin.z,3.4);
  assert.equal(sketchOffsetValue(sketch),.4);
});

test('face offset moves the frame along its support normal and preserves support identity',()=>{
  const document=createPartDocument(),support={type:'topology-reference',persistentId:'shell:inner',ownerFeatureId:'shell',descriptor:{origin:{x:0,y:0,z:4},normal:{x:0,y:0,z:-1}}};
  const sketch=createSketchDefinition(document,{id:'face-profile',support,frameSpace:'local',frame:{origin:{x:0,y:0,z:4},xAxis:{x:-1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:-1}}});
  setSketchOffset(document,sketch.id,.8);assert.equal(sketch.frame.origin.z,3.2);
  setSketchOffset(document,sketch.id,.8);assert.equal(sketch.frame.origin.z,3.2);
  assert.equal(sketch.support.persistentId,'shell:inner');assert.equal(sketch.support.descriptor.origin.z,4);
});

test('offset edit resolves the current sketch by identity after authoring document replacement',()=>{
  const {document,sketch}=rightSketch(),replaced=JSON.parse(JSON.stringify(document));
  setSketchOffset(replaced,sketch.id,3.9);
  assert.equal(sketchOffsetValue(replaced.sketches[0]),3.9);assert.equal(sketchOffsetValue(sketch),0);
  assert.equal(setSketchOffset(replaced,sketch.id,NaN),false);
});
