import test from "node:test";
import assert from "node:assert/strict";
import { helixPoint, helixSweepPath, normalizeHelixSpec, sampleHelix } from "../js/cad_helix.js";
import { disposeBrep, makeBrepSweep, shapeToMeshData } from "../js/cad_kernel.js";

/* LENSCAP's thread: a trapezoid pierced at a helix start, its tip pointing at
   the axis. On a polyline spine the section only translated, so half a turn
   later the tip pointed outward and broke through the wall (r 6.5035 for a
   6.2239 anchor). Every point of a correct thread stays between the tip and
   the anchor radius, whichever way the helix tapers. */
const HELIX = { origin: { x: 0, y: 0, z: -3.2385 }, axis: { x: 0, y: 0, z: 1 }, radius: 6.2239, radiusEnd: 6.0850, pitch: 0.635, turns: 2.5, handedness: "right", startAngle: 0 };
const DEPTH = 0.3074;

function threadSection(spec) {
  const h = normalizeHelixSpec(spec), start = helixPoint(h, 0);
  const radial = { x: start.x - h.origin.x, y: start.y - h.origin.y };
  const length = Math.hypot(radial.x, radial.y), inward = { x: -radial.x / length, y: -radial.y / length };
  const at = (depth, rise) => ({ x: start.x + inward.x * depth, y: start.y + inward.y * depth, z: start.z + rise });
  return [at(0, -0.15875), at(DEPTH, -0.079375), at(DEPTH, 0.079375), at(0, 0.15875)];
}

async function radialRange(body) {
  const mesh = await shapeToMeshData(body, { deflection: 0.02, angle: 0.1 }), p = mesh.positions;
  let min = Infinity, max = 0;
  for (let i = 0; i < p.length; i += 3) { const r = Math.hypot(p[i], p[i + 1]); min = Math.min(min, r); max = Math.max(max, r); }
  return { min, max };
}

test("a helix sweep spine is one smooth spline through the helix samples", () => {
  const spine = helixSweepPath(HELIX), samples = sampleHelix(HELIX).points;
  assert.deepEqual(spine.path, samples);
  assert.equal(spine.pathSegments.length, 1);
  assert.equal(spine.pathSegments[0].type, "spline");
  assert.deepEqual(spine.pathSegments[0].points, samples);
});

test("a thread swept along a helix keeps its tip toward the axis all the way round", async () => {
  const profile = threadSection(HELIX), floor = HELIX.radiusEnd - DEPTH - 1e-3;
  for (const orientation of ["follow-path", "minimum-twist"]) {
    const body = await makeBrepSweep({ profile, ...helixSweepPath(HELIX), orientation, solid: true });
    try {
      const range = await radialRange(body);
      assert.ok(range.max <= HELIX.radius + 1e-3, orientation + " broke out to r " + range.max);
      // Minimum twist may tilt the section a hair on a tapered helix; Follow
      // path (the book's choice) keeps it square to the axis.
      if (orientation === "follow-path") assert.ok(range.min >= floor, orientation + " reached in to r " + range.min);
    } finally { disposeBrep(body); }
  }
});

test("a saved helix sweep without spline segments rebuilds on the smooth spine", async () => {
  const { compileKernelFeatureTree } = await import("../js/core/kernel_feature_adapter.js");
  const { regenerateFeatures, releaseRegeneration } = await import("../js/cad_feature_tree.js");
  const sketch = { id: "section", plane: "top", points: [{ id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 0 }, { id: "c", x: 1, y: 1 }], entities: [{ id: "ab", type: "line", a: "a", b: "b" }, { id: "bc", type: "line", a: "b", b: "c" }, { id: "ca", type: "line", a: "c", b: "a" }], constraints: [] };
  const document = { sketches: [sketch], features: [{ id: "thread", type: "sweep", references: { sketches: ["section"] }, params: { profile: threadSection(HELIX), path: sampleHelix(HELIX).points, helix: HELIX, orientation: "follow-path", twistAngle: 0, scale: 1, solid: true } }] };
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({ ...compiled.document, features: compiled.features });
  try {
    const id = compiled.features[compiled.features.length - 1].id, body = run.results.get(id);
    assert.ok(body?.shape, JSON.stringify(run.issues));
    const range = await radialRange(body);
    assert.ok(range.max <= HELIX.radius + 1e-3, "legacy polyline sweep broke out to r " + range.max);
  } finally { releaseRegeneration(run); }
});
