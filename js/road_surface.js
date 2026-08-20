// Pure road-surface queries shared by the RC physics and its regression tests.
// A triangle uses the same x/y/z vertices as the rendered road mesh, flattened
// as {ax,ay,az,bx,by,bz,cx,cy,cz,minx,maxx,minz,maxz}.

// The one step-height constant for the whole RC stack: the biggest ledge a
// truck climbs without a ramp (rug, book, step-ramp). Single-sourced here —
// this leaf imports nothing — because the physics (rc_state STEP_H), the road
// builder (track.js) and the editor (rc_editor_state) used to each keep their
// own copy, and any drift between them strands trucks on phantom lips.
export const STEP_UP = 2.2;

// Height of a triangle at an x/z point. Barycentric interpolation makes the
// physics plane exactly the same plane as the two triangles drawn by WebGL.
export function triangleHeightAt(tri, x, z) {
  var den =
    (tri.bz - tri.cz) * (tri.ax - tri.cx) +
    (tri.cx - tri.bx) * (tri.az - tri.cz);
  if (Math.abs(den) < 1e-9) return null;
  var a =
    ((tri.bz - tri.cz) * (x - tri.cx) +
      (tri.cx - tri.bx) * (z - tri.cz)) /
    den;
  var b =
    ((tri.cz - tri.az) * (x - tri.cx) +
      (tri.ax - tri.cx) * (z - tri.cz)) /
    den;
  var c = 1 - a - b;
  // A small edge tolerance prevents floating-point cracks between triangles
  // which share exactly the same rendered edge. Increased to -0.02 to cover
  // seams between track sections.
  if (a < -0.02 || b < -0.02 || c < -0.02) return null;
  return a * tri.ay + b * tri.by + c * tri.cy;
}

function triangleUp(tri, out) {
  var ux = tri.bx - tri.ax,
    uy = tri.by - tri.ay,
    uz = tri.bz - tri.az;
  var vx = tri.cx - tri.ax,
    vy = tri.cy - tri.ay,
    vz = tri.cz - tri.az;
  var nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  var len = Math.hypot(nx, ny, nz) || 1;
  out = out || {};
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
  return out;
}

// Same selection as surfaceHeightAt(), plus the triangle's upward normal for
// orienting a vehicle to the bank/slope instead of leaving it horizontal.
//
// Of the layers within reach, the one NEAREST the body wins — a vehicle stays on
// its own deck through a junction. Taking the highest instead meant that wherever
// the road crossed or ran alongside another pass of itself a centimetre or two
// higher (which a route touring every room does constantly, and which a climbing
// ramp must do where it passes a level lane), the truck was lifted onto the other
// deck and dropped back off it: a lip in the lane at the same spot every lap. For
// a body resting on a surface, "nearest" is its own surface; for one in the air,
// every candidate is below it, so nearest is still the topmost thing under it.
export function surfaceSampleAt(tris, x, z, y, step, out) {
  var best = null,
    delta = Infinity;
  var top = y + step + 0.01;
  for (var i = 0; i < (tris || []).length; i++) {
    var tri = tris[i];
    if (x < tri.minx - 1.0 || x > tri.maxx + 1.0 || z < tri.minz - 1.0 || z > tri.maxz + 1.0)
      continue;
    var h = triangleHeightAt(tri, x, z);
    if (h == null || h > top) continue;
    var d = Math.abs(h - y);
    // ties (two coplanar passes) go to the higher one, so the truck rides on top
    if (d > delta || (d === delta && best && h <= best.height)) continue;
    delta = d;
    // Callers in the physics hot path pass `out` (one scratch per vehicle):
    // sampling runs per car per substep and must not churn objects.
    best = out || {};
    best.height = h;
    best.normal = triangleUp(tri, best.normal);
  }
  return best;
}

// Road layer a truck at this height drives on. Underpasses stay valid: a high
// flyover is out of reach when the truck is on the floor.
export function surfaceHeightAt(tris, x, z, y, step) {
  var sample = surfaceSampleAt(tris, x, z, y, step);
  return sample ? sample.height : null;
}

// Road layer nearest to a body at y, used only for on-road/race-bound checks.
export function surfaceHeightNear(tris, x, z, y, tolerance) {
  var best = null;
  var delta = Infinity;
  for (var i = 0; i < (tris || []).length; i++) {
    var tri = tris[i];
    if (x < tri.minx - 1.0 || x > tri.maxx + 1.0 || z < tri.minz - 1.0 || z > tri.maxz + 1.0)
      continue;
    var h = triangleHeightAt(tri, x, z);
    if (h == null) continue;
    var d = Math.abs(h - y);
    if (d <= tolerance && d < delta) {
      best = h;
      delta = d;
    }
  }
  return best;
}
