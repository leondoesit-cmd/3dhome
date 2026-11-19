/* Wall junction rules (WALL_JUNCTIONS_PLAN.md 3.2): at a two-arm corner the
   same assembly wraps (today's mitre), different assemblies give the stronger
   wall the corner and square the other against it, a manual join sets the
   pair — and no measured length moves with any of it. */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { faceShiftAt, wallOutline, wallClearLength, wallCuts } from "../js/geometry.js";
import { junctionRole, ownerOrder, sameAssembly, wallCoreClass } from "../js/wall_junctions.js";

const CONCRETE = (t = 20) => [{ thickness: t, material: "reinforced-concrete", role: "core", main: true, structural: true }];
const BLOCK = (t = 10, structural = true) => [{ thickness: t, material: "concrete-block", role: "core", main: true, structural }];
const BRICK = (t = 20, structural = true) => [{ thickness: t, material: "brick", role: "core", main: true, structural }];

function wall(id, a, b, layers, extra = {}) {
  const thickness = layers.reduce((s, l) => s + l.thickness, 0);
  return { id, a, b, thickness, height: 270, layers, ...extra };
}
function plan(nodes, walls) {
  S.interiorDims = true;
  S.roomMeta = {};
  S.openings = [];
  S.items = [];
  S.nodes = nodes;
  S.walls = walls;
}
const near = (p, q, tol = 0.01) => Math.abs(p.x - q.x) < tol && Math.abs(p.z - q.z) < tol;
const has = (poly, p) => poly.some((q) => near(p, q));

// polygon area (shoelace) and a strict inside test, for gap/overlap checks
function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    s += p.x * q.z - q.x * p.z;
  }
  return Math.abs(s) / 2;
}
function inside(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
function overlapSamples(p1, p2) {
  const xs = [...p1, ...p2].map((p) => p.x), zs = [...p1, ...p2].map((p) => p.z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  let n = 0;
  for (let x = x0 + 0.137; x < x1; x += 0.5)
    for (let z = z0 + 0.211; z < z1; z += 0.5) if (inside(p1, x, z) && inside(p2, x, z)) n++;
  return n;
}
function onSegment(p, a, b, tol = 0.01) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2;
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) < tol;
}
const onOutline = (p, poly) => poly.some((a, i) => onSegment(p, a, poly[(i + 1) % poly.length]));

test("same assembly at 90 degrees wraps: the outline is today's mitre", () => {
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, CONCRETE())]);
  const [w1, w2] = S.walls;
  assert.equal(junctionRole(w1, 1), "wrap");
  assert.equal(junctionRole(w2, 1), "wrap");
  assert.ok(sameAssembly(w1, w2, 1));
  const o1 = wallOutline(w1), o2 = wallOutline(w2);
  assert.deepEqual(o1.map((p) => [p.x, p.z]), [[0, 10], [390, 10], [410, -10], [0, -10]]);
  assert.ok(has(o2, { x: 390, z: 10 }) && has(o2, { x: 410, z: -10 }), "both walls share the diagonal");
});

test("layers read from the corner's outer to inner side: a reversed stack is the same assembly", () => {
  const stack = [
    { thickness: 2, material: "render", role: "finish-exterior" },
    { thickness: 20, material: "concrete-block", role: "core", main: true, structural: true },
    { thickness: 1.5, material: "plaster", role: "finish-interior" },
  ];
  // a square drawn a->b round the corner, and the same corner with the second wall drawn b->a
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, stack), wall(2, 1, 2, stack)]);
  assert.ok(sameAssembly(S.walls[0], S.walls[1], 1), "drawn round the corner");
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, stack), wall(2, 2, 1, stack)]);
  assert.equal(sameAssembly(S.walls[0], S.walls[1], 1), false, "the reversed wall puts its render inside");
  S.walls[1].layersReversed = true;
  assert.ok(sameAssembly(S.walls[0], S.walls[1], 1), "layersReversed turns it back");
  assert.equal(junctionRole(S.walls[0], 1), "wrap");
});

test("concrete 20 + block 10 at 90 degrees: the concrete runs through, the block butts square", () => {
  for (const order of ["concrete first", "block first"]) {
    const concrete = wall(order === "concrete first" ? 1 : 2, 0, 1, CONCRETE()),
      block = wall(order === "concrete first" ? 2 : 1, 1, 2, BLOCK());
    plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
      order === "concrete first" ? [concrete, block] : [block, concrete]);
    assert.equal(junctionRole(concrete, 1), "owner", order);
    assert.equal(junctionRole(block, 1), "butt", order);
    const oc = wallOutline(concrete), ob = wallOutline(block);
    assert.deepEqual(oc.map((p) => [p.x, p.z]), [[0, 10], [405, 10], [405, -10], [0, -10]],
      "the concrete is a rectangle to the block's far face");
    assert.ok(has(ob, { x: 395, z: 10 }) && has(ob, { x: 405, z: 10 }),
      "the block ends square on the concrete's near face");
    assert.equal(overlapSamples(oc, ob), 0, "no overlap");
  }
});

test("the same corner at 60 degrees shares one full edge, no gap and no overlap", () => {
  const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3);
  // the block leaves the node at 60 degrees to the concrete
  const nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400 - 300 * c, z: 300 * s }];
  plan(nodes, [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, BLOCK())]);
  const [concrete, block] = S.walls;
  const oc = wallOutline(concrete), ob = wallOutline(block);
  const ends = ob.filter((p) => Math.hypot(p.x - 400, p.z) < 40);
  assert.equal(ends.length, 2, "the block has two end corners at the joint");
  ends.forEach((p) => assert.ok(onOutline(p, oc), "each lies on the concrete's outline"));
  ends.forEach((p) => assert.ok(Math.abs(p.z - 10) < 0.01, "on the concrete's near face line"));
  assert.ok(ends.some((p) => has(oc, p)), "one of them is the concrete's own corner");
  assert.equal(overlapSamples(oc, ob), 0, "no overlap");
  // no gap: the pair covers exactly what the mitred pair covered
  const butted = area(oc) + area(ob);
  concrete.join = { b: "miter" };
  const mitred = area(wallOutline(concrete)) + area(wallOutline(block));
  assert.ok(Math.abs(butted - mitred) < 0.01, `same covered area (${butted.toFixed(3)} vs ${mitred.toFixed(3)})`);
});

/* Each priority step decides on its own: the pair differs in that property
   only (and in nothing earlier), and the result is the same whichever wall
   was created first or carries the lower id. */
test("each owner priority step decides in isolation, independent of ids and creation order", () => {
  const cases = [
    ["phase: existing beats new", BRICK(20), BRICK(20), { phase: "existing" }, { phase: "new" }],
    ["phase: a wall being demolished never owns", CONCRETE(30), BRICK(10), { phase: "demolition" }, {}],
    ["core: concrete beats masonry", CONCRETE(20), BLOCK(20), {}, {}],
    ["core: masonry beats light", BLOCK(10, false), [{ thickness: 12, material: "steel-stud-air-cavity", role: "core", main: true, structural: true }], {}, {}],
    ["structural main layer", BLOCK(20, true), BRICK(20, false), {}, {}],
    ["thicker", BRICK(20), BLOCK(15), {}, {}],
  ];
  for (const [label, la, lb, xa, xb] of cases) {
    for (const flip of [false, true]) {
      const A = wall(flip ? 2 : 1, 0, 1, la, xa), B = wall(flip ? 1 : 2, 1, 2, lb, xb);
      plan([{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }], flip ? [B, A] : [A, B]);
      const expectA = label !== "phase: a wall being demolished never owns";
      assert.equal(junctionRole(A, 1), expectA ? "owner" : "butt", `${label} (flip ${flip})`);
      assert.equal(junctionRole(B, 1), expectA ? "butt" : "owner", `${label} (flip ${flip})`);
    }
  }
  // longer: brick and block of equal thickness, both structural
  for (const flip of [false, true]) {
    const A = wall(flip ? 2 : 1, 0, 1, BRICK(20)), B = wall(flip ? 1 : 2, 1, 2, BLOCK(20));
    plan([{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 300 }], flip ? [B, A] : [A, B]);
    assert.equal(junctionRole(A, 1), "owner", `longer (flip ${flip})`);
  }
  // equal in everything the rule reads: only then the lower id decides
  const A = wall(1, 0, 1, BRICK(20)), B = wall(2, 1, 2, BLOCK(20));
  plan([{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }], [B, A]);
  assert.equal(junctionRole(A, 1), "owner", "lower id");
  assert.ok(ownerOrder(A, B) > 0 && ownerOrder(B, A) < 0, "the order is antisymmetric");
  assert.equal(wallCoreClass(wall(9, 0, 1, BLOCK())), "masonry");
  assert.equal(wallCoreClass({ id: 9, a: 0, b: 1, thickness: 10 }), "masonry", "an untyped wall is generic masonry");
});

test("Invariant M: no measured length changes with the join mode", () => {
  const corners = [
    ["mixed", () => [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, BLOCK())]],
    ["same", () => [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, CONCRETE())]],
  ];
  for (const [label, make] of corners) {
    for (const angle of [90, 60, 120]) {
      const r = (angle * Math.PI) / 180;
      const nodes = () => [{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400 - 300 * Math.cos(r), z: 300 * Math.sin(r) }];
      for (const side of [1, -1, 0]) {
        const lengths = {};
        for (const mode of ["auto", "miter", "butt", "through"]) {
          const walls = make();
          walls.forEach((w) => (w.dimSide = side));
          if (mode !== "auto") walls[0].join = { b: mode };
          plan(nodes(), walls);
          lengths[mode] = walls.map((w) => [wallClearLength(w), wallCuts(w).a, wallCuts(w).b]);
        }
        for (const mode of ["miter", "butt", "through"])
          assert.deepEqual(lengths[mode], lengths.auto, `${label} ${angle}° side ${side}: ${mode}`);
      }
    }
  }
});

test("R5: a manual join on one wall gives the neighbour the matching role", () => {
  const make = (ja, jb) => {
    const c = wall(1, 0, 1, CONCRETE(), ja ? { join: { b: ja } } : {}),
      b = wall(2, 1, 2, BLOCK(), jb ? { join: { a: jb } } : {});
    plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }], [c, b]);
    return [junctionRole(c, 1), junctionRole(b, 1)];
  };
  assert.deepEqual(make(null, "through"), ["butt", "owner"], "through on the block makes the concrete butt");
  assert.deepEqual(make(null, "butt"), ["owner", "butt"], "butt on the block makes the concrete the owner");
  assert.deepEqual(make("butt", null), ["butt", "owner"], "butt on the concrete makes the block the owner");
  assert.deepEqual(make("miter", null), ["wrap", "wrap"], "miter on either makes both wrap");
  assert.deepEqual(make(null, "mitre"), ["wrap", "wrap"]);
  assert.deepEqual(make("through", "butt"), ["owner", "butt"], "agreeing values stand");
  assert.deepEqual(make("through", "through"), ["owner", "butt"], "conflict: the higher priority keeps its own");
  assert.deepEqual(make("butt", "butt"), ["butt", "owner"], "conflict: the concrete's butt stands");
  assert.deepEqual(make("miter", "through"), ["wrap", "wrap"], "conflict: the concrete's miter stands");
  // the pair is built that way: through on the block runs it to the concrete's far face
  const c = wall(1, 0, 1, CONCRETE()), b = wall(2, 1, 2, BLOCK(), { join: { a: "through" } });
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }], [c, b]);
  assert.ok(has(wallOutline(b), { x: 395, z: -10 }) && has(wallOutline(b), { x: 405, z: -10 }));
  assert.ok(has(wallOutline(c), { x: 395, z: 10 }) && has(wallOutline(c), { x: 395, z: -10 }));
});

test("three arms keep the old rule: no junction role at a T", () => {
  plan([{ x: 0, z: -100 }, { x: 0, z: 0 }, { x: 0, z: 100 }, { x: 100, z: 0 }],
    [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, CONCRETE()), wall(3, 1, 3, BLOCK())]);
  S.walls.forEach((w) => assert.equal(junctionRole(w, 1), null));
});

/* The 3D cutaway builder (js/view3d/site_cutaway.js getCursor / endMitre) cuts
   each end where faceShiftAt says, so it builds what the plan draws. */
test("the end cuts the 3D builder asks for: owner spans, block butts", () => {
  plan([{ x: 0, z: 0 }, { x: 400, z: 0 }, { x: 400, z: 300 }],
    [wall(1, 0, 1, CONCRETE()), wall(2, 1, 2, BLOCK())]);
  const [concrete, block] = S.walls;
  // concrete leaves node 1 along -x, block along +z
  for (const s of [1, -1]) {
    assert.equal(faceShiftAt(1, -1, 0, s, concrete, 10), -5, "the concrete runs past the node to the block's far face");
    assert.equal(faceShiftAt(1, 0, 1, s, block, 5), 10, "the block stops square on the concrete's near face");
  }
});
