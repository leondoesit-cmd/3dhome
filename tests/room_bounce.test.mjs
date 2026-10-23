// The planner's indirect light (js/room_bounce.js): split-flux interreflection
// per room, drawn into a plan map that the one bounce light reads. Behaviour,
// not source text: what lands in which room.
import test from "node:test";
import assert from "node:assert/strict";
import {
  GRID,
  pointFlux,
  spotFlux,
  roomArea,
  roomSurface,
  splitFluxIrradiance,
  rasterRooms,
  roomAt,
  roomIrradiance,
  NORMAL_REACH_CM,
  UNMASKED,
  SKY_ONLY,
  roomNumberAt,
  lightMaskRoom,
  facingRoom,
  maskAdmits,
  skyAdmits,
  ceilingTop,
  packPlanMap,
} from "../js/room_bounce.js";

const rect = (x0, z0, x1, z1, ceilH = 250) => ({
  pts: [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }],
  ceilH,
});
// two 4 × 4 m rooms sharing the wall at x = 400
const lounge = rect(0, 0, 400, 400);
const bath = rect(400, 0, 800, 400);
const WHITE = [1, 1, 1];

test("light entering one room never reaches the room behind its wall", () => {
  const rooms = [lounge, bath];
  const window = { x: 10, z: 200, flux: spotFlux(5e6, Math.PI * 0.44, 1), color: WHITE };
  const [inLounge, inBath] = roomIrradiance(rooms, [window], 0.5);
  assert.ok(inLounge[0] > 0, "the room with the window is lit");
  assert.deepEqual(inBath, [0, 0, 0], "the windowless room beside it stays dark");
});

test("the plan map gives each texel to the room it lies in, walls exactly", () => {
  const grid = rasterRooms([lounge, bath]);
  assert.equal(grid.size, GRID);
  assert.equal(roomAt(grid, 200, 200), 0);
  assert.equal(roomAt(grid, 600, 200), 1);
  // a wall face samples 15 cm out along its normal (see createRoomBounce):
  // either side of the shared wall lands in its own room
  assert.equal(roomAt(grid, 400 - 15, 200), 0);
  assert.equal(roomAt(grid, 400 + 15, 200), 1);
  // the padded margin round the house is outside every room
  assert.equal(roomAt(grid, -20, 200), -1);
  assert.equal(roomAt(grid, 820, 200), -1);
});

test("an L-shaped room is filled along its outline, not its bounding box", () => {
  const L = {
    pts: [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 300 }, { x: 300, z: 300 }, { x: 300, z: 600 }, { x: 0, z: 600 }],
    ceilH: 250,
  };
  const grid = rasterRooms([L]);
  assert.equal(roomAt(grid, 150, 450), 0);
  assert.equal(roomAt(grid, 450, 150), 0);
  assert.equal(roomAt(grid, 450, 450), -1, "the notch is not part of the room");
});

test("a 30 m house still fits the fixed-size map", () => {
  const grid = rasterRooms([rect(0, 0, 3000, 1200), rect(0, 1200, 900, 2000)]);
  assert.equal(grid.size, GRID);
  assert.equal(grid.index.length, GRID * GRID);
  assert.ok(grid.cell < 7, "a few centimetres per texel");
  assert.equal(roomAt(grid, 2900, 100), 0);
  assert.equal(roomAt(grid, 800, 1900), 1);
});

test("split-flux: Φρ / (A(1−ρ)) over floor, ceiling and walls", () => {
  assert.equal(roomArea(lounge.pts), 160000);
  assert.equal(roomSurface(lounge), 2 * 160000 + 1600 * 250);
  const A = roomSurface(lounge);
  assert.equal(splitFluxIrradiance(1000, A, 0.5), 1000 / A);
  assert.equal(splitFluxIrradiance(0, A, 0.5), 0);
  const [e] = roomIrradiance([lounge], [{ x: 200, z: 200, flux: 1000, color: [1, 0.5, 0] }], 0.5);
  assert.deepEqual(e, [1000 / A, 500 / A, 0], "the bounce keeps the colour of the light that came in");
});

test("flux of three's lights: 4πI for a point, the smoothstep cone for a spot", () => {
  assert.equal(pointFlux(10), 40 * Math.PI);
  assert.equal(pointFlux(-1), 0);
  // a hard-edged spot: the full cone
  const a = Math.PI / 3;
  assert.ok(Math.abs(spotFlux(1, a, 0) - 2 * Math.PI * (1 - Math.cos(a))) < 1e-12);
  // penumbra 1: numeric integral of smoothstep(cos a, 1, cos θ) over the sphere
  const n = 20000;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) / n) * a, x = (Math.cos(t) - Math.cos(a)) / (1 - Math.cos(a));
    sum += x * x * (3 - 2 * x) * Math.sin(t) * (a / n);
  }
  assert.ok(Math.abs(spotFlux(1, a, 1) - 2 * Math.PI * sum) < 1e-4);
});

test("a source outside every room lights none of them", () => {
  const out = roomIrradiance([lounge, bath], [{ x: -300, z: 200, flux: 1e6, color: WHITE }], 0.5);
  assert.deepEqual(out, [[0, 0, 0], [0, 0, 0]]);
});

/* ---- the masks: the plan map stops what has no shadow map ----
   A surface is a point and the normal of the face it lies on; the map gives
   it a room number (0 outside), as each fragment reads it on the GPU. */
const WALL_T = 12;
const twoRooms = [lounge, bath];
const grid2 = rasterRooms(twoRooms);
const surface = (x, z, nx = 0, nz = 0, y = 100, ny = 0) => ({ room: facingRoom(grid2, x, z, nx, nz), y, ny });
const reaches = (maskRoom, s) => maskAdmits(maskRoom, s.room, skyAdmits(s.room, s.y, s.ny, ceilingTop(twoRooms)));
// the faces of the shared wall at x = 400, and of the lounge's outer wall at x = 0
const loungeSide = surface(400 - WALL_T / 2, 200, -1, 0);
const bathSide = surface(400 + WALL_T / 2, 200, 1, 0);
const facade = surface(-WALL_T / 2, 200, -1, 0);
const loungeInside = surface(WALL_T / 2, 200, 1, 0);

test("a lamp without a shadow lights its own room and stops at the wall", () => {
  // a floor lamp 35 cm from the partition: its sphere of light crosses it
  const mask = lightMaskRoom(twoRooms, 365, 200, false);
  assert.equal(mask, 1);
  assert.ok(reaches(mask, surface(200, 200, 0, 0, 0, 1)), "the lounge floor");
  assert.ok(reaches(mask, loungeSide), "its own face of the partition");
  assert.ok(!reaches(mask, bathSide), "not the bathroom's face of it");
  assert.ok(!reaches(mask, surface(450, 200, 0, 0, 0, 1)), "nor the bathroom floor just behind it");
  assert.ok(!reaches(mask, facade), "nor the house's outside");
});

test("a light that casts is left to its shadow map", () => {
  const mask = lightMaskRoom(twoRooms, 365, 200, true);
  assert.equal(mask, UNMASKED);
  // the shadow stops it at the wall and lets it through a doorway; the mask must not do either
  assert.ok(reaches(mask, bathSide));
});

test("a lamp in the garden lights the facade, not the rooms behind it", () => {
  const mask = lightMaskRoom(twoRooms, -120, 200, false);
  assert.equal(mask, 0);
  assert.ok(reaches(mask, facade));
  assert.ok(!reaches(mask, loungeInside), "the inner face of the same wall stays dark");
});

test("the sky reaches only what no ceiling covers", () => {
  const top = ceilingTop(twoRooms);
  assert.equal(top, 250);
  const sky = (s) => reaches(SKY_ONLY, s);
  assert.ok(!sky(surface(600, 200, 0, 0, 0, 1)), "a windowless room's floor, under its hidden ceiling");
  assert.ok(!sky(bathSide), "or its walls");
  assert.ok(!sky(surface(600, 200, 0, 0, 250, -1)), "or the underside of its ceiling");
  assert.ok(sky(surface(600, 200, 0, 0, 250, 1)), "the top of a flat roof is under the sky");
  assert.ok(sky(surface(600, 200, 0, 0, 330, 0)), "and so is everything above the ceilings");
  assert.ok(sky(facade), "an outer wall face");
  assert.ok(sky(surface(-200, 200, 0, 0, 0, 1)), "the garden");
  // a surface's room is read NORMAL_REACH_CM out along its normal: further than half a wall
  assert.ok(NORMAL_REACH_CM > WALL_T / 2);
});

test("a taller room raises the line the sky starts at", () => {
  assert.equal(ceilingTop([lounge, rect(400, 0, 800, 400, 320)]), 320);
  assert.equal(ceilingTop([], 250), 250);
});

test("the map's alpha is the room number the lights are masked to", () => {
  const out = packPlanMap(grid2, [[1, 2, 3], [4, 5, 6]], (v) => v, new Float32Array(GRID * GRID * 4));
  const at = (x, z) => {
    const i = Math.floor((x - grid2.x0) / grid2.cell), j = Math.floor((z - grid2.z0) / grid2.cell);
    return Array.from(out.slice((j * GRID + i) * 4, (j * GRID + i) * 4 + 4));
  };
  assert.deepEqual(at(200, 200), [1, 2, 3, roomNumberAt(twoRooms, 200, 200)]);
  assert.deepEqual(at(600, 200), [4, 5, 6, roomNumberAt(twoRooms, 600, 200)]);
  assert.deepEqual(at(-20, 200), [0, 0, 0, 0], "outside every room: no bounce, room 0");
  assert.equal(roomNumberAt(twoRooms, 600, 200), 2);
  assert.equal(roomNumberAt(twoRooms, -20, 200), 0);
});
