/* Draw cabinet (the fitcab tool, FURNITURE_PLACEMENT_PLAN.md Stage 4): the
   pure decisions behind its gestures, so Node can test them without a planner.

   - classifyFitPress: what a press starts — a box on a wall face (3D), the
     along-the-wall span (2D, press inside the depth band of a free run) or a
     floor box (everything else).
   - spanStillHolds: a 2D span drag stays one while the pointer keeps inside
     that band; leaving it turns the gesture into a floor box.
   - dragMovedPx / isRealDrag: a press released without real movement is a
     click (today's "fill the whole run").
   - wallFaceFrame / wallSample / wallRectFromSamples: the rectangle a 3D drag
     draws on a wall face, as fit_cabinet.js fitAreaBox("wall") reads it.
   - rayFloorPoint / floorRectFromSamples: the floor marquee.
   - fitFamilyFor / fitFamilyIds: which cabinet family fills the box.
   No three, no DOM, no planner state. */
import { rayToWallPlane } from "./wall_plane_snap.js";

export const FIT_CLICK_PX = 6; // screen px a press may wander and still be a click
export const FIT_CLICK_CM = 4; // the same in cm when the screen scale is unknown

function fin(v) { return typeof v === "number" && Number.isFinite(v); }
function cm(v) { return Math.round(v); }

/** "wall" | "span" | "floor".
 *  p = { in3D, aim: {wallId,...}|null, hit: {kind}|null, band: { ok, q, depth }|null }
 *  band (2D only): the free run found at the press; q = the press's distance
 *  out of the wall face (negative: on or in the wall). */
export function classifyFitPress(p) {
  p = p || {};
  if (p.in3D) {
    if (p.aim && p.aim.wallId != null) return "wall";
    if (p.hit && p.hit.kind === "wall" && p.hit.point) return "wall";
    return "floor";
  }
  var b = p.band;
  if (b && b.ok && fin(b.q) && b.q <= (fin(b.depth) ? b.depth : 60)) return "span";
  return "floor";
}

/** A 2D span drag: true while the pointer is still within the depth band in
 *  front of the face (it may run along the wall freely). */
export function spanStillHolds(q, depth, wallT) {
  if (!fin(q)) return false;
  var d = fin(depth) ? depth : 60, t = fin(wallT) ? wallT : 10;
  return q <= d && q >= -(t + 5);
}

/** Screen distance of a drag: plan cm × px per cm. */
export function dragMovedPx(distCm, pxPerCm) {
  if (!fin(distCm)) return 0;
  return Math.abs(distCm) * (fin(pxPerCm) && pxPerCm > 0 ? pxPerCm : 1);
}
export function isRealDrag(distCm, pxPerCm) {
  if (!fin(distCm)) return false;
  if (fin(pxPerCm) && pxPerCm > 0) return dragMovedPx(distCm, pxPerCm) >= FIT_CLICK_PX;
  return Math.abs(distCm) >= FIT_CLICK_CM;
}

/** The face frame of a straight wall at a pick, js/fit_cabinet.js's shape
 *  (origin on the face at the pick's projection, clamped to the wall; u along
 *  a->b; n out of the face on `side`'s side, else the pick's side).
 *  wall = { a, b, t } -> { ox, oz, ux, uz, nx, nz, s0, L } | null */
export function wallFaceFrame(wall, pick, side) {
  if (!wall || !wall.a || !wall.b || !pick) return null;
  var dx = wall.b.x - wall.a.x, dz = wall.b.z - wall.a.z, L = Math.hypot(dx, dz);
  if (!(L > 0.5) || !fin(pick.x) || !fin(pick.z)) return null;
  var ux = dx / L, uz = dz / L, nx = -uz, nz = ux, t = fin(wall.t) ? Math.max(0, wall.t) : 10;
  var sgn;
  if (side && fin(side.x) && fin(side.z) && Math.hypot(side.x, side.z) > 1e-9) sgn = side.x * nx + side.z * nz < 0 ? -1 : 1;
  else sgn = (pick.x - wall.a.x) * nx + (pick.z - wall.a.z) * nz < 0 ? -1 : 1;
  nx *= sgn; nz *= sgn;
  var s0 = Math.max(0, Math.min(L, (pick.x - wall.a.x) * ux + (pick.z - wall.a.z) * uz));
  return {
    ox: wall.a.x + ux * s0 + nx * t / 2, oz: wall.a.z + uz * s0 + nz * t / 2,
    ux: ux, uz: uz, nx: nx, nz: nz, s0: s0, L: L,
  };
}

/** Where a drag sample lands on the face: { s, y } in the frame's units.
 *  The aimed point when the cursor is on THIS wall, else the ray against the
 *  face plane (the cursor ran off the wall's mesh), else null. */
export function wallSample(frame, wallId, aim, ray) {
  if (!frame) return null;
  if (aim && String(aim.wallId) === String(wallId) && fin(aim.x) && fin(aim.z) && fin(aim.y))
    return { s: (aim.x - frame.ox) * frame.ux + (aim.z - frame.oz) * frame.uz, y: aim.y };
  var r = rayToWallPlane(ray, frame, 0);
  return r && fin(r.s) && fin(r.y) ? r : null;
}

/** fitAreaBox("wall") rect from the press and the current sample, whole cm. */
export function wallRectFromSamples(frame, wallId, pick, start, cur) {
  if (!frame || !start || !cur) return null;
  return {
    wallId: wallId, side: { x: frame.nx, z: frame.nz }, pick: { x: pick.x, z: pick.z },
    s0: cm(start.s), s1: cm(cur.s), y0: Math.max(0, cm(start.y)), y1: Math.max(0, cm(cur.y)),
  };
}

/** The ray against the floor (y = 0), or null for a ray that never meets it. */
export function rayFloorPoint(ray, floorY) {
  if (!ray || !ray.o || !ray.d) return null;
  var y = fin(floorY) ? floorY : 0, dy = ray.d.y;
  if (!fin(dy) || dy > -1e-6) return null;
  var t = (y - ray.o.y) / dy;
  if (!(t >= 0)) return null;
  var p = { x: ray.o.x + ray.d.x * t, z: ray.o.z + ray.d.z * t };
  return fin(p.x) && fin(p.z) ? p : null;
}

/** fitAreaBox("floor") rect, whole cm; a = where the drag started. */
export function floorRectFromSamples(a, b) {
  if (!a || !b || ![a.x, a.z, b.x, b.z].every(fin)) return null;
  return { a: { x: cm(a.x), z: cm(a.z) }, b: { x: cm(b.x), z: cm(b.z) } };
}

/** The front of a free-standing 3D box looks back at the camera: the ray's
 *  horizontal direction reversed, or null for a ray looking straight down. */
export function facingFromRay(ray) {
  if (!ray || !ray.d || !fin(ray.d.x) || !fin(ray.d.z)) return null;
  var L = Math.hypot(ray.d.x, ray.d.z);
  return L > 1e-6 ? { x: -ray.d.x / L, z: -ray.d.z / L } : null;
}

/* ---- which family -------------------------------------------------------- */

export const FIT_AUTO = "auto";
// a diagonal corner unit is a shape, not a fill: it never fits a drawn box
var NOT_A_FILL = { kitchenCorner: 1 };

/** The families the chooser lists, "auto" first. fams = { id: { elev } } (cabinet.js FAM). */
export function fitFamilyIds(fams) {
  return [FIT_AUTO].concat(Object.keys(fams || {}).filter(function (k) { return !NOT_A_FILL[k]; }));
}

/** Families that hang on a wall by nature (they carry an elevation). */
export function wallFamilies(fams) {
  return Object.keys(fams || {}).filter(function (k) { return !NOT_A_FILL[k] && Number(fams[k].elev) > 0; });
}

/* js/cabinet/layout.js famOf for a bare box: what "auto" means. */
function bySize(h, d) {
  if (h <= 100 && d <= 50) return "tvUnit";
  if (h <= 100) return "kitchenBase";
  if (d <= 36) return "bookcase";
  return "wardrobe";
}

/** The family for a box. q = { choice, mount, h, d }.
 *  A hung box takes the chosen family when it hangs by nature, else the
 *  upper / wall family (kitchenUpper first) when one exists. Otherwise the
 *  choice when it is a known family, else "auto" = by size, as famOf does. */
export function fitFamilyFor(q, fams) {
  q = q || {};
  fams = fams || {};
  var choice = q.choice && q.choice !== FIT_AUTO && fams[q.choice] && !NOT_A_FILL[q.choice] ? q.choice : null;
  if (q.mount === "hung") {
    var hang = wallFamilies(fams);
    if (choice && hang.indexOf(choice) >= 0) return choice;
    if (hang.length) return hang.indexOf("kitchenUpper") >= 0 ? "kitchenUpper" : hang[0];
  }
  if (choice) return choice;
  var f = bySize(Number(q.h) || 0, Number(q.d) || 0);
  return fams[f] || !Object.keys(fams).length ? f : Object.keys(fams)[0];
}
