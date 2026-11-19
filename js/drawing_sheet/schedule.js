/* The door and window schedule a US sheet carries beside the plan when its
   openings are tagged (js/drawing_sheet/annotations.js). Drawn in PAPER
   millimetres with its own origin at the top-left, so js/sheet_print.js can
   place it at any print scale. Returns null when there is nothing to list. */
import { formatDimension, openingTags } from "../drafting_standards.js";

const TABLE_FACE = "Inter, Helvetica, Arial, sans-serif";
const TABLE_INK = "#1b1d20";
const ROW_MM = 5;
const COLS_MM = [12, 22, 22, 22];
export const SCHEDULE_WIDTH_MM = COLS_MM.reduce((a, b) => a + b, 0);

const tesc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/* Rows as data, so a test can read them without parsing SVG: doors first
   (numbered), then windows (lettered), each with width, height and sill. */
export function scheduleRows(openings, std) {
  const tags = openingTags(openings);
  const f = (cm) => formatDimension(std, cm);
  const rows = (openings || []).map((op, i) => ({
    tag: tags[i], kind: op.type === "window" ? "window" : "door",
    width: f(op.width || 0), height: f(op.height || 0), sill: op.type === "window" ? f(op.sill || 0) : "",
  }));
  return rows.filter((r) => r.kind === "door").concat(rows.filter((r) => r.kind === "window"));
}

/* `labels` = { door, window, mark, width, height, sill } captions; at most
   `maxRows` rows fit (the rest is counted in a last line). */
export function openingScheduleSVG(openings, std, labels, maxRows) {
  const rows = scheduleRows(openings, std);
  if (!rows.length) return null;
  const L = labels || {};
  const out = [];
  let y = 0;
  const line = (yy) => out.push(`<line x1="0" y1="${yy}" x2="${SCHEDULE_WIDTH_MM}" y2="${yy}" stroke="${TABLE_INK}" stroke-width="0.18"/>`);
  const cells = (vals, yy, bold) => {
    let x = 0;
    vals.forEach((v, c) => {
      out.push(`<text x="${x + 1.5}" y="${yy + ROW_MM * 0.7}" font-family="${TABLE_FACE}" font-size="2.3"${bold ? ' font-weight="700"' : ""} fill="${TABLE_INK}">${tesc(v)}</text>`);
      x += COLS_MM[c];
    });
  };
  const limit = Math.max(1, Number(maxRows) || 40);
  ["door", "window"].forEach((kind) => {
    const list = rows.filter((r) => r.kind === kind);
    if (!list.length) return;
    out.push(`<text x="0" y="${y + ROW_MM * 0.75}" font-family="${TABLE_FACE}" font-size="3" font-weight="700" fill="${TABLE_INK}">${tesc(kind === "door" ? L.door || "DOOR SCHEDULE" : L.window || "WINDOW SCHEDULE")}</text>`);
    y += ROW_MM + 1;
    line(y);
    cells([L.mark || "MARK", L.width || "WIDTH", L.height || "HEIGHT", kind === "window" ? L.sill || "SILL" : ""], y, true);
    y += ROW_MM; line(y);
    const shown = list.slice(0, limit);
    shown.forEach((r) => { cells([r.tag, r.width, r.height, r.sill], y); y += ROW_MM; line(y); });
    if (list.length > shown.length) { cells(["+" + (list.length - shown.length)], y); y += ROW_MM; }
    y += ROW_MM;
  });
  return { svg: `<g class="opening-schedule">${out.join("")}</g>`, w: SCHEDULE_WIDTH_MM, h: y };
}
