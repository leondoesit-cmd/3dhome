/* The CAD kernel's solid builders: extrusions (incl. up-to-face), revolves,
   cones, hole tools, helical pipes and booleans, split out of js/cad_kernel.js.
   It shares the editor's state through live imports from ../cad_kernel.js. */
import { compoundBrep, disposeBrep, unifyBrepFaces } from "../cad_kernel/analysis.js";
import { solidPieces } from "../cad_kernel/body_ops.js";
import { edgeIsFinishTarget, edgeOnAnyFace, finishEdgeSelection, shapeHasSolid, shapeVolume } from "../cad_kernel/finish_shell.js";
import { draftPrismWalls, enlargeFaceForSplit, makeBrepPrimitive, profileWire, resolveBrepSubshape, solidContainsPoint } from "../cad_kernel/topology_primitives.js";
import { cylinderAxis } from "../core/cylinder_axis.js";
import { UP_TO_FACE_MISSED, extrusionAxisVector } from "../core/extrude_extent.js";
import { repairFilletCornerPatches } from "../core/fillet_corner_repair.js";
import { framePoint } from "../core/frame.js";
import { holeToolPlacements } from "../core/hole_geometry.js";
import { pathFrames, segmentProfilePoints } from "../core/profile_curves.js";
import { assertRevolveProfileFrame, assertSketchAxisProfile, axisMeridian, revolveInterval, revolvePoint } from "../core/revolve_geometry.js";
import { fitProfileCircle } from "../core/topology.js";
import {
  disposeAll, loadCadKernel, loopPoints, loopSegments, opaqueBreps,
  shapeBounds, world,
} from "../cad_kernel.js";

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
    const meridian=q=>spec.sketchAxisCoordinates?axisMeridian(spec.axisBasis,q):q;
    if (spec.axisBasis) assertSketchAxisProfile(spec);
    else if (spec.radialProfile || spec.profileFrame) assertRevolveProfileFrame(points, spec);
    const loop = spec.segments ? { points, segments: spec.segments } : points;
    const interval=revolveInterval(spec);
    const axisName=spec.axis || "y", radial=!!spec.radialProfile;
    const coordinateSpec={...spec,x:0,y:0,z:0};
    const place=spec.axisBasis?q=>revolvePoint(coordinateSpec,meridian(q),interval.start):spec.profileFrame?q=>{
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
    const o=spec.axisBasis?.origin || {x:0,y:0,z:0};
    const dir=spec.axisBasis?.axial || {x:axisName==="x"?sign:0,y:axisName==="y"?sign:0,z:axisName==="z"?sign:0};
    const origin=new oc.gp_Pnt_3(o.x,o.y,o.z),direction=new oc.gp_Dir_4(dir.x,dir.y,dir.z);owned.push(origin,direction);
    const axis=new oc.gp_Ax1_2(origin,direction);owned.push(axis);
    const maker=new oc.BRepPrimAPI_MakeRevol_1(face.Face(),axis,interval.span,true);owned.push(maker);
    if((radial || spec.axisBasis || spec.profileFrame) && (spec.x || spec.y || spec.z)){
      const shift=new oc.gp_Trsf_1(),vector=new oc.gp_Vec_4(spec.x||0,spec.y||0,spec.z||0);owned.push(shift,vector);shift.SetTranslation_1(vector);
      const moved=new oc.BRepBuilderAPI_Transform_2(maker.Shape(),shift,true);owned.push(moved);
      return {oc,shape:moved.Shape(),kind:"solid"};
    }
    return { oc, shape: maker.Shape(), kind: "solid" };
  } finally { disposeAll(owned); }
}

export async function makeBrepSweep(spec) {
  const oc = await loadCadKernel(), owned = [];
  try {
    const profileLoop = spec.profileSegments ? { points: spec.profile, segments: spec.profileSegments } : spec.profile;
    // A single fitted multi-turn spine can make OCCT miss the crossings of a
    // circular pipe and a coaxial cylinder. Cut then retains exterior cutter
    // faces despite a valid positive-volume solid. Short spline spans retain
    // the authored samples and give the surface intersector bounded turns.
    const quarterSegments = spec.operation === 'subtract' && spec.helixId && spec.helix?.turns && spec.profileSegments && spec.path?.length > 8
      ? Array.from({length:Math.ceil(spec.helix.turns*4)},(_,i)=>{
        const count=Math.ceil(spec.helix.turns*4),last=spec.path.length-1;
        const points=spec.path.slice(Math.round(i*last/count),Math.round((i+1)*last/count)+1);
        return {type:'spline',from:points[0],to:points.at(-1),points};
      }) : null;
    const pathLoop = quarterSegments ? {points:spec.path,segments:quarterSegments} : spec.pathSegments ? { points: spec.path, segments: spec.pathSegments } : spec.path;
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
  if(opaqueBreps.has(brep) && Number.isInteger(brep.nativeSolidCount))return brep.nativeSolidCount;
  if(!brep?.shape)throw new Error("Solid count requires an exact shape");
  const oc=brep.oc || await loadCadKernel();
  const explorer=new oc.TopExp_Explorer_2(brep.shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count=0;
  try{while(explorer.More()){count++;explorer.Next();}return count;}
  finally{explorer.delete();}
}

export async function shapeMassProperties(brep) {
  if(opaqueBreps.has(brep) && brep.workerMassProperties)return structuredClone(brep.workerMassProperties);
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

function exceedsExportTolerance(actual, limit) {
  // Allow the same small OCCT rounding error in Shell diagnostics and export.
  const roundingAllowance = Math.max(4 * Math.max(Number.MIN_VALUE, 2 ** (Math.floor(Math.log2(limit)) - 52)), limit * 1e-8);
  return !Number.isFinite(actual) || actual - limit > roundingAllowance;
}

export async function booleanBrep(operation, left, right) {
  if (!left?.shape || !right?.shape) throw new Error("Boolean operands must be BREP shapes");
  const oc = left.oc || right.oc || await loadCadKernel();
  opaqueBreps.get(right)?.materialize();
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

export {
  buildBoolean, exceedsExportTolerance, selectedBrepSubshapes, shapeIsValid,
  shapeMaxTolerance,
};
