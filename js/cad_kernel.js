import './core/shell_meridian.js';
import './core/planar_shell_overrides.js';
import './core/fillet_corner_repair.js';
import './cad_profile_serialization.js';
import "./core/pattern_geometry.js";
import "./core/hole_geometry.js";
import "./core/cylinder_axis.js";
import "./core/revolve_geometry.js";
// OpenCascade BREP backend. Loaded lazily because the WASM module is large;
// ordinary sketch editing must remain instant and does not need a solid kernel.

import "./core/topology.js";
import "./core/frame.js";
import { isSegmentProfile } from "./core/profile_curves.js";
import "./core/rib_profile.js";
import "./core/extrude_extent.js";
import {
  boundsMayOverlap, brepConnectedGroups, brepMaterialIntersection, brepsOverlap,
  circularPatternBrep, compoundBrep, curvePatternBrep, deferSerializedBrep,
  deserializeBrep, disposeBrep, exportIges, exportStep, importStep,
  linearGridPatternBrep, linearPatternBrep, mirrorBrep, serializeBrep,
  translateBrep, unifyBrepFaces, validateBrepForExport,
} from "./cad_kernel/analysis.js";
import {
  domeBrep, draftBrep, moveBodyBrep, placeBrep, placedBrepBounds, ribBrep,
  shapeToMeshData, splitBrep, transformBrep,
} from "./cad_kernel/body_ops.js";
import {
  chamferBrep, compoundShellMembers, shellBrep, thickenBrep,
} from "./cad_kernel/finish_shell.js";
import {
  booleanBrep, booleanVolumePlausible, filletBrep, fullRoundFilletDefinition,
  makeBrepCone, makeBrepExtrusion, makeBrepHelicalPipe, makeBrepHoleTool,
  makeBrepLoft, makeBrepRevolve, makeBrepSweep, shapeMassProperties,
  shapeSolidCount,
} from "./cad_kernel/solids.js";
import {
  brepContainsPoint, brepFaceLineIntersections, extractBrepTopology,
  hydrateSerializedBrepTopology, makeBrepPrimitive, rayHitsBrepFace,
  rayHitsExtendedBrepFace, resolveBrepSubshape,
} from "./cad_kernel/topology_primitives.js";
export { brepContainsPoint, brepFaceLineIntersections, extractBrepTopology, hydrateSerializedBrepTopology, makeBrepPrimitive, rayHitsBrepFace, rayHitsExtendedBrepFace, resolveBrepSubshape };
export { booleanBrep, booleanVolumePlausible, filletBrep, fullRoundFilletDefinition, makeBrepCone, makeBrepExtrusion, makeBrepHelicalPipe, makeBrepHoleTool, makeBrepLoft, makeBrepRevolve, makeBrepSweep, shapeMassProperties, shapeSolidCount };
export { chamferBrep, compoundShellMembers, shellBrep, thickenBrep };
export { domeBrep, draftBrep, moveBodyBrep, placeBrep, placedBrepBounds, ribBrep, shapeToMeshData, splitBrep, transformBrep };
export { boundsMayOverlap, brepConnectedGroups, brepMaterialIntersection, brepsOverlap, circularPatternBrep, compoundBrep, curvePatternBrep, deferSerializedBrep, deserializeBrep, disposeBrep, exportIges, exportStep, importStep, linearGridPatternBrep, linearPatternBrep, mirrorBrep, serializeBrep, translateBrep, unifyBrepFaces, validateBrepForExport };
// for js/cad_kernel/analysis.js (live bindings: it sees every reassignment)
export {
  DEFAULT_EXPORT_TOLERANCE_CM, browserKernelFactory, clearBrepTopology,
  compiledKernelModule, disposeAll, kernelFilePath, kernelInstance,
  opaqueBreps, shapeBounds,
};
// for js/cad_kernel/body_ops.js (live bindings: it sees every reassignment)
export { edgeDescriptor, faceDescriptor, normalizedVector, pointOf };
// for js/cad_kernel/finish_shell.js (live bindings: it sees every reassignment)
export { JUNCTION_FUZZY_CM, JUNCTION_SCALE };
// for js/cad_kernel/solids.js (live bindings: it sees every reassignment)
export { loopPoints, loopSegments, world };
// for js/cad_kernel/topology_primitives.js (live bindings: it sees every reassignment)
export {
  edgeCurveClassAgrees, resolveHistoricalKernelReference, stableKernelId,
  surfaceName,
};

let kernelPromise = null;
let kernelLoadAttempt = 0;
let compiledKernelModule = null, compiledKernelPromise = null, browserFactoryPromise = null, browserKernelFactory = null, kernelInstance = null;
const opaqueBreps = new WeakMap();

// The product domain uses centimetres. OpenCascade expresses its transfer
// system unit as millimetres per application unit, so one model unit is 10 mm.
// (It is not the more common "units per metre" convention.)
export const CAD_WORKING_UNIT = Object.freeze({ name: "cm", millimetersPerUnit: 10 });

async function browserKernelBytes() {
  if(typeof DecompressionStream!=="function")throw new Error("gzip streaming unavailable");
  const url=new URL("../assets/opencascade.full.wasm.gz",import.meta.url),response=await fetch(url);
  if(!response.ok || !response.body)throw new Error("compressed CAD kernel unavailable");
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

function browserFactory() {
  if(!browserFactoryPromise){
    const browserModule = new URL("../vendor/opencascade/opencascade.full.js", import.meta.url);
    if(kernelLoadAttempt)browserModule.searchParams.set("retry",String(kernelLoadAttempt));
    browserFactoryPromise=import(browserModule.href).then(({default:factory})=>(browserKernelFactory=factory)).catch(error=>{browserFactoryPromise=null;kernelLoadAttempt++;throw error;});
  }
  return browserFactoryPromise;
}

// Retain compiled code at page scope, without constructing a native heap. A
// worker restart clones the Module; its memory and body cache remain disposable.
export async function prepareCadKernelModule() {
  if(!compiledKernelPromise)compiledKernelPromise=browserKernelBytes().then(bytes=>globalThis.WebAssembly.compile(bytes)).then(module=>(compiledKernelModule=module)).catch(error=>{compiledKernelPromise=null;throw error;});
  const [module]=await Promise.all([compiledKernelPromise,browserFactory()]);
  return module;
}

export function setCadKernelModule(module) {
  if(module instanceof globalThis.WebAssembly.Module){compiledKernelModule=module;compiledKernelPromise=Promise.resolve(module);}
}

// Even compiled modules over 8 MB cannot be instantiated synchronously on
// Chrome's main thread. Return the pending-hook sentinel and let Emscripten's
// receive callback finish initialization without downloading or compiling again.
export async function instantiateCadKernelModule(factory,module,options={}) {
  let rejectInstantiation;
  const failed=new Promise((_,reject)=>{rejectInstantiation=reject;});
  const ready=factory({...options,instantiateWasm(imports,receive){
    Promise.resolve().then(()=>globalThis.WebAssembly.instantiate(module,imports))
      .then(instance=>receive(instance,module)).catch(rejectInstantiation);
    return {};
  }});
  // The glue does not reject ready when a custom asynchronous hook fails.
  return Promise.race([ready,failed]);
}

async function compressedBrowserKernel(factory) {
  if(kernelInstance)return kernelInstance;
  if(!compiledKernelModule){try{await prepareCadKernelModule();}catch(_){/* Older browsers retain the wasmBinary route. */}}
  if(kernelInstance)return kernelInstance;
  if(compiledKernelModule)return instantiateCadKernelModule(factory,compiledKernelModule,{onRuntimeInitialized(){kernelInstance=this;}});
  return factory({wasmBinary:await browserKernelBytes()});
}

export function loadCadKernel() {
  if (!kernelPromise) {
    // The browser glue is vendored (the server never serves node_modules); the
    // binary is always the gzip in assets/ — every supported engine streams it.
    kernelPromise = typeof window === "undefined" && typeof self === "undefined"
      ? import("opencascade.js/dist/node.js").then(({ default: factory }) => factory())
      : browserFactory().then(compressedBrowserKernel);
    kernelPromise = kernelPromise.then(oc=>(kernelInstance=oc)).catch((error) => {
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
    } else if (curve === "ellipse") {
      /* Convert Entities rebuilds an elliptical edge as a sketch ellipse, which
         needs the curve itself: centre, plane normal, major direction and both
         radii. `origin`/`axis` stay the centre of mass and mid tangent, so the
         descriptor signature (and every stored reference) is unchanged. */
      const ellipse = adaptor.Ellipse(), location = ellipse.Location(), axis = ellipse.Axis(), normal = axis.Direction(), xAxis = ellipse.XAxis(), major = xAxis.Direction();
      try { descriptor.ellipse = { center: pointOf(location), normal: vectorOf(normal), majorAxis: vectorOf(major), majorRadius: ellipse.MajorRadius(), minorRadius: ellipse.MinorRadius(), first, last }; }
      finally { major.delete(); xAxis.delete(); normal.delete(); axis.delete(); location.delete(); ellipse.delete(); }
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

const world = (q) => ({ x: Number(q.x ?? q.u) || 0, y: Number(q.y ?? q.v) || 0, z: Number(q.z ?? q.w) || 0 });

const DEFAULT_EXPORT_TOLERANCE_CM = .001;

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

