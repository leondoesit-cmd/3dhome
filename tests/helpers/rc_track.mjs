import { registerHooks } from 'node:module';
let loaded;
// js/track.js (and its js/track/ pieces) import bare "three", which only the
// browser's import map resolves; point it at the vendored build and import
// the real files, so a split of track.js keeps loading here.
export function importTrack() {
  return loaded ||= (async () => {
    const root = new URL('../../', import.meta.url);
    const three = new URL('vendor/three/', root).href;
    registerHooks({
      resolve(specifier, context, next) {
        if (specifier === 'three') return { url: three + 'three.module.js', shortCircuit: true };
        if (specifier.startsWith('three/addons/')) return { url: three + specifier.slice(6), shortCircuit: true };
        return next(specifier, context);
      },
    });
    return import(new URL('js/track.js', root).href);
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
