import test from "node:test";
import assert from "node:assert/strict";
import { circularMeshBoundary } from "../js/core/circular_edge_display.js";

const descriptor = { curve: "circle", origin: { x: 0, y: 0, z: 1.78 }, axis: { x: 0, y: 0, z: 1 }, radius: 2.8 };
const points = Array.from({ length: 79 }, (_, i) => {
  const angle = .123 + i * 2 * Math.PI / 78;
  return { x: 2.8 * Math.cos(angle), y: 2.8 * Math.sin(angle), z: 1.78 };
});

test("concave circular overlay uses actual tessellation phase and every boundary vertex", () => {
  const original = structuredClone(descriptor);
  assert.equal(circularMeshBoundary(descriptor, [{ closed: true, points }]), points);
  assert.deepEqual(descriptor, original, "native identity and geometry are never rewritten");
});

test("nearby circles, partial arcs and off-surface chains cannot become the display boundary", () => {
  assert.equal(circularMeshBoundary(descriptor, [{ closed: true, points: points.map(p => ({ ...p, z: p.z + .001 })) }]), null);
  assert.equal(circularMeshBoundary(descriptor, [{ closed: true, points: points.map(p => ({ ...p, x: p.x * 1.001, y: p.y * 1.001 })) }]), null);
  assert.equal(circularMeshBoundary({ ...descriptor, endpoints: [points[0], points[30]] }, [{ closed: true, points }]), null);
  assert.equal(circularMeshBoundary(descriptor, [{ closed: false, points }]), null);
});
