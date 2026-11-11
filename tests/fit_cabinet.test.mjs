import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dockSide, findWallGap, fitCabinetBox, fitFootprint, frameCabinetOrbit, gapCoord, rotFacing } from "../js/fit_cabinet.js";

// A 400 x 300 room (inner faces at 5/395 and 5/295 with 10 cm walls on the axes).
function room() {
  var p = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }, { x: 0, z: 300 }];
  return [0, 1, 2, 3].map(function (i) {
    return { id: "w" + i, a: p[i], b: p[(i + 1) % 4], t: 10, h: 260 };
  });
}
function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= (tol || 0.01), (msg || "") + " expected " + expected + " got " + actual);
}

test("a click by the back wall fills it from side wall to side wall", function () {
  var gap = findWallGap({ x: 120, z: 30 }, room(), [], { height: 260 });
  assert.equal(gap.ok, true);
  assert.equal(gap.wall, "w0");
  near(gap.width, 390);
  assert.deepEqual(gap.limits, { left: "wall", right: "wall" });
  var box = fitCabinetBox(gap, { height: 260 });
  near(box.w, 390); near(box.d, 60); near(box.h, 260);
  near(box.x, 200); near(box.z, 35); // back on the face at z=5, 60 deep
  assert.equal(box.rot, 0); // front faces +z, into the room
});

test("the side of the wall the pick is on is the face the unit backs onto", function () {
  var walls = room();
  walls.push({ id: "mid", a: { x: 200, z: 0 }, b: { x: 200, z: 300 }, t: 10, h: 260 });
  var east = findWallGap({ x: 230, z: 150 }, walls, [], {});
  assert.equal(east.wall, "mid");
  near(east.frame.ox, 205); near(east.frame.nx, 1);
  near(east.width, 290); // z 5 .. 295
  var box = fitCabinetBox(east, {});
  near(box.x, 235); assert.equal(box.rot, 270); // front faces +x
  var west = findWallGap({ x: 170, z: 150 }, walls, [], {});
  near(west.frame.ox, 195); near(west.frame.nx, -1);
  assert.equal(fitCabinetBox(west, {}).rot, 90);
});

test("a dragged span is kept, and clamped to the walls", function () {
  var gap = findWallGap({ x: 100, z: 20 }, room(), [], {});
  var from = gapCoord(gap, { x: 100, z: 20 }), to = gapCoord(gap, { x: 260, z: 20 });
  var box = fitCabinetBox(gap, { from: from, to: to });
  near(box.w, 160); near(box.x, 180);
  var wide = fitCabinetBox(gap, { from: gapCoord(gap, { x: 100, z: 0 }), to: gapCoord(gap, { x: 900, z: 0 }) });
  near(wide.w, 295); near(wide.x - wide.w / 2, 100); // stops at the inner face x=395
  var tiny = fitCabinetBox(gap, { from: from, to: from + 3 });
  near(tiny.w, 390, 0.01, "a drag shorter than minWidth falls back to the whole gap");
});

test("a door in the back wall stops the run; a click in the doorway is refused", function () {
  var openings = [{ wall: "w0", s: 300, width: 80, type: "door" }];
  var gap = findWallGap({ x: 100, z: 20 }, room(), openings, {});
  near(gap.right - gap.left, 255); // 5 .. 260
  assert.equal(gap.limits.right, "opening");
  var inDoor = findWallGap({ x: 300, z: 20 }, room(), openings, {});
  assert.deepEqual([inDoor.ok, inDoor.reason], [false, "opening"]);
});

test("a window only stops a unit that rises past its sill", function () {
  var openings = [{ wall: "w0", s: 300, width: 100, sill: 90, type: "window" }];
  assert.equal(findWallGap({ x: 100, z: 20 }, room(), openings, { height: 240 }).limits.right, "opening");
  var low = findWallGap({ x: 100, z: 20 }, room(), openings, { height: 85 });
  assert.equal(low.limits.right, "wall");
});

test("a niche shallower than the unit sets the depth, flush with the niche", function () {
  // back wall at z=0, two 45 cm returns at x=100 and x=220 (inner faces 105/215)
  var walls = [
    { id: "back", a: { x: 0, z: 0 }, b: { x: 400, z: 0 }, t: 10, h: 260 },
    { id: "l", a: { x: 100, z: 0 }, b: { x: 100, z: 45 }, t: 10, h: 260 },
    { id: "r", a: { x: 220, z: 0 }, b: { x: 220, z: 45 }, t: 10, h: 260 },
  ];
  var gap = findWallGap({ x: 160, z: 20 }, walls, [], {});
  near(gap.width, 110);
  near(gap.nicheDepth, 40); // returns end at z=45, back face at z=5
  var box = fitCabinetBox(gap, {});
  near(box.d, 40); near(box.z, 25); near(box.w, 110);
});

test("a wall split in two along its length is still one face to stand against", function () {
  var walls = room();
  walls[0] = { id: "w0a", a: { x: 0, z: 0 }, b: { x: 180, z: 0 }, t: 10, h: 260 };
  walls.push({ id: "w0b", a: { x: 180, z: 0 }, b: { x: 400, z: 0 }, t: 10, h: 260 });
  var gap = findWallGap({ x: 60, z: 20 }, walls, [], {});
  near(gap.width, 390);
});

test("an open-ended wall stops the run at its own end", function () {
  var walls = [{ id: "solo", a: { x: 0, z: 0 }, b: { x: 250, z: 0 }, t: 10, h: 250 }];
  var gap = findWallGap({ x: 50, z: 30 }, walls, [], {});
  near(gap.width, 250);
  assert.deepEqual(gap.limits, { left: "end", right: "end" });
  assert.equal(gap.nicheDepth, null);
});

test("nothing within reach, or a named wall, decides the back wall", function () {
  assert.equal(findWallGap({ x: 200, z: 150 }, room(), [], { reach: 60 }).ok, false);
  var named = findWallGap({ x: 200, z: 150 }, room(), [], { wallId: "w2" });
  assert.equal(named.wall, "w2"); near(named.frame.nz, -1);
});

test("an over-long run gives one max-width unit around the pick, inside the run", function () {
  var walls = [{ id: "long", a: { x: 0, z: 0 }, b: { x: 900, z: 0 }, t: 10, h: 260 }];
  var gap = findWallGap({ x: 850, z: 20 }, walls, [], {});
  var box = fitCabinetBox(gap, { maxWidth: 600 });
  near(box.w, 600); near(box.x + box.w / 2, 900); // pushed back inside the run
  var corners = fitFootprint(gap, box);
  near(corners[0].z, 5); near(corners[2].z, 65);
});

test("rotFacing matches the item convention (front = local +Z)", function () {
  assert.equal(rotFacing(0, 1), 0);
  assert.equal(rotFacing(1, 0), 270);
  assert.equal(rotFacing(0, -1), 180);
  assert.equal(rotFacing(-1, 0), 90);
});

// Project a world point through an orbit (three's lookAt + perspective) to pane pixels.
function projectOrbit(o, p, pane, fovDeg) {
  var sp = Math.sin(o.phi);
  var cam = { x: o.target.x + o.radius * sp * Math.cos(o.theta), y: o.target.y + o.radius * Math.cos(o.phi), z: o.target.z + o.radius * sp * Math.sin(o.theta) };
  var f = { x: o.target.x - cam.x, y: o.target.y - cam.y, z: o.target.z - cam.z };
  var fl = Math.hypot(f.x, f.y, f.z); f = { x: f.x / fl, y: f.y / fl, z: f.z / fl };
  var r = { x: -f.z, y: 0, z: f.x }; var rl = Math.hypot(r.x, r.z); r = { x: r.x / rl, y: 0, z: r.z / rl };
  var u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  var d = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  var depth = d.x * f.x + d.y * f.y + d.z * f.z, tanH = Math.tan((fovDeg * Math.PI) / 360);
  var nx = (d.x * r.x + d.z * r.z) / (depth * tanH * (pane.width / pane.height)), ny = (d.x * u.x + d.y * u.y + d.z * u.z) / (depth * tanH);
  return { x: pane.left + (nx + 1) / 2 * pane.width, y: pane.top + (1 - ny) / 2 * pane.height };
}

test("docked framing faces the front and centres the unit in the uncovered part of the pane", function () {
  var it = { x: 200, z: 265, w: 390, d: 60, h: 270, rot: 180 };
  var pane = { left: 0, top: 160, width: 1100, height: 700 }, vis = { left: 0, top: 160, width: 600, height: 700 };
  var o = frameCabinetOrbit(it, pane, vis, 45);
  near(Math.cos(o.theta), 0, 1e-9); near(Math.sin(o.theta), -1, 1e-9); // camera on the room side (-z) of a unit facing -z
  var c = projectOrbit(o, { x: it.x, y: it.h / 2, z: it.z }, pane, 45);
  near(c.x, 300, 2, "centre x"); near(c.y, 510, 2, "centre y");
  var left = projectOrbit(o, { x: it.x - it.w / 2, y: it.h / 2, z: it.z - it.d / 2 }, pane, 45);
  var right = projectOrbit(o, { x: it.x + it.w / 2, y: it.h / 2, z: it.z - it.d / 2 }, pane, 45);
  assert.ok(Math.min(left.x, right.x) > 0 && Math.max(left.x, right.x) < 600, "the whole front stays clear of the designer");
});

test("landscape screens dock to the side, portrait ones to the bottom", function () {
  assert.equal(dockSide(1440, 900), "right");
  assert.equal(dockSide(390, 844), "bottom");
  assert.equal(dockSide(1024, 1366), "bottom");
  assert.equal(dockSide(880, 500), "bottom"); // too narrow for a side panel and a room
});

test("the plan's pointer handlers hand the fitcab tool and gesture to the tool module", function () {
  var down = readFileSync(new URL("../js/interaction/pointer_down.js", import.meta.url), "utf8");
  var move = readFileSync(new URL("../js/interaction/plan_move.js", import.meta.url), "utf8");
  var up = readFileSync(new URL("../js/interaction/pointer_up.js", import.meta.url), "utf8");
  assert.match(down, /if \(S\.tool === "fitcab" && !S\.conPick\) \{ fitCabDown\(e, px, pz\); return; \}/);
  assert.match(move, /if \(S\.action === "fitcab"\) \{ fitCabMove\(px, pz\); return; \}/);
  assert.match(move, /if \(S\.tool === "fitcab" && !S\.action\) \{ fitCabHover\(px, pz\); return; \}/);
  assert.match(up, /if \(S\.action === "fitcab"\) fitCabUp\(\);/);
  assert.match(up, /if \(active === "fitcab"\) cancelFitCab\(\);/);
});

test("a slanted return is cleared across the unit's whole depth, not at sample lines", function () {
  // right return from (400,0) to (360,45): its inner corner sits between any fixed probes
  var walls = [
    { id: "back", a: { x: 0, z: 0 }, b: { x: 500, z: 0 }, t: 10, h: 260 },
    { id: "l", a: { x: 100, z: 0 }, b: { x: 100, z: 45 }, t: 10, h: 260 },
    { id: "r", a: { x: 400, z: 0 }, b: { x: 360, z: 45 }, t: 10, h: 260 },
  ];
  var gap = findWallGap({ x: 200, z: 20 }, walls, [], { depth: 60 });
  var box = fitCabinetBox(gap, { depth: 60 });
  // the return's inner face reaches x ≈ 356.3 at z=45; the unit must stop short of it
  assert.ok(box.s2 + gap.frame.ox <= 357, "right end " + (box.s2 + gap.frame.ox));
});

test("a drag past the maximum width keeps its start and direction", function () {
  var walls = [{ id: "long", a: { x: 0, z: 0 }, b: { x: 2000, z: 0 }, t: 10, h: 260 }];
  var gap = findWallGap({ x: 1000, z: 20 }, walls, [], {});
  var fwd = fitCabinetBox(gap, { from: 0, to: 700, maxWidth: 600 });
  near(fwd.x - fwd.w / 2, 1000); near(fwd.w, 600);
  var back = fitCabinetBox(gap, { from: 0, to: -700, maxWidth: 600 });
  near(back.x + back.w / 2, 1000);
});

test("a wall half a degree off square: the unit's back stays on the face", function () {
  var a = 0.5 * Math.PI / 180, L = 400;
  var walls = [{ id: "skew", a: { x: 0, z: 0 }, b: { x: L * Math.cos(a), z: L * Math.sin(a) }, t: 10, h: 260 }];
  var gap = findWallGap({ x: 200, z: 30 }, walls, [], {});
  var box = fitCabinetBox(gap, {});
  // rebuild the back corners the way the item is drawn (rot, centre, w, d) and measure their face offset
  var r = box.rot * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r);
  [-1, 1].forEach(function (sx) {
    var lx = sx * box.w / 2, lz = -box.d / 2;
    var p = { x: box.x + lx * ca - lz * sa, z: box.z + lx * sa + lz * ca };
    var q = (p.x - gap.frame.ox) * gap.frame.nx + (p.z - gap.frame.oz) * gap.frame.nz;
    near(q, 0, 0.1, "back corner off the face by");
  });
});
