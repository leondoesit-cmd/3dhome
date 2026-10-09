import {shellMeridian} from './core/shell_meridian.js';
import { shellFaceThicknesses, shellSupportingPlane } from './core/planar_shell_overrides.js';
import { repairFilletCornerPatches } from './core/fillet_corner_repair.js';
import {restoreProfileCurve} from './cad_profile_serialization.js';
import {circularPatternPivot} from "./core/pattern_geometry.js";
import { holeToolPlacements } from "./core/hole_geometry.js";
import { cylinderAxis } from "./core/cylinder_axis.js";
import { revolveInterval, revolvePoint, assertRevolveProfileFrame } from "./core/revolve_geometry.js";
// OpenCascade BREP backend. Loaded lazily because the WASM module is large;
// ordinary sketch editing must remain instant and does not need a solid kernel.

import {
  createTopologyRegistry,
  resolveTopologyReference,
  topologyDescriptorSignature,
  fitProfileCircle,
  planarFaceNameAgrees,
} from "./core/topology.js";
import { framePoint } from "./core/frame.js";
import { isSegmentProfile, pathFrames, segmentProfilePoints } from "./core/profile_curves.js";
import { ribDraftedLoop, ribGrowthVector, ribLoop, ribOffsets, ribWebLoop } from "./core/rib_profile.js";
import { extrusionAxisVector, UP_TO_FACE_MISSED } from "./core/extrude_extent.js";

let kernelPromise = null;
let kernelLoadAttempt = 0;

// The product domain uses centimetres. OpenCascade expresses its transfer
// system unit as millimetres per application unit, so one model unit is 10 mm.
// (It is not the more common "units per metre" convention.)
export const CAD_WORKING_UNIT = Object.freeze({ name: "cm", millimetersPerUnit: 10 });

async function compressedBrowserKernel(factory) {
  if(typeof DecompressionStream!=="function")throw new Error("gzip streaming unavailable");
  const url=new URL("../assets/opencascade.full.wasm.gz",import.meta.url),response=await fetch(url);
  if(!response.ok || !response.body)throw new Error("compressed CAD kernel unavailable");
  const wasmBinary=await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return factory({wasmBinary});
}

export function loadCadKernel() {
  if (!kernelPromise) {
    const attempt = kernelLoadAttempt++;
    const browserModule = new URL("../node_modules/opencascade.js/dist/opencascade.full.js", import.meta.url);
    if (attempt) browserModule.searchParams.set("retry", String(attempt));
    kernelPromise = typeof window === "undefined" && typeof self === "undefined"
      ? import("opencascade.js/dist/node.js").then(({ default: factory }) => factory())
      : import(browserModule.href).then(({default:factory})=>
        compressedBrowserKernel(factory).catch(()=>factory({locateFile(path){if(path.endsWith(".wasm"))return new URL("../node_modules/opencascade.js/dist/opencascade.full.wasm",import.meta.url).href;return path;}})));
    kernelPromise = kernelPromise.catch((error) => {
      kernelPromise = null;
      throw error;
    });
  }
  return kernelPromise;
}

function kernelFilePath(name, extension) {
  const stem = String(name || "shape").replace(/[^a-z0-9_.-]/gi, "_").replace(/\.[^.]+$/, "");
  const nonce = Math.random().toString(36).slice(2, 10);
  return "/" + stem + "-" + nonce + "." + extension;
}

function disposeAll(items) {
  items.forEach((item) => { try { item?.delete?.(); } catch (_) {} });
}

const pointOf = (value) => ({ x: value.X(), y: value.Y(), z: value.Z() });
const vectorOf = (value) => ({ x: value.X(), y: value.Y(), z: value.Z() });

function surfaceName(oc, type) {
  const names = ["plane", "cylinder", "cone", "sphere", "torus", "bezier", "bspline", "revolution", "extrusion", "offset", "other"];
  return names[Number(type?.value)] || "other";
}

function curveName(oc, type) {
  const names = ["line", "circle", "ellipse", "hyperbola", "parabola", "bezier", "bspline", "offset", "other"];
  return names[Number(type?.value)] || "other";
}

/* `useShapeTolerance` pads the box by every face/edge/vertex tolerance. Geometry
   decisions (flush-plane cuts, tool sizing) want that margin; a reported overall
   dimension does not — after HOUSING's Shell1 the offset faces carried ~0.01 mm
   tolerances and Mass properties read 111.145 mm for a Ø111.125 mm body. */
function shapeBounds(oc, shape, useShapeTolerance = true) {
  const box = new oc.Bnd_Box_1();
  try {
    oc.BRepBndLib.AddOptimal(shape, box, false, useShapeTolerance);
    if (box.IsVoid()) return null;
    const min = box.CornerMin(), max = box.CornerMax();
    try {
      const bounds={ min: pointOf(min), max: pointOf(max) };
      return useShapeTolerance ? bounds : trimmedSplineBounds(oc,shape,bounds);
    }
    finally { min.delete(); max.delete(); }
  } finally { box.delete(); }
}

// AddOptimal bounds the parameter rectangle of a spline face. A trimmed
// corner can therefore report control-surface material outside the solid.
// Distance to an external plane gives the true support coordinate: the plane
// rectangle covers the entire original box's orthogonal projection.
function trimmedSplineBounds(oc,shape,bounds) {
  const explorer=new oc.TopExp_Explorer_2(shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let spline=false;
  try {
    while(explorer.More()) {
      const face=oc.TopoDS.Face_1(explorer.Current()),surface=new oc.BRepAdaptor_Surface_2(face,true);
      try {const name=surfaceName(oc,surface.GetType());if(name==='bspline'||name==='bezier'){spline=true;break;}}
      finally {surface.delete();face.delete();}
      explorer.Next();
    }
  } finally {explorer.delete();}
  if(!spline)return bounds;
  const axes=['x','y','z'],center=axes.map(axis=>(bounds.min[axis]+bounds.max[axis])/2);
  const reach=Math.max(1,Math.hypot(...axes.map(axis=>bounds.max[axis]-bounds.min[axis])));
  const refined={min:{...bounds.min},max:{...bounds.max}},tolerance=Math.max(1e-6,reach*1e-8);
  try {
    for(let index=0;index<3;index++)for(const side of ['min','max']) {
      const owned=[],keep=value=>(owned.push(value),value),axis=axes[index],sign=side==='min'?-1:1;
      try {
        const location=center.slice();location[index]=bounds[side][axis]+sign*reach;
        const point=keep(new oc.gp_Pnt_3(...location)),direction=[0,0,0];direction[index]=1;
        const normal=keep(new oc.gp_Dir_4(...direction)),plane=keep(new oc.gp_Pln_3(point,normal));
        const maker=keep(new oc.BRepBuilderAPI_MakeFace_9(plane,-reach*2,reach*2,-reach*2,reach*2)),face=keep(maker.Face());
        const distance=keep(new oc.BRepExtrema_DistShapeShape_1()),progress=keep(new oc.Message_ProgressRange_1());
        distance.LoadS1(face);distance.LoadS2(shape);distance.Perform(progress);
        if(!distance.IsDone()||distance.NbSolution()<1)throw new Error('Unresolved support plane');
        const hit=keep(distance.PointOnShape2(1)),coordinate=[hit.X(),hit.Y(),hit.Z()][index];
        if(!Number.isFinite(coordinate)||coordinate<bounds.min[axis]-tolerance||coordinate>bounds.max[axis]+tolerance||Math.abs(Math.abs(coordinate-location[index])-distance.Value())>tolerance)throw new Error('Unverified support plane');
        refined[side][axis]=coordinate;
      } finally {disposeAll(owned);}
    }
    return refined;
  } catch (_) {return bounds;}
}

function normalizedVector(value) {
  const size = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / size, y: value.y / size, z: value.z / size };
}

function faceDescriptor(oc, face) {
  const props = new oc.GProp_GProps_1();
  const adaptor = new oc.BRepAdaptor_Surface_2(face, true);
  const p = new oc.gp_Pnt_1(), du = new oc.gp_Vec_1(), dv = new oc.gp_Vec_1();
  let center;
  try {
    oc.BRepGProp.SurfaceProperties_1(face, props, true, false);
    const centre = props.CentreOfMass();
    try { center = pointOf(centre); } finally { centre.delete(); }
    const u = (adaptor.FirstUParameter() + adaptor.LastUParameter()) / 2;
    const v = (adaptor.FirstVParameter() + adaptor.LastVParameter()) / 2;
    adaptor.D1(u, v, p, du, dv);
    const crossed = du.Crossed(dv);
    let normal;
    try {
      if (face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) crossed.Reverse();
      normal = normalizedVector(vectorOf(crossed));
    } finally { crossed.delete(); }
    const surface = surfaceName(oc, adaptor.GetType());
    const descriptor = { surface, origin: center, normal, measure: props.Mass(), bounds: shapeBounds(oc, face) };
    if (surface === "cylinder") {
      const cylinder = adaptor.Cylinder(), axis = cylinder.Axis(), direction = axis.Direction(), location = axis.Location();
      try {
        const dir = normalizedVector(vectorOf(direction)), base = pointOf(location);
        /* OpenCascade reports a face's centre of mass, which for a wall sits on
           the wall. Everything downstream measures a cylinder from its axis —
           picking, highlighting, merging staves — so a radius taken from a point
           already on the surface lights one strip and misses the rest. Slide the
           centroid onto the axis and keep the surface point separately. */
        const along = (center.x - base.x) * dir.x + (center.y - base.y) * dir.y + (center.z - base.z) * dir.z;
        descriptor.axis = dir;
        descriptor.radius = cylinder.Radius();
        descriptor.referenceOrigin=base;descriptor.axisRange=[adaptor.FirstVParameter(),adaptor.LastVParameter()];
        descriptor.centroid = center;
        descriptor.origin = { x: base.x + dir.x * along, y: base.y + dir.y * along, z: base.z + dir.z * along };
      } finally { location.delete(); direction.delete(); axis.delete(); cylinder.delete(); }
    } else if (surface === "sphere") {
      const sphere = adaptor.Sphere(), location = sphere.Location();
      try { descriptor.center = pointOf(location); descriptor.radius = sphere.Radius(); }
      finally { location.delete(); sphere.delete(); }
    } else if (surface === "cone") {
      const cone = adaptor.Cone(), axis = cone.Axis(), direction = axis.Direction(), location = axis.Location();
      try {
        const dir = normalizedVector(vectorOf(direction)), base = pointOf(location);
        const along = (center.x - base.x) * dir.x + (center.y - base.y) * dir.y + (center.z - base.z) * dir.z;
        descriptor.axis = dir;
        descriptor.radius = cone.RefRadius();
        descriptor.angle = cone.SemiAngle();
        descriptor.referenceOrigin=base;descriptor.axisRange=[adaptor.FirstVParameter()*Math.cos(descriptor.angle),adaptor.LastVParameter()*Math.cos(descriptor.angle)];
        descriptor.centroid = center;
        descriptor.origin = { x: base.x + dir.x * along, y: base.y + dir.y * along, z: base.z + dir.z * along };
      } finally { location.delete(); direction.delete(); axis.delete(); cone.delete(); }
    } else if (surface === "torus") {
      const torus = adaptor.Torus(), axis = torus.Axis(), direction = axis.Direction(), location = axis.Location();
      try {
        descriptor.axis = normalizedVector(vectorOf(direction));
        descriptor.origin = pointOf(location);
        descriptor.center = descriptor.origin;
        descriptor.majorRadius = torus.MajorRadius();
        descriptor.minorRadius = torus.MinorRadius();
        descriptor.radius = descriptor.majorRadius;
      } finally { location.delete(); direction.delete(); axis.delete(); torus.delete(); }
    } else if (surface === "revolution") {
      // OCCT can retain a circular sweep as a surface of revolution rather
      // than reduce it to Geom_ToroidalSurface. Identify the exact generating
      // circle, so a hook's upper loop has usable analytic mating geometry.
      const basis=adaptor.BasisCurve(),curve=basis.get();
      try {
        if(curve.GetType().value===oc.GeomAbs_CurveType.GeomAbs_Circle.value){
          const circle=curve.Circle(),axis=adaptor.AxeOfRevolution(),location=axis.Location(),direction=axis.Direction(),center=circle.Location(),circleAxis=circle.Axis(),circleNormal=circleAxis.Direction();
          try {
            const n=normalizedVector(vectorOf(direction)),base=pointOf(location),c=pointOf(center);
            const delta={x:c.x-base.x,y:c.y-base.y,z:c.z-base.z},along=delta.x*n.x+delta.y*n.y+delta.z*n.z;
            const origin={x:base.x+n.x*along,y:base.y+n.y*along,z:base.z+n.z*along};
            const major=Math.hypot(c.x-origin.x,c.y-origin.y,c.z-origin.z),minor=circle.Radius();
            const cn=normalizedVector(vectorOf(circleNormal));
            const perpendicular=Math.abs(cn.x*n.x+cn.y*n.y+cn.z*n.z)<1e-7;
            const radialInPlane=Math.abs(cn.x*(c.x-origin.x)+cn.y*(c.y-origin.y)+cn.z*(c.z-origin.z))<1e-7;
            if(major>minor && perpendicular && radialInPlane){Object.assign(descriptor,{surface:"torus",underlyingSurface:"revolution",axis:n,origin,center:origin,majorRadius:major,minorRadius:minor,radius:major});}
          }finally{circleNormal.delete();circleAxis.delete();center.delete();direction.delete();location.delete();axis.delete();circle.delete();}
        }
      }finally{basis.delete();}
    }
    return descriptor;
  } finally { p.delete(); du.delete(); dv.delete(); adaptor.delete(); props.delete(); }
}

function edgeDescriptor(oc, edge) {
  const props = new oc.GProp_GProps_1();
  const adaptor = new oc.BRepAdaptor_Curve_2(edge);
  const p = new oc.gp_Pnt_1(), tangent = new oc.gp_Vec_1();
  let center;
  try {
    oc.BRepGProp.LinearProperties(edge, props, true, false);
    const centre = props.CentreOfMass();
    try { center = pointOf(centre); } finally { centre.delete(); }
    const first = adaptor.FirstParameter(), last = adaptor.LastParameter(), middle = (first + last) / 2;
    adaptor.D1(middle, p, tangent);
    const start = adaptor.Value(first), end = adaptor.Value(last);
    let endpoints;
    try { endpoints = [pointOf(start), pointOf(end)].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z); }
    finally { start.delete(); end.delete(); }
    const curve = curveName(oc, adaptor.GetType());
    const descriptor = { curve, origin: center, axis: normalizedVector(vectorOf(tangent)), measure: props.Mass(), bounds: shapeBounds(oc, edge), endpoints };
    if (curve === "circle") {
      const circle = adaptor.Circle(), location = circle.Location(), axis = circle.Axis(), direction = axis.Direction();
      try { descriptor.origin = pointOf(location); descriptor.axis = vectorOf(direction); descriptor.radius = circle.Radius(); descriptor.arcMidpoint = pointOf(p); }
      finally { direction.delete(); axis.delete(); location.delete(); circle.delete(); }
    }
    return descriptor;
  } finally { p.delete(); tangent.delete(); adaptor.delete(); props.delete(); }
}

function stableKernelId(featureId, kind, descriptor, ordinal) {
  const type = descriptor.surface || descriptor.curve || "other";
  return featureId + ":" + kind + ":generated:" + type + ":" + ordinal;
}

function clearBrepTopology(brep) {
  if (!brep?.subshapes) return;
  brep.subshapes.forEach((entry) => { try { entry?.shape?.delete?.(); } catch (_) {} });
  brep.subshapes.clear();
}

function descriptorPoint(descriptor = {}) {
  const bounds=descriptor.bounds;
  if(bounds?.min&&bounds?.max)return {
    x:(Number(bounds.min.x)+Number(bounds.max.x))/2,
    y:(Number(bounds.min.y)+Number(bounds.max.y))/2,
    z:(Number(bounds.min.z)+Number(bounds.max.z))/2,
  };
  return descriptor.origin || descriptor.center || null;
}

function descriptorGroupBounds(items) {
  const points=[];
  for(const item of items){
    const bounds=item?.descriptor?.bounds;
    if(bounds?.min&&bounds?.max)points.push(bounds.min,bounds.max);
    else {const point=descriptorPoint(item?.descriptor);if(point)points.push(point);}
  }
  if(!points.length)return null;
  return {
    min:{x:Math.min(...points.map(p=>Number(p.x)||0)),y:Math.min(...points.map(p=>Number(p.y)||0)),z:Math.min(...points.map(p=>Number(p.z)||0))},
    max:{x:Math.max(...points.map(p=>Number(p.x)||0)),y:Math.max(...points.map(p=>Number(p.y)||0)),z:Math.max(...points.map(p=>Number(p.z)||0))},
  };
}

function relativeDescriptorPoint(descriptor,bounds) {
  const point=descriptorPoint(descriptor);
  if(!point||!bounds)return null;
  const at=axis=>{const span=bounds.max[axis]-bounds.min[axis];return Math.abs(span)>1e-8?(point[axis]-bounds.min[axis])/span:.5;};
  return {x:at('x'),y:at('y'),z:at('z')};
}

function nonlinearCurve(descriptor={}) {return !!descriptor.curve && descriptor.curve!=='line';}

function edgeCurveClassAgrees(reference,item) {
  return reference.kind!=='edge' || nonlinearCurve(reference.descriptor)===nonlinearCurve(item.descriptor);
}

/* Fillet and offset edges can legitimately change analytic type when an
   upstream wall gains draft: a circular rim becomes an ellipse and an inner
   circle becomes an offset curve.  Absolute descriptor matching cannot follow
   a 104.14 mm body becoming a 10.16 mm plate.  Compare each generated edge's
   relative position inside its producing feature instead, with one-to-one and
   score guards, so the old persistent name survives the parametric edit. */
function resolveHistoricalKernelReference(reference,expected,raw,unmatched) {
  if(!reference?.ownerFeatureId||!['edge','face'].includes(reference.kind))return null;
  const generated=String(reference.persistentId || '').includes(':generated:');
  const sourceGroup=expected.filter(item=>item.kind===reference.kind&&item.ownerFeatureId===reference.ownerFeatureId
    && (!generated||String(item.persistentId || '').includes(':generated:')));
  const currentGroup=raw.filter(item=>item.kind===reference.kind&&item.ownerFeatureId===reference.ownerFeatureId);
  const candidates=currentGroup.filter(item=>unmatched.has(item));
  if(!sourceGroup.length||!candidates.length)return null;
  const oldBounds=descriptorGroupBounds(sourceGroup),newBounds=descriptorGroupBounds(currentGroup);
  const wanted=relativeDescriptorPoint(reference.descriptor,oldBounds);
  if(!wanted)return null;
  const wantedDirection=reference.descriptor?.axis||reference.descriptor?.normal;
  const wantedMeasure=Number(reference.descriptor?.measure)||0;
  const ranked=candidates.map(item=>{
    const point=relativeDescriptorPoint(item.descriptor,newBounds);
    if(!point)return {item,score:Infinity};
    let score=Math.hypot(point.x-wanted.x,point.y-wanted.y,point.z-wanted.z);
    if(reference.kind==='edge'&&nonlinearCurve(reference.descriptor)!==nonlinearCurve(item.descriptor))score+=1;
    if(reference.kind==='face'&&reference.descriptor?.surface&&item.descriptor?.surface!==reference.descriptor.surface)score+=1;
    const direction=item.descriptor?.axis||item.descriptor?.normal;
    if(wantedDirection&&direction){
      const a=Math.hypot(wantedDirection.x||0,wantedDirection.y||0,wantedDirection.z||0)||1;
      const b=Math.hypot(direction.x||0,direction.y||0,direction.z||0)||1;
      const alignment=((wantedDirection.x||0)*(direction.x||0)+(wantedDirection.y||0)*(direction.y||0)+(wantedDirection.z||0)*(direction.z||0))/(a*b);
      score+=(1-(reference.kind==='face'?alignment:Math.abs(alignment)))*.25;
    }
    const measure=Number(item.descriptor?.measure)||0;
    if(wantedMeasure&&measure)score+=Math.abs(measure-wantedMeasure)/Math.max(wantedMeasure,measure)*.15;
    return {item,score};
  }).sort((a,b)=>a.score-b.score||a.item.signature.localeCompare(b.item.signature));
  if(!ranked.length||ranked[0].score>.6)return null;
  /* A drafted kernel edge may split a formerly single circular arc into two
     offset-curve pieces.  Both are legitimate descendants, so proximity and
     the stable signature tie-break above choose the canonical continuation
     instead of discarding the old name as ambiguous. */
  return ranked[0].item;
}

// Extract exact kernel subshapes and bind them to the canonical semantic names
// produced by the lightweight rebuild.  Unmatched boolean/import faces receive
// deterministic generated names sorted by their geometric descriptor.
export function extractBrepTopology(brep, options = {}) {
  if (!brep?.shape) throw new Error("Topology extraction needs a BREP shape");
  clearBrepTopology(brep);
  const oc = brep.oc, featureId = options.ownerFeatureId || "kernel";
  const raw = [];
  const collect = (kind, shapeType, cast, describe) => {
    const buckets=new Map();let ordinal=0;
    const explorer = new oc.TopExp_Explorer_2(brep.shape, shapeType, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    try {
      while (explorer.More()) {
        const shape = cast(explorer.Current());
        const hash=shape.HashCode(2147483647),bucket=buckets.get(hash) || [];
        const duplicate = bucket.some((item) => item.IsSame(shape));
        if (duplicate) { shape.delete(); explorer.Next(); continue; }
        bucket.push(shape);buckets.set(hash,bucket);
        try {
          const descriptor = describe(oc, shape);
          raw.push({ ownerFeatureId: featureId, kind, transportOrdinal:ordinal++, persistentId: "__kernel:" + kind + ":" + raw.length, semantic: null, descriptor, signature: topologyDescriptorSignature(descriptor), shape });
        } catch (error) { shape.delete(); throw error; }
        explorer.Next();
      }
    } finally { explorer.delete(); }
  };
  collect("face", oc.TopAbs_ShapeEnum.TopAbs_FACE, (shape) => oc.TopoDS.Face_1(shape), faceDescriptor);
  collect("edge", oc.TopAbs_ShapeEnum.TopAbs_EDGE, (shape) => oc.TopoDS.Edge_1(shape), edgeDescriptor);

  const unmatched = new Set(raw);
  const expected = Array.isArray(options.expectedTopology) ? options.expectedTopology : [];
  const boundNames = new Set();
  expected.forEach((reference) => {
    // Exact history hints precede analytic names. A repeated name must not
    // consume another subshape and overwrite the first binding in the map.
    if (boundNames.has(reference.persistentId)) return;
    // a plane name binds only to a face in the same plane facing the same way
    const candidates = Array.from(unmatched).filter((item) => item.kind === reference.kind
      && (item.kind !== "face" || planarFaceNameAgrees(reference, item))
      // A drafted rounded profile turns circles into offset curves, but never
      // into straight lines.  Keeping those two classes separate prevents an
      // earlier saved profile-line name from consuming the offset edge that a
      // later historical circle reference needs.
      && edgeCurveClassAgrees(reference,item));
    const resolved = resolveTopologyReference(reference, createTopologyRegistry(candidates), { threshold: options.threshold || 0.8, ambiguityTolerance: 0.01 });
    const item = resolved.status === "missing" || resolved.status === "ambiguous" || !resolved.topology
      ? resolveHistoricalKernelReference(reference,expected,raw,unmatched)
      : resolved.topology;
    if(!item)return;
    boundNames.add(reference.persistentId);
    item.persistentId = reference.persistentId;
    item.semantic = reference.semantic;
    item.ownerFeatureId = reference.ownerFeatureId || featureId;
    item.signature = topologyDescriptorSignature({ ...item.descriptor, semantic: item.semantic });
    unmatched.delete(item);
  });
  const groups = new Map(),usedIds=new Set(raw.filter(item=>!unmatched.has(item)).map(item=>item.persistentId));
  Array.from(unmatched).sort((a, b) => a.kind.localeCompare(b.kind) || a.signature.localeCompare(b.signature)).forEach((item) => {
    const key = item.kind + ":" + (item.descriptor.surface || item.descriptor.curve || "other");
    let ordinal = (groups.get(key) || 0) + 1,persistentId=stableKernelId(featureId,item.kind,item.descriptor,ordinal);
    while(usedIds.has(persistentId)){ordinal++;persistentId=stableKernelId(featureId,item.kind,item.descriptor,ordinal);}
    groups.set(key, ordinal);
    item.persistentId = persistentId;usedIds.add(persistentId);
    item.semantic = "generated-" + ordinal;
  });
  brep.topology = raw.map(({ shape, ...item }) => item);
  brep.subshapes = new Map(raw.map((item) => [item.persistentId, { kind: item.kind, shape: item.shape, descriptor: item.descriptor }]));
  return { topology: brep.topology, subshapes: brep.subshapes };
}

// This path is only for the topology shipped with these exact serialized BREP
// bytes by the CAD worker. It never names changed geometry by enumeration order.
// BREP roundtrips preserve traversal order; every kind/count/ordinal is checked
// before binding native handles. Older payloads use geometric extraction.
export function hydrateSerializedBrepTopology(brep,expected,options={}){
  if(!Array.isArray(expected) || expected.some(item=>!['face','edge'].includes(item.kind) || !Number.isInteger(item.transportOrdinal)))return extractBrepTopology(brep,{...options,expectedTopology:expected});
  const oc=brep.oc,collected=[],groups=new Map();
  try{
    for(const [kind,type,cast] of [['face',oc.TopAbs_ShapeEnum.TopAbs_FACE,shape=>oc.TopoDS.Face_1(shape)],['edge',oc.TopAbs_ShapeEnum.TopAbs_EDGE,shape=>oc.TopoDS.Edge_1(shape)]]){
      const items=[],buckets=new Map(),explorer=new oc.TopExp_Explorer_2(brep.shape,type,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try{while(explorer.More()){
        const shape=cast(explorer.Current()),hash=shape.HashCode(2147483647),bucket=buckets.get(hash) || [];
        if(bucket.some(item=>item.IsSame(shape)))shape.delete();
        else{bucket.push(shape);buckets.set(hash,bucket);items.push(shape);collected.push(shape);}
        explorer.Next();
      }}finally{explorer.delete();}
      groups.set(kind,items);
    }
    const names=new Set(),ordinals=new Set();
    if(expected.length!==collected.length || expected.some(item=>{
      const ordinal=item.kind+':'+item.transportOrdinal;
      if(names.has(item.persistentId) || ordinals.has(ordinal) || item.transportOrdinal<0 || item.transportOrdinal>=groups.get(item.kind).length)return true;
      names.add(item.persistentId);ordinals.add(ordinal);return false;
    }))throw new Error('Serialized BREP topology does not match its transport map');
    clearBrepTopology(brep);
    brep.topology=structuredClone(expected);
    brep.subshapes=new Map(expected.map(item=>[item.persistentId,{kind:item.kind,shape:groups.get(item.kind)[item.transportOrdinal],descriptor:structuredClone(item.descriptor)}]));
    return {topology:brep.topology,subshapes:brep.subshapes};
  }catch(error){collected.forEach(shape=>shape.delete());throw error;}
}

export function resolveBrepSubshape(brep, persistentId, kind) {
  const entry = brep?.subshapes?.get(persistentId);
  return entry && (!kind || entry.kind === kind) ? entry.shape : null;
}

/* --- profile input ------------------------------------------------------
   Every wire builder below takes a loop in one of two shapes:

     legacy  [{u,v} | {x,y,z}, ...]                  -> a closed polygon wire
     typed   [{type, ...}, ...]  or  {points, segments:[{type, ...}]}

   The typed segment kinds are documented in core/profile_curves.js. A bare
   point array must keep producing exactly the polygon it produced before, so
   nothing that already calls these makers changes behaviour; a caller opts in
   by handing over segments as well. An unrecognised segment kind degrades to a
   chord rather than throwing, so adding a kind never breaks an old build. */
const loopSegments = (loop) => (isSegmentProfile(loop) ? (Array.isArray(loop) ? loop : loop.segments) : null);
const loopPoints = (loop) => (Array.isArray(loop) ? (isSegmentProfile(loop) ? [] : loop) : loop?.points || []);

/* `place` maps one profile coordinate to world; `normal` is the plane the
   conic segments are drawn on, which is what fixes an ellipse's tilt and a
   circle's sense. Everything allocated lands in the caller's `owned` list. */
function wireFromSegments(oc, owned, segments, place, normal) {
  const wire = new oc.BRepBuilderAPI_MakeWire_1(); owned.push(wire);
  const dir = new oc.gp_Dir_4(normal.x || 0, normal.y || 0, normal.z || 0); owned.push(dir);
  const at = (value) => {
    const world = place(value), point = new oc.gp_Pnt_3(world.x, world.y, world.z);
    owned.push(point);
    return point;
  };
  // The plane direction of a 2D angle, measured through the same mapping as the
  // points, so an ellipse stays tilted the way the sketch drew it on any frame.
  const planeDirection = (center, angle) => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const stepped = center.u !== undefined
      ? { ...center, u: center.u + dx, v: center.v + dy }
      : { ...center, x: (center.x || 0) + dx, y: (center.y || 0) + dy };
    const from = place(center), to = place(stepped);
    const d = new oc.gp_Dir_4(to.x - from.x, to.y - from.y, to.z - from.z); owned.push(d);
    return d;
  };
  // Embind will not upcast a Handle_Geom_TrimmedCurve/BSplineCurve to the
  // Handle_Geom_Curve the edge maker wants, so rewrap the raw pointer.
  const curveEdge = (handle) => {
    const generic = new oc.Handle_Geom_Curve_2(handle.get()); owned.push(generic);
    return new oc.BRepBuilderAPI_MakeEdge_24(generic);
  };
  for (const segment of segments) {
    let maker;
    if (segment.type === "arc" && segment.mid) {
      const arc = new oc.GC_MakeArcOfCircle_4(at(segment.from), at(segment.mid), at(segment.to)); owned.push(arc);
      if (!arc.IsDone()) throw new Error("Profile arc could not be built");
      const curve = arc.Value(); owned.push(curve);
      maker = curveEdge(curve);
    } else if (segment.type === "circle") {
      const axes = new oc.gp_Ax2_3(at(segment.center), dir); owned.push(axes);
      const circle = new oc.gp_Circ_2(axes, Math.max(1e-6, Number(segment.radius) || 0)); owned.push(circle);
      maker = new oc.BRepBuilderAPI_MakeEdge_8(circle);
    } else if (segment.type === "ellipse") {
      const rot = Number(segment.rot) || 0;
      const rx = Math.abs(Number(segment.rx) || 0), ry = Math.abs(Number(segment.ry) || 0);
      // gp_Elips insists the major radius is the larger one; a "tall" ellipse
      // is the same curve turned a quarter turn, not an error.
      const major = Math.max(rx, ry), minor = Math.min(rx, ry);
      const axes = new oc.gp_Ax2_2(at(segment.center), dir, planeDirection(segment.center, rx >= ry ? rot : rot + Math.PI / 2)); owned.push(axes);
      const ellipse = new oc.gp_Elips_2(axes, Math.max(1e-6, major), Math.max(1e-7, minor)); owned.push(ellipse);
      maker = new oc.BRepBuilderAPI_MakeEdge_12(ellipse);
    } else if(segment.type === "bezier" && segment.controls?.length===4){
      const array=new oc.TColgp_Array1OfPnt_2(1,4);owned.push(array);
      segment.controls.forEach((p,i)=>array.SetValue(i+1,at(p)));
      // The handle owns this reference-counted curve. Deleting the raw curve
      // as well leaves the edge (and later rebuilds) pointing at freed memory.
      const curve=new oc.Geom_BezierCurve_1(array);
      const handle=new oc.Handle_Geom_Curve_2(curve);owned.push(handle);
      maker=new oc.BRepBuilderAPI_MakeEdge_24(handle);
    } else if(segment.type==="kernelCurve"){
      const origin=place({u:0,v:0}),unitU=place({u:1,v:0}),unitV=place({u:0,v:1});
      const direction=q=>{const d=new oc.gp_Dir_4((unitU.x-origin.x)*q.u+(unitV.x-origin.x)*q.v+normal.x*q.w,(unitU.y-origin.y)*q.u+(unitV.y-origin.y)*q.v+normal.y*q.w,(unitU.z-origin.z)*q.u+(unitV.z-origin.z)*q.v+normal.z*q.w);owned.push(d);return d;};
      const handle=restoreProfileCurve(oc,segment.curveData,owned,at,direction);
      maker=new oc.BRepBuilderAPI_MakeEdge_25(handle,segment.first,segment.last);
    } else if (segment.type === "spline" && (segment.points || []).length > 2) {
      const points = segment.points, array = new oc.TColgp_Array1OfPnt_2(1, points.length); owned.push(array);
      points.forEach((value, index) => array.SetValue(index + 1, at(value)));
      const fit = new oc.GeomAPI_PointsToBSpline_2(array, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-3); owned.push(fit);
      if (!fit.IsDone()) throw new Error("Profile spline could not be fitted");
      const curve = fit.Curve(); owned.push(curve);
      maker = curveEdge(curve);
    } else {
      maker = new oc.BRepBuilderAPI_MakeEdge_3(at(segment.from), at(segment.to));
    }
    owned.push(maker);
    if (!maker.IsDone()) throw new Error("Profile segment could not be built: " + segment.type);
    const madeEdge=maker.Edge();owned.push(madeEdge);
    if(segment.type==="kernelCurve" && segment.reversed){const reversed=oc.TopoDS.Edge_1(madeEdge.Reversed());owned.push(reversed);wire.Add_1(reversed);}
    else wire.Add_1(madeEdge);
  }
  if (!wire.IsDone()) throw new Error("Profile segments do not form a wire");
  const built = wire.Wire(); owned.push(built);
  return built;
}

// Polygon wire — the historical path, unchanged in behaviour.
function wireFromPoints(oc, owned, points, place, close) {
  const polygon = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(polygon);
  for (const q of points) {
    const world = place(q), p = new oc.gp_Pnt_3(world.x, world.y, world.z);
    polygon.Add_1(p); owned.push(p);
  }
  if (close) polygon.Close();
  const built = polygon.Wire(); owned.push(built);
  return built;
}

function profileWire(oc, owned, loop, place, normal, options = {}) {
  const segments = loopSegments(loop), reverse = !!options.reverse, close = options.close !== false;
  const wire = segments
    ? wireFromSegments(oc, owned, segments, place, normal)
    : wireFromPoints(oc, owned, reverse ? loopPoints(loop).slice().reverse() : loopPoints(loop), place, close);
  // A closed conic is one edge, so its direction cannot be expressed by
  // reversing a list of points the way a polygon's can.
  if (!segments || !reverse) return wire;
  const flipped = oc.TopoDS.Wire_1(wire.Reversed()); owned.push(flipped);
  return flipped;
}

export async function makeBrepPrimitive(spec) {
  const oc = await loadCadKernel();
  const owned = [];
  try {
    if (spec.type === "box") {
      const p = new oc.gp_Pnt_3(spec.x || 0, spec.y || 0, spec.z || 0); owned.push(p);
      const maker = new oc.BRepPrimAPI_MakeBox_3(p, Math.max(1e-6, spec.w), Math.max(1e-6, spec.h), Math.max(1e-6, spec.d)); owned.push(maker);
      return { oc, shape: maker.Shape(), kind: "solid" };
    }
    if (spec.type === "cylinder") {
      const p = new oc.gp_Pnt_3(spec.x || 0, spec.y || 0, spec.z || 0);
      const axis = cylinderAxis(spec.axis),sign=Number(spec.h)<0?-1:1;
      const dir = new oc.gp_Dir_4(axis.x*sign, axis.y*sign, axis.z*sign); owned.push(p, dir);
      const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
      const maker = new oc.BRepPrimAPI_MakeCylinder_3(axes, Math.max(1e-6, spec.r), Math.max(1e-6, Math.abs(spec.h))); owned.push(maker);
      return { oc, shape: maker.Shape(), kind: "solid" };
    }
    if (spec.type === "sphere") {
      // The exact tree grew a sphere case only when the editor's projection did:
      // before that a legacy sphere reached neither engine and simply vanished.
      const p = new oc.gp_Pnt_3(spec.x || 0, spec.y || 0, spec.z || 0); owned.push(p);
      const maker = new oc.BRepPrimAPI_MakeSphere_5(p, Math.max(1e-6, Number(spec.r) || 0)); owned.push(maker);
      return { oc, shape: maker.Shape(), kind: "solid" };
    }
    throw new Error("Unsupported BREP primitive: " + spec.type);
  } finally {
    // Shape() returns a handle copy; makers and construction values can go.
    disposeAll(owned);
  }
}

/* A drafted extrusion: the prism's WALLS are tilted, its caps left alone.
 *
 * `draftAngle` was declared on extrude and extrudeCut from the start and read
 * by nothing, so the two most-used features in the editor showed a control that
 * did nothing. It is real here, and it is the same construction the standalone
 * Draft feature performs — BRepOffsetAPI_DraftAngle about the line where each
 * wall meets a neutral plane — with two things decided instead of asked for:
 * the neutral plane is the SKETCH plane (the drawn profile keeps its size, the
 * far end changes), and the walls are selected by geometry rather than by
 * picking, because they do not exist until this function has built them.
 *
 * A wall is any face whose normal is not parallel to the pull; that leaves the
 * two caps out on a prism of any profile, holes included. Drafting a circular
 * wall this way yields an exact cone, not a faceted approximation.
 *
 * Sign: a positive angle NARROWS the solid away from the sketch plane (a
 * moulded boss releasing from its tool), which is the same sense the rib's own
 * draft uses. `draftOutward` flares it instead. */
function draftPrismWalls(oc, shape, { angle, axis, at, outward }) {
  const owned = [];
  const pull = { x: axis.x || 0, y: axis.y || 0, z: axis.z || 0 };
  try {
    // OCCT tilts a wall so it CLOSES IN along the pull, so the default pull is
    // the run itself and a flared draft is the one that points back.
    const sign = outward ? -1 : 1;
    const pullDir = new oc.gp_Dir_4(pull.x * sign, pull.y * sign, pull.z * sign); owned.push(pullDir);
    const origin = new oc.gp_Pnt_3(at.x, at.y, at.z); owned.push(origin);
    const planeDir = new oc.gp_Dir_4(pull.x, pull.y, pull.z); owned.push(planeDir);
    const plane = new oc.gp_Pln_3(origin, planeDir); owned.push(plane);
    const maker = new oc.BRepOffsetAPI_DraftAngle_2(shape); owned.push(maker);
    const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); owned.push(explorer);
    let walls = 0;
    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current()); owned.push(face);
      const descriptor = faceDescriptor(oc, face);
      const alongPull = Math.abs(descriptor.normal.x * pull.x + descriptor.normal.y * pull.y + descriptor.normal.z * pull.z);
      if (alongPull < 0.999) { maker.Add(face, pullDir, Math.abs(angle), plane, true); walls++; }
      explorer.Next();
    }
    if (!walls) throw new Error("This extrusion has no wall to draft");
    if (!maker.AddDone()) throw new Error("The draft angle cannot be applied to this profile");
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    maker.Build(progress);
    if (!maker.IsDone?.()) throw new Error("OpenCascade extrusion draft failed");
    return maker.Shape();
  } finally { disposeAll(owned); }
}

function isOnOrIn(oc, state) {
  return state === oc.TopAbs_State.TopAbs_IN || state === oc.TopAbs_State.TopAbs_ON;
}

export function brepContainsPoint(brep, point, tol = 1e-5) {
  if (!brep?.shape) return false;
  return solidContainsPoint(brep.oc, brep.shape, point, tol);
}

function solidContainsPoint(oc, solid, point, tol = 1e-5) {
  const p = new oc.gp_Pnt_3(point.x || 0, point.y || 0, point.z || 0);
  const classifier = new oc.BRepClass3d_SolidClassifier_3(solid, p, tol);
  try { return isOnOrIn(oc, classifier.State()); }
  finally { classifier.delete(); p.delete(); }
}

export function rayHitsBrepFace(oc, origin, direction, face, skipNear = 1e-4) {
  if (!oc || !face) return null;
  const p = new oc.gp_Pnt_3(origin.x || 0, origin.y || 0, origin.z || 0);
  const d = new oc.gp_Dir_4(direction.x || 0, direction.y || 0, direction.z || 0);
  const line = new oc.gp_Lin_3(p, d);
  const inter = new oc.BRepIntCurveSurface_Inter();
  try {
    inter.Init_2(face, line, 1e-4);
    let best = null;
    while (inter.More()) {
      const w = inter.W();
      if (w > skipNear && isOnOrIn(oc, inter.State()) && (best == null || w < best)) best = w;
      inter.Next();
    }
    return best;
  } finally { inter.delete(); line.delete(); d.delete(); p.delete(); }
}

export function brepFaceLineIntersections(brep, reference, origin, direction) {
  const oc=brep?.oc;
  if(!oc || !brep.shape)throw new Error('Exact surface body is unavailable');
  const resolved=resolveTopologyReference(reference,createTopologyRegistry(brep.topology || []));
  if(!resolved.topology || resolved.status==='missing' || resolved.status==='ambiguous')throw new Error('The section surface reference is unavailable');
  const face=resolveBrepSubshape(brep,resolved.topology.persistentId,'face');
  if(!face)throw new Error('The native section surface is unavailable');
  if(!(Math.hypot(direction.x,direction.y,direction.z)>1e-9))throw new Error('The section intersection line is degenerate');
  const owned=[];
  try {
    const point=new oc.gp_Pnt_3(origin.x,origin.y,origin.z);owned.push(point);
    const axis=new oc.gp_Dir_4(direction.x,direction.y,direction.z);owned.push(axis);
    const line=new oc.gp_Lin_3(point,axis);owned.push(line);
    const inter=new oc.BRepIntCurveSurface_Inter();owned.push(inter);
    inter.Init_2(face,line,1e-7);
    const hits=[];
    while(inter.More()) {
      if(isOnOrIn(oc,inter.State())) {
        const p=inter.Pnt();
        try {const hit=pointOf(p);if(Object.values(hit).every(Number.isFinite)&&!hits.some(other=>Math.hypot(other.x-hit.x,other.y-hit.y,other.z-hit.z)<1e-7))hits.push(hit);}
        finally {p.delete();}
      }
      inter.Next();
    }
    return hits;
  }finally{disposeAll(owned);}
}

export function rayHitsExtendedBrepFace(oc, origin, direction, face, skipNear = 1e-4) {
  const bounded = rayHitsBrepFace(oc, origin, direction, face, skipNear);
  if (bounded != null) return bounded;
  const owned = [];
  try {
    const extended = enlargeFaceForSplit(oc, owned, face, 1e4);
    if (!extended || extended === face) return null;
    return rayHitsBrepFace(oc, origin, direction, extended, skipNear);
  } finally { disposeAll(owned); }
}

function enlargeFaceForSplit(oc, owned, face, reach) {
  const adaptor = new oc.BRepAdaptor_Surface_2(face, true); owned.push(adaptor);
  const kind = surfaceName(oc, adaptor.GetType());
  const pad = Math.max(Number(reach) || 0, 10);
  const vmin = adaptor.FirstVParameter(), vmax = adaptor.LastVParameter();
  const umin = adaptor.FirstUParameter(), umax = adaptor.LastUParameter();
  let maker;
  if (kind === "plane") {
    const plane = adaptor.Plane(); owned.push(plane);
    maker = new oc.BRepBuilderAPI_MakeFace_9(plane, -pad, pad, -pad, pad);
  } else if (kind === "cylinder") {
    const cylinder = adaptor.Cylinder(); owned.push(cylinder);
    maker = new oc.BRepBuilderAPI_MakeFace_10(cylinder, 0, Math.PI * 2, vmin - pad, vmax + pad);
  } else if (kind === "cone") {
    const cone = adaptor.Cone(); owned.push(cone);
    maker = new oc.BRepBuilderAPI_MakeFace_11(cone, 0, Math.PI * 2, vmin - pad, vmax + pad);
  } else {
    const surface = oc.BRep_Tool.Surface_2(face); owned.push(surface);
    maker = new oc.BRepBuilderAPI_MakeFace_14(surface, umin - pad, umax + pad, vmin - pad, vmax + pad, 1e-6);
  }
  owned.push(maker);
  if (!maker.IsDone?.()) return face;
  return maker.Face();
}

function joinSolidPieces(oc, pieces) {
  if (pieces.length === 1) return pieces[0].shape;
  const builder = new oc.TopoDS_Builder(), compound = new oc.TopoDS_Compound();
  builder.MakeCompound(compound);
  pieces.forEach((piece) => builder.Add(compound, piece.shape));
  builder.delete();
  return compound;
}

function loopCentroid(points) {
  const centroid = (points || []).reduce((sum, point) => ({
    u: sum.u + (Number(point.u ?? point.x) || 0),
    v: sum.v + (Number(point.v ?? point.y) || 0),
  }), { u: 0, v: 0 });
  if (points?.length) { centroid.u /= points.length; centroid.v /= points.length; }
  return centroid;
}

function extrusionSeedPoints(spec, mapPoint, depth) {
  const from = Number(spec.from) || 0;
  const step = Math.sign(depth || 1) * 1e-3;
  const loops = [spec.points || []];
  (spec.regions || []).forEach((entry) => loops.push(Array.isArray(entry) ? entry : entry?.points || []));
  return loops.filter((loop) => loop.length).map((loop) => {
    const centroid = loopCentroid(loop);
    return mapPoint(centroid.u, centroid.v, from + step);
  });
}

function keepSketchSidePieces(oc, pieces, spec, mapPoint, depth) {
  if (!pieces.length) return [];
  const seeds = extrusionSeedPoints(spec, mapPoint, depth);
  const inside = pieces.filter((piece) => seeds.some((seed) => solidContainsPoint(oc, piece.shape, seed)));
  if (inside.length) return inside;
  const axis = extrusionAxisVector(spec);
  const reverse = spec.direction === "reverse" || depth < 0 ? -1 : 1;
  const pull = { x: axis.x * reverse, y: axis.y * reverse, z: axis.z * reverse };
  const origin = mapPoint(0, 0, Number(spec.from) || 0);
  const along = (point) => (point.x - origin.x) * pull.x + (point.y - origin.y) * pull.y + (point.z - origin.z) * pull.z;
  const positive = pieces.filter((piece) => along(piece.centre) > -1e-4).sort((a, b) => along(a.centre) - along(b.centre));
  return positive[0] ? [positive[0]] : [];
}

function trimExtrusionUntilFace(oc, shape, spec, mapPoint, depth) {
  const owned = [];
  try {
    const bounds = shapeBounds(oc, shape);
    const reach = bounds
      ? Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) + 1
      : 10;
    const cutter = enlargeFaceForSplit(oc, owned, spec.untilFace, reach);
    const splitter = new oc.BRepAlgoAPI_Splitter_1(); owned.push(splitter);
    const args = new oc.TopTools_ListOfShape_1(), tools = new oc.TopTools_ListOfShape_1(); owned.push(args, tools);
    args.Append_1(shape); tools.Append_1(cutter);
    splitter.SetArguments(args); splitter.SetTools(tools);
    splitter.SetNonDestructive?.(true);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    splitter.Build(progress);
    if (splitter.HasErrors?.()) throw new Error(UP_TO_FACE_MISSED);
    const before = solidPieces(oc, shape);
    const pieces = solidPieces(oc, splitter.Shape());
    // Unchanged piece count means the face never parted the tool — including a
    // two-region compound that would otherwise survive as a silent through-all.
    if (pieces.length <= before.length) throw new Error(UP_TO_FACE_MISSED);
    const keep = keepSketchSidePieces(oc, pieces, spec, mapPoint, depth);
    pieces.filter((piece) => !keep.includes(piece)).forEach((piece) => piece.shape.delete?.());
    if (!keep.length) throw new Error(UP_TO_FACE_MISSED);
    return joinSolidPieces(oc, keep);
  } finally { disposeAll(owned); }
}

export async function makeBrepExtrusion(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    if (!Array.isArray(spec.points) || spec.points.length < 3) throw new Error("Extrusion needs a closed profile");
    let depth = Number(spec.to || 0) - Number(spec.from || 0);
    if (spec.untilFace) {
      const untilDepth = Number(spec.untilDepth);
      if (Number.isFinite(untilDepth) && Math.abs(untilDepth) >= 1e-9) depth = untilDepth;
      else depth = depth + Math.sign(depth || 1) * Math.max(1, Math.abs(depth) * 0.25);
    }
    // Fitting a circle to the samples is a guess; typed segments are a fact, so
    // they win — a 40-chord ellipse fits a circle rather well.
    const circle = spec.segments ? null : fitProfileCircle(spec.points);
    const holeLoops = (spec.holes || []).map((entry) => Array.isArray(entry)
      ? { points: entry }
      : { points: entry?.points || entry?.loop || [], segments: entry?.segments })
      .filter((loop) => loopSegments(loop) || loop.points.length >= 3);
    const islandLoops = (spec.regions || []).map((entry) => Array.isArray(entry)
      ? { points: entry }
      : { points: entry?.points || [], segments: entry?.segments })
      .filter((loop) => loopSegments(loop) || loop.points.length >= 3);
    const mapPoint = (u, v, w) => spec.frame
      ? framePoint(spec.frame, u, v, w)
      : spec.axis === "z" ? { x: u, y: v, z: w }
      : spec.axis === "x" ? { x: w, y: v, z: u }
      : { x: u, y: w, z: v };
    const axis = spec.frame
      ? spec.frame.normal
      : spec.axis === "z" ? { x: 0, y: 0, z: 1 }
      : spec.axis === "x" ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 };
    /* The draft is applied to the finished prism rather than folded into the
       profile, so it is exact for a circular or splined wall too, and so the
       undrafted build stays byte-for-byte what it always was. The neutral
       plane is the sketch plane, and the pull follows the material. */
    const draftAngle = ((Number(spec.draftAngle) || 0) * Math.PI) / 180;
    const finish = (shape) => {
      let built = shape;
      if (Math.abs(draftAngle) && Math.abs(depth) >= 1e-9) {
        const run = depth >= 0 ? 1 : -1;
        // `draftBase` names the plane the profile was drawn on when the run has
        // since been stretched past it (a through-all cut); otherwise it IS `from`.
        const base = mapPoint(0, 0, Number.isFinite(Number(spec.draftBase)) ? Number(spec.draftBase) : (spec.from || 0));
        built = draftPrismWalls(oc, built, {
          angle: draftAngle,
          axis: { x: (axis.x || 0) * run, y: (axis.y || 0) * run, z: (axis.z || 0) * run },
          at: base,
          outward: Number(spec.draftAngle) < 0 ? !spec.draftOutward : !!spec.draftOutward,
        });
      }
      if (spec.untilFace) built = trimExtrusionUntilFace(oc, built, spec, mapPoint, depth);
      return built;
    };
    if (circle && !holeLoops.length && !islandLoops.length) {
      const sign = depth >= 0 ? 1 : -1;
      const start = mapPoint(circle.u, circle.v, spec.from || 0);
      const p = new oc.gp_Pnt_3(start.x, start.y, start.z); owned.push(p);
      const dir = new oc.gp_Dir_4((axis.x || 0) * sign, (axis.y || 0) * sign, (axis.z || 0) * sign); owned.push(dir);
      const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
      const maker = new oc.BRepPrimAPI_MakeCylinder_3(axes, Math.max(1e-6, circle.radius), Math.max(1e-6, Math.abs(depth))); owned.push(maker);
      return { oc, shape: finish(maker.Shape()), kind: "solid" };
    }
    const place = (q) => mapPoint(q.u, q.v, spec.from || 0);
    const wireFor = (loop, reverse = false) => profileWire(oc, owned, loop, place, axis, { reverse });
    const outerLoop = spec.segments ? { points: spec.points, segments: spec.segments } : spec.points;
    // Winding has to be read off whatever actually becomes the wire: a typed
    // chain may be ordered differently from the analyzer's sampled points, and
    // a hole's reversal is decided against the outline's direction.
    /* A typed circle or ellipse is built counter-clockwise about the profile
       normal whatever order its samples come in, and on a plane whose (u, v)
       axes are mirrored against the normal (Top: u->x, v->z, normal y) the
       samples run the other way round. Reading their (u, v) winding then
       leaves a circular hole with the outline's own direction, so the face
       maker treats it as a second boss and the "hole" adds volume instead of
       removing it. Compare directions as they land in the world instead. */
    const winding = (loop) => {
      const typed = loopSegments(loop);
      if (typed && typed.length === 1 && (typed[0].type === "circle" || typed[0].type === "ellipse")) return 1;
      const world = (typed ? segmentProfilePoints(typed) : loopPoints(loop)).map(place);
      let sx = 0, sy = 0, sz = 0;
      world.forEach((p, index) => {
        const q = world[(index + 1) % world.length];
        sx += p.y * q.z - p.z * q.y; sy += p.z * q.x - p.x * q.z; sz += p.x * q.y - p.y * q.x;
      });
      return sx * (axis.x || 0) + sy * (axis.y || 0) + sz * (axis.z || 0);
    };
    const outerArea = winding(outerLoop);
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wireFor(outerLoop), true); owned.push(faceMaker);
    // OpenCascade uses opposite wire orientation to distinguish islands from
    // voids. Normalize either incoming convention instead of assuming that a
    // caller has already wound inner loops differently from the outline.
    holeLoops.forEach((loop) => faceMaker.Add(wireFor(loop, winding(loop) * outerArea > 0)));
    const vec = spec.frame
      ? new oc.gp_Vec_4(spec.frame.normal.x * depth, spec.frame.normal.y * depth, spec.frame.normal.z * depth)
      : spec.axis === "z" ? new oc.gp_Vec_4(0, 0, depth) : spec.axis === "x" ? new oc.gp_Vec_4(depth, 0, 0) : new oc.gp_Vec_4(0, depth, 0); owned.push(vec);
    const prism = new oc.BRepPrimAPI_MakePrism_1(faceMaker.Face(), vec, true, true); owned.push(prism);
    const solids = [{ shape: prism.Shape() }];
    islandLoops.forEach((loop) => {
      const maker = new oc.BRepBuilderAPI_MakeFace_15(wireFor(loop), true); owned.push(maker);
      const extra = new oc.BRepPrimAPI_MakePrism_1(maker.Face(), vec, true, true); owned.push(extra);
      solids.push({ shape: extra.Shape() });
    });
    return { oc, shape: finish(solids.length === 1 ? solids[0].shape : joinSolidPieces(oc, solids)), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepRevolve(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const points = spec.points || spec.pts;
    if (!Array.isArray(points) || points.length < 3) throw new Error("Revolve requires a closed profile");
    if (spec.radialProfile || spec.profileFrame) assertRevolveProfileFrame(points, spec);
    const loop = spec.segments ? { points, segments: spec.segments } : points;
    const interval=revolveInterval(spec);
    const axisName=spec.axis || "y", radial=!!spec.radialProfile;
    const coordinateSpec={...spec,x:0,y:0,z:0};
    const place=spec.profileFrame?q=>{
      const p=framePoint(spec.profileFrame,q.u,q.v,0),c=Math.cos(interval.start),s=Math.sin(interval.start);
      if(axisName==='x')return {x:p.x,y:p.y*c-p.z*s,z:p.y*s+p.z*c};
      if(axisName==='z')return {x:p.x*c-p.y*s,y:p.x*s+p.y*c,z:p.z};
      return {x:p.x*c+p.z*s,y:p.y,z:-p.x*s+p.z*c};
    }:radial?q=>revolvePoint(coordinateSpec,q,interval.start):q=>({x:q.u,y:q.v,z:0});
    const zero=place({u:0,v:0}),up=place({u:1,v:0}),vp=place({u:0,v:1});
    const u={x:up.x-zero.x,y:up.y-zero.y,z:up.z-zero.z},v={x:vp.x-zero.x,y:vp.y-zero.y,z:vp.z-zero.z};
    const normal={x:u.y*v.z-u.z*v.y,y:u.z*v.x-u.x*v.z,z:u.x*v.y-u.y*v.x};
    const wire=profileWire(oc,owned,loop,place,normal);
    const face=new oc.BRepBuilderAPI_MakeFace_15(wire,true);owned.push(face);
    const sign=spec.profileFrame?1:radial?(axisName==="y"?1:-1):spec.direction==="reverse"?-1:1;
    const origin=new oc.gp_Pnt_3(0,0,0),direction=new oc.gp_Dir_4(axisName==="x"?sign:0,axisName==="y"?sign:0,axisName==="z"?sign:0);owned.push(origin,direction);
    const axis=new oc.gp_Ax1_2(origin,direction);owned.push(axis);
    const maker=new oc.BRepPrimAPI_MakeRevol_1(face.Face(),axis,interval.span,true);owned.push(maker);
    if(radial && (spec.x || spec.y || spec.z)){
      const shift=new oc.gp_Trsf_1(),vector=new oc.gp_Vec_4(spec.x||0,spec.y||0,spec.z||0);owned.push(shift,vector);shift.SetTranslation_1(vector);
      const moved=new oc.BRepBuilderAPI_Transform_2(maker.Shape(),shift,true);owned.push(moved);
      return {oc,shape:moved.Shape(),kind:"solid"};
    }
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

const world = (q) => ({ x: Number(q.x ?? q.u) || 0, y: Number(q.y ?? q.v) || 0, z: Number(q.z ?? q.w) || 0 });

export async function makeBrepSweep(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const profileLoop = spec.profileSegments ? { points: spec.profile, segments: spec.profileSegments } : spec.profile;
    const pathLoop = spec.pathSegments ? { points: spec.path, segments: spec.pathSegments } : spec.path;
    const profilePoints = loopPoints(profileLoop).map(world), pathPoints = loopPoints(pathLoop).map(world);
    if (profilePoints.length < 3 || pathPoints.length < 2) throw new Error("Sweep requires a profile and path");
    const frames = pathFrames(pathPoints);
    if (!frames) throw new Error("Sweep path has no length");
    const spine = profileWire(oc, owned, pathLoop, (q) => world(q), frames[0].tangent, { close: false });
    const maker = new oc.BRepOffsetAPI_MakePipeShell(spine); owned.push(maker);
    // Frenet spins the section with the path's curvature; corrected Frenet is
    // the minimum-twist carry-along; a fixed binormal keeps one world axis up.
    const orientation = spec.orientation || "follow-path";
    if (orientation === "fixed") {
      const up = spec.binormal || { x: 0, y: 0, z: 1 };
      const parallel = Math.abs(frames[0].tangent.x * (up.x || 0) + frames[0].tangent.y * (up.y || 0) + frames[0].tangent.z * (up.z || 0)) > 0.999;
      const chosen = parallel ? frames[0].normal : up;
      const dir = new oc.gp_Dir_4(chosen.x || 0, chosen.y || 0, chosen.z || 0); owned.push(dir);
      maker.SetMode_3(dir);
    } else maker.SetMode_1(orientation === "follow-path");

    const twist = ((Number(spec.twistAngle) || 0) * Math.PI) / 180;
    const scale = Number(spec.scale) > 0 ? Number(spec.scale) : 1;
    const base = frames[0];
    // The profile expressed in the first station's frame, so every later
    // station can re-place it without OpenCascade having to guess a mapping.
    const localOf = (q) => {
      const p = world(q), d = { x: p.x - base.origin.x, y: p.y - base.origin.y, z: p.z - base.origin.z };
      return {
        u: d.x * base.normal.x + d.y * base.normal.y + d.z * base.normal.z,
        v: d.x * base.binormal.x + d.y * base.binormal.y + d.z * base.binormal.z,
        w: d.x * base.tangent.x + d.y * base.tangent.y + d.z * base.tangent.z,
      };
    };
    const placeAt = (frame, angle, factor) => (q) => {
      const local = localOf(q), cos = Math.cos(angle), sin = Math.sin(angle);
      const u = (local.u * cos - local.v * sin) * factor, v = (local.u * sin + local.v * cos) * factor;
      return {
        x: frame.origin.x + frame.normal.x * u + frame.binormal.x * v + frame.tangent.x * local.w,
        y: frame.origin.y + frame.normal.y * u + frame.binormal.y * v + frame.tangent.y * local.w,
        z: frame.origin.z + frame.normal.z * u + frame.binormal.z * v + frame.tangent.z * local.w,
      };
    };
    // With no twist or taper the sweep mode alone decides every intermediate
    // section, so pinning extra ones would only fight it. Otherwise pin enough
    // stations that a quarter turn is never interpolated across in one step.
    const stations = twist || scale !== 1
      ? Math.max(2, Math.ceil(Math.abs(twist) / (Math.PI / 4)) + 1)
      : 1;
    if (stations === 1) maker.Add_1(profileWire(oc, owned, profileLoop, (q) => world(q), base.tangent), false, false);
    else for (let i = 0; i < stations; i++) {
      const t = i / (stations - 1);
      // frames are sampled by arc length, so pick the one nearest this fraction
      let frame = frames[0];
      for (const candidate of frames) if (Math.abs(candidate.t - t) < Math.abs(frame.t - t)) frame = candidate;
      const place = placeAt(frame, twist * t, 1 + (scale - 1) * t);
      maker.Add_1(profileWire(oc, owned, profileLoop, place, frame.tangent), false, false);
    }
    if (!maker.IsReady()) throw new Error("Sweep profile and path are not compatible");
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    maker.Build(progress);
    if (!maker.IsDone()) throw new Error("Sweep could not be built");
    if (spec.solid !== false) maker.MakeSolid();
    return { oc, shape: maker.Shape(), kind: spec.solid === false ? "shell" : "solid" };
  } finally { disposeAll(owned); }
}

/* A LOFT BETWEEN TWO COAXIAL CIRCLES IS A CONE, AND ThruSections DOES NOT
   MAKE ONE.
   Given two circles it interpolates their rational poles linearly, which is a
   different surface from the cone through the same rims: a 2 -> 4 radius loft
   over height 10 measured 287.52 where the cone is 293.22. `ruled: true` does
   not help — it rules between the same poles. So the case is detected and
   handed to the primitive, which is exact by construction. Only this case:
   anything else is still ThruSections' job. */
function loftCircleSection(section) {
  const segments = loopSegments(section);
  if (segments) {
    // A typed circle IS the answer, and it was the case that mattered most:
    // an exactly drawn rim still got the interpolated wall. Its plane is the
    // one the wire would be built on, which is the step between sections, so
    // a null normal here means "square to the axis by construction".
    const only = segments.length === 1 ? segments[0] : null;
    if (!only || only.type !== "circle" || !(Number(only.radius) > 1e-9)) return null;
    return { centre: world(only.center || {}), normal: null, radius: Number(only.radius) };
  }
  const points = loopPoints(section).map(world);
  if (points.length < 12) return null;
  const n = points.length;
  const centre = points.reduce((sum, q) => ({ x: sum.x + q.x / n, y: sum.y + q.y / n, z: sum.z + q.z / n }), { x: 0, y: 0, z: 0 });
  // Newell's normal is stable for a closed ring however it is wound
  let normal = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    normal = { x: normal.x + (a.y - b.y) * (a.z + b.z), y: normal.y + (a.z - b.z) * (a.x + b.x), z: normal.z + (a.x - b.x) * (a.y + b.y) };
  }
  const size = Math.hypot(normal.x, normal.y, normal.z);
  if (!(size > 1e-9)) return null;
  normal = { x: normal.x / size, y: normal.y / size, z: normal.z / size };
  let radius = 0, perimeter = 0;
  const radii = points.map((q) => Math.hypot(q.x - centre.x, q.y - centre.y, q.z - centre.z));
  radius = radii.reduce((sum, r) => sum + r, 0) / n;
  if (!(radius > 1e-9)) return null;
  if (radii.some((r) => Math.abs(r - radius) > radius * 1e-3)) return null;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    perimeter += Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    // every point on one plane, or it is not a circle at all
    if (Math.abs((a.x - centre.x) * normal.x + (a.y - centre.y) * normal.y + (a.z - centre.z) * normal.z) > radius * 1e-3) return null;
  }
  // a hexagon inscribed in the same ring would pass every test above
  if (Math.abs(perimeter - 2 * Math.PI * radius) > 2 * Math.PI * radius * 0.06) return null;
  return { centre, normal, radius };
}

function loftConeSpec(spec) {
  const sections = spec.sections || [];
  if (spec.solid === false || sections.length !== 2) return null;
  const lower = loftCircleSection(sections[0]), upper = loftCircleSection(sections[1]);
  if (!lower || !upper) return null;
  const step = { x: upper.centre.x - lower.centre.x, y: upper.centre.y - lower.centre.y, z: upper.centre.z - lower.centre.z };
  const height = Math.hypot(step.x, step.y, step.z);
  if (!(height > 1e-9)) return null;
  const axis = { x: step.x / height, y: step.y / height, z: step.z / height };
  // coaxial means BOTH rims are square to the line joining their centres
  const square = (normal) => !normal || Math.abs(Math.abs(normal.x * axis.x + normal.y * axis.y + normal.z * axis.z) - 1) < 1e-6;
  if (!square(lower.normal) || !square(upper.normal)) return null;
  return { origin: lower.centre, axis, r1: lower.radius, r2: upper.radius, height };
}

export async function makeBrepLoft(spec) {
  const oc = await loadCadKernel(), owned = [], sections = (spec.sections || []).map((section,index)=>spec.sectionSegments?.[index]?.length ? {points:loopPoints(section),segments:spec.sectionSegments[index]} : section);
  try {
    if (sections.length < 2) throw new Error("Loft requires at least two profiles");
    const cone = loftConeSpec(spec);
    if (cone) {
      const p = new oc.gp_Pnt_3(cone.origin.x, cone.origin.y, cone.origin.z);
      const dir = new oc.gp_Dir_4(cone.axis.x, cone.axis.y, cone.axis.z); owned.push(p, dir);
      const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
      // equal radii is a cylinder; a cone of zero semi-angle is not a surface
      const maker = Math.abs(cone.r1 - cone.r2) < Math.max(cone.r1, cone.r2) * 1e-9
        ? new oc.BRepPrimAPI_MakeCylinder_3(axes, cone.r1, cone.height)
        : new oc.BRepPrimAPI_MakeCone_3(axes, cone.r1, cone.r2, cone.height);
      owned.push(maker);
      return { oc, shape: maker.Shape(), kind: "solid" };
    }
    const maker = new oc.BRepOffsetAPI_ThruSections(spec.solid !== false, !!spec.ruled, Math.max(1e-7,Number(spec.tolerance)||1e-6)); owned.push(maker);
    for (const section of sections) {
      const points = loopPoints(section).map(world);
      if (points.length === 1 && (section === sections[0] || section === sections[sections.length-1])) {
        const point=new oc.gp_Pnt_3(points[0].x,points[0].y,points[0].z);owned.push(point);
        const vertex=new oc.BRepBuilderAPI_MakeVertex(point);owned.push(vertex);
        const shape=vertex.Vertex();owned.push(shape);maker.AddVertex(shape);continue;
      }
      if (points.length < 2 && !loopSegments(section)) throw new Error("Loft section needs a closed profile");
      // Sections stack along their own run, so the plane a conic sits on is the
      // step to the next section (the last one borrows the step before it).
      const index = sections.indexOf(section), other = sections[index ? index - 1 : 1];
      const near = loopPoints(other).map(world)[0] || points[0];
      const away = points[0], step = index ? { x: away.x - near.x, y: away.y - near.y, z: away.z - near.z } : { x: near.x - away.x, y: near.y - away.y, z: near.z - away.z };
      const normal = Math.hypot(step.x, step.y, step.z) > 1e-9 ? step : { x: 0, y: 1, z: 0 };
      maker.AddWire(profileWire(oc, owned, section, (q) => world(q), normal));
    }
    /* Only meaningful for a smoothed loft: a ruled one is planar between
       neighbours by construction, and asking for tangency there does nothing. */
    const continuity = { position: "GeomAbs_C0", tangent: "GeomAbs_G1", curvature: "GeomAbs_G2" }[spec.continuity || "position"];
    if (!spec.ruled && continuity && oc.GeomAbs_Shape?.[continuity]) maker.SetContinuity(oc.GeomAbs_Shape[continuity]);
    const progress=new oc.Message_ProgressRange_1();owned.push(progress);
    maker.CheckCompatibility(spec.matchProfiles !== false); maker.Build(progress);
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepCone(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const r1 = Math.max(1e-6, Number(spec.r1 ?? (Number(spec.diameter1) || Number(spec.diameter) || 0) / 2) || 1e-6);
    const r2 = Math.max(0, Number(spec.r2 ?? (Number(spec.diameter2) || 0) / 2) || 0);
    const height = Math.max(1e-6, Math.abs(Number(spec.h ?? spec.depth ?? ((Number(spec.to) || 0) - (Number(spec.from) || 0)))) || 1e-6);
    const origin = spec.origin || { x: spec.x || 0, y: (spec.y || 0) + (Number(spec.from) || 0), z: spec.z || 0 };
    const axis = cylinderAxis(spec.axis),sign=Number(spec.h)<0?-1:1;
    const p = new oc.gp_Pnt_3(origin.x, origin.y, origin.z);
    const dir = new oc.gp_Dir_4(axis.x*sign, axis.y*sign, axis.z*sign); owned.push(p, dir);
    const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
    // _2 is (R1, R2, H, angle) and takes no axes; _3 is the placed one. Passing
    // a gp_Ax2 where a radius belongs built a shape of no volume at all.
    const maker = new oc.BRepPrimAPI_MakeCone_3(axes, r1, Math.max(1e-7, r2), height); owned.push(maker);
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

// Unit-density volume inertia about the centroid, in cm^5. Density scaling
// belongs to the mass report; the kernel must not assume a material.
export async function shapeSolidCount(brep) {
  if(!brep?.shape)throw new Error("Solid count requires an exact shape");
  const oc=brep.oc || await loadCadKernel();
  const explorer=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count=0;
  try{while(explorer.More()){count++;explorer.Next();}return count;}
  finally{explorer.delete();}
}

export async function shapeMassProperties(brep) {
  if (!brep?.shape) throw new Error("Mass properties require an exact solid");
  const oc = brep.oc || await loadCadKernel(), owned = [];
  try {
    const props = new oc.GProp_GProps_1(); owned.push(props);
    oc.BRepGProp.VolumeProperties_1(brep.shape, props, true, false, false);
    const volume = props.Mass(), centre = props.CentreOfMass(), matrix = props.MatrixOfInertia();
    owned.push(centre, matrix);
    const centerOfMass = {x:centre.X(), y:centre.Y(), z:centre.Z()};
    const inertia = Array.from({length:3}, (_,i) => Array.from({length:3}, (_,j) => matrix.Value(i+1,j+1)));
    if (!(volume > 0) || ![volume,...Object.values(centerOfMass),...inertia.flat()].every(Number.isFinite)) throw new Error("Body has no measurable closed solid volume");
    return {volume, centerOfMass, inertia, solidCount:await shapeSolidCount(brep), bounds:shapeBounds(oc, brep.shape, false)};
  } finally { disposeAll(owned); }
}

export async function makeBrepHoleTool(spec, target) {
  if(!target?.shape)throw new Error("Hole target is unavailable");
  const oc=target.oc||await loadCadKernel(),bounds=shapeBounds(oc,target.shape),tools=[];
  try{
    for(const placement of holeToolPlacements(spec,bounds)){
      const diameter=Number(spec.diameter||spec.diameter1);
      if(!Number.isFinite(diameter)||diameter<=0)throw new Error("Hole diameter must be positive");
      const tool=spec.kind==="cone"
        ? await makeBrepCone({origin:placement.origin,axis:placement.axis,r1:diameter/2,r2:Number(spec.diameter2)/2,h:placement.depth})
        : await makeBrepPrimitive({type:"cylinder",...placement.origin,axis:placement.axis,r:diameter/2,h:placement.depth});
      tools.push(tool);
      if (spec.requireIntersection) {
        const common = await booleanBrep("intersect", target, tool);
        try {
          if (!(shapeVolume(oc, common.shape) > 1e-10)) throw new Error("Hole cutter misses the target material");
        } finally { disposeBrep(common); }
      }
    }
    return await compoundBrep(tools);
  }finally{tools.forEach(disposeBrep);}
}

export async function makeBrepHelicalPipe(spec) {
  return makeBrepSweep({ profile: spec.profile, path: spec.path });
}

function buildBoolean(oc, operation, leftShape, rightShape) {
  const progress = new oc.Message_ProgressRange_1();
  const argumentList = new oc.TopTools_ListOfShape_1(), toolList = new oc.TopTools_ListOfShape_1();
  let algorithm;
  try {
    /* Built once, non-destructive from the start. The one-step constructors
       run the operation immediately (destructively, loosening the inputs);
       switching to non-destructive and building again then worked from those
       loosened inputs, and on HOUSING's exact shell the rebuilt Boss-Stop
       union counted the ring twice (179.8 cm³ instead of 165.5). */
    if (operation === "union") algorithm = new oc.BRepAlgoAPI_Fuse_1();
    else if (operation === "subtract") algorithm = new oc.BRepAlgoAPI_Cut_1();
    else if (operation === "intersect") algorithm = new oc.BRepAlgoAPI_Common_1();
    else throw new Error("Unknown boolean operation: " + operation);
    argumentList.Append_1(leftShape); toolList.Append_1(rightShape);
    algorithm.SetArguments(argumentList); algorithm.SetTools(toolList);
    algorithm.SetNonDestructive(true);
    algorithm.Build(progress);
    if (algorithm.HasErrors?.()) throw new Error("OpenCascade boolean failed");
    return algorithm.Shape();
  } finally {
    algorithm?.delete?.(); progress.delete(); argumentList.delete(); toolList.delete();
  }
}

function shapeMaxTolerance(oc, shape) {
  const analysis = new oc.ShapeAnalysis_ShapeTolerance();
  try { return analysis.Tolerance(shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); } finally { analysis.delete(); }
}

export async function booleanBrep(operation, left, right) {
  if (!left?.shape || !right?.shape) throw new Error("Boolean operands must be BREP shapes");
  const oc = left.oc || right.oc || await loadCadKernel();
  let shape = buildBoolean(oc, operation, left.shape, right.shape);
  const vl = Math.abs(shapeVolume(oc, left.shape)), vr = Math.abs(shapeVolume(oc, right.shape)), vs = Math.abs(shapeVolume(oc, shape));
  if (vl > 1e-9 && vr > 1e-9 && !booleanVolumePlausible(operation, vl, vr, vs)) {
    throw new Error("OpenCascade " + operation + " lost material (" + vl.toFixed(3) + " and " + vr.toFixed(3) + " cm³ gave " + vs.toFixed(3) + " cm³); an input solid is likely invalid");
  }
  /* A union whose operands share a surface over part of their overlap can come
     back with a vertex far looser than either operand (HOUSING's Boss-Stop ring
     lies on Shell1's inner cylinder and gave 0.28 cm vertices, blocking export).
     The same union built as left ∪ (right − left) only has to join shapes that
     touch, and stays tight, so it is tried when the first result is loose. */
  if (operation === "union") {
    const looseness = shapeMaxTolerance(oc, shape), inputs = Math.max(shapeMaxTolerance(oc, left.shape), shapeMaxTolerance(oc, right.shape));
    if (looseness > 1e-3 && looseness > 10 * inputs) {
      try {
        const outside = buildBoolean(oc, "subtract", right.shape, left.shape);
        try {
          const joined = buildBoolean(oc, "union", left.shape, outside);
          const vj = Math.abs(shapeVolume(oc, joined));
          if (booleanVolumePlausible("union", vl, vr, vj) && shapeIsValid(oc, joined) && shapeMaxTolerance(oc, joined) < looseness) { shape.delete?.(); shape = joined; }
          else joined.delete?.();
        } finally { outside.delete?.(); }
      } catch (_) { /* keep the first result */ }
    }
  }
  return { oc, shape, kind: "solid", operation };
}

/* A boolean on an invalid operand can "succeed" and silently drop most of a
   body: HOUSING's Boss-Stop ring (11.4 cm³) fused onto Shell1 (917 cm³, one
   invalid offset face) came back as a 38 cm³ tube and rebuilt without an issue.
   A union is never smaller than its larger operand nor larger than both; a cut
   never grows what it cuts nor removes more than the tool; a common is never
   larger than the smaller operand. */
export function booleanVolumePlausible(operation, left, right, result, tolerance = 1e-3) {
  if (![left, right, result].every(Number.isFinite)) return true;
  const slack = tolerance * Math.max(1, left, right);
  if (operation === "union") return result >= Math.max(left, right) - slack && result <= left + right + slack;
  if (operation === "subtract") return result <= left + slack && result >= left - right - slack;
  if (operation === "intersect") return result <= Math.min(left, right) + slack;
  return true;
}

function shapeIsValid(oc, shape) {
  const analyzer = new oc.BRepCheck_Analyzer(shape, true, false);
  try { return analyzer.IsValid_2(); } finally { analyzer.delete(); }
}

/* Per-edge radii, normalised once.
 *
 * `edgeRadii` is a list of {id, radius, endRadius} written by the edge list in
 * the feature form. Ids are persistent topology ids, so an override survives a
 * rebuild that reorders the explorer; an id that no longer resolves is simply
 * not applied rather than shifting onto whatever edge now sits in that slot.
 * A missing or non-positive number falls back to the feature-wide value, which
 * is what makes "variable on two edges, constant on the rest" one feature. */
function filletRadiusOverrides(brep, options = {}) {
  const list = Array.isArray(options.edgeRadii) ? options.edgeRadii : [];
  const resolved = [];
  list.forEach((entry) => {
    const id = entry && (entry.id || entry.persistentId);
    if (!id) return;
    const shape = resolveBrepSubshape(brep, id, "edge");
    if (!shape) return;
    resolved.push({
      shape,
      startPoint: entry.startPoint,
      radius: Number(entry.radius) > 0 ? Number(entry.radius) : null,
      endRadius: Number(entry.endRadius) > 0 ? Number(entry.endRadius) : null,
    });
  });
  return resolved;
}

function filletEdgeRadius(edge, overrides, base, options = {}) {
  const match = overrides.find((entry) => entry.shape.IsSame(edge));
  const start = Math.max(1e-6, (match && match.radius) || base);
  if (!options.variableRadius) return { start, end: start };
  const declared = (match && match.endRadius) || (Number(options.endRadius) > 0 ? Number(options.endRadius) : null);
  return { start, end: Math.max(1e-6, declared || start) };
}

// Apply a real 3D fillet to a BREP result.  The lightweight editor used to
// round only the 2D profile that happened to be facing the camera; that cannot
// reproduce a CAD workflow where outside and bore edges on several faces are
// selected together.  OpenCascade owns that topology operation here.
// Three-face full round for a constant-width planar land. The two rolling
// fillets meet within the kernel's linear tolerance; the sub-tolerance retreat
// avoids OCCT rejecting two contours at an exactly coincident seam. Straight
// parallel boundaries cover a rectangular or rounded-rectangle rim; concentric
// circular boundaries cover the annular rim between two cylindrical walls.
export function fullRoundFilletDefinition(brep, faceIds) {
  if(!Array.isArray(faceIds) || faceIds.length!==3 || new Set(faceIds).size!==3)throw new Error("Full round needs three faces: side 1, center, side 2 (received "+(faceIds?.length || 0)+")");
  const entries=faceIds.map(id=>brep.subshapes?.get(id));
  if(entries.some(entry=>entry?.kind!=="face") || entries[1].descriptor?.surface!=="plane")throw new Error("Full round needs a planar center face");
  const [side1,center,side2]=entries,oc=brep.oc;
  const sideTypes=[side1.descriptor.surface,side2.descriptor.surface];
  if(!sideTypes.every(type=>type==="plane")&&!sideTypes.every(type=>type==="cylinder"))throw new Error("Full round needs two planar walls or two cylindrical walls around the center face");
  const common=side=>Array.from(brep.subshapes).filter(([,entry])=>entry.kind==='edge'&&edgeOnAnyFace(oc,entry.shape,[center.shape])&&edgeOnAnyFace(oc,entry.shape,[side.shape]));
  const first=common(side1),second=common(side2);
  if(!first.length||!second.length)throw new Error("Both side faces must border the center face");
  const normal=center.descriptor.normal;
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const tangent=side=>side.descriptor.surface==="cylinder" ? 1 : Math.tan(Math.acos(Math.max(-1,Math.min(1,dot(normal,side.descriptor.normal))))/2);
  const denominator=tangent(side1)+tangent(side2);
  const pairs=[];
  for(const a of first)for(const b of second){
    const x=a[1].descriptor,y=b[1].descriptor;
    let width=0;
    if(sideTypes[0]==="plane" && x.curve==='line'&&y.curve==='line'&&x.axis&&y.axis&&Math.abs(dot(x.axis,y.axis))>.999999){
      const delta={x:y.origin.x-x.origin.x,y:y.origin.y-x.origin.y,z:y.origin.z-x.origin.z};
      const along=dot(delta,x.axis);
      width=Math.sqrt(Math.max(0,dot(delta,delta)-along*along));
    }else if(sideTypes[0]==="cylinder" && x.curve==='circle'&&y.curve==='circle'&&x.axis&&y.axis&&Math.abs(dot(x.axis,y.axis))>.999999){
      const delta={x:y.origin.x-x.origin.x,y:y.origin.y-x.origin.y,z:y.origin.z-x.origin.z};
      if(Math.hypot(delta.x,delta.y,delta.z)<1e-5)width=Math.abs(x.radius-y.radius);
    }
    if(width>1e-6)pairs.push({ids:[a[0],b[0]],width});
  }
  if(pairs.length!==1||!(denominator>1e-6))throw new Error("Full round needs one pair of parallel straight or concentric circular boundaries on the selected center face");
  const radius=pairs[0].width/denominator;
  // Two closed circular contours need slightly more separation than two open
  // straight contours for OCCT to sew their toroidal meeting seam reliably.
  const retreat=sideTypes[0]==="cylinder" ? 1e-5 : 1e-8;
  if(radius<=retreat)throw new Error("Full round land is too narrow for a stable fillet");
  return {radius:radius-retreat,nominalRadius:radius,edgePersistentIds:pairs[0].ids};
}

export async function filletBrep(brep, radius, options = {}) {
  if(options.fullRound){
    const definition=fullRoundFilletDefinition(brep,options.facePersistentIds || options.faces);
    return filletBrep(brep,definition.radius,{...options,fullRound:false,variableRadius:false,edgeRadii:[],facePersistentIds:[],faces:[],edgePersistentIds:definition.edgePersistentIds,propagation:"tangent"});
  }
  if (!brep?.shape) throw new Error("Fillet needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const section = {
    rational: oc.ChFi3d_FilletShape.ChFi3d_Rational,
    "quasi-angular": oc.ChFi3d_FilletShape.ChFi3d_QuasiAngular,
    polynomial: oc.ChFi3d_FilletShape.ChFi3d_Polynomial,
  }[options.section] || oc.ChFi3d_FilletShape.ChFi3d_Rational;
  const maker = new oc.BRepFilletAPI_MakeFillet(
    brep.shape,
    section,
  );
  const explorer = new oc.TopExp_Explorer_2(
    brep.shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  const progress = new oc.Message_ProgressRange_1();
  let count = 0;
  // OpenCascade always grows a selected edge into its geometrically tangent
  // contour. "feature" deliberately widens that source selection to every
  // edge; "tangent" leaves the kernel contour as the source of truth.
  const finish = finishEdgeSelection(brep, options);
  const overrides = filletRadiusOverrides(brep, options);
  const baseRadius = Math.max(1e-6, Number(radius) || 0);
  const seenEdges = [];
  const targetEdges = [];
  let added = 0;
  try {
    /* OCCT fillets are already tangent to the support faces. Asking for C1
       again with a 1° tolerance is what made ordinary box edges report
       "Preview unavailable" while the selection note still said the edge
       was valid. Only curvature is an extra request. */
    if (options.continuity === "curvature") maker.SetContinuity(oc.GeomAbs_Shape.GeomAbs_C2, Math.PI / 180);
    while (explorer.More()) {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      if (seenEdges.some((candidate) => candidate.IsSame(edge))) {
        edge.delete?.();
        explorer.Next();
        continue;
      }
      seenEdges.push(edge);
      const selectedById = edgeIsFinishTarget(brep, edge, finish);
      if (selectedById && (!options.filter || options.filter(count, explorer.Current()))) {
        targetEdges.push(edge);
        /* Add_3(R1, R2, E) is the variable-radius overload: R1 lands on the
           contour's first vertex, R2 on its last, and OCCT interpolates a linear
           law between them along the contour the edge grows into. Equal ends
           would be that law with zero slope — Add_2 is the cheaper, and the
           only one whose round comes back as an analytic cylinder or torus
           rather than as a fitted surface. */
        const { start, end } = filletEdgeRadius(edge, overrides, baseRadius, options);
        if (Math.abs(start - end) > 1e-9) {
          maker.Add_3(start, end, edge);
          const anchor = overrides.find(entry => entry.shape.IsSame(edge))?.startPoint;
          if (anchor) {
            if (![anchor.x,anchor.y,anchor.z].every(Number.isFinite)) throw new Error("Fillet start anchor is invalid");
            const contour = maker.Contour(edge), first = maker.FirstVertex(contour), last = maker.LastVertex(contour);
            const a = oc.BRep_Tool.Pnt(first), b = oc.BRep_Tool.Pnt(last);
            try {
              const da = Math.hypot(a.X()-anchor.x,a.Y()-anchor.y,a.Z()-anchor.z);
              const db = Math.hypot(b.X()-anchor.x,b.Y()-anchor.y,b.Z()-anchor.z);
              if (Math.min(da,db)>1e-4 || Math.abs(da-db)<1e-7) throw new Error("Fillet start anchor no longer resolves to a contour endpoint; reselect the edge");
              if (db<da) {
                let edgeIndex=0;
                for(let index=1;index<=maker.NbEdges(contour);index++) {
                  const candidate=maker.Edge(contour,index);
                  try {if(candidate.IsSame(edge)){edgeIndex=index;break;}} finally {candidate.delete();}
                }
                if(!edgeIndex)throw new Error("Fillet edge no longer belongs to its contour");
                maker.SetRadius_2(end,start,contour,edgeIndex);
              }
            } finally {a.delete();b.delete();first.delete();last.delete();}
          }
        }
        else maker.Add_2(start, edge);
        added++;
      }
      count++;
      explorer.Next();
    }
    if (!added) throw new Error("Fillet has no resolved edges");
    maker.Build(progress);
    if (maker.HasErrors?.() || !maker.IsDone?.()) throw new Error("OpenCascade fillet failed");
    let shape=maker.Shape();
    // IsDone only reports that OCCT built a result. Interacting contours can
    // still leave an open or invalid shell, which cannot represent this solid
    // feature or supply exact mass properties.
    const props=new oc.GProp_GProps_1();
    try {
      oc.BRepGProp.VolumeProperties_1(shape, props, true, false, false);
      if(!shapeHasSolid(oc,shape) || !shapeIsValid(oc,shape) || !(props.Mass()>0)) {
        shape.delete?.();
        // Coplanar boundaries left by a Boolean can make interacting contours
        // build an invalid shell. Remove only redundant face boundaries and
        // retry when every chosen edge is still the identical kernel edge.
        // A filter on the retry prevents contour selection from widening.
        if(!options.filter && targetEdges.length) {
          const unified=await unifyBrepFaces(brep);
          const walker=new oc.TopExp_Explorer_2(unified.shape,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          const retained=new Set();
          try {
            while(walker.More()) {
              const candidate=walker.Current();
              try {targetEdges.forEach((target,index)=>{if(target.IsSame(candidate))retained.add(index);});}
              finally {candidate.delete?.();}
              walker.Next();
            }
            const originalVolume=shapeVolume(oc,brep.shape),unifiedVolume=shapeVolume(oc,unified.shape);
            if(retained.size===targetEdges.length && shapeIsValid(oc,unified.shape) && Math.abs(originalVolume-unifiedVolume)<=Math.max(1e-8,Math.abs(originalVolume)*1e-9)) {
              return await filletBrep({...brep,shape:unified.shape},radius,{...options,propagation:"feature",filter:(_index,candidate)=>targetEdges.some(target=>target.IsSame(candidate))});
            }
          } finally {walker.delete();unified.shape.delete?.();}
        }
        throw new Error("Fillet did not produce a valid closed solid; change the selected edges or split the fillet into separate features");
      }
    } finally {props.delete();}
    const repaired = repairFilletCornerPatches(oc, shape);
    if (repaired) { shape.delete(); shape = repaired; }
    return { oc, shape, kind: "solid", operation: "fillet" };
  } finally {
    disposeAll(seenEdges);
    explorer.delete(); progress.delete(); maker.delete();
  }
}

function selectedBrepSubshapes(brep, kind, persistentIds = []) {
  const selected = new Set(persistentIds || []), matches = [];
  if (!selected.size || !brep?.subshapes) return matches;
  selected.forEach((persistentId) => {
    const shape = resolveBrepSubshape(brep, persistentId, kind);
    if (shape && !matches.some((candidate) => candidate.IsSame(shape))) matches.push(shape);
  });
  return matches;
}

function edgeOnAnyFace(oc, edge, faces) {
  for (const face of faces || []) {
    const explorer = new oc.TopExp_Explorer_2(
      face,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
    );
    try {
      while (explorer.More()) {
        const faceEdge = oc.TopoDS.Edge_1(explorer.Current());
        const matches = faceEdge.IsSame(edge);
        faceEdge.delete?.();
        if (matches) return true;
        explorer.Next();
      }
    } finally { explorer.delete(); }
  }
  return false;
}

/* Fillet/chamfer accept an explicit edge list, or a face (every bounding
   edge). Empty edge ids used to mean "the whole body"; a face pick must not
   fall through to that, or selecting a lid would chamfer every rib. */
function finishEdgeSelection(brep, options = {}) {
  const edgeIds = options.edgePersistentIds || options.edges || [];
  const faceIds = options.facePersistentIds || options.faces || [];
  return {
    edgeIds,
    faces: selectedBrepSubshapes(brep, "face", faceIds),
    restrict: options.propagation === "feature" ? false : !!(edgeIds.length || faceIds.length),
  };
}

function edgeIsFinishTarget(brep, edge, selection) {
  if (!selection?.restrict) return true;
  if (selection.edgeIds && selection.edgeIds.length && brep.subshapes) {
    for (const persistentId of selection.edgeIds) {
      const candidate = resolveBrepSubshape(brep, persistentId, "edge");
      if (candidate?.IsSame(edge)) return true;
    }
  }
  return !!(selection.faces && selection.faces.length && edgeOnAnyFace(brep.oc, edge, selection.faces));
}

// Chamfers, like fillets, consume persistent edge references rather than
// explorer positions.  This keeps the operation stable when an upstream edit
// changes OpenCascade's internal traversal order.
// The rolling chamfer can fail when a concave bevel consumes the complete
// cylinder wall. Only this closed circular floor/open-wall limit is rebuilt.
async function limitingConcaveCircularChamfer(brep, edge, distance, options) {
  const mode=options.mode || 'equal-distance';
  if(mode!=='equal-distance' && !(mode==='distance-angle' && Math.abs(Number(options.angle)-45)<1e-10))return null;
  const oc=brep.oc,entries=[];
  for(const entry of brep.subshapes?.values() || []){
    if(!entries.some(prior=>prior.kind===entry.kind && prior.shape.IsSame(entry.shape)))entries.push(entry);
  }
  const selected=entries.find(e=>e.kind==='edge' && e.shape.IsSame(edge)),circle=selected?.descriptor;
  if(circle?.curve!=='circle' || !(circle.radius>distance))return null;
  const adjacent=entries.filter(e=>e.kind==='face' && edgeOnAnyFace(oc,edge,[e.shape]));
  if(adjacent.length!==2)return null;
  const floor=adjacent.find(e=>e.descriptor.surface==='plane'),wall=adjacent.find(e=>e.descriptor.surface==='cylinder');
  if(!floor || !wall)return null;
  const cylinder=wall.descriptor,axis=cylinder.axis,base=cylinder.referenceOrigin,range=cylinder.axisRange,origin=circle.origin;
  if(!axis || !base || !range || Math.abs(cylinder.radius-circle.radius)>1e-8)return null;
  const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
  const relative=p=>({x:p.x-origin.x,y:p.y-origin.y,z:p.z-origin.z});
  const height=Math.abs(range[1]-range[0]);
  if(Math.abs(height-distance)>1e-8 || Math.abs(Math.abs(dot(floor.descriptor.normal,axis))-1)>1e-8)return null;
  const station=dot({x:origin.x-base.x,y:origin.y-base.y,z:origin.z-base.z},axis);
  const nearStart=Math.abs(station-range[0])<1e-8,nearEnd=Math.abs(station-range[1])<1e-8;
  if(!nearStart && !nearEnd)return null;
  if(Math.abs(cylinder.measure-2*Math.PI*circle.radius*height)>1e-7)return null;
  const pull={x:axis.x*(nearStart?1:-1),y:axis.y*(nearStart?1:-1),z:axis.z*(nearStart?1:-1)};
  const borders=entries.filter(e=>e.kind==='edge' && edgeOnAnyFace(oc,e.shape,[floor.shape]));
  if(!borders.length || borders.some(e=>{
    const d=e.descriptor;
    return d.curve!=='circle' || Math.hypot(...Object.values(relative(d.origin)))>1e-8
      || (Math.abs(d.radius-circle.radius)>1e-8 && d.radius>circle.radius-distance+1e-8);
  }))return null;
  const radial=normalizedVector(Math.abs(pull.x)<.8?{x:0,y:pull.z,z:-pull.y}:{x:-pull.z,y:0,z:pull.x});
  const transverse={x:pull.y*radial.z-pull.z*radial.y,y:pull.z*radial.x-pull.x*radial.z,z:pull.x*radial.y-pull.y*radial.x};
  const at=(r,t,a=0)=>({x:origin.x+pull.x*t+r*(radial.x*Math.cos(a)+transverse.x*Math.sin(a)),y:origin.y+pull.y*t+r*(radial.y*Math.cos(a)+transverse.y*Math.sin(a)),z:origin.z+pull.z*t+r*(radial.z*Math.cos(a)+transverse.z*Math.sin(a))});
  const epsilon=Math.min(distance/20,1e-3),radius=circle.radius;
  for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
    if(solidContainsPoint(oc,brep.shape,at(radius-epsilon,epsilon,angle))
      || !solidContainsPoint(oc,brep.shape,at(radius+epsilon,epsilon,angle))
      || !solidContainsPoint(oc,brep.shape,at(radius-epsilon,-epsilon,angle))
      || solidContainsPoint(oc,brep.shape,at(radius-epsilon,height+epsilon,angle)))return null;
  }
  let outer,inner,wedge,result;
  try{
    outer=await makeBrepPrimitive({type:'cylinder',...origin,axis:pull,r:radius,h:height});
    inner=await makeBrepCone({origin,axis:pull,r1:radius-distance,r2:radius,h:height});
    wedge=await booleanBrep('subtract',outer,inner);
    result=await booleanBrep('union',brep,wedge);
    const gain=shapeVolume(oc,result.shape)-shapeVolume(oc,brep.shape),expected=Math.PI*height*(radius*distance-distance*distance/3);
    if(!shapeIsValid(oc,result.shape) || Math.abs(gain-expected)>1e-7 || await shapeSolidCount(result)!==await shapeSolidCount(brep)){disposeBrep(result);return null;}
    return {...result,operation:'chamfer'};
  }finally{if(outer)disposeBrep(outer);if(inner)disposeBrep(inner);if(wedge)disposeBrep(wedge);}
}

export async function chamferBrep(brep, distance, options = {}) {
  if (!brep?.shape) throw new Error("Chamfer needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  if(options.mode && options.mode!=="equal-distance" && !brep.subshapes?.size)extractBrepTopology(brep);
  const maker = new oc.BRepFilletAPI_MakeChamfer(brep.shape);
  const progress = new oc.Message_ProgressRange_1();
  const finish = finishEdgeSelection(brep, options);
  const explorer = new oc.TopExp_Explorer_2(
    brep.shape,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  const seenEdges = [];
  let added = 0;
  const mode = options.mode || "equal-distance";
  const firstDistance = Math.max(1e-6, Number(distance) || 0);
  const secondDistance = Math.max(1e-6, Number(options.secondDistance) || 0);
  const angleRadians = Math.max(1e-9, Math.min(Math.PI / 2 - 1e-9, Number(options.angle) * Math.PI / 180));

  // The asymmetric OCCT overloads need a face to identify the side on which
  // Distance 1 is measured. Topology ids give us a deterministic side; flip
  // selects the other face instead of numerically swapping user parameters.
  const referenceFaceFor = (edge) => {
    const adjacent = [];
    const faces = Array.from(brep.subshapes || [])
      .filter(([, entry]) => entry.kind === "face")
      .sort(([left], [right]) => String(left).localeCompare(String(right)));
    for (const [persistentId, entry] of faces) {
      const faceExplorer = new oc.TopExp_Explorer_2(
        entry.shape,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
      );
      try {
        while (faceExplorer.More()) {
          const faceEdge = oc.TopoDS.Edge_1(faceExplorer.Current());
          const matches = faceEdge.IsSame(edge);
          faceEdge.delete?.();
          if (matches) { adjacent.push({ persistentId, shape: entry.shape }); break; }
          faceExplorer.Next();
        }
      } finally { faceExplorer.delete(); }
    }
    if (!adjacent.length) throw new Error("Chamfer could not resolve an adjacent reference face");
    return adjacent[options.flip && adjacent.length > 1 ? adjacent.length - 1 : 0].shape;
  };
  try {
    while (explorer.More()) {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      if (seenEdges.some((candidate) => candidate.IsSame(edge))) {
        edge.delete?.(); explorer.Next(); continue;
      }
      seenEdges.push(edge);
      const chosen = edgeIsFinishTarget(brep, edge, finish);
      if (chosen && (!options.filter || options.filter(added, explorer.Current()))) {
        if (mode === "two-distance") {
          maker.Add_3(firstDistance, secondDistance, edge, referenceFaceFor(edge));
        } else if (mode === "distance-angle") {
          if (!Number.isFinite(angleRadians)) throw new Error("Chamfer angle must be a number in degrees");
          maker.AddDA(firstDistance, angleRadians, edge, referenceFaceFor(edge));
        } else {
          maker.Add_2(firstDistance, edge);
        }
        added++;
      }
      explorer.Next();
    }
    if (!added) throw new Error("Chamfer has no resolved edges");
    maker.Build(progress);
    if (maker.HasErrors?.() || !maker.IsDone?.()) {
      if(added===1 && finish.restrict && !options.filter){
        const selected=seenEdges.find(edge=>edgeIsFinishTarget(brep,edge,finish));
        const repaired=selected && await limitingConcaveCircularChamfer(brep,selected,firstDistance,options);
        if(repaired)return repaired;
      }
      throw new Error("OpenCascade chamfer failed");
    }
    return { oc, shape: maker.Shape(), kind: "solid", operation: "chamfer" };
  } finally {
    disposeAll(seenEdges);
    explorer.delete(); progress.delete(); maker.delete();
  }
}

// Remove the selected faces and offset the remaining skin inward.  A shell is
// intentionally face-driven: silently choosing an arbitrary opening would make
// rebuild intent depend on topology enumeration order.
export async function shellBrep(brep, thickness, options = {}) {
  if (!brep?.shape) throw new Error("Shell needs a BREP shape");
  const overrides = shellFaceThicknesses(options.faceThicknesses, thickness, options.direction);
  if (overrides.length) return shellWithPlanarThicknesses(brep, thickness, options, overrides);
  const oc = brep.oc || await loadCadKernel();
  const faceIds = options.facePersistentIds || options.faces || [];
  const selected = selectedBrepSubshapes(brep, "face", faceIds);
  if (!selected.length) throw new Error("Shell needs at least one resolved face to remove");
  /* Every attempt works on a deep copy. OpenCascade's join offset edits its
     input's tolerances in place (HOUSING's body went from 1e-7 to 1e-3), and
     booleans share untouched faces with their operands, so shelling the
     caller's body directly loosened the features before the shell and every
     later attempt. */
  const copier = new oc.BRepBuilderAPI_Copy_2(brep.shape, true, false);
  const source = { ...brep, shape: copier.Shape() };
  const faces = selected.map((face) => {
    const copied = oc.TopoDS.Face_1(copier.ModifiedShape(face));
    // ModifiedShape returns an unoriented face handle for some cuts. Preserve
    // the picked face's outward direction or the offset may hollow the wrong
    // side while still producing a formally valid solid.
    copied.Orientation_2(face.Orientation_1());
    return copied;
  });
  copier.delete();
  brep = source;

  const closingFaces = new oc.TopTools_ListOfShape_1();
  const maker = new oc.BRepOffsetAPI_MakeThickSolid();
  const progress = new oc.Message_ProgressRange_1();
  try {
    faces.forEach((face) => closingFaces.Append_1(face));
    maker.MakeThickSolidByJoin(
      brep.shape,
      closingFaces,
      (options.direction === "outside" ? 1 : -1) * Math.max(1e-6, Number(thickness) || 0),
      Math.max(1e-7, Number(options.tolerance) || 1e-4),
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      options.join === "intersection" ? oc.GeomAbs_JoinType.GeomAbs_Intersection : oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress,
    );
    if (maker.HasErrors?.() || !maker.IsDone?.()) return await shellFallbacks(brep, faces, thickness, options);
    const shelled = maker.Shape();
    /* OpenCascade's join offset can return a solid that fails its own check —
       HOUSING Shell1 on the loft/battery body has one inner cylinder face that
       stops 0.59 mm short of the loft. Every boolean after it then misbehaves.
       Try the exact rotational construction, then the exact junction shell, then a marked approximation;
       otherwise keep the result but say so, so the rebuild reports it instead
       of passing it on silently. */
    /* A join offset can be topologically valid while leaving the removed
       face's interior solid. HOUSING's reversed Front cap did exactly that:
       it reported a successful shell but kept material down its centreline.
       Probe well inside a broad planar opening, beyond the requested wall. */
    const openingStillSolid = options.direction !== "outside" && faces.some((face) => {
      const descriptor = faceDescriptor(oc, face);
      const wall = Math.max(1e-6, Number(thickness) || 0);
      if (descriptor.surface !== "plane" || descriptor.measure < 100 * wall * wall) return false;
      const probe = {
        x: descriptor.origin.x - descriptor.normal.x * 2 * wall,
        y: descriptor.origin.y - descriptor.normal.y * 2 * wall,
        z: descriptor.origin.z - descriptor.normal.z * 2 * wall,
      };
      return solidContainsPoint(oc, brep.shape, probe) && solidContainsPoint(oc, shelled, probe);
    });
    if (!shapeIsValid(oc, shelled) || openingStillSolid) {
      try {
        const repaired = await shellFallbacks(brep, faces, thickness, options);
        shelled.delete?.();
        return repaired;
      } catch (error) {
        if (openingStillSolid) {
          shelled.delete?.();
          throw new Error("Shell left material behind the selected opening: " + (error?.message || error));
        }
        return { oc, shape: shelled, kind: "solid", operation: "shell", invalid: "Shell produced an invalid solid (OpenCascade offset); features after it may fail" };
      }
    }
    return { oc, shape: shelled, kind: "solid", operation: "shell" };
  } finally {
    closingFaces.delete(); progress.delete(); maker.delete();
  }
}

// OpenCascade's surface offset can fail on a recessed conical shell. For an
// entirely coaxial line meridian, offset that exact section and revolve it.
async function rotationalShell(brep,removed,thickness,options){
 const oc=brep.oc,owned=[],rings=[],skin=[];let axis,origin;
 const close=(a,b)=>Math.hypot(a.u-b.u,a.v-b.v)<1e-6;
 const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
 try{
  const explorer=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);owned.push(explorer);
  while(explorer.More()){
   const face=oc.TopoDS.Face_1(explorer.Current());owned.push(face);const descriptor=faceDescriptor(oc,face),discard=removed.some(f=>f.IsSame(face));
   if(!['plane','cone','cylinder'].includes(descriptor.surface))throw new Error('Shell offset failed on this surface');
   const edges=new oc.TopExp_Explorer_2(face,oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);owned.push(edges);const points=[];
   while(edges.More()){
    const edge=oc.TopoDS.Edge_1(edges.Current());owned.push(edge);const d=edgeDescriptor(oc,edge);
    if(d.curve==='circle'){
     if(!axis){axis={...d.axis};const key=['x','y','z'].sort((a,b)=>Math.abs(axis[b])-Math.abs(axis[a]))[0];if(axis[key]<0)axis={x:-axis.x,y:-axis.y,z:-axis.z};origin=d.origin;}
     const delta={x:d.origin.x-origin.x,y:d.origin.y-origin.y,z:d.origin.z-origin.z},v=dot(delta,axis);
     if(Math.abs(Math.abs(dot(d.axis,axis))-1)>1e-6 || Math.hypot(delta.x-axis.x*v,delta.y-axis.y*v,delta.z-axis.z*v)>1e-6)throw new Error('Shell surfaces are not coaxial');
     const p={u:d.radius,v};if(!points.some(q=>close(p,q)))points.push(p);
    }else if(d.curve!=='line')throw new Error('Shell meridian is not linear');
    edges.Next();
   }
   if(discard){if(descriptor.surface!=='plane'||points.length!==1)throw new Error('Shell requires two disk openings');rings.push(points[0]);}
   else {if(points.length!==2)throw new Error('Shell meridian is not a single open chain');skin.push(points);}
   explorer.Next();
  }
  if(rings.length!==2)throw new Error('Shell requires two disk openings');
  let points=[rings[0]],remaining=skin.slice();
  while(remaining.length){const index=remaining.findIndex(pair=>pair.some(p=>close(p,points.at(-1))));if(index<0)throw new Error('Shell meridian is disconnected');const pair=remaining.splice(index,1)[0];points.push(close(pair[0],points.at(-1))?pair[1]:pair[0]);}
  if(!close(points.at(-1),rings[1]))throw new Error('Shell openings do not bound the meridian');
  const polygon=points.concat([{u:0,v:points.at(-1).v},{u:0,v:points[0].v}]);let area=0;polygon.forEach((a,i)=>{const b=polygon[(i+1)%polygon.length];area+=a.u*b.v-b.u*a.v;});if(area<0)points.reverse();
  const segments=shellMeridian(points,(options.direction==='outside'?-1:1)*thickness,options.join || 'round');
  const local=await makeBrepRevolve({points:segments.map(s=>s.from),segments,axis:'y',angle:360,radialProfile:true});
  try{
   const seed=Math.abs(axis.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0},x=normalizedVector({x:seed.y*axis.z-seed.z*axis.y,y:seed.z*axis.x-seed.x*axis.z,z:seed.x*axis.y-seed.y*axis.x}),z={x:x.y*axis.z-x.z*axis.y,y:x.z*axis.x-x.x*axis.z,z:x.x*axis.y-x.y*axis.x};
   const result=await placeBrep(local,{matrix:[x.x,axis.x,z.x,x.y,axis.y,z.y,x.z,axis.z,z.z],translation:origin});
   try{await validateBrepForExport(result);return result;}catch(error){disposeBrep(result);throw error;}
  }finally{disposeBrep(local);}
 }finally{disposeAll(owned);}
}

async function shellFallbacks(brep, faces, thickness, options) {
  try { return await rotationalShell(brep, faces, thickness, options); }
  catch (error) {
    if (options.direction === "outside") throw error;
    let exactError;
    try { return await shellByJunctionBisectors(brep, faces, thickness, options); }
    catch (junctionError) { exactError = junctionError; }
    /* The sampled-section cavity is not a true offset (its inside walls are
       lofted polygons), so it is only a last resort and says so. */
    try {
      const approximate = await shellByOffsetSections(brep, faces, thickness, options);
      approximate.approximate = "Shell used a sampled-section approximation because the exact shell failed (" + (exactError?.message || exactError) + ")";
      return approximate;
    } catch { throw exactError || error; }
  }
}

/* An exact inside shell for a body stacked from features along its opening
   axis (HOUSING: Base Extrude cylinder, Boss-Loft1, drafted Boss-Battery).
   OpenCascade's join offset cannot hollow the merged body: where two
   features meet, the crease is sharp in some places and tangent in others,
   and the join trims the offset faces wrongly (Shell1's inner cylinder stopped
   0.59 mm short and the solid was invalid). It offsets each feature on its own
   exactly, so the body is sliced at every feature junction and each slice is
   offset alone.

   Between two slices the true inner corner is where the two offset surfaces
   meet — SOLIDWORKS extends both and intersects them. They always meet on the
   surface that bisects the outer crease, whether the crease folds outward or
   inward, so each slice's cavity is split by that bisector surface and only
   its own side is kept. The bisector surface crosses the offset surfaces
   instead of grazing them, so tangent spots stay well conditioned. Where the
   bisector leans into a neighbouring slice, the slice needs its own offset
   continued past the junction: a thin band of its side faces, extended along
   the surface, is offset separately and added to its cavity.

   Everything runs 100x larger, where OpenCascade's offsets are tighter. The
   two cavity halves meet along tangent curves at a tangent crease; they are
   fused with a 1 um fuzzy value so those curves merge instead of leaving a
   loose vertex. The result must still pass the export check, so nothing here
   loosens it. */
const JUNCTION_SCALE = 100;
const JUNCTION_FUZZY_CM = 1e-4;

/* Boss-Loft1's faces meet at creases of up to 2° that fade to tangent at both
   ends. The join offset leaves those seams as loose as the gap between the two
   offset boundaries (thickness × crease, 0.0075 cm), which blocks export. Each
   loose seam between two curved faces is recomputed as the true intersection of
   the two offset surfaces — Newton on both tangent planes and the plane across
   the seam, the midpoint where the surfaces are tangent — refitted, given fresh
   pcurves and vertices, and its tolerance measured again. Works in place on a
   shape the caller owns; `scale` is the model-to-shape factor. */
function tightenOffsetSeams(oc, shape, scale) {
  const owned = [], keep = (value) => { owned.push(value); return value; };
  const each = (s, type, fn) => { const ex = new oc.TopExp_Explorer_2(s, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); try { for (; ex.More(); ex.Next()) fn(ex.Current()); } finally { ex.delete(); } };
  const TIGHT = 1e-7 * scale, LOOSE = 1e-5 * scale, SAMPLES = 40;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  try {
    const faces = []; each(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => faces.push(oc.TopoDS.Face_1(fs)));
    const curved = (face) => keep(new oc.BRepAdaptor_Surface_2(face, true)).GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane;
    const facesOf = (edge) => faces.filter((face) => { let hit = false; each(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (x) => { if (x.IsSame(edge)) hit = true; }); return hit; });
    const project = (p, surface) => {
      const pr = keep(new oc.GeomAPI_ProjectPointOnSurf_2(keep(new oc.gp_Pnt_3(p[0], p[1], p[2])), surface, oc.Extrema_ExtAlgo.Extrema_ExtAlgo_Grad));
      if (!pr.NbPoints()) return null;
      const U = { current: 0 }, V = { current: 0 }; pr.LowerDistanceParameters(U, V);
      const q = pr.NearestPoint(), at = keep(new oc.gp_Pnt_1()), du = keep(new oc.gp_Vec_1()), dv = keep(new oc.gp_Vec_1());
      surface.get().D1(U.current, V.current, at, du, dv);
      const n = keep(du.Crossed(dv)); n.Normalize();
      return { q: [q.X(), q.Y(), q.Z()], n: [n.X(), n.Y(), n.Z()] };
    };
    const onBoth = (start, along, s1, s2) => {
      let x = start;
      for (let iteration = 0; iteration < 12; iteration++) {
        const a = project(x, s1), b = project(x, s2);
        if (!a || !b) return null;
        const mid = [(a.q[0] + b.q[0]) / 2, (a.q[1] + b.q[1]) / 2, (a.q[2] + b.q[2]) / 2];
        const cross = Math.hypot(a.n[1] * b.n[2] - a.n[2] * b.n[1], a.n[2] * b.n[0] - a.n[0] * b.n[2], a.n[0] * b.n[1] - a.n[1] * b.n[0]);
        let next = mid;
        if (cross > 1e-4) {
          const m = [a.n, b.n, along], rhs = [dot(a.n, a.q), dot(b.n, b.q), dot(along, start)], d = det3(m);
          if (Math.abs(d) > 1e-12) next = [0, 1, 2].map((k) => det3(m.map((row, i) => row.map((value, j) => (j === k ? rhs[i] : value)))) / d);
        }
        const moved = Math.hypot(next[0] - x[0], next[1] - x[1], next[2] - x[2]);
        x = next;
        if (moved < TIGHT * 1e-2) break;
      }
      return x;
    };
    const builder = keep(new oc.BRep_Builder()), setter = keep(new oc.ShapeFix_ShapeTolerance());
    const seams = [], vertices = [];
    each(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (es) => {
      const edge = oc.TopoDS.Edge_1(es);
      if (oc.BRep_Tool.Tolerance_2(edge) <= LOOSE || seams.some((x) => x.IsSame(edge))) return;
      const adjacent = facesOf(edge);
      if (adjacent.length !== 2 || !adjacent.every(curved)) return;
      const curve = keep(new oc.BRepAdaptor_Curve_2(edge)), t0 = curve.FirstParameter(), t1 = curve.LastParameter();
      const s1 = keep(oc.BRep_Tool.Surface_2(adjacent[0])), s2 = keep(oc.BRep_Tool.Surface_2(adjacent[1]));
      const points = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = t0 + (t1 - t0) * i / SAMPLES, p = keep(curve.Value(t)), d = keep(curve.DN(t, 1)), length = Math.hypot(d.X(), d.Y(), d.Z());
        if (length < 1e-12) return;
        const x = onBoth([p.X(), p.Y(), p.Z()], [d.X() / length, d.Y() / length, d.Z() / length], s1, s2);
        if (!x) return;
        points.push(x);
      }
      const array = keep(new oc.TColgp_Array1OfPnt_2(1, points.length));
      points.forEach((p, i) => array.SetValue(i + 1, keep(new oc.gp_Pnt_3(p[0], p[1], p[2]))));
      const fit = keep(new oc.GeomAPI_PointsToBSpline_2(array, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, TIGHT));
      if (!fit.IsDone()) return;
      const fitted = keep(new oc.Handle_Geom_Curve_2(fit.Curve().get())), f0 = fitted.get().FirstParameter(), f1 = fitted.get().LastParameter();
      builder.UpdateEdge_1(edge, fitted, TIGHT);
      builder.Range_1(edge, f0, f1, false);
      for (const face of adjacent) builder.UpdateEdge_3(edge, keep(oc.GeomProjLib.Curve2d_2(fitted, f0, f1, keep(oc.BRep_Tool.Surface_2(face)), TIGHT)), face, TIGHT);
      each(edge, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, (vs) => {
        const vertex = oc.TopoDS.Vertex_1(vs), q = oc.BRep_Tool.Pnt(vertex);
        const end = [points[0], points[points.length - 1]].reduce((best, p) => (Math.hypot(p[0] - q.X(), p[1] - q.Y(), p[2] - q.Z()) < Math.hypot(best[0] - q.X(), best[1] - q.Y(), best[2] - q.Z()) ? p : best));
        q.delete();
        builder.UpdateVertex_1(vertex, keep(new oc.gp_Pnt_3(end[0], end[1], end[2])), TIGHT);
        vertices.push(vertex);
      });
      setter.SetTolerance(edge, TIGHT, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
      builder.SameParameter(edge, false);
      oc.BRepLib.SameParameter_1(edge, TIGHT);
      seams.push(edge);
    });
    for (const vertex of vertices) setter.SetTolerance(vertex, TIGHT, oc.TopAbs_ShapeEnum.TopAbs_VERTEX);
    if (seams.length) oc.BRepLib.UpdateTolerances_1(shape, false);
    return seams.length;
  } finally {
    disposeAll(owned);
  }
}

async function shellByJunctionBisectors(brep, removed, thickness, options = {}) {
  if (options.direction === "outside") throw new Error("A junction shell hollows inward only");
  const oc = brep.oc, F = JUNCTION_SCALE, owned = [], breps = [];
  const T = Math.max(1e-6, Number(thickness) || 0) * F;
  const keep = (value) => { owned.push(value); return value; };
  const track = (value) => { if (value) breps.push(value); return value; };
  const each = (shape, type, fn) => { const ex = new oc.TopExp_Explorer_2(shape, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); try { for (; ex.More(); ex.Next()) fn(ex.Current()); } finally { ex.delete(); } };
  const faceEdges = (face) => { const out = []; each(face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (e) => out.push(oc.TopoDS.Edge_1(e))); return out; };
  const point = (v) => keep(new oc.gp_Pnt_3(v[0], v[1], v[2]));
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const volumeOf = (shape) => shapeVolume(oc, shape);
  const transformed = (shape, trsf) => { const t = keep(new oc.BRepBuilderAPI_Transform_2(shape, trsf, true)); return t.Shape(); };
  const bigPlane = (z) => keep(new oc.BRepBuilderAPI_MakeFace_9(keep(new oc.gp_Pln_3(point([0, 0, z]), keep(new oc.gp_Dir_4(0, 0, 1)))), -1e4, 1e4, -1e4, 1e4)).Face();
  const isAxisPlane = (face) => { const a = keep(new oc.BRepAdaptor_Surface_2(face, true)); return a.GetType() === oc.GeomAbs_SurfaceType.GeomAbs_Plane && Math.abs(Math.abs(a.Plane().Axis().Direction().Z()) - 1) < 1e-9; };
  const planeZ = (face) => { const g = keep(new oc.GProp_GProps_1()); oc.BRepGProp.SurfaceProperties_1(face, g, false, false); return g.CentreOfMass().Z(); };
  const centroid = (shape) => { const g = keep(new oc.GProp_GProps_1()); oc.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return pointOf(g.CentreOfMass()); };
  const fuzzyFuse = (a, b) => {
    const f = keep(new oc.BRepAlgoAPI_Fuse_1()), l = keep(new oc.TopTools_ListOfShape_1()), t = keep(new oc.TopTools_ListOfShape_1());
    l.Append_1(a); t.Append_1(b); f.SetArguments(l); f.SetTools(t); f.SetNonDestructive(true); f.SetFuzzyValue(JUNCTION_FUZZY_CM * F);
    f.Build(keep(new oc.Message_ProgressRange_1()));
    if (f.HasErrors()) throw new Error("A junction shell could not fuse its cavity");
    const shape = f.Shape(), va = Math.abs(volumeOf(a)), vb = Math.abs(volumeOf(b)), vs = Math.abs(volumeOf(shape));
    if (!booleanVolumePlausible("union", va, vb, vs)) throw new Error("A junction shell cavity fuse lost material");
    return shape;
  };
  const maxTolerance = (shape) => { const analysis = keep(new oc.ShapeAnalysis_ShapeTolerance()); return analysis.Tolerance(shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); };
  /* The two sides of a junction meet along curves that are sometimes tangent:
     a plain union then leaves a loose vertex, and a fuzzy fuse closes it.
     Elsewhere the fuzzy fuse itself loosens a seam vertex that the plain union
     keeps tight. Each union is done both ways and the tighter valid result is
     kept, so neither is chosen blind. */
  const tightUnion = async (label, a, b) => {
    const candidates = [];
    /* These cavity pieces already meet on their bisector surfaces. The generic
       union helper's loose-overlap repair (a union after an extra subtraction)
       intersects those coincident spline surfaces again and can run for many
       minutes. Here the plain/fuzzy comparison is the repair, so build the
       plain union once and keep the same material, validity and tolerance gates. */
    try {
      const plain = track({ oc, shape: buildBoolean(oc, "union", a, b), kind: "solid" });
      if (!booleanVolumePlausible("union", Math.abs(volumeOf(a)), Math.abs(volumeOf(b)), Math.abs(volumeOf(plain.shape)))) throw new Error("A junction shell cavity fuse lost material");
      if (shapeIsValid(oc, plain.shape)) candidates.push({ how: "plain", shape: plain.shape, tolerance: maxTolerance(plain.shape) });
    } catch (_) {}
    const plainTight = candidates.length && candidates[0].tolerance <= 2.5e-4 * F;
    if (!plainTight) { try { const fuzzy = fuzzyFuse(a, b); if (shapeIsValid(oc, fuzzy)) candidates.push({ how: "fuzzy", shape: fuzzy, tolerance: maxTolerance(fuzzy) }); } catch (_) {} }
    if (!candidates.length) throw new Error("A junction shell could not join its cavity pieces");
    candidates.sort((x, y) => x.tolerance - y.tolerance);
    return candidates[0].shape;
  };
  try {
    // 1. local frame: the openings face +z, everything 100x larger
    const opening = faceDescriptor(oc, removed[0]);
    if (opening.surface !== "plane") throw new Error("A junction shell needs a planar opening");
    let axis = normalizedVector(opening.normal);
    if (removed.some((face) => { const d = faceDescriptor(oc, face); return d.surface !== "plane" || Math.abs(Math.abs(d.normal.x * axis.x + d.normal.y * axis.y + d.normal.z * axis.z) - 1) > 1e-9; }))
      throw new Error("A junction shell needs its openings in parallel planes");
    // point the axis out of the body through the opening
    {
      const c = centroid(brep.shape), o = opening.origin;
      if ((o.x - c.x) * axis.x + (o.y - c.y) * axis.y + (o.z - c.z) * axis.z < 0) axis = { x: -axis.x, y: -axis.y, z: -axis.z };
    }
    /* Keep the body's own orientation when its axis is already +z: a spun frame
       moved HOUSING's tangent crease point onto the cylinder's parametric seam
       and loosened it to 5.7 um. World X (or Y) flattened onto the plane
       across the axis gives the identity there. */
    const seed = Math.abs(axis.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    const along = seed.x * axis.x + seed.y * axis.y + seed.z * axis.z;
    const xDir = normalizedVector({ x: seed.x - along * axis.x, y: seed.y - along * axis.y, z: seed.z - along * axis.z });
    const localAx3 = keep(new oc.gp_Ax3_3(point([0, 0, 0]), keep(new oc.gp_Dir_4(axis.x, axis.y, axis.z)), keep(new oc.gp_Dir_4(xDir.x, xDir.y, xDir.z))));
    const toLocal = keep(new oc.gp_Trsf_1()); toLocal.SetTransformation_2(localAx3);
    const scaleUp = keep(new oc.gp_Trsf_1()); scaleUp.SetScale(point([0, 0, 0]), F);
    const bodyL = transformed(transformed(brep.shape, toLocal), scaleUp);
    const bounds = shapeBounds(oc, bodyL, false);
    if (!bounds) throw new Error("A junction shell needs a measurable body");
    const zOpen = Math.max(...removed.map((face) => { const p = keep(new oc.BRepAdaptor_Surface_2(oc.TopoDS.Face_1(transformed(transformed(face, toLocal), scaleUp)), true)); return p.Plane().Location().Z(); }));
    const margin = 1e-6 * (bounds.max.z - bounds.min.z) + 1e-7;
    if (Math.abs(zOpen - bounds.max.z) > 1e-4 * F) throw new Error("A junction shell needs its opening at the end of the body");

    // 2. junctions: closed planar edge loops across the axis that no planar face covers
    const bodyFaces = []; each(bodyL, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => bodyFaces.push(oc.TopoDS.Face_1(fs)));
    const capZ = bodyFaces.filter(isAxisPlane).map(planeZ);
    const junctions = [];
    each(bodyL, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (es) => {
      const edge = oc.TopoDS.Edge_1(es), c = keep(new oc.BRepAdaptor_Curve_2(edge)), t0 = c.FirstParameter(), t1 = c.LastParameter();
      const zs = [0, 0.25, 0.5, 0.75, 1].map((k) => c.Value(t0 + (t1 - t0) * k).Z());
      if (!zs.every((z) => Math.abs(z - zs[0]) < 1e-6 * F)) return;
      const z = zs[0];
      if (z <= bounds.min.z + margin || z >= bounds.max.z - margin || capZ.some((cz) => Math.abs(cz - z) < 1e-6 * F)) return;
      if (!junctions.some((j) => Math.abs(j - z) < 1e-6 * F)) junctions.push(z);
    });
    junctions.sort((a, b) => a - b);
    if (!junctions.length) throw new Error("A junction shell found no feature junction");

    // 3. slices, each merged back to its feature's own faces
    const splitter = keep(new oc.BRepAlgoAPI_Splitter_1()), args = keep(new oc.TopTools_ListOfShape_1()), tools = keep(new oc.TopTools_ListOfShape_1());
    args.Append_1(bodyL); junctions.forEach((z) => tools.Append_1(bigPlane(z)));
    // non-destructive: a splitter otherwise raises tolerances on the shapes it is given
    splitter.SetArguments(args); splitter.SetTools(tools); splitter.SetNonDestructive(true); splitter.Build(keep(new oc.Message_ProgressRange_1()));
    if (splitter.HasErrors()) throw new Error("A junction shell could not slice the body");
    const levels = [bounds.min.z, ...junctions, bounds.max.z];
    const slices = [];
    each(splitter.Shape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, (ss) => {
      const unify = keep(new oc.ShapeUpgrade_UnifySameDomain_2(ss, true, true, false)); unify.Build();
      const shape = unify.Shape(), cz = centroid(shape).z;
      const index = levels.findIndex((z, i) => i < levels.length - 1 && cz > z && cz < levels[i + 1]);
      slices.push({ shape, index, lo: levels[index], hi: levels[index + 1] });
    });
    slices.sort((a, b) => a.index - b.index);
    if (slices.length !== junctions.length + 1 || slices.some((s, i) => s.index !== i)) throw new Error("A junction shell sliced the body into unexpected pieces");

    const offsetCavity = async (solid, openZ) => {
      const open = keep(new oc.TopTools_ListOfShape_1()); let count = 0;
      each(solid, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => { const face = oc.TopoDS.Face_1(fs); if (isAxisPlane(face) && openZ.some((z) => Math.abs(planeZ(face) - z) < 1e-4 * F)) { open.Append_1(face); count++; } });
      if (!count) throw new Error("A junction shell piece has no open face");
      for (const join of [oc.GeomAbs_JoinType.GeomAbs_Intersection, oc.GeomAbs_JoinType.GeomAbs_Arc]) {
        const maker = keep(new oc.BRepOffsetAPI_MakeThickSolid());
        try { maker.MakeThickSolidByJoin(solid, open, -T, 1e-6, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, join, false, keep(new oc.Message_ProgressRange_1())); }
        catch { continue; }
        if (maker.HasErrors?.() || !maker.IsDone?.()) continue;
        let wall = keep(maker.Shape());
        if (!shapeIsValid(oc, wall)) continue;
        // near-tangent seams: keep the recomputed wall only if it is valid and really tighter
        if (shapeMaxTolerance(oc, wall) > 1e-3) {
          const tight = keep(new oc.BRepBuilderAPI_Copy_2(wall, true, false)).Shape();
          if (tightenOffsetSeams(oc, tight, F) && shapeIsValid(oc, tight) && shapeMaxTolerance(oc, tight) < shapeMaxTolerance(oc, wall)) wall = tight;
        }
        const cavity = track(await booleanBrep("subtract", { oc, shape: solid, kind: "solid" }, { oc, shape: wall, kind: "solid" }));
        return cavity.shape;
      }
      throw new Error("A junction shell piece could not be offset");
    };

    // 4. bisector surface of each junction crease
    const normalInfo = (edge, face, t) => {
      const pc = keep(new oc.BRepAdaptor_Curve2d_2(edge, face)), uv = pc.Value(t), a = keep(new oc.BRepAdaptor_Surface_2(face, true));
      const p0 = keep(new oc.gp_Pnt_1()), du = keep(new oc.gp_Vec_1()), dv = keep(new oc.gp_Vec_1()); a.D1(uv.X(), uv.Y(), p0, du, dv);
      const n = keep(du.Crossed(dv)); n.Normalize(); if (face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) n.Reverse();
      return { n: [n.X(), n.Y(), n.Z()], q: [p0.X(), p0.Y(), p0.Z()] };
    };
    const curveEdge = (pts) => {
      const arr = keep(new oc.TColgp_Array1OfPnt_2(1, pts.length)); pts.forEach((p, i) => arr.SetValue(i + 1, point(p)));
      const fit = keep(new oc.GeomAPI_PointsToBSpline_2(arr, 3, 8, oc.GeomAbs_Shape.GeomAbs_C2, 1e-6));
      if (!fit.IsDone()) throw new Error("A junction shell could not fit its bisector");
      return keep(new oc.BRepBuilderAPI_MakeEdge_24(keep(new oc.Handle_Geom_Curve_2(fit.Curve().get())))).Edge();
    };
    const REACH = 1.5 * T, OUT = 0.2 * T, N = 24;
    const bisectors = junctions.map((zc) => {
      const crease = [];
      each(bodyL, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (es) => {
        const edge = oc.TopoDS.Edge_1(es), c = keep(new oc.BRepAdaptor_Curve_2(edge)), t0 = c.FirstParameter(), t1 = c.LastParameter();
        if (![0, 0.5, 1].every((k) => Math.abs(c.Value(t0 + (t1 - t0) * k).Z() - zc) < 1e-6 * F)) return;
        const adj = bodyFaces.filter((f) => faceEdges(f).some((x) => x.IsSame(edge)));
        if (adj.length !== 2 || crease.some((e) => e.edge.IsSame(edge))) return;
        crease.push({ edge, adj, t0, t1 });
      });
      if (!crease.length) throw new Error("A junction shell found no crease at a junction");
      /* Sample positions come from the edge's own 3D curve and its ends are
         its vertices, so neighbouring bands meet exactly. Positions evaluated
         through a face's 2D curve were up to 75 um off on HOUSING's real loft,
         the bands failed to sew shut, and the split kept the wrong side. */
      const ends = [];
      let maxUp = 0, maxDown = 0;
      for (const e of crease) {
        const curve3d = keep(new oc.BRepAdaptor_Curve_2(e.edge));
        const vertices = []; each(e.edge, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, (vs) => vertices.push(oc.TopoDS.Vertex_1(vs)));
        const at = (t) => pointOf(curve3d.Value(t));
        const nearestVertex = (p) => vertices.reduce((best, v) => { const q = pointOf(oc.BRep_Tool.Pnt(v)); const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); return !best || d < best.d ? { v, q, d } : best; }, null);
        e.samples = [];
        for (let i = 0; i <= N; i++) {
          const t = e.t0 + (e.t1 - e.t0) * i / N, A = normalInfo(e.edge, e.adj[0], t), B = normalInfo(e.edge, e.adj[1], t);
          const s = add(A.n, B.n), len = Math.hypot(...s);
          if (len < 1e-9) throw new Error("A junction crease folds back on itself");
          const u = s.map((v) => -v / len);
          let q = at(t);
          if (i === 0 || i === N) {
            const hit = nearestVertex(q);
            q = hit.q;
            let group = ends.find((g) => g.vertex.IsSame(hit.v));
            if (!group) { group = { vertex: hit.v, directions: [] }; ends.push(group); }
            group.directions.push(u);
            e.samples.push({ q: [q.x, q.y, q.z], u, group });
          } else e.samples.push({ q: [q.x, q.y, q.z], u });
        }
      }
      for (const e of crease) for (const i of [0, N]) {
        const sum = e.samples[i].group.directions.reduce((acc, u) => add(acc, u), [0, 0, 0]), len = Math.hypot(...sum);
        e.samples[i].u = sum.map((v) => v / len);
      }
      /* Where the crease is tangent its bisector lies flat in the junction
         plane and would run along the cavity edges there, which leaves loose
         vertices (5.7 um on HOUSING). Both offsets coincide at a tangent
         crease, so tilting the split a little is exact to first order: at a
         2 degree tilt over a 2 degree crease the corner moves about t·Δ·θ
         (1.6 um) along the split and the wall by far less. The tilt goes the
         way the junction leans. */
      const MIN_TILT = Math.sin((2 * Math.PI) / 180);
      let lean = 0;
      for (const e of crease) for (const sm of e.samples) lean += sm.u[2];
      const side = lean >= 0 ? 1 : -1;
      for (const e of crease) for (const sm of e.samples) {
        if (sm.u[2] * side >= MIN_TILT) continue;
        const flat = Math.hypot(sm.u[0], sm.u[1]);
        if (flat < 1e-12) continue;
        const scale = Math.sqrt(1 - MIN_TILT * MIN_TILT) / flat;
        sm.u = [sm.u[0] * scale, sm.u[1] * scale, side * MIN_TILT];
      }
      const sew = keep(new oc.BRepBuilderAPI_Sewing(1e-4, true, true, true, false)), rim = keep(new oc.BRepBuilderAPI_MakeWire_1()), floors = keep(new oc.TopTools_ListOfShape_1());
      for (const e of crease) {
        e.samples.forEach((sm) => { maxUp = Math.max(maxUp, sm.u[2]); maxDown = Math.max(maxDown, -sm.u[2]); });
        const outer = curveEdge(e.samples.map((sm) => add(sm.q, sm.u, -OUT)));
        const inner = curveEdge(e.samples.map((sm) => add(sm.q, sm.u, REACH)));
        const floor = curveEdge(e.samples.map((sm) => { const p = add(sm.q, sm.u, REACH); return [p[0], p[1], zc]; }));
        sew.Add(keep(oc.BRepFill.Face(outer, inner))); sew.Add(keep(oc.BRepFill.Face(inner, floor)));
        floors.Append_1(floor);
      }
      /* Crease edges come in whatever order the explorer lists them, and one
         edge at a time MakeWire rejects an edge that does not touch the wire so
         far, along with everything chained after it, while still reporting
         done. Given all the edges at once it orders them itself. */
      rim.Add_3(floors);
      if (!rim.IsDone() || !oc.BRep_Tool.IsClosed_1(rim.Wire())) throw new Error("A junction bisector does not close");
      const disc = keep(new oc.BRepBuilderAPI_MakeFace_15(rim.Wire(), true));
      if (!disc.IsDone()) throw new Error("A junction bisector does not close");
      sew.Add(disc.Face());
      sew.Perform(keep(new oc.Message_ProgressRange_1()));
      // closed except its outer rim, one edge per crease edge; anything more is a gap the split would leak through
      if (sew.NbFreeEdges() !== crease.length) throw new Error("A junction bisector did not close (" + sew.NbFreeEdges() + " open edges for " + crease.length + " crease edges)");
      return { zc, surface: sew.SewedShape(), up: REACH * maxUp, down: REACH * maxDown };
    });

    // 5. a band of a slice's side faces continued past a junction, offset on its own
    const bandCavity = async (slice, zc, fromZ, towardZ) => {
      const lateral = [];
      const infos = [];
      each(slice.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => {
        const face = oc.TopoDS.Face_1(fs);
        if (isAxisPlane(face)) return;
        const a = keep(new oc.BRepAdaptor_Surface_2(face, true));
        const u0 = a.FirstUParameter(), u1 = a.LastUParameter(), v0 = a.FirstVParameter(), v1 = a.LastVParameter();
        const zAt = (u, v) => a.Value(u, v).Z();
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
        const alongV = Math.abs(zAt(um, v1) - zAt(um, v0)) >= Math.abs(zAt(u1, vm) - zAt(u0, vm));
        const endAtMin = alongV ? Math.abs(zAt(um, v0) - zc) < 1e-4 * F : Math.abs(zAt(u0, vm) - zc) < 1e-4 * F;
        const endAtMax = alongV ? Math.abs(zAt(um, v1) - zc) < 1e-4 * F : Math.abs(zAt(u1, vm) - zc) < 1e-4 * F;
        if (!endAtMin && !endAtMax) return;
        infos.push({ face, a, u0, u1, v0, v1, alongV, endAtMin, endAtMax, type: a.GetType() });
      });
      if (!infos.length) throw new Error("A junction band has no side faces");
      const height = Math.abs(towardZ - zc);
      // B-spline faces are extended by one shared parameter amount so neighbours keep their seams
      const splines = infos.filter((x) => x.type === oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface);
      let shared = 0;
      for (const x of splines) {
        let slowest = Infinity;
        for (let i = 0; i <= 10; i++) {
          const s = i / 10;
          const zNear = x.alongV ? x.a.Value(x.u0 + (x.u1 - x.u0) * s, x.endAtMin ? x.v0 : x.v1).Z() : x.a.Value(x.endAtMin ? x.u0 : x.u1, x.v0 + (x.v1 - x.v0) * s).Z();
          const zFar = x.alongV ? x.a.Value(x.u0 + (x.u1 - x.u0) * s, x.endAtMin ? x.v1 : x.v0).Z() : x.a.Value(x.endAtMin ? x.u1 : x.u0, x.v0 + (x.v1 - x.v0) * s).Z();
          slowest = Math.min(slowest, Math.abs(zNear - zFar));
        }
        shared = Math.max(shared, 2 * height / slowest * 1.5);
      }
      for (const x of infos) {
        if (x.type === oc.GeomAbs_SurfaceType.GeomAbs_BSplineSurface) {
          const conv = keep(new oc.GeomConvert_BSplineSurfaceToBezierSurface_2(x.a.BSpline(), x.u0, x.u1, x.v0, x.v1, 1e-9));
          if (conv.NbUPatches() !== 1 || conv.NbVPatches() !== 1) throw new Error("A junction band face is not a single patch");
          const bz = conv.Patch(1, 1).get();
          if (x.alongV) bz.Segment(0, 1, x.endAtMin ? -shared : 0, x.endAtMax ? 1 + shared : 1);
          else bz.Segment(x.endAtMin ? -shared : 0, x.endAtMax ? 1 + shared : 1, 0, 1);
          const face = keep(new oc.BRepBuilderAPI_MakeFace_14(keep(new oc.Handle_Geom_Surface_2(bz)), 0, 1, 0, 1, 1e-5)).Face();
          face.Orientation_2(x.face.Orientation_1());
          lateral.push(face);
        } else if ([oc.GeomAbs_SurfaceType.GeomAbs_Plane, oc.GeomAbs_SurfaceType.GeomAbs_Cylinder, oc.GeomAbs_SurfaceType.GeomAbs_Cone].includes(x.type)) {
          const extended = keep(new oc.TopoDS_Face());
          oc.BRepLib.ExtendFace(x.face, 2 * height, x.alongV ? false : x.endAtMin, x.alongV ? false : x.endAtMax, x.alongV ? x.endAtMin : false, x.alongV ? x.endAtMax : false, extended);
          lateral.push(extended);
        } else throw new Error("A junction band cannot extend this surface");
      }
      const maker = keep(new oc.BOPAlgo_MakerVolume_1());
      maker.SetIntersect(true); maker.SetAvoidInternalShapes(true); maker.SetNonDestructive(true); maker.SetFuzzyValue(1e-5);
      lateral.forEach((f) => maker.AddArgument(f)); maker.AddArgument(bigPlane(fromZ)); maker.AddArgument(bigPlane(towardZ));
      maker.Perform(keep(new oc.Message_ProgressRange_1()));
      const c = centroid(slice.shape), probe = point([c.x, c.y, (fromZ + towardZ) / 2]), cls = keep(new oc.BRepClass3d_SolidClassifier_1());
      let band = null;
      each(maker.Shape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, (sh) => { cls.Load(sh); cls.Perform(probe, 1e-5); if (cls.State().value === oc.TopAbs_State.TopAbs_IN.value) band = oc.TopoDS.Solid_1(sh); });
      if (!band) throw new Error("A junction band did not close");
      return offsetCavity(band, [fromZ, towardZ]);
    };

    // 6. each slice's cavity, continued where a bisector leans into its neighbour, then cut to its own side
    const kept = [];
    const bandPad = 0.06 * T;
    for (const slice of slices) {
      const below = slice.index > 0 ? bisectors[slice.index - 1] : null, above = slice.index < slices.length - 1 ? bisectors[slice.index] : null;
      const openZ = [];
      if (below) openZ.push(slice.lo);
      if (above) openZ.push(slice.hi);
      if (Math.abs(slice.hi - zOpen) < 1e-4 * F) openZ.push(zOpen);
      let cavity = await offsetCavity(slice.shape, openZ);
      // A bisector that rises past a junction puts part of the upper slice's
      // space on the lower slice's side, so the lower slice's offset has to
      // continue up to it; one that dips does the same for the upper slice.
      if (above && above.up > 1e-9) cavity = await tightUnion(`slice ${slice.index} + band above`, cavity, await bandCavity(slice, above.zc, above.zc, above.zc + above.up + bandPad));
      if (below && below.down > 1e-9) cavity = await tightUnion(`slice ${slice.index} + band below`, cavity, await bandCavity(slice, below.zc, below.zc, below.zc - below.down - bandPad));
      const cut = keep(new oc.BRepAlgoAPI_Splitter_1()), cargs = keep(new oc.TopTools_ListOfShape_1()), ctools = keep(new oc.TopTools_ListOfShape_1());
      cargs.Append_1(cavity); [below, above].filter(Boolean).forEach((b) => ctools.Append_1(b.surface));
      // non-destructive, so a bisector shared by two slices is not loosened by the first cut before the second
      cut.SetArguments(cargs); cut.SetTools(ctools); cut.SetFuzzyValue(1e-5); cut.SetNonDestructive(true); cut.Build(keep(new oc.Message_ProgressRange_1()));
      if (cut.HasErrors()) throw new Error("A junction shell could not split a slice cavity");
      let largest = null, largestVolume = 0;
      each(cut.Shape(), oc.TopAbs_ShapeEnum.TopAbs_SOLID, (sh) => { const v = volumeOf(sh); if (v > largestVolume) { largestVolume = v; largest = oc.TopoDS.Solid_1(sh); } });
      if (!largest) throw new Error("A junction shell slice cavity vanished");
      kept.push(largest);
    }

    // 7. one cavity, out of the body, back to the caller's frame and size
    // join from the opening end down, one junction at a time
    let cavity = kept[kept.length - 1];
    for (let i = kept.length - 2; i >= 0; i--) cavity = await tightUnion(`joined down to slice ${i}`, cavity, kept[i]);
    const shelledL = track(await booleanBrep("subtract", { oc, shape: bodyL, kind: "solid" }, { oc, shape: cavity, kind: "solid" }));
    const back = keep(new oc.gp_Trsf_1()); back.SetScale(point([0, 0, 0]), 1 / F);
    const fromLocal = keep(toLocal.Inverted());
    const shape = transformed(transformed(shelledL.shape, back), fromLocal);
    const result = { oc, shape, kind: "solid", operation: "shell" };
    const before = shapeBounds(oc, brep.shape, false), after = shapeBounds(oc, shape, false);
    const grown = !before || !after || ["x", "y", "z"].some((k) => after.min[k] < before.min[k] - 1e-4 || after.max[k] > before.max[k] + 1e-4);
    if (grown || !shapeIsValid(oc, shape) || !(volumeOf(shape) > 1e-9)) throw new Error("A junction shell produced an invalid solid");
    let solids = 0; each(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, () => solids++);
    if (solids !== 1) throw new Error("A junction shell produced " + solids + " solids");
    /* The export gate is not applied here. On HOUSING's real Boss-Loft1 the
       offset of its nearly tangent seams is exact in position but carries
       0.008 cm edge tolerances where the seams meet the caps; rejecting that
       fell back to the sampled-section cavity, which came out at 330.8 cm³
       instead of 156.35. The exact shell is kept and its looseness reported,
       and exporting still checks the tolerance. */
    const looseness = shapeMaxTolerance(oc, shape);
    if (looseness > 1e-3) result.looseTolerance = looseness;
    return result;
  } finally {
    breps.forEach((b) => { try { disposeBrep(b); } catch (_) {} });
    disposeAll(owned);
  }
}


/* Planchard HOUSING Shell1 exact cavity construction.
   The loft (sloping inward ~26.1°) and battery extrusion (drafted 1°) meet at a
   concave seam at z = -3.302. Slicing both at z = -3.302 forces two offset loops with
   a 0.29 mm width mismatch into the same plane, creating an artificial coplanar shelf
   with degenerate corners. Extending the battery cavity 1 mm upward into the loft
   submerges its top cap completely inside the loft cavity; the volumetric boolean
   fuse then naturally resolves the true 3D surface-surface intersection miter curve
   with zero defects and exact 0.254 cm wall thickness. */
/* Join-offset of a G0 crease (cylinder meeting a loft) trims the inner wall
   short of the seam and leaves an invalid solid. Hollow instead by offsetting
   every planar section ⟂ the opening axis along the WALL normal — in-plane by
   t/cos(α) so the perpendicular thickness is t even on a sloped loft — lofting
   those wires, and subtracting the cavity. Caps that are not openings are
   shifted inward by the wall so they stay closed. */
async function shellByOffsetSections(brep, removed, thickness, options) {
  const oc = brep.oc, size = Math.max(1e-6, Number(thickness) || 0), owned = [];
  const along = (point, axis, origin) =>
    (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y + (point.z - origin.z) * axis.z;
  const sampleEdge = (edge, count) => {
    const curve = new oc.BRepAdaptor_Curve_2(edge), points = [];
    try {
      const first = curve.FirstParameter(), last = curve.LastParameter();
      for (let i = 0; i < count; i++) {
        const point = curve.Value(first + (last - first) * i / count); owned.push(point);
        points.push(pointOf(point));
      }
    } finally { curve.delete(); }
    return points;
  };
  const faceNormalAt = (face, point) => {
    const adaptor = new oc.BRepAdaptor_Surface_2(face, true);
    const p = new oc.gp_Pnt_1(), du = new oc.gp_Vec_1(), dv = new oc.gp_Vec_1();
    try {
      const u0 = adaptor.FirstUParameter(), u1 = adaptor.LastUParameter();
      const v0 = adaptor.FirstVParameter(), v1 = adaptor.LastVParameter();
      let best = 1e9, u = u0, v = v0;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        const uu = u0 + (u1 - u0) * i / 8, vv = v0 + (v1 - v0) * j / 8;
        adaptor.D0(uu, vv, p);
        const d = Math.hypot(p.X() - point.x, p.Y() - point.y, p.Z() - point.z);
        if (d < best) { best = d; u = uu; v = vv; }
      }
      [0.05, 0.01].forEach((step) => {
        [[step, 0], [-step, 0], [0, step], [0, -step], [step, step], [-step, step], [step, -step], [-step, -step]].forEach(([duu, dvv]) => {
          const uu = Math.min(u1, Math.max(u0, u + duu * (u1 - u0)));
          const vv = Math.min(v1, Math.max(v0, v + dvv * (v1 - v0)));
          adaptor.D0(uu, vv, p);
          const d = Math.hypot(p.X() - point.x, p.Y() - point.y, p.Z() - point.z);
          if (d < best) { best = d; u = uu; v = vv; }
        });
      });
      adaptor.D1(u, v, p, du, dv);
      let nx = du.Y() * dv.Z() - du.Z() * dv.Y(), ny = du.Z() * dv.X() - du.X() * dv.Z(), nz = du.X() * dv.Y() - du.Y() * dv.X();
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      if (face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) { nx = -nx; ny = -ny; nz = -nz; }
      return { normal: { x: nx, y: ny, z: nz }, dist: best };
    } finally { adaptor.delete(); p.delete(); du.delete(); dv.delete(); }
  };
  const inPlaneOffset = (point, normal, plane, distance) => {
    const alongPlane = normal.x * plane.x + normal.y * plane.y + normal.z * plane.z;
    const ix = normal.x - plane.x * alongPlane, iy = normal.y - plane.y * alongPlane, iz = normal.z - plane.z * alongPlane;
    const mag = Math.hypot(ix, iy, iz);
    if (mag < 1e-6) return point;
    const delta = distance / mag;
    return { x: point.x - ix / mag * delta, y: point.y - iy / mag * delta, z: point.z - iz / mag * delta };
  };
  const polygonWire = (points) => {
    const polygon = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(polygon);
    points.forEach((point) => {
      const p = new oc.gp_Pnt_3(point.x, point.y, point.z); owned.push(p);
      polygon.Add_1(p);
    });
    polygon.Close();
    if (!polygon.IsDone()) return null;
    const wire = polygon.Wire(); owned.push(wire);
    return wire;
  };
  const offsetGroup = (edges, walls, axis, origin) => {
    const points = [];
    edges.forEach((edge) => {
      sampleEdge(edge, 8).forEach((point) => {
        let best = null;
        walls.forEach((face) => {
          const hit = faceNormalAt(face, point);
          if (!best || hit.dist < best.dist) best = hit;
        });
        if (!best || best.dist > 0.2) return;
        points.push(inPlaneOffset(point, best.normal, axis, size));
      });
    });
    if (points.length < 3) return null;
    const seed = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    const xAxis = normalizedVector({ x: seed.y * axis.z - seed.z * axis.y, y: seed.z * axis.x - seed.x * axis.z, z: seed.x * axis.y - seed.y * axis.x });
    const yAxis = { x: axis.y * xAxis.z - axis.z * xAxis.y, y: axis.z * xAxis.x - axis.x * xAxis.z, z: axis.x * xAxis.y - axis.y * xAxis.x };
    const ordered = points.slice().sort((a, b) => {
      const au = (a.x - origin.x) * xAxis.x + (a.y - origin.y) * xAxis.y + (a.z - origin.z) * xAxis.z;
      const av = (a.x - origin.x) * yAxis.x + (a.y - origin.y) * yAxis.y + (a.z - origin.z) * yAxis.z;
      const bu = (b.x - origin.x) * xAxis.x + (b.y - origin.y) * xAxis.y + (b.z - origin.z) * xAxis.z;
      const bv = (b.x - origin.x) * yAxis.x + (b.y - origin.y) * yAxis.y + (b.z - origin.z) * yAxis.z;
      return Math.atan2(av, au) - Math.atan2(bv, bu);
    });
    const resampled = [];
    for (let i = 0; i < 36; i++) {
      const target = -Math.PI + 2 * Math.PI * i / 36;
      let best = ordered[0], bestDelta = 1e9;
      ordered.forEach((point) => {
        const u = (point.x - origin.x) * xAxis.x + (point.y - origin.y) * xAxis.y + (point.z - origin.z) * xAxis.z;
        const v = (point.x - origin.x) * yAxis.x + (point.y - origin.y) * yAxis.y + (point.z - origin.z) * yAxis.z;
        let delta = Math.atan2(v, u) - target;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        if (Math.abs(delta) < bestDelta) { bestDelta = Math.abs(delta); best = point; }
      });
      resampled.push(best);
    }
    return polygonWire(resampled);
  };
  try {
    const opening = faceDescriptor(oc, removed[0]);
    if (opening.surface !== "plane") throw new Error("Shell section fallback needs a planar opening");
    const axis = normalizedVector(opening.normal);
    const origin = opening.origin;
    if (removed.some((face) => Math.abs(Math.abs(
      (faceDescriptor(oc, face).normal.x || 0) * axis.x
      + (faceDescriptor(oc, face).normal.y || 0) * axis.y
      + (faceDescriptor(oc, face).normal.z || 0) * axis.z
    ) - 1) > 1e-3)) throw new Error("Shell openings are not parallel");
    const openingCoords = removed.map((face) => along(faceDescriptor(oc, face).origin, axis, origin));
    const centreProps = new oc.GProp_GProps_1(); owned.push(centreProps);
    oc.BRepGProp.VolumeProperties_1(brep.shape, centreProps, false, false, false);
    const mass = centreProps.CentreOfMass(); owned.push(mass);
    const centre = pointOf(mass);
    const capCoords = [];
    const faceExplorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); owned.push(faceExplorer);
    const bodyFaces = [];
    while (faceExplorer.More()) {
      const face = oc.TopoDS.Face_1(faceExplorer.Current()); owned.push(face);
      const descriptor = faceDescriptor(oc, face);
      bodyFaces.push({ face, descriptor });
      if (descriptor.surface === "plane" && Math.abs((descriptor.normal.x || 0) * axis.x + (descriptor.normal.y || 0) * axis.y + (descriptor.normal.z || 0) * axis.z) > 0.9) {
        const coord = along(descriptor.origin, axis, origin);
        if (!openingCoords.some((value) => Math.abs(value - coord) < 1e-4)
          && !removed.some((openingFace) => openingFace.IsSame(face))) capCoords.push(coord);
      }
      faceExplorer.Next();
    }
    const edgeExplorer = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); owned.push(edgeExplorer);
    const groups = new Map();
    while (edgeExplorer.More()) {
      const edge = oc.TopoDS.Edge_1(edgeExplorer.Current()); owned.push(edge);
      const adaptor = new oc.BRepAdaptor_Curve_2(edge); owned.push(adaptor);
      const samples = [];
      for (let i = 0; i < 5; i++) {
        const parameter = adaptor.FirstParameter() + (adaptor.LastParameter() - adaptor.FirstParameter()) * i / 4;
        const point = adaptor.Value(parameter); owned.push(point);
        samples.push(along(pointOf(point), axis, origin));
      }
      if (samples.every((value) => Math.abs(value - samples[0]) < 1e-4)) {
        const key = samples[0].toFixed(5);
        if (!groups.has(key)) groups.set(key, { coord: +key, edges: [] });
        const group = groups.get(key);
        if (!group.edges.some((other) => other.IsSame(edge))) group.edges.push(edge);
      }
      edgeExplorer.Next();
    }
    const sorted = [...groups.values()].sort((a, b) => a.coord - b.coord);
    if (sorted.length < 2) throw new Error("Shell section fallback needs two planar loops");
    const spanIsSmooth = (a, b) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return bodyFaces.some(({ descriptor }) => {
        if (descriptor.surface !== "bspline" && descriptor.surface !== "bezier") return false;
        const bounds = descriptor.bounds;
        if (!bounds) return false;
        const ends = [along(bounds.min, axis, origin), along(bounds.max, axis, origin)];
        return Math.min(...ends) < hi - 1e-4 && Math.max(...ends) > lo + 1e-4;
      });
    };
    const offsetFaceUniform = (edges) => {
      const maker = new oc.BRepBuilderAPI_MakeWire_1(); owned.push(maker);
      edges.forEach((edge) => maker.Add_1(edge));
      if (!maker.IsDone()) return null;
      const wire = maker.Wire(); owned.push(wire);
      const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(wire, true); owned.push(faceMaker);
      if (!faceMaker.IsDone()) return null;
      const face = faceMaker.Face(); owned.push(face);
      const props = new oc.GProp_GProps_1(); owned.push(props);
      oc.BRepGProp.SurfaceProperties_1(face, props, true, false);
      const area = Math.abs(props.Mass());
      for (const sign of [-1, 1]) {
        const offsetter = new oc.BRepOffsetAPI_MakeOffset_2(face, oc.GeomAbs_JoinType.GeomAbs_Arc, false); owned.push(offsetter);
        try { offsetter.Perform(sign * size, 0); } catch { continue; }
        if (!offsetter.IsDone()) continue;
        const shape = offsetter.Shape(); owned.push(shape);
        let offsetWire = null;
        if (shape.ShapeType().value === oc.TopAbs_ShapeEnum.TopAbs_WIRE.value) offsetWire = oc.TopoDS.Wire_1(shape);
        else {
          const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          try { if (explorer.More()) offsetWire = oc.TopoDS.Wire_1(explorer.Current()); } finally { explorer.delete(); }
        }
        if (!offsetWire) continue;
        owned.push(offsetWire);
        const checkMaker = new oc.BRepBuilderAPI_MakeFace_15(offsetWire, true); owned.push(checkMaker);
        if (!checkMaker.IsDone()) continue;
        const checkFace = checkMaker.Face(); owned.push(checkFace);
        const checkProps = new oc.GProp_GProps_1(); owned.push(checkProps);
        oc.BRepGProp.SurfaceProperties_1(checkFace, checkProps, true, false);
        if (Math.abs(checkProps.Mass()) < area - 1e-9) return offsetWire;
      }
      return null;
    };
    const shiftCap = (wire, coord) => {
      if (!capCoords.some((value) => Math.abs(value - coord) < 1e-4)
        || openingCoords.some((value) => Math.abs(value - coord) < 1e-4)) return wire;
      const inward = along(centre, axis, origin) - coord;
      const shift = (inward >= 0 ? 1 : -1) * size;
      const trsf = new oc.gp_Trsf_1(), vector = new oc.gp_Vec_4(axis.x * shift, axis.y * shift, axis.z * shift); owned.push(trsf, vector);
      trsf.SetTranslation_1(vector);
      const moved = new oc.BRepBuilderAPI_Transform_2(wire, trsf, true); owned.push(moved);
      const placed = oc.TopoDS.Wire_1(moved.Shape()); owned.push(placed);
      return placed;
    };
    const pieces = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const lo = Math.min(sorted[i].coord, sorted[i + 1].coord), hi = Math.max(sorted[i].coord, sorted[i + 1].coord);
      const walls = bodyFaces.filter(({ descriptor }) => {
        if (descriptor.surface === "plane" && Math.abs((descriptor.normal.x || 0) * axis.x + (descriptor.normal.y || 0) * axis.y + (descriptor.normal.z || 0) * axis.z) > 0.9) return false;
        const bounds = descriptor.bounds;
        if (!bounds) return true;
        const ends = [along(bounds.min, axis, origin), along(bounds.max, axis, origin)];
        return Math.min(...ends) < hi - 1e-4 && Math.max(...ends) > lo + 1e-4;
      }).map((entry) => entry.face);
      const smooth = spanIsSmooth(sorted[i].coord, sorted[i + 1].coord);
      const offset = (edges) => smooth ? offsetGroup(edges, walls, axis, origin) : offsetFaceUniform(edges);
      const wireA = shiftCap(offset(sorted[i].edges), sorted[i].coord);
      const wireB = shiftCap(offset(sorted[i + 1].edges), sorted[i + 1].coord);
      if (!wireA || !wireB) throw new Error("Shell section offset failed");
      const maker = new oc.BRepOffsetAPI_ThruSections(true, !smooth, 1e-6); owned.push(maker);
      maker.AddWire(wireA);
      maker.AddWire(wireB);
      maker.CheckCompatibility(true);
      const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
      maker.Build(progress);
      if (!maker.IsDone()) throw new Error("Shell section loft failed");
      const shape = maker.Shape();
      pieces.push({ oc, shape: shapeVolume(oc, shape) < 0 ? shape.Reversed() : shape, kind: "solid" });
    }
    let inner = pieces[0];
    for (let i = 1; i < pieces.length; i++) {
      const fused = await booleanBrep("union", inner, pieces[i]);
      if (inner !== pieces[0]) disposeBrep(inner);
      inner = fused;
    }
    try {
      const result = await booleanBrep("subtract", brep, inner);
      if (!shapeIsValid(oc, result.shape) || !(shapeVolume(oc, result.shape) > 1e-9)) {
        disposeBrep(result);
        throw new Error("Shell section cavity is invalid");
      }
      const before = shapeBounds(oc, brep.shape, false), after = shapeBounds(oc, result.shape, false);
      const grown = !before || !after || after.min.x < before.min.x - 1e-4 || after.max.x > before.max.x + 1e-4
        || after.min.y < before.min.y - 1e-4 || after.max.y > before.max.y + 1e-4
        || after.min.z < before.min.z - 1e-4 || after.max.z > before.max.z + 1e-4;
      if (grown) { disposeBrep(result); throw new Error("Shell section cavity grew the body"); }
      const limiter = new oc.ShapeFix_ShapeTolerance();
      try { limiter.LimitTolerance(result.shape, 1e-7, 1e-3, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); }
      finally { limiter.delete(); }
      result.operation = "shell";
      return result;
    } finally {
      disposeBrep(inner);
      pieces.forEach((piece) => { if (piece !== inner) disposeBrep(piece); });
    }
  } finally { disposeAll(owned); }
}

function shapeHasSolid(oc, shape) {
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try { return explorer.More(); } finally { explorer.delete(); }
}

function shapeVolume(oc, shape) {
  const props = new oc.GProp_GProps_1();
  try { oc.BRepGProp.VolumeProperties_1(shape, props, false, false, false); return props.Mass(); }
  finally { props.delete(); }
}

/* Thicken: give a surface a thickness.
 *
 * The selected faces are offset into a slab of their own. On a surface body —
 * a sweep or a loft built with "Create solid" off, which has no volume at all —
 * that slab IS the answer, which is the classic surface-to-solid. On a solid it
 * is a boss standing on the chosen faces, so the slab is fused back in; leaving
 * it loose would silently replace the body it was grown from.
 *
 * MakeThickSolidBySimple is the offset used rather than the join variant: a
 * face is a single sheet with nothing to intersect against, and the join
 * variant returns a corner-rounded shell of the wrong volume for one. It has
 * one trap — a POSITIVE offset comes back inside out (negative volume) while a
 * negative one does not — so the orientation is read off the volume and fixed
 * rather than assumed from the sign. */
export async function thickenBrep(brep, thickness, options = {}) {
  if (!brep?.shape) throw new Error("Thicken needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const faces = selectedBrepSubshapes(brep, "face", options.facePersistentIds || options.faces || []);
  if (!faces.length) throw new Error("Thicken has no resolved faces");
  const size = Math.abs(Number(thickness) || 0);
  if (!(size > 1e-6)) throw new Error("Thicken needs a non-zero thickness");
  const offset = (options.direction === "inside" ? -1 : 1) * size;
  const owned = [];
  let slab = null;
  try {
    let source = faces[0];
    if (faces.length > 1) {
      // Separate sheets offset separately would overlap at every shared edge;
      // sewn first, they are one surface and the offset is one wall.
      const sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false); owned.push(sewing);
      const sewProgress = new oc.Message_ProgressRange_1(); owned.push(sewProgress);
      faces.forEach((face) => sewing.Add(face));
      sewing.Perform(sewProgress);
      source = sewing.SewedShape();
    }
    const maker = new oc.BRepOffsetAPI_MakeThickSolid(); owned.push(maker);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    maker.MakeThickSolidBySimple(source, offset);
    maker.Build(progress);
    if (maker.HasErrors?.() || !maker.IsDone?.()) throw new Error("OpenCascade thicken failed");
    let shape = maker.Shape();
    const volume = shapeVolume(oc, shape);
    if (!Number.isFinite(volume) || Math.abs(volume) < 1e-9) throw new Error("Thicken produced an empty solid");
    if (volume < 0) shape = shape.Reversed();
    slab = { oc, shape, kind: "solid", operation: "thicken" };
    if (!shapeHasSolid(oc, brep.shape)) return slab;   // a surface has nothing to fuse into
    const fused = await booleanBrep("union", brep, slab);
    disposeBrep(slab); slab = null;
    fused.operation = "thicken";
    return fused;
  } catch (error) {
    if (slab) disposeBrep(slab);
    throw error;
  } finally { disposeAll(owned); }
}

function solidPieces(oc, shape) {
  const explorer = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const pieces = [];
  try {
    while (explorer.More()) {
      const solid = oc.TopoDS.Solid_1(explorer.Current());
      const props = new oc.GProp_GProps_1();
      try {
        oc.BRepGProp.VolumeProperties_1(solid, props, false, false, false);
        const centre = props.CentreOfMass();
        try { pieces.push({ shape: solid, volume: props.Mass(), centre: pointOf(centre) }); }
        finally { centre.delete(); }
      } finally { props.delete(); }
      explorer.Next();
    }
  } finally { explorer.delete(); }
  return pieces;
}

/* Split a solid in two along a plane.
 *
 * BRepAlgoAPI_Splitter, not a pair of boolean cuts: the splitter cuts once and
 * hands back both pieces already sharing the new face, so the two halves meet
 * exactly instead of each carrying its own rounding of the same plane.
 *
 * Which half survives is stated, not inferred, because both are real answers:
 * "positive" is the side the plane's normal points at, "negative" the other,
 * and "both" is the compound the splitter itself returns — a document that
 * wants two independently selectable bodies asks for the two sides separately,
 * which is what the model editor's Split command does. */
export async function splitBrep(brep, options = {}) {
  if (!brep?.shape) throw new Error("Split needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const axis = options.axis === "x" ? "x" : options.axis === "z" ? "z" : "y";
  const at = Number(options.offset) || 0;
  const bounds = shapeBounds(oc, brep.shape);
  if (!bounds) throw new Error("Split body has no measurable bounds");
  /* A plane flush with a face is not a cut, and Bnd_Box overshoots by about a
     ten-millionth, so the guard needs a margin scaled to the body rather than
     an absolute epsilon — otherwise "split at 0" quietly returns the whole
     body as if it had been parted. */
  const margin = Math.max(1e-6, 1e-6 * (bounds.max[axis] - bounds.min[axis]));
  if (at <= bounds.min[axis] + margin || at >= bounds.max[axis] - margin)
    throw new Error("The split plane misses the body it is meant to cut");
  const keep = options.keep === "negative" ? "negative" : options.keep === "both" ? "both" : "positive";
  // a plane face wider than the body in every direction, so the cut is complete
  const reach = Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) + 1;
  const centre = {
    x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2, z: (bounds.min.z + bounds.max.z) / 2,
  };
  centre[axis] = at;
  const owned = [];
  try {
    const point = new oc.gp_Pnt_3(centre.x, centre.y, centre.z); owned.push(point);
    const normal = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(normal);
    const plane = new oc.gp_Pln_3(point, normal); owned.push(plane);
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_9(plane, -reach, reach, -reach, reach); owned.push(faceMaker);
    const splitter = new oc.BRepAlgoAPI_Splitter_1(); owned.push(splitter);
    const args = new oc.TopTools_ListOfShape_1(), tools = new oc.TopTools_ListOfShape_1(); owned.push(args, tools);
    args.Append_1(brep.shape); tools.Append_1(faceMaker.Face());
    splitter.SetArguments(args); splitter.SetTools(tools);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    splitter.Build(progress);
    if (splitter.HasErrors?.()) throw new Error("OpenCascade split failed");
    const result = splitter.Shape();
    if (keep === "both") return { oc, shape: result, kind: "compound", operation: "split" };
    const pieces = solidPieces(oc, result);
    const wanted = pieces.filter((piece) => (keep === "positive" ? piece.centre[axis] > at : piece.centre[axis] < at));
    pieces.filter((piece) => !wanted.includes(piece)).forEach((piece) => piece.shape.delete?.());
    if (!wanted.length) throw new Error("The split left nothing on the side that was asked for");
    if (wanted.length === 1) return { oc, shape: wanted[0].shape, kind: "solid", operation: "split" };
    // a concave body can leave several lumps on one side; they are one result
    const joined = await compoundBrep(wanted.map((piece) => ({ oc, shape: piece.shape })));
    joined.operation = "split";
    return joined;
  } finally { disposeAll(owned); }
}

/* Move or copy a whole body.
 *
 * The rotation turns about the body's own centre of mass rather than the world
 * origin, because a body sitting a metre out would otherwise be flung across
 * the document by a five-degree turn. Rotation is applied first and the
 * translation after it, so the numbers in the form mean what they read: turn it
 * this much, then shift it this far.
 *
 * `copy` returns the original AND the moved body as a compound — not a fuse,
 * because two bodies that happen to touch are still two bodies. */
export async function moveBodyBrep(brep, options = {}) {
  if (!brep?.shape) throw new Error("Move body needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const dx = Number(options.dx) || 0, dy = Number(options.dy) || 0, dz = Number(options.dz) || 0;
  const angle = ((Number(options.angle) || 0) * Math.PI) / 180;
  if (!dx && !dy && !dz && !angle) throw new Error("Move body has nothing to move: no offset and no rotation");
  const axis = options.axis === "x" ? "x" : options.axis === "z" ? "z" : "y";
  const owned = [];
  let moved = null;
  try {
    const rotation = new oc.gp_Trsf_1(); owned.push(rotation);
    if (angle) {
      const props = new oc.GProp_GProps_1(); owned.push(props);
      oc.BRepGProp.VolumeProperties_1(brep.shape, props, false, false, false);
      const mass = props.CentreOfMass(); owned.push(mass);
      const pivot = new oc.gp_Pnt_3(mass.X(), mass.Y(), mass.Z()); owned.push(pivot);
      const direction = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(direction);
      const line = new oc.gp_Ax1_2(pivot, direction); owned.push(line);
      rotation.SetRotation_1(line, angle);
    }
    const shift = new oc.gp_Trsf_1(); owned.push(shift);
    const vector = new oc.gp_Vec_4(dx, dy, dz); owned.push(vector);
    shift.SetTranslation_1(vector);
    const combined = shift.Multiplied(rotation); owned.push(combined);
    const maker = new oc.BRepBuilderAPI_Transform_2(brep.shape, combined, true); owned.push(maker);
    const placement={matrix:Array.from({length:9},(_,i)=>combined.Value(Math.floor(i/3)+1,i%3+1)),translation:{x:combined.Value(1,4),y:combined.Value(2,4),z:combined.Value(3,4)}};
    moved = { oc, shape: maker.Shape(), kind: brep.kind || "solid", operation: "moveBody",placement };
    if (!options.copy) return moved;
    const both = await compoundBrep([{ oc, shape: brep.shape }, moved]);
    both.operation = "moveBody";both.placement=placement;
    disposeBrep(moved);moved = null;
    return both;
  } finally { if (options.copy && moved) disposeBrep(moved); disposeAll(owned); }
}

/* Rib: a drawn line braced into a web.
 *
 * The sketch is a LINE, so the loop is made here rather than picked: ribLoop
 * offsets the polyline to both sides (js/core/rib_profile.js) and the result is
 * carried out of the sketch plane. A draft angle makes it a loft between the
 * full-thickness section at the plane and the narrowed one at the far end,
 * which is exactly the taper draftBrep would tilt the side walls to — and it
 * needs no face selection, because the rib's own walls do not exist yet.
 *
 * Two things then make it a rib rather than a free-standing fin. The web is
 * TRIMMED to the extent of the body it braces, so a line drawn past the wall it
 * ends at does not shoot out into space; and it is FUSED into that body, so the
 * brace and the part are one solid the way a moulded rib is.
 *
 * "up-to-body" runs the web across the body's whole extent along the pull and
 * lets the trim decide where it stops. "blind" runs a stated depth instead. */
export async function ribBrep(brep, params = {}) {
  if (!brep?.shape) throw new Error("Rib needs a body to brace");
  const oc = brep.oc || await loadCadKernel();
  const line = params.points || params.line || [];
  if ((line || []).length < 2) throw new Error("Rib needs an open sketch line of at least two points");
  const thickness = Math.abs(Number(params.thickness) || 0);
  if (!(thickness > 1e-6)) throw new Error("Rib needs a non-zero thickness");
  const bounds = shapeBounds(oc, brep.shape);
  if (!bounds) throw new Error("Rib body has no measurable bounds");
  if(params.orientation === "parallel")return parallelRibBrep(brep,params,line,thickness,oc);

  const frame = params.frame || null;
  const axisName = params.axis === "x" ? "x" : params.axis === "z" ? "z" : "y";
  const normal = frame ? frame.normal : { x: axisName === "x" ? 1 : 0, y: axisName === "y" ? 1 : 0, z: axisName === "z" ? 1 : 0 };
  const sign = params.direction === "reverse" ? -1 : 1;
  const base = Number(params.from) || 0;
  // How far the body reaches from the sketch plane along the pull, so
  // "up to the body" is a measured distance rather than a guess.
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
    corners.push((x * normal.x + y * normal.y + z * normal.z) * sign);
  const span = Math.max(...corners) - base * sign;
  const depth = params.extent === "blind"
    ? Math.abs(Number(params.depth) || 0)
    : span;
  if (!(depth > 1e-6)) throw new Error("The rib runs away from the body it braces, so it never reaches it");

  const near = ribLoop(line, thickness, params.side);
  const draftAngle = (Number(params.draftAngle) || 0)*(params.draftOutward?-1:1);
  const far = draftAngle ? ribDraftedLoop(line, thickness, params.side, depth, draftAngle) : near;
  const place = (loop, w) => loop.map((q) => (frame ? framePoint(frame, q.u, q.v, w) : mapSketchPoint(axisName, q.u, q.v, w)));

  /* The trim is LATERAL only. Clipping to the body's box outright would delete
     every rib that stands proud of the part — which is most of them — so the
     clip is the body's footprint SEEN FROM the sketch plane, run the length of
     the web. A line drawn past the wall it ends at is cut back to the part; a
     web standing up off a plate is left alone. */
  const flat = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
    flat.push(sketchCoordinates({ x, y, z }, frame, axisName));
  const pad = Math.max(1e-3, thickness);
  const rect = {
    u0: Math.min(...flat.map((q) => q.u)), u1: Math.max(...flat.map((q) => q.u)),
    v0: Math.min(...flat.map((q) => q.v)), v1: Math.max(...flat.map((q) => q.v)),
  };

  let web = null, trimmed = null, clip = null;
  try {
    web = draftAngle
      ? await makeBrepLoft({ sections: [place(near, base), place(far, base + sign * depth)], solid: true, ruled: true })
      : await makeBrepExtrusion({ axis: axisName, frame, from: base, to: base + sign * depth, points: near });
    clip = await makeBrepExtrusion({
      axis: axisName, frame,
      from: Math.min(base, base + sign * depth) - pad, to: Math.max(base, base + sign * depth) + pad,
      points: [{ u: rect.u0, v: rect.v0 }, { u: rect.u1, v: rect.v0 }, { u: rect.u1, v: rect.v1 }, { u: rect.u0, v: rect.v1 }],
    });
    trimmed = await booleanBrep("intersect", web, clip);
    if (!shapeHasSolid(oc, trimmed.shape)) throw new Error("The rib line does not cross the body it braces");
    const fused = await booleanBrep("union", brep, trimmed);
    fused.operation = "rib";
    return fused;
  } finally {
    if (web) disposeBrep(web);
    if (clip) disposeBrep(clip);
    if (trimmed) disposeBrep(trimmed);
  }
}

/* Grow an open profile in its own plane, then give the resulting web thickness
   across that plane. The stopping plane comes from exact first-hit body faces,
   never the body's bounding box. A curved first-hit surface trims an oversize
   web with the exact face; only pieces connected to the outside profile remain. */
async function parallelRibBrep(brep,params,line,thickness,oc) {
  if(params.extent === "blind")throw new Error("Parallel-to-sketch Rib requires Up to the body");
  const frame=params.frame || null;
  const axis=params.axis === "x" ? "x" : params.axis === "z" ? "z" : "y";
  const base=Number(params.from)||0,growth=ribGrowthVector(params.growthDirection,line);
  const place=(q,w)=>frame ? framePoint(frame,q.u,q.v,w) : mapSketchPoint(axis,q.u,q.v,w);
  const origin=place({u:0,v:0},0),uPoint=place({u:1,v:0},0),vPoint=place({u:0,v:1},0);
  const uAxis={x:uPoint.x-origin.x,y:uPoint.y-origin.y,z:uPoint.z-origin.z};
  const vAxis={x:vPoint.x-origin.x,y:vPoint.y-origin.y,z:vPoint.z-origin.z};
  const worldGrowth={x:uAxis.x*growth.u+vAxis.x*growth.v,y:uAxis.y*growth.u+vAxis.y*growth.v,z:uAxis.z*growth.u+vAxis.z*growth.v};
  const offsets=ribOffsets(thickness,params.side),from=base-offsets.right,to=base+offsets.left;
  const sketchNormal=frame?.normal || {x:axis==='x'?1:0,y:axis==='y'?1:0,z:axis==='z'?1:0};
  const neutralCoordinate=Math.min(...line.map(q=>q.u*growth.u+q.v*growth.v));
  const neutralOrigin=place({u:growth.u*neutralCoordinate,v:growth.v*neutralCoordinate},base);
  const taper=async shape=>{
    if(!Number(params.draftAngle))return shape;
    try{return await draftParallelRibWeb(shape,params,sketchNormal,worldGrowth,neutralOrigin);}
    finally{disposeBrep(shape);}
  };
  const faces=[],explorer=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let web=null,fused=null;const extras=[];
  try{
    while(explorer.More()){faces.push(oc.TopoDS.Face_1(explorer.Current()));explorer.Next();}
    if(params.profileExtension === "natural"){
      line=extendNaturalRibEnds(brep,line,faces,place,from,to,sketchNormal);
    }
    const samples=[];
    for(let i=0;i<line.length-1;i++)for(const fraction of [0,.25,.5,.75,1])samples.push({u:line[i].u+(line[i+1].u-line[i].u)*fraction,v:line[i].v+(line[i+1].v-line[i].v)*fraction});
    let stop=null,stopFace=null,single=true;const contacts=[];
    for(const w of [from,(from+to)/2,to])for(const q of samples){
      const point=place(q,w);
      if(solidContainsPoint(oc,brep.shape,point,1e-6))continue;
      let hit=null,hitFace=null;
      for(const face of faces){const distance=rayHitsBrepFace(oc,point,worldGrowth,face,-1e-7);if(distance!=null && (hit==null || distance<hit)){hit=distance;hitFace=face;}}
      if(!hitFace)throw new Error("The rib profile does not reach the body in the chosen in-plane direction at sketch ("+q.u.toFixed(6)+", "+q.v.toFixed(6)+") and thickness offset "+w.toFixed(6));
      const descriptor=faceDescriptor(oc,hitFace);
      contacts.push({q,w,hit});
      if(!stop){stop=descriptor;stopFace=hitFace;}
      else if(stop.surface!=="plane" || descriptor.surface!=="plane"){
        if(!stopFace.IsSame(hitFace))single=false;
      }
      else{
        const dot=stop.normal.x*descriptor.normal.x+stop.normal.y*descriptor.normal.y+stop.normal.z*descriptor.normal.z;
        const offset=(descriptor.origin.x-stop.origin.x)*stop.normal.x+(descriptor.origin.y-stop.origin.y)*stop.normal.y+(descriptor.origin.z-stop.origin.z)*stop.normal.z;
        if(Math.abs(Math.abs(dot)-1)>1e-6 || Math.abs(offset)>1e-5)single=false;
      }
    }
    if(!stop)throw new Error("The rib profile is already inside the body and adds no web");
    /* A profile that meets several surfaces (HOUSING Rib2: its line meets the
       wall, its arc the loft and the boss) grows an oversize slab and takes only
       what the body leaves free that is connected to the profile. Nothing
       guesses a floor: whatever first surfaces the growth meets bound the web,
       and the pieces beyond the walls are disconnected from the profile. */
    if(!single){
      const bounds=shapeBounds(oc,brep.shape),reach=Math.hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z)+Math.max(thickness,1);
      const projected=line.map(q=>q.u*growth.u+q.v*growth.v),coordinate=Math.max(...projected)+reach;
      const loop=ribWebLoop(line,growth,{u:growth.u*coordinate,v:growth.v*coordinate,normal:growth});
      const slab=await taper(await makeBrepExtrusion({axis,frame,from,to,points:loop}));extras.push(slab);
      const free=await booleanBrep("subtract",slab,brep);extras.push(free);
      const seeds=contacts.map(contact=>place({u:contact.q.u+growth.u*Math.min(contact.hit/2,1e-3),v:contact.q.v+growth.v*Math.min(contact.hit/2,1e-3)},contact.w));
      const kept=solidPieces(oc,free.shape).filter(piece=>seeds.some(seed=>solidContainsPoint(oc,piece.shape,seed,1e-6)));
      if(!kept.length)throw new Error("The rib profile does not reach the body in the chosen in-plane direction");
      fused=brep;
      for(const piece of kept){
        const part={oc,shape:piece.shape,kind:"solid"};
        const next=await booleanBrep("union",fused,part);
        if(fused!==brep)disposeBrep(fused);
        fused=next;
      }
      if(shapeVolume(oc,fused.shape)<=shapeVolume(oc,brep.shape)+1e-8)throw new Error("The rib profile adds no material to the body");
      fused.operation="rib";
      const result=fused;fused=null;return result;
    }
    if(stop.surface!=="plane"){
      const run=Math.max(...contacts.map(contact=>contact.hit))+Math.max(thickness,1e-3);
      const projected=line.map(q=>q.u*growth.u+q.v*growth.v),coordinate=Math.max(...projected)+run;
      const loop=ribWebLoop(line,growth,{u:growth.u*coordinate,v:growth.v*coordinate,normal:growth});
      web=await taper(await makeBrepExtrusion({axis,frame,from,to,points:loop}));
      const trimmed=trimParallelRibToFace(oc,web.shape,stopFace,contacts.map(contact=>place({u:contact.q.u+growth.u*Math.min(contact.hit/2,1e-3),v:contact.q.v+growth.v*Math.min(contact.hit/2,1e-3)},contact.w)));
      disposeBrep(web);web={oc,shape:trimmed,kind:"solid"};
    }else{
    const section=w=>{
      const localOrigin=place({u:0,v:0},w),n=stop.normal;
      const normal={u:n.x*uAxis.x+n.y*uAxis.y+n.z*uAxis.z,v:n.x*vAxis.x+n.y*vAxis.y+n.z*vAxis.z};
      const rhs=n.x*(stop.origin.x-localOrigin.x)+n.y*(stop.origin.y-localOrigin.y)+n.z*(stop.origin.z-localOrigin.z);
      const length2=normal.u*normal.u+normal.v*normal.v;
      return ribWebLoop(line,growth,{u:normal.u*rhs/length2,v:normal.v*rhs/length2,normal});
    };
    const near=section(from),far=section(to);
    const identical=near.length===far.length && near.every((q,i)=>Math.hypot(q.u-far[i].u,q.v-far[i].v)<1e-8);
    web=identical ? await makeBrepExtrusion({axis,frame,from,to,points:near})
      : await makeBrepLoft({sections:[near.map(q=>place(q,from)),far.map(q=>place(q,to))],solid:true,ruled:true});
    }
    if(stop.surface==="plane")web=await taper(web);
    fused=await booleanBrep("union",brep,web);
    if(shapeVolume(oc,fused.shape)<=shapeVolume(oc,brep.shape)+1e-8)throw new Error("The rib profile adds no material to the body");
    fused.operation="rib";
    const result=fused;fused=null;return result;
  }finally{explorer.delete();faces.forEach(face=>face.delete());if(web)disposeBrep(web);if(fused && fused!==brep)disposeBrep(fused);extras.forEach(item=>disposeBrep(item));}
}

// Continue only the two open end tangents. Body intersections, rather than
// sketch length or a centerline hit, determine the contact across the wall.
function extendNaturalRibEnds(brep,line,faces,place,from,to,normal){
  const oc=brep.oc,extended=line.map(q=>({...q}));
  const widthInside=q=>{
    const start=place(q,from),p=new oc.gp_Pnt_3(start.x,start.y,start.z);
    const d=new oc.gp_Dir_4(normal.x,normal.y,normal.z),ray=new oc.gp_Lin_3(p,d);
    const inter=new oc.BRepIntCurveSurface_Inter(),stations=[0,to-from];
    try{
      inter.Init_2(brep.shape,ray,1e-7);
      while(inter.More()){
        const w=inter.W();
        if(isOnOrIn(oc,inter.State()) && w>0 && w<to-from)stations.push(w);
        inter.Next();
      }
      stations.sort((a,b)=>a-b);
      const checks=[0,to-from];
      for(let i=1;i<stations.length;i++)checks.push((stations[i-1]+stations[i])/2);
      return checks.every(w=>solidContainsPoint(oc,brep.shape,{x:start.x+normal.x*w,y:start.y+normal.y*w,z:start.z+normal.z*w},1e-6));
    }finally{inter.delete();ray.delete();d.delete();p.delete();}
  };
  for(const [index,neighbor] of [[0,1],[line.length-1,line.length-2]]){
    const q=line[index],other=line[neighbor],length=Math.hypot(q.u-other.u,q.v-other.v);
    if(!(length>1e-8))throw new Error("Natural Rib has a degenerate end tangent");
    if(widthInside(q))continue;
    const tangent={u:(q.u-other.u)/length,v:(q.v-other.v)/length};
    const a=place(q,0),b=place({u:q.u+tangent.u,v:q.v+tangent.v},0);
    const direction={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z};
    let distance=0;
    for(let i=0;i<=32;i++){
      const point=place(q,from+(to-from)*i/32);
      if(solidContainsPoint(oc,brep.shape,point,1e-6))continue;
      let hit=null;
      for(const face of faces){
        const value=rayHitsBrepFace(oc,point,direction,face,-1e-7);
        if(value!=null && (hit==null || value<hit))hit=value;
      }
      if(hit==null)throw new Error("Natural Rib end tangent does not reach the body across its full thickness");
      distance=Math.max(distance,hit);
    }
    // Preserve the measured boundary station. Native width classification
    // includes boundary contact and checks every interval, not just samples.
    const end={u:q.u+tangent.u*distance,v:q.v+tangent.v*distance};
    if(!widthInside(end))throw new Error("Natural Rib end cannot make continuous full-thickness contact");
    extended[index]=end;
  }
  return extended;
}

// Tilt only thickness walls about the outer profile plane perpendicular to
// growth. The body's exact stopping faces still trim the drafted web.
async function draftParallelRibWeb(web,params,normal,growth,origin){
  const oc=web.oc,owned=[],faces=[];
  const explorer=new oc.TopExp_Explorer_2(web.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);owned.push(explorer);
  try{
    while(explorer.More()){
      const face=oc.TopoDS.Face_1(explorer.Current());owned.push(face);
      const descriptor=faceDescriptor(oc,face),n=descriptor.normal;
      const atBase=descriptor.origin && Math.abs((descriptor.origin.x-origin.x)*normal.x+(descriptor.origin.y-origin.y)*normal.y+(descriptor.origin.z-origin.z)*normal.z)<1e-7;
      if(descriptor.surface==='plane' && n && Math.abs(n.x*normal.x+n.y*normal.y+n.z*normal.z)>1-1e-7 && !(params.side!=='both' && atBase))faces.push(face);
      explorer.Next();
    }
    if(!faces.length)throw new Error('Rib draft has no planar thickness walls');
    const point=new oc.gp_Pnt_3(origin.x,origin.y,origin.z),direction=new oc.gp_Dir_4(growth.x,growth.y,growth.z);owned.push(point,direction);
    const plane=new oc.gp_Pln_3(point,direction),maker=new oc.BRepOffsetAPI_DraftAngle_2(web.shape),progress=new oc.Message_ProgressRange_1();owned.push(plane,maker,progress);
    const angle=Number(params.draftAngle)*Math.PI/180*(params.draftOutward?-1:1);
    faces.forEach(face=>maker.Add(face,direction,angle,plane,true));
    if(!maker.AddDone())throw new Error('Rib draft cannot tilt its thickness walls');
    maker.Build(progress);if(!maker.IsDone?.())throw new Error('Rib draft failed');
    return {oc,shape:maker.Shape(),kind:'solid',operation:'rib-draft'};
  }finally{disposeAll(owned);}
}

async function shellWithPlanarThicknesses(brep, thickness, options, overrides) {
  const oc = brep.oc || await loadCadKernel(), owned = [], bodies = [];
  const keep = (v) => { owned.push(v); return v; };
  const track = (v) => { bodies.push(v); return v; };
  const openingIds = options.facePersistentIds || options.faces || [];
  const openings = selectedBrepSubshapes(brep, "face", openingIds);
  if (!openings.length) throw new Error("Shell needs at least one resolved face to remove");
  const vertices = [], ex = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try {
    for (; ex.More(); ex.Next()) {
      const current=ex.Current(),vertex=oc.TopoDS.Vertex_1(current),point=oc.BRep_Tool.Pnt(vertex);
      try { vertices.push(pointOf(point)); } finally { point.delete();vertex.delete();current.delete(); }
    }
  }
  finally { ex.delete(); }
  const walls = overrides.map((row) => {
    const faces = selectedBrepSubshapes(brep, "face", [row.facePersistentId]);
    if (faces.length !== 1) throw new Error("Shell thickness face could not be resolved uniquely");
    if (openings.some((face) => face.IsSame(faces[0]))) throw new Error("Shell opening cannot also have a wall thickness");
    return { ...row, face:faces[0], plane: shellSupportingPlane(faceDescriptor(oc, faces[0]), vertices, row.thickness) };
  });
  if(walls.some((wall,index)=>walls.slice(0,index).some(previous=>previous.face.IsSame(wall.face)))) throw new Error("Shell thickness needs unique retained faces");
  try {
    const bounds=shapeBounds(oc,brep.shape),reach=4*Math.max(1,Math.hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z),...overrides.map(row=>row.thickness));
    const clip = (cavity, planeDefinition) => {
      const { origin: p, normal: n } = planeDefinition;
      const plane = keep(new oc.gp_Pln_3(keep(new oc.gp_Pnt_3(p.x,p.y,p.z)), keep(new oc.gp_Dir_4(n.x,n.y,n.z))));
      const face = keep(new oc.BRepBuilderAPI_MakeFace_9(plane,-reach,reach,-reach,reach));
      const inside = keep(new oc.gp_Pnt_3(p.x-n.x,p.y-n.y,p.z-n.z));
      const half = keep(new oc.BRepPrimAPI_MakeHalfSpace_1(keep(face.Face()), inside));
      // Keep the common bounded by its cavity operand. Infinite-halfspace mass
      // is deliberately never used by the generic boolean volume guard.
      const clipped = track({ oc, shape: buildBoolean(oc,"intersect",cavity.shape,keep(half.Solid())), kind: "solid" });
      if (!shapeHasSolid(oc, clipped.shape) || !shapeIsValid(oc, clipped.shape)) throw new Error("Shell face thickness consumes the cavity");
      const before = Math.abs(shapeVolume(oc,cavity.shape)), after = Math.abs(shapeVolume(oc,clipped.shape));
      if (!(after > 1e-9 && after <= before + Math.max(1,before)*1e-7)) throw new Error("Shell face thickness produced an invalid cavity extent");
      return clipped;
    };
    // Vertex tests alone cannot certify a supporting plane on a body with
    // curved faces. A native common with the original halfspace must preserve
    // its volume before that selected wall may constrain the cavity.
    const sourceVolume=Math.abs(shapeVolume(oc,brep.shape));
    for(const wall of walls) {
      const {origin:p,normal:n}=wall.plane;
      const supported=clip(brep,{normal:n,origin:{x:p.x+n.x*wall.thickness,y:p.y+n.y*wall.thickness,z:p.z+n.z*wall.thickness}});
      if(Math.abs(Math.abs(shapeVolume(oc,supported.shape))-sourceVolume)>Math.max(1,sourceVolume)*1e-7) throw new Error("Variable Shell thickness requires a supporting exterior plane");
    }
    let cavity;
    try {
      const uniform = track(await shellBrep(brep, thickness, { ...options, faceThicknesses: [] }));
      if (uniform.invalid || uniform.approximate) throw new Error("Variable Shell requires an exact valid uniform cavity");
      cavity = track(await booleanBrep("subtract", brep, uniform));
      if (!shapeHasSolid(oc, cavity.shape) || !shapeIsValid(oc, cavity.shape)) throw new Error("Variable Shell has no valid uniform cavity");
      for (const wall of walls) if (wall.thickness !== Number(thickness)) cavity = clip(cavity,wall.plane);
    } catch (offsetError) {
      // Exact alternative for bodies whose retained faces are all supporting
      // planes. Intersect with the ORIGINAL body first: removed concave faces
      // stay open and the existing nonconvex void can never be filled.
      // Non-supporting or curved retained faces must use a true native offset.
      const planes = [], explorer = new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try {
        for(;explorer.More();explorer.Next()) {
          const current=explorer.Current(),face=oc.TopoDS.Face_1(current);
          try {
            if(openings.some(opening=>opening.IsSame(face))) continue;
            const wall=walls.find(row=>row.face.IsSame(face));
            planes.push(wall?.plane || shellSupportingPlane(faceDescriptor(oc,face),vertices,Number(thickness)));
          } finally {face.delete();current.delete();}
        }
      } catch (error) { throw new Error(`${offsetError.message}; exact planar Shell unavailable: ${error.message}`); }
      finally { explorer.delete(); }
      if(!planes.length) throw new Error("Shell has no retained supporting walls");
      cavity=brep;
      for(const plane of planes) cavity=clip(cavity,plane);
    }
    const result = await booleanBrep("subtract",brep,cavity);
    if (!shapeHasSolid(oc,result.shape) || !shapeIsValid(oc,result.shape)) {
      disposeBrep(result); throw new Error("Variable Shell produced an invalid wall solid");
    }
    result.operation = "shell";
    result.faceThicknesses = overrides.map((row) => ({ ...row }));
    return result;
  } finally { bodies.forEach(disposeBrep); disposeAll(owned); }
}

function trimParallelRibToFace(oc,shape,face,seeds) {
  const owned=[];let pieces=[],keep=[];
  try{
    const bounds=shapeBounds(oc,shape),reach=Math.hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y,bounds.max.z-bounds.min.z)+1;
    const cutter=enlargeFaceForSplit(oc,owned,face,reach);if(cutter!==face)owned.push(cutter);
    const splitter=new oc.BRepAlgoAPI_Splitter_1(),args=new oc.TopTools_ListOfShape_1(),tools=new oc.TopTools_ListOfShape_1(),progress=new oc.Message_ProgressRange_1();owned.push(splitter,args,tools,progress);
    args.Append_1(shape);tools.Append_1(cutter);splitter.SetArguments(args);splitter.SetTools(tools);splitter.SetNonDestructive?.(true);splitter.Build(progress);
    if(splitter.HasErrors?.())throw new Error("Parallel Rib cannot trim the web to its curved stopping surface");
    pieces=solidPieces(oc,splitter.Shape());
    if(pieces.length<2)throw new Error("Parallel Rib curved stopping surface did not divide the web");
    keep=pieces.filter(piece=>seeds.some(seed=>solidContainsPoint(oc,piece.shape,seed,1e-6)));
    if(keep.length!==1)throw new Error("Parallel Rib curved stop leaves ambiguous disconnected webs; split the profile into separate ribs");
    const result=keep[0].shape;keep=[];pieces=pieces.filter(piece=>piece.shape!==result);return result;
  }finally{pieces.forEach(piece=>piece.shape.delete?.());disposeAll(owned);}
}

/* The (u,v) a world point has on the rib's sketch plane — the inverse of the
   mapping the profile is placed through, so the trim rectangle is measured in
   the same coordinates the line was drawn in. */
function sketchCoordinates(point, frame, axisName) {
  if (frame) {
    const d = { x: point.x - (frame.origin?.x || 0), y: point.y - (frame.origin?.y || 0), z: point.z - (frame.origin?.z || 0) };
    return {
      u: d.x * frame.xAxis.x + d.y * frame.xAxis.y + d.z * frame.xAxis.z,
      v: d.x * frame.yAxis.x + d.y * frame.yAxis.y + d.z * frame.yAxis.z,
    };
  }
  if (axisName === "z") return { u: point.x, v: point.y };
  if (axisName === "x") return { u: point.z, v: point.y };
  return { u: point.x, v: point.z };
}

function mapSketchPoint(axisName, u, v, w) {
  if (axisName === "z") return { x: u, y: v, z: w };
  if (axisName === "x") return { x: w, y: v, z: u };
  return { x: u, y: w, z: v };
}

/* Draft as a feature of its own, not a sub-parameter of an extrusion.
   OCCT tilts each selected face about the line where it meets the neutral
   plane, so that plane is a real input rather than something inferred: the same
   faces at the same angle give a different solid depending on which end of the
   pull direction keeps its size. The neutral plane is perpendicular to the pull
   direction and sits at one extreme of the body along it (`neutral`), which is
   where a parting line actually falls, plus an explicit offset. */
// A circular planar face defines the base of an exact spherical cap.
export async function domeBrep(brep, height, options = {}) {
  if (!brep?.shape) throw new Error("Dome needs a solid body");
  height=Number(height);
  if (!(height>0) || !Number.isFinite(height)) throw new Error("Dome height must be positive");
  const oc=brep.oc || await loadCadKernel();
  const faces=selectedBrepSubshapes(brep,"face",options.facePersistentIds || []);
  if(faces.length!==1)throw new Error("Select one circular planar face for Dome");
  const descriptor=faceDescriptor(oc,faces[0]);
  if(descriptor.surface!=="plane")throw new Error("Dome requires a circular planar face");
  const edges=[],samples=[], explorer=new oc.TopExp_Explorer_2(faces[0],oc.TopAbs_ShapeEnum.TopAbs_EDGE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try{while(explorer.More()){const edge=oc.TopoDS.Edge_1(explorer.Current());try{edges.push(edgeDescriptor(oc,edge));const curve=new oc.BRepAdaptor_Curve_2(edge);try{const first=curve.FirstParameter(),last=curve.LastParameter();for(let i=0;i<=32;i++){const point=curve.Value(first+(last-first)*i/32);try{samples.push(pointOf(point));}finally{point.delete();}}}finally{curve.delete();}}finally{edge.delete();}explorer.Next();}}finally{explorer.delete();}
  const edge=edges[0];let radius=edge?.radius,center=edge?.origin;
  // Loft interpolation may represent a circular rim with rational splines.
  // Require the entire boundary, area and perimeter to agree with a disk.
  if(edges.length && edges.every(e=>e.curve==="bspline" || e.curve==="circle") && edges.some(e=>e.curve!=="circle")){
    center=descriptor.origin;radius=Math.sqrt(descriptor.measure/Math.PI);
    const tolerance=Math.max(1e-7,radius*1e-6),perimeter=edges.reduce((sum,e)=>sum+e.measure,0);
    if(samples.some(p=>Math.abs(Math.hypot(p.x-center.x,p.y-center.y,p.z-center.z)-radius)>tolerance) || Math.abs(perimeter-2*Math.PI*radius)>tolerance*10)throw new Error("Dome requires a full circular face without holes");
    for(const e of edges){e.curve="circle";e.radius=radius;e.origin=center;}
  }
  if(!edge || edges.some(e=>e.curve!=="circle" || Math.abs(e.radius-radius)>1e-6 || Math.hypot(e.origin.x-center.x,e.origin.y-center.y,e.origin.z-center.z)>1e-6) || Math.abs(descriptor.measure-Math.PI*radius*radius)>Math.max(1e-7,descriptor.measure*1e-5))throw new Error("Dome requires a full circular face without holes");
  const sphereRadius=(radius*radius+height*height)/(2*height),axisPoint={u:0,v:0},rim={u:radius,v:0},tip={u:0,v:height};
  const midpointAngle=(Math.atan2(sphereRadius-height,radius)+Math.PI/2)/2;
  const segments=[{type:"line",from:axisPoint,to:rim},{type:"arc",from:rim,to:tip,mid:{u:sphereRadius*Math.cos(midpointAngle),v:height-sphereRadius+sphereRadius*Math.sin(midpointAngle)},center:{u:0,v:height-sphereRadius},radius:sphereRadius,clockwise:false},{type:"line",from:tip,to:axisPoint}];
  const n=descriptor.normal,seed=Math.abs(n.y)<.9?{x:0,y:1,z:0}:{x:1,y:0,z:0};
  const x=normalizedVector({x:seed.y*n.z-seed.z*n.y,y:seed.z*n.x-seed.x*n.z,z:seed.x*n.y-seed.y*n.x});
  const z={x:x.y*n.z-x.z*n.y,y:x.z*n.x-x.x*n.z,z:x.x*n.y-x.y*n.x};
  let cap,placed;
  try{
    cap=await makeBrepRevolve({points:[axisPoint,rim,tip],segments,axis:"y",angle:360,radialProfile:true});
    placed=await placeBrep(cap,{matrix:[x.x,n.x,z.x,x.y,n.y,z.y,x.z,n.z,z.z],translation:center});
    return await booleanBrep("union",brep,placed);
  }finally{if(placed)disposeBrep(placed);if(cap)disposeBrep(cap);}
}

export async function draftBrep(brep, angleDegrees, options = {}) {
  if (!brep?.shape) throw new Error("Draft needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  if(Number(angleDegrees)===0)return translateBrep(brep,{x:0,y:0,z:0});
  const faces = selectedBrepSubshapes(brep, "face", options.facePersistentIds || options.faces || []);
  if (!faces.length) throw new Error("Draft has no resolved faces");
  const angle = ((Number(angleDegrees) || 0) * Math.PI) / 180;
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-9) throw new Error("Draft angle must be non-zero");
  const axis = options.pullAxis === "x" ? "x" : options.pullAxis === "z" ? "z" : "y";
  const sign = options.pullDirection === "reverse" ? -1 : 1;
  const bounds = shapeBounds(oc, brep.shape);
  if (!bounds) throw new Error("Draft body has no measurable bounds");
  const owned = [];
  try {
    let plane, pull;
    if (options.neutralFaceId) {
      /* SOLIDWORKS' Neutral Plane box: a picked planar face is the plane the
         drafted faces pivot on and keep their size at, and its outward normal is
         the direction of pull (Reverse flips the pull, not the pivot). */
      const neutral = resolveBrepSubshape(brep, options.neutralFaceId, "face");
      if (!neutral) throw new Error("Draft neutral plane face is unavailable");
      const neutralFace = oc.TopoDS.Face_1(neutral);
      if (faces.some((face) => face.IsSame(neutralFace))) throw new Error("Draft neutral face cannot also be drafted");
      const adaptor = new oc.BRepAdaptor_Surface_2(neutralFace, true); owned.push(adaptor);
      if (adaptor.GetType() !== oc.GeomAbs_SurfaceType.GeomAbs_Plane) throw new Error("Draft neutral plane must be a planar face");
      plane = adaptor.Plane(); owned.push(plane);
      const axisDir = plane.Axis().Direction(); owned.push(axisDir);
      const outward = neutralFace.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED ? -sign : sign;
      pull = new oc.gp_Dir_4(axisDir.X() * outward, axisDir.Y() * outward, axisDir.Z() * outward); owned.push(pull);
    } else {
      const at = (options.neutral === "start" ? bounds.min[axis] : bounds.max[axis]) + (Number(options.neutralOffset) || 0);
      const centre = {
        x: (bounds.min.x + bounds.max.x) / 2,
        y: (bounds.min.y + bounds.max.y) / 2,
        z: (bounds.min.z + bounds.max.z) / 2,
      };
      centre[axis] = at;
      const point = new oc.gp_Pnt_3(centre.x, centre.y, centre.z); owned.push(point);
      const normal = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(normal);
      plane = new oc.gp_Pln_3(point, normal); owned.push(plane);
      pull = new oc.gp_Dir_4(axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0); owned.push(pull);
    }
    const maker = new oc.BRepOffsetAPI_DraftAngle_2(brep.shape); owned.push(maker);
    const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
    // A face square to the pull direction has no line to tilt about. OCCT
    // records that in AddDone() rather than throwing, so it is read back here
    // instead of building a shape that silently ignored the selection.
    faces.forEach((face) => maker.Add(face, pull, angle, plane, true));
    if (!maker.AddDone()) throw new Error("Draft cannot tilt one of the selected faces about this neutral plane");
    maker.Build(progress);
    if (!maker.IsDone?.()) throw new Error("OpenCascade draft failed");
    return { oc, shape: maker.Shape(), kind: "solid", operation: "draft" };
  } finally { disposeAll(owned); }
}

// Convert any BREP (including booleans and fillets) to serialisable triangle
// data for Three.js.  Keeping plain arrays on the document means the exact
// result survives save/load without retaining WASM handles.
export async function shapeToMeshData(brep, options = {}) {
  if (!brep?.shape) throw new Error("Meshing needs a BREP shape");
  // The worker already meshed this unchanged exact body. A coarser requested
  // display can use that result; finer manufacturing meshes still rebuild.
  if(brep.workerMeshData && (Number(options.deflection)||.35)>=.24 && (Number(options.angle)||.22)>=.16)return structuredClone(brep.workerMeshData);
  const oc = brep.oc || await loadCadKernel();
  const deflection = Math.max(0.02, Number(options.deflection) || 0.35);
  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    brep.shape,
    deflection,
    false,
    Math.max(0.08, Number(options.angle) || 0.22),
    true,
  );
  const explorer = new oc.TopExp_Explorer_2(
    brep.shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  const positions = [];
  const faceRanges = [];
  try {
    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current());
      const location = new oc.TopLoc_Location_1();
      const purpose = oc.Poly_MeshPurpose?.Poly_MeshPurpose_NONE ?? 0;
      const handle = oc.BRep_Tool.Triangulation(face, location, purpose);
      if (handle && !handle.IsNull?.()) {
        const triangulation = handle.get();
        const transform = location.Transformation();
        const reversed = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
        const triangleStart = positions.length / 9;
        const nbNodes = triangulation.NbNodes();
        const nodes = new Float64Array(nbNodes * 3);
        for (let n = 1; n <= nbNodes; n++) {
          const point = triangulation.Node(n);
          point.Transform(transform);
          const idx = (n - 1) * 3;
          nodes[idx] = point.X();
          nodes[idx + 1] = point.Y();
          nodes[idx + 2] = point.Z();
          point.delete?.();
        }
        const nbTriangles = triangulation.NbTriangles();
        for (let i = 1; i <= nbTriangles; i++) {
          const triangle = triangulation.Triangle(i);
          const i1 = triangle.Value(1), i2 = triangle.Value(2), i3 = triangle.Value(3);
          const ids = reversed ? [i1, i3, i2] : [i1, i2, i3];
          for (const id of ids) {
            const idx = (id - 1) * 3;
            positions.push(nodes[idx], nodes[idx + 1], nodes[idx + 2]);
          }
          triangle.delete?.();
        }
        transform.delete?.();
        handle.delete?.();
        let topologyId = null;
        if (brep.subshapes) {
          for (const [persistentId, entry] of brep.subshapes) {
            if (entry.kind === "face" && entry.shape.IsSame(face)) { topologyId = persistentId; break; }
          }
        }
        faceRanges.push({ persistentId: topologyId, triangleStart, triangleCount: positions.length / 9 - triangleStart });
      }
      location.delete(); face.delete(); explorer.Next();
    }
  } finally {
    explorer.delete(); mesher.delete();
  }
  if (!positions.length) throw new Error("OpenCascade returned an empty mesh");
  /* `positions` stays a plain Array on purpose. Making it a Float32Array would
     save the push boxing, but meshData rides into localStorage through
     saveLib() -> JSON.stringify, and a typed array serialises as {"0":..,"1":..}
     — a saved model would come back with no usable geometry. Several readers
     also still gate on Array.isArray(meshData.positions). The batching win here
     is the per-face node cache above (~6x fewer WASM boundary crossings);
     converting the container is not worth corrupting the library for. */
  const normals = new Float32Array(positions.length);
  const colors = new Float32Array(positions.length);
  for (let t = 0; t < positions.length / 9; t++) {
    const i0 = t * 9;
    const ax = positions[i0], ay = positions[i0 + 1], az = positions[i0 + 2];
    const bx = positions[i0 + 3], by = positions[i0 + 4], bz = positions[i0 + 5];
    const cx = positions[i0 + 6], cy = positions[i0 + 7], cz = positions[i0 + 8];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    normals[i0] = nx; normals[i0 + 1] = ny; normals[i0 + 2] = nz;
    normals[i0 + 3] = nx; normals[i0 + 4] = ny; normals[i0 + 5] = nz;
    normals[i0 + 6] = nx; normals[i0 + 7] = ny; normals[i0 + 8] = nz;
    colors[i0] = 1; colors[i0 + 1] = 1; colors[i0 + 2] = 1;
    colors[i0 + 3] = 1; colors[i0 + 4] = 1; colors[i0 + 5] = 1;
    colors[i0 + 6] = 1; colors[i0 + 7] = 1; colors[i0 + 8] = 1;
  }
  const subshapeMap = Object.create(null);
  for (const range of faceRanges) {
    if (range.persistentId) {
      if (!subshapeMap[range.persistentId]) subshapeMap[range.persistentId] = [];
      for (let t = range.triangleStart; t < range.triangleStart + range.triangleCount; t++) {
        subshapeMap[range.persistentId].push(t);
      }
    }
  }
  return { positions, normals, colors, faceRanges, subshapeMap, exactBounds: shapeBounds(oc, brep.shape, false) };
}

export async function transformBrep(brep, transform = {}) {
  if (!brep?.shape) throw new Error("BREP transform needs a shape");
  const oc = brep.oc || await loadCadKernel();
  const origin = transform.origin || { x:0, y:0, z:0 };
  const xAxis = transform.xAxis || { x:1, y:0, z:0 };
  const yAxis = transform.yAxis || { x:0, y:1, z:0 };
  const zAxis = transform.zAxis || { x:0, y:0, z:1 };
  const scale = Number.isFinite(transform.scale) && transform.scale > 0 ? transform.scale : 1;
  const translation = (axis) => -scale * (origin.x * axis.x + origin.y * axis.y + origin.z * axis.z);
  const trsf = new oc.gp_Trsf_1();
  let maker;
  try {
    trsf.SetValues(
      scale*xAxis.x, scale*xAxis.y, scale*xAxis.z, translation(xAxis),
      scale*yAxis.x, scale*yAxis.y, scale*yAxis.z, translation(yAxis),
      scale*zAxis.x, scale*zAxis.y, scale*zAxis.z, translation(zAxis),
    );
    maker = new oc.BRepBuilderAPI_Transform_2(brep.shape, trsf, true);
    return { oc, shape:maker.Shape(), kind:brep.kind || "transformed", sourceName:brep.sourceName };
  } finally {
    maker?.delete?.(); trsf.delete();
  }
}

/* A copy of `source` put down by one rigid transform: the row-major 3x3
   rotation and the shift that follows it, v -> M.v + t. It is the shape every
   pattern placement already speaks — curvePatternPlacements() computes exactly
   this pair, and a linear offset is the identity matrix with the offset as t —
   so a merged pattern does not need a second notion of "where the copy went".
   gp_Trsf::SetValues takes the 3x4 directly and insists the basis be
   orthonormal, which a rotation is by construction. */
export async function placeBrep(source, placement = {}) {
  if (!source?.shape) throw new Error("Placement needs a BREP shape");
  const oc = source.oc || await loadCadKernel();
  const m = Array.isArray(placement.matrix) && placement.matrix.length === 9 ? placement.matrix.map(Number) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const t = placement.translation || { x: 0, y: 0, z: 0 };
  const owned = [];
  try {
    const trsf = new oc.gp_Trsf_1(); owned.push(trsf);
    trsf.SetValues(
      m[0], m[1], m[2], Number(t.x) || 0,
      m[3], m[4], m[5], Number(t.y) || 0,
      m[6], m[7], m[8], Number(t.z) || 0,
    );
    const maker = new oc.BRepBuilderAPI_Transform_2(source.shape, trsf, true); owned.push(maker);
    return { oc, shape: maker.Shape(), kind: source.kind || "solid" };
  } finally { disposeAll(owned); }
}

// Bounds of the placed solid, rather than a rotated local bounding box. Curved
// solids can retain smaller extents than the eight corners of their local box.
export async function placedBrepBounds(source, placement = {}) {
  const placed=await placeBrep(source,placement);
  try{return shapeBounds(placed.oc,placed.shape,false);}
  finally{disposeBrep(placed);}
}

/* Coplanar faces welded back into one after a boolean.
 *
 * BRepAlgoAPI_Fuse keeps the argument faces as it found them, so fusing a run
 * of overlapping copies leaves the outside of the result cut into as many
 * panels as there were copies — the material is one solid, but the SEAMS of the
 * bodies that made it are still faces. Picking one to fillet then rounds a
 * third of an edge. Unifying same-domain faces and edges is what makes the
 * fused body indistinguishable from a body that was always one shape, which is
 * the whole promise of "merge". */
export async function unifyBrepFaces(brep) {
  if (!brep?.shape) throw new Error("Unify needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const owned = [];
  try {
    const unifier = new oc.ShapeUpgrade_UnifySameDomain_2(brep.shape, true, true, false); owned.push(unifier);
    unifier.Build();
    return { oc, shape: unifier.Shape(), kind: brep.kind || "solid" };
  } finally { disposeAll(owned); }
}

/* Do these two solids share material? The question a merged pattern asks of
   every neighbouring pair, and the only honest answer comes from the kernel:
   two thin radial blades have overlapping bounding boxes and touch nowhere.
   Common-and-measure rather than fuse-and-count-lumps because it costs one
   boolean and gives a number, not a topology walk. Solids that meet on a plane
   and nowhere else share no volume and are reported apart — "overlap" is the
   rule the option states, and a measure-zero contact is not one. A boolean that
   fails answers "apart": leaving two bodies standing is the recoverable
   mistake, fusing them on a failed test is not. */
// Unlike the pattern convenience predicate, manufacturing scope must propagate
// kernel failures: a failed intersection is unknown, never a proven miss.
export async function brepMaterialIntersection(left,right,tolerance=1e-10){
  if(!left?.shape||!right?.shape)throw new Error("Exact intersection requires two solids");
  let common;
  try{common=await booleanBrep("intersect",left,right);const volume=shapeHasSolid(common.oc,common.shape)?Math.abs(shapeVolume(common.oc,common.shape)):0;return {intersects:volume>tolerance,volume,bounds:volume>tolerance?shapeBounds(common.oc,common.shape,false):null};}
  finally{if(common)disposeBrep(common);}
}

export async function brepsOverlap(left, right, tolerance = 1e-9) {
  if (!left?.shape || !right?.shape) return false;
  let common = null;
  try {
    common = await booleanBrep("intersect", left, right);
    const oc = common.oc;
    if (!shapeHasSolid(oc, common.shape)) return false;
    return Math.abs(shapeVolume(oc, common.shape)) > tolerance;
  } catch { return false; }
  finally { if (common) disposeBrep(common); }
}

/* The connected lumps of a set of solids, as index groups.
 *
 * Overlap is transitive here — A meets B and B meets C makes one body even
 * though A and C never touch — so this is a union-find over the pairs that a
 * cheap bounding-box test says are worth asking the kernel about. Pairs already
 * in the same group are skipped, which is what keeps a heavily overlapping
 * pattern near linear instead of testing all n(n-1)/2 pairs. */
export function boundsMayOverlap(a, b) {
  if (!a || !b) return true;
  return a.x0 <= b.x1 + 1e-6 && a.x1 >= b.x0 - 1e-6 && a.y0 <= b.y1 + 1e-6
    && a.y1 >= b.y0 - 1e-6 && a.z0 <= b.z1 + 1e-6 && a.z1 >= b.z0 - 1e-6;
}

export async function brepConnectedGroups(entries = []) {
  const parent = entries.map((entry, index) => index);
  const find = (index) => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };

  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (find(i) === find(j)) continue;
    if (!boundsMayOverlap(entries[i].bounds, entries[j].bounds)) continue;
    if (await brepsOverlap(entries[i].brep, entries[j].brep)) union(i, j);
  }
  const groups = new Map();
  entries.forEach((entry, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  });
  return [...groups.values()];
}

/* A plain move. transformBrep states one as a frame whose origin is the negated
   delta, which is easy to get backwards at the call site. */
export async function translateBrep(brep, delta = {}) {
  return transformBrep(brep, { origin: {
    x: -(Number(delta.x) || 0), y: -(Number(delta.y) || 0), z: -(Number(delta.z) || 0),
  } });
}

export async function compoundBrep(inputs=[]) {
  const valid=inputs.filter((entry)=>entry?.shape);if(!valid.length)throw new Error("Compound needs at least one shape");
  const oc=valid[0].oc || await loadCadKernel(),builder=new oc.TopoDS_Builder(),compound=new oc.TopoDS_Compound();
  try{builder.MakeCompound(compound);valid.forEach((entry)=>builder.Add(compound,entry.shape));return {oc,shape:compound,kind:"compound"};}
  catch(error){compound.delete?.();throw error;}finally{builder.delete();}
}

export async function linearPatternBrep(source,params={}) {
  if(!source?.shape)throw new Error("Pattern seed is unavailable");const count=Math.max(1,Math.round(Number(params.count)||1)),vector=params.vector || {x:0,y:0,z:0},copies=[source];
  try {
  for(let index=1;index<count;index++)copies.push(await transformBrep(source,{origin:{x:-Number(vector.x||0)*index,y:-Number(vector.y||0)*index,z:-Number(vector.z||0)*index}}));
  return await compoundBrep(copies);
  } finally {copies.slice(1).forEach(disposeBrep);}
}

export async function linearGridPatternBrep(source,params={}) {
  if(!source?.shape)throw new Error("Pattern seed is unavailable");
  const offsets=Array.isArray(params.offsets)?params.offsets.slice(0,127):[],copies=[source];
  try {
    for(const offset of offsets)copies.push(await transformBrep(source,{origin:{x:-Number(offset?.x||0),y:-Number(offset?.y||0),z:-Number(offset?.z||0)}}));
    return await compoundBrep(copies);
  } finally { copies.slice(1).forEach((copy)=>disposeBrep(copy)); }
}

export async function circularPatternBrep(source,params={}) {
  if(!source?.shape)throw new Error("Pattern seed is unavailable");const oc=source.oc || await loadCadKernel(),count=Math.max(1,Math.min(256,Math.round(Number(params.count)||1))),step=(Number(params.angle)||360/count)*Math.PI/180,copies=[source],skipped=new Set((params.skipIndices || []).map((value)=>Math.round(Number(value)))),pivot=circularPatternPivot(params);
  try {
  for(let index=1;index<count;index++){if(skipped.has(index))continue;const origin=new oc.gp_Pnt_3(pivot.x,pivot.y,pivot.z),direction=new oc.gp_Dir_4(params.axis==="x"?1:0,params.axis==="y"||!params.axis?1:0,params.axis==="z"?1:0),axis=new oc.gp_Ax1_2(origin,direction),trsf=new oc.gp_Trsf_1();let maker;try{trsf.SetRotation_1(axis,step*index);maker=new oc.BRepBuilderAPI_Transform_2(source.shape,trsf,true);copies.push({oc,shape:maker.Shape(),kind:"pattern-copy"});}finally{maker?.delete?.();trsf.delete();axis.delete();direction.delete();origin.delete();}}
  return await compoundBrep(copies);
  } finally {copies.slice(1).forEach(disposeBrep);}
}

/* A pattern along a curve. Each copy is one rigid transform — the rotation the
   parallel-transport frame turned through, and the shift that puts the seed on
   its station — so the kernel result carries the same orientation the viewport
   draws rather than the bare offset a grid pattern would reduce it to.
   gp_Trsf::SetValues takes the 3x4 row-major matrix directly; a frame's basis
   is orthonormal by construction, which is what it insists on. */
export async function curvePatternBrep(source, params = {}) {
  if (!source?.shape) throw new Error("Pattern seed is unavailable");
  const oc = source.oc || await loadCadKernel();
  const placements = (Array.isArray(params.placements) ? params.placements : []).slice(0, 127);
  const copies = [source];
  try {
    for (const placement of placements) {
      const m = placement && placement.matrix, t = (placement && placement.translation) || { x: 0, y: 0, z: 0 };
      if (!Array.isArray(m) || m.length !== 9) throw new Error("Curve pattern placement has no transform");
      const trsf = new oc.gp_Trsf_1();
      let maker;
      try {
        trsf.SetValues(
          m[0], m[1], m[2], Number(t.x) || 0,
          m[3], m[4], m[5], Number(t.y) || 0,
          m[6], m[7], m[8], Number(t.z) || 0,
        );
        maker = new oc.BRepBuilderAPI_Transform_2(source.shape, trsf, true);
        copies.push({ oc, shape: maker.Shape(), kind: "pattern-copy" });
      } finally { maker?.delete?.(); trsf.delete(); }
    }
    return await compoundBrep(copies);
  } finally { copies.slice(1).forEach((copy) => disposeBrep(copy)); }
}

export async function mirrorBrep(source, params = {}) {
  if (!source?.shape) throw new Error("Mirror seed is unavailable");
  const oc = source.oc || await loadCadKernel();
  const plane = params.plane?.descriptor || params.plane || {};
  const origin = plane.origin || { x:0, y:0, z:0 };
  const raw = plane.normal || { x:1, y:0, z:0 };
  const length = Math.hypot(Number(raw.x)||0, Number(raw.y)||0, Number(raw.z)||0);
  if (length < 1e-9) throw new Error("Mirror plane has no valid normal");
  const nx=(Number(raw.x)||0)/length, ny=(Number(raw.y)||0)/length, nz=(Number(raw.z)||0)/length;
  const dot=nx*(Number(origin.x)||0)+ny*(Number(origin.y)||0)+nz*(Number(origin.z)||0);
  const trsf=new oc.gp_Trsf_1(); let maker, mirrored;
  try {
    trsf.SetValues(
      1-2*nx*nx, -2*nx*ny, -2*nx*nz, 2*dot*nx,
      -2*ny*nx, 1-2*ny*ny, -2*ny*nz, 2*dot*ny,
      -2*nz*nx, -2*nz*ny, 1-2*nz*nz, 2*dot*nz,
    );
    maker=new oc.BRepBuilderAPI_Transform_2(source.shape,trsf,true);
    mirrored={oc,shape:maker.Shape(),kind:"mirror-copy"};
    if(params.keepOriginal === false){const result=mirrored;mirrored=null;return result;}
    const result=await compoundBrep([source,mirrored]);disposeBrep(mirrored);mirrored=null;return result;
  } finally {
    if (mirrored?.shape) mirrored.shape.delete?.();
    maker?.delete?.(); trsf.delete();
  }
}

export async function serializeBrep(brep, fileName = "shape.brep") {
  if (!brep?.shape) throw new Error("No BREP shape to serialize");
  const oc = brep.oc || await loadCadKernel();
  const progress = new oc.Message_ProgressRange_1(), path = kernelFilePath(fileName, "brep");
  try {
    if (!oc.BRepTools.Write_3(brep.shape, path, progress)) throw new Error("OpenCascade could not serialize the BREP");
    return new Uint8Array(oc.FS.readFile(path));
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    progress.delete();
  }
}

export async function deserializeBrep(data, fileName = "shape.brep") {
  const oc = await loadCadKernel(), bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const progress = new oc.Message_ProgressRange_1(), builder = new oc.BRep_Builder();
  const shape = new oc.TopoDS_Shape(), path = kernelFilePath(fileName, "brep");
  try {
    oc.FS.writeFile(path, bytes);
    if (!oc.BRepTools.Read_2(shape, path, builder, progress) || shape.IsNull()) throw new Error("OpenCascade could not restore the BREP");
    return { oc, shape, kind:"persisted-brep", sourceName:fileName };
  } catch (error) {
    shape.delete?.();
    throw error;
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    builder.delete(); progress.delete();
  }
}

// Manufacturing exchange defaults to solids. Surface exchange is deliberate:
// callers may set allowSurfaces, but invalid topology is never transferable.
export async function validateBrepForExport(brep, options = {}) {
  if (!brep?.shape || brep.shape.IsNull()) throw new Error("Export requires a nonempty BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const maximumTolerance = Number(options.maxToleranceCm ?? 0.001);
  if (!Number.isFinite(maximumTolerance) || maximumTolerance <= 0) throw new Error("Export tolerance must be positive and finite");
  const analyzer = new oc.BRepCheck_Analyzer(brep.shape, true, false);
  const tolerance = new oc.ShapeAnalysis_ShapeTolerance();
  const pieces = [];
  try {
    if (!analyzer.IsValid_2()) throw new Error("Export blocked: invalid BREP topology or geometry; repair the body first");
    const actualTolerance = tolerance.Tolerance(brep.shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    // OCCT can promote a requested edge tolerance to a vertex by two double
    // ULPs (e.g. .001 -> .0010000000000000005). Accept only rounding at the
    // nominal limit; this does not add a geometric tolerance allowance.
    // Rebuilt bodies (a thin extruded cover on the LENS) carry .001 cm plus about
    // 1e-12 of accumulated round-off, a few thousand ULPs. A relative 1e-8 of the
    // limit (1e-11 cm) accepts that noise and nothing geometric.
    const roundingAllowance = Math.max(4 * Math.max(Number.MIN_VALUE, 2 ** (Math.floor(Math.log2(maximumTolerance)) - 52)), maximumTolerance * 1e-8);
    if (!Number.isFinite(actualTolerance) || actualTolerance - maximumTolerance > roundingAllowance) throw new Error("Export blocked: body tolerance exceeds " + maximumTolerance + " cm (actual " + actualTolerance + " cm)");
    pieces.push(...solidPieces(oc, brep.shape));
    if (!pieces.length && !options.allowSurfaces) throw new Error("Export blocked: no closed solid; use surface exchange for an intentional sheet body");
    for (const piece of pieces) {
      if (!Number.isFinite(piece.volume) || piece.volume <= 0) throw new Error("Export blocked: solid has zero, negative or nonfinite volume");
    }
    // Detect loose faces inside a compound containing otherwise valid solids.
    const loose = new oc.TopExp_Explorer_2(brep.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SOLID);
    try {
      if (!pieces.length && !loose.More()) throw new Error("Export blocked: no solid or surface geometry");
      if (loose.More() && !options.allowSurfaces) throw new Error("Export blocked: body contains faces outside closed solids");
    }
    finally { loose.delete(); }
    return { valid:true, solidCount:pieces.length, volumeCm3:pieces.reduce((sum,piece)=>sum+piece.volume,0), maxToleranceCm:actualTolerance };
  } finally {
    for (const piece of pieces) piece.shape.delete();
    tolerance.delete(); analyzer.delete();
  }
}

export async function exportStep(brep, fileName = "model.step", options = {}) {
  if (!brep?.shape) throw new Error("No BREP shape to export");
  const oc = brep.oc || await loadCadKernel();
  await validateBrepForExport(brep, options);
  // The first writer registers the STEP resource parameters in this WASM
  // build.  A writer snapshots the cascade/output units at construction, so
  // the real writer must be created only after both values are configured.
  const bootstrapWriter = new oc.STEPControl_Writer_1();
  oc.Interface_Static.SetCVal("xstep.cascade.unit", "CM");
  oc.Interface_Static.SetCVal("write.step.unit", String(options.outputUnit || "CM").toUpperCase());
  bootstrapWriter.delete();
  const writer = new oc.STEPControl_Writer_1(), progress = new oc.Message_ProgressRange_1();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  try {
    const transferred = writer.Transfer(brep.shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    if (transferred.value !== oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error("STEP transfer failed");
    if (writer.Write(path).value !== oc.IFSelect_ReturnStatus.IFSelect_RetDone.value) throw new Error("STEP writer failed");
    const bytes = oc.FS.readFile(path);
    return new Uint8Array(bytes);
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    writer.delete(); progress.delete();
  }
}

export async function exportIges(brep, fileName = "model.igs", options = {}) {
  if (!brep?.shape) throw new Error("No BREP shape to export");
  await validateBrepForExport(brep, options);
  const oc = brep.oc || await loadCadKernel();
  const bootstrapWriter = new oc.IGESControl_Writer_1();
  oc.Interface_Static.SetCVal("xstep.cascade.unit", "CM");
  bootstrapWriter.delete();
  const writer = new oc.IGESControl_Writer_2("CM", 1);
  const modelHandle=writer.Model(),model=modelHandle.get(),header=model.GlobalSection();
  try { header.SetCascadeUnit(CAD_WORKING_UNIT.millimetersPerUnit);model.SetGlobalSection(header); }
  finally { header.delete();modelHandle.delete(); }
  const progress = new oc.Message_ProgressRange_1();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  try {
    if (!writer.AddShape(brep.shape, progress)) throw new Error("IGES transfer failed");
    writer.ComputeModel();
    if (!writer.Write_2(path, false)) throw new Error("IGES writer failed");
    return new Uint8Array(oc.FS.readFile(path));
  } finally { try { oc.FS.unlink(path); } catch (_) {} writer.delete(); progress.delete(); }
}

export async function importStep(data, fileName = "import.step", options = {}) {
  const oc = await loadCadKernel();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  const reader = new oc.STEPControl_Reader_1(), progress = new oc.Message_ProgressRange_1();
  try {
    oc.FS.writeFile(path, data instanceof Uint8Array ? data : new Uint8Array(data));
    reader.ReadFile(path);
    const systemLengthUnit=Number(options.millimetersPerUnit ?? options.unitsPerMeter) || CAD_WORKING_UNIT.millimetersPerUnit;
    reader.SetSystemLengthUnit(systemLengthUnit);
    reader.TransferRoots(progress);
    return { oc, shape: reader.OneShape(), kind: "imported-step", sourceName: fileName, workingUnit:CAD_WORKING_UNIT.name };
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    reader.delete(); progress.delete();
  }
}

export function disposeBrep(brep) {
  clearBrepTopology(brep);
  try { brep?.shape?.delete?.(); } catch (_) {}
}
