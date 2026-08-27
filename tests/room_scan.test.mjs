import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRoomScan, roomScanFromPoints, scanBounds, RoomScanError,
  roomScanArIssue, roomScanArStartIssue, appendRoomScanPoint,
  insetScan, squareScan, scanSelfIntersects, scanArea, scaleScan,
  scanObjectType, scanOrthoAngle, hitPoseIsFloor, hitIsRaised,
} from "../js/room_scan.js";

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

test("mobile AR preflight reports the concrete blocker", () => {
  assert.equal(roomScanArIssue({ secureContext: false, appleMobile: false, xrApi: true }), "insecure");
  assert.equal(roomScanArIssue({ secureContext: true, appleMobile: true, xrApi: false }), "apple-mobile");
  assert.equal(roomScanArIssue({ secureContext: true, appleMobile: false, xrApi: false }), "no-webxr");
  assert.equal(roomScanArIssue({ secureContext: true, appleMobile: false, xrApi: true, sessionSupported: false }), "unsupported");
  assert.equal(roomScanArIssue({ secureContext: true, appleMobile: false, xrApi: true, sessionSupported: true }), null);
  assert.equal(roomScanArStartIssue({ name: "NotAllowedError" }), "permission");
  assert.equal(roomScanArStartIssue({ name: "SecurityError" }), "insecure");
});

test("AR corner capture rejects an accidental double tap", () => {
  const points = [];
  assert.equal(appendRoomScanPoint(points, { x: 20, z: 30 }), true);
  assert.equal(appendRoomScanPoint(points, { x: 25, z: 35 }), false);
  assert.equal(appendRoomScanPoint(points, { x: 120, z: 30 }), true);
  assert.deepEqual(points, [{ x: 20, z: 30 }, { x: 120, z: 30 }]);
});

test("wall records out of loop order still offset to a clean rectangle", () => {
  // RoomPlan lists surfaces in scan order, so two opposite walls can sit next
  // to each other in the array; joining corners by array index mangled those.
  const wall = (x, z, width, axisX, axisZ) => ({
    dimensions: [width, 2.7, 0.12], transform: transform(x, z, axisX, axisZ),
  });
  const result = parseRoomScan({
    unit: "m",
    walls: [wall(2, 0, 4, 1, 0), wall(2, 3, 4, 1, 0), wall(4, 1.5, 3, 0, 1), wall(0, 1.5, 3, 0, 1)],
    doors: [{ dimensions: [0.9, 2.05, 0.1], transform: transform(2, 0) }],
  });
  insetScan(result, 1);
  const bounds = scanBounds(result);
  // every edge pushed out by half of the 12 cm wall, corners still square
  assert.ok(Math.abs(bounds.width - 412) < 1e-6);
  assert.ok(Math.abs(bounds.depth - 312) < 1e-6);
  result.cad.lines.forEach((line) => {
    const horizontal = Math.abs(line.a.z - line.b.z) < 1e-6;
    assert.ok(horizontal || Math.abs(line.a.x - line.b.x) < 1e-6, "wall stayed axis aligned");
  });
  // the opening rides its own wall out instead of being left proud of it
  assert.ok(Math.abs(result.cad.doors[0].center.z - -6) < 1e-6);
});

test("a contiguous AR loop still offsets outward by half a wall", () => {
  const result = roomScanFromPoints(
    [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }], { thicknessCm: 20 });
  insetScan(result, 1);
  const bounds = scanBounds(result);
  assert.ok(Math.abs(bounds.minX - -10) < 1e-6);
  assert.ok(Math.abs(bounds.maxZ - 310) < 1e-6);
});

const angles = (result) => result.cad.lines
  .map((line) => Math.round(Math.atan2(line.b.z - line.a.z, line.b.x - line.a.x) * 180 / Math.PI));

test("squaring straightens a hand-tapped trace onto the plan grid", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 401, z: 9 }, { x: 392, z: 305 }, { x: -6, z: 298 },
  ]);
  squareScan(result);
  assert.equal(result.squaredCount, 4);
  assert.deepEqual(angles(result), [0, 90, -180, -90]);
  // straightening corrects the shape, it must not resize the room
  const bounds = scanBounds(result);
  assert.ok(Math.abs(bounds.width - 400) < 3, "width " + bounds.width);
  assert.ok(Math.abs(bounds.depth - 300) < 5, "depth " + bounds.depth);
});

test("squaring keeps a wall that was genuinely measured on the diagonal", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 2 }, { x: 400, z: 200 }, { x: 250, z: 300 }, { x: 0, z: 300 },
  ]);
  squareScan(result);
  assert.deepEqual(angles(result), [0, 90, 146, 180, -90]);
});

test("squaring reports no work on a capture that is already square", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }]);
  const before = JSON.stringify(result.cad.lines);
  squareScan(result);
  assert.equal(result.squaredCount, undefined);
  assert.equal(JSON.stringify(result.cad.lines), before);
});

test("corners marked out of order are reported as a crossed trace", () => {
  const bowtie = roomScanFromPoints([{ x: 0, z: 0 }, { x: 400, z: 300 }, { x: 400, z: 0 }, { x: 0, z: 300 }]);
  assert.equal(scanSelfIntersects(bowtie), true);
  const room = roomScanFromPoints([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }]);
  assert.equal(scanSelfIntersects(room), false);
  const lShape = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 150 },
    { x: 200, z: 150 }, { x: 200, z: 300 }, { x: 0, z: 300 }]);
  assert.equal(scanSelfIntersects(lShape), false, "a concave room is not a crossed one");
});

test("empty wall records are dropped instead of inflating the count", () => {
  const result = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [300, 0] },
      { start: [300, 0], end: [300, 0] },
      { start: [300, 0], end: [300, 300] },
      { start: [300, 300], end: [0, 300] },
      { start: [0, 300], end: [0, 0] },
    ],
  });
  assert.equal(result.wallCount, 4);
  assert.equal(result.droppedCount, 1);
  assert.ok(result.cad.lines.every((l) => Math.hypot(l.b.x - l.a.x, l.b.z - l.a.z) > 0));
});

test("RoomPlan's confidence enum is read, not silently discarded", () => {
  const result = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [300, 0], confidence: "high" },
      { start: [300, 0], end: [300, 300], confidence: "low" },
      { start: [300, 300], end: [0, 300], confidence: "medium" },
      { start: [0, 300], end: [0, 0], confidence: "high" },
    ],
  });
  assert.ok(result.averageConfidence > 0.5 && result.averageConfidence < 1);
  assert.equal(result.lowConfidenceCount, 1);
  // a numeric confidence from a third-party bridge still works
  const numeric = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [300, 0], confidence: 0.9 },
      { start: [300, 0], end: [300, 300], confidence: 0.9 },
      { start: [300, 300], end: [0, 300], confidence: 0.9 },
    ],
  });
  assert.ok(Math.abs(numeric.averageConfidence - 0.9) < 1e-9);
});

test("AR support is judged on WebXR, not on the device being an iPhone", () => {
  // an iOS browser that does ship WebXR must not be told AR is unavailable
  assert.equal(roomScanArIssue({ secureContext: true, appleMobile: true, xrApi: true, sessionSupported: true }), null);
  assert.equal(roomScanArIssue({ secureContext: true, appleMobile: true, xrApi: true, sessionSupported: false }), "apple-mobile");
});

test("imported walls are stored in loop order so the floor fill is a room", () => {
  // the preview traces line.a in array order; scan order drew an hourglass
  const wall = (x, z, width, axisX, axisZ) => ({
    dimensions: [width, 2.7, 0.12], transform: transform(x, z, axisX, axisZ),
  });
  const result = parseRoomScan({
    unit: "m",
    walls: [wall(2, 0, 4, 1, 0), wall(2, 3, 4, 1, 0), wall(4, 1.5, 3, 0, 1), wall(0, 1.5, 3, 0, 1)],
  });
  result.cad.lines.forEach((line, i) => {
    const next = result.cad.lines[(i + 1) % result.cad.lines.length];
    assert.ok(Math.hypot(line.b.x - next.a.x, line.b.z - next.a.z) < 1,
      "wall " + i + " ends where wall " + (i + 1) + " begins");
  });
});

test("wall planes that stop short of the corners are welded to the intersection", () => {
  // RoomPlan fits planes to the visible wall, so the loop is a ring of near
  // misses; past the graph's merge tolerance the room never closes at all
  const short = (x, z, width, axisX, axisZ) => ({
    dimensions: [width, 2.7, 0.12], transform: transform(x, z, axisX, axisZ),
  });
  const result = parseRoomScan({
    unit: "m",
    walls: [
      short(2, 0, 3.7, 1, 0), short(4, 1.5, 2.7, 0, 1),
      short(2, 3, 3.7, 1, 0), short(0, 1.5, 2.7, 0, 1),
    ],
  });
  result.cad.lines.forEach((line, i) => {
    const next = result.cad.lines[(i + 1) % result.cad.lines.length];
    assert.ok(Math.hypot(line.b.x - next.a.x, line.b.z - next.a.z) < 1e-6, "corner " + i + " welded");
  });
  // welding restores the full room, not the shortened planes
  const bounds = scanBounds(result);
  assert.ok(Math.abs(bounds.width - 400) < 1e-6, "width " + bounds.width);
  assert.ok(Math.abs(bounds.depth - 300) < 1e-6, "depth " + bounds.depth);
});

test("a tape reading rescales measured sections but not nominal ones", () => {
  const traced = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }]);
  scaleScan(traced, 500, traced.cad.lines[0].a, traced.cad.lines[0].b);
  // an AR trace never measured a wall section; 10 cm is a constant
  assert.equal(traced.cad.lines[0].thickness, 10);
  assert.equal(Math.round(scanBounds(traced).width), 500, "the plan itself still scales");

  const measured = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [400, 0], thickness: 12 },
      { start: [400, 0], end: [400, 300], thickness: 12 },
      { start: [400, 300], end: [0, 300], thickness: 12 },
      { start: [0, 300], end: [0, 0], thickness: 12 },
    ],
  });
  scaleScan(measured, 500, measured.cad.lines[0].a, measured.cad.lines[0].b);
  // a mis-scaled capture got the measured section wrong too
  assert.equal(measured.cad.lines[0].thickness, 15);
});

test("floor area and room size are reported from the scan", () => {
  const result = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }]);
  assert.equal(scanArea(result), 120000); // cm², 12 m²
  const lShape = roomScanFromPoints([
    { x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 150 },
    { x: 200, z: 150 }, { x: 200, z: 300 }, { x: 0, z: 300 }]);
  assert.equal(scanArea(lShape), 400 * 150 + 200 * 150);
});

test("RoomPlan furniture becomes placeable catalog items", () => {
  const result = parseRoomScan({
    unit: "m",
    walls: [
      { start: [0, 0], end: [4, 0] }, { start: [4, 0], end: [4, 3] },
      { start: [4, 3], end: [0, 3] }, { start: [0, 3], end: [0, 0] },
    ],
    objects: [
      { category: "bed", dimensions: [1.6, 0.5, 2.0], transform: transform(1.2, 1.0) },
      // the wall-facing TV is rotated a quarter turn by its own transform
      { category: "television", dimensions: [1.2, 0.7, 0.08], transform: transform(3.8, 1.5, 0, 1) },
      { category: "washerDryer", dimensions: [0.6, 0.85, 0.6], transform: transform(0.4, 2.6) },
      { category: "somethingElse", dimensions: [1, 1, 1], transform: transform(2, 2) },
    ],
  });
  assert.equal(result.objectCount, 3, "an unmapped category is skipped, not guessed at");
  const bed = result.cad.objects[0];
  assert.equal(bed.type, "bed");
  assert.deepEqual(bed.center, { x: 120, z: 100 });
  assert.equal(bed.w, 160);
  assert.equal(bed.d, 200);   // RoomPlan's Z extent is the planner's depth
  assert.equal(bed.h, 50);
  assert.equal(Math.round(bed.rot), 0);
  assert.equal(Math.round(result.cad.objects[1].rot), 90);
  assert.equal(result.cad.objects[2].type, "washer");
});

test("RoomPlan categories map onto the catalog, unknown ones do not", () => {
  assert.equal(scanObjectType("refrigerator"), "fridge");
  assert.equal(scanObjectType("washerDryer"), "washer");
  assert.equal(scanObjectType("Storage"), "wardrobe");
  assert.equal(scanObjectType("television"), "tv");
  assert.equal(scanObjectType("wombat"), null);
  assert.equal(scanObjectType(null), null);
});

test("furniture rides along when the room is scaled or squared", () => {
  const build = () => parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [401, 9] }, { start: [401, 9], end: [392, 305] },
      { start: [392, 305], end: [-6, 298] }, { start: [-6, 298], end: [0, 0] },
    ],
    objects: [{ category: "bed", dimensions: [160, 50, 200], transform: transform(200, 150) }],
  });

  const scaled = build();
  const before = { ...scaled.cad.objects[0].center };
  scaleScan(scaled, 802, scaled.cad.lines[0].a, scaled.cad.lines[0].b); // k = 2
  const after = scaled.cad.objects[0];
  assert.equal(Math.round(after.w), 320, "a mis-scaled capture got the bed wrong too");
  assert.ok(Math.abs(after.center.x - before.x) > 1, "and moved it with the room");

  // squaring absorbs the room's tilt, so the bed must turn with the walls
  const squared = build();
  const tilt = squared.cad.objects[0].rot;
  squareScan(squared);
  assert.ok(squared.squaredCount > 0);
  assert.ok(Math.abs(squared.cad.objects[0].rot - tilt) > 0.5,
    "the bed rotated with the room, not against it");
});

test("the face offset moves walls to their centre-line and leaves furniture", () => {
  const result = parseRoomScan({
    unit: "cm",
    walls: [
      { start: [0, 0], end: [400, 0], thickness: 20 }, { start: [400, 0], end: [400, 300], thickness: 20 },
      { start: [400, 300], end: [0, 300], thickness: 20 }, { start: [0, 300], end: [0, 0], thickness: 20 },
    ],
    objects: [{ category: "sofa", dimensions: [200, 80, 90], transform: transform(200, 150) }],
  });
  const where = { ...result.cad.objects[0].center };
  insetScan(result, 1);
  assert.deepEqual(result.cad.objects[0].center, where);
});

test("a live corner reports the angle it would turn through", () => {
  assert.equal(scanOrthoAngle({ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }), 90);
  assert.ok(Math.abs(scanOrthoAngle({ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 109, z: 100 }) - 95.1) < 0.2);
  // a reflex turn is reported as its own interior angle, never over 180
  assert.ok(scanOrthoAngle({ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: -100 }) <= 180);
  assert.equal(scanOrthoAngle(null, { x: 0, z: 0 }, { x: 1, z: 1 }), null, "the first corner has no angle");
  assert.equal(scanOrthoAngle({ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 0 }), null, "no angle to a point on itself");
});

test("a hit on a wall is told apart from a hit on the floor", () => {
  const half = Math.SQRT1_2;
  assert.equal(hitPoseIsFloor({ x: 0, y: 0, z: 0, w: 1 }), true, "floor");
  assert.equal(hitPoseIsFloor({ x: 0, y: half, z: 0, w: half }), true, "floor, turned about its own normal");
  assert.equal(hitPoseIsFloor({ x: half, y: 0, z: 0, w: half }), false, "wall");
  assert.equal(hitPoseIsFloor({ x: 0, y: 0, z: half, w: half }), false, "wall");
  // a ceiling is horizontal; it is the tilt that matters, not the direction
  assert.equal(hitPoseIsFloor({ x: 1, y: 0, z: 0, w: 0 }), true);
  assert.equal(hitPoseIsFloor(null), true, "no orientation reported: trust the hit");
});

test("a raised horizontal plane is furniture, not the floor", () => {
  // plane detection returns table tops and beds as readily as the floor
  assert.equal(hitIsRaised(0, 0), false);
  assert.equal(hitIsRaised(12, 0), false, "a rug or a threshold is still the floor");
  assert.equal(hitIsRaised(75, 0), true, "a table top");
  assert.equal(hitIsRaised(55, 0), true, "a bed");
  // without a local-floor reference space, y=0 is wherever the device woke up
  assert.equal(hitIsRaised(-120, -155), false, "floor, measured from a device origin");
  assert.equal(hitIsRaised(-80, -155), true, "table, measured from the same origin");
  assert.equal(hitIsRaised(NaN, 0), false, "an unreadable height blocks nothing");
});
