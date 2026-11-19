/* Convert Entities: selected model edges become ordinary, fully defined
   sketch geometry of their own kind, linked to the edge by reference.
   The countertop exercise (Introducing SOLIDWORKS pp. 38-40) needs two
   neighbouring top edges for a thin backsplash and, later, a cut's elliptical
   rim for a loft. */
import test from "node:test";
import assert from "node:assert/strict";

import { loftSourceRecord, resolveSketchSources } from "../js/core/swept_sources.js";
import { resolveProfilePoints, solveSketch } from "../js/sketch_solver.js";
import { bindModelEdgeTargets, hitProjectedModelEdge, hitScreenModelEdge, modelEdgeSketchCurve, pickSketchModelTopology } from "../js/sketch_intersection.js";
import { appendConvertedEdges, convertedEdgeIds, exactEdgeForSegment } from "../js/core/convert_entities.js";
import { compileKernelFeatureTree } from "../js/core/kernel_feature_adapter.js";
import { createCadWorkerExecutor } from "../js/core/cad_worker_runtime.js";
import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { deserializeBrep, disposeBrep, extractBrepTopology, hydrateSerializedBrepTopology, makeBrepExtrusion, serializeBrep } from "../js/cad_kernel.js";
import { parseModelerDraft, serializeModelerDraft } from "../js/modeler_draft.js";
import { createTopologyReference } from "../js/core/topology.js";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const ids = () => { let n = 0; return () => "id" + (++n); };
/* A sketch on the countertop's top face: plane "top" at the top's height, so
   sketch (x, y) are world (x, z). */
const topSketch = (offset = 3.4) => ({ id: "s", plane: "top", offset, points: [], entities: [], constraints: [] });
const lineEdge = (id, a, b) => ({ kind: "edge", persistentId: id, ownerFeatureId: "body", descriptor: { curve: "line", endpoints: [a, b], measure: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) } });
const solveWith = (sketch, edges) => {
  const byId = new Map(edges.map((edge) => [edge.persistentId, edge]));
  bindModelEdgeTargets(sketch, (ref) => byId.get(ref.persistentId));
  return solveSketch(sketch);
};
const pointOf = (sketch, id) => sketch.points.find((p) => p.id === id);

/* The countertop top face, 600 x 580 mm, 34 mm thick (cm units). */
const countertop = (w = 60, d = 58, h = 3.4) => ({
  back: lineEdge("back", { x: 0, y: h, z: 0 }, { x: w, y: h, z: 0 }),
  left: lineEdge("left", { x: 0, y: h, z: 0 }, { x: 0, y: h, z: d }),
  front: lineEdge("front", { x: 0, y: h, z: d }, { x: w, y: h, z: d }),
  bottomBack: lineEdge("bottom-back", { x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }),
});

test("two neighbouring top edges become two ordinary lines sharing a corner, fully defined", () => {
  const edges = countertop(), sketch = topSketch();
  const { entities, skipped } = appendConvertedEdges(sketch, [edges.back, edges.left], { makeId: ids() });
  assert.deepEqual(skipped, []);
  assert.deepEqual(entities.map((e) => e.type), ["line", "line"], "only the selected edges, nothing of the rest of the perimeter");
  assert.ok(entities.every((e) => e.construction === false), "usable profile geometry, not construction");
  assert.equal(sketch.points.length, 3, "the shared corner is one sketch point");
  assert.equal(entities[0].a, entities[1].a, "both lines start at the back-left corner");
  assert.equal(sketch.constraints.length, 4, "each edge retains both endpoint references");
  assert.ok(sketch.constraints.every((c) => c.type === "onModelEdge" && c.convert && c.edge.persistentId), "each is linked by reference");
  const report = solveWith(sketch, Object.values(edges));
  assert.equal(report.status, "fully-constrained");
  assert.equal(report.degreesOfFreedom, 0);
  assert.equal(report.redundant, false);
  const back = entities[0];
  assert.ok(near(pointOf(sketch, back.b).x, 60) && near(pointOf(sketch, back.b).y, 0), JSON.stringify(sketch.points));
  assert.ok(near(pointOf(sketch, entities[1].b).y, 58), JSON.stringify(sketch.points));
});

test("a converted chain follows the model and survives a JSON round trip by reference alone", () => {
  const sketch = topSketch();
  appendConvertedEdges(sketch, [countertop().back, countertop().left], { makeId: ids() });
  solveWith(sketch, Object.values(countertop()));
  // what is saved: references and relations; the coordinates are not trusted
  const saved = JSON.parse(JSON.stringify(sketch));
  saved.points.forEach((p) => { p.x = 999; p.y = -999; });
  saved.constraints.forEach((c) => { delete c.px; delete c.py; });
  const wider = countertop(72, 61);
  const report = solveWith(saved, Object.values(wider));
  assert.equal(report.status, "fully-constrained");
  const xs = saved.points.map((p) => p.x).sort((a, b) => a - b), ys = saved.points.map((p) => p.y).sort((a, b) => a - b);
  assert.ok(near(xs[2], 72) && near(ys[2], 61), "rebuilt from the edges after reload: " + JSON.stringify(saved.points));
});

test("rebuild reports an edge which disappears or changes curve type", () => {
  const sketch = topSketch(), edge = countertop().back;
  appendConvertedEdges(sketch, [edge], { makeId: ids() });
  assert.throws(() => solveWith(sketch, []), /unavailable/);
  assert.throws(() => solveWith(sketch, [ellipseEdge(edge.persistentId)]), /no longer a line/);
});

test("the construction option makes the same linked geometry as reference geometry", () => {
  const sketch = topSketch();
  const { entities } = appendConvertedEdges(sketch, [countertop().back], { construction: true, makeId: ids() });
  assert.equal(entities[0].construction, true);
  assert.equal(solveWith(sketch, Object.values(countertop())).degreesOfFreedom, 0);
});

test("an edge already converted into the sketch is not stacked twice", () => {
  const sketch = topSketch(), makeId = ids();
  appendConvertedEdges(sketch, [countertop().back], { makeId });
  assert.deepEqual([...convertedEdgeIds(sketch)], ["back"]);
  const again = appendConvertedEdges(sketch, [countertop().back, countertop().back], { makeId });
  assert.equal(again.entities.length, 0);
  assert.match(again.skipped[0].reason, /Already converted/);
});

test("a closed perimeter converted in separate picks retains all four sources", () => {
  const sketch = topSketch(), makeId = ids(), edges = countertop();
  const right = lineEdge("right", edges.back.descriptor.endpoints[1], edges.front.descriptor.endpoints[1]);
  const perimeter = [edges.back, right, edges.front, edges.left];
  for (const edge of perimeter) appendConvertedEdges(sketch, [edge], { makeId });
  assert.equal(sketch.points.length, 4);
  assert.deepEqual([...convertedEdgeIds(sketch)], perimeter.map(e => e.persistentId));
  assert.equal(solveWith(sketch, perimeter).status, "fully-constrained");
  assert.equal(appendConvertedEdges(sketch, [edges.left], { makeId }).entities.length, 0);
  assert.throws(() => solveWith(sketch, perimeter.slice(0, 3)), /unavailable/);
});

test("parallel edges at different depths retain independent projected endpoints", () => {
  const sketch = topSketch(), { back, bottomBack } = countertop();
  appendConvertedEdges(sketch, [back, bottomBack], { makeId: ids() });
  assert.equal(sketch.points.length, 4);
  assert.equal(solveWith(sketch, [back, bottomBack]).degreesOfFreedom, 0);
});

test("reversing native endpoint order after a rotation keeps the same shared sketch vertex", () => {
  const sketch = topSketch(), y = 3.4, at = (x, z) => ({ x, y, z });
  const joint = at(0, 0), back = lineEdge("back", joint, at(8, 0)), side = lineEdge("side", joint, at(0, 5));
  const { entities: [a, b] } = appendConvertedEdges(sketch, [back, side], { makeId: ids() });
  const moved = at(16, 12), far = at(8, 12), other = at(16, 7);
  // Rotate the entire chain 180 degrees. Both kernel arrays now begin at
  // their free ends; nearest old coordinates would also pick the wrong ends.
  const report = solveWith(sketch, [lineEdge("back", far, moved), lineEdge("side", other, moved)]);
  assert.equal(report.status, "fully-constrained");
  assert.equal(a.a, b.a);
  assert.ok(near(pointOf(sketch, a.a).x, moved.x) && near(pointOf(sketch, a.a).y, moved.z));
  assert.ok(near(pointOf(sketch, a.b).x, far.x) && near(pointOf(sketch, b.b).y, other.z));
});

test("an isolated exact line keeps its curve parameter end across coordinate sorting", () => {
  const sketch = topSketch(), line = countertop().back;
  line.descriptor.axis = { x: 1, y: 0, z: 0 };
  const { entities: [a] } = appendConvertedEdges(sketch, [line], { makeId: ids() });
  const rotated = lineEdge("back", { x: -4, y: 3.4, z: 10 }, { x: 0, y: 3.4, z: 0 });
  rotated.descriptor.axis = { x: -0.4, y: 0, z: 1 };
  assert.equal(solveWith(sketch, [rotated]).degreesOfFreedom, 0);
  assert.ok(near(pointOf(sketch, a.a).x, 0) && near(pointOf(sketch, a.b).x, -4));
});

test("separate picks join lightweight edges at the rebuilt vertex after resize and reload", () => {
  const horizontal = length => ({ persistentId: "h", descriptor: { curve: "line", origin: { x: length / 2, y: 3.4, z: 0 }, axis: {x: 1, y: 0, z: 0}, measure: length } });
  const vertical = { persistentId: "v", descriptor: { curve: "line", origin: {x: 12, y: 3.4, z: 3}, axis: {x: 0, y: 0, z: 1}, measure: 6 } };
  const original = topSketch(), makeId = ids();
  appendConvertedEdges(original, [horizontal(8)], { makeId });
  const sketch = JSON.parse(JSON.stringify(original)), resized = horizontal(12);
  assert.equal(solveWith(sketch, [resized]).degreesOfFreedom, 0);
  appendConvertedEdges(sketch, [vertical], { makeId, resolveEdge: ref => ref.persistentId === "h" ? resized : null });
  assert.equal(sketch.entities[0].b, sketch.entities[1].a);
  assert.equal(sketch.points.length, 3);
  assert.equal(solveWith(sketch, [resized, vertical]).status, "fully-constrained");
});

test("an adjacent conversion in a reopened legacy sketch adds no redundant pin equations", () => {
  const original = topSketch(), { back, left } = countertop(), makeId = ids();
  appendConvertedEdges(original, [back], { makeId });
  for (const pin of original.constraints) { delete pin.convert; delete pin.entity; }
  const sketch = JSON.parse(JSON.stringify(original));
  const { entities: [second] } = appendConvertedEdges(sketch, [left], { makeId });
  assert.equal(second.a, sketch.entities[0].a);
  assert.equal(sketch.constraints.length, 4, "both references to the shared corner survive");
  for (const constraints of [sketch.constraints, sketch.constraints.slice().reverse()]) {
    sketch.constraints = constraints;
    const report = solveWith(sketch, [back, left]);
    assert.equal(report.status, "fully-constrained");
    assert.equal(report.redundant, false);
  }
});

test("legacy start and end pins identify a converted line but a lone manual pin does not", () => {
  const sketch = topSketch(), edge = countertop().back, makeId = ids();
  appendConvertedEdges(sketch, [edge], { makeId });
  for (const c of sketch.constraints) { delete c.convert; delete c.entity; }
  const saved = JSON.parse(JSON.stringify(sketch));
  assert.equal(appendConvertedEdges(saved, [edge], { makeId }).entities.length, 0);
  saved.constraints.pop();
  assert.equal(appendConvertedEdges(saved, [edge], { makeId }).entities.length, 1);
});

test("an on-plane endpoint beats both an overlapping off-plane vertex and its face edge", () => {
  const sketch = topSketch(), { bottomBack, back } = countertop();
  // Include a perpendicular edge whose on-plane endpoint is not part of a coplanar edge.
  const post = lineEdge("post", {x: 25, y: 0, z: 0}, {x: 25, y: 3.4, z: 0});
  const edges = [bottomBack, back, post];
  for (const project of [null, p => ({ x: p.x, y: p.z })]) {
    for (const x of [0, 25]) {
      const pick = pickSketchModelTopology(sketch, {x, y: 0}, edges, 0.1, project, d => d.endpoints);
      assert.equal(pick.kind, "vertex");
      assert.deepEqual(pick.descriptor.point, {x, y: 3.4, z: 0});
    }
  }
});

/* --- curves --- */

const kernelArc = (id, center, radius, from, to, h) => {
  const at = (a) => ({ x: center.x + radius * Math.cos(a), y: h, z: center.z + radius * Math.sin(a) });
  // the kernel sorts end points by coordinate, so "start" is not where the arc begins
  const ends = [at(from), at(to)].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
  return { kind: "edge", persistentId: id, ownerFeatureId: "body", descriptor: {
    curve: "circle", origin: { x: center.x, y: h, z: center.z }, axis: { x: 0, y: 1, z: 0 }, radius,
    measure: radius * (to - from), endpoints: ends, arcMidpoint: at((from + to) / 2),
  } };
};

test("an arc edge becomes a sketch arc that runs the way the edge does, held by its centre and ends", () => {
  // a rounded front corner: a quarter arc from the front edge round to the right edge
  const arc = kernelArc("corner", { x: 55, z: 53 }, 5, 0, Math.PI / 2, 3.4);
  const sketch = topSketch();
  const { entities } = appendConvertedEdges(sketch, [arc], { makeId: ids() });
  assert.equal(entities[0].type, "arc");
  const report = solveWith(sketch, [arc]);
  assert.equal(report.status, "fully-constrained", JSON.stringify(report));
  const a = pointOf(sketch, entities[0].a), b = pointOf(sketch, entities[0].b), c = pointOf(sketch, entities[0].c);
  const sweep = (((Math.atan2(b.y - c.y, b.x - c.x) - Math.atan2(a.y - c.y, a.x - c.x)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  assert.ok(near(sweep, Math.PI / 2, 1e-6), "a quarter turn, not the three quarters the sorted ends would give: " + sweep);
  // the radius grows upstream; the same relations follow
  const bigger = kernelArc("corner", { x: 52, z: 50 }, 8, 0, Math.PI / 2, 3.4);
  solveWith(sketch, [bigger]);
  assert.ok(near(Math.hypot(a.x - c.x, a.y - c.y), 8) && near(c.x, 52) && near(c.y, 50), JSON.stringify(sketch.points));
});

test("a complete circular edge becomes a circle whose centre and radius follow the edge", () => {
  const rim = (r) => ({ kind: "edge", persistentId: "rim", ownerFeatureId: "body", descriptor: { curve: "circle", origin: { x: 20, y: 3.4, z: 10 }, axis: { x: 0, y: -1, z: 0 }, radius: r, measure: 2 * Math.PI * r } });
  const sketch = topSketch();
  const { entities } = appendConvertedEdges(sketch, [rim(3)], { makeId: ids() });
  assert.equal(entities[0].type, "circle");
  assert.equal(solveWith(sketch, [rim(3)]).degreesOfFreedom, 0);
  solveWith(sketch, [rim(4.5)]);
  assert.ok(near(entities[0].r, 4.5) && near(pointOf(sketch, entities[0].c).x, 20) && near(pointOf(sketch, entities[0].c).y, 10));
});

const ellipseEdge = (id, { cx = 30, cz = 29, a = 20, b = 12, angle = 0.4, h = 3.4, flip = false } = {}) => ({
  kind: "edge", persistentId: id, ownerFeatureId: "cut:tool", descriptor: {
    curve: "ellipse", origin: { x: cx, y: h, z: cz }, axis: { x: 0, y: 0, z: 1 }, measure: 100,
    endpoints: [{ x: cx + a, y: h, z: cz }, { x: cx + a, y: h, z: cz }],
    ellipse: { center: { x: cx, y: h, z: cz }, normal: { x: 0, y: 1, z: 0 }, majorAxis: { x: (flip ? -1 : 1) * Math.cos(angle), y: 0, z: (flip ? -1 : 1) * Math.sin(angle) }, majorRadius: a, minorRadius: b },
  },
});

test("a complete elliptical edge becomes a fully defined sketch ellipse that follows the edge", () => {
  const sketch = topSketch();
  const { entities } = appendConvertedEdges(sketch, [ellipseEdge("sink")], { makeId: ids() });
  const e = entities[0];
  assert.equal(e.type, "ellipse");
  assert.ok(near(e.rx, 20) && near(e.ry, 12) && near(e.rot, 0.4), JSON.stringify(e));
  const report = solveWith(sketch, [ellipseEdge("sink")]);
  assert.equal(report.status, "fully-constrained");
  assert.equal(report.degreesOfFreedom, 0);
  // resized and turned upstream; the major axis now points the other way round
  solveWith(sketch, [ellipseEdge("sink", { cx: 25, a: 24, b: 10, angle: 0.4 + Math.PI, flip: false })]);
  const c = pointOf(sketch, e.c);
  assert.ok(near(c.x, 25) && near(e.rx, 24) && near(e.ry, 10), JSON.stringify(e));
  assert.ok(near(Math.abs(Math.sin(e.rot - 0.4)), 0, 1e-6), "the same tilt modulo a half turn, not flipped through 180°: " + e.rot);
});

test("edges that have no exact sketch entity are refused with a reason, and nothing is added", () => {
  const sketch = topSketch();
  const tilted = { kind: "edge", persistentId: "tilted", descriptor: { curve: "circle", origin: { x: 0, y: 3.4, z: 0 }, axis: { x: 1, y: 0, z: 0 }, radius: 2, measure: 4 * Math.PI } };
  const spline = { kind: "edge", persistentId: "spline", descriptor: { curve: "bspline", endpoints: [{ x: 0, y: 3.4, z: 0 }, { x: 4, y: 3.4, z: 2 }] } };
  const partial = ellipseEdge("partial");
  partial.descriptor.endpoints = [{ x: 50, y: 3.4, z: 29 }, { x: 30, y: 3.4, z: 41 }];
  const post = lineEdge("post", { x: 0, y: 0, z: 0 }, { x: 0, y: 3.4, z: 0 });
  const { entities, skipped } = appendConvertedEdges(sketch, [tilted, spline, partial, post], { makeId: ids() });
  assert.equal(entities.length, 0);
  assert.deepEqual(skipped.map((s) => s.edge.persistentId), ["tilted", "spline", "partial", "post"]);
  assert.match(skipped[0].reason, /not parallel/);
  assert.match(skipped[1].reason, /no exact sketch entity/);
  assert.match(skipped[2].reason, /complete elliptical/);
  assert.match(skipped[3].reason, /square to the sketch plane/);
  assert.deepEqual(sketch.points, [], "a refused edge leaves no stray points");
});

test("an analytic extrusion's sampled arc and rim convert to a real arc and circle", () => {
  const h = 3.4, at = (a, r = 5) => ({ x: 10 + r * Math.cos(a), y: h, z: 10 + r * Math.sin(a) });
  const sampledArc = { kind: "edge", persistentId: "run", descriptor: { curve: "polyline", endpoints: Array.from({ length: 9 }, (_, i) => at(Math.PI / 2 * i / 8)) } };
  const sampledRim = { kind: "edge", persistentId: "loop", descriptor: { curve: "polyline", endpoints: Array.from({ length: 25 }, (_, i) => at(2 * Math.PI * i / 24, 3)) } };
  const arc = modelEdgeSketchCurve(topSketch(), sampledArc), rim = modelEdgeSketchCurve(topSketch(), sampledRim);
  assert.equal(arc.kind, "arc");
  assert.ok(near(arc.radius, 5, 1e-6) && near(arc.center.x, 10, 1e-6));
  assert.equal(rim.kind, "circle");
  assert.ok(near(rim.radius, 3, 1e-6));
});

test("a picked chord of a tessellated ellipse rim stands for the exact elliptical edge", () => {
  const sketch = topSketch(), exact = ellipseEdge("rim", { angle: 0 });
  const at = (t) => ({ x: 30 + 20 * Math.cos(t), y: 3.4, z: 29 + 12 * Math.sin(t) });
  const chord = lineEdge("hole:cut:0:start:7", at(0.5), at(0.62));
  const lower = ellipseEdge("lower-rim", { angle: 0, h: 0 });
  assert.equal(exactEdgeForSegment(sketch, chord, [lower, exact]), exact);
  assert.equal(exactEdgeForSegment(sketch, chord, [lower]), chord);
  assert.equal(exactEdgeForSegment(sketch, chord, [chord, exact]).persistentId, "rim");
  const realChord = { ...chord, persistentId: "box:edge:profile:7:end" };
  assert.equal(exactEdgeForSegment(sketch, realChord, [exact]), realChord);
  assert.equal(appendConvertedEdges(sketch, [chord], { makeId: ids() }).skipped.length, 1, "an unresolved mesh chord cannot become a dangling association");
  assert.equal(exactEdgeForSegment(sketch, chord, [realChord]), realChord);
  const realEdge = countertop().back;
  assert.equal(exactEdgeForSegment(sketch, realEdge, [realEdge, exact]), realEdge, "an ordinary straight edge stays itself");
});

/* --- picking in the sketch --- */

test("seen square-on, the rim on the sketch face wins over the edge drawn just beside it", () => {
  const sketch = topSketch(), edges = countertop();
  // an orthographic view down -Y with the bottom edge drawn 2 px off the rim
  const toScreen = (w) => ({ x: 100 + w.x * 10 + (w.y < 1 ? 2 : 0), y: 100 + w.z * 10 });
  const click = { x: 100 + 300 + 1.5, y: 100 };
  assert.equal(hitScreenModelEdge(click, [edges.bottomBack, edges.back], 8, toScreen, (d) => d.endpoints).persistentId, "bottom-back", "without the sketch, the nearer drawing wins");
  assert.equal(pickSketchModelTopology(sketch, click, [edges.bottomBack, edges.back], 8, toScreen, (d) => d.endpoints).persistentId, "back", "with it, the edge on the sketch plane does");
  // an ellipse rim lying in the sheet is picked along its own curve
  const sink = ellipseEdge("sink", { angle: 0 });
  assert.equal(hitProjectedModelEdge(sketch, { x: 50.05, y: 29 }, [sink], 0.2).persistentId, "sink");
  assert.equal(hitProjectedModelEdge(sketch, { x: 30, y: 29 }, [sink], 0.2), null, "its centre is not on it");
});

/* --- the exact kernel and the feature rebuild --- */

test("the kernel describes an elliptical edge with its centre, axes and radii", async () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ u: 10 * Math.cos(i / 40 * 2 * Math.PI), v: 5 * Math.sin(i / 40 * 2 * Math.PI) }));
  const brep = await makeBrepExtrusion({ points, segments: [{ type: "ellipse", center: { u: 2, v: 1 }, rx: 5, ry: 10, rot: 0.3 }], axis: "z", from: 0, to: 4 });
  try {
    const rims = extractBrepTopology(brep).topology.filter((item) => item.kind === "edge" && item.descriptor.curve === "ellipse");
    assert.equal(rims.length, 2, "a top and a bottom rim");
    for (const rim of rims) {
      const e = rim.descriptor.ellipse;
      assert.ok(e && near(e.majorRadius, 10, 1e-7) && near(e.minorRadius, 5, 1e-7), JSON.stringify(rim.descriptor));
      // a "tall" ellipse: the major axis is the sketch's v turned by rot
      assert.ok(near(Math.abs(e.majorAxis.x * -Math.sin(0.3) + e.majorAxis.y * Math.cos(0.3)), 1, 1e-7), JSON.stringify(e.majorAxis));
      assert.ok(near(Math.abs(e.normal.z), 1, 1e-9));
    }
    const top = rims.find((rim) => near(rim.descriptor.ellipse.center.z, 4, 1e-7));
    const sketch = { id: "s", plane: "front", offset: 4, points: [], entities: [], constraints: [] };
    const { entities } = appendConvertedEdges(sketch, [top], { makeId: ids() });
    assert.equal(entities[0].type, "ellipse");
    assert.ok(near(entities[0].rx, 10, 1e-7) && near(entities[0].ry, 5, 1e-7));
    assert.equal(solveWith(sketch, [top]).status, "fully-constrained");
  } finally { disposeBrep(brep); }
});

test("a converted backsplash chain follows the countertop through a real rebuild", async () => {
  const sketch = { id: "s", plane: "top", offset: 3.4, points: [], entities: [], constraints: [] };
  const edge = (semantic, a, b) => ({ ...lineEdge("body:edge:" + semantic, a, b), descriptor: { ...lineEdge("x", a, b).descriptor, semantic } });
  appendConvertedEdges(sketch, [
    edge("x:top:back", { x: 0, y: 3.4, z: 0 }, { x: 60, y: 3.4, z: 0 }),
    edge("z:left:top", { x: 0, y: 3.4, z: 0 }, { x: 0, y: 3.4, z: 58 }),
  ], { makeId: ids(), referenceOf: (e) => ({ type: "topology-reference", kind: "edge", persistentId: e.persistentId, ownerFeatureId: "body", semantic: e.descriptor.semantic }) });
  const definition = {
    references: [{ id: "plane:top" }],
    sketches: [sketch],
    features: [{ id: "body", type: "box", name: "Countertop", inputs: [], references: {}, params: { x: 0, y: 0, z: 0, w: 60, h: 3.4, d: 58 } }],
  };
  addFeature(definition, { id: "sk", type: "sketch", params: { sketchId: "s" } });
  addFeature(definition, { id: "backsplash", type: "extrude", params: {
    sketchId: "s", axis: "y", from: 3.4, to: 12, thinFeature: true, thickness: 0.4,
    thinMode: "mid-plane", profileEntityIds: sketch.entities.map(e => e.id),
  } });
  const span = (s) => ({ x: Math.max(...s.points.map((p) => p.x)), y: Math.max(...s.points.map((p) => p.y)) });
  const first = await regenerateFeatures(definition);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    assert.ok(first.results.get("backsplash")?.shape);
    const s = first.boundaryUpdates.get("s").sketch;
    assert.deepEqual(span(s), { x: 60, y: 58 });
    assert.equal(solveSketch(s).status, "fully-constrained");
  } finally { releaseRegeneration(first); }
  definition.features[0].params.w = 72;
  definition.features[0].params.d = 61;
  definition.sketches[0] = JSON.parse(JSON.stringify(definition.sketches[0]));
  const second = await regenerateFeatures(definition);
  try {
    assert.equal(second.ok, true, JSON.stringify(second.issues));
    const s = second.boundaryUpdates.get("s").sketch;
    const got = span(s);
    assert.ok(near(got.x, 72) && near(got.y, 61), JSON.stringify(got));
  } finally { releaseRegeneration(second); }
});

test("an exact extrusion keeps a converted corner when the kernel reverses its sorted endpoints", async () => {
  const section = topSketch(0);
  section.id = "outline";
  section.points = [[0, 0], [8, 0], [8, 5], [0, 5]].map(([x, y], i) => ({ id: "p" + i, x, y }));
  section.entities = section.points.map((p, i) => ({ id: "l" + i, type: "line", a: p.id, b: section.points[(i + 1) % 4].id }));
  const def = { sketches: [section], features: [] };
  addFeature(def, { id: "slab", type: "extrude", params: { axis: "y", from: 0, to: 3.4,
    sketchId: section.id, profileEntityIds: section.entities.map(e => e.id) } });
  const sketch = topSketch(), cold = await regenerateFeatures(def);
  try {
    assert.equal(cold.ok, true, JSON.stringify(cold.issues));
    const edges = cold.results.get("slab").topology;
    const picks = ["l0", "l3"].map(id => edges.find(e => e.persistentId === "slab:edge:profile:" + id + ":end"));
    assert.ok(picks.every(Boolean));
    appendConvertedEdges(sketch, picks, { makeId: ids() });
  } finally { releaseRegeneration(cold); }
  def.sketches.push(sketch);
  addFeature(def, { id: "converted", type: "sketch", params: { sketchId: sketch.id } });
  for (const p of section.points) { p.x = 16 - p.x; p.y = 12 - p.y; }
  const warm = await regenerateFeatures(JSON.parse(JSON.stringify(def)));
  try {
    assert.equal(warm.ok, true, JSON.stringify(warm.issues));
    const updated = warm.boundaryUpdates.get(sketch.id).sketch;
    assert.equal(solveSketch(updated).status, "fully-constrained");
    const joint = pointOf(updated, updated.entities[0].a);
    assert.ok(near(joint.x, 16) && near(joint.y, 12), JSON.stringify(joint));
    const ends = warm.results.get("slab").topology.find(e => e.persistentId === "slab:edge:profile:l0:end").descriptor.endpoints;
    assert.ok(near(ends.at(-1).x, joint.x));
  } finally { releaseRegeneration(warm); }
});

test("an unversioned elliptical loft retains sampled top edges referenced by a later sketch", async () => {
  const sections = [0, 7].map((offset, i) => ({
    id: "section" + i, plane: "top", offset, points: [{ id: "c", x: 0, y: 0 }],
    entities: [{ id: "oval", type: "ellipse", c: "c", rx: 3, ry: 2, rot: 0 }], constraints: [],
  }));
  const def = { sketches: sections, features: [], references: [] };
  const sources = { kind: "loft", sections: sections.map(sketch => ({ sketchId: sketch.id, entityIds: ["oval"] })) };
  addFeature(def, { id: "loft", type: "loft", references: { sketches: sections.map(s => s.id) },
    params: { solid: true, ruled: true, sketchSources: sources } });
  // A transitional save that already contains exact ellipse wires keeps its format.
  const exact = structuredClone(def);
  exact.features[0].params.sectionSegments = sections.map(() => [{ type: "ellipse" }]);
  const compiled = compileKernelFeatureTree(exact);
  assert.equal(compiled.features.find(f => f.id === "loft").params.sketchSources.exactEllipseSections, true);
  assert.equal(compileKernelFeatureTree(def).features.find(f => f.id === "loft").params.sketchSources.exactEllipseSections, undefined);
  const downstream = topSketch(7), first = await regenerateFeatures(def);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    const rim = first.results.get("loft").topology.find(item => item.descriptor.curve === "line"
      && item.descriptor.endpoints.every(p => near(p.y, 7)));
    assert.ok(rim, "old sampled sections have individually named top chords");
    appendConvertedEdges(downstream, [rim], { makeId: ids() });
  } finally { releaseRegeneration(first); }
  def.sketches.push(downstream);
  addFeature(def, { id: "consumer", type: "sketch", params: { sketchId: downstream.id } });
  const reopened = await regenerateFeatures(JSON.parse(JSON.stringify(def)));
  try {
    assert.equal(reopened.ok, true, JSON.stringify(reopened.issues));
    const result = reopened.boundaryUpdates.get(downstream.id).sketch;
    assert.equal(solveSketch(result).status, "fully-constrained");
  } finally { releaseRegeneration(reopened); }
});

test("direct native hydration repairs legacy ellipse descriptors under their transported names", async () => {
  const points = Array.from({length: 32}, (_, i) => ({u: 4*Math.cos(i*Math.PI/16), v: 2*Math.sin(i*Math.PI/16)}));
  const body = await makeBrepExtrusion({axis: "z", from: 0, to: 3, points,
    segments: [{type: "ellipse", center: {u: 0, v: 0}, rx: 4, ry: 2, rot: 0.3}]});
  let restored;
  try {
    const expected = structuredClone(extractBrepTopology(body).topology);
    for (const item of expected) {
      item.persistentId = "saved-" + item.kind + "-" + item.transportOrdinal;
      if (item.descriptor.curve === "ellipse") delete item.descriptor.ellipse;
    }
    restored = await deserializeBrep(await serializeBrep(body));
    hydrateSerializedBrepTopology(restored, expected);
    assert.deepEqual(restored.topology.map(e => e.persistentId), expected.map(e => e.persistentId));
    const rim = restored.topology.find(e => e.descriptor.curve === "ellipse");
    const geometry = restored.subshapes.get(rim.persistentId).descriptor.ellipse;
    assert.ok(geometry && near(geometry.majorRadius, 4) && near(geometry.minorRadius, 2));
    assert.deepEqual(geometry, rim.descriptor.ellipse);
    assert.ok(expected.every(item => !item.descriptor.ellipse), "the caller's cache record is untouched");
    const sketch = { ...topSketch(), plane: "front", offset: geometry.center.z };
    assert.equal(appendConvertedEdges(sketch, [rim], {makeId: ids()}).entities[0]?.type, "ellipse");
    assert.equal(solveWith(sketch, [rim]).status, "fully-constrained");
    const mismatched = structuredClone(expected);
    const line = mismatched.find(e => e.descriptor.curve === "line");
    line.descriptor.curve = "ellipse";
    const before = restored.subshapes;
    assert.throws(() => hydrateSerializedBrepTopology(restored, mismatched), /ellipse does not match its native edge/);
    assert.equal(restored.subshapes, before, "failed hydration preserves the body's prior handles");
  } finally { if (restored) disposeBrep(restored); disposeBrep(body); }
});

test("direct rebuild of a reopened transitional loft preserves its downstream converted rim", async () => {
  const sections = [0, 7].map((offset, i) => ({
    id: "oval-" + i, plane: "top", offset, points: [{id: "center", x: 0, y: 0}],
    entities: [{id: "oval", type: "ellipse", c: "center", rx: 4+i, ry: 2, rot: 0.3}], constraints: [],
  }));
  const def = {sketches: sections.slice(), features: []};
  const sources = loftSourceRecord(sections, [["oval"], ["oval"]]);
  const profiles = resolveSketchSources(def, sources, resolveProfilePoints);
  addFeature(def, {id: "loft", type: "loft", references: {sketches: sections.map(s => s.id)},
    params: {...profiles, solid: true, ruled: true, sketchSources: sources}});
  const first = await regenerateFeatures(def), sketch = topSketch(7);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    const rim = first.results.get("loft").topology.find(e => e.descriptor.ellipse && near(e.descriptor.ellipse.center.y, 7));
    assert.equal(appendConvertedEdges(sketch, [rim], {makeId: ids()}).entities[0]?.type, "ellipse");
  } finally { releaseRegeneration(first); }
  def.sketches.push(sketch);
  addFeature(def, {id: "consumer", type: "sketch", params: {sketchId: sketch.id}});
  const saved = JSON.parse(JSON.stringify(def));
  delete saved.features[0].params.sketchSources.exactEllipseSections;
  saved.sketches[1].entities[0].rx = 6;
  const reopened = await regenerateFeatures(saved);
  try {
    assert.equal(reopened.ok, true, JSON.stringify(reopened.issues));
    const updated = reopened.boundaryUpdates.get(sketch.id).sketch;
    assert.equal(solveSketch(updated).status, "fully-constrained");
    assert.ok(near(updated.entities[0].rx, 6), "the rim follows the edited sketch, not the persisted wire dimensions");
  } finally { releaseRegeneration(reopened); }
});

test("persisted downstream unions distinguish sampled and transitional exact loft rims", async () => {
  const sketches = [0, 7].map((offset, i) => ({
    id: "oval-" + i, plane: "top", offset, points: [{id: "center", x: 0, y: 0}],
    entities: [{id: "oval", type: "ellipse", c: "center", rx: 4+i, ry: 2, rot: 0.3}], constraints: [],
  }));
  const exact = {sketches, features: []};
  const sources = loftSourceRecord(sketches, [["oval"], ["oval"]]);
  const profiles = resolveSketchSources(exact, sources, resolveProfilePoints);
  delete sources.exactEllipseSections;
  addFeature(exact, {id: "loft", type: "loft", params: {...profiles, sketchSources: sources, solid: true, ruled: true}});
  addFeature(exact, {id: "box", type: "box", params: {x: 0, y: 1, z: 0, w: 1, h: 1, d: 1}});
  addFeature(exact, {id: "joined", type: "union", inputs: ["loft", "box"]});
  const sampled = structuredClone(exact);
  delete sampled.features[0].params.sectionSegments;

  const entries = new Map(), bodyStore = {get: key => entries.get(key), put: (key, p) => entries.set(key, structuredClone(p))};
  async function rims(document, expectedCacheHit, expectedEllipses) {
    const stages = [];
    const {topology} = await createCadWorkerExecutor({bodyStore})(
      {kind: "topology", document, head: "joined"}, p => stages.push(p.stage));
    const edges = topology.filter(item => item.kind === "edge");
    assert.ok(edges.length > 0);
    assert.equal(edges.filter(item => item.descriptor.curve === "ellipse").length, expectedEllipses);
    assert.equal(stages.includes("cache"), expectedCacheHit);
  }
  await rims(sampled, false, 0);
  await rims(exact, false, 2);
  await rims(sampled, true, 0);
  exact.features[0].params.sketchSources.exactEllipseSections = true;
  await rims(exact, true, 2); // Explicit and inferred exact formats share a cached union.
});

test("a persisted native cache entry regains ellipse axes without changing its subshape names", async () => {
  const doc = { sketches: [{ id: "oval", plane: "top", points: [{id: "c", x: 0, y: 0}],
    entities: [{id: "e", type: "ellipse", c: "c", rx: 4, ry: 2, rot: 0.3}], constraints: [] }], features: [] };
  addFeature(doc, { id: "body", type: "extrude", params: { sketchId: "oval", profileEntityIds: ["e"], axis: "y", from: 0, to: 3.4 } });
  addFeature(doc, { id: "box", type: "box", params: { x: 0, y: 1, z: 0, w: 1, h: 1, d: 1 } });
  addFeature(doc, { id: "joined", type: "union", inputs: ["body", "box"] });
  const entries = new Map(), bodyStore = { get: key => entries.get(key), put: (key, p) => entries.set(key, structuredClone(p)) };
  const request = { kind: "topology", document: doc, head: "joined" };
  const cold = await createCadWorkerExecutor({ bodyStore })(request);
  assert.equal(entries.size, 1);
  for (const payload of entries.values()) for (const item of payload.topology) delete item.descriptor.ellipse;
  const progress = [];
  const warm = await createCadWorkerExecutor({ bodyStore })(request, p => progress.push(p.stage));
  assert.ok(progress.includes("cache"), "the restored body supplied the geometry");
  assert.deepEqual(warm.topology.map(item => item.persistentId), cold.topology.map(item => item.persistentId));
  const rim = warm.topology.find(item => item.descriptor.curve === "ellipse");
  const sketch = topSketch();
  assert.equal(appendConvertedEdges(sketch, [rim], { makeId: ids() }).entities[0]?.type, "ellipse");
  assert.ok([...entries.values()][0].topology.find(item => item.persistentId === rim.persistentId).descriptor.ellipse);
});

test("a saved converted sink rim drives an elliptical loft section after the cut is resized", async () => {
  const source = { id: "opening", plane: "top", points: [{ id: "center", x: 30, y: 29 }],
    entities: [{ id: "oval", type: "ellipse", c: "center", rx: 12, ry: 7, rot: 0.3 }], constraints: [] };
  const def = { sketches: [source], features: [], references: [{ id: "plane:top" }] };
  addFeature(def, { id: "slab", type: "box", params: { x: 0, y: 0, z: 0, w: 60, h: 3.4, d: 58 } });
  addFeature(def, { id: "sink:tool", type: "extrude", params: {
    axis: "y", from: 3.4, to: -1, sketchId: source.id, profileEntityIds: ["oval"],
  } });
  addFeature(def, { id: "sink", type: "subtract", inputs: ["slab", "sink:tool"], params: {} });
  const first = await regenerateFeatures(def);
  const sketch = topSketch(), makeId = ids();
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    const rim = first.results.get("sink").topology.find(e => e.descriptor.curve === "ellipse" && near(e.descriptor.ellipse.center.y, 3.4));
    assert.ok(rim, "top rim of the elliptical cut");
    const result = appendConvertedEdges(sketch, [rim], { makeId,
      referenceOf: e => createTopologyReference(e.ownerFeatureId, e.kind, e.persistentId, e.descriptor) });
    assert.equal(result.entities.length, 1);
  } finally { releaseRegeneration(first); }
  const bottom = structuredClone(source);
  bottom.id = "basin-bottom";
  bottom.offset = -8;
  Object.assign(bottom.entities[0], { rx: 6, ry: 4 });
  def.sketches.push(sketch, bottom);
  addFeature(def, { id: "basin", type: "loft", references: { sketches: [sketch.id, bottom.id] }, params: {
    solid: true, ruled: true, sketchSources: loftSourceRecord([sketch, bottom], [[sketch.entities[0].id], ["oval"]]),
  } });
  const saved = parseModelerDraft(serializeModelerDraft({ docType: "part", def })).def;
  const ellipse = saved.sketches[0].entities[0];
  Object.assign(ellipse, { rx: 15, ry: 8, rot: 0.65 });
  const rebuilt = await regenerateFeatures(saved);
  try {
    assert.equal(rebuilt.ok, true, JSON.stringify(rebuilt.issues));
    const updated = rebuilt.boundaryUpdates.get(sketch.id).sketch;
    assert.equal(solveSketch(updated).degreesOfFreedom, 0);
    const section = rebuilt.results.get("basin").topology.find(e => e.descriptor.curve === "ellipse" && near(e.descriptor.ellipse.center.y, 3.4));
    assert.ok(section && near(section.descriptor.ellipse.majorRadius, 15) && near(section.descriptor.ellipse.minorRadius, 8));
    assert.ok(near(Math.sin(updated.entities[0].rot - 0.65), 0));
  } finally { releaseRegeneration(rebuilt); }
});
