/* Walls in section for the regional working drawing: each layer band of a
   wall (js/wall_types.js wallLayerBands) filled to its material the way the
   standard draws it, the cut outline heavy round the whole wall (heavier for
   an exterior wall), the layer joints fine.

   Patterns (ISO 128-50 general hatching at 45°; the national habits on top,
   unverified against the standards' own text):
     concrete   solid poché (IL, US, UK, ISO); DE cross-hatched (DIN 1356-1
                "Stahlbeton" is drawn hatched in two directions in practice)
     masonry    45° single hatch (block, brick, generic core)
     partition  a light grey fill: an interior non-structural wall (IL
                practice: thin partitions are toned, not hatched)
     insulation the soft zigzag of a batt, along the wall
     finish     plaster, render, boards, glass: left white, outlined fine
   Model centimetres in, sizes on paper via `mm()` as in the rest of the sheet. */
import { PEN_INK, PENS } from "./pens.js";

const hr2 = (n) => Math.round(n * 100) / 100;

/* What a layer band is, for drawing: one of the HATCH_KINDS keys. */
export function bandKind(band, wall) {
  const m = String((band && band.material) || "").toLowerCase(), role = String((band && band.role) || "");
  if (role === "glazing" || /glass/.test(m)) return "finish";
  if (role === "insulation" || /insulat|mineral-wool|wool|eps|xps|pir/.test(m)) return "insulation";
  if (/membrane|waterproof/.test(m)) return "membrane";
  if (role.indexOf("finish") === 0 || /plaster|render|gypsum|board|tile|paint|cladding/.test(m)) return "finish";
  if (/stud|cavity|air/.test(m)) return "finish";
  if (/concrete/.test(m) && !/block/.test(m)) return "concrete";
  const partition = wall && !wall.exterior && !(band && band.structural);
  return partition ? "partition" : "masonry";
}

export const HATCH_KINDS = ["concrete", "masonry", "partition", "insulation", "membrane", "finish"];

/* The fill a kind gets in a standard: "solid" | "diag" | "cross" | "grey" |
   "batt" | "none". */
export function hatchFor(kind, std) {
  const id = std && std.id;
  switch (kind) {
    case "concrete": return id === "de" ? "cross" : "solid";
    case "masonry": return "diag";
    case "partition": return id === "us" ? "none" : "grey";
    case "insulation": return "batt";
    case "membrane": return "solid";
    default: return "none";
  }
}

/* <pattern> definitions for the fills in `fills`, sized in paper mm. The batt
   pattern is made per wall angle (`angles`) so the zigzag runs along it. */
export function hatchDefsSVG(fills, mm, angles) {
  const out = [], sw = mm(PENS.fine), gap = mm(1.4);
  if (fills.has("diag")) out.push(`<pattern id="h-diag" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${gap}" stroke="${PEN_INK}" stroke-width="${sw}"/></pattern>`);
  if (fills.has("cross")) out.push(`<pattern id="h-cross" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(45)"><path d="M0 0V${gap}M0 0H${gap}" stroke="${PEN_INK}" stroke-width="${sw}" fill="none"/></pattern>`);
  // angle 0 too: the legend swatch uses it
  if (fills.has("batt")) [...new Set([0, ...(angles || [])])].forEach((a) => {
    const w = mm(2), h = mm(4);
    out.push(`<pattern id="h-batt-${a}" patternUnits="userSpaceOnUse" width="${w}" height="${h}" patternTransform="rotate(${a})"><path d="M0 0L${w / 2} ${h}L${w} 0" stroke="${PEN_INK}" stroke-width="${sw}" fill="none"/></pattern>`);
  });
  return out.join("");
}

function fillAttr(fill, angle) {
  if (fill === "solid") return `fill="${PEN_INK}"`;
  if (fill === "grey") return `fill="#c8c8c8"`;
  if (fill === "diag") return `fill="url(#h-diag)"`;
  if (fill === "cross") return `fill="url(#h-cross)"`;
  if (fill === "batt") return `fill="url(#h-batt-${angle})"`;
  return `fill="#fff"`;
}

// direction of a band polygon's long side, whole degrees mod 180
function bandAngle(poly) {
  let best = 0, ang = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l > best) { best = l; ang = Math.atan2(b.z - a.z, b.x - a.x) * 180 / Math.PI; }
  }
  return ((Math.round(ang / 5) * 5) % 180 + 180) % 180;
}

/* walls: [{outline, exterior, bands:[{poly, material, role, structural}]}].
   Returns {defs, svg, kinds} — `kinds` the set of band kinds drawn (the
   legend lists them). The caller wraps `svg` in the openings mask. */
export function wallsSVG(walls, std, ctx) {
  const { mm, pts } = ctx;
  const fills = new Set(), angles = new Set(), kinds = new Set();
  const body = [], joints = [], outlines = [];
  (walls || []).forEach((w) => {
    (w.bands || []).forEach((b) => {
      if (!b.poly || b.poly.length < 3) return;
      const kind = bandKind(b, w), fill = hatchFor(kind, std), angle = fill === "batt" ? bandAngle(b.poly) : 0;
      kinds.add(kind); fills.add(fill); if (fill === "batt") angles.add(angle);
      body.push(`<polygon points="${pts(b.poly)}" ${fillAttr(fill, angle)}/>`);
      if (w.bands.length > 1) joints.push(`<polygon points="${pts(b.poly)}"/>`);
    });
    const ring = w.outline && w.outline.length > 2 ? w.outline : (w.bands && w.bands.length === 1 ? w.bands[0].poly : null);
    if (ring) outlines.push(`<polygon points="${pts(ring)}" stroke-width="${mm(w.exterior ? PENS.cutOuter : PENS.cutInner)}"/>`);
  });
  const svg = `<g class="wall-fill" stroke="none">${body.join("")}</g>` +
    (joints.length ? `<g class="wall-joints" fill="none" stroke="${PEN_INK}" stroke-width="${mm(PENS.fine)}">${joints.join("")}</g>` : "") +
    `<g class="wall-cut" fill="none" stroke="${PEN_INK}" stroke-linejoin="miter">${outlines.join("")}</g>`;
  return { defs: hatchDefsSVG(fills, mm, angles), svg, kinds };
}

/* One legend swatch: a small rectangle in the kind's fill. */
export function hatchSwatchSVG(kind, std, x, y, w, h, mm) {
  const fill = hatchFor(kind, std);
  return `<rect x="${hr2(x)}" y="${hr2(y)}" width="${hr2(w)}" height="${hr2(h)}" ${fillAttr(fill, 0)} stroke="${PEN_INK}" stroke-width="${mm(PENS.medium)}"/>`;
}
