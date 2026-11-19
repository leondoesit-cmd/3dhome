import { tessellateParts } from '../../js/core/part_tessellate.js';

export const ring = (r, n, u = 0, v = 0) => Array.from({ length: n }, (_, i) => ({
  u: u + r * Math.cos(i * 2 * Math.PI / n), v: v + r * Math.sin(i * 2 * Math.PI / n),
}));
// One owner body, 300 closed bosses, 56,412 triangles. Separate cylinders
// must share an owner or the original per-owner scan would not be stressed.
export function bossPlate(columns = 20, rows = 15, facets = 48) {
  const parts = [{ kind: 'box', x0: -2, x1: columns * 4, y0: -2, y1: rows * 4, z0: -1, z1: 0 }];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    parts.push({ kind: 'ext', axis: 'z', from: 0, to: 2 + (x % 3) * .3, pts: ring(1, facets, x * 4, y * 4) });
  }
  return { positions: tessellateParts(parts).flatMap(body => Array.from(body.positions)) };
}
