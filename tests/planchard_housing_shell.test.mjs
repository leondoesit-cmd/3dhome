import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";

import {
  booleanBrep,
  disposeBrep,
  extractBrepTopology,
  makeBrepExtrusion,
  makeBrepLoft,
  makeBrepPrimitive,
  shapeMassProperties,
  shellBrep,
  validateBrepForExport,
  draftBrep,
} from "../js/cad_kernel.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";

/* HOUSING Shell1 (Planchard 361–379): Base Extrude ∪ Boss-Loft1 ∪ Boss-Battery,
   then a 0.100 in inside shell removing the front cap, then Boss-Stop's ring.
   OpenCascade's join offset returns an invalid solid on the merged body, so
   the kernel builds an exact shell from each feature's own offset, split along
   the bisector of every feature junction. The earlier stand-ins passed looser
   checks: a sampled-section cavity (walls 0.23–0.36 cm) and an overlapping-
   cavity build (0.2449 cm next to the cylinder junction, 0.2557 cm battery).
   This test checks the wall all round, next to both junctions, and at every
   crease, not at a couple of points. */

const R = 5.55625;
const H = 3.302;
const WIDTH = 7.874;
const TOP = 4.064;
const FILLET = 1.27;
const BATTERY = 11.176;
const THICK = 0.254;
const HALF = WIDTH / 2;
const INNER_R = R - FILLET;
const RING_OUTER = 13.0175 / 2;
// the sharpest cylinder/loft crease is 26.3°, so the inside corner sits t / cos(13.15°) from it
const MITRE_LIMIT = THICK / Math.cos((13.2 * Math.PI) / 180);

function sketchsquareUV() {
  const urc = { u: HALF - FILLET, v: TOP - FILLET };
  const ulc = { u: -(HALF - FILLET), v: TOP - FILLET };
  const lry = -Math.sqrt(INNER_R * INNER_R - (HALF - FILLET) ** 2);
  const lrc = { u: HALF - FILLET, v: lry };
  const llc = { u: -(HALF - FILLET), v: lry };
  const scale = R / INNER_R;
  const rtc = { u: lrc.u * scale, v: lrc.v * scale };
  const ltc = { u: llc.u * scale, v: llc.v * scale };
  const rtl = { u: HALF, v: lry };
  const ltl = { u: -HALF, v: lry };
  const urSide = { u: HALF, v: urc.v };
  const urTop = { u: urc.u, v: TOP };
  const ulTop = { u: ulc.u, v: TOP };
  const ulSide = { u: -HALF, v: ulc.v };
  const mid = (c, a, b) => {
    const start = Math.atan2(a.v - c.v, a.u - c.u);
    let span = Math.atan2(b.v - c.v, b.u - c.u) - start;
    while (span <= -Math.PI) span += 2 * Math.PI;
    while (span > Math.PI) span -= 2 * Math.PI;
    const angle = start + span / 2, radius = Math.hypot(a.u - c.u, a.v - c.v);
    return { u: c.u + Math.cos(angle) * radius, v: c.v + Math.sin(angle) * radius };
  };
  return [
    { type: "arc", from: ltc, mid: { u: 0, v: -R }, to: rtc, center: { u: 0, v: 0 }, radius: R },
    { type: "arc", from: rtc, mid: mid(lrc, rtc, rtl), to: rtl, center: lrc, radius: FILLET },
    { type: "line", from: rtl, to: urSide },
    { type: "arc", from: urSide, mid: mid(urc, urSide, urTop), to: urTop, center: urc, radius: FILLET },
    { type: "line", from: urTop, to: ulTop },
    { type: "arc", from: ulTop, mid: mid(ulc, ulTop, ulSide), to: ulSide, center: ulc, radius: FILLET },
    { type: "line", from: ulSide, to: ltl },
    { type: "arc", from: ltl, mid: mid(llc, ltl, ltc), to: ltc, center: llc, radius: FILLET },
  ];
}

function atZ(segment, z) {
  const point = (q) => ({ x: q.u, y: q.v, z, u: q.u, v: q.v });
  const out = { ...segment };
  for (const key of ["from", "to", "mid", "center"]) if (segment[key]) out[key] = point(segment[key]);
  return out;
}

function circleArcs(z, radius = R) {
  const point = (u, v) => ({ x: u, y: v, z, u, v });
  return [
    { type: "arc", from: point(0, -radius), mid: point(radius, 0), to: point(0, radius), center: point(0, 0), radius },
    { type: "arc", from: point(0, radius), mid: point(-radius, 0), to: point(0, -radius), center: point(0, 0), radius },
  ];
}

async function housingBody() {
  const segments = sketchsquareUV();
  const square = segments.map((segment) => atZ(segment, -H));
  const cylinder = await makeBrepPrimitive({ type: "cylinder", r: R, h: H, axis: "z" });
  const loft = await makeBrepLoft({
    sections: [circleArcs(0).map((segment) => segment.from), square.map((segment) => segment.from)],
    sectionSegments: [circleArcs(0), square],
  });
  const battery = await makeBrepExtrusion({
    points: segments.map((segment) => segment.from),
    segments,
    from: 0,
    to: BATTERY,
    draftAngle: 1,
    frame: {
      origin: { x: 0, y: 0, z: -H },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 },
      normal: { x: 0, y: 0, z: -1 },
    },
  });
  const lofted = await booleanBrep("union", cylinder, loft);
  const body = await booleanBrep("union", lofted, battery);
  disposeBrep(cylinder); disposeBrep(loft); disposeBrep(battery); disposeBrep(lofted);
  return body;
}

function frontCapId(brep) {
  extractBrepTopology(brep, { ownerFeatureId: "housing" });
  const front = brep.topology.find((item) => item.kind === "face" && item.descriptor.surface === "plane"
    && Math.abs((item.descriptor.origin?.z || 0) - H) < 1e-4
    && (item.descriptor.normal?.z || 0) > 0.9);
  assert.ok(front, "front cap at z = 3.302");
  return front.persistentId;
}

function each(oc, shape, type, fn) {
  const explorer = new oc.TopExp_Explorer_2(shape, type, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  try { for (; explorer.More(); explorer.Next()) fn(explorer.Current()); } finally { explorer.delete(); }
}

/* Perpendicular wall: from a point on the outer surface, the distance to the
   nearest face of the shell that is not on the original outer surface. */
function wallGauge(body, shelled) {
  const oc = body.oc;
  const onBody = new oc.BRepClass3d_SolidClassifier_1(); onBody.Load(body.shape);
  const state = (x, y, z) => { const p = new oc.gp_Pnt_3(x, y, z); onBody.Perform(p, 1e-5); p.delete(); return onBody.State().value; };
  const ON = oc.TopAbs_State.TopAbs_ON.value, IN = oc.TopAbs_State.TopAbs_IN.value;
  const inner = [];
  each(oc, shelled.shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, (fs) => {
    const face = oc.TopoDS.Face_1(fs), a = new oc.BRepAdaptor_Surface_2(face, true);
    const p = a.Value((a.FirstUParameter() + a.LastUParameter()) / 2, (a.FirstVParameter() + a.LastVParameter()) / 2);
    if (state(p.X(), p.Y(), p.Z()) !== ON) inner.push(face);
  });
  const distance = (x, y, z) => {
    const vertex = new oc.BRepBuilderAPI_MakeVertex(new oc.gp_Pnt_3(x, y, z)).Vertex();
    let best = Infinity;
    for (const face of inner) {
      const d = new oc.BRepExtrema_DistShapeShape_1(); d.LoadS1(vertex); d.LoadS2(face); d.Perform(new oc.Message_ProgressRange_1());
      if (d.IsDone()) best = Math.min(best, d.Value());
      d.delete();
    }
    return best;
  };
  return (z) => {
    const walls = [];
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      let lo = 0, hi = 8;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (state(dx * m, dy * m, z) === IN) lo = m; else hi = m; }
      walls.push(distance(dx * lo, dy * lo, z));
    }
    return { min: Math.min(...walls), max: Math.max(...walls) };
  };
}

/* The other agent's seam check: points 0.1t, 0.5t and 0.9t in along the normal
   bisector of every shared outer edge must be inside the wall. A crack along a
   fold, which normal-only probes miss, fails here. */
function seamFailures(body, shelled, openingId) {
  const oc = body.oc;
  const faces = [...body.subshapes].filter(([, entry]) => entry.kind === "face");
  const classifier = new oc.BRepClass3d_SolidClassifier_2(shelled.shape);
  let failures = 0, samples = 0;
  for (const [, edge] of body.subshapes) {
    if (edge.kind !== "edge") continue;
    const adjacent = faces.filter(([, face]) => { let hit = false; each(oc, face.shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, (e) => { if (edge.shape.IsSame(e)) hit = true; }); return hit; });
    if (adjacent.length !== 2 || adjacent.some(([id]) => id === openingId)) continue;
    const curve = new oc.BRepAdaptor_Curve_2(edge.shape);
    for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const t = curve.FirstParameter() + (curve.LastParameter() - curve.FirstParameter()) * fraction, q = curve.Value(t);
      const sum = [0, 0, 0];
      for (const [, face] of adjacent) {
        const uv = new oc.BRepAdaptor_Curve2d_2(edge.shape, face.shape).Value(t), surface = new oc.BRepAdaptor_Surface_2(face.shape, true);
        const p = new oc.gp_Pnt_1(), du = new oc.gp_Vec_1(), dv = new oc.gp_Vec_1(); surface.D1(uv.X(), uv.Y(), p, du, dv);
        const n = du.Crossed(dv); n.Normalize(); if (face.shape.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED) n.Reverse();
        sum[0] += n.X(); sum[1] += n.Y(); sum[2] += n.Z();
      }
      const len = Math.hypot(...sum);
      for (const depth of [THICK * 0.1, THICK * 0.5, THICK * 0.9]) {
        classifier.Perform(new oc.gp_Pnt_3(q.X() - sum[0] / len * depth, q.Y() - sum[1] / len * depth, q.Z() - sum[2] / len * depth), 1e-6);
        samples++;
        if (classifier.State() !== oc.TopAbs_State.TopAbs_IN) failures++;
      }
    }
  }
  return { failures, samples };
}

test("HOUSING Shell1 is an exact constant-thickness shell and Boss-Stop fuses onto it", { timeout: 900000 }, async () => {
  const body = await housingBody();
  let shelled = null, ring = null, fused = null;
  try {
    const openingId = frontCapId(body);
    shelled = await shellBrep(body, THICK, { facePersistentIds: [openingId] });
    assert.equal(shelled.invalid, undefined, "the shell is a valid solid");
    assert.equal(shelled.approximate, undefined, `the shell is exact, not the sampled-section stand-in: ${shelled.approximate}`);
    const exported = await validateBrepForExport(shelled);
    assert.equal(exported.solidCount, 1);
    const mass = await shapeMassProperties(shelled);
    assert.ok(Math.abs(mass.volume - 156.35) < 0.02, `shell volume ${mass.volume}`);
    assert.ok(Math.abs((mass.bounds.max.x - mass.bounds.min.x) - 2 * R) < 1e-4, "outer width unchanged");
    assert.ok(Math.abs((mass.bounds.max.y - mass.bounds.min.y) - 2 * R) < 1e-4, "outer height unchanged");
    assert.ok(Math.abs(mass.bounds.max.z - H) < 1e-6 && Math.abs(mass.bounds.min.z + H + BATTERY) < 1e-4, "front opening and back wall stay put");

    const seams = seamFailures(body, shelled, openingId);
    assert.equal(seams.failures, 0, `${seams.failures} of ${seams.samples} crease samples are missing wall material`);

    const gauge = wallGauge(body, shelled);
    for (const z of [1.65, -1.65, -3.31, -9]) {
      const { min, max } = gauge(z);
      assert.ok(min > THICK - 5e-4 && max < THICK + 5e-4, `wall at z = ${z}: ${min}..${max}`);
    }
    for (const z of [0.005, -0.005]) {
      const { min, max } = gauge(z);
      assert.ok(min > THICK - 5e-4 && max < MITRE_LIMIT + 5e-4, `wall beside the cylinder junction at z = ${z}: ${min}..${max}`);
    }

    ring = await makeBrepExtrusion({
      points: [{ u: RING_OUTER, v: 0 }, { u: 0, v: RING_OUTER }, { u: -RING_OUTER, v: 0 }, { u: 0, v: -RING_OUTER }],
      segments: [{ type: "circle", center: { u: 0, v: 0 }, radius: RING_OUTER }],
      holes: [{ points: [{ u: R - THICK, v: 0 }], segments: [{ type: "circle", center: { u: 0, v: 0 }, radius: R - THICK }] }],
      from: 0, to: THICK, axis: "z",
    });
    fused = await booleanBrep("union", shelled, ring);
    const stop = await validateBrepForExport(fused);
    assert.equal(stop.solidCount, 1);
    assert.ok(Math.abs(stop.volumeCm3 - 165.52) < 0.05, `Boss-Stop ${stop.volumeCm3}`);
  } finally {
    [fused, ring, shelled, body].filter(Boolean).forEach(disposeBrep);
  }
});

/* The same shell on the HOUSING record saved from the model editor, not a
   rebuilt body. Its Boss-Loft1 is split differently (Sketchcircle at 0° and
   180°, Sketchsquare's top line at 90°), and that exposed three faults the
   rebuilt body never did: the bisector's disc wire dropped half its edges when
   the crease edges came out of order, the loft's offset seams carry 0.008 cm
   edge tolerances (so the exact shell used to be rejected for the 330.8 cm³
   sampled fallback), and the first join offset loosened the caller's body in
   place. */
test("the saved HOUSING record rebuilds Shell1 as the exact shell without touching the body before it, Boss-Stop follows its moved inner edge, and Draft1 pivots on the picked rim", { timeout: 900000 }, async () => {
  const record = JSON.parse(readFileSync(new URL("./fixtures/planchard_housing_record.json", import.meta.url), "utf8"));
  const compiled = compileKernelFeatureTree(record);
  const shellIndex = compiled.features.findIndex((feature) => feature.type === "shell");
  assert.ok(shellIndex > 0, "the record has Shell1");
  const shellFeature = compiled.features[shellIndex];
  const run = await regenerateFeatures({ ...compiled.document, features: compiled.features });
  try {
    const body = run.results.get(shellFeature.inputs[0]), shelled = run.results.get(shellFeature.id);
    assert.ok(body?.shape && shelled?.shape, "body and shell rebuilt");
    const oc = body.oc;
    assert.equal(shelled.approximate, undefined, `Shell1 is exact: ${shelled.approximate}`);
    assert.equal(shelled.invalid, undefined, `Shell1 is valid: ${shelled.invalid}`);
    assert.ok(run.ok && !run.issues.some((issue) => ["approximate-shell", "invalid-solid", "regeneration-failed"].includes(issue.code)), JSON.stringify(run.issues));

    const analysis = new oc.ShapeAnalysis_ShapeTolerance();
    const bodyTolerance = analysis.Tolerance(body.shape, 1, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    analysis.delete();
    assert.ok(bodyTolerance < 1e-6, `the body before the shell is untouched (tolerance ${bodyTolerance})`);

    const mass = await shapeMassProperties(shelled);
    /* 156.40 while the loft seams were 0.0082 cm loose; with them tight the
       saved record agrees with the rebuilt body above (156.35). */
    assert.ok(Math.abs(mass.volume - 156.35) < 0.02, `shell volume ${mass.volume}`);
    /* Boss-Loft1's seams crease up to 2° and fade to tangent; the join offset
       left them 0.0082 cm loose and export blocked. They are recomputed as the
       true intersection of the two offset faces. */
    assert.equal(shelled.looseTolerance, undefined, `Shell1 seams are export-tight (${shelled.looseTolerance} cm)`);
    assert.ok(!run.issues.some((issue) => issue.code === "loose-shell-tolerance"), "no loose-shell-tolerance warning");
    assert.ok(Math.abs((mass.bounds.max.x - mass.bounds.min.x) - 2 * R) < 1e-4 && Math.abs((mass.bounds.max.y - mass.bounds.min.y) - 2 * R) < 1e-4, "outer width and height unchanged");
    assert.ok(Math.abs((mass.bounds.max.z - mass.bounds.min.z) - (H + H + BATTERY)) < 1e-4, "outer length unchanged");

    extractBrepTopology(body, { ownerFeatureId: "housing-record" });
    const opening = body.topology.find((item) => item.kind === "face" && item.descriptor.surface === "plane"
      && Math.abs((item.descriptor.origin?.z || 0) - H) < 1e-4 && (item.descriptor.normal?.z || 0) > 0.9);
    assert.ok(opening, "front cap at z = 3.302");
    const seams = seamFailures(body, shelled, opening.persistentId);
    assert.equal(seams.failures, 0, `${seams.failures} of ${seams.samples} crease samples are missing wall material`);

    const gauge = wallGauge(body, shelled);
    for (const z of [1.65, -1.65, -3.31, -9]) {
      const { min, max } = gauge(z);
      assert.ok(min > THICK - 5e-4 && max < THICK + 5e-4, `wall at z = ${z}: ${min}..${max}`);
    }
    for (const z of [0.02, 0.005, -0.005]) {
      const { min, max } = gauge(z);
      assert.ok(min > THICK - 5e-4 && max < MITRE_LIMIT + 5e-4, `wall beside the cylinder junction at z = ${z}: ${min}..${max}`);
    }

    /* Boss-Stop's hole is converted from Shell1's inner opening edge. The exact
       shell numbers that edge differently from the shell it was picked on, so
       the link follows the one complete circle with the same centre and radius. */
    const stopFeature = compiled.features.at(-1), stop = run.results.get(stopFeature?.id);
    assert.equal(stopFeature?.name, "Extrude / Boss 3", "the record ends with Boss-Stop");
    assert.ok(stop?.shape, "Boss-Stop rebuilt");
    const ring = Math.PI * (RING_OUTER ** 2 - (R - THICK) ** 2) * THICK, overlap = Math.PI * (R ** 2 - (R - THICK) ** 2) * THICK;
    const stopMass = await shapeMassProperties(stop);
    assert.ok(Math.abs(stopMass.volume - (mass.volume + ring - overlap)) < 0.01, `Boss-Stop ${stopMass.volume}, expected ${mass.volume + ring - overlap}`);
    assert.ok(Math.abs((stopMass.bounds.max.x - stopMass.bounds.min.x) - 2 * RING_OUTER) < 1e-4, "Boss-Stop ring is 5.125 in across");

    /* Draft1 (steps 383–391) on the Boss-Stop body: neutral plane = Shell1's
       thin front rim, face to draft = the outer cylinder, 5°. Found by
       geometry, the way the pick lands in the editor. */
    const stopFaces = (stop.topology || []).filter((item) => item.kind === "face");
    const rim = stopFaces.filter((item) => item.descriptor?.surface === "plane" && Math.abs((item.descriptor.origin?.z ?? 0) - H) < 1e-4 && (item.descriptor.normal?.z ?? 0) > 0.9);
    const wall = stopFaces.filter((item) => item.descriptor?.surface === "cylinder" && Math.abs((item.descriptor.radius ?? 0) - R) < 1e-4);
    assert.equal(rim.length, 1, "one front rim on Boss-Stop");
    assert.equal(wall.length, 1, "one outer front wall on Boss-Stop");
    const drafted = await draftBrep(stop, 5, { neutralFaceId: rim[0].persistentId, facePersistentIds: [wall[0].persistentId] });
    const tan5 = Math.tan((5 * Math.PI) / 180), length = H - THICK;
    const added = Math.PI * (R * tan5 * length ** 2 + tan5 ** 2 * length ** 3 / 3);
    const draftMass = await shapeMassProperties(drafted);
    assert.ok(Math.abs(draftMass.volume - (stopMass.volume + added)) < 0.01, `Draft1 ${draftMass.volume}, expected ${stopMass.volume + added}`);
    const outerRadiusAt = (z) => {
      const oc = drafted.oc, owned = [];
      try {
        const pln = new oc.gp_Pln_3(new oc.gp_Pnt_3(0, 0, z), new oc.gp_Dir_4(0, 0, 1)); owned.push(pln);
        const maker = new oc.BRepBuilderAPI_MakeFace_9(pln, -20, 20, -20, 20); owned.push(maker);
        const progress = new oc.Message_ProgressRange_1(); owned.push(progress);
        const section = new oc.BRepAlgoAPI_Section_3(drafted.shape, maker.Face(), progress); owned.push(section);
        let max = 0;
        const explorer = new oc.TopExp_Explorer_2(section.Shape(), oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); owned.push(explorer);
        for (; explorer.More(); explorer.Next()) { const point = oc.BRep_Tool.Pnt(oc.TopoDS.Vertex_1(explorer.Current())); max = Math.max(max, Math.hypot(point.X(), point.Y())); point.delete(); }
        return max;
      } finally { owned.forEach((item) => item.delete?.()); }
    };
    try {
    // Pivots on the rim (z = H keeps R) and widens toward the flange; the inside stays straight.
    assert.ok(Math.abs(outerRadiusAt(H - 0.1) - (R + 0.1 * tan5)) < 1e-4, `outer radius beside the rim ${outerRadiusAt(H - 0.1)}`);
    assert.ok(Math.abs(outerRadiusAt(THICK + 0.05) - (R + (length - 0.05) * tan5)) < 1e-4, `outer radius beside the flange ${outerRadiusAt(THICK + 0.05)}`);
    } finally { disposeBrep(drafted); }
  } finally {
    releaseRegeneration(run);
  }
});
