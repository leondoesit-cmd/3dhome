/* The paper round a regional working drawing (js/sheet_print.js wrapPlanSVG
   with `meta.standard`): border, grid references on A2 and larger, the title
   block with its fields, revision table and (Israel) the approval / stamp
   box, and a legend, graphic scale bar and north arrow.

   Everything here is drawn in PAPER millimetres inside one nested <svg> whose
   viewBox is the paper, laid over the drawing (model cm): so a 2.5 mm letter
   is 2.5 mm whatever the scale.

   Layout: the bottom band (standards with a bottom title block) holds, left
   to right, the legend, the scale bar and north arrow, the stamp box (il) and
   the title block; a US sheet keeps all of it in the strip down the right
   edge (NCS / AIA practice), its title block at the foot of the strip.
   ISO 5457 grid references: zones about 50 mm, numbers along the top and
   bottom, letters down the sides. ISO 7200 fields. Unverified against the
   standards' own text, like the rest of js/drafting_standards.js. */
import { hatchFor } from "./hatches.js";
import { PENS, PEN_INK, PEN_FACE, textWidthMm } from "./pens.js";

const f2 = (n) => Math.round(n * 100) / 100;
const frEsc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const ISO_ISOLATE = (s) => "⁨" + s + "⁩";

export const FRAME = Object.freeze({ band: 50, strip: 80, blockW: 180, stamp: 42, zone: 50 });

/* Text in paper mm; `rtl` anchors at the right edge of the given x. */
function txt(x, y, s, size, o) {
  const p = o || {};
  const anchor = p.anchor || "start";
  const dir = p.rtl ? ' direction="rtl"' : "";
  return `<text x="${f2(x)}" y="${f2(y)}" font-size="${size}"${p.bold ? ' font-weight="700"' : ""} text-anchor="${anchor}"${dir}${p.fill ? ` fill="${p.fill}"` : ""}>${frEsc(s)}</text>`;
}
const rule = (x1, y1, x2, y2, w) => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke-width="${w}"/>`;

/* Grid references (ISO 5457): numbers across, letters down. */
export function gridZones(widthMm, heightMm, margin) {
  const nx = Math.max(2, Math.round((widthMm - 2 * margin) / FRAME.zone));
  const ny = Math.max(2, Math.round((heightMm - 2 * margin) / FRAME.zone));
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // I and O left out, as ISO 5457 does
  return { cols: Array.from({ length: nx }, (_, i) => String(i + 1)), rows: Array.from({ length: ny }, (_, i) => letters[i] || String(i + 1)) };
}

function borderSVG(P) {
  const { W, H, m } = P, out = [`<rect x="${m}" y="${m}" width="${f2(W - 2 * m)}" height="${f2(H - 2 * m)}" fill="none" stroke-width="0.7"/>`];
  if (!P.grid) return out.join("");
  const z = gridZones(W, H, m), cw = (W - 2 * m) / z.cols.length, rh = (H - 2 * m) / z.rows.length;
  z.cols.forEach((c, i) => {
    const x = m + cw * i;
    if (i) out.push(rule(x, m - 5, x, m, 0.35), rule(x, H - m, x, H - m + 5, 0.35));
    out.push(txt(x + cw / 2, m / 2 + 1.2, c, 3, { anchor: "middle" }), txt(x + cw / 2, H - m / 2 + 1.2, c, 3, { anchor: "middle" }));
  });
  z.rows.forEach((r, i) => {
    const y = m + rh * i;
    if (i) out.push(rule(m - 5, y, m, y, 0.35), rule(W - m, y, W - m + 5, y, 0.35));
    out.push(txt(m / 2, y + rh / 2 + 1.1, r, 3, { anchor: "middle" }), txt(W - m / 2, y + rh / 2 + 1.1, r, 3, { anchor: "middle" }));
  });
  return out.join("");
}

/* A legend swatch drawn in paper mm (the plan's hatch patterns are in model
   units and would come out k times too coarse here). */
function swatch(kind, std, x, y, w, h) {
  const fill = hatchFor(kind, std), out = [];
  const box = `<rect x="${f2(x)}" y="${f2(y)}" width="${w}" height="${h}" fill="${fill === "solid" ? PEN_INK : fill === "grey" ? "#c8c8c8" : "#fff"}" stroke-width="${PENS.medium}"/>`;
  const diag = (flip) => {
    for (let c = 1.2; c < w + h; c += 1.2) {
      // the line u + v = c inside the box, u along x, v along y
      const u0 = Math.max(0, c - h), u1 = Math.min(w, c);
      if (u1 <= u0) continue;
      const ya = y + (c - u0), yb = y + (c - u1);
      out.push(flip ? rule(x + w - u0, ya, x + w - u1, yb, PENS.fine) : rule(x + u0, ya, x + u1, yb, PENS.fine));
    }
  };
  if (fill === "diag" || fill === "cross") diag(false);
  if (fill === "cross") diag(true);
  if (fill === "batt") {
    const n = Math.max(2, Math.round(w / 2)), pts = [];
    for (let i = 0; i <= n; i++) pts.push(f2(x + (w * i) / n) + "," + f2(i % 2 ? y + h - 0.4 : y + 0.4));
    out.push(`<polyline points="${pts.join(" ")}" fill="none" stroke-width="${PENS.fine}"/>`);
  }
  return box + out.join("");
}

/* Legend rows: the wall kinds drawn, then the symbols the sheet uses. */
export function legendRows(kinds, std, L) {
  const rows = [];
  ["concrete", "masonry", "partition", "insulation", "membrane", "finish"].forEach((k) => {
    if (kinds && kinds.has(k)) rows.push({ kind: k, label: L["legend_" + k] || k });
  });
  if (std.openings === "tags") rows.push({ sym: "door-tag", label: L.legend_door_tag }, { sym: "window-tag", label: L.legend_window_tag });
  else rows.push({ sym: "opening", label: L.legend_opening });
  if (std.levelPlace === "room") rows.push({ sym: "level", label: L.legend_level });
  rows.push({ sym: "dim", label: L.legend_dim });
  return rows;
}

function legendSVG(x, y, w, h, P) {
  // a Hebrew sheet reads from the right: columns, swatches and words mirrored
  const rtl = !!P.rtl;
  const rows = legendRows(P.kinds, P.std, P.L), out = [txt(rtl ? x + w : x, y + 3.2, P.L.legend || "LEGEND", 2.5, { bold: true, rtl })];
  const rowH = 5.2, perCol = Math.max(1, Math.floor((h - 6) / rowH)), colW = Math.max(40, Math.min(62, w / Math.ceil(rows.length / perCol)));
  rows.forEach((r, i) => {
    const col = Math.floor(i / perCol), cy = y + 6 + (i % perCol) * rowH;
    if ((col + 1) * colW > w + 0.5) return;
    const cx = rtl ? x + w - col * colW - 8 : x + col * colW;
    if (r.kind) out.push(swatch(r.kind, P.std, cx, cy, 8, 3.6));
    else if (r.sym === "door-tag") out.push(`<circle cx="${f2(cx + 4)}" cy="${f2(cy + 1.8)}" r="1.8" fill="#fff" stroke-width="${PENS.fine}"/>` + txt(cx + 4, cy + 2.5, "1", 1.8, { anchor: "middle", bold: true }));
    else if (r.sym === "window-tag") out.push(`<polygon points="${[0, 1, 2, 3, 4, 5].map((k) => f2(cx + 4 + 1.9 * Math.cos(Math.PI / 3 * k)) + "," + f2(cy + 1.8 + 1.9 * Math.sin(Math.PI / 3 * k))).join(" ")}" fill="#fff" stroke-width="${PENS.fine}"/>` + txt(cx + 4, cy + 2.5, "A", 1.8, { anchor: "middle", bold: true }));
    else if (r.sym === "opening") out.push(rule(cx, cy, cx, cy + 3.6, PENS.cutInner), rule(cx + 8, cy, cx + 8, cy + 3.6, PENS.cutInner), rule(cx, cy + 1.5, cx + 8, cy + 1.5, PENS.fine), rule(cx, cy + 2.1, cx + 8, cy + 2.1, PENS.fine));
    else if (r.sym === "level") out.push(`<path d="M${f2(cx + 2.5)} ${f2(cy + 0.6)} L${f2(cx + 5.5)} ${f2(cy + 0.6)} L${f2(cx + 4)} ${f2(cy + 2.6)}Z" fill="#fff" stroke-width="${PENS.fine}"/>`, rule(cx + 1, cy + 2.6, cx + 7, cy + 2.6, PENS.fine));
    else if (r.sym === "dim") out.push(rule(cx, cy + 1.8, cx + 8, cy + 1.8, PENS.fine), rule(cx - 0.8, cy + 2.6, cx + 0.8, cy + 1, PENS.tick), rule(cx + 7.2, cy + 2.6, cx + 8.8, cy + 1, PENS.tick));
    out.push(rtl ? txt(cx - 2.5, cy + 2.8, r.label, 2, { rtl }) : txt(cx + 10.5, cy + 2.8, r.label, 2, {}));
  });
  return out.join("");
}

/* A scale bar in the standard's units: alternate black and white segments
   with figures, about 40–80 mm long. */
export function scaleBarSpec(denom, imperial) {
  const unitMm = imperial ? 304.8 : 1000; // one foot or one metre on site
  const steps = imperial ? [1, 2, 4, 5, 8, 10, 20, 40] : [0.5, 1, 2, 5, 10, 20, 50];
  const segs = 4;
  let step = steps[steps.length - 1];
  for (const s of steps) if ((s * unitMm / denom) * segs >= 36) { step = s; break; }
  const segMm = (step * unitMm) / denom;
  return { segs, step, segMm, unit: imperial ? "ft" : "m" };
}

function scaleBarSVG(x, y, denom, P) {
  const s = scaleBarSpec(denom, P.std.imperial), out = [];
  for (let i = 0; i < s.segs; i++) out.push(`<rect x="${f2(x + i * s.segMm)}" y="${f2(y)}" width="${f2(s.segMm)}" height="1.6" fill="${i % 2 ? "#fff" : PEN_INK}" stroke-width="${PENS.fine}"/>`);
  for (let i = 0; i <= s.segs; i++) out.push(txt(x + i * s.segMm, y + 4.6, String(+(i * s.step).toFixed(2)), 2, { anchor: "middle" }));
  out.push(txt(x + s.segs * s.segMm + 2.5, y + 1.6, s.unit, 2, {}));
  out.push(txt(x, y - 1.6, P.scaleLabel, 2.5, { bold: true }));
  return { svg: out.join(""), w: s.segs * s.segMm + 7 };
}

function northSVG(cx, cy, r, deg) {
  return `<g transform="rotate(${f2(-(deg || 0))} ${f2(cx)} ${f2(cy)})"><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${r}" fill="none" stroke-width="${PENS.medium}"/>` +
    `<path d="M${f2(cx)} ${f2(cy - r)} L${f2(cx + r * 0.42)} ${f2(cy + r * 0.6)} L${f2(cx)} ${f2(cy + r * 0.25)}Z" fill="${PEN_INK}" stroke-width="${PENS.fine}"/>` +
    `<path d="M${f2(cx)} ${f2(cy - r)} L${f2(cx - r * 0.42)} ${f2(cy + r * 0.6)} L${f2(cx)} ${f2(cy + r * 0.25)}Z" fill="#fff" stroke-width="${PENS.fine}"/>` +
    txt(cx, cy - r - 1.4, "N", 3, { anchor: "middle", bold: true }) + `</g>`;
}

/* The title block's field list, in reading order. */
export function titleFields(info, P) {
  const I = info || {};
  return [
    { key: "project", value: I.project || "" },
    { key: "address", value: I.address || "" },
    { key: "client", value: I.client || "" },
    { key: "designer", value: I.designer || "" },
    { key: "title", value: I.title || "" },
    { key: "scale", value: P.scaleLabel },
    { key: "date", value: I.date || P.date },
    { key: "sheet", value: I.sheet || P.sheet },
  ];
}

/* A label + value cell. */
function cell(x, y, w, h, label, value, P, size) {
  const rtl = P.rtl, lx = rtl ? x + w - 1.5 : x + 1.5;
  const v = rtl && value ? ISO_ISOLATE(value) : value;
  return txt(lx, y + 2.6, label, 1.8, { rtl, fill: "#333" }) + (value ? txt(lx, y + h - 1.6, v, size || 2.5, { rtl, bold: size >= 3.5 }) : "");
}

function revisionsSVG(x, y, w, h, P) {
  const out = [`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="#fff" stroke-width="${PENS.medium}"/>`];
  const cols = [9, 18, w - 27], heads = [P.L.rev, P.L.date, P.L.rev_desc], rowH = 5, rtl = !!P.rtl;
  // column i's text position: from the left, or (Hebrew) from the right
  const start = (i) => { const before = cols.slice(0, i).reduce((a, b) => a + b, 0); return rtl ? x + w - before - cols[i] : x + before; };
  const at = (i, yy, s, size, bold) => rtl ? txt(start(i) + cols[i] - 1.2, yy, rtl ? ISO_ISOLATE(s) : s, size, { rtl, bold }) : txt(start(i) + 1.2, yy, s, size, { bold });
  heads.forEach((hd, i) => { out.push(at(i, y + 3.6, hd, 1.8, true)); if (i < 2) { const edge = rtl ? start(i) : start(i) + cols[i]; out.push(rule(edge, y, edge, y + h, PENS.fine)); } });
  out.push(rule(x, y + rowH, x + w, y + rowH, PENS.medium));
  const revs = (P.info.revisions || []).slice(-Math.max(1, Math.floor((h - rowH) / rowH)));
  for (let i = 1; i * rowH < h; i++) out.push(rule(x, y + rowH * (i + 1), x + w, y + rowH * (i + 1), PENS.fine));
  revs.forEach((r, i) => {
    const ry = y + rowH * (i + 1) + 3.6;
    out.push(at(0, ry, r.rev || String(i + 1), 2), at(1, ry, r.date || "", 2), at(2, ry, (r.note || "").slice(0, 40), 2));
  });
  return out.join("");
}

/* The bottom title block: revisions on the left, the fields on the right. */
function titleBlockBottom(x, y, w, h, P) {
  const out = [`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="#fff" stroke-width="${PENS.cutOuter}"/>`];
  const revW = Math.min(62, w * 0.34), fx = x + revW, fw = w - revW;
  out.push(revisionsSVG(x, y, revW, h, P));
  const F = Object.fromEntries(titleFields(P.info, P).map((f) => [f.key, f.value]));
  const rows = [14, 8, 11, h - 33];
  let ry = y;
  const L = P.L;
  out.push(cell(fx, ry, fw, rows[0], L.project, F.project, P, 4));
  out.push(F.address ? txt(P.rtl ? fx + fw - 1.5 : fx + 1.5, ry + rows[0] - 6, P.rtl ? ISO_ISOLATE(F.address) : F.address, 2.2, { rtl: P.rtl }) : "");
  ry += rows[0]; out.push(rule(fx, ry, fx + fw, ry, PENS.medium));
  out.push(cell(fx, ry, fw / 2, rows[1], L.client, F.client, P), cell(fx + fw / 2, ry, fw / 2, rows[1], L.designer, F.designer, P), rule(fx + fw / 2, ry, fx + fw / 2, ry + rows[1], PENS.fine));
  ry += rows[1]; out.push(rule(fx, ry, fx + fw, ry, PENS.medium));
  out.push(cell(fx, ry, fw, rows[2], L.title, F.title, P, 3.5));
  ry += rows[2]; out.push(rule(fx, ry, fx + fw, ry, PENS.medium));
  const c3 = [0.34, 0.33, 0.33].map((t) => fw * t);
  out.push(cell(fx, ry, c3[0], rows[3], L.scale + (P.paper ? " / " + P.paper : ""), F.scale, P, 3), rule(fx + c3[0], ry, fx + c3[0], ry + rows[3], PENS.fine));
  out.push(cell(fx + c3[0], ry, c3[1], rows[3], L.date, F.date, P, 2.5), rule(fx + c3[0] + c3[1], ry, fx + c3[0] + c3[1], ry + rows[3], PENS.fine));
  out.push(cell(fx + c3[0] + c3[1], ry, c3[2], rows[3], L.sheet, F.sheet, P, 5));
  out.push(rule(fx, y, fx, y + h, PENS.medium));
  return `<g class="title-block"${P.rtl ? ' data-rtl="1"' : ""}>${out.join("")}</g>`;
}

/* The US strip: legend and scale at the top, then the fields stacked, the
   sheet number large at the foot. */
function titleStripRight(x, y, w, h, P) {
  const out = [`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="#fff" stroke-width="${PENS.cutOuter}"/>`];
  const F = titleFields(P.info, P), L = P.L;
  const rowsH = { project: 16, address: 9, client: 9, designer: 9, title: 13, scale: 10, date: 9, sheet: 18 };
  const revH = 31;
  const fieldsH = F.reduce((s, f) => s + rowsH[f.key], 0) + revH;
  let ry = y + h - fieldsH;
  out.push(rule(x, ry, x + w, ry, PENS.medium));
  out.push(revisionsSVG(x, ry, w, revH, P));
  ry += revH;
  F.forEach((f) => {
    const size = f.key === "sheet" ? 7 : f.key === "project" ? 3.5 : f.key === "title" ? 3.5 : 2.5;
    out.push(cell(x, ry, w, rowsH[f.key], L[f.key] + (f.key === "scale" && P.paper ? " / " + P.paper : ""), f.value, P, size));
    ry += rowsH[f.key];
    out.push(rule(x, ry, x + w, ry, PENS.fine));
  });
  const topFree = h - fieldsH;
  if (topFree > 40) {
    out.push(legendSVG(x + 3, y + 3, w - 6, topFree - 34, P));
    const bar = scaleBarSVG(x + 4, y + topFree - 16, P.denom, P);
    out.push(bar.svg, northSVG(x + w - 10, y + topFree - 18, 6, P.northDeg));
  }
  return `<g class="title-strip">${out.join("")}</g>`;
}

/* The frame over a sheet. P: {W, H, m (paper mm), std, L (labels), info,
   kinds, scaleLabel, paper, denom, date, sheet, rtl, northDeg, bandMm,
   stripMm, grid}. Returns the inner markup of an <svg viewBox="0 0 W H">. */
export function sheetFrameSVG(P) {
  const { W, H, m } = P, out = [borderSVG(P)];
  if (P.stripMm) {
    out.push(titleStripRight(W - m - P.stripMm, m, P.stripMm, H - 2 * m, P));
  } else {
    const bh = P.bandMm, by = H - m - bh, inner = W - 2 * m;
    out.push(rule(m, by, W - m, by, PENS.medium));
    const bw = Math.min(FRAME.blockW, inner * 0.62);
    out.push(titleBlockBottom(W - m - bw, by, bw, bh, P));
    let free = inner - bw;
    if (P.std.id === "il" && free > FRAME.stamp + 30) {
      const sx = W - m - bw - FRAME.stamp;
      out.push(`<g class="stamp-box"><rect x="${f2(sx)}" y="${f2(by)}" width="${FRAME.stamp}" height="${bh}" fill="#fff" stroke-width="${PENS.medium}"/>` +
        txt(P.rtl ? sx + FRAME.stamp - 1.5 : sx + 1.5, by + 3.4, P.L.approval, 2, { rtl: P.rtl, bold: true }) + `</g>`);
      free -= FRAME.stamp;
    }
    const north = 14, barW = Math.min(90, Math.max(46, free * 0.35));
    const legendW = free - barW - north - 6;
    if (legendW > 30) out.push(legendSVG(m + 2, by + 2, legendW, bh - 4, P));
    const bx = m + Math.max(legendW, 0) + 4;
    out.push(scaleBarSVG(bx, by + bh / 2, P.denom, P).svg);
    out.push(northSVG(m + free - north / 2 - 2, by + bh / 2, 5.5, P.northDeg));
  }
  return `<g class="sheet-frame" font-family="${PEN_FACE}" fill="${PEN_INK}" stroke="${PEN_INK}">${out.join("").replace(/<text /g, '<text stroke="none" ')}</g>`;
}

/* Rough check used by tests and the layout: does a field's text fit its cell? */
export function fieldFits(value, size, cellW) { return textWidthMm(value, size) <= cellW - 3; }

/* The fields the user edits (js/ui_pro_drawing_info.js), kept in
   S.workspace.sheetInfo. */
function isoDay(d) {
  const x = d || new Date(), pad = (n) => (n < 10 ? "0" : "") + n;
  return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
}

export const SHEET_INFO_FIELDS = ["project", "address", "client", "designer", "title"];

/* Apply one edit to a sheetInfo object (pure, for tests): trims, drops empty
   fields, appends a revision numbered after the last. */
export function editSheetInfo(info, edit) {
  const next = Object.assign({}, info || {});
  if (edit.field && SHEET_INFO_FIELDS.includes(edit.field)) {
    const v = String(edit.value == null ? "" : edit.value).trim().slice(0, 120);
    if (v) next[edit.field] = v; else delete next[edit.field];
  }
  if (edit.revision) {
    const revs = Array.isArray(next.revisions) ? next.revisions.slice() : [];
    const last = revs.length ? revs[revs.length - 1].rev : "";
    const n = /^\d+$/.test(last) ? String(Number(last) + 1) : String(revs.length + 1);
    revs.push({ rev: n, date: edit.revision.date || isoDay(), note: String(edit.revision.note || "").trim().slice(0, 80) });
    next.revisions = revs;
  }
  return next;
}
