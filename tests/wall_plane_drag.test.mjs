// The on-wall drag (js/interaction/wall_plane_drag.js): pure parts, state in
// -> pose out. Room 600 x 400, walls 10 thick: 1 along z=0 (inner face z=5,
// room toward +z = side +1), 2 along x=600, 3 along z=400, 4 along x=0.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { holdToWall } from "../js/item_align.js";
import { isOnWall, onWallByType, wallSnapSegments } from "../js/item_orient.js";
import { itemOutline } from "../js/item_outline.js";
import { markerSeat } from "../js/markers.js";
import { wallPlanePose } from "../js/wall_plane_snap.js";
import {
  onWallFit, onWallToggleOutcome, solveWallDrag, wallFaceFrame, wallOpenings, wallPoints, wallRects, wallSegs,
} from "../js/interaction/wall_plane_drag.js";

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " expected " + b + " got " + a);
}
function room() {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = []; S.markers = []; S.wallCons = []; S.items = [];
}
const WALLS = [
  { id: 1, a: { x: 0, z: 0 }, b: { x: 600, z: 0 }, t: 10 },
  { id: 2, a: { x: 600, z: 0 }, b: { x: 600, z: 400 }, t: 10 },
  { id: 3, a: { x: 600, z: 400 }, b: { x: 0, z: 400 }, t: 10 },
  { id: 4, a: { x: 0, z: 400 }, b: { x: 0, z: 0 }, t: 10 },
];
function rayThrough(o, p) {
  const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, L = Math.hypot(dx, dy, dz);
  return { o, d: { x: dx / L, y: dy / L, z: dz / L } };
}
// a 120 x 8 TV, 70 tall, hung with its bottom at 120 on wall 1, centre x 300
const TV = { id: "tv", type: "tvWall", w: 120, d: 8, x: 300, z: 9, y: 120, h: 70 };
const CAM = { x: 360, y: 170, z: 380 };
function frame3D(item, grab, memo, extra) {
  return solveWallDrag(Object.assign({
    item, walls: WALLS, others: [], openings: [], points: [], top: 260,
    is3D: true, ray: rayThrough(CAM, grab), aim: null, point: { x: grab.x, z: grab.z },
    held: { wallId: 1, side: 1 }, memo, tol: 0.4,
  }, extra || {}));
}

test("on-wall pieces: hung types, wall cabinets, and the hold.onWall choice", () => {
  assert.ok(isOnWall({ type: "tvWall" }));
  assert.ok(isOnWall({ type: "upper" }) && isOnWall({ type: "hood" }) && isOnWall({ type: "wallShelf" }));
  assert.ok(!isOnWall({ type: "sofa" }));
  assert.ok(isOnWall({ type: "sofa", hold: { wall: 1, onWall: 1 } }));
  // a monitor standing on a desk is on the desk, until put on a wall
  assert.ok(!isOnWall({ type: "monitor", on: 7 }));
  assert.ok(onWallByType("art") && !onWallByType("bookshelf"));
});

test("holdToWall keeps hold.onWall when it rewrites the hold", () => {
  room();
  const it = { id: 1, type: "bookshelf", x: 300, z: 25, w: 80, d: 40, rot: 0, hold: { wall: 3, gap: 0, side: 1, onWall: 1 } };
  holdToWall(it, S.walls[0], 0);
  assert.deepEqual(it.hold, { wall: 1, gap: 0, side: 1, onWall: 1 });
  const plain = { id: 2, type: "sofa", x: 300, z: 60, w: 200, d: 90, rot: 0 };
  holdToWall(plain, S.walls[0], 0);
  assert.equal(plain.hold.onWall, undefined);
});

test("3D: the first frame keeps the piece where it is (grab offset), later frames follow the cursor", () => {
  // grabbed 20 cm right of the centre and 20 cm above the bottom
  const r0 = frame3D(TV, { x: 320, y: 140, z: 9 }, null);
  assert.equal(r0.wallId, 1);
  near(r0.x, 300); near(r0.z, 9); near(r0.elev, 120); assert.equal(r0.rot, 0);
  const r1 = frame3D(Object.assign({}, TV, { x: r0.x, z: r0.z }), { x: 370, y: 150, z: 9 }, r0.memo);
  near(r1.x, 350); near(r1.elev, 130); near(r1.z, 9, 0.01, "back stays on the face");
});

test("3D: an oblique wall, ray -> (s, y) -> pose with the back on the face", () => {
  const k = Math.SQRT1_2, walls = [{ id: 9, a: { x: 0, z: 0 }, b: { x: 400 * k, z: 400 * k }, t: 10 }];
  const f = wallFaceFrame(wallSegs(walls)[0], 1);
  const start = wallPlanePose(f, 200, 100, 8);
  const item = { id: "a", type: "art", w: 60, d: 8, x: start.x, z: start.z, y: 100, h: 40 };
  const centre = { x: start.x, y: 120, z: start.z };
  const cam = { x: start.x + f.nx * 300, y: 160, z: start.z + f.nz * 300 };
  const run = (grab, memo) => solveWallDrag({ item, walls, others: [], openings: [], points: [], top: 260,
    is3D: true, ray: rayThrough(cam, grab), aim: null, point: grab, held: { wallId: 9, side: 1 }, memo, tol: 0.4 });
  const r0 = run(centre, null);
  near(r0.x, start.x); near(r0.z, start.z); near(r0.elev, 100); near(r0.rot, 45, 1e-6);
  const moved = { x: centre.x + f.ux * 30, y: 150, z: centre.z + f.uz * 30 };
  const r1 = run(moved, r0.memo);
  // 30 along the wall, 30 up, centre still half its depth off the face
  near((r1.x - f.ox) * f.ux + (r1.z - f.oz) * f.uz, 230);
  near((r1.x - f.ox) * f.nx + (r1.z - f.oz) * f.nz, 4);
  near(r1.elev, 130);
});

test("3D: the cursor onto another wall's face moves the piece there, re-faced, height kept", () => {
  const r0 = frame3D(TV, { x: 320, y: 140, z: 9 }, null);
  // the right wall (face x=595, room toward -x), cursor at z=200, 150 up
  const hit = { x: 591, y: 150, z: 200 };
  const r1 = frame3D(Object.assign({}, TV, { x: r0.x, z: r0.z }), hit, r0.memo, {
    aim: { wallId: 2, nx: -1, nz: 0, x: 595, z: 200 },
  });
  assert.equal(r1.wallId, 2);
  assert.equal(r1.rot, 90); // front toward -x
  near(r1.x, 591); near(r1.z, 200, 0.01, "the cursor is on the piece's centre along the new wall");
  near(r1.elev, 130, 0.01, "the grab's height offset is kept");
});

test("2D: slides along its wall, height unchanged; crosses to a wall the pointer is clearly nearer", () => {
  const run = (point, memo, item) => solveWallDrag({ item: item || TV, walls: WALLS, others: [], openings: [], points: [],
    top: 260, is3D: false, point, held: { wallId: 1, side: 1 }, memo, tol: 0.4 });
  const r0 = run({ x: 320, z: 40 }, null);
  near(r0.x, 300); near(r0.elev, 120);
  const r1 = run({ x: 420, z: 60 }, r0.memo, Object.assign({}, TV, { x: r0.x, z: r0.z }));
  near(r1.x, 400); near(r1.z, 9); near(r1.elev, 120);
  // near the left wall (x=0): onto it, facing +x
  const r2 = run({ x: 20, z: 200 }, r1.memo, Object.assign({}, TV, { x: r1.x, z: r1.z }));
  assert.equal(r2.wallId, 4);
  near(r2.x, 9); near(r2.z, 200); near(r2.elev, 120); assert.equal(r2.rot, 270);
});

test("limits: the run between the side walls' faces, and the wall top", () => {
  const r0 = frame3D(TV, { x: 300, y: 155, z: 9 }, null);
  const r1 = frame3D(Object.assign({}, TV, { x: r0.x, z: r0.z }), { x: 10, y: 400, z: 9 }, r0.memo);
  near(r1.x, 5 + 60, 0.01, "flush into the corner at the left wall's face");
  near(r1.elev, 260 - 70);
});

test("adapter: pieces against this face (held, or back within the band), openings, points", () => {
  const segs = wallSegs(WALLS), g = segs[0], f = wallFaceFrame(g, 1);
  const unit = { id: "u", type: "tvunit", x: 300, z: 25, w: 160, d: 40, rot: 0 };
  const sofa = { id: "s", type: "sofa", x: 300, z: 250, w: 200, d: 90, rot: 0 };
  const art = { id: "a", type: "art", x: 100, z: 300, w: 60, d: 4, rot: 0, hold: { wall: 1, side: 1 } };
  const rects = wallRects([unit, sofa, art].map((o) => ({ id: o.id, poly: itemOutline(o), y: 0, h: 50, hold: o.hold })), g, 1, f);
  assert.deepEqual(rects.map((r) => r.id), ["u", "a"]);
  near(rects[0].s, 300); near(rects[0].w, 160);
  // a turned piece's real width along the wall
  const turned = wallRects([{ id: "t", poly: itemOutline({ type: "base", x: 300, z: 5 + 30 * Math.SQRT2, w: 60, d: 60, rot: 45 }), y: 0, h: 90 }], g, 1, f);
  near(turned[0].w, 60 * Math.SQRT2, 1e-6);
  const ops = wallOpenings([{ wall: 1, s: 200, width: 100, sill: 90, height: 120 }, { wall: 2, s: 50, width: 80 }], g, true);
  assert.deepEqual(ops, [{ s: 200, w: 100, sill: 90, head: 210 }]);
  const pts = wallPoints([
    { id: 1, surface: "wall", wall: 1, x: 250, y: 150, z: 5, nx: 0, nz: 1 },
    { id: 2, surface: "wall", wall: 1, x: 250, y: 150, z: -5, nx: 0, nz: -1 }, // the other face
    { id: 3, surface: "floor", wall: null, x: 250, y: 0, z: 100 },
  ], g, f);
  assert.deepEqual(pts, [{ s: 250, y: 150, id: 1 }]);
});

test("a free wall point catches the piece's centre; markers.js seats it in the same pose", () => {
  const point = { id: 7, surface: "wall", wall: 1, x: 250, y: 150, z: 5, nx: 0, nz: 1, itemId: null };
  const r0 = frame3D(TV, { x: 300, y: 155, z: 9 }, null, { points: [point] });
  const r1 = frame3D(Object.assign({}, TV, { x: r0.x, z: r0.z }), { x: 252, y: 152, z: 9 }, r0.memo, { points: [point], tol: 8 });
  assert.equal(r1.snap.pointId, 7);
  near(r1.x, 250); near(r1.elev, 150 - 35);
  room();
  const seat = markerSeat(point, { d: 8 });
  near(seat.x, r1.x); near(seat.z, r1.z, 1e-9, "same offset from the face as the wall drag");
  // a point clicked on the wall's centre line still seats the piece on the face
  const onLine = markerSeat(Object.assign({}, point, { z: 0 }), { d: 8 });
  near(onLine.z, 9);
});

test("live distances on the wall: down to the piece under it, else the floor", () => {
  const unit = { id: "u", poly: itemOutline({ type: "tvunit", x: 300, z: 25, w: 160, d: 40, rot: 0 }), y: 0, h: 50 };
  const r0 = frame3D(TV, { x: 300, y: 155, z: 9 }, null, { others: [unit] });
  const below = r0.snap.dims.find((d) => d.kind === "below");
  near(below.value, 70); // 120 - 50
  assert.ok(r0.snap.dims.find((d) => d.kind === "floor"));
});

test("onWallFit: flush on the nearest face, facing out, or null out of reach", () => {
  const fit = onWallFit({ x: 300, z: 60, w: 80, d: 30, rot: 0 }, WALLS);
  assert.equal(fit.wallId, 1); near(fit.z, 20); near(fit.x, 300); assert.equal(fit.rot, 0);
  assert.equal(onWallFit({ x: 300, z: 1000, w: 80, d: 30 }, WALLS.slice(0, 1), 100), null);
});

test("onWallToggleOutcome: a hung type or no wall in reach changes nothing (no history step)", () => {
  const sofa = { x: 300, z: 60, w: 80, d: 30, rot: 0, type: "sofa" };
  assert.equal(onWallToggleOutcome(sofa, WALLS), "on");
  assert.equal(onWallToggleOutcome({ ...sofa, z: 1000 }, WALLS.slice(0, 1)), "nowall");
  assert.equal(onWallToggleOutcome({ ...sofa, type: "art" }, WALLS), "always");
  assert.equal(onWallToggleOutcome({ ...sofa, type: "art", hold: { onWall: 1 } }, WALLS), "off");
  assert.equal(onWallToggleOutcome(null), null);
});

test("wallSnapSegments feeds the solver from the plan", () => {
  room();
  const segs = wallSegs(wallSnapSegments());
  assert.equal(segs.length, 4);
});
