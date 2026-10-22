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
