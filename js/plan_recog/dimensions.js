// Drawing scale from the drawing's own dimension text. A dimension label sits
// on (or just beside) a dimension line, between the ticks / extension lines
// that bound the span it measures; the ratio label ÷ measured span is the
// scale. Each label is read in every unit it could plausibly be in (a bare
// "345" may be cm or mm, "3.45" m or cm), and the scale most labels agree on
// wins — wrong units and mislabelled spans scatter, the true scale clusters.
//
// Pure geometry on sheet units; segments are { a:{x,y}, b:{x,y} }.

const FT = 30.48, IN = 2.54;

/**
 * Candidate lengths in cm for a label, or [] when it is not a length.
 * Each candidate: { cm, unit, preferred } — `preferred` marks the reading a
 * drafter would mean by default (decimals → m, integers → cm).
 */
export function parseLength(str) {
  // drafting decoration around the number: "-283-" (Israeli sheets),
  // "◀3558 ▶" (Dutch), "(345)", "<3.45>"
  const s = String(str).trim().replace(/\s+/g, " ").replace(/[′’]/g, "'").replace(/[″”]/g, '"')
    .replace(/^[-–—(\[<◀►▶\s]+|[-–—)\]>▶◀◄\s]+$/g, "");
  if (!s || s.length > 14) return [];
  // area labels (m², sq ft, מ"ר) are not lengths
  if (/m²|m2\b|sq|מ"?ר|ft²/i.test(s)) return [];
  let m = s.match(/^(\d{1,3})\s*'\s*-?\s*(\d{1,2}(?:\.\d+)?)?\s*(?:"|'')?$/);
  if (m) return [{ cm: Number(m[1]) * FT + Number(m[2] || 0) * IN, unit: "ft", preferred: true }];
  m = s.match(/^(\d{1,3}(?:\.\d+)?)\s*"$/);
  if (m) return [{ cm: Number(m[1]) * IN, unit: "in", preferred: true }];
  m = s.match(/^(\d{1,5}(?:[.,]\d{1,3})?)\s*(mm|cm|m)?$/i);
  if (!m) return [];
  const value = Number(m[1].replace(",", "."));
  if (!(value > 0)) return [];
  const unit = m[2] && m[2].toLowerCase();
  if (unit === "mm") return [{ cm: value / 10, unit, preferred: true }];
  if (unit === "cm") return [{ cm: value, unit, preferred: true }];
  if (unit === "m") return [{ cm: value * 100, unit, preferred: true }];
  const decimal = /[.,]/.test(m[1]);
  const out = [];
  if (decimal) {
    out.push({ cm: value * 100, unit: "m", preferred: true });
    out.push({ cm: value, unit: "cm", preferred: false });
  } else {
    out.push({ cm: value, unit: "cm", preferred: true });
    out.push({ cm: value / 10, unit: "mm", preferred: false });
    if (value <= 30) out.push({ cm: value * 100, unit: "m", preferred: false });
  }
  // a room is 50 cm .. 50 m; anything else is a level, a code or a count
  return out.filter((c) => c.cm >= 20 && c.cm <= 5000);
}

function textCenter(t) {
  const c = Math.cos(t.angle), s = Math.sin(t.angle);
  // baseline origin → middle of the run, a third of the size above baseline
  return { x: t.x + c * t.width / 2 + s * t.size * 0.35, y: t.y + s * t.width / 2 - c * t.size * 0.35 };
}

function intersectParam(o, u, L, seg, tol) {
  // where `seg` crosses the line o + t·u (0 ≤ t ≤ L), or null
  const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
  const den = u.x * dy - u.y * dx;
  const segLen = Math.hypot(dx, dy);
  if (Math.abs(den) < 0.15 * segLen) return null; // (nearly) parallel
  const wx = seg.a.x - o.x, wy = seg.a.y - o.y;
  const t = (wx * dy - wy * dx) / den;
  const v = (wx * u.y - wy * u.x) / den; // along seg, 0..1
  const pad = tol / (segLen || 1);
  if (v < -pad || v > 1 + pad || t < -tol || t > L + tol) return null;
  return t;
}

/**
 * Measure every length label against the dimension line it sits on.
 * Returns [{ text, spanUnits, candidates, lines, bounds }] — the raw
 * evidence; `lines` are the dimension line's segments and `bounds` the
 * ticks / extension lines that delimit this label's span (`ticks`: those of
 * them in the dimension's own pen, not wall faces it measures to).
 */
export function measureDimensionLabels(texts, segments) {
  const out = [];
  for (const t of texts) {
    const candidates = parseLength(t.str);
    if (!candidates.length) continue;
    const c = textCenter(t);
    const d = { x: Math.cos(t.angle), y: Math.sin(t.angle) }, nrm = { x: -d.y, y: d.x };
    // the dimension line: parallel to the text, within ~1.6 text heights.
    // CAD often breaks it around the label, so collect the parallel pieces
    // and join those at one offset across the gap the text leaves.
    const near = [];
    for (const s of segments) {
      const sx = s.b.x - s.a.x, sy = s.b.y - s.a.y, L = Math.hypot(sx, sy);
      if (L < t.size * 0.5) continue;
      if (Math.abs((sx / L) * d.y - (sy / L) * d.x) > 0.03) continue;
      const off = (s.a.x - c.x) * nrm.x + (s.a.y - c.y) * nrm.y;
      if (Math.abs(off) > 1.6 * t.size) continue;
      const ta = (s.a.x - c.x) * d.x + (s.a.y - c.y) * d.y, tb = (s.b.x - c.x) * d.x + (s.b.y - c.y) * d.y;
      near.push({ s, off, t0: Math.min(ta, tb), t1: Math.max(ta, tb) });
    }
    near.sort((p, q) => Math.abs(p.off) - Math.abs(q.off));
    let line = null;
    for (const seed of near) {
      const pieces = near.filter((q) => Math.abs(q.off - seed.off) <= 0.5).sort((p, q) => p.t0 - q.t0);
      // merge pieces; a gap may only be bridged where the label sits in it
      let run = null;
      for (const q of pieces) {
        const bridge = run && q.t0 - run.t1 <= t.width + 2 * t.size && run.t1 <= t.width / 2 + t.size && q.t0 >= -t.width / 2 - t.size;
        if (run && (q.t0 <= run.t1 + 0.5 || bridge)) {
          run.t1 = Math.max(run.t1, q.t1);
          run.segs.push(q.s);
        } else {
          if (run && run.t0 <= 0 && run.t1 >= 0) break;
          run = { t0: q.t0, t1: q.t1, segs: [q.s] };
        }
      }
      if (run && run.t0 <= 0 && run.t1 >= 0 && run.t1 - run.t0 >= t.width) {
        line = { off: seed.off, t0: run.t0, t1: run.t1, segs: run.segs };
        break;
      }
    }
    if (!line) continue;
    const L = line.t1 - line.t0;
    const o = { x: c.x + nrm.x * line.off + d.x * line.t0, y: c.y + nrm.y * line.off + d.y * line.t0 };
    const along = -line.t0; // the label centre, measured from o
    const tol = Math.max(0.6, t.size * 0.08);
    const marks = [{ p: 0, s: null }, { p: L, s: null }];
    const own = new Set(line.segs);
    for (const s of segments) {
      if (own.has(s)) continue;
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      if (len < t.size * 0.4 || len > t.size * 12) continue; // ticks and extension lines are short
      const p = intersectParam(o, d, L, s, tol);
      if (p != null) marks.push({ p: Math.max(0, Math.min(L, p)), s });
    }
    marks.sort((p, q) => p.p - q.p);
    let lo = marks[0], hi = marks[marks.length - 1];
    for (const m of marks) {
      if (m.p < along - t.width * 0.3) lo = m;
      else if (m.p > along + t.width * 0.3) { hi = m; break; }
    }
    const span = hi.p - lo.p;
    // the label must fit its span and sit near its middle
    if (span < t.width * 0.8 || Math.abs((lo.p + hi.p) / 2 - along) > span * 0.3) continue;
    // the ticks / extension lines at either end of the span (a tick and the
    // line's own end usually coincide; the tick is what bounds it)
    const bounds = marks.filter((m) => m.s && (Math.abs(m.p - lo.p) <= tol || Math.abs(m.p - hi.p) <= tol)).map((m) => m.s);
    // an interior dimension often runs face to face, so a "bound" can be the
    // wall face itself. A tick or extension line ends at (or just past) the
    // dimension line; a face it measures to runs on well past it both ways.
    // And a mark in a heavier pen than the dimension is the wall, too
    const pen = Math.max(0, ...line.segs.map((q) => q.lineWidth || 0));
    const reach = (q) => {
      const e1 = (q.a.x - o.x) * nrm.x + (q.a.y - o.y) * nrm.y, e2 = (q.b.x - o.x) * nrm.x + (q.b.y - o.y) * nrm.y;
      return Math.min(Math.max(0, e1, e2), Math.max(0, -e1, -e2));
    };
    const ticks = bounds.filter((q) => !(pen > 0 && q.lineWidth > 1.25 * pen) && reach(q) <= t.size);
    out.push({ text: t.str, spanUnits: span, candidates, lines: line.segs, bounds, ticks });
  }
  return out;
}

/**
 * Best-supported drawing scale. Returns { cmPerUnit, support, total, unit,
 * confidence, annotation, alternatives } or null. `plausible(cmPerUnit)`
 * (optional) vetoes readings that make the drawing an impossible size.
 * `alternatives` are other readings with (nearly) as much support — bare
 * integers read as cm and as mm agree equally well, and only the geometry
 * can tell them apart. `annotation` is the dimension work behind the chosen
 * reading (lines and the ticks bounding each label): never wall faces.
 */
export function dimensionScale(texts, segments, plausible = () => true) {
  const evidence = measureDimensionLabels(texts, segments);
  const readings = [];
  evidence.forEach((e, i) => e.candidates.forEach((c) =>
    readings.push({ k: c.cm / e.spanUnits, i, unit: c.unit, preferred: c.preferred })));
  const clusters = [];
  for (const r of readings) {
    if (!plausible(r.k)) continue;
    const agree = readings.filter((q) => Math.abs(q.k / r.k - 1) <= 0.015);
    const labels = new Set(agree.map((q) => q.i));
    const preferred = agree.filter((q) => q.preferred).length;
    clusters.push({ score: labels.size + 0.01 * preferred, agree, labels });
  }
  if (!clusters.length) return null;
  clusters.sort((p, q) => q.score - p.score);
  const summarize = (cl) => {
    const ks = cl.agree.map((q) => q.k).sort((a, b) => a - b);
    const units = cl.agree.map((q) => q.unit);
    const unit = units.slice().sort((a, b) => units.filter((u) => u === b).length - units.filter((u) => u === a).length)[0];
    return {
      cmPerUnit: ks[Math.floor(ks.length / 2)],
      support: cl.labels.size,
      total: evidence.length,
      unit,
      confidence: Math.min(1, cl.labels.size / 3) * (cl.labels.size / evidence.length),
      annotation: [...cl.labels].flatMap((i) => [...evidence[i].lines, ...(evidence[i].ticks || evidence[i].bounds)]),
    };
  };
  const best = summarize(clusters[0]);
  best.alternatives = [];
  for (const cl of clusters.slice(1)) {
    if (cl.labels.size < Math.max(2, 0.75 * clusters[0].labels.size)) continue;
    const alt = summarize(cl);
    if ([best, ...best.alternatives].some((x) => Math.abs(x.cmPerUnit / alt.cmPerUnit - 1) < 0.05)) continue;
    best.alternatives.push(alt);
    if (best.alternatives.length >= 3) break;
  }
  return best;
}

// ------------------------------------------------------------ scale notes

const CM_PER_PT = 2.54 / 72;

/**
 * Drawing scales printed on the sheet — "1:50", "Scale 1:100 @ A1", "קנ"מ
 * 1:50", "schaal 1 : 50", and US architectural `1/4" = 1'-0"` — as cm per
 * sheet unit, assuming the PDF is at true paper size (1 unit = 1 pt).
 * Returns unique [{ ratio, cmPerUnit, text }].
 */
export function scaleNotes(texts) {
  const out = new Map();
  let t = null;
  // every place a ratio is printed (a sheet may caption several drawings)
  const add = (ratio, text) => {
    if (!(ratio >= 10 && ratio <= 2000)) return;
    if (!out.has(ratio)) out.set(ratio, { ratio, cmPerUnit: ratio * CM_PER_PT, text, at: [] });
    if (Number.isFinite(t.x) && Number.isFinite(t.y)) out.get(ratio).at.push({ x: t.x, y: t.y });
  };
  for (t of texts) {
    // typographic inch / foot marks (” ″ ’ ′) read as " and '
    const s = String(t.str).replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'");
    for (const m of s.matchAll(/(?:^|[^\d.,])1\s*[:/]\s*(\d{2,4})(?![\d.,])/g)) add(Number(m[1]), s);
    const us = /(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:"|''|in)?\s*=\s*1\s*(?:'|ft)/i.exec(s);
    if (us && Number(us[2]) > 0) add(Math.round((12 * Number(us[2])) / Number(us[1])), s);
    const usWhole = /(?:^|\D)(\d)\s*(?:"|in)\s*=\s*1\s*(?:'|ft)/i.exec(s);
    if (usWhole) add(12 / Number(usWhole[1]), s);
  }
  return [...out.values()];
}
