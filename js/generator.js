import {generationPlan} from "./generation_layout.js";
import { generatedChangePermission } from "./redesign.js";
import { roomTypeOf } from "./room_types.js";
import {roomMeasurements} from './room_summary.js';
import {assignChecklistRoom} from './planning_guide.js';
import { S, uid, WALL_T, WALL_H } from "./state.js";
import { detectRooms, wallGeom, pointInPoly } from "./geometry.js";
import { FURN } from "./furniture.js";
import { wallDrawCommand, openingPlaceCommand, itemPlaceCommand, executeCommand } from "./commands/index.js";

function generatedEnv(extra = {}) {
  return Object.assign({ domain: "planner", state: S, itemCatalog: FURN }, extra);
}

function commitGeneratedItem(item) {
  if (!item) return null;
  var result = executeCommand(itemPlaceCommand, {
    type: item.type, x: item.x, z: item.z, rot: item.rot || 0,
  }, generatedEnv({
    services: {
      createItem: function () {
        if (item.id == null) item.id = uid();
        return item;
      },
    },
  }), { history: false });
  if (!result.ok) throw new Error(result.reason || "GENERATED_ITEM_FAILED");
  return item;
}

function clearScene() {
  S.nodes = [];
  S.walls = [];
  S.openings = [];
  S.items = [];
  S.roomMeta = {};
  S.idc = 1;
}

// Replacement cannot leave document objects referring to discarded geometry.
function replacementBlocked(state) {
  return !!(state.structLocked || state.layers?.structure?.locked ||
    state.walls.some(w => w.locked) || state.items.some(i => i.locked) ||
    state.wallCons?.length || state.roomCons?.length || state.slabOpenings?.length ||
    state.markers?.length || state.mep?.nodes?.length || state.mep?.runs?.length || state.mep?.edges?.length);
}

export function buildLayout(layout, replace) {
  const permission = generatedChangePermission(S, "document.generate_apartment", { replace });
  if (!permission.ok) throw new Error(permission.reason);
  if (replace && replacementBlocked(S)) throw new Error('PROTECTED_STRUCTURE');
  if (replace) {
    clearScene();
  }
  
  let nodeOffset = S.nodes.length;
  // Build rooms by drawing their 4 walls. This might create duplicate walls,
  // so we will merge nodes and remove duplicate walls.
  let tempNodes = [];
  let tempWalls = [];
  
  layout.rooms.forEach(r => {
    let n0 = tempNodes.length + nodeOffset;
    tempNodes.push({x: r.x0, z: r.z0});
    tempNodes.push({x: r.x1, z: r.z0});
    tempNodes.push({x: r.x1, z: r.z1});
    tempNodes.push({x: r.x0, z: r.z1});
    
    tempWalls.push({ a: n0, b: n0+1, room: r.name });
    tempWalls.push({ a: n0+1, b: n0+2, room: r.name });
    tempWalls.push({ a: n0+2, b: n0+3, room: r.name });
    tempWalls.push({ a: n0+3, b: n0, room: r.name });
  });

  // Weld nodes with existing nodes as well
  let finalNodes = S.nodes.slice();
  let remap = {};
  tempNodes.forEach((tn, i) => {
    let found = -1;
    for (let j=0; j<finalNodes.length; j++) {
      if (Math.abs(finalNodes[j].x - tn.x) < 2 && Math.abs(finalNodes[j].z - tn.z) < 2) {
        found = j; break;
      }
    }
    if (found === -1) {
      found = finalNodes.length;
      finalNodes.push({x: tn.x, z: tn.z});
    }
    remap[i + nodeOffset] = found;
  });

  S.nodes = finalNodes;

  // Add walls, avoid duplicates
  let finalWalls = S.walls.slice();
  let seenWalls = {}; // "a_b" or "b_a"
  finalWalls.forEach(w => {
    seenWalls[w.a + "_" + w.b] = true;
    seenWalls[w.b + "_" + w.a] = true;
  });
  
  // Split wall segments at any node that lies on their interior, so that
  // adjacent rooms sharing part of a wall produce a proper planar graph
  // (detectRooms traces half-edge faces and needs walls split at junctions).
  function splitAtNodes(a, b) {
    let A = finalNodes[a], B = finalNodes[b];
    for (let j = 0; j < finalNodes.length; j++) {
      if (j === a || j === b) continue;
      let P = finalNodes[j];
      let dx = B.x - A.x, dz = B.z - A.z;
      let L2 = dx*dx + dz*dz;
      if (L2 < 1) continue;
      let t = ((P.x - A.x)*dx + (P.z - A.z)*dz) / L2;
      if (t <= 0.001 || t >= 0.999) continue;
      let px = A.x + t*dx, pz = A.z + t*dz;
      if (Math.abs(px - P.x) < 2 && Math.abs(pz - P.z) < 2) {
        return splitAtNodes(a, j).concat(splitAtNodes(j, b));
      }
    }
    return [[a, b]];
  }

  tempWalls.forEach(tw => {
    let a = remap[tw.a];
    let b = remap[tw.b];
    if (a === b) return;
    splitAtNodes(a, b).forEach(seg => {
      let k1 = seg[0] + "_" + seg[1];
      let k2 = seg[1] + "_" + seg[0];
      if (!seenWalls[k1] && !seenWalls[k2]) {
        seenWalls[k1] = true;
        var wallResult = executeCommand(wallDrawCommand, {
          from: finalNodes[seg[0]], to: finalNodes[seg[1]], thickness: WALL_T, height: WALL_H,
        }, generatedEnv(), { history: false });
        if (!wallResult.ok) throw new Error(wallResult.reason || "GENERATED_WALL_FAILED");
        finalWalls = S.walls.slice();
      }
    });
  });

  // Let the geometry engine detect rooms
  let detected = detectRooms();
  detected.forEach(dr => {
    // find which layout room it matches by center
    let match = layout.rooms.find(lr => {
      let cx = (lr.x0 + lr.x1)/2;
      let cz = (lr.z0 + lr.z1)/2;
      return pointInPoly(cx, cz, dr.pts);
    });
    if (match) {
      S.roomMeta[dr.key] = { name: match.name, roomType: roomTypeOf(match), floor: match.floor };
    }
  });

  function rectContainsPoint(r, x, z, eps = 5) {
    return x >= r.x0 - eps && x <= r.x1 + eps && z >= r.z0 - eps && z <= r.z1 + eps;
  }

  function wallTouchesRoom(w, r) {
    let g = wallGeom(w);
    let cx = (g.a.x + g.b.x) / 2;
    let cz = (g.a.z + g.b.z) / 2;
    return rectContainsPoint(r, cx, cz);
  }

  function isExteriorWall(w, room) {
    if (!wallTouchesRoom(w, room)) return false;
    let g = wallGeom(w);
    let cx = (g.a.x + g.b.x) / 2;
    let cz = (g.a.z + g.b.z) / 2;
    return !layout.rooms.some(other => other !== room && rectContainsPoint(other, cx, cz));
  }

  function requestedSide(w, room, side) {
    if (!side) return true;
    let g = wallGeom(w);
    let cx = (g.a.x + g.b.x) / 2;
    let cz = (g.a.z + g.b.z) / 2;
    if (side === "top") return Math.abs(cz - room.z0) < 5;
    if (side === "bottom") return Math.abs(cz - room.z1) < 5;
    if (side === "left") return Math.abs(cx - room.x0) < 5;
    if (side === "right") return Math.abs(cx - room.x1) < 5;
    return true;
  }

  // Find the widest clean span on a wall. Openings need a little solid wall
  // at the corners and between one another; centering in the best span also
  // keeps doors away from awkward corner collisions.
  function freeOpeningSpot(w, width, edge = 18, gap = 18, preferredS = null) {
    let L = wallGeom(w).L;
    let spans = [{ a: edge, b: L - edge }];
    S.openings.filter(o => o.wall === w.id).forEach(o => {
      let cutA = o.s - o.width / 2 - gap;
      let cutB = o.s + o.width / 2 + gap;
      let next = [];
      spans.forEach(sp => {
        if (cutB <= sp.a || cutA >= sp.b) next.push(sp);
        else {
          if (cutA > sp.a) next.push({ a: sp.a, b: cutA });
          if (cutB < sp.b) next.push({ a: cutB, b: sp.b });
        }
      });
      spans = next;
    });
    spans = spans.filter(sp => sp.b - sp.a >= width);
    if (!spans.length) return null;
    if (preferredS != null) {
      let spots = spans.map(sp => {
        let s = Math.max(sp.a + width / 2, Math.min(sp.b - width / 2, preferredS));
        return { s, span: sp.b - sp.a, delta: Math.abs(s - preferredS) };
      }).sort((a, b) => a.delta - b.delta || b.span - a.span);
      return spots[0];
    }
    spans.sort((a, b) => (b.b - b.a) - (a.b - a.a));
    return { s: (spans[0].a + spans[0].b) / 2, span: spans[0].b - spans[0].a, delta: 0 };
  }

  function addOpeningOnCandidates(candidates, spec) {
    let viable = candidates.map(w => {
      let spot = freeOpeningSpot(w, spec.width, spec.edge, spec.gap, spec.preferredS);
      return spot && { w, spot, L: wallGeom(w).L };
    }).filter(Boolean).sort((a, b) => a.spot.delta - b.spot.delta || b.spot.span - a.spot.span || b.L - a.L);
    if (!viable.length) return null;
    let best = viable[0];
    let result = executeCommand(openingPlaceCommand, {
      wallId: best.w.id, type: spec.type, s: best.spot.s,
      width: spec.width, height: spec.height, sill: spec.sill || 0,
    }, generatedEnv(), { history: false });
    if (!result.ok) return null;
    let created = result.created.find(entry => entry.kind === "opening");
    return created && S.openings.find(opening => opening.id === created.id) || null;
  }

  // Add doors
  layout.doors.forEach(d => {
    if (d.from === "Outside") {
       let rTo = layout.rooms.find(r => r.name === d.to);
       if(rTo) {
         let candidates = S.walls.filter(w => isExteriorWall(w, rTo) && requestedSide(w, rTo, d.wall));
         addOpeningOnCandidates(candidates, { type: "door", width: d.width, height: 205, edge: 20, gap: 20 });
       }
       return;
    }

    let rFrom = layout.rooms.find(r => r.name === d.from);
    let rTo = layout.rooms.find(r => r.name === d.to);
    if (rFrom && rTo) {
      let candidates = S.walls.filter(w => {
         let g = wallGeom(w);
         let cx = (g.a.x + g.b.x)/2;
         let cz = (g.a.z + g.b.z)/2;
         return rectContainsPoint(rFrom, cx, cz) && rectContainsPoint(rTo, cx, cz);
      });
      addOpeningOnCandidates(candidates, {
        type: d.isPassage ? "passage" : "door", width: d.width, height: 205, edge: 12, gap: 12, preferredS: d.s
      });
    }
  });

  // Add windows
  layout.windows.forEach(win => {
    let rM = layout.rooms.find(r => r.name === win.room);
    if(rM) {
      let candidates = S.walls.filter(w => isExteriorWall(w, rM));
      addOpeningOnCandidates(candidates, {
        type: "window", width: win.width, height: win.height, sill: win.sill, edge: 25, gap: 25
      });
    }
  });
}

// Rule-based Placement Engine
// Considerations:
// 1. Passage Widths (clearance)
// 2. Opposite (מה מול מה)
// 3. Next to (מה ליד מה)
// 4. Groups (קבוצה)

// Rotation-aware half extents (orthogonal rotations only)
function halfXZ(it) {
  let r = ((it.rot || 0) % 180 + 180) % 180;
  if (r >= 45 && r < 135) return { hx: it.d/2, hz: it.w/2 };
  return { hx: it.w/2, hz: it.d/2 };
}

const NON_BLOCKING = {
  rug: 1, ceilingLight: 1, pendant: 1, trackLight: 1, lightStrip: 1,
  art: 1, wallMirror: 1, ac: 1, hood: 1, acDiffuser: 1, acReturn: 1,
  acCassette: 1, acDucted: 1, tvWall: 1, tableLamp: 1, laptop: 1,
};

function roomBounds(roomPts, inset = 0) {
  return {
    x0: Math.min(...roomPts.map(p => p.x)) + inset,
    x1: Math.max(...roomPts.map(p => p.x)) - inset,
    z0: Math.min(...roomPts.map(p => p.z)) + inset,
    z1: Math.max(...roomPts.map(p => p.z)) - inset,
  };
}

function aabbOf(item, grow = 0) {
  let he = halfXZ(item);
  let hw = he.hx + grow;
  let hd = he.hz + grow;
  return {
    x0: item.x - hw, x1: item.x + hw,
    z0: item.z - hd, z1: item.z + hd
  };
}

function aabbOverlap(a, b, gap = 0) {
  return a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.z0 < b.z1 + gap && a.z1 > b.z0 - gap;
}

function openingZone(op, depth) {
  let w = S.walls.find(x => x.id === op.wall);
  if (!w) return null;
  let g = wallGeom(w);
  let cx = g.a.x + g.ux * op.s;
  let cz = g.a.z + g.uz * op.s;
  let alongX = Math.abs(g.ux) > Math.abs(g.uz);
  let along = op.width / 2 + (op.type === "window" ? 8 : 18);
  return alongX
    ? { x0: cx - along, x1: cx + along, z0: cz - depth, z1: cz + depth }
    : { x0: cx - depth, x1: cx + depth, z0: cz - along, z1: cz + along };
}

function canPlace(item, roomPts, clearance = 0, options = {}) {
  let grow = clearance / 2;
  let aabb = aabbOf(item, grow);

  // Check all four footprint corners. The generated plans are rectangular,
  // but this also keeps the engine safe when buildLayout receives an L-shape.
  if (!pointInPoly(aabb.x0, aabb.z0, roomPts) || !pointInPoly(aabb.x1, aabb.z0, roomPts) ||
      !pointInPoly(aabb.x1, aabb.z1, roomPts) || !pointInPoly(aabb.x0, aabb.z1, roomPts)) return false;

  if ((options.exclusionZones || []).some(zone => aabbOverlap(aabbOf(item), zone))) return false;

  if (!NON_BLOCKING[item.type]) {
    for(let i=0; i<S.items.length; i++) {
      let o = S.items[i];
      if (NON_BLOCKING[o.type]) continue;
      if (o.useZone && aabbOverlap(aabbOf(item), o.useZone)) return false;
      if (options.useZone && aabbOverlap(options.useZone, aabbOf(o))) return false;
      if (aabbOverlap(aabb, aabbOf(o), options.itemGap || 2)) return false;
    }
  }

  for(let i=0; i<S.openings.length; i++) {
    let op = S.openings[i];
    let isDoor = (op.type === "door" || op.type === "passage");
    let blocksWin = op.type === "window" && ((item.h || 0) > op.sill || options.avoidWindows);
    if (isDoor || blocksWin) {
      let zone = openingZone(op, isDoor ? (options.doorDepth || 105) : 35);
      if (zone && aabbOverlap(aabbOf(item), zone)) return false;
    }
  }

  return true;
}

function sideOrder(rule, bounds) {
  let named = ["north", "east", "south", "west"];
  let preferred = (rule.preferredSides || []).filter(x => named.includes(x));
  let remaining = named.filter(x => !preferred.includes(x));
  if (!preferred.length) {
    remaining.sort((a, b) => {
      let len = side => (side === "north" || side === "south") ? bounds.x1 - bounds.x0 : bounds.z1 - bounds.z0;
      return len(b) - len(a);
    });
  }
  return preferred.concat(remaining);
}

function wallCandidate(item, bounds, side, frac, clearance) {
  let he = halfXZ(item);
  // Room polygons follow wall centre-lines. Half a wall plus a 1cm tolerance
  // puts the furniture back against the finished wall surface (rather than
  // leaving the old, visibly floating 20cm gap).
  let inset = WALL_T / 2 + 1 + clearance / 2;
  if (side === "north") return { x: bounds.x0 + he.hx + (bounds.x1 - bounds.x0 - he.hx * 2) * frac, z: bounds.z0 + he.hz + inset, rot: 0 };
  if (side === "east") return { x: bounds.x1 - he.hx - inset, z: bounds.z0 + he.hz + (bounds.z1 - bounds.z0 - he.hz * 2) * frac, rot: 90 };
  if (side === "south") return { x: bounds.x0 + he.hx + (bounds.x1 - bounds.x0 - he.hx * 2) * frac, z: bounds.z1 - he.hz - inset, rot: 180 };
  return { x: bounds.x0 + he.hx + inset, z: bounds.z0 + he.hz + (bounds.z1 - bounds.z0 - he.hz * 2) * frac, rot: 270 };
}

function sideFromRotation(rot) {
  let r = ((Math.round((rot || 0) / 90) * 90) % 360 + 360) % 360;
  return r === 0 ? "north" : r === 90 ? "east" : r === 180 ? "south" : "west";
}

function placeWallMounted(type, room, anchor) {
  if (!anchor) return null;
  let item = makeCatalogItem(type, anchor.rot || 0);
  if (!item) return null;
  let bounds = roomBounds(room.pts, 0);
  let side = sideFromRotation(item.rot);
  let he = halfXZ(item);
  let gap = WALL_T / 2 + 1;
  if (side === "north" || side === "south") {
    item.x = Math.max(bounds.x0 + he.hx + 2, Math.min(bounds.x1 - he.hx - 2, anchor.x));
    item.z = side === "north" ? bounds.z0 + he.hz + gap : bounds.z1 - he.hz - gap;
  } else {
    item.x = side === "west" ? bounds.x0 + he.hx + gap : bounds.x1 - he.hx - gap;
    item.z = Math.max(bounds.z0 + he.hz + 2, Math.min(bounds.z1 - he.hz - 2, anchor.z));
  }
  if (!canPlace(item, room.pts, 0, { avoidWindows: true, doorDepth: 22 })) return null;
  item.mounted = true;
  item.anchorId = anchor.id;
  item.functionalZone = anchor.functionalZone;
  return commitGeneratedItem(item);
}

function frontUseZone(item, depth, width) {
  let rad = (item.rot || 0) * Math.PI / 180;
  let front = { x: -Math.sin(rad), z: Math.cos(rad) };
  let right = { x: Math.cos(rad), z: Math.sin(rad) };
  let cx = item.x + front.x * (item.d / 2 + depth / 2);
  let cz = item.z + front.z * (item.d / 2 + depth / 2);
  let hx = Math.abs(right.x) * width / 2 + Math.abs(front.x) * depth / 2;
  let hz = Math.abs(right.z) * width / 2 + Math.abs(front.z) * depth / 2;
  return { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz };
}

function placeBathroomFixture(type, room, rule) {
  let bounds = roomBounds(room.pts, 0);
  let sides = sideOrder({ preferredSides: rule.preferredSides }, bounds);
  let fractions = rule.wallFractions || [0.18, 0.82, 0.35, 0.65, 0.5];
  for (let side of sides) for (let frac of fractions) {
    let rot = side === "north" ? 0 : side === "east" ? 90 : side === "south" ? 180 : 270;
    let item = makeCatalogItem(type, rot);
    Object.assign(item, wallCandidate(item, bounds, side, frac, rule.clearance || 0));
    let along = side === "north" || side === "south" ? item.x : item.z;
    let lo = side === "north" || side === "south" ? bounds.x0 : bounds.z0;
    let hi = side === "north" || side === "south" ? bounds.x1 : bounds.z1;
    if (rule.sideClearance && (along - lo < rule.sideClearance || hi - along < rule.sideClearance)) continue;
    let useZone = frontUseZone(item, rule.clearDepth, rule.clearWidth);
    if (!canPlace(item, room.pts, rule.clearance || 0, {
      avoidWindows: !!rule.avoidWindows,
      doorDepth: rule.doorDepth || 48,
      useZone,
    })) continue;
    item.useZone = useZone;
    item.functionalZone = "bathroom";
    return commitGeneratedItem(item);
  }
  return null;
}

function placeItem(type, room, rule) {
  let f = FURN[type];
  if (!f) return null;
  
  let w = f.w || 50, d = f.d || 50, h = f.h || 50;
  
  let bounds = roomBounds(room.pts, 0);
  let rx0 = bounds.x0, rx1 = bounds.x1, rz0 = bounds.z0, rz1 = bounds.z1;
  
  let item = { type: type, x: 0, z: 0, w: w, d: d, h: h, rot: 0 };

  let clearance = rule.clearance || 0;

  if (rule.center) {
    let spots = [[0.5, 0.5], [0.35, 0.5], [0.65, 0.5], [0.5, 0.35], [0.5, 0.65], [0.3, 0.3], [0.7, 0.7]];
    for (let spot of spots) {
      item.x = rx0 + (rx1 - rx0) * spot[0];
      item.z = rz0 + (rz1 - rz0) * spot[1];
      if (canPlace(item, room.pts, clearance, rule)) {
        return commitGeneratedItem(item);
      }
    }
  }

  if (rule.onTopOf) {
    let targets = S.items.filter(i => i.type === rule.onTopOf && pointInPoly(i.x, i.z, room.pts));
    let target = targets.find(t => !S.items.some(i => i.type === type && i.supportId === t.id));
    if (!target && rule.allowShared) target = targets[0];
    if (target) {
      item.rot = target.rot;
      item.x = target.x;
      item.z = target.z;
      item.supportId = target.id;
      return commitGeneratedItem(item);
    }
  }

  if (rule.frontOf) {
    let target = S.items.find(i => i.type === rule.frontOf && pointInPoly(i.x, i.z, room.pts));
    if (target) {
      item.rot = rule.faceTarget ? (target.rot + 180) % 360 : target.rot;
      let offset = target.d/2 + item.d/2 + (rule.dist || 20);
      let rad = target.rot * Math.PI/180;
      let frontX = -Math.sin(rad);
      let frontZ = Math.cos(rad);
      let rightX = Math.cos(rad), rightZ = Math.sin(rad);
      let lateral = rule.lateral || [0, item.w * 0.75, -item.w * 0.75, item.w * 1.5, -item.w * 1.5];
      for (let shift of lateral) {
        item.x = target.x + frontX * offset + rightX * shift;
        item.z = target.z + frontZ * offset + rightZ * shift;
        if (canPlace(item, room.pts, clearance, rule)) return commitGeneratedItem(item);
      }
    }
  }

  if (rule.nextTo) {
    let targets = S.items.filter(i => i.type === rule.nextTo && pointInPoly(i.x, i.z, room.pts));
    for (let target of targets) {
      item.rot = target.rot;
      let offset = target.w/2 + item.w/2 + (rule.dist || 5);
      
      let rad = target.rot * Math.PI/180;
      let rightX = Math.cos(rad);
      let rightZ = Math.sin(rad);

      // try right
      item.x = target.x + rightX * offset;
      item.z = target.z + rightZ * offset;
      if (canPlace(item, room.pts, clearance, rule)) return commitGeneratedItem(item);
      
      // try left
      item.x = target.x - rightX * offset;
      item.z = target.z - rightZ * offset;
      if (canPlace(item, room.pts, clearance, rule)) return commitGeneratedItem(item);
    }
  }

  if (rule.oppositeTo) {
     let target = S.items.find(i => i.type === rule.oppositeTo && pointInPoly(i.x, i.z, room.pts));
     if (target) {
       item.rot = (target.rot + 180) % 360;
       
       let rad = target.rot * Math.PI/180;
       let frontX = -Math.sin(rad);
       let frontZ = Math.cos(rad);

       if (rule.wall) {
         let tx = target.x, tz = target.z;
         let tX = Infinity, tZ = Infinity;
         
         if (frontX > 0.001) tX = (rx1 - tx) / frontX;
         else if (frontX < -0.001) tX = (rx0 - tx) / frontX;
         
         if (frontZ > 0.001) tZ = (rz1 - tz) / frontZ;
         else if (frontZ < -0.001) tZ = (rz0 - tz) / frontZ;
         
         let t = Math.min(tX, tZ);
         if (t !== Infinity) {
           item.x = tx + frontX * t - frontX * (d/2 + clearance);
           item.z = tz + frontZ * t - frontZ * (d/2 + clearance);
         }
       } else {
         let dist = rule.dist || 300;
         item.x = target.x + frontX * dist;
         item.z = target.z + frontZ * dist;
       }

       if (canPlace(item, room.pts, clearance, rule)) return commitGeneratedItem(item);
     }
  }

  if (rule.wall) {
    let fracs = rule.wallFractions || [0.5, 0.28, 0.72, 0.14, 0.86, 0.4, 0.6];
    for (let side of sideOrder(rule, bounds)) {
      for (let frac of fracs) {
        item.rot = side === "north" ? 0 : side === "east" ? 90 : side === "south" ? 180 : 270;
        let wOpt = wallCandidate(item, bounds, side, frac, clearance);
        item.x = wOpt.x; item.z = wOpt.z;
        if (canPlace(item, room.pts, clearance, rule)) {
          return commitGeneratedItem(item);
        }
      }
    }
  }

  return null;
}

function makeCatalogItem(type, rot) {
  let f = FURN[type];
  return f && { type, x: 0, z: 0, w: f.w || 50, d: f.d || 50, h: f.h || 50, rot };
}

function markZone(items, zone) {
  (items || []).forEach(it => it.functionalZone = zone);
  return items;
}

function kitchenWorkZone(items) {
  if (!items || !items.length) return null;
  let boxes = items.map(it => aabbOf(it));
  let zone = {
    x0: Math.min(...boxes.map(b => b.x0)), x1: Math.max(...boxes.map(b => b.x1)),
    z0: Math.min(...boxes.map(b => b.z0)), z1: Math.max(...boxes.map(b => b.z1)),
  };
  let rot = ((items[0].rot || 0) % 360 + 360) % 360;
  // Reserve the work aisle in front of the cabinetry, so an open-plan sofa or
  // dining chair cannot drift into what is visually and functionally kitchen.
  if (rot === 0) zone.z1 += 95;
  else if (rot === 90) zone.x0 -= 95;
  else if (rot === 180) zone.z0 -= 95;
  else zone.x1 += 95;
  return zone;
}

// A kitchen is a continuous work run, not a collection of cabinets that each
// independently hunt for a wall. The full run is committed only when every
// module fits and the fridge/oven do not cover a window.
function placeKitchenRun(room, preferredSides) {
  let sequences = [
    ["fridge", "base", "sink", "dishwasher", "base", "cooktop", "oven"],
    ["fridge", "sink", "dishwasher", "base", "cooktop", "oven"],
    ["fridge", "sink", "cooktop"],
  ];
  let bounds = roomBounds(room.pts, WALL_T / 2 + 1);
  let order = sideOrder({ preferredSides }, bounds);
  for (let types of sequences) for (let side of order) for (let reversed of [false, true]) for (let alignment of [0.5, 0, 1, 0.25, 0.75]) {
    let list = (reversed ? types.slice().reverse() : types).map(type => makeCatalogItem(type, side === "north" ? 0 : side === "east" ? 90 : side === "south" ? 180 : 270));
    if (list.some(x => !x)) continue;
    let horizontal = side === "north" || side === "south";
    let widths = list.map(it => horizontal ? halfXZ(it).hx * 2 : halfXZ(it).hz * 2);
    let total = widths.reduce((a, b) => a + b, 0) + (list.length - 1) * 2;
    let available = horizontal ? bounds.x1 - bounds.x0 : bounds.z1 - bounds.z0;
    if (total > available) continue;
    let cursor = (horizontal ? bounds.x0 : bounds.z0) + (available - total) * alignment;
    let staged = [];
    for (let i = 0; i < list.length; i++) {
      let it = list[i], span = widths[i];
      if (horizontal) {
        it.x = cursor + span / 2;
        it.z = side === "north" ? bounds.z0 + halfXZ(it).hz : bounds.z1 - halfXZ(it).hz;
      } else {
        it.x = side === "west" ? bounds.x0 + halfXZ(it).hx : bounds.x1 - halfXZ(it).hx;
        it.z = cursor + span / 2;
      }
      if (!canPlace(it, room.pts, 0, { itemGap: 0, avoidWindows: it.h > 120, doorDepth: 95 })) break;
      it = commitGeneratedItem(it);
      if (!it) break;
      staged.push(it);
      cursor += span + 2;
    }
    if (staged.length === list.length) {
      let groupId = uid();
      staged.forEach(it => it.groupId = groupId);
      return markZone(staged, "kitchen");
    }
    staged.forEach(it => S.items.splice(S.items.indexOf(it), 1));
  }
  // Tight fallback: preserve the functional triangle even when a supplied
  // custom room is too small for a full standard run.
  let essentials = [];
  for (let type of ["fridge", "sink", "cooktop"]) {
    let it = placeItem(type, room, { wall: true, preferredSides, clearance: 4, avoidWindows: type === "fridge" });
    if (it) essentials.push(it);
  }
  return markZone(essentials, "kitchen");
}

function placeDiningSet(room, exclusionZones = []) {
  let table = placeItem("table", room, { center: true, clearance: 65, doorDepth: 90, exclusionZones });
  if (!table) {
    // A dining function outranks decorative living-room extras. In the
    // smallest open plans, release those optional pieces before giving up on
    // the table altogether.
    let optional = new Set(["coffee", "armchair", "plant", "floorLamp"]);
    S.items.filter(it => it.functionalZone === "living" && optional.has(it.type) && pointInPoly(it.x, it.z, room.pts))
      .forEach(it => S.items.splice(S.items.indexOf(it), 1));
    table = placeItem("table", room, { center: true, clearance: 42, doorDepth: 78, exclusionZones });
  }
  if (!table) return null;
  table.functionalZone = "dining";
  let chairSpec = FURN.chair;
  if (!chairSpec) return table;
  let rad = table.rot * Math.PI / 180;
  let right = { x: Math.cos(rad), z: Math.sin(rad) };
  let front = { x: -Math.sin(rad), z: Math.cos(rad) };
  let spots = [
    { v: right, dist: table.w / 2 + chairSpec.d / 2 + 12, rot: table.rot + 90 },
    { v: { x: -right.x, z: -right.z }, dist: table.w / 2 + chairSpec.d / 2 + 12, rot: table.rot + 270 },
    { v: front, dist: table.d / 2 + chairSpec.d / 2 + 12, rot: table.rot + 180 },
    { v: { x: -front.x, z: -front.z }, dist: table.d / 2 + chairSpec.d / 2 + 12, rot: table.rot },
  ];
  let groupId = uid();
  table.groupId = groupId;
  spots.forEach(spot => {
    let chair = makeCatalogItem("chair", (spot.rot + 360) % 360);
    chair.x = table.x + spot.v.x * spot.dist;
    chair.z = table.z + spot.v.z * spot.dist;
    if (canPlace(chair, room.pts, 8, { doorDepth: 90, exclusionZones })) {
      chair.groupId = groupId;
      chair.functionalZone = "dining";
      chair.facesId = table.id;
      commitGeneratedItem(chair);
    }
  });
  placeItem("pendant", room, { onTopOf: "table" });
  return table;
}

function placeLivingPair(room, combined, exclusionZones) {
  let bounds = roomBounds(room.pts, 0);
  let sides = combined ? ["south", "north", "east", "west"] : ["south", "west", "east", "north"];
  let fracs = combined ? [0.96, 0.04, 0.72, 0.28, 0.84, 0.16, 0.6, 0.4, 0.5] : [0.5, 0.3, 0.7, 0.18, 0.82];
  for (let side of sides) for (let frac of fracs) {
    let rot = side === "north" ? 0 : side === "east" ? 90 : side === "south" ? 180 : 270;
    let sofa = makeCatalogItem("sofa", rot);
    Object.assign(sofa, wallCandidate(sofa, bounds, side, frac, 20));
    if (!canPlace(sofa, room.pts, 20, { doorDepth: 105, exclusionZones })) continue;
    sofa.functionalZone = "living";
    sofa = commitGeneratedItem(sofa);
    if (!sofa) continue;

    let tv = makeCatalogItem("tv", sofa.rot);
    let rad = sofa.rot * Math.PI / 180;
    let front = { x: -Math.sin(rad), z: Math.cos(rad) };
    let tvHalf = halfXZ(tv);
    let wallGap = WALL_T / 2 + 1;
    let maxDist = front.x > 0.5 ? bounds.x1 - wallGap - tvHalf.hx - sofa.x
      : front.x < -0.5 ? sofa.x - (bounds.x0 + wallGap + tvHalf.hx)
      : front.z > 0.5 ? bounds.z1 - wallGap - tvHalf.hz - sofa.z
      : sofa.z - (bounds.z0 + wallGap + tvHalf.hz);
    let placedTv = null;
    // Start at the opposite wall, then step inward. This keeps the pair on one
    // optical axis even when a doorway means the TV console must float.
    for (let dist = maxDist; dist >= 145; dist -= 15) {
      tv.x = sofa.x + front.x * dist;
      tv.z = sofa.z + front.z * dist;
      if (canPlace(tv, room.pts, 8, { doorDepth: 78, exclusionZones })) {
        tv.functionalZone = "living";
        tv.facesId = sofa.id;
        tv = commitGeneratedItem(tv);
        if (!tv) continue;
        sofa.facesId = tv.id;
        placedTv = tv;
        break;
      }
    }
    if (placedTv) return { sofa, tv: placedTv };
    S.items.splice(S.items.indexOf(sofa), 1);
  }
  return null;
}

function furnishLiving(room, combined, exclusionZones = []) {
  let rug = placeItem("rug", room, { center: true, exclusionZones });
  if (rug) rug.functionalZone = "living";
  let pair = placeLivingPair(room, combined, exclusionZones);
  if (!pair) return null;
  let extras = [
    placeItem("coffee", room, { frontOf: "sofa", dist: 32, clearance: 12, doorDepth: 100, exclusionZones }),
    placeItem("armchair", room, { nextTo: "sofa", dist: 35, clearance: 12, exclusionZones }),
    placeItem("plant", room, { nextTo: "sofa", dist: 15, exclusionZones }),
    placeItem("floorLamp", room, { nextTo: "sofa", dist: 8, exclusionZones }),
    placeWallMounted("art", room, pair.sofa),
  ];
  extras.filter(Boolean).forEach(it => it.functionalZone = "living");
  return pair;
}

function furnishRoom(roomMeta, dr) {
  placeItem("ceilingLight", dr, { center: true });
  const type = roomTypeOf(roomMeta);

  if (type === "livingKitchen") {
    // Open-plan spaces need both functions. The old name-based branch matched
    // "Living" first and silently skipped the entire kitchen and dining area.
    // In an open room, anchor the compact kitchen to one side first. This
    // creates a readable kitchen zone instead of letting cabinets spread along
    // the full shared wall behind the living area.
    let kitchen = placeKitchenRun(dr, ["west", "north", "east"]);
    let kitchenZone = kitchenWorkZone(kitchen);
    let exclusions = kitchenZone ? [kitchenZone] : [];
    furnishLiving(dr, true, exclusions);
    placeDiningSet(dr, exclusions);
  } else if (type === "living") {
    furnishLiving(dr, false);
    placeDiningSet(dr);
  } else if (type === "kitchen") {
    placeKitchenRun(dr, ["west", "north", "south", "east"]);
    let b = roomBounds(dr.pts);
    if ((b.x1 - b.x0) * (b.z1 - b.z0) > 210000) {
      let island = placeItem("island", dr, { center: true, clearance: 90, doorDepth: 100 });
      if (island) {
        placeItem("barstool", dr, { frontOf: "island", faceTarget: true, dist: 12, lateral: [-35, 35], clearance: 8 });
        placeItem("barstool", dr, { frontOf: "island", faceTarget: true, dist: 12, lateral: [35, -35], clearance: 8 });
        placeItem("pendant", dr, { onTopOf: "island" });
      }
    }
  } else if (type === "masterBedroom" || type === "bedroom") {
    placeItem("rug", dr, { center: true });
    let bed = placeItem("bed", dr, { wall: true, preferredSides: ["west", "east", "north"], clearance: 22, avoidWindows: true, doorDepth: 72 }) ||
      placeItem("bed", dr, { wall: true, preferredSides: ["west", "east", "north"], clearance: 10, doorDepth: 52 });
    if (bed) {
      placeItem("nightstand", dr, { nextTo: "bed", dist: 8 });
      placeItem("nightstand", dr, { nextTo: "bed", dist: 8 });
      placeItem("tableLamp", dr, { onTopOf: "nightstand" });
      placeItem("tableLamp", dr, { onTopOf: "nightstand" });
      placeWallMounted("art", dr, bed);
    }
    placeItem("wardrobe", dr, { wall: true, preferredSides: ["north", "south", "east", "west"], clearance: 45, avoidWindows: true, doorDepth: 100 });
    let dresser = placeItem("dresser", dr, { wall: true, preferredSides: ["south", "east", "north"], clearance: 30, avoidWindows: true });
    if (dresser) placeWallMounted("wallMirror", dr, dresser);
  } else if (type === "kidsRoom") {
    placeItem("bunk", dr, { wall: true, preferredSides: ["west", "east", "north"], clearance: 24, avoidWindows: true, doorDepth: 105 });
    let desk = placeItem("desk", dr, { wall: true, preferredSides: ["north", "east", "south"], clearance: 32, doorDepth: 95 });
    if (desk) {
      placeItem("officeChair", dr, { frontOf: "desk", faceTarget: true, dist: 18, clearance: 12 });
      placeItem("laptop", dr, { onTopOf: "desk" });
    }
    placeItem("wardrobe", dr, { wall: true, preferredSides: ["south", "east", "north"], clearance: 35, avoidWindows: true, doorDepth: 95 });
    placeItem("bookshelf", dr, { wall: true, preferredSides: ["east", "north", "south"], clearance: 20, avoidWindows: true });
  } else if (type === "corridor" || type === "entry" || type === "landing") {
    placeItem("shoeCab", dr, { wall: true, preferredSides: ["west", "east"], clearance: 12, doorDepth: 80 });
    placeItem("coatRack", dr, { nextTo: "shoeCab", dist: 12 });
    placeItem("mirror", dr, { wall: true, preferredSides: ["west", "east"], clearance: 10 });
  } else if (type === "bathroom" || type === "ensuite") {
    // Residential minimums: keep 53cm usable in front of sanitary fixtures
    // and the WC centre at least 38cm from a side obstruction. Clear approach
    // zones may overlap each other, but no physical fixture may occupy one.
    placeBathroomFixture("shower", dr, {
      preferredSides: ["west", "north", "east"], wallFractions: [0.18, 0.82, 0.35, 0.65],
      clearDepth: 60, clearWidth: 90, clearance: 4, doorDepth: 48,
    });
    placeBathroomFixture("toilet", dr, {
      preferredSides: ["east", "north", "west"], wallFractions: [0.55, 0.72, 0.35, 0.82, 0.18],
      clearDepth: 53, clearWidth: 76, sideClearance: 38, clearance: 4, doorDepth: 48,
    });
    let vanity = placeBathroomFixture("vanity", dr, {
      preferredSides: ["north", "east", "west"], wallFractions: [0.5, 0.25, 0.75, 0.12, 0.88],
      clearDepth: 53, clearWidth: 76, clearance: 3, doorDepth: 45,
    });
    if (vanity) placeWallMounted("wallMirror", dr, vanity);

    // Laundry is not added to a bathroom at all. Without a dedicated laundry
    // niche and its own approach zone, a washer is optional clutter that can
    // compromise the legally required sanitary fixtures.
  }
}

function applyApartmentLayout(layout, replace, furnish = true) {

  buildLayout(layout, replace);
  if (!furnish) return;

  let detected = detectRooms();
  detected.forEach(dr => {
    // In append mode, furnish only the apartment that was just added. Existing
    // rooms must remain exactly as the user arranged them.
    let belongsToNewLayout = layout.rooms.some(r => pointInPoly((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, dr.pts));
    if (!belongsToNewLayout) return;
    let rm = S.roomMeta[dr.key];
    if (rm) {
      furnishRoom(rm, dr);
    }
  });
}

export const apartmentGenerateCommand = Object.freeze({
  id: "document.generate_apartment",
  failureCodes: Object.freeze(["INVALID_GENERATOR_SIZE", "INVALID_GENERATOR_ENVIRONMENT", "PROTECTED_STRUCTURE"]),
  prepare: function(params, env) {
    params = params || {};
    var size = params.size == null ? "small" : String(params.size);
    if (["small", "large", "random"].indexOf(size) === -1)
      return { ok: false, reason: "INVALID_GENERATOR_SIZE" };
    if (!env || env.state !== S) return { ok: false, reason: "INVALID_GENERATOR_ENVIRONMENT" };
    var replace = params.replace !== false;
    if (replace && replacementBlocked(S)) return { ok: false, reason: 'PROTECTED_STRUCTURE' };
    var permission = generatedChangePermission(S, "document.generate_apartment", { replace });
    if (!permission.ok) return permission;
    var seed = params.seed == null ? 1 : Number(params.seed);
    if (!Number.isFinite(seed)) return { ok: false, reason: "INVALID_GENERATOR_SIZE" };
    var layout;
    try { layout = generationPlan(size, replace, env.state, seed, params); }
    catch(error) { return {ok:false,reason:'INVALID_GENERATOR_SIZE',message:error.message}; }
    if(params.openings===false){layout.doors=[];layout.windows=[];}
    var version = env.version && typeof env.version.current === "function" ? env.version.current() : null;
    return { ok: true, plan: {
      command: "document.generate_apartment",
      expectedVersion: version,
      params: { size: size, replace: replace, seed: seed, furnish: params.furnish !== false, exactRooms:!!params.requirements?.length,
        layout: layout },
    } };
  },
  preview: function(plan) {
    var layout = plan && plan.params && plan.params.layout;
    if (!layout) return null;
    return { kind: "document", operation: "generate-apartment",
      bounds: { x0: 0, z0: 0, x1: layout.w, z1: layout.d },
      roomCount: layout.rooms.length, replace: plan.params.replace };
  },
  apply: function(plan, env) {
    const permission = generatedChangePermission(S, "document.generate_apartment", plan.params);
    if (!permission.ok) return permission;
    if (!env || env.state !== S) return { ok: false, reason: "INVALID_GENERATOR_ENVIRONMENT" };
    if (plan.params.replace && replacementBlocked(S)) return { ok: false, reason: 'PROTECTED_STRUCTURE' };
    var before = {
      walls: new Set(S.walls.map(function(w) { return String(w.id); })),
      openings: new Set(S.openings.map(function(o) { return String(o.id); })),
      items: new Set(S.items.map(function(item) { return String(item.id); })),
    };
    applyApartmentLayout(plan.params.layout, plan.params.replace, plan.params.furnish);
    if(plan.params.exactRooms){
      const rooms=detectRooms();
      for(const requested of plan.params.layout.rooms){
        const room=rooms.find(r=>pointInPoly((requested.x0+requested.x1)/2,(requested.z0+requested.z1)/2,r.pts)),measurement=roomMeasurements(S,room)?.interior;
        if(!measurement||Math.abs(measurement.width-(requested.x1-requested.x0-WALL_T))>1e-5||Math.abs(measurement.depth-(requested.z1-requested.z0-WALL_T))>1e-5)return {ok:false,reason:'INVALID_GENERATOR_SIZE'};
        if(requested.checklistId){const assigned=assignChecklistRoom(S,requested.checklistId,room.key);if(!assigned.ok)return assigned;}
      }
    }
    var created = [];
    S.walls.forEach(function(w) { if (!before.walls.has(String(w.id))) created.push({ kind: "wall", id: w.id }); });
    S.openings.forEach(function(o) { if (!before.openings.has(String(o.id))) created.push({ kind: "opening", id: o.id }); });
    S.items.forEach(function(item) { if (!before.items.has(String(item.id))) created.push({ kind: "item", id: item.id }); });
    return { ok: true, created: created, changed: [], effects: {
      dirty3D: true, refreshTree: true, refreshInspector: true,
      events: [{ type: "planner-apartment-generated" }],
    } };
  },
});

export function generateApartment(size = "small", replace = true) {
  return executeCommand(apartmentGenerateCommand, {
    size: size, replace: replace,
    seed: size === "random" ? Math.floor(Math.random() * 0xffffffff) : 1,
  }, generatedEnv(), { history: false });
}
