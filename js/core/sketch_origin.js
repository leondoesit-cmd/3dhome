/* The sketch Origin as a point you can pick (SOLIDWORKS: the Origin is always
   there to dimension and relate to). A sketch keeps its geometry in plane
   coordinates, so the Origin is (0, 0). HOUSING's HandlePath dimensions the
   Origin to its horizontal line (2.500 in, step 477) and has no point of its
   own at (0, 0); picking near the Origin now yields a fixed point there.

   An existing point already fixed at the Origin is reused, so picking the
   Origin twice does not stack points; otherwise one fixed point is added and
   marked `origin: true`. */

const ORIGIN_TOL = 1e-9;

export function sketchOriginPoint(sketch) {
  const fixedAt = new Set((sketch?.constraints || [])
    .filter((c) => c.type === "fixed" && Math.abs(Number(c.x) || 0) < ORIGIN_TOL && Math.abs(Number(c.y) || 0) < ORIGIN_TOL)
    .map((c) => c.point));
  return (sketch?.points || []).find((p) => p.origin === true)
    || (sketch?.points || []).find((p) => Math.abs(p.x) < ORIGIN_TOL && Math.abs(p.y) < ORIGIN_TOL && (p.fixed || fixedAt.has(p.id)))
    || null;
}

export function ensureSketchOriginPoint(sketch, makeId) {
  const found = sketchOriginPoint(sketch);
  if (found) return { point: found, created: false };
  sketch.points ||= [];
  sketch.constraints ||= [];
  const point = { id: makeId(), x: 0, y: 0, origin: true };
  sketch.points.push(point);
  sketch.constraints.push({ id: makeId(), type: "fixed", point: point.id, x: 0, y: 0, origin: true });
  return { point, created: true };
}

/* Is a pick at (u, v) the Origin? `tolerance` is in sketch units (pixels / scale). */
export function pickIsOrigin(uv, tolerance) {
  return !!uv && Math.hypot(Number(uv.u ?? uv.x) || 0, Number(uv.v ?? uv.y) || 0) <= tolerance;
}
