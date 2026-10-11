import { S } from "./state.js";
import { contentBounds } from "./geometry.js";

const cloneItems = () => S.items.map((it) => ({ id: it.id, x: it.x, z: it.z, rot: it.rot || 0 }));

function footprint(it, placed) {
  const rot = ((placed.rot || 0) * Math.PI) / 180;
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  return { w: it.w * c + it.d * s, d: it.w * s + it.d * c };
}

function score(items) {
  let collisions = 0;
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = S.items.find((it) => it.id === items[i].id), b = S.items.find((it) => it.id === items[j].id);
    if (!a || !b) continue;
    const fa = footprint(a, items[i]), fb = footprint(b, items[j]);
    if (Math.abs(items[i].x - items[j].x) < (fa.w + fb.w) / 2 && Math.abs(items[i].z - items[j].z) < (fa.d + fb.d) / 2) collisions++;
  }
  return Math.max(0, 100 - collisions * 12);
}

export function generateLayouts() {
  const box = contentBounds(), movable = S.items.filter((it) => !it.locked);
  const original = cloneItems();
  const rotated = cloneItems().map((p) => {
    const it = S.items.find((x) => x.id === p.id);
    return !it || it.locked ? p : { ...p, x: box.cx - (p.z - box.cz), z: box.cz + (p.x - box.cx), rot: (p.rot + 90) % 360 };
  });
  const columns = Math.max(1, Math.ceil(Math.sqrt(movable.length)));
  let slot = 0;
  const grid = cloneItems().map((p) => {
    const it = S.items.find((x) => x.id === p.id);
    if (!it || it.locked) return p;
    const col = slot % columns, row = Math.floor(slot++ / columns);
    return { ...p, x: box.minx + 70 + col * 120, z: box.minz + 70 + row * 120, rot: 0 };
  });
  return [
    { id: "original", name: "Current layout", items: original, score: score(original) },
    { id: "rotate", name: "Quarter-turn alternative", items: rotated, score: score(rotated) },
    { id: "grid", name: "Clear circulation grid", items: grid, score: score(grid) },
  ].sort((a, b) => b.score - a.score);
}

export function applyLayout(candidate) {
  const byId = new Map(candidate.items.map((p) => [p.id, p]));
  S.items.forEach((it) => {
    const p = byId.get(it.id);
    if (p && !it.locked) Object.assign(it, { x: p.x, z: p.z, rot: p.rot });
  });
  S.dirty3D = true;
}
