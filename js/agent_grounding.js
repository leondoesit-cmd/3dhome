/* Grounding for AI proposals (Round-5 flow): before anything is applied, name
 * the parts the AI picked and check the result against the live plan, so the
 * user judges a concrete change rather than a sentence.
 *
 *   groundProposal(proposal, scene) -> { parts, checks }
 *
 * Pure: `scene` is a plain snapshot (livePlacementScene() plus names, room
 * names and door-swing sectors — see liveGroundingScene() in ui_agent.js), so
 * the same answer comes out in the browser and in node tests. Parts and checks
 * carry codes and params, never prose; the UI words them in both languages.
 *
 * Checks are advisory. They never block Apply — the command layer already
 * refuses anything invalid — but a proposal that overlaps the sofa or sits in
 * a door's swing says so before the click, not after. */
import { footprint, convexOverlap, inside } from "./layout_analysis.js";
import { partCode } from "./part_codes.js";

var LETTERS = ["A", "B", "C", "D"];

function num(v) { var n = Number(v); return Number.isFinite(n) ? n : 0; }
function commandsOf(proposal) {
  if (!proposal) return [];
  if (Array.isArray(proposal.commands)) return proposal.commands;
  return [proposal];
}
function paramsOf(command) { return (command && command.plan && command.plan.params) || command.params || {}; }

function itemName(scene, item) {
  if (!item) return "";
  var names = scene.names || {};
  return (names.items && names.items[String(item.id)]) || (names.types && names.types[item.type]) || String(item.type || "item");
}
function typeName(scene, type) {
  var names = scene.names || {};
  return (names.types && names.types[type]) || String(type || "item");
}
function roomAt(scene, point) {
  var rooms = scene.rooms || [];
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].pts && rooms[i].pts.length > 2 && inside(point, rooms[i].pts)) return rooms[i];
  }
  return null;
}
function roomLabel(scene, room) {
  return (room && scene.roomNames && scene.roomNames[room.key]) || "";
}

/* A wall centreline widened to its thickness, one quad per segment. */
function wallQuads(wall) {
  var quads = [], pts = wall.points || [], half = num(wall.thickness || 10) / 2;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    var dx = -(b.z - a.z) / len * half, dz = (b.x - a.x) / len * half;
    quads.push([{ x: a.x + dx, z: a.z + dz }, { x: b.x + dx, z: b.z + dz }, { x: b.x - dx, z: b.z - dz }, { x: a.x - dx, z: a.z - dz }]);
  }
  return quads;
}
function bandsMeet(a, b) {
  var alo = num(a.lo), ahi = a.hi == null ? alo + 200 : num(a.hi);
  var blo = num(b.lo), bhi = b.hi == null ? blo + 200 : num(b.hi);
  return Math.min(ahi, bhi) > Math.max(alo, blo) + 1;
}
function bandOf(item) { return { lo: num(item.elev), hi: num(item.elev) + (item.h == null ? 200 : num(item.h)) }; }

/* One footprint a proposal would leave in the plan. */
function placed(id, type, center, w, d, rot, source) {
  return { id: id, type: type, x: num(center.x), z: num(center.z), w: num(w), d: num(d), rot: num(rot), source: source };
}

/** Name the parts of one proposal (a single command or a batch). */
export function proposalParts(proposal, scene) {
  scene = scene || {};
  var items = scene.items || [], parts = [];
  commandsOf(proposal).forEach(function (command) {
    var id = command && command.commandId, p = paramsOf(command), view = command && command.preview || {};
    if (id === "item.move") {
      var item = items.find(function (it) { return String(it.id) === String(p.itemId); });
      var to = p.to || view.center || {};
      parts.push({
        kind: "item", action: "move", id: p.itemId, name: itemName(scene, item || { id: p.itemId, type: p.type || view.type }),
        at: { x: num(to.x), z: num(to.z) },
        footprint: placed(p.itemId, (item && item.type) || p.type, to, view.width || (item && item.w), view.depth || (item && item.d),
          view.rotation != null ? view.rotation : item && item.rot, item),
      });
    } else if (id === "item.place") {
      var c = view.center || { x: p.x, z: p.z };
      parts.push({
        kind: "item", action: "new", id: null, name: typeName(scene, p.type || view.type), at: { x: num(c.x), z: num(c.z) },
        footprint: placed(null, p.type || view.type, c, view.width || p.w, view.depth || p.d, view.rotation != null ? view.rotation : p.rot, { h: p.h, elev: 0 }),
      });
    } else if (id === "item.duplicate") {
      (view.items || []).forEach(function (copy) {
        var source = items.find(function (it) { return String(it.id) === String(copy.sourceId); });
        parts.push({
          kind: "item", action: "copy", id: null, sourceId: copy.sourceId, name: itemName(scene, source || { id: copy.sourceId, type: copy.type }),
          at: { x: num(copy.center.x), z: num(copy.center.z) },
          footprint: placed(null, copy.type, copy.center, copy.width, copy.depth, copy.rotation, source),
        });
      });
    } else if (id === "wall.draw") {
      var a = view.from || p.from || {}, b = view.to || p.to || {};
      parts.push({
        kind: "wall", action: "new", id: null, name: "", at: { x: (num(a.x) + num(b.x)) / 2, z: (num(a.z) + num(b.z)) / 2 },
        length: Math.hypot(num(b.x) - num(a.x), num(b.z) - num(a.z)),
      });
    } else if (id === "opening.place") {
      var oc = view.center || {};
      parts.push({
        kind: p.type === "window" ? "window" : p.type === "door" ? "door" : "opening", action: "new", id: null, name: "",
        at: { x: num(oc.x), z: num(oc.z) }, hostWallId: p.wallId != null ? p.wallId : view.wallId, width: num(view.width || p.width),
      });
    } else if (id === "room.create") {
      var outline = view.outline || [], cx = 0, cz = 0;
      outline.forEach(function (q) { cx += num(q.x); cz += num(q.z); });
      var n = Math.max(1, outline.length);
      var bx = p.bounds || {};
      parts.push({
        kind: "room", action: "new", id: null, name: "", at: { x: cx / n, z: cz / n },
        area: Math.abs((num(bx.x1) - num(bx.x0)) * (num(bx.z1) - num(bx.z0))) / 10000,
      });
    }
  });
  parts.forEach(function (part) {
    var room = roomAt(scene, part.at);
    part.room = room ? roomLabel(scene, room) || null : null;
    part.inRoom = !!room;
  });
  return parts;
}

/** Check what a proposal would leave in the plan. */
export function proposalChecks(parts, scene) {
  scene = scene || {};
  var checks = [], items = scene.items || [], walls = scene.walls || [], swings = scene.swings || [];
  var moved = {};
  parts.forEach(function (part) { if (part.action === "move" && part.id != null) moved[String(part.id)] = true; });
  var footprints = parts.filter(function (part) { return part.footprint && part.footprint.w > 0 && part.footprint.d > 0; });
  footprints.forEach(function (part, index) {
    var fp = part.footprint, poly = footprint(fp), band = bandOf(Object.assign({}, fp.source || {}, { elev: fp.source && fp.source.elev, h: fp.source && fp.source.h }));
    var ref = { part: parts.indexOf(part), name: part.name };
    // Other furniture: what stays where it is, plus the proposal's own other pieces.
    var hits = [];
    items.forEach(function (other) {
      if (moved[String(other.id)] || other.blocksPlacement === false || other.on != null) return;
      if (fp.source && String(other.id) === String(fp.source.id) && part.action !== "copy") return;
      if (!(num(other.w) > 0 && num(other.d) > 0) || !bandsMeet(band, bandOf(other))) return;
      if (convexOverlap(poly, footprint(other))) hits.push(itemName(scene, other) + " " + partCode("item", other.id));
    });
    footprints.forEach(function (peer, j) {
      if (j <= index) return;
      if (convexOverlap(poly, footprint(peer.footprint))) hits.push(peer.name);
    });
    checks.push(hits.length
      ? Object.assign({ level: "warn", code: "overlap", with: hits.slice(0, 3).join(", "), more: Math.max(0, hits.length - 3) }, ref)
      : Object.assign({ level: "ok", code: "clear" }, ref));
    var crossed = walls.filter(function (wall) {
      return wall.physical !== false && wallQuads(wall).some(function (q) { return convexOverlap(poly, q); });
    });
    if (crossed.length) checks.push(Object.assign({ level: "warn", code: "wall", wall: crossed.map(function (w) { return partCode("wall", w.id); }).join(", ") }, ref));
    var doors = swings.filter(function (s) { return s.poly && s.poly.length > 2 && bandsMeet(band, s.band || {}) && convexOverlap(poly, s.poly); });
    checks.push(doors.length
      ? Object.assign({ level: "warn", code: "swing", door: doors.map(function (s) { return partCode("opening", s.openingId, { type: "door" }); }).join(", ") }, ref)
      : Object.assign({ level: "ok", code: "swingClear" }, ref));
    checks.push(part.inRoom
      ? Object.assign({ level: "ok", code: "room", room: part.room || "" }, ref)
      : Object.assign({ level: "warn", code: "outside" }, ref));
  });
  parts.forEach(function (part, i) {
    var ref = { part: i, name: part.name };
    if (part.kind === "wall") {
      checks.push(part.length >= 30
        ? Object.assign({ level: "ok", code: "wallLength", length: part.length }, ref)
        : Object.assign({ level: "warn", code: "wallShort", length: part.length }, ref));
    } else if (part.kind === "door" || part.kind === "window" || part.kind === "opening") {
      // A preview only exists when the opening fits its host wall.
      checks.push(Object.assign({ level: "ok", code: "fitsWall", wall: partCode("wall", part.hostWallId) }, ref));
    } else if (part.kind === "room") {
      checks.push(part.area >= 1
        ? Object.assign({ level: "ok", code: "roomArea", area: part.area }, ref)
        : Object.assign({ level: "warn", code: "roomSmall", area: part.area }, ref));
    }
  });
  return checks;
}

/** Parts and checks for a proposal; `letter` is set for lettered candidates. */
export function groundProposal(proposal, scene, letter) {
  var parts = proposalParts(proposal, scene);
  if (letter) parts.forEach(function (part) { part.letter = letter; });
  return { parts: parts, checks: proposalChecks(parts, scene) };
}

/** Every candidate of a choice proposal, lettered A–D; one entry otherwise. */
export function groundCandidates(proposal, scene) {
  if (proposal && Array.isArray(proposal.choices) && proposal.choices.length) {
    return proposal.choices.slice(0, LETTERS.length).map(function (choice, i) {
      return Object.assign({ letter: LETTERS[i], proposal: choice }, groundProposal(choice, scene, LETTERS[i]));
    });
  }
  return [Object.assign({ letter: null, proposal: proposal }, groundProposal(proposal, scene, null))];
}

/** Worst level across checks: "ok" when nothing warns. */
export function checksLevel(checks) {
  return (checks || []).some(function (c) { return c.level === "warn"; }) ? "warn" : "ok";
}
