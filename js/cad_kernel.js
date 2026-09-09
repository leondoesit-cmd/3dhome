// OpenCascade BREP backend. Loaded lazily because the WASM module is large;
// ordinary sketch editing must remain instant and does not need a solid kernel.

import {
  createTopologyRegistry,
  resolveTopologyReference,
  topologyDescriptorSignature,
  fitProfileCircle,
} from "./core/topology.js";
import { framePoint } from "./core/frame.js";
import { isSegmentProfile, pathFrames, segmentProfilePoints } from "./core/profile_curves.js";
import { ribDraftedLoop, ribLoop } from "./core/rib_profile.js";

let kernelPromise = null;

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
    kernelPromise = typeof window === "undefined"
      ? import("opencascade.js/dist/node.js").then(({ default: factory }) => factory())
      : import("../node_modules/opencascade.js/dist/opencascade.full.js").then(({default:factory})=>
        compressedBrowserKernel(factory).catch(()=>factory({locateFile(path){if(path.endsWith(".wasm"))return new URL("../node_modules/opencascade.js/dist/opencascade.full.wasm",import.meta.url).href;return path;}})));
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

function shapeBounds(oc, shape) {
  const box = new oc.Bnd_Box_1();
  try {
    oc.BRepBndLib.AddOptimal(shape, box, false, true);
    if (box.IsVoid()) return null;
    const min = box.CornerMin(), max = box.CornerMax();
    try { return { min: pointOf(min), max: pointOf(max) }; }
    finally { min.delete(); max.delete(); }
  } finally { box.delete(); }
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
      try { descriptor.origin = pointOf(location); descriptor.axis = vectorOf(direction); descriptor.radius = circle.Radius(); }
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

// Extract exact kernel subshapes and bind them to the canonical semantic names
// produced by the lightweight rebuild.  Unmatched boolean/import faces receive
// deterministic generated names sorted by their geometric descriptor.
export function extractBrepTopology(brep, options = {}) {
  if (!brep?.shape) throw new Error("Topology extraction needs a BREP shape");
  clearBrepTopology(brep);
  const oc = brep.oc, featureId = options.ownerFeatureId || "kernel";
  const raw = [];
  const collect = (kind, shapeType, cast, describe) => {
    const explorer = new oc.TopExp_Explorer_2(brep.shape, shapeType, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    try {
      while (explorer.More()) {
        const shape = cast(explorer.Current());
        const duplicate = raw.some((item) => item.kind === kind && item.shape.IsSame(shape));
        if (duplicate) { shape.delete(); explorer.Next(); continue; }
        try {
          const descriptor = describe(oc, shape);
          raw.push({ ownerFeatureId: featureId, kind, persistentId: "__kernel:" + kind + ":" + raw.length, semantic: null, descriptor, signature: topologyDescriptorSignature(descriptor), shape });
        } catch (error) { shape.delete(); throw error; }
        explorer.Next();
      }
    } finally { explorer.delete(); }
  };
  collect("face", oc.TopAbs_ShapeEnum.TopAbs_FACE, (shape) => oc.TopoDS.Face_1(shape), faceDescriptor);
  collect("edge", oc.TopAbs_ShapeEnum.TopAbs_EDGE, (shape) => oc.TopoDS.Edge_1(shape), edgeDescriptor);

  const unmatched = new Set(raw);
  const expected = Array.isArray(options.expectedTopology) ? options.expectedTopology : [];
  expected.forEach((reference) => {
    const candidates = Array.from(unmatched).filter((item) => item.kind === reference.kind);
    const resolved = resolveTopologyReference(reference, createTopologyRegistry(candidates), { threshold: options.threshold || 0.8, ambiguityTolerance: 0.01 });
    if (resolved.status === "missing" || resolved.status === "ambiguous" || !resolved.topology) return;
    const item = resolved.topology;
    item.persistentId = reference.persistentId;
    item.semantic = reference.semantic;
    item.ownerFeatureId = reference.ownerFeatureId || featureId;
    item.signature = topologyDescriptorSignature({ ...item.descriptor, semantic: item.semantic });
    unmatched.delete(item);
  });
  const groups = new Map();
  Array.from(unmatched).sort((a, b) => a.kind.localeCompare(b.kind) || a.signature.localeCompare(b.signature)).forEach((item) => {
    const key = item.kind + ":" + (item.descriptor.surface || item.descriptor.curve || "other");
    const ordinal = (groups.get(key) || 0) + 1;
    groups.set(key, ordinal);
    item.persistentId = stableKernelId(featureId, item.kind, item.descriptor, ordinal);
    item.semantic = "generated-" + ordinal;
  });
  brep.topology = raw.map(({ shape, ...item }) => item);
  brep.subshapes = new Map(raw.map((item) => [item.persistentId, { kind: item.kind, shape: item.shape, descriptor: item.descriptor }]));
  return { topology: brep.topology, subshapes: brep.subshapes };
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
    wire.Add_1(maker.Edge());
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
      const axis = spec.axis || { x: 0, y: 1, z: 0 };
      const dir = new oc.gp_Dir_4(axis.x || 0, axis.y || 0, axis.z || 0); owned.push(p, dir);
      const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
      const maker = new oc.BRepPrimAPI_MakeCylinder_3(axes, Math.max(1e-6, spec.r), Math.max(1e-6, spec.h)); owned.push(maker);
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

export async function makeBrepExtrusion(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    if (!Array.isArray(spec.points) || spec.points.length < 3) throw new Error("Extrusion needs a closed profile");
    const depth = Number(spec.to || 0) - Number(spec.from || 0);
    // Fitting a circle to the samples is a guess; typed segments are a fact, so
    // they win — a 40-chord ellipse fits a circle rather well.
    const circle = spec.segments ? null : fitProfileCircle(spec.points);
    const holeLoops = (spec.holes || []).map((entry) => Array.isArray(entry)
      ? { points: entry }
      : { points: entry?.points || entry?.loop || [], segments: entry?.segments })
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
      if (!Math.abs(draftAngle) || Math.abs(depth) < 1e-9) return shape;
      const run = depth >= 0 ? 1 : -1;
      // `draftBase` names the plane the profile was drawn on when the run has
      // since been stretched past it (a through-all cut); otherwise it IS `from`.
      const base = mapPoint(0, 0, Number.isFinite(Number(spec.draftBase)) ? Number(spec.draftBase) : (spec.from || 0));
      return draftPrismWalls(oc, shape, {
        angle: draftAngle,
        axis: { x: (axis.x || 0) * run, y: (axis.y || 0) * run, z: (axis.z || 0) * run },
        at: base,
        outward: Number(spec.draftAngle) < 0 ? !spec.draftOutward : !!spec.draftOutward,
      });
    };
    if (circle && !holeLoops.length) {
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
    const signedArea = (loop) => loop.reduce((sum, point, index) => {
      const next = loop[(index + 1) % loop.length];
      return sum + Number(point.u || 0) * Number(next.v || 0) - Number(next.u || 0) * Number(point.v || 0);
    }, 0);
    // Winding has to be read off whatever actually becomes the wire: a typed
    // chain may be ordered differently from the analyzer's sampled points, and
    // a hole's reversal is decided against the outline's direction.
    const winding = (loop) => signedArea(loopSegments(loop) ? segmentProfilePoints(loopSegments(loop)) : loopPoints(loop));
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
    return { oc, shape: finish(prism.Shape()), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepRevolve(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const points = spec.points || spec.pts;
    if (!Array.isArray(points) || points.length < 3) throw new Error("Revolve requires a closed profile");
    const loop = spec.segments ? { points, segments: spec.segments } : points;
    const wire = profileWire(oc, owned, loop, (q) => ({ x: q.u, y: q.v, z: 0 }), { x: 0, y: 0, z: 1 });
    const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true); owned.push(face);
    const axisName=spec.axis || "y", sign=spec.direction === "reverse" ? -1 : 1;
    const origin = new oc.gp_Pnt_3(0, 0, 0), direction = new oc.gp_Dir_4(axisName==="x"?sign:0, axisName==="y"?sign:0, axisName==="z"?sign:0); owned.push(origin, direction);
    const axis = new oc.gp_Ax1_2(origin, direction); owned.push(axis);
    const maker = new oc.BRepPrimAPI_MakeRevol_1(face.Face(), axis, (Number(spec.angle || 360) * Math.PI) / 180, true); owned.push(maker);
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
  const oc = await loadCadKernel(), owned = [], sections = spec.sections || [];
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
    maker.CheckCompatibility(spec.matchProfiles !== false); maker.Build(new oc.Message_ProgressRange_1());
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepCone(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const r1 = Math.max(1e-6, Number(spec.r1 ?? (Number(spec.diameter1) || Number(spec.diameter) || 0) / 2) || 1e-6);
    const r2 = Math.max(0, Number(spec.r2 ?? (Number(spec.diameter2) || 0) / 2) || 0);
    const height = Math.max(1e-6, Number(spec.h ?? spec.depth ?? Math.abs((Number(spec.to) || 0) - (Number(spec.from) || 0))) || 1e-6);
    const origin = spec.origin || { x: spec.x || 0, y: (spec.y || 0) + (Number(spec.from) || 0), z: spec.z || 0 };
    const axis = spec.axis || { x: 0, y: 1, z: 0 };
    const p = new oc.gp_Pnt_3(origin.x, origin.y, origin.z);
    const dir = new oc.gp_Dir_4(axis.x || 0, axis.y || 0, axis.z || 0); owned.push(p, dir);
    const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
    // _2 is (R1, R2, H, angle) and takes no axes; _3 is the placed one. Passing
    // a gp_Ax2 where a radius belongs built a shape of no volume at all.
    const maker = new oc.BRepPrimAPI_MakeCone_3(axes, r1, Math.max(1e-7, r2), height); owned.push(maker);
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepHelicalPipe(spec) {
  return makeBrepSweep({ profile: spec.profile, path: spec.path });
}

export async function booleanBrep(operation, left, right) {
  if (!left?.shape || !right?.shape) throw new Error("Boolean operands must be BREP shapes");
  const oc = left.oc || right.oc || await loadCadKernel();
  const progress = new oc.Message_ProgressRange_1();
  let algorithm;
  try {
    if (operation === "union") algorithm = new oc.BRepAlgoAPI_Fuse_3(left.shape, right.shape, progress);
    else if (operation === "subtract") algorithm = new oc.BRepAlgoAPI_Cut_3(left.shape, right.shape, progress);
    else if (operation === "intersect") algorithm = new oc.BRepAlgoAPI_Common_3(left.shape, right.shape, progress);
    else throw new Error("Unknown boolean operation: " + operation);
    algorithm.SetNonDestructive(true);
    algorithm.Build(progress);
    if (algorithm.HasErrors?.()) throw new Error("OpenCascade boolean failed");
    return { oc, shape: algorithm.Shape(), kind: "solid", operation };
  } finally {
    algorithm?.delete?.(); progress.delete();
  }
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
export async function filletBrep(brep, radius, options = {}) {
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
        /* Add_3(R1, R2, E) is the variable-radius overload: R1 lands on the
           edge's first vertex, R2 on its last, and OCCT interpolates a linear
           law between them along the contour the edge grows into. Equal ends
           would be that law with zero slope — Add_2 is the cheaper, and the
           only one whose round comes back as an analytic cylinder or torus
           rather than as a fitted surface. */
        const { start, end } = filletEdgeRadius(edge, overrides, baseRadius, options);
        if (Math.abs(start - end) > 1e-9) maker.Add_3(start, end, edge);
        else maker.Add_2(start, edge);
        added++;
      }
      count++;
      explorer.Next();
    }
    if (!added) throw new Error("Fillet has no resolved edges");
    maker.Build(progress);
    if (maker.HasErrors?.() || !maker.IsDone?.()) throw new Error("OpenCascade fillet failed");
    return { oc, shape: maker.Shape(), kind: "solid", operation: "fillet" };
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
export async function chamferBrep(brep, distance, options = {}) {
  if (!brep?.shape) throw new Error("Chamfer needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
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
    if (maker.HasErrors?.() || !maker.IsDone?.()) throw new Error("OpenCascade chamfer failed");
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
  const oc = brep.oc || await loadCadKernel();
  const faceIds = options.facePersistentIds || options.faces || [];
  const faces = selectedBrepSubshapes(brep, "face", faceIds);
  if (!faces.length) throw new Error("Shell needs at least one resolved face to remove");
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
    if (maker.HasErrors?.() || !maker.IsDone?.()) throw new Error("OpenCascade shell failed");
    return { oc, shape: maker.Shape(), kind: "solid", operation: "shell" };
  } finally {
    closingFaces.delete(); progress.delete(); maker.delete();
  }
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
    moved = { oc, shape: maker.Shape(), kind: brep.kind || "solid", operation: "moveBody" };
    if (!options.copy) return moved;
    const both = await compoundBrep([{ oc, shape: brep.shape }, moved]);
    both.operation = "moveBody";
    moved = null;
    return both;
  } finally { disposeAll(owned); }
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
  const draftAngle = Number(params.draftAngle) || 0;
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
export async function draftBrep(brep, angleDegrees, options = {}) {
  if (!brep?.shape) throw new Error("Draft needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
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
    const at = (options.neutral === "start" ? bounds.min[axis] : bounds.max[axis]) + (Number(options.neutralOffset) || 0);
    const centre = {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
    centre[axis] = at;
    const point = new oc.gp_Pnt_3(centre.x, centre.y, centre.z); owned.push(point);
    const normal = new oc.gp_Dir_4(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0); owned.push(normal);
    const plane = new oc.gp_Pln_3(point, normal); owned.push(plane);
    const pull = new oc.gp_Dir_4(axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0); owned.push(pull);
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
  return { positions, normals, colors, faceRanges, subshapeMap };
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
export async function brepConnectedGroups(entries = []) {
  const parent = entries.map((entry, index) => index);
  const find = (index) => { while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; } return index; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const boxesMeet = (a, b) => {
    if (!a || !b) return true;
    return a.x0 <= b.x1 + 1e-6 && a.x1 >= b.x0 - 1e-6 && a.y0 <= b.y1 + 1e-6
      && a.y1 >= b.y0 - 1e-6 && a.z0 <= b.z1 + 1e-6 && a.z1 >= b.z0 - 1e-6;
  };
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (find(i) === find(j)) continue;
    if (!boxesMeet(entries[i].bounds, entries[j].bounds)) continue;
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
  for(let index=1;index<count;index++)copies.push(await transformBrep(source,{origin:{x:-Number(vector.x||0)*index,y:-Number(vector.y||0)*index,z:-Number(vector.z||0)*index}}));
  const result=await compoundBrep(copies);copies.slice(1).forEach((copy)=>disposeBrep(copy));return result;
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
  if(!source?.shape)throw new Error("Pattern seed is unavailable");const oc=source.oc || await loadCadKernel(),count=Math.max(1,Math.min(256,Math.round(Number(params.count)||1))),step=(Number(params.angle)||360/count)*Math.PI/180,copies=[source],skipped=new Set((params.skipIndices || []).map((value)=>Math.round(Number(value)))),distance=Number(params.radialDistance)||0;
  for(let index=1;index<count;index++){if(skipped.has(index))continue;const origin=new oc.gp_Pnt_3(params.axis==="x"?0:-distance,params.axis==="x"?-distance:0,0),direction=new oc.gp_Dir_4(params.axis==="x"?1:0,params.axis==="y"||!params.axis?1:0,params.axis==="z"?1:0),axis=new oc.gp_Ax1_2(origin,direction),trsf=new oc.gp_Trsf_1();let maker;try{trsf.SetRotation_1(axis,step*index);maker=new oc.BRepBuilderAPI_Transform_2(source.shape,trsf,true);copies.push({oc,shape:maker.Shape(),kind:"pattern-copy"});}finally{maker?.delete?.();trsf.delete();axis.delete();direction.delete();origin.delete();}}
  const result=await compoundBrep(copies);copies.slice(1).forEach((copy)=>disposeBrep(copy));return result;
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

export async function exportStep(brep, fileName = "model.step", options = {}) {
  if (!brep?.shape) throw new Error("No BREP shape to export");
  const oc = brep.oc || await loadCadKernel();
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
    writer.Transfer(brep.shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    writer.Write(path);
    const bytes = oc.FS.readFile(path);
    return new Uint8Array(bytes);
  } finally {
    try { oc.FS.unlink(path); } catch (_) {}
    writer.delete(); progress.delete();
  }
}

export async function exportIges(brep, fileName = "model.igs") {
  if (!brep?.shape) throw new Error("No BREP shape to export");
  const oc = brep.oc || await loadCadKernel(), writer = new oc.IGESControl_Writer_1();
  const path = "/" + fileName.replace(/[^a-z0-9_.-]/gi, "_");
  try {
    writer.AddShape(brep.shape); writer.ComputeModel(); writer.Write(path);
    return new Uint8Array(oc.FS.readFile(path));
  } finally { try { oc.FS.unlink(path); } catch (_) {} writer.delete(); }
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
