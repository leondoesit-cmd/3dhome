// Synthetic floor plans as real vector PDFs, for measuring the vector-PDF
// import path (js/plan_recog/) against exact ground truth. Same plans as the
// raster generator (tools/plan_synth.mjs buildPlan), drawn the way CAD and
// architecture packages export them:
//   poche   — walls as filled polygons (ArchiCAD / Revit style), sometimes
//             with an outline on top
//   outline — walls as cleaned-up pairs of lines, junctions open (AutoCAD)
//   hatch   — exterior walls outlined and hatched with short diagonals,
//             interior block walls filled grey (Israeli developer sheets)
// with door leaves + Bézier swing arcs, glazing lines, furniture, real
// dimension chains (cm or m) and room labels with areas as text.
//
// synthDxf draws the same plans as DXF line work on AIA layers, for the DXF
// import path (js/dxf_import.js).
//
// One PDF point is one pixel of the matching raster sheet, so ground truth
// (planTruth) and the recognizer's frame line up exactly as in the raster
// bench: origin at the page centre, x right, z down, centimetres.
import { pathToFileURL } from "node:url";
import { buildPlan, planTruth, planMeta, wallPieces, wallDir, pick, range } from "./plan_synth.mjs";
import { PdfCanvas, writePdf } from "./pdf_write.mjs";
import { DxfCanvas, writeDxf } from "./dxf_write.mjs";

export const PDF_STYLES = ["poche", "outline", "hatch"];

// ------------------------------------------------------------- clipping

function quadOf(piece) {
  const u = wallDir(piece), h = piece.thickness / 2, n = { x: -u.z * h, z: u.x * h };
  return [
    { x: piece.a.x + n.x, z: piece.a.z + n.z }, { x: piece.b.x + n.x, z: piece.b.z + n.z },
    { x: piece.b.x - n.x, z: piece.b.z - n.z }, { x: piece.a.x - n.x, z: piece.a.z - n.z },
  ];
}

// Parameter interval [t0, t1] of segment p0→p1 strictly inside a convex
// polygon (eps inside every edge), or null. Boundary counts as outside, so
// coincident outlines survive clipping against each other.
function insideInterval(p0, p1, poly, eps = 0.01) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a.x * b.z - b.x * a.z;
  }
  const sign = area > 0 ? 1 : -1;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // inward normal
    const nx = -(b.z - a.z) * sign, nz = (b.x - a.x) * sign, L = Math.hypot(nx, nz) || 1;
    const base = (nx * (p0.x - a.x) + nz * (p0.z - a.z)) / L - eps;
    const slope = (nx * (p1.x - p0.x) + nz * (p1.z - p0.z)) / L;
    if (Math.abs(slope) < 1e-12) {
      if (base < 0) return null;
      continue;
    }
    const t = -base / slope;
    if (slope > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return null;
  }
  return [t0, t1];
}

function clipOutside(p0, p1, polys) {
  const cuts = polys.map((poly) => insideInterval(p0, p1, poly)).filter(Boolean).sort((a, b) => a[0] - b[0]);
  const keep = [];
  let t = 0;
  for (const [c0, c1] of cuts) {
    if (c0 > t) keep.push([t, c0]);
    t = Math.max(t, c1);
  }
  if (t < 1) keep.push([t, 1]);
  const at = (s) => ({ x: p0.x + (p1.x - p0.x) * s, z: p0.z + (p1.z - p0.z) * s });
  const L = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  return keep.filter(([a, b]) => (b - a) * L > 0.5).map(([a, b]) => [at(a), at(b)]);
}

function clipInside(p0, p1, poly) {
  const iv = insideInterval(p0, p1, poly, 0);
  if (!iv) return null;
  const at = (s) => ({ x: p0.x + (p1.x - p0.x) * s, z: p0.z + (p1.z - p0.z) * s });
  return [at(iv[0]), at(iv[1])];
}

// ------------------------------------------------------------- drawing

function formatDim(cm, units) {
  if (units === "m") return (cm / 100).toFixed(2);
  return String(Math.round(cm));
}

function drawWalls(pdf, plan, P, style, rng) {
  pdf.layer("A-WALL");
  const pieces = wallPieces(plan.walls, plan.openings).map((p) => ({ ...p, quad: quadOf(p) }));
  const quads = pieces.map((p) => p.quad);
  const outline = (pen) => {
    pdf.stroke([20, 20, 20]).lineWidth(pen);
    pieces.forEach((piece, i) => {
      const others = quads.filter((_, j) => j !== i);
      for (let k = 0; k < 4; k++) {
        for (const [a, b] of clipOutside(piece.quad[k], piece.quad[(k + 1) % 4], others)) pdf.line(P(a), P(b)).doStroke();
      }
    });
  };
  if (style === "poche") {
    const ext = pick(rng, [[25, 25, 25], [60, 60, 60]]), int = rng() < 0.5 ? ext : [110, 110, 110];
    for (const piece of pieces) pdf.fill(piece.kind === "exterior" ? ext : int).polygon(piece.quad.map(P)).doFill();
    if (rng() < 0.5) outline(0.5);
  } else if (style === "outline") {
    if (rng() < 0.4) for (const piece of pieces) pdf.fill([215, 215, 215]).polygon(piece.quad.map(P)).doFill();
    outline(pick(rng, [0.6, 0.9, 1.2]));
  } else {
    for (const piece of pieces) {
      if (piece.kind === "interior") pdf.fill([160, 160, 160]).polygon(piece.quad.map(P)).doFill();
    }
    // hatch: 45° strokes every `gap` cm across each exterior piece
    const gap = range(rng, 6, 12) * plan.cmPerPx / 1.6;
    const tint = pick(rng, [[40, 70, 170], [180, 50, 50], [30, 30, 30]]);
    pdf.stroke(tint).lineWidth(0.3);
    for (const piece of pieces) {
      if (piece.kind !== "exterior") continue;
      const xs = piece.quad.map((p) => p.x), zs = piece.quad.map((p) => p.z);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      for (let k = x0 - (z1 - z0); k < x1; k += gap) {
        const seg = clipInside({ x: k, z: z0 }, { x: k + (z1 - z0), z: z1 }, piece.quad);
        if (seg) pdf.line(P(seg[0]), P(seg[1])).doStroke();
      }
    }
    outline(0.7);
  }
}

function drawOpenings(pdf, plan, P) {
  for (const o of plan.openings) {
    const w = plan.walls[o.wall];
    const u = wallDir(w), n = { x: -u.z, z: u.x };
    const p = (s, off) => P({ x: w.a.x + u.x * s + n.x * off, z: w.a.z + u.z * s + n.z * off });
    const s0 = o.s - o.width / 2, s1 = o.s + o.width / 2, half = w.thickness / 2;
    if (o.type === "window") {
      pdf.layer("A-GLAZ").stroke([40, 40, 40]).lineWidth(0.4);
      for (const s of [s0, s1]) pdf.line(p(s, -half), p(s, half)).doStroke();
      for (const off of [-half, -half / 3, half / 3, half]) pdf.line(p(s0, off), p(s1, off)).doStroke();
    } else if (o.type === "door") {
      const hingeS = o.hingeAtStart ? s0 : s1, freeS = o.hingeAtStart ? s1 : s0;
      const face = o.swing * half;
      pdf.layer("A-DOOR");
      const hinge = p(hingeS, face), leafEnd = p(hingeS, face + o.swing * o.width), free = p(freeS, face);
      pdf.stroke([30, 30, 30]).lineWidth(0.9).line(hinge, leafEnd).doStroke();
      const a0 = Math.atan2(leafEnd.y - hinge.y, leafEnd.x - hinge.x);
      let a1 = Math.atan2(free.y - hinge.y, free.x - hinge.x);
      while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
      while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
      pdf.lineWidth(0.35).arc(hinge, o.width / plan.cmPerPx, a0, a1).doStroke();
    }
  }
}

function drawFurniture(pdf, plan, P, rng) {
  pdf.layer("A-FURN").stroke([120, 120, 120]).lineWidth(0.35);
  const pad = 45;
  plan.leaves.forEach((leaf, i) => {
    if (plan.outside.has(i) || rng() < 0.3) return;
    const w = leaf.x1 - leaf.x0, d = leaf.z1 - leaf.z0;
    const kind = pick(rng, ["bed", "sofa", "table", "none"]);
    const fit = (fw, fd) => fw + 2 * pad <= w && fd + 2 * pad <= d;
    const box = (fw, fd) => {
      const x = range(rng, leaf.x0 + pad, leaf.x1 - pad - fw), z = range(rng, leaf.z0 + pad, leaf.z1 - pad - fd);
      return [{ x, z }, { x: x + fw, z }, { x: x + fw, z: z + fd }, { x, z: z + fd }];
    };
    if (kind === "bed" && fit(160, 200)) {
      const b = box(160, 200);
      pdf.polygon(b.map(P)).doStroke();
      pdf.polygon([b[0], b[1], { x: b[1].x, z: b[1].z + 40 }, { x: b[0].x, z: b[0].z + 40 }].map(P)).doStroke();
    } else if (kind === "sofa" && fit(220, 90)) {
      const b = box(220, 90);
      pdf.polygon(b.map(P)).doStroke();
      pdf.polygon([b[0], b[1], { x: b[1].x, z: b[1].z + 25 }, { x: b[0].x, z: b[0].z + 25 }].map(P)).doStroke();
    } else if (kind === "table" && fit(120, 120)) {
      const b = box(120, 120);
      const c = P({ x: b[0].x + 60, z: b[0].z + 60 });
      pdf.arc(c, 60 / plan.cmPerPx, 0, Math.PI * 2).close().doStroke();
    }
  });
}

function drawDimensions(pdf, plan, P, rng, units) {
  const { W, D, xs, zs, cmPerPx } = plan;
  const size = range(rng, 6.5, 9);
  const off = 60 + size * cmPerPx * 1.6;
  pdf.layer("A-ANNO-DIMS").stroke([60, 60, 60]).lineWidth(0.35);
  const chain = (fixed, coords, vertical, sign) => {
    const pt = (v, o) => (vertical ? P({ x: fixed + sign * o, z: v }) : P({ x: v, z: fixed + sign * o }));
    pdf.line(pt(coords[0], off), pt(coords[coords.length - 1], off)).doStroke();
    for (const v of coords) {
      const c = pt(v, off), t = 3;
      pdf.line({ x: c.x - t, y: c.y + t }, { x: c.x + t, y: c.y - t }).doStroke();
      pdf.line(pt(v, off - 30), pt(v, off + 12)).doStroke();
    }
    for (let k = 0; k + 1 < coords.length; k++) {
      const span = coords[k + 1] - coords[k];
      const label = formatDim(span, units);
      const tw = label.length * size * 0.556;
      if (span / cmPerPx < tw + 6) continue;
      const m = pt((coords[k] + coords[k + 1]) / 2, off);
      if (vertical) pdf.text(label, m.x - 2, m.y + tw / 2, size, [0, 0, 0], Math.PI / 2);
      else pdf.text(label, m.x - tw / 2, m.y - 2, size);
    }
  };
  chain(0, xs, false, -1);
  chain(D, xs, false, 1);
  chain(0, zs, true, -1);
  chain(W, zs, true, 1);
}

// Thickness of the wall running along a room side (through its midpoint).
function sideThickness(plan, p) {
  for (const w of plan.walls) {
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - w.a.x) * dx + (p.z - w.a.z) * dz) / L2));
    if (Math.hypot(p.x - w.a.x - dx * t, p.z - w.a.z - dz * t) < 1) return w.thickness;
  }
  return 0;
}

// Net floor area (inside the wall faces), as plans label rooms.
function netArea(plan, r) {
  const leaf = plan.leaves[r.index];
  const mx = (leaf.x0 + leaf.x1) / 2, mz = (leaf.z0 + leaf.z1) / 2;
  const w = leaf.x1 - leaf.x0 - (sideThickness(plan, { x: leaf.x0, z: mz }) + sideThickness(plan, { x: leaf.x1, z: mz })) / 2;
  const d = leaf.z1 - leaf.z0 - (sideThickness(plan, { x: mx, z: leaf.z0 }) + sideThickness(plan, { x: mx, z: leaf.z1 })) / 2;
  let area = w * d;
  if (plan.chamfer && r.points.length === 5) area -= (plan.chamfer.size * plan.chamfer.size) / 2;
  return area;
}

function drawLabels(pdf, plan, P, rng) {
  pdf.layer("A-AREA-IDEN");
  const size = range(rng, 7, 10);
  const sqft = rng() < 0.25;
  for (const r of plan.rooms) {
    const leaf = plan.leaves[r.index];
    const c = P({ x: (leaf.x0 + leaf.x1) / 2, z: (leaf.z0 + leaf.z1) / 2 });
    const name = r.name[0].toUpperCase() + r.name.slice(1);
    const net = netArea(plan, r);
    const area = sqft ? Math.round(net / 929.0304) + " sq ft" : (net / 1e4).toFixed(1) + " m\xb2";
    pdf.text(name, c.x - name.length * size * 0.28, c.y - size * 0.3, size);
    pdf.text(area, c.x - area.length * size * 0.24, c.y + size, size * 0.85, [60, 60, 60]);
  }
}

/**
 * Options: style (poche|outline|hatch), units (cm|m), cmPerPx, dimensions,
 * furniture, labels, border, lshape, chamfer. Returns { pdf (Buffer), truth, meta }.
 */
// One synthetic plan drawn onto `makeCanvas(plan)`: the same random draws in
// the same order whatever the canvas, so a seed is one plan as PDF or DXF.
function synthDrawing(seed, options, makeCanvas) {
  const pickStyle = (rng) => pick(rng, PDF_STYLES);
  const plan = buildPlan(seed, { ...options, style: options.style || "pdf" });
  const { rng, opt, cmPerPx, marginPx, width, height } = plan;
  const style = options.style || pickStyle(rng);
  const units = opt("units", pick(rng, ["cm", "m"]));
  const P = (p) => ({ x: p.x / cmPerPx + marginPx, y: p.z / cmPerPx + marginPx });
  const pdf = makeCanvas(plan);
  if (opt("border", rng() < 0.6)) pdf.layer("A-ANNO-TTLB").stroke([0, 0, 0]).lineWidth(0.8).polygon([
    { x: 8, y: 8 }, { x: width - 8, y: 8 }, { x: width - 8, y: height - 8 }, { x: 8, y: height - 8 },
  ]).doStroke();
  const dims = opt("dimensions", rng() < 0.85);
  if (dims) drawDimensions(pdf, plan, P, rng, units);
  if (opt("furniture", rng() < 0.7)) drawFurniture(pdf, plan, P, rng);
  drawWalls(pdf, plan, P, style, rng);
  drawOpenings(pdf, plan, P);
  if (opt("labels", rng() < 0.8)) drawLabels(pdf, plan, P, rng);
  return { canvas: pdf, plan, style, units, dims };
}

export function synthPdf(seed, options = {}) {
  const { canvas, plan, style, units, dims } = synthDrawing(seed, options, (p) => new PdfCanvas(p.width, p.height));
  return {
    pdf: writePdf(canvas),
    truth: planTruth(plan, 0),
    meta: planMeta(plan, { style, units, dimensions: dims, kind: "pdf" }),
  };
}

/**
 * The same plan as an AutoCAD-style DXF on AIA layers (A-WALL, A-DOOR,
 * A-GLAZ, A-FURN, A-ANNO-DIMS, A-AREA-IDEN, A-ANNO-TTLB). Extra options:
 * dxfUnit (mm|cm|m|in|ft, default mm), offset (world position of the sheet
 * origin, drawing units), writeUnits (false leaves $INSUNITS out).
 * Returns { dxf (string), truth, meta, sheetToWorld }.
 */
export function synthDxf(seed, options = {}) {
  const unit = options.dxfUnit || "mm";
  const { canvas, plan, style, units, dims } = synthDrawing(seed, options, (p) =>
    new DxfCanvas(p.width, p.height, { cmPerPt: p.cmPerPx, unit, offset: options.offset || { x: 0, y: 0 }, writeUnits: options.writeUnits !== false }));
  return {
    dxf: writeDxf(canvas),
    truth: planTruth(plan, 0),
    meta: planMeta(plan, { style, units, dimensions: dims, kind: "dxf" }),
    // sheet points → drawing units, to put ground truth in the import's frame
    sheetToWorld: (p) => canvas.W(p),
  };
}

// CLI: node tools/plan_synth_pdf.mjs [count] [outDir]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const count = Number(process.argv[2]) || 6;
  const out = process.argv[3] || "bench/out/synth-pdf";
  mkdirSync(out, { recursive: true });
  for (let seed = 1; seed <= count; seed++) {
    const { pdf, truth, meta } = synthPdf(seed);
    writeFileSync(join(out, `synth_${seed}.pdf`), pdf);
    writeFileSync(join(out, `synth_${seed}.json`), JSON.stringify({ meta, truth }, null, 1));
    console.log(`synth_${seed}.pdf: ${meta.style}/${meta.units} ${meta.width}x${meta.height}pt, ${truth.walls.length} walls, ${truth.openings.length} openings`);
  }
}
