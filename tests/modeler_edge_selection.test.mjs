import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTopologyRegistry, mergeSmoothTopology, resolveFinishTargetIds } from "../js/core/topology.js";
import { cycleOverlappingHits } from "../js/modeler_chrome.js";

const modelerSource = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");

const pt = (x, y, z) => ({ x, y, z });
const face = { ownerFeatureId: "f", kind: "face", persistentId: "f:face:top", descriptor: { surface: "plane", origin: pt(0, 10, 0), normal: pt(0, 1, 0), measure: 100 } };
const edgeA = { ownerFeatureId: "f", kind: "edge", persistentId: "f:edge:1", descriptor: { curve: "line", origin: pt(0, 10, -5), endpoints: [pt(-5, 10, -5), pt(5, 10, -5)], measure: 10 } };
const edgeB = { ownerFeatureId: "f", kind: "edge", persistentId: "f:edge:2", descriptor: { curve: "line", origin: pt(0, 10, 5), endpoints: [pt(-5, 10, 5), pt(5, 10, 5)], measure: 10 } };
const arcA = { ownerFeatureId: "f", kind: "edge", persistentId: "f:edge:arcA", descriptor: { curve: "circle", origin: pt(0, 10, 0), axis: pt(0, 1, 0), radius: 3, measure: Math.PI * 3 } };
const arcB = { ownerFeatureId: "f", kind: "edge", persistentId: "f:edge:arcB", descriptor: { curve: "circle", origin: pt(0, 10, 0), axis: pt(0, 1, 0), radius: 3, measure: Math.PI * 3 } };

const merged = mergeSmoothTopology([face, edgeA, edgeB, arcA, arcB]);
const registry = createTopologyRegistry(merged);
const mergedCircle = merged.find((item) => (item.memberPersistentIds || []).length > 1);

test("the same edge picked twice resolves to one finish target", () => {
  assert.deepEqual(resolveFinishTargetIds([edgeA, edgeA], registry, "edge"), ["f:edge:1"]);
});

test("a merged circle plus one of its member arcs is still one edge", () => {
  const member = { kind: "edge", persistentId: mergedCircle.memberPersistentIds[1], descriptor: arcB.descriptor };
  assert.deepEqual(resolveFinishTargetIds([mergedCircle, member], registry, "edge"), [mergedCircle.persistentId]);
});

test("a face expands to its edges without repeating an edge picked alongside it", () => {
  const ids = resolveFinishTargetIds([face, edgeA], registry, "edge");
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("f:edge:1") && ids.includes("f:edge:2"));
});

/* The regression: a mixed pick — one edge whose id the kernel knows, one
   tessellated overlay edge that only matches by descriptor — used to drop the
   overlay edge, because the descriptor pass ran only when NOTHING resolved. */
test("a tessellated pick survives alongside a kernel pick", () => {
  const overlay = { kind: "edge", persistentId: "f:edge:mesh-line:7", descriptor: edgeB.descriptor };
  assert.deepEqual(resolveFinishTargetIds([edgeA, overlay], registry, "edge"), ["f:edge:1", "f:edge:2"]);
});

test("two ids for one physical edge collapse to a single finish target", () => {
  const overlay = { kind: "edge", persistentId: "f:edge:mesh-line:9", descriptor: { ...edgeA.descriptor, semantic: "mesh-line:9" } };
  assert.deepEqual(resolveFinishTargetIds([edgeA, overlay], registry, "edge"), ["f:edge:1"]);
});

test("modeler dedupes the finish edge selection on geometry, not only on id", () => {
  assert.match(modelerSource, /function finishEdgeKey\(/);
  assert.match(modelerSource, /function dedupeFinishRefs\(/);
  assert.match(modelerSource, /E\.topologySelection = dedupeFinishRefs\(edges\)/);
  assert.match(modelerSource, /overlapping = dedupeFinishRefs\(overlapping\)/);
});

test("shift-cycling a list with repeats would stall, so the list is deduped first", () => {
  const repeated = [{ persistentId: "a" }, { persistentId: "a" }, { persistentId: "b" }];
  assert.equal(cycleOverlappingHits(repeated, "a").persistentId, "a");     // why the dedupe above matters
  const unique = [{ persistentId: "a" }, { persistentId: "b" }];
  assert.equal(cycleOverlappingHits(unique, "a").persistentId, "b");
  assert.equal(cycleOverlappingHits(unique, "b").persistentId, "a");
});
