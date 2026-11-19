/* Room and opening labels of the regional working drawing, laid out by the
   placer (js/drawing_sheet/placement.js) so none overlaps a wall, a swing, a
   fixture, a dimension or another label; one moved far from its opening gets
   a leader. Text sizes come from js/drawing_sheet/pens.js, in paper mm.

   buildLabels() makes the boxes (plane = sheet coordinates, model cm),
   labelsSVG() draws them where placeLabels() put them. */
import { formatArea, formatLevel, formatOpeningLabel, openingTags } from "../drafting_standards.js";
import { openingFrame } from "./annotations.js";
import { PENS, PEN_INK, PEN_FACE, textWidthMm, MIN_SIZES } from "./pens.js";

const l2 = (n) => Math.round(n * 100) / 100;
const lblEsc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const LINE = 1.3; // line pitch as a multiple of the lettering height

/* Label boxes. ctx {X, Y, mm, sizes, lang, level, floorNumber, centre}.
   Each label: {id, kind, x, y, w, h, within?, lines:[{s, size, bold, box?}],
   rot?, tag?, anchor:{x,y}, sel?}. */
export function buildLabels(snap, std, ctx) {
  const { X, Y, mm, sizes } = ctx;
  const labels = [];
  const base = (Number(ctx.floorNumber) || 1) * 100;
  (snap.rooms || []).forEach((room, i) => {
    const name = String(room.name || "").trim();
    if (!name && !(room.area > 0)) return;
    // a small room: the full label, then the minimum legible sizes, then
    // without the level mark; then outside the room with a leader
    const make = (sz, level) => {
      const lines = [];
      if (name) lines.push({ s: name.toLocaleUpperCase(), size: sz.room, bold: true });
      if (std.room === "number") lines.push({ s: String(base + i + 1), size: sz.area, box: true });
      else if (room.area > 0) lines.push({ s: formatArea(std, room.area, ctx.lang), size: sz.area });
      if (level && std.levelPlace === "room") lines.push({ s: formatLevel(std, ctx.level || 0, ctx.lang), size: sz.level, level: true });
      const wMm = Math.max(...lines.map((l) => textWidthMm(l.s, l.size, l.bold) + (l.box ? 3 : 0) + (l.level ? 5 : 0)));
      return { lines, w: mm(wMm + 1), h: mm(lines.reduce((s, l) => s + l.size * LINE, 0)) };
    };
    const small = { room: MIN_SIZES.room, area: MIN_SIZES.area, level: MIN_SIZES.level };
    const variants = [make(sizes, true), make(small, true), make(small, false)];
    const within = room.points && room.points.length > 2 ? room.points.map((p) => ({ x: X(p.x), y: Y(p.z) })) : null;
    labels.push({ id: "room-" + i, kind: "room", x: X(room.cx), y: Y(room.cz), w: variants[0].w, h: variants[0].h, lines: variants[0].lines, variants,
      within, outside: true, anchor: { x: X(room.cx), y: Y(room.cz) }, anchors: floorPoints(room, X, Y), priority: 2, maxShift: mm(30), sel: room.key != null ? "room:" + room.key : null });
  });
  const tags = std.openings === "tags" ? openingTags(snap.openings) : null;
  (snap.openings || []).forEach((op, i) => {
    if (!op.poly || op.poly.length < 4) return;
    const f = openingFrame(op.poly, ctx.centre);
    const vertical = Math.abs(f.uz) > Math.abs(f.ux);
    let lines, wMm, hMm, tag = null;
    if (tags) {
      tag = { s: tags[i], shape: op.type === "window" ? "hex" : "circle" };
      wMm = hMm = 5.4;
      lines = [];
    } else {
      const label = formatOpeningLabel(std, op, ctx.lang);
      if (!label) return;
      lines = typeof label === "string" ? [{ s: label, size: sizes.tag }]
        : [{ s: label.over, size: sizes.tag, rule: true }, { s: label.under, size: sizes.tag }].concat(label.sill ? [{ s: label.sill, size: sizes.tag }] : []);
      wMm = Math.max(...lines.map((l) => textWidthMm(l.s, l.size))) + 1;
      hMm = lines.reduce((s, l) => s + l.size * LINE, 0);
    }
    const w = mm(vertical && !tag ? hMm : wMm), h = mm(vertical && !tag ? wMm : hMm);
    const half = (op.width > 0 ? op.width : 0) / 2 || mm(2);
    const at = (t, d) => ({ x: X(f.cx + f.ux * t + f.nx * d), y: Y(f.cz + f.uz * t + f.nz * d) });
    /* The label slides along its wall before it steps away from it, and its
       leader (when it needs one) runs square to the wall onto the opening. */
    const candidates = (v) => {
      const along = Math.abs(f.ux) * v.w / 2 + Math.abs(f.uz) * v.h / 2, across = Math.abs(f.nx) * v.w / 2 + Math.abs(f.nz) * v.h / 2;
      const reach = half + along, step = mm(1.5), out = [];
      for (let k = 0; k < 6; k++) {
        const d = f.halfThick + across + mm(1.2) + k * mm(2);
        const ts = [0];
        for (let t = step; t <= reach; t += step) ts.push(t, -t);
        ts.forEach((t) => {
          const c = at(t, d), a = at(Math.max(-half * 0.9, Math.min(half * 0.9, t)), f.halfThick);
          out.push({ x: c.x, y: c.y, ax: a.x, ay: a.y });
        });
      }
      return out;
    };
    const start = at(0, f.halfThick + Math.abs(f.nx) * w / 2 + Math.abs(f.nz) * h / 2 + mm(1.2));
    labels.push({ id: "op-" + i, kind: "opening", x: start.x, y: start.y, w, h, lines, tag, rot: vertical && !tag ? -90 : 0, priority: 1, maxShift: mm(14), candidates,
      anchor: at(0, f.halfThick), sel: op.id != null ? "opening:" + op.id : null });
  });
  return labels;
}

/* Points spread over a room's floor (its clear rectangle, else its outline's
   box): where a leader to a room may end. */
function floorPoints(room, X, Y) {
  const c = room.clear || (room.points && room.points.length ? {
    x0: Math.min(...room.points.map((p) => p.x)), x1: Math.max(...room.points.map((p) => p.x)),
    z0: Math.min(...room.points.map((p) => p.z)), z1: Math.max(...room.points.map((p) => p.z)) } : null);
  if (!c) return null;
  const out = [];
  for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) out.push({ x: X(c.x0 + (c.x1 - c.x0) * i / 6), y: Y(c.z0 + (c.z1 - c.z0) * j / 6) });
  return out;
}

function textLine(x, y, l, rot) {
  const r = rot ? ` transform="rotate(${rot} ${l2(x)} ${l2(y)})"` : "";
  return `<text x="${l2(x)}" y="${l2(y)}" font-size="${l.sizeU}"${l.bold ? ' font-weight="700"' : ""} text-anchor="middle" dominant-baseline="middle"${r}>${lblEsc(l.s)}</text>`;
}

/* Draw the labels at their placed centres. `placed` from placeLabels(). */
export function labelsSVG(labels, placed, ctx) {
  const { mm } = ctx;
  const out = [], leaders = [], frames = [];
  labels.forEach((lab, i) => {
    const p = placed[i];
    if (!p) return;
    const sel = lab.sel ? ` data-sel="${lblEsc(lab.sel)}"` : "";
    if (lab.tag) {
      const r = mm(2.6);
      const shape = lab.tag.shape === "hex"
        ? `<polygon points="${[0, 1, 2, 3, 4, 5].map((k) => l2(p.x + r * Math.cos(Math.PI / 3 * k)) + "," + l2(p.y + r * Math.sin(Math.PI / 3 * k))).join(" ")}"/>`
        : `<circle cx="${l2(p.x)}" cy="${l2(p.y)}" r="${r}"/>`;
      frames.push(shape);
      out.push(`<g class="opening-tag"${sel}>` + textLine(p.x, p.y, { s: lab.tag.s, sizeU: mm(ctx.sizes.tag), bold: true }) + `</g>`);
    } else {
      const g = [];
      const lines = lab.variants ? lab.variants[p.variant || 0].lines : lab.lines;
      const sizes = lines.map((l) => mm(l.size));
      const total = sizes.reduce((s, v) => s + v * LINE, 0);
      // lines stack along the label's reading direction
      let off = -total / 2;
      lines.forEach((l, k) => {
        const h = sizes[k] * LINE, mid = off + h / 2;
        off += h;
        const x = lab.rot ? p.x + mid : p.x, y = lab.rot ? p.y : p.y + mid;
        g.push(textLine(x, y, { s: l.s, sizeU: sizes[k], bold: l.bold }, lab.rot));
        const tw = mm(textWidthMm(l.s, l.size));
        if (l.box) frames.push(`<rect x="${l2(x - tw / 2 - mm(1.2))}" y="${l2(y - sizes[k] * 0.75)}" width="${l2(tw + mm(2.4))}" height="${l2(sizes[k] * 1.5)}"/>`);
        if (l.rule) {
          const ry = off - (h - sizes[k]) / 4, a = { x: lab.rot ? p.x + ry : p.x - tw / 2, y: lab.rot ? p.y - tw / 2 : p.y + ry };
          const b = { x: lab.rot ? p.x + ry : p.x + tw / 2, y: lab.rot ? p.y + tw / 2 : p.y + ry };
          frames.push(`<line x1="${l2(a.x)}" y1="${l2(a.y)}" x2="${l2(b.x)}" y2="${l2(b.y)}"/>`);
        }
        if (l.level) {
          const s = mm(1.2), tx = x - mm(textWidthMm(l.s, l.size)) / 2 - mm(2.2);
          frames.push(`<path d="M${l2(tx - s)} ${l2(y - s * 0.6)} L${l2(tx + s)} ${l2(y - s * 0.6)} L${l2(tx)} ${l2(y + s * 0.6)}Z"/>`);
        }
      });
      out.push(`<g class="${lab.kind}-label"${sel}>${g.join("")}</g>`);
    }
    const to = p.anchor || lab.anchor;
    if (p.leader && to) {
      // from the nearest point of the label's box to the opening's face (or the room)
      const bx = Math.max(p.x - p.w / 2, Math.min(to.x, p.x + p.w / 2)), by = Math.max(p.y - p.h / 2, Math.min(to.y, p.y + p.h / 2));
      leaders.push(`<line x1="${l2(bx)}" y1="${l2(by)}" x2="${l2(to.x)}" y2="${l2(to.y)}"/><circle cx="${l2(to.x)}" cy="${l2(to.y)}" r="${mm(0.45)}" fill="${PEN_INK}"/>`);
    }
  });
  return `<g class="leaders" stroke="${PEN_INK}" stroke-width="${mm(PENS.fine)}" fill="none">${leaders.join("")}</g>` +
    `<g class="label-frames" stroke="${PEN_INK}" stroke-width="${mm(PENS.fine)}" fill="#fff">${frames.join("")}</g>` +
    `<g class="labels" font-family="${PEN_FACE}" fill="${PEN_INK}" stroke="#fff" stroke-width="${mm(0.7)}" paint-order="stroke" stroke-linejoin="round">${out.join("")}</g>`;
}
