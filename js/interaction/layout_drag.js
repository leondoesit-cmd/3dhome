/* The planner's smart auto-layout and drag proxy, split out of
   js/interaction.js. It shares the editor's state through live imports from
   ../interaction.js. */
import { executeCommand, openingPlaceCommand, roomCreateCommand } from "../commands/index.js";
import { canWeld, captureClear, captureLock } from "../constraint_engine.js";
import { detectRooms, itemsInRoom, roomByKey, usedNodes, wallById, wallGeom } from "../geometry.js";
import { pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { alignItem } from "../interaction/hit_test.js";
import { setTool } from "../interaction/mep_tools.js";
import { agentCommandEnvironment, currentPlacementScene, startNodeConPick } from "../interaction/wall_edit.js";
import { holdToWall } from "../item_align.js";
import { applyAutoFace, markManualRot } from "../item_orient.js";
import { canDrag } from "../layers.js";
import { releaseIfMoved } from "../markers.js";
import { detachNodesFromWalls } from "../mep.js";
import { placementBatchFitsScene } from "../placement_resolver.js";
import { dropPoint, render2D } from "../plan2d.js";
import { attach as stackAttach, carryChildren, descendantsOf, detach as stackDetach, findSupport, hostOf, orphanChildren, reseat as stackReseat, rotateWith, topOf, wouldCycle } from "../stack.js";
import { S, WALL_T, touchItem3D } from "../state.js";
import { renderWarnPanel } from "../ui_warn.js";
import { fillProps, flash, refreshTree, select, syncStairVoids } from "../ui.js";
import { addAxisAlignment, addAxisDistance, addCoincident, addDistance, addEqualAngle, addFixed, anchorNode, angleSectorAtNode, mergeAnchorNodes, nodeAnchor, pinnedNodes, pruneCons, removeCon, solveWallCons, wallCons } from "../wall_constraints.js";
import { resolveWallDrawDefaults } from "../wall_draw.js";
import {
  CEILING_TYPES, CENTER_TYPES, dropDragProxy, proxyNodes,
} from "../interaction.js";

function arrangeRoom(r) {
  var items = itemsInRoom(r).filter(function (it) {
    return !it.locked;
  });
  if (!items.length) return;
  var minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
  r.pts.forEach(function (p) {
    minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
    minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
  });
  var inset = WALL_T / 2 + 4, // inner wall face + breathing gap
    gap = 12, // space between neighbours along a wall
    corner = 8, // keep off the exact corner
    cx = (minx + maxx) / 2,
    cz = (minz + maxz) / 2;
  // 4 walls: top(z=minz,rot0,front+Z) right(x=maxx,rot90) bottom(z=maxz,rot180) left(x=minx,rot270)
  var walls = [
    { axis: "x", lo: minx + inset + corner, hi: maxx - inset - corner, fixed: minz + inset, rot: 0 },
    { axis: "z", lo: minz + inset + corner, hi: maxz - inset - corner, fixed: maxx - inset, rot: 90 },
    { axis: "x", lo: minx + inset + corner, hi: maxx - inset - corner, fixed: maxz - inset, rot: 180 },
    { axis: "z", lo: minz + inset + corner, hi: maxz - inset - corner, fixed: minx + inset, rot: 270 },
  ];
  walls.forEach(function (w) {
    w.cursor = w.lo;
  });

  var rugs = [], mids = [], ceil = [], wallItems = [];
  items.forEach(function (it) {
    if (it.type === "rug") rugs.push(it);
    else if (CEILING_TYPES[it.type]) ceil.push(it);
    else if (CENTER_TYPES[it.type]) mids.push(it);
    else wallItems.push(it);
  });
  // biggest first packs tighter
  wallItems.sort(function (a, b) {
    return b.w * b.d - a.w * a.d;
  });

  wallItems.forEach(function (it) {
    var run = it.w; // width runs along the wall, depth (d) faces it
    var best = null;
    walls.forEach(function (w) {
      var remaining = w.hi - w.cursor;
      if (remaining >= run && (!best || remaining > best.rem))
        best = { w: w, rem: remaining };
    });
    if (!best) {
      mids.push(it); // no wall run fits — fall back to the centre row
      return;
    }
    var w = best.w,
      along = w.cursor + run / 2;
    w.cursor += run + gap;
    it.rot = w.rot;
    if (w.axis === "x") {
      it.x = along;
      it.z = w.rot === 0 ? w.fixed + it.d / 2 : w.fixed - it.d / 2;
    } else {
      it.z = along;
      it.x = w.rot === 270 ? w.fixed + it.d / 2 : w.fixed - it.d / 2;
    }
  });

  // rugs sit dead centre; ceiling fixtures share the ceiling, so spread them
  // along it instead of stacking every light and diffuser on one point
  rugs.forEach(function (it) {
    it.rot = 0;
    it.x = cx;
    it.z = cz;
  });
  var ceilTotal = ceil.reduce(function (s, it) { return s + it.w; }, 0) + gap * Math.max(0, ceil.length - 1),
    ceilX = cx - ceilTotal / 2;
  ceil.forEach(function (it) {
    it.rot = 0;
    it.x = ceil.length === 1 ? cx : ceilX + it.w / 2;
    it.z = cz;
    ceilX += it.w + gap;
  });
  // tables/islands in a centred row (over the rug)
  var totalW = mids.reduce(function (s, it) {
    return s + it.w;
  }, 0) + gap * Math.max(0, mids.length - 1);
  var startX = cx - totalW / 2;
  mids.forEach(function (it) {
    it.rot = 0;
    it.x = startX + it.w / 2;
    it.z = cz;
    startX += it.w + gap;
  });
}

export function autoArrangeAll() {
  var rooms = detectRooms();
  if (!rooms.length) {
    flash(t("f_needRoom"));
    return;
  }
  pushHistory();
  rooms.forEach(arrangeRoom);
  select(null);
  S.dirty3D = true;
  render2D();
  refreshTree();
  flash(t("f_arranged"));
}

/* Repoint every wall that used `from` at `keep`, then drop any wall that has
   collapsed to zero length. Two corners at the same coordinates are NOT
   connected — detectRooms walks node indices, so a shape closed by a coincident
   pair reads as open and yields no room at all. */
export function weldNodes(keep, from) {
  if (keep === from) return;
  mergeAnchorNodes(keep, from);
  S.walls.forEach(function (w) {
    if (w.a === from) w.a = keep;
    if (w.b === from) w.b = keep;
  });
  var dead = {};
  S.walls.forEach(function (w) {
    if (w.a === w.b) dead[w.id] = 1;
  });
  if (Object.keys(dead).length) {
    detachNodesFromWalls(dead);
    S.walls = S.walls.filter(function (w) {
      return !dead[w.id];
    });
    S.openings = S.openings.filter(function (o) {
      return !dead[o.wall];
    });
  }
}
function weldAt(ni) {
  var n = S.nodes[ni];
  if (!n) return;
  for (var k = 0; k < S.nodes.length; k++) {
    if (k === ni) continue;
    var m = S.nodes[k];
    if (m && Math.abs(m.x - n.x) < 2 && Math.abs(m.z - n.z) < 2 && canWeld(ni, k))
      weldNodes(ni, k);
  }
}
/* Merge every pair of corners sitting on top of each other. Dragging a corner
   onto another used to copy its coordinates and stop there, leaving a shape
   that looked closed but detected zero rooms; nothing outside openWall() ever
   welded. Runs after an edit settles, from normalizeStructure(). */
export function weldCoincidentNodes() {
  var u = usedNodes(),
    idx = Object.keys(u).map(Number);
  for (var i = 0; i < idx.length; i++) {
    var a = S.nodes[idx[i]];
    if (!a) continue;
    for (var j = i + 1; j < idx.length; j++) {
      var b = S.nodes[idx[j]];
      if (!b) continue;
      /* The 2 cm gate is wider than the constraint engine's idea of "the same
         point", so an automatic weld could quietly drag a locked wall's end up
         to 2 cm and undo a joint the engine had just released. canWeld refuses
         exactly those; coincident corners (the normal case) still merge. */
      if (
        Math.abs(a.x - b.x) < 2 && Math.abs(a.z - b.z) < 2 &&
        canWeld(idx[i], idx[j])
      )
        weldNodes(idx[i], idx[j]);
    }
  }
}

function ownedNodeAnchor(ni) {
  var w = S.walls.find(function (q) { return q.a === ni || q.b === ni; });
  return nodeAnchor(ni, w && w.id, w ? (w.a === ni ? "a" : "b") : null);
}

/* Contextual relations for two explicitly selected corners. The order is
   meaningful: the first is the held reference, the second is driven. */
/* Pin the selected corner (or every corner of a multi-selection). Its own
   entry point because a pin is the one relation that needs exactly ONE piece
   of geometry — every other verb here is about a pair. */
export function togglePinSelected() {
  var nodes = S.sel && S.sel.kind === "nodes" ? S.sel.refs.slice()
    : S.sel && S.sel.kind === "node" ? [S.sel.ref] : [];
  if (!nodes.length) return false;
  pushHistory();
  var pins = pinnedNodes(), removed = 0, added = 0;
  nodes.forEach(function (ni) {
    if (pins[ni]) {
      // already pinned: the button is a toggle, so unpin it
      wallCons()
        .filter(function (c) { return c.type === "fixed" && anchorNode(c.a) === ni; })
        .forEach(function (c) { removeCon(c.id); removed++; });
    } else if (addFixed(ownedNodeAnchor(ni))) added++;
  });
  var pinResult = solveWallCons();
  S.dirty3D = true;
  fillProps();
  render2D();
  refreshTree();
  renderWarnPanel(true);
  flash(pinResult.unresolved
    ? t("wc_unresolved", { n: pinResult.unresolved })
    : added ? t("f_pinned", { n: added }) : t("f_unpinned", { n: removed }),
  pinResult.unresolved ? "error" : undefined);
  return true;
}

export function applyNodePairRelation(type) {
  if (!S.sel || S.sel.kind !== "nodes" || S.sel.refs.length !== 2) return false;
  var keep = S.sel.refs[0], drive = S.sel.refs[1], A = S.nodes[keep], B = S.nodes[drive];
  if (!A || !B || keep === drive) return false;
  if (type === "join") {
    var active = S.walls.filter(function (w) { return w.a === drive || w.b === drive; });
    var ids = active.map(function (w) { return w.id; });
    if (!canWeld(keep, drive, ids)) {
      flash("The selected dimensions prevent this join", "error");
      return false;
    }
    pushHistory();
    B.x = A.x; B.z = A.z;
    weldNodes(keep, drive);
    active.forEach(function (w) { captureLock(w); captureClear(w); });
    var joinResult = solveWallCons();
    select({ kind: "node", ref: keep });
    S.dirty3D = true;
    render2D();
    refreshTree();
    renderWarnPanel(true);
    flash(joinResult.unresolved
      ? t("wc_unresolved", { n: joinResult.unresolved })
      : "Corners joined", joinResult.unresolved ? "error" : "success");
    return true;
  }
  /* Symmetry needs a third piece of geometry, so it arms a pick instead of
     completing here — the mirror line is a wall the user clicks next. */
  if (type === "symmetric" || type === "symmetricPerp") {
    startNodeConPick(type, [keep, drive]);
    flash(t("wc_pick_symmetric"));
    return true;
  }
  pushHistory();
  var a = ownedNodeAnchor(keep), b = ownedNodeAnchor(drive), made = null;
  if (type === "distance") made = addDistance(a, b, null, "a");
  else if (type === "coincident") made = addCoincident(a, b, "a");
  else if (type === "alignX" || type === "alignZ") made = addAxisAlignment(type, a, b);
  else if (type === "axisDistX" || type === "axisDistZ") made = addAxisDistance(type, a, b);
  else if (type === "equalAngle") {
    function selectedSector(ni) {
      var picked = S.nodePairAngles && S.nodePairAngles[ni];
      return picked ? angleSectorAtNode(ni, picked.w1, picked.w2) : angleSectorAtNode(ni);
    }
    made = addEqualAngle(selectedSector(keep), selectedSector(drive));
    /* A reference equal-angle is the "compare these two corners" verb: it
       measures both sectors and their difference without straightening
       anything. Same relation, no say in the geometry. */
    if (made && S.nodePairReport) made.report = true;
  }
  if (!made) {
    flash("This relation cannot be created from the selected corners", "error");
    return false;
  }
  var relationResult = solveWallCons();
  S.dirty3D = true;
  fillProps();
  render2D();
  refreshTree();
  renderWarnPanel(true);
  if (relationResult.unresolved) {
    flash(t("wc_unresolved", { n: relationResult.unresolved }), "error");
    return true;
  }
  flash(type === "equalAngle" ? "Angles made equal" : "Relation added", "success");
  return true;
}
/* The inspector uses the same single-host command as pointer placement. A
   selected wall is already an unambiguous target; nearby coincident walls are
   never inferred or modified as a side effect. */
export function placeOpeningOnSelected(type, opts) {
  if (!S.sel || S.sel.kind !== "wall") return null;
  type = type === "door" || type === "window" || type === "passage" ? type : "passage";
  var w = S.sel.ref, options = opts || {}, gm = wallGeom(w);
  var params = { wallId: w.id, type: type, s: options.s != null ? Number(options.s) : gm.L / 2 };
  ["width", "height", "sill"].forEach(function (key) { if (options[key] != null) params[key] = Number(options[key]); });
  var result = executeCommand(openingPlaceCommand, params, agentCommandEnvironment(), {
    label: t("f_openingPlaced", { name: t(type) }),
    presentation: { selectCreated: true },
  });
  if (!result.ok || !result.created.length) return null;
  var made = S.openings.find(function (opening) { return opening.id === result.created[0].id; });
  if (!made) return null;
  S.segPreview = null;
  return made;
}

export function openWall() {
  if (!S.sel || S.sel.kind !== "wall") return;
  var w = S.sel.ref;
  pushHistory();
  weldAt(w.a);
  weldAt(w.b);
  var A = w.a,
    B = w.b,
    ids = {};
  S.walls.forEach(function (x) {
    if ((x.a === A && x.b === B) || (x.a === B && x.b === A)) ids[x.id] = 1;
  });
  var n = Object.keys(ids).length;
  detachNodesFromWalls(ids);
  S.walls = S.walls.filter(function (x) {
    return !ids[x.id];
  });
  S.openings = S.openings.filter(function (o) {
    return !ids[o.wall];
  });
  pruneCons(); // a dimension to a wall that is gone is worse than no dimension
  select(null);
  S.dirty3D = true;
  render2D();
  refreshTree(); // removing walls merges rooms — resync the tree + room metadata
  flash(t("f_wallOpened", { n: n }));
}
export function addSpace(w, d, label, isCorridor) {
  var dp = dropPoint(); // never NaN, even with the plan pane hidden
  var cx = Math.round(dp.x / 10) * 10,
    cz = Math.round(dp.z / 10) * 10;
  var defaults = resolveWallDrawDefaults();
  var result = executeCommand(roomCreateCommand, {
    from: { x: cx - w / 2, z: cz - d / 2 }, to: { x: cx + w / 2, z: cz + d / 2 },
    type: defaults.typeId, kind: defaults.kind, loc: defaults.loc, dimSide: defaults.dimSide,
    height: defaults.height, thickness: defaults.thickness, datum: defaults.datum, phase: defaults.phase,
    name: label, isCorridor: !!isCorridor,
  }, agentCommandEnvironment(), { label: t("f_added", { label: label }) });
  if (!result.ok) { flash(t("f_placeFail"), "error"); return; }
  var key = result.created.filter(function (entry) { return entry.kind === "wall"; })
    .map(function (entry) { return entry.id; }).sort(function (a, b) { return a - b; }).join(",");
  setTool("select");
  select({ kind: "room", ref: key });
  render2D();
  flash(t("f_added", { label: label }));
}
// open a manual segment in the selected wall: a passage of given width/height centered at `s` (cm along wall).
// also cuts any wall coincident at that point (the adjacent room's matching wall) so both open.
export function openSegment(s, width, height) {
  var made = placeOpeningOnSelected("passage", { s: s, width: width, height: height, sill: 0 });
  if (made) flash(t("f_segOpened", { w: Math.round(made.width), h: Math.round(made.height) }));
}
/* Delete a whole room: its items, the walls that bound it alone, and their
   openings. A wall shared with a neighbouring room is kept — it still bounds
   that room — so deleting one of two rooms leaves the survivor intact and the
   party wall standing. Undoable like every other structural edit. */
export function deleteRoom(key) {
  var r = roomByKey(key);
  if (!r) return false;
  if (S.roomMeta[key] && S.roomMeta[key].locked) {
    flash(t("f_roomLockedDel"), "error");
    return false;
  }
  pushHistory();
  var shared = {};
  detectRooms().forEach(function (o) {
    if (o.key === key) return;
    o.key.split(",").forEach(function (id) {
      shared[id] = 1;
    });
  });
  var kill = {};
  key.split(",").forEach(function (id) {
    if (!shared[id]) kill[id] = 1;
  });
  var dead = itemsInRoom(r);
  S.items = S.items.filter(function (it) {
    return dead.indexOf(it) === -1;
  });
  // a piece outside the room could have been standing on one inside it
  orphanChildren(null);
  detachNodesFromWalls(kill);
  S.walls = S.walls.filter(function (w) {
    return !kill[w.id];
  });
  S.openings = S.openings.filter(function (o) {
    return !kill[o.wall];
  });
  pruneCons();
  delete S.roomMeta[key];
  var selGone =
    S.sel &&
    ((S.sel.kind === "room" && S.sel.ref === key) ||
      (S.sel.kind === "item" && dead.indexOf(S.sel.ref) !== -1) ||
      (S.sel.kind === "items" &&
        S.sel.refs.some(function (it) {
          return dead.indexOf(it) !== -1;
        })) ||
      (S.sel.kind === "wall" && kill[S.sel.ref.id]) ||
      (S.sel.kind === "opening" && kill[S.sel.ref.wall]));
  if (selGone) select(null);
  S.dirty3D = true;
  refreshTree();
  render2D();
  flash(t("f_roomDeleted", { n: dead.length }));
  return true;
}

export function rotateRoom(deg) {
  if (!S.sel || S.sel.kind !== "room") return;
  var r = roomByKey(S.sel.ref);
  if (!r) return;
  pushHistory();
  var a = (deg * Math.PI) / 180,
    ca = Math.cos(a),
    sa = Math.sin(a),
    cx = r.cx,
    cz = r.cz,
    seen = {};
  r.nidx.forEach(function (i) {
    if (seen[i]) return;
    seen[i] = 1;
    var n = S.nodes[i],
      dx = n.x - cx,
      dz = n.z - cz;
    n.x = Math.round((cx + dx * ca - dz * sa) * 10) / 10;
    n.z = Math.round((cz + dx * sa + dz * ca) * 10) / 10;
  });
  // items in the room rotate with it (position about the room center + own heading)
  itemsInRoom(r).forEach(function (it) {
    var dx = it.x - cx,
      dz = it.z - cz;
    it.x = Math.round((cx + dx * ca - dz * sa) * 10) / 10;
    it.z = Math.round((cz + dx * sa + dz * ca) * 10) / 10;
    it.rot = (((it.rot || 0) + deg) % 360 + 360) % 360;
  });
  S.dirty3D = true;
  fillProps();
  render2D();
}

/* Did this frame move a corner the proxy never lifted? `before` is the
   snapshotNodes() array the corner drags already take for enforceLocks, so this
   costs one comparison pass over the corners and no extra snapshot. A change in
   the node array's own length is a topology commit (a split or a weld) and is
   treated as a miss without looking further. */
function auditDragProxy(before) {
  if (!proxyNodes || !before) return;
  if (S.nodes.length !== before.length) return void dropDragProxy();
  for (var i = 0; i < S.nodes.length; i++) {
    if (proxyNodes.indexOf(i) !== -1) continue;
    var b = before[i], n = S.nodes[i];
    if (!b !== !n) return void dropDragProxy();
    if (b && n && (b.x !== n.x || b.z !== n.z)) return void dropDragProxy();
  }
}

function normalizedRotation(value) {
  return ((Number(value) || 0) % 360 + 360) % 360;
}

/* Apply an already-resolved translation. This is deliberately below every
   pointer/model intent resolver: it never grids, aligns, auto-faces or reads
   viewport/modifier state. Drag calls it once per frame; a prepared command
   calls it once inside its existing history transaction. */
function applyResolvedItemTranslation(it, x, z, options) {
  options = options || {};
  var oldX = Number(it.x), oldZ = Number(it.z), changed = [it];
  it.x = Number(x);
  it.z = Number(z);
  var host = null;
  if (options.resolveSupport !== false) {
    var oldOn = it.on, oldElev = it.elev;
    host = findSupport(it, it.x, it.z);
    if (host) stackAttach(it, host);
    else if (it.on != null) stackDetach(it);
    /* Changing this item's own elevation changes the top inherited by every
       rider above it. Translation alone cannot repair that vertical chain. */
    stackReseat(it);
    if (oldOn !== it.on || oldElev !== it.elev) {
      descendantsOf(it, new Set([it]), []).forEach(function(child) {
        if (changed.indexOf(child) === -1) changed.push(child);
        if (options.touch3D) touchItem3D(child, "move");
      });
    }
    if (options.trackDragState) S.stackHost = host || null;
  }
  var moved = new Set(options.excludedItems || []); moved.add(it);
  carryChildren(it, it.x - oldX, it.z - oldZ, moved).forEach(function(child) {
    changed.push(child);
    if (options.touch3D) touchItem3D(child, "move");
  });
  if (options.touch3D) touchItem3D(it, "move");
  return changed;
}

/* Drop-time domain effects, shared by 2D/3D gestures and command commits.
   Absence of holdWallId means PRESERVE an existing hold; raw coordinates must
   never invent or silently release one. */
function finalizeItemPlacement(it, options) {
  options = options || {};
  if (!it) return;
  if (options.releaseMarker !== false) releaseIfMoved(it);
  if (options.holdWallId != null) {
    var wall = wallById(options.holdWallId);
    if (wall && !it.locked) holdToWall(it, wall, 0);
  }
  if (options.markRotationUser) markManualRot(it);
}

/* One-shot exact-pose commit used by planner commands. Resolution has already
   happened, so re-running moveItemTo here would incorrectly apply zoom-aware
   snapping and drag-only auto-facing a second time. */
function commitItemPlacement(it, placement, env) {
  placement = placement || {};
  // The same gate the command validated with, so an AI proposal (exempt from
  // the work-set rule) commits exactly what it previewed.
  var allowed = env && env.services && typeof env.services.canPlaceItem === "function"
    ? env.services.canPlaceItem(it) : canDrag({ kind: "item", ref: it });
  if (!it || it.locked || !allowed)
    return { ok: false, reason: it && it.locked ? "ITEM_LOCKED" : "PERMISSION_DENIED" };
  var changed = [it], oldRot = normalizedRotation(it.rot);
  if (placement.rotationSpecified) {
    var nextRot = normalizedRotation(placement.rotation), delta = nextRot - oldRot;
    it.rot = nextRot;
    var spun = new Set(env && env.placementBatchItems || []); spun.add(it);
    rotateWith(it, delta, spun).forEach(function(child) { changed.push(child); });
  }
  applyResolvedItemTranslation(it, placement.x, placement.z, {
    resolveSupport: !(env && env.placementBatchItems),
    excludedItems: env && env.placementBatchItems,
  }).forEach(function(entry) {
    if (changed.indexOf(entry) === -1) changed.push(entry);
  });
  finalizeItemPlacement(it, {
    releaseMarker: true,
    holdWallId: placement.holdWallId,
    markRotationUser: placement.rotationSpecified && placement.markRotationUser,
  });
  syncStairVoids(it);
  return { ok: true, changedIds: changed.map(function(entry) { return entry.id; }) };
}

function beforePlacementCommandBatch(entries, env) {
  var items = new Set(), ids = new Set();
  (entries || []).forEach(function(entry) {
    if (!entry || entry.commandId !== "item.move") return;
    var id = entry.plan && entry.plan.params && entry.plan.params.itemId;
    if (ids.has(String(id))) return;
    ids.add(String(id));
    var item = (S.items || []).find(function(candidate) { return String(candidate.id) === String(id); });
    if (item) items.add(item);
  });
  var moveCount = (entries || []).filter(function(entry) { return entry && entry.commandId === "item.move"; }).length;
  if (ids.size !== moveCount) return { ok: false, reason: "AMBIGUOUS_ITEM_TARGET" };
  var semantic = (entries || []).filter(function(entry) {
    return entry && entry.commandId === "item.move" && entry.plan && entry.plan.params && entry.plan.params.placementGuard;
  }).map(function(entry) {
    var params = entry.plan.params;
    return { itemId: params.itemId, x: params.to.x, z: params.to.z,
      rot: params.rotationSpecified ? params.rotation : null };
  });
  if (semantic.length && !placementBatchFitsScene(currentPlacementScene(), semantic))
    return { ok: false, reason: "PLACEMENT_GEOMETRY_CHANGED" };
  env.placementBatchItems = items.size ? items : null;
  return { ok: true };
}

function afterPlacementCommandBatch(_entries, env) {
  var items = env.placementBatchItems;
  if (!items) return { ok: true };
  var changed = [];
  items.forEach(function(item) {
    var oldOn = item.on, oldElev = item.elev;
    var host = findSupport(item, item.x, item.z);
    if (host) stackAttach(item, host);
    else if (item.on != null) stackDetach(item);
    stackReseat(item);
    changed.push({ kind: "item", id: item.id });
    if (oldOn !== item.on || oldElev !== item.elev) {
      descendantsOf(item, new Set([item]), []).forEach(function(child) {
        changed.push({ kind: "item", id: child.id });
      });
    }
  });
  return { ok: true, changed: changed };
}

function cleanupPlacementCommandBatch(_entries, env) {
  env.placementBatchItems = null;
}

function validatePlacementRelations(summary) {
  var changedIds = new Set((summary.changed || []).filter(function(entry) {
    return entry && entry.kind === "item";
  }).map(function(entry) { return String(entry.id); }));
  if (!changedIds.size) return { ok: true };
  var markerOwners = new Set();
  for (var i = 0; i < S.items.length; i++) {
    var item = S.items[i];
    if (!changedIds.has(String(item.id))) continue;
    if (!Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.z)) ||
        !Number.isFinite(Number(item.rot || 0))) return { ok: false, reason: "POST_VALIDATION_FAILED" };
    if (item.on != null) {
      var host = hostOf(item);
      if (!host || wouldCycle(item, host) || !Number.isFinite(Number(item.elev)) ||
          Math.abs(Number(item.elev) - Number(topOf(host))) > 1e-6)
        return { ok: false, reason: "POST_VALIDATION_FAILED" };
    }
    if (item.hold && !wallById(item.hold.wall)) return { ok: false, reason: "POST_VALIDATION_FAILED" };
  }
  (S.markers || []).forEach(function(marker) {
    if (!marker || marker.itemId == null || !changedIds.has(String(marker.itemId))) return;
    var key = String(marker.itemId);
    if (markerOwners.has(key)) markerOwners.add("duplicate:" + key);
    else markerOwners.add(key);
  });
  if (Array.from(markerOwners).some(function(key) { return key.indexOf("duplicate:") === 0; }))
    return { ok: false, reason: "POST_VALIDATION_FAILED" };
  return { ok: true };
}

export function moveItemTo(it, nx, nz) {
  var tx = Math.round(nx / 2) * 2,
    tz = Math.round(nz / 2) * 2;
  /* Which way it faces is settled BEFORE the position snap, not after: turning
     a piece changes its footprint, and the flush-to-wall snap below measures
     that footprint. Deciding afterwards left a bed snapped flush by its side
     and then turned, i.e. standing half inside the wall. (js/item_orient.js) */
  var faced = applyAutoFace(it, tx, tz, { host: findSupport(it, tx, tz) });
  // a piece standing on this one turns with it, exactly as a manual rotation
  if (faced) rotateWith(it, faced, new Set([it]));
  var a = alignItem(tx, tz, it);
  applyResolvedItemTranslation(it, a.x, a.z, { trackDragState: true, touch3D: true });
}

export {
  afterPlacementCommandBatch, auditDragProxy, beforePlacementCommandBatch,
  cleanupPlacementCommandBatch, commitItemPlacement, finalizeItemPlacement,
  normalizedRotation, ownedNodeAnchor, validatePlacementRelations,
};
