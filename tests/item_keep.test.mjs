// Kept distances (js/item_keep.js): build a keep from a shown distance, type a
// value, hold a set of them while the room changes. Pure data in, numbers out.
import test from "node:test";
import assert from "node:assert/strict";
import {
  keepFromFloorHit, keepFromWallDim, describeKeep, measureKeep, applyKeep, solveKeeps,
  canAddKeep, keepOrder, wouldCycle, pruneKeeps, normalizeKeeps, KEEP_MAX,
} from "../js/item_keep.js";
import { floorClearances, sideDirs, wallGap, minSeparation } from "../js/clearance.js";
import { snapOnWall } from "../js/wall_plane_snap.js";

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " expected " + b + " got " + a);
}
function rect(x, z, w, d, rot) {
  const a = ((rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([qx, qz]) => ({ x: x + qx * c - qz * s, z: z + qx * s + qz * c }));
}
function circle(x, z, r) {
  const out = [];
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; out.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r }); }
  return out;
}
function piece(id, outline, lo, hi) {
  let cx = 0, cz = 0;
  outline.forEach((p) => { cx += p.x / outline.length; cz += p.z / outline.length; });
  return { id, outline, x: cx, z: cz, lo: lo == null ? 0 : lo, hi: hi == null ? 80 : hi };
}
function moveBy(it, r) { return piece(it.id, it.outline.map((p) => ({ x: p.x + r.dx, z: p.z + r.dz })), it.lo + (r.dy || 0), it.hi + (r.dy || 0)); }
// a 400 x 300 room, walls 10 thick: inner faces x = 5 / 395, z = 5 / 295
function room(x0 = 0, z0 = 0, x1 = 400, z1 = 300) {
  return [
    { id: "S", a: { x: x0, z: z0 }, b: { x: x1, z: z0 }, t: 10 },
    { id: "E", a: { x: x1, z: z0 }, b: { x: x1, z: z1 }, t: 10 },
    { id: "N", a: { x: x1, z: z1 }, b: { x: x0, z: z1 }, t: 10 },
    { id: "W", a: { x: x0, z: z1 }, b: { x: x0, z: z0 }, t: 10 },
  ];
}
function scene(items, extra) { return Object.assign({ walls: room(), items: items || [], openings: [], ceiling: 250 }, extra || {}); }
function hitsOf(it, sc) {
  return floorClearances({ poly: it.outline, dirs: sideDirs(0), walls: sc.walls, others: sc.items.filter((x) => x.id !== it.id).map((x) => ({ id: x.id, poly: x.outline })) });
}

test("a wall side hit becomes a wall keep; typing a value moves it along the wall normal", () => {
  const it = piece("sofa", rect(100, 60, 100, 50)), sc = scene([it]);
  const hit = hitsOf(it, sc).find((h) => h.kind === "wall" && h.id === "S");
  const k = keepFromFloorHit(hit, it, { scene: sc });
  assert.deepEqual(k.ref, { kind: "wall", id: "S", side: 1 });
  near(k.axis.x, 0); near(k.axis.z, -1);
  near(k.value, 30);
  near(measureKeep(k, it, sc), 30);
  const d = describeKeep(k);
  assert.equal(d.target, "wall"); assert.equal(d.direction, "-z"); assert.equal(d.measure, "perpendicular");
  const r = applyKeep(k, 60, it, sc);
  near(r.dx, 0); near(r.dz, 30); assert.equal(r.dy, 0);
  near(measureKeep(k, moveBy(it, r), sc), 60);
});

test("rotated rectangle and circle against a wall: the extreme point, as js/clearance.js", () => {
  const sc = scene([]);
  const box = piece("b", rect(200, 150, 120, 60, 30));
  const k = keepFromFloorHit({ dir: "back", kind: "wall", id: "S", gap: 0 }, box, { scene: sc });
  near(measureKeep(k, box, sc), wallGap(box.outline, sc.walls[0]).gap);
  const r = applyKeep(k, 20, box, sc);
  near(r.dx, 0);
  near(wallGap(moveBy(box, r).outline, sc.walls[0]).gap, 20);
  const round = piece("t", circle(200, 100, 40));
  const kc = keepFromFloorHit({ dir: "back", kind: "wall", id: "S" }, round, { scene: sc });
  near(measureKeep(kc, round, sc), 55);
  const rc = applyKeep(kc, 10, round, sc);
  near(rc.dz, -45); near(rc.dx, 0);
});

test("oblique wall: moves along its normal to the typed value", () => {
  const diag = { id: "D", a: { x: 0, z: 0 }, b: { x: 300, z: 300 }, t: 10 };
  const sc = { walls: [diag], items: [], openings: [] };
  const box = piece("b", rect(200, 80, 60, 40, 45));
  const k = keepFromFloorHit({ dir: "left", kind: "wall", id: "D" }, box, { scene: sc });
  const r = applyKeep(k, 25, box, sc);
  near(r.dx, -r.dz, 1e-6, "along the normal (1,-1)/sqrt2");
  near(wallGap(moveBy(box, r).outline, diag).gap, 25);
});

test("item along a side axis, and a diagonal near line", () => {
  const a = piece("a", rect(100, 150, 60, 60)), b = piece("b", rect(250, 150, 60, 60)), sc = scene([a, b]);
  const hit = hitsOf(a, sc).find((h) => h.kind === "item" && h.id === "b");
  const k = keepFromFloorHit(hit, a, { scene: sc });
  assert.deepEqual(k.ref, { kind: "item", id: "b" });
  near(k.axis.x, 1); near(k.value, 90);
  const r = applyKeep(k, 12, a, sc);
  near(r.dx, 78); near(r.dz, 0);
  // diagonal neighbour: the near line's direction is the measuring axis
  const c = piece("c", rect(250, 260, 40, 40)), sc2 = scene([a, c]);
  const g = minSeparation(a.outline, c.outline);
  const kn = keepFromFloorHit({ dir: "near", kind: "near", gap: g.gap, from: g.from, to: g.to, id: "c" }, a, { scene: sc2 });
  assert.equal(kn.src, "near");
  near(measureKeep(kn, a, sc2), g.gap);
  const rn = applyKeep(kn, 20, a, sc2);
  near(rn.dx * kn.axis.z - rn.dz * kn.axis.x, 0, 1e-6, "moves along the axis only");
  near(measureKeep(kn, moveBy(a, rn), sc2), 20);
});

test("wall-plane dims: opening edge, run end, below / above, floor / ceiling", () => {
  const cab = piece("cab", rect(100, 35, 60, 60), 0, 85);
  const sc = scene([cab], { openings: [{ id: "d1", wall: "S", s: 200, width: 90, sill: 0, head: 210 }] });
  const frame = { ox: 0, oz: 5, ux: 1, uz: 0, nx: 0, nz: 1 };
  const snap = snapOnWall({ rect: { s: 100, y: 0, w: 60, h: 85 }, wall: { left: 5, right: 395, top: 250 }, openings: [{ s: 200, w: 90, sill: 0, head: 210 }], free: true });
  const ctx = { scene: sc, wall: "S", frame };
  const right = keepFromWallDim(snap.dims.find((d) => d.kind === "right"), cab, ctx);
  assert.deepEqual(right.ref, { kind: "opening", id: "d1", edge: "a" });
  near(right.value, 25);
  const r = applyKeep(right, 10, cab, sc);
  near(r.dx, 15); near(r.dz, 0);
  const left = keepFromWallDim(snap.dims.find((d) => d.kind === "left"), cab, ctx);
  assert.deepEqual(left.ref, { kind: "wall-end", id: "S", end: "a", side: 1 });
  near(left.value, 65, 0.01, "to the west wall's inner face");
  near(applyKeep(left, 0, cab, sc).dx, -65);
  const fl = keepFromWallDim(snap.dims.find((d) => d.kind === "floor"), cab, ctx);
  assert.deepEqual(fl.ref, { kind: "floor" });
  const ce = keepFromWallDim(snap.dims.find((d) => d.kind === "ceiling"), cab, ctx);
  near(ce.value, 165);
  // a wall cabinet over the base one and under a window
  const top = piece("top", rect(100, 25, 60, 40), 140, 210), win = { id: "w1", wall: "S", s: 100, width: 80, sill: 230, head: 245 };
  const sc2 = scene([cab, top], { openings: [win], ceiling: 300 });
  const ctx2 = { scene: sc2, wall: "S", frame };
  const below = keepFromWallDim({ axis: "y", kind: "below", from: 85, to: 140, value: 55 }, top, ctx2);
  assert.deepEqual(below.ref, { kind: "item", id: "cab" }); assert.equal(below.sign, -1);
  near(applyKeep(below, 50, top, sc2).dy, -5);
  const above = keepFromWallDim({ axis: "y", kind: "above", from: 210, to: 230, value: 20 }, top, ctx2);
  assert.deepEqual(above.ref, { kind: "opening", id: "w1", edge: "sill" });
  near(applyKeep(above, 5, top, sc2).dy, 15);
  // the frame running the other way (the wall seen from its far face)
  const back = piece("back", rect(100, -35, 60, 60), 0, 85), sc3 = scene([back], { openings: sc.openings });
  const fr2 = { ox: 400, oz: -5, ux: -1, uz: 0, nx: 0, nz: -1 };
  const kb = keepFromWallDim({ axis: "s", kind: "left", from: 245, to: 270, value: 25 }, back, { scene: sc3, wall: "S", frame: fr2 });
  assert.deepEqual(kb.ref, { kind: "opening", id: "d1", edge: "a" }, "heading toward b: the jamb nearer a");
  near(kb.value, 25);
});

test("vertical: floor, ceiling and the item under it", () => {
  const shelf = piece("shelf", rect(100, 30, 80, 25), 40, 60), bed = piece("bed", rect(100, 100, 160, 200), 0, 110);
  const sc = scene([shelf, bed]);
  const kf = keepFromFloorHit({ dir: "down", kind: "floor", gap: 40 }, shelf, { scene: sc });
  near(applyKeep(kf, 90, shelf, sc).dy, 50);
  const kc = keepFromFloorHit({ dir: "up", kind: "ceiling", gap: 190 }, shelf, { scene: sc });
  near(applyKeep(kc, 10, shelf, sc).dy, 180);
  const high = piece("shelf", shelf.outline, 150, 170);
  const kh = keepFromFloorHit({ dir: "down", kind: "item", id: "bed", gap: 40 }, high, { scene: sc });
  assert.equal(describeKeep(kh).direction, "down");
  near(applyKeep(kh, 30, high, sc).dy, -10);
  assert.equal(applyKeep(kf, 300, shelf, sc).error, "above-ceiling");
});

test("errors: bad, negative, self, missing, blocked by the wall behind", () => {
  const it = piece("sofa", rect(100, 60, 100, 50)), sc = scene([it]);
  const k = keepFromFloorHit({ dir: "back", kind: "wall", id: "S" }, it, { scene: sc });
  assert.equal(applyKeep(k, -1, it, sc).error, "negative");
  assert.equal(applyKeep(k, "abc", it, sc).error, "bad-value");
  assert.equal(applyKeep(k, NaN, it, sc).error, "bad-value");
  near(applyKeep(k, "45", it, sc).dz, 15);
  assert.equal(applyKeep(k, 300, it, sc).error, "blocked", "would go through the north wall");
  near(applyKeep(k, 240, it, sc).dz, 210, 0.01, "flush to the north wall is fine");
  assert.equal(applyKeep(k, 10, it, { walls: [], items: [] }).error, "missing");
  assert.equal(applyKeep({ axis: { x: 1, z: 0 }, ref: { kind: "item", id: "sofa" } }, 10, it, sc).error, "self");
  assert.equal(measureKeep({ axis: { x: 1, z: 0 }, ref: { kind: "item", id: "gone" } }, it, sc), null);
});

test("two perpendicular wall keeps hold the corner offset when the room is resized", () => {
  const it = piece("desk", rect(150, 120, 80, 60)), sc = scene([it]);
  const ks = [keepFromFloorHit({ dir: "back", kind: "wall", id: "S" }, it, { scene: sc }), keepFromFloorHit({ dir: "left", kind: "wall", id: "W" }, it, { scene: sc })];
  ks[0].value = 30; ks[1].value = 20;
  let r = solveKeeps(ks, it, sc);
  near(r.dx, 65 - 150); near(r.dz, 65 - 120);
  assert.deepEqual(r.satisfied, [0, 1]); assert.deepEqual(r.conflicts, []);
  const placed = moveBy(it, r), big = scene([placed], { walls: room(-100, -50, 400, 300) });
  r = solveKeeps(ks, placed, big);
  const after = moveBy(placed, r);
  near(after.x, -95 + 20 + 40); near(after.z, -45 + 30 + 30);
  assert.deepEqual(r.satisfied, [0, 1]);
});

test("parallel keeps: opposite sides agree or conflict; canAddKeep refuses", () => {
  const it = piece("bed", rect(200, 150, 100, 60)), sc = scene([it]);
  const s = keepFromFloorHit({ dir: "back", kind: "wall", id: "S" }, it, { scene: sc });
  const n = keepFromFloorHit({ dir: "front", kind: "wall", id: "N" }, it, { scene: sc });
  s.value = 30; n.value = 30;
  let r = solveKeeps([s, n], it, sc);
  assert.deepEqual(r.satisfied, [0]); assert.deepEqual(r.conflicts, [{ index: 1, reason: "parallel-conflict" }]);
  near(r.dz, 65 - 150);
  n.value = 290 - 60 - 30;
  r = solveKeeps([s, n], it, sc);
  assert.deepEqual(r.satisfied, [0, 1]);
  const w = keepFromFloorHit({ dir: "left", kind: "wall", id: "W" }, it, { scene: sc });
  const e = keepFromFloorHit({ dir: "right", kind: "wall", id: "E" }, it, { scene: sc });
  const other = { axis: { x: 0, z: -1 }, sign: 1, ref: { kind: "item", id: "x" }, value: 5 };
  assert.deepEqual(canAddKeep([s], other), { ok: false, reason: "parallel-conflict" });
  assert.deepEqual(canAddKeep([s], s), { ok: false, reason: "duplicate" });
  assert.deepEqual(canAddKeep([s, w], { axis: { x: 0.6, z: 0.8 }, ref: { kind: "item", id: "x" }, value: 1 }), { ok: false, reason: "too-many" });
  assert.deepEqual(canAddKeep([s], { axis: { x: 1, z: 0 }, ref: { kind: "item", id: "bed" } }, { itemId: "bed" }), { ok: false, reason: "self" });
  assert.equal(canAddKeep([s], w).ok, true);
  const nNow = keepFromFloorHit({ dir: "front", kind: "wall", id: "N" }, it, { scene: sc });
  const sNow = keepFromFloorHit({ dir: "back", kind: "wall", id: "S" }, it, { scene: sc });
  assert.equal(canAddKeep([sNow], nNow, { item: it, scene: sc }).ok, true, "made from the current pose they agree");
  assert.deepEqual(canAddKeep([s], Object.assign({}, n, { value: 30 }), { item: it, scene: sc }), { ok: false, reason: "parallel-conflict" });
  const up = { axis: "y", sign: 1, ref: { kind: "ceiling" }, value: 10 }, down = { axis: "y", sign: -1, ref: { kind: "floor" }, value: 0 };
  assert.deepEqual(canAddKeep([up], down), { ok: false, reason: "too-many" });
  assert.deepEqual(canAddKeep([s, w, up], e), { ok: false, reason: "too-many" });
});

test("a wall keep plus an oblique item keep converge together", () => {
  const t = piece("t", circle(250, 200, 40)), ch = piece("ch", rect(150, 100, 50, 50)), sc = scene([t, ch]);
  const g = minSeparation(ch.outline, t.outline);
  const kn = keepFromFloorHit({ dir: "near", kind: "near", gap: g.gap, from: g.from, to: g.to, id: "t" }, ch, { scene: sc });
  const kw = keepFromFloorHit({ dir: "left", kind: "wall", id: "W" }, ch, { scene: sc });
  kn.value = 90; kw.value = 115;
  const r = solveKeeps([kw, kn], ch, sc);
  assert.deepEqual(r.satisfied, [0, 1]);
  const after = moveBy(ch, r);
  near(measureKeep(kw, after, sc), 115); near(measureKeep(kn, after, sc), 90);
  // out of reach along that diagonal once the wall keep holds: reported, the wall keep still holds
  kn.value = 30; kw.value = 100;
  const bad = solveKeeps([kw, kn], ch, sc);
  assert.deepEqual(bad.satisfied, [0]); assert.deepEqual(bad.conflicts, [{ index: 1, reason: "unsolved" }]);
});

test("order across items: chains after their reference, cycles reported and refused", () => {
  const kTo = (id) => ({ axis: { x: 1, z: 0 }, ref: { kind: "item", id }, value: 10 });
  const items = [{ id: "C", keep: [kTo("B")] }, { id: "B", keep: [kTo("A")] }, { id: "A", keep: [{ axis: { x: 0, z: -1 }, ref: { kind: "wall", id: "S" }, value: 5 }] }, { id: "D" }];
  assert.deepEqual(keepOrder(items), { order: ["A", "B", "C", "D"], cycles: [] });
  assert.equal(wouldCycle(items, "A", kTo("C")), true);
  assert.equal(wouldCycle(items, "D", kTo("C")), false);
  assert.equal(wouldCycle(items, "A", kTo("A")), true);
  const loop = keepOrder([{ id: "A", keep: [kTo("B")] }, { id: "B", keep: [kTo("A")] }]);
  assert.equal(loop.order.length, 2);
  assert.deepEqual(loop.cycles, [["A", "B"]]);
  // the chain solved in that order: B follows A after A moves
  const A = piece("A", rect(100, 100, 50, 50)), B = piece("B", rect(200, 100, 50, 50)), sc = scene([A, B]);
  const kb = keepFromFloorHit({ dir: "right", kind: "item", id: "A", from: { x: 175, z: 100 }, to: { x: 125, z: 100 } }, B, { scene: sc });
  near(kb.value, 50);
  const A2 = moveBy(A, { dx: -40, dz: 0 }), sc2 = scene([A2, B]);
  const r = solveKeeps([kb], B, sc2);
  near(r.dx, -40); near(r.dz, 0);
});

test("prune after deletion, normalize junk", () => {
  const ks = [
    { axis: { x: 0, z: -1 }, ref: { kind: "wall", id: "S", side: 1 }, value: 5 },
    { axis: { x: 1, z: 0 }, ref: { kind: "item", id: "gone" }, value: 5 },
    { axis: { x: 1, z: 0 }, ref: { kind: "opening", id: "d1", edge: "a" }, value: 5 },
  ];
  const sc = scene([], { openings: [{ id: "d1", wall: "S", s: 200, width: 90 }] });
  assert.deepEqual(pruneKeeps(ks, sc).map((k) => k.ref.kind), ["wall", "opening"]);
  sc.walls = sc.walls.filter((w) => w.id !== "S");
  assert.deepEqual(pruneKeeps(ks, sc), [], "the opening's wall went too");
  assert.deepEqual(pruneKeeps([{ axis: "y", sign: 1, ref: { kind: "ceiling" } }], { walls: [] }), []);
  const junk = [null, 5, "x", {}, { ref: { kind: "moon" }, axis: "y" }, { axis: { x: 0, z: 0 }, ref: { kind: "wall", id: 1 } },
    { axis: "y", ref: { kind: "wall", id: 1 } }, { axis: { x: 1, z: 0 }, ref: { kind: "floor" } }, { axis: "y", sign: 1, ref: { kind: "floor" } },
    { axis: { x: 3, z: 4 }, sign: -1, ref: { kind: "item", id: "a" }, value: -5, src: "evil" },
    { axis: { x: 3, z: 4 }, sign: -1, ref: { kind: "item", id: "a" } },
    { axis: "y", ref: { kind: "ceiling" }, value: 12 }, { axis: "y", ref: { kind: "floor" }, value: 0 }, { axis: { x: 1, z: 0 }, ref: { kind: "wall", id: 2 } }];
  const n = normalizeKeeps(junk);
  assert.equal(n.length, KEEP_MAX);
  assert.deepEqual(n[0], { axis: { x: -0.6, z: -0.8 }, sign: 1, ref: { kind: "item", id: "a" } });
  assert.deepEqual(n[1], { axis: "y", sign: 1, ref: { kind: "ceiling" }, value: 12 });
  assert.deepEqual(normalizeKeeps("nope"), []);
});
