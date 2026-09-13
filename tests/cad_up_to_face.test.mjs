import test from "node:test";
import assert from "node:assert/strict";
import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { createTopologyReference, topologyForFeature } from "../js/core/topology.js";
import { shapeMassProperties } from "../js/cad_kernel.js";

function boxFeature() {
  return { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: 30, d: 20 } };
}

function innerLeftFace(run) {
  const faces = (run.finalShape.topology || []).filter((item) => item.kind === "face" && item.descriptor?.surface === "plane");
  return faces
    .filter((face) => Math.abs(Math.abs(face.descriptor.normal?.x || 0) - 1) < 1e-6)
    .sort((a, b) => Math.abs((a.descriptor.origin?.x || 0) - 2) - Math.abs((b.descriptor.origin?.x || 0) - 2))[0];
}

function addUpToCut(definition, face, endCondition) {
  addFeature(definition, {
    id: "cut:tool", type: "extrude", inputs: ["hollow"],
    params: {
      axis: "x", from: 0, to: 40, depth: 40, direction: "forward",
      endCondition,
      targetFeatureId: "hollow",
      ...(face ? { endFace: createTopologyReference(face.ownerFeatureId, face.kind, face.persistentId, face.descriptor) } : {}),
      points: [{ u: 15, v: 10 }, { u: 15, v: 14 }, { u: 19, v: 14 }, { u: 19, v: 10 }],
    },
  });
  addFeature(definition, { id: "cut", type: "subtract", inputs: ["hollow", "cut:tool"], params: {} });
}

async function shelledOpenFront(thickness) {
  const body = boxFeature();
  const front = topologyForFeature(body, body.params).find((item) => item.persistentId === "body:face:front");
  const definition = { features: [] };
  addFeature(definition, body);
  addFeature(definition, {
    id: "hollow", type: "shell", inputs: ["body"],
    params: {
      thickness,
      targets: [createTopologyReference(front.ownerFeatureId, front.kind, front.persistentId, front.descriptor)],
    },
  });
  return { definition, run: await regenerateFeatures(definition) };
}

test("an up-to-face cut on a shelled box stops at the inner wall", async () => {
  const first = await shelledOpenFront(2);
  try {
    assert.equal(first.run.ok, true, JSON.stringify(first.run.issues));
    const before = await shapeMassProperties(first.run.finalShape);
    const face = innerLeftFace(first.run);
    assert.ok(face, "inner left face");
    addUpToCut(first.definition, face, "up-to-face");
    const cutRun = await regenerateFeatures(first.definition);
    try {
      assert.equal(cutRun.ok, true, JSON.stringify(cutRun.issues));
      const after = await shapeMassProperties(cutRun.finalShape);
      const removed = before.volume - after.volume;
      const extent = cutRun.resolvedExtrusions.get("cut:tool");
      assert.ok(Math.abs(removed - 32) < 1, "removed " + removed);
      assert.ok(extent && Math.abs(extent.to - 2) < 0.15, "to " + extent?.to);
    } finally { releaseRegeneration(cutRun); }
  } finally { releaseRegeneration(first.run); }
});

test("editing shell thickness keeps an up-to-face cut terminating on the inner wall", async () => {
  async function volumeAt(thickness) {
    const { definition, run } = await shelledOpenFront(thickness);
    try {
      assert.equal(run.ok, true, JSON.stringify(run.issues));
      const before = await shapeMassProperties(run.finalShape);
      const face = innerLeftFace(run);
      addUpToCut(definition, face, "up-to-face");
      const cutRun = await regenerateFeatures(definition);
      try {
        assert.equal(cutRun.ok, true, JSON.stringify(cutRun.issues));
        const after = await shapeMassProperties(cutRun.finalShape);
        return { removed: before.volume - after.volume, to: cutRun.resolvedExtrusions.get("cut:tool")?.to };
      } finally { releaseRegeneration(cutRun); }
    } finally { releaseRegeneration(run); }
  }
  const thin = await volumeAt(2);
  const thick = await volumeAt(3);
  assert.ok(Math.abs(thin.removed - 32) < 1, "thin removed " + thin.removed);
  assert.ok(Math.abs(thick.removed - 48) < 1, "thick removed " + thick.removed);
  assert.ok(Math.abs(thin.to - 2) < 0.15, "thin to " + thin.to);
  assert.ok(Math.abs(thick.to - 3) < 0.15, "thick to " + thick.to);
});

test("up-to-next on a shelled box matches the first inner face", async () => {
  const { definition, run } = await shelledOpenFront(2);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const before = await shapeMassProperties(run.finalShape);
    addUpToCut(definition, null, "up-to-next");
    const cutRun = await regenerateFeatures(definition);
    try {
      assert.equal(cutRun.ok, true, JSON.stringify(cutRun.issues));
      const after = await shapeMassProperties(cutRun.finalShape);
      const removed = before.volume - after.volume;
      assert.ok(Math.abs(removed - 32) < 1, "removed " + removed);
    } finally { releaseRegeneration(cutRun); }
  } finally { releaseRegeneration(run); }
});
