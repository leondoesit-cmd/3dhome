// The planner side of kept distances (js/item_keep_plan.js): the plain scene
// from plan-shaped data (openings by their centre), typing a distance from a
// shown hit, adding with refusals, the re-seat pass (order, prune on delete,
// locks, `only`), a held piece's gap, and the editor's value parsing.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKeepScene, checkAddKeep, holdGap, keepItemOf, keepSegment, keepStates, keptOnLoad, matchKeep,
  openingForKeep, parseDistanceInput, planDistance, pruneAll, reseatKept, shiftedItem, toKeep,
} from "../js/item_keep_plan.js";
import { measureKeep, normalizeKeep } from "../js/item_keep.js";
import { parseLength } from "../js/planning_units.js";

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " expected " + b + " got " + a);
}
function rect(x, z, w, d) {
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([qx, qz]) => ({ x: x + qx, z: z + qz }));
}
// plan-shaped walls (centre lines through nodes) of a 400 x 300 room, 10 thick
const PLAN_WALLS = [
  { id: "S", a: { x: 0, z: 0 }, b: { x: 400, z: 0 }, thickness: 10 },
  { id: "E", a: { x: 400, z: 0 }, b: { x: 400, z: 300 }, thickness: 10 },
  { id: "N", a: { x: 400, z: 300 }, b: { x: 0, z: 300 }, thickness: 10 },
  { id: "W", a: { x: 0, z: 300 }, b: { x: 0, z: 0 }, thickness: 10 },
];
const deps = {
  geom: (w) => (w.arc ? { a: w.a, b: w.b, L: 100, kind: "arc" } : { a: w.a, b: w.b, L: Math.hypot(w.b.x - w.a.x, w.b.z - w.a.z) }),
  outline: (it) => rect(it.x, it.z, it.w, it.d),
  span: (it) => it.span || null,
};
function planScene(items, extra) {
  return buildKeepScene(Object.assign({ walls: PLAN_WALLS, openings: [], items: items, ceiling: 250 }, extra || {}), deps);
}
function me(it) { return keepItemOf(it, rect(it.x, it.z, it.w, it.d), it.span || null); }

test("a plan opening becomes the model's: s stays its centre, head = sill + height", () => {
  assert.deepEqual(openingForKeep({ id: "d1", wall: "S", s: 200, width: 80, sill: 0, height: 210, type: "door" }),
    { id: "d1", wall: "S", s: 200, width: 80, sill: 0, head: 210 });
  assert.deepEqual(openingForKeep({ id: "w1", wall: "N", s: "120", width: 100, sill: 90, height: 120 }),
    { id: "w1", wall: "N", s: 120, width: 100, sill: 90, head: 210 });
  assert.equal(openingForKeep({ id: "x" }), null);
});

test("the scene: straight physical walls only, openings on kept walls, spans with a fallback", () => {
  const sc = buildKeepScene({
    walls: PLAN_WALLS.concat([{ id: "A", a: { x: 0, z: 0 }, b: { x: 9, z: 9 }, arc: true, thickness: 10 }, { id: "V", a: { x: 0, z: 0 }, b: { x: 50, z: 0 }, physical: false }]),
    openings: [{ id: "d1", wall: "S", s: 200, width: 80, height: 210 }, { id: "d2", wall: "A", s: 5, width: 4, height: 200 }],
    items: [{ id: "t", x: 100, z: 100, w: 60, d: 60, h: 75 }, { id: "c", x: 300, z: 100, w: 40, d: 40, h: 50, elev: 120, span: { lo: 120, hi: 170 } }],
    ceiling: 260,
  }, deps);
  assert.deepEqual(sc.walls.map((w) => w.id), ["S", "E", "N", "W"]);
  assert.equal(sc.walls[0].t, 10);
  assert.deepEqual(sc.openings.map((o) => o.id), ["d1"]);
  assert.deepEqual(sc.items.map((i) => [i.id, i.lo, i.hi]), [["t", 0, 75], ["c", 120, 170]]);
  assert.equal(sc.ceiling, 260);
});

test("an opening distance measures to the jamb from the opening's centre and width", () => {
  // door centred 200 along S, 80 wide: jambs at x 160 and 240; a 60 wide piece at x 100 ends at 130
  const it = { id: "p", x: 100, z: 30, w: 60, d: 40, h: 80 };
  const sc = planScene([it], { openings: [{ id: "d1", wall: "S", s: 200, width: 80, sill: 0, height: 210 }] });
  const k = { axis: { x: 1, z: 0 }, ref: { kind: "opening", id: "d1", edge: "a" } };
  near(measureKeep(k, me(it), sc), 30);
  const plan = planDistance([], k, 10, me(it), sc);
  near(plan.dx, 20); near(plan.dz, 0);
  near(measureKeep(k, plan.me, sc), 10);
});

test("typing a distance from a floor hit: hit -> keep -> translation -> the new distance", () => {
  const it = { id: "sofa", x: 100, z: 60, w: 100, d: 50, h: 80 }, sc = planScene([it]), m = me(it);
  // the hit js/measure_cache.js reports toward wall S (its face at z 5; the sofa's back at z 35)
  const hit = { dir: "n", kind: "wall", id: "S", gap: 30, from: { x: 100, z: 35 }, to: { x: 100, z: 5 } };
  const k = toKeep(hit, m, sc);
  assert.deepEqual(k.ref, { kind: "wall", id: "S", side: 1 });
  near(k.value, 30);
  const plan = planDistance([], k, 60, m, sc);
  assert.equal(plan.index, -1);
  near(plan.dx, 0); near(plan.dz, 30); near(plan.dy, 0);
  near(measureKeep(k, plan.me, sc), 60);
  assert.equal(plan.keep.value, 60);
  // a wall-plane dim goes through keepFromWallDim; a stored keep passes through
  assert.deepEqual(toKeep({ keep: k, index: 0 }, m, sc).ref, k.ref);
  assert.equal(planDistance([], k, -1, m, sc).error, "negative");
  assert.equal(planDistance([], k, 400, m, sc).error, "blocked");
});

test("typing a kept distance finds it; typing against a kept one opposite it is a conflict", () => {
  const it = { id: "sofa", x: 100, z: 60, w: 100, d: 50, h: 80 }, sc = planScene([it]), m = me(it);
  const toS = toKeep({ dir: "n", kind: "wall", id: "S", gap: 30 }, m, sc);
  const toN = toKeep({ dir: "s", kind: "wall", id: "N", gap: 210 }, m, sc);
  const toW = toKeep({ dir: "w", kind: "wall", id: "W", gap: 45 }, m, sc);
  const kept = [Object.assign({}, toS, { value: 30 })];
  assert.equal(planDistance(kept, toS, 50, m, sc).index, 0);
  assert.equal(planDistance(kept, toN, 100, m, sc).error, "parallel-conflict");
  const ok = planDistance(kept, toW, 80, m, sc);
  assert.ok(!ok.error);
  near(ok.dx, 35); near(ok.dz, 0);
  assert.equal(matchKeep(kept, toN), -1);
});

test("adding a keep: a loop of pieces kept to each other is refused, so is a third direction", () => {
  const a = { id: "a", x: 100, z: 100, w: 40, d: 40, h: 80 }, b = { id: "b", x: 200, z: 100, w: 40, d: 40, h: 80 };
  const sc = planScene([a, b]);
  const bToA = normalizeKeep({ axis: { x: -1, z: 0 }, ref: { kind: "item", id: "a" }, value: 60 });
  const aToB = normalizeKeep({ axis: { x: 1, z: 0 }, ref: { kind: "item", id: "b" }, value: 60 });
  const all = [{ id: "b", keep: [bToA] }];
  assert.deepEqual(checkAddKeep(all, "a", [], aToB, me(a), sc), { ok: false, reason: "cycle" });
  const w1 = toKeep({ dir: "n", kind: "wall", id: "S" }, me(a), sc), w2 = toKeep({ dir: "w", kind: "wall", id: "W" }, me(a), sc);
  assert.deepEqual(checkAddKeep([], "a", [], w1, me(a), sc), { ok: true });
  const k3 = normalizeKeep({ axis: { x: 0.7071, z: 0.7071 }, ref: { kind: "item", id: "b" }, value: 10 });
  assert.equal(checkAddKeep([], "a", [w1, w2], k3, me(a), sc).reason, "too-many");
});

// plain pieces for the re-seat pass: deps.move writes x / z / elev like the planner's moveItemBy
function seatDeps(items, extra) {
  return Object.assign({
    scene: () => planScene(items),
    me: (it) => me(it),
    move: (it, d) => { it.x += d.dx; it.z += d.dz; },
  }, extra || {});
}

test("re-seat: a piece kept to another comes after it, whatever the list order", () => {
  const a = { id: "a", x: 100, z: 100, w: 40, d: 40, h: 80 }, b = { id: "b", x: 200, z: 100, w: 40, d: 40, h: 80 };
  // b keeps 60 to a's right side (its gap now 60); a keeps 50 from wall W (now 75)
  b.keep = [{ axis: { x: -1, z: 0 }, ref: { kind: "item", id: "a" }, value: 60 }];
  a.keep = [{ axis: { x: -1, z: 0 }, ref: { kind: "wall", id: "W", side: 1 }, value: 50 }];
  const items = [b, a];
  const r = reseatKept(items, seatDeps(items));
  assert.deepEqual(r.moved.map((i) => i.id), ["a", "b"]);
  near(a.x, 75); near(b.x, 175);
  const sc = planScene(items);
  near(measureKeep(a.keep[0], me(a), sc), 50);
  near(measureKeep(b.keep[0], me(b), sc), 60);
  // nothing to do the second time
  assert.equal(reseatKept(items, seatDeps(items)).moved.length, 0);
});

test("re-seat: a keep to a deleted piece is dropped, an emptied list deleted, nothing moves", () => {
  const b = { id: "b", x: 200, z: 100, w: 40, d: 40, h: 80, keep: [{ axis: { x: -1, z: 0 }, ref: { kind: "item", id: "a" }, value: 10 }] };
  const items = [b];
  const r = reseatKept(items, seatDeps(items));
  assert.deepEqual(r.pruned.map((i) => i.id), ["b"]);
  assert.equal(r.moved.length, 0);
  assert.equal(b.keep, undefined);
  near(b.x, 200);
  // the delete path drops it without solving anything
  const c = { id: "c", x: 300, z: 100, w: 40, d: 40, h: 80, keep: [{ axis: { x: 0, z: -1 }, ref: { kind: "wall", id: "S", side: 1 }, value: 1 }, { axis: { x: 1, z: 0 }, ref: { kind: "item", id: "gone" }, value: 5 }] };
  const changed = pruneAll([c], planScene([c]));
  assert.deepEqual(changed.map((i) => i.id), ["c"]);
  assert.equal(c.keep.length, 1);
  assert.equal(c.keep[0].ref.id, "S");
  near(c.z, 100);
});

test("re-seat: a locked or skipped piece stays, `only` leaves unrelated pieces alone", () => {
  const a = { id: "a", x: 100, z: 100, w: 40, d: 40, h: 80, locked: true, keep: [{ axis: { x: -1, z: 0 }, ref: { kind: "wall", id: "W", side: 1 }, value: 50 }] };
  const b = { id: "b", x: 200, z: 100, w: 40, d: 40, h: 80, keep: [{ axis: { x: -1, z: 0 }, ref: { kind: "item", id: "a" }, value: 30 }] };
  const c = { id: "c", x: 300, z: 200, w: 40, d: 40, h: 80, keep: [{ axis: { x: 0, z: 1 }, ref: { kind: "wall", id: "N", side: 1 }, value: 20 }] };
  const items = [a, b, c];
  const r = reseatKept(items, seatDeps(items), { only: ["a"] });
  near(a.x, 100, 0.01, "locked");
  near(b.x, 170, 0.01, "kept to a, follows");
  near(c.z, 200, 0.01, "unrelated");
  assert.deepEqual(r.moved.map((i) => i.id), ["b"]);
  const skip = reseatKept(items, seatDeps(items, { skip: (it) => it === c }));
  near(c.z, 200);
  assert.ok(!skip.moved.includes(c));
  assert.ok(r.conflicts.a == null);
});

test("a held piece's gap is its distance from the held wall face", () => {
  const it = { id: "p", x: 100, z: 45, w: 60, d: 40, h: 80 }, sc = planScene([it]);
  near(holdGap({ wall: "S", gap: 0, side: 1 }, me(it), sc), 20);
  assert.equal(holdGap({ wall: "nope", side: 1 }, me(it), sc), null);
  near(holdGap({ wall: "S", side: 1 }, shiftedItem(me(it), { dx: 0, dz: -20 }), sc), 0);
});

test("kept states and where a kept distance is drawn", () => {
  const it = { id: "p", x: 100, z: 45, w: 60, d: 40, h: 80 }, sc = planScene([it]), m = me(it);
  const st = keepStates([{ axis: { x: 0, z: -1 }, ref: { kind: "wall", id: "S", side: 1 }, value: 20 }, { axis: "y", sign: 1, ref: { kind: "ceiling" }, value: 100 }], m, sc);
  assert.equal(st[0].ok, true); near(st[0].gap, 20);
  assert.equal(st[1].ok, false); near(st[1].gap, 170);
  const seg = keepSegment(st[0].keep, m, st[0].gap);
  near(seg.a.x, 100); near(seg.a.z, 25); near(seg.b.z, 5);
  const up = keepSegment(st[1].keep, m, st[1].gap);
  near(up.a.y, 80); near(up.b.y, 250);
  assert.deepEqual(keptOnLoad([{ junk: 1 }, st[0].keep]).map((k) => k.ref.id), ["S"]);
  assert.equal(keptOnLoad([]), undefined);
});

test("the editor's value: display units, a decimal comma, junk refused", () => {
  const cm = (t) => parseLength(t, "cm"), m = (t) => parseLength(t, "m");
  assert.equal(parseDistanceInput("60", cm), 60);
  assert.equal(parseDistanceInput(" 60,5 ", cm), 60.5);
  near(parseDistanceInput("0.6", m), 60);
  near(parseDistanceInput("0,6", m), 60);
  near(parseDistanceInput("60 cm", m), 60);
  near(parseDistanceInput("2'", cm), 60.96);
  assert.ok(Number.isNaN(parseDistanceInput("", cm)));
  assert.ok(Number.isNaN(parseDistanceInput("abc", cm)));
});

test("persistence: a reopened file keeps `keep`, a duplicate does not copy it", async () => {
  const { moduleSource } = await import("./helpers/module_source.mjs");
  const { sourceFunctionText } = await import("./helpers/source_function.mjs");
  // applyDataRequest's item mapper is a whitelist (it silently dropped a field before)
  const load = sourceFunctionText(moduleSource("js/ui.js"), "applyDataRequest");
  assert.match(load, /keep: keptOnLoad\(it\.keep\)/);
  const { prepareItemDuplicate } = await import("../js/commands/item_duplicate.js");
  const src = { id: "a", type: "sofa", x: 10, z: 20, keep: [{ axis: { x: 1, z: 0 }, ref: { kind: "item", id: "b" }, value: 5 }] };
  const r = prepareItemDuplicate({ sourceId: "a" }, { state: { items: [src] } });
  assert.equal(r.ok, true);
  assert.equal(r.plan.params.items[0].keep, undefined);
  assert.equal(src.keep.length, 1, "the original keeps its own");
});
