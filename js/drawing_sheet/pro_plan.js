/* The regional working drawing: what js/drawing_sheet.js constructionSheetSVG
   draws when it is given a drafting standard. The universal sheet (no
   standard) is untouched; this is the architect's plan:

   - walls cut and hatched per layer material (js/drawing_sheet/hatches.js),
     exterior outline heavier than the partitions
   - openings with jambs on the cut pen; windows as both faces and a double
     glazing line; doors with their swings
   - built-in fixtures only (kitchen, sanitary, wardrobes, stairs) on the
     medium/fine pens, loose furniture only when `opts.furniture` is on
   - three exterior dimension tiers and interior room / opening dimensions
     (js/drawing_sheet/dims.js)
   - room and opening labels placed clear of everything
     (js/drawing_sheet/labels.js + placement.js)
   - invisible hit areas carrying data-sel="room:<key>" / "opening:<id>" so
     the Drawing view can select the picked element in the planner.

   Same contract as the universal sheet: model cm from the bounds' top-left,
   +z down the page, paper sizes via `mm()`. */
import { symbolPrims, localToWorld } from "../plan_symbols.js";
import { dimensionFormatter, formatLevel } from "../drafting_standards.js";
import { PENS, PEN_INK, PEN_FACE, textSizes } from "./pens.js";
import { wallsSVG } from "./hatches.js";
import { exteriorDimGeometry, interiorDimGeometry, dimsSVG, dimTextWidth } from "./dims.js";
import { buildLabels, labelsSVG } from "./labels.js";
import { placeLabels } from "./placement.js";

const p2 = (n) => Math.round(n * 100) / 100;
const planEsc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/* Built in, so drawn on a working plan: fitted kitchen, sanitary ware,
   wardrobes and fitted storage, laundry machines, stairs, fireplaces. */
export const FIXTURE_TYPES = new Set([
  "base", "tall", "upper", "island", "pantry", "cabsys", "sink", "pedestalSink", "toilet", "bidet", "bathtub", "shower", "vanity",
  "fridge", "oven", "cooktop", "dishwasher", "wineFridge", "washer", "dryer", "wardrobe", "stairs", "fireplace", "waterHeater", "shoeCab",
]);
export function isFixture(item) { return !!item && (item.fixture === true || FIXTURE_TYPES.has(item.type)); }

function arcPts(p, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = p.a0 + (p.a1 - p.a0) * (i / n);
    out.push({ x: p.x + Math.cos(a) * p.r, z: p.z + Math.sin(a) * p.r });
  }
  return out;
}

/* Fixture and furniture symbols; returns {svg, outlines} (outlines in plane
   coordinates, obstacles for the labels). */
function itemsSVG(items, ctx) {
  const { X, Y, mm, pts } = ctx;
  const out = [], outlines = [];
  (items || []).forEach((it) => {
    const fixture = isFixture(it);
    const heavyW = mm(fixture ? PENS.medium : PENS.fine), lightW = mm(fixture ? PENS.fine : PENS.fine * 0.8);
    const W2 = (lx, lz) => localToWorld(it, lx, lz);
    const corners = [W2(-it.w / 2, -it.d / 2), W2(it.w / 2, -it.d / 2), W2(it.w / 2, it.d / 2), W2(-it.w / 2, it.d / 2)];
    outlines.push({ poly: corners.map((c) => ({ x: X(c.x), y: Y(c.z) })) });
    symbolPrims(it.type, it.w, it.d, it).forEach((p) => {
      const sw = `stroke-width="${p.weight === "heavy" ? heavyW : lightW}"`, dash = p.dash ? ` stroke-dasharray="${mm(1.5)} ${mm(1)}"` : "";
      if (p.k === "rect") out.push(`<polygon points="${pts([W2(p.x, p.z), W2(p.x + p.w, p.z), W2(p.x + p.w, p.z + p.d), W2(p.x, p.z + p.d)])}" ${sw}${dash}/>`);
      else if (p.k === "line") { const a = W2(p.x1, p.z1), c = W2(p.x2, p.z2); out.push(`<line x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(c.x)}" y2="${Y(c.z)}" ${sw}${dash}/>`); }
      else if (p.k === "circle") { const c = W2(p.x, p.z); out.push(`<circle cx="${X(c.x)}" cy="${Y(c.z)}" r="${p2(p.r)}" ${sw}${dash}/>`); }
      else if (p.k === "arc") out.push(`<polyline points="${pts(arcPts(p, 16).map((q) => W2(q.x, q.z)))}" ${sw}${dash}/>`);
      else if (p.k === "poly") out.push(`<${p.closed === false ? "polyline" : "polygon"} points="${pts(p.pts.map((q) => W2(q.x, q.z)))}" ${sw}${dash}/>`);
      else if (p.k === "text") {
        const c = W2(p.x, p.z), s = p.upLabel ? ctx.t("plan_stairs_up") : p.s;
        out.push(`<text x="${X(c.x)}" y="${Y(c.z)}" font-family="${PEN_FACE}" font-size="${mm(ctx.sizes.small)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${PEN_INK}" stroke="none">${planEsc(s)}</text>`);
      }
    });
  });
  return { svg: `<g id="fixtures" fill="none" stroke="${PEN_INK}">${out.join("")}</g>`, outlines };
}

/* Openings: jambs on the cut pen, window faces and glazing, door swings. */
function openingsSVG(snap, ctx) {
  const { X, Y, mm } = ctx, out = [];
  const L = (a, b, w) => `<line x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(b.x)}" y2="${Y(b.z)}" stroke-width="${w}"/>`;
  const mid = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  (snap.openings || []).forEach((op) => {
    const poly = op.poly, n = poly ? poly.length : 0;
    if (n < 4) return;
    const half = n / 2, a = poly[0], b = poly[half - 1], c = poly[half], d = poly[n - 1];
    out.push(L(a, d, mm(PENS.cutInner)), L(b, c, mm(PENS.cutInner)));
    if (op.type === "window") {
      for (let i = 0; i + 1 < half; i++) out.push(L(poly[i], poly[i + 1], mm(PENS.medium)), L(poly[n - 1 - i], poly[n - 2 - i], mm(PENS.medium)));
      // the frame: two glazing lines close either side of the middle
      [0.44, 0.56].forEach((t) => out.push(L(mid(a, d, t), mid(b, c, t), mm(PENS.fine))));
    }
  });
  (snap.swings || []).forEach((poly) => {
    if (poly && poly.length > 2) out.push(`<path d="M${poly.map((p) => X(p.x) + " " + Y(p.z)).join(" L")}Z" stroke-width="${mm(PENS.fine)}"/>`);
  });
  return `<g id="openings" fill="none" stroke="${PEN_INK}">${out.join("")}</g>`;
}

const segPoly = (l, X, Y) => ({ poly: [{ x: X(l.a.x), y: Y(l.a.z) }, { x: X(l.b.x), y: Y(l.b.z) }] });

/* {svg, kinds, tags} — `kinds` the wall hatch kinds drawn, `tags` whether
   opening tags were used (the legend shows what the sheet uses). */
export function proPlanParts(snap, opts) {
  const o = opts || {};
  const k = o.cmPerMm || 5, std = o.standard, b = o.bounds;
  if (!b || !std) return { svg: "", kinds: new Set(), tags: false };
  const fmt = o.fmt || dimensionFormatter(std);
  const sizes = textSizes(o.denom || k * 10);
  const t = o.t || ((key) => key);
  const X = (x) => p2(x - b.minx), Y = (z) => p2(z - b.minz), mm = (v) => p2(v * k);
  const pts = (poly) => poly.map((p) => X(p.x) + "," + Y(p.z)).join(" ");
  const ctx = { X, Y, mm, pts, sizes, t, lang: o.lang, level: snap.level || 0, floorNumber: snap.floorNumber,
    centre: { x: (b.plan.minx + b.plan.maxx) / 2, z: (b.plan.minz + b.plan.maxz) / 2 } };
  const out = [];
  const W = p2(b.maxx - b.minx), D = p2(b.maxz - b.minz);

  // walls: per-layer bands where the snapshot has them, else the plain polygons
  const walls = snap.walls && snap.walls.length ? snap.walls
    : (snap.wallPolys || []).map((poly) => ({ outline: poly, exterior: true, bands: [{ poly, material: "generic-masonry", structural: true }] }));
  const wl = wallsSVG(walls, std, ctx);
  const holes = (snap.openings || []).map((op) => `<polygon points="${pts(op.poly)}" fill="black"/>`).join("");
  out.push(`<defs>${wl.defs}<mask id="pro-openings" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${D}"><rect x="0" y="0" width="${W}" height="${D}" fill="white"/>${holes}</mask></defs>`);
  // hit areas for picking a room (under everything, invisible on paper)
  out.push(`<g class="hit-rooms" fill="#fff" fill-opacity="0" stroke="none">` + (snap.rooms || []).map((r) =>
    r.points && r.points.length > 2 && r.key != null ? `<polygon data-sel="room:${planEsc(r.key)}" points="${pts(r.points)}"/>` : "").join("") + `</g>`);
  out.push(`<g id="walls" mask="url(#pro-openings)">${wl.svg}</g>`);
  out.push(openingsSVG(snap, ctx));
  const shown = (snap.items || []).filter((it) => o.furniture || isFixture(it));
  const items = itemsSVG(shown, ctx);
  out.push(items.svg);

  // dimensions
  const ext = exteriorDimGeometry(snap.wallPolys, snap.openings, {
    off: [mm(7), mm(13), mm(19)], gap: mm(1.5), stub: mm(5), over: mm(1.2), textOff: mm(1.7), textH: mm(sizes.dim), textW: dimTextWidth(fmt, sizes.dim, k),
  });
  // room strings keep their figures off fixtures (model-cm boxes of the items)
  const fixtureBoxes = items.outlines.map((ob) => {
    const xs = ob.poly.map((p) => p.x + b.minx), zs = ob.poly.map((p) => p.y + b.minz);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  });
  const blocked = (x0, z0, x1, z1) => fixtureBoxes.some((f) => x0 < f.x1 && f.x0 < x1 && z0 < f.z1 && f.z0 < z1);
  const inner = interiorDimGeometry(snap.rooms, snap.openings, { inset: mm(11), openInset: mm(3.5), over: mm(0.8), textOff: mm(1.7), minRoom: 120,
    minLocate: 20, minLocateRoom: 150, blocked, textH: mm(sizes.dim), textW: dimTextWidth(fmt, sizes.dim, k) });
  const dctx = { X, Y, mm, fmt, ts: mm(sizes.dim), terminator: std.terminator === "dot" ? "dot" : "tick" };
  out.push(`<g id="dimensions">${dimsSVG(ext, dctx)}${dimsSVG(inner, dctx)}</g>`);

  // labels, clear of walls, swings, fixtures and the interior dimensions
  const obstacles = [];
  walls.forEach((w) => (w.bands || []).forEach((bd) => bd.poly && obstacles.push({ poly: bd.poly.map((p) => ({ x: X(p.x), y: Y(p.z) })) })));
  (snap.swings || []).forEach((poly) => poly && poly.length > 2 && obstacles.push({ poly: poly.map((p) => ({ x: X(p.x), y: Y(p.z) })) }));
  items.outlines.forEach((ob) => obstacles.push(ob));
  // the exterior strings too: a label sent outside its room must not land on them
  inner.lines.concat(ext.lines).forEach((l) => obstacles.push(segPoly(l, X, Y)));
  ext.texts.forEach((tx) => { const h = mm(sizes.dim) * 0.6, w = dimTextWidth(fmt, sizes.dim, k)(tx.len) / 2; const v = tx.along === "z"; obstacles.push({ x0: X(tx.x) - (v ? h : w), x1: X(tx.x) + (v ? h : w), y0: Y(tx.z) - (v ? w : h), y1: Y(tx.z) + (v ? w : h) }); });
  inner.texts.forEach((tx) => { const h = mm(sizes.dim) * 0.6, w = dimTextWidth(fmt, sizes.dim, k)(tx.len) / 2; const v = tx.along === "z"; obstacles.push({ x0: X(tx.x) - (v ? h : w), x1: X(tx.x) + (v ? h : w), y0: Y(tx.z) - (v ? w : h), y1: Y(tx.z) + (v ? w : h) }); });
  const labels = buildLabels(snap, std, ctx);
  // leaders never cross a dimension line, inside or out
  const segments = ext.lines.concat(inner.lines).map((l) => ({ a: { x: X(l.a.x), y: Y(l.a.z) }, b: { x: X(l.b.x), y: Y(l.b.z) } }));
  const placed = placeLabels(labels, obstacles, { gap: mm(0.6), segments });
  out.push(`<g id="labels">${labelsSVG(labels, placed, ctx)}</g>`);

  // the floor level once on the sheet (US), else per room in the labels
  if (std.levelPlace === "sheet")
    out.push(`<text id="level" x="${X(b.plan.maxx)}" y="${p2(Y(b.plan.maxz) + mm(26))}" font-family="${PEN_FACE}" font-size="${mm(sizes.note)}" text-anchor="end" fill="${PEN_INK}">${planEsc(formatLevel(std, snap.level || 0, o.lang))}</text>`);
  if (snap.area && snap.area.text)
    out.push(`<text id="living-area" x="${X(b.plan.minx)}" y="${p2(Y(b.plan.maxz) + mm(26))}" font-family="${PEN_FACE}" font-size="${mm(sizes.note)}" font-weight="600" fill="${PEN_INK}">${planEsc(snap.area.text)}</text>`);

  // picking an opening: its rectangle on top, invisible on paper
  out.push(`<g class="hit-openings" fill="#fff" fill-opacity="0" stroke="none">` + (snap.openings || []).map((op) =>
    op.id != null && op.poly ? `<polygon data-sel="opening:${planEsc(op.id)}" points="${pts(op.poly)}"/>` : "").join("") + `</g>`);
  return { svg: out.join(""), kinds: wl.kinds, tags: std.openings === "tags", placed, labels };
}
