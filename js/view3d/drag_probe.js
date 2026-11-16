/* The 3D pointer sample a piece drag needs (FURNITURE_PLACEMENT_PLAN.md
   Stage 2): the camera ray through the cursor and the first WALL face it
   meets. The dragged pieces and everything standing on them are looked
   through; cut-away walls and sprites too. Any other piece in front of the
   wall blocks it (the cursor is on that piece, not on the wall). An opening
   counts as the wall it sits in. Reaches the scene the way
   ./navigation_edit.js does, through the live bindings of ../view3d.js, so
   view3d.js itself does not grow. The decisions about what the sample means
   live in ../build3d_input.js (Node-testable). */
import { wallById, wallProject, wallTangentAt } from "../geometry.js";
import { descendantsOf } from "../stack.js";
import { THREE } from "../three_lazy.js";
import { camera, extTick, ready3D } from "../view3d.js";
import { pickableRoots } from "./items_layers.js";
import { targetOf } from "./navigation_edit.js";
import { cutAway, pointerRay } from "./see_through.js";

const xyz = (v) => ({ x: v.x, y: v.y, z: v.z });

/* Horizontal unit normal of the hit, pointing to the side the ray came from.
   The mesh face first; a cap (top/bottom face) or an opening falls back to the
   wall's own axis at that point. */
function faceNormal(h, wall, origin) {
  let nx = 0, nz = 0;
  if (h.face && h.object && h.object.matrixWorld) {
    const n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld));
    nx = n.x; nz = n.z;
  }
  let len = Math.hypot(nx, nz);
  if (len < 0.3) {
    const p = wallProject(wall, h.point.x, h.point.z), tan = p && wallTangentAt(wall, p.s);
    if (!tan) return null;
    nx = -tan.z; nz = tan.x; len = Math.hypot(nx, nz);
    if (!(len > 0)) return null;
  }
  nx /= len; nz /= len;
  if ((origin.x - h.point.x) * nx + (origin.z - h.point.z) * nz < 0) { nx = -nx; nz = -nz; }
  return { nx, nz };
}

/**
 * { ray:{o,d}, wall:{ id, point:{x,y,z}, nx, nz } | null } or null before the
 * 3D view is ready. `ignoreItems`: the pieces being dragged.
 */
export function dragProbe3D(cx, cy, ignoreItems) {
  if (!ready3D || !camera || extTick) return null;
  const caster = pointerRay(cx, cy);
  const ray = { o: xyz(caster.ray.origin), d: xyz(caster.ray.direction) };
  const skip = new Set();
  for (const it of ignoreItems || []) {
    if (!it || skip.has(it)) continue;
    skip.add(it);
    descendantsOf(it, skip);
  }
  const roots = pickableRoots(0).concat(pickableRoots(1));
  if (!roots.length) return { ray, wall: null };
  for (const h of caster.intersectObjects(roots, true)) {
    if (h.object.type === "Sprite" || cutAway(h.object)) continue;
    const t = targetOf(h.object);
    if (!t) continue;
    if (t.kind === "item") {
      if (skip.has(t.ref)) continue;
      return { ray, wall: null };
    }
    const wall = t.kind === "wall" ? t.ref : wallById(t.ref.wall);
    if (!wall) continue;
    const n = faceNormal(h, wall, ray.o);
    if (!n) continue;
    return { ray, wall: { id: wall.id, point: xyz(h.point), nx: n.nx, nz: n.nz } };
  }
  return { ray, wall: null };
}
