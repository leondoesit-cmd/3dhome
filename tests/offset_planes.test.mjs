import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOffsetPlanes, resolveOffsetSketch, offsetPlaneOwners, throughVertexBinding, throughVertexPoint} from '../js/core/offset_planes.js';
import {topologyForFeature} from '../js/core/topology.js';

function fixture(){return {references:[{id:'top',type:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}},{id:'p1',type:'plane',baseReferenceId:'top',offset:1.27},{id:'p2',type:'plane',baseReferenceId:'p1',offset:1.27}],sketches:[{id:'middle',referenceId:'p1'},{id:'upper',referenceId:'p2'}]};}
test('reparenting a face offset synchronizes its geometry twin',()=>{
 const support={persistentId:'base:start',descriptor:{surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:-1}}};
 const doc={references:[{id:'loft',type:'plane',support,offset:3.302}],referenceGeometry:[{id:'loft',type:'reference_plane',support:{persistentId:'base:end'}}],sketches:[{id:'square',referenceId:'loft'}]};
 assert.equal(resolveOffsetPlanes(doc).ok,true);
 assert.equal(doc.sketches[0].frame.origin.z,-3.302);
 assert.equal(doc.referenceGeometry[0].support.persistentId,'base:start');
 assert.equal(doc.referenceGeometry[0].origin.z,-3.302);
 doc.references[0].baseReferenceId='principal';delete doc.references[0].support;
 doc.references.push({id:'principal',type:'plane',origin:{x:0,y:0,z:1},normal:{x:0,y:0,z:1}});
 assert.equal(resolveOffsetPlanes(doc).ok,true);
 assert.equal(doc.referenceGeometry[0].support,undefined);
});
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

test('a through-vertex plane stays parallel to the parent and sits on the vertex',()=>{
 const doc={
  references:[
   {id:'right',type:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}},
   {id:'longrib',type:'plane',baseReferenceId:'right',refType:'through-vertex-parallel',
    throughVertex:{ownerFeatureId:'handle',descriptor:{point:{x:5,y:1,z:2}}}},
  ],
  sketches:[{id:'s',referenceId:'longrib'}],
 };
 assert.equal(resolveOffsetPlanes(doc).ok,true);
 assert.ok(Math.abs(doc.sketches[0].frame.origin.x-5)<1e-9);
 assert.ok(Math.abs(doc.sketches[0].frame.origin.y)<1e-9);
 assert.deepEqual(doc.sketches[0].frame.normal,{x:1,y:0,z:0});
 assert.deepEqual(offsetPlaneOwners('longrib',doc.references),['handle']);
 doc.references[1].throughVertex.descriptor.point.x=8;
 assert.equal(resolveOffsetPlanes(doc).ok,true);
 assert.ok(Math.abs(doc.sketches[0].frame.origin.x-8)<1e-9);
});

test('a missing through-vertex leaves geometry untouched',()=>{
 const doc={
  references:[
   {id:'right',type:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}},
   {id:'longrib',type:'plane',baseReferenceId:'right',refType:'through-vertex-parallel'},
  ],
  sketches:[{id:'s',referenceId:'longrib'}],
 };
 const before=JSON.stringify(doc);
 assert.equal(resolveOffsetPlanes(doc).ok,false);
 assert.equal(JSON.stringify(doc),before);
});

test('through-vertex binding stores the two edges that meet at a box corner',()=>{
 const box={id:'box',type:'box',params:{x:0,y:0,z:0,w:10,h:4,d:6}};
 const entries=topologyForFeature(box,box.params);
 const vertex={kind:'vertex',ownerFeatureId:'box',descriptor:{point:{x:10,y:4,z:6}}};
 const binding=throughVertexBinding(vertex,entries);
 assert.ok(binding);
 assert.equal(binding.throughEdges.length,2);
 assert.ok(binding.throughEdges.every((edge)=>edge.ownerFeatureId==='box' && edge.kind==='edge'));
 const plane={throughEdges:binding.throughEdges};
 assert.deepEqual(throughVertexPoint(plane),{x:10,y:4,z:6});
 assert.deepEqual(offsetPlaneOwners('longrib',[
  {id:'longrib',type:'plane',baseReferenceId:'plane:right',throughEdges:binding.throughEdges},
 ]),['box']);
});

test('a through-vertex plane follows live rebuilt edges when a resolver is passed',()=>{
 const doc={
  references:[
   {id:'right',type:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}},
   {id:'longrib',type:'plane',baseReferenceId:'right',refType:'through-vertex-parallel',
    throughVertex:{ownerFeatureId:'box',descriptor:{point:{x:5,y:1,z:2}}},
    throughEdges:[
     {ownerFeatureId:'box',persistentId:'e1',kind:'edge'},
     {ownerFeatureId:'box',persistentId:'e2',kind:'edge'},
    ]},
  ],
  sketches:[{id:'s',referenceId:'longrib'}],
 };
 const live={
  e1:{kind:'edge',descriptor:{endpoints:[{x:12,y:0,z:0},{x:12,y:4,z:0}]}},
  e2:{kind:'edge',descriptor:{endpoints:[{x:12,y:4,z:0},{x:12,y:4,z:6}]}},
 };
 assert.equal(resolveOffsetPlanes(doc,(ref)=>live[ref.persistentId]).ok,true);
 assert.ok(Math.abs(doc.sketches[0].frame.origin.x-12)<1e-9);
});

test('resolveOffsetSketch does not rewrite the saved plane origin',()=>{
 const support={ownerFeatureId:'shell',persistentId:'rear',descriptor:{surface:'plane',origin:{x:0,y:0,z:-4.3815},normal:{x:0,y:0,z:-1}}};
 const plane={id:'thread',type:'plane',support,offset:-1.143,origin:{x:0,y:0,z:-3.2385},normal:{x:0,y:0,z:-1}};
 const before=JSON.stringify(plane);
 const moved=resolveOffsetSketch({id:'profile',referenceId:'thread'},[plane],()=>({descriptor:{...support.descriptor,origin:{x:0,y:0,z:-5}}}));
 assert.equal(moved.frame.origin.z,-3.857);
 assert.equal(JSON.stringify(plane),before);
});
