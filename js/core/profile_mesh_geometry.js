import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Path, Shape, ShapeUtils, Vector2, Vector3 } from "../../vendor/three/three.core.js";
import { framePoint } from "./frame.js";

export function holeLoop(hl, includeSuppressed) {
  if (!hl) return [];
  if (Array.isArray(hl)) return hl;
  if (!includeSuppressed && hl.suppressed) return [];
  return hl.points || hl.loop || hl.pts || [];
}

// ExtrudeGeometry stores sketch vertices in Float32. Applying the frame to
// that buffer rounds again, before the mesh inherits any assembly placement.
export function extrusionGeometry(part, smoothNormals) {
  if (!part.pts || part.pts.length < 3) return null;
  const pathOf = (path, points) => {
    points.forEach((point, i) => {
      const u = !part.frame && part.axis === "x" ? -point.u : point.u;
      const v = !part.frame && part.axis === "y" ? -point.v : point.v;
      if (i === 0) path.moveTo(u, v);
      else path.lineTo(u, v);
    });
    return path;
  };
  const shape = pathOf(new Shape(), part.pts);
  for (const hole of part.holes || []) {
    const loop = holeLoop(hole);
    if (loop.length >= 3) shape.holes.push(pathOf(new Path(), loop));
  }
  const depth = Math.abs(part.to - part.from) || 1;
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  if (smoothNormals) smoothNormals(geometry);
  if (part.frame) {
    const { xAxis, yAxis, normal } = part.frame;
    const direction = new Vector3().copy(normal);
    if (part.to < part.from) direction.negate();
    const matrix = new Matrix4().makeBasis(xAxis, yAxis, direction);
    const start = framePoint(part.frame, 0, 0, part.from);
    geometry.applyMatrix4(matrix.setPosition(start.x, start.y, start.z));
  } else {
    if (part.axis === "y") geometry.rotateX(-Math.PI / 2);
    if (part.axis === "x") geometry.rotateY(Math.PI / 2);
    const start = Math.min(part.from, part.to);
    geometry.translate(part.axis === "x" ? start : 0, part.axis === "y" ? start : 0, part.axis === "z" ? start : 0);
  }
  return geometry;
}

// map sketch-plane (u,v) + axis coordinate w into model xyz, per extrude axis convention
export function loftXYZ(axis, u, v, w) {
  if (axis === "y") return [u, w, v];
  if (axis === "z") return [u, v, w];
  return [w, v, u];
}

export function loftGeometry(p) {
  var n = (p.pts0 || []).length;
  if (n < 3 || !p.pts1 || p.pts1.length !== n) return null;
  var pos = [], idx = [], i;
  for (i = 0; i < n; i++) pos.push.apply(pos, loftXYZ(p.axis, p.pts0[i].u, p.pts0[i].v, p.from));
  for (i = 0; i < n; i++) pos.push.apply(pos, loftXYZ(p.axis, p.pts1[i].u, p.pts1[i].v, p.to));
  for (i = 0; i < n; i++) { // side walls
    var a = i, b = (i + 1) % n;
    idx.push(a, b, n + b, a, n + b, n + a);
  }
  try { // end caps
    [p.pts0, p.pts1].forEach(function (ring, ri) {
      var tris = ShapeUtils.triangulateShape(ring.map(function (q) { return new Vector2(q.u, q.v); }), []);
      tris.forEach(function (tr) { idx.push(ri * n + tr[0], ri * n + tr[1], ri * n + tr[2]); });
    });
  } catch (e) { /* Keep the side walls when a legacy cap cannot be triangulated. */ }
  var g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
