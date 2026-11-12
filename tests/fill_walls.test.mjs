import test from "node:test";
import assert from "node:assert/strict";
import { fillWalls, fillFootprint, fillRooms, wallAgreement } from "../js/plan_recog/fill_walls.js";
import { judgeFill } from "../tools/plan_triage_lib.mjs";

// Sheet units = cm (cmPerUnit 1). A 10 x 8 m flat whose walls are grey
// filled rectangles with no outline: 20 cm outer walls with a 100 cm door
// gap and a 200 cm window gap, a 10 cm partition splitting it 6 / 4, plus
// distractors: a big grey sidebar panel (as on marketing sheets), a green
// sofa, and a white page background.
const GREY = [208, 208, 216], GREEN = [72, 152, 104], WHITE = [255, 255, 255];
const rect = (x0, y0, x1, y1) => ({ points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true });
const filled = (fill, ...subpaths) => ({ fill, stroke: null, subpaths, lineWidth: 0 });
const prims = {
  width: 1600, height: 1200, texts: [],
  paths: [
    filled(WHITE, rect(0, 0, 1600, 1200)),
    filled(GREY, rect(300, 200, 1300, 220)), // top
    filled(GREY, rect(300, 980, 700, 1000), rect(800, 980, 1300, 1000)), // bottom, door 700-800
    filled(GREY, rect(300, 200, 320, 1000)), // left
    filled(GREY, rect(1280, 200, 1300, 400), rect(1280, 600, 1300, 1000)), // right, window 400-600
    filled(GREY, rect(895, 220, 905, 550), rect(895, 650, 905, 980)), // partition with a door
    filled(GREY, rect(1400, 0, 1600, 1200)), // sidebar panel: far too thick for a wall
    filled(GREEN, rect(400, 300, 600, 380)), // sofa
  ],
};

test("fill walls: the wall colour wins, panels and furniture are left out", () => {
  const walls = fillWalls(prims, 1);
  assert.ok(walls);
  assert.deepEqual(walls.colours.map((c) => c.rgb), [GREY]);
  assert.ok(walls.colours[0].thicknessCm > 12 && walls.colours[0].thicknessCm < 30, `thickness ${walls.colours[0].thicknessCm}`);
  assert.ok(walls.lengthM > 30 && walls.lengthM < 45, `wall length ${walls.lengthM} m`);
  const at = (x, y) => walls.mask[Math.floor((y - walls.y0) / walls.cell) * walls.w + Math.floor((x - walls.x0) / walls.cell)];
  assert.equal(at(310, 600), 1, "left wall");
  assert.equal(at(1500, 600), 0, "sidebar panel");
  assert.equal(at(500, 340), 0, "sofa");
});

test("fill walls: a rounded cushion in the wall colour is furniture, not wall", () => {
  // a 60 x 25 cm cushion outline made of flattened curves (curvedSeg true)
  const pts = [], curvedSeg = [false];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    pts.push({ x: 600 + 30 * Math.cos(a), y: 600 + 12.5 * Math.sin(a) });
    if (i) curvedSeg.push(true);
  }
  const withCushion = { ...prims, paths: [...prims.paths, { fill: GREY, stroke: null, subpaths: [{ points: pts, curvedSeg, closed: true }] }] };
  const walls = fillWalls(withCushion, 1);
  const at = (x, y) => walls.mask[Math.floor((y - walls.y0) / walls.cell) * walls.w + Math.floor((x - walls.x0) / walls.cell)];
  assert.equal(at(600, 600), 0);
  assert.equal(at(310, 600), 1);
});

test("fill footprint closes door and window gaps; rooms close over doors", () => {
  const walls = fillWalls(prims, 1);
  const { footprint, locate } = fillFootprint(walls);
  assert.ok(Math.abs(footprint - 80) < 4, `footprint ~ 10 x 8 m: ${footprint}`);
  assert.equal(locate(600, 600), true);
  assert.equal(locate(200, 600), false);
  const { rooms, locate: room } = fillRooms(walls);
  assert.equal(rooms.length, 2);
  assert.notEqual(room(600, 600), room(1100, 600), "the partition separates the two rooms");
  assert.equal(room(600, 600), room(600, 900));
});

test("wall agreement: the same walls as centrelines agree, unrelated lines do not", () => {
  const walls = fillWalls(prims, 1);
  const L = (ax, ay, bx, by) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
  const same = [L(300, 210, 1300, 210), L(300, 990, 1300, 990), L(310, 200, 310, 1000), L(1290, 200, 1290, 1000), L(900, 220, 900, 980)];
  const agree = wallAgreement(walls, same);
  assert.ok(agree.onMask >= 0.8 && agree.covered >= 0.8, JSON.stringify(agree));
  const furniture = [L(400, 300, 600, 300), L(400, 380, 600, 380)];
  assert.ok(wallAgreement(walls, furniture).onMask < 0.3);
});

test("fill verdicts: confirmed by the printed area or by both readers; a wrong area overrules", () => {
  const fill = { lengthM: 38, footprint: 80 };
  const ok = { onMask: 0.9, covered: 0.9 };
  assert.equal(judgeFill({ fill, scale: "dimensions", stated: { apartment: 78 } }).status, "train");
  assert.equal(judgeFill({ fill, scale: "dimensions", agreement: ok }).status, "train");
  assert.equal(judgeFill({ fill, scale: "dimensions" }).status, "review", "nothing confirms it");
  assert.equal(judgeFill({ fill, scale: "dimensions", stated: { apartment: 120 }, agreement: ok }).status, "review");
  assert.equal(judgeFill({ fill, scale: "door-swings", agreement: ok }).status, "review");
  assert.equal(judgeFill({ fill: null }).status, "reject");
});
