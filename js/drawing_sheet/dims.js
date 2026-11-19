/* Dimension strings of the regional working drawing, as geometry first (pure,
   tested) and SVG second.

   Outside, three tiers per side, nearest first: the openings (each jamb
   located along the facade), the wall chain (every corner and step), the
   overall. Inside, every room's clear width and depth near its walls, and
   each opening located off the nearest wall of the room it opens into.
   Short spans whose figure does not fit between the ticks alternate onto a
   second row so neighbours never collide.

   Plane coordinates: model cm, x right and z down the page, as the sheet.
   Sizes in `sz` are model cm already (the caller turns paper mm into them). */
import { planDimensionChains } from "../planner_drawing.js";
import { openingFrame } from "./annotations.js";
import { PENS, PEN_INK, PEN_FACE, textWidthMm } from "./pens.js";

const d2 = (n) => Math.round(n * 100) / 100;
const dimEsc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

export function faceSegments(wallPolys) {
  const segs = [];
  (wallPolys || []).forEach((poly) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    }
  });
  return segs;
}

/* An opening on a chain's side: its wall runs along the chain and no wall
   face lies further out at its position. Returns {at0, at1, face} or null. */
function openingOnSide(op, c, segs) {
  if (!op.poly || op.poly.length < 4) return null;
  const f = openingFrame(op.poly);
  const horiz = c.along === "x";
  if (Math.abs(horiz ? f.ux : f.uz) < 0.9) return null;
  const along = horiz ? f.cx : f.cz, across = horiz ? f.cz : f.cx;
  const face = across + c.dir * f.halfThick;
  const hidden = segs.some((s) => {
    const sa = horiz ? s.az : s.ax, sb = horiz ? s.bz : s.bx;
    if (Math.abs(sa - sb) > 0.5) return false; // not parallel to the side
    const lo = Math.min(horiz ? s.ax : s.az, horiz ? s.bx : s.bz), hi = Math.max(horiz ? s.ax : s.az, horiz ? s.bx : s.bz);
    return along > lo && along < hi && (sa - face) * c.dir > 1;
  });
  if (hidden) return null;
  const half = (op.width > 0 ? op.width : Math.hypot(op.poly[op.poly.length / 2 - 1].x - op.poly[0].x, op.poly[op.poly.length / 2 - 1].z - op.poly[0].z)) / 2;
  return { at0: along - half, at1: along + half, face };
}

function crosses(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/* A witness line that would run through the building (a curved or set-back
   face whose station is seen from far inside) is cut to a short stub next to
   the dimension line, as drafters do. */
function witnessStart(P, s, across, c, segs, sz) {
  const from = s.from + c.dir * sz.gap, a = P(s.at, from), b = P(s.at, across);
  const through = segs.some((g) => crosses(a, b, { x: g.ax, z: g.az }, { x: g.bx, z: g.bz }));
  return through ? across - c.dir * (sz.stub || sz.gap * 3) : from;
}

/* Short spans alternate rows: row 1 sits one text height further out. */
function staggerRows(texts, fits) {
  let flip = false;
  texts.forEach((t) => {
    if (fits(t)) { t.row = 0; flip = false; return; }
    t.row = flip ? 1 : 0;
    flip = !flip;
  });
}

/* sz: {off:[openings, chain, overall], gap, over, textOff, textH, textW(s)}.
   Returns {lines, ticks, texts}; a text is {x, z, s?, len, along, dir, row}. */
export function exteriorDimGeometry(wallPolys, openings, sz) {
  const segs = faceSegments(wallPolys);
  const chains = planDimensionChains(segs);
  const lines = [], ticks = [], texts = [];
  chains.forEach((c) => {
    const horiz = c.along === "x";
    const P = (a, across) => (horiz ? { x: a, z: across } : { x: across, z: a });
    const first = c.stations[0], last = c.stations[c.stations.length - 1];
    const jambs = [];
    (openings || []).forEach((op) => {
      const on = openingOnSide(op, c, segs);
      if (on && on.at0 > first.at - 0.5 && on.at1 < last.at + 0.5) jambs.push({ at: on.at0, from: on.face }, { at: on.at1, from: on.face });
    });
    jambs.sort((a, b) => a.at - b.at);
    const tiers = [];
    if (jambs.length) tiers.push({ off: sz.off[0], st: [first].concat(jambs, [last]) });
    tiers.push({ off: sz.off[1], st: c.stations });
    tiers.push({ off: sz.off[2], st: [first, last] });
    tiers.forEach((tier) => {
      const across = c.edge + c.dir * tier.off;
      const st = tier.st.filter((s, i, a) => i === 0 || Math.abs(s.at - a[i - 1].at) > 0.5);
      if (st.length < 2) return;
      lines.push({ a: P(st[0].at - sz.over, across), b: P(st[st.length - 1].at + sz.over, across) });
      st.forEach((s) => {
        lines.push({ a: P(s.at, witnessStart(P, s, across, c, segs, sz)), b: P(s.at, across + c.dir * sz.over) });
        ticks.push(P(s.at, across));
      });
      const row = [];
      for (let i = 0; i + 1 < st.length; i++) {
        const a = st[i].at, b = st[i + 1].at, len = Math.abs(b - a);
        if (len < 1) continue;
        const mid = P((a + b) / 2, across + c.dir * sz.textOff);
        row.push({ x: mid.x, z: mid.z, len, along: c.along, dir: c.dir, row: 0 });
      }
      staggerRows(row, (t) => sz.textW(t.len) < t.len * 0.9);
      row.forEach((t) => { if (t.row) { if (horiz) t.z += c.dir * sz.textH * 1.15; else t.x += c.dir * sz.textH * 1.15; } });
      texts.push(...row);
    });
  });
  return { lines, ticks, texts };
}

/* Inside: each room's clear width (near its top wall) and depth (near its
   left wall), and each opening located off the nearest clear corner of the
   room it opens into. rooms: [{clear:{x0,x1,z0,z1}}]. A room string moves
   further in, then to the opposite wall, while its figure would land on a
   fixture (`sz.blocked(x0, z0, x1, z1)`); an opening closer than
   `sz.minLocate` to the corner is not dimensioned (the jamb ticks would
   overprint). */
export function interiorDimGeometry(rooms, openings, sz) {
  const lines = [], ticks = [], texts = [];
  const span = (a, b, horiz, at, side) => {
    const len = Math.abs(b - a);
    if (len < 1) return;
    const P = (u) => (horiz ? { x: u, z: at } : { x: at, z: u });
    lines.push({ a: P(Math.min(a, b) - sz.over), b: P(Math.max(a, b) + sz.over) });
    ticks.push(P(a), P(b));
    const mid = P((a + b) / 2);
    texts.push({ x: horiz ? mid.x : mid.x + side * sz.textOff, z: horiz ? mid.z + side * sz.textOff : mid.z, len, along: horiz ? "x" : "z", dir: side, row: 0, inside: true });
  };
  (rooms || []).forEach((r) => {
    const c = r.clear;
    if (!c || !(c.x1 - c.x0 > sz.minRoom) || !(c.z1 - c.z0 > sz.minRoom)) return;
    const blocked = sz.blocked || (() => false);
    const th = sz.textH || 0, tw = sz.textW || (() => 0);
    const tries = (lo, hi) => [lo + sz.inset, lo + sz.inset * 2, hi - sz.inset * 2, lo + sz.inset * 3];
    const w = c.x1 - c.x0, d = c.z1 - c.z0;
    const zAt = tries(c.z0, c.z1).find((z) => !blocked((c.x0 + c.x1) / 2 - tw(w) / 2, z, (c.x0 + c.x1) / 2 + tw(w) / 2, z + sz.textOff + th)) ?? c.z0 + sz.inset;
    const xAt = tries(c.x0, c.x1).find((x) => !blocked(x, (c.z0 + c.z1) / 2 - tw(d) / 2, x + sz.textOff + th, (c.z0 + c.z1) / 2 + tw(d) / 2)) ?? c.x0 + sz.inset;
    span(c.x0, c.x1, true, zAt, 1);
    span(c.z0, c.z1, false, xAt, 1);
  });
  (openings || []).forEach((op) => {
    if (!op.poly || op.poly.length < 4) return;
    const f = openingFrame(op.poly);
    const horiz = Math.abs(f.ux) > 0.9, vert = Math.abs(f.uz) > 0.9;
    if (!horiz && !vert) return;
    const half = (op.width > 0 ? op.width : 0) / 2 || f.halfThick;
    for (const r of rooms || []) {
      const c = r.clear;
      // a passage narrower than a room has no space for locating strings
      if (!c || Math.min(c.x1 - c.x0, c.z1 - c.z0) < (sz.minLocateRoom || 0)) continue;
      const along = horiz ? f.cx : f.cz, lo = horiz ? c.x0 : c.z0, hi = horiz ? c.x1 : c.z1;
      if (!(along > lo && along < hi)) continue;
      const across = horiz ? f.cz : f.cx, near0 = horiz ? c.z0 : c.x0, near1 = horiz ? c.z1 : c.x1;
      let into = 0, face = 0;
      if (Math.abs(near0 - (across + f.halfThick)) < 4) { into = 1; face = near0; }
      else if (Math.abs(near1 - (across - f.halfThick)) < 4) { into = -1; face = near1; }
      if (!into) continue;
      const j0 = along - half, j1 = along + half, left = j0 - lo, right = hi - j1;
      const at = face + into * sz.openInset;
      const least = sz.minLocate || 1;
      if (left >= least && (left <= right || right < least)) span(lo, j0, horiz, at, into);
      else if (right >= least) span(j1, hi, horiz, at, into);
      break;
    }
  });
  return { lines, ticks, texts };
}

/* Draw dimension geometry: fine lines, the standard's terminator, the figures
   in the standard's number format. ctx {X, Y, mm, fmt, ts, terminator}. */
export function dimsSVG(geom, ctx) {
  const { X, Y, mm, fmt, ts } = ctx, out = [];
  const lineW = mm(PENS.fine), tickW = mm(PENS.tick), t = mm(1.2);
  geom.lines.forEach((l) => out.push(`<line x1="${d2(X(l.a.x))}" y1="${d2(Y(l.a.z))}" x2="${d2(X(l.b.x))}" y2="${d2(Y(l.b.z))}"/>`));
  const marks = geom.ticks.map((p) => {
    const x = d2(X(p.x)), y = d2(Y(p.z));
    if (ctx.terminator === "dot") return `<circle cx="${x}" cy="${y}" r="${mm(0.5)}" fill="${PEN_INK}" stroke="none"/>`;
    return `<line x1="${d2(x - t)}" y1="${d2(y + t)}" x2="${d2(x + t)}" y2="${d2(y - t)}" stroke-width="${tickW}"/>`;
  });
  const words = geom.texts.map((tx) => {
    const x = d2(X(tx.x)), y = d2(Y(tx.z)), rot = tx.along === "z" ? ` transform="rotate(-90 ${x} ${y})"` : "";
    return `<text x="${x}" y="${y}" font-size="${ts}" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="${mm(0.6)}" paint-order="stroke"${rot}>${dimEsc(fmt(tx.len))}</text>`;
  });
  return `<g class="dims" stroke="${PEN_INK}" stroke-width="${lineW}" fill="none">${out.join("")}${marks.join("")}</g>` +
    `<g class="dim-text" font-family="${PEN_FACE}" fill="${PEN_INK}">${words.join("")}</g>`;
}

/* The text width checker the stagger uses, from a formatter and a size. */
export function dimTextWidth(fmt, sizeMm, k) {
  return (len) => textWidthMm(fmt(len), sizeMm) * k;
}
