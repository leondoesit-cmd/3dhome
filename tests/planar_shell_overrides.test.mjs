import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepPrimitive, makeBrepExtrusion, chamferBrep, placeBrep, extractBrepTopology, shellBrep, shapeMassProperties, brepContainsPoint, disposeBrep} from '../js/cad_kernel.js';
import {shellFaceThicknesses, shellSupportingPlane} from '../js/core/planar_shell_overrides.js';
import {addFeature,regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {createTopologyReference,topologyForFeature} from '../js/core/topology.js';

test('planar thickness overrides reject ambiguous or unsupported specifications',()=>{
  assert.deepEqual(shellFaceThicknesses(null,1),[]);
  for(const rows of [[{facePersistentId:'a',thickness:.5}],[{facePersistentId:'a',thickness:2},{facePersistentId:'a',thickness:3}]]) assert.throws(()=>shellFaceThicknesses(rows,1));
  assert.throws(()=>shellFaceThicknesses([{facePersistentId:'a',thickness:2}],1,'outside'),/inward/);
  assert.throws(()=>shellSupportingPlane({surface:'cylinder'},[],2),/planar/);
  assert.throws(()=>shellSupportingPlane({surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}},[{x:1,y:0,z:0}],2),/supporting/);
});

test('nonconvex C profile retains its front void with 10/25/25 planar walls',async()=>{
  const points=[[0,-7.5],[10,-7.5],[10,-6.5],[7,-5],[7,5],[10,6.5],[10,7.5],[0,7.5]].map(([u,v])=>({u,v}));
  const base=await makeBrepExtrusion({axis:'z',from:-5,to:5,points}); let stock, result;
  try{
    const edges=extractBrepTopology(base,{ownerFeatureId:'raw'}).topology.filter(t=>t.kind==='edge' && t.descriptor.curve==='line' && t.descriptor.endpoints?.length===2 && Math.abs(t.descriptor.endpoints[0].x-t.descriptor.endpoints[1].x)>9.9 && t.descriptor.endpoints.every(p=>Math.abs(Math.abs(p.y)-7.5)<1e-6 && Math.abs(Math.abs(p.z)-5)<1e-6));
    assert.equal(edges.length,4,'the four outer longitudinal source edges');
    stock=await chamferBrep(base,1,{edgePersistentIds:edges.map(t=>t.persistentId)});
    const faces=extractBrepTopology(stock,{ownerFeatureId:'c-stock'}).topology.filter(t=>t.kind==='face');
    const opening=faces.find(t=>Math.abs(t.descriptor.origin.x-7)<1e-6&&t.descriptor.normal.x>.99);
    const walls=faces.filter(t=>Math.abs(t.descriptor.normal.y)>.99);
    assert.equal(walls.length,2);assert.ok(opening);
    result=await shellBrep(stock,1,{facePersistentIds:faces.filter(t=>t.descriptor.normal.x>.1).map(t=>t.persistentId),join:'intersection',faceThicknesses:walls.map(t=>({facePersistentId:t.persistentId,thickness:2.5}))});
    for(const p of [{x:8,y:0,z:0},{x:6,y:0,z:0},{x:2,y:4.9,z:0}]) assert.equal(brepContainsPoint(result,p),false,JSON.stringify(p));
    for(const p of [{x:.5,y:0,z:0},{x:2,y:5.1,z:0},{x:2,y:-5.1,z:0},{x:2,y:0,z:4.5}]) assert.equal(brepContainsPoint(result,p),true,JSON.stringify(p));
    assert.equal(result.approximate,undefined);
    const sourceMass=await shapeMassProperties(stock), wallMass=await shapeMassProperties(result);
    assert.deepEqual(wallMass.bounds,sourceMass.bounds);
    // Source polygon 115.5cm² ×10cm minus four .5cm² ×10cm
    // chamfers; bounded cavity is 6×10×8cm, without the C mouth.
    assert.ok(Math.abs(sourceMass.volume-1135)<1e-6,`${sourceMass.volume}`);
    assert.ok(Math.abs(wallMass.volume-655)<1e-6,`${wallMass.volume}`);
    const concave=faces.find(t=>t.descriptor.normal.y>0&&Math.abs(t.descriptor.normal.x)>0.1);
    assert.ok(concave);
    await assert.rejects(shellBrep(stock,1,{facePersistentIds:[opening.persistentId],faceThicknesses:[{facePersistentId:concave.persistentId,thickness:2}]}),/supporting/);
  }finally{if(result)disposeBrep(result);if(stock)disposeBrep(stock);disposeBrep(base);}
});

test('native inward shell keeps opening, exact bounds and independently thicker retained walls',async()=>{
  const source=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:10,h:15,d:10}); let result;
  try {
    const faces=extractBrepTopology(source,{ownerFeatureId:'stock'}).topology.filter(t=>t.kind==='face');
    const byNormal=(axis,sign)=>faces.find(t=>t.descriptor.normal[axis]*sign>.99);
    const opening=byNormal('x',1), top=byNormal('y',1), bottom=byNormal('y',-1);
    result=await shellBrep(source,1,{facePersistentIds:[opening.persistentId],faceThicknesses:[{facePersistentId:top.persistentId,thickness:2.5},{facePersistentId:bottom.persistentId,thickness:2.5}]});
    const mass=await shapeMassProperties(result);
    assert.ok(Math.abs(mass.volume-(1500-9*10*8))<1e-6,`${mass.volume}`);
    assert.deepEqual(mass.bounds,{min:{x:0,y:0,z:0},max:{x:10,y:15,z:10}});
    for(const point of [{x:5,y:2,z:5},{x:5,y:13,z:5},{x:.5,y:7,z:5},{x:5,y:7,z:.5}]) assert.equal(brepContainsPoint(result,point),true);
    for(const point of [{x:5,y:3,z:5},{x:9.5,y:7,z:5}]) assert.equal(brepContainsPoint(result,point),false);
    await assert.rejects(shellBrep(source,1,{facePersistentIds:[opening.persistentId],faceThicknesses:[{facePersistentId:opening.persistentId,thickness:2}]}),/opening/);
    await assert.rejects(shellBrep(source,1,{facePersistentIds:[opening.persistentId],faceThicknesses:[{facePersistentId:top.persistentId,thickness:15}]}),/consumes|cavity/);
    assert.ok(Math.abs((await shapeMassProperties(source)).volume-1500)<1e-6,'source unchanged after valid and rejected builds');
  } finally {if(result)disposeBrep(result);disposeBrep(source);}
});

test('saved feature parameters preserve retained wall overrides through cold regeneration and reject lost faces',async()=>{
  const body={id:'body',type:'box',params:{x:0,y:0,z:0,w:10,h:15,d:10}}, topology=topologyForFeature(body,body.params);
  const opening=topology.find(t=>t.persistentId==='body:face:front');
  assert.ok(opening);
  const definition={features:[]};addFeature(definition,body);
  addFeature(definition,{id:'shell',type:'shell',inputs:['body'],params:{thickness:1,targets:[createTopologyReference(opening.ownerFeatureId,opening.kind,opening.persistentId,opening.descriptor)],faceThicknesses:[{facePersistentId:'body:face:top',thickness:2.5},{facePersistentId:'body:face:bottom',thickness:2.5}]}});
  const copy=JSON.parse(JSON.stringify(definition)),run=await regenerateFeatures(copy);
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    const mass=await shapeMassProperties(run.finalShape);
    assert.ok(Math.abs(mass.volume-780)<1e-6,`${mass.volume}`);
    copy.features[1].params.faceThicknesses[0].facePersistentId='missing-face';
    const rejected=await regenerateFeatures(copy);
    try{assert.equal(rejected.ok,false);assert.match(JSON.stringify(rejected.issues),/resolved/);}finally{releaseRegeneration(rejected);}
    assert.equal(definition.features[1].params.faceThicknesses[0].facePersistentId,'body:face:top');
  }finally{releaseRegeneration(run);}
});

test('supporting wall offsets follow rotated native face planes rather than world axes',async()=>{
  const base=await makeBrepPrimitive({type:'box',x:0,y:0,z:0,w:10,h:15,d:10}),c=Math.sqrt(3)/2,s=.5;
  let source,result;
  try{
    source=await placeBrep(base,{matrix:[c,-s,0,s,c,0,0,0,1],translation:{x:12,y:-8,z:5}});
    const faces=extractBrepTopology(source,{ownerFeatureId:'rotated'}).topology.filter(t=>t.kind==='face');
    const opening=faces.find(t=>t.descriptor.normal.x*c+t.descriptor.normal.y*s>.99);
    const walls=faces.filter(t=>Math.abs(-t.descriptor.normal.x*s+t.descriptor.normal.y*c)>.99);
    assert.ok(opening);assert.equal(walls.length,2);
    result=await shellBrep(source,1,{facePersistentIds:[opening.persistentId],faceThicknesses:walls.map(t=>({facePersistentId:t.persistentId,thickness:2.5}))});
    assert.ok(Math.abs((await shapeMassProperties(result)).volume-780)<1e-6);
    const point=(x,y,z)=>({x:12+c*x-s*y,y:-8+s*x+c*y,z:5+z});
    assert.equal(brepContainsPoint(result,point(5,2,5)),true);
    assert.equal(brepContainsPoint(result,point(5,3,5)),false);
    assert.equal(brepContainsPoint(result,point(9.5,7,5)),false);
  }finally{if(result)disposeBrep(result);if(source)disposeBrep(source);disposeBrep(base);}
});


