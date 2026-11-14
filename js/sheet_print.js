/* Architectural sheet chrome: paper size, true print scale, and a title block.

   Model geometry is in centimetres and stays that way — the SVG user unit IS
   one centimetre. What makes the sheet printable is the physical size on the
   root element: at 1:D, one centimetre of building is 10/D millimetres of
   paper, so a sheet P millimetres wide must show a viewBox P*D/10 units wide.

   This used to emit `width = units/10 mm` on a centimetre viewBox, which is
   1:100 whatever the title block claimed — a 400x300 plan printed 46 x 40 mm
   under a stamp reading "1:20". The block itself was 42 model-centimetres
   tall, i.e. 4.2 mm of paper with 0.9 mm text. Both are fixed by choosing the
   scale from the paper and then deriving every dimension from it. */

import { IMPERIAL_SCALE_LABELS } from "./drafting_standards.js";
import { FRAME, sheetFrameSVG } from "./drawing_sheet/sheet_frame.js";

// Landscape millimetres. ISO A plus the US Arch sizes contractors ask for.
export const PAPER_SIZES = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A2: { w: 594, h: 420 },
  A1: { w: 841, h: 594 },
  A0: { w: 1189, h: 841 },
  ArchC: { w: 559, h: 432 },
  ArchD: { w: 864, h: 559 },
  ArchE: { w: 1118, h: 864 },
};

// Scales a drawing is allowed to be at. Anything else is not a plan, it is a picture.
const SCALES = [10, 20, 25, 50, 100, 200, 500];
const PAPER_ORDER = ["A4", "A3", "A2", "A1", "A0"];
export const ARCH_PAPER_ORDER = ["ArchC", "ArchD", "ArchE"];
const MARGIN_MM = 10;
const BLOCK_MM = 18;
// a title block down the right edge (US practice) is this wide
const BLOCK_RIGHT_MM = 64;
const ASIDE_GAP_MM = 8;

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>\"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/* The calendar date where the sheet is printed. toISOString() is UTC, which
   stamped yesterday's date on a sheet printed in Israel after midnight. */
export function today(d) {
  d = d || new Date();
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/* Smallest sheet, then largest drawing, that fits the plan plus margins and
   the title block strip.

   To a drafting standard (`o.standard`, js/drafting_standards.js) the order
   flips: the standard's own scales come first (1:50 before 1:100, a working
   drawing's scale before a permit's), each tried on its paper series from the
   smallest sheet up, and only a plan too big for all of them falls back to
   the coarser scales. `o.scale` pins a scale, `o.paper` a sheet. Its title
   block may run down the right edge; `o.asideMm` {w, h} reserves room in the
   drawing field for a table beside the plan. */
export function sheetLayout(bounds, opts) {
  const o = opts || {};
  const std = o.standard || null;
  const wCm = Math.max(1, (bounds && bounds.w) || 0);
  const dCm = Math.max(1, (bounds && bounds.d) || 0);
  const order = std && std.papers && std.papers.length ? std.papers : PAPER_ORDER;
  const papers = o.paper && PAPER_SIZES[o.paper] ? [o.paper] : order;
  const margin = MARGIN_MM;
  const right = !!(std && std.titleBlock === "right");
  // a standard's sheet carries the full frame: the bottom band (legend, scale
  // bar, title block) or the US strip (js/drawing_sheet/sheet_frame.js)
  const block = right ? 0 : std ? FRAME.band : BLOCK_MM;
  const blockW = right ? (std ? FRAME.strip : BLOCK_RIGHT_MM) : 0;
  const aside = o.asideMm && o.asideMm.w > 0 ? o.asideMm : null;
  const asideW = aside ? aside.w + ASIDE_GAP_MM : 0;
  const fits = (paper, denom) => wCm * 10 / denom <= paper.w - margin * 2 - blockW - asideW &&
    dCm * 10 / denom <= paper.h - margin * 2 - block && (!aside || aside.h <= paper.h - margin * 2 - block);
  let chosen = null;
  if (std) {
    const own = Number(o.scale) > 0 ? [Number(o.scale)] : (std.scales || []).slice();
    const coarser = std.imperial ? [192, 384] : SCALES.filter((d) => d > Math.max(...own, 0));
    for (const denom of own.concat(Number(o.scale) > 0 ? [] : coarser)) {
      const name = papers.find((n) => fits(PAPER_SIZES[n], denom));
      if (name) { chosen = { name, paper: PAPER_SIZES[name], denom }; break; }
    }
    if (!chosen) {
      const name = papers[papers.length - 1];
      chosen = { name, paper: PAPER_SIZES[name], denom: Number(o.scale) > 0 ? Number(o.scale) : SCALES[SCALES.length - 1] };
    }
    chosen.why = layoutWhy({ std, o, chosen, papers, fits, wCm, dCm, margin, block, blockW, asideW });
    if (chosen.why.finer) chosen.denom = chosen.why.finer;
  } else {
    for (const name of papers) {
      const paper = PAPER_SIZES[name];
      const availW = paper.w - margin * 2;
      const availH = paper.h - margin * 2 - block;
      for (const denom of SCALES) {
        if (wCm * 10 / denom <= availW && dCm * 10 / denom <= availH) {
          chosen = { name, paper, denom };
          break;
        }
      }
      if (chosen) break;
    }
  }
  if (!chosen) {
    // larger than the biggest sheet at 1:500 — keep the honest scale rather than lie
    const name = papers[papers.length - 1];
    chosen = { name, paper: PAPER_SIZES[name], denom: SCALES[SCALES.length - 1] };
  }
  const denom = chosen.denom;
  // centimetres of model per millimetre of paper
  const cmPerMm = denom / 10;
  const out = {
    paperName: chosen.name,
    widthMm: chosen.paper.w,
    heightMm: chosen.paper.h,
    marginMm: margin,
    blockMm: block,
    denom,
    label: std && std.imperial && IMPERIAL_SCALE_LABELS[denom] ? IMPERIAL_SCALE_LABELS[denom] : "1:" + denom,
    cmPerMm,
    // the same sheet expressed in model units, which is the SVG user space
    viewW: chosen.paper.w * cmPerMm,
    viewH: chosen.paper.h * cmPerMm,
  };
  if (std) Object.assign(out, { titleBlock: right ? "right" : "bottom", blockWidthMm: blockW, asideMm: aside ? asideW : 0, why: chosen.why || null });
  return out;
}

/* Why a standard's sheet got its paper and scale, for the Drawing view's
   tooltip: the standard's own scale on the smallest sheet it fits (and which
   smaller sheet was too small), or the user's pin. A plan filling under 40 %
   of the drawing field takes the next FINER scale the standard lists, if one
   fits on the same sheet; a coarser one would only shrink it further. */
function layoutWhy(a) {
  const { o, chosen, papers, fits, wCm, dCm } = a;
  const field = (p) => ({ w: p.w - a.margin * 2 - a.blockW - a.asideW, h: p.h - a.margin * 2 - a.block });
  const need = (d) => ({ w: (wCm * 10) / d, h: (dCm * 10) / d });
  const f = field(chosen.paper), n = need(chosen.denom);
  const why = { code: Number(o.scale) > 0 || o.paper ? "pinned" : "smallest-fit", fill: (n.w * n.h) / (f.w * f.h), need: n, field: f };
  if (why.code === "smallest-fit" && why.fill < 0.4) {
    const finer = (a.std.scales || []).filter((d) => d < chosen.denom).sort((x, y) => y - x).find((d) => fits(chosen.paper, d));
    if (finer) {
      const n2 = need(finer);
      Object.assign(why, { code: "finer", finer, need: n2, fill: (n2.w * n2.h) / (f.w * f.h) });
    }
  }
  const idx = papers.indexOf(chosen.name);
  if (idx > 0) why.smaller = { name: papers[idx - 1], field: field(PAPER_SIZES[papers[idx - 1]]) };
  return why;
}

/* Kept as a plain string because the UI just wants the caption.
   `sheetLayout` is the one that knows the geometry. */
export function sheetScaleLabel(bounds, opts) {
  return sheetLayout(bounds, opts).label;
}

/* A block in its OWN coordinate system: every text size is a fraction of `h`,
   so the same markup is legible whether it is nested at 18 mm or rendered
   standalone. `x`/`y`/`placeWidth`/`placeHeight` position it when nested. */
export function titleBlockSVG(opts) {
  const o = opts || {};
  if (o.layout === "right") return titleStripSVG(o);
  const w = Number(o.width) || 400;
  const h = Number(o.height) || 36;
  const name = esc(o.name || "Untitled");
  const scale = esc(o.scale || "1:50");
  const date = esc(o.date || today());
  const sheet = esc(o.sheet || "A-01");
  const paper = esc(o.paper || "");
  const note = esc(o.note || "Do not scale drawing. Verify all dimensions on site.");
  const lab = o.labels || {};
  const L = { scale: esc(lab.scale || "SCALE"), date: esc(lab.date || "DATE"), sheet: esc(lab.sheet || "SHEET") };
  const big = (h * 0.19).toFixed(2);
  const small = (h * 0.13).toFixed(2);
  const face = "Inter, Helvetica, Arial, sans-serif";
  const place = o.x != null || o.y != null
    ? ` x="${Number(o.x) || 0}" y="${Number(o.y) || 0}" width="${Number(o.placeWidth) || w}" height="${Number(o.placeHeight) || h}"`
    : ` width="${w}" height="${h}"`;
  const pad = h * 0.18;
  const row1 = h * 0.42, row2 = h * 0.76;
  if (o.rtl) return titleBlockRtlSVG({ w, h, place, name, note, scale, date, sheet, paper, L, big, small, face, pad, row1, row2 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${place}>
  <rect x="${h * 0.02}" y="${h * 0.02}" width="${w - h * 0.04}" height="${h - h * 0.04}" fill="#fff" stroke="#20242a" stroke-width="${h * 0.03}"/>
  <line x1="${w * 0.46}" y1="0" x2="${w * 0.46}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>
  <line x1="${w * 0.68}" y1="0" x2="${w * 0.68}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>
  <line x1="${w * 0.84}" y1="0" x2="${w * 0.84}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>
  <text x="${pad}" y="${row1}" font-family="${face}" font-size="${big}" fill="#20242a">${name}</text>
  <text x="${pad}" y="${row2}" font-family="${face}" font-size="${small}" fill="#5b6b80">${note}</text>
  <text x="${w * 0.47}" y="${row1}" font-family="${face}" font-size="${small}" fill="#5b6b80">${L.scale}${paper ? " / " + paper : ""}</text>
  <text x="${w * 0.47}" y="${row2}" font-family="${face}" font-size="${big}" fill="#20242a">${scale}</text>
  <text x="${w * 0.69}" y="${row1}" font-family="${face}" font-size="${small}" fill="#5b6b80">${L.date}</text>
  <text x="${w * 0.69}" y="${row2}" font-family="${face}" font-size="${big}" fill="#20242a">${date}</text>
  <text x="${w * 0.85}" y="${row1}" font-family="${face}" font-size="${small}" fill="#5b6b80">${L.sheet}</text>
  <text x="${w * 0.85}" y="${row2}" font-family="${face}" font-size="${big}" fill="#20242a">${sheet}</text>
</svg>`;
}

/* The bottom block mirrored for a Hebrew sheet: the project name in the
   right-hand cell, the caption cells running leftwards. SVG `direction="rtl"`
   with text-anchor start anchors each line at its cell's right edge; names
   and notes sit in first-strong isolates so a Latin project name keeps its
   own order inside the Hebrew line. */
function titleBlockRtlSVG(v) {
  const { w, h, place, L, big, small, face, pad, row1, row2 } = v;
  const iso = (s) => "⁨" + s + "⁩";
  const cell = (x, y, size, fill, text) =>
    `<text x="${x}" y="${y}" direction="rtl" text-anchor="start" font-family="${face}" font-size="${size}" fill="${fill}">${text}</text>`;
  const cols = [0.54, 0.32, 0.16];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${place} class="title-rtl">
  <rect x="${h * 0.02}" y="${h * 0.02}" width="${w - h * 0.04}" height="${h - h * 0.04}" fill="#fff" stroke="#20242a" stroke-width="${h * 0.03}"/>
${cols.map((c) => `  <line x1="${w * c}" y1="0" x2="${w * c}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>`).join("\n")}
  ${cell(w - pad, row1, big, "#20242a", iso(v.name))}
  ${cell(w - pad, row2, small, "#5b6b80", iso(v.note))}
  ${cell(w * 0.53, row1, small, "#5b6b80", L.scale + (v.paper ? " / " + iso(v.paper) : ""))}
  ${cell(w * 0.53, row2, big, "#20242a", iso(v.scale))}
  ${cell(w * 0.31, row1, small, "#5b6b80", L.date)}
  ${cell(w * 0.31, row2, big, "#20242a", iso(v.date))}
  ${cell(w * 0.15, row1, small, "#5b6b80", L.sheet)}
  ${cell(w * 0.15, row2, big, "#20242a", iso(v.sheet))}
</svg>`;
}

/* A title strip down the right edge of the sheet (US practice): project name
   at the top, the note under it, then scale, date and a large sheet number at
   the foot. Text sizes are fractions of the strip's width. */
function titleStripSVG(o) {
  const w = Number(o.width) || 64;
  const h = Number(o.height) || 400;
  const lab = o.labels || {};
  const face = "Inter, Helvetica, Arial, sans-serif";
  const place = o.x != null || o.y != null
    ? ` x="${Number(o.x) || 0}" y="${Number(o.y) || 0}" width="${Number(o.placeWidth) || w}" height="${Number(o.placeHeight) || h}"`
    : ` width="${w}" height="${h}"`;
  const pad = w * 0.07, big = w * 0.075, small = w * 0.05, huge = w * 0.16;
  const text = (x, y, size, fill, s, bold) => `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${face}" font-size="${size.toFixed(2)}"${bold ? ' font-weight="700"' : ""} fill="${fill}">${esc(s)}</text>`;
  // the name and the note wrap at roughly the strip's width
  const wrap = (s, size) => {
    const perLine = Math.max(8, Math.floor((w - pad * 2) / (size * 0.55)));
    const lines = [];
    String(s).split(/\s+/).forEach((word) => {
      const last = lines[lines.length - 1];
      if (last != null && (last + " " + word).length <= perLine) lines[lines.length - 1] = last + " " + word;
      else lines.push(word);
    });
    return lines;
  };
  const out = [`<rect x="0" y="0" width="${w}" height="${h}" fill="#fff" stroke="#20242a" stroke-width="${(w * 0.012).toFixed(2)}"/>`];
  const names = wrap(o.name || "Untitled", big);
  names.forEach((ln, i) => out.push(text(pad, pad + big + i * big * 1.25, big, "#20242a", ln, true)));
  const noteTop = pad + big * (1.2 + names.length * 1.25);
  wrap(o.note || "Do not scale drawing. Verify all dimensions on site.", small)
    .forEach((ln, i) => out.push(text(pad, noteTop + i * small * 1.35, small, "#5b6b80", ln)));
  const rowsTop = h - w * 0.95;
  const rule = (y) => out.push(`<line x1="0" y1="${y.toFixed(2)}" x2="${w}" y2="${y.toFixed(2)}" stroke="#20242a" stroke-width="${(w * 0.008).toFixed(2)}"/>`);
  [[lab.scale || "SCALE", o.scale || "1:50", o.paper], [lab.date || "DATE", o.date || today()]].forEach(([k, v, extra], i) => {
    const y = rowsTop + i * w * 0.2;
    rule(y);
    out.push(text(pad, y + small * 1.5, small, "#5b6b80", k + (extra ? " / " + extra : "")));
    out.push(text(pad, y + small * 1.5 + big * 1.3, big, "#20242a", v));
  });
  const sy = rowsTop + w * 0.4;
  rule(sy);
  out.push(text(pad, sy + small * 1.5, small, "#5b6b80", lab.sheet || "SHEET"));
  out.push(text(pad, sy + small * 1.5 + huge * 1.1, huge, "#20242a", o.sheet || "A-101", true));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${place} class="title-strip">
  ${out.join("\n  ")}
</svg>`;
}

/* `planInner` is drawing content in model centimetres with its own origin at
   (0,0) — wrapPlanSVG owns the margins and the centring.

   To a standard (`meta.standard`) the title block may be the right-edge strip
   or the mirrored Hebrew one (`meta.rtl`), its captions come from
   `meta.labels`, and `meta.aside` {svg, w, h} (paper mm, e.g. the opening
   schedule) is set at the top right of the drawing field. */
export function wrapPlanSVG(planInner, bounds, meta) {
  const o = meta || {};
  if (o.standard) return wrapStandardSVG(planInner, bounds, o);
  const L = sheetLayout(bounds, o);
  const wCm = Math.max(1, (bounds && bounds.w) || 0);
  const dCm = Math.max(1, (bounds && bounds.d) || 0);
  const marginU = L.marginMm * L.cmPerMm;
  const blockU = L.blockMm * L.cmPerMm;
  const fieldH = L.viewH - marginU * 2 - blockU;
  // centre the plan in the drawing field, above the title block
  const ox = (L.viewW - wCm) / 2;
  const oy = marginU + Math.max(0, (fieldH - dCm) / 2);
  const block = titleBlockSVG({
    name: o.name,
    note: o.note,
    scale: L.label,
    paper: L.paperName,
    sheet: o.sheet,
    date: o.date,
    width: L.widthMm - L.marginMm * 2,
    height: L.blockMm,
    x: marginU,
    y: L.viewH - marginU - blockU,
    placeWidth: L.viewW - marginU * 2,
    placeHeight: blockU,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.viewW.toFixed(2)} ${L.viewH.toFixed(2)}" width="${L.widthMm}mm" height="${L.heightMm}mm">
  <rect width="100%" height="100%" fill="white"/>
  <g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${planInner}</g>
  ${block}
</svg>`;
}

// the layout reason as data-* attributes the Drawing view reads for its tooltip
function whyAttrs(w) {
  if (!w) return "";
  const mm = (v) => Math.round(v);
  return ` data-why="${w.code}" data-fill="${w.fill.toFixed(2)}" data-need="${mm(w.need.w)}x${mm(w.need.h)}"` +
    (w.smaller ? ` data-smaller="${esc(w.smaller.name)}:${mm(w.smaller.field.w)}x${mm(w.smaller.field.h)}"` : "");
}

function wrapStandardSVG(planInner, bounds, o) {
  const aside = o.aside && o.aside.svg ? o.aside : null;
  const L = sheetLayout(bounds, Object.assign({}, o, { asideMm: aside ? { w: aside.w, h: aside.h } : null }));
  const k = L.cmPerMm;
  const wCm = Math.max(1, (bounds && bounds.w) || 0);
  const dCm = Math.max(1, (bounds && bounds.d) || 0);
  const marginU = L.marginMm * k;
  const right = L.titleBlock === "right";
  const blockU = L.blockMm * k, stripU = L.blockWidthMm * k, asideU = L.asideMm * k;
  const fieldW = L.viewW - marginU * 2 - stripU - asideU;
  const fieldH = L.viewH - marginU * 2 - blockU;
  const ox = marginU + Math.max(0, (fieldW - wCm) / 2);
  const oy = marginU + Math.max(0, (fieldH - dCm) / 2);
  const labels = o.labels || {};
  const frame = sheetFrameSVG({
    W: L.widthMm, H: L.heightMm, m: L.marginMm, std: o.standard, L: Object.assign({
      project: "PROJECT", address: "ADDRESS", client: "CLIENT", designer: "DESIGNER", title: "DRAWING", scale: "SCALE", date: "DATE", sheet: "SHEET",
      rev: "REV", rev_desc: "DESCRIPTION", approval: "APPROVAL / STAMP", legend: "LEGEND",
    }, labels), info: Object.assign({ project: o.name }, o.info || {}), kinds: o.kinds, scaleLabel: L.label, paper: L.paperName,
    denom: L.denom, date: o.date || today(), sheet: o.sheet, rtl: !!o.rtl, northDeg: o.northDeg || 0,
    bandMm: right ? 0 : L.blockMm, stripMm: right ? L.blockWidthMm : 0, grid: L.widthMm >= 559,
  });
  // the table keeps half the reserved gap clear of the title strip
  const asideX = aside ? L.viewW - marginU - stripU - (aside.w + ASIDE_GAP_MM / 2) * k : 0;
  const asideSvg = aside ? `<g class="sheet-aside" transform="translate(${asideX.toFixed(2)} ${marginU.toFixed(2)}) scale(${k})">${aside.svg}</g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.viewW.toFixed(2)} ${L.viewH.toFixed(2)}" width="${L.widthMm}mm" height="${L.heightMm}mm" data-standard="${esc(o.standard.id)}" data-scale="${L.denom}" data-paper="${esc(L.paperName)}"${whyAttrs(L.why)}>
  <rect width="100%" height="100%" fill="white"/>
  <g class="sheet-plan" transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${planInner}</g>
  ${asideSvg}
  <svg x="0" y="0" width="${L.viewW.toFixed(2)}" height="${L.viewH.toFixed(2)}" viewBox="0 0 ${L.widthMm} ${L.heightMm}" overflow="visible">${frame}</svg>
</svg>`;
}

/* Print one sheet on its own paper size: the SVG goes into a hidden frame
   whose page is exactly that sheet, so the app chrome never prints.
   (The Workspace dialog keeps an identical local copy for now.) */
/* (The page box is the body, overflow hidden: a sheet exactly the paper's
   size rounded up a hair and printed a blank second page.) */
export function printSheetSVG(svg, title) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const m = /width="([\d.]+)mm" height="([\d.]+)mm"/.exec(svg);
  const page = m ? m[1] + "mm " + m[2] + "mm" : "landscape";
  doc.open();
  doc.write('<!doctype html><title>' + String(title || "Sheet").replace(/</g, "&lt;") + '</title><style>@page{size:' + page + ';margin:0}html,body{margin:0;width:100%;height:100%;overflow:hidden}svg{display:block;width:100%;height:100%}</style>' + svg);
  doc.close();
  setTimeout(() => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); } finally { setTimeout(() => frame.remove(), 1000); }
  }, 60);
}
