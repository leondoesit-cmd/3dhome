/* Label placement for the working drawing: every label is a box that must
   not overlap another label, a wall, a door swing or a fixture. Greedy, in
   priority order: try the anchor, then rings of candidate positions round
   it; a label that had to move far from its anchor gets a leader line back.
   If nothing is clear it takes the spot with the least overlap.

   Pure geometry in one plane (model units or paper, the caller's choice):
     label     {id, x, y, w, h, priority?, within?: polygon, maxShift?}
               (x, y) the anchor = the box centre wanted; `within` keeps the
               box inside a polygon (a room label inside its room)
     obstacle  {poly:[{x,y}]} or {x0, y0, x1, y1}
   placeLabels() returns [{id, x, y, w, h, moved, leader}] in input order. */

export function boxOf(x, y, w, h) {
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
}

export function boxesOverlap(a, b, gap) {
  const g = gap || 0;
  return a.x0 < b.x1 + g && b.x0 < a.x1 + g && a.y0 < b.y1 + g && b.y0 < a.y1 + g;
}

export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

function segHitsBox(a, b, box) {
  // Liang–Barsky clip of the segment against the box
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const edges = [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

/* Does the box touch the polygon (edge crossing, or one inside the other)? */
export function boxHitsPoly(box, poly) {
  if (!poly || poly.length < 2) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (segHitsBox(a, b, box)) return true;
  }
  return poly.length > 2 && pointInPoly({ x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, poly);
}

function obstacleHits(box, ob) {
  if (ob.poly) {
    if (!ob.bb) {
      const xs = ob.poly.map((p) => p.x), ys = ob.poly.map((p) => p.y);
      ob.bb = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    }
    return boxesOverlap(box, ob.bb) && boxHitsPoly(box, ob.poly);
  }
  return boxesOverlap(box, ob);
}

function boxInside(box, poly) {
  return [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]].every(([x, y]) => pointInPoly({ x, y }, poly)) &&
    !poly.some((p, i) => { const q = poly[(i + 1) % poly.length]; return segHitsBox(p, q, { x0: box.x0 + 1e-6, y0: box.y0 + 1e-6, x1: box.x1 - 1e-6, y1: box.y1 - 1e-6 }); });
}

/* Candidate centres round an anchor: the anchor, then 16 directions on
   growing rings, nearest first. */
export function candidates(x, y, step, rings) {
  const out = [{ x, y }];
  for (let r = 1; r <= rings; r++) {
    const d = step * r;
    for (let k = 0; k < 16; k++) {
      const a = (Math.PI * 2 * k) / 16;
      out.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d });
    }
  }
  return out;
}

function segsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b) && o(a, b, c) !== 0 && o(c, d, a) !== 0;
}

/* The leader from a placed box to its anchor: from the box edge point
   nearest the anchor. */
export function leaderFrom(x, y, w, h, anchor) {
  return { x: Math.max(x - w / 2, Math.min(anchor.x, x + w / 2)), y: Math.max(y - h / 2, Math.min(anchor.y, y + h / 2)) };
}

function segmentBounds(a, b) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

function obstacleBounds(ob) {
  if (!ob.poly) return ob;
  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of ob.poly) {
    bounds.x0 = Math.min(bounds.x0, p.x); bounds.x1 = Math.max(bounds.x1, p.x);
    bounds.y0 = Math.min(bounds.y0, p.y); bounds.y1 = Math.max(bounds.y1, p.y);
  }
  return bounds;
}

// Each occurrence has its own index, including repeated obstacle references.
// Oversized entries and queries fall back to a scan instead of filling a grid.
function placementGrid(size) {
  const all = [], large = [], cells = new Map();
  function visit(box, fn) {
    const x0 = Math.floor(box.x0 / size), y0 = Math.floor(box.y0 / size);
    const x1 = Math.floor(box.x1 / size), y1 = Math.floor(box.y1 / size);
    if (![x0, y0, x1, y1].every(Number.isSafeInteger) || x1 < x0 || y1 < y0 ||
        (x1 - x0 + 1) * (y1 - y0 + 1) > 256) return false;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) fn(x + "," + y);
    return true;
  }
  return {
    add(value, box) {
      const id = all.push(value) - 1;
      if (!visit(box, key => {
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(id);
      })) large.push(id);
    },
    near(box) {
      const ids = new Set(large);
      if (!visit(box, key => { for (const id of cells.get(key) || []) ids.add(id); })) return all;
      return Array.from(ids, id => all[id]);
    }
  };
}

/* Labels may also carry:
     variants   [{w, h}] tried in order (a full label, then smaller ones)
     candidates (variant) => [{x, y, ax?, ay?}] explicit centres to try, each
                with the anchor its leader would run to (an opening tag
                slides along its wall, the leader square to the wall)
     outside    after every variant failed inside `within`, try again
                outside it, further out, with a leader to `anchor`
   opts.segments [{a, b}] lines a leader must not cross (dimension lines).
   The result adds {variant, outside, anchor}. */
export function placeLabels(labels, obstacles, opts) {
  const o = opts || {};
  const gap = o.gap || 0, obs = obstacles || [], segs = o.segments || [];
  const order = labels.map((l, i) => ({ l, i })).sort((a, b) => (b.l.priority || 0) - (a.l.priority || 0) || a.i - b.i);
  const size = Math.max(1, (labels[0]?.h || labels[0]?.variants?.[0]?.h || 10) * 4);
  const placed = placementGrid(size), obstaclesByCell = placementGrid(size), segmentsByCell = placementGrid(size);
  for (const ob of obs) obstaclesByCell.add(ob, obstacleBounds(ob));
  for (const sg of segs) segmentsByCell.add(sg, segmentBounds(sg.a, sg.b));
  const result = new Array(labels.length);
  const segHitsObstacles = (a, b) => obstaclesByCell.near(segmentBounds(a, b)).reduce((n, ob) => {
    if (ob.poly) return n + (ob.poly.some((p, k) => segsCross(a, b, p, ob.poly[(k + 1) % ob.poly.length])) ? 1 : 0);
    return n + (segHitsBox(a, b, ob) ? 1 : 0);
  }, 0);
  const bestAnchor = (c, v, anchors) => {
    let pick = null, score = Infinity;
    anchors.forEach((pt) => {
      const a = leaderFrom(c.x, c.y, v.w, v.h, pt);
      const sc = segHitsObstacles(a, pt) * 1e6 + Math.hypot(pt.x - a.x, pt.y - a.y);
      if (sc < score) { score = sc; pick = pt; }
    });
    return pick;
  };
  const costOf = (box, lead) => {
    let cost = 0;
    const pad = Math.max(0, gap);
    const search = { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad };
    for (const p of placed.near(search)) if (boxesOverlap(box, p, gap)) cost += 10;
    for (const ob of obstaclesByCell.near(box)) if (obstacleHits(box, ob)) cost += 3;
    if (lead) for (const sg of segmentsByCell.near(segmentBounds(lead.a, lead.b))) if (segsCross(lead.a, lead.b, sg.a, sg.b)) cost += 2;
    return cost;
  };
  order.forEach(({ l, i }) => {
    const variants = l.variants && l.variants.length ? l.variants : [{ w: l.w, h: l.h }];
    const anchor = l.anchor || { x: l.x, y: l.y };
    let best = null;
    const tryPass = (vi, within, shiftMul) => {
      const v = variants[vi];
      const step = o.step || Math.max(v.h * 0.6, 1e-3);
      const reach = (l.maxShift != null ? l.maxShift : v.h * 6) * shiftMul;
      const list = l.candidates && shiftMul === 1 ? l.candidates(v) : candidates(l.x, l.y, step, Math.max(1, Math.ceil(reach / step)));
      for (const c of list) {
        const box = boxOf(c.x, c.y, v.w, v.h);
        if (within && !boxInside(box, within)) continue;
        let to = c.ax != null ? { x: c.ax, y: c.ay } : anchor;
        const shift = Math.hypot(c.x - l.x, c.y - l.y);
        const needLeader = c.ax != null ? Math.hypot(leaderFrom(c.x, c.y, v.w, v.h, to).x - to.x, leaderFrom(c.x, c.y, v.w, v.h, to).y - to.y) > v.h * 0.4
          : shift > Math.max(v.w, v.h) * 0.75 || !within && !!l.within;
        // a room's leader ends on the free floor nearest the label, not on a fixture
        if (needLeader && l.anchors) to = bestAnchor(c, v, l.anchors) || to;
        const lead = needLeader ? { a: leaderFrom(c.x, c.y, v.w, v.h, to), b: to } : null;
        const cost = costOf(box, lead);
        if (!best || cost < best.cost) best = { c, v, vi, cost, lead, to, outside: !within && !!l.within, shift };
        if (cost === 0) return true;
      }
      return false;
    };
    let done = false;
    for (let vi = 0; vi < variants.length && !done; vi++) done = tryPass(vi, l.within, 1);
    if (!done && l.outside) done = tryPass(variants.length - 1, null, 3);
    if (!best) best = { c: { x: l.x, y: l.y }, v: variants[0], vi: 0, cost: Infinity, lead: null, to: anchor, outside: false, shift: 0 };
    const { c, v } = best;
    const accepted = boxOf(c.x, c.y, v.w, v.h);
    placed.add(accepted, accepted);
    result[i] = { id: l.id, x: c.x, y: c.y, w: v.w, h: v.h, variant: best.vi, moved: best.shift > 1e-6, leader: !!best.lead, anchor: best.to, clear: best.cost === 0, outside: best.outside };
  });
  return result;
}
