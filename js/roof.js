/* A roof generated from the outer envelope of the active floor's walls.
   Coordinates are centimetres in the plan's x/z frame. The gable and hip
   surfaces are piecewise planar, so their ridge and eaves stay exact when the
   pitch or overhang changes. */
export function roofFromWalls(walls, nodes, options = {}) {
  const points = (walls || []).filter(w => w && w.physical !== false && !["roomDivider", "railing"].includes(w.kind))
    .flatMap(w => [nodes?.[w.a], nodes?.[w.b]]).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  if (points.length < 4) return null;
  const overhang = Math.max(0, Number(options.overhang) || 0);
  const x0 = Math.min(...points.map(p => p.x)) - overhang, x1 = Math.max(...points.map(p => p.x)) + overhang;
  const z0 = Math.min(...points.map(p => p.z)) - overhang, z1 = Math.max(...points.map(p => p.z)) + overhang;
  if (x1 - x0 < 10 || z1 - z0 < 10) return null;
  return { type: ["flat", "gable", "hip"].includes(options.type) ? options.type : "gable",
    pitch: Math.max(0, Math.min(60, Number(options.pitch) || 0)), overhang,
    x0, x1, z0, z1, base: Math.max(1, Number(options.base) || 270) };
}

export function roofMeshTriangles(roof) {
  if (!roof) return [];
  const { x0, x1, z0, z1, base } = roof;
  const short = Math.min(x1 - x0, z1 - z0);
  const run = short / 2;
  const xs = [...new Set([x0, x0 + run, (x0 + x1) / 2, x1 - run, x1])].sort((a, b) => a - b);
  const zs = [...new Set([z0, z0 + run, (z0 + z1) / 2, z1 - run, z1])].sort((a, b) => a - b);
  const slope = Math.tan((roof.pitch || 0) * Math.PI / 180);
  function vertex(x, z) {
    let rise = 0;
    if (roof.type === "gable") rise = (x1 - x0 >= z1 - z0 ? Math.min(z - z0, z1 - z) : Math.min(x - x0, x1 - x)) * slope;
    else if (roof.type === "hip") rise = Math.min(x - x0, x1 - x, z - z0, z1 - z) * slope;
    return { x, y: base + Math.max(0, rise), z };
  }
  const triangles = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    const a = vertex(xs[i], zs[j]), b = vertex(xs[i + 1], zs[j]);
    const c = vertex(xs[i + 1], zs[j + 1]), d = vertex(xs[i], zs[j + 1]);
    triangles.push([a, b, c], [a, c, d]);
  }
  return triangles;
}
