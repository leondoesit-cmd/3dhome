// Missing hole limits inherit the extrusion's limits; explicit limits are
// clipped to the body. An empty intersection has from >= to.
export function holeSpan(part, hole) {
  const low = Math.min(part.from, part.to), high = Math.max(part.from, part.to);
  return {
    from: Math.max(low, hole?.from != null ? Number(hole.from) : low),
    to: Math.min(high, hole?.to != null ? Number(hole.to) : high),
  };
}
