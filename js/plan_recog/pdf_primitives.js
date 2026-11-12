// Read a PDF page's vector content as plain geometry for floor-plan
// recognition: every painted path (with its transform, stroke/fill colour,
// line width, dash and fill rule resolved, and clipped to what is visible) and
// every text run, in sheet coordinates — PDF points, origin top-left, y down,
// the same frame the page renders in at scale 1.
//
// Only pdf.js's public operator list / text content are used, so this works on
// the vendored build in the browser and, through tools/pdfjs_node.mjs, in the
// Node bench. Everything below primitivesFromOperatorList is pure.

// pdf.js ≥ 5 packs each path as [paintOp, [Float32Array drawOps], minMax];
// these are its DrawOPS codes inside that array.
const DRAW_MOVE = 0, DRAW_LINE = 1, DRAW_CURVE = 2, DRAW_QUAD = 3, DRAW_CLOSE = 4;
const CURVE_STEPS = 8;

const IDENTITY = [1, 0, 0, 1, 0, 0];

// m1 applied after m2 (PDF `cm`: the new matrix acts in the current space)
function multiply(m2, m1) {
  return [
    m2[0] * m1[0] + m2[1] * m1[2], m2[0] * m1[1] + m2[1] * m1[3],
    m2[2] * m1[0] + m2[3] * m1[2], m2[2] * m1[1] + m2[3] * m1[3],
    m2[4] * m1[0] + m2[5] * m1[2] + m1[4], m2[4] * m1[1] + m2[5] * m1[3] + m1[5],
  ];
}

const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

function parseColor(args) {
  if (!args || !args.length) return null;
  const v = args[0];
  if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v))
    return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  if (args.length >= 3 && args.slice(0, 3).every((c) => typeof c === "number"))
    return args.slice(0, 3).map((c) => Math.round(c <= 1 ? c * 255 : c));
  return null;
}

function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

// Decode one pdf.js path array into subpaths of device points. Curves are
// flattened, and every segment remembers whether it came from a curve
// (`curvedSeg[i]` describes points[i-1] → points[i]), so a wall polygon with
// one rounded corner keeps its straight edges and a door swing is still
// recognisable as an arc.
function decodePath(data, m) {
  const subpaths = [];
  let cur = null, last = null, start = null;
  const begin = (p) => {
    cur = { points: [p], curvedSeg: [false], closed: false, curved: false };
    subpaths.push(cur);
    start = p;
  };
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === DRAW_MOVE) {
      last = apply(m, data[i], data[i + 1]);
      i += 2;
      begin(last);
    } else if (op === DRAW_LINE) {
      const p = apply(m, data[i], data[i + 1]);
      i += 2;
      if (!cur) begin(last || p);
      cur.points.push(p);
      cur.curvedSeg.push(false);
      last = p;
    } else if (op === DRAW_CURVE || op === DRAW_QUAD) {
      let c1, c2, p;
      const from = last || apply(m, data[i], data[i + 1]);
      if (op === DRAW_CURVE) {
        c1 = apply(m, data[i], data[i + 1]);
        c2 = apply(m, data[i + 2], data[i + 3]);
        p = apply(m, data[i + 4], data[i + 5]);
        i += 6;
      } else {
        const q = apply(m, data[i], data[i + 1]);
        p = apply(m, data[i + 2], data[i + 3]);
        i += 4;
        c1 = { x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) };
        c2 = { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) };
      }
      if (!cur) begin(from);
      for (let k = 1; k <= CURVE_STEPS; k++) {
        cur.points.push(bezier(from, c1, c2, p, k / CURVE_STEPS));
        cur.curvedSeg.push(true);
      }
      cur.curved = true;
      last = p;
    } else if (op === DRAW_CLOSE) {
      if (cur) {
        cur.closed = true;
        last = start;
      }
      cur = null;
    } else {
      break; // unknown opcode: stop rather than misread the rest
    }
  }
  return subpaths.filter((s) => s.points.length >= 2);
}

// pdf.js < 5 shape: constructPath args are [ops[], args[], minMax] with the
// classic OPS codes, and the paint operator follows as its own entry.
function decodeLegacyPath(ops, args, OPS, m) {
  const data = [];
  let k = 0;
  // current point and subpath start, in the path's own space, for the `v`
  // form whose first control point is the current point
  let px = 0, py = 0, sx = 0, sy = 0;
  for (const op of ops) {
    if (op === OPS.moveTo) {
      px = sx = args[k++];
      py = sy = args[k++];
      data.push(DRAW_MOVE, px, py);
    } else if (op === OPS.lineTo) {
      px = args[k++];
      py = args[k++];
      data.push(DRAW_LINE, px, py);
    } else if (op === OPS.curveTo) {
      const a = args.slice(k, k + 6);
      k += 6;
      data.push(DRAW_CURVE, ...a);
      px = a[4];
      py = a[5];
    } else if (op === OPS.curveTo2) {
      // v: first control point is the current point
      const a = args.slice(k, k + 4);
      k += 4;
      data.push(DRAW_CURVE, px, py, a[0], a[1], a[2], a[3]);
      px = a[2];
      py = a[3];
    } else if (op === OPS.curveTo3) {
      // y: second control point is the end point
      const a = args.slice(k, k + 4);
      k += 4;
      data.push(DRAW_CURVE, a[0], a[1], a[2], a[3], a[2], a[3]);
      px = a[2];
      py = a[3];
    } else if (op === OPS.rectangle) {
      const x = args[k++], y = args[k++], w = args[k++], h = args[k++];
      data.push(DRAW_MOVE, x, y, DRAW_LINE, x + w, y, DRAW_LINE, x + w, y + h, DRAW_LINE, x, y + h, DRAW_CLOSE);
      px = sx = x;
      py = sy = y;
    } else if (op === OPS.closePath) {
      data.push(DRAW_CLOSE);
      px = sx;
      py = sy;
    }
  }
  return decodePath(data, m);
}

// ------------------------------------------------------------ clipping
//
// A clip region is a convex polygon in sheet space: the clip path itself when
// it is one convex shape (viewport rectangles, rotated or triangular crops),
// otherwise its convex hull — conservative, never hiding what is visible.
// An empty clip path makes an empty region: nothing after it is visible.

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function convexHull(points) {
  const pts = points.slice().sort((p, q) => p.x - q.x || p.y - q.y);
  if (pts.length < 3) return pts;
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper); // counter-clockwise in a y-up sense; sign handled below
}

function regionOf(subpaths) {
  const pts = subpaths.flatMap((s) => s.points);
  const hull = convexHull(pts);
  return hull.length >= 3 ? hull : [];
}

// inside test for a convex polygon of either orientation
function orientation(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  return area >= 0 ? 1 : -1;
}

// Sutherland–Hodgman: polygon "subject" clipped by convex polygon "clip".
function clipPolygon(subject, clip) {
  const sign = orientation(clip);
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const e0 = clip[i], e1 = clip[(i + 1) % clip.length];
    const inside = (p) => sign * cross(e0, e1, p) >= -1e-9;
    const meet = (p, q) => {
      const dp = sign * cross(e0, e1, p), dq = sign * cross(e0, e1, q), t = dp / (dp - dq);
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    };
    const next = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[(j + out.length - 1) % out.length], q = out[j];
      if (inside(q)) {
        if (!inside(p)) next.push(meet(p, q));
        next.push(q);
      } else if (inside(p)) next.push(meet(p, q));
    }
    out = next;
  }
  return out;
}

function intersectRegion(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.length < 3 || b.length < 3) return [];
  const out = clipPolygon(a, b);
  return out.length >= 3 ? out : [];
}

const insideRegion = (p, poly, sign) => poly.every((e0, i) => sign * cross(e0, poly[(i + 1) % poly.length], p) >= -1e-9);

// Cyrus–Beck: the visible part of a→b inside the convex polygon, as [t0, t1].
function clipSegment(a, b, poly, sign) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < poly.length; i++) {
    const e0 = poly[i], e1 = poly[(i + 1) % poly.length];
    const fa = sign * cross(e0, e1, a), fb = sign * cross(e0, e1, b);
    if (fa < 0 && fb < 0) return null;
    if (fa >= 0 && fb >= 0) continue;
    const t = fa / (fa - fb);
    if (fa < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

// Strokes: cut every polyline at the clip region (a subpath may split).
function clipStroke(subpaths, poly) {
  const sign = orientation(poly);
  const out = [];
  for (const sp of subpaths) {
    const pts = sp.closed ? sp.points.concat([sp.points[0]]) : sp.points;
    const kinds = sp.closed ? sp.curvedSeg.concat([false]) : sp.curvedSeg;
    if (pts.every((p) => insideRegion(p, poly, sign))) {
      out.push(sp);
      continue;
    }
    let cur = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const iv = clipSegment(a, b, poly, sign);
      if (!iv) {
        cur = null;
        continue;
      }
      const at = (t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const pa = at(iv[0]), pb = at(iv[1]);
      if (!cur || iv[0] > 0) {
        cur = { points: [pa], curvedSeg: [false], closed: false, curved: false };
        out.push(cur);
      }
      cur.points.push(pb);
      cur.curvedSeg.push(kinds[i]);
      cur.curved = cur.curved || kinds[i];
      if (iv[1] < 1) cur = null;
    }
  }
  return out.filter((sp) => sp.points.length >= 2);
}

// Fills: each ring clipped against the region (edges become straight).
function clipFill(subpaths, poly) {
  const sign = orientation(poly);
  const out = [];
  for (const sp of subpaths) {
    if (sp.points.every((p) => insideRegion(p, poly, sign))) {
      out.push(sp);
      continue;
    }
    const ring = clipPolygon(sp.points, poly);
    if (ring.length >= 3) out.push({ points: ring, curvedSeg: ring.map(() => false), closed: true, curved: false });
  }
  return out;
}

/**
 * Pure: pdf.js operator list → { paths, images }.
 * viewTransform maps PDF user space to sheet space (page.getViewport({scale:1})
 * .transform). Each path: { subpaths, stroke, fill, evenOdd, lineWidth,
 * dashed } with colours as [r,g,b] (or "pattern"), lineWidth in sheet units,
 * already clipped to the visible region (clip paths — each as its convex
 * hull — and form bounding boxes). `dashed` describes the stroke only.
 */
export function primitivesFromOperatorList(opList, OPS, viewTransform = IDENTITY) {
  const paths = [];
  let images = 0;
  let state = {
    ctm: IDENTITY.slice(), lineWidth: 1, stroke: [0, 0, 0], fill: [0, 0, 0], dashed: false,
    strokeAlpha: 1, fillAlpha: 1, clip: null,
  };
  const stack = [];
  let pending = null; // legacy: path waiting for its paint operator
  let clipNext = false; // a W / W* waiting for the path it clips to
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const evenOddOps = new Set([OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke]);
  const closeOps = new Set([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const device = () => multiply(state.ctm, viewTransform);
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const emit = (subpaths, paintOp, legacy) => {
    if (clipNext) {
      // the clip takes effect after this path is painted (PDF 8.5.4)
      state.clip = intersectRegion(state.clip, regionOf(subpaths));
      clipNext = false;
    }
    if (!subpaths.length) return;
    let stroke = strokeOps.has(paintOp) && state.strokeAlpha > 0;
    let fill = fillOps.has(paintOp) && state.fillAlpha > 0;
    if (!stroke && !fill) return; // endPath (clip only) or invisible paint
    // legacy lists keep `s` / `b` as the paint op: it closes the current
    // (last) subpath only; packed paths already carry their close command
    if (legacy && closeOps.has(paintOp)) subpaths[subpaths.length - 1].closed = true;
    const base = { evenOdd: evenOddOps.has(paintOp), lineWidth: Math.max(0, state.lineWidth) * scaleOf(device()) };
    const clip = state.clip;
    if (clip && clip.length < 3) return; // clipped away entirely
    if (stroke && fill && clip) {
      // paint and outline clip differently; emit them separately
      paths.push({ ...base, subpaths: clipFill(subpaths, clip), stroke: null, fill: state.fill, dashed: false });
      paths.push({ ...base, subpaths: clipStroke(subpaths, clip), stroke: state.stroke, fill: null, dashed: state.dashed });
      return;
    }
    const geometry = !clip ? subpaths : fill ? clipFill(subpaths, clip) : clipStroke(subpaths, clip);
    if (!geometry.length) return;
    paths.push({
      ...base,
      subpaths: geometry,
      stroke: stroke ? state.stroke : null,
      fill: fill ? state.fill : null,
      dashed: stroke && state.dashed,
    });
  };
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i];
    switch (fn) {
      case OPS.save:
        stack.push({ ...state });
        break;
      case OPS.restore:
        if (stack.length) state = stack.pop();
        break;
      case OPS.transform:
        state.ctm = multiply(args, state.ctm);
        break;
      case OPS.paintFormXObjectBegin: {
        stack.push({ ...state });
        if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) state.ctm = multiply(Array.from(args[0]), state.ctm);
        // a form paints nothing outside its /BBox
        const bbox = args[1];
        if (bbox && bbox.length === 4) {
          const m = device();
          const corners = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map(([x, y]) => apply(m, x, y));
          state.clip = intersectRegion(state.clip, regionOf([{ points: corners }]));
        }
        break;
      }
      case OPS.paintFormXObjectEnd:
        if (stack.length) state = stack.pop();
        break;
      case OPS.setLineWidth:
        state.lineWidth = args[0];
        break;
      case OPS.setDash:
        state.dashed = !!(args[0] && args[0].length && args[0].some((v) => v > 0));
        break;
      case OPS.setGState:
        // ExtGState entries arrive as [key, value] pairs
        for (const [key, value] of args[0] || []) {
          if (key === "LW" && Number.isFinite(value)) state.lineWidth = value;
          else if (key === "D" && Array.isArray(value)) state.dashed = !!(value[0] && value[0].length && value[0].some((v) => v > 0));
          else if (key === "CA" && Number.isFinite(value)) state.strokeAlpha = value;
          else if (key === "ca" && Number.isFinite(value)) state.fillAlpha = value;
        }
        break;
      case OPS.clip:
      case OPS.eoClip:
        clipNext = true;
        break;
      case OPS.setStrokeRGBColor:
      case OPS.setStrokeGray:
      case OPS.setStrokeCMYKColor:
      case OPS.setStrokeColor:
        state.stroke = parseColor(args) || state.stroke;
        break;
      case OPS.setFillRGBColor:
      case OPS.setFillGray:
      case OPS.setFillCMYKColor:
      case OPS.setFillColor:
        state.fill = parseColor(args) || state.fill;
        break;
      case OPS.setStrokeColorN:
        state.stroke = parseColor(args) || "pattern";
        break;
      case OPS.setFillColorN:
        state.fill = parseColor(args) || "pattern";
        break;
      case OPS.constructPath: {
        if (Array.isArray(args[0]) || ArrayBuffer.isView(args[0])) {
          pending = (pending || []).concat(decodeLegacyPath(Array.from(args[0]), Array.from(args[1]), OPS, device()));
        } else {
          const raw = args[1] && args[1][0];
          emit(raw ? decodePath(raw, device()) : [], args[0], false);
        }
        break;
      }
      case OPS.paintImageXObject:
      case OPS.paintInlineImageXObject:
      case OPS.paintImageMaskXObject:
      case OPS.paintImageXObjectRepeat:
        images++;
        break;
      default:
        if (pending && (strokeOps.has(fn) || fillOps.has(fn) || fn === OPS.endPath)) {
          emit(pending, fn, true);
          pending = null;
        }
    }
  }
  return { paths, images };
}

/**
 * Pure: pdf.js text content → [{ str, x, y, angle, size, width }], baseline
 * origin and run width in sheet units, angle in radians (sheet, y down:
 * negative = reading upward).
 */
export function textFromContent(content, viewTransform = IDENTITY) {
  const out = [];
  for (const item of content.items || []) {
    if (!item.str || !item.str.trim()) continue;
    const m = multiply(item.transform, viewTransform);
    const size = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
    const angle = Math.atan2(m[1], m[0]);
    out.push({ str: item.str, x: m[4], y: m[5], angle, size, width: item.width * (Math.hypot(m[0], m[1]) / (Math.hypot(item.transform[0], item.transform[1]) || 1)) });
  }
  return out;
}

/** Read one pdf.js page into { width, height, paths, texts, images }. */
export async function readPagePrimitives(page, OPS) {
  const viewport = page.getViewport({ scale: 1 });
  const [opList, content] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
  const { paths, images } = primitivesFromOperatorList(opList, OPS, viewport.transform);
  return { width: viewport.width, height: viewport.height, paths, texts: textFromContent(content, viewport.transform), images };
}
