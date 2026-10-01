import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOffsetPlanes,resolveOffsetSketch,offsetPlaneOwners} from '../js/core/offset_planes.js';
const fixture=()=>({references:[{id:'top',type:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}},
  {id:'inclined',type:'plane',refType:'angle',baseReferenceId:'top',angle:48,angleDirection:{x:1,y:0,z:0},angleOrigin:{x:0,y:0,z:5.08}}],
  referenceGeometry:[{id:'inclined'}],sketches:[{id:'circle',referenceId:'inclined'}]});
test('Q5 driving angle remains live through serialization and moves attached sketch frame',()=>{
  const doc=fixture();assert.equal(resolveOffsetPlanes(doc).ok,true);
  for(const angle of [48,50]) {
    const saved=JSON.parse(JSON.stringify(doc));saved.references[1].angle=angle;
    assert.equal(resolveOffsetPlanes(saved).ok,true);
    const frame=saved.sketches[0].frame;
    assert.deepEqual(frame.origin,{x:0,y:0,z:5.08});
    assert.ok(Math.abs(frame.normal.y-Math.cos(angle*Math.PI/180))<1e-12);
    assert.ok(Math.abs(frame.normal.z-Math.sin(angle*Math.PI/180))<1e-12);
    assert.ok(Math.abs(frame.yAxis.y-Math.sin(angle*Math.PI/180))<1e-12);
    assert.ok(Math.abs(frame.yAxis.z+Math.cos(angle*Math.PI/180))<1e-12);
    assert.ok(Math.abs(frame.yAxis.y*frame.normal.y+frame.yAxis.z*frame.normal.z)<1e-12);
    assert.equal(saved.referenceGeometry[0].angle,angle);
    assert.deepEqual(resolveOffsetSketch(saved.sketches[0],saved.references,()=>null).frame.normal,frame.normal);
  }
});
test('picked rotation edge follows rebuilt topology and contributes ownership',()=>{
  const doc=fixture();doc.references[1].angleAxis={kind:'edge',ownerFeatureId:'base',persistentId:'front',descriptor:{endpoints:[{x:0,y:0,z:5.08},{x:3,y:0,z:5.08}]}};
  assert.equal(resolveOffsetPlanes(doc,()=>({descriptor:{endpoints:[{x:0,y:0,z:6},{x:4,y:0,z:6}]}})).ok,true);
  assert.equal(doc.sketches[0].frame.origin.z,6);
  assert.deepEqual(offsetPlaneOwners('inclined',doc.references),['base']);
});
test('axis outside or normal to parent plane rejects without mutating document',()=>{
  for(const change of [{angleDirection:{x:0,y:1,z:0}},{angleOrigin:{x:0,y:1,z:0}}]) {
    const doc=fixture();Object.assign(doc.references[1],change);const before=JSON.stringify(doc);
    assert.equal(resolveOffsetPlanes(doc).ok,false);assert.equal(JSON.stringify(doc),before);
  }
});
