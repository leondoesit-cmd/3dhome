/* The construction floor plan: the one detailed drawing a builder is handed.
   Black poché walls with the openings cut out, window glazing lines, door
   leaves with their swings, fixture symbols (js/plan_symbols.js), rooms named
   with their size, chained exterior dimension strings on every side with an
   overall under them, the living-area line and a north arrow.

   Pure: a sheet snapshot in, an SVG fragment in model centimetres out, with
   its own origin at the top-left of `bounds` and +z DOWN the page, exactly as
   the editor draws the plan (the old export flipped it). Every size on paper —
   line weights, text, dimension offsets — is given in millimetres and turned
   into model units by `cmPerMm`, so the sheet reads the same at 1:50 or 1:100.
   js/sheet_print.js wraps the fragment in paper and a title block. */
import { planDimensionChains } from "./planner_drawing.js";
import { symbolPrims, localToWorld } from "./plan_symbols.js";

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const r2 = (n) => Math.round(n * 100) / 100;
const FACE = "Inter, Helvetica, Arial, sans-serif";
const INK = "#1b1d20";

// paper millimetres the layout needs round the plan for the dimension strings
export const SHEET_PAD_MM = { dim1: 8, dim2: 15, pad: 26, area: 22 };

/* Plan extent (walls only) and the drawing bounds that leave room for the
   dimension strings and the area line. */
export function sheetBounds(snap, cmPerMm) {
  const pts = (snap.wallPolys || []).flat();
  if (!pts.length) return null;
  const minx = Math.min(...pts.map((p) => p.x)), maxx = Math.max(...pts.map((p) => p.x));
  const minz = Math.min(...pts.map((p) => p.z)), maxz = Math.max(...pts.map((p) => p.z));
  const pad = SHEET_PAD_MM.pad * cmPerMm, below = (SHEET_PAD_MM.pad + SHEET_PAD_MM.area * 0.5) * cmPerMm;
  return {
    plan: { minx, maxx, minz, maxz },
    minx: minx - pad, maxx: maxx + pad, minz: minz - pad, maxz: maxz + below,
    w: maxx - minx + 2 * pad, d: maxz - minz + pad + below,
  };
}

/* The wall outline edges, as the segments the chain finder looks along. The
   OUTER faces are what a builder measures, so the faces go in, not the
   centrelines. */
export function outlineSegments(wallPolys) {
  const segs = [];
  (wallPolys || []).forEach((poly) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
    }
  });
  return segs;
}

export function constructionSheetSVG(snap, opts) {
  const o = opts || {};
  const k = o.cmPerMm || 5; // model cm per paper mm (1:50 → 5)
  const fmt = o.fmt || ((cm) => String(Math.round(cm)));
  const t = o.t || ((key) => key);
  const b = o.bounds || sheetBounds(snap, k);
  if (!b) return "";
  const X = (x) => r2(x - b.minx), Y = (z) => r2(z - b.minz);
  const mm = (v) => r2(v * k);
  const pts = (poly) => poly.map((p) => X(p.x) + "," + Y(p.z)).join(" ");
  const out = [];

  // ---- walls: poché, openings masked out ----
  const W = r2(b.maxx - b.minx), D = r2(b.maxz - b.minz);
  const holes = (snap.openings || []).map((op) => `<polygon points="${pts(op.poly)}" fill="black"/>`).join("");
  out.push(`<defs><mask id="sheet-openings" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${D}"><rect x="0" y="0" width="${W}" height="${D}" fill="white"/>${holes}</mask></defs>`);
  out.push(`<g id="walls" mask="url(#sheet-openings)" fill="${INK}" stroke="${INK}" stroke-width="${mm(0.25)}" stroke-linejoin="miter">` +
    (snap.wallPolys || []).map((p) => `<polygon points="${pts(p)}"/>`).join("") + `</g>`);

  // ---- openings: window glazing (the two faces + the glass), door swings ----
  const light = `fill="none" stroke="${INK}" stroke-width="${mm(0.18)}"`;
  const heavy = `fill="none" stroke="${INK}" stroke-width="${mm(0.35)}"`;
  const op = [];
  (snap.openings || []).forEach((w) => {
    if (w.type !== "window" || w.poly.length !== 4) return;
    const [a, bq, c, d] = w.poly;
    op.push(`<line x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(bq.x)}" y2="${Y(bq.z)}" ${light}/>`);
    op.push(`<line x1="${X(d.x)}" y1="${Y(d.z)}" x2="${X(c.x)}" y2="${Y(c.z)}" ${light}/>`);
    op.push(`<line x1="${X((a.x + d.x) / 2)}" y1="${Y((a.z + d.z) / 2)}" x2="${X((bq.x + c.x) / 2)}" y2="${Y((bq.z + c.z) / 2)}" ${light}/>`);
  });
  (snap.swings || []).forEach((poly) => {
    if (poly && poly.length > 2) op.push(`<path d="M${poly.map((p) => X(p.x) + " " + Y(p.z)).join(" L")}Z" ${light}/>`);
  });
  out.push(`<g id="openings">${op.join("")}</g>`);

  // ---- fixtures ----
  const fx = [];
  (snap.items || []).forEach((it) => {
    symbolPrims(it.type, it.w, it.d, it).forEach((p) => {
      const style = p.weight === "heavy" ? heavy : light;
      const dash = p.dash ? ` stroke-dasharray="${mm(1.5)} ${mm(1)}"` : "";
      const W2 = (lx, lz) => localToWorld(it, lx, lz);
      if (p.k === "rect") {
        const c = [W2(p.x, p.z), W2(p.x + p.w, p.z), W2(p.x + p.w, p.z + p.d), W2(p.x, p.z + p.d)];
        fx.push(`<polygon points="${pts(c)}" ${style}${dash}/>`);
      } else if (p.k === "line") {
        const a = W2(p.x1, p.z1), c = W2(p.x2, p.z2);
        fx.push(`<line x1="${X(a.x)}" y1="${Y(a.z)}" x2="${X(c.x)}" y2="${Y(c.z)}" ${style}${dash}/>`);
      } else if (p.k === "circle") {
        const c = W2(p.x, p.z);
        fx.push(`<circle cx="${X(c.x)}" cy="${Y(c.z)}" r="${r2(p.r)}" ${style}${dash}/>`);
      } else if (p.k === "poly") {
        fx.push(`<polygon points="${pts(p.pts.map((q) => W2(q.x, q.z)))}" ${style}${dash}/>`);
      } else if (p.k === "text") {
        const c = W2(p.x, p.z), s = p.upLabel ? t("plan_stairs_up") : p.s;
        fx.push(`<text x="${X(c.x)}" y="${Y(c.z)}" font-family="${FACE}" font-size="${r2(p.size)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${INK}">${esc(s)}</text>`);
      }
    });
  });
  out.push(`<g id="fixtures">${fx.join("")}</g>`);

  // ---- room names with their size ----
  const rl = [];
  (snap.rooms || []).forEach((room) => {
    const name = String(room.name || "").trim();
    if (!name && !(room.width > 0)) return;
    const cx = X(room.cx), cz = Y(room.cz), big = mm(3.2), small = mm(2.4);
    // a white halo keeps the name readable where it crosses a fixture
    const halo = `stroke="#fff" stroke-width="${mm(0.9)}" paint-order="stroke" stroke-linejoin="round"`;
    if (name) rl.push(`<text x="${cx}" y="${r2(cz - small * 0.4)}" font-family="${FACE}" font-size="${big}" font-weight="700" text-anchor="middle" fill="${INK}" ${halo}>${esc(name.toLocaleUpperCase())}</text>`);
    if (room.width > 0 && room.depth > 0)
      rl.push(`<text x="${cx}" y="${r2(cz + big * 0.9)}" font-family="${FACE}" font-size="${small}" text-anchor="middle" fill="${INK}" ${halo}>${esc(fmt(room.width) + " x " + fmt(room.depth))}</text>`);
  });
  out.push(`<g id="room-labels">${rl.join("")}</g>`);

  // ---- chained exterior dimensions ----
  out.push(`<g id="dimensions">${dimensionStrings(snap, b, k, fmt, X, Y, mm).join("")}</g>`);

  // ---- living area line, north arrow ----
  if (snap.area && snap.area.text) {
    out.push(`<text x="${X(b.plan.minx)}" y="${Y(b.plan.maxz) + mm(SHEET_PAD_MM.pad + 4)}" font-family="${FACE}" font-size="${mm(3.4)}" font-weight="600" fill="${INK}">${esc(snap.area.text)}</text>`);
  }
  const nx = X(b.plan.maxx) + mm(14), nz = Y(b.plan.minz) - mm(14), nr = mm(4);
  out.push(`<g id="north" fill="none" stroke="${INK}" stroke-width="${mm(0.25)}"><circle cx="${nx}" cy="${nz}" r="${nr}"/>` +
    `<path d="M${nx} ${r2(nz - nr)} L${r2(nx + nr * 0.45)} ${r2(nz + nr * 0.55)} L${nx} ${r2(nz + nr * 0.2)} L${r2(nx - nr * 0.45)} ${r2(nz + nr * 0.55)}Z" fill="${INK}"/>` +
    `<text x="${nx}" y="${r2(nz - nr - mm(1.2))}" font-family="${FACE}" font-size="${mm(3)}" font-weight="700" text-anchor="middle" fill="${INK}" stroke="none">N</text></g>`);
  return out.join("");
}

/* Two tiers per side: the chain between every exterior corner or step, and
   the overall under it. 45° architectural ticks, text centred over each span
   (rotated to read from the right on the vertical sides). */
/* Chained exterior dimensions as world-space geometry — the one description
   both backends draw (SVG here, DXF in drawing_export.js), so the two can
   never disagree about where a string or a tick is. Sizes are model cm:
   off1/off2 tier offsets from the outline, gap (witness line clear of the
   wall), over (overshoot past the dimension line), tick half-length. Each
   text is {x, z, len, dir, along}: centred over its span, `dir` the side's
   outward sign, `along` "x" for top/bottom strings and "z" for side ones. */
export function dimensionGeometry(wallPolys, sz) {
  const chains = planDimensionChains(outlineSegments(wallPolys));
  const lines = [], texts = [];
  chains.forEach((c) => {
    const horiz = c.along === "x";
    const P = (a, across) => (horiz ? { x: a, z: across } : { x: across, z: a });
    [
      { off: sz.off1, st: c.stations },
      { off: sz.off2, st: [c.stations[0], c.stations[c.stations.length - 1]] },
    ].forEach((tier) => {
      const across = c.edge + c.dir * tier.off;
      const first = tier.st[0].at, last = tier.st[tier.st.length - 1].at;
      lines.push({ a: P(first - sz.over, across), b: P(last + sz.over, across) });
      tier.st.forEach((st) => {
        lines.push({ a: P(st.at, st.from + c.dir * sz.gap), b: P(st.at, across + c.dir * sz.over) });
        // architectural 45° tick, drawn heavier than the line it sits on
        const m = P(st.at, across);
        lines.push({ a: { x: m.x - sz.tick, z: m.z + sz.tick }, b: { x: m.x + sz.tick, z: m.z - sz.tick }, heavy: true });
      });
      for (let i = 0; i + 1 < tier.st.length; i++) {
        const a = tier.st[i].at, z = tier.st[i + 1].at, len = Math.abs(z - a);
        if (len < 1) continue;
        const mid = P((a + z) / 2, across + c.dir * sz.textOff);
        texts.push({ x: mid.x, z: mid.z, len: len, dir: c.dir, along: c.along });
      }
    });
  });
  return { lines, texts };
}

function dimensionStrings(snap, b, k, fmt, X, Y, mm) {
  const g = dimensionGeometry(snap.wallPolys, {
    off1: mm(SHEET_PAD_MM.dim1), off2: mm(SHEET_PAD_MM.dim2), gap: mm(1.5), over: mm(1.5), tick: mm(1.2), textOff: mm(1.2),
  });
  const sw = mm(0.13), ts = mm(2.3), out = [];
  g.lines.forEach((l) => out.push(`<line x1="${X(l.a.x)}" y1="${Y(l.a.z)}" x2="${X(l.b.x)}" y2="${Y(l.b.z)}" stroke="${INK}" stroke-width="${l.heavy ? mm(0.35) : sw}"/>`));
  g.texts.forEach((t) => {
    const txt = esc(fmt(t.len)), push = t.dir < 0 ? 0 : ts * 0.8;
    if (t.along === "x")
      out.push(`<text x="${X(t.x)}" y="${r2(Y(t.z) + push)}" font-family="${FACE}" font-size="${ts}" text-anchor="middle" fill="${INK}">${txt}</text>`);
    else {
      const x = r2(X(t.x) + push), y = Y(t.z);
      out.push(`<text x="${x}" y="${y}" font-family="${FACE}" font-size="${ts}" text-anchor="middle" fill="${INK}" transform="rotate(-90 ${x} ${y})">${txt}</text>`);
    }
  });
  return out;
}
