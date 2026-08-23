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
const MARGIN_MM = 10;
const BLOCK_MM = 18;

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>\"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function today() {
  try { return new Date().toISOString().slice(0, 10); }
  catch (e) { return ""; }
}

/* Smallest sheet, then largest drawing, that fits the plan plus margins and
   the title block strip. */
export function sheetLayout(bounds, opts) {
  const o = opts || {};
  const wCm = Math.max(1, (bounds && bounds.w) || 0);
  const dCm = Math.max(1, (bounds && bounds.d) || 0);
  const papers = o.paper && PAPER_SIZES[o.paper] ? [o.paper] : PAPER_ORDER;
  const margin = MARGIN_MM;
  const block = BLOCK_MM;
  let chosen = null;
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
  if (!chosen) {
    // larger than the biggest sheet at 1:500 — keep the honest scale rather than lie
    const name = papers[papers.length - 1];
    chosen = { name, paper: PAPER_SIZES[name], denom: SCALES[SCALES.length - 1] };
  }
  const denom = chosen.denom;
  // centimetres of model per millimetre of paper
  const cmPerMm = denom / 10;
  return {
    paperName: chosen.name,
    widthMm: chosen.paper.w,
    heightMm: chosen.paper.h,
    marginMm: margin,
    blockMm: block,
    denom,
    label: "1:" + denom,
    cmPerMm,
    // the same sheet expressed in model units, which is the SVG user space
    viewW: chosen.paper.w * cmPerMm,
    viewH: chosen.paper.h * cmPerMm,
  };
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
  const w = Number(o.width) || 400;
  const h = Number(o.height) || 36;
  const name = esc(o.name || "Untitled");
  const scale = esc(o.scale || "1:50");
  const date = esc(o.date || today());
  const sheet = esc(o.sheet || "A-01");
  const paper = esc(o.paper || "");
  const note = esc(o.note || "Do not scale drawing. Verify all dimensions on site.");
  const big = (h * 0.19).toFixed(2);
  const small = (h * 0.13).toFixed(2);
  const face = "Inter, Helvetica, Arial, sans-serif";
  const place = o.x != null || o.y != null
    ? ` x="${Number(o.x) || 0}" y="${Number(o.y) || 0}" width="${Number(o.placeWidth) || w}" height="${Number(o.placeHeight) || h}"`
    : ` width="${w}" height="${h}"`;
  const pad = h * 0.18;
  const row1 = h * 0.42, row2 = h * 0.76;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${place}>
  <rect x="${h * 0.02}" y="${h * 0.02}" width="${w - h * 0.04}" height="${h - h * 0.04}" fill="#fff" stroke="#20242a" stroke-width="${h * 0.03}"/>
  <line x1="${w * 0.46}" y1="0" x2="${w * 0.46}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>
  <line x1="${w * 0.68}" y1="0" x2="${w * 0.68}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>
  <line x1="${w * 0.84}" y1="0" x2="${w * 0.84}" y2="${h}" stroke="#20242a" stroke-width="${h * 0.02}"/>
  <text x="${pad}" y="${row1}" font-family="${face}" font-size="${big}" fill="#20242a">${name}</text>
  <text x="${pad}" y="${row2}" font-family="${face}" font-size="${small}" fill="#5b6b80">${note}</text>
  <text x="${w * 0.47}" y="${row1}" font-family="${face}" font-size="${small}" fill="#5b6b80">SCALE${paper ? " / " + paper : ""}</text>
  <text x="${w * 0.47}" y="${row2}" font-family="${face}" font-size="${big}" fill="#20242a">${scale}</text>
  <text x="${w * 0.69}" y="${row1}" font-family="${face}" font-size="${small}" fill="#5b6b80">DATE</text>
  <text x="${w * 0.69}" y="${row2}" font-family="${face}" font-size="${big}" fill="#20242a">${date}</text>
  <text x="${w * 0.85}" y="${row1}" font-family="${face}" font-size="${small}" fill="#5b6b80">SHEET</text>
  <text x="${w * 0.85}" y="${row2}" font-family="${face}" font-size="${big}" fill="#20242a">${sheet}</text>
</svg>`;
}

/* `planInner` is drawing content in model centimetres with its own origin at
   (0,0) — wrapPlanSVG owns the margins and the centring. */
export function wrapPlanSVG(planInner, bounds, meta) {
  const o = meta || {};
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
