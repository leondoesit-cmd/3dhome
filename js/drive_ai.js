// AI traffic — cars that actually drive the streamed road network.
//
// Every vehicle used to be parked, which made the city read as a diorama the
// moment the pedestrians started moving. These pick a streamed way, hold a lane
// on the right of it, brake for whatever is in front (you, each other, someone
// crossing) and hand themselves on to a connected way at the end.
//
// Spawning happens from the frame loop rather than from dressWay(), so density
// follows the player instead of whichever chunk streamed first — and so this
// module can import drive_traffic.js without closing a cycle.
import { D, car, player, PARKED_COLORS } from "./drive_state.js";
import { CAR_TYPES } from "./drive_car_mesh.js";
import {
  disposeVehicleMesh, placeVehicleMesh, spawnVehicle, syncVehicleLights,
} from "./drive_traffic.js";
import { focusPos, insideBuilding } from "./drive_world.js";

export const MAX_AI = 14;
const SPAWN_MIN = 55, // never appear in the player's lap…
  SPAWN_MAX = 190, // …nor so far away that nobody ever meets them
  DESPAWN = 300,
  LOOK_AHEAD = 13, // metres of clear road wanted in front
  JOIN_R = 14; // how close two way ends must be to count as connected

// target cruise for a road class — a service road is not a boulevard
function laneSpeed(wid) {
  return wid >= 11 ? 15.5 : wid >= 8 ? 12 : wid >= 6 ? 9.5 : 7;
}
export function aiCount() {
  let n = 0;
  for (const v of D.vehicles) if (v.ai) n++;
  return n;
}
// lane centre: half a carriageway to the right of the centreline, in the
// direction this car is travelling
function lanePoint(way, idx, dir) {
  const pts = way.pts;
  const i = Math.max(0, Math.min(pts.length - 1, idx));
  const a = pts[Math.max(0, i - 1)],
    b = pts[Math.min(pts.length - 1, i + 1)];
  let dx = (b.x - a.x) * dir,
    dz = (b.z - a.z) * dir;
  const l = Math.hypot(dx, dz) || 1;
  const off = Math.min(2.2, way.wid / 4);
  return { x: pts[i].x + (dz / l) * off, z: pts[i].z - (dx / l) * off };
}
// hand the car on to a way that starts where this one ends; failing that,
// turn round rather than drive into a field
function nextLeg(a) {
  const pts = a.way.pts;
  const end = a.dir > 0 ? pts[pts.length - 1] : pts[0];
  const cands = [];
  for (const w of D.ways) {
    if (w === a.way || w.pts.length < 2) continue;
    const s = w.pts[0],
      e = w.pts[w.pts.length - 1];
    if (Math.hypot(s.x - end.x, s.z - end.z) < JOIN_R) cands.push({ w, dir: 1, i: 0 });
    else if (Math.hypot(e.x - end.x, e.z - end.z) < JOIN_R)
      cands.push({ w, dir: -1, i: w.pts.length - 1 });
  }
  if (cands.length) {
    const c = cands[Math.floor(Math.random() * cands.length)];
    a.way = c.w;
    a.dir = c.dir;
    a.i = c.i + c.dir;
    return;
  }
  a.dir = -a.dir;
  a.i += a.dir;
}
export function spawnAI() {
  const fp = focusPos();
  const near = D.ways.filter((w) => {
    if (w.wid < 5.5 || w.pts.length < 2) return false;
    const d = Math.hypot(w.pts[0].x - fp.x, w.pts[0].z - fp.z);
    return d > SPAWN_MIN && d < SPAWN_MAX;
  });
  if (!near.length) return null;
  const way = near[Math.floor(Math.random() * near.length)];
  const dir = Math.random() < 0.5 ? 1 : -1;
  const i = dir > 0 ? 0 : way.pts.length - 1;
  const p = lanePoint(way, i, dir);
  if (insideBuilding(p.x, p.z)) return null;
  for (const v of D.vehicles) if (Math.hypot(v.x - p.x, v.z - p.z) < 9) return null;
  const nxt = lanePoint(way, i + dir, dir);
  const heading = Math.atan2(nxt.x - p.x, -(nxt.z - p.z));
  const id = D.vehicles.length + Math.floor(Math.random() * 97);
  const v = spawnVehicle(
    PARKED_COLORS[id % PARKED_COLORS.length],
    p.x, p.z, heading,
    id % CAR_TYPES.length,
  );
  v.ai = {
    way, dir,
    i: i + dir,
    speed: 0,
    cruise: laneSpeed(way.wid) * (0.85 + Math.random() * 0.3),
  };
  return v;
}
// Anything in our lane worth lifting off for: the player, other traffic, and
// people in the road (they get to cross, we get to not run them over).
function blocked(v, hx, hz) {
  for (const o of D.vehicles) {
    if (o === v) continue;
    const dx = o.x - v.x,
      dz = o.z - v.z;
    const ahead = dx * hx + dz * hz;
    if (ahead < 0.5 || ahead > LOOK_AHEAD) continue;
    // A PARKED car sits at the kerb, barely a metre outside the lane, so the
    // wide gate used for moving traffic left the whole city queued behind
    // empty cars forever. Only brake for one that is genuinely in the way.
    const side = Math.abs(dx * hz - dz * hx);
    if (side < (o.ai ? 2.4 : 1.5)) return ahead;
  }
  if (!player.onFoot) {
    const dx = car.x - v.x,
      dz = car.z - v.z;
    const ahead = dx * hx + dz * hz;
    if (ahead > 0.5 && ahead < LOOK_AHEAD && Math.abs(dx * hz - dz * hx) < 2.6) return ahead;
  }
  for (const p of D.peds) {
    const dx = p.x - v.x,
      dz = p.z - v.z;
    const ahead = dx * hx + dz * hz;
    if (ahead > 0.5 && ahead < 9 && Math.abs(dx * hz - dz * hx) < 2.2) return ahead;
  }
  return 0;
}
function driveOne(v, dt) {
  const a = v.ai;
  if (v.wrecked) {
    a.speed *= 0.9; // a wreck coasts to a stop and stays there
    return;
  }
  // Walk past every lane point already behind us in ONE tick: OSM ways carry
  // clusters of close vertices, and advancing a single index per frame made
  // cars crawl through them.
  let tgt = lanePoint(a.way, a.i, a.dir),
    dx = tgt.x - v.x,
    dz = tgt.z - v.z,
    d = Math.hypot(dx, dz);
  for (let guard = 0; guard < 8 && d < 4.5; guard++) {
    a.i += a.dir;
    if (a.i < 0 || a.i >= a.way.pts.length) nextLeg(a);
    tgt = lanePoint(a.way, a.i, a.dir);
    dx = tgt.x - v.x;
    dz = tgt.z - v.z;
    d = Math.hypot(dx, dz);
  }
  // steer: turn toward the lane point, capped so nobody pirouettes
  const want = Math.atan2(dx, -dz);
  let turn = want - v.heading;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  const rate = Math.max(-1.6, Math.min(1.6, turn * 2.2));
  v.heading += rate * dt;
  const hx = Math.sin(v.heading),
    hz = -Math.cos(v.heading);
  // slow for the corner ahead and for whatever is in the lane
  let cruise = a.cruise * (1 - Math.min(0.65, Math.abs(turn) * 0.8));
  const gap = blocked(v, hx, hz);
  if (gap) cruise = Math.min(cruise, Math.max(0, (gap - 4.5) * 1.6));
  v.braking = cruise < a.speed - 0.6;
  a.speed += (cruise - a.speed) * Math.min(1, (v.braking ? 3.4 : 1.5) * dt);
  v.x += hx * a.speed * dt;
  v.z += hz * a.speed * dt;
  // deadlock guard: two cars nose to nose, or a wreck across the lane, would
  // otherwise leave a permanent traffic jam nobody can clear
  a.stuck = a.speed < 0.6 ? (a.stuck || 0) + dt : 0;
  if (a.stuck > 5) {
    a.stuck = 0;
    a.dir = -a.dir;
    a.i += a.dir;
  }
}
export function trafficTick(dt, now) {
  const fp = focusPos();
  for (let i = D.vehicles.length - 1; i >= 0; i--) {
    const v = D.vehicles[i];
    if (!v.ai) continue;
    if (v === D.activeV) {
      // the player stole it mid-journey: it is their car now
      v.ai = null;
      continue;
    }
    if (Math.hypot(v.x - fp.x, v.z - fp.z) > DESPAWN) {
      disposeVehicleMesh(v);
      D.vehicles.splice(i, 1);
      continue;
    }
    driveOne(v, dt);
    placeVehicleMesh(v);
    syncVehicleLights(v);
  }
  // top the traffic up, one car per tick at most
  if (aiCount() < MAX_AI && now - (D.aiSpawnAt || 0) > 450) {
    D.aiSpawnAt = now;
    spawnAI();
  }
}
// introspection for tests/console
export function debugTraffic() {
  const ai = D.vehicles.filter((v) => v.ai);
  return {
    count: ai.length,
    moving: ai.filter((v) => v.ai.speed > 1).length,
    braking: ai.filter((v) => v.braking).length,
    wrecked: ai.filter((v) => v.wrecked).length,
    kmh: ai.map((v) => Math.round(v.ai.speed * 3.6)),
  };
}
