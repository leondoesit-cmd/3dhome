/* Regional annotations on the construction sheet (js/drawing_sheet.js), drawn
   only when the sheet is given a drafting standard (js/drafting_standards.js):
   the text or tag beside each opening, room labels with area or number and
   the floor level mark. Same coordinate contract as the sheet: model
   centimetres from the drawing's top-left, sizes on paper in mm via `mm()`. */
import { formatArea, formatLevel, formatOpeningLabel, openingTags } from "../drafting_standards.js";

const LABEL_FACE = "Inter, Helvetica, Arial, sans-serif";
const LABEL_INK = "#1b1d20";
const rnd = (n) => Math.round(n * 100) / 100;
const xesc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/* Where an opening's annotation goes: its centre, the unit vector along the
   wall, and the unit normal pointing into the plan (toward its centre), plus
   half the wall thickness. The snapshot's opening polygon is one face from
   start to end, then the other face back. */
export function openingFrame(poly, centre) {
  const n = poly.length, half = n / 2;
  const a = poly[0], b = poly[half - 1], d = poly[n - 1];
  const cx = poly.reduce((s, p) => s + p.x, 0) / n, cz = poly.reduce((s, p) => s + p.z, 0) / n;
  const al = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const ux = (b.x - a.x) / al, uz = (b.z - a.z) / al;
  let nx = -uz, nz = ux;
  if (centre && (centre.x - cx) * nx + (centre.z - cz) * nz < 0) { nx = -nx; nz = -nz; }
  const thick = Math.hypot(d.x - a.x, d.z - a.z);
  return { cx, cz, ux, uz, nx, nz, halfThick: thick / 2 };
}

// text angle along the wall, kept readable (never upside down)
function readableAngle(ux, uz) {
  let deg = Math.atan2(uz, ux) * 180 / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return rnd(deg);
}

function textAt(x, y, s, size, angle, extra) {
  const rot = angle ? ` transform="rotate(${angle} ${x} ${y})"` : "";
  return `<text x="${x}" y="${y}" font-family="${LABEL_FACE}" font-size="${size}" text-anchor="middle" dominant-baseline="middle" fill="${LABEL_INK}"${extra || ""}${rot}>${xesc(s)}</text>`;
}

/* One annotation per opening, inside the plan. `ctx` = { X, Y, mm, centre,
   lang }. Tags (US) are a circle with the door number or a hexagon with the
   window letter; the schedule beside the plan explains them. */
export function openingLabelsSVG(openings, std, ctx) {
  const { X, Y, mm } = ctx;
  const out = [], tags = std.openings === "tags" ? openingTags(openings) : null;
  const ts = mm(2.1), halo = ` stroke="#fff" stroke-width="${mm(0.7)}" paint-order="stroke"`;
  (openings || []).forEach((op, i) => {
    if (!op.poly || op.poly.length < 4) return;
    const f = openingFrame(op.poly, ctx.centre);
    const at = (dist) => ({ x: rnd(X(f.cx + f.nx * dist)), y: rnd(Y(f.cz + f.nz * dist)) });
    const angle = readableAngle(f.ux, f.uz);
    if (tags) {
      const r = mm(2.6), p = at(f.halfThick + mm(5));
      const shape = op.type === "window"
        ? `<polygon points="${[0, 1, 2, 3, 4, 5].map((k) => rnd(p.x + r * Math.cos(Math.PI / 3 * k)) + "," + rnd(p.y + r * Math.sin(Math.PI / 3 * k))).join(" ")}"`
        : `<circle cx="${p.x}" cy="${p.y}" r="${r}"`;
      out.push(`<g class="opening-tag">${shape} fill="#fff" stroke="${LABEL_INK}" stroke-width="${mm(0.18)}"/>${textAt(p.x, p.y, tags[i], ts, 0, ' font-weight="700"')}</g>`);
      return;
    }
    const label = formatOpeningLabel(std, op, ctx.lang);
    if (typeof label === "string") {
      if (!label) return;
      const p = at(f.halfThick + mm(3.5));
      out.push(textAt(p.x, p.y, label, ts, angle, halo));
      return;
    }
    // width over height as a fraction (DIN), the sill height under it
    const top = at(f.halfThick + mm(3)), bottom = at(f.halfThick + mm(6.2)), mid = at(f.halfThick + mm(4.6));
    const w = mm(3.2);
    out.push(`<g class="opening-fraction">${textAt(top.x, top.y, label.over, ts, angle, halo)}` +
      `<line x1="${rnd(mid.x - f.ux * w)}" y1="${rnd(mid.y - f.uz * w)}" x2="${rnd(mid.x + f.ux * w)}" y2="${rnd(mid.y + f.uz * w)}" stroke="${LABEL_INK}" stroke-width="${mm(0.13)}"/>` +
      textAt(bottom.x, bottom.y, label.under, ts, angle, halo) +
      (label.sill ? textAt(at(f.halfThick + mm(9.4)).x, at(f.halfThick + mm(9.4)).y, label.sill, ts, angle, halo) : "") + `</g>`);
  });
  return out.join("");
}

/* Room labels to the standard: NAME, then the area (or the US room number,
   framed), then the level where the standard marks it per room. */
export function standardRoomLabelsSVG(rooms, std, ctx) {
  const { X, Y, mm } = ctx;
  const out = [], big = mm(3.2), small = mm(2.4);
  const halo = `stroke="#fff" stroke-width="${mm(0.9)}" paint-order="stroke" stroke-linejoin="round"`;
  const base = (Number(ctx.floorNumber) || 1) * 100;
  (rooms || []).forEach((room, i) => {
    const name = String(room.name || "").trim();
    const hasArea = room.area > 0;
    if (!name && !hasArea) return;
    const cx = X(room.cx), cz = Y(room.cz);
    if (name) out.push(`<text x="${cx}" y="${rnd(cz - small * 0.4)}" font-family="${LABEL_FACE}" font-size="${big}" font-weight="700" text-anchor="middle" fill="${LABEL_INK}" ${halo}>${xesc(name.toLocaleUpperCase())}</text>`);
    const y2 = rnd(cz + big * 0.9);
    if (std.room === "number") {
      const num = String(base + i + 1), bw = mm(8), bh = mm(3.6);
      out.push(`<rect x="${rnd(cx - bw / 2)}" y="${rnd(y2 - bh * 0.8)}" width="${bw}" height="${bh}" fill="#fff" stroke="${LABEL_INK}" stroke-width="${mm(0.18)}"/>`);
      out.push(`<text x="${cx}" y="${y2}" font-family="${LABEL_FACE}" font-size="${small}" text-anchor="middle" fill="${LABEL_INK}">${num}</text>`);
    } else if (hasArea) {
      out.push(`<text x="${cx}" y="${y2}" font-family="${LABEL_FACE}" font-size="${small}" text-anchor="middle" fill="${LABEL_INK}" ${halo}>${xesc(formatArea(std, room.area, ctx.lang))}</text>`);
    }
    if (std.levelPlace === "room")
      out.push(levelMarkSVG(cx, rnd(y2 + small * 1.6), formatLevel(std, ctx.level, ctx.lang), mm));
  });
  return out.join("");
}

/* A level mark: the value beside a small open triangle standing on a line. */
export function levelMarkSVG(x, y, text, mm) {
  const s = mm(1.4), ts = mm(2.1);
  const tx = rnd(x - mm(5)), base = rnd(y + s * 0.2);
  return `<g class="level-mark"><path d="M${rnd(tx - s)} ${rnd(base - s)} L${rnd(tx + s)} ${rnd(base - s)} L${tx} ${base}Z" fill="none" stroke="${LABEL_INK}" stroke-width="${mm(0.18)}"/>` +
    `<line x1="${rnd(tx - s * 1.6)}" y1="${base}" x2="${rnd(tx + s * 1.6)}" y2="${base}" stroke="${LABEL_INK}" stroke-width="${mm(0.18)}"/>` +
    `<text x="${rnd(tx + s * 1.9)}" y="${base}" font-family="${LABEL_FACE}" font-size="${ts}" fill="${LABEL_INK}" stroke="#fff" stroke-width="${mm(0.7)}" paint-order="stroke">${xesc(text)}</text></g>`;
}
