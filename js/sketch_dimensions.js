// Interactive sketch dimensions & annotations rendering and manipulation.

import { lineData, circleData, ellipseData, sketchPoint, sketchEntity } from "./sketch_solver.js";

const DRIVING = "#4f46e5";
const DRIVEN = "#718096";
const CONFLICT = "#d0342c";

// Millimetre work needs three decimals of a centimetre; trailing zeros go.
const dimText = (value) => `${Number(Number(value).toFixed(3))} cm`;

/* A smart dimension is just a driving constraint with a value the solver has to
   satisfy — the same object the constraint list shows, so editing a dimension
   and editing a constraint are one code path. */
export function addSmartDimension(sketch, target, value) {
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
  if (!sketch || !constraint || !["distance","offset"].includes(constraint.type)) return null;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch.entities || []).map((e) => [e.id, e]));
  let a = null, b = null;
  if(constraint.type==="offset"){
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
export function hitSketchDimensionHit(sketch, x, y, toPx, tolerance = 9) {
  let best = null, bestDistance = Infinity, bestKind = "line";
  for (const constraint of sketch && sketch.constraints || []) {
    if (constraint.suppressed || !["distance","offset"].includes(constraint.type)) continue;
    const layout = distanceDimensionLayout(sketch, constraint, toPx);
    if (!layout) continue;
    const text = `${Math.round(Number(constraint.value) * 10) / 10} cm`;
    const labelWidth = Math.max(42, text.length * 7 + 12);
    const inLabel = x >= layout.label.x - 6 && x <= layout.label.x + labelWidth
      && y >= layout.label.y - 17 && y <= layout.label.y + 7;
    const distance = inLabel ? 0 : pointSegmentDistance(x, y, layout.a, layout.b);
    if (distance <= tolerance && distance < bestDistance) {
      best = constraint;
      bestDistance = distance;
      bestKind = inLabel ? "label" : "line";
    }
  }
  return best ? { constraint: best, kind: bestKind } : null;
}

export function hitSketchDimension(sketch, x, y, toPx, tolerance = 9) {
  const hit = hitSketchDimensionHit(sketch, x, y, toPx, tolerance);
  return hit ? hit.constraint : null;
}

export function drawSketchDimensions(ctx, sketch, scale, toPx, conflicts = [], options = {}) {
  if (!sketch || !sketch.constraints) return;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch.entities || []).map((e) => [e.id, e]));

  ctx.save();
  ctx.font = "12px sans-serif";

  for (const c of sketch.constraints) {
    if (c.suppressed) continue;
    const bad = conflicts.indexOf(c.id) >= 0;
    const selected = c.id === options.selectedId;
    const color = bad ? CONFLICT : selected ? "#e08030" : c.driven ? DRIVEN : DRIVING;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;

    if (["distance","offset"].includes(c.type)) {
      const layout = distanceDimensionLayout(sketch, c, toPx);
      if (!layout) continue;

      ctx.beginPath();
      ctx.moveTo(layout.p1.x, layout.p1.y); ctx.lineTo(layout.a.x, layout.a.y);
      ctx.moveTo(layout.p2.x, layout.p2.y); ctx.lineTo(layout.b.x, layout.b.y);
      ctx.moveTo(layout.a.x, layout.a.y); ctx.lineTo(layout.b.x, layout.b.y);
      ctx.stroke();
      const label = dimText(c.value);
      if (selected) {
        const width = ctx.measureText(label).width + 10;
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.94)";
        ctx.fillRect(layout.label.x - 4, layout.label.y - 13, width, 17);
        ctx.strokeStyle = color;
        ctx.strokeRect(layout.label.x - 4.5, layout.label.y - 13.5, width + 1, 18);
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
        const label = (c.type === "radius" ? "R " : "Ø ") + dimText(c.value);
        ctx.fillText(label, rim.x + 4, rim.y - 4);
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
      ctx.fillText(`${minor ? "b" : "a"} ${dimText(c.value)}`, to.x + 4, to.y - 4);
    } else if (c.type === "angle") {
      const base = c.entity ? entities.get(c.entity) : entities.get(c.a);
      const l = lineData(base, points);
      if (!l) continue;
      const mid = toPx((l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2);
      ctx.beginPath();
      ctx.arc(mid.x, mid.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(`${Math.round(c.value * 10) / 10}°`, mid.x + 15, mid.y - 6);
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

export function drawConstraintGlyphs(ctx, sketch, toPx, conflicts = []) {
  if (!sketch || !sketch.constraints) return;
  const points = new Map((sketch.points || []).map((p) => [p.id, p]));
  const entities = new Map((sketch.entities || []).map((e) => [e.id, e]));
  const used = new Map();   // stack glyphs that land on the same spot

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

    ctx.fillStyle = conflicts.indexOf(c.id) >= 0 ? CONFLICT : "#0f8a6a";
    anchors.forEach((anchor) => {
      const s = toPx(anchor.x, anchor.y);
      const key = Math.round(s.x / 12) + ":" + Math.round(s.y / 12);
      const n = used.get(key) || 0;
      used.set(key, n + 1);
      ctx.fillText(glyph, s.x + 6, s.y - 6 - n * 11);
    });
  }
  ctx.restore();
}
