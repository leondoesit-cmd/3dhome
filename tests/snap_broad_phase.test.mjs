/* The broad phase must not change any answer.

   `snapPoint()` and the `hit*` family used to walk the whole model on every
   pointermove; they now ask js/spatial_index.js for the records near the cursor
   and run their unchanged exact tests over that shorter list. That is only a
   pure optimization if the grid never omits a candidate the exact test would
   have accepted — and snapPoint ranks by `score: d * S.SC - SNAP_BONUS[kind]`,
   so a silently dropped candidate does not merely cost a snap, it hands the win
   to a different one and quietly changes what the user's drawing becomes.

   The test drives the REAL resolver twice over the same plan and the same
   cursor. The only difference between the runs is how wide the index is asked:
   the reference run replaces `planIndex.query` with a call to `queryBox` over
   the whole plane, so every record of the requested kind comes back and every
   pass degenerates to exactly the linear scan it replaced. Same code, same
   exact tests, same ordering — only the broad phase widened. If the grid drops
   anything, the two runs disagree. */
import test from "node:test";
import assert from "node:assert/strict";

/* interaction.js reaches for the DOM at load (it wires plan listeners on
   demand, but plan2d.js and its imports touch window/document at module
   evaluation). The stubs are the minimum that lets the module graph link; no
   test below renders anything. */
globalThis.window = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { href: "http://localhost/" },
};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init || {});
  }
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    getContext: () => null,
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
  }),
  addEventListener() {},
  body: { classList: { add() {}, remove() {} } },
};

const { S } = await import("../js/state.js");
const { planIndex } = await import("../js/spatial_index.js");
const { snapPoint, updateWallProbe, beginSnapSession, endSnapSession } = await import("../js/interaction.js");
const { render2DNow } = await import("../js/plan2d.js");

/* Widen the broad phase to the whole plan. queryBox() over a box that contains
   every finite coordinate returns every record of the asked-for kinds, built
   from the same source and in the same insertion order, which is what makes
   the reference run identical to the pre-index linear scans. */
const gridQuery = planIndex.query;
function everything(x, z, r, kinds) {
  return planIndex.queryBox(-1e12, -1e12, 1e12, 1e12, kinds);
}
function withFullScan(fn) {
  planIndex.query = everything;
  try {
    return fn();
  } finally {
    planIndex.query = gridQuery;
  }
}

let nid = 0;
function node(x, z) {
  S.nodes.push({ x, z });
  return S.nodes.length - 1;
}
function wall(a, b, extra) {
  const w = Object.assign({ id: "w" + ++nid, a, b, thickness: 10 }, extra || {});
  S.walls.push(w);
  return w;
}

/* A plan with enough going on that every pass of the resolver has something to
   offer: a closed outer room, two interior partitions that cross, a curved
   wall, a rotated furniture run, two openings and two placeholder points. */
function buildPlan() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.markers = [];
  S.mep = null;
  S.slabOpenings = [];
  S.roomMeta = {};
  S.sel = null;
  S.SC = 1;
  S.snapKinds = null;
  S.snapOnly = null;
  S.snapCycle = 0;
  S.osnap = true;
  S.ortho = false;
  S.tool = "select";
  S.drawing = false;
  S.drawStart = null;
  S.drawWalls = [];
  S.blueprintTrace = null;
  S.snapStrength = 1;
  nid = 0;

  const a = node(0, 0), b = node(800, 0), c = node(800, 600), d = node(0, 600);
  wall(a, b);
  wall(b, c);
  wall(c, d);
  wall(d, a);

  // two partitions that genuinely cross, so the intersection pass has work
  const e = node(300, -60), f = node(300, 660);
  wall(e, f, { thickness: 8 });
  const g = node(-60, 380), h = node(560, 380);
  wall(g, h, { thickness: 8 });

  // an oblique wall, to keep the extension and perpendicular passes honest
  const i = node(560, 120), j = node(760, 300);
  wall(i, j, { thickness: 12 });

  // a curved wall — its bounding box is the one the grid has to get exactly
  // right, since a chord box would cut the bulge
  const k = node(120, 700), l = node(680, 700);
  wall(k, l, { thickness: 10, bulge: 0.6 });

  S.openings.push({ id: "o1", wall: S.walls[0].id, s: 200, width: 90, type: "door" });
  S.openings.push({ id: "o2", wall: S.walls[2].id, s: 400, width: 120, type: "window" });

  for (let n = 0; n < 12; n++) {
    S.items.push({
      id: "it" + n,
      type: "sofa",
      x: 80 + (n % 4) * 190,
      z: 90 + Math.floor(n / 4) * 170,
      w: 120 + (n % 3) * 30,
      d: 60 + (n % 2) * 25,
      rot: n * 27,
    });
  }

  S.markers.push({ id: "m1", x: 420, z: 240, y: 0 });
  S.markers.push({ id: "m2", x: 150, z: 520, y: 0 });

  // the index is fed from the model, and every mutation path in the app marks
  // it stale through a paint request; do the same by hand here
  render2DNow();
}

/* A snap result, flattened to something comparable. `wall` and the `walls`
   list are live objects, so they are reduced to ids — comparing the winner's
   identity is the point, not its object graph. */
function shape(r) {
  if (!r) return null;
  return {
    x: r.x,
    z: r.z,
    node: r.node,
    wall: r.wall ? r.wall.id : null,
    s: r.s,
    walls: (r.walls || []).map((w) => w.id).join(","),
    blockedOpening: r.blockedOpening || null,
    // the resolver's own account of what it picked and what it beat
    type: S.snapInfo ? S.snapInfo.type : null,
    alts: S.snapInfo ? S.snapInfo.alts : 0,
    ranked: (S.snapAlts || []).map((c) => c.kind + "@" + c.x.toFixed(6) + "," + c.z.toFixed(6)).join("|"),
  };
}

function bothWays(px, pz, origins) {
  const viaGrid = shape(snapPoint(px, pz, origins));
  const viaScan = withFullScan(() => shape(snapPoint(px, pz, origins)));
  return { viaGrid, viaScan };
}

test("the grid and a full scan pick the same snap, everywhere on the plan", () => {
  buildPlan();
  let checked = 0, agreed = 0, snapped = 0;
  // a lattice fine enough to land inside, on and just outside every snap band
  for (let x = -120; x <= 900; x += 17) {
    for (let z = -120; z <= 780; z += 19) {
      const { viaGrid, viaScan } = bothWays(x, z, null);
      checked++;
      assert.deepEqual(viaGrid, viaScan, "cursor at " + x + "," + z);
      agreed++;
      if (viaGrid.type) snapped++;
    }
  }
  assert.equal(agreed, checked);
  // a lattice that never actually snapped would agree vacuously
  assert.ok(snapped > 200, "the lattice exercises real snaps (" + snapped + ")");
});

test("...and with drawing origins, which unlock the perpendicular pass", () => {
  buildPlan();
  let perp = 0, ext = 0;
  const origins = [[0], [1, 2], [4, 5]];
  for (const from of origins) {
    for (let x = -100; x <= 880; x += 23) {
      for (let z = -100; z <= 760; z += 29) {
        const { viaGrid, viaScan } = bothWays(x, z, from);
        assert.deepEqual(viaGrid, viaScan, "cursor " + x + "," + z + " from " + from.join("/"));
        if (viaGrid.type === "perpendicular") perp++;
        if (viaGrid.type === "extension") ext++;
      }
    }
  }
  assert.ok(perp > 0, "the perpendicular pass produced winners");
  assert.ok(ext > 0, "the extension pass produced winners");
});

/* A second plan, deliberately fine-grained. The grid sizes its cells from the
   median wall length, so on the room-scale plan above a cell is several hundred
   centimetres across and a query radius that is too small by a few centimetres
   is invisible — the cell the cursor sits in hands back the record anyway. A
   model of 40 cm stubs pushes the cell size down to the index's own floor, and
   that is where a radius has to be right to the centimetre. This is the plan
   that makes the lattice below able to fail. */
function buildDensePlan() {
  buildPlan();
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.markers = [];
  nid = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const a = node(c * 45, r * 45), b = node(c * 45 + 40, r * 45);
      wall(a, b, { thickness: 6 });
      const d = node(c * 45, r * 45), e2 = node(c * 45, r * 45 + 40);
      wall(d, e2, { thickness: 6 });
    }
  }
  for (let n = 0; n < 16; n++)
    S.items.push({
      id: "d" + n, type: "stool",
      x: 20 + (n % 4) * 90, z: 20 + Math.floor(n / 4) * 90,
      w: 28, d: 22, rot: n * 33,
    });
  S.markers.push({ id: "dm1", x: 137, z: 214, y: 0 });
  render2DNow();
}

/* Two zooms, and both are needed. At S.SC = 1 the tolerance is 14 cm, which is
   smaller than the index's 40 cm minimum cell, so the cell the cursor sits in
   masks any radius that is merely a little too small. Zoomed out the tolerance
   in world centimetres swells past the cell and every radius is then load-
   bearing to the centimetre — including the wide one the intersection and
   extension passes reach with, which is derived from it. */
const ZOOMS = [{ sc: 1, step: 9 }, { sc: 0.12, step: 23 }];

test("on a fine-grained plan, where a cell is as small as the index allows", () => {
  let snapped = 0;
  for (const { sc, step } of ZOOMS) {
    buildDensePlan();
    S.SC = sc;
    render2DNow();
    for (let x = -30; x <= 260; x += step) {
      for (let z = -30; z <= 260; z += step + 2) {
        const { viaGrid, viaScan } = bothWays(x, z, null);
        assert.deepEqual(viaGrid, viaScan, "cursor at " + x + "," + z + " @SC " + sc);
        if (viaGrid.type) snapped++;
      }
    }
  }
  S.SC = 1;
  assert.ok(snapped > 200, "the lattice exercises real snaps (" + snapped + ")");
});

test("...and the same plan with drawing origins", () => {
  for (const { sc, step } of ZOOMS) {
    buildDensePlan();
    S.SC = sc;
    render2DNow();
    for (const from of [[0], [2, 3], [10]]) {
      for (let x = -30; x <= 260; x += step + 4) {
        for (let z = -30; z <= 260; z += step + 6) {
          const { viaGrid, viaScan } = bothWays(x, z, from);
          assert.deepEqual(viaGrid, viaScan,
            "cursor " + x + "," + z + " from " + from.join("/") + " @SC " + sc);
        }
      }
    }
  }
  S.SC = 1;
});

test("zoomed out, where the tolerance in world cm swells, the answers still match", () => {
  buildPlan();
  // thr is 14 px / S.SC, so a small scale is what makes every radius large and
  // every candidate list long — the case where a broad phase could most easily
  // be too narrow rather than too wide
  S.SC = 0.12;
  render2DNow();
  for (let x = -200; x <= 1000; x += 37) {
    for (let z = -200; z <= 900; z += 41) {
      const { viaGrid, viaScan } = bothWays(x, z, [3]);
      assert.deepEqual(viaGrid, viaScan, "cursor " + x + "," + z);
    }
  }
  S.SC = 1;
});

/* Ties. `cands.sort` is stable, so two candidates with the same score keep the
   order they were offered in, and that order used to be S.walls order. The grid
   returns records in cell order, which is not that; nearRecs() sorts by `ord` to
   put it back. Nothing in the plans above is coincident enough to produce an
   exact tie, so this builds one on purpose: two walls on the same pair of
   corners offer the same midpoint at the same distance, and only the ordering
   decides which wall id the caller is handed. */
test("an exact score tie is broken the same way as the linear scan did", () => {
  buildPlan();
  const a = node(-400, -400), b = node(-400, -200);
  const first = wall(a, b, { thickness: 9 });
  const second = wall(a, b, { thickness: 9 });
  render2DNow();
  assert.notEqual(first.id, second.id);

  const { viaGrid, viaScan } = bothWays(-400, -300, null);
  assert.equal(viaGrid.type, "midpoint", "the coincident pair really does tie");
  assert.deepEqual(viaGrid, viaScan);
  // and the winner is the earlier of the two in S.walls, as it always was
  assert.equal(viaGrid.wall, first.id);
});

/* Coverage: an agreement test is only worth anything if the passes it is
   supposed to cover actually fire. */
test("the lattice reaches every pass the broad phase now feeds", () => {
  buildPlan();
  const seen = new Set();
  for (let x = -120; x <= 900; x += 11)
    for (let z = -120; z <= 780; z += 13) {
      snapPoint(x, z, [3]);
      if (S.snapInfo) seen.add(S.snapInfo.type);
    }
  ["corner", "marker", "midpoint", "jamb", "itemCorner", "intersection",
   "perpendicular", "wall", "extension"].forEach((kind) => {
    assert.ok(seen.has(kind), kind + " never won anywhere on the lattice");
  });
});

/* The hit path, through the one member of the family that has an exported
   seam. hitNode / hitItem / hitOpening are module-private, but all four go
   through the same nearRecs() the snap passes above exercise exhaustively;
   what this adds is the wall record's own padding and radius under the hit
   test's tolerance rather than the snap tolerance, which are different numbers
   reaching into the same boxes. */
test("the wall probe finds the same wall through the grid as through a scan", () => {
  /* The dense plan at both zooms, for the reason ZOOMS exists: at S.SC = 1 the
     probe's tolCm(8) is far below the smallest cell the index will build, so a
     wrong radius would be invisible. Zoomed out it is not. */
  let found = 0;
  for (const { sc } of ZOOMS) {
  buildDensePlan();
  S.SC = sc;
  render2DNow();
  for (let x = -30; x <= 260; x += 7) {
    for (let z = -30; z <= 260; z += 9) {
      updateWallProbe(x, z);
      const viaGrid = S.wallProbe ? S.wallProbe.wall.id + "@" + S.wallProbe.x.toFixed(6) + "," + S.wallProbe.z.toFixed(6) : null;
      withFullScan(() => updateWallProbe(x, z));
      const viaScan = S.wallProbe ? S.wallProbe.wall.id + "@" + S.wallProbe.x.toFixed(6) + "," + S.wallProbe.z.toFixed(6) : null;
      assert.equal(viaGrid, viaScan, "cursor at " + x + "," + z + " @SC " + sc);
      if (viaGrid) found++;
    }
  }
  }
  S.SC = 1;
  assert.ok(found > 100, "the lattice actually lands on walls (" + found + ")");
});

test("a hidden layer stops contributing candidates for the whole gesture", () => {
  buildPlan();
  // with everything visible a cursor on a corner snaps to that corner
  const onCorner = snapPoint(802, 2, null);
  assert.equal(S.snapInfo && S.snapInfo.type, "corner");
  assert.equal(onCorner.node, 1);

  /* The gap layers.js leaves open on purpose: `corner` maps to no layer, so a
     kind-based filter could never refuse this. beginSnapSession filters by the
     record's SOURCE layer instead, which is the only place that knows the
     corner came from structure. */
  beginSnapSession((id) => id !== "structure");
  const hidden = snapPoint(802, 2, null);
  // no object candidate at all, so the resolver falls through to the grid
  assert.equal(S.snapInfo && S.snapInfo.type, "grid");
  assert.equal(hidden.node, null, "no structure candidate survives the session");

  // furniture is still in the session, so a piece's corner still snaps
  const it = S.items[0];
  const furn = snapPoint(it.x, it.z, null);
  assert.equal(S.snapInfo && S.snapInfo.type, "itemCorner");
  assert.equal(furn.x, it.x);

  endSnapSession();
  const back = snapPoint(802, 2, null);
  assert.equal(S.snapInfo && S.snapInfo.type, "corner");
  assert.equal(back.node, 1);
});

test("closing a session restores the full candidate set even mid-plan", () => {
  buildPlan();
  beginSnapSession((id) => id !== "furniture");
  const it = S.items[0];
  snapPoint(it.x, it.z, null);
  assert.notEqual(S.snapInfo && S.snapInfo.type, "itemCorner");
  endSnapSession();
  snapPoint(it.x, it.z, null);
  assert.equal(S.snapInfo && S.snapInfo.type, "itemCorner");
});
