import test from "node:test";
import assert from "node:assert/strict";
import { createPartDocument, createFeatureDefinition, recordSketchInHistory } from "../js/core/parametric_document.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { regenerateFeatures, releaseRegeneration, resolveSketchProfile } from "../js/cad_feature_tree.js";
import {validateFeatureDefinition} from "../js/core/feature_catalog.js";
import { computeMassProperties } from "../js/cad_interference.js";
import { makeBrepRevolve, shapeMassProperties, disposeBrep } from "../js/cad_kernel.js";
import { libraryBundle, parseLibraryBundle } from "../js/core/model_library_store.js";
import { toolFeatureRecipe, translateToolRecord } from "../js/core/tool_recipe.js";
import { axisMeridian, resolveSketchAxis, revolveBounds, revolvePoint, revolveRecipe, sketchAxisReference } from "../js/core/revolve_geometry.js";
import { movePart, mirrorProjectionPart, placePatternCopy } from "../js/modeler_part_geometry.js";
import { assertSketchAxisProfile } from "../js/core/revolve_geometry.js";
import { frameFromPlane, framePoint } from "../js/core/frame.js";

const ids=[11,"right","top","left"];
const ref=sketchAxisReference("center:1");
const close=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`Expected ${a} to equal ${b}`);

function profile(){
  const points=[[-3,30],[3,30],[3,32],[-3,32],[-1,30],[1,30]].map(([x,y],i)=>({id:"p"+i,x,y,fixed:true}));
  const entities=ids.map((id,i)=>({id,type:"line",a:"p"+i,b:"p"+((i+1)%4)}));
  entities.push({id:"center:1",type:"line",a:"p4",b:"p5",construction:true});
  return {id:"section",name:"Handle section",plane:"front",offset:4,points,entities,constraints:[]};
}

function documentWith(type,sketch,axis,profileEntityIds=ids){
  const doc=createPartDocument({name:"Faucet",key:"faucet"});
  let inputs=[];
  if(type==="revolveCut"){
    const block=createFeatureDefinition(doc,"box",{params:{x:-5,y:24,z:-1,w:10,h:12,d:10}});
    inputs=[block.id];
  }
  recordSketchInHistory(doc,sketch);
  createFeatureDefinition(doc,type,{id:"turn",inputs,references:{sketches:[sketch.id],features:inputs,references:[axis]},
    params:{sketchId:sketch.id,profileEntityIds,useSketchPlane:true,angle:360}});
  return doc;
}

async function rebuild(doc){
  const compiled=compileKernelFeatureTree(doc);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    return await shapeMassProperties(run.results.get("turn"));
  }finally{releaseRegeneration(run);}
}

test("the faucet profile turns about its lower edge after a library round trip",async()=>{
  const sketch=profile();
  sketch.points=[[-12,30.6],[12,30.6],[12,32],[6,33.5],[-6,33.5],[-12,32]]
    .map(([x,y],i)=>({id:i+1,x,y,fixed:true}));
  sketch.entities=sketch.points.map((p,i)=>({id:i+11,type:"line",a:p.id,b:sketch.points[(i+1)%6].id}));
  const doc=documentWith("revolve",sketch,sketchAxisReference(11),sketch.entities.map(e=>e.id));
  const [saved]=parseLibraryBundle(JSON.stringify(libraryBundle([doc]))).models;
  const mass=await rebuild(saved);
  // A 12 cm cylinder flanked by two 6 cm conical frustums.
  const volume=Math.PI*(12*2.9**2+4*(1.4**2+1.4*2.9+2.9**2));
  close(mass.volume,volume);
  close(mass.centerOfMass.y,30.6); close(mass.centerOfMass.z,4);
  close(mass.bounds.min.x,-12); close(mass.bounds.max.y,33.5); close(mass.bounds.min.z,1.1);
});

test("cut rebuild follows the same centerline ID through sketch edits and entity reordering",async()=>{
  const sketch=profile(),doc=documentWith("revolveCut",sketch,ref);
  close((await rebuild(doc)).volume,1200-24*Math.PI);
  sketch.entities.reverse();
  sketch.points.slice(4).forEach(p=>p.y=29);
  // Radii 1 and 3, about the edited line.
  close((await rebuild(doc)).volume,1200-48*Math.PI);
  sketch.points.slice(4).forEach(p=>p.y=31);
  await assert.rejects(rebuild(doc),/crosses the axis/);
  sketch.entities=sketch.entities.filter(e=>!e.construction);
  await assert.rejects(rebuild(doc),/axis line is missing/);
});

test("oblique partial revolve on a tilted face agrees with the preview for both sweep directions",async()=>{
  const sketch=profile();
  sketch.frameSpace="local";
  sketch.frame=frameFromPlane({x:3,y:7,z:-5},{x:1,y:2,z:3});
  // Rigidly rotate the whole sketch in its plane so the axis is diagonal.
  sketch.points.forEach(p=>{const x=p.x,y=p.y-30;p.x=8+.8*x-.6*y;p.y=5+.6*x+.8*y;});
  for(const [direction,symmetric] of [["forward",false],["reverse",false],["forward",true]]){
    if(symmetric)Object.assign(sketch.entities.at(-1),{a:"p5",b:"p4"});
    const axis=resolveSketchAxis(sketch,ref);
    const pts=sketch.points.slice(0,4).map(p=>axisMeridian(axis,{u:p.x,v:p.y}));
    const doc=documentWith("revolve",sketch,ref);
    Object.assign(doc.features.at(-1).params,{angle:90,direction,symmetric});
    const part={kind:"rev",axisBasis:axis,pts,angle:90,direction,symmetric};
    const bounds=revolveBounds(part),mass=await rebuild(doc);
    close(mass.volume,6*Math.PI);
    const previewMass=computeMassProperties({parts:[part]});
    for(const k of ["x","y","z"]){
      assert.ok(Math.abs(previewMass.centerOfMass[k]-mass.centerOfMass[k])<=.0051);
      close(mass.bounds.min[k],bounds[k+"0"]); close(mass.bounds.max[k],bounds[k+"1"]);
      close(revolvePoint(part,pts[2],0)[k],framePoint(sketch.frame,sketch.points[2].x,sketch.points[2].y)[k]);
    }
  }
});

test("curved part and translated tool recipes keep the analytic wire about the same line",async()=>{
  const sketch=profile();
  sketch.points.push({id:"c",x:0,y:34});
  sketch.entities.push({id:"ring",type:"circle",c:"c",r:.75});
  const spec=resolveSketchProfile({sketches:[sketch]},{
    sketchId:sketch.id,profileEntityIds:["ring"],axis:ref,angle:360,useSketchPlane:true
  });
  const part={axis:ref,axisBasis:spec.axisBasis,pts:spec.points.map(p=>axisMeridian(spec.axisBasis,p)),
    revolveProfile:{points:spec.points,segments:spec.segments}};
  const record={kind:"revolve",axis:ref,axisBasis:spec.axisBasis,loop:spec.points,segments:spec.segments};
  translateToolRecord(record,1,2,3);
  for(const [recipe,dx,dy,dz] of [[revolveRecipe(part),0,0,0],[toolFeatureRecipe(record).params,1,2,3]]){
    const solid=await makeBrepRevolve(recipe);
    try{
      const mass=await shapeMassProperties(solid);
      close(mass.volume,2*Math.PI**2*4*.75**2);
      close(mass.centerOfMass.x,dx); close(mass.centerOfMass.y,30+dy); close(mass.centerOfMass.z,4+dz);
    }finally{disposeBrep(solid);}
  }
});

function curvedProjection(){
  const sketch=profile();
  sketch.frameSpace="local";
  sketch.frame=frameFromPlane({x:2,y:6,z:-4},{x:1,y:2,z:-3});
  sketch.points.push({id:"c",x:5,y:34});
  sketch.entities.push({id:"ring",type:"circle",c:"c",r:.75});
  const spec=resolveSketchProfile({sketches:[sketch]},{sketchId:sketch.id,profileEntityIds:["ring"],axis:ref});
  return {kind:"rev",axis:ref,sketchDriven:true,axisBasis:spec.axisBasis,
    pts:spec.points.map(p=>axisMeridian(spec.axisBasis,p)),revolveProfile:{points:spec.points,segments:spec.segments},
    angle:73,direction:"reverse",x:3,y:-2,z:1};
}

async function exactProjectionMass(part){
  const solid=await makeBrepRevolve(revolveRecipe(part));
  try{return await shapeMassProperties(solid);}finally{disposeBrep(solid);}
}

test("save normalization and linear pattern offsets translate a tilted analytic revolve in world space",async()=>{
  const source=curvedProjection(),initial=await exactProjectionMass(source),bounds=revolveBounds(source);
  const delta={x:-7,y:11,z:3};
  for(const normalize of [true,false]){
    const copy=structuredClone(source);
    if(normalize)movePart(copy,delta.x,delta.y,delta.z,true);
    else placePatternCopy(copy,{mode:"linear"},delta);
    assert.deepEqual(copy.pts,source.pts);
    assert.deepEqual(copy.revolveProfile,source.revolveProfile);
    const mass=await exactProjectionMass(copy),after=revolveBounds(copy);
    close(mass.volume,initial.volume);
    for(const k of ["x","y","z"]){
      close(after[k+"0"],bounds[k+"0"]+delta[k]);close(after[k+"1"],bounds[k+"1"]+delta[k]);
      close(mass.centerOfMass[k],initial.centerOfMass[k]+delta[k]);
      close(mass.bounds.min[k],initial.bounds.min[k]+delta[k]);
    }
  }
});

test("uncached mirrored partial revolutions reflect their analytic section and reverse sweep sense",async()=>{
  const source=curvedProjection(),mass=await exactProjectionMass(source);
  for(const [plane,axis] of [["right","x"],["top","y"],["front","z"]]){
    const copy=mirrorProjectionPart(structuredClone(source),"plane:"+plane);
    assert.ok(copy && !copy.meshData);
    assert.deepEqual(copy.revolveProfile,source.revolveProfile);
    const reflected=await exactProjectionMass(copy);
    close(reflected.volume,mass.volume);
    for(const k of ["x","y","z"]){
      const sign=k===axis?-1:1;
      close(reflected.centerOfMass[k],sign*mass.centerOfMass[k]);
      close(reflected.bounds.min[k],sign*(sign===1?mass.bounds.min[k]:mass.bounds.max[k]));
      for(const angle of [0,-.2,-73*Math.PI/180]){
        close(revolvePoint(copy,copy.pts[0],-angle)[k],sign*revolvePoint(source,source.pts[0],angle)[k]);
      }
    }
  }
});

test("an oblique line cutting between circle samples is rejected by authoring and exact rebuild",async()=>{
  const theta=.071,dx=Math.cos(theta),dy=Math.sin(theta),sketch=profile();
  sketch.points=[{id:"a",x:0,y:0},{id:"b",x:dx,y:dy},{id:"c",x:-.99*dy,y:.99*dx}];
  sketch.entities=[{id:"center:1",type:"line",a:"a",b:"b",construction:true},{id:"ring",type:"circle",c:"c",r:1}];
  const spec=resolveSketchProfile({sketches:[sketch]},{axis:ref,sketchId:sketch.id,profileEntityIds:["ring"]});
  assert.ok(Math.min(...spec.points.map(p=>axisMeridian(spec.axisBasis,p).u))>0);
  assert.throws(()=>assertSketchAxisProfile(spec),/crosses the axis/);
  await assert.rejects(makeBrepRevolve(spec),/crosses the axis/);
  const tangent={...spec,segments:[{...spec.segments[0],radius:.99}]};
  assert.doesNotThrow(()=>assertSketchAxisProfile(tangent));
});

test("trimmed circular arcs, rotated ellipses and cubic sections use extrema on the actual curve",()=>{
  const spec={axisBasis:{},points:[{u:.2,v:0},{u:.2,v:1},{u:2,v:0}]};
  const arc={type:"arc",center:{u:.9,v:0},radius:1,from:{u:.9,v:1},to:{u:.9,v:-1}};
  const check=segment=>assertSketchAxisProfile({...spec,segments:[segment]});
  assert.doesNotThrow(()=>check({...arc,mid:{u:1.9,v:0}}));
  assert.throws(()=>check({...arc,mid:{u:-.1,v:0}}),/crosses the axis/);
  assert.throws(()=>check({type:"ellipse",center:{u:.9,v:0},rx:.2,ry:1,rot:Math.PI/2}),/crosses the axis/);
  const cubic=inner=>({type:"bezier",controls:[1,inner,inner,1].map((u,i)=>({u,v:i}))});
  assert.throws(()=>check(cubic(-1)),/crosses the axis/);
  assert.doesNotThrow(()=>check(cubic(-.1)));
});

test("projected NURBS and offset sections cannot pass sketch-axis validation on samples alone",async()=>{
  const t0=32.5/64,y=t=>100*(t-t0)**2-.003;
  const samples=Array.from({length:65},(_,i)=>({u:10*i/64,v:y(i/64)}));
  close(Math.min(...samples.map(p=>p.v)),.003103515625);close(y(t0),-.003);
  const sketch=profile();
  sketch.points.slice(4).forEach(p=>p.y=0);
  const poles=[y(0),y(0)-200*t0/3,y(1)-200*(1-t0)/3,y(1)].map((v,i)=>({u:10*i/3,v}));
  const nurbs={kind:"nurbs",poles,degree:3,weights:[1,1,1,1],knots:[0,1],multiplicities:[4,4],periodic:false};
  for(const curveData of [nurbs,{kind:"offset",basis:nurbs,distance:.001,direction:{u:0,v:0,w:1}}]){
    const points=[...samples,{u:10,v:40},{u:0,v:40}];
    const segments=[{type:"kernelCurve",curveData,first:0,last:1,from:samples[0],to:samples.at(-1),samples},
      ...points.slice(64).map((from,i)=>({type:"line",from,to:points[65+i] || points[0]}))];
    const corners=[points[0],points[64],points[65],points[66]];
    const driving={...sketch,points:[...sketch.points.slice(4),...corners.map((p,i)=>({id:i+1,x:p.u,y:p.v}))],
      entities:[sketch.entities.at(-1),...segments.map((s,i)=>({id:"edge"+i,type:"line",a:i+1,b:(i+1)%4+1,
        ...(s.type==="kernelCurve"?{projectedCurve:s}:{})}))]};
    const spec=resolveSketchProfile({sketches:[driving]},{axis:ref,sketchId:driving.id,
      profileEntityIds:driving.entities.slice(1).map(e=>e.id),angle:90});
    assert.ok(spec.points.every(p=>axisMeridian(spec.axisBasis,p).u>0));
    const error=new RegExp("cannot verify a projected "+curveData.kind+" curve");
    assert.throws(()=>assertSketchAxisProfile(spec),error);
    await assert.rejects(makeBrepRevolve(spec),error);
  }
});

test("standalone revolve copies reject a requested thin wall before history or exact construction can accept it",async()=>{
  const params={...revolveRecipe(curvedProjection()),thinFeature:true,thickness:.25,thinMode:"forward"};
  const error=/Thin Revolve requires a driving sketch/;
  const issues=validateFeatureDefinition({id:"copy",type:"revolve",params,references:{}});
  assert.ok(issues.some(issue=>issue.code==="invalid-revolve-recipe" && error.test(issue.message)));
  assert.throws(()=>resolveSketchProfile({sketches:[]},params),error);
  await assert.rejects(makeBrepRevolve(params),error);
  assert.doesNotThrow(()=>resolveSketchProfile({sketches:[]},{...params,thinFeature:false}));
});

test("only complete standalone recipes satisfy Revolve's sketch and axis input requirements",()=>{
  const part=curvedProjection(),params=revolveRecipe(part);
  const validate=params=>validateFeatureDefinition({id:"copy",type:"revolve",params,references:{}});
  assert.deepEqual(validate(params),[]);
  assert.ok(validate({...params,points:[]}).some(issue=>issue.code==="invalid-revolve-recipe"));
  assert.ok(validate({...params,axisBasis:{...params.axisBasis,axial:{x:0,y:0,z:0}}})
    .some(issue=>issue.code==="invalid-revolve-recipe"));
  const orphan={...params,sketchId:"deleted",profileEntityIds:ids};
  assert.throws(()=>resolveSketchProfile({sketches:[profile()]},orphan),/missing its sketch/);
  assert.ok(validate({...params,profileEntityIds:ids}).some(issue=>issue.role==="sketches"));
});

test("invalid axes fail explicitly without resolving a similarly named line from another sketch",()=>{
  const sketch=profile();
  const params={sketchId:"deleted",axis:ref,profileEntityIds:ids};
  assert.throws(()=>resolveSketchProfile({sketch,sketches:[sketch]},params),/missing its sketch/);
  assert.throws(()=>resolveSketchAxis({...sketch,frameSpace:"world-3d"},ref),/planar sketch/);
  sketch.entities.at(-1).type="arc";
  assert.throws(()=>resolveSketchAxis(sketch,ref),/straight line/);
  sketch.entities.at(-1).type="line";
  sketch.entities.at(-1).b="missing";
  assert.throws(()=>resolveSketchAxis(sketch,ref),/endpoint/);
  sketch.entities.at(-1).b="p4";
  assert.throws(()=>resolveSketchAxis(sketch,ref),/zero length/);
});
