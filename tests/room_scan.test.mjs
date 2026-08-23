import test from "node:test";
import assert from "node:assert/strict";
import { parseRoomScan, roomScanFromPoints, scanBounds, RoomScanError } from "../js/room_scan.js";

function transform(x, z, axisX = 1, axisZ = 0) {
  return [
    axisX, 0, axisZ, 0,
    0, 1, 0, 0,
    -axisZ, 0, axisX, 0,
    x, 0, z, 1,
  ];
}

test("Apple CapturedRoom walls become centimetre centre-lines with openings", () => {
  const wall = (x, z, width, axisX, axisZ) => ({
    dimensions: [width, 2.7, 0.12],
    transform: transform(x, z, axisX, axisZ),
    confidence: 0.9,
  });
  const result = parseRoomScan({
    format: "CapturedRoom.RoomPlan",
    unit: "m",
    walls: [
      wall(2, 0, 4, 1, 0), wall(4, 1.5, 3, 0, 1),
      wall(2, 3, 4, 1, 0), wall(0, 1.5, 3, 0, 1),
    ],
    doors: [{ dimensions: [0.9, 2.05, 0.1], transform: transform(2, 0) }],
    windows: [{ dimensions: [1.2, 1.1, 0.1], transform: transform(4, 1.5), sillHeight: 0.85 }],
  });

  assert.equal(result.source, "Apple RoomPlan");
  assert.equal(result.wallCount, 4);
  assert.equal(result.openingCount, 2);
  assert.equal(result.cad.lines[0].a.x, 0);
  assert.equal(result.cad.lines[0].b.x, 400);
  assert.equal(result.cad.lines[0].height, 270);
  assert.equal(result.cad.lines[0].thickness, 12);
  assert.equal(result.cad.doors[0].width, 90);
  assert.equal(result.cad.windows[0].sill, 85);
  assert.ok(Math.abs(result.averageConfidence - 0.9) < 1e-9);
  assert.deepEqual(scanBounds(result), { minX: 0, minZ: 0, maxX: 400, maxZ: 300, width: 400, depth: 300 });
});

test("simple bridge JSON with endpoints and centimetre units is accepted", () => {
  const result = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0, 0], end: [320, 0, 0], height: 250, thickness: 9 },
      { start: [320, 0, 0], end: [320, 0, 240], height: 250, thickness: 9 },
      { start: [320, 0, 240], end: [0, 0, 240], height: 250, thickness: 9 },
      { start: [0, 0, 240], end: [0, 0, 0], height: 250, thickness: 9 },
    ],
  });
  assert.equal(result.wallCount, 4);
  assert.equal(result.cad.lines[1].b.z, 240);
  assert.equal(result.cad.lines[1].height, 250);
});

test("missing wall section values use centimetre defaults in every source unit", () => {
  const result = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [300, 0] },
      { start: [300, 0], end: [300, 300] },
      { start: [300, 300], end: [0, 300] },
      { start: [0, 300], end: [0, 0] },
    ],
  });
  assert.equal(result.cad.lines[0].height, 270);
  assert.equal(result.cad.lines[0].thickness, 10);
});

test("WebXR corner trace closes the loop and keeps dimensioned bounds", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 410, z: 0 }, { x: 410, z: 305 }, { x: 0, z: 305 },
  ], { heightCm: 280, thicknessCm: 12 });
  assert.equal(result.source, "WebXR AR");
  assert.equal(result.wallCount, 4);
  assert.deepEqual(result.cad.lines[3].b, { x: 0, z: 0 });
  assert.equal(result.cad.lines[2].height, 280);
  assert.deepEqual(scanBounds(result), { minX: 0, minZ: 0, maxX: 410, maxZ: 305, width: 410, depth: 305 });
});

test("invalid and incomplete scans report actionable error kinds", () => {
  assert.throws(() => parseRoomScan("not json"), (error) => error instanceof RoomScanError && error.kind === "bad-json");
  assert.throws(() => parseRoomScan({ walls: [] }), (error) => error instanceof RoomScanError && error.kind === "no-walls");
  assert.throws(() => roomScanFromPoints([{ x: 0, z: 0 }, { x: 1, z: 1 }]), (error) => error.kind === "no-walls");
});
