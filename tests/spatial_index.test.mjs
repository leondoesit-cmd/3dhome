import test from "node:test";
import assert from "node:assert/strict";

import { createSpatialIndex, planIndex } from "../js/spatial_index.js";

/* Deterministic PRNG (mulberry32). The randomised correctness test below is the
   one that actually pins the broad-phase guarantee, and a failure there is only
   useful if it reproduces — so the sequence is seeded and fixed, never
   Math.random(). */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Distance from a point to a record's box, 0 inside. This is the exact test the
// index only approximates, and the reference the superset assertions use.
function distToBox(x, z, r) {
  const dx = Math.max(r.minx - x, 0, x - r.maxx);
  const dz = Math.max(r.minz - z, 0, z - r.maxz);
  return Math.hypot(dx, dz);
}
function bruteForce(records, x, z, r) {
  return records.filter((rec) => distToBox(x, z, rec) <= r);
}
function wall(id, ax, az, bx, bz, thickness) {
  const h = (thickness || 10) / 2;
  return {
    kind: "wall", id: id,
    minx: Math.min(ax, bx) - h, maxx: Math.max(ax, bx) + h,
    minz: Math.min(az, bz) - h, maxz: Math.max(az, bz) + h,
  };
}
function item(id, x, z, w, d) {
  return {
    kind: "item", id: id,
    minx: x - w / 2, maxx: x + w / 2,
    minz: z - d / 2, maxz: z + d / 2,
  };
}

test("an empty model answers queries instead of failing to size a grid", () => {
  const ix = createSpatialIndex([]);
  assert.deepEqual(ix.query(0, 0, 50), []);
  assert.deepEqual(ix.query(1e6, -1e6, 5000), []);
  const s = ix.stats();
  assert.equal(s.records, 0);
  assert.equal(s.entries, 0);
  assert.ok(s.cell > 0, "a model with no pitch to read still gets a usable cell size");
});

test("a single wall sizes the grid to its own length and is found along it", () => {
  const w = wall("w1", 0, 0, 600, 0, 20);
  const ix = createSpatialIndex([w]);
  const s = ix.stats();
  // median of one value is that value; 600 long + 20 thick gives the diagonal
  assert.ok(s.cell > 500 && s.cell < 700, `cell ${s.cell} tracks the one wall's length`);
  assert.equal(s.records, 1);
  for (let x = 0; x <= 600; x += 25)
    assert.deepEqual(ix.query(x, 0, 10), [w], `found from x=${x}`);
  // and reachable from every cell it crosses, not just the one holding its origin
  assert.deepEqual(ix.query(600, 8, 5), [w]);
  assert.deepEqual(ix.query(2000, 0, 10), [], "far away answers nothing");
});

test("a query disc spanning four cells returns records from all four", () => {
  /* Walls 400 long put the cell size at ~400, so a 100 cm disc centred on a
     cell corner has to read four cells. One item is parked in each quadrant
     around that corner, far enough from it that a coarser grid would be the
     only way to see all four. */
  const records = [
    wall("a", 0, 0, 400, 0), wall("b", 0, 400, 400, 400),
    wall("c", 0, 800, 400, 800), wall("d", 0, 1200, 400, 1200),
  ];
  const ix = createSpatialIndex(records);
  const cell = ix.stats().cell;
  const cx = ix.stats().originX + cell, cz = ix.stats().originZ + cell;
  const quad = [
    item("q1", cx - 5, cz - 5, 4, 4), item("q2", cx + 5, cz - 5, 4, 4),
    item("q3", cx - 5, cz + 5, 4, 4), item("q4", cx + 5, cz + 5, 4, 4),
  ];
  ix.build(records.concat(quad));
  const got = ix.query(cx, cz, 20).map((r) => r.id);
  for (const q of quad) assert.ok(got.includes(q.id), `${q.id} came back`);
  // each of the four sits in a different cell, or this test proves nothing
  const seen = new Set(quad.map((q) => {
    const s = ix.stats();
    return Math.floor((q.minx - s.originX) / s.cell) + "," + Math.floor((q.minz - s.originZ) / s.cell);
  }));
  assert.equal(seen.size, 4, "the four items really do live in four cells");
});

test("5000 items build once and a query reads a small slice of them", () => {
  const rand = rng(20260831);
  const records = [];
  // house-scale walls (2–5 m), so the median pitch is a real room's worth
  for (let i = 0; i < 40; i++) {
    const x = rand() * 4000, z = rand() * 4000, len = 200 + rand() * 300;
    records.push(rand() < 0.5 ? wall("w" + i, x, z, x + len, z, 20)
      : wall("w" + i, x, z, x, z + len, 20));
  }
  for (let i = 0; i < 5000; i++)
    records.push(item("i" + i, rand() * 4000, rand() * 4000, 40 + rand() * 60, 40 + rand() * 60));

  const ix = createSpatialIndex(records);
  const t0 = process.hrtime.bigint();
  ix.build();
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
  // Deliberately loose: this is a "did the build stay linear" guard, not a
  // benchmark, and it has to survive a loaded CI box. A quadratic or
  // allocation-per-cell build blows past this by orders of magnitude.
  assert.ok(buildMs < 500, `build of 5040 records took ${buildMs.toFixed(1)}ms`);

  const s = ix.stats();
  assert.equal(s.records, 5040);
  assert.ok(s.entries >= s.records, "every record is in at least one cell");

  let worst = 0, total = 0;
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 500; i++) {
    const got = ix.query(rand() * 4000, rand() * 4000, 20);
    worst = Math.max(worst, got.length);
    total += got.length;
  }
  const queryMs = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.ok(worst < 1000, `worst query returned ${worst} of 5040 candidates`);
  assert.ok(total / 500 < 400, "the average query is a small fraction of the model");
  assert.ok(queryMs < 500, `500 queries took ${queryMs.toFixed(1)}ms`);
});

test("randomised queries never miss a record a brute-force scan finds", () => {
  const rand = rng(7);
  for (let trial = 0; trial < 12; trial++) {
    const records = [];
    // A mix of long thin walls, boxes and zero-extent points, spread over a
    // span that changes per trial so the cell size lands differently each time.
    const span = 200 + trial * 900;
    const n = 30 + Math.floor(rand() * 200);
    for (let i = 0; i < n; i++) {
      const x = (rand() - 0.5) * span, z = (rand() - 0.5) * span;
      const roll = rand();
      if (roll < 0.3) records.push(wall("w" + i, x, z, x + (rand() - 0.5) * span, z + (rand() - 0.5) * span, 5 + rand() * 30));
      else if (roll < 0.8) records.push(item("i" + i, x, z, 1 + rand() * 200, 1 + rand() * 200));
      else records.push({ kind: "node", id: "n" + i, minx: x, maxx: x, minz: z, maxz: z });
    }
    const ix = createSpatialIndex(records);
    for (let q = 0; q < 200; q++) {
      // radii from "a pixel" to "half the plan", and some centres deliberately
      // outside the indexed extent
      const x = (rand() - 0.5) * span * 1.6, z = (rand() - 0.5) * span * 1.6;
      const r = rand() < 0.1 ? rand() * span : rand() * 60;
      const got = ix.query(x, z, r);
      const exact = bruteForce(records, x, z, r);
      const ids = new Set(got.map((rec) => rec.id));
      assert.equal(ids.size, got.length, "no record is returned twice");
      for (const rec of exact)
        assert.ok(ids.has(rec.id),
          `trial ${trial} query ${q}: ${rec.kind} ${rec.id} is within ${r} of (${x}, ${z}) but the index omitted it`);
    }
  }
});

test("records with NaN or Infinity coordinates are dropped, not indexed", () => {
  const good = item("ok", 0, 0, 50, 50);
  const records = [
    good,
    { kind: "item", id: "nan", minx: NaN, maxx: 10, minz: 0, maxz: 10 },
    { kind: "item", id: "inf", minx: 0, maxx: Infinity, minz: 0, maxz: 10 },
    { kind: "node", id: "ninf", minx: -Infinity, maxx: 0, minz: 0, maxz: 0 },
    { kind: "item", id: "undef", minx: 0, maxx: 10, minz: 0 },
    null,
  ];
  const ix = createSpatialIndex(records);
  const s = ix.stats();
  assert.equal(s.records, 1);
  assert.equal(s.dropped, 5);
  // the surviving record is still findable — a poisoned cell index would have
  // taken the whole grid down with it
  assert.deepEqual(ix.query(0, 0, 5), [good]);
  assert.ok(Number.isFinite(s.cell) && Number.isFinite(s.originX));
});

test("a reversed box is repaired rather than dropped", () => {
  const flipped = { kind: "item", id: "flip", minx: 100, maxx: 0, minz: 60, maxz: 10 };
  const ix = createSpatialIndex([flipped]);
  assert.equal(ix.stats().dropped, 0);
  assert.deepEqual(ix.query(50, 35, 1), [flipped]);
});

test("invalidate() makes the next query see mutated data", () => {
  const records = [item("a", 0, 0, 40, 40)];
  const ix = createSpatialIndex(records);
  assert.deepEqual(ix.query(1000, 1000, 30).map((r) => r.id), []);

  const late = item("b", 1000, 1000, 40, 40);
  records.push(late);
  assert.deepEqual(ix.query(1000, 1000, 30), [], "a stale index keeps its answer until told otherwise");
  assert.equal(ix.isStale(), false);
  ix.invalidate();
  assert.equal(ix.isStale(), true);
  assert.deepEqual(ix.query(1000, 1000, 30), [late]);
  assert.equal(ix.isStale(), false, "the query rebuilt, so one invalidate costs one rebuild");

  // and a removal is picked up the same way
  records.length = 1;
  ix.invalidate();
  assert.deepEqual(ix.query(1000, 1000, 30), []);
});

test("a function source is re-read on rebuild, not captured once", () => {
  let generation = 0;
  const ix = createSpatialIndex(() => [item("g" + generation, generation * 500, 0, 40, 40)]);
  assert.deepEqual(ix.query(0, 0, 30).map((r) => r.id), ["g0"]);
  generation = 1;
  ix.invalidate();
  assert.deepEqual(ix.query(0, 0, 30), [], "the old record is gone");
  assert.deepEqual(ix.query(500, 0, 30).map((r) => r.id), ["g1"]);
});

test("a kinds filter keeps off-layer records out of the result", () => {
  const records = [
    item("sofa", 0, 0, 200, 90),
    { kind: "mepNode", id: "socket", minx: -5, maxx: 5, minz: -5, maxz: 5 },
    wall("w", -300, -50, 300, -50, 20),
  ];
  const ix = createSpatialIndex(records);
  assert.equal(ix.query(0, 0, 60).length, 3);
  assert.deepEqual(ix.query(0, 0, 60, ["item", "wall"]).map((r) => r.id), ["sofa", "w"]);
  assert.deepEqual(ix.query(0, 0, 60, new Set(["mepNode"])).map((r) => r.id), ["socket"]);
});

test("one very long wall in a fine grid stays bounded", () => {
  /* The clamps are what make this safe: a plan full of 5 cm stubs would size
     the grid off them, and a 200 m boundary wall crossing it must not turn into
     a five-figure pile of cell memberships. */
  const records = [];
  for (let i = 0; i < 50; i++) records.push(wall("s" + i, i * 10, 0, i * 10 + 5, 0, 4));
  records.push(wall("long", 0, 0, 20000, 0, 20));
  const ix = createSpatialIndex(records);
  const s = ix.stats();
  assert.ok(s.cell >= 40, `cell ${s.cell} is clamped up off the stub length`);
  assert.ok(s.entries < 4000, `${s.entries} memberships for 51 records`);
  assert.deepEqual(ix.query(19000, 0, 20).map((r) => r.id), ["long"]);
});

test("queryBox answers the rectangle the disc query is built on", () => {
  const a = item("a", 0, 0, 20, 20), b = item("b", 500, 500, 20, 20);
  const ix = createSpatialIndex([a, b]);
  assert.deepEqual(ix.queryBox(-50, -50, 50, 50).map((r) => r.id), ["a"]);
  const both = ix.queryBox(-50, -50, 550, 550).map((r) => r.id);
  assert.ok(both.includes("a") && both.includes("b"));
  assert.deepEqual(ix.queryBox(NaN, 0, 10, 10), []);
});

test("the shared plan index starts empty and is buildable", () => {
  // planIndex exists so a hit test and the snap resolver in the same
  // pointermove share one build; wiring it is a later step, so all that is
  // asserted here is that it is a usable, empty index.
  assert.equal(typeof planIndex.query, "function");
  assert.deepEqual(planIndex.query(0, 0, 100), []);
});
