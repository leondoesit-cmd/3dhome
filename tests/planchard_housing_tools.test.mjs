/* HOUSING tools for Planchard 2A-6: through-vertex plane, pattern seed only
   of a rib, two-direction layout, and feature Mirror. Geometry is measured
   on a test body — the book HOUSING itself is 2A-7. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { compileKernelFeatureTree, FEATURE_PATTERN_SEED_TYPES } from "../js/core/kernel_feature_adapter.js";
import { featureDefaults } from "../js/core/feature_catalog.js";
import { regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { resolveOffsetSketch } from "../js/core/offset_planes.js";
import { topologyForFeature } from "../js/core/topology.js";
import { mainReferences } from "../js/core/schema.js";
import { shapeMassProperties } from "../js/cad_kernel.js";

const modeler = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../js/core/feature_catalog.js", import.meta.url), "utf8");

test("pattern seed only includes a rib and the plane form offers through-vertex", () => {
  assert.ok(FEATURE_PATTERN_SEED_TYPES.includes("rib"));
  assert.match(modeler, /FEATURE_PATTERN_SEED_TYPES/);
  assert.match(modeler, /through-vertex-parallel/);
  assert.match(modeler, /throughVertexBinding/);
  assert.match(modeler, /patternParamsFromSelectedEdges/);
  assert.match(catalog, /Pattern seed only/);
  assert.match(catalog, /geometryPattern/);
});

test("a through-vertex plane follows the box corner it was bound to", async () => {
  async function originX(width) {
    const box = { id: "box", type: "box", params: { x: 0, y: 0, z: 0, w: width, h: 4, d: 6 } };
    const expected = topologyForFeature(box, box.params);
    const yEdge = expected.find((item) => item.kind === "edge" && item.semantic === "y:right:front");
    const zEdge = expected.find((item) => item.kind === "edge" && item.semantic === "z:right:top");
    const run = await regenerateFeatures({ features: [box] });
    try {
      const plane = {
        id: "longrib", type: "plane", baseReferenceId: "plane:right", refType: "through-vertex-parallel",
        throughEdges: [
          { ownerFeatureId: "box", persistentId: yEdge.persistentId, kind: "edge", semantic: yEdge.semantic, descriptor: yEdge.descriptor },
          { ownerFeatureId: "box", persistentId: zEdge.persistentId, kind: "edge", semantic: zEdge.semantic, descriptor: zEdge.descriptor },
        ],
      };
      const sketch = { id: "s", referenceId: "longrib" };
      const lookup = (ref) => {
        const topology = run.results.get(ref.ownerFeatureId)?.topology || [];
        return topology.find((item) => item.persistentId === ref.persistentId)
          || topology.find((item) => item.kind === ref.kind && item.semantic === ref.semantic);
      };
      return resolveOffsetSketch(sketch, [{ id: "plane:right", type: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } }, plane], lookup).frame.origin.x;
    } finally { releaseRegeneration(run); }
  }
  assert.ok(Math.abs(await originX(10) - 10) < 1e-4, "plane through the 10 cm corner");
  assert.ok(Math.abs(await originX(15) - 15) < 1e-4, "and it follows when the box grows");
});

test("pattern seed only of a rib is a 3x3 geometry copy, not nine up-to-body rebuilds", async () => {
  const document = {
    sketches: [{
      id: "s1", referenceId: "plane:top",
      points: [{ id: "a", x: 5, y: 2, fixed: true }, { id: "b", x: 5, y: 4, fixed: true }],
      entities: [{ id: "line", type: "line", a: "a", b: "b" }], constraints: [],
    }],
    features: [
      { id: "b1", type: "box", name: "Plate", inputs: [], params: { x: 0, y: 0, z: 0, w: 40, h: 2, d: 40 } },
      {
        id: "r1", type: "rib", name: "Rib1", inputs: ["b1"],
        references: { features: ["b1"], sketches: ["s1"] },
        params: { ...featureDefaults("rib"), thickness: 1, extent: "blind", depth: 5, axis: "y", from: 2, points: [{ u: 5, v: 2 }, { u: 5, v: 4 }] },
      },
      {
        id: "p1", type: "pattern", name: "Rib pattern", inputs: ["r1"],
        references: { features: ["r1"] },
        params: {
          scope: "feature", seedFeatureId: "r1", seedOnly: true, geometryPattern: true, mode: "linear",
          axisX: true, axisY: false, axisZ: true, countX: 3, spacingX: 6, countZ: 3, spacingZ: 6,
        },
      },
    ],
  };
  const compiled = compileKernelFeatureTree(document);
  assert.equal(compiled.ok, true, JSON.stringify(compiled.issues));
  const run = await regenerateFeatures({ ...compiled.document, features: compiled.features });
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const plate = await shapeMassProperties(run.results.get("b1"));
    const ribbed = await shapeMassProperties(run.results.get("r1"));
    const patterned = await shapeMassProperties(run.results.get("p1"));
    const web = ribbed.volume - plate.volume;
    assert.ok(Math.abs(web - 10) < 1e-2, "one 2 x 1 x 5 web: " + web);
    assert.ok(Math.abs(patterned.volume - (plate.volume + 9 * web)) < 1e-2, "nine copies of the seed web: " + patterned.volume);
  } finally { releaseRegeneration(run); }
});

test("feature Mirror keeps the original and produces a reflected copy", async () => {
  const run = await regenerateFeatures({
    references: mainReferences(),
    features: [
      { id: "box", type: "box", inputs: [], params: { x: 2, y: 0, z: 0, w: 2, h: 3, d: 4 } },
      { id: "mirror", type: "mirror", inputs: ["box"], references: { references: ["plane:right"] }, params: { keepOriginal: true, merge: true } },
    ],
  });
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const seed = await shapeMassProperties(run.results.get("box"));
    const mirrored = await shapeMassProperties(run.results.get("mirror"));
    assert.ok(Math.abs(mirrored.volume - 2 * seed.volume) < 1e-6);
    assert.ok(mirrored.bounds.min.x < -1.9 && mirrored.bounds.max.x > 1.9);
  } finally { releaseRegeneration(run); }
});
