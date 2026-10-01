// A contour is an area, not a selected edge. The outer and inner edges of a
// ring both belong to that one area, while an island inside the ring is a
// different area even when all three loops share a centre.
export function featureContourKey(area) {
  const ids = (area?.sourceEntityIds || []).slice().sort();
  if (ids.length) return `entities:${ids.join("|")}`;
  const points = (area?.points || []).map((point) =>
    `${Number(point.u).toFixed(5)},${Number(point.v).toFixed(5)}`);
  return `points:${points.join("|")}`;
}

export function selectFeatureContours(areas, keys) {
  if (!Array.isArray(keys) || !keys.length) return areas;
  const selected = new Set(keys);
  return areas.filter((area) => selected.has(featureContourKey(area)));
}
