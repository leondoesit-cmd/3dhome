/* Night Shift zombie navigation: the flow-field grid, waypoint steering and
   climbing in through windows. The pure grid/flow maths is in
   ../zombies_rules.js; this piece owns building it against the live collision
   snapshot (a few rows per frame), refreshing the field as the player moves,
   and the steering/vault code stepZed calls. */
import * as Col2D from "../col2d.js";
import { STEP, Z, hooks, rnd } from "../zombies_state.js";
import { navFillRows, navFlow, navGrid, navLink, navNearestFree, navStep } from "../zombies_rules.js";
import { blockedAt, interiorBounds, losClear } from "../zombies_world.js";
import { shake } from "../zombies_world/fx_gore.js";

var NAV_SPACING = 40,
  NAV_MARGIN = 360,      // spawn points sit 160-180cm outside doors/windows
  NAV_PROBE = 16,        // body radius the grid is cleared for (narrow halls)
  NAV_MAX_CELLS = 40000, // a whole site plan is not worth a grid
  WINDOW_COST = 6,       // climbing is slower than walking ~2.4m round a wall
  DOOR_COST = 3;         // ~1.1m straight through the frame

var nav = { col: null, grid: null, dist: null, navCol: null, cell: -1, flowT: 0 };

export function resetNav() {
  nav.col = nav.grid = nav.dist = nav.navCol = null;
  nav.cell = -1;
}

export function navReady() {
  return !!(nav.grid && nav.grid.ready && nav.dist);
}

// Closed doors are passable to the planner (zombies shove them open) — the
// grid probes a copy of the snapshot without them.
function navBlocked(x, z) {
  return Col2D.blockedAt(nav.navCol, x, z, NAV_PROBE, 0, 160, STEP);
}

// Windows to climb, and every door frame: a door narrower than a grid cell
// plus body clearance would otherwise cut its room off from the field.
function linkPortals(grid) {
  (Z.col.windows || []).forEach(function (w) {
    if (w.sill > 130 || w.w < 50 || w.h < 60) return;
    var ix = w.x - w.nx * 60, iz = w.z - w.nz * 60,
      ox = w.x + w.nx * 60, oz = w.z + w.nz * 60;
    if (navBlocked(ix, iz) || navBlocked(ox, oz)) return;
    navLink(grid, ix, iz, ox, oz, WINDOW_COST, { vault: true, x: w.x, z: w.z, nx: w.nx, nz: w.nz, sill: w.sill });
  });
  (Z.col.doorSegs || []).forEach(function (d) {
    var mx = (d.ax + d.bx) / 2, mz = (d.az + d.bz) / 2,
      len = Math.hypot(d.bx - d.ax, d.bz - d.az) || 1,
      nx = -(d.bz - d.az) / len, nz = (d.bx - d.ax) / len,
      off = (d.half || 6) + 48;
    var ax = mx + nx * off, az = mz + nz * off, bx = mx - nx * off, bz = mz - nz * off;
    if (navBlocked(ax, az) || navBlocked(bx, bz)) return;
    navLink(grid, ax, az, bx, bz, DOOR_COST, { vault: false, x: mx, z: mz });
  });
}

// Called once per frame before the zombies step.
export function stepNav(dt) {
  if (!Z.col || !Z.p) return;
  if (nav.col !== Z.col) {
    var b = interiorBounds();
    nav.col = Z.col;
    nav.grid = null;
    if (!b) return;
    var g = navGrid(b, NAV_SPACING, NAV_MARGIN);
    if (g.nx * g.nz > NAV_MAX_CELLS) return;
    nav.navCol = { segs: Z.col.segs, rects: Z.col.rects, doorSegs: [] };
    Col2D.buildSpatialIndex(nav.navCol, 180);
    nav.next = g;
  }
  // Build the replacement grid in slices; keep steering on the old one meanwhile.
  if (nav.next) {
    var t0 = performance.now();
    while (!navFillRows(nav.next, navBlocked, 2) && performance.now() - t0 < 2.5);
    if (nav.next.ready) {
      linkPortals(nav.next);
      nav.grid = nav.next;
      nav.next = null;
      nav.cell = -1;
    }
  }
  if (!nav.grid) return;
  nav.flowT -= dt;
  var c = Math.round((Z.p.x - nav.grid.ox) / nav.grid.sp) + "," + Math.round((Z.p.z - nav.grid.oz) / nav.grid.sp);
  if (c !== nav.cell || nav.flowT <= 0) {
    nav.cell = c;
    nav.flowT = 0.5; // doors/barricades never change the grid, only the player moves
    nav.dist = navFlow(nav.grid, Z.p.x, Z.p.z, nav.dist);
  }
}

// Next waypoint toward the player, or null to steer straight at it.
function navWaypoint(zd, dt) {
  zd.navT = (zd.navT || 0) - dt;
  if (zd.navT > 0) return zd.navWp;
  zd.navT = 0.15 + rnd() * 0.05;
  zd.navWp = null;
  if (!navReady()) return null;
  var s = navStep(nav.grid, nav.dist, zd.x, zd.z, 2);
  if (unstick(zd, s)) return null;
  if (!s) return null;
  if (s.link && s.link.data.vault) {
    if (Math.hypot(s.link.data.x - zd.x, s.link.data.z - zd.z) < 95) startVault(zd, s.link);
  } else if (s.steps * nav.grid.sp < zd.dist * 1.3 + 60 && losClear(zd.x, zd.z, Z.p.x, Z.p.z)) {
    // Nothing worth routing round (sight ignores furniture, so the walk length
    // decides): keep the straight chase and the runners' lead.
    return null;
  }
  zd.navWp = s;
  return s;
}

// A zombie boxed into a furniture pocket, or grinding on the same spot, is
// moved — out of the player's sight — to a door or window it can walk from.
function unstick(zd, s) {
  var now = Z.t || 0;
  if (zd.progT == null || Math.hypot(zd.x - zd.progX, zd.z - zd.progZ) > 40 || zd.state === "attack" || zd.dist < 160) {
    zd.progT = now;
    zd.progX = zd.x;
    zd.progZ = zd.z;
    if (s) return false;
  }
  if (now - zd.progT < (s ? 7 : 3.5) || losClear(zd.x, zd.z, Z.p.x, Z.p.z)) return false;
  var best = null, bestD = Infinity;
  nav.grid.links.forEach(function (list, cell) {
    if (nav.dist[cell] < 0) return;
    var x = nav.grid.ox + (cell % nav.grid.nx) * nav.grid.sp,
      z = nav.grid.oz + ((cell / nav.grid.nx) | 0) * nav.grid.sp,
      d = Math.hypot(x - zd.x, z - zd.z),
      dp = Math.hypot(x - Z.p.x, z - Z.p.z);
    if (dp < 450 || d >= bestD || losClear(x, z, Z.p.x, Z.p.z)) return;
    best = { x: x, z: z };
    bestD = d;
  });
  zd.progT = now;
  if (!best) return false;
  zd.x = zd.progX = best.x;
  zd.z = zd.progZ = best.z;
  zd.steer = null;
  return true;
}

function startVault(zd, link) {
  var w = link.data,
    side = (zd.x - w.x) * w.nx + (zd.z - w.z) * w.nz > 0 ? 1 : -1,
    span = zd.type === "brute" || zd.type === "titan" ? 70 : 58;
  zd.vault = {
    t: 0,
    dur: zd.type === "runner" ? 0.75 : zd.type === "brute" || zd.type === "titan" || zd.crawler ? 1.35 : 1.05,
    ax: zd.x, az: zd.z, ay: zd.y,
    bx: w.x - w.nx * side * span, bz: w.z - w.nz * side * span,
    sill: Math.max(40, w.sill),
  };
  zd.navT = 0;
  hooks.sndDoor && hooks.sndDoor(w.x, w.z);
  hooks.sndGrowl && hooks.sndGrowl(zd, true);
  if (Math.hypot(Z.p.x - w.x, Z.p.z - w.z) < 700) shake(0.2);
}

// Climbing through a window: no collision, a hop over the sill. True while busy.
export function stepVault(zd, dt) {
  var v = zd.vault;
  if (!v) return false;
  v.t += dt;
  var k = Math.min(1, v.t / v.dur), e = k * k * (3 - 2 * k);
  zd.x = v.ax + (v.bx - v.ax) * e;
  zd.z = v.az + (v.bz - v.az) * e;
  zd.y = v.ay + Math.sin(Math.PI * Math.min(1, k * 1.15)) * (v.sill + 6) * (k < 0.85 ? 1 : (1 - k) / 0.15);
  if (k >= 1) {
    zd.vault = null;
    zd.y = v.ay;
    zd.vy = 0;
  }
  zd.head = Math.atan2(v.bx - v.ax, v.bz - v.az);
  zd.root.position.set(zd.x, zd.y, zd.z);
  zd.root.rotation.y = zd.head;
  return true;
}

// Heading for this step: a waypoint from the flow field while chasing, then
// wall feelers that slide along whatever is still in the way.
export function steerZed(zd, tx, tz, dt) {
  var chasing = zd.alerted && zd.state !== "tease" && !(zd.burn > 0 && zd.panicT > 0);
  var wp = chasing ? navWaypoint(zd, dt) : null;
  if (wp) {
    tx = wp.x;
    tz = wp.z;
  }
  var ang = Math.atan2(tx - zd.x, tz - zd.z);
  // wall feelers: probe left/right and slide along obstacles (crude but it
  // gets them through doorways, which is all a house needs)
  zd.feel += dt;
  if (zd.feel > 0.1) {
    zd.feel = 0;
    var probe = zd.type === "brute" ? 78 : 64,
      best = ang,
      found = false;
    for (var o = 0; o <= 6 && !found; o++) {
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var a2 = ang + sgn * o * 0.32;
        if (
          !blockedAt(
            zd.x + Math.sin(a2) * probe,
            zd.z + Math.cos(a2) * probe,
            20, zd.y, zd.crawler ? 60 : 160, STEP
          )
        ) {
          best = a2;
          found = true;
          break;
        }
        if (o === 0) break;
      }
    }
    zd.steer = best;
  }
  return zd.steer != null ? zd.steer : ang;
}

// For zDebug and live checks: what the field says about a point.
export function navInfo(x, z) {
  var g = nav.grid;
  if (!g) return { ready: false, building: !!nav.next };
  var c = navNearestFree(g, x, z);
  return { ready: navReady(), cells: g.nx * g.nz, links: g.links.size, cell: c, steps: c >= 0 && nav.dist ? nav.dist[c] : null };
}
