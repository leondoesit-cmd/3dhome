// Apartment rulebook: one place that says what a "correct" generated (or
// hand-drawn) apartment is, as checks that return concrete violations rather
// than a pass/fail flag. The generator is held to zero errors by
// tests/apartment_rules.test.mjs; warnings are design advice it should avoid
// whenever the room allows.
//
// Plan units are centimetres. Item rotations are orthogonal: rot 0 puts the
// back of a piece toward -z and its front toward +z.
import { S, WALL_T } from "./state.js";
import { detectRooms, wallGeom, pointInPoly } from "./geometry.js";
import { roomTypeOf } from "./room_types.js";

export const HABITABLE = new Set(["living", "livingKitchen", "kitchen", "dining", "bedroom", "masterBedroom", "kidsRoom", "office"]);
export const SLEEPING = new Set(["bedroom", "masterBedroom", "kidsRoom"]);
const WET = new Set(["bathroom", "ensuite", "wc"]);
const CIRCULATION = new Set(["corridor", "entry", "landing", "hall"]);
const PUBLIC = new Set(["living", "livingKitchen", "dining", "corridor", "entry", "landing", "hall"]);

// Pieces that never take floor space: ceiling/wall fixtures, decor, and items
// that sit on another piece. Everything else is a physical floor obstacle.
export const OVERLAY = new Set(["rug", "ceilingLight", "pendant", "trackLight", "lightStrip", "art", "wallMirror", "ac", "hood",
  "acDiffuser", "acReturn", "acCassette", "acDucted", "tvWall", "tableLamp", "laptop"]);

// Clear floor in front of a piece needed to use it (cm). Kitchen modules share
// one 90cm work aisle; sanitary minimums follow common residential codes.
export const FRONT_CLEARANCE = Object.freeze({
  wardrobe: 70, dresser: 60, bookshelf: 50, sideboard: 50, shoeCab: 50, desk: 60,
  fridge: 90, base: 90, sink: 90, dishwasher: 90, cooktop: 90, oven: 90,
  toilet: 53, shower: 60, vanity: 53, washer: 90,
});
// Pieces whose back belongs against a wall.
export const WALL_BACKED = new Set(["bed", "bunk", "wardrobe", "dresser", "bookshelf", "sideboard", "shoeCab", "desk",
  "fridge", "base", "sink", "dishwasher", "cooktop", "oven", "toilet", "vanity", "shower", "nightstand"]);
// A front zone may legitimately contain its partner (the chair in front of a
// desk, the coffee table in front of a sofa).
const PARTNERS = {
  desk: ["officeChair", "chair"], table: ["chair"], island: ["barstool"], sofa: ["coffee"],
};
const KITCHEN_MODULES = new Set(["fridge", "base", "sink", "dishwasher", "cooktop", "oven"]);
const LIGHTS = new Set(["ceilingLight", "pendant", "trackLight", "lightStrip", "floorLamp", "tableLamp"]);

const MIN_ROOM = {
  masterBedroom: { area: 10.5, side: 270 },
  bedroom: { area: 7, side: 240 },
  kidsRoom: { area: 7, side: 240 },
  bathroom: { area: 2.8, side: 150 },
  ensuite: { area: 2.8, side: 150 },
  kitchen: { area: 5, side: 180 },
  living: { area: 12, side: 300 },
  livingKitchen: { area: 18, side: 300 },
  corridor: { side: 90 },
};

export function halfExtents(it) {
  let r = ((it.rot || 0) % 180 + 180) % 180;
  return r >= 45 && r < 135 ? { hx: (it.d || 0) / 2, hz: (it.w || 0) / 2 } : { hx: (it.w || 0) / 2, hz: (it.d || 0) / 2 };
}
export function itemBox(it, grow = 0) {
  let h = halfExtents(it);
  return { x0: it.x - h.hx - grow, x1: it.x + h.hx + grow, z0: it.z - h.hz - grow, z1: it.z + h.hz + grow };
}
export function boxesOverlap(a, b, gap = 0) {
  return a.x0 < b.x1 + gap - 0.1 && a.x1 > b.x0 - gap + 0.1 && a.z0 < b.z1 + gap - 0.1 && a.z1 > b.z0 - gap + 0.1;
}
export function frontVector(rot) {
  let rad = (rot || 0) * Math.PI / 180;
  return { x: Math.round(-Math.sin(rad) * 1e6) / 1e6, z: Math.round(Math.cos(rad) * 1e6) / 1e6 };
}
// Axis-aligned box of the strip `depth` deep directly in front of a piece.
export function frontZone(it, depth, widthPad = 0) {
  let f = frontVector(it.rot), h = halfExtents(it);
  let along = (Math.abs(f.x) > 0.5 ? h.hz : h.hx) + widthPad;
  if (f.z > 0.5) return { x0: it.x - along, x1: it.x + along, z0: it.z + h.hz, z1: it.z + h.hz + depth };
  if (f.z < -0.5) return { x0: it.x - along, x1: it.x + along, z0: it.z - h.hz - depth, z1: it.z - h.hz };
  if (f.x > 0.5) return { x0: it.x + h.hx, x1: it.x + h.hx + depth, z0: it.z - along, z1: it.z + along };
  return { x0: it.x - h.hx - depth, x1: it.x - h.hx, z0: it.z - along, z1: it.z + along };
}
// The strips beside a bed you step into it from: 60cm wide, from just past the
// nightstands to the foot.
export function bedSideZones(bed, width = 60) {
  let f = frontVector(bed.rot), b = itemBox(bed), head = 45;
  if (Math.abs(f.z) > 0.5) {
    let z0 = f.z > 0 ? b.z0 + head : b.z0, z1 = f.z > 0 ? b.z1 : b.z1 - head;
    return [{ x0: b.x0 - width, x1: b.x0, z0, z1 }, { x0: b.x1, x1: b.x1 + width, z0, z1 }];
  }
  let x0 = f.x > 0 ? b.x0 + head : b.x0, x1 = f.x > 0 ? b.x1 : b.x1 - head;
  return [{ x0, x1, z0: b.z0 - width, z1: b.z0 }, { x0, x1, z0: b.z1, z1: b.z1 + width }];
}
function roomBox(room) {
  let xs = room.pts.map(p => p.x), zs = room.pts.map(p => p.z);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
// The finished floor: room polygons follow wall centre lines.
function interiorBox(room) {
  let b = roomBox(room), t = WALL_T / 2;
  return { x0: b.x0 + t, x1: b.x1 - t, z0: b.z0 + t, z1: b.z1 - t };
}
function boxInside(inner, outer, tol = 1) {
  return inner.x0 >= outer.x0 - tol && inner.x1 <= outer.x1 + tol && inner.z0 >= outer.z0 - tol && inner.z1 <= outer.z1 + tol;
}
function boxInRoom(box, room, tol = 1) {
  return boxInside(box, interiorBox(room), tol) &&
    [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]].every(([x, z]) =>
      pointInPoly(Math.min(Math.max(x, box.x0 + tol), box.x1 - tol), Math.min(Math.max(z, box.z0 + tol), box.z1 - tol), room.pts));
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].z - pts[i].z);
  return Math.abs(a / 2);
}
// Distance from a piece's back face to the nearest finished wall face.
function backGap(it, room) {
  let b = itemBox(it), ib = interiorBox(room), f = frontVector(it.rot);
  if (f.z > 0.5) return b.z0 - ib.z0;
  if (f.z < -0.5) return ib.z1 - b.z1;
  if (f.x > 0.5) return b.x0 - ib.x0;
  return ib.x1 - b.x1;
}

function openingGeometry(op, walls) {
  let w = walls.find(x => x.id === op.wall);
  if (!w) return null;
  let g = wallGeom(w);
  let c = { x: g.a.x + g.ux * op.s, z: g.a.z + g.uz * op.s };
  return { wall: w, g, c, n: { x: -g.uz, z: g.ux }, along: { x: g.ux, z: g.uz } };
}
function roomAt(rooms, x, z) {
  return rooms.find(r => pointInPoly(x, z, r.pts)) || null;
}
// Which rooms (or "outside") an opening joins.
function openingSides(op, walls, rooms) {
  let geo = openingGeometry(op, walls);
  if (!geo) return null;
  let probe = WALL_T / 2 + 12;
  let a = roomAt(rooms, geo.c.x + geo.n.x * probe, geo.c.z + geo.n.z * probe);
  let b = roomAt(rooms, geo.c.x - geo.n.x * probe, geo.c.z - geo.n.z * probe);
  return { geo, a, b };
}
// Clear floor on both faces of a door: the leaf's swing and the approach.
export function doorClearZones(op, walls, depth) {
  let geo = openingGeometry(op, walls);
  if (!geo) return [];
  let half = op.width / 2 + 5, t = WALL_T / 2;
  return [1, -1].map(side => {
    let p0 = { x: geo.c.x + geo.along.x * half + geo.n.x * side * t, z: geo.c.z + geo.along.z * half + geo.n.z * side * t };
    let p1 = { x: geo.c.x - geo.along.x * half + geo.n.x * side * (t + depth), z: geo.c.z - geo.along.z * half + geo.n.z * side * (t + depth) };
    return { x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x), z0: Math.min(p0.z, p1.z), z1: Math.max(p0.z, p1.z) };
  });
}

function blocking(it) {
  return !OVERLAY.has(it.type) && it.supportId == null && !it.mounted;
}
export function partnersOf(a, b) {
  return (PARTNERS[a.type] || []).includes(b.type) || (a.groupId != null && a.groupId === b.groupId && !KITCHEN_MODULES.has(b.type)) ||
    (a.facesId != null && a.facesId === b.id) || (b.facesId != null && b.facesId === a.id);
}

/* Audit a plan. Returns { violations, errors, warnings, rooms }. Each violation
   names its rule, a severity, the room and the items involved, so the UI can
   point at it and the tests can say exactly which rule a generator broke.
   options.rooms limits the audit to those detected rooms (e.g. only the
   apartment just generated beside an existing one). */
export function auditApartment(state = S, options = {}) {
  let walls = state.walls || [], openings = state.openings || [], items = state.items || [];
  let rooms = options.rooms || detectRooms();
  let violations = [];
  let add = (rule, severity, room, message, itemIds = []) =>
    violations.push({ rule, severity, room: room ? room.key : null, roomName: room ? nameOf(room) : null, message, items: itemIds });
  let meta = state.roomMeta || {};
  let typeOf = room => roomTypeOf(meta[room.key]) || null;
  let nameOf = room => (meta[room.key] && meta[room.key].name) || typeOf(room) || "room";
  let inRoom = room => items.filter(it => pointInPoly(it.x, it.z, room.pts));

  // ---- the room graph: doors and passages joining rooms ----
  let graph = new Map(rooms.map(r => [r.key, new Set()]));
  let entrances = [];
  openings.filter(op => op.type === "door" || op.type === "passage").forEach(op => {
    let sides = openingSides(op, walls, rooms);
    if (!sides) return;
    let { a, b } = sides;
    if (a && b && a !== b) { graph.get(a.key)?.add(b.key); graph.get(b.key)?.add(a.key); }
    else if (a && !b || b && !a) {
      let room = a || b;
      if (rooms.includes(room)) entrances.push({ op, room });
    }
  });

  if (rooms.length > 1 || entrances.length) {
    if (!entrances.length) add("entrance", "error", null, "The apartment has no front door");
    entrances.forEach(({ room }) => {
      let type = typeOf(room);
      if (SLEEPING.has(type) || WET.has(type))
        add("entrance", "error", room, "The front door opens straight into a " + (type || "private room"));
    });
    if (entrances.length) {
      let start = entrances.map(e => e.room.key);
      let reach = (skip) => {
        let seen = new Set(start.filter(k => k !== skip)), queue = [...seen];
        while (queue.length) {
          let k = queue.shift();
          graph.get(k).forEach(n => { if (n !== skip && !seen.has(n)) { seen.add(n); queue.push(n); } });
        }
        return seen;
      };
      let all = reach(null);
      rooms.forEach(room => {
        if (!all.has(room.key)) add("reachable", "error", room, nameOf(room) + " cannot be reached from the front door");
      });
      // Privacy: nobody should walk through a bedroom or bathroom to get to
      // another room, unless that room is its own ensuite or walk-in.
      rooms.filter(r => SLEEPING.has(typeOf(r)) || WET.has(typeOf(r))).forEach(room => {
        let without = reach(room.key);
        rooms.forEach(other => {
          if (other === room || without.has(other.key) || !all.has(other.key)) return;
          let otherType = typeOf(other);
          if (SLEEPING.has(typeOf(room)) && (otherType === "ensuite" || otherType === "closet")) return;
          add("privacy", "error", other, nameOf(other) + " is only reachable through " + nameOf(room), []);
        });
      });
    }
    rooms.filter(r => WET.has(typeOf(r)) && typeOf(r) !== "ensuite").forEach(room => {
      graph.get(room.key).forEach(k => {
        let other = rooms.find(r => r.key === k);
        if (typeOf(other) === "kitchen" || typeOf(other) === "dining")
          add("wet-room-door", "error", room, nameOf(room) + " opens directly into the " + nameOf(other));
      });
    });
  }

  rooms.forEach(room => {
    let type = typeOf(room), b = interiorBox(room);
    // usable (finished-floor) area: the centre-line polygon less half a wall all round
    let perimeter = room.pts.reduce((sum, p, i) => sum + Math.hypot(room.pts[(i + 1) % room.pts.length].x - p.x, room.pts[(i + 1) % room.pts.length].z - p.z), 0);
    let area = (polyArea(room.pts) - perimeter * WALL_T / 2 + room.pts.length * WALL_T * WALL_T / 4) / 10000;
    let shortSide = Math.min(b.x1 - b.x0, b.z1 - b.z0);
    let min = MIN_ROOM[type];
    if (min && ((min.area && area < min.area - 0.05) || (min.side && shortSide < min.side - 1)))
      add("room-size", "error", room, nameOf(room) + " is below the minimum size (" + area.toFixed(1) + " m², narrowest " + Math.round(shortSide) + " cm)");

    // Daylight: every habitable room gets a window, with glazing of at least
    // a tenth of its floor area where the facade allows.
    if (HABITABLE.has(type)) {
      let glazing = 0;
      openings.filter(op => op.type === "window").forEach(op => {
        let sides = openingSides(op, walls, rooms);
        if (sides && (sides.a === room || sides.b === room)) glazing += op.width * op.height / 10000;
      });
      if (!glazing) add("daylight", "error", room, nameOf(room) + " has no window");
      else if (glazing < area * 0.1 - 1e-6) add("daylight", "warn", room, nameOf(room) + " glazing is under 10% of its floor area");
    }

    let here = inRoom(room), floor = here.filter(blocking);
    let has = t => here.some(it => it.type === t);

    // ---- physical fit ----
    floor.forEach(it => {
      if (!boxInRoom(itemBox(it), room)) add("inside-room", "error", room, it.type + " pokes through a wall", [it.id]);
    });
    for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
      if (boxesOverlap(itemBox(floor[i]), itemBox(floor[j])))
        add("overlap", "error", room, floor[i].type + " overlaps " + floor[j].type, [floor[i].id, floor[j].id]);
    }
    // ---- doors and windows stay usable ----
    openings.forEach(op => {
      let sides = openingSides(op, walls, rooms);
      if (!sides || (sides.a !== room && sides.b !== room)) return;
      if (op.type === "door" || op.type === "passage") {
        let depth = op.type === "door" ? Math.min(op.width, 90) : 60;
        doorClearZones(op, walls, depth).forEach(zone => floor.forEach(it => {
          if (boxesOverlap(itemBox(it), zone)) add("door-clearance", "error", room, it.type + " blocks a doorway", [it.id]);
        }));
      } else if (op.type === "window") {
        let zone = doorClearZones(op, walls, 30).map(z => z);
        floor.filter(it => (it.h || 0) > (op.sill || 0) + 10 && (it.h || 0) > 100).forEach(it => {
          if (zone.some(z => boxesOverlap(itemBox(it), z))) add("window-blocked", "warn", room, it.type + " stands in front of a window", [it.id]);
        });
      }
    });
    // ---- every piece can be used ----
    floor.forEach(it => {
      let depth = FRONT_CLEARANCE[it.type];
      if (!depth) return;
      let zone = frontZone(it, depth);
      if (!boxInside(zone, interiorBox(room), 1)) { add("access", "error", room, it.type + " has no room in front of it", [it.id]); return; }
      let blocker = floor.find(o => o !== it && !partnersOf(it, o) && !(KITCHEN_MODULES.has(it.type) && KITCHEN_MODULES.has(o.type) && o.groupId === it.groupId) && boxesOverlap(zone, itemBox(o)));
      if (blocker) add("access", "error", room, blocker.type + " blocks the front of " + it.type, [it.id, blocker.id]);
    });
    floor.filter(it => WALL_BACKED.has(it.type)).forEach(it => {
      if (it.type === "nightstand") return;
      if (backGap(it, room) > 8) add("against-wall", "warn", room, it.type + " floats away from the wall", [it.id]);
    });

    // ---- room-specific composition ----
    here.filter(it => it.type === "bed" || it.type === "bunk").forEach(bed => {
      let f = frontVector(bed.rot), ib = interiorBox(room);
      // at least one long side with 60cm of free floor to get in
      let open = bedSideZones(bed).filter(zone => boxInside(zone, ib, 1) && !floor.some(o => o !== bed && boxesOverlap(zone, itemBox(o))));
      if (!open.length) add("bed-access", "error", room, "The bed cannot be got into from either side", [bed.id]);
      if (bed.type === "bed" && type === "masterBedroom" && open.length < 2) add("bed-access", "warn", room, "A double bed should be reachable from both sides", [bed.id]);
      if (bed.type === "bed") {
        let stands = here.filter(it => it.type === "nightstand");
        stands.forEach(ns => {
          // a bedside table sits beside the pillows, its back on the headboard wall
          let along = Math.abs(f.z) > 0.5 ? Math.abs(ns.z - bed.z + f.z * (bed.d / 2 - ns.d / 2)) : Math.abs(ns.x - bed.x + f.x * (bed.d / 2 - ns.d / 2));
          let lateral = Math.abs(f.z) > 0.5 ? Math.abs(ns.x - bed.x) : Math.abs(ns.z - bed.z);
          if (along > 12 || lateral > bed.w / 2 + ns.w / 2 + 20)
            add("nightstand", "error", room, "A nightstand is not beside the head of the bed", [ns.id, bed.id]);
        });
        if (!stands.length && room && SLEEPING.has(type)) add("nightstand", "warn", room, "The bed has no nightstand");
      }
    });
    let sofa = here.find(it => it.type === "sofa"), tv = here.find(it => it.type === "tv");
    if (sofa && tv) {
      let f = frontVector(sofa.rot), dx = tv.x - sofa.x, dz = tv.z - sofa.z, L = Math.hypot(dx, dz);
      if (L < 1 || (dx * f.x + dz * f.z) / L < 0.98) add("tv-axis", "error", room, "The sofa does not face the TV", [sofa.id, tv.id]);
      else {
        let w = Math.min(sofa.w, tv.w) / 2;
        let corridor = {
          x0: Math.min(sofa.x, tv.x) - (Math.abs(f.x) > 0.5 ? 0 : w), x1: Math.max(sofa.x, tv.x) + (Math.abs(f.x) > 0.5 ? 0 : w),
          z0: Math.min(sofa.z, tv.z) - (Math.abs(f.z) > 0.5 ? 0 : w), z1: Math.max(sofa.z, tv.z) + (Math.abs(f.z) > 0.5 ? 0 : w),
        };
        floor.filter(it => it !== sofa && it !== tv && (it.h || 0) > 60).forEach(it => {
          if (boxesOverlap(itemBox(it), corridor)) add("tv-sightline", "error", room, it.type + " stands between the sofa and the TV", [it.id]);
        });
        let viewing = L - sofa.d / 2 - tv.d / 2;
        if (viewing < 150 || viewing > 450) add("tv-distance", "warn", room, "TV viewing distance is " + Math.round(viewing) + " cm", [sofa.id, tv.id]);
      }
    }
    if (sofa && !has("coffee") && (type === "living" || type === "livingKitchen"))
      add("coffee-table", "warn", room, "The seating group has no coffee table", [sofa.id]);
    here.filter(it => it.type === "table" && it.functionalZone === "dining").forEach(table => {
      let chairs = here.filter(c => c.type === "chair" && c.facesId === table.id);
      if (chairs.length < 2) add("dining", "error", room, "The dining table has fewer than two chairs", [table.id]);
      chairs.forEach(c => {
        let f = frontVector(c.rot), dx = table.x - c.x, dz = table.z - c.z, L = Math.hypot(dx, dz) || 1;
        if ((dx * f.x + dz * f.z) / L < 0.98) add("dining", "error", room, "A chair does not face the table", [c.id]);
      });
    });

    // Kitchen: the three work centres, in a sensible order, safely spaced.
    let isKitchen = type === "kitchen" || type === "livingKitchen";
    if (isKitchen) {
      let fridge = here.find(i => i.type === "fridge"), sink = here.find(i => i.type === "sink"), cook = here.find(i => i.type === "cooktop");
      ["fridge", "sink", "cooktop"].forEach(t => { if (!has(t)) add("kitchen", "error", room, "The kitchen has no " + t); });
      if (fridge && sink && cook) {
        let d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
        let legs = [d(fridge, sink), d(sink, cook), d(cook, fridge)];
        if (legs.reduce((a, b) => a + b, 0) > 790) add("work-triangle", "warn", room, "The kitchen work triangle is longer than 7.9 m", [fridge.id, sink.id, cook.id]);
        let gap = (a, b) => { let A = itemBox(a), B = itemBox(b); return Math.max(A.x0 - B.x1, B.x0 - A.x1, A.z0 - B.z1, B.z0 - A.z1); };
        if (gap(fridge, cook) < 30) add("work-triangle", "error", room, "The cooktop is right next to the fridge", [fridge.id, cook.id]);
        if (gap(sink, cook) < 30) add("work-triangle", "warn", room, "No worktop between the sink and the cooktop", [sink.id, cook.id]);
      }
    }
    if (WET.has(type) && type !== "wc") {
      ["toilet", "shower"].forEach(t => { if (!has(t)) add("bathroom", "error", room, "The bathroom has no " + t); });
      if (!has("vanity") && !has("sink")) add("bathroom", "warn", room, "The bathroom has no washbasin");
    }

    // Lighting: a general light in every room, plus task/accent light where
    // people sit, read, cook or eat.
    let lights = here.filter(it => LIGHTS.has(it.type));
    if (!lights.some(it => it.type === "ceilingLight" || it.type === "pendant" || it.type === "trackLight"))
      add("lighting", "error", room, nameOf(room) + " has no ceiling light");
    if (area > 16 && lights.length < 2) add("lighting", "warn", room, nameOf(room) + " relies on a single light");
    if (SLEEPING.has(type) && has("bed") && !has("tableLamp")) add("lighting", "warn", room, "No bedside lamp");
    here.filter(it => (it.type === "table" && it.functionalZone === "dining") || it.type === "island").forEach(t => {
      if (!here.some(l => l.type === "pendant" && l.supportId === t.id)) add("lighting", "warn", room, "No pendant over the " + t.type, [t.id]);
    });
  });

  let errors = violations.filter(v => v.severity === "error").length;
  return { violations, errors, warnings: violations.length - errors, rooms: rooms.length };
}
