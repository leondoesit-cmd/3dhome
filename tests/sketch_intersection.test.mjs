import test from "node:test";
import assert from "node:assert/strict";
import { solveSketch } from "../js/sketch_solver.js";
import {
  bindIntersectionTargets, intersectionOfModelEdges, projectWorldToSketch,
} from "../js/sketch_intersection.js";
import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { createTopologyReference } from "../js/core/topology.js";
import { buildDependencyGraph } from "../js/core/dependency_graph.js";

test("an intersection relation keeps a point on two sketch lines after one line moves", () => {
  const sketch = {
    points: [
      { id: "a", x: 0, y: 0, fixed: true }, { id: "b", x: 10, y: 0, fixed: true },
      { id: "c", x: 4, y: -5, fixed: true }, { id: "d", x: 4, y: 5, fixed: true },
      { id: "p", x: 1, y: 2 },
    ],
    entities: [
      { id: "h", type: "line", a: "a", b: "b" },
      { id: "v", type: "line", a: "c", b: "d" },
    ],
    constraints: [{ id: "i", type: "intersection", point: "p", a: "h", b: "v" }],
  };
  assert.equal(solveSketch(sketch).converged, true);
  const p = sketch.points.find((point) => point.id === "p");
  assert.ok(Math.abs(p.x - 4) < 1e-6);
  assert.ok(Math.abs(p.y) < 1e-6);
  sketch.points.find((point) => point.id === "c").x = 7;
  sketch.points.find((point) => point.id === "d").x = 7;
  assert.equal(solveSketch(sketch).converged, true);
  assert.ok(Math.abs(p.x - 7) < 1e-6);
  assert.ok(Math.abs(p.y) < 1e-6);
});

test("a HandlePath intersection follows two housing edges when they move", () => {
  const sketch = {
    plane: "side", offset: 0,
    points: [{ id: "p", x: 0, y: 0 }],
    entities: [],
    constraints: [{
      id: "i", type: "intersection", point: "p",
      edgeA: { persistentId: "vert", ownerFeatureId: "housing" },
      edgeB: { persistentId: "horiz", ownerFeatureId: "housing" },
    }],
  };
  const edges = new Map([
    ["vert", { kind: "edge", persistentId: "vert", descriptor: { curve: "line", endpoints: [{ x: 5, y: 0, z: 10 }, { x: 5, y: 8, z: 10 }] } }],
    ["horiz", { kind: "edge", persistentId: "horiz", descriptor: { curve: "line", endpoints: [{ x: 0, y: 8, z: 10 }, { x: 5, y: 8, z: 10 }] } }],
  ]);
  bindIntersectionTargets(sketch, (ref) => edges.get(ref.persistentId));
  const corner = intersectionOfModelEdges(sketch, edges.get("vert"), edges.get("horiz"));
  assert.ok(Math.abs(corner.x - 10) < 1e-6);
  assert.ok(Math.abs(corner.y - 8) < 1e-6);
  assert.equal(solveSketch(sketch).converged, true);
  const p = sketch.points[0];
  assert.ok(Math.abs(p.x - 10) < 1e-6, JSON.stringify(p));
  assert.ok(Math.abs(p.y - 8) < 1e-6);
  edges.set("horiz", { kind: "edge", persistentId: "horiz", descriptor: { curve: "line", endpoints: [{ x: 0, y: 12, z: 10 }, { x: 5, y: 12, z: 10 }] } });
  edges.set("vert", { kind: "edge", persistentId: "vert", descriptor: { curve: "line", endpoints: [{ x: 5, y: 0, z: 10 }, { x: 5, y: 12, z: 10 }] } });
  bindIntersectionTargets(sketch, (ref) => edges.get(ref.persistentId));
  assert.equal(solveSketch(sketch).converged, true);
  assert.ok(Math.abs(p.x - 10) < 1e-6);
  assert.ok(Math.abs(p.y - 12) < 1e-6);
});

test("Right-plane projection of a housing corner drops the out-of-plane X", () => {
  const uv = projectWorldToSketch({ plane: "side", offset: 0 }, { x: 5, y: 8, z: 10 });
  assert.equal(uv.x, 10);
  assert.equal(uv.y, 8);
  assert.equal(uv.w, 5);
});

test("synthetic box edges without kernel endpoints still meet at a corner", () => {
  const sketch = { plane: "side", offset: 0, points: [{ id: "p", x: 0, y: 0 }], entities: [], constraints: [{
    id: "i", type: "intersection", point: "p",
    edgeA: { persistentId: "housing:edge:y:right:front", ownerFeatureId: "housing" },
    edgeB: { persistentId: "housing:edge:z:right:top", ownerFeatureId: "housing" },
  }] };
  const edges = {
    "housing:edge:y:right:front": { kind: "edge", persistentId: "housing:edge:y:right:front", descriptor: { curve: "line", origin: { x: 10, y: 4, z: 6 }, axis: { x: 0, y: 1, z: 0 }, measure: 8 } },
    "housing:edge:z:right:top": { kind: "edge", persistentId: "housing:edge:z:right:top", descriptor: { curve: "line", origin: { x: 10, y: 8, z: 3 }, axis: { x: 0, y: 0, z: 1 }, measure: 6 } },
  };
  bindIntersectionTargets(sketch, (ref) => edges[ref.persistentId]);
  assert.equal(solveSketch(sketch).converged, true);
  const p = sketch.points[0];
  assert.ok(Math.abs(p.x - 6) < 1e-6, JSON.stringify(p));
  assert.ok(Math.abs(p.y - 8) < 1e-6);
});

test("a HandlePath sketch rebuilds after its housing edges", () => {
  const graph = buildDependencyGraph({
    features: [
      { id: "housing", name: "housing", type: "box" },
      { id: "handle", name: "handle", type: "sketch", params: { sketchId: "path" } },
    ],
    sketches: [{
      id: "path",
      constraints: [{
        type: "intersection",
        edgeA: { ownerFeatureId: "housing", persistentId: "a" },
        edgeB: { ownerFeatureId: "housing", persistentId: "b" },
      }],
    }],
  });
  assert.equal(graph.issues.filter((issue) => issue.severity === "error").length, 0, JSON.stringify(graph.issues));
  assert.deepEqual(graph.order.map((feature) => feature.id), ["housing", "handle"]);
});

function farthestCorner(topology) {
  const edges = (topology || []).filter((item) => item.kind === "edge" && item.descriptor?.curve === "line");
  let best = null, score = -Infinity;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i].descriptor.endpoints || [], b = edges[j].descriptor.endpoints || [];
      for (const p of a) {
        for (const q of b) {
          if (Math.hypot((p.x || 0) - (q.x || 0), (p.y || 0) - (q.y || 0), (p.z || 0) - (q.z || 0)) > 1e-4) continue;
          const next = (p.x || 0) + (p.y || 0) + (p.z || 0);
          if (next > score) { score = next; best = { edgeA: edges[i], edgeB: edges[j], corner: p }; }
        }
      }
    }
  }
  return best;
}

test("rebuilding a taller housing moves the HandlePath intersection point", async () => {
  const definition = {
    references: [{ id: "plane:side" }],
    sketches: [],
    features: [],
  };
  addFeature(definition, { id: "housing", type: "box", params: { x: 0, y: 0, z: 0, w: 10, h: 8, d: 6 } });
  const seed = await regenerateFeatures(definition);
  try {
    assert.equal(seed.ok, true, JSON.stringify(seed.issues));
    const hit = farthestCorner(seed.results.get("housing")?.topology);
    assert.ok(hit, "housing needs two edges that share a corner");
    definition.sketches.push({
      id: "path",
      plane: "side",
      offset: 0,
      points: [{ id: "p", x: 0, y: 0 }],
      entities: [],
      constraints: [{
        id: "i", type: "intersection", point: "p",
        edgeA: createTopologyReference(hit.edgeA.ownerFeatureId, "edge", hit.edgeA.persistentId, hit.edgeA.descriptor),
        edgeB: createTopologyReference(hit.edgeB.ownerFeatureId, "edge", hit.edgeB.persistentId, hit.edgeB.descriptor),
      }],
    });
    addFeature(definition, { id: "handle", type: "sketch", params: { sketchId: "path" } });
    const first = await regenerateFeatures(definition);
    try {
      assert.equal(first.ok, true, JSON.stringify(first.issues));
      const before = first.boundaryUpdates.get("path")?.sketch?.points?.find((point) => point.id === "p");
      assert.ok(before, "intersection sketch did not rebuild");
      const expected = projectWorldToSketch({ plane: "side", offset: 0 }, hit.corner);
      assert.ok(Math.abs(before.x - expected.x) < 1e-4, JSON.stringify({ before, expected }));
      assert.ok(Math.abs(before.y - expected.y) < 1e-4);
      definition.features[0].params.h = 12;
      const second = await regenerateFeatures(definition);
      try {
        assert.equal(second.ok, true, JSON.stringify(second.issues));
        const after = second.boundaryUpdates.get("path")?.sketch?.points?.find((point) => point.id === "p");
        assert.ok(after);
        assert.ok(Math.abs(after.y - 12) < 0.05, JSON.stringify(after));
        assert.ok(Math.abs(after.x - before.x) < 0.05, JSON.stringify({ before, after }));
      } finally { releaseRegeneration(second); }
    } finally { releaseRegeneration(first); }
  } finally { releaseRegeneration(seed); }
});
