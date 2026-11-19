/* The CAD kernel's B-rep topology extraction and hydration, wires, profiles and
   primitives, split out of js/cad_kernel.js. It shares the editor's state
   through live imports from ../cad_kernel.js. */
import { restoreProfileCurve } from "../cad_profile_serialization.js";
import { cylinderAxis } from "../core/cylinder_axis.js";
import { createTopologyRegistry, planarFaceNameAgrees, resolveTopologyReference, topologyDescriptorSignature } from "../core/topology.js";
import {
  clearBrepTopology, disposeAll, edgeCurveClassAgrees, edgeDescriptor,
  faceDescriptor, loadCadKernel, loopPoints, loopSegments, pointOf,
  resolveHistoricalKernelReference, stableKernelId, surfaceName,
} from "../cad_kernel.js";

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
    const topology = structuredClone(expected), subshapes = new Map();
    for (const item of topology) {
      const shape = groups.get(item.kind)[item.transportOrdinal], d = item.descriptor;
      if (item.kind === "edge" && d?.curve === "ellipse") {
        const e = d.ellipse;
        if (!(e?.center && e.normal && e.majorAxis && e.majorRadius > 0 && e.minorRadius > 0)) {
          // Old records still name this exact edge by ordinal. Recover only its
          // missing geometry, before replacing any of the body's current handles.
          const ellipse = edgeDescriptor(oc, shape).ellipse;
          if (!ellipse) throw new Error("Cached ellipse does not match its native edge");
          d.ellipse = ellipse;
        }
      }
      subshapes.set(item.persistentId, {kind: item.kind, shape, descriptor: structuredClone(d)});
    }
    clearBrepTopology(brep);
    brep.topology=topology;
    brep.subshapes=subshapes;
    return {topology:brep.topology,subshapes:brep.subshapes};
  }catch(error){collected.forEach(shape=>shape.delete());throw error;}
}

export function resolveBrepSubshape(brep, persistentId, kind) {
  const entry = brep?.subshapes?.get(persistentId);
  return entry && (!kind || entry.kind === kind) ? entry.shape : null;
}

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
      let normalDir = dir, majorDir;
      if (segment.normal && segment.majorAxis) {
        const n = segment.normal, a = segment.majorAxis;
        normalDir = new oc.gp_Dir_4(n.x, n.y, n.z); owned.push(normalDir);
        majorDir = new oc.gp_Dir_4(a.x, a.y, a.z); owned.push(majorDir);
      } else majorDir = planeDirection(segment.center, rx >= ry ? rot : rot + Math.PI / 2);
      const axes = new oc.gp_Ax2_2(at(segment.center), normalDir, majorDir); owned.push(axes);
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

export {
  draftPrismWalls, enlargeFaceForSplit, isOnOrIn, profileWire,
  solidContainsPoint,
};
