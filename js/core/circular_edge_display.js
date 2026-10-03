/* Analytic edge identities remain authoritative. Display a complete circle
   along the existing mesh boundary so independently sampled chords cannot
   alternate behind the adjoining concave surface. */
export function circularMeshBoundary(descriptor, circles) {
  if (descriptor?.curve !== "circle" || !descriptor.origin || !descriptor.axis) return null;
  const radius = Number(descriptor.radius), axis = descriptor.axis;
  const size = Math.hypot(axis.x, axis.y, axis.z);
  if (!(radius > 0) || !(size > 0)) return null;
  const tolerance = Math.max(1e-5, radius * 1e-4);
  const ends = descriptor.endpoints;
  if (ends?.length >= 2 && Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y, ends[0].z - ends[1].z) > tolerance) return null;
  for (const circle of circles || []) {
    const points = circle.points;
    if (!circle.closed || !Array.isArray(points) || points.length < 4) continue;
    if (!points.every((point) => {
      const dx = point.x - descriptor.origin.x, dy = point.y - descriptor.origin.y, dz = point.z - descriptor.origin.z;
      const height = (dx * axis.x + dy * axis.y + dz * axis.z) / size;
      return Math.abs(height) <= tolerance && Math.abs(Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - height * height)) - radius) <= tolerance;
    })) continue;
    const first = points[0], last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) > tolerance) return points.concat([first]);
    return points;
  }
  return null;
}
