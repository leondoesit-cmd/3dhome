const EPS = 1e-9;

function sketchPoint(sketch, id) {
  return (sketch.points || []).find((point) => point.id === id) || null;
}

function unit(x, y) {
  const length = Math.hypot(x, y);
  if (length < EPS) return null;
  return { x: x / length, y: y / length };
}

export function entityOutgoingTangent(sketch, pointId) {
  const point = sketchPoint(sketch, pointId);
  if (!point) return null;
  for (const entity of sketch.entities || []) {
    if (entity.type === "line" && (entity.a === pointId || entity.b === pointId)) {
      const other = sketchPoint(sketch, entity.a === pointId ? entity.b : entity.a);
      if (!other) continue;
      const tangent = unit(point.x - other.x, point.y - other.y);
      if (tangent) return { entity, tangent, point };
    }
    if (entity.type === "arc" && (entity.a === pointId || entity.b === pointId)) {
      const centre = sketchPoint(sketch, entity.c);
      if (!centre) continue;
      const radial = unit(point.x - centre.x, point.y - centre.y);
      if (!radial) continue;
      const ccw = { x: -radial.y, y: radial.x };
      const tangent = entity.a === pointId ? { x: -ccw.x, y: -ccw.y } : ccw;
      return { entity, tangent, point };
    }
  }
  return null;
}

function asUv(point) {
  return { u: point.u ?? point.x, v: point.v ?? point.y, pointId: point.pointId };
}

export function tangentArc(start, tangent, end) {
  if (!start || !tangent || !end) return null;
  const from = asUv(start), to = asUv(end);
  const tx = tangent.x, ty = tangent.y;
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || Math.hypot(tx, ty) < EPS) return null;
  const px = from.u - to.u, py = from.v - to.v;
  const dist2 = px * px + py * py;
  if (dist2 < EPS * EPS) return null;
  const normals = [{ x: -ty, y: tx }, { x: ty, y: -tx }];
  let best = null;
  for (const normal of normals) {
    const length = Math.hypot(normal.x, normal.y) || 1;
    const nx = normal.x / length, ny = normal.y / length;
    const nd = nx * px + ny * py;
    if (Math.abs(nd) < 1e-12) continue;
    const radius = -dist2 / (2 * nd);
    if (!(radius > EPS)) continue;
    const centre = { u: from.u + nx * radius, v: from.v + ny * radius };
    const angle = (point) => Math.atan2(point.v - centre.v, point.u - centre.u);
    const tau = Math.PI * 2;
    const sweep = (angle(to) - angle(from) + tau) % tau;
    // CCW travel at `from` matches the requested tangent only for one side.
    // The other side has to be stored from the far end so the rendered CCW arc still leaves `from` along that tangent, even when that sweep is the long way.
    const align = ny * tx - nx * ty;
    const along = align > 0
      ? { start: from, end: to, sweep }
      : { start: to, end: from, sweep: (tau - sweep) % tau };
    if (!best || along.sweep < best.sweep - 1e-12) best = { centre, radius, start: along.start, end: along.end, sweep: along.sweep };
  }
  if (!best) return null;
  return { centre: best.centre, start: best.start, end: best.end, radius: best.radius };
}
