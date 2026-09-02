// Pure placement-intent resolver. It consumes a complete live-scene snapshot
// prepared by agent_context.js; model prompt budgets and viewport state never
// participate in command geometry.

const COMPASS_ROT = Object.freeze({ north: 180, south: 0, east: 270, west: 90 });
const PLACEMENT_EPS_CM = 0.1;
// Beside placement inherits a nearby wall run only while the reference item is
// plausibly part of that run. Beyond this distance the relationship is solely
// item-to-item and the result remains free-standing.
export const BESIDE_WALL_RUN_MAX_DISTANCE_CM = 120;
const NON_BLOCKING_PLACEMENT_TYPES = Object.freeze({ rug: true });

function num(value, fallback) {
  var n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}
function round1(value) { return Math.round(num(value) * 10) / 10; }
function normRot(value) { return ((num(value) % 360) + 360) % 360; }
export function placementWallFingerprint(wall) {
  if (!wall) return null;
  return JSON.stringify({
    id: String(wall.id), thickness: round1(wall.thickness), curved: !!wall.curved,
    physical: wall.physical !== false,
    points: (wall.points || []).map(function(point) { return [round1(point.x), round1(point.z)]; }),
  });
}
export function canonicalPlacementWall(wall, geometry) {
  geometry = geometry || {};
  var geom = wall && typeof geometry.wallGeom === "function" ? geometry.wallGeom(wall) : null;
  if (!wall || !geom || !(geom.L > 0) || typeof geometry.wallPointAt !== "function") return null;
  var curved = geom.kind && geom.kind !== "line", steps = curved
    ? Math.max(4, Math.min(96, Math.ceil(geom.L / 20))) : 1;
  var points = [];
  for (var i = 0; i <= steps; i++) {
    var point = geometry.wallPointAt(wall, geom.L * i / steps);
    if (point) points.push({ x: point.x, z: point.z });
  }
  var kind = typeof geometry.normalizeWallKind === "function"
    ? geometry.normalizeWallKind(wall) : wall.kind || wall.wallTypeId;
  return { id: wall.id, thickness: Number(wall.thickness) || 10,
    kind: kind || "normal", physical: kind !== "roomDivider", curved: !!curved, points: points };
}
export function canonicalPlacementItem(item, geometry) {
  if (!item) return null;
  geometry = geometry || {};
  var span = null, hold = null;
  try { if (typeof geometry.itemVSpan === "function") span = geometry.itemVSpan(item); } catch (_) {}
  try { if (item.hold) hold = JSON.parse(JSON.stringify(item.hold)); } catch (_) {}
  var lo = span && Number.isFinite(Number(span.lo)) ? Number(span.lo) : num(item.elev);
  var hi = span && Number.isFinite(Number(span.hi)) ? Number(span.hi) : lo + Math.max(0, num(item.h));
  return {
    id: item.id, type: item.type, x: item.x, z: item.z, w: item.w, d: item.d,
    h: Math.max(0, hi - lo), elev: lo, rot: item.rot || 0,
    on: item.on == null ? null : item.on,
    blocksPlacement: !NON_BLOCKING_PLACEMENT_TYPES[item.type],
    rotUser: item.rotUser || null,
    hold: hold,
    locked: !!item.locked,
  };
}
function carriedIds(scene, target) {
  var ids = new Set([String(target.id)]), changed = true;
  while (changed) {
    changed = false;
    (scene.items || []).forEach(function(item) {
      if (!item || item.on == null || ids.has(String(item.id)) || !ids.has(String(item.on))) return;
      ids.add(String(item.id)); changed = true;
    });
  }
  return Array.from(ids);
}
function placementGuard(wall, reference, target, scene) {
  var guard = {};
  if (wall) guard.hostWall = { id: wall.id, fingerprint: placementWallFingerprint(wall) };
  if (reference) guard.referenceItem = {
    id: reference.id, x: round1(reference.x), z: round1(reference.z), rot: round1(normRot(reference.rot)),
  };
  if (target) {
    guard.targetHold = JSON.stringify(target.hold || null);
    guard.excludedItemIds = carriedIds(scene || {}, target);
  }
  return Object.keys(guard).length ? guard : null;
}
function angleDistance(a, b) {
  var d = Math.abs(normRot(a) - normRot(b));
  return Math.min(d, 360 - d);
}
function pointOnSegment(x, z, a, b) {
  var dx = b.x - a.x, dz = b.z - a.z, cross = (x - a.x) * dz - (z - a.z) * dx;
  if (Math.abs(cross) > PLACEMENT_EPS_CM * Math.max(1, Math.hypot(dx, dz))) return false;
  var dot = (x - a.x) * dx + (z - a.z) * dz;
  return dot >= -PLACEMENT_EPS_CM && dot <= dx * dx + dz * dz + PLACEMENT_EPS_CM;
}
function pointInPoly(x, z, pts) {
  var inside = false;
  for (var i = 0, j = (pts || []).length - 1; i < (pts || []).length; j = i++) {
    var a = pts[i], b = pts[j];
    if (pointOnSegment(x, z, a, b)) return true;
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x)
      inside = !inside;
  }
  return inside;
}
function itemCorners(item, x, z, rotation) {
  var a = normRot(rotation) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  var hw = num(item.w) / 2, hd = num(item.d) / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function(pair) {
    return { x: x + pair[0] * ca - pair[1] * sa, z: z + pair[0] * sa + pair[1] * ca };
  });
}
function polygonsOverlap(a, b) {
  var polys = [a, b];
  for (var p = 0; p < polys.length; p++) for (var i = 0; i < polys[p].length; i++) {
    var q = polys[p], next = q[(i + 1) % q.length], edge = { x: next.x - q[i].x, z: next.z - q[i].z };
    var axisLength = Math.hypot(edge.x, edge.z);
    if (!(axisLength > 1e-9)) continue;
    var axis = { x: -edge.z / axisLength, z: edge.x / axisLength };
    var amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    a.forEach(function(pt) { var d = pt.x * axis.x + pt.z * axis.z; amin = Math.min(amin, d); amax = Math.max(amax, d); });
    b.forEach(function(pt) { var d = pt.x * axis.x + pt.z * axis.z; bmin = Math.min(bmin, d); bmax = Math.max(bmax, d); });
    if (amax <= bmin + PLACEMENT_EPS_CM || bmax <= amin + PLACEMENT_EPS_CM) return false;
  }
  return true;
}
function orientation(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}
function properSegmentsCross(a, b, c, d) {
  var abLength = Math.max(1e-9, Math.hypot(b.x - a.x, b.z - a.z));
  var cdLength = Math.max(1e-9, Math.hypot(d.x - c.x, d.z - c.z));
  var abC = orientation(a, b, c) / abLength, abD = orientation(a, b, d) / abLength;
  var cdA = orientation(c, d, a) / cdLength, cdB = orientation(c, d, b) / cdLength;
  return abC * abD < 0 && cdA * cdB < 0 &&
    Math.abs(abC) > PLACEMENT_EPS_CM && Math.abs(abD) > PLACEMENT_EPS_CM &&
    Math.abs(cdA) > PLACEMENT_EPS_CM && Math.abs(cdB) > PLACEMENT_EPS_CM;
}
function polygonInsideRoom(poly, room) {
  if (!room || !Array.isArray(room.pts)) return true;
  if (!poly.every(function(pt) { return pointInPoly(pt.x, pt.z, room.pts); })) return false;
  for (var i = 0; i < poly.length; i++) for (var j = 0; j < room.pts.length; j++) {
    if (properSegmentsCross(poly[i], poly[(i + 1) % poly.length],
      room.pts[j], room.pts[(j + 1) % room.pts.length])) return false;
  }
  return true;
}
function verticalOverlap(a, b) {
  // Missing height means the snapshot cannot prove vertical clearance, so fail
  // closed. An explicit zero-height datum remains non-blocking.
  var ah = a.h == null ? Infinity : Math.max(0, num(a.h));
  var bh = b.h == null ? Infinity : Math.max(0, num(b.h));
  var a0 = num(a.elev), a1 = a0 + ah;
  var b0 = num(b.elev), b1 = b0 + bh;
  return Math.min(a1, b1) > Math.max(a0, b0) + PLACEMENT_EPS_CM;
}
function wallSolidOverlap(wall, poly) {
  if (!wall || wall.physical === false) return false;
  var half = Math.max(0, num(wall.thickness) / 2);
  return segments(wall).some(function(seg) {
    var nx = -seg.tz * half, nz = seg.tx * half;
    return polygonsOverlap(poly, [
      { x: seg.a.x + nx, z: seg.a.z + nz }, { x: seg.b.x + nx, z: seg.b.z + nz },
      { x: seg.b.x - nx, z: seg.b.z - nz }, { x: seg.a.x - nx, z: seg.a.z - nz },
    ]);
  });
}
function poseFitsScene(scene, item, pose, room, ignoredObstacleIds) {
  var movingIds = new Set(carriedIds(scene, item)), delta = normRot(pose.rot) - normRot(item.rot);
  var ignored = new Set((ignoredObstacleIds || []).map(String));
  var angle = delta * Math.PI / 180, ca = Math.cos(angle), sa = Math.sin(angle);
  var moving = (scene.items || []).filter(function(candidate) {
    return candidate && movingIds.has(String(candidate.id));
  }).map(function(candidate) {
    if (String(candidate.id) === String(item.id)) return Object.assign({}, candidate, pose);
    var dx = num(candidate.x) - num(item.x), dz = num(candidate.z) - num(item.z);
    return Object.assign({}, candidate, {
      x: pose.x + dx * ca - dz * sa,
      z: pose.z + dx * sa + dz * ca,
      rot: normRot(num(candidate.rot) + delta),
    });
  });
  return moving.every(function(candidate) {
    var placed = itemCorners(candidate, candidate.x, candidate.z, candidate.rot);
    if (!polygonInsideRoom(placed, room)) return false;
    if ((scene.walls || []).some(function(wall) { return wallSolidOverlap(wall, placed); })) return false;
    if (candidate.blocksPlacement === false) return true;
    return !(scene.items || []).some(function(other) {
      if (!other || ignored.has(String(other.id)) || other.blocksPlacement === false || movingIds.has(String(other.id)) ||
          !verticalOverlap(candidate, other)) return false;
      return polygonsOverlap(placed, itemCorners(other, other.x, other.z, other.rot));
    });
  });
}

/* Validate the final state of a semantic multi-item proposal, not each move in
   isolation against the turn-start positions. Raw coordinate moves are not
   passed here because overlap is an existing manual capability. */
export function placementBatchFitsScene(scene, placements) {
  scene = scene || {};
  var originalItems = scene.items || [], finalItems = originalItems.map(function(item) {
    return Object.assign({}, item);
  });
  var finalScene = Object.assign({}, scene, { items: finalItems });
  (placements || []).forEach(function(placement) {
    var original = itemById(scene, placement.itemId), target = itemById(finalScene, placement.itemId);
    if (!original || !target) return;
    var nextRot = placement.rot == null ? normRot(original.rot) : normRot(placement.rot);
    var delta = nextRot - normRot(original.rot), angle = delta * Math.PI / 180;
    var ca = Math.cos(angle), sa = Math.sin(angle);
    var ids = new Set(carriedIds(scene, original));
    finalItems.forEach(function(candidate) {
      if (!candidate || String(candidate.id) === String(target.id) || !ids.has(String(candidate.id))) return;
      var source = itemById(scene, candidate.id), dx = num(source.x) - num(original.x), dz = num(source.z) - num(original.z);
      candidate.x = num(placement.x) + dx * ca - dz * sa;
      candidate.z = num(placement.z) + dx * sa + dz * ca;
      candidate.rot = normRot(num(source.rot) + delta);
    });
    target.x = num(placement.x); target.z = num(placement.z); target.rot = nextRot;
  });
  return (placements || []).every(function(placement) {
    var original = itemById(scene, placement.itemId), target = itemById(finalScene, placement.itemId);
    if (!original || !target) return false;
    return poseFitsScene(finalScene, target, { x: target.x, z: target.z, rot: target.rot },
      roomForPoint(scene, original.x, original.z));
  });
}
function roomForPoint(scene, x, z) {
  var matches = (scene.rooms || []).filter(function(room) {
    return room && Array.isArray(room.pts) && pointInPoly(x, z, room.pts);
  });
  matches.sort(function(a, b) { return num(a.area, Infinity) - num(b.area, Infinity); });
  return matches[0] || null;
}
function itemById(scene, id) {
  return (scene.items || []).find(function(item) { return String(item.id) === String(id); }) || null;
}
function wallById(scene, id) {
  return (scene.walls || []).find(function(wall) { return String(wall.id) === String(id); }) || null;
}
function segments(wall) {
  var pts = wall && wall.points || [], out = [], station = 0;
  for (var i = 1; i < pts.length; i++) {
    var a = pts[i - 1], b = pts[i], dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (!(length > 1e-6)) continue;
    out.push({ a: a, b: b, dx: dx, dz: dz, length: length, tx: dx / length, tz: dz / length, station: station });
    station += length;
  }
  out.total = station;
  return out;
}
function pointAt(wall, station) {
  var segs = segments(wall), s = Math.max(0, Math.min(segs.total || 0, num(station)));
  for (var i = 0; i < segs.length; i++) {
    var seg = segs[i];
    if (s <= seg.station + seg.length || i === segs.length - 1) {
      var local = Math.max(0, Math.min(seg.length, s - seg.station));
      return { x: seg.a.x + seg.tx * local, z: seg.a.z + seg.tz * local,
        tx: seg.tx, tz: seg.tz, station: seg.station + local, total: segs.total };
    }
  }
  return null;
}
function closestOnWall(wall, x, z) {
  var best = null;
  segments(wall).forEach(function(seg) {
    var along = Math.max(0, Math.min(seg.length, (x - seg.a.x) * seg.tx + (z - seg.a.z) * seg.tz));
    var px = seg.a.x + seg.tx * along, pz = seg.a.z + seg.tz * along;
    var distance = Math.hypot(x - px, z - pz);
    if (!best || distance < best.distance) best = { x: px, z: pz, tx: seg.tx, tz: seg.tz,
      station: seg.station + along, total: segments(wall).total, distance: distance };
  });
  return best;
}
function rayWallHit(wall, x, z, dx, dz) {
  var best = null;
  segments(wall).forEach(function(seg) {
    var sx = seg.dx, sz = seg.dz, den = dx * sz - dz * sx;
    if (Math.abs(den) < 1e-9) return;
    var qx = seg.a.x - x, qz = seg.a.z - z;
    var t = (qx * sz - qz * sx) / den;
    var u = (qx * dz - qz * dx) / den;
    if (t < -1e-6 || u < -1e-6 || u > 1 + 1e-6) return;
    if (!best || t < best.rayDistance) best = {
      x: x + dx * t, z: z + dz * t, tx: seg.tx, tz: seg.tz,
      station: seg.station + Math.max(0, Math.min(seg.length, u * seg.length)),
      total: segments(wall).total, rayDistance: t,
    };
  });
  return best;
}
function inwardNormal(room, hit, thickness) {
  if (!room || !hit) return null;
  var nx = -hit.tz, nz = hit.tx;
  var probes = [0.1, 0.5, 1, 2, Math.max(2, num(thickness) / 2 + 1)];
  for (var i = 0; i < probes.length; i++) {
    var eps = probes[i];
    var plus = pointInPoly(hit.x + nx * eps, hit.z + nz * eps, room.pts);
    var minus = pointInPoly(hit.x - nx * eps, hit.z - nz * eps, room.pts);
    if (plus !== minus) return plus ? { x: nx, z: nz } : { x: -nx, z: -nz };
  }
  return null;
}
function supportRadius(item, rotation, axis) {
  var a = normRot(rotation) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  var lx = { x: ca, z: sa }, lz = { x: -sa, z: ca };
  return Math.abs(lx.x * axis.x + lx.z * axis.z) * num(item.w) / 2 +
    Math.abs(lz.x * axis.x + lz.z * axis.z) * num(item.d) / 2;
}
function rotationFacing(vector) {
  return normRot(Math.atan2(-vector.x, vector.z) * 180 / Math.PI);
}
function normalizeFace(value, hosted) {
  var face = String(value || (hosted ? "both" : "keep")).toLowerCase().replace(/\s+/g, "-");
  if (face === "room" || face === "into" || face === "into-the-room") return "into-room";
  return face;
}
function requestedDirection(side) {
  return side === "left" ? { x: -1, z: 0 } : side === "right" ? { x: 1, z: 0 }
    : side === "top" ? { x: 0, z: -1 } : side === "bottom" ? { x: 0, z: 1 } : null;
}
function roomWalls(scene, room) {
  var ids = new Set((room && room.wallIds || []).map(String));
  return (scene.walls || []).filter(function(wall) {
    return wall && wall.physical !== false && (!room || ids.has(String(wall.id)));
  });
}
function selectRoomWall(scene, room, item, side) {
  var direction = requestedDirection(side);
  if (!direction || !room) return null;
  var best = null;
  roomWalls(scene, room).forEach(function(wall) {
    var hit = rayWallHit(wall, item.x, item.z, direction.x, direction.z);
    if (hit && (!best || hit.rayDistance < best.hit.rayDistance)) best = { wall: wall, hit: hit };
  });
  return best;
}
function nearestRoomWall(scene, room, item) {
  var best = null;
  roomWalls(scene, room).forEach(function(wall) {
    var hit = closestOnWall(wall, item.x, item.z);
    if (hit && (!best || hit.distance < best.hit.distance)) best = { wall: wall, hit: hit };
  });
  return best;
}
function wallPose(item, wall, room, anchor, rotation) {
  if (!wall || !anchor) return null;
  var normal = inwardNormal(room, anchor, wall.thickness);
  if (!normal) return null;
  var tangentSupport = supportRadius(item, rotation, { x: anchor.tx, z: anchor.tz });
  // Leave room for the solid of a wall meeting this segment at either end.
  // Without this joint allowance, a correctly flush item can clip the next
  // wall by a few centimetres at a corner.
  var endpointClearance = tangentSupport + Math.max(0, num(wall.thickness) / 2);
  if (anchor.total < endpointClearance * 2 - 1e-6) return null;
  var station = Math.max(endpointClearance, Math.min(anchor.total - endpointClearance, anchor.station));
  var point = pointAt(wall, station);
  if (!point) return null;
  normal = inwardNormal(room, point, wall.thickness);
  if (!normal) return null;
  var offset = num(wall.thickness) / 2 + supportRadius(item, rotation, normal);
  return { x: round1(point.x + normal.x * offset), z: round1(point.z + normal.z * offset),
    rot: round1(normRot(rotation)), wallId: wall.curved ? null : wall.id,
    hostWallId: wall.id, inward: normal, station: station };
}
function variantsForHost(item, wall, room, anchor, face, baseRotation) {
  var mode = normalizeFace(face, !!wall), rotations = [];
  if (mode === "both") {
    rotations.push({ rotation: baseRotation, label: "keep" });
    var normal = inwardNormal(room, anchor, wall.thickness);
    if (normal) {
      var into = rotationFacing(normal);
      if (angleDistance(into, baseRotation) > 0.1) rotations.push({ rotation: into, label: "face-room", explicit: true });
    }
  } else if (mode === "into-room") {
    var inward = inwardNormal(room, anchor, wall.thickness);
    if (inward) rotations.push({ rotation: rotationFacing(inward), label: "face-room", explicit: true });
  } else if (COMPASS_ROT[mode] != null) rotations.push({ rotation: COMPASS_ROT[mode], label: null, explicit: true });
  else rotations.push({ rotation: baseRotation, label: null, explicit: false });
  return rotations.map(function(entry) {
    var pose = wallPose(item, wall, room, anchor, entry.rotation);
    return pose && Object.assign(pose, { choiceLabelKey: entry.label,
      rotationSpecified: !!entry.explicit || angleDistance(entry.rotation, item.rot) > 0.1,
      rotationProvenance: entry.explicit ? "explicit" : "automatic" });
  }).filter(Boolean);
}

function resolveBeside(args, scene, item, options) {
  var refArgs = args.beside && typeof args.beside === "object" ? args.beside : {};
  var other = itemById(scene, refArgs.itemId != null ? refArgs.itemId : refArgs.id);
  if (!other) return { ok: false, reason: "ITEM_REFERENCE_NOT_FOUND" };
  var room = roomForPoint(scene, other.x, other.z), rotation = normRot(other.rot), a = rotation * Math.PI / 180;
  var localX = { x: Math.cos(a), z: Math.sin(a) }, localZ = { x: -Math.sin(a), z: Math.cos(a) };
  var side = String(refArgs.side || "right").toLowerCase(), direction = side === "left"
    ? { x: -localX.x, z: -localX.z } : side === "above" || side === "top"
      ? { x: -localZ.x, z: -localZ.z } : side === "below" || side === "bottom"
        ? localZ : localX;
  var gap = supportRadius(other, other.rot, direction) + supportRadius(item, rotation, direction);
  var base = { x: other.x + direction.x * gap, z: other.z + direction.z * gap, rot: rotation };
  var hosted = other.hold && wallById(scene, other.hold.wall);
  if (hosted && (hosted.physical === false || !room || !(room.wallIds || []).map(String).includes(String(hosted.id)))) hosted = null;
  var wallEntry = hosted ? { wall: hosted, hit: closestOnWall(hosted, base.x, base.z) }
    : nearestRoomWall(scene, room, other);
  if (!wallEntry || wallEntry.hit.distance > BESIDE_WALL_RUN_MAX_DISTANCE_CM) {
    var face = normalizeFace(args.face, false), rot = COMPASS_ROT[face] != null ? COMPASS_ROT[face] : rotation;
    var freePose = { x: round1(base.x), z: round1(base.z), rot: rot };
    if (!poseFitsScene(scene, item, freePose, room, options && options.ignoreItemIds))
      return { ok: false, reason: "NO_PLACEMENT_FIT" };
    return { ok: true, moves: [{ itemId: item.id, x: freePose.x, z: freePose.z, rot: rot,
      rotationSpecified: Math.abs(normRot(rot) - normRot(item.rot)) > 0.1,
      rotationProvenance: COMPASS_ROT[face] != null ? "explicit" : "automatic",
      choiceLabelKey: null, holdWallId: null, floorId: scene.floorId,
      placementGuard: placementGuard(null, other, item, scene) }] };
  }
  if (wallEntry.wall.curved) return { ok: false, reason: "CURVED_WALL_PLACEMENT_UNSUPPORTED" };
  var anchor = closestOnWall(wallEntry.wall, base.x, base.z);
  var moves = variantsForHost(item, wallEntry.wall, room, anchor, args.face, rotation).filter(function(pose) {
    return poseFitsScene(scene, item, pose, room, options && options.ignoreItemIds);
  }).map(function(pose) {
    return { itemId: item.id, x: pose.x, z: pose.z, rot: pose.rot,
      rotationSpecified: pose.rotationSpecified,
      rotationProvenance: pose.rotationProvenance,
      choiceLabelKey: pose.choiceLabelKey, holdWallId: pose.wallId, hostWallId: pose.hostWallId, floorId: scene.floorId,
      placementGuard: placementGuard(wallEntry.wall, other, item, scene) };
  });
  return moves.length ? { ok: true, moves: moves } : { ok: false, reason: "NO_PLACEMENT_FIT" };
}

export function resolvePlacementIntent(args, scene, options) {
  args = args || {}; scene = scene || {};
  var item = itemById(scene, args.itemId);
  if (!item) return { ok: false, reason: "ITEM_SOURCE_NOT_FOUND" };
  if (item.locked) return { ok: false, reason: "ITEM_LOCKED" };
  if (args.beside) return resolveBeside(args, scene, item, options);
  var room = roomForPoint(scene, item.x, item.z), selected = args.wall
    ? selectRoomWall(scene, room, item, String(args.wall).toLowerCase()) : null;
  if (args.wall && !selected) return { ok: false, reason: room ? "WALL_TARGET_NOT_FOUND" : "NO_TARGET_ROOM" };
  if (selected && selected.wall.curved) return { ok: false, reason: "CURVED_WALL_PLACEMENT_UNSUPPORTED" };
  if (selected) {
    var wallMoves = variantsForHost(item, selected.wall, room, selected.hit, args.face, item.rot).filter(function(pose) {
      return poseFitsScene(scene, item, pose, room, options && options.ignoreItemIds);
    }).map(function(pose) {
    return { itemId: item.id, x: pose.x, z: pose.z, rot: pose.rot,
      rotationSpecified: pose.rotationSpecified,
      rotationProvenance: pose.rotationProvenance,
      choiceLabelKey: pose.choiceLabelKey, holdWallId: pose.wallId, hostWallId: pose.hostWallId, floorId: scene.floorId,
      placementGuard: placementGuard(selected.wall, null, item, scene) };
    });
    return wallMoves.length ? { ok: true, moves: wallMoves } : { ok: false, reason: "NO_PLACEMENT_FIT" };
  }
  var face = normalizeFace(args.face, false);
  if (COMPASS_ROT[face] != null) {
    var compassPose = { x: item.x, z: item.z, rot: COMPASS_ROT[face] };
    if (!poseFitsScene(scene, item, compassPose, room, options && options.ignoreItemIds))
      return { ok: false, reason: "NO_PLACEMENT_FIT" };
    return { ok: true, moves: [{ itemId: item.id, x: item.x, z: item.z,
      rot: COMPASS_ROT[face], rotationSpecified: true, rotationProvenance: "explicit",
      choiceLabelKey: null, holdWallId: null, floorId: scene.floorId,
      placementGuard: placementGuard(null, null, item, scene) }] };
  }
  if (face === "into-room") {
    var nearest = nearestRoomWall(scene, room, item);
    if (!nearest) return { ok: false, reason: "NO_NEAR_WALL" };
    if (nearest.wall.curved) return { ok: false, reason: "CURVED_WALL_PLACEMENT_UNSUPPORTED" };
    var nearestMoves = variantsForHost(item, nearest.wall, room, nearest.hit, face, item.rot).filter(function(pose) {
      return poseFitsScene(scene, item, pose, room, options && options.ignoreItemIds);
    }).map(function(pose) {
      return { itemId: item.id, x: pose.x, z: pose.z, rot: pose.rot,
        rotationSpecified: true, rotationProvenance: "explicit",
        choiceLabelKey: pose.choiceLabelKey, holdWallId: pose.wallId, hostWallId: pose.hostWallId, floorId: scene.floorId,
        placementGuard: placementGuard(nearest.wall, null, item, scene) };
    });
    return nearestMoves.length ? { ok: true, moves: nearestMoves } : { ok: false, reason: "NO_PLACEMENT_FIT" };
  }
  return { ok: false, reason: "PLACEMENT_INTENT_REQUIRED" };
}
