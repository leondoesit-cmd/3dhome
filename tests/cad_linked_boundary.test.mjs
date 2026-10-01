import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepExtrusion,extractBrepTopology,filletBrep,booleanBrep,shapeMassProperties,disposeBrep} from '../js/cad_kernel.js';
import {offsetFaceBoundary,appendBoundarySketch} from '../js/cad_face_offset.js';
import {resolveAssociativeBoundary} from '../js/cad_associative_boundary.js';
import {frameFromPlane} from '../js/core/frame.js';
import {segmentProfilePoints} from '../js/core/profile_curves.js';

test('a plate with a through hole keeps outer and inner loops on a linked inset',async()=>{
 const plate=await makeBrepExtrusion({
  points:[{u:-6,v:-5},{u:6,v:-5},{u:6,v:5},{u:-6,v:5}],
  holes:[[{u:-2,v:-1.5},{u:2,v:-1.5},{u:2,v:1.5},{u:-2,v:1.5}]],
  from:0,to:1,axis:'y',
 });
 try{
  extractBrepTopology(plate);
  const face=plate.topology.find(t=>t.kind==='face'&&t.descriptor.surface==='plane'&&t.descriptor.origin.y>0.5);
  const frame=frameFromPlane({x:0,y:1,z:0},{x:0,y:1,z:0});
  const source={...face,ownerFeatureId:'plate'};
  const loops=offsetFaceBoundary(plate,source,frame,-0.3);
  assert.equal(loops.length,2,JSON.stringify(loops.map(loop=>loop.length)));
  const sketch={id:'inset',frame,points:[],entities:[],constraints:[]};let id=0;
  appendBoundarySketch(sketch,loops,()=>String(++id));
  const entityIds=sketch.entities.map(e=>e.id);
  sketch.boundaryCopies=[{source,distance:-0.3,entityIds,associative:true,loopCount:2}];
  const resolved=resolveAssociativeBoundary(sketch,{profileEntityIds:entityIds,axis:'frame',frame,from:0,to:-0.4},new Map([['plate',plate]]));
  assert.ok(resolved);
  assert.equal(resolved.params.holes.length,1);
  assert.ok(resolved.params.points.length>=4);
  assert.equal(resolved.sketch.boundaryCopies[0].loopCount,2);
  // A second exact rebuild reuses the generated IDs. It must replace those
  // points rather than append another set with the same IDs each time.
  const params={...resolved.params,profileEntityIds:resolved.newEntityIds};
  const again=resolveAssociativeBoundary(resolved.sketch,params,new Map([['plate',plate]]));
  assert.equal(again.sketch.points.length,resolved.sketch.points.length);
  assert.equal(new Set(again.sketch.points.map(p=>p.id)).size,again.sketch.points.length);
  assert.deepEqual(again.sketch.points,resolved.sketch.points);
  assert.deepEqual(again.sketch.entities,resolved.sketch.entities);
 }finally{disposeBrep(plate);}
});

test('linked inset preserves exact offset curves after draft and permits the plate full round',async()=>{
 const shapes=[],keep=shape=>(shapes.push(shape),shape);
 try{
  const points=[{u:-3.429,v:-3.429},{u:3.429,v:-3.429},{u:3.429,v:3.429},{u:-3.429,v:3.429}];
  const base=keep(await makeBrepExtrusion({points,axis:'y',from:0,to:1.016,draftAngle:3}));extractBrepTopology(base);
  const vertical=base.topology.filter(t=>t.kind==='edge'&&Math.abs(t.descriptor.axis?.y)>.99).map(t=>t.persistentId);
  const rounded=keep(await filletBrep(base,1.27,{edgePersistentIds:vertical}));extractBrepTopology(rounded,{ownerFeatureId:'rounded'});
  const face=rounded.topology.find(t=>t.kind==='face'&&t.descriptor.normal?.y>.99&&t.descriptor.origin.y>1);
  const frame=frameFromPlane({x:0,y:1.016,z:0},{x:0,y:1,z:0});
  const source={...face,ownerFeatureId:'rounded'};
  const loops=offsetFaceBoundary(rounded,source,frame,-.381);
  assert.ok(loops[0].some(segment=>segment.type==='kernelCurve'));
  const sketch={id:'inset',frame,points:[],entities:[],constraints:[]};let id=0;
  appendBoundarySketch(sketch,loops,()=>String(++id));
  const entityIds=sketch.entities.map(e=>e.id);
  sketch.boundaryCopies=[{source,distance:-.381,entityIds,associative:true}];
  const resolved=resolveAssociativeBoundary(sketch,{profileEntityIds:entityIds,axis:'frame',frame,from:0,to:-.508},new Map([['rounded',rounded]]));
  assert.ok(resolved);
  const cutter=keep(await makeBrepExtrusion(resolved.params));
  // Independently extrude the offset wire from OCCT, without serialization.
  const oc=rounded.oc,offset=new oc.BRepOffsetAPI_MakeOffset_2(rounded.subshapes.get(face.persistentId).shape,oc.GeomAbs_JoinType.GeomAbs_Arc,false);
  let wireShape,explorer,wire,maker,vector,prism,native;
  try{
   offset.Perform(-.381,0);wireShape=offset.Shape();explorer=new oc.TopExp_Explorer_2(wireShape,oc.TopAbs_ShapeEnum.TopAbs_WIRE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
   wire=oc.TopoDS.Wire_1(explorer.Current());maker=new oc.BRepBuilderAPI_MakeFace_15(wire,true);vector=new oc.gp_Vec_4(0,-.508,0);prism=new oc.BRepPrimAPI_MakePrism_1(maker.Face(),vector,true,true);native={oc,shape:prism.Shape()};
   assert.ok(Math.abs((await shapeMassProperties(cutter)).volume-(await shapeMassProperties(native)).volume)<1e-6);
  }finally{if(native)disposeBrep(native);prism?.delete();vector?.delete();maker?.delete();wire?.delete();explorer?.delete();wireShape?.delete();offset.delete();}
  const plate=keep(await booleanBrep('subtract',rounded,cutter));extractBrepTopology(plate);
  const outside=plate.topology.find(t=>t.kind==='face'&&t.descriptor.normal?.x>.99);
  const inside=plate.topology.find(t=>t.kind==='face'&&t.descriptor.normal?.x<-.99&&t.descriptor.origin.x>0);
  const top=plate.topology.find(t=>t.kind==='face'&&t.descriptor.normal?.y>.99&&t.descriptor.origin.y>1);
  const finished=keep(await filletBrep(plate,1,{fullRound:true,facePersistentIds:[outside,top,inside].map(t=>t.persistentId)}));
  assert.ok((await shapeMassProperties(finished)).volume<(await shapeMassProperties(plate)).volume);
  assert.ok(segmentProfilePoints(loops[0]).length>100);
 }finally{shapes.reverse().forEach(disposeBrep);}
});

test('linked inset rebases a stale face owner onto the filleted body head',async()=>{
 const shapes=[],keep=shape=>(shapes.push(shape),shape);
 try{
  const points=[{u:-3.429,v:-3.429},{u:3.429,v:-3.429},{u:3.429,v:3.429},{u:-3.429,v:3.429}];
  const base=keep(await makeBrepExtrusion({points,axis:'y',from:0,to:1.016}));
  extractBrepTopology(base,{ownerFeatureId:'base'});
  const baseFace=base.topology.find(t=>t.kind==='face'&&t.descriptor.normal?.y>.99);
  const vertical=base.topology.filter(t=>t.kind==='edge'&&Math.abs(t.descriptor.axis?.y)>.99).map(t=>t.persistentId);
  const rounded=keep(await filletBrep(base,1.27,{edgePersistentIds:vertical}));
  extractBrepTopology(rounded,{ownerFeatureId:'fillet',expectedTopology:base.topology});
  const roundedFace=rounded.topology.find(t=>t.kind==='face'&&t.descriptor.normal?.y>.99&&t.descriptor.origin.y>1);
  const frame=frameFromPlane({x:0,y:1.016,z:0},{x:0,y:1,z:0});
  const currentSource={...roundedFace,ownerFeatureId:'fillet'};
  const loops=offsetFaceBoundary(rounded,currentSource,frame,-.381);
  assert.equal(loops[0].filter(segment=>segment.type==='arc').length,4);
  assert.ok(loops[0].filter(segment=>segment.type==='arc').every(segment=>Math.abs(segment.radius-.889)<1e-6));

  const sketch={id:'inset',frame,points:[],entities:[],constraints:[]};let id=0;
  appendBoundarySketch(sketch,loops,()=>String(++id));
  const entityIds=sketch.entities.map(entity=>entity.id);
  // This is the metadata written by older releases: the face descriptor is
  // post-fillet, but its owner still names the pre-fillet base extrusion.
  const staleSource={...baseFace,descriptor:structuredClone(roundedFace.descriptor),ownerFeatureId:'base'};
  sketch.boundaryCopies=[{source:staleSource,distance:-.381,entityIds,associative:true}];
  const resolved=resolveAssociativeBoundary(sketch,{
   profileEntityIds:entityIds,axis:'frame',frame,from:0,to:-.508,targetFeatureId:'fillet',
  },new Map([['base',base],['fillet',rounded]]));

  assert.ok(resolved);
  assert.equal(resolved.params.segments.filter(segment=>segment.type==='arc').length,4);
  assert.ok(resolved.params.segments.filter(segment=>segment.type==='arc').every(segment=>Math.abs(segment.radius-.889)<1e-6));
  assert.equal(resolved.sketch.boundaryCopies[0].source.ownerFeatureId,'fillet');
 }finally{shapes.reverse().forEach(disposeBrep);}
});
