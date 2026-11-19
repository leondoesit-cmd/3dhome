import { createDefinition, createParameter, mainReferences } from "./schema.js";
import { inferAuthoringMode } from "./authoring_mode.js";
import { topologyDescriptorSignature } from "./topology.js";
import {modelDimensions} from './model_dimensions.js';

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clone = (value) => value == null ? value : typeof structuredClone === "function"
  ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => ({ x:a.y*b.z-a.z*b.y, y:a.z*b.x-a.x*b.z, z:a.x*b.y-a.y*b.x });
const length = (v) => Math.hypot(v.x, v.y, v.z);
const unit = (v) => { const size=length(v)||1; return {x:v.x/size,y:v.y/size,z:v.z/size}; };
const scale = (v, amount) => ({x:v.x*amount,y:v.y*amount,z:v.z*amount});

export function detectStepLengthUnit(data) {
  let textValue="";
  if (typeof data === "string") textValue=data;
  else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const bytes=data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
    textValue=new TextDecoder("ascii").decode(bytes.subarray(0,Math.min(bytes.byteLength,2_000_000)));
  }
  const text=textValue.toUpperCase();
  if (/CONVERSION_BASED_UNIT\s*\(\s*'INCH/.test(text)) return "in";
  if (/CONVERSION_BASED_UNIT\s*\(\s*'(FOOT|FEET)/.test(text)) return "ft";
  if (/SI_UNIT\s*\(\s*\.MILLI\.\s*,\s*\.METRE\./.test(text)) return "mm";
  if (/SI_UNIT\s*\(\s*\.CENTI\.\s*,\s*\.METRE\./.test(text)) return "cm";
  if (/SI_UNIT\s*\(\s*\$\s*,\s*\.METRE\./.test(text)) return "m";
  return "unknown";
}

const STEP_UNIT_TO_CM={mm:.1,cm:1,m:100,in:2.54,ft:30.48};
export function stepUnitCorrection(declaredUnit,overrideUnit="auto") {
  if (overrideUnit==="auto" || !STEP_UNIT_TO_CM[overrideUnit]) return 1;
  const readerUnit=STEP_UNIT_TO_CM[declaredUnit] ? declaredUnit : "mm";
  return STEP_UNIT_TO_CM[overrideUnit]/STEP_UNIT_TO_CM[readerUnit];
}

function stableHash(value) {
  const text = String(value || "import");
  let hash = 2166136261;
  for (let index=0; index<text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function importedMeshBounds(meshData) {
  const positions = meshData?.positions || [];
  const bounds = { min:{x:Infinity,y:Infinity,z:Infinity}, max:{x:-Infinity,y:-Infinity,z:-Infinity} };
  for (let index=0; index+2<positions.length; index+=3) {
    const x=Number(positions[index]), y=Number(positions[index+1]), z=Number(positions[index+2]);
    if (![x,y,z].every(Number.isFinite)) continue;
    bounds.min.x=Math.min(bounds.min.x,x); bounds.max.x=Math.max(bounds.max.x,x);
    bounds.min.y=Math.min(bounds.min.y,y); bounds.max.y=Math.max(bounds.max.y,y);
    bounds.min.z=Math.min(bounds.min.z,z); bounds.max.z=Math.max(bounds.max.z,z);
  }
  return finite(bounds.min.x) ? bounds : null;
}

function uniqueDirections(vectors, tolerance=.998) {
  const result=[];
  vectors.forEach((raw) => {
    if (!raw || length(raw)<1e-8) return;
    const direction=unit(raw);
    if (!result.some((entry) => Math.abs(dot(entry,direction))>=tolerance)) result.push(direction);
  });
  return result;
}

function axisFrameForBox(topology) {
  const faces=(topology || []).filter((entry) => entry.kind==="face" && entry.descriptor?.surface==="plane");
  const edges=(topology || []).filter((entry) => entry.kind==="edge");
  if (faces.length!==6 || (edges.length && (edges.length!==12 || edges.some((entry) => entry.descriptor?.curve!=="line")))) return null;
  const directions=uniqueDirections(faces.map((entry) => entry.descriptor.normal));
  if (directions.length!==3 || Math.abs(dot(directions[0],directions[1]))>.02 || Math.abs(dot(directions[0],directions[2]))>.02 || Math.abs(dot(directions[1],directions[2]))>.02) return null;
  let yAxis=directions.slice().sort((a,b)=>Math.abs(b.y)-Math.abs(a.y))[0];
  if (yAxis.y<0) yAxis=scale(yAxis,-1);
  const remainder=directions.filter((entry)=>Math.abs(dot(entry,yAxis))<.5);
  let xAxis=remainder.slice().sort((a,b)=>Math.abs(b.x)-Math.abs(a.x))[0];
  if (xAxis.x<0) xAxis=scale(xAxis,-1);
  let zAxis=unit(cross(xAxis,yAxis));
  // local x × local y must point opposite local z for the point projection
  // convention used below; flip z toward the source's positive Z for stable
  // front/back naming without changing handedness of the mesh triangles.
  if (zAxis.z<0) { xAxis=scale(xAxis,-1); zAxis=scale(zAxis,-1); }
  return {xAxis:unit(xAxis),yAxis:unit(yAxis),zAxis};
}

function axisFrameForCylinder(topology) {
  const faces=(topology || []).filter((entry)=>entry.kind==="face");
  const cylinder=faces.find((entry)=>entry.descriptor?.surface==="cylinder");
  const caps=faces.filter((entry)=>entry.descriptor?.surface==="plane");
  const circles=(topology || []).filter((entry)=>entry.kind==="edge" && entry.descriptor?.curve==="circle");
  if (!cylinder || caps.length!==2 || circles.length!==2 || faces.length!==3) return null;
  let yAxis=unit(cylinder.descriptor.axis || caps[0].descriptor.normal);
  if (yAxis.y<0) yAxis=scale(yAxis,-1);
  let seed=Math.abs(dot(yAxis,{x:1,y:0,z:0}))<.95 ? {x:1,y:0,z:0} : {x:0,y:0,z:1};
  let xAxis=unit({x:seed.x-yAxis.x*dot(seed,yAxis),y:seed.y-yAxis.y*dot(seed,yAxis),z:seed.z-yAxis.z*dot(seed,yAxis)});
  let zAxis=unit(cross(xAxis,yAxis));
  return {xAxis,yAxis,zAxis,radius:Number(cylinder.descriptor.radius)};
}

function orthogonalFrameFromPlanes(topology,minimumFaces=6) {
  const planes=(topology || []).filter((entry)=>entry.kind==="face" && entry.descriptor?.surface==="plane");
  if (planes.length<minimumFaces) return null;
  const directions=uniqueDirections(planes.map((entry)=>entry.descriptor.normal));
  if (directions.length!==3 || Math.abs(dot(directions[0],directions[1]))>.02 || Math.abs(dot(directions[0],directions[2]))>.02 || Math.abs(dot(directions[1],directions[2]))>.02) return null;
  let yAxis=directions.slice().sort((a,b)=>Math.abs(b.y)-Math.abs(a.y))[0]; if(yAxis.y<0)yAxis=scale(yAxis,-1);
  let xAxis=directions.filter((entry)=>Math.abs(dot(entry,yAxis))<.5).sort((a,b)=>Math.abs(b.x)-Math.abs(a.x))[0]; if(xAxis.x<0)xAxis=scale(xAxis,-1);
  let zAxis=unit(cross(xAxis,yAxis)); if(zAxis.z<0){xAxis=scale(xAxis,-1);zAxis=scale(zAxis,-1);}
  return {xAxis:unit(xAxis),yAxis:unit(yAxis),zAxis};
}

function axisFrameForPocketBox(topology) {
  // A pocket-box reconstruction replaces the imported body with an analytic
  // rectangular envelope and treats every axial cylinder as a cutter.  That is
  // only lossless when the body's exterior really is a six-faced box.  Merely
  // finding three orthogonal plane directions is not sufficient: trays,
  // brackets and housings often have those directions too, and their outer
  // cylindrical walls would then be mistaken for holes.
  const planes=(topology || []).filter((entry)=>entry.kind==="face" && entry.descriptor?.surface==="plane");
  if (planes.length!==6) return null;
  const curved=(topology || []).filter((entry)=>entry.kind==="face" && entry.descriptor?.surface==="cylinder");
  const circles=(topology || []).filter((entry)=>entry.kind==="edge" && entry.descriptor?.curve==="circle");
  if (!curved.length || circles.length<2) return null;
  const frame=orthogonalFrameFromPlanes(topology,6); if(!frame)return null;
  if(curved.some((face)=>Math.abs(dot(unit(face.descriptor.axis || {x:0,y:1,z:0}),frame.yAxis))<.998))return null;
  return frame;
}

function axisFrameForRevolve(topology) {
  const faces=(topology || []).filter((entry)=>entry.kind==="face"), curved=faces.filter((entry)=>["cylinder","cone","sphere","torus","revolution"].includes(entry.descriptor?.surface));
  if (!curved.length || faces.length<=3) return null;
  let yAxis=unit(curved.find((face)=>face.descriptor?.axis)?.descriptor.axis || {x:0,y:1,z:0});
  if (curved.some((face)=>face.descriptor?.axis && Math.abs(dot(unit(face.descriptor.axis),yAxis))<.998)) return null;
  const planes=faces.filter((entry)=>entry.descriptor?.surface==="plane");
  if (planes.some((face)=>Math.abs(dot(unit(face.descriptor.normal),yAxis))<.998)) return null;
  if(yAxis.y<0)yAxis=scale(yAxis,-1);
  const seed=Math.abs(dot(yAxis,{x:1,y:0,z:0}))<.95?{x:1,y:0,z:0}:{x:0,y:0,z:1};
  let xAxis=unit({x:seed.x-yAxis.x*dot(seed,yAxis),y:seed.y-yAxis.y*dot(seed,yAxis),z:seed.z-yAxis.z*dot(seed,yAxis)}),zAxis=unit(cross(xAxis,yAxis));
  return {xAxis,yAxis,zAxis};
}

function axisFrameForBoxComponents(topology) {
  const faces=(topology || []).filter((entry)=>entry.kind==="face"),edges=(topology || []).filter((entry)=>entry.kind==="edge");
  if(faces.length<12 || faces.length%6 || (edges.length && (edges.length%12 || edges.some((entry)=>entry.descriptor?.curve!=="line"))))return null;
  return orthogonalFrameFromPlanes(topology,12);
}

function axisFrameForExtrusion(topology) {
  const faces=(topology || []).filter((entry)=>entry.kind==="face");
  const planes=faces.filter((entry)=>entry.descriptor?.surface==="plane" && entry.descriptor?.normal && entry.descriptor?.origin);
  const edges=(topology || []).filter((entry)=>entry.kind==="edge");
  if (planes.length<4 || edges.length<3 || edges.some((entry)=>entry.descriptor?.curve!=="line")) return null;
  for (const candidate of uniqueDirections(planes.map((entry)=>entry.descriptor.normal))) {
    const caps=planes.filter((entry)=>Math.abs(dot(unit(entry.descriptor.normal),candidate))>.998);
    if (caps.length!==2) continue;
    if (planes.some((entry)=>!caps.includes(entry) && Math.abs(dot(unit(entry.descriptor.normal),candidate))>.02)) continue;
    const projections=caps.map((entry)=>dot(entry.descriptor.origin,candidate));
    if (Math.abs(projections[1]-projections[0])<1e-6) continue;
    let yAxis=projections[1]>projections[0] ? candidate : scale(candidate,-1);
    let seed=Math.abs(dot(yAxis,{x:1,y:0,z:0}))<.95 ? {x:1,y:0,z:0} : {x:0,y:0,z:1};
    let xAxis=unit({x:seed.x-yAxis.x*dot(seed,yAxis),y:seed.y-yAxis.y*dot(seed,yAxis),z:seed.z-yAxis.z*dot(seed,yAxis)});
    let zAxis=unit(cross(xAxis,yAxis));
    if (zAxis.z<0) { xAxis=scale(xAxis,-1); zAxis=scale(zAxis,-1); }
    return {xAxis,yAxis:unit(yAxis),zAxis};
  }
  return null;
}

function transformPoint(point, origin, frame, unitScale=1) {
  if (!point) return point;
  const relative={x:Number(point.x)-origin.x,y:Number(point.y)-origin.y,z:Number(point.z)-origin.z};
  return {x:dot(relative,frame.xAxis)*unitScale,y:dot(relative,frame.yAxis)*unitScale,z:dot(relative,frame.zAxis)*unitScale};
}

function transformVector(vector, frame) {
  if (!vector) return vector;
  return {x:dot(vector,frame.xAxis),y:dot(vector,frame.yAxis),z:dot(vector,frame.zAxis)};
}

function transformBounds(bounds, origin, frame, unitScale=1) {
  if (!bounds?.min || !bounds?.max) return bounds;
  const corners=[];
  for (const x of [bounds.min.x,bounds.max.x]) for (const y of [bounds.min.y,bounds.max.y]) for (const z of [bounds.min.z,bounds.max.z]) corners.push(transformPoint({x,y,z},origin,frame,unitScale));
  return {
    min:{x:Math.min(...corners.map((p)=>p.x)),y:Math.min(...corners.map((p)=>p.y)),z:Math.min(...corners.map((p)=>p.z))},
    max:{x:Math.max(...corners.map((p)=>p.x)),y:Math.max(...corners.map((p)=>p.y)),z:Math.max(...corners.map((p)=>p.z))},
  };
}

function transformDescriptor(descriptor, origin, frame, unitScale=1, kind="") {
  const output=clone(descriptor || {});
  for(const key of ['origin','center','referenceOrigin','point','start','end','arcMidpoint'])
    if(output[key])output[key]=transformPoint(output[key],origin,frame,unitScale);
  for(const key of ['normal','axis','xDir','direction'])
    if(output[key])output[key]=transformVector(output[key],frame);
  for(const key of ['endpoints','points'])
    if(Array.isArray(output[key]))output[key]=output[key].map(point=>transformPoint(point,origin,frame,unitScale));
  if (output.bounds) output.bounds=transformBounds(output.bounds,origin,frame,unitScale);
  for(const key of ['radius','majorRadius','minorRadius'])if(finite(output[key]))output[key]*=unitScale;
  if(Array.isArray(output.axisRange))output.axisRange=output.axisRange.map(value=>value*unitScale);
  if(output.along)output.along={...output.along,min:output.along.min*unitScale,max:output.along.max*unitScale};
  if (finite(output.measure)) output.measure*=kind==="face" ? unitScale*unitScale : unitScale;
  return output;
}

function normalizedFrame(topology) {
  const box=axisFrameForBox(topology);
  if (box) return {...box,recognition:"box"};
  const cylinder=axisFrameForCylinder(topology);
  if (cylinder) return {...cylinder,recognition:"cylinder"};
  const pocket=axisFrameForPocketBox(topology);
  if (pocket) return {...pocket,recognition:"pocket-box"};
  const revolve=axisFrameForRevolve(topology);
  if (revolve) return {...revolve,recognition:"revolve"};
  const boxComponents=axisFrameForBoxComponents(topology);
  if(boxComponents)return {...boxComponents,recognition:"box-components"};
  const extrusion=axisFrameForExtrusion(topology);
  if (extrusion) return {...extrusion,recognition:"extrusion"};
  return {xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1},recognition:null};
}

function connectedMeshBounds(meshData) {
  const positions=meshData?.positions || [],triangles=Math.floor(positions.length/9),parent=Array.from({length:triangles},(_,index)=>index),owners=new Map();
  const find=(value)=>{while(parent[value]!==value){parent[value]=parent[parent[value]];value=parent[value];}return value;},join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
  for(let triangle=0;triangle<triangles;triangle++)for(let vertex=0;vertex<3;vertex++){const offset=triangle*9+vertex*3,key=[positions[offset],positions[offset+1],positions[offset+2]].map((value)=>Math.round(value*1e5)).join(":");if(owners.has(key))join(triangle,owners.get(key));else owners.set(key,triangle);}
  const groups=new Map();for(let triangle=0;triangle<triangles;triangle++){const root=find(triangle),bounds=groups.get(root)||{min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};for(let vertex=0;vertex<3;vertex++){const offset=triangle*9+vertex*3,x=positions[offset],y=positions[offset+1],z=positions[offset+2];bounds.min.x=Math.min(bounds.min.x,x);bounds.max.x=Math.max(bounds.max.x,x);bounds.min.y=Math.min(bounds.min.y,y);bounds.max.y=Math.max(bounds.max.y,y);bounds.min.z=Math.min(bounds.min.z,z);bounds.max.z=Math.max(bounds.max.z,z);}groups.set(root,bounds);}
  return Array.from(groups.values()).map((bounds)=>({...bounds,center:{x:(bounds.min.x+bounds.max.x)/2,y:(bounds.min.y+bounds.max.y)/2,z:(bounds.min.z+bounds.max.z)/2},size:{x:bounds.max.x-bounds.min.x,y:bounds.max.y-bounds.min.y,z:bounds.max.z-bounds.min.z}}));
}

function classifyBoxComponents(components) {
  if(components.length<2)return null;const first=components[0],same=components.every((item)=>["x","y","z"].every((axis)=>Math.abs(item.size[axis]-first.size[axis])<1e-4));
  if(!same)return {recognition:"box-assembly",components};
  for(const axis of ["x","y","z"]){const other=["x","y","z"].filter((value)=>value!==axis);if(components.every((item)=>other.every((value)=>Math.abs(item.center[value]-first.center[value])<1e-4))){const sorted=components.slice().sort((a,b)=>a.center[axis]-b.center[axis]),spacing=sorted[1].center[axis]-sorted[0].center[axis];if(sorted.every((item,index)=>index===0||Math.abs(item.center[axis]-sorted[0].center[axis]-spacing*index)<1e-4))return {recognition:"linear-pattern",components:sorted,pattern:{axis,spacing,count:sorted.length}};}}
  const sameY=components.every((item)=>Math.abs(item.center.y-first.center.y)<1e-4),radii=components.map((item)=>Math.hypot(item.center.x,item.center.z));
  if(sameY && radii[0]>1e-4 && radii.every((radius)=>Math.abs(radius-radii[0])<1e-4)){const sorted=components.slice().sort((a,b)=>Math.atan2(a.center.z,a.center.x)-Math.atan2(b.center.z,b.center.x)),angles=sorted.map((item)=>Math.atan2(item.center.z,item.center.x)),step=Math.PI*2/sorted.length;if(angles.slice(1).every((angle,index)=>Math.abs(angle-angles[index]-step)<1e-4))return {recognition:"circular-pattern",components:sorted,pattern:{axis:"y",angle:360,count:sorted.length}};}
  return {recognition:"box-assembly",components};
}

function inferBoxMates(components) {
  const mates=[];for(let a=0;a<components.length;a++)for(let b=a+1;b<components.length;b++)for(const axis of ["x","y","z"]){const other=["x","y","z"].filter((value)=>value!==axis),touch=Math.abs(components[a].max[axis]-components[b].min[axis])<1e-4||Math.abs(components[b].max[axis]-components[a].min[axis])<1e-4,overlap=other.every((value)=>Math.min(components[a].max[value],components[b].max[value])-Math.max(components[a].min[value],components[b].min[value])>1e-4);if(touch&&overlap)mates.push({id:"mate:"+(a+1)+":"+(b+1)+":"+axis,type:"coincident",a:"component:"+(a+1),b:"component:"+(b+1),axis});}return mates;
}

function revolveProfile(meshData,bounds,topology=[]) {
  const tolerance=Math.max(1e-5,(bounds.max.y-bounds.min.y)*1e-5), levels=new Map();
  for(let index=0;index+2<(meshData.positions || []).length;index+=3){const x=meshData.positions[index],y=meshData.positions[index+1],z=meshData.positions[index+2],key=Math.round(y/tolerance),r=Math.hypot(x,z);if(r<tolerance)continue;const row=levels.get(key)||{y,rs:[]};if(!row.rs.some((value)=>Math.abs(value-r)<tolerance))row.rs.push(r);levels.set(key,row);}
  const rows=Array.from(levels.values()).sort((a,b)=>a.y-b.y); if(rows.length<2)return null;
  rows.forEach((row)=>row.rs.sort((a,b)=>b-a));
  const outer=[];
  rows.forEach((row,index)=>{
    const prev=rows[index-1],next=rows[index+1];
    // A bore shows up at every height. A shoulder shows up once, level with the
    // next section's outer radius. Keep the shoulder; drop the bore.
    row.rs.forEach((radius,place)=>{
      const shoulder=(prev&&Math.abs(radius-prev.rs[0])<tolerance)||(next&&Math.abs(radius-next.rs[0])<tolerance);
      if(place===0||shoulder)outer.push({u:radius,v:row.y});
    });
  });
  // A proven through-bore is material boundary, not redundant shoulder data.
  // Require an analytic cylindrical face and the same inner radius at every
  // sampled height before closing the meridian along that bore instead of axis.
  const bore=topology.filter(entry=>entry.kind==='face'&&entry.descriptor?.surface==='cylinder')
    .map(entry=>Number(entry.descriptor.radius))
    .filter(radius=>radius>tolerance && rows.every(row=>row.rs[0]>radius+tolerance && row.rs.some(r=>Math.abs(r-radius)<tolerance)))
    .sort((a,b)=>a-b)[0];
  if(bore)return [...outer,...rows.slice().reverse().map(row=>({u:bore,v:row.y}))];
  return [{u:0,v:bounds.min.y},...outer,{u:0,v:bounds.max.y}];
}

function pocketCylinders(topology,bounds) {
  return (topology || []).filter((entry)=>entry.kind==="face" && entry.descriptor?.surface==="cylinder" && entry.descriptor?.axis && Math.abs(entry.descriptor.axis.y)>.998).map((entry,index)=>({id:index,x:Number(entry.descriptor.origin?.x)||0,z:Number(entry.descriptor.origin?.z)||0,r:Number(entry.descriptor.radius)||0,from:bounds.min.y-1,to:bounds.max.y+1})).filter((hole)=>hole.r>0);
}

function extrusionProfile(topology,bounds) {
  const tolerance=Math.max(1e-5,(bounds.max.y-bounds.min.y)*1e-5);
  const key=(point)=>Math.round(point.x/tolerance)+":"+Math.round(point.z/tolerance);
  const points=new Map(), adjacency=new Map();
  for (const edge of topology || []) {
    const ends=edge.kind==="edge" && edge.descriptor?.curve==="line" ? edge.descriptor.endpoints : null;
    if (!ends || ends.length!==2 || ends.some((point)=>Math.abs(point.y-bounds.min.y)>tolerance)) continue;
    const a=key(ends[0]), b=key(ends[1]);
    if (a===b) continue;
    points.set(a,{u:ends[0].x,v:ends[0].z}); points.set(b,{u:ends[1].x,v:ends[1].z});
    if (!adjacency.has(a)) adjacency.set(a,[]); if (!adjacency.has(b)) adjacency.set(b,[]);
    if (!adjacency.get(a).includes(b)) adjacency.get(a).push(b);
    if (!adjacency.get(b).includes(a)) adjacency.get(b).push(a);
  }
  if (points.size<3 || Array.from(adjacency.values()).some((neighbors)=>neighbors.length!==2)) return null;
  const start=Array.from(points.keys()).sort()[0], ordered=[], visited=new Set();
  let previous=null,current=start;
  while (!visited.has(current)) {
    visited.add(current); ordered.push(points.get(current));
    const next=adjacency.get(current).find((entry)=>entry!==previous);
    previous=current; current=next;
    if (!current) return null;
  }
  return current===start && visited.size===points.size ? ordered : null;
}

function expressionParameter(name, expression) {
  return createParameter(name, 0, {expression, exposure:"internal", adjustable:false, group:"Derived dimensions"});
}

function envelopeParameters(bounds, adjustable) {
  const width=bounds.max.x-bounds.min.x, height=bounds.max.y-bounds.min.y, depth=bounds.max.z-bounds.min.z;
  return {
    width:createParameter("width",width,{label:"Width",exposure:adjustable?"planner":"advanced",min:adjustable ? .01 : 0,adjustable}),
    depth:createParameter("depth",depth,{label:"Depth",exposure:adjustable?"planner":"advanced",min:adjustable ? .01 : 0,adjustable}),
    height:createParameter("height",height,{label:"Height",exposure:adjustable?"planner":"advanced",min:adjustable ? .01 : 0,adjustable}),
  };
}

export function normalizeImportedGeometry(source = {}) {
  if (!source.meshData?.positions?.length) throw new Error("Imported geometry has no triangles");
  const topology=clone(source.topology || source.meshData.topology || []);
  const sourceBounds=importedMeshBounds(source.meshData);
  if (!sourceBounds) throw new Error("Imported geometry has invalid coordinates");
  const unitScale=finite(Number(source.unitScale)) && Number(source.unitScale)>0 ? Number(source.unitScale) : 1;
  const frame=normalizedFrame(topology);
  const preliminaryOrigin={x:(sourceBounds.min.x+sourceBounds.max.x)/2,y:sourceBounds.min.y,z:(sourceBounds.min.z+sourceBounds.max.z)/2};
  let positions=[];
  for (let index=0; index<source.meshData.positions.length; index+=3) {
    const point=transformPoint({x:source.meshData.positions[index],y:source.meshData.positions[index+1],z:source.meshData.positions[index+2]},preliminaryOrigin,frame);
    positions.push(point.x,point.y,point.z);
  }
  const preliminaryBounds=importedMeshBounds({positions});
  const localCorrection={x:(preliminaryBounds.min.x+preliminaryBounds.max.x)/2,y:preliminaryBounds.min.y,z:(preliminaryBounds.min.z+preliminaryBounds.max.z)/2};
  positions=positions.map((value,index)=>(value-(index%3===0?localCorrection.x:index%3===1?localCorrection.y:localCorrection.z))*unitScale);
  const sourceCenter={
    x:preliminaryOrigin.x+frame.xAxis.x*localCorrection.x+frame.yAxis.x*localCorrection.y+frame.zAxis.x*localCorrection.z,
    y:preliminaryOrigin.y+frame.xAxis.y*localCorrection.x+frame.yAxis.y*localCorrection.y+frame.zAxis.y*localCorrection.z,
    z:preliminaryOrigin.z+frame.xAxis.z*localCorrection.x+frame.yAxis.z*localCorrection.y+frame.zAxis.z*localCorrection.z,
  };
  const meshData={...clone(source.meshData),positions};
  if(meshData.normals?.length){
    const normals=[];
    for(let i=0;i+2<meshData.normals.length;i+=3){const n=transformVector({x:meshData.normals[i],y:meshData.normals[i+1],z:meshData.normals[i+2]},frame);normals.push(n.x,n.y,n.z);}
    meshData.normals=normals;
  }
  const descriptors=topology.map(entry=>transformDescriptor(entry.descriptor,sourceCenter,frame,unitScale,entry.kind));
  const geometryKey=stableHash(JSON.stringify({positions,topology:topology.map((entry,i)=>({kind:entry.kind,descriptor:descriptors[i]}))}));
  const importKey=source.importId || "import:"+stableHash((source.name || source.sourceName || "body")+":"+(source.size || positions.length)+":"+positions.length+":"+geometryKey);
  const normalizedTopology=topology.map((entry,index)=>{
    const descriptor=descriptors[index];
    return {
      ...entry,ownerFeatureId:importKey,
      persistentId:entry.persistentId ? importKey+":"+entry.kind+":"+stableHash(entry.persistentId) : importKey+":"+(entry.kind || "topology")+":"+(index+1),
      descriptor,signature:topologyDescriptorSignature(descriptor),
    };
  });
  const idMap=new Map(topology.map((entry,index)=>[entry.persistentId,normalizedTopology[index].persistentId]));
  meshData.faceRanges=(meshData.faceRanges || []).map((range)=>({...range,persistentId:idMap.get(range.persistentId) || range.persistentId}));
  meshData.topology=normalizedTopology;
  const bounds=importedMeshBounds(meshData);
  let recognition=frame.recognition,components,pattern;
  if(recognition==="box-components"){const classified=classifyBoxComponents(connectedMeshBounds(meshData));recognition=classified?.recognition || null;components=classified?.components;pattern=classified?.pattern;}
  return {
    id:importKey,
    name:source.name || source.sourceName || "Imported body",
    recognition,
    bounds,
    meshData,
    topology:normalizedTopology,
    source:{
      format:String(source.format || "mesh").toLowerCase(), name:source.sourceName || source.name || "import",
      size:Number(source.size)||undefined, importedAt:Number(source.importedAt)||Date.now(), generator:source.generator || undefined,
      sourceUnit:source.sourceUnit || "unknown",workingUnit:"cm",scaleToWorking:unitScale,
      declaredUnit:source.declaredUnit || source.sourceUnit || "unknown",unitOverride:source.unitOverride || "auto",
    },
    sourceTransform:{origin:sourceCenter,xAxis:frame.xAxis,yAxis:frame.yAxis,zAxis:frame.zAxis,scale:unitScale},
    hierarchy:clone(source.hierarchy) || [{id:importKey+":body",type:"body",name:source.name || source.sourceName || "Imported body",partId:importKey+":part"}],
    exactPayload:clone(source.exactPayload),
    components:clone(components),
    pattern:clone(pattern),
    ...(Number.isFinite(frame.radius) && frame.radius > 0 ? { radius: frame.radius * unitScale } : {}),
  };
}

export function createImportedDefinition(source = {}, options = {}) {
  const normalized=source.bounds && source.meshData?.topology ? clone(source) : normalizeImportedGeometry(source);
  const b=normalized.bounds, id=options.id || "definition:"+normalized.id, partId=normalized.id+":part";
  const recognizedProfile=normalized.recognition==="extrusion" ? extrusionProfile(normalized.topology,b) : null;
  const recognizedRevolve=normalized.recognition==="revolve" ? revolveProfile(normalized.meshData,b,normalized.topology) : null;
  if (normalized.recognition==="extrusion" && !recognizedProfile) normalized.recognition=null;
  if (normalized.recognition==="revolve" && !recognizedRevolve) normalized.recognition=null;
  const common={id:partId,featureId:normalized.id,name:normalized.name,color:options.color || "#aeb7c2",metal:.08,rough:.72};
  let part, parts, feature, features, sketches=[], parameters, rules, authoringMode;
  if (normalized.recognition==="box") {
    parameters={...envelopeParameters(b,true),xMin:expressionParameter("xMin","-width/2"),zMin:expressionParameter("zMin","-depth/2")};
    part={...common,kind:"box",x0:b.min.x,x1:b.max.x,y0:b.min.y,y1:b.max.y,z0:b.min.z,z1:b.max.z,parametricEnvelope:"box"};
    feature={id:normalized.id,type:"box",name:"Recognized box",inputs:[],params:{x:"$xMin",y:0,z:"$zMin",w:"$width",h:"$height",d:"$depth"},metadata:{recognizedFromImport:true}};
    rules={id:"import.recognized-box",version:1,source:"import-reconstruction",family:"primitive",dimensions:{width:{min:1,continuous:true},depth:{min:1,continuous:true},height:{min:1,continuous:true}},configuration:{primitive:"box"},invariants:["analytic-box"]};
    authoringMode="hybrid";
  } else if (normalized.recognition==="cylinder") {
    const analytic=Number(normalized.radius), boxed=(b.max.x-b.min.x)/2, r=analytic>0?analytic:boxed;
    parameters={...envelopeParameters(b,true),radius:expressionParameter("radius","width/2")};
    if(analytic>0){parameters.width=createParameter("width",r*2,{label:"Width",exposure:"planner",min:.01,adjustable:true});parameters.depth=createParameter("depth",r*2,{label:"Depth",exposure:"planner",min:.01,adjustable:true});}
    part={...common,kind:"cyl",x:0,y:b.min.y,z:0,r,r2:r,h:b.max.y-b.min.y,parametricEnvelope:"cylinder"};
    feature={id:normalized.id,type:"cylinder",name:"Recognized cylinder",inputs:[],params:{x:0,y:0,z:0,r:"$radius",h:"$height"},metadata:{recognizedFromImport:true}};
    rules={id:"import.recognized-cylinder",version:1,source:"import-reconstruction",family:"primitive",dimensions:{width:{min:1,continuous:true},depth:{min:1,continuous:true},height:{min:1,continuous:true}},linkedDimensions:[{source:"width",target:"depth",relation:"equal"},{source:"depth",target:"width",relation:"equal"}],configuration:{primitive:"cylinder"},invariants:["circular-section"]};
    authoringMode="hybrid";
  } else if (normalized.recognition==="extrusion") {
    const profile=recognizedProfile, sketchId=normalized.id+":sketch";
    const points=profile.map((point,index)=>({id:sketchId+":point:"+index,x:point.u,y:point.v,fixed:true}));
    const entities=points.map((point,index)=>({id:sketchId+":edge:"+index,type:"line",a:point.id,b:points[(index+1)%points.length].id}));
    const sketch={id:sketchId,name:"Recognized section",plane:"top",support:{type:"reference",referenceId:"plane:top"},points,entities,constraints:[]};
    const sketchFeature={id:sketchId+":feature",type:"sketch",name:"Recognized section",inputs:[],params:{sketchId}};
    feature={id:normalized.id,type:"extrude",name:"Recognized extrusion",inputs:[sketchFeature.id],params:{axis:"y",from:0,to:"$height",sketchId,profileEntityIds:entities.map((entry)=>entry.id)},metadata:{recognizedFromImport:true}};
    features=[sketchFeature,feature]; sketches=[sketch];
    parameters={...envelopeParameters(b,false),height:createParameter("height",b.max.y-b.min.y,{label:"Height",exposure:"planner",min:.01,adjustable:true})};
    part={...common,kind:"ext",axis:"y",from:0,to:b.max.y-b.min.y,pts:profile,profileEntityIds:entities.map((entry)=>entry.id),sketchId,sketchDriven:true,parametricEnvelope:"extrusion"};
    rules={id:"import.recognized-extrusion",version:1,source:"import-reconstruction",family:"extrusion",dimensions:{width:{adjustable:false},depth:{adjustable:false},height:{min:.01,continuous:true}},configuration:{primitive:"linear-extrusion"},invariants:["constant-section","fixed-profile"]};
    authoringMode="hybrid";
  } else if (normalized.recognition==="pocket-box") {
    const holes=pocketCylinders(normalized.topology,b), outer=[{u:b.min.x,v:b.min.z},{u:b.max.x,v:b.min.z},{u:b.max.x,v:b.max.z},{u:b.min.x,v:b.max.z}];
    parameters={...envelopeParameters(b,true),xMin:expressionParameter("xMin","-width/2"),zMin:expressionParameter("zMin","-depth/2"),holeDepth:expressionParameter("holeDepth","height+2")};
    const base={id:normalized.id+":base",type:"box",name:"Recognized base",inputs:[],params:{x:"$xMin",y:0,z:"$zMin",w:"$width",h:"$height",d:"$depth"},metadata:{recognizedFromImport:true}};
    features=[base]; let output=base;
    holes.forEach((hole,index)=>{parameters["holeRadius"+(index+1)]=createParameter("holeRadius"+(index+1),hole.r,{label:"Hole "+(index+1)+" radius",exposure:"advanced",min:.01});const cutter={id:normalized.id+":hole:"+(index+1),type:"cylinder",name:"Recognized hole "+(index+1),inputs:[],params:{x:hole.x,y:-1,z:hole.z,r:"$holeRadius"+(index+1),h:"$holeDepth"},metadata:{recognizedFromImport:true}};const cut={id:normalized.id+":cut:"+(index+1),type:"subtract",name:"Pocket "+(index+1),inputs:[output.id,cutter.id],params:{},metadata:{recognizedFromImport:true}};features.push(cutter,cut);output=cut;});
    const holeLoops=holes.map((hole)=>Array.from({length:32},(_,index)=>({u:hole.x+Math.cos(index*Math.PI/16)*hole.r,v:hole.z+Math.sin(index*Math.PI/16)*hole.r})));
    part={...common,featureId:output.id,kind:"ext",axis:"y",from:0,to:b.max.y-b.min.y,pts:outer,holes:holeLoops,parametricEnvelope:"pocket-box"};
    rules={id:"import.recognized-pocket-box",version:1,source:"import-reconstruction",family:"casework",dimensions:{width:{min:.01,continuous:true},depth:{min:.01,continuous:true},height:{min:.01,continuous:true}},configuration:{holes:holes.length},invariants:["orthogonal-envelope","analytic-holes"]};authoringMode="hybrid";
  } else if (normalized.recognition==="revolve") {
    const profile=recognizedRevolve,sketchId=normalized.id+":revolve-sketch",points=profile.map((point,index)=>({id:sketchId+":point:"+index,x:point.u,y:point.v,fixed:true})),entities=points.map((point,index)=>({id:sketchId+":edge:"+index,type:"line",a:point.id,b:points[(index+1)%points.length].id}));
    sketches=[{id:sketchId,name:"Recognized revolve profile",plane:"front",referenceId:"plane:front",points,entities,constraints:[]}];
    const sketchFeature={id:sketchId+":feature",type:"sketch",name:"Recognized profile",inputs:[],params:{sketchId}};feature={id:normalized.id,type:"revolve",name:"Recognized revolve",inputs:[sketchFeature.id],params:{angle:360,sketchId,profileEntityIds:entities.map((entry)=>entry.id)},metadata:{recognizedFromImport:true}};features=[sketchFeature,feature];parameters=envelopeParameters(b,false);part={...common,kind:"rev",x:0,z:0,pts:profile,profileEntityIds:entities.map((entry)=>entry.id),sketchId,sketchDriven:true,parametricEnvelope:"revolve"};rules={id:"import.recognized-revolve",version:1,source:"import-reconstruction",family:"turned",dimensions:{width:{adjustable:false},depth:{adjustable:false},height:{adjustable:false}},configuration:{angle:360},invariants:["axisymmetric-profile"]};authoringMode="hybrid";
  } else if (normalized.recognition==="linear-pattern" || normalized.recognition==="circular-pattern") {
    const components=normalized.components,pattern=normalized.pattern,base=components[0],baseId=normalized.id+":seed";parameters={...envelopeParameters(b,false),spacing:createParameter("spacing",pattern.spacing,{label:"Pattern spacing",exposure:"advanced",min:.01}),instanceCount:createParameter("instanceCount",pattern.count,{label:"Instance count",exposure:"advanced",min:2,max:128,step:1})};
    const seed={id:baseId,type:"box",name:"Recognized seed",inputs:[],params:{x:base.min.x,y:base.min.y,z:base.min.z,w:base.size.x,h:base.size.y,d:base.size.z},metadata:{recognizedFromImport:true}},vector={x:0,y:0,z:0};vector[pattern.axis]="$spacing";feature=normalized.recognition==="linear-pattern"?{id:normalized.id,type:"linearPattern",name:"Recognized linear pattern",inputs:[seed.id],params:{count:"$instanceCount",vector},metadata:{recognizedFromImport:true}}:{id:normalized.id,type:"circularPattern",name:"Recognized circular pattern",inputs:[seed.id],params:{count:"$instanceCount",axis:pattern.axis,angle:pattern.angle},metadata:{recognizedFromImport:true}};features=[seed,feature];parts=components.map((component,index)=>({...common,id:partId+":"+(index+1),featureId:index?feature.id:seed.id,kind:"box",name:"Pattern member "+(index+1),x0:component.min.x,x1:component.max.x,y0:component.min.y,y1:component.max.y,z0:component.min.z,z1:component.max.z}));rules={id:"import.recognized-pattern",version:1,source:"import-reconstruction",family:"pattern",dimensions:{width:{adjustable:false},depth:{adjustable:false},height:{adjustable:false}},configuration:{count:pattern.count,axis:pattern.axis},invariants:["identical-members","constant-spacing"]};authoringMode="hybrid";
  } else if (normalized.recognition==="box-assembly") {
    const components=normalized.components,mates=inferBoxMates(components);parameters=envelopeParameters(b,false);features=[];parts=components.map((component,index)=>{const id=normalized.id+":component:"+(index+1);features.push({id,type:"box",name:"Recognized component "+(index+1),inputs:[],params:{x:component.min.x,y:component.min.y,z:component.min.z,w:component.size.x,h:component.size.y,d:component.size.z},metadata:{recognizedFromImport:true,componentId:"component:"+(index+1)}});return {...common,id:partId+":"+(index+1),featureId:id,kind:"box",name:"Component "+(index+1),x0:component.min.x,x1:component.max.x,y0:component.min.y,y1:component.max.y,z0:component.min.z,z1:component.max.z};});feature={id:normalized.id,type:"assembly",name:"Recognized assembly",inputs:features.map((entry)=>entry.id),params:{componentFeatures:features.map((entry)=>entry.id),mates},metadata:{recognizedFromImport:true}};features.push(feature);rules={id:"import.recognized-assembly",version:1,source:"import-reconstruction",family:"assembly",dimensions:{width:{adjustable:false},depth:{adjustable:false},height:{adjustable:false}},configuration:{componentCount:components.length,mateCount:mates.length},invariants:["component-placement"]};authoringMode="hybrid";
  } else {
    parameters=envelopeParameters(b,false);
    part={...common,kind:"direct",bounds:{x0:b.min.x,x1:b.max.x,y0:b.min.y,y1:b.max.y,z0:b.min.z,z1:b.max.z},meshData:normalized.meshData,importSource:normalized.source,sourcePayload:normalized.exactPayload};
    feature={id:normalized.id,type:"import",name:"Imported direct body",inputs:[],params:{bounds:clone(b),topology:normalized.topology,source:normalized.source,sourcePayload:normalized.exactPayload},metadata:{directOnly:true}};
    rules={id:"import.direct",version:1,source:"import",family:"direct",dimensions:{width:{adjustable:false},depth:{adjustable:false},height:{adjustable:false}},configuration:{representation:"direct"},invariants:["source-geometry"]};
    authoringMode="direct-only";
  }
  if (!features) features=[feature];
  const definition=createDefinition({
    id,key:options.key || "cm_"+stableHash(id),name:options.name || normalized.name,kind:options.kind || "imported-object",authoringMode,
    references:mainReferences(),parameters,sketches,features,history:features.map((entry)=>entry.id),parts:parts || [part],rules,
    metadata:{
      import:{
        ...normalized.source,recognition:normalized.recognition || "none",sourceTransform:normalized.sourceTransform,hierarchy:normalized.hierarchy,
        ...(normalized.exactPayload ? {exactSource:{format:normalized.exactPayload.format,byteLength:normalized.exactPayload.byteLength,checksum:normalized.exactPayload.checksum}} : {}),
      },
      source:"import",adapter:"model-editor",derivedRepresentation:{meshPartIds:(parts || [part]).map((entry)=>entry.id),collision:"envelope",lod:"generated"},
    },
  });
  Object.assign(definition,modelDimensions({x0:b.min.x,x1:b.max.x,y0:b.min.y,y1:b.max.y,z0:b.min.z,z1:b.max.z}));
  definition.authoringMode=inferAuthoringMode(definition);
  return definition;
}
