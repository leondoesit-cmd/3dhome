/* The planner's tool helpers and MEP routing, split out of js/interaction.js.
   It shares the editor's state through live imports from ../interaction.js. */
import { onDrawEnded, updateCadHud } from "../cad_hud.js";
import { executeCommand, roomCreateCommand, wallDrawCommand } from "../commands/index.js";
import { captureClear, captureLock, preserveClear } from "../constraint_engine.js";
import { detectRooms, normalizeStructure, pendingCuts, wallById, wallClearLength, wallGeom, wallPointAt, wallProject } from "../geometry.js";
import { beginHistory, currentHistoryId, pushHistory } from "../history.js";
import { t, tTouch } from "../i18n.js";
import { hitWall } from "../interaction/hit_test.js";
import { weldNodes } from "../interaction/layout_drag.js";
import { adoptMergedRoomMeta } from "../interaction/room_tools.js";
import { applyRemove, getOrMakeNode, healDrawnWallEnds, materializePlannerWall, resolveLanding, splitWallAt } from "../interaction/wall_edit.js";
import { isLayerLocked } from "../layers.js";
import { cancelMEP, cancelRoute, ensureMEP, finishRoute, nodePos, runCrossesOpening, snapMEPPoint } from "../mep.js";
import { plan, render2D } from "../plan2d.js";
import { wallSeparates } from "../room_graph.js";
import { roomPreset } from "../room_presets.js";
import { S, SNAP_GRID, WALL_H, WALL_T, fin, uid } from "../state.js";
import { cancelTouchPrecisionTrial } from "../touch_precision_ui.js";
import { setConstraintHover } from "../ui_warn.js";
import { fillProps, flash, refreshTree, select } from "../ui.js";
import { pruneCons } from "../wall_constraints.js";
import { applyWallDrawDefaults, isWallDrawTool, joinProposal, offsetGhost, offsetSideFromCursor, paintWallWithDefaults, resetDrawDirLock, resolveWallDrawDefaults, reverseWallStyle, throughCrossings } from "../wall_draw.js";
import {
  PLANNER_COMMAND_HISTORY, STRUCTURE_AUTHOR_TOOLS, isElevation,
} from "../interaction.js";

export function setTool(toolName) {
  cancelTouchPrecisionTrial();
  if (!toolName) toolName = "select";
  if (isElevation() && isWallDrawTool(toolName)) {
    flash(t("tool_plan_only"));
    toolName = "select";
  }
  if (STRUCTURE_AUTHOR_TOOLS[toolName] && isLayerLocked("structure")) {
    flash(t("tool_structure_locked"), "error");
    toolName = "select";
  }
  S.tool = toolName;
  if (S.conHover != null) setConstraintHover(null);
  S.eraseHover = null;
  S.freshWall = null; // picking any tool ends the just-drawn run
  if (toolName !== "wall") finishDraw();
  if (toolName !== "arcwall") S.arcDraft = null;
  if (toolName !== "rect" && toolName !== "slabvoid") S.rectDraft = null;
  if (toolName !== "roomstamp") { S.roomGhost = null; S.roomPrepared = null; }
  /* Picking the tool from the toolbar or with 0 has to arm SOMETHING, or the
     first move over the plan shows nothing and the tool looks broken. The last
     preset used survives, so this default only ever fires once a session. */
  if (toolName === "roomstamp" && !S.roomStamp) {
    var firstPreset = roomPreset("bedroom");
    if (firstPreset)
      S.roomStamp = { id: firstPreset.id, rot: 0, w: firstPreset.w, d: firstPreset.d, connMode: "auto", doorWallIndex: 0 };
  }
  if (toolName !== "walloffset") S.offsetDraft = null;
  if (toolName !== "walljoin") S.joinPick = null;
  if (toolName !== "wallbite") S.biteDraft = null;
  if (toolName !== "point") {
    S.markerPreview = null;
    S.snapGuides = [];
  }
  if (toolName !== "select") S.placeType = null;
  // leaving the MEP tools clears any armed palette entry + in-progress route
  if (toolName.indexOf("mep") !== 0) cancelMEP();
  document.querySelectorAll(".tool").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-tool") === toolName);
  });
  if (plan && plan.style) plan.style.cursor = toolName === "select" && !S.placeType ? "default" : "crosshair";
  if (toolName !== "point") S.snapInfo = null;
  if (document.documentElement) document.documentElement.setAttribute("data-tool", toolName || "select");
  window.dispatchEvent(new CustomEvent("planner-tool"));
  updateCadHud();
  syncElevationTools();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("planner-draw-defaults"));
}

export function syncElevationTools() {
  var elev = isElevation();
  if (elev && (S.tool === "wall" || S.tool === "arcwall")) {
    S.tool = "select";
    if (plan) plan.style.cursor = "default";
  }
  if (typeof document === "undefined") return;
  document.querySelectorAll(".tool[data-tool]").forEach(function (b) {
    var tool = b.getAttribute("data-tool");
    var blocked = elev && isWallDrawTool(tool);
    var locked = !!STRUCTURE_AUTHOR_TOOLS[tool] && isLayerLocked("structure");
    b.disabled = !!blocked || locked;
    b.classList.toggle("elev-blocked", blocked);
    b.classList.toggle("layer-blocked", locked);
    b.classList.toggle("active", b.getAttribute("data-tool") === S.tool);
    if (blocked) b.title = t("tool_plan_only");
    else if (locked) b.title = t("tool_structure_locked");
    else if (b.getAttribute("data-i18n-title")) b.title = t(b.getAttribute("data-i18n-title"));
  });
}

/* ---- MEP tool helpers ---- */
// finish the in-progress route into a run (or discard if <2 points)
function commitRoute() {
  var m = ensureMEP();
  if (!m.route) return;
  if (m.route.pts.length >= 2) {
    if (runCrossesOpening(m.route)) {
      flash(t("mep_doorBlocked"), "error");
      return;
    }
    pushHistory();
    var run = finishRoute();
    select({ kind: "mepRun", ref: run });
    setTool("select");
  } else {
    cancelRoute();
  }
  S.dirty3D = true;
  render2D();
  refreshTree();
}
// arm a drag on the hit MEP entity (node move / vertex move / whole-run move)
function beginMEPDrag(hm, px, pz) {
  S.action = "mep";
  beginHistory();
  if (hm.kind === "mepNode") {
    var p = nodePos(hm.ref);
    S.mepDrag = { mode: "node", ref: hm.ref, ox: px - p.x, oz: pz - p.z };
  } else if (hm.vi >= 0) {
    S.mepDrag = { mode: "vertex", ref: hm.ref, vi: hm.vi };
  } else {
    S.mepDrag = {
      mode: "run", ref: hm.ref, sx: px, sz: pz,
      orig: hm.ref.pts.map(function (p) { return { x: p.x, z: p.z }; }),
    };
  }
}
function dragMEP(px, pz) {
  var d = S.mepDrag;
  if (!d) return;
  if (d.mode === "node") {
    var sp = snapMEPPoint(px - d.ox, pz - d.oz);
    // only wall-plane devices ride a wall; ceiling/floor devices stay free
    var onWall = d.ref.layer === "wall" && sp.wall != null;
    d.ref.wall = onWall ? sp.wall : null;
    d.ref.s = onWall ? sp.s : null;
    d.ref.x = sp.x;
    d.ref.z = sp.z;
  } else if (d.mode === "vertex") {
    var sp2 = snapMEPPoint(px, pz);
    var oldX = d.ref.pts[d.vi].x, oldZ = d.ref.pts[d.vi].z;
    d.ref.pts[d.vi].x = sp2.x;
    d.ref.pts[d.vi].z = sp2.z;
    if (runCrossesOpening(d.ref)) {
      d.ref.pts[d.vi].x = oldX;
      d.ref.pts[d.vi].z = oldZ;
    }
  } else if (d.mode === "run") {
    var dx = Math.round((px - d.sx) / SNAP_GRID) * SNAP_GRID;
    var dz = Math.round((pz - d.sz) / SNAP_GRID) * SNAP_GRID;
    d.orig.forEach(function (o, i) {
      d.ref.pts[i].x = o.x + dx;
      d.ref.pts[i].z = o.z + dz;
    });
    if (runCrossesOpening(d.ref))
      d.orig.forEach(function (o, i) { d.ref.pts[i].x = o.x; d.ref.pts[i].z = o.z; });
  }
}
export function finishDraw() {
  healDrawnWallEnds();
  S.drawing = false;
  S.drawFrom = null;
  S.drawStart = null;
  S.drawFromSplit = false;
  S.drawWalls = [];
  S.wallPress = null;
  S.previewPt = null;
  S.snapGuides = [];
  S.snapInfo = null;
  resetDrawDirLock();
  onDrawEnded();
  render2D();
  // Drawing walls can create, split or merge rooms — the tree has to resync,
  // and refreshTree is also what hands room metadata over to a room whose
  // bounding-wall set just changed (see reconcileRoomMeta).
  refreshTree();
}

/* One point of the wall tool: the first lays the start corner, the second
   builds the wall. Split out of the pointerdown handler so the typed
   length/angle entry (js/cad_hud.js) commits through the SAME path — a wall
   drawn by keyboard is then identical to one drawn by mouse, including the
   history entry, node reuse, topology splits and connected-run continuation. */
export function wallPoint(p) {
  if (!p || !fin(p.x) || !fin(p.z)) return null;
  p = resolveLanding(p, true);
  if (p.blockedOpening != null) {
    flash(t("wall_opening_blocked"), "error");
    return null;
  }
  /* The first corner owns the undo snapshot for the first segment. Landing
     that corner on a host wall may split the host immediately, but that split
     is only an implementation detail of the wall the user is drawing. Do not
     take another snapshot at the second corner or Ctrl+Z exposes the invisible
     half-split topology. Continued runs still get one snapshot per additional
     visible segment. */
  if (!S.drawing || (S.drawWalls || []).length) pushHistory();
  if (!S.drawing) {
    // Landing mid-span SPLITS that wall (getOrMakeNode), which is a change of
    // topology, not of somebody's stated interior dimension — see below.
    resetDrawDirLock();
    S.drawFromSplit = !!p.wall || !!(p.walls && p.walls.length);
    S.drawWalls = [];
    S.drawFrom = getOrMakeNode(p);
    S.drawStart = S.drawFrom;
    S.drawing = true;
    window.dispatchEvent(new CustomEvent("planner-draw-start"));
    S.previewPt = { x: p.x, z: p.z };
    render2D();
    return null;
  }
  /* The INTERIOR span the user just drew — the very number the rubber band was
     showing — read before the wall exists, because the corners it lands on cut
     into it and the intent is what was on screen, not what the geometry will
     measure afterwards. */
  var from = S.nodes[S.drawFrom],
    drawn = from
      ? Math.max(
          0,
          Math.hypot(p.x - from.x, p.z - from.z) -
            (S.interiorDims !== false ? pendingCuts(S.drawFrom, p) : 0),
        )
      : 0;
  /* Interior dimensions are only defended for a wall drawn CORNER TO CORNER.
     A wall started or ended in the middle of an existing one splits it into two
     new walls, and there is no earlier interior measurement of those halves to
     hold — trying anyway made a T-junction shove the whole plan around. Same
     for a wall drawn out in the open: nothing was cut, nothing to restore. */
  var cleanEnds = !S.drawFromSplit && !p.wall && !(p.walls && p.walls.length);
  var drawDefaults = resolveWallDrawDefaults();
  var fromNodeId = S.drawFrom;
  var fromPoint = S.nodes[fromNodeId];
  var commandResult = executeCommand(wallDrawCommand, {
    from: { x: fromPoint.x, z: fromPoint.z },
    to: { x: p.x, z: p.z },
    type: drawDefaults.typeId,
    kind: drawDefaults.kind,
    loc: drawDefaults.loc,
    dimSide: drawDefaults.dimSide,
    height: drawDefaults.height,
    thickness: drawDefaults.thickness,
    datum: drawDefaults.datum,
    phase: drawDefaults.phase,
  }, {
    domain: "planner",
    state: S,
    version: { current: currentHistoryId },
    services: {
      materializeWall: function (params, env) {
        return materializePlannerWall(params, env, {
          fromNodeId: fromNodeId,
          toLanding: p,
        });
      },
    },
  }, { history: false });
  var madeEntry = commandResult.ok && commandResult.created.find(function (entry) {
    return entry.kind === "wall";
  });
  var made = madeEntry ? wallById(madeEntry.id) : null;
  var nb = made ? made.b : fromNodeId;
  if (made) S.drawWalls.push(made.id);
  S.dirty3D = true;
  /* Chief-style continuous placement: the far endpoint becomes the origin of
     the next segment. The tool stays armed and the live dimensions immediately
     restart from that joint; right-click, double-click or Escape ends the run.
     All commits still pass through this one function, so click-drag, click-click
     and typed polar input create identical topology. */
  if (made) {
    if (drawn > 0) made.clearL = drawn;
    if (cleanEnds) preserveClear([made.a, made.b]);
    splitCrossedByNewWall(made);
  }
  S.drawFrom = nb;
  S.drawFromSplit = !!p.wall || !!(p.walls && p.walls.length);
  S.drawing = true;
  resetDrawDirLock();
  S.previewPt = { x: S.nodes[nb].x, z: S.nodes[nb].z };
  S.freshWall = null;
  render2D();
  /* A closed loop is a room the moment the last wall lands, not when the user
     right-clicks to stop. Auto-close also ends the run so the next click is
     not a stray continuation out of the new room. */
  if (made && S.drawStart != null && nb === S.drawStart && (S.drawWalls || []).length >= 3) {
    finishDraw();
    return made;
  }
  if (made) refreshTree();
  return made;
}

function splitCrossedByNewWall(made) {
  var hits = throughCrossings(made);
  if (!hits.length) return;
  hits.forEach(function (hit) {
    var host = wallById(hit.hostId);
    if (!host || !made) return;
    var hostHit = wallProject(host, hit.x, hit.z);
    var madeHit = wallProject(made, hit.x, hit.z);
    if (!hostHit || !madeHit) return;
    var hostNode = splitWallAt(host, hostHit.s);
    var madeNode = splitWallAt(made, madeHit.s);
    var extra = S.walls[S.walls.length - 1];
    if (extra && extra.id !== made.id && S.drawWalls.indexOf(extra.id) < 0)
      S.drawWalls.push(extra.id);
    if (hostNode != null && madeNode != null && hostNode !== madeNode)
      weldNodes(hostNode, madeNode);
  });
}

function commitPaintWall(wall) {
  if (!wall) return;
  pushHistory();
  paintWallWithDefaults(wall);
  S.dirty3D = true;
  select({ kind: "wall", ref: wall });
  fillProps();
  render2D();
  refreshTree();
  flash(t("wd_painted"), "success");
}

function handleOffsetClick(px, pz) {
  if (!S.offsetDraft) {
    var host = hitWall(px, pz);
    if (!host) { flash(t("wd_offset_need")); return; }
    S.offsetDraft = {
      hostId: host.id,
      dist: resolveWallDrawDefaults().offsetDist,
      side: offsetSideFromCursor(host, px, pz),
    };
    render2D();
    return;
  }
  var host2 = wallById(S.offsetDraft.hostId);
  if (!host2) { S.offsetDraft = null; return; }
  S.offsetDraft.side = offsetSideFromCursor(host2, px, pz);
  commitOffsetWall();
}

function commitOffsetWall() {
  var d = S.offsetDraft, host = d && wallById(d.hostId);
  if (!host) return;
  var ghost = offsetGhost(host, d.dist, d.side);
  if (!ghost) return;
  pushHistory();
  var a = getOrMakeNode(resolveLanding({ x: ghost.a.x, z: ghost.a.z }, true));
  var b = getOrMakeNode(resolveLanding({ x: ghost.b.x, z: ghost.b.z }, true));
  if (a === b) { flash(tTouch("hint_tool_rect")); return; }
  var made = applyWallDrawDefaults({
    id: uid(), a: a, b: b, thickness: WALL_T, height: WALL_H,
  });
  S.walls.push(made);
  if (wallClearLength(made) > 0) made.clearL = wallClearLength(made);
  captureLock(made); captureClear(made);
  S.drawWalls = [made.id];
  healDrawnWallEnds();
  S.drawWalls = [];
  S.offsetDraft = null;
  S.wallDrawDefaults = Object.assign({}, S.wallDrawDefaults || {}, { offsetDist: d.dist });
  S.dirty3D = true;
  select({ kind: "wall", ref: made });
  render2D();
  refreshTree();
}

function handleBreakClick(px, pz) {
  var w = hitWall(px, pz);
  if (!w) { flash(t("wd_break_need")); return; }
  var pr = wallProject(w, px, pz), g = wallGeom(w);
  if (!pr || pr.s < 8 || pr.s > g.L - 8) { flash(t("wd_break_end")); return; }
  pushHistory();
  splitWallAt(w, pr.s);
  S.dirty3D = true;
  render2D();
  refreshTree();
}

/* Bite a span out of a wall.
 *
 * The eraser removes a wall whole, and a passage cuts a hole with a lintel
 * over it. Between those two there was nothing, and "open this partition up
 * for two metres" is a normal thing to want — the alcove, the pass-through,
 * the half-wall that opens a kitchen onto a living room. What is left after a
 * bite is the two stubs, with nothing above the gap: the wall genuinely stops
 * and starts again, which is what makes it different from a passage.
 *
 * Biting a party wall opens one space into the other, exactly as erasing it
 * whole does, so it goes through the same metadata repair — otherwise the
 * merged space takes whichever of the two names the generic reconciler reaches
 * first. */
function commitWallBite() {
  var draft = S.biteDraft;
  S.biteDraft = null;
  if (!draft) return;
  var wall = wallById(draft.wall);
  if (!wall) return;
  var g = wallGeom(wall);
  var lo = Math.max(0, Math.min(draft.s0, draft.s1));
  var hi = Math.min(g.L, Math.max(draft.s0, draft.s1));
  if (hi - lo < 20) { flash(t("wd_bite_short")); return; }

  pushHistory();
  var merging = wallSeparates(detectRooms(), wall.id);
  var middle = wall;
  /* Two cuts, in this order: the leading stub first, so the second cut is
     measured along what is left rather than along the original. splitWallAt
     keeps the near half in place and returns the new far half at the end of
     the wall list. */
  if (lo > 8) {
    splitWallAt(middle, lo);
    middle = S.walls[S.walls.length - 1];
  }
  var rest = wallGeom(middle);
  if (hi - lo < rest.L - 8) splitWallAt(middle, hi - lo);
  applyRemove({ kind: "wall", ref: middle });
  pruneCons();
  if (S.sel && S.sel.kind === "wall" && S.sel.ref === middle) select(null);
  if (merging) adoptMergedRoomMeta(merging);
  S.dirty3D = true;
  normalizeStructure();
  render2D();
  refreshTree();
  fillProps();
  flash(merging ? t("rp_merged") : t("wd_bite_done", { n: Math.round(hi - lo) }));
}

function handleJoinClick(px, pz) {
  var w = hitWall(px, pz);
  if (!w) { flash(t("wd_join_need")); return; }
  if (!S.joinPick) {
    S.joinPick = w;
    select({ kind: "wall", ref: w });
    flash(t("wd_join_second"));
    render2D();
    return;
  }
  var prop = joinProposal(S.joinPick, w);
  if (!prop) {
    S.joinPick = w;
    select({ kind: "wall", ref: w });
    flash(t("wd_join_colin"), "error");
    return;
  }
  pushHistory();
  var keep = prop.keep, drop = prop.drop;
  var pts = S.openings.filter(function (o) {
    return o.wall === keep.id || o.wall === drop.id;
  }).map(function (o) {
    var host = o.wall === keep.id ? keep : drop;
    return { o: o, p: wallPointAt(host, o.s) };
  });
  keep.a = prop.farKeep;
  keep.b = prop.farDrop;
  delete keep.geometry;
  delete keep.curve;
  pts.forEach(function (entry) {
    if (!entry.p) return;
    var pr = wallProject(keep, entry.p.x, entry.p.z);
    if (!pr) return;
    entry.o.wall = keep.id;
    entry.o.s = pr.s;
  });
  S.walls = S.walls.filter(function (x) { return x.id !== drop.id; });
  S.openings = S.openings.filter(function (o) { return o.wall !== drop.id; });
  captureLock(keep); captureClear(keep);
  pruneCons();
  S.joinPick = null;
  S.dirty3D = true;
  select({ kind: "wall", ref: keep });
  render2D();
  refreshTree();
  flash(t("wd_joined"), "success");
}

function handleReverseClick(px, pz) {
  var w = hitWall(px, pz);
  if (!w) { flash(t("wd_reverse_need")); return; }
  pushHistory();
  reverseWallStyle(w);
  S.dirty3D = true;
  select({ kind: "wall", ref: w });
  fillProps();
  render2D();
  flash(t("wd_reversed"), "success");
}

function commitRectFromTo(a, b) {
  var defaults = resolveWallDrawDefaults();
  var result = executeCommand(roomCreateCommand, {
    // Snap candidates also carry optional UI metadata. Commands take points,
    // not that metadata (which may contain undefined values at shared corners).
    from: { x: a.x, z: a.z },
    to: { x: b.x, z: b.z },
    type: defaults.typeId,
    kind: defaults.kind,
    loc: defaults.loc,
    dimSide: defaults.dimSide,
    height: defaults.height,
    thickness: defaults.thickness,
    datum: defaults.datum,
    phase: defaults.phase,
  }, {
    domain: "planner",
    state: S,
    history: PLANNER_COMMAND_HISTORY,
    version: { current: currentHistoryId },
    services: { materializeWall: materializePlannerWall },
  }, { label: t("h_addRoom") });
  if (!result.ok) {
    flash(tTouch("hint_tool_rect"));
    return null;
  }
  var wallIds = result.created.filter(function (entry) { return entry.kind === "wall"; })
    .map(function (entry) { return entry.id; });
  var walls = S.walls.filter(function (wall) { return wallIds.indexOf(wall.id) >= 0; });
  S.dirty3D = true;
  render2D();
  refreshTree();
  window.dispatchEvent(new CustomEvent("planner-room-created", { detail: { walls: walls } }));
  return walls;
}

export {
  beginMEPDrag, commitPaintWall, commitRectFromTo, commitRoute,
  commitWallBite, dragMEP, handleBreakClick, handleJoinClick,
  handleOffsetClick, handleReverseClick,
};
