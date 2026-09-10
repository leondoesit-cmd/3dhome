import { readFile } from 'node:fs/promises';
let loaded;
export function importTrack() {
  return loaded ||= (async () => {
    const root = new URL('../../', import.meta.url);
    let src = await readFile(new URL('js/track.js', root), 'utf8');
    for (const [from, to] of [['three', 'vendor/three/three.module.js'], ['./state.js', 'js/state.js'], ['./geometry.js', 'js/geometry.js'], ['./road_surface.js', 'js/road_surface.js']])
      src = src.replace(`from "${from}"`, `from "${new URL(to, root).href}"`);
    return import('data:text/javascript,' + encodeURIComponent(src));
  })();
}
export function room(x, z, w, h) {
  return { cx: x + w / 2, cz: z + h / 2, area: w * h,
    pts: [{ x, z }, { x: x + w, z }, { x: x + w, z: z + h }, { x, z: z + h }] };
}
export function environment(rooms, rects = [], walls = []) {
  const segs = walls.length ? walls : rooms.flatMap(r => r.pts.map((a, i) => {
    const b = r.pts[(i + 1) % r.pts.length];
    return { ax: a.x, az: a.z, bx: b.x, bz: b.z, half: 5 };
  }));
  return { homeMode: true, hasJump: false, rects: () => rects, tops: () => rects, segs: () => segs,
    groundAt: (x, z, y, step) => rects.reduce((g, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && r.y1 <= y + step ? Math.max(g, r.y1) : g, 0) };
}
