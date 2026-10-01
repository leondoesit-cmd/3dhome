import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseTopologyHit,
  circularEdgeSweep,
  filterTopologyHitsByClipPlane,
  topologyCandidateWorldThreshold,
  topologyLineWorldThreshold,
  topologyPickPixelRadius,
} from "../js/modeler_topology_pick.js";

const face = (distance = 20) => ({ id: "face", distance, face: { normal: { x: 0, y: 0, z: 1 } }, object: { userData: {} } });
const edge = (miss, distance = 20, visible = true, id = "edge") => ({
  id,
  distance,
  distanceToRay: miss,
  object: { userData: { cadTopology: { kind: "edge", persistentId: id }, cadPickVisible: visible } },
});

test("topology acquisition uses stable CAD-sized pixel bands", () => {
  assert.equal(topologyPickPixelRadius("mouse", "all", false), 5);
  assert.equal(topologyPickPixelRadius("touch", "all", false), 10);
  assert.equal(topologyPickPixelRadius("mouse", "edge", false), 8);
  assert.equal(topologyPickPixelRadius("touch", "edge", false), 14);
  assert.equal(topologyPickPixelRadius("mouse", "all", true), 7);
  assert.equal(topologyPickPixelRadius("mouse", "face", false), 0);
  assert.equal(topologyLineWorldThreshold(0.25, 8), 2);
  assert.equal(topologyCandidateWorldThreshold(0.25, 1.5, 5), 7.5);
});

test("a cut-open near-complete circular edge never closes across its missing segment", () => {
  const radius = 20;
  const missing = Math.PI / 10;
  const represented = Math.PI * 2 - missing;
  const arc = circularEdgeSweep(radius, represented * radius, 0, -missing, true);
  assert.ok(Math.abs(Math.abs(arc.sweep) - represented) < 1e-9);
  assert.notEqual(Math.abs(arc.sweep), Math.PI * 2);
  assert.equal(circularEdgeSweep(radius, Math.PI * 2 * radius, 0, 0, false).sweep, Math.PI * 2);
});

test("section clipping removes hits on the discarded side before arbitration", () => {
  const kept = { point: { x: 2 } };
  const clipped = { point: { x: -2 } };
  const plane = { distanceToPoint: (point) => point.x };
  assert.deepEqual(filterTopologyHitsByClipPlane([clipped, kept], plane), [kept]);
});

test("slot semicircles use the kernel midpoint to choose the correct side", () => {
  const radius = .635;
  const start = -Math.PI / 2, end = Math.PI / 2;
  assert.equal(circularEdgeSweep(radius, Math.PI * radius, start, end, true, 0).sweep, Math.PI);
  assert.equal(circularEdgeSweep(radius, Math.PI * radius, start, end, true, Math.PI).sweep, -Math.PI);
  // Reverse endpoint order and cross the angle wrap without changing the arc.
  assert.equal(circularEdgeSweep(radius, Math.PI * radius, end, start, true, -Math.PI).sweep, Math.PI);
  assert.equal(circularEdgeSweep(radius, Math.PI * radius, end, start, true, 0).sweep, -Math.PI);
});

test("All picks the face unless an edge is actually inside the pixel band", () => {
  const surface = face();
  const outside = edge(1.26);
  const inside = edge(1.24);
  assert.equal(chooseTopologyHit([outside, surface], { worldPerPixel: 0.25, pixelRadius: 5 }).chosenHit, surface);
  assert.equal(chooseTopologyHit([surface, inside], { worldPerPixel: 0.25, pixelRadius: 5 }).chosenHit, inside);
});

test("each candidate is measured at its own perspective depth", () => {
  const surface = face();
  const visuallyOutside = Object.assign(edge(1.24), { pickWorldPerPixel: 0.2 });
  const visuallyInside = Object.assign(edge(0.99), { pickWorldPerPixel: 0.2 });
  assert.equal(chooseTopologyHit([visuallyOutside, surface], {
    worldPerPixel: 0.25, pixelRadius: 5,
  }).chosenHit, surface);
  assert.equal(chooseTopologyHit([visuallyInside, surface], {
    worldPerPixel: 0.25, pixelRadius: 5,
  }).chosenHit, visuallyInside);
});

test("the closest cursor-to-edge candidate wins instead of ray depth order", () => {
  const fartherFromCursor = Object.assign(edge(0.4, 19.9, true, "farther-cursor"), { pickWorldPerPixel: 0.1 });
  const nearerCursor = Object.assign(edge(0.6, 20.05, true, "nearer-cursor"), { pickWorldPerPixel: 0.3 });
  assert.equal(chooseTopologyHit([fartherFromCursor, nearerCursor, face()], {
    worldPerPixel: 0.25, pixelRadius: 5,
  }).edgeHit.id, "nearer-cursor");
});

test("an edge hidden behind the hit face cannot steal the pick", () => {
  const surface = face(20);
  const occluded = edge(0.1, 21, true);
  const result = chooseTopologyHit([surface, occluded], { worldPerPixel: 0.25, pixelRadius: 5 });
  assert.equal(result.chosenHit, surface);
  assert.equal(result.edgeHit, null);
});

test("sub-pixel depth noise is tolerated but a thin wall's rear edge is not", () => {
  const surface = Object.assign(face(20), { pickWorldPerPixel: 0.5 });
  const coincidentNoise = edge(0.05, 20.1, true, "front-edge");
  const rearSheetEdge = edge(0.01, 20.2, true, "rear-edge");
  assert.equal(chooseTopologyHit([surface, coincidentNoise], {
    worldPerPixel: 0.5, pixelRadius: 5,
  }).chosenHit, coincidentNoise);
  assert.equal(chooseTopologyHit([surface, rearSheetEdge], {
    worldPerPixel: 0.5, pixelRadius: 5,
  }).chosenHit, surface);
});

test("transparent display permits a visible interior edge without enabling invisible overlays", () => {
  const surface = face(20);
  const interior = edge(0.1, 21, true, "interior");
  const invisible = edge(0.05, 22, false, "invisible");
  const result = chooseTopologyHit([surface, interior, invisible], {
    transparent: true, worldPerPixel: 0.25, pixelRadius: 5,
  });
  assert.equal(result.chosenHit, interior);
});

test("a corner tie is deterministic instead of depending on scene insertion order", () => {
  const a = edge(0, 20, true, "a-edge");
  const z = edge(0, 20, true, "z-edge");
  assert.equal(chooseTopologyHit([z, a, face()], {
    worldPerPixel: 0.25, pixelRadius: 5,
  }).chosenHit, a);
});

test("hidden model edges do not capture All but remain available in Edge filter", () => {
  const hidden = edge(0.1, 20, false);
  const surface = face();
  assert.equal(chooseTopologyHit([hidden, surface], {
    prefer: "all", worldPerPixel: 0.25, pixelRadius: 5,
  }).chosenHit, surface);
  assert.equal(chooseTopologyHit([hidden, surface], {
    prefer: "edge", worldPerPixel: 0.25, pixelRadius: 8,
  }).chosenHit, hidden);
  assert.equal(chooseTopologyHit([hidden], {
    prefer: "all", worldPerPixel: 0.25, pixelRadius: 5,
  }).chosenHit, null);
});

test("Face filter never promotes an overlapping edge", () => {
  const surface = face();
  const overlapping = edge(0);
  const result = chooseTopologyHit([overlapping, surface], {
    prefer: "face", worldPerPixel: 0.25, pixelRadius: 0,
  });
  assert.equal(result.chosenHit, surface);
  assert.equal(result.edgeHit, null);
});
