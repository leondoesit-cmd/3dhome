import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { solveSketch } from "../js/sketch_solver.js";
import {
  bindModelEdgeTargets, hitProjectedModelEdge, hitProjectedModelVertex, hitScreenModelEdge, hitScreenModelVertex, modelEdgeAnchor, modelEdgePierce, vertexEdgeBinding,
} from "../js/sketch_intersection.js";
import { resolveSketchRelationSources } from "../js/core/sketch_relation_sources.js";
import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";

const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

/* A straight model edge, shaped like the kernel's topology entry. */
const edgeEntry = (id, a, b) => ({
  kind: "edge", persistentId: id, ownerFeatureId: "body",
  descriptor: { curve: "line", endpoints: [a, b], measure: Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) },
});
const ref = (id) => ({ type: "topology-reference", kind: "edge", persistentId: id, ownerFeatureId: "body" });

/* Sketch on the Front plane: the sketch's x, y are the world x, y. */
const frontSketch = (constraints, points = []) => ({ id: "s", plane: "front", offset: 0, points, entities: [], constraints });

/* --- the pure relation: a place on a model edge, re-read on every solve --- */

test("a vertex, an end and a midpoint of a model edge pin a sketch point to that place", () => {
  const edges = new Map([["e", edgeEntry("e", { x: 10, y: 0, z: 4 }, { x: 10, y: 6, z: 4 })]]);
  const sketch = frontSketch([
    { id: "c1", type: "onModelEdge", point: "a", edge: ref("e"), at: "start" },
    { id: "c2", type: "onModelEdge", point: "b", edge: ref("e"), at: "end" },
    { id: "c3", type: "onModelEdge", point: "m", edge: ref("e"), at: "mid" },
  ], [{ id: "a", x: 1, y: 1 }, { id: "b", x: -3, y: 8 }, { id: "m", x: 0, y: 0 }]);
  bindModelEdgeTargets(sketch, (r) => edges.get(r.persistentId));
  assert.equal(solveSketch(sketch).converged, true);
  const [a, b, m] = sketch.points;
  assert.ok(near(a.x, 10) && near(a.y, 0), "start: " + JSON.stringify(a));
  assert.ok(near(b.x, 10) && near(b.y, 6), "end: " + JSON.stringify(b));
  assert.ok(near(m.x, 10) && near(m.y, 3), "mid: " + JSON.stringify(m));
  // The body changes upstream: the same relations follow, nothing was baked.
  edges.set("e", edgeEntry("e", { x: 14, y: 0, z: 4 }, { x: 14, y: 9, z: 4 }));
  bindModelEdgeTargets(sketch, (r) => edges.get(r.persistentId));
  assert.equal(solveSketch(sketch).converged, true);
  assert.ok(near(a.x, 14) && near(a.y, 0) && near(b.x, 14) && near(b.y, 9) && near(m.y, 4.5), JSON.stringify(sketch.points));
});

test("an edge square to the sketch plane pins the point where it pierces the plane", () => {
  const edge = edgeEntry("post", { x: 10, y: 6, z: 0 }, { x: 10, y: 6, z: 4 });
  const sketch = frontSketch([{ id: "on", type: "onModelEdge", point: "p", edge: ref("post") }], [{ id: "p", x: 2, y: 2 }]);
  assert.deepEqual(modelEdgePierce(sketch, edge), { x: 10, y: 6 });
  bindModelEdgeTargets(sketch, () => edge);
  assert.equal(solveSketch(sketch).converged, true);
  assert.ok(near(sketch.points[0].x, 10) && near(sketch.points[0].y, 6), JSON.stringify(sketch.points[0]));
  // an edge that lies along the plane is a line, not a pierce, so it does not use the pierce point
  assert.equal(modelEdgePierce(sketch, edgeEntry("flat", { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 })), null);
});

test("a picked corner is found again as the start or end of the edge that ends there", () => {
  const edges = [
    edgeEntry("u", { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }),
    edgeEntry("v", { x: 10, y: 0, z: 0 }, { x: 10, y: 6, z: 0 }),
  ];
  const sketch = frontSketch([]);
  const corner = hitProjectedModelVertex(sketch, { x: 10.05, y: 0.04 }, edges, 0.5);
  assert.ok(corner && corner.kind === "vertex", "a click near the corner picks the corner");
  assert.ok(near(corner.descriptor.point.x, 10) && near(corner.descriptor.point.y, 0));
  const bound = vertexEdgeBinding(corner, edges);
  assert.equal(bound.edge.persistentId, "u", "the first edge that ends at the corner");
  assert.equal(bound.at, "end");
  assert.equal(vertexEdgeBinding({ descriptor: { point: { x: 99, y: 0, z: 0 } } }, edges), null, "a corner no edge ends at has no binding");
  assert.equal(hitProjectedModelVertex(sketch, { x: 5, y: 0 }, edges, 0.5), null, "mid-edge is not a corner");
  assert.equal(hitProjectedModelEdge(sketch, { x: 5, y: 0.1 }, edges, 0.5).persistentId, "u", "but it is on the edge");
  assert.ok(near(modelEdgeAnchor(sketch, edges[1], "mid").y, 3));
});

test("a missing model edge is reported, never baked into coordinates", () => {
  const edges = new Map([["e", edgeEntry("e", { x: 10, y: 0, z: 4 }, { x: 10, y: 6, z: 4 })]]);
  const document = { sketches: [frontSketch([{ id: "c", type: "onModelEdge", point: "a", edge: ref("e"), at: "start" }], [{ id: "a", x: 1, y: 1 }])] };
  const [updated] = resolveSketchRelationSources(document, ["s"], (r) => edges.get(r.persistentId));
  assert.ok(near(updated.points[0].x, 10) && updated.constraints[0].px === 10, "bound while the edge exists");
  const before = JSON.stringify(document.sketches[0]);
  edges.delete("e");
  assert.throws(() => resolveSketchRelationSources(document, ["s"], (r) => edges.get(r.persistentId)), /unavailable/);
  assert.equal(JSON.stringify(document.sketches[0]), before, "the failed rebuild leaves the sketch as it was");
  // an edge that is not usable at all fails with a reason, too
  const pure = frontSketch([{ id: "c", type: "onModelEdge", point: "a", edge: ref("odd") }], [{ id: "a", x: 0, y: 0 }]);
  const inPlaneCircle = { kind: "edge", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radius: 2 } };
  assert.throws(() => bindModelEdgeTargets(pure, () => inPlaneCircle), /does not show as a line/);
  const noEnds = frontSketch([{ id: "c", type: "onModelEdge", point: "a", edge: ref("odd"), at: "mid" }], [{ id: "a", x: 0, y: 0 }]);
  assert.throws(() => bindModelEdgeTargets(noEnds, () => inPlaneCircle), /end points/);
});

/* --- the whole rebuild: an upstream parameter moves the sketch --- */

const definitionFor = (w, h, constraints, points) => {
  const definition = {
    references: [{ id: "plane:front" }],
    sketches: [{ id: "s", plane: "front", offset: 0, points, entities: [{ id: "L", type: "line", a: "a", b: "b" }], constraints }],
    features: [{ id: "body", type: "box", name: "Box", inputs: [], references: {}, params: { x: 0, y: 0, z: 0, w, h, d: 4 } }],
  };
  addFeature(definition, { id: "sk", type: "sketch", params: { sketchId: "s" } });
  return definition;
};

const edgeRef = (semantic) => ({ type: "topology-reference", kind: "edge", persistentId: "body:edge:" + semantic, ownerFeatureId: "body", semantic });

test("a converted model edge and a corner pin follow the box when its width and height change", async () => {
  const constraints = [
    // Convert Entities of the box's front-right edge: both ends pinned to the edge.
    { id: "c1", type: "onModelEdge", point: "a", edge: edgeRef("y:right:front"), at: "start" },
    { id: "c2", type: "onModelEdge", point: "b", edge: edgeRef("y:right:front"), at: "end" },
    // A free point on the same edge, Midpoint of the top edge, and the post that pierces the plane.
    { id: "c3", type: "onModelEdge", point: "m", edge: edgeRef("x:top:front"), at: "mid" },
    { id: "c4", type: "onModelEdge", point: "q", edge: edgeRef("z:right:top") },
  ];
  const points = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 1 }, { id: "m", x: 0, y: 0 }, { id: "q", x: 0, y: 0 }];
  const definition = definitionFor(10, 6, constraints, points);
  const first = await regenerateFeatures(definition);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    const s = first.boundaryUpdates.get("s").sketch, at = (id) => s.points.find((p) => p.id === id);
    assert.ok(near(at("a").x, 10) && near(at("a").y, 0), JSON.stringify(at("a")));
    assert.ok(near(at("b").x, 10) && near(at("b").y, 6), JSON.stringify(at("b")));
    assert.ok(near(at("m").x, 5) && near(at("m").y, 6), "midpoint of the top edge: " + JSON.stringify(at("m")));
    assert.ok(near(at("q").x, 10) && near(at("q").y, 6), "pierce of the post: " + JSON.stringify(at("q")));
  } finally { releaseRegeneration(first); }
  // the upstream parameters change; the sketch is rebuilt from the same stored references
  definition.features[0].params.w = 14;
  definition.features[0].params.h = 9;
  const second = await regenerateFeatures(definition);
  try {
    assert.equal(second.ok, true, JSON.stringify(second.issues));
    const s = second.boundaryUpdates.get("s").sketch, at = (id) => s.points.find((p) => p.id === id);
    assert.ok(near(at("a").x, 14) && near(at("a").y, 0), JSON.stringify(at("a")));
    assert.ok(near(at("b").x, 14) && near(at("b").y, 9), JSON.stringify(at("b")));
    assert.ok(near(at("m").x, 7) && near(at("m").y, 9), JSON.stringify(at("m")));
    assert.ok(near(at("q").x, 14) && near(at("q").y, 9), JSON.stringify(at("q")));
  } finally { releaseRegeneration(second); }
});

test("a rebuild whose model edge is gone fails with a message and does not keep old coordinates", async () => {
  const constraints = [{ id: "c1", type: "onModelEdge", point: "a", edge: edgeRef("y:right:nowhere"), at: "start" }];
  const definition = definitionFor(10, 6, constraints, [{ id: "a", x: 3, y: 3 }, { id: "b", x: 4, y: 4 }]);
  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, false, "the rebuild is refused");
    assert.match(JSON.stringify(run.issues), /coincident model edge is unavailable|could not follow/i);
    assert.ok(!run.boundaryUpdates.get("s"), "no sketch update was baked");
  } finally { releaseRegeneration(run); }
});

/* --- the editor wiring (no browser here; the link gate covers the imports) --- */

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");

test("the sketcher picks corners and edges, and Coincident, Midpoint and Convert take them", () => {
  assert.match(modeler, /var modelVertex = pickScreen \? hitScreenModelVertex\([\s\S]{0,260}hitProjectedModelVertex\(ensureSketch\(E\.def\)[\s\S]{0,200}var modelEdge = modelVertex \|\| \(pickScreen \? hitScreenModelEdge\([\s\S]{0,200}hitProjectedModelEdge\(/, "a corner beats its edge when picking, in screen space over a camera and on the plane otherwise");
  assert.match(modeler, /case "coincident": return points\.length === 2 \|\| \(points\.length === 1 && !ents\.length && \(selectedModelEdges\(\)\.length === 1 \|\| \(selectedModelVertices\(\)\.length === 1/, "Coincident fits a point and a model corner");
  assert.match(modeler, /case "midpoint": return points\.length === 1 && \(lines\.length === 1 \|\| \(!ents\.length && selectedModelEdges\(\)\.length === 1\)\)/, "Midpoint fits a point and a model edge");
  assert.match(modeler, /edge: midEdge\.edge, at: "mid"/, "and records the middle of the edge");
  assert.match(modeler, /type: "onModelEdge", point: a, edge: ref, at: "start"[\s\S]{0,140}type: "onModelEdge", point: b, edge: cloneData\(ref\), at: "end"/, "Convert Entities pins both ends to the edge");
  assert.match(modeler, /selectedModelEdges\(\)\.some\(function\(edge\)\{return edge\.descriptor\?\.curve==="line";\}\)\)\{convertModelEdgesToSketch\(\);return;\}/, "the Convert command takes straight model edges");
});

/* --- picking only what is really a line --- */

test("only a straight edge or a circle seen edge-on is a line to pick or relate to; a curve's chord is not", () => {
  const sketch = { id: "right", plane: "side", offset: 0, points: [], entities: [], constraints: [] };
  const bspline = { kind: "edge", persistentId: "loft-rail", ownerFeatureId: "body", descriptor: { curve: "bspline", endpoints: [{ x: 3.7, y: 2.8, z: -3.3 }, { x: 4.1, y: 3.4, z: 0 }], measure: 3.4 } };
  assert.equal(hitProjectedModelEdge(sketch, { x: -1.6, y: 3.1 }, [bspline], 0.3), null, "the chord of a B-spline steals no pick");
  assert.throws(() => bindModelEdgeTargets({ ...sketch, constraints: [{ id: "c", type: "onModelEdge", point: "p", edge: ref("loft-rail") }] }, () => bspline), /does not show as a line/, "and cannot be related to as a line");
});

test("a bspline end, a circle rim seen edge-on and an arc seen edge-on", () => {
  const sketch = { id: "right", plane: "side", offset: 0, points: [], entities: [], constraints: [] };
  const bspline = { kind: "edge", persistentId: "rail", ownerFeatureId: "body", descriptor: { curve: "bspline", endpoints: [{ x: 3.7, y: 2.8, z: -3.3 }, { x: 4.1, y: 3.4, z: 0 }] } };
  // its end points are still real places a Coincident can pin
  assert.deepEqual(modelEdgeAnchor(sketch, bspline, "start"), { x: -3.3, y: 2.8 });
  // a complete circle whose axis lies along the sketch's Z: Boss-Stop's rim, a vertical diameter at z = 0
  const rim = { kind: "edge", persistentId: "rim", ownerFeatureId: "body", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radius: 6.5, endpoints: [{ x: 6.5, y: 0, z: 0 }, { x: 6.5, y: 0, z: 0 }] } };
  assert.equal(hitProjectedModelEdge(sketch, { x: 0.05, y: 6.3 }, [rim], 0.2).persistentId, "rim");
  // the same circle lying in the sketch plane is not a line
  const inPlane = { ...rim, descriptor: { ...rim.descriptor, axis: { x: 1, y: 0, z: 0 }, origin: { x: 0, y: 0, z: 0 }, endpoints: [{ x: 0, y: 6.5, z: 0 }, { x: 0, y: 6.5, z: 0 }] } };
  assert.equal(hitProjectedModelEdge(sketch, { x: 0, y: 3 }, [inPlane], 0.2), null);
  // an arc seen edge-on is the span of its ends, not the whole diameter
  const arc = { kind: "edge", persistentId: "arc", ownerFeatureId: "body", descriptor: { curve: "circle", origin: { x: 0, y: 0, z: -2 }, axis: { x: 0, y: 0, z: 1 }, radius: 3, endpoints: [{ x: 3, y: 0, z: -2 }, { x: 0, y: 3, z: -2 }] } };
  assert.equal(hitProjectedModelEdge(sketch, { x: -2, y: 1.5 }, [arc], 0.1).persistentId, "arc");
  assert.equal(hitProjectedModelEdge(sketch, { x: -2, y: -1.5 }, [arc], 0.1), null, "the lower half is not part of the arc");
});

test("a fresh sketch pick or a miss drops model edges and corners picked earlier", () => {
  assert.match(modeler, /function dropSketchModelPicks\(\) \{[\s\S]{0,260}E\.topologySelection = \[\];/, "the helper clears stale model picks in a sketch");
  assert.match(modeler, /function selectSketch\(obj, additive\) \{\s*E\.sselAuto = false;\s*if \(!additive\) dropSketchModelPicks\(\);/, "a non-additive sketch pick drops them");
  assert.match(modeler, /E\.sel = null;\s*dropSketchModelPicks\(\);/, "a miss drops them");
});

test("a perspective sketch canvas is picked where the model is drawn, not where its plane projection lies", () => {
  /* A camera 50 cm out on +X looking down -X: a point at x = 6.5 is nearer and drawn 1.15x larger about the centre. */
  const toScreen = (w) => { const k = 50 / (50 - w.x); return { x: 400 - w.z * 30 * k, y: 300 - w.y * 30 * k }; };
  const corner = edgeEntry("top-back", { x: 6.5, y: 4, z: -14 }, { x: -6.5, y: 4, z: -14 });
  const rail = edgeEntry("rail", { x: 6.5, y: 4, z: -14 }, { x: 6.5, y: 4.2, z: -3 });
  const seen = toScreen({ x: 6.5, y: 4, z: -14 });
  assert.ok(Math.abs(seen.x - (400 + 14 * 30)) > 40, "the near corner is drawn well off its plane position");
  const vertex = hitScreenModelVertex({ x: seen.x + 3, y: seen.y - 2 }, [corner, rail], 8, toScreen);
  assert.ok(vertex && vertex.kind === "vertex" && near(vertex.descriptor.point.x, 6.5) && near(vertex.descriptor.point.z, -14), "clicking the drawn corner picks it");
  assert.equal(hitScreenModelVertex({ x: 400 + 14 * 30, y: 300 - 4 * 30 }, [corner, rail], 8, toScreen), null, "the plane position of the corner picks nothing");
  const onRail = toScreen({ x: 6.5, y: 4.1, z: -8 });
  assert.equal(hitScreenModelEdge({ x: onRail.x, y: onRail.y + 2 }, [corner, rail], 8, toScreen, (d) => d.endpoints).persistentId, "rail");
  const bspline = { kind: "edge", persistentId: "b", ownerFeatureId: "body", descriptor: { curve: "bspline", endpoints: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: -5 }] } };
  assert.equal(hitScreenModelEdge(toScreen({ x: 0, y: 2.5, z: -2.5 }), [bspline], 8, toScreen, (d) => d.endpoints), null, "a curve's chord is not pickable");
  assert.match(modeler, /var modelVertex = pickScreen \? hitScreenModelVertex\(downPoint/, "the sketcher picks in screen space when the sketch is drawn through a camera");
});
