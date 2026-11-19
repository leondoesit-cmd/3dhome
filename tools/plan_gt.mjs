// Ground truth for real plans (bench/plans), drafted from the recognizer and
// corrected by hand. Per plan, a working file gt.edit.json next to the PDF:
//   { "page": 1, "region": [x0, y0, x1, y1], "cmPerUnit": 1.74,
//     "acceptRecognized": true,          // start from what the recognizer keeps
//     "accept": [ids], "reject": [ids], // candidate walls to add / remove
//     "add": [{ "a": [x, y], "b": [x, y], "t": 20 }],   // missing walls, snapped to faces
//     "openings": { "reject": [ids], "retype": { "id": "window" },
//                   "add": [{ "type": "door", "at": [x, y], "width": 80 }] } }
// Coordinates are sheet units (PDF points, y down); widths/thickness in cm.
//
//   node tools/plan_gt.mjs draft <id>   candidates (numbered) + recognizer's picks → bench/out/gt/
//   node tools/plan_gt.mjs build <id>   gt.edit.json → truth.json (healed) + review image
//   node tools/plan_gt.mjs scale <id>   the dimension evidence behind the scale
//   node tools/plan_gt.mjs misses <id>  missed truth walls and the stage that lost them
//
// draft snapshots the numbered candidates into gt.cand.json, and build reads
// that snapshot, so ids stay valid even when the recognizer changes later.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadPdfjs } from "./pdfjs_node.mjs";
import { readPagePrimitives } from "../js/plan_recog/pdf_primitives.js";
import { recognizeVectorPlan, wallCandidates, healWalls, collectSegments } from "../js/plan_recog/vector_plan.js";
import { measureDimensionLabels } from "../js/plan_recog/dimensions.js";
import { createImage, fillPolygon, strokeSegment, fillCircle } from "./plan_draw.mjs";
import { encodePNG } from "./png.mjs";
import { readSources } from "./plan_corpus_run.mjs";

const OUT = "bench/out/gt";

// ------------------------------------------------------------ tiny font
// 3×5 bitmap glyphs, enough for ids like "12", "o7", "D", "W", "P"
const GLYPHS = {
  0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111",
  4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001001001001",
  8: "111101111101111", 9: "111101111001111", o: "000111101101111", D: "110101101101110",
  W: "101101101111101", P: "111101111100100",
};
function drawText(img, str, x, y, px, color) {
  let cx = x;
  for (const ch of String(str)) {
    const g = GLYPHS[ch];
    if (g) {
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          if (g[r * 3 + c] !== "1") continue;
          const x0 = cx + c * px, y0 = y + r * px;
          fillPolygon(img, [{ x: x0, y: y0 }, { x: x0 + px, y: y0 }, { x: x0 + px, y: y0 + px }, { x: x0, y: y0 + px }], color);
        }
      }
    }
    cx += 4 * px;
  }
}

// ---------------------------------------------------------------- loading

function source(id) {
  const src = readSources("bench/plans/sources.tsv").find((s) => s.id === id);
  if (!src) throw new Error(`no source "${id}" in bench/plans/sources.tsv`);
  return { ...src, dir: dirname(src.path) };
}

function readEdit(src) {
  const file = join(src.dir, "gt.edit.json");
  if (!existsSync(file)) throw new Error(`write ${file} first (page, region, cmPerUnit)`);
  return JSON.parse(readFileSync(file, "utf8"));
}

async function loadPage(src, page) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(readFileSync(src.path)), verbosity: 0 });
  const doc = await task.promise;
  const prims = await readPagePrimitives(await doc.getPage(page), pdfjs.OPS);
  await task.destroy();
  return prims;
}

const inRegion = (p, r) => p.x >= r[0] && p.x <= r[2] && p.y >= r[1] && p.y <= r[3];
const mid = (w) => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });

// ---------------------------------------------------------------- render

// The region as 2×2 (or fewer) tiles of the line work, with overlays drawn by
// `paint(img, P, zoom)`.
function renderTiles(prims, region, name, paint, zoom = 2.5) {
  mkdirSync(OUT, { recursive: true });
  const [x0, y0, x1, y1] = region;
  // always 2×2, so a rerun overwrites every tile of the previous one
  const nx = 2, ny = 2;
  const files = [];
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const bx0 = x0 + ((x1 - x0) * tx) / nx - 10, by0 = y0 + ((y1 - y0) * ty) / ny - 10;
      const bx1 = x0 + ((x1 - x0) * (tx + 1)) / nx + 10, by1 = y0 + ((y1 - y0) * (ty + 1)) / ny + 10;
      const img = createImage(Math.round((bx1 - bx0) * zoom), Math.round((by1 - by0) * zoom));
      const P = (p) => ({ x: (p.x - bx0) * zoom, y: (p.y - by0) * zoom });
      for (const path of prims.paths) {
        for (const sp of path.subpaths) {
          if (path.fill && sp.points.length >= 3 && sp.points.some((p) => p.x > bx0 && p.x < bx1 && p.y > by0 && p.y < by1))
            fillPolygon(img, sp.points.map(P), path.fill === "pattern" ? [215, 215, 235] : path.fill.map((c) => 255 - (255 - c) * 0.3));
        }
        if (!path.stroke) continue;
        for (const sp of path.subpaths) {
          const pts = sp.closed ? sp.points.concat([sp.points[0]]) : sp.points;
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            if (Math.max(a.x, b.x) < bx0 || Math.min(a.x, b.x) > bx1 || Math.max(a.y, b.y) < by0 || Math.min(a.y, b.y) > by1) continue;
            strokeSegment(img, P(a), P(b), 1, path.dashed ? [185, 185, 230] : [150, 150, 150]);
          }
        }
      }
      // a coordinate grid every 50 units, labelled, to place additions
      for (let gx = Math.ceil(bx0 / 50) * 50; gx < bx1; gx += 50) {
        strokeSegment(img, P({ x: gx, y: by0 }), P({ x: gx, y: by1 }), 1, [120, 200, 230]);
        drawText(img, gx, (gx - bx0) * zoom + 2, 2, 2, [40, 140, 200]);
      }
      for (let gy = Math.ceil(by0 / 50) * 50; gy < by1; gy += 50) {
        strokeSegment(img, P({ x: bx0, y: gy }), P({ x: bx1, y: gy }), 1, [120, 200, 230]);
        drawText(img, gy, 2, (gy - by0) * zoom + 2, 2, [40, 140, 200]);
      }
      paint(img, P, zoom);
      const file = join(OUT, `${name}-${tx}${ty}.png`);
      writeFileSync(file, encodePNG(img));
      files.push(file);
    }
  }
  return files;
}

// --------------------------------------------------------------- commands

async function draft(id) {
  const src = source(id), edit = readEdit(src);
  const prims = await loadPage(src, edit.page || 1);
  const k = edit.cmPerUnit;
  // candidates from all line work, or — on poché sheets — from the edges of
  // the wall fill alone ("poche<=N": fills at most N luminance), which are the
  // true outer faces even where insulation or finish layers are drawn inside
  // …or, where cut walls are drawn with the heaviest pen (the drafting
  // convention for section cuts), from strokes at least N units wide ("pen>=N")
  // Sources combine: ["poche<=140", "pen>=0.9"] takes the faces of both.
  const sources = [].concat(edit.source || []);
  const candPrims = !sources.length ? prims : {
    ...prims,
    paths: sources.flatMap((source) => {
      const pocheRule = /^poche<=(\d+)$/.exec(source), penRule = /^pen>=([\d.]+)$/.exec(source);
      if (pocheRule) return pocheOutline(prims, Number(pocheRule[1])).paths;
      if (penRule) return prims.paths.filter((p) => p.stroke && !p.dashed && p.lineWidth >= Number(penRule[1])).map((p) => ({ ...p, fill: null }));
      throw new Error(`unknown source ${source}`);
    }),
  };
  const cand = wallCandidates(candPrims, k);
  const plan = recognizeVectorPlan(prims, { cmPerUnit: k });
  const region = edit.region;
  const walls = cand.walls.filter((w) => inRegion(mid(w), region)).map((w, i) => ({ id: i, ...w }));
  // a candidate is "recognized" when a final wall runs along it
  const along = (w, o) => {
    const dx = o.b.x - o.a.x, dy = o.b.y - o.a.y, L = Math.hypot(dx, dy) || 1;
    const m = mid(w);
    const t = ((m.x - o.a.x) * dx + (m.y - o.a.y) * dy) / (L * L);
    const off = Math.abs((m.x - o.a.x) * -dy + (m.y - o.a.y) * dx) / L;
    const par = Math.abs(((w.b.x - w.a.x) * dx + (w.b.y - w.a.y) * dy) / ((Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1) * L));
    return t > -0.02 && t < 1.02 && off < 2 && par > 0.99;
  };
  for (const w of walls) w.recognized = plan.walls.some((o) => along(w, o));
  // what the band between the faces is drawn with: the darkest fill under its
  // middle, and how densely other strokes (hatching) cross it
  const fills = prims.paths.filter((p) => p.fill && p.fill !== "pattern")
    .map((p) => ({ lum: 0.299 * p.fill[0] + 0.587 * p.fill[1] + 0.114 * p.fill[2], rings: p.subpaths.map((s) => s.points), evenOdd: p.evenOdd }));
  const insideRings = (q, f) => {
    let crossings = 0;
    for (const pts of f.rings) {
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i];
        if ((a.y > q.y) !== (b.y > q.y) && q.x < a.x + ((q.y - a.y) * (b.x - a.x)) / (b.y - a.y)) crossings++;
      }
    }
    return crossings % 2 === 1;
  };
  const segs = collectSegments(prims).segments.map((s) => ({ m: mid(s), s }));
  for (const w of walls) {
    const m = mid(w);
    w.fillLum = Math.round(Math.min(255, ...fills.filter((f) => insideRings(m, f)).map((f) => f.lum)));
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    let inside = 0;
    for (const { m: q } of segs) {
      const t = (q.x - w.a.x) * ux + (q.y - w.a.y) * uy, off = Math.abs((q.x - w.a.x) * -uy + (q.y - w.a.y) * ux);
      if (t > 0 && t < L && off < 0.35 * w.thickness) inside++;
    }
    w.hatch = +(inside / (L / 10)).toFixed(2); // crossing strokes per 10 units of wall
  }
  // the starting set: what the recognizer keeps, or a drawing-based rule
  const rule = edit.base || "recognized";
  const rules = Array.isArray(rule) ? rule : [rule];
  for (const w of walls) {
    w.base = rules.some((r) => {
      if (r === "recognized") return w.recognized;
      let m = /^fill<=(\d+)$/.exec(r);
      if (m) return w.fillLum <= Number(m[1]);
      m = /^hatch>=([\d.]+)$/.exec(r);
      if (m) return w.hatch >= Number(m[1]);
      m = /^len>=(\d+)$/.exec(r);
      if (m) return Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * k >= Number(m[1]);
      throw new Error(`unknown base rule ${r}`);
    }) && w.thickness * k >= (edit.minThicknessCm || 5) && w.thickness * k <= (edit.maxThicknessCm || 60);
  }
  const openings = plan.openings.filter((o) => inRegion(o.center, region)).map((o, i) => ({ id: i, type: o.type, center: o.center, width: o.width }));
  writeFileSync(join(src.dir, "gt.cand.json"), JSON.stringify({ cmPerUnit: k, region, walls, openings, lines: cand.lines.filter((l) => inRegion(mid(l), region)) }));
  const files = renderTiles(prims, region, `${id}-draft`, (img, P, zoom) => {
    // base set as translucent green bands; every candidate as a centreline
    // (red: recognizer keeps it, blue: it does not) with its id
    for (const w of walls) {
      if (!w.base) continue;
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, h = w.thickness / 2;
      const nx = (-dy / L) * h, ny = (dx / L) * h;
      fillPolygon(img, [P({ x: w.a.x + nx, y: w.a.y + ny }), P({ x: w.b.x + nx, y: w.b.y + ny }), P({ x: w.b.x - nx, y: w.b.y - ny }), P({ x: w.a.x - nx, y: w.a.y - ny })], [90, 200, 90], 0.45);
    }
    for (const w of walls) {
      strokeSegment(img, P(w.a), P(w.b), 1.5, w.recognized ? [220, 30, 30] : [40, 90, 230]);
      const m = P(mid(w));
      drawText(img, w.id, m.x + 2, m.y + 2, 2, w.recognized ? [170, 0, 0] : [20, 40, 170]);
    }
    for (const o of openings) {
      const c = P(o.center);
      fillCircle(img, c, 5, o.type === "door" ? [30, 60, 230] : o.type === "window" ? [220, 0, 220] : [240, 150, 0]);
      drawText(img, "o" + o.id, c.x + 6, c.y - 12, 2, [0, 120, 0]);
    }
  });
  console.log(`${id}: ${walls.length} candidates (${walls.filter((w) => w.recognized).length} recognized), ${openings.length} openings; scale ${plan.scale.source} → given ${k}`);
  console.log(files.join("\n"));
}

// The outline of the union of all wall fills at most `maxLum` luminance, as
// stroked segments: collinear edges of neighbouring fill shapes (a structure
// layer beside an insulation layer) cancel where they overlap, leaving only
// the faces between wall and air.
function pocheOutline(prims, maxLum) {
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const edges = [];
  for (const p of prims.paths) {
    if (!p.fill || p.fill === "pattern" || lum(p.fill) > maxLum) continue;
    for (const sp of p.subpaths) {
      const pts = sp.points;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 0.05) continue;
        let th = Math.atan2(b.y - a.y, b.x - a.x);
        if (th < 0) th += Math.PI;
        if (th >= Math.PI - 1e-3) th -= Math.PI;
        const ux = Math.cos(th), uy = Math.sin(th);
        const c = ((a.x + b.x) / 2) * -uy + ((a.y + b.y) / 2) * ux;
        const ta = a.x * ux + a.y * uy, tb = b.x * ux + b.y * uy;
        edges.push({ th, ux, uy, c, t0: Math.min(ta, tb), t1: Math.max(ta, tb) });
      }
    }
  }
  // group collinear edges (angle within 0.2°, offset within 0.15 units)
  edges.sort((p, q) => p.th - q.th || p.c - q.c);
  const out = [];
  for (let i = 0; i < edges.length;) {
    let j = i + 1;
    while (j < edges.length && edges[j].th - edges[i].th < 0.0035 && Math.abs(edges[j].c - edges[i].c) < 0.15) j++;
    const group = edges.slice(i, j);
    i = j;
    // keep the stretches covered an odd number of times
    const marks = [];
    for (const e of group) marks.push([e.t0, 1], [e.t1, -1]);
    marks.sort((p, q) => p[0] - q[0]);
    let count = 0, start = null;
    const g = group[0];
    const at = (t) => ({ x: g.ux * t - g.uy * g.c, y: g.uy * t + g.ux * g.c });
    for (const [t, d] of marks) {
      const before = count;
      count += d;
      if (before % 2 === 0 && count % 2 === 1) start = t;
      else if (before % 2 === 1 && count % 2 === 0 && start != null && t - start > 0.05) {
        out.push({ subpaths: [{ points: [at(start), at(t)], curvedSeg: [false, false], closed: false, curved: false }], stroke: [0, 0, 0], fill: null, lineWidth: 0.5, dashed: false });
      }
    }
  }
  // the outline alone: the fills' own edges would bring the shared seams back
  return { ...prims, paths: out };
}

// Snap a hand-placed centreline onto the face pair around it.
function snapAdd(add, lines, k) {
  const a = { x: add.a[0], y: add.a[1] }, b = { x: add.b[0], y: add.b[1] };
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L }, n = { x: -u.y, y: u.x };
  const c0 = a.x * n.x + a.y * n.y, ta = a.x * u.x + a.y * u.y, tb = b.x * u.x + b.y * u.y;
  const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
  // with a thickness given, take the faces nearest ±t/2 (outer faces of a
  // layered wall, not its insulation line); without, the nearest faces
  const half = add.t ? add.t / k / 2 : null;
  const reach = (add.t ? add.t * 0.8 : 65) / k;
  const score = (off) => (half ? Math.abs(Math.abs(off) - half) : Math.abs(off));
  let below = null, above = null;
  for (const l of lines) {
    const lu = { x: l.b.x - l.a.x, y: l.b.y - l.a.y }, ll = Math.hypot(lu.x, lu.y) || 1;
    if (Math.abs((lu.x * u.x + lu.y * u.y) / ll) < 0.999) continue;
    const off = (l.a.x + l.b.x) / 2 * n.x + (l.a.y + l.b.y) / 2 * n.y - c0;
    const l0 = Math.min(l.a.x * u.x + l.a.y * u.y, l.b.x * u.x + l.b.y * u.y), l1 = Math.max(l.a.x * u.x + l.a.y * u.y, l.b.x * u.x + l.b.y * u.y);
    if (Math.min(l1, hi) - Math.max(l0, lo) < 0.3 * (hi - lo)) continue;
    if (half && Math.abs(Math.abs(off) - half) > 0.4 * half) continue;
    if (off < 0 && off > -reach && (below == null || score(off) < score(below))) below = off;
    if (off > 0 && off < reach && (above == null || score(off) < score(above))) above = off;
  }
  let shift = 0, thickness = add.t ? add.t / k : 15 / k, snapped = false;
  if (below != null && above != null && (!add.t || Math.abs((above - below) * k - add.t) < 0.4 * add.t)) {
    shift = (below + above) / 2;
    thickness = above - below;
    snapped = true;
  }
  return {
    a: { x: a.x + n.x * shift, y: a.y + n.y * shift }, b: { x: b.x + n.x * shift, y: b.y + n.y * shift },
    thickness, snapped,
  };
}

function bridgeGaps(walls, maxGap) {
  const ws = walls.map((w) => ({ ...w }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < ws.length && !merged; i++) {
      for (let j = i + 1; j < ws.length && !merged; j++) {
        const p = ws[i], q = ws[j];
        const dx = p.b.x - p.a.x, dy = p.b.y - p.a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
        const qx = q.b.x - q.a.x, qy = q.b.y - q.a.y, qL = Math.hypot(qx, qy) || 1;
        // only real wall pieces, not jamb blocks shorter than they are thick
        if (L < 0.8 * p.thickness || qL < 0.8 * q.thickness) continue;
        if (Math.abs((ux * qx + uy * qy) / qL) < 0.9998) continue;
        const off = (pt) => (pt.x - p.a.x) * -uy + (pt.y - p.a.y) * ux;
        if (Math.abs(off(q.a)) > 2 || Math.abs(off(q.b)) > 2) continue;
        if (Math.max(p.thickness, q.thickness) > 1.25 * Math.min(p.thickness, q.thickness)) continue;
        const t = (pt) => (pt.x - p.a.x) * ux + (pt.y - p.a.y) * uy;
        const p0 = 0, p1 = L, q0 = Math.min(t(q.a), t(q.b)), q1 = Math.max(t(q.a), t(q.b));
        const gap = Math.max(q0 - p1, p0 - q1);
        if (gap > maxGap) continue;
        const lo = Math.min(p0, q0), hi = Math.max(p1, q1);
        ws[i] = {
          a: { x: p.a.x + ux * lo, y: p.a.y + uy * lo }, b: { x: p.a.x + ux * hi, y: p.a.y + uy * hi },
          thickness: (p.thickness * L + q.thickness * qL) / (L + qL),
        };
        ws.splice(j, 1);
        merged = true;
      }
    }
  }
  return ws;
}

async function build(id) {
  const src = source(id), edit = readEdit(src);
  const cand = JSON.parse(readFileSync(join(src.dir, "gt.cand.json"), "utf8"));
  const k = edit.cmPerUnit;
  if (Math.abs(cand.cmPerUnit / k - 1) > 1e-9) throw new Error("gt.cand.json was drafted at another scale: run draft again");
  // accept / reject entries are candidate ids or [x, y] points: a point picks
  // the candidate whose centreline passes nearest it (within 4 units) — points
  // survive a redraft that renumbers the candidates
  const pick = (entry) => {
    if (typeof entry === "number") return entry;
    const p = { x: entry[0], y: entry[1] };
    let best = null, bd = 4;
    for (const w of cand.walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / L2));
      const d = Math.hypot(p.x - w.a.x - dx * t, p.y - w.a.y - dy * t);
      if (d < bd) { bd = d; best = w.id; }
    }
    if (best == null) throw new Error(`no candidate near ${entry}`);
    return best;
  };
  const accept = new Set((edit.accept || []).map(pick)), reject = new Set((edit.reject || []).map(pick));
  let walls = cand.walls.filter((w) => !reject.has(w.id) && (accept.has(w.id) || w.base))
    .map((w) => ({ a: w.a, b: w.b, thickness: w.thickness }));
  const adds = (edit.add || []).map((add) => snapAdd(add, cand.lines, k));
  const unsnapped = adds.filter((w) => !w.snapped).length;
  // the planner's convention: a wall runs on through its doors and windows
  // (the opening sits on the wall), so collinear pieces of one thickness are
  // bridged across gaps up to bridgeCm (250 by default)
  walls = bridgeGaps(walls.concat(adds), (edit.bridgeCm ?? 250) / k);
  walls = healWalls(walls, k);
  const op = edit.openings || {};
  const rejectOps = new Set(op.reject || []);
  const openings = cand.openings.filter((o) => !rejectOps.has(o.id))
    .map((o) => ({ type: (op.retype || {})[o.id] || o.type, center: o.center, width: o.width }))
    .concat((op.add || []).map((o) => ({ type: o.type, center: { x: o.at[0], y: o.at[1] }, width: o.width })));
  const prims = await loadPage(src, edit.page || 1);
  const truth = {
    file: src.path, page: edit.page || 1, region: edit.region, cmPerUnit: k,
    width: prims.width, height: prims.height,
    units: "sheet", // coordinates in PDF points; thickness and widths in cm
    walls: walls.map((w) => ({ a: w.a, b: w.b, thickness: +(w.thickness * k).toFixed(2) })),
    // openings are only scored once someone has checked them by hand
    openingsAnnotated: !!edit.openingsAnnotated,
    openings: edit.openingsAnnotated ? openings : [],
    notes: edit.scaleNote || "",
  };
  writeFileSync(join(src.dir, "truth.json"), JSON.stringify(truth, null, 1));
  const files = renderTiles(prims, edit.region, `${id}-truth`, (img, P) => {
    for (const w of walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, h = w.thickness / 2;
      const nx = (-dy / L) * h, ny = (dx / L) * h;
      fillPolygon(img, [P({ x: w.a.x + nx, y: w.a.y + ny }), P({ x: w.b.x + nx, y: w.b.y + ny }), P({ x: w.b.x - nx, y: w.b.y - ny }), P({ x: w.a.x - nx, y: w.a.y - ny })], [120, 210, 120]);
      strokeSegment(img, P(w.a), P(w.b), 1.5, [0, 110, 0]);
    }
    for (const o of openings) fillCircle(img, P(o.center), 5, o.type === "door" ? [30, 60, 230] : o.type === "window" ? [220, 0, 220] : [240, 150, 0]);
  });
  console.log(`${id}: truth ${walls.length} walls, ${openings.length} openings (${adds.length} added walls, ${unsnapped} not snapped to faces)`);
  console.log(files.join("\n"));
}

// Truth (green bands) against the current recognizer (red centrelines and
// faces) at the true scale — where the misses and the false walls are.
async function compare(id) {
  const src = source(id), edit = readEdit(src);
  const truth = JSON.parse(readFileSync(join(src.dir, "truth.json"), "utf8"));
  const prims = await loadPage(src, truth.page || 1);
  const plan = recognizeVectorPlan(prims, { cmPerUnit: truth.cmPerUnit });
  const k = truth.cmPerUnit;
  const files = renderTiles(prims, truth.region, `${id}-compare`, (img, P) => {
    for (const w of truth.walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, h = w.thickness / k / 2;
      const nx = (-dy / L) * h, ny = (dx / L) * h;
      fillPolygon(img, [P({ x: w.a.x + nx, y: w.a.y + ny }), P({ x: w.b.x + nx, y: w.b.y + ny }), P({ x: w.b.x - nx, y: w.b.y - ny }), P({ x: w.a.x - nx, y: w.a.y - ny })], [110, 210, 110], 0.55);
    }
    for (const w of plan.walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1, h = w.thickness / k / 2;
      const nx = (-dy / L) * h, ny = (dx / L) * h;
      strokeSegment(img, P({ x: w.a.x + nx, y: w.a.y + ny }), P({ x: w.b.x + nx, y: w.b.y + ny }), 1, [230, 40, 40]);
      strokeSegment(img, P({ x: w.a.x - nx, y: w.a.y - ny }), P({ x: w.b.x - nx, y: w.b.y - ny }), 1, [230, 40, 40]);
      strokeSegment(img, P(w.a), P(w.b), 2, [200, 0, 0]);
    }
  });
  console.log(`${id}: truth ${truth.walls.length} walls (green), recognized ${plan.walls.length} (red)`);
  console.log(files.join("\n"));
}

// Each stretch of truth wall the recognizer misses (≥ 30 cm), with the last
// pipeline stage that still had it, so tuning goes after the right stage.
// Stages: "candidate" (any face pair at all), then the second pass's trace.
async function misses(id) {
  const src = source(id);
  const truth = JSON.parse(readFileSync(join(src.dir, "truth.json"), "utf8"));
  const prims = await loadPage(src, truth.page || 1);
  const k = truth.cmPerUnit;
  // as the bench runs it: the recognizer reads its own scale (and with it
  // the dimension annotation); sheet units compare directly
  const plan = recognizeVectorPlan(prims, { debug: true });
  const cand = wallCandidates(prims, k).walls;
  // the trace holds both passes; the second starts at its second "pairs"
  const starts = plan.trace.map((s, i) => (s.stage === "pairs" ? i : -1)).filter((i) => i >= 0);
  const first = plan.trace.slice(0, starts[1] ?? plan.trace.length), second = starts[1] != null ? plan.trace.slice(starts[1]) : [];
  const stages = [["candidate", cand], ...first.map((s) => [`p1:${s.stage}`, s.walls]), ["p1:final", null], ...second.map((s) => [`p2:${s.stage}`, s.walls]), ["final", plan.walls]];
  const tol = 10 / k, step = 5 / k;
  const covers = (walls, p, u) => walls && walls.some((w) => {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9 || Math.abs((dx * u.x + dy * u.y) / L) < 0.97) return false;
    const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.y - w.a.y) * dy) / (L * L)));
    return Math.hypot(p.x - w.a.x - t * dx, p.y - w.a.y - t * dy) <= tol;
  });
  const runs = [];
  for (const w of truth.walls) {
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const u = { x: dx / L, y: dy / L }, n = Math.max(1, Math.round(L / step));
    let run = null;
    for (let i = 0; i <= n; i++) {
      const p = { x: w.a.x + (dx * i) / n, y: w.a.y + (dy * i) / n };
      if (!covers(plan.walls, p, u)) {
        // the deepest stage that still covers this point
        let last = "none";
        for (const [name, walls] of stages.slice(0, -1)) if (walls && covers(walls, p, u)) last = name;
        if (run && run.last === last) { run.b = p; run.n++; continue; }
        if (run) runs.push(run);
        run = { a: p, b: p, n: 1, last, thickness: w.thickness, u };
      } else if (run) { runs.push(run); run = null; }
    }
    if (run) runs.push(run);
  }
  const long = runs.map((r) => ({ ...r, cm: Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) * k })).filter((r) => r.cm >= 30);
  const byStage = new Map();
  for (const r of long) byStage.set(r.last, (byStage.get(r.last) || 0) + r.cm);
  const totalTruth = truth.walls.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) * k, 0);
  console.log(`${id}: truth ${(totalTruth / 100).toFixed(1)} m, missed ${(long.reduce((s, r) => s + r.cm, 0) / 100).toFixed(1)} m in ${long.length} runs ≥ 30 cm`);
  console.log("lost after stage (m):", [...byStage].sort((a, b) => b[1] - a[1]).map(([s, v]) => `${s} ${(v / 100).toFixed(1)}`).join(", "));
  long.sort((a, b) => b.cm - a.cm);
  for (const r of long.slice(0, 40)) console.log(`  ${r.cm.toFixed(0).padStart(5)} cm  t${r.thickness.toFixed(0).padStart(3)}  (${r.a.x.toFixed(0)},${r.a.y.toFixed(0)})→(${r.b.x.toFixed(0)},${r.b.y.toFixed(0)})  lost after ${r.last}`);
  // and the other way round: recognized stretches no truth wall is near
  // (inside the plan region, as the bench counts them)
  const extra = [], [rx0, ry0, rx1, ry1] = truth.region || [-Infinity, -Infinity, Infinity, Infinity];
  for (const w of plan.walls) {
    const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
    if (mx < rx0 || mx > rx1 || my < ry0 || my > ry1) continue;
    const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy);
    if (L < 1e-9) continue;
    const u = { x: dx / L, y: dy / L }, n = Math.max(1, Math.round(L / step));
    let run = null;
    for (let i = 0; i <= n; i++) {
      const p = { x: w.a.x + (dx * i) / n, y: w.a.y + (dy * i) / n };
      if (!covers(truth.walls, p, u)) {
        if (run) run.b = p;
        else run = { a: p, b: p, thickness: w.thickness, styles: w.styles };
      } else if (run) { extra.push(run); run = null; }
    }
    if (run) extra.push(run);
  }
  const falses = extra.map((r) => ({ ...r, cm: Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y) * k })).filter((r) => r.cm >= 30).sort((a, b) => b.cm - a.cm);
  console.log(`false: ${(falses.reduce((s, r) => s + r.cm, 0) / 100).toFixed(1)} m in ${falses.length} runs ≥ 30 cm`);
  for (const r of falses.slice(0, 25)) console.log(`  ${r.cm.toFixed(0).padStart(5)} cm  t${r.thickness.toFixed(0).padStart(3)}  (${r.a.x.toFixed(0)},${r.a.y.toFixed(0)})→(${r.b.x.toFixed(0)},${r.b.y.toFixed(0)})  ${(r.styles || []).join(" ")}`);
  const colour = (s) => (s === "none" ? [230, 0, 230] : s === "candidate" ? [255, 140, 0] : s.startsWith("p1") ? [0, 150, 255] : [230, 30, 30]);
  const files = renderTiles(prims, truth.region, `${id}-misses`, (img, P) => {
    for (const w of plan.walls) strokeSegment(img, P(w.a), P(w.b), 2, [0, 150, 0]);
    for (const r of long) strokeSegment(img, P(r.a), P(r.b), 5, colour(r.last));
    for (const r of falses) strokeSegment(img, P(r.a), P(r.b), 3, [0, 0, 0]);
  });
  console.log("green: recognized; missed by last stage: magenta none, orange candidate only, blue lost in pass 1, red lost in pass 2; black: false");
  console.log(files.join("\n"));
}

async function scale(id) {
  const src = source(id), edit = existsSync(join(src.dir, "gt.edit.json")) ? readEdit(src) : { page: 1 };
  const prims = await loadPage(src, edit.page || 1);
  const { segments } = collectSegments(prims);
  const ev = measureDimensionLabels(prims.texts, segments);
  for (const e of ev) console.log(e.text.padEnd(10), "span", e.spanUnits.toFixed(2), "→", e.candidates.map((c) => `${(c.cm / e.spanUnits).toFixed(4)}(${c.unit})`).join(" "));
  const plan = recognizeVectorPlan(prims);
  console.log("recognizer:", plan.scale.source, plan.cmPerUnit, plan.scale.unit || "");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, id] = process.argv.slice(2);
  const run = { draft, build, scale, compare, misses }[cmd];
  if (!run || !id) {
    console.log("usage: node tools/plan_gt.mjs draft|build|scale|compare|misses <id>");
    process.exit(1);
  }
  await run(id);
}
