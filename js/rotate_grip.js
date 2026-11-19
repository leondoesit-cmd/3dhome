/* Geometry of the plan's rotate grip for a selected item (pure, no DOM):
   a round handle just outside the middle of the item's local back edge
   (-z), joined to it by a stem, and the angle a drag on it gives.

   Same rotation as plan2d.js / plan_symbols.js localToWorld: an item turned
   `rot` degrees maps local (lx, lz) to (x + lx·cos − lz·sin, z + lx·sin +
   lz·cos), so the handle at local (0, −r) points along (sin rot, −cos rot). */

export var GRIP_GAP_PX = 26;
export var GRIP_SNAP_DEG = 15;

/* World positions of the stem's foot (the back edge's middle) and the
   handle, `gapPx` screen pixels beyond it at `pxPerCm` zoom. */
export function rotateGrip(it, pxPerCm, gapPx) {
  var k = pxPerCm > 0 && isFinite(pxPerCm) ? pxPerCm : 1;
  var gap = (gapPx != null ? gapPx : GRIP_GAP_PX) / k;
  var a = ((Number(it.rot) || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), hd = (Number(it.d) || 0) / 2;
  function w(lx, lz) { return { x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c }; }
  return { stem: w(0, -hd), handle: w(0, -hd - gap) };
}

/* The item's angle with its handle under the pointer: snapped to 15° unless
   `free` (then whole degrees), in [0, 360). */
export function gripAngle(it, px, pz, free) {
  var dx = px - it.x, dz = pz - it.z;
  if (Math.hypot(dx, dz) < 1e-6) return ((Number(it.rot) || 0) % 360 + 360) % 360;
  var deg = (Math.atan2(dx, -dz) * 180) / Math.PI;
  deg = free ? Math.round(deg) : Math.round(deg / GRIP_SNAP_DEG) * GRIP_SNAP_DEG;
  return ((deg % 360) + 360) % 360;
}

/* Hit radius in screen pixels: a finger or a pen needs a bigger target. */
export function gripHitPx(pointerType) {
  return pointerType === "touch" || pointerType === "pen" ? 20 : 10;
}
