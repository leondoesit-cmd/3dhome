/* The CAD editor's markups overlay, scratch vectors,
   component/box/paint/smart-mate drags and display mode, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { normalizePose } from "../cad_mate_model.js";
import { boxSelectMode } from "../modeler_chrome.js";
import { normalizeTransform } from "../modeler_part_geometry.js";
import { viewportRect } from "../modeler_pick_geometry.js";
import { t } from "../modeler_strings.js";
import { commandSelectionPrefer } from "../modeler/command_manager.js";
import { pushUndo } from "../modeler/document_history.js";
import { flash } from "./drawing_sheet_touch.js";
import { solveAssembly } from "../modeler/library_assembly_state.js";
import { applyBoxSelection, beginPaintSelectDrag } from "../modeler/library_io.js";
import { activeParts } from "../modeler/library_store.js";
import { markupsSignature } from "../modeler/notes_markups.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { assemblyComponentById, resolveTopologyPick } from "../modeler/topology_pick.js";
import { pickAssemblyComponent, screenDeltaAlongAxis, screenDeltaToWorld, showSelectThrough } from "../modeler/viewport_input.js";
import { THREE } from "../three_lazy.js";
import {
  E, H, instantVectors, markupsLastDrawnSig, markupsLastDrawnVis,
  notesScratch, refreshAll, root, set_instantVectors, set_markupsLastDrawnSig,
  set_markupsLastDrawnVis, set_notesScratch,
} from "../modeler.js";

function drawMarkupsOverlay(mcv, dpr) {
  var sig = markupsSignature();
  var live = !!(E.activeMarkupStroke && E.activeMarkupStroke.points && E.activeMarkupStroke.points.length > 1);
  if (!live && sig === markupsLastDrawnSig && E.notesVisible === markupsLastDrawnVis) {
    return;
  }
  set_markupsLastDrawnSig(live ? null : sig);
  set_markupsLastDrawnVis(E.notesVisible);

  var ctx = mcv.getContext("2d");
  ctx.clearRect(0, 0, mcv.width, mcv.height);
  if (E.notesVisible === false || !E.def) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  var markups = Array.isArray(E.def.markups) ? E.def.markups : [];
  for (var i = 0; i < markups.length; i++) {
    var s = markups[i];
    if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = s.color || "#ef4444";
    ctx.lineWidth = s.width || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    var pts = s.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x, pts[j].y);
    }
    ctx.stroke();
  }

  if (E.activeMarkupStroke && E.activeMarkupStroke.points && E.activeMarkupStroke.points.length > 1) {
    var livePts = E.activeMarkupStroke.points;
    ctx.beginPath();
    ctx.strokeStyle = E.activeMarkupStroke.color || E.markupColor || "#ef4444";
    ctx.lineWidth = E.activeMarkupStroke.width || E.markupWidth || 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(livePts[0].x, livePts[0].y);
    for (var k = 1; k < livePts.length; k++) {
      ctx.lineTo(livePts[k].x, livePts[k].y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function noteScratch() {
  if (!notesScratch) set_notesScratch(new THREE.Vector3());
  return notesScratch;
}

function instantScratch() {
  if (!instantVectors) {
    set_instantVectors({ dir: new THREE.Vector3(), anchor: new THREE.Vector3() });
  }
  return instantVectors;
}

/* Direct assembly manipulation.

   A primary drag that starts on a component moves that component in the camera
   plane; the same drag on empty space remains the view's orbit gesture. Mouse,
   pen and touch all arrive as pointer events, so selection, undo and mate
   solving have one implementation rather than a desktop path and a subtly
   different mobile path.

   Mates are solved on each move and the existing component groups are reposed
   in place. Rebuilding every mesh on every pointer event made a constrained
   chain feel glued down even though the solver itself finishes in a few
   milliseconds. The normal refresh on release rebuilds highlights, the tree,
   the inspector and status exactly once. */
function beginAssemblyComponentDrag(event, view) {
  if (E.docType !== "assembly" || E.tool !== "select" || E.facePick || !E.assembly || !view) return false;
  /* A second contact belongs to pinch/pan. The first contact's drag owns this
     slot until it ends, which prevents two fingers from moving two components
     while the shared viewport is trying to zoom. */
  if (E._assemblyDragPointer != null) return false;
  var found = resolveTopologyPick(event, view, { prefer: E.selectionFilter }) || {};
  var component = found.component;
  if (!component) return false;

  event.preventDefault();
  var pointerId = event.pointerId;
  E._assemblyDragPointer = pointerId;
  var canvas = view.rr && view.rr.domElement;
  var start = { x: event.clientX, y: event.clientY };
  var keys = ["x", "y", "z", "rx", "ry", "rz"];
  /* The orientation rides in `q`, so a snapshot that copied only the six
     numbers restored the mirror and left the quaternion where the abandoned
     drag had pushed it — and the next normalize believes the quaternion. */
  var snapshots = (E.assembly.components || []).map(function (item) {
    var transform = normalizeTransform(item);
    var pose = { q: Object.assign({}, transform.q) };
    keys.forEach(function (key) { pose[key] = transform[key]; });
    return { component: item, pose: pose };
  });
  var startPose = Object.assign({}, normalizeTransform(component));
  var moveMode = E.assemblyMoveMode || "free";
  /* Cmd/Ctrl is an additive pick, never the start of a move. Keep it inside the
     custom recognizer so its stationary pointerup follows exactly the same
     component/face pick path as an ordinary click, but ignore trackpad travel:
     a Mac click can report a few contact pixels while Cmd is held. */
  var additivePick = !!(event.ctrlKey || event.metaKey);
  var threshold = event.pointerType === "touch" ? 10 : 4;
  var moved = false, undoOpen = false, blocked = false, longPressed = false, multiTouch = false;
  var longPressTimer = 0;

  function selectMoving() {
    E.componentSel = [component];
    E.sel = component;
    E.topologySelection = [];
  }
  function restoreSnapshots() {
    snapshots.forEach(function (snapshot) {
      var transform = normalizeTransform(snapshot.component);
      keys.forEach(function (key) { transform[key] = snapshot.pose[key]; });
      transform.q = Object.assign({}, snapshot.pose.q);
      normalizePose(transform); // re-derive the mirror from the restored orientation
    });
  }
  function posesChanged() {
    return snapshots.some(function (snapshot) {
      var transform = normalizeTransform(snapshot.component);
      return keys.some(function (key) { return Math.abs(transform[key] - snapshot.pose[key]) > 1e-9; });
    });
  }
  function syncGroups() {
    if (!view.grp) return;
    view.grp.traverse(function (object) {
      var id = object.userData && object.userData.cadComponent;
      if (id) {
        var item = assemblyComponentById(id);
        if (!item) return;
        var transform = normalizeTransform(item), blown = item.explodedOffset || {};
        object.position.set(transform.x + (blown.x || 0), transform.y + (blown.y || 0), transform.z + (blown.z || 0));
        object.rotation.set(transform.rx * Math.PI / 180, transform.ry * Math.PI / 180, transform.rz * Math.PI / 180);
      }
      if (object.userData && object.userData.cadInterference != null) object.visible = false;
    });
    view.render();
  }
  function cancelLongPressTimer() {
    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
  function secondaryPointerDown(ev) {
    if (ev.pointerId === pointerId || (ev.pointerType !== "touch" && ev.pointerType !== "pen")) return;
    multiTouch = true;
    cancelLongPressTimer();
    /* If the second finger arrived after a small move, give the whole gesture
       back to camera navigation instead of committing an accidental nudge. */
    if (undoOpen) {
      restoreSnapshots();
      H.discard();
      undoOpen = false;
      solveAssembly({ quiet: true });
      syncGroups();
    }
  }
  function move(ev) {
    if (ev.pointerId !== pointerId || multiTouch || longPressed || additivePick) return;
    var travel = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
    if (!moved && travel <= threshold) return;
    cancelLongPressTimer();
    if (!moved) {
      moved = true;
      selectMoving();
      if (component.grounded) {
        blocked = true;
        flash(t("smartMateGrounded"));
        return;
      }
      pushUndo(t("opMove"));
      undoOpen = true;
      if (canvas) canvas.style.cursor = "grabbing";
    }
    if (blocked) return;
    var delta = moveMode === "free" ? screenDeltaToWorld(view, start, ev)
      : screenDeltaAlongAxis(view, start, ev, moveMode);
    var transform = normalizeTransform(component);
    transform.x = startPose.x + delta.x;
    transform.y = startPose.y + delta.y;
    transform.z = startPose.z + delta.z;
    solveAssembly({ quiet: true });
    syncGroups();
  }
  function cleanup() {
    cancelLongPressTimer();
    window.removeEventListener("pointerdown", secondaryPointerDown, true);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    E._assemblyDragPointer = null;
    if (canvas) canvas.style.cursor = "";
  }
  function finish(ev, cancelled) {
    cleanup();
    if (multiTouch || longPressed) { refreshAll(); return; }
    if (!moved) {
      pickAssemblyComponent(ev, view);
      return;
    }
    if (cancelled && undoOpen) {
      restoreSnapshots();
      H.discard();
      undoOpen = false;
      solveAssembly({ quiet: true });
    } else if (undoOpen && !posesChanged()) {
      H.discard();
      undoOpen = false;
    }
    refreshAll();
  }
  function up(ev) {
    if (ev.pointerId !== pointerId) return;
    finish(ev, false);
  }
  function cancel(ev) {
    if (ev.pointerId !== pointerId) return;
    finish(ev, true);
  }

  if (event.pointerType === "touch") {
    var press = { clientX: event.clientX, clientY: event.clientY, pointerType: "touch", button: 0 };
    longPressTimer = setTimeout(function () {
      longPressTimer = 0;
      if (moved || multiTouch) return;
      longPressed = true;
      showSelectThrough(press, view);
    }, 520);
  }
  window.addEventListener("pointerdown", secondaryPointerDown, true);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  return true;
}

/* Every Alt gesture in an assembly lands here: editor_view hands pointerdown
   to beginDrag first, and taking it means pick never runs. So this owns both
   halves of SmartMate — Alt-drag one component onto another, and Alt-click two
   references in turn for anyone without a mouse to drag with.

   Either way the component being acted on is the one that moves, which makes
   it the mate's B side: the solver only ever moves B. Passing the drag source
   as A did the reverse, and since the drop target is usually the grounded
   base, the solver then refused the mate outright and nothing happened. */
/* Window select in 3D, with the 2D canvas's grammar: dragged left-to-right
   takes only what is fully enclosed, right-to-left takes anything it crosses.
   boxSelectMode/boundsHitBox are the same helpers the sketch marquee uses, so
   the two views cannot drift apart on what "crossing" means. */
function beginBoxSelectDrag(event, view) {
  if (E.docType !== "part" || E.tool !== "select" || E.facePick) return false;
  var rect = viewportRect(view);
  if (!rect) return false;
  var part = selectedSolid() || activeParts(E.def)[activeParts(E.def).length - 1] || null;
  if (!part) return false;
  /* Started ON the model, the same Ctrl/Cmd-drag paints instead of windowing.
     A window drawn from a point already inside the body is nearly useless —
     it starts over the thing it is meant to enclose — and sweeping along a run
     of edges is the gesture actually wanted there. Same split Instant3D makes
     between a handle and open space. */
  var over = resolveTopologyPick(event, view, { prefer: commandSelectionPrefer() });
  if (over && over.reference) return beginPaintSelectDrag(event, view, part, over.reference);
  var host = root && root.querySelector("#mdMarquee");
  if (!host) return false;
  event.preventDefault();
  var start = { x: event.clientX, y: event.clientY };
  var box = { x0: start.x, y0: start.y, x1: start.x, y1: start.y };
  var moved = false;
  var paint = function () {
    var mode = boxSelectMode(box.x0, box.x1);
    host.hidden = false;
    host.classList.toggle("is-crossing", mode === "crossing");
    host.style.left = Math.min(box.x0, box.x1) + "px";
    host.style.top = Math.min(box.y0, box.y1) + "px";
    host.style.width = Math.abs(box.x1 - box.x0) + "px";
    host.style.height = Math.abs(box.y1 - box.y0) + "px";
  };
  function move(ev) {
    box.x1 = ev.clientX; box.y1 = ev.clientY;
    if (Math.hypot(box.x1 - start.x, box.y1 - start.y) > 3) moved = true;
    if (moved) paint();
  }
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    host.hidden = true;
    host.classList.remove("is-crossing");
    if (moved) applyBoxSelection(part, box, view, rect);
  }
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  return true;
}

export {
  beginAssemblyComponentDrag, beginBoxSelectDrag, drawMarkupsOverlay,
  instantScratch, noteScratch,
};
