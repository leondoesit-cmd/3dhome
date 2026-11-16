// Doors, windows and passages in the live distances: on a wall
// (js/interaction/wall_plane_drag.js runOpenings -> js/wall_plane_snap.js
// dims) and for a floor piece (js/opening_clearance.js via js/measure.js).
// Walls 10 thick. Wall plane cases: the long wall along z = 0 is TWO
// collinear segments, "1a" (x 0..300) and "1b" (x 300..700), inner face z = 5,
// room toward +z.
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { runOpenings, solveWallDrag, wallFaceFrame, wallSegs } from "../js/interaction/wall_plane_drag.js";
import { measureSides, measureVertical } from "../js/measure.js";
import { openingSideHits, openingSillHit } from "../js/opening_clearance.js";
import { itemOutline } from "../js/item_outline.js";
import { sideDirs, floorClearances } from "../js/clearance.js";

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " expected " + b + " got " + a);
}
const WALLS = [
  { id: "1a", a: { x: 0, z: 0 }, b: { x: 300, z: 0 }, t: 10 },
  { id: "1b", a: { x: 300, z: 0 }, b: { x: 700, z: 0 }, t: 10 },
  { id: 2, a: { x: 700, z: 0 }, b: { x: 700, z: 400 }, t: 10 },
  { id: 3, a: { x: 700, z: 400 }, b: { x: 0, z: 400 }, t: 10 },
  { id: 4, a: { x: 0, z: 400 }, b: { x: 0, z: 0 }, t: 10 },
];
const DOOR_1A = { id: "d1", type: "door", wall: "1a", s: 150, width: 90, sill: 0, height: 205 }; // x 105..195
// a 70-wide picture, 50 tall, on segment 1b at x 450 (s 115..185 from 1b's start)
function hang(item, openings, extra) {
  return solveWallDrag(Object.assign({
    item: Object.assign({ id: "p", type: "art", w: 70, d: 4, x: 450, z: 7, y: 140, h: 50 }, item || {}),
    walls: WALLS, others: [], openings: openings, points: [], top: 270,
    is3D: false, point: null, held: { wallId: "1b", side: 1 }, memo: null, tol: 0.4,
  }, extra || {}));
}
function dim(r, kind) { return r.snap.dims.find((d) => d.kind === kind); }

test("a door in the collinear next segment stops the left distance; the corner stays as left-end", () => {
  const r = hang(null, [DOOR_1A]);
  assert.equal(r.wallId, "1b");
  const left = dim(r, "left");
  near(left.from, 195 - 300); near(left.to, 115); near(left.value, 220);
  assert.equal(left.reach, "opening"); assert.equal(left.what, "door"); assert.equal(left.id, "d1");
  const end = dim(r, "left-end");
  near(end.from, 5 - 300, 0.01, "the run's end: wall 4's face"); near(end.to, 115); near(end.value, 410);
  assert.equal(end.reach, "end");
  assert.ok(end.at < left.at, "drawn apart from the nearer line");
  // the right side reaches the corner, so it has no second line
  assert.equal(dim(r, "right").reach, "end"); near(dim(r, "right").value, 695 - 300 - 185);
  assert.equal(dim(r, "right-end"), undefined);
});

test("runOpenings: this face's run only — not a parallel wall across the room, not past a side wall", () => {
  const segs = wallSegs(WALLS), g = segs.find((s) => s.id === "1b"), f = wallFaceFrame(g, 1);
  const ops = runOpenings([DOOR_1A, { id: "w3", type: "window", wall: 3, s: 300, width: 100, sill: 90, height: 120 }], segs, g, f, { left: -295, right: 395 });
  assert.deepEqual(ops.map((o) => o.id), ["d1"]);
  near(ops[0].s, -150); assert.equal(ops[0].kind, "door"); near(ops[0].head, 205);
  assert.deepEqual(runOpenings([DOOR_1A], segs, g, f, { left: 0, right: 395 }), []); // behind a side wall at s 0
});

test("a door beside the picture on its own segment, and the snap candidates use the same list", () => {
  const door = { id: "d2", type: "door", wall: "1b", s: 50, width: 90, sill: 0, height: 205 }; // s 5..95
  const r = hang(null, [door]);
  near(dim(r, "left").value, 20); assert.equal(dim(r, "left").what, "door");
  // dragged near the collinear door's edge: it snaps to it
  const s = hang({ x: 233 }, [DOOR_1A], { held: null, point: { x: 233, z: 7 }, tol: 8 });
  assert.equal(s.snap.snapped.s, "opening-edge");
  near(s.x, 195 + 35);
});

test("a picture above a door measures down to the head; one under a window up to the sill", () => {
  const door = { id: "d3", type: "door", wall: "1b", s: 150, width: 90, sill: 0, height: 205 };
  const over = hang({ y: 230, h: 30 }, [door]);
  near(dim(over, "below").value, 25); assert.equal(dim(over, "below").reach, "opening"); assert.equal(dim(over, "below").what, "door");
  const win = { id: "w1", type: "window", wall: "1b", s: 150, width: 100, sill: 120, height: 120 };
  const cab = hang({ type: "upper", w: 60, d: 35, z: 22.5, y: 60, h: 40 }, [win]);
  near(dim(cab, "above").value, 20); assert.equal(dim(cab, "above").what, "window");
  assert.equal(dim(cab, "left").reach, "end", "the window is not level with it");
});

/* ---- floor pieces ---------------------------------------------------------- */

function room(openings) {
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.openings = openings || []; S.markers = []; S.wallCons = []; S.items = [];
}

test("a floor cabinet against a wall: the distance along it to the door frame", () => {
  room([{ id: "d", type: "door", wall: 1, s: 350, width: 90, sill: 0, height: 205 }]); // x 305..395
  const cab = { id: "c", type: "box", x: 200, z: 35, w: 60, d: 60, h: 85, rot: 0 };
  S.items = [cab];
  const hits = measureSides(cab);
  const op = hits.find((h) => h.kind === "opening");
  assert.ok(op, "an opening hit");
  assert.equal(op.dir, "right"); near(op.gap, 75); assert.equal(op.what, "door"); assert.equal(op.id, "d"); assert.equal(op.wallId, 1);
  near(op.from.x, 230); near(op.from.z, 5); near(op.to.x, 305); near(op.to.z, 5);
  // the side sweep's own answer (the far wall) is kept
  near(hits.find((h) => h.dir === "right" && h.kind === "wall").gap, 365);
  // away from the wall (40 cm): no such line
  cab.z = 75;
  assert.equal(measureSides(cab).find((h) => h.kind === "opening"), undefined);
});

test("pure: a nearer piece on that side wins, and a window above the piece is not level with it", () => {
  const poly = itemOutline({ type: "box", x: 200, z: 35, w: 60, d: 60, rot: 0 });
  const walls = [{ id: 1, a: { x: 0, z: 0 }, b: { x: 600, z: 0 }, t: 10 }], dirs = sideDirs(0, false);
  const door = { id: "d", wall: 1, kind: "door", s: 350, w: 90, sill: 0, head: 205 };
  const hits = floorClearances({ poly, dirs, walls, others: [{ id: "x", poly: itemOutline({ type: "box", x: 260, z: 35, w: 20, d: 60, rot: 0 }) }] });
  assert.equal(openingSideHits({ poly, span: { lo: 0, hi: 85 }, dirs, walls, openings: [door], hits }).filter((h) => h.kind === "opening").length, 0);
  const win = { id: "w", wall: 1, kind: "window", s: 350, w: 90, sill: 100, head: 220 };
  assert.equal(openingSideHits({ poly, span: { lo: 0, hi: 85 }, dirs, walls, openings: [win], hits: [] }).length, 0);
  // held to the wall counts even when its outline is further than NEAR_WALL
  const far = itemOutline({ type: "box", x: 200, z: 70, w: 60, d: 60, rot: 0 });
  assert.equal(openingSideHits({ poly: far, span: { lo: 0, hi: 85 }, dirs, walls, openings: [door], held: [1], hits: [] })[0].kind, "opening");
});

test("a floor cabinet under a window: up to the sill, nearer than the ceiling", () => {
  room([{ id: "w", type: "window", wall: 1, s: 100, width: 100, sill: 100, height: 120 }]);
  const cab = { id: "c", type: "box", x: 100, z: 35, w: 60, d: 60, h: 85, rot: 0 };
  S.items = [cab];
  const v = measureVertical(cab, { ceiling: 270 });
  const sill = v.find((h) => h.kind === "opening");
  assert.ok(sill); near(sill.gap, 15); assert.equal(sill.what, "window"); assert.equal(sill.dir, "up");
  near(sill.from.y, 85); near(sill.to.y, 100); near(sill.from.z, 6); near(sill.from.x, 100);
  assert.ok(v.find((h) => h.kind === "ceiling"), "the ceiling stays");
  // out of the window's width: none
  cab.x = 300;
  assert.equal(measureVertical(cab, { ceiling: 270 }).find((h) => h.kind === "opening"), undefined);
  // pure: something nearer over it already
  const poly = itemOutline({ type: "box", x: 100, z: 35, w: 60, d: 60, rot: 0 });
  assert.equal(openingSillHit({ poly, span: { lo: 0, hi: 85 }, walls: [{ id: 1, a: { x: 0, z: 0 }, b: { x: 600, z: 0 }, t: 10 }],
    openings: [{ id: "w", wall: 1, kind: "window", s: 100, w: 100, sill: 100, head: 220 }], up: { to: { y: 95 } } }), null);
});

test("a piece in front of a door: its wall hit is marked facing the door", () => {
  room([{ id: "d", type: "door", wall: 1, s: 350, width: 90, sill: 0, height: 205 }]);
  const table = { id: "t", type: "box", x: 350, z: 105, w: 80, d: 80, h: 75, rot: 0 }; // back 60 from the face
  S.items = [table];
  const back = measureSides(table).find((h) => h.dir === "back");
  assert.equal(back.kind, "wall"); near(back.gap, 60);
  assert.equal(back.facing, "door"); assert.equal(back.openingId, "d");
  table.z = 205; // 160 away: not facing
  assert.equal(measureSides(table).find((h) => h.dir === "back").facing, undefined);
});
