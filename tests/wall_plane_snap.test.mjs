import test from "node:test";
import assert from "node:assert/strict";
import { rayToWallPlane, snapOnWall, wallPlanePose } from "../js/wall_plane_snap.js";

function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= (tol || 0.01), (msg || "") + " expected " + expected + " got " + actual);
}
var WALL = { left: 0, right: 400, top: 260 };
function snap(rect, extra) {
  return snapOnWall(Object.assign({ rect: rect, wall: WALL, items: [], openings: [], tol: 8 }, extra || {}));
}

// ---- ray -> (s, y) -> pose ---------------------------------------------------

function rayThrough(o, p) {
  var dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, L = Math.hypot(dx, dy, dz);
  return { o: o, d: { x: dx / L, y: dy / L, z: dz / L } };
}

test("straight wall: a ray through the centre plane gives (s, y), and the pose puts the back on the face", function () {
  var f = { ox: 0, oz: 5, ux: 1, uz: 0, nx: 0, nz: 1 }; // the inner face z = 5, room toward +z
  var depth = 40, P = { x: 150, y: 120, z: 5 + depth / 2 };
  var hit = rayToWallPlane(rayThrough({ x: 320, y: 170, z: 450 }, P), f, depth / 2);
  near(hit.s, 150); near(hit.y, 120);
  var pose = wallPlanePose(f, hit.s, hit.y, depth);
  near(pose.x, 150); near(pose.z, 25); near(pose.elev, 120);
  assert.equal(pose.rot, 0); // front (+Z local) along n = +z
});

test("45° wall: the round trip lands on the same point and the back stays on the face", function () {
  var k = Math.SQRT1_2, f = { ox: 100, oz: 50, ux: k, uz: k, nx: -k, nz: k };
  var depth = 30, s = 80, y = 90;
  var P = { x: f.ox + f.ux * s + f.nx * depth / 2, y: y, z: f.oz + f.uz * s + f.nz * depth / 2 };
  var O = { x: P.x + f.nx * 300 + f.ux * 40, y: 160, z: P.z + f.nz * 300 + f.uz * 40 };
  var hit = rayToWallPlane(rayThrough(O, P), f, depth / 2);
  near(hit.s, s); near(hit.y, y);
  var pose = wallPlanePose(f, hit.s, hit.y, depth);
  near(pose.x, P.x); near(pose.z, P.z); near(pose.elev, y);
  near(pose.rot, 45, 1e-3);
  var r = pose.rot * Math.PI / 180, fx = -Math.sin(r), fz = Math.cos(r); // the item convention's front
  near(fx, f.nx, 1e-4); near(fz, f.nz, 1e-4);
  var bx = pose.x - fx * depth / 2, bz = pose.z - fz * depth / 2;
  near((bx - f.ox) * f.nx + (bz - f.oz) * f.nz, 0, 1e-6, "back off the face by");
});

test("a ray parallel to the wall, or pointing away from it, gives null", function () {
  var f = { ox: 0, oz: 0, ux: 1, uz: 0, nx: 0, nz: 1 };
  assert.equal(rayToWallPlane({ o: { x: 0, y: 100, z: 200 }, d: { x: 1, y: 0, z: 0 } }, f, 0), null);
  assert.equal(rayToWallPlane({ o: { x: 0, y: 100, z: 200 }, d: { x: 0, y: 0, z: 1 } }, f, 0), null);
});

// ---- candidates on s ---------------------------------------------------------

test("s: the end of the run pulls the piece flush into the corner", function () {
  var r = snap({ s: 26, y: 100, w: 40, h: 30 });
  assert.equal(r.s, 20); assert.equal(r.snapped.s, "end");
  var g = r.guides.find(function (k) { return k.axis === "s"; });
  assert.equal(g.at, 0); assert.equal(g.kind, "end");
  assert.equal(snap({ s: 377, y: 100, w: 40, h: 30 }).s, 380);
});

test("s: the centre of the run", function () {
  var r = snap({ s: 196, y: 100, w: 40, h: 30 });
  assert.equal(r.s, 200); assert.equal(r.snapped.s, "run-centre");
});

test("s: edges and centres of other pieces on the wall", function () {
  var items = [{ id: "a", s: 100, y: 0, w: 60, h: 80 }]; // edges 70 and 130
  var abut = snap({ s: 153, y: 120, w: 40, h: 30 }, { items: items });
  assert.equal(abut.s, 150); assert.equal(abut.snapped.s, "item-edge");
  var g = abut.guides.find(function (k) { return k.axis === "s"; });
  assert.equal(g.at, 130); assert.equal(g.id, "a");
  near(g.from, 0); near(g.to, 150); // spans the piece below and the dragged one
  var centred = snap({ s: 104, y: 120, w: 40, h: 30 }, { items: items });
  assert.equal(centred.s, 100); assert.equal(centred.snapped.s, "item-centre");
  // the dragged piece itself is not a candidate
  var self = snap({ id: "a", s: 104, y: 120, w: 40, h: 30 }, { items: items });
  assert.equal(self.snapped.s, null);
});

test("s: edges and centre of an opening", function () {
  var openings = [{ s: 300, w: 100, sill: 90, head: 210 }];
  var c = snap({ s: 302, y: 150, w: 40, h: 30 }, { openings: openings });
  assert.equal(c.s, 300); assert.equal(c.snapped.s, "opening-centre");
  var e = snap({ s: 273, y: 150, w: 40, h: 30 }, { openings: openings }); // left edges aligned at 250
  assert.equal(e.s, 270); assert.equal(e.snapped.s, "opening-edge");
});

test("s: an equal gap between two neighbours", function () {
  var items = [{ id: "a", s: 100, y: 100, w: 60, h: 40 }, { id: "b", s: 260, y: 100, w: 60, h: 40 }];
  var r = snap({ s: 183, y: 100, w: 30, h: 40 }, { items: items });
  assert.equal(r.s, 180); assert.equal(r.snapped.s, "equal"); // 130 .. 165 | 195 .. 230
});

// ---- candidates on y ---------------------------------------------------------

test("y: floor and ceiling", function () {
  var f = snap({ s: 237, y: 5, w: 40, h: 30 });
  assert.equal(f.y, 0); assert.equal(f.snapped.y, "floor");
  var c = snap({ s: 237, y: 225, w: 40, h: 30 });
  assert.equal(c.y, 230); assert.equal(c.snapped.y, "ceiling");
  assert.equal(c.guides.find(function (k) { return k.axis === "y"; }).at, 260);
});

test("y: a TV over its unit sits on the unit's top and centres on it", function () {
  var unit = [{ id: "tvunit", s: 100, y: 0, w: 160, h: 50 }];
  var r = snap({ s: 104, y: 55, w: 120, h: 70 }, { items: unit });
  assert.equal(r.y, 50); assert.equal(r.snapped.y, "item-top");
  assert.equal(r.s, 100); assert.equal(r.snapped.s, "item-centre");
});

test("y: window sill and head", function () {
  var openings = [{ s: 100, w: 100, sill: 90, head: 210 }];
  var below = snap({ s: 237, y: 63, w: 40, h: 30 }, { openings: openings });
  assert.equal(below.y, 60); assert.equal(below.snapped.y, "sill"); // top on the sill
  var above = snap({ s: 237, y: 213, w: 40, h: 30 }, { openings: openings });
  assert.equal(above.y, 210); assert.equal(above.snapped.y, "head");
});

test("no candidate in reach: 1 cm steps", function () {
  var r = snap({ s: 237.4, y: 143.6, w: 40, h: 30 });
  assert.equal(r.s, 237); assert.equal(r.y, 144);
  assert.deepEqual(r.guides, []);
});

// ---- lock, free, limits, dims ------------------------------------------------

test("Shift locks to the dominant axis from the start point", function () {
  var start = { s: 100, y: 100 };
  var h = snap({ s: 150.2, y: 110, w: 40, h: 30 }, { lockAxis: true, start: start });
  assert.equal(h.lock, "s"); assert.equal(h.y, 100); assert.equal(h.s, 150);
  var v = snap({ s: 104, y: 150.4, w: 40, h: 30 }, { lockAxis: true, start: start });
  assert.equal(v.lock, "y"); assert.equal(v.s, 100); assert.equal(v.y, 150);
  var named = snap({ s: 150, y: 140, w: 40, h: 30 }, { lockAxis: "y", start: start });
  assert.equal(named.s, 100);
});

test("Alt: no snapping and no grid, the limits still hold", function () {
  var r = snap({ s: 26.3, y: 3, w: 40, h: 30 }, { free: true });
  assert.equal(r.s, 26.3); assert.equal(r.y, 3); assert.deepEqual(r.guides, []);
  var out = snap({ s: 5, y: -20, w: 40, h: 30 }, { free: true });
  assert.equal(out.s, 20); assert.equal(out.y, 0);
});

test("limits: inside the free run, on or above the floor, under the wall top", function () {
  var r = snap({ s: 420, y: 300, w: 40, h: 30 });
  assert.equal(r.s, 380); assert.equal(r.y, 230);
  var wide = snapOnWall({ rect: { s: 10, y: 50, w: 500, h: 30 }, wall: WALL });
  assert.equal(wide.s, 200); // wider than the run: centred on it
  // a candidate that would push the piece out of the run is not taken
  var tight = snapOnWall({ rect: { s: 60, y: 50, w: 40, h: 30 }, wall: { left: 0, right: 100, top: 260 }, items: [{ s: 85, y: 0, w: 10, h: 10 }] });
  assert.ok(tight.s - 20 >= 0 && tight.s + 20 <= 100);
});

test("dims: floor, ceiling, and the nearest thing level with the piece on each side", function () {
  var items = [{ id: "a", s: 100, y: 0, w: 60, h: 120 }]; // right edge 130
  var openings = [{ s: 300, w: 100, sill: 90, head: 210 }]; // left edge 250
  var r = snap({ s: 200, y: 100, w: 40, h: 50 }, { items: items, openings: openings });
  assert.equal(r.s, 200); assert.equal(r.y, 100);
  function dim(kind) { return r.dims.find(function (d) { return d.kind === kind; }); }
  assert.equal(dim("floor").value, 100);
  assert.equal(dim("ceiling").value, 110);
  assert.equal(dim("left").value, 50); assert.equal(dim("left").from, 130);
  assert.equal(dim("right").value, 30); assert.equal(dim("right").to, 250);
  // nothing level on the left: the run's end
  var low = snap({ s: 200, y: 180, w: 40, h: 20 }, { items: items, openings: openings });
  assert.equal(low.dims.find(function (d) { return d.kind === "left"; }).value, 180);
});

// ---- placeholder points, and distances straight down / up -------------------

test("points: the piece's centre snaps onto a wall point in s and y, and says which", function () {
  var r = snap({ s: 196, y: 112, w: 100, h: 60 }, { points: [{ s: 200, y: 145, id: "P1" }] });
  near(r.s, 200); near(r.y, 145 - 30);
  assert.equal(r.snapped.s, "point"); assert.equal(r.snapped.y, "point");
  assert.equal(r.pointId, "P1");
  // only along s: not sitting on it
  var off = snap({ s: 196, y: 40, w: 100, h: 60 }, { points: [{ s: 200, y: 145, id: "P1" }] });
  assert.equal(off.snapped.s, "point"); assert.equal(off.pointId, null);
  // a floor-level point offers s only and still holds the piece
  var low = snap({ s: 203, y: 40, w: 100, h: 60 }, { points: [{ s: 200, y: 0, id: "P2" }] });
  near(low.s, 200); assert.equal(low.pointId, "P2");
  // a point and another candidate at the same s: the point wins the tie
  var tie = snap({ s: 198, y: 112, w: 100, h: 60 }, { points: [{ s: 200, y: 145, id: "P3" }] });
  assert.equal(tie.snapped.s, "point");
});

test("dims: below / above stop at the nearest thing under / over the piece's width", function () {
  var items = [
    { s: 200, y: 0, w: 160, h: 50, id: "unit" },     // under the piece
    { s: 210, y: 220, w: 40, h: 30, id: "shelf" },   // over it
    { s: 350, y: 0, w: 60, h: 100, id: "aside" },     // beside, not under
  ];
  var r = snap({ s: 200, y: 120, w: 100, h: 60 }, { items: items, tol: 0 });
  function dim(kind) { return r.dims.find(function (d) { return d.kind === kind; }); }
  near(dim("below").value, 70); near(dim("below").from, 50);
  near(dim("above").value, 40); near(dim("above").to, 220);
  near(dim("floor").value, 120); near(dim("ceiling").value, 80);
  var free = snap({ s: 60, y: 120, w: 40, h: 60 }, { items: items, tol: 0 });
  assert.equal(free.dims.find(function (d) { return d.kind === "below"; }), undefined);
});
