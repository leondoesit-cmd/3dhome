/* Uniform grid over the plan's world coordinates (centimetres, x/z) — the
   broad phase the pointer paths are missing.
 *
 * Everything that runs per pointermove in the planner walks the whole model to
 * find the handful of things near the cursor. `snapPoint()` in interaction.js
 * rebuilds its candidate set from scratch on every move — a full pass over
 * `usedNodes()`, `S.markers`, `S.walls` and `S.openings` — and then throws all
 * but the nearest few away inside its own `offer()` distance filter. The `hit*`
 * family (`hitNode`, `hitOpening`, `hitItem`, `hitWall` in interaction.js,
 * `hitMarker` in markers.js, `hitMEP` in mep.js, `hitSlabOpening` in
 * slab_openings.js) scans the same arrays linearly right behind it. On a plan
 * with a few thousand pieces that is the bulk of a drag's cost.
 *
 * This module is the shared answer: bucket every pickable thing's bounding box
 * into grid cells once, then hand a caller only the records whose cells touch
 * the disc it is asking about. It is deliberately a BROAD phase — a returned
 * record may still be outside the radius, and the caller keeps doing the exact
 * test it does today (a wall's perpendicular distance, an item's rotated-box
 * containment). What it guarantees is the other direction: nothing inside the
 * radius is ever left out, so switching a hit test over to it cannot change
 * which object wins.
 *
 * Nothing here imports from the rest of `js/`. Every hit-testing module will
 * want to import THIS, so a back-edge to `state.js` or `geometry.js` would be a
 * cycle; callers pass their records in instead. That also makes the whole thing
 * testable without booting the app.
 */

// A record is {kind, id, minx, minz, maxx, maxz}. `kind` matches the selection
// kinds used elsewhere in the planner — wall, node, item, opening, marker,
// mepNode, mepRun, slabvoid — and only "wall" is given special meaning here
// (it sizes the grid). The record object itself is handed back untouched by
// query(), so callers can hang whatever else they need off it.

function fin(v) {
  return typeof v === "number" && v - v === 0; // rejects NaN and both infinities
}

/* Cell-size limits, in centimetres.
 *
 * The grid is sized from the median wall length because that is the natural
 * pitch of a floor plan: rooms, and therefore the gaps a cursor moves through,
 * scale with it. The clamps are what keep a pathological model cheap in both
 * directions — a plan whose walls are all 5 cm stubs must not produce a grid so
 * fine that one 30 m wall lands in thousands of cells, and a site-scale plan
 * must not produce cells so coarse that every query returns the whole model. */
const MIN_CELL = 40;
const MAX_CELL = 2000;
const DEFAULT_CELL = 300; // used when nothing in the model has any extent at all

/* Second line of defence, applied after the clamp. `cols * rows` is allocated
   as a flat Int32Array of offsets, and a record that spans the plan is written
   once per cell it crosses, so both totals have to be bounded no matter what
   coordinates arrive. When either cap is exceeded the cell size doubles and the
   layout is recomputed; doubling always terminates, because a big enough cell
   collapses the grid to 1x1. */
const MAX_CELLS = 1 << 16; // 65536 cells => a 256KB offset array, worst case
const MAX_ENTRIES = 1 << 20; // total record-in-cell memberships

function median(values) {
  if (!values.length) return 0;
  values.sort(function (a, b) {
    return a - b;
  });
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/* The pitch of the model, as the median diagonal of its walls' bounding boxes.
   For an axis-aligned wall that diagonal is its length (plus its thickness, a
   few cm on a few hundred); for a diagonal wall it is the exact chord. Median
   rather than mean because one 40 m site boundary among a house's interior
   walls should not coarsen the whole grid.

   Fallbacks, in order: no walls at all (a furniture-only or markers-only index)
   falls back to the median diagonal of every record, so a scatter of items
   still sizes the grid sensibly; nothing with any extent — an index of pure
   points, e.g. only nodes and markers — has no pitch to read and takes
   DEFAULT_CELL. A single wall is not a special case: the median of one value is
   that value, which is exactly the right pitch for a one-wall model. */
function pitchOf(kinds, spans) {
  const walls = [];
  const all = [];
  for (let i = 0; i < kinds.length; i++) {
    const s = spans[i];
    if (!(s > 0)) continue; // zero-extent records (points) carry no pitch
    all.push(s);
    if (kinds[i] === "wall") walls.push(s);
  }
  const m = median(walls.length ? walls : all);
  if (!(m > 0)) return DEFAULT_CELL;
  return m < MIN_CELL ? MIN_CELL : m > MAX_CELL ? MAX_CELL : m;
}

/* One built grid. Kept as plain arrays in CSR form — `start[c]` … `start[c+1]`
   indexes into `entries`, which holds record indices — rather than a Map of
   arrays, because the build is the thing that has to be cheap: it happens again
   on the first query after any model mutation, and an array-per-cell allocates
   thousands of small arrays every time. */
function layout(minx, minz, maxx, maxz, x0, z0, x1, z1, cell) {
  const n = minx.length;
  let cols, rows, start, entries;
  for (;;) {
    cols = Math.max(1, Math.ceil((x1 - x0) / cell) || 1);
    rows = Math.max(1, Math.ceil((z1 - z0) / cell) || 1);
    if (cols * rows > MAX_CELLS) {
      cell *= 2;
      continue;
    }
    // pass 1: how many cells each record covers, accumulated per cell
    start = new Int32Array(cols * rows + 1);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const c0 = cellIdx(minx[i], x0, cell, cols),
        c1 = cellIdx(maxx[i], x0, cell, cols);
      const r0 = cellIdx(minz[i], z0, cell, rows),
        r1 = cellIdx(maxz[i], z0, cell, rows);
      total += (c1 - c0 + 1) * (r1 - r0 + 1);
      if (total > MAX_ENTRIES) break;
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) start[r * cols + c + 1]++;
    }
    if (total > MAX_ENTRIES) {
      cell *= 2;
      continue;
    }
    for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
    // pass 2: fill. `cursor` walks each cell's slice as it is written.
    entries = new Int32Array(total);
    const cursor = start.slice(0, cols * rows);
    for (let i = 0; i < n; i++) {
      const c0 = cellIdx(minx[i], x0, cell, cols),
        c1 = cellIdx(maxx[i], x0, cell, cols);
      const r0 = cellIdx(minz[i], z0, cell, rows),
        r1 = cellIdx(maxz[i], z0, cell, rows);
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) entries[cursor[r * cols + c]++] = i;
    }
    return { cell: cell, cols: cols, rows: rows, start: start, entries: entries };
  }
}

// World coordinate -> cell column/row, clamped into the grid. Coordinates are
// only ever inside the bounds the grid was built from, but floating point on
// the max edge can round one past the last cell, and the clamp is what stops
// that becoming an out-of-range write.
function cellIdx(v, origin, cell, count) {
  let i = Math.floor((v - origin) / cell);
  if (!(i >= 0)) i = 0; // also catches a NaN that survived the accept filter
  else if (i >= count) i = count - 1;
  return i;
}

/* An index over one set of records.
 *
 * `source` is either the records themselves or a function returning them. Pass
 * a function when the record list is expensive to derive and you would rather
 * pay for it on the first query of a gesture than on every mutation — the
 * function is called on build, and again on the first query after
 * invalidate(). Passing an array keeps the reference, so an array mutated in
 * place is also picked up by the rebuild.
 *
 * The index is lazy in both directions: constructing it builds nothing, and
 * invalidate() only sets a flag. A burst of mutations therefore costs one
 * rebuild, on the next query, not one per mutation — which is the whole reason
 * the invalidation hooks can sit on the same paths that already call render2D.
 */
export function createSpatialIndex(source) {
  let src = source == null ? [] : source;
  let stale = true;
  let recs = []; // accepted records, in accepted order
  let grid = null; // {cell, cols, rows, start, entries}
  let x0 = 0,
    z0 = 0; // grid origin, world cm
  let mark = null; // per-record visit stamp, so a record spanning cells is returned once
  let token = 0;
  let dropped = 0;

  function build(next) {
    if (next !== undefined) src = next == null ? [] : next;
    const raw = typeof src === "function" ? src() : src;
    const list = raw && typeof raw.length === "number" ? raw : [];

    /* Accept and normalize. Non-finite coordinates genuinely occur in real
       models — the codebase carries a `fin()` guard in the snap and marker
       paths for exactly this — and a NaN here would poison a cell index and
       silently swallow whatever else landed in that cell. Such records are
       dropped rather than indexed: a record with no position cannot be near
       the cursor, so dropping it cannot lose a hit. Reversed boxes are
       repaired instead of dropped, since min/max ordering is a caller
       bookkeeping slip, not missing information. */
    const n = list.length;
    const minx = new Float64Array(n),
      minz = new Float64Array(n),
      maxx = new Float64Array(n),
      maxz = new Float64Array(n);
    const kinds = new Array(n),
      spans = new Float64Array(n);
    recs = [];
    dropped = 0;
    let bx0 = Infinity,
      bz0 = Infinity,
      bx1 = -Infinity,
      bz1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const r = list[i];
      if (!r || !fin(r.minx) || !fin(r.minz) || !fin(r.maxx) || !fin(r.maxz)) {
        dropped++;
        continue;
      }
      const ax = Math.min(r.minx, r.maxx),
        bx = Math.max(r.minx, r.maxx);
      const az = Math.min(r.minz, r.maxz),
        bz = Math.max(r.minz, r.maxz);
      const k = recs.length;
      recs.push(r);
      minx[k] = ax;
      maxx[k] = bx;
      minz[k] = az;
      maxz[k] = bz;
      kinds[k] = r.kind;
      spans[k] = Math.hypot(bx - ax, bz - az);
      if (ax < bx0) bx0 = ax;
      if (az < bz0) bz0 = az;
      if (bx > bx1) bx1 = bx;
      if (bz > bz1) bz1 = bz;
    }

    if (!recs.length) {
      // An empty model still has to answer queries, so keep a valid 1x1 grid
      // rather than a null one every query would have to test for.
      x0 = 0;
      z0 = 0;
      grid = { cell: DEFAULT_CELL, cols: 1, rows: 1, start: new Int32Array(2), entries: new Int32Array(0) };
      mark = new Int32Array(0);
      stale = false;
      return;
    }

    x0 = bx0;
    z0 = bz0;
    grid = layout(
      minx.subarray(0, recs.length), minz.subarray(0, recs.length),
      maxx.subarray(0, recs.length), maxz.subarray(0, recs.length),
      bx0, bz0, bx1, bz1,
      pitchOf(kinds.slice(0, recs.length), spans.subarray(0, recs.length)),
    );
    mark = new Int32Array(recs.length);
    token = 0;
    stale = false;
  }

  function ensure() {
    if (stale || !grid) build();
  }

  /* Every record whose cells touch the axis-aligned box. The disc query below
     is this with the disc's bounding square, which is why query() can return
     records outside the radius — the corners of that square reach 1.41r. */
  function queryBox(bx0, bz0, bx1, bz1, kinds) {
    ensure();
    const out = [];
    if (!recs.length) return out;
    if (!fin(bx0) || !fin(bz0) || !fin(bx1) || !fin(bz1)) return out;
    const g = grid;
    // Outside the indexed extent entirely: no cell can overlap, so answer
    // without touching the grid. (The clamp inside cellIdx would otherwise
    // pull the range onto the edge cells and return records that cannot match.)
    if (bx1 < x0 || bz1 < z0) return out;
    if (bx0 > x0 + g.cols * g.cell || bz0 > z0 + g.rows * g.cell) return out;
    const c0 = cellIdx(bx0, x0, g.cell, g.cols),
      c1 = cellIdx(bx1, x0, g.cell, g.cols);
    const r0 = cellIdx(bz0, z0, g.cell, g.rows),
      r1 = cellIdx(bz1, z0, g.cell, g.rows);
    // A record spanning several of the cells being read appears in each of
    // them; the stamp is what makes it come back once. `token` grows per query
    // instead of clearing the array, so a query costs only the cells it reads.
    // (the stamp is an Int32Array, so the counter is folded back before it
    // could exceed what a cell of that array can hold)
    if (token >= 2147483646) { mark.fill(0); token = 0; }
    token++;
    const has = kinds ? (typeof kinds.has === "function" ? function (k) { return kinds.has(k); }
      : function (k) { return kinds.indexOf(k) !== -1; }) : null;
    for (let r = r0; r <= r1; r++) {
      const rowBase = r * g.cols;
      for (let c = c0; c <= c1; c++) {
        const ci = rowBase + c;
        for (let e = g.start[ci], end = g.start[ci + 1]; e < end; e++) {
          const i = g.entries[e];
          if (mark[i] === token) continue;
          mark[i] = token;
          if (has && !has(recs[i].kind)) continue;
          out.push(recs[i]);
        }
      }
    }
    return out;
  }

  return {
    /* Build now, optionally against a new source. Callers that already know
       their records have changed can call this instead of invalidate() to move
       the cost off the pointer path. */
    build: build,
    /* Candidates within `r` of (x, z) — a superset of the exact answer. Pass
       `kinds` (a Set or an array of kind strings) to keep a furniture drag from
       even seeing MEP records, which is cheaper than filtering afterwards
       because the filtered records never reach the output array. */
    query: function (x, z, r, kinds) {
      if (!fin(x) || !fin(z)) return [];
      const rad = fin(r) && r > 0 ? r : 0;
      return queryBox(x - rad, z - rad, x + rad, z + rad, kinds);
    },
    queryBox: queryBox,
    /* Mark stale. The next query rebuilds; until then this costs one store, so
       it is safe to call from every mutation path. */
    invalidate: function () {
      stale = true;
    },
    isStale: function () {
      return stale;
    },
    /* Shape of the built grid — for tests and for the perf harness. Building if
       necessary, so it reports what a query would actually use. */
    stats: function () {
      ensure();
      return {
        records: recs.length,
        dropped: dropped,
        cell: grid.cell,
        cols: grid.cols,
        rows: grid.rows,
        entries: grid.entries.length,
        originX: x0,
        originZ: z0,
      };
    },
  };
}

/* The planner's own index. One shared instance so a hit test and the snap
   resolver in the same pointermove reuse one build; the wiring that fills it
   and invalidates it lives with the callers, not here. */
export const planIndex = createSpatialIndex([]);
