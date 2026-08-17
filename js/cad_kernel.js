// OpenCascade BREP backend. Loaded lazily because the WASM module is large;
// ordinary sketch editing must remain instant and does not need a solid kernel.

import {
  createTopologyRegistry,
  resolveTopologyReference,
  topologyDescriptorSignature,
} from "./core/topology.js";
import { framePoint } from "./core/frame.js";

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
      const cylinder = adaptor.Cylinder(), axis = cylinder.Axis(), direction = axis.Direction();
      try { descriptor.axis = vectorOf(direction); descriptor.radius = cylinder.Radius(); }
      finally { direction.delete(); axis.delete(); cylinder.delete(); }
    } else if (surface === "sphere") {
      const sphere = adaptor.Sphere(), location = sphere.Location();
      try { descriptor.center = pointOf(location); descriptor.radius = sphere.Radius(); }
      finally { location.delete(); sphere.delete(); }
    } else if (surface === "cone") {
      const cone = adaptor.Cone(), axis = cone.Axis(), direction = axis.Direction();
      try { descriptor.axis = vectorOf(direction); descriptor.radius = cone.RefRadius(); descriptor.angle = cone.SemiAngle(); }
      finally { direction.delete(); axis.delete(); cone.delete(); }
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
      const p = new oc.gp_Pnt_3(spec.x || 0, spec.y || 0, spec.z || 0), dir = new oc.gp_Dir_4(0, 1, 0); owned.push(p, dir);
      const axes = new oc.gp_Ax2_3(p, dir); owned.push(axes);
      const maker = new oc.BRepPrimAPI_MakeCylinder_3(axes, Math.max(1e-6, spec.r), Math.max(1e-6, spec.h)); owned.push(maker);
      return { oc, shape: maker.Shape(), kind: "solid" };
    }
    throw new Error("Unsupported BREP primitive: " + spec.type);
  } finally {
    // Shape() returns a handle copy; makers and construction values can go.
    disposeAll(owned);
  }
}

export async function makeBrepExtrusion(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    if (!Array.isArray(spec.points) || spec.points.length < 3) throw new Error("Extrusion needs a closed profile");
    const polygon = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(polygon);
    for (const q of spec.points) {
      let p;
      if (spec.frame) {
        const world = framePoint(spec.frame, q.u, q.v, spec.from || 0);
        p = new oc.gp_Pnt_3(world.x, world.y, world.z);
      }
      else if (spec.axis === "z") p = new oc.gp_Pnt_3(q.u, q.v, spec.from || 0);
      else if (spec.axis === "x") p = new oc.gp_Pnt_3(spec.from || 0, q.v, q.u);
      else p = new oc.gp_Pnt_3(q.u, spec.from || 0, q.v);
      polygon.Add_1(p); owned.push(p);
    }
    polygon.Close();
    const faceMaker = new oc.BRepBuilderAPI_MakeFace_15(polygon.Wire(), true); owned.push(faceMaker);
    const depth = Number(spec.to || 0) - Number(spec.from || 0);
    const vec = spec.frame
      ? new oc.gp_Vec_4(spec.frame.normal.x * depth, spec.frame.normal.y * depth, spec.frame.normal.z * depth)
      : spec.axis === "z" ? new oc.gp_Vec_4(0, 0, depth) : spec.axis === "x" ? new oc.gp_Vec_4(depth, 0, 0) : new oc.gp_Vec_4(0, depth, 0); owned.push(vec);
    const prism = new oc.BRepPrimAPI_MakePrism_1(faceMaker.Face(), vec, true, true); owned.push(prism);
    return { oc, shape: prism.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepRevolve(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const points = spec.points || spec.pts;
    if (!Array.isArray(points) || points.length < 3) throw new Error("Revolve requires a closed profile");
    const polygon = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(polygon);
    for (const q of points) { const p = new oc.gp_Pnt_3(q.u, q.v, 0); owned.push(p); polygon.Add_1(p); }
    polygon.Close();
    const face = new oc.BRepBuilderAPI_MakeFace_15(polygon.Wire(), true); owned.push(face);
    const axisName=spec.axis || "y", sign=spec.direction === "reverse" ? -1 : 1;
    const origin = new oc.gp_Pnt_3(0, 0, 0), direction = new oc.gp_Dir_4(axisName==="x"?sign:0, axisName==="y"?sign:0, axisName==="z"?sign:0); owned.push(origin, direction);
    const axis = new oc.gp_Ax1_2(origin, direction); owned.push(axis);
    const maker = new oc.BRepPrimAPI_MakeRevol_1(face.Face(), axis, (Number(spec.angle || 360) * Math.PI) / 180, true); owned.push(maker);
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepSweep(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    if (!Array.isArray(spec.profile) || spec.profile.length < 3 || !Array.isArray(spec.path) || spec.path.length < 2) throw new Error("Sweep requires a profile and path");
    const profile = new oc.BRepBuilderAPI_MakePolygon_1(), path = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(profile, path);
    for (const q of spec.profile) { const p = new oc.gp_Pnt_3(q.x, q.y, q.z || 0); owned.push(p); profile.Add_1(p); } profile.Close();
    for (const q of spec.path) { const p = new oc.gp_Pnt_3(q.x, q.y, q.z || 0); owned.push(p); path.Add_1(p); }
    const maker = new oc.BRepOffsetAPI_MakePipe_1(path.Wire(), profile.Wire()); owned.push(maker);
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepLoft(spec) {
  const oc = await loadCadKernel(), owned = [], sections = spec.sections || [];
  try {
    if (sections.length < 2) throw new Error("Loft requires at least two profiles");
    const maker = new oc.BRepOffsetAPI_ThruSections(spec.solid !== false, !!spec.ruled, Math.max(1e-7,Number(spec.tolerance)||1e-6)); owned.push(maker);
    for (const section of sections) {
      const wire = new oc.BRepBuilderAPI_MakePolygon_1(); owned.push(wire);
      for (const q of section) { const p = new oc.gp_Pnt_3(q.x ?? q.u ?? 0, q.y ?? q.v ?? 0, q.z ?? q.w ?? 0); owned.push(p); wire.Add_1(p); }
      wire.Close(); maker.AddWire(wire.Wire());
    }
    maker.CheckCompatibility(spec.matchProfiles !== false); maker.Build(new oc.Message_ProgressRange_1());
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
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
  const selected = options.propagation === "feature"
    ? new Set()
    : new Set(options.edgePersistentIds || options.edges || []);
  const seenEdges = [];
  let added = 0;
  try {
    const continuity = {
      tangent: oc.GeomAbs_Shape.GeomAbs_C1,
      curvature: oc.GeomAbs_Shape.GeomAbs_C2,
    }[options.continuity];
    if (continuity) maker.SetContinuity(continuity, Math.PI / 180);
    while (explorer.More()) {
      const edge = oc.TopoDS.Edge_1(explorer.Current());
      if (seenEdges.some((candidate) => candidate.IsSame(edge))) {
        edge.delete?.();
        explorer.Next();
        continue;
      }
      seenEdges.push(edge);
      let selectedById = !selected.size;
      if (selected.size && brep.subshapes) {
        for (const persistentId of selected) {
          const candidate = resolveBrepSubshape(brep, persistentId, "edge");
          if (candidate?.IsSame(edge)) { selectedById = true; break; }
        }
      }
      if (selectedById && (!options.filter || options.filter(count, explorer.Current()))) {
        maker.Add_2(Math.max(1e-6, Number(radius) || 0), edge);
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

// Chamfers, like fillets, consume persistent edge references rather than
// explorer positions.  This keeps the operation stable when an upstream edit
// changes OpenCascade's internal traversal order.
export async function chamferBrep(brep, distance, options = {}) {
  if (!brep?.shape) throw new Error("Chamfer needs a BREP shape");
  const oc = brep.oc || await loadCadKernel();
  const maker = new oc.BRepFilletAPI_MakeChamfer(brep.shape);
  const progress = new oc.Message_ProgressRange_1();
  const selectedIds = options.edgePersistentIds || options.edges || [];
  const selectedShapes = selectedBrepSubshapes(brep, "edge", selectedIds);
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
      const chosen = selectedIds.length ? selectedShapes.some((candidate) => candidate.IsSame(edge)) : true;
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
        for (let i = 1; i <= triangulation.NbTriangles(); i++) {
          const triangle = triangulation.Triangle(i);
          const ids = [triangle.Value(1), triangle.Value(2), triangle.Value(3)];
          if (reversed) [ids[1], ids[2]] = [ids[2], ids[1]];
          for (const id of ids) {
            const point = triangulation.Node(id);
            point.Transform(transform);
            positions.push(point.X(), point.Y(), point.Z());
            point.delete?.();
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
  return { positions, faceRanges };
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
