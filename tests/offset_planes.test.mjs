import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOffsetPlanes} from '../js/core/offset_planes.js';
function fixture(){return {references:[{id:'top',type:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}},{id:'p1',type:'plane',baseReferenceId:'top',offset:1.27},{id:'p2',type:'plane',baseReferenceId:'p1',offset:1.27}],sketches:[{id:'middle',referenceId:'p1'},{id:'upper',referenceId:'p2'}]};}
test('dependent offset planes move attached sketches after parent edits and serialization',()=>{
 let doc=fixture();assert.equal(resolveOffsetPlanes(doc).ok,true);assert.equal(doc.sketches[1].frame.origin.y,2.54);
 doc=JSON.parse(JSON.stringify(doc));doc.references[1].offset=.3175;assert.equal(resolveOffsetPlanes(doc).ok,true);
 assert.equal(doc.sketches[0].frame.origin.y,.3175);assert.equal(doc.sketches[1].frame.origin.y,1.5875);
 assert.deepEqual(doc.sketches[1].frame.normal,{x:0,y:1,z:0});
});
test('invalid plane dependencies leave all geometry untouched',()=>{
 for(const parent of ['p2','missing']){const doc=fixture();doc.references[1].baseReferenceId=parent;const before=JSON.stringify(doc);assert.equal(resolveOffsetPlanes(doc).ok,false);assert.equal(JSON.stringify(doc),before);}
});

test('face offset planes and their children follow rebuilt supporting faces',async()=>{
 const {resolveOffsetSketch,offsetPlaneOwners}=await import('../js/core/offset_planes.js');
 const support={ownerFeatureId:'shell',persistentId:'rear',descriptor:{surface:'plane',origin:{x:0,y:0,z:-4.3815},normal:{x:0,y:0,z:-1}}};
 const doc={references:[{id:'thread',type:'plane',support,offset:-1.143}],sketches:[{id:'profile',referenceId:'thread'}]};
 assert.equal(resolveOffsetPlanes(doc).ok,true);assert.ok(Math.abs(doc.sketches[0].frame.origin.z+3.2385)<1e-9);
 const moved=resolveOffsetSketch(doc.sketches[0],doc.references,()=>({descriptor:{...support.descriptor,origin:{x:0,y:0,z:-5}}}));
 assert.equal(moved.frame.origin.z,-3.857);
 assert.deepEqual(offsetPlaneOwners('thread',doc.references),['shell']);
 assert.throws(()=>resolveOffsetSketch(doc.sketches[0],doc.references,()=>null),/unavailable/);
});
