// Interactive sketch dimensions & annotations rendering and manipulation.

import { lineData, circleData, ellipseData, sketchPoint, sketchEntity } from "./sketch_solver.js";
import {documentLengthUnit,formatDocumentLength} from './core/document_length_units.js';

export function isDarkSketchCanvas(options = {}) {
  if (typeof options.isDark === "boolean") return options.isDark;
  if (typeof document !== "undefined") {
    const modeler = document.getElementById("modeler");
    if (modeler && modeler.classList.contains("md-is3d")) return true;
    const theme = document.documentElement?.getAttribute("data-theme") || document.body?.getAttribute("data-theme");
    if (theme === "dark" || theme === "mid" || theme === "chrome") return true;
    if (theme === "light" || theme === "classic" || theme === "soft") return false;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
  }
  return false;
}

export function getDimensionPalette(options = {}) {
  const dark = isDarkSketchCanvas(options);
  if (dark) {
    return {
      driving: "#7dd3fc",
      driven: "#cbd5e1",
      conflict: "#fca5a5",
      selected: "#fb923c",
      textBg: "rgba(15, 23, 42, 0.86)",
      glyphOk: "#34d399",
      glyphConflict: "#fca5a5",
    };
  }
  return {
    driving: "#1d4ed8",
    driven: "#475569",
    conflict: "#b91c1c",
    selected: "#c2410c",
    textBg: "rgba(255, 255, 255, 0.90)",
    glyphOk: "#047857",
    glyphConflict: "#b91c1c",
  };
}

const DRIVING = "#1d4ed8";
const DRIVEN = "#64748b";
const CONFLICT = "#dc2626";

const dimText = (value, unit = 'cm') => `${formatDocumentLength(value, unit, 10)} ${documentLengthUnit(unit)}`;

/* A smart dimension is just a driving constraint with a value the solver has to
   satisfy — the same object the constraint list shows, so editing a dimension
   and editing a constraint are one code path. */
export function addSmartDimension(sketch, target, value) {
  if (!sketch || !target) return null;
  if (!sketch.constraints) sketch.constraints = [];
  const id = "dim_" + Math.random().toString(36).slice(2, 9);

  if (target.type === "line") {
    sketch.constraints.push({ id, type: "distance", entity: target.id, value: Number(value), driven: false });
  } else if (target.type === "circle") {
    // A full circle is dimensioned by its diameter, as on an engineering
    // drawing; `value` is the measured radius, the same as for an arc.
    sketch.constraints.push({ id, type: "diameter", entity: target.id, value: Number(value) * 2, driven: false });
  } else if (target.type === "arc") {
    sketch.constraints.push({ id, type: "radius", entity: target.id, value: Number(value), driven: false });
  } else if (target.type === "ellipse") {
    // one semi-axis per dimension: `axis` is what tells the solver which
    sketch.constraints.push({ id, type: "radius", entity: target.id, axis: target.axis === "minor" ? "minor" : "major", value: Number(value), driven: false });
  } else if (target.type === "pointLine" && target.point && target.line) {
    sketch.constraints.push({ id, type: "pointLineDistance", point: target.point, a: target.line, value: Number(value), driven: false });
  } else if (target.type === "lines" && target.a && target.b) {
    // distance between two parallel lines, signed the way the solver's offset residual reads it
    sketch.constraints.push({ id, type: "offset", a: target.a, b: target.b, value: Number(value), driven: false });
  } else if (target.type === "points" && target.a && target.b) {
    sketch.constraints.push({ id, type: "distance", a: target.a, b: target.b, value: Number(value), driven: false });
  } else if (target.type === "angle" && target.a && target.b) {
    sketch.constraints.push({ id, type: "angle", a: target.a, b: target.b, value: Number(value), driven: false });
  } else return null;
  return id;
}

/* The measurement a dimension would start from, so the prompt opens on the
   current size instead of an empty field. */
export function currentMeasure(sketch, target) {
  if (!sketch || !target) return 0;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  if (target.type === "line") {
    const l = lineData(sketchEntity(sketch, target.id), points);
    return l ? l.length : 0;
  }
  if (target.type === "circle" || target.type === "arc") {
    const c = circleData(sketchEntity(sketch, target.id), points);
    return c ? c.radius : 0;
  }
  if (target.type === "ellipse") {
    const e = ellipseData(sketchEntity(sketch, target.id), points);
    return e ? (target.axis === "minor" ? e.ry : e.rx) : 0;
  }
  if (target.type === "points") {
    const a = sketchPoint(sketch, target.a), b = sketchPoint(sketch, target.b);
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  }
  if (target.type === "pointLine") {
    const p = sketchPoint(sketch, target.point), l = lineData(sketchEntity(sketch, target.line), points);
    if (!p || !l || l.length < 1e-9) return 0;
    return Math.abs((p.x - l.a.x) * l.dy - (p.y - l.a.y) * l.dx) / l.length;
  }
  if (target.type === "lines") {
    const la = lineData(sketchEntity(sketch, target.a), points);
    const lb = lineData(sketchEntity(sketch, target.b), points);
    if (!la || !lb || la.length < 1e-9) return 0;
    // same expression as the solver's offset residual, so a new dimension starts satisfied
    return ((lb.a.x - la.a.x) * -la.dy + (lb.a.y - la.a.y) * la.dx) / la.length;
  }
  if (target.type === "angle") {
    const la = lineData(sketchEntity(sketch, target.a), points);
    const lb = lineData(sketchEntity(sketch, target.b), points);
    if (!la || !lb) return 0;
    let deg = ((lb.angle - la.angle) * 180) / Math.PI;
    while (deg > 180) deg -= 360;
    while (deg < -180) deg += 360;
    return deg;
  }
  return 0;
}

/* Keep the distance-dimension geometry in one place so drawing, hit testing,
   and pointer dragging all agree about where a placed smart-ruler result is.
   `offset` is stored in screen pixels because annotations should keep a useful
   hand-sized clearance from the drawing at every zoom level. */
export function distanceDimensionLayout(sketch, constraint, toPx) {
  if (!sketch || !constraint || !["distance","offset","pointLineDistance"].includes(constraint.type)) return null;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch.entities || []).map((e) => [e.id, e]));
  let a = null, b = null;
  if (constraint.type === "pointLineDistance") {
    // drawn from the point to its foot on the line, so it reads as a perpendicular distance
    const p = points.get(constraint.point), l = lineData(entities.get(constraint.a), points);
    if (p && l && l.length > 1e-9) {
      const t = ((p.x - l.a.x) * l.dx + (p.y - l.a.y) * l.dy) / (l.length * l.length);
      a = p; b = { x: l.a.x + t * l.dx, y: l.a.y + t * l.dy };
    }
  } else if(constraint.type==="offset"){
    const source=lineData(entities.get(constraint.a),points),target=lineData(entities.get(constraint.b),points);
    if(source&&target){const t=((target.a.x-source.a.x)*source.dx+(target.a.y-source.a.y)*source.dy)/(source.length*source.length);a={x:source.a.x+t*source.dx,y:source.a.y+t*source.dy};b=target.a;}
    else{const source=circleData(entities.get(constraint.a),points),target=circleData(entities.get(constraint.b),points);if(source&&target){a={x:source.center.x+source.radius,y:source.center.y};b={x:target.center.x+target.radius,y:target.center.y};}}
  } else if (constraint.entity) {
    const line = lineData(entities.get(constraint.entity), points);
    if (line) { a = line.a; b = line.b; }
  } else {
    a = points.get(constraint.a);
    b = points.get(constraint.b);
  }
  if (!a || !b) return null;

  const p1 = toPx(a.x, a.y), p2 = toPx(b.x, b.y);
  if (!p1 || !p2) return null;
  let nx = -(p2.y - p1.y), ny = p2.x - p1.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  const offset = 20 + (Number(constraint.offset) || 0);
  const ox = nx * offset, oy = ny * offset;
  return {
    p1, p2, nx, ny, offset,
    a: { x: p1.x + ox, y: p1.y + oy },
    b: { x: p2.x + ox, y: p2.y + oy },
    label: { x: (p1.x + p2.x) / 2 + ox + 4, y: (p1.y + p2.y) / 2 + oy - 4 },
  };
}

function pointSegmentDistance(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const t = d2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / d2)) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
}

/* Returns the nearest placed distance annotation. The generous label box is
   deliberate: dimensions are grabbed with a mouse or a finger, not selected
   as one-pixel drafting strokes. */
/* Where a dimension can be picked, in the same places drawSketchDimensions
   puts it. SOLIDWORKS opens Modify on a double-click of ANY dimension; only
   linear ones answered here, so HOUSING step 331 ("double-click the .100
   fillet dimension") did nothing. An angle's "line" is its 12 px ring, not the
   line midpoint, so double-clicking a line to set its length still works. */
function dimensionHitShape(sketch, c, toPx, points, entities, unit) {
  const labelBox = (lx, ly, text) => ({ x0: lx - 6, x1: lx + Math.max(42, text.length * 7 + 12), y0: ly - 17, y1: ly + 7 });
  if (["distance","offset","pointLineDistance"].includes(c.type)) {
    const layout = distanceDimensionLayout(sketch, c, toPx);
    if (!layout) return null;
    return { box: labelBox(layout.label.x, layout.label.y, dimText(c.value, unit)), a: layout.a, b: layout.b };
  }
  if (c.type === "radius" || c.type === "diameter") {
    const circ = circleData(entities.get(c.entity), points);
    if (circ) {
      const direction = -Math.PI / 4;
      const centre = toPx(circ.center.x, circ.center.y);
      const rim = toPx(circ.center.x + Math.cos(direction) * circ.radius, circ.center.y + Math.sin(direction) * circ.radius);
      return { box: labelBox(rim.x + 4, rim.y - 4, (c.type === "radius" ? "R " : "Ø ") + dimText(c.value, unit)), a: centre, b: rim };
    }
    const ell = ellipseData(entities.get(c.entity), points);
    if (!ell) return null;
    const minor = c.axis === "minor", along = minor ? ell.rot + Math.PI / 2 : ell.rot, reach = minor ? ell.ry : ell.rx;
    const from = toPx(ell.center.x, ell.center.y);
    const to = toPx(ell.center.x + Math.cos(along) * reach, ell.center.y + Math.sin(along) * reach);
    return { box: labelBox(to.x + 4, to.y - 4, `${minor ? "b" : "a"} ${dimText(c.value, unit)}`), a: from, b: to };
  }
  if (c.type === "angle") {
    const l = lineData(c.entity ? entities.get(c.entity) : entities.get(c.a), points);
    if (!l) return null;
    const mid = toPx((l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2);
    return { box: labelBox(mid.x + 15, mid.y - 6, `${Math.round(c.value * 10) / 10}°`), ring: { x: mid.x, y: mid.y, r: 12 } };
  }
  return null;
}

export function hitSketchDimensionHit(sketch, x, y, toPx, tolerance = 9, unit = 'cm') {
  let best = null, bestDistance = Infinity, bestKind = "line";
  const points = new Map((sketch && sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch && sketch.entities || []).map((e) => [e.id, e]));
  for (const constraint of sketch && sketch.constraints || []) {
    if (constraint.suppressed || constraint.value == null) continue;
    const shape = dimensionHitShape(sketch, constraint, toPx, points, entities, unit);
    if (!shape) continue;
    const box = shape.box;
    const inLabel = box ? x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 : false;
    const distance = inLabel ? 0
      : shape.ring ? Math.abs(Math.hypot(x - shape.ring.x, y - shape.ring.y) - shape.ring.r)
      : pointSegmentDistance(x, y, shape.a, shape.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = constraint;
      bestDistance = distance;
      bestKind = inLabel ? "label" : "line";
    }
  }
  return best ? { constraint: best, kind: bestKind } : null;
}

/* A sketch point under the cursor wins over a dimension's leader line, as in
   SOLIDWORKS: HOUSING HandleProfile's R .100 leader runs out of an arc centre
   and hid that centre from Smart Dimension. The label itself still wins. */
export function dimensionHitYieldsToPoint(hit, underPointer) {
  if (!hit) return null;
  const isPoint = underPointer && !underPointer.type && "x" in underPointer;
  return hit.kind !== "label" && isPoint ? null : hit;
}

export function hitSketchDimension(sketch, x, y, toPx, tolerance = 9, unit = 'cm') {
  const hit = hitSketchDimensionHit(sketch, x, y, toPx, tolerance, unit);
  return hit ? hit.constraint : null;
}

export function drawSketchDimensions(ctx, sketch, scale, toPx, conflicts = [], options = {}) {
  if (!sketch || !sketch.constraints) return;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch.entities || []).map((e) => [e.id, e]));
  const palette = getDimensionPalette(options);
  const unit = documentLengthUnit(options.unit);

  ctx.save();
  ctx.font = "12px sans-serif";

  for (const c of sketch.constraints) {
    if (c.suppressed) continue;
    const bad = conflicts.indexOf(c.id) >= 0;
    const selected = c.id === options.selectedId;
    const color = bad ? palette.conflict : selected ? palette.selected : c.driven ? palette.driven : palette.driving;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    if (["distance","offset","pointLineDistance"].includes(c.type)) {
      const layout = distanceDimensionLayout(sketch, c, toPx);
      if (!layout) continue;

      ctx.beginPath();
      ctx.moveTo(layout.p1.x, layout.p1.y); ctx.lineTo(layout.a.x, layout.a.y);
      ctx.moveTo(layout.p2.x, layout.p2.y); ctx.lineTo(layout.b.x, layout.b.y);
      ctx.moveTo(layout.a.x, layout.a.y); ctx.lineTo(layout.b.x, layout.b.y);
      ctx.stroke();
      const label = dimText(c.value, unit);
      const textWidth = ctx.measureText ? ctx.measureText(label).width : (label.length * 7);
      const pad = 4;
      const boxW = textWidth + pad * 2;
      const boxH = 16;
      const boxX = layout.label.x - pad;
      const boxY = layout.label.y - 12;

      if (ctx.fillRect) {
        ctx.save();
        ctx.fillStyle = palette.textBg;
        ctx.fillRect(boxX, boxY, boxW, boxH);
        if (selected && ctx.strokeRect) {
          ctx.strokeStyle = color;
          ctx.strokeRect(boxX - 0.5, boxY - 0.5, boxW + 1, boxH + 1);
        }
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.fillText(label, layout.label.x, layout.label.y);
    } else if (c.type === "radius" || c.type === "diameter") {
      const circ = circleData(entities.get(c.entity), points);
      if (circ) {
        const cp = toPx(circ.center.x, circ.center.y);
        // The leader endpoint is sketch geometry, so project a real UV rim
        // point. Only its label clearance remains a fixed screen-pixel offset.
        const direction = -Math.PI / 4;
        const rim = toPx(circ.center.x + Math.cos(direction) * circ.radius,
          circ.center.y + Math.sin(direction) * circ.radius);
        ctx.beginPath();
        ctx.moveTo(cp.x, cp.y);
        ctx.lineTo(rim.x, rim.y);
        ctx.stroke();
        const label = (c.type === "radius" ? "R " : "Ø ") + dimText(c.value, unit);
        const textWidth = ctx.measureText ? ctx.measureText(label).width : (label.length * 7);
        const pad = 4;
        const lx = rim.x + 4, ly = rim.y - 4;
        if (ctx.fillRect) {
          ctx.save();
          ctx.fillStyle = palette.textBg;
          ctx.fillRect(lx - pad, ly - 12, textWidth + pad * 2, 16);
          if (selected && ctx.strokeRect) {
            ctx.strokeStyle = color;
            ctx.strokeRect(lx - pad - 0.5, ly - 12.5, textWidth + pad * 2 + 1, 17);
          }
          ctx.restore();
        }
        ctx.fillStyle = color;
        ctx.fillText(label, lx, ly);
        continue;
      }
      // an ellipse's dimension points along the semi-axis it actually drives,
      // so the two are never mistaken for one another on screen
      const ell = ellipseData(entities.get(c.entity), points);
      if (!ell) continue;
      const minor = c.axis === "minor";
      const along = minor ? ell.rot + Math.PI / 2 : ell.rot;
      const reach = minor ? ell.ry : ell.rx;
      const from = toPx(ell.center.x, ell.center.y);
      const to = toPx(ell.center.x + Math.cos(along) * reach, ell.center.y + Math.sin(along) * reach);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
      ctx.stroke();
      const label = `${minor ? "b" : "a"} ${dimText(c.value, unit)}`;
      const textWidth = ctx.measureText ? ctx.measureText(label).width : (label.length * 7);
      const pad = 4;
      const lx = to.x + 4, ly = to.y - 4;
      if (ctx.fillRect) {
        ctx.save();
        ctx.fillStyle = palette.textBg;
        ctx.fillRect(lx - pad, ly - 12, textWidth + pad * 2, 16);
        if (selected && ctx.strokeRect) {
          ctx.strokeStyle = color;
          ctx.strokeRect(lx - pad - 0.5, ly - 12.5, textWidth + pad * 2 + 1, 17);
        }
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.fillText(label, lx, ly);
    } else if (c.type === "angle") {
      const base = c.entity ? entities.get(c.entity) : entities.get(c.a);
      const l = lineData(base, points);
      if (!l) continue;
      const mid = toPx((l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2);
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      const label = `${Math.round(c.value * 10) / 10}°`;
      const textWidth = ctx.measureText ? ctx.measureText(label).width : (label.length * 7);
      const pad = 4;
      const lx = mid.x + 15, ly = mid.y - 6;
      if (ctx.fillRect) {
        ctx.save();
        ctx.fillStyle = palette.textBg;
        ctx.fillRect(lx - pad, ly - 12, textWidth + pad * 2, 16);
        if (selected && ctx.strokeRect) {
          ctx.strokeStyle = color;
          ctx.strokeRect(lx - pad - 0.5, ly - 12.5, textWidth + pad * 2 + 1, 17);
        }
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.fillText(label, lx, ly);
    }
  }
  ctx.restore();
}

/* Geometric constraints get a small glyph next to the geometry they act on —
   without it there is no way to tell a line that happens to be flat from one
   that is held flat. */
const GLYPH = {
  horizontal: "—", vertical: "|", parallel: "∥", perpendicular: "⊥",
  tangent: "◠", concentric: "◎", equal: "=", midpoint: "▪",
  coincident: "●", symmetric: "⇔", fixed: "▣", pointOnLine: "•", pointOnCircle: "•",
};

export function drawConstraintGlyphs(ctx, sketch, toPx, conflicts = [], options = {}) {
  if (!sketch || !sketch.constraints) return;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch.entities || []).map((e) => [e.id, e]));
  const used = new Map();   // stack glyphs that land on the same spot
  const palette = getDimensionPalette(options);

  ctx.save();
  ctx.font = "11px sans-serif";
  for (const c of sketch.constraints) {
    const glyph = GLYPH[c.type];
    if (!glyph || c.suppressed) continue;
    const anchors = [];
    [c.entity, c.a, c.b].forEach((id) => {
      const e = entities.get(id);
      if (e) {
        const l = lineData(e, points), o = l ? null : circleData(e, points);
        if (l) anchors.push({ x: (l.a.x + l.b.x) / 2, y: (l.a.y + l.b.y) / 2 });
        else if (o) anchors.push({ x: o.center.x, y: o.center.y + o.radius });
      } else {
        const p = points.get(id);
        if (p) anchors.push(p);
      }
    });
    const p = points.get(c.point);
    if (p) anchors.push(p);
    if (!anchors.length) continue;

    const glyphColor = conflicts.indexOf(c.id) >= 0 ? palette.glyphConflict : palette.glyphOk;
    ctx.fillStyle = glyphColor;
    anchors.forEach((anchor) => {
      const s = toPx(anchor.x, anchor.y);
      const key = Math.round(s.x / 12) + ":" + Math.round(s.y / 12);
      const n = used.get(key) || 0;
      used.set(key, n + 1);
      const gx = s.x + 6;
      const gy = s.y - 6 - n * 11;
      if (ctx.fillRect) {
        ctx.save();
        ctx.fillStyle = palette.textBg;
        ctx.fillRect(gx - 2, gy - 9, 11, 11);
        ctx.restore();
      }
      ctx.fillStyle = glyphColor;
      ctx.fillText(glyph, gx, gy);
    });
  }
  ctx.restore();
}
