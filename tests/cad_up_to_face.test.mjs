import test from "node:test";
import assert from "node:assert/strict";
import { addFeature, regenerateFeatures, releaseRegeneration } from "../js/cad_feature_tree.js";
import { createTopologyReference, topologyForFeature } from "../js/core/topology.js";
import { UP_TO_FACE_MISSED, UP_TO_NEXT_MISSED } from "../js/core/extrude_extent.js";
import { brepContainsPoint, shapeMassProperties } from "../js/cad_kernel.js";

function boxFeature() {
  return { id: "body", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: 30, d: 20 } };
}

function innerLeftFace(run) {
  const faces = (run.finalShape.topology || []).filter((item) => item.kind === "face" && item.descriptor?.surface === "plane");
  return faces
    .filter((face) => Math.abs(Math.abs(face.descriptor.normal?.x || 0) - 1) < 1e-6)
    .sort((a, b) => Math.abs((a.descriptor.origin?.x || 0) - 2) - Math.abs((b.descriptor.origin?.x || 0) - 2))[0];
}

function addUpToCut(definition, face, endCondition, extras = {}) {
  const targetId = extras.targetId || "hollow";
  const toolId = extras.toolId || "cut:tool";
  const cutId = extras.cutId || "cut";
  addFeature(definition, {
    id: toolId, type: "extrude", inputs: [targetId],
    params: {
      axis: extras.axis || "x",
      from: extras.from ?? 0,
      to: extras.to ?? 40,
      depth: extras.depth ?? 40,
      direction: extras.direction || "forward",
      endCondition,
      targetFeatureId: targetId,
      ...(face ? { endFace: createTopologyReference(face.ownerFeatureId, face.kind, face.persistentId, face.descriptor) } : {}),
      points: extras.points || [{ u: 15, v: 10 }, { u: 15, v: 14 }, { u: 19, v: 14 }, { u: 19, v: 10 }],
      ...(extras.regions ? { regions: extras.regions } : {}),
    },
  });
  addFeature(definition, { id: cutId, type: "subtract", inputs: [targetId, toolId], params: {} });
}

function planarFaces(run) {
  return (run.finalShape.topology || []).filter((item) => item.kind === "face" && item.descriptor?.surface === "plane");
}

async function assertUpToFaceMisses(definition, face, extras = {}) {
  addUpToCut(definition, face, "up-to-face", extras);
  const cutRun = await regenerateFeatures(definition);
  try {
    assert.equal(cutRun.ok, false, JSON.stringify(cutRun.issues));
    const message = (cutRun.issues || []).map((issue) => issue.message).join("\n");
    assert.match(message, new RegExp(UP_TO_FACE_MISSED));
  } finally { releaseRegeneration(cutRun); }
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

test("up-to-next does not stop the whole cut at a step that covers only part of the profile", async () => {
  const definition = { features: [] };
  addFeature(definition, { id: "base", type: "box", params: { x: 0, y: 0, z: 0, w: 40, h: 20, d: 20 } });
  addFeature(definition, { id: "step", type: "box", params: { x: 0, y: 20, z: 0, w: 10, h: 10, d: 20 } });
  addFeature(definition, { id: "body", type: "union", inputs: ["base", "step"], params: {} });
  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    addUpToCut(definition, null, "up-to-next", {
      targetId: "body",
      points: [{ u: 8, v: 16 }, { u: 12, v: 16 }, { u: 12, v: 24 }, { u: 8, v: 24 }],
    });
    const cutRun = await regenerateFeatures(definition);
    try {
      assert.equal(cutRun.ok, false, JSON.stringify(cutRun.issues));
      const message = (cutRun.issues || []).map((issue) => issue.message).join("\n");
      assert.match(message, new RegExp(UP_TO_NEXT_MISSED));
    } finally { releaseRegeneration(cutRun); }
  } finally { releaseRegeneration(run); }
});

function circlePoints(u, v, radius, count = 24) {
  return Array.from({ length: count }, (_, index) => {
    const a = (index / count) * Math.PI * 2;
    return { u: u + Math.cos(a) * radius, v: v + Math.sin(a) * radius };
  });
}

test("SwitchHole up-to-surface trims to the inner cylinder, not a flat sliver", async () => {
  // Book mm → kernel cm: Ø111.13 × 33.02, shell 3.81, hole Ø12.95 at 11.43 from origin.
  const outerR = 5.5565, height = 3.302, shell = 0.381, holeR = 0.6475, holeY = 1.143, holeZ = height / 2;
  const body = { id: "housing", type: "cylinder", params: { x: 0, y: 0, z: 0, r: outerR, h: height, axis: "z" } };
  const top = topologyForFeature(body, body.params).find((item) => item.persistentId === "housing:face:top");
  const definition = { features: [] };
  addFeature(definition, body);
  addFeature(definition, {
    id: "hollow", type: "shell", inputs: ["housing"],
    params: { thickness: shell, targets: [createTopologyReference(top.ownerFeatureId, top.kind, top.persistentId, top.descriptor)] },
  });
  const first = await regenerateFeatures(definition);
  try {
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    const inner = (first.finalShape.topology || [])
      .filter((item) => item.kind === "face" && item.descriptor?.surface === "cylinder")
      .sort((a, b) => (a.descriptor.radius || 0) - (b.descriptor.radius || 0))[0];
    assert.ok(inner, "inner cylindrical wall");
    assert.ok(Math.abs((inner.descriptor.radius || 0) - (outerR - shell)) < 0.05, "inner R " + inner.descriptor.radius);
    addFeature(definition, {
      id: "switch:tool", type: "extrude", inputs: ["hollow"],
      params: {
        axis: "x", from: 8, to: 0, depth: 8, direction: "reverse",
        endCondition: "up-to-face",
        targetFeatureId: "hollow",
        endFace: createTopologyReference(inner.ownerFeatureId, inner.kind, inner.persistentId, inner.descriptor),
        points: circlePoints(holeZ, holeY, holeR),
      },
    });
    addFeature(definition, { id: "switch", type: "subtract", inputs: ["hollow", "switch:tool"], params: {} });
    const cutRun = await regenerateFeatures(definition);
    try {
      assert.equal(cutRun.ok, true, JSON.stringify(cutRun.issues));
      const solid = cutRun.results.get("switch");
      const nearWall = { x: 5.366, y: holeY, z: holeZ };
      const sliver = { x: 4.98, y: holeY + 0.5, z: holeZ };
      const farWall = { x: -5.366, y: holeY, z: holeZ };
      assert.equal(brepContainsPoint(solid, nearWall), false, "hole opens the near wall");
      assert.equal(brepContainsPoint(solid, sliver), false, "no uncut sliver on the inner cylinder");
      assert.equal(brepContainsPoint(solid, farWall), true, "opposite wall stays");
    } finally { releaseRegeneration(cutRun); }
  } finally { releaseRegeneration(first); }
});

test("up-to-face on a wall parallel to the pull does not silently cut through-all", async () => {
  const definition = { features: [] };
  addFeature(definition, boxFeature());
  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const top = planarFaces(run).find((face) => Math.abs((face.descriptor.normal?.y || 0) - 1) < 1e-6);
    assert.ok(top, "top face");
    await assertUpToFaceMisses(definition, top, { targetId: "body" });
  } finally { releaseRegeneration(run); }
});

test("up-to-face on a wall behind the sketch does not silently cut through-all", async () => {
  const definition = { features: [] };
  addFeature(definition, boxFeature());
  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const left = planarFaces(run).find((face) => Math.abs((face.descriptor.normal?.x || 0) + 1) < 1e-6);
    assert.ok(left, "left face");
    await assertUpToFaceMisses(definition, left, { targetId: "body", from: 10, to: 40 });
  } finally { releaseRegeneration(run); }
});

test("up-to-face on a plane that sits off to the side still stops at the extended surface", async () => {
  const definition = { features: [] };
  addFeature(definition, { id: "body", type: "box", params: { x: 0, y: 10, z: 10, w: 40, h: 20, d: 10 } });
  addFeature(definition, { id: "baffle", type: "box", params: { x: 15, y: 0, z: 0, w: 1, h: 8, d: 8 } });
  addFeature(definition, { id: "joined", type: "union", inputs: ["body", "baffle"], params: {} });
  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const before = await shapeMassProperties(run.finalShape);
    const wall = planarFaces(run)
      .filter((face) => Math.abs(Math.abs(face.descriptor.normal?.x || 0) - 1) < 1e-6)
      .filter((face) => (face.descriptor.origin?.x || 0) > 14.4 && (face.descriptor.origin?.x || 0) < 16.6)
      .sort((a, b) => (a.descriptor.origin?.x || 0) - (b.descriptor.origin?.x || 0))[0];
    assert.ok(wall, "baffle plane");
    addUpToCut(definition, wall, "up-to-face", {
      targetId: "joined",
      points: [{ u: 12, v: 12 }, { u: 12, v: 16 }, { u: 16, v: 16 }, { u: 16, v: 12 }],
    });
    const cutRun = await regenerateFeatures(definition);
    try {
      assert.equal(cutRun.ok, true, JSON.stringify(cutRun.issues));
      const after = await shapeMassProperties(cutRun.finalShape);
      const removed = before.volume - after.volume;
      const depth = wall.descriptor.origin.x;
      assert.ok(Math.abs(removed - 4 * 4 * depth) < 2, "removed " + removed + " at x=" + depth);
      assert.ok(removed < 500, "must not cut through-all, removed " + removed);
    } finally { releaseRegeneration(cutRun); }
  } finally { releaseRegeneration(run); }
});

test("up-to-face on a spline wall the pull never meets does not silently cut through-all", async () => {
  const square = (y, half) => [{ x: -half, y, z: -half }, { x: half, y, z: -half }, { x: half, y, z: half }, { x: -half, y, z: half }];
  const oval = (y, rx, rz, count = 24) => Array.from({ length: count }, (_, index) => {
    const a = (index / count) * Math.PI * 2;
    return { x: rx * Math.cos(a), y, z: rz * Math.sin(a) };
  });
  const definition = { features: [] };
  addFeature(definition, {
    id: "body", type: "loft",
    params: { sections: [square(0, 4), oval(20, 6, 3)], solid: true },
  });
  const run = await regenerateFeatures(definition);
  try {
    assert.equal(run.ok, true, JSON.stringify(run.issues));
    const side = (run.finalShape.topology || []).find((item) => item.kind === "face" && item.descriptor?.surface !== "plane");
    assert.ok(side, "spline side face");
    await assertUpToFaceMisses(definition, side, {
      targetId: "body",
      axis: "y",
      from: 0,
      to: 20,
      points: [{ u: -1, v: -1 }, { u: 1, v: -1 }, { u: 1, v: 1 }, { u: -1, v: 1 }],
    });
  } finally { releaseRegeneration(run); }
});

test("addFeature records a sketchId as a sketch selection, not an empty array", () => {
  const definition = { features: [] };
  const feature = addFeature(definition, { id: "ex", type: "extrude", params: { sketchId: "sk1", from: 0, to: 3.302, axis: "z" } });
  assert.equal(Array.isArray(feature.references), false);
  assert.deepEqual(feature.references.sketches, ["sk1"]);
});

test("an up-to-face cut with two separate regions keeps both islands", async () => {
  const first = await shelledOpenFront(2);
  try {
    assert.equal(first.run.ok, true, JSON.stringify(first.run.issues));
    const before = await shapeMassProperties(first.run.finalShape);
    const face = innerLeftFace(first.run);
    assert.ok(face, "inner left face");
    addUpToCut(first.definition, face, "up-to-face", {
      points: [{ u: 5, v: 10 }, { u: 5, v: 13 }, { u: 8, v: 13 }, { u: 8, v: 10 }],
      regions: [[{ u: 16, v: 10 }, { u: 16, v: 13 }, { u: 19, v: 13 }, { u: 19, v: 10 }]],
    });
    const cutRun = await regenerateFeatures(first.definition);
    try {
      assert.equal(cutRun.ok, true, JSON.stringify(cutRun.issues));
      const after = await shapeMassProperties(cutRun.finalShape);
      const removed = before.volume - after.volume;
      assert.ok(Math.abs(removed - 36) < 2, "removed " + removed);
    } finally { releaseRegeneration(cutRun); }
  } finally { releaseRegeneration(first.run); }
});
