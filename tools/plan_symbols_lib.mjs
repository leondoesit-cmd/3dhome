// Pure helpers for tools/plan_symbols.mjs: furniture and fixture symbols
// (toilets, baths, beds, hobs, sofas, tables…) out of vector plan sheets.
// Drafters place them as blocks, so one block recurs across hundreds of
// sheets: each cluster of non-wall line work gets a rotation- and
// mirror-invariant shape hash, equal hashes group into one library entry,
// and entries are named from their size and the room they stand in.

// ---------------------------------------------------------------- clusters

const bboxOf = (pts) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
};

/**
 * Group drawing items into clusters of touching/near items. items: [{ box:
 * {x0,y0,x1,y1}, ... }] in cm; gap: cm. Union-find over a spatial hash.
 * Returns arrays of item indices.
 */
export function clusterItems(items, gap = 2, cellCm = 60) {
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const grid = new Map();
  items.forEach((it, i) => {
    const b = it.box;
    for (let gx = Math.floor((b.x0 - gap) / cellCm); gx <= Math.floor((b.x1 + gap) / cellCm); gx++) {
      for (let gy = Math.floor((b.y0 - gap) / cellCm); gy <= Math.floor((b.y1 + gap) / cellCm); gy++) {
        const key = gx + "," + gy;
        const list = grid.get(key);
        if (list) {
          for (const j of list) {
            const c = items[j].box;
            if (b.x0 - gap <= c.x1 && c.x0 - gap <= b.x1 && b.y0 - gap <= c.y1 && c.y0 - gap <= b.y1) parent[find(i)] = find(j);
          }
          list.push(i);
        } else grid.set(key, [i]);
      }
    }
  });
  const groups = new Map();
  items.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return [...groups.values()];
}

/**
 * Drawing items from page primitives, in cm: one per subpath of stroked (and
 * non-wall filled) paths, with its segments. Walls, wall faces and long
 * lines (dimension chains, grid lines) are dropped: any subpath with a
 * segment over `maxSegCm`, or lying on the wall mask.
 */
export function drawingItems(prims, k, { onWall = () => false, maxSegCm = 320, wallFill = null } = {}) {
  const items = [];
  for (const p of prims.paths) {
    if (!p.stroke && !(Array.isArray(p.fill) && Math.min(...p.fill) < 244)) continue;
    if (wallFill && Array.isArray(p.fill) && !p.stroke && wallFill.some((c) => c.every((v, i) => Math.abs(v - p.fill[i]) <= 6))) continue;
    for (const sp of p.subpaths) {
      if (sp.points.length < 2) continue;
      const pts = sp.points.map((q) => ({ x: q.x * k, y: q.y * k }));
      let long = false, onW = 0, n = 0;
      for (let i = 1; i < pts.length; i++) {
        const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (L > maxSegCm) { long = true; break; }
      }
      if (long) continue;
      for (const q of pts) { n++; if (onWall(q.x, q.y)) onW++; }
      if (n && onW / n > 0.6) continue;
      items.push({ box: bboxOf(pts), pts, closed: !!sp.closed, curved: !!sp.curvedSeg?.some(Boolean) });
    }
  }
  return items;
}

export { bboxOf };

/**
 * Is a cluster distinctive enough to be a symbol? A lone box, a lone circle
 * or a few open line ends (wall and dimension leftovers) match too many
 * things to name or learn from; real blocks have several parts or detail,
 * and at least one closed shape or curve.
 */
export function distinctive(parts) {
  const shaped = parts.some((it) => it.closed || it.curved);
  if (!shaped) return false;
  if (parts.length >= 2) return true;
  // one part: only a detailed straight-edged outline (a flattened circle has
  // many segments but is still just a circle)
  const only = parts[0];
  return !only.curved && only.pts.length - 1 + (only.closed ? 1 : 0) >= 12;
}

// ------------------------------------------------------------ shape hashes

const N = 16; // signature grid

/**
 * Rotation/mirror-invariant signature of a cluster's line work: rasterised
 * into an N x N grid over its bounding box (aspect kept as a separate
 * feature), the 8 dihedral variants compared and the smallest string kept.
 * Returns { hash, w, h } with w >= h in cm (the long side first).
 */
export function shapeSignature(items) {
  const box = bboxOf(items.flatMap((it) => it.pts));
  const W = box.x1 - box.x0 || 1, H = box.y1 - box.y0 || 1;
  const grid = new Uint8Array(N * N);
  for (const it of items) {
    const pts = it.pts;
    const segs = it.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const steps = Math.ceil(Math.max(Math.abs(b.x - a.x) / W, Math.abs(b.y - a.y) / H) * N * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const x = a.x + ((b.x - a.x) * s) / steps, y = a.y + ((b.y - a.y) * s) / steps;
        const gx = Math.min(N - 1, Math.floor(((x - box.x0) / W) * N)), gy = Math.min(N - 1, Math.floor(((y - box.y0) / H) * N));
        grid[gy * N + gx] = 1;
      }
    }
  }
  // the 8 symmetries of the square; for non-square boxes only those that
  // keep the long side horizontal are comparable, which canonicalisation
  // below enforces by transposing when the box is taller than wide
  const at = (x, y) => grid[y * N + x];
  const variants = [];
  const transpose = H > W;
  for (const flipX of [false, true]) {
    for (const flipY of [false, true]) {
      let s = "";
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          let u = flipX ? N - 1 - x : x, v = flipY ? N - 1 - y : y;
          s += transpose ? at(v, u) : at(u, v);
        }
      }
      variants.push(s);
    }
  }
  const bits = variants.sort()[0];
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return { hash: hex, w: Math.round(Math.max(W, H)), h: Math.round(Math.min(W, H)) };
}

/** Hamming distance between two hex signatures. */
export function hashDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

// ----------------------------------------------------------------- naming

const ROOM_KIND = [
  [/אמבט|רחצה|מקלחת|שירותים|bath|wc|toilet|shower/i, "bathroom"],
  [/מטבח|kitchen/i, "kitchen"],
  [/שינה|הורים|ממ["״]?ד|bed/i, "bedroom"],
  [/סלון|דיור|מגורים|אוכל|living|dining/i, "living"],
  [/שרות|כביסה|laundry|utility/i, "utility"],
  [/מרפס|גינ|balcon|garden|terrace/i, "outdoor"],
];

export function roomKind(label) {
  for (const [re, kind] of ROOM_KIND) if (re.test(label || "")) return kind;
  return null;
}

/**
 * A name for a library entry from its size (cm, long side first) and the
 * rooms it was found in ({ bathroom: 12, ... }). Null when unsure; the
 * entry is kept unnamed for a person or a model to label.
 */
export function nameSymbol(w, h, rooms = {}) {
  const top = Object.entries(rooms).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  if (top === "bathroom") {
    if (w >= 140 && w <= 190 && h >= 65 && h <= 90) return "bathtub";
    if (near(w, h, 15) && w >= 70 && w <= 120) return "shower";
    if (w >= 50 && w <= 80 && h >= 33 && h <= 50) return "toilet";
    if (w >= 35 && w <= 110 && h >= 30 && h <= 60) return "washbasin";
  }
  if (top === "utility" && near(w, h, 8) && w >= 55 && w <= 65) return "washing machine";
  if (top === "kitchen") {
    if (near(w, h, 10) && w >= 50 && w <= 70) return "hob or sink";
    if (w >= 70 && w <= 100 && h >= 40 && h <= 55) return "sink";
    if (h >= 55 && h <= 75 && w >= 55 && w <= 95) return "fridge";
  }
  if (top === "bedroom") {
    if (w >= 190 && w <= 215 && h >= 140 && h <= 200) return "double bed";
    if (w >= 165 && w <= 210 && h >= 80 && h <= 125) return "single bed";
    if (w >= 100 && w <= 320 && h >= 50 && h <= 70) return "wardrobe";
    if (w >= 90 && w <= 160 && h >= 45 && h <= 80) return "desk";
  }
  if (top === "living") {
    if (w >= 180 && w <= 300 && h >= 75 && h <= 110) return "sofa";
    if (w >= 120 && w <= 280 && h >= 80 && h <= 180) return "dining table";
    if (near(w, h, 15) && w >= 70 && w <= 110) return "armchair";
  }
  return null;
}
