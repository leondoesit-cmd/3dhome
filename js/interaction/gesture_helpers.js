/* The plan view's gesture helpers (precision trials, erase strokes, opening
   placement, pinch), lifted out of initInteraction, split out of
   js/interaction.js. It shares the editor's state through live imports from
   ../interaction.js. */
import { executeCommand, openingPlaceCommand } from "../commands/index.js";
import { fmtLen, unitLabel } from "../display_units.js";
import { detectRooms, wallProject } from "../geometry.js";
import { cancelPending, pushHistory, redo, undo } from "../history.js";
import { t } from "../i18n.js";
import { exteriorDoorSwing, hitWall } from "../interaction/hit_test.js";
import { adoptMergedRoomMeta } from "../interaction/room_tools.js";
import { agentCommandEnvironment, applyRemove, eraseKey, finishRemove, targetLocked } from "../interaction/wall_edit.js";
import { snapPoint } from "../interaction/wall_snap.js";
import { openingDrawDefaults } from "../opening_draw_defaults.js";
import { plan, render2D, touchLensDistanceMap } from "../plan2d.js";
import { inputScale, rotatePx, sx, sz, wx, wz } from "../planner_input.js";
import { activeEditor } from "../pro_shell.js";
import { wallSeparates } from "../room_graph.js";
import { S, clamp } from "../state.js";
import { dispatchPrecisionCommit, dispatchPrecisionMove, getTouchPrecisionMode, getTouchPrecisionPrefs, startTouchPrecisionTrial } from "../touch_precision_ui.js";
import { beginTouchPrecision, planTouchPrecisionKind, touchPrecisionPoint, updateTouchPrecision } from "../touch_precision.js";
import { flash } from "../ui.js";
import { interactionLocals } from "../interaction.js";

// lifted out of initInteraction()
function planPrecisionPoint(e, ox, oy, bounds, begin) {
  if (!e || e.pointerType !== "touch") return { x: ox, y: oy };
  var kind = planTouchPrecisionKind(S.tool, S.placeType);
  if (!kind) {
    S.touchContact = null;
    return { x: ox, y: oy };
  }
  if (begin || !S.touchContact || S.touchContact.pointerId !== e.pointerId || S.touchContact.kind !== kind)
    S.touchContact = beginTouchPrecision(e, ox, oy, bounds, kind);
  else updateTouchPrecision(S.touchContact, ox, oy);
  return touchPrecisionPoint(S.touchContact, ox, oy);
}
function beginPlanPrecisionTrial(e, ox, oy) {
  var mode = getTouchPrecisionMode();
  if (mode === "lens") return false;
  S.touchContact = null;
  startTouchPrecisionTrial({
    mode: mode,
    pointerId: e.pointerId,
    canvas: plan,
    x: ox,
    y: oy,
    axes: ["X", "Z"],
    unitLabel: unitLabel(),
    sourceCanvases: function () { return [plan]; },
    screenToModel: function (point) { return { x: wx(point.x, point.y), y: wz(point.x, point.y) }; },
    modelToScreen: function (point) {
      var screen = rotatePx(sx(point.x), sz(point.y));
      return { x: screen.x, y: screen.y };
    },
    describe: function (point) {
      var world = { x: wx(point.x, point.y), z: wz(point.x, point.y) };
      var secondary = mode === "rough" ? "1:" + getTouchPrecisionPrefs().refineRatio : "";
      if (S.drawing && S.drawFrom != null && S.nodes[S.drawFrom]) {
        var from = S.nodes[S.drawFrom], length = Math.hypot(world.x - from.x, world.z - from.z);
        var angle = Math.atan2(world.z - from.z, world.x - from.x) * 180 / Math.PI;
        secondary = "L " + fmtLen(length) + " · ∠ " + Math.round(angle * 10) / 10 + "°";
      }
      return { primary:"X " + fmtLen(world.x, { suffix: false }) + " · Z " + fmtLen(world.z, { suffix: false }), secondary:secondary };
    },
    getDistances: function (point) { return touchLensDistanceMap(point.x, point.y, true); },
    onMove: function (point) { dispatchPrecisionMove(plan, point); },
    onSnap: function (direction, point) {
      var count = Math.max(1, (S.snapAlts || []).length);
      S.snapCycle = ((Number(S.snapCycle) || 0) + direction + count) % count;
      var snapped = snapPoint(wx(point.x, point.y), wz(point.x, point.y), S.drawFrom);
      var screen = rotatePx(sx(snapped.x), sz(snapped.z));
      return { x:screen.x, y:screen.y };
    },
    onConfirm: function (point) { dispatchPrecisionCommit(plan, point); },
    onCancel: function () { S.touchContact=null; S.previewPt=null; S.snapGuides=[]; render2D(); },
  });
  return true;
}
function setSpacePan(on) {
  interactionLocals.spacePan = !!on;
  if (plan) plan.classList.toggle("space-pan", interactionLocals.spacePan);
}
function modelerKeyboardOwnsInput() {
  var modeler = document.getElementById("modeler");
  if (modeler && modeler.style.display !== "none") return true;
  /* The cabinet designer is the same kind of modal editor over the plan, and
     its keys overlap the planner's: Delete removed a compartment AND deleted
     the cabinet itself from the plan underneath, Ctrl+Z undid both
     histories, R rotated the hidden item. */
  return activeEditor() === "cab";
}

// lifted out of initInteraction()
function beginEraseStroke() {
  interactionLocals.eraseSeen = Object.create(null);
  interactionLocals.erasePushed = false;
}
function strokeErase(hit) {
  if (!hit || !interactionLocals.eraseSeen) return;
  var key = eraseKey(hit);
  if (interactionLocals.eraseSeen[key]) return;
  if (targetLocked(hit)) {
    flash(t("f_targetLockedDel"), "error");
    interactionLocals.eraseSeen[key] = 1;
    return;
  }
  if (!interactionLocals.erasePushed) {
    pushHistory();
    interactionLocals.erasePushed = true;
  }
  interactionLocals.eraseSeen[key] = 1;
  /* Erasing the wall BETWEEN two rooms is the way to open one space into
     another — knock the partition out and the face trace finds one room
     where there were two. It is also, from the outside, indistinguishable
     from erasing any other wall, so it says what it did: without that, the
     two names collapsing into one looks like the app lost something. */
  var mergedRooms = hit && hit.kind === "wall" && hit.ref
    ? wallSeparates(detectRooms(), hit.ref.id) : null;
  if (applyRemove(hit)) finishRemove();
  if (mergedRooms) {
    adoptMergedRoomMeta(mergedRooms);
    flash(t("rp_merged"));
  }
}
function placeOpeningAt(tool, px, pz) {
  /* Resolve exactly one host with the same resolver used by wallProbe. The
     previous commit path independently collected every nearby wall, so a
     click on a corner could create two coincident doors even though hover
     highlighted only one wall. */
  var wall = hitWall(px, pz);
  var projected = wall && wallProject(wall, px, pz);
  if (!wall || !projected) {
    flash(t("opening_need_wall"));
    window.dispatchEvent(new CustomEvent("planner-opening-missed", {
      detail: { tool: tool, x: px, z: pz },
    }));
    return false;
  }
  var swing = tool === "door" ? exteriorDoorSwing(wall, projected.s) : null;
  var result = executeCommand(openingPlaceCommand, {
    wallId: wall.id,
    type: tool,
    s: projected.s,
    ...openingDrawDefaults(tool),
    ...(swing ? { swingDir: swing } : {}),
  }, agentCommandEnvironment(), {
    label: t("f_openingPlaced", { name: t(tool) }),
    /* The tool stays armed, like the point and MEP tools: a flat takes a
       dozen openings, and dropping back to select after each one cost a
       trip to the ribbon per window. The new one is still selected, so the
       inspector shows it; Esc or right-click ends the tool. */
    presentation: { selectCreated: true },
  });
  if (!result.ok || !result.created.length) {
    flash(t("opening_need_wall"));
    return false;
  }
  var madeId = result.created[0].id;
  var made = S.openings.find(function (opening) { return opening.id === madeId; });
  if (!made) return false;
  return true;
}

// lifted out of initInteraction()
function armTwoTap() {
  var ids = Object.keys(interactionLocals.pointers);
  if (interactionLocals.twoTap) {
    // Already armed by an earlier finger: only the count grows, so the clock
    // still runs from when the gesture actually started.
    interactionLocals.twoTap.n = Math.max(interactionLocals.twoTap.n, ids.length);
    return;
  }
  var a = interactionLocals.pointers[ids[0]],
    b = interactionLocals.pointers[ids[1]];
  interactionLocals.twoTap = {
    t: Date.now(),
    d0: Math.hypot(a.x - b.x, a.y - b.y),
    ax: a.x,
    ay: a.y,
    n: ids.length,
  };
}
function breakTwoTap() {
  interactionLocals.twoTap = null;
}
function tryTwoTap() {
  if (!interactionLocals.twoTap) return false;
  var hit = Date.now() - interactionLocals.twoTap.t <= interactionLocals.TWOTAP_MS;
  var fingers = interactionLocals.twoTap.n;
  interactionLocals.twoTap = null;
  if (!hit) return false;
  /* The first finger of the gesture already picked whatever it landed on.
     The gesture means "undo", not "select this", so put the selection back
     before undoing — which then replaces it with its own if it has one. */
  S.sel = interactionLocals.preTouchSel;
  if (fingers >= 3) redo();
  else undo();
  render2D();
  if (navigator.vibrate) navigator.vibrate(12);
  return true;
}

function beginPinch() {
  var ids = Object.keys(interactionLocals.pointers),
    a = interactionLocals.pointers[ids[0]],
    b = interactionLocals.pointers[ids[1]],
    mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  interactionLocals.pinch = {
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    wmx: (mx - S.OX) / inputScale(),
    wmy: (my - S.OY) / inputScale(),
    sc: inputScale(),
  };
  cancelPending();
  S.wallPress = null; // a second finger turns the gesture into navigation
  S.dragRoom = null;
  S.wallAngleGuide = null;
  S.alignX = S.alignZ = null;
  S.touchContact = null;
  interactionLocals.touchHostPlacement = null;
  S.action = "pinch";
}
function updatePinch() {
  var ids = Object.keys(interactionLocals.pointers);
  if (ids.length < 2) return;
  var a = interactionLocals.pointers[ids[0]],
    b = interactionLocals.pointers[ids[1]];
  var dist = Math.hypot(a.x - b.x, a.y - b.y) || 1,
    mx = (a.x + b.x) / 2,
    my = (a.y + b.y) / 2;
  // Any actual zoom or pan means this was a pinch, not a tap.
  if (interactionLocals.twoTap && (Math.abs(dist - interactionLocals.twoTap.d0) > interactionLocals.TWOTAP_SLOP ||
      Math.hypot(a.x - interactionLocals.twoTap.ax, a.y - interactionLocals.twoTap.ay) > interactionLocals.TWOTAP_SLOP))
    breakTwoTap();
  S.SC = clamp(interactionLocals.pinch.sc * (dist / interactionLocals.pinch.dist), 0.08, 6);
  S.OX = mx - interactionLocals.pinch.wmx * inputScale();
  S.OY = my - interactionLocals.pinch.wmy * inputScale();
  render2D();
}

export {
  armTwoTap, beginEraseStroke, beginPinch, beginPlanPrecisionTrial,
  modelerKeyboardOwnsInput, placeOpeningAt, planPrecisionPoint, setSpacePan,
  strokeErase, tryTwoTap, updatePinch,
};
