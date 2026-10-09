// A thicker planar wall clips the already exact uniform cavity at its inward
// offset plane. Supporting planes are required: a bounded concave face must not
// clip an unrelated portion of the cavity on its opposite side.
export function shellFaceThicknesses(value, thickness, direction = "inside") {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Shell face thicknesses must be a list");
  if (value.length && direction === "outside") throw new Error("Variable Shell supports inward walls only");
  const base = Number(thickness), seen = new Set();
  if (value.length && !(Number.isFinite(base) && base > 0)) throw new Error("Shell default thickness must be positive");
  return value.map((row) => {
    const id = row?.facePersistentId, wall = Number(row?.thickness);
    if (typeof id !== "string" || !id || seen.has(id)) throw new Error("Shell thickness needs unique retained face references");
    if (!(Number.isFinite(wall) && wall >= base)) throw new Error("Planar Shell face thickness must be at least the default thickness");
    seen.add(id);
    return { facePersistentId: id, thickness: wall };
  });
}

export function shellSupportingPlane(descriptor, vertices, thickness, tolerance = 1e-7) {
  if (descriptor?.surface !== "plane") throw new Error("Variable Shell thickness requires a planar retained face");
  const p = descriptor.origin, raw = descriptor.normal;
  const length = Math.hypot(raw?.x, raw?.y, raw?.z);
  if (!p || ![p.x,p.y,p.z].every(Number.isFinite) || !Number.isFinite(length) || length < 1e-9 || !vertices?.length || vertices.some(v=>![v.x,v.y,v.z].every(Number.isFinite))) throw new Error("Shell retained face has no measurable supporting plane");
  const normal = { x: raw.x / length, y: raw.y / length, z: raw.z / length };
  if (vertices.some((v) => (v.x-p.x)*normal.x+(v.y-p.y)*normal.y+(v.z-p.z)*normal.z > tolerance)) {
    throw new Error("Variable Shell thickness requires a supporting exterior plane");
  }
  return {
    normal,
    origin: { x: p.x-normal.x*thickness, y: p.y-normal.y*thickness, z: p.z-normal.z*thickness },
  };
}
