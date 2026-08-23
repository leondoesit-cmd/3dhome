import test from "node:test";
import assert from "node:assert/strict";
import { meshFeatureEdges } from "../js/core/mesh_projection.js";

/* A filleted (rounded) rectangular top used to fit a circle well enough for the
   loose residual test and drew as a giant ring floating off the body. */
function roundedRectPrism(width, depth, height, radius, steps = 8) {
  const pts = [];
  const corners = [
    { x: width - radius, z: depth - radius, a0: 0 },
    { x: radius, z: depth - radius, a0: Math.PI / 2 },
    { x: radius, z: radius, a0: Math.PI },
    { x: width - radius, z: radius, a0: -Math.PI / 2 },
  ];
  corners.forEach((c) => {
    for (let i = 0; i <= steps; i++) {
      const a = c.a0 + (Math.PI / 2) * (i / steps);
      pts.push({ x: c.x + Math.cos(a) * radius, z: c.z + Math.sin(a) * radius });
    }
  });
  const positions = [];
  const tri = (a, b, c) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const at = (p, y) => ({ x: p.x, y, z: p.z });
  for (let i = 1; i + 1 < pts.length; i++) {
    tri(at(pts[0], height), at(pts[i], height), at(pts[i + 1], height));
    tri(at(pts[0], 0), at(pts[i + 1], 0), at(pts[i], 0));
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    tri(at(a, 0), at(b, 0), at(b, height));
    tri(at(a, 0), at(b, height), at(a, height));
  }
  return { positions };
}

test("a rounded rectangle outline is not reported as one huge circle", () => {
  const { circles } = meshFeatureEdges(roundedRectPrism(60, 40, 20, 6));
  const oversized = circles.filter((c) => c.closed && c.radius > 10);
  assert.equal(oversized.length, 0, "rounded rectangle loops must stay polylines");
});

test("a real cylinder rim still reads as one circle", () => {
  const positions = [], radius = 12, height = 20, steps = 48;
  const push = (a, b, c) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const ring = (i) => ({ x: Math.cos((i / steps) * Math.PI * 2) * radius, z: Math.sin((i / steps) * Math.PI * 2) * radius });
  for (let i = 0; i < steps; i++) {
    const a = ring(i), b = ring(i + 1);
    push({ x: 0, y: height, z: 0 }, { ...a, y: height }, { ...b, y: height });
    push({ x: 0, y: 0, z: 0 }, { ...b, y: 0 }, { ...a, y: 0 });
    push({ ...a, y: 0 }, { ...b, y: 0 }, { ...b, y: height });
    push({ ...a, y: 0 }, { ...b, y: height }, { ...a, y: height });
  }
  const { circles } = meshFeatureEdges({ positions });
  assert.ok(circles.some((c) => c.closed && Math.abs(c.radius - radius) < 0.5), "cylinder rim should still classify as a circle");
});
