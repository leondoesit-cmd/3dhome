/* Navigation is selection only; it never changes geometry or constraints. */
export function sketchEntityStep(entities, selected, direction) {
  if (!entities.length) return null;
  const index = entities.indexOf(selected);
  if (index < 0) return entities[direction < 0 ? entities.length - 1 : 0];
  return entities[(index + (direction < 0 ? -1 : 1) + entities.length) % entities.length];
}

export function sketchEntitySwipe(dx, dy, rtl = false) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx)<32 || Math.abs(dx)<Math.abs(dy)*1.4) return 0;
  const direction=dx<0?1:-1;
  return rtl?-direction:direction;
}
