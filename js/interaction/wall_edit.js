/* The planner's new-dimension far-side picking and structural wall edits, split
   out of js/interaction.js. It shares the editor's state through live imports
   from ../interaction.js. */
import { executeCommand, executeCommandBatch, itemDuplicateCommand, plannerCommand, prepareCommand, previewPrepared } from "../commands/index.js";
import { captureClear, captureLock } from "../constraint_engine.js";
import { FURN, itemVSpan, mkItem } from "../furniture.js";
import { detectRooms, hiddenSets, nearestWallLanding, openingAtWallPosition, wallById, wallClearLength, wallGeom, wallPointAt, wallProject } from "../geometry.js";
import { currentHistoryId, pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { hitItem, hitNode, hitOpening, hitRoom, hitWall } from "../interaction/hit_test.js";
import { afterPlacementCommandBatch, beforePlacementCommandBatch, cleanupPlacementCommandBatch, commitItemPlacement, deleteRoom, normalizedRotation, ownedNodeAnchor, validatePlacementRelations, weldNodes } from "../interaction/layout_drag.js";
import { setTool } from "../interaction/mep_tools.js";
import { wallJoinTolerance } from "../interaction/wall_snap.js";
import { applyAutoFace } from "../item_orient.js";
import { aiCanMove, canDrag, isLayerLocked, layerOf, layerRank } from "../layers.js";
import { deleteMarker, hitMarker } from "../markers.js";
import { deleteMEP, detachNodesFromWalls, hitMEP } from "../mep.js";
import { canonicalPlacementItem, canonicalPlacementWall, placementWallFingerprint } from "../placement_resolver.js";
import { broadcastPlanOp, itemMovePlanOp } from "../plan_sync.js";
import { render2D } from "../plan2d.js";
import { inputIs3D, inputScale, wx, wz } from "../planner_input.js";
import { captureProtectedStructure, generatedChangePermission, validateProtectedStructure } from "../redesign.js";
import { hitSlabOpening, removeSlabOpening } from "../slab_openings.js";
import { findSupport, orphanChildren } from "../stack.js";
import { S, clamp, fin, uid } from "../state.js";
import { renderWarnPanel } from "../ui_warn.js";
import { fillProps, flash, refreshTree, select } from "../ui.js";
import { itemUserUnpickable, refLocked, userLayerOf } from "../user_layers.js";
import { addDistance, addJointAngle, addMidpoint, addOffset, addOpeningAlign, addPointOnLine, addPointWallDistance, addSymmetric, addWallAngle, addWallRelation, conCurrent, nodeAnchor, prepareStableAnchors, pruneCons, rehomeAnchorOwner, removeCon, setConReport, solveWallCons, stabilizeOpeningCornerRefs } from "../wall_constraints.js";
import { normalizeWallKind } from "../wall_curves.js";
import { PLANNER_COMMAND_HISTORY, pickCon } from "../interaction.js";

/* ---- picking the far side of a new dimension ----------------------------
   startConPick() is called by the wall inspector with the wall the dimension
   belongs to and which kind is being authored; the next click on the plan
   resolves the target and creates the constraint. Everything about WHAT gets
   picked is decided here rather than in the UI module, because only this file
   knows how a plan coordinate becomes a corner, a wall or a reference point. */
export function startConPick(kind, wall, end, report = false) {
  if (!wall) return false;
  S.conPick = { kind: kind, wall: wall.id, end: end === "b" ? "b" : "a", report: !!report };
  setTool("select");
  render2D();
  return true;
}

/* Armed pick for "line this opening up with that one": the second opening is
   a piece of geometry on another wall, so it is clicked, not chosen from a
   list. */
export function startOpeningAlignPick(opening, axis) {
  if (!opening) return false;
  S.conPick = { kind: "openAlign", opening: opening.id, axis: axis === "z" ? "z" : "x" };
  setTool("select");
  render2D();
  fillProps();
  return true;
}

/* The same armed-pick flow, started from a pair of selected CORNERS instead of
   a selected wall. Symmetry is the case that needs it: two corners are only
   half the relation — the mirror line is a third piece of geometry, and there
   is no honest way to name a wall in a dropdown. */
export function startNodeConPick(kind, nodes) {
  if (!nodes || nodes.length !== 2) return false;
  S.conPick = { kind: kind, nodes: nodes.slice() };
  setTool("select");
  render2D();
  fillProps();
  return true;
}
export function endConPick(msg) {
  S.conPick = null;
  if (msg) flash(msg, "error");
  render2D();
  fillProps();
}
export function conPickActive() {
  return !!S.conPick;
}

function finishConPick(px, pz) {
  var pick = S.conPick;

  /* An opening-alignment pick resolves against another OPENING, not a wall or
     a corner, so it is answered before either of those hit tests. */
  if (pick.kind === "openAlign") {
    var other = hitOpening(px, pz);
    if (!other || other.id === pick.opening) return endConPick(t("wc_needOpening"));
    pushHistory();
    var alignMade = addOpeningAlign(pick.opening, other.id, pick.axis);
    if (!alignMade) return endConPick(t("wc_failed"));
    S.conPick = null;
    var openResult = solveWallCons();
    S.dirty3D = true;
    render2D();
    fillProps();
    refreshTree();
    renderWarnPanel(true);
    flash(openResult.unresolved
      ? t("wc_unresolved", { n: openResult.unresolved })
      : t("wc_added", { v: t("wc_openAlign") }), openResult.unresolved ? "error" : undefined);
    return;
  }

  /* Picks armed from a corner pair resolve their third piece of geometry
     here. Handled before the wall-based picks below because these carry no
     `wall` at all — they were started from a selection of corners. */
  if (pick.nodes) {
    var axisWall = hitWall(px, pz);
    if (!axisWall) return endConPick(t("wc_needWall"));
    pushHistory();
    var symA = ownedNodeAnchor(pick.nodes[0]),
      symB = ownedNodeAnchor(pick.nodes[1]),
      symMade = addSymmetric(symA, symB, {
        k: pick.kind === "symmetricPerp" ? "perp" : "wall",
        id: axisWall.id,
      });
    if (!symMade) return endConPick(t("wc_failed"));
    S.conPick = null;
    var symResult = solveWallCons();
    S.dirty3D = true;
    render2D();
    fillProps();
    refreshTree();
    renderWarnPanel(true);
    flash(symResult.unresolved
      ? t("wc_unresolved", { n: symResult.unresolved })
      : t("wc_added", { v: t("wc_addSymmetric") }), symResult.unresolved ? "error" : undefined);
    return;
  }

  var w = wallById(pick.wall);
  if (!w) return endConPick(null);
  pushHistory();
  var made = null;

  if (pick.kind === "dist") {
    // a corner first, then a reference point — the two things a distance can
    // sensibly be measured to. A bare wall has no single point to measure to.
    var ni = hitNode(px, pz),
      target = null;
    if (ni != null) {
      var own = S.walls.find(function (q) {
        return q.a === ni || q.b === ni;
      });
      if (own) target = { k: "wall", id: own.id, end: own.a === ni ? "a" : "b" };
    }
    if (!target) {
      var mk = hitMarker(px, pz, inputScale());
      if (mk) target = { k: "marker", id: mk.id };
    }
    if (!target) return endConPick(t("wc_needPoint"));
    var from = { k: "wall", id: w.id, end: pick.end };
    // the wall's own end must not be measured to itself
    if (target.k === "wall" && target.id === w.id && target.end === pick.end)
      return endConPick(t("wc_needPoint"));
    // hold the TARGET and drive this wall's corner: the user selected this
    // wall, so this wall is the thing they expect to move
    made = addDistance(target, from, null, "a");
  } else if (pick.kind === "angle") {
    var other = hitWall(px, pz);
    if (!other || other.id === w.id) return endConPick(t("wc_needWall"));
    // the joint is whichever corner the two walls share
    var shared = null;
    [w.a, w.b].forEach(function (n) {
      if (other.a === n || other.b === n) shared = n;
    });
    if (shared == null) return endConPick(t("wc_needJoint"));
    var jointAn = { k: "wall", id: w.id, end: w.a === shared ? "a" : "b" };
    // the wall that was clicked is held; the selected one swings
    made = addJointAngle(jointAn, other.id, w.id, null);
  } else if (pick.kind === "offset") {
    var ref = hitWall(px, pz);
    if (!ref || ref.id === w.id) return endConPick(t("wc_needWall"));
    made = addOffset(w.id, ref.id, null);
  } else if (pick.kind === "pointWall") {
    var distRef = hitWall(px, pz);
    if (!distRef || distRef.id === w.id) return endConPick(t("wc_needWall"));
    made = addPointWallDistance(nodeAnchor(pick.end === "b" ? w.b : w.a, w.id, pick.end), distRef.id);
  } else if (pick.kind === "wallAngle") {
    var angRef = hitWall(px, pz);
    if (!angRef || angRef.id === w.id) return endConPick(t("wc_needWall"));
    made = addWallAngle(w.id, angRef.id, null);
  } else if (pick.kind === "midpoint" || pick.kind === "pointOnLine") {
    var lineRef = hitWall(px, pz);
    if (!lineRef || lineRef.id === w.id) return endConPick(t("wc_needWall"));
    var cornerAn = nodeAnchor(pick.end === "b" ? w.b : w.a, w.id, pick.end);
    made = pick.kind === "midpoint"
      ? addMidpoint(cornerAn, lineRef.id)
      : addPointOnLine(cornerAn, lineRef.id);
  } else {
    var relationRef = hitWall(px, pz);
    if (!relationRef || relationRef.id === w.id) return endConPick(t("wc_needWall"));
    made = addWallRelation(pick.kind, w.id, relationRef.id);
  }

  if (!made) return endConPick(t("wc_failed"));
  if (pick.report) setConReport(made.id, true);
  S.conPick = null;
  /* Numeric dimensions are seeded from the geometry as drawn. Geometric
     relations (parallel/perpendicular/etc.) still need a solve here; without
     it they were created red and inert until some unrelated later edit. */
  var madeResult = solveWallCons();
  S.dirty3D = true;
  render2D();
  fillProps();
  refreshTree();
  renderWarnPanel(true);
  flash(madeResult.unresolved
    ? t("wc_unresolved", { n: madeResult.unresolved })
    : t("wc_added", { v: Math.round(conCurrent(made) || 0) }), madeResult.unresolved ? "error" : undefined);
}

/* Which half of `w` the point (px,pz) falls in — "a" (the a-end half) or "b".
   Used by the plan to let you pick which end a typed length edit moves. */
export function wallHalfAt(w, px, pz) {
  var g = wallGeom(w), projected = wallProject(w, px, pz);
  return (!projected || projected.s < g.L / 2) ? "a" : "b";
}

/* Split `w` at distance `s` from its a-end and return the new middle node.
   Everything that rides the wall parametrically has to be re-homed: openings
   keep their position by moving to whichever half now contains them, and MEP
   devices do the same (they resolve through `wall`+`s`, so leaving them on the
   shortened wall would slide them along it). */
function splitWallAt(w, s) {
  stabilizeOpeningCornerRefs(w);
  prepareStableAnchors();
  var g = wallGeom(w), splitPoint = wallPointAt(w, s), original = JSON.parse(JSON.stringify(w));
  var ni = S.nodes.push({ x: splitPoint.x, z: splitPoint.z }) - 1;
  var oldB = w.b;
  w.b = ni;
  var w2 = {
    id: uid(),
    a: ni,
    b: oldB,
    thickness: w.thickness,
    height: w.height,
    tex: w.tex,
  };
  ["wallTypeId", "layers", "layersReversed", "datum", "kind", "phase",
   "upperWallTypeId", "splitHeight", "profile", "railing", "join",
   "layerOverrides", "dimSide", "loc"].forEach(function (key) {
    if (original[key] !== undefined) w2[key] = JSON.parse(JSON.stringify(original[key]));
  });
  if (g.kind === "arc" && g.curve) {
    var fraction = clamp(s / g.L, 0, 1), sweepA = g.curve.sweep * fraction,
      sweepB = g.curve.sweep - sweepA;
    w.geometry = { type: "arc", bulge: Math.tan(sweepA / 4) };
    w2.geometry = { type: "arc", bulge: Math.tan(sweepB / 4) };
  }
  S.walls.push(w2);
  rehomeAnchorOwner(oldB, w.id, w2.id, "b");
  // both halves are new dimensions the user asked for, so they hold THOSE —
  // leaving w's old full length recorded would make the next unrelated edit
  // try to restore a wall that is deliberately half as long now
  captureLock(w);
  captureLock(w2);
  // ...and neither half is holding the parent's interior span any more
  captureClear(w);
  captureClear(w2);
  S.openings.forEach(function (o) {
    if (o.wall !== w.id) return;
    if (o.s > s) {
      o.wall = w2.id;
      o.s -= s;
    }
  });
  S.openings.forEach(function (o) {
    var host = o.wall === w.id ? w : o.wall === w2.id ? w2 : null;
    if (!host) return;
    var length = wallGeom(host).L;
    var width = Math.max(0, Number(o.width) || 0);
    if (width > length) { width = length; o.width = width; }
    var half = width / 2;
    o.s = Math.max(half, Math.min(Math.max(half, length - half), Number(o.s) || 0));
  });
  if (S.mep && S.mep.nodes)
    S.mep.nodes.forEach(function (n) {
      if (n.wall !== w.id || !fin(n.s)) return;
      if (n.s > s) {
        n.wall = w2.id;
        n.s -= s;
      }
    });
  return ni;
}

/* A landing point resolved against reality BEFORE anything is built.

   Landing ON a wall splits it — but a split a few centimetres from that wall's
   own corner leaves a stub shorter than the wall is thick: a "wall" with no
   interior length at all, a junction that cannot be drawn, and (because the
   parent wall is now two walls with no stated dimension between them) a plan
   whose numbers quietly change. Anything closer to an end than the wall's own
   thickness is therefore the CORNER, not a split — which is what the user was
   aiming at anyway. */
export function resolveLanding(p, options) {
  if (!p || p.node != null) return p;
  var autoJoin = typeof options === "object" ? options.autoJoin !== false : !!options;
  var exclude = typeof options === "object" && Array.isArray(options.exclude)
    ? options.exclude.slice()
    : S.drawing && S.drawFrom != null ? [S.drawFrom] : [];
  /* Chief-style wall intersection: a click visibly beside a wall still joins
     the wall when it lands within a small screen-aware capture band. This is
     intentionally a COMMIT rule, not only a cursor snap—the cursor may have
     preferred a nearby cabinet corner, grid point or angle alignment, but a
     wall endpoint touching an existing wall must become shared topology rather
     than a coincident-looking loose end. */
  if (autoJoin && !p.wall && !(p.walls && p.walls.length)) {
    var joinTol = wallJoinTolerance(),
      near = nearestWallLanding(
        p.x,
        p.z,
        joinTol,
        exclude,
      );
    if (near) {
      var blocked = openingAtWallPosition(near.wall, near.s, 0.05);
      p = {
        x: near.x,
        z: near.z,
        node: null,
        wall: near.wall,
        s: near.s,
        blockedOpening: blocked ? blocked.id : null,
      };
    }
  }
  if (!p.wall) return p;
  var g = wallGeom(p.wall),
    s = fin(p.s) ? p.s : (p.x - g.a.x) * g.ux + (p.z - g.a.z) * g.uz,
    tol = Math.max(p.wall.thickness || 0, 6);
  if (s <= tol || s >= g.L - tol) {
    var end = s <= tol ? p.wall.a : p.wall.b,
      n = S.nodes[end];
    return { x: n.x, z: n.z, node: end, wall: null };
  }
  return p;
}
function splitIntersectionWalls(p) {
  if (!p || !p.walls || !p.walls.length) return null;
  var base = null;
  p.walls.forEach(function (entry) {
    var w = wallById(entry.id), ni = null;
    if (!w) return;
    var g = wallGeom(w), s = (p.x - g.a.x) * g.ux + (p.z - g.a.z) * g.uz,
      tol = Math.max(w.thickness || 0, 6);
    if (s <= tol) ni = w.a;
    else if (s >= g.L - tol) ni = w.b;
    else ni = splitWallAt(w, s);
    if (base == null) base = ni;
    else if (ni !== base) weldNodes(base, ni);
  });
  return base;
}
function getOrMakeNode(p) {
  if (p.node != null) return p.node;
  if (p.walls && p.walls.length) {
    var cross = splitIntersectionWalls(p);
    if (cross != null) return cross;
  }
  if (p.wall) return splitWallAt(p.wall, p.s); // landing on a wall splits it
  S.nodes.push({ x: p.x, z: p.z });
  return S.nodes.length - 1;
}

/* Planner adapter for wall.draw. The command owns validation/default values;
   this adapter exposes the existing split/weld landing machinery instead of
   duplicating topology rules in the command core. */
function materializePlannerWall(params, env, context) {
  context = context || {};
  var oldNodeCount = S.nodes.length;
  var a = context.fromNodeId != null ? context.fromNodeId
    : getOrMakeNode(resolveLanding({ x: params.from.x, z: params.from.z }, {
        autoJoin: true,
        exclude: [],
      }));
  var b = context.toLanding
    ? getOrMakeNode(context.toLanding)
    : getOrMakeNode(resolveLanding({ x: params.to.x, z: params.to.z }, {
        autoJoin: true,
        exclude: [a],
      }));
  if (a === b) return { ok: false, reason: "ZERO_LENGTH_WALL" };
  var wall = {
    id: uid(), a: a, b: b,
    thickness: params.thickness,
    height: params.height,
    wallTypeId: params.type,
    kind: params.kind,
    loc: params.loc,
    dimSide: params.dimSide,
  };
  if (params.datum) wall.datum = params.datum;
  if (params.phase) wall.phase = params.phase;
  S.walls.push(wall);
  var clear = wallClearLength(wall);
  if (clear > 0) wall.clearL = clear;
  var createdNodeIds = [];
  for (var i = oldNodeCount; i < S.nodes.length; i++) createdNodeIds.push(i);
  var result = {
    ok: true,
    wall: wall,
    createdNodeIds: createdNodeIds,
    changedNodeIds: [a, b].filter(function (id) { return id < oldNodeCount; }),
  };
  return result;
}

/* `ai`: an AI proposal (preview or confirmed apply) — item moves answer to
   aiCanMove(), which skips the work-set rule; everything else is unchanged. */
function agentCommandEnvironment(options) {
  var ai = !!(options && options.ai);
  return {
    domain: "planner",
    state: S,
    history: PLANNER_COMMAND_HISTORY,
    version: { current: currentHistoryId },
    itemCatalog: FURN,
    services: {
      canPlaceItem: function (item) {
        return !!item && !item.locked && (ai ? aiCanMove : canDrag)({ kind: "item", ref: item });
      },
      validatePlacementGuard: validatePlacementGuard,
      commitItemPlacement: commitItemPlacement,
      beforeCommandBatchApply: beforePlacementCommandBatch,
      afterCommandBatchApply: afterPlacementCommandBatch,
      cleanupCommandBatchApply: cleanupPlacementCommandBatch,
      postValidateCommands: validatePlacementRelations,
      materializeWall: materializePlannerWall,
      createItem: mkItem,
      applyAutoFace: function (item, x, z) {
        applyAutoFace(item, x, z, { host: findSupport(item, x, z) });
      },
      presentCommandResult: function (result, presentation) {
        if (result.effects && result.effects.dirty3D) S.dirty3D = true;
        if (presentation && presentation.selectCreated && result.created.length) {
          var entry = result.created.find(function (item) { return item.kind !== "node"; });
          var ref = entry && (entry.kind === "wall" ? wallById(entry.id)
            : entry.kind === "opening" ? S.openings.find(function (o) { return o.id === entry.id; })
            : entry.kind === "item" ? S.items.find(function (it) { return it.id === entry.id; }) : null);
          if (ref) select({ kind: entry.kind, ref: ref });
        }
        if (presentation && presentation.switchToolTo) setTool(presentation.switchToolTo);
        render2D();
        if (result.effects && result.effects.refreshTree) refreshTree();
        if (result.effects && result.effects.refreshInspector) fillProps();
        (result.effects && result.effects.events || []).forEach(function (event) {
          if (event.type === "planner-item-moved") {
            var moved = (S.items || []).find(function(item) { return String(item.id) === String(event.entityId); });
            if (moved) broadcastPlanOp(itemMovePlanOp(moved));
          }
          window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
        });
      },
    },
  };
}

function currentPlacementWallFingerprint(id) {
  var sampled = canonicalPlacementWall(wallById(id), {
    wallGeom: wallGeom, wallPointAt: wallPointAt, normalizeWallKind: normalizeWallKind,
  });
  return placementWallFingerprint(sampled);
}

function currentPlacementScene() {
  var geometry = { wallGeom: wallGeom, wallPointAt: wallPointAt, normalizeWallKind: normalizeWallKind };
  return {
    items: (S.items || []).map(function(item) {
      return placementItemProjection(item);
    }),
    walls: (S.walls || []).map(function(wall) { return canonicalPlacementWall(wall, geometry); }).filter(Boolean),
    rooms: detectRooms().map(function(room) {
      return { key: room.key, area: room.area, pts: room.pts,
        wallIds: String(room.key || "").split(",").filter(Boolean) };
    }),
  };
}

function placementItemProjection(item) {
  return canonicalPlacementItem(item, { itemVSpan: itemVSpan });
}

function validatePlacementGuard(guard) {
  if (!guard || typeof guard !== "object") return false;
  if (guard.hostWall) {
    if (String(guard.hostWall.fingerprint || "") !==
        String(currentPlacementWallFingerprint(guard.hostWall.id) || "")) return false;
  }
  if (guard.referenceItem) {
    var expected = guard.referenceItem;
    var item = (S.items || []).find(function(candidate) { return String(candidate.id) === String(expected.id); });
    var rotationDelta = Math.abs(normalizedRotation(item && item.rot) - normalizedRotation(expected.rot));
    if (!item || Math.abs(Number(item.x) - Number(expected.x)) > 0.05 ||
        Math.abs(Number(item.z) - Number(expected.z)) > 0.05 ||
        Math.min(rotationDelta, 360 - rotationDelta) > 0.05) return false;
  }
  if (guard.targetHold != null && Array.isArray(guard.excludedItemIds) && guard.excludedItemIds.length) {
    var targetId = String(guard.excludedItemIds[0]);
    var target = (S.items || []).find(function(item) { return String(item.id) === targetId; });
    if (!target || JSON.stringify(target.hold || null) !== String(guard.targetHold)) return false;
  }
  return true;
}

export function previewPlannerCommand(commandId, params, options) {
  const permission = generatedChangePermission(S, commandId, params);
  if (!permission.ok) return permission;
  var command = plannerCommand(commandId), env = agentCommandEnvironment(options);
  if (!command) return { ok: false, reason: "INVALID_COMMAND" };
  var prepared = prepareCommand(command, params || {}, env);
  if (!prepared.ok) return prepared;
  var preview = previewPrepared(prepared, env);
  if (!preview.ok) return preview;
  var result = {
    ok: true,
    commandId: command.id,
    params: prepared.params,
    plan: prepared.plan,
    preview: preview.preview,
  };
  if (command.id === "item.move") {
    var moveParams = prepared.plan && prepared.plan.params;
    var target = moveParams && (S.items || []).find(function(item) {
      return String(item.id) === String(moveParams.itemId);
    });
    if (target && target.hold && moveParams.holdWallId == null)
      result.warnings = ["PRESERVED_WALL_HOLD"];
  }
  return result;
}

export function executePlannerProposal(proposal, options = {}) {
  if (S.workspace && S.workspace.role === "viewer")
    return { ok: false, reason: "PERMISSION_DENIED" };
  var proposals = proposal && Array.isArray(proposal.commands) ? proposal.commands : [proposal];
  if (!proposals.length) return { ok: false, reason: "INVALID_PLAN" };
  var env = agentCommandEnvironment(options), requests = [];
  for (var i = 0; i < proposals.length; i++) {
    var entry = proposals[i];
    if (!entry || !entry.commandId || !entry.plan) return { ok: false, reason: "INVALID_PLAN" };
    const permission = generatedChangePermission(S, entry.commandId, entry.params || entry.plan.params);
    if (!permission.ok) return permission;
    var command = plannerCommand(entry.commandId);
    if (!command) return { ok: false, reason: "INVALID_COMMAND" };
    var refreshed = prepareCommand(command, entry.params || entry.plan.params || {}, env);
    if (!refreshed.ok) return refreshed;
    if (JSON.stringify(refreshed.plan.params) !== JSON.stringify(entry.plan.params))
      return { ok: false, reason: "PREVIEW_INVALIDATED" };
    requests.push({ command: command, params: refreshed.params, plan: refreshed.plan });
  }
  const protectedBefore = captureProtectedStructure(S);
  return executeCommandBatch(requests, env, {
    postValidate: () => {
      const protectedResult = validateProtectedStructure(protectedBefore, S);
      if (!protectedResult.ok) return protectedResult;
      return options.postValidate ? options.postValidate() : protectedResult;
    },
    label: proposals.length > 1 ? "AI: batch change" : "AI: " + requests[0].command.id,
    presentation: { selectCreated: true, switchToolTo: "select" },
  });
}

/* Final connection repair for the walls committed in THIS run only. A wall
   endpoint can visually touch a host yet remain loose when a grid/furniture
   snap outranks the wall snap. Chief-style placement treats that as a wall
   intersection. Restricting the repair to `drawWalls` preserves deliberate
   gaps and old survey geometry elsewhere in the plan. */
function healDrawnWallEnds() {
  var ids = S.drawWalls || [];
  if (!ids.length) return 0;
  var made = {};
  ids.forEach(function (id) { made[id] = 1; });
  var joinTol = wallJoinTolerance(),
    healed = 0;
  if (!(joinTol > 0)) return 0;

  // Snapshot the candidate ends; splitting a host adds walls while we iterate.
  var ends = [];
  S.walls.forEach(function (w) {
    if (!made[w.id]) return;
    ends.push({ wall: w, end: "a", node: w.a });
    ends.push({ wall: w, end: "b", node: w.b });
  });
  ends.forEach(function (e) {
    var ni = e.end === "a" ? e.wall.a : e.wall.b,
      n = S.nodes[ni];
    if (!n) return;
    var degree = 0;
    S.walls.forEach(function (w) {
      if (w.a === ni || w.b === ni) degree++;
    });
    if (degree !== 1) return; // already a real joint
    var near = nearestWallLanding(n.x, n.z, joinTol, [ni]);
    if (!near || openingAtWallPosition(near.wall, near.s, 0.05)) return;
    var land = resolveLanding({
      x: near.x, z: near.z, node: null, wall: near.wall, s: near.s,
    });
    var target = getOrMakeNode(land);
    if (target == null || target === ni) return;
    weldNodes(target, ni);
    healed++;
  });
  if (healed) S.dirty3D = true;
  return healed;
}

/* ---- structural edit operations ---- */
// Hit-test a screen point (canvas-local px,py) and select the topmost element
// under it, mirroring the select-tool precedence. Returns the resulting S.sel
// (or null). Used by the right-click contextual menu.
export function selectAtScreen(ox, oy) {
  var px = wx(ox, oy),
    pz = wz(ox, oy);
  var hmk = hitMarker(px, pz, inputScale());
  var ho = hmk ? null : hitOpening(px, pz);
  if (hmk) {
    select({ kind: "marker", ref: hmk });
  } else if (ho) {
    select({ kind: "opening", ref: ho });
  } else {
    var hi = hitItem(px, pz);
    if (hi) {
      var toSelect = [hi];
      if (hi.groupId) {
        var hid = hiddenSets();
        toSelect = S.items.filter(function (it) {
          return it.groupId === hi.groupId && !hid.items[it.id] && !itemUserUnpickable(it);
        });
      }
      select(
        toSelect.length > 1
          ? { kind: "items", refs: toSelect }
            : { kind: "item", ref: hi },
      );
    } else {
      var hv = hitSlabOpening(px, pz);
      if (hv) {
        select({ kind: "slabvoid", ref: hv });
      } else {
      var hw = hitWall(px, pz);
      if (hw) {
        select({ kind: "wall", ref: hw });
      } else {
        var hk = hitRoom(px, pz);
        if (hk) select({ kind: "room", ref: hk });
        else select(null);
      }
      }
    }
  }
  render2D();
  return S.sel;
}

/* Is this selection locked against being moved or removed?

   Two independent padlocks answer here. The LAYER's lock covers everything on
   it at once (`S.lockStruct` is the structure layer's, so the old L-key
   behaviour arrives through this branch), and the OBJECT's own `locked` flag
   covers the one thing the user pinned. Either is enough.

   It used to understand items and nothing else, which meant a locked wall or a
   pinned MEP device refused a drag (the pointerdown chain checked `lockStruct`
   by hand) but was still deleted without complaint. The object test is now the
   generic one, so it extends to structure and MEP for free: a multi-selection
   counts as locked only when EVERY member is — a marquee that caught one
   pinned chair among ten should still move the other nine — and `kind: "room"`
   is the odd one out because its `ref` is a room KEY, with the flag living in
   S.roomMeta. `canDrag` in js/layers.js mirrors these same two rules
   deliberately; keep them in step. Rank is NOT consulted here: refusing to
   delete an off-work-set object is a different, harsher policy than refusing
   to drag it, and only `canDrag` makes that call. */
function targetLocked(sel) {
  if (!sel) return false;
  var id = layerOf(sel.kind);
  if (id && isLayerLocked(id)) return true;
  if (sel.kind === "room") {
    var meta = S.roomMeta && S.roomMeta[sel.ref];
    return !!(meta && meta.locked);
  }
  // refLocked: its own pin, or the padlock of the user layer it is on
  if (Array.isArray(sel.refs))
    return sel.refs.length > 0 && sel.refs.every(refLocked);
  return refLocked(sel.ref);
}

/* A drag was asked for and refused. The reason is worth showing at the cursor —
   "this layer isn't the one you're editing" and "this thing is pinned" call for
   completely different next actions — but this module owns no DOM, so it says
   so on the window and js/ui_layers.js draws the pill.

   `reason` is the FIRST gate that failed, in the order canDrag() tests them:
     "rank"   — the layer is visible but off the work set (or unreachable)
     "layer"  — the layer's own padlock is closed
     "object" — the thing itself is pinned
     "ulayer" — the user layer it is on is locked (`ulayer` is that layer's id)
   `layer` is the layer id, or null for a kind that belongs to no layer. */
function blockedDrag(sel) {
  if (!sel || typeof window === "undefined" || !window.dispatchEvent) return;
  var id = layerOf(sel.kind),
    reason = "object",
    ul = null;
  if (!id || layerRank(id) !== 0) reason = "rank";
  else if (isLayerLocked(id)) reason = "layer";
  else {
    var first = sel.ref || (sel.refs && sel.refs[0]),
      L = first && !first.locked ? userLayerOf(first) : null;
    if (L && L.locked) {
      reason = "ulayer";
      ul = L.id;
    }
  }
  window.dispatchEvent(
    new CustomEvent("layers:blocked-drag", {
      // `where` lets one pill serve both panes; js/view3d.js emits "3d".
      detail: { sel: sel, layer: id, reason: reason, ulayer: ul, where: inputIs3D()?"3d":"2d" },
    }),
  );
}

function applyRemove(sel) {
  if (!sel) return false;
  if (sel.kind === "item") {
    S.items = S.items.filter(function (i) { return i !== sel.ref; });
    orphanChildren(null);
  } else if (sel.kind === "items") {
    var lockedSkipped = sel.refs.filter(function (i) { return refLocked(i); }).length;
    S.items = S.items.filter(function (i) {
      return sel.refs.indexOf(i) === -1 || refLocked(i);
    });
    if (lockedSkipped) flash(t("f_someLockedSkipped", { n: lockedSkipped }));
    orphanChildren(null);
  } else if (sel.kind === "opening") {
    S.openings = S.openings.filter(function (o) { return o !== sel.ref; });
  } else if (sel.kind === "wall") {
    var id = sel.ref.id;
    detachNodesFromWalls(function (wid) { return wid === id; });
    S.walls = S.walls.filter(function (w) { return w !== sel.ref; });
    S.openings = S.openings.filter(function (o) { return o.wall !== id; });
  } else if (sel.kind === "walls") {
    var wallIds = new Set(sel.refs.map(function (w) { return w.id; }));
    detachNodesFromWalls(function (wid) { return wallIds.has(wid); });
    S.walls = S.walls.filter(function (w) { return !wallIds.has(w.id); });
    S.openings = S.openings.filter(function (o) { return !wallIds.has(o.wall); });
  } else if (sel.kind === "node") {
    var ni = sel.ref, goneW = {};
    S.walls.forEach(function (w) {
      if (w.a === ni || w.b === ni) goneW[w.id] = 1;
    });
    detachNodesFromWalls(goneW);
    S.walls = S.walls.filter(function (w) { return w.a !== ni && w.b !== ni; });
    S.openings = S.openings.filter(function (o) { return !goneW[o.wall]; });
  } else if (sel.kind === "marker") {
    deleteMarker(sel.ref);
  } else if (sel.kind === "slabvoid") {
    broadcastPlanOp({ type: "slabRemove", id: sel.ref.id });
    removeSlabOpening(sel.ref);
  } else if (sel.kind === "mepNode" || sel.kind === "mepRun") {
    deleteMEP(sel);
  } else if (sel.kind === "con" && sel.ref) {
    removeCon(sel.ref.id);
  } else {
    return false;
  }
  return true;
}

function finishRemove() {
  pruneCons();
  select(null);
  S.dirty3D = true;
  render2D();
  refreshTree();
}

function pickErase(px, pz, ox, oy) {
  if (ox != null) {
    var hc = pickCon(ox, oy);
    if (hc) return { kind: "con", ref: hc };
  }
  var hm = hitMEP(px, pz, inputScale());
  if (hm) return hm;
  var hmk = hitMarker(px, pz, inputScale());
  if (hmk) return { kind: "marker", ref: hmk };
  var ho = hitOpening(px, pz);
  if (ho) return { kind: "opening", ref: ho };
  var hi = hitItem(px, pz);
  if (hi) return { kind: "item", ref: hi };
  var hv = hitSlabOpening(px, pz, 4);
  if (hv) return { kind: "slabvoid", ref: hv };
  var hw = hitWall(px, pz);
  if (hw) return { kind: "wall", ref: hw };
  return null;
}

function eraseKey(hit) {
  if (!hit) return "";
  if (hit.kind === "node") return "node:" + hit.ref;
  var id = hit.ref && hit.ref.id != null ? hit.ref.id : hit.ref;
  return hit.kind + ":" + id;
}

export function deleteSel() {
  if (!S.sel) return;
  // Lock has to be honoured BEFORE pushHistory, or refusing to delete still
  // leaves a no-op entry on the undo stack that swallows the next Ctrl+Z.
  if (targetLocked(S.sel)) {
    flash(t("f_targetLockedDel"), "error");
    return;
  }
  if (S.sel.kind === "room") {
    deleteRoom(S.sel.ref); // pushes its own history entry
    return;
  }
  pushHistory();
  applyRemove(S.sel);
  finishRemove();
}
export function dupSel() {
  if (S.sel && S.sel.kind === "item") {
    var result = executeCommand(itemDuplicateCommand, {
      sourceId: S.sel.ref.id, offsetX: 30, offsetZ: 30, regroup: false,
    }, agentCommandEnvironment(), {
      label: "Duplicate item", presentation: { selectCreated: true },
    });
    if (!result.ok) flash(t("f_placeFail"), "error");
  } else if (S.sel && S.sel.kind === "items") {
    var many = executeCommand(itemDuplicateCommand, {
      sourceIds: S.sel.refs.map(function(item) { return item.id; }),
      offsetX: 30, offsetZ: 30, regroup: true,
    }, agentCommandEnvironment(), { label: "Duplicate items" });
    if (!many.ok) { flash(t("f_placeFail"), "error"); return; }
    var madeIds = new Set(many.created.map(function(entry) { return String(entry.id); }));
    select({ kind: "items", refs: S.items.filter(function(item) { return madeIds.has(String(item.id)); }) });
    render2D();
  }
}

export {
  agentCommandEnvironment, applyRemove, blockedDrag, currentPlacementScene,
  eraseKey, finishConPick, finishRemove, getOrMakeNode, healDrawnWallEnds,
  materializePlannerWall, pickErase, splitIntersectionWalls, splitWallAt,
  targetLocked,
};
