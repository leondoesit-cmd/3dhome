// Assign exact tessellation ranges to saved face/feature appearances. Unpainted
// triangles retain material zero; a face override takes priority over a feature.
export function appearanceGroups(faceRanges, triangleCount, overrides = []) {
  const materials = [], groups = [];
  const ranges = (faceRanges || []).slice().sort((a, b) => a.triangleStart - b.triangleStart);
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.max(cursor, range.triangleStart);
    const end = Math.min(triangleCount, range.triangleStart + range.triangleCount);
    if (end <= start) continue;
    if (start > cursor) groups.push({ start: cursor * 3, count: (start - cursor) * 3, materialIndex: 0 });
    const id = range.persistentId || '';
    const appearance = overrides.find(item => item.kind === 'face' && item.persistentId === id)
      || overrides.find(item => item.kind === 'feature' && item.persistentId && id.startsWith(item.persistentId + ':'));
    let materialIndex = 0;
    if (appearance) {
      let index = materials.indexOf(appearance);
      if (index < 0) { index = materials.length; materials.push(appearance); }
      materialIndex = index + 1;
    }
    groups.push({ start: start * 3, count: (end - start) * 3, materialIndex });
    cursor = end;
  }
  if (cursor < triangleCount) groups.push({ start: cursor * 3, count: (triangleCount - cursor) * 3, materialIndex: 0 });
  return { groups, materials };
}
