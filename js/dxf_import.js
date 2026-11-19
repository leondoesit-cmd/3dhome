/* DXF import: an architect's AutoCAD / ArchiCAD / Revit export → the
   planner's walls, doors and windows, with the rest of the drawing kept as a
   vector underlay to trace and snap to.

   Pure (no DOM, no three): text in, plain data out, so Node tests run it.

     decodeDxfBytes  file bytes → text, honouring $DWGCODEPAGE (a Hebrew
                     drawing saved before AutoCAD 2007 is windows-1255)
     parseDxf        ASCII DXF → header, layer and linetype tables, blocks,
                     model-space entities
     flattenDxf      every visible entity, blocks inserted with their
                     transforms (nested, arrayed, mirrored), curves
                     tessellated with the curved spans marked → strokes, fills
                     and texts in drawing units, y up
     dxfUnits        drawing units in centimetres: $INSUNITS, else a guess
                     from the drawing's size
     layerSummary    what each layer holds, and whether it looks like walls,
                     doors or windows (the layers recognition reads)
     dxfToPrims      chosen layers → the primitives js/plan_recog/vector_plan.js
                     reads from a PDF page, at a known scale
     recognizeDxf    → the planner's own wall graph (vectorPlanToPlanner)
     dxfUnderlay     → a vector reference for js/blueprint_trace.js, in the
                     same frame as the walls
     dxfImportMode   whether adding or replacing this floor is allowed
     createDxfSession worker-owned drawing → bounded summary and import plan

   A DXF already knows its scale and its layers, which is what makes it the
   best input the recognizer gets: no scale to read off dimension labels, and
   furniture, dimensions and hatching can be left out by layer instead of by
   guessing. */

import { recognizeVectorPlan, vectorPlanToPlanner } from "./plan_recog/vector_plan.js";
import { parseLength } from "./plan_recog/dimensions.js";
import { parseArea } from "./plan_recog/room_scale.js";

const DEG = Math.PI / 180;
// curves are cut into chords of at most this angle
const ARC_STEP = 5 * DEG;
// Recognition runs in "sheet units" of this many centimetres: about a PDF
// point on a 1:70 sheet, the range js/plan_recog/vector_plan.js was tuned on
// (its merge and chaining tolerances are written in sheet units).
export const SHEET_CM = 2.5;
const MAX_DEPTH = 16;
const MAX_POINTS = 3000000;
const MAX_VISITS = 3000000;

export const DXF_UNITS = { mm: 0.1, cm: 1, dm: 10, m: 100, in: 2.54, ft: 30.48, yd: 91.44 };
// $INSUNITS codes the planner can use; the rest (miles, microns, light years…)
// fall back to a guess
const INSUNITS = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m", 10: "yd", 14: "dm" };

export function dxfError(code, detail) {
  const err = new Error(detail ? code + ": " + detail : code);
  err.code = code;
  return err;
}

// ------------------------------------------------------------ bytes → text

const CODEPAGES = {
  ANSI_874: "windows-874", ANSI_932: "shift_jis", ANSI_936: "gbk", ANSI_949: "euc-kr", ANSI_950: "big5",
  ANSI_1250: "windows-1250", ANSI_1251: "windows-1251", ANSI_1252: "windows-1252", ANSI_1253: "windows-1253",
  ANSI_1254: "windows-1254", ANSI_1255: "windows-1255", ANSI_1256: "windows-1256", ANSI_1257: "windows-1257",
  ANSI_1258: "windows-1258",
};

/* A DXF written by AutoCAD 2007 (AC1021) or later is UTF-8; older ones are
   in the code page named by $DWGCODEPAGE. Both header variables sit in the
   first few kilobytes, which are ASCII whatever the encoding. */
export function decodeDxfBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = new TextDecoder("latin1").decode(u8.subarray(0, Math.min(u8.length, 65536)));
  if (/^AC10\d\d/.test(head)) throw dxfError("DXF_IS_DWG");
  if (head.startsWith("AutoCAD Binary DXF")) throw dxfError("DXF_BINARY");
  const ver = /\$ACADVER\s*\r?\n\s*1\s*\r?\n\s*(AC\d+)/.exec(head);
  const page = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(head);
  const modern = ver && Number(ver[1].slice(2)) >= 1021;
  let label = "utf-8";
  if (!modern && page && CODEPAGES[page[1].toUpperCase()]) label = CODEPAGES[page[1].toUpperCase()];
  try {
    return new TextDecoder(label, { fatal: label === "utf-8" }).decode(u8);
  } catch (_) {
    // not valid UTF-8 after all: an old file without a code page
    return new TextDecoder("windows-1252").decode(u8);
  }
}

// ------------------------------------------------------------- text → DXF

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function first(e, code, fallback) {
  for (const [c, v] of e.g) if (c === code) return v;
  return fallback;
}

/**
 * ASCII DXF → { header, layers, ltypes, blocks, entities }.
 * Each entity is { type, g: [[code, value], …] } with its VERTEX / ATTRIB
 * followers attached (`vertices`, `attribs`). Values stay strings.
 */
export function parseDxf(text) {
  if (typeof text !== "string" || !text.trim()) throw dxfError("DXF_EMPTY");
  if (/^AC10\d\d/.test(text)) throw dxfError("DXF_IS_DWG");
  if (text.startsWith("AutoCAD Binary DXF")) throw dxfError("DXF_BINARY");
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const codes = [], values = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i].trim();
    if (raw === "" && i + 2 >= lines.length) break;
    const code = Number(raw);
    if (!Number.isInteger(code)) throw dxfError("DXF_MALFORMED", "line " + (i + 1));
    codes.push(code);
    // text values may start with spaces that matter; everything else is padded freely
    values.push(code === 1 || code === 3 ? lines[i + 1].replace(/\s+$/, "") : lines[i + 1].trim());
  }
  const doc = { header: {}, layers: {}, ltypes: {}, blocks: {}, entities: [] };
  let p = 0;
  const at0 = (v) => codes[p] === 0 && values[p] === v;
  // one entity (or table record): from its 0-code to the next 0-code
  const readRecord = () => {
    const rec = { type: values[p], g: [] };
    p++;
    while (p < codes.length && codes[p] !== 0) {
      rec.g.push([codes[p], values[p]]);
      p++;
    }
    return rec;
  };
  const readEntities = (stop) => {
    const list = [];
    while (p < codes.length && !(codes[p] === 0 && stop.includes(values[p]))) {
      if (codes[p] !== 0) { p++; continue; }
      const e = readRecord();
      if (e.type === "POLYLINE" || (e.type === "INSERT" && first(e, 66) === "1")) {
        const key = e.type === "POLYLINE" ? "vertices" : "attribs";
        e[key] = [];
        while (p < codes.length && codes[p] === 0 && values[p] !== "SEQEND" && (values[p] === "VERTEX" || values[p] === "ATTRIB"))
          e[key].push(readRecord());
        if (at0("SEQEND")) readRecord();
      }
      list.push(e);
    }
    return list;
  };
  let sawSection = false;
  while (p < codes.length) {
    if (at0("EOF")) break;
    if (!at0("SECTION")) { p++; continue; }
    sawSection = true;
    p++;
    const name = codes[p] === 2 ? values[p++] : "";
    if (name === "HEADER") {
      let variable = null;
      while (p < codes.length && !at0("ENDSEC")) {
        if (codes[p] === 9) { variable = values[p]; doc.header[variable] = {}; }
        else if (variable && !(codes[p] in doc.header[variable])) doc.header[variable][codes[p]] = values[p];
        p++;
      }
    } else if (name === "TABLES") {
      while (p < codes.length && !at0("ENDSEC")) {
        if (at0("LAYER")) {
          const r = readRecord();
          const name = first(r, 2, "");
          if (!name) continue;
          const color = parseInt(first(r, 62, "7"), 10) || 7;
          const flags = parseInt(first(r, 70, "0"), 10) || 0;
          const tc = first(r, 420);
          doc.layers[name] = {
            name, color: Math.abs(color), off: color < 0, frozen: !!(flags & 1),
            rgb: tc != null ? rgbFromInt(parseInt(tc, 10)) : aciRgb(Math.abs(color)),
            ltype: first(r, 6, "CONTINUOUS"), lw: parseInt(first(r, 370, "-3"), 10),
            plot: first(r, 290, "1") !== "0",
          };
        } else if (at0("LTYPE")) {
          const r = readRecord();
          const name = first(r, 2, "");
          if (name) doc.ltypes[name.toUpperCase()] = { dashes: parseInt(first(r, 73, "0"), 10) || 0 };
        } else p++;
      }
    } else if (name === "BLOCKS") {
      while (p < codes.length && !at0("ENDSEC")) {
        if (!at0("BLOCK")) { p++; continue; }
        const b = readRecord();
        const entities = readEntities(["ENDBLK", "ENDSEC"]);
        if (at0("ENDBLK")) readRecord();
        const bname = first(b, 2, "");
        if (bname) doc.blocks[bname] = { name: bname, base: { x: num(first(b, 10)), y: num(first(b, 20)) }, flags: parseInt(first(b, 70, "0"), 10) || 0, entities };
      }
    } else if (name === "ENTITIES") {
      doc.entities = readEntities(["ENDSEC"]);
    }
    while (p < codes.length && !at0("ENDSEC") && !at0("EOF")) p++;
    if (at0("ENDSEC")) p++;
  }
  if (!sawSection) throw dxfError("DXF_MALFORMED", "no sections");
  return doc;
}

// ------------------------------------------------------------------ colour

export function rgbFromInt(v) {
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/* AutoCAD Color Index → RGB. 1–9 are the named colours (7 is "black on
   paper"); 10–249 run round the hue circle in 24 steps of 10, alternating
   full and half saturation at five brightness levels; 250–255 are greys. */
export function aciRgb(i) {
  const named = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 7: [0, 0, 0], 8: [128, 128, 128], 9: [192, 192, 192] };
  if (named[i]) return named[i].slice();
  if (i >= 250 && i <= 255) { const g = [51, 91, 132, 173, 214, 255][i - 250]; return [g, g, g]; }
  if (i >= 10 && i <= 249) {
    const hue = Math.floor((i - 10) / 10) * 15, sub = (i - 10) % 10;
    const value = [1, 0.65, 0.5, 0.3, 0.15][Math.floor(sub / 2)], sat = sub % 2 ? 0.5 : 1;
    const c = value * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = value - c;
    const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
    return [r, g, b].map((v) => Math.round((v + m) * 255));
  }
  return [0, 0, 0];
}

// ---------------------------------------------------------------- geometry

const IDENTITY = [1, 0, 0, 1, 0, 0];
// m1 applied first, then m2 (both [a b c d e f]: x' = a x + c y + e)
function compose(m2, m1) {
  return [
    m2[0] * m1[0] + m2[2] * m1[1], m2[1] * m1[0] + m2[3] * m1[1],
    m2[0] * m1[2] + m2[2] * m1[3], m2[1] * m1[2] + m2[3] * m1[3],
    m2[0] * m1[4] + m2[2] * m1[5] + m2[4], m2[1] * m1[4] + m2[3] * m1[5] + m2[5],
  ];
}
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const translate = (x, y) => [1, 0, 0, 1, x, y];
const rotate = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const scale = (sx, sy) => [sx, 0, 0, sy, 0, 0];

/* Object coordinate system → world, for the 2D entities that are stored in
   their own plane (ARC, CIRCLE, LWPOLYLINE, TEXT, INSERT, HATCH, SOLID).
   Only flat drawings matter here: an extrusion of (0,0,-1) — what a mirror
   in AutoCAD writes — turns x around; anything tilted is not a plan. */
function ocsMatrix(e) {
  const nx = num(first(e, 210), 0), ny = num(first(e, 220), 0), nz = num(first(e, 230), 1);
  if (Math.abs(nx) > 1 / 64 || Math.abs(ny) > 1 / 64) return null;
  return nz < 0 ? [-1, 0, 0, 1, 0, 0] : IDENTITY;
}

function arcPoints(cx, cy, r, a0, sweep) {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / ARC_STEP));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

// One turn at most, including a full turn when the endpoints coincide.
function angleSweep(start, end, ccw = true) {
  const turn = 2 * Math.PI;
  const d = (end % turn - start % turn) % turn;
  return ccw ? (d > 0 ? d : d + turn) : (d < 0 ? d : d - turn);
}

// the arc a polyline bulge describes from p0 to p1 (bulge = tan(sweep/4),
// positive counter-clockwise), without its first point
function bulgePoints(p0, p1, bulge) {
  const sweep = 4 * Math.atan(bulge);
  const dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy);
  if (!(d > 0) || Math.abs(sweep) < 1e-9) return [p1];
  const off = d / 2 / Math.tan(sweep / 2);
  const cx = (p0.x + p1.x) / 2 - (dy / d) * off, cy = (p0.y + p1.y) / 2 + (dx / d) * off;
  const r = Math.hypot(p0.x - cx, p0.y - cy);
  const pts = arcPoints(cx, cy, r, Math.atan2(p0.y - cy, p0.x - cx), sweep).slice(1);
  pts[pts.length - 1] = { x: p1.x, y: p1.y };
  return pts;
}

/* Polyline vertices ({x, y, b}) → one run of points, each remembering
   whether the span arriving at it is curved. */
function polyRun(verts, closed) {
  const points = [{ x: verts[0].x, y: verts[0].y }], curved = [false];
  const count = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    if (a.b) {
      for (const q of bulgePoints(a, b, a.b)) { points.push(q); curved.push(true); }
    } else { points.push({ x: b.x, y: b.y }); curved.push(false); }
  }
  return { points, curved };
}

// a polyline drawn with width is a filled band; its chords become quads
function bandRings(verts, closed, constWidth) {
  const rings = [];
  const count = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const w0 = (a.sw != null ? a.sw : constWidth) || 0, w1 = (a.ew != null ? a.ew : constWidth) || 0;
    if (!(w0 > 0 || w1 > 0)) continue;
    const pts = [{ x: a.x, y: a.y }].concat(a.b ? bulgePoints(a, b, a.b) : [{ x: b.x, y: b.y }]);
    for (let j = 1; j < pts.length; j++) {
      const p = pts[j - 1], q = pts[j], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy);
      if (!(L > 0)) continue;
      const t0 = (j - 1) / (pts.length - 1), t1 = j / (pts.length - 1);
      const h0 = (w0 + (w1 - w0) * t0) / 2, h1 = (w0 + (w1 - w0) * t1) / 2;
      const nx = -dy / L, ny = dx / L;
      rings.push([
        { x: p.x + nx * h0, y: p.y + ny * h0 }, { x: q.x + nx * h1, y: q.y + ny * h1 },
        { x: q.x - nx * h1, y: q.y - ny * h1 }, { x: p.x - nx * h0, y: p.y - ny * h0 },
      ]);
    }
  }
  return rings;
}

// non-rational or rational B-spline by de Boor, sampled evenly in its knot span
function splinePoints(degree, knots, ctrl, weights, samples) {
  const p = degree, n = ctrl.length - 1;
  if (p < 1 || n < p || knots.length !== n + p + 2) return null;
  const lo = knots[p], hi = knots[n + 1];
  if (!(hi > lo)) return null;
  const out = [];
  for (let s = 0; s <= samples; s++) {
    const u = s === samples ? hi - 1e-12 * (hi - lo) : lo + ((hi - lo) * s) / samples;
    let k = p;
    while (k < n && knots[k + 1] <= u) k++;
    const d = [];
    for (let j = 0; j <= p; j++) {
      const c = ctrl[j + k - p], w = weights ? weights[j + k - p] || 1 : 1;
      d.push({ x: c.x * w, y: c.y * w, w });
    }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = j + k - p, den = knots[i + p - r + 1] - knots[i];
        const a = den > 0 ? (u - knots[i]) / den : 0;
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y, w: (1 - a) * d[j - 1].w + a * d[j].w };
      }
    }
    out.push({ x: d[p].x / d[p].w, y: d[p].y / d[p].w });
  }
  return out;
}

// --------------------------------------------------------------------- text

const SPECIAL = { c: "Ø", d: "°", p: "±", "%": "%" };

export function cleanDxfText(str, mtext) {
  let s = String(str || "");
  s = s.replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/%%([cdp%])/gi, (_, k) => SPECIAL[k.toLowerCase()]).replace(/%%[uok]/gi, "").replace(/%%(\d{3})/g, (_, d) => String.fromCharCode(+d));
  if (mtext) {
    s = s.replace(/\\P/g, "\n").replace(/\\~/g, " ")
      .replace(/\\S([^;]*);/g, (_, f) => f.replace(/[#^]/, "/"))
      .replace(/\\[ACcFfHQTWp][^;]*;/g, "").replace(/\\[LlOoKkNX]/g, "")
      .replace(/\\\\/g, "\u0000").replace(/[{}]/g, "").replace(/\u0000/g, "\\");
  }
  return s.replace(/[ \t]+/g, " ").trim();
}

// --------------------------------------------------------------- flattening

/**
 * Parsed DXF → { strokes, fills, texts, bounds, warnings }, everything in
 * world drawing units with y up. A stroke is { layer, points, curved, closed,
 * rgb, lw (mm), dashed }; a fill { layer, rings, rgb, solid }; a text
 * { layer, str, x, y, angle, size, align }.
 * Model space only; layers that are off or frozen are left out.
 */
export function flattenDxf(doc, { maxPoints = MAX_POINTS, maxVisits = MAX_VISITS } = {}) {
  const out = { strokes: [], fills: [], texts: [], warnings: {} };
  let budget = maxPoints, visits = maxVisits;
  const warn = (k) => { out.warnings[k] = (out.warnings[k] || 0) + 1; };
  const exhausted = () => {
    if (budget > 0 && visits > 0) return false;
    out.warnings["too-large"] = 1;
    return true;
  };
  const takeVisit = () => {
    if (exhausted()) return false;
    visits--;
    return true;
  };
  const takePoints = (n) => {
    if (exhausted()) return false;
    if (n > budget) { budget = 0; exhausted(); return false; }
    budget -= n;
    return true;
  };
  const layerOf = (name) => doc.layers[name] || null;
  const effLayer = (e, ctx) => {
    const own = first(e, 8, "0");
    return own === "0" && ctx ? ctx.layer : own;
  };
  const colourOf = (e, layer, ctx) => {
    const tc = first(e, 420);
    if (tc != null) return rgbFromInt(parseInt(tc, 10));
    const c = parseInt(first(e, 62, "256"), 10);
    if (c === 0) return ctx ? ctx.rgb : [0, 0, 0];
    if (c === 256 || !Number.isFinite(c)) return layerOf(layer)?.rgb || [0, 0, 0];
    return aciRgb(Math.abs(c));
  };
  const weightOf = (e, layer, ctx) => {
    const w = parseInt(first(e, 370, "-1"), 10);
    if (w >= 0) return w / 100;
    if (w === -2) return ctx ? ctx.lw : 0.25;
    const lw = layerOf(layer)?.lw;
    return w === -1 && lw >= 0 ? lw / 100 : 0.25;
  };
  const dashedOf = (e, layer, ctx) => {
    let lt = first(e, 6, "BYLAYER");
    if (/^bylayer$/i.test(lt)) lt = layerOf(layer)?.ltype || "CONTINUOUS";
    else if (/^byblock$/i.test(lt)) return ctx ? ctx.dashed : false;
    if (!lt || /^continuous$/i.test(lt)) return false;
    const def = doc.ltypes[lt.toUpperCase()];
    return def ? def.dashes > 0 : true;
  };
  const hidden = (layer) => {
    const L = layerOf(layer);
    return !!(L && (L.off || L.frozen));
  };

  const stroke = (base, M, points, curved, closed) => {
    if (points.length < 2) return;
    if (!takePoints(points.length)) return;
    out.strokes.push({ ...base, points: points.map((q) => apply(M, q)), curved, closed: !!closed });
  };
  const fill = (base, M, rings, solid) => {
    const r = rings.filter((ring) => ring.length >= 3);
    if (!r.length) return;
    if (!takePoints(r.reduce((s, ring) => s + ring.length, 0))) return;
    out.fills.push({ layer: base.layer, rgb: base.rgb, solid, rings: r.map((ring) => ring.map((q) => apply(M, q))) });
  };

  const visit = (entities, M, ctx, depth) => {
    for (const e of entities) {
      if (!takeVisit()) return;
      if (first(e, 67) === "1" || first(e, 60) === "1") continue; // paper space, invisible
      const layer = effLayer(e, ctx);
      if (hidden(layer)) continue;
      const base = { layer, rgb: colourOf(e, layer, ctx), lw: weightOf(e, layer, ctx), dashed: dashedOf(e, layer, ctx) };
      try {
        handle(e, base, M, ctx, depth);
      } catch (_) {
        warn("bad-" + e.type.toLowerCase());
      }
    }
  };

  const handle = (e, base, M, ctx, depth) => {
    const ocs = () => {
      const o = ocsMatrix(e);
      if (!o) { warn("tilted"); return null; }
      return compose(M, o);
    };
    switch (e.type) {
      case "LINE": {
        stroke(base, M, [{ x: num(first(e, 10)), y: num(first(e, 20)) }, { x: num(first(e, 11)), y: num(first(e, 21)) }], [false, false], false);
        break;
      }
      case "LWPOLYLINE": {
        const W = ocs(); if (!W) break;
        const verts = [];
        let constWidth = num(first(e, 43), 0);
        for (const [c, v] of e.g) {
          if (c === 10) verts.push({ x: num(v), y: 0, b: 0 });
          else if (!verts.length) continue;
          else if (c === 20) verts[verts.length - 1].y = num(v);
          else if (c === 42) verts[verts.length - 1].b = num(v);
          else if (c === 40) verts[verts.length - 1].sw = num(v);
          else if (c === 41) verts[verts.length - 1].ew = num(v);
        }
        polyline(base, W, verts, (parseInt(first(e, 70, "0"), 10) & 1) === 1, constWidth);
        break;
      }
      case "POLYLINE": {
        const flags = parseInt(first(e, 70, "0"), 10) || 0;
        if (flags & (16 | 64)) { warn("mesh"); break; } // 3D meshes and polyface meshes
        const W = flags & 8 ? M : ocs(); if (!W) break; // a 3D polyline is in world coordinates
        const sw = num(first(e, 40), 0), ew = num(first(e, 41), 0);
        const verts = (e.vertices || []).filter((v) => !(parseInt(first(v, 70, "0"), 10) & 16)).map((v) => ({
          x: num(first(v, 10)), y: num(first(v, 20)), b: num(first(v, 42), 0),
          sw: first(v, 40) != null ? num(first(v, 40)) : sw, ew: first(v, 41) != null ? num(first(v, 41)) : ew,
        }));
        polyline(base, W, verts, (flags & 1) === 1, 0);
        break;
      }
      case "CIRCLE": {
        const W = ocs(); if (!W) break;
        const pts = arcPoints(num(first(e, 10)), num(first(e, 20)), num(first(e, 40)), 0, 2 * Math.PI);
        stroke(base, W, pts, pts.map((_, i) => i > 0), true);
        break;
      }
      case "ARC": {
        const W = ocs(); if (!W) break;
        const a0 = num(first(e, 50)) * DEG;
        const a1 = num(first(e, 51)) * DEG;
        const pts = arcPoints(num(first(e, 10)), num(first(e, 20)), num(first(e, 40)), a0, angleSweep(a0, a1));
        stroke(base, W, pts, pts.map((_, i) => i > 0), false);
        break;
      }
      case "ELLIPSE": {
        const nz = num(first(e, 230), 1);
        const cx = num(first(e, 10)), cy = num(first(e, 20)), mx = num(first(e, 11)), my = num(first(e, 21)), ratio = num(first(e, 40), 1);
        const vx = nz < 0 ? my * ratio : -my * ratio, vy = nz < 0 ? -mx * ratio : mx * ratio;
        const t0 = num(first(e, 41), 0), t1 = num(first(e, 42), 2 * Math.PI);
        const sweep = angleSweep(t0, t1);
        const n = Math.max(4, Math.ceil(sweep / ARC_STEP));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = t0 + (sweep * i) / n;
          pts.push({ x: cx + Math.cos(t) * mx + Math.sin(t) * vx, y: cy + Math.cos(t) * my + Math.sin(t) * vy });
        }
        stroke(base, M, pts, pts.map((_, i) => i > 0), sweep >= 2 * Math.PI - 1e-9);
        break;
      }
      case "SPLINE": {
        const degree = parseInt(first(e, 71, "3"), 10) || 3;
        const knots = [], ctrl = [], weights = [], fit = [];
        for (const [c, v] of e.g) {
          if (c === 40) knots.push(num(v));
          else if (c === 41) weights.push(num(v, 1));
          else if (c === 10) ctrl.push({ x: num(v), y: 0 });
          else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1].y = num(v);
          else if (c === 11) fit.push({ x: num(v), y: 0 });
          else if (c === 21 && fit.length) fit[fit.length - 1].y = num(v);
        }
        let pts = ctrl.length > degree ? splinePoints(degree, knots, ctrl, weights.length === ctrl.length ? weights : null, Math.min(400, ctrl.length * 8)) : null;
        if (!pts && fit.length >= 2) pts = fit;
        if (!pts) { warn("bad-spline"); break; }
        stroke(base, M, pts, pts.map((_, i) => i > 0 && degree > 1), (parseInt(first(e, 70, "0"), 10) & 1) === 1);
        break;
      }
      case "SOLID":
      case "TRACE": {
        const W = ocs(); if (!W) break;
        const c = [[10, 20], [11, 21], [13, 23], [12, 22]].map(([a, b]) => ({ x: num(first(e, a)), y: num(first(e, b)) }));
        fill(base, W, [c], true);
        break;
      }
      case "HATCH": {
        const W = ocs(); if (!W) break;
        const solid = first(e, 70) === "1";
        const rings = hatchRings(e);
        fill(base, W, rings, solid);
        break;
      }
      case "TEXT":
      case "ATTDEF":
      case "MTEXT": {
        if (e.type === "ATTDEF") break; // attribute definitions are templates, not text
        text(e, base, M);
        break;
      }
      case "INSERT":
      case "DIMENSION": {
        if (depth >= MAX_DEPTH) { warn("deep-blocks"); break; }
        const block = doc.blocks[first(e, 2, "")];
        if (!block) { if (e.type === "INSERT") warn("missing-block"); break; }
        if (block.flags & 4) { warn("xref"); break; }
        const inner = { layer: base.layer, rgb: base.rgb, lw: base.lw, dashed: base.dashed };
        if (e.type === "DIMENSION") {
          // a dimension's block is already drawn where it sits
          if (takeVisit()) visit(block.entities, M, inner, depth + 1);
          break;
        }
        const W = ocs(); if (!W) break;
        const ins = { x: num(first(e, 10)), y: num(first(e, 20)) };
        const sx = num(first(e, 41), 1) || 1, sy = num(first(e, 42), 1) || 1;
        const rot = num(first(e, 50), 0) * DEG;
        const cols = Math.max(1, parseInt(first(e, 70, "1"), 10) || 1), rows = Math.max(1, parseInt(first(e, 71, "1"), 10) || 1);
        const cs = num(first(e, 44), 0), rs = num(first(e, 45), 0);
        // one runaway array is left out on its own rather than spending the
        // whole visit budget and cutting off the rest of the drawing
        if (cols * rows > 10000) { warn("huge-array"); break; }
        instances: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (!takeVisit()) break instances;
          let T = compose(scale(sx, sy), translate(-block.base.x, -block.base.y));
          T = compose(translate(c * cs, r * rs), T);
          T = compose(rotate(rot), T);
          T = compose(translate(ins.x, ins.y), T);
          visit(block.entities, compose(W, T), inner, depth + 1);
        }
        for (const a of e.attribs || []) {
          if (!takeVisit()) break;
          if (first(a, 60) === "1" || (parseInt(first(a, 70, "0"), 10) & 1)) continue; // invisible attribute
          const layer = effLayer(a, inner);
          if (!hidden(layer)) text(a, { ...base, layer }, M);
        }
        break;
      }
      default:
        break;
    }
  };

  const polyline = (base, W, verts, closed, constWidth) => {
    if (verts.length < 2) return;
    const wide = constWidth > 0 || verts.some((v) => v.sw > 0 || v.ew > 0);
    if (wide) { fill(base, W, bandRings(verts, closed, constWidth), true); return; }
    const run = polyRun(verts, closed);
    stroke(base, W, run.points, run.curved, closed);
  };

  const text = (e, base, M) => {
    const mtext = e.type === "MTEXT";
    let str = "";
    if (mtext) {
      for (const [c, v] of e.g) if (c === 3) str += v;
      str += first(e, 1, "");
    } else str = first(e, 1, "");
    str = cleanDxfText(str, mtext);
    if (!str) return;
    const W = mtext ? M : (() => { const o = ocsMatrix(e); return o ? compose(M, o) : null; })();
    if (!W) return;
    let at = { x: num(first(e, 10)), y: num(first(e, 20)) }, angle = 0, align = "left", baseline = "alphabetic", width;
    if (mtext) {
      const dx = first(e, 11), dy = first(e, 21);
      angle = dx != null ? Math.atan2(num(dy), num(dx)) : num(first(e, 50), 0);
      const att = parseInt(first(e, 71, "1"), 10) || 1;
      align = ["left", "center", "right"][(att - 1) % 3];
      baseline = ["top", "middle", "bottom"][Math.floor((att - 1) / 3)] || "top";
      str = str.split("\n")[0];
    } else {
      angle = num(first(e, 50), 0) * DEG;
      const h = parseInt(first(e, 72, "0"), 10) || 0, v = parseInt(first(e, e.type === "ATTRIB" ? 74 : 73, "0"), 10) || 0;
      if ((h === 3 || h === 5) && first(e, 11) != null) {
        const dx = num(first(e, 11)) - at.x, dy = num(first(e, 21)) - at.y;
        if (dx || dy) {
          angle = Math.atan2(dy, dx);
          width = Math.hypot(W[0] * dx + W[2] * dy, W[1] * dx + W[3] * dy);
        }
      } else if (h !== 3 && h !== 5 && (h || v) && first(e, 11) != null) at = { x: num(first(e, 11)), y: num(first(e, 21)) };
      align = h === 1 || h === 4 ? "center" : h === 2 ? "right" : "left";
      baseline = h === 4 || v === 2 ? "middle" : v === 3 ? "top" : v === 1 ? "bottom" : "alphabetic";
    }
    const size = num(first(e, 40), 0);
    if (!(size > 0)) return;
    if (!takePoints(4)) return;
    const p = apply(W, at);
    const dir = { x: W[0] * Math.cos(angle) + W[2] * Math.sin(angle), y: W[1] * Math.cos(angle) + W[3] * Math.sin(angle) };
    const up = Math.hypot(W[2], W[3]) || 1;
    out.texts.push({ layer: base.layer, rgb: base.rgb, str: str.slice(0, 200), x: p.x, y: p.y, angle: Math.atan2(dir.y, dir.x), size: size * up, align, baseline, ...(width != null ? { width } : {}) });
  };

  visit(doc.entities, IDENTITY, null, 0);
  exhausted();
  out.bounds = boundsOfFlat(out, null);
  return out;
}

/* HATCH boundary paths → closed rings (drawing units, the hatch's OCS). The
   group codes 10/20 mean different things in every part of a HATCH, so this
   reads it in order with a cursor rather than by code. */
function hatchRings(e) {
  const g = e.g;
  let i = g.findIndex(([c]) => c === 91);
  if (i < 0) return [];
  const count = parseInt(g[i][1], 10) || 0;
  i++;
  const peek = () => (i < g.length ? g[i][0] : -1);
  const take = (code, fallback) => {
    if (peek() === code) return g[i++][1];
    return fallback;
  };
  const xy = (cx, cy) => {
    const x = num(take(cx, "0")), y = num(take(cy, "0"));
    return { x, y };
  };
  const rings = [];
  for (let k = 0; k < count && i < g.length; k++) {
    while (i < g.length && peek() !== 92) i++;
    const flags = parseInt(take(92, "0"), 10) || 0;
    const pts = [];
    if (flags & 2) {
      const bulged = take(72, "0") !== "0";
      take(73);
      const n = parseInt(take(93, "0"), 10) || 0;
      const verts = [];
      for (let v = 0; v < n && peek() === 10; v++) {
        const p = xy(10, 20);
        p.b = bulged ? num(take(42, "0")) : 0;
        verts.push(p);
      }
      if (verts.length >= 2) pts.push(...polyRun(verts, true).points);
    } else {
      const n = parseInt(take(93, "0"), 10) || 0;
      for (let ed = 0; ed < n && peek() === 72; ed++) {
        const type = parseInt(take(72, "0"), 10);
        if (type === 1) {
          const a = xy(10, 20), b = xy(11, 21);
          if (!pts.length) pts.push(a);
          pts.push(b);
        } else if (type === 2) {
          const c = xy(10, 20), r = num(take(40, "0"));
          let a0 = num(take(50, "0")) * DEG, a1 = num(take(51, "0")) * DEG;
          const ccw = take(73, "1") !== "0";
          if (!ccw) { a0 = -a0; a1 = -a1; }
          const sweep = angleSweep(a0, a1, ccw);
          const arc = arcPoints(c.x, c.y, r, a0, sweep);
          pts.push(...(pts.length ? arc.slice(1) : arc));
        } else if (type === 3) {
          const c = xy(10, 20), m = xy(11, 21), ratio = num(take(40, "1"));
          let t0 = num(take(50, "0")) * DEG, t1 = num(take(51, "360")) * DEG;
          const ccw = take(73, "1") !== "0";
          if (!ccw) { t0 = -t0; t1 = -t1; }
          const sweep = angleSweep(t0, t1, ccw);
          const nSteps = Math.max(4, Math.ceil(Math.abs(sweep) / ARC_STEP));
          for (let s = pts.length ? 1 : 0; s <= nSteps; s++) {
            const t = t0 + (sweep * s) / nSteps;
            pts.push({ x: c.x + Math.cos(t) * m.x - Math.sin(t) * m.y * ratio, y: c.y + Math.cos(t) * m.y + Math.sin(t) * m.x * ratio });
          }
        } else if (type === 4) {
          const degree = parseInt(take(94, "3"), 10) || 3;
          const rational = take(73, "0") !== "0";
          take(74);
          const nk = parseInt(take(95, "0"), 10) || 0, nc = parseInt(take(96, "0"), 10) || 0;
          const knots = [], ctrl = [], weights = [];
          for (let q = 0; q < nk && peek() === 40; q++) knots.push(num(take(40, "0")));
          for (let q = 0; q < nc && peek() === 10; q++) {
            ctrl.push(xy(10, 20));
            if (rational) weights.push(num(take(42, "1")));
          }
          const nf = parseInt(take(97, "0"), 10) || 0;
          const fitPts = [];
          for (let q = 0; q < nf && peek() === 11; q++) fitPts.push(xy(11, 21));
          if (peek() === 12) { xy(12, 22); xy(13, 23); }
          const sp = splinePoints(degree, knots, ctrl, rational ? weights : null, Math.min(400, Math.max(8, ctrl.length * 6))) || (fitPts.length >= 2 ? fitPts : ctrl);
          pts.push(...(pts.length ? sp.slice(1) : sp));
        } else break;
      }
    }
    // source boundary objects
    const sources = parseInt(take(97, "0"), 10) || 0;
    for (let q = 0; q < sources && peek() === 330; q++) i++;
    if (pts.length >= 3) rings.push(pts);
  }
  return rings;
}

function boundsOfFlat(flat, layers) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (p) => {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  };
  const use = (l) => !layers || layers.has(l);
  for (const s of flat.strokes) if (use(s.layer)) for (const p of s.points) add(p);
  for (const f of flat.fills) if (use(f.layer)) for (const r of f.rings) for (const p of r) add(p);
  return x1 >= x0 ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 } : null;
}

/* The drawing's extent with stray far-away pieces left out: the 1st–99th
   percentile of stroke midpoints on each axis. */
export function coreBounds(flat, layers) {
  const xs = [], ys = [];
  for (const s of flat.strokes) {
    if (layers && !layers.has(s.layer)) continue;
    const a = s.points[0], b = s.points[s.points.length - 1];
    xs.push((a.x + b.x) / 2); ys.push((a.y + b.y) / 2);
  }
  if (xs.length < 2) return boundsOfFlat(flat, layers);
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(f * (arr.length - 1))))];
  const x0 = q(xs, 0.01), x1 = q(xs, 0.99), y0 = q(ys, 0.01), y1 = q(ys, 0.99);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

// ------------------------------------------------------------------- units

/**
 * Centimetres per drawing unit: { cmPerUnit, unit, source: "header"|"guess" }.
 * Without $INSUNITS the drawing's size decides — a home is 3–100 m across —
 * among the metric units, or the imperial ones when $MEASUREMENT says so.
 */
export function dxfUnits(doc, flat, layers) {
  const code = parseInt(doc.header.$INSUNITS?.[70], 10);
  if (INSUNITS[code]) return { cmPerUnit: DXF_UNITS[INSUNITS[code]], unit: INSUNITS[code], source: "header" };
  const b = coreBounds(flat, layers);
  const extent = b ? Math.max(b.w, b.h) : 0;
  const imperial = doc.header.$MEASUREMENT?.[70] === "0";
  const choices = imperial ? ["in", "ft"] : ["mm", "cm", "m"];
  if (!(extent > 0)) return { cmPerUnit: DXF_UNITS[choices[0]], unit: choices[0], source: "guess" };
  let best = choices[0], bestScore = Infinity;
  for (const u of choices) {
    const score = Math.abs(Math.log(extent * DXF_UNITS[u] / 1500));
    if (score < bestScore) { bestScore = score; best = u; }
  }
  return { cmPerUnit: DXF_UNITS[best], unit: best, source: "guess" };
}

// ------------------------------------------------------------------ layers

const KIND_PATTERNS = [
  ["annotation", /defpoints|dim|anno|text|txt|note|label|tag|title|frame|border|viewport|vport|grid|axis|axes|cota|bema|maß|mass|מידה|מידות|כיתוב|טקסט|מקרא|רשת|צירים|north|symbol|leader|keynote|revision|cloud|sheet/i],
  ["furniture", /furn|furniture|möbel|mobel|mobil|mueble|equip|appliance|casework|sanit|plumb|fixture|ריהוט|רהיט|כלים|קבועות|ריצוף|tile|floor|pattern|hatch|patt|elec|light|lamp|power|תאורה|חשמל|אינסטל|hvac|mech|kitchen|מטבח|landscape|plant|tree|car|people|human|גינון/i],
  ["doors", /door|tür|tuer|türen|porte|puerta|porta|deur|דלת|דלתות/i],
  ["windows", /window|wndw|glaz|glass|fenster|fen[eê]tre|ventana|finestra|raam|vitr|curtain|חלון|חלונות|זיגוג|ויטרינה/i],
  ["walls", /wall|wand|wände|mur|muro|parete|muur|קיר|קירות|מחיצ|בטון|בלוק|גבס|concrete|beton|block|bloc|masonry|brick|stud|gyps|gips|drywall|partition|column|pillar|עמוד|structur|struct|s-col|a-col/i],
];

export function layerKind(name) {
  const n = String(name || "");
  if (/^defpoints$/i.test(n)) return "annotation";
  // ISO 13567 / AIA names: A-WALL, A-DOOR, A-GLAZ, A-FURN, A-ANNO-DIMS…
  const aia = /^[A-Z]-([A-Z]{4})/i.exec(n);
  if (aia) {
    const major = aia[1].toUpperCase();
    if (/^(WALL|COLS|STRS)$/.test(major)) return "walls";
    if (major === "DOOR") return "doors";
    if (/^(GLAZ|WIND)$/.test(major)) return "windows";
    if (/^(ANNO|DIMS|GRID|AREA|DETL|SYMB)$/.test(major)) return "annotation";
    if (/^(FURN|EQPM|FLOR|CLNG|ROOF|PLMB|ELEC|LITE|MECH)$/.test(major)) return "furniture";
  }
  for (const [kind, re] of KIND_PATTERNS) if (re.test(n)) return kind;
  return "other";
}

/**
 * Per layer: { name, kind, strokes, fills, texts, length, rgb, use } in
 * drawing order of the layer table. `use` is the default pick for
 * recognition: walls, doors and windows by name; when no layer is named like
 * a wall, every layer that is not annotation or furniture.
 */
export function layerSummary(doc, flat) {
  const map = new Map();
  const row = (name) => {
    if (!map.has(name)) map.set(name, { name, kind: layerKind(name), strokes: 0, fills: 0, texts: 0, length: 0, rgb: doc.layers[name]?.rgb || [0, 0, 0], use: false });
    return map.get(name);
  };
  Object.keys(doc.layers).forEach(row);
  for (const s of flat.strokes) {
    const r = row(s.layer);
    r.strokes++;
    for (let i = 1; i < s.points.length; i++) r.length += Math.hypot(s.points[i].x - s.points[i - 1].x, s.points[i].y - s.points[i - 1].y);
  }
  for (const f of flat.fills) row(f.layer).fills++;
  for (const t of flat.texts) row(t.layer).texts++;
  const rows = [...map.values()].filter((r) => r.strokes || r.fills || r.texts);
  const named = rows.some((r) => r.kind === "walls" && (r.strokes || r.fills));
  for (const r of rows) {
    const drawn = r.strokes + r.fills > 0;
    r.use = drawn && (named ? ["walls", "doors", "windows"].includes(r.kind) : !["annotation", "furniture"].includes(r.kind));
  }
  if (!rows.some((r) => r.use)) rows.forEach((r) => { r.use = r.strokes + r.fills > 0; });
  return rows;
}

// --------------------------------------------------------------- → recognizer

function ink(rgb) {
  // CAD draws on black: white and near-white lines are the main pen there
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum >= 235 ? [0, 0, 0] : rgb;
}

// a DXF lineweight (paper millimetres) as the recognizer's pen: keeps the
// order of 0.13–0.7 mm pens, and never as wide as STROKE_WALL_MIN_PEN (1.5),
// so a heavy pen is a strong face, never a wall on its own
const pen = (mm) => Math.min(1.45, Math.max(0.1, mm * 2));

/**
 * Flattened DXF → the recognizer's page primitives in sheet units of
 * SHEET_CM centimetres, y down, re-centred on `shift` (drawing units) so a
 * plan drawn in survey coordinates keeps its precision.
 */
export function dxfToPrims(flat, { layers = null, cmPerUnit, shift = { x: 0, y: 0 } } = {}) {
  const k = cmPerUnit / SHEET_CM;
  const P = (p) => ({ x: (p.x - shift.x) * k, y: -(p.y - shift.y) * k });
  const use = (l) => !layers || layers.has(l);
  const paths = [];
  for (const s of flat.strokes) {
    if (!use(s.layer)) continue;
    paths.push({
      subpaths: [{ points: s.points.map(P), curvedSeg: s.curved, closed: s.closed, curved: s.curved.some(Boolean) }],
      stroke: ink(s.rgb), fill: null, evenOdd: false, lineWidth: pen(s.lw), dashed: s.dashed,
    });
  }
  for (const f of flat.fills) {
    if (!use(f.layer)) continue;
    paths.push({
      subpaths: f.rings.map((r) => ({ points: r.map(P), curvedSeg: r.map(() => false), closed: true, curved: false })),
      stroke: null, fill: f.solid ? ink(f.rgb) : [190, 190, 190], evenOdd: true, lineWidth: 0, dashed: false,
    });
  }
  const texts = flat.texts.filter((t) => use(t.layer)).map((t) => {
    const p = P(t), size = t.size * k;
    return { str: t.str, x: p.x, y: p.y, angle: -t.angle, size, width: t.str.length * size * 0.6 };
  });
  return { width: 0, height: 0, paths, texts, images: 0 };
}

/**
 * Recognize walls, doors and windows on the chosen layers.
 * Returns { graph, frame, plan }: `graph` is the planner's wall graph
 * ({ nodes, walls, openings, nextId }, centimetres, centred on the walls) and
 * `frame` maps drawing coordinates into it — toPlan(frame, p).
 */
export function recognizeDxf(flat, { layers = null, cmPerUnit, firstId = 1, height = 270, phase = "existing" } = {}) {
  const b = coreBounds(flat, layers) || { cx: 0, cy: 0 };
  const shift = { x: b.cx, y: b.cy };
  const prims = dxfToPrims(flat, { layers, cmPerUnit, shift });
  /* Every pen may be a wall face. A PDF's heaviest pen marks the cut walls,
     but a DXF's lineweights are mostly BYLAYER defaults, and where they are
     set the title-block frame is often the heaviest line in the file — which
     made every real wall face "too light" and found no walls at all. Layers
     are what separates walls from the rest here. */
  const plan = recognizeVectorPlan(prims, { cmPerUnit: SHEET_CM, allFaces: true });
  const graph = vectorPlanToPlanner(plan, { firstId, height, phase });
  const frame = { cmPerUnit, shiftX: shift.x, shiftY: shift.y, ox: graph.origin.x * SHEET_CM, oz: graph.origin.y * SHEET_CM };
  return { graph, frame, plan };
}

export function toPlan(frame, p) {
  return { x: (p.x - frame.shiftX) * frame.cmPerUnit - frame.ox, z: -(p.y - frame.shiftY) * frame.cmPerUnit - frame.oz };
}

// ---------------------------------------------------------------- underlay

// Douglas–Peucker on one run, plan centimetres
function simplify(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = points[s], b = points[e], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
    let best = -1, bd = tol;
    for (let i = s + 1; i < e; i++) {
      const p = points[i];
      const d = L > 0 ? Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / L : Math.hypot(p.x - a.x, p.z - a.z);
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * The drawing as a vector reference for js/blueprint_trace.js, in the plan
 * frame of `frame`: { ref, dropped }. Segments are stored relative to the
 * reference's top-left corner at one centimetre per unit (cmPerPx 1), so the
 * reference transform blueprint_trace.js already applies places them. The
 * longest `maxSegments` lines are kept when a drawing is larger than a
 * project can carry; endpoints shared by several lines go first as snap
 * points.
 */
export function dxfUnderlay(flat, frame, { layers = null, name = "DXF", maxSegments = 25000, maxTexts = 1500, maxGuides = 5000, tolerance = 0.3 } = {}) {
  const use = (l) => !layers || layers.has(l);
  const lines = [];
  const pushRun = (pts, dashed) => {
    const run = simplify(pts.map((p) => toPlan(frame, p)), tolerance);
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1], b = run[i], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L >= 0.1) lines.push({ a, b, L, dashed });
    }
  };
  for (const s of flat.strokes) {
    if (!use(s.layer)) continue;
    pushRun(s.closed ? s.points.concat([s.points[0]]) : s.points, s.dashed);
  }
  for (const f of flat.fills) {
    if (!use(f.layer) || !f.solid) continue;
    for (const ring of f.rings) pushRun(ring.concat([ring[0]]), false);
  }
  let dropped = 0;
  if (lines.length > maxSegments) {
    lines.sort((p, q) => q.L - p.L);
    dropped = lines.length - maxSegments;
    lines.length = maxSegments;
  }
  const texts = flat.texts.filter((t) => use(t.layer)).slice(0, maxTexts).map((t) => {
    const p = toPlan(frame, t);
    return { x: p.x, z: p.z, size: t.size * frame.cmPerUnit, angle: -t.angle, str: t.str, align: t.align, baseline: t.baseline, width: t.width == null ? null : t.width * frame.cmPerUnit };
  });
  if (!lines.length && !texts.length) return { ref: null, dropped };
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const add = (p) => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z; };
  for (const l of lines) { add(l.a); add(l.b); }
  for (const t of texts) add(t);
  const width = Math.max(1, x1 - x0), height = Math.max(1, z1 - z0);
  const segs = [], dsegs = [];
  for (const l of lines) (l.dashed ? dsegs : segs).push(r1(l.a.x - x0), r1(l.a.z - z0), r1(l.b.x - x0), r1(l.b.z - z0));
  // snap points: line ends, the ones where most lines meet first
  const ends = new Map();
  for (const l of lines) for (const p of [l.a, l.b]) {
    const key = Math.round(p.x) + "," + Math.round(p.z);
    const hit = ends.get(key);
    if (hit) { hit.n++; hit.L = Math.max(hit.L, l.L); } else ends.set(key, { x: r1(p.x), z: r1(p.z), n: 1, L: l.L });
  }
  const guidePoints = [...ends.values()].sort((p, q) => q.n - p.n || q.L - p.L).slice(0, maxGuides).map((p) => ({ x: p.x, z: p.z }));
  const ref = {
    version: 1, name, sourceType: "dxf", scaleSource: "dxf",
    vector: { segs, dsegs, texts: texts.map((t) => {
      const row = [r1(t.x - x0), r1(t.z - z0), r1(t.size), Math.round(t.angle * 1000) / 1000, t.str, t.align, t.baseline];
      if (t.width != null) row.push(r1(t.width));
      return row;
    }) },
    width: r1(width), height: r1(height), cmPerPx: 1, rotation: 0,
    originX: r1((x0 + x1) / 2), originZ: r1((z0 + z1) / 2), opacity: 0.6, visible: true, guidePoints,
  };
  return { ref, dropped };
}

// ----------------------------------------------------------- import session

export function dxfImportMode(state, { replace = true, walls = 0 } = {}) {
  const occupied = [state.walls, state.items, state.markers, state.annotations, state.slabOpenings].some((a) => a?.length > 0);
  replace = !!(replace && occupied && walls > 0);
  let reason = null;
  if (walls > 0 && (state.structLocked || state.layers?.structure?.locked)) reason = "locked";
  else if (replace && ((state.walls || []).some((w) => w.locked) || (state.items || []).some((i) => i.locked)
    || state.wallCons?.length || state.roomCons?.length || state.slabOpenings?.length || state.markers?.length
    || state.mep?.nodes?.length || state.mep?.runs?.length)) reason = "protected";
  return { ok: !reason, replace, reason, occupied };
}

/* The dialog needs only bounded line work. Store it relative to the core
   bounds so Float32 keeps precision even in survey coordinates. */
function previewGeometry(flat, bounds, maxSegments) {
  const eachRun = (fn) => {
    for (const s of flat.strokes) fn(s.layer, s.points, s.closed);
    for (const f of flat.fills) if (f.solid) for (const ring of f.rings) fn(f.layer, ring, true);
  };
  let total = 0;
  eachRun((layer, points, closed) => { total += Math.max(0, points.length - 1) + (closed ? 1 : 0); });
  const stride = Math.max(1, Math.ceil(total / Math.max(1, maxSegments)));
  const rows = new Map();
  let index = 0;
  eachRun((layer, points, closed) => {
    for (let i = 1; i < points.length + (closed ? 1 : 0); i++) {
      if (index++ % stride) continue;
      const a = points[i - 1], b = points[i % points.length];
      if (!rows.has(layer)) rows.set(layer, []);
      rows.get(layer).push(a.x - bounds.x0, a.y - bounds.y0, b.x - bounds.x0, b.y - bounds.y0);
    }
  });
  return [...rows].map(([layer, segs]) => ({ layer, segs: new Float32Array(segs) }));
}

/* Only the session owns the flattened drawing. Neither the parsed records
   nor the full point objects cross the worker boundary. */
export function createDxfSession({ maxPreviewSegments = 200000 } = {}) {
  let flat, name, units;
  return {
    open(bytes, { name: fileName = "drawing.dxf" } = {}) {
      flat = null;
      const doc = parseDxf(decodeDxfBytes(bytes));
      flat = flattenDxf(doc);
      if (!flat.strokes.length && !flat.fills.length) { flat = null; throw dxfError("DXF_NOTHING"); }
      name = fileName;
      units = dxfUnits(doc, flat);
      const bounds = coreBounds(flat, null);
      return {
        name, count: flat.strokes.length + flat.fills.length + flat.texts.length,
        units, layers: layerSummary(doc, flat), warnings: flat.warnings, bounds,
        preview: previewGeometry(flat, bounds, maxPreviewSegments),
      };
    },
    plan({ layers = null, cmPerUnit = units?.cmPerUnit, firstId = 1, height = 270, phase = "existing", underlay = true } = {}) {
      if (!flat) throw dxfError("DXF_EMPTY");
      if (layers != null) layers = new Set(layers);
      let graph = { nodes: [], walls: [], openings: [], nextId: firstId }, frame;
      if (!layers || layers.size) ({ graph, frame } = recognizeDxf(flat, { layers, cmPerUnit, firstId, height, phase }));
      else {
        const b = coreBounds(flat, null) || { cx: 0, cy: 0 };
        frame = { cmPerUnit, shiftX: b.cx, shiftY: b.cy, ox: 0, oz: 0 };
      }
      return {
        graph, frame, underlay: underlay ? dxfUnderlay(flat, frame, { name }) : { ref: null, dropped: 0 },
        texts: flat.texts.map((tx) => ({ ...toPlan(frame, tx), str: tx.str, size: tx.size })),
      };
    },
  };
}

// ------------------------------------------------------------------- rooms

function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}

/* A room's name from the drawing: the largest text inside its outline that is
   a word, not a size, an area or a level ("+3.20", "12.4 m²", "345"). */
export function roomNameFromTexts(poly, texts) {
  let best = null;
  for (const t of texts) {
    const s = String(t.str || "").trim();
    if (s.length < 2 || s.length > 40 || !/\p{L}{2}/u.test(s)) continue;
    if (parseArea(s) != null || parseLength(s).length || /^[+\-±]?\d/.test(s)) continue;
    if (!inside(t, poly)) continue;
    if (!best || t.size > best.size) best = t;
  }
  return best ? best.str.trim() : null;
}
