// Return only straight edges parallel to the seed, independent of orientation.
// Candidates must already be scoped to the active body/face by the caller.
export function parallelStraightEdges(seed, candidates, tolerance = 1e-7) {
  function direction(reference) {
    const d = reference?.descriptor;
    if (d?.curve !== "line") return null;
    const ends = d.endpoints;
    const vector = ends?.length >= 2 ? {
      x:ends[ends.length-1].x-ends[0].x,
      y:ends[ends.length-1].y-ends[0].y,
      z:ends[ends.length-1].z-ends[0].z,
    } : d.axis;
    if (!vector || ![vector.x,vector.y,vector.z].every(Number.isFinite)) return null;
    const length = Math.hypot(vector.x,vector.y,vector.z);
    return length > 1e-10 ? [vector.x/length,vector.y/length,vector.z/length] : null;
  }
  const a = direction(seed);
  if (!a) return [];
  return candidates.filter(reference => {
    const b = direction(reference);
    return b && Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]) <= tolerance;
  });
}
