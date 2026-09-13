import test from "node:test";
import assert from "node:assert/strict";
import {
  aabbFromBox,
  endConditionHidesDepth,
  farBoundAlongAxis,
  isUpToFace,
  raySurfaceHit,
  resolveExtrudeExtent,
  UP_TO_FACE_MISSING,
  UP_TO_FACE_MISSED,
} from "../js/core/extrude_extent.js";

test("up-to-face is an alias of the book's Up To Surface", () => {
  assert.equal(isUpToFace("up-to-face"), true);
  assert.equal(isUpToFace("up-to-surface"), true);
  assert.equal(isUpToFace("through-all"), false);
  assert.equal(endConditionHidesDepth("up-to-next"), true);
  assert.equal(endConditionHidesDepth("blind"), false);
});

test("a planar up-to-face cut stops at the selected plane, not through the body", () => {
  const params = {
    axis: "y", endCondition: "up-to-face", direction: "forward", from: 0, to: 30, depth: 30,
    points: [{ u: 20, v: 10 }, { u: 25, v: 10 }, { u: 25, v: 15 }, { u: 20, v: 15 }],
    endFace: { kind: "face", persistentId: "shell:inner", descriptor: { surface: "plane", origin: { x: 20, y: 2, z: 10 }, normal: { x: 0, y: 1, z: 0 } } },
  };
  const resolved = resolveExtrudeExtent(params, { endFace: params.endFace });
  assert.equal(resolved.from, 0);
  assert.ok(Math.abs(resolved.to - 2) < 1e-9);
});

test("a reverse cut from a top face stops on an inner floor below it", () => {
  const floor = { kind: "face", descriptor: { surface: "plane", origin: { x: 20, y: 4, z: 10 }, normal: { x: 0, y: 1, z: 0 } } };
  const resolved = resolveExtrudeExtent({
    axis: "y", endCondition: "up-to-surface", direction: "reverse", from: 24, to: 0, depth: 24,
    points: [{ u: 5, v: 5 }],
  }, { endFace: floor });
  assert.equal(resolved.from, 24);
  assert.ok(Math.abs(resolved.to - 4) < 1e-9);
});

test("through-all spans the host bounds along the pull", () => {
  const bounds = aabbFromBox({ x0: 0, x1: 40, y0: 0, y1: 30, z0: 0, z1: 20 });
  const resolved = resolveExtrudeExtent({
    axis: "x", endCondition: "through-all", direction: "forward", from: 0, to: 10, depth: 10,
    points: [{ u: 10, v: 15 }],
  }, { hostBounds: bounds });
  assert.ok(resolved.to > 40);
  assert.ok(resolved.to < 41);
});

test("up-to-next ignores a face whose bounded area the ray misses", () => {
  const faces = [
    { kind: "face", descriptor: { surface: "plane", origin: { x: 20, y: 25, z: 10 }, normal: { x: 0, y: 1, z: 0 }, bounds: { min: { x: 0, y: 25, z: 0 }, max: { x: 10, y: 25, z: 20 } } } },
    { kind: "face", descriptor: { surface: "plane", origin: { x: 20, y: 8, z: 10 }, normal: { x: 0, y: 1, z: 0 }, bounds: { min: { x: 15, y: 8, z: 5 }, max: { x: 25, y: 8, z: 15 } } } },
  ];
  const resolved = resolveExtrudeExtent({
    axis: "y", endCondition: "up-to-next", direction: "forward", from: 0, to: 30, depth: 30,
    points: [{ u: 20, v: 10 }, { u: 22, v: 10 }, { u: 22, v: 12 }, { u: 20, v: 12 }],
  }, { hostFaces: faces });
  assert.ok(Math.abs(resolved.to - 8) < 1e-9, "to " + resolved.to);
});

test("up-to-next takes the nearest host face in the pull, skipping the sketch plane", () => {
  const faces = [
    { kind: "face", descriptor: { surface: "plane", origin: { x: 0, y: 15, z: 10 }, normal: { x: -1, y: 0, z: 0 } } },
    { kind: "face", descriptor: { surface: "plane", origin: { x: 2, y: 15, z: 10 }, normal: { x: 1, y: 0, z: 0 } } },
    { kind: "face", descriptor: { surface: "plane", origin: { x: 38, y: 15, z: 10 }, normal: { x: -1, y: 0, z: 0 } } },
  ];
  const resolved = resolveExtrudeExtent({
    axis: "x", endCondition: "up-to-next", direction: "forward", from: 0, to: 40, depth: 40,
    points: [{ u: 15, v: 10 }],
  }, { hostFaces: faces });
  assert.ok(Math.abs(resolved.to - 2) < 1e-9);
});

test("a cylinder hit is the first intersection along the pull", () => {
  const hit = raySurfaceHit(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { surface: "cylinder", origin: { x: 10, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 3 },
  );
  assert.ok(Math.abs(hit - 7) < 1e-9);
});

test("a cone hit follows the semi-angle from the reference radius", () => {
  const angle = Math.PI / 6;
  const hit = raySurfaceHit(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { surface: "cone", origin: { x: 10, y: 0, z: 0 }, axis: { x: 0, y: 1, z: 0 }, radius: 2, angle },
  );
  // Apex is 2/tan(30°) = 2√3 below the reference, along -Y. Ray is in the
  // reference plane (y=0), so the cone radius there is 2 and the hit is at x=8.
  assert.ok(Math.abs(hit - 8) < 1e-6, String(hit));
});

test("a face behind the pull is refused", () => {
  assert.throws(() => resolveExtrudeExtent({
    axis: "y", endCondition: "up-to-face", direction: "forward", from: 5, points: [{ u: 0, v: 0 }],
  }, { endFace: { descriptor: { surface: "plane", origin: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 } } } }), new RegExp(UP_TO_FACE_MISSED));
});

test("up-to-face without a face is refused", () => {
  assert.throws(() => resolveExtrudeExtent({
    axis: "y", endCondition: "up-to-face", from: 0, points: [{ u: 0, v: 0 }],
  }, {}), new RegExp(UP_TO_FACE_MISSING));
});

test("far-bound projection uses the AABB corner in the pull direction", () => {
  const far = farBoundAlongAxis({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 8 } }, { x: 0, y: 4, z: 0 }, { x: 0, y: -1, z: 0 });
  assert.equal(far, 4);
});
