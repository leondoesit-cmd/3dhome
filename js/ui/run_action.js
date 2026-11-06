/* The planner's runAction: the single dispatch point for every named UI action
   (menus, buttons, shortcuts), lifted out of initUI, split out of
   js/ui/init_ui.js. It shares the editor's state through live imports from
   ./init_ui.js. */
import { syncBlueprintTraceControls } from "../blueprint_trace.js";
import { executeCommand } from "../commands/index.js";
import { isLocked, setLocked } from "../constraint_engine.js";
import { loadLocalProject, saveLocalProject } from "../core/project_store.js";
import { defaultApartment } from "../demo_house.js";
import { parseLen } from "../display_units.js";
import { deliverExport } from "../export_delivery.js";
import { addSlabOpeningToFloor, floorAbove } from "../floors.js";
import { itemsInRoom, roomByKey, roomFloor } from "../geometry.js";
import { currentHistoryId, pushHistory, redo, undo } from "../history.js";
import { t, toggleLang } from "../i18n.js";
import { addSpace, applyNodePairRelation, autoArrangeAll, chamferSelectedWalls, deleteSel, dupSel, filletSelectedWalls, openSegment, openWall, placeOpeningOnSelected, restoreSelectedSharpCorner, rotateRoom, setTool, startConPick, startOpeningAlignPick, togglePinSelected, updateSelectedCornerTreatment } from "../interaction.js";
import { alignItems, distributeItems, matchRotation } from "../item_align.js";
import { refaceItem, rotStep, setRotStep } from "../item_orient.js";
import { saveLayers } from "../layers.js";
import { detachMarker, duplicateMarker, markerItem } from "../markers.js";
import { loadMEP } from "../mep.js";
import { getDirtyRevision, markSaved } from "../persist.js";
import { clearDebris, isPhysicsEnabled, loadPhysics, toggleHitMode, togglePhysics } from "../physics_facade.js";
import { planStyle } from "../plan_style.js";
import { fitView, planImageCanvas, render2D, updatePlanGizmo } from "../plan2d.js";
import { stairVoidFields } from "../slab_openings.js";
import { findSupport, rotateWith } from "../stack.js";
import { S, touchItem3D, uid } from "../state.js";
import { normalizeSurvey } from "../survey.js";
import { openLibraryPicker } from "../ui_libpick.js";
import { renderPanel as refreshMEPPanel } from "../ui_mep.js";
import { addParam, runRoomConAction } from "../ui_params.js";
import { fillProps, select, wallFaceMaterials, wallFlipSymmetric, wallTakeoffRows } from "../ui_props.js";
import { exportCostCSV, refreshTree, updateCost, withoutRoomPrompts } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { UI_COMMAND_HISTORY, addFurnItem, applyData, applyRoomFloor, download, exportWallScheduleFile, flash, initDrawingPanel, lavaModule, loadLavaModule, loadRCModule, loadZombieModule, openModal, openWallTypeEditorDialog, rcModule, saveTextDownload, serialize, setCutaway, setEdit3D, setLockStruct, setPlanStyle, showJointAngleDialog, squareJoint, squareWall, squaredMsg, syncEnvUI, syncRotStepUI, syncWalkView, turnItem, zombieModule } from "../ui.js";
import { applyEnv, frameView, has3D, rebuild3D, snapshot3D, toggleDrawing3D, toggleFreeMove, toggleWalk, toggleWalkView } from "../view3d.js";
import { addEqualLengthSet, addEqualSpacing, addOffset, addOpeningCentre, addOpeningFromCorner, addOpeningSpacing, addWallAngle, addWallRelation, conLabelText, flipConDirection, removeCon, repin, solveWallCons } from "../wall_constraints.js";
import { normalizeWallKind } from "../wall_curves.js";
import { flipWall, normalizeWall } from "../wall_types.js";
import { uiLocals } from "./ui_locals.js";

const RUN_SELECTION_ACTIONS = new Set([
  "addFloor", "lockStruct", "deleteSel", "slabFromStairs", "dupSel", "roomFloor", "prodSize",
  "pvAdd", "rcArea", "rcMinDim", "rcRect", "alLeft", "alRight", "alCenterX", "alTop", "alBottom",
  "alCenterZ", "alDistX", "alDistZ", "alSameRot", "groupItems", "ungroupItems", "autoGenerate",
  "autoArrange", "addroom", "addcorr", "makeSeamless", "matchFloor", "rotL", "rotR", "rotSel90",
  "faceAuto", "roomRotL", "roomRotR", "lockItem", "lockRoom", "lockRoomItems",
]);
const RUN_HISTORY_ACTIONS = new Set(["undo", "redo"]);
const RUN_WALL_MODIFIER_ACTIONS = new Set([
  "wallTypeEditor", "wmFillet", "wmChamfer", "wmParallel", "wmPerpendicular", "wmCollinear",
  "wmEqualLength", "wmOffset", "wmEqualSpacing", "wmWallAngle", "wmEqualLenSet",
  "reverseWallLayers", "copyWallStyle", "straightenWall", "restoreSharpCorner",
  "updateCornerTreatment", "squareWall", "lockWallDim",
]);
const RUN_FILE_ACTIONS = new Set([
  "exportWallSchedule", "newPlan", "photo", "reset", "save", "load", "exportjson", "importjson",
  "importBlueprint", "importBlueprintTrace", "roomScan", "png2d", "png3d", "exportgltf",
  "cutPlan", "exportCost", "uploadFloorTex", "uploadWallTex", "clearWallTex", "exportWallTakeoff",
]);
const RUN_PANEL_ACTIONS = new Set([
  "toggleToolNames", "workspace", "openModeler", "uikitCustomize", "plannerTutorial", "agent",
  "friends", "toggleLegacy", "lang", "tree", "rc", "zombies", "lava", "openTextureGallery",
  "shortcuts",
]);
const RUN_VIEW_ACTIONS = new Set([
  "edit3d", "dollhouse", "togglePlanStyle", "drawing3d", "viewPlan", "view3d", "viewSplit",
  "frameReset", "walk", "walkview", "freemove", "physics", "hitmode", "clearDebris", "frame",
]);
const RUN_HINT_ACTIONS = new Set(["hintRect", "hintDoor", "hintLibrary"]);
const RUN_MARKER_ACTIONS = new Set(["mkPlace", "mkRelease", "mkDup", "mkGoItem"]);
const RUN_NODE_CONSTRAINT_ACTIONS = new Set([
  "ndSquare", "ndSetAngle", "ndPin", "ndCoincident", "ndSymmetric", "ndSymmetricPerp",
  "ndCompareAngle", "ndJoin", "ndDistance", "ndAlignX", "ndAlignZ", "ndDistanceX", "ndDistanceZ",
  "ndEqualAngle",
]);
const RUN_OPENING_ACTIONS = new Set([
  "keepAutoOpen", "customAutoOpen", "closeAutoOpen", "flipSwing", "openwall", "addWallDoor",
  "addWallWindow", "addWallPassage", "openseg", "opCentre", "opFromA", "opFromB", "opAlignX",
  "opAlignZ", "opSpacing",
]);
const RUN_WALL_CONSTRAINT_ACTIONS = new Set([
  "conFlip", "conDelete", "conRepin", "conHorizontal", "conVertical", "conDist", "conRefDim",
  "conAngle", "conOffset", "conParallel", "conPerpendicular", "conCollinear", "conEqualLength",
  "conPointWall",
]);
// lifted out of initUI()
async function runAction(act, ev) {
  if (S.workspace && S.workspace.role === "viewer") {
    var readOnlyActions = ["workspace", "frame", "togglePlanStyle", "dollhouse", "drawing3d", "walk", "walkview", "freemove", "photo", "png2d", "png3d", "exportjson", "exportgltf", "exportCost", "tree", "shortcuts", "plannerTutorial", "viewPlan", "view3d", "viewSplit", "openModeler", "friends", "toggleLegacy", "newPlan", "toggleToolNames"];
    if (readOnlyActions.indexOf(act) < 0) {
      flash("Viewer access is read-only", "error");
      return;
    }
  }
  if (RUN_SELECTION_ACTIONS.has(act)) return runSelectionAction(act, ev);
  if (RUN_HISTORY_ACTIONS.has(act)) return runHistoryAction(act, ev);
  if (RUN_WALL_MODIFIER_ACTIONS.has(act)) return runWallModifierAction(act, ev);
  if (RUN_FILE_ACTIONS.has(act)) return runFileAction(act, ev);
  if (RUN_PANEL_ACTIONS.has(act)) return runPanelAction(act, ev);
  if (RUN_VIEW_ACTIONS.has(act)) return runViewAction(act, ev);
  if (RUN_HINT_ACTIONS.has(act)) return runHintAction(act, ev);
  if (RUN_MARKER_ACTIONS.has(act)) return runMarkerAction(act, ev);
  if (RUN_NODE_CONSTRAINT_ACTIONS.has(act)) return runNodeConstraintAction(act, ev);
  if (RUN_OPENING_ACTIONS.has(act)) return runOpeningAction(act, ev);
  if (RUN_WALL_CONSTRAINT_ACTIONS.has(act)) return runWallConstraintAction(act, ev);
  if (act && act.indexOf("rotStep") === 0) {
    // rotStep15 / rotStep45 / rotStep90
    setRotStep(parseInt(act.slice(7), 10));
    syncRotStepUI();
  }
}

// split out of runAction()
async function runSelectionAction(act, ev) {
  if (act === "addFloor") {
    window.__plannerChrome && window.__plannerChrome.addFloorFromUI();
  } else if (act === "lockStruct") setLockStruct(!S.lockStruct);
  else if (act === "deleteSel") {
    deleteSel();
    updateCost();
  } else if (act === "slabFromStairs") {
    if (!S.sel || S.sel.kind !== "item" || S.sel.ref.type !== "stairs") return;
    pushHistory();
    /* The void cuts the slab the stairs LAND on, so it belongs to the storey
       above — putting it on the stairs' own storey punched a hole at the
       bottom of the flight. With no storey above there is nothing to cut, so
       say so rather than silently making a hole in this floor. */
    var above = floorAbove();
    var vo = stairVoidFields(S.sel.ref);
    if (!vo) return;
    if (above) {
      addSlabOpeningToFloor(above.id, vo);
      S.dirty3D = true;
      render2D();
      refreshTree();
      flash(t("sv_on_floor", { floor: above.name }), "success");
    } else {
      flash(t("sv_need_floor_above"), "error");
    }
  } else if (act === "dupSel") {
    dupSel();
    updateCost();
  } else if (act === "roomFloor") {
    if (!S.sel || S.sel.kind !== "room") return;
    var rfKey = S.sel.ref;
    (await import("../ui_floorpick.js")).openFloorPicker(roomFloor(rfKey), function (type) {
      /* The room can be deselected while the picker is open (it is a modal
         over a live plan, not a modal over a frozen one), so the pick is
         applied to the key it was opened FOR rather than to whatever is
         selected when it closes. */
      applyRoomFloor(rfKey, type);
    });
  } else if (act === "prodSize") {
    (await import("../ui_prodsize.js")).openProdSizeDialog();
  } else if (act === "pvAdd") {
    addParam();
  } else if (act === "rcArea" || act === "rcMinDim" || act === "rcRect") {
    if (!S.sel || S.sel.kind !== "room") return;
    if (runRoomConAction(act, S.sel.ref)) { refreshTree(); renderWarnPanel(true); }
  } else if (uiLocals.AL_ACTS[act]) {
    /* Align / distribute / match rotation on a multi-item selection. All of
       them are edits to positions, so all of them are undoable and all of
       them re-touch the 3D transforms of what they moved. */
    if (!S.sel || S.sel.kind !== "items") return;
    var picks = S.sel.refs, verb = uiLocals.AL_ACTS[act], n = 0;
    pushHistory();
    if (verb.kind === "align") n = alignItems(picks, verb.how);
    else if (verb.kind === "dist") n = distributeItems(picks, verb.how);
    else n = matchRotation(picks);
    if (!n) return void flash(t("al_none"));
    picks.forEach(function (it) { touchItem3D(it, verb.kind === "rot" ? "rot" : "move"); });
    S.dirty3D = true;
    fillProps(); render2D(); refreshTree(); updateCost();
    flash(t("al_done", { n: n }));
  } else if (act === "groupItems") {
    if (S.sel && S.sel.kind === "items") {
      pushHistory();
      var gid = uid();
      S.sel.refs.forEach(function(it) { it.groupId = gid; });
      flash("Items grouped");
    }
  } else if (act === "ungroupItems") {
    if (S.sel && S.sel.kind === "items") {
      pushHistory();
      S.sel.refs.forEach(function(it) { delete it.groupId; });
      flash("Items ungrouped");
    }
  } else if (act === "autoGenerate") {
    var dlg = openModal(t("auto_gen"));
    function selRow(lblKey, opts) {
      var row = document.createElement("div");
      row.className = "bp-row";
      var lbl = document.createElement("label");
      var sp = document.createElement("span");
      sp.textContent = t(lblKey);
      var sel = document.createElement("select");
      opts.forEach(function (o) {
        var op = document.createElement("option");
        op.value = o[0];
        op.textContent = t(o[1]);
        sel.appendChild(op);
      });
      lbl.appendChild(sp);
      lbl.appendChild(sel);
      row.appendChild(lbl);
      dlg.body.appendChild(row);
      return sel;
    }
    var sizeSel = selRow("ag_size", [
      ["large", "ag_large"],
      ["small", "ag_small"],
      ["random", "ag_random"],
    ]);
    var repSel = selRow("ag_action", [
      ["replace", "ag_replace"],
      ["append", "ag_append"],
    ]);
    var btnCancel = document.createElement("button");
    btnCancel.textContent = t("cancel");
    btnCancel.onclick = dlg.close;
    var btnGen = document.createElement("button");
    btnGen.className = "btn-accent";
    btnGen.innerHTML = '<i class="ph ph-magic-wand"></i> ';
    btnGen.appendChild(document.createTextNode(t("ag_create")));
    btnGen.onclick = async function () {
      var sz = sizeSel.value;
      var rep = repSel.value === "replace";
      dlg.close();
      var loaded = await Promise.all([import("../generator.js"), import("../apartment_rules.js")]);
      var generated = executeCommand(loaded[0].apartmentGenerateCommand, {
        size: sz,
        replace: rep,
        replaceInfrastructure: rep,
        infrastructure: true,
        seed: sz === "random" ? Math.floor(Math.random() * 0xffffffff) : 1,
      }, {
        domain: "planner",
        state: S,
        history: UI_COMMAND_HISTORY,
        version: { current: currentHistoryId },
      }, { label: t("ag_generated") });
      if (!generated.ok) {
        flash(t(generated.reason === "PROTECTED_STRUCTURE" ? "redesign_protected" : "f_placeFail"), "error");
        return;
      }
      refreshMEPPanel();
      // A generated infrastructure drawing should be immediately legible:
      // make MEP the work set and ghost the architectural context.
      S.workSet = "mep";
      S.workSetPinned = true;
      ["structure", "furniture", "annotations", "underlay"].forEach(function(id) {
        if (S.layers[id]) S.layers[id].vis = "ghost";
      });
      if (S.layers.mep) { S.layers.mep.vis = "show"; S.layers.mep.locked = false; }
      if (S.mep) {
        S.mep.show = true;
        S.mep.show3D = true;
        S.mep.vis = { power: true, water: true, drain: true, comms: true, hvac: true, gas: true };
        S.mep.layerVis = { wall: true, ceiling: true, floor: true };
        if (S.mep.runs.some(function (r) { return r.layer === "floor"; })) S.mep.xray.floor = true;
      }
      saveLayers();
      window.dispatchEvent(new CustomEvent("layers:changed"));
      // The drawing is a plan first. A persisted 3D/elevation layout could
      // otherwise leave the freshly generated under-floor routes offscreen.
      S.viewAxis = "top";
      if (typeof window.__setViewMode === "function") window.__setViewMode("plan");
      if (window.__plannerChrome) window.__plannerChrome.setLeftTab("structure");
      var mepSection = document.querySelector(".mep-section");
      if (mepSection) mepSection.classList.remove("collapsed");
      S.dirty3D = true;
      render2D();
      // the generator names its own rooms — don't prompt for each one
      withoutRoomPrompts(refreshTree);
      fitView();
      // Report the rulebook verdict, not just "done": the generator is held to
      // zero rule errors, and any design notes are worth knowing about.
      var audit = loaded[1].auditApartment(S);
      flash(audit.errors
        ? t("ag_rules_issues").replace("{n}", audit.errors)
        : t("ag_rules_ok").replace("{w}", audit.warnings), audit.errors ? "error" : "success");
    };
    dlg.actions.appendChild(btnCancel);
    dlg.actions.appendChild(btnGen);
  } else if (act === "autoArrange") {
    autoArrangeAll();
  } else if (act === "addroom") addSpace(340, 280, t("room"));
  else if (act === "addcorr") addSpace(110, 320, t("corridor"), true);
  else if (act === "makeSeamless") {
    if (S.sel && S.sel.kind === "opening") {
      pushHistory();
      var o = S.sel.ref;
      var targets = o.paired ? o.paired.map(function(id) { return S.openings.find(function(op) { return op.id === id; }); }) : [o];
      targets.forEach(function(op) {
        if (op && op.overlapL != null) {
          op.width = op.overlapL;
          op.s = op.overlapCenter;
          op.sill = 0;
          var wWall = S.walls.find(function(w) { return w.id === op.wall; });
          if (wWall) op.height = wWall.height;
        }
      });
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  } else if (act === "matchFloor") {
    if (S.sel && S.sel.kind === "opening") {
      pushHistory();
      var o = S.sel.ref;
      var oWall = S.walls.find(function(w) { return w.id === o.wall; });
      if (oWall) {
        import("../geometry.js").then(function(geom) {
          var og = geom.wallGeom(oWall);
          var px = og.a.x + og.ux * o.s, pz = og.a.z + og.uz * o.s;
          var nearbyKeys = [];
          Object.keys(S.roomMeta).forEach(function(k) {
            var wids = k.split(",");
            var hasNear = S.walls.some(function(w) {
              if (wids.indexOf(String(w.id)) === -1) return false;
              var wg = geom.wallGeom(w);
              return geom.distSeg(px, pz, wg.a.x, wg.a.z, wg.b.x, wg.b.z) < w.thickness/2 + 20;
            });
            if (hasNear) nearbyKeys.push(k);
          });
          if (nearbyKeys.length > 1) {
            if (nearbyKeys.length === 2) {
              var srcFloor = geom.roomFloor(nearbyKeys[0]);
              if (S.roomMeta[nearbyKeys[0]].isCorridor) srcFloor = geom.roomFloor(nearbyKeys[1]);
              nearbyKeys.forEach(function(k) {
                S.roomMeta[k].floor = srcFloor;
              });
              S.dirty3D = true;
              render2D();
              flash(t("f_floorMatched"), "success");
            } else {
              var dlgMf = openModal(t("match_floor"));
              var list = document.createElement("div");
              list.className = "modal-list";
              nearbyKeys.forEach(function (k) {
                var b = document.createElement("button");
                var rName = (S.roomMeta[k] && S.roomMeta[k].name) || t("room");
                b.innerHTML = '<i class="ph ph-squares-four"></i> ';
                b.appendChild(
                  document.createTextNode(
                    rName + " (" + t("floor_" + geom.roomFloor(k)) + ")"
                  )
                );
                b.onclick = function () {
                  var srcFloor = geom.roomFloor(k);
                  nearbyKeys.forEach(function (k2) {
                    S.roomMeta[k2].floor = srcFloor;
                  });
                  S.dirty3D = true;
                  render2D();
                  flash(t("f_floorMatched"), "success");
                  dlgMf.close();
                };
                list.appendChild(b);
              });
              dlgMf.body.appendChild(list);
              var closeBtn = document.createElement("button");
              closeBtn.textContent = t("cancel");
              closeBtn.onclick = dlgMf.close;
              dlgMf.actions.appendChild(closeBtn);
            }
          } else {
            flash(t("f_noAdjRoom"), "error");
          }
        });
      }
    }
  } else if (act === "rotL" && S.sel && S.sel.kind === "item") {
    pushHistory();
    turnItem(S.sel.ref, (((S.sel.ref.rot - rotStep()) % 360) + 360) % 360);
    S.dirty3D = true;
    fillProps();
    render2D();
  } else if (act === "rotR" && S.sel && S.sel.kind === "item") {
    pushHistory();
    turnItem(S.sel.ref, (((S.sel.ref.rot + rotStep()) % 360) + 360) % 360);
    S.dirty3D = true;
    fillProps();
    render2D();
  } else if (act === "rotSel90") {
    /* The quarter turn, independent of the 15/45/90 step control. The step
       lives in the item inspector, which on a phone is behind a sheet — a
       one-tap rotate that silently obeyed a setting the user cannot see
       while pressing it would turn the piece by an amount they never chose.
       Multi-selection turns each piece about its own centre, which is what
       "rotate these chairs" means; rotating the group about a common pivot
       would move them, and moving is what the drag is for. */
    var rotPicks = !S.sel ? [] : S.sel.kind === "item" ? [S.sel.ref]
      : S.sel.kind === "items" ? S.sel.refs.slice() : [];
    rotPicks = rotPicks.filter(function (it) { return it && !it.locked; });
    if (!rotPicks.length) return;
    pushHistory();
    rotPicks.forEach(function (it) {
      turnItem(it, (((it.rot || 0) + 90) % 360 + 360) % 360);
    });
    S.dirty3D = true;
    fillProps();
    render2D();
  } else if (act === "faceAuto" && S.sel && S.sel.kind === "item") {
    /* Back to the automatic angle: forget that this piece was turned by hand
       and re-read its surroundings where it stands. */
    var fit = S.sel.ref;
    pushHistory();
    var turned = refaceItem(fit, { host: findSupport(fit, fit.x, fit.z) });
    if (turned)
      rotateWith(fit, turned, new Set([fit])).forEach(function (c) {
        touchItem3D(c, "move");
      });
    touchItem3D(fit, "move");
    fillProps();
    render2D();
    flash(turned ? t("f_faced") : t("f_faceSame"));
  } else if (act === "roomRotL") rotateRoom(-rotStep());
  else if (act === "roomRotR") rotateRoom(rotStep());
  else if (act === "lockItem" && S.sel && S.sel.kind === "item") {
    pushHistory();
    S.sel.ref.locked = !S.sel.ref.locked;
    fillProps();
    render2D();
  } else if (act === "lockRoom" && S.sel && S.sel.kind === "room") {
    pushHistory();
    var m = (S.roomMeta[S.sel.ref] = S.roomMeta[S.sel.ref] || {});
    m.locked = !m.locked;
    fillProps();
    render2D();
  } else if (act === "lockRoomItems" && S.sel && S.sel.kind === "room") {
    var r = roomByKey(S.sel.ref);
    if (r) {
      pushHistory();
      var any = itemsInRoom(r).some(function (i) {
        return !i.locked;
      });
      itemsInRoom(r).forEach(function (i) {
        i.locked = any;
      });
      flash(any ? t("f_roomItemsLocked") : t("f_roomItemsUnlocked"));
      render2D();
      refreshTree();
    }
  }
}

// split out of runAction()
async function runHistoryAction(act, ev) {
  if (act === "undo") undo();
  else if (act === "redo") redo();
}

// split out of runAction()
async function runWallModifierAction(act, ev) {
  if (act === "wallTypeEditor") openWallTypeEditorDialog();
  else if (act === "wmFillet") {
    var radiusInput = document.getElementById("wm_fillet_radius");
    var filletResult = filletSelectedWalls(radiusInput ? Number(radiusInput.value) : 30);
    if (filletResult.ok) flash(t("wm_fillet_done"), "success");
    else {
      var filletError = {
        selection: "wm_fillet_selection",
        radius: "wm_fillet_large",
        "not-shared": "wm_fillet_not_shared",
        "curved-input": "wm_fillet_curved",
        "too-large": "wm_fillet_large",
        hosted: "wm_fillet_hosted",
      }[filletResult.reason] || "wm_fillet_large";
      flash(t(filletError), "error");
    }
  } else if (act === "wmChamfer") {
    var chamferInput = document.getElementById("wm_chamfer_distance");
    var chamferResult = chamferSelectedWalls(chamferInput ? Number(chamferInput.value) : 30);
    if (chamferResult.ok) flash(t("wm_chamfer_done"), "success");
    else {
      var chamferError = {
        selection: "wm_fillet_selection",
        distance: "wm_fillet_large",
        "not-shared": "wm_fillet_not_shared",
        "curved-input": "wm_fillet_curved",
        "too-large": "wm_fillet_large",
        collinear: "wm_chamfer_collinear",
        hosted: "wm_fillet_hosted",
      }[chamferResult.reason] || "wm_fillet_large";
      flash(t(chamferError), "error");
    }
  } else if (["wmParallel", "wmPerpendicular", "wmCollinear", "wmEqualLength", "wmOffset", "wmEqualSpacing", "wmWallAngle", "wmEqualLenSet"].indexOf(act) !== -1) {
    if (S.sel && S.sel.kind === "walls") {
      var selectedWalls = S.sel.refs;
      var relation = null;
      pushHistory();
      if (act === "wmEqualSpacing") relation = addEqualSpacing(selectedWalls.map(function (w) { return w.id; }));
      else if (act === "wmEqualLenSet") relation = addEqualLengthSet(selectedWalls.map(function (w) { return w.id; }));
      else if (act === "wmWallAngle")
        // the SECOND selected wall is the reference, matching the
        // driven-first convention the rest of this palette uses
        relation = addWallAngle(selectedWalls[0].id, selectedWalls[1].id, null);
      else if (selectedWalls.length === 2) {
        var driven = selectedWalls[1].id, reference = selectedWalls[0].id;
        relation = act === "wmOffset" ? addOffset(driven, reference, null) : addWallRelation({
          wmParallel: "parallel", wmPerpendicular: "perpendicular",
          wmCollinear: "collinear", wmEqualLength: "equalLength",
        }[act], driven, reference);
      }
      if (relation) {
        solveWallCons(); fillProps(); render2D(); refreshTree();
        flash("Wall relation added", "success");
      } else flash("This relation does not fit the selected walls", "error");
    }
  } else if (act === "reverseWallLayers" && S.sel && S.sel.kind === "wall") {
    /* A symmetric stack has nothing to mirror. The button is disabled in that
       case, but the keyboard and the tree can still reach the action — so
       refuse here too rather than push an undo entry that changes nothing. */
    normalizeWall(S.sel.ref, S);
    if (wallFlipSymmetric(S.sel.ref)) {
      flash(t("wallReverseNA"), "error");
      return;
    }
    pushHistory();
    flipWall(S.sel.ref);
    S.dirty3D = true;
    fillProps(); render2D(); updateCost();
    // near-white finishes make the swap almost invisible in 3D; name it
    var flipped = wallFaceMaterials(S.sel.ref);
    flash(t("wallReverseWhat", { out: flipped.out, in: flipped.in }), "success");
  } else if (act === "copyWallStyle" && S.sel && S.sel.kind === "wall") {
    pushHistory();
    var styleWall = normalizeWall(S.sel.ref, S);
    S.wallDrawDefaults = {
      typeId: styleWall.wallTypeId,
      kind: normalizeWallKind(styleWall),
      datum: styleWall.datum,
      loc: styleWall.loc === "face" ? "face" : "center",
      dimSide: styleWall.dimSide === 1 || styleWall.dimSide === -1 ? styleWall.dimSide : 0,
      from: styleWall.loc === "face"
        ? (styleWall.datum === "interior" || styleWall.datum === "main-interior" ? (styleWall.datum || "interior") : "exterior")
        : "center",
      phase: styleWall.phase,
      layersReversed: !!styleWall.layersReversed,
      upperWallTypeId: styleWall.upperWallTypeId,
      splitHeight: styleWall.splitHeight,
      height: styleWall.height,
    };
    flash(document.documentElement.lang === "en" ? "Wall style copied to drawing defaults" : "סגנון הקיר הועתק לברירת המחדל", "success");
    window.dispatchEvent(new CustomEvent("planner-draw-defaults"));
  } else if (act === "straightenWall" && S.sel && S.sel.kind === "wall") {
    pushHistory();
    var straightWall = S.sel.ref;
    delete straightWall.geometry;
    delete straightWall.curve;
    delete straightWall.bulge;
    delete straightWall.radius;
    delete straightWall.r;
    delete straightWall.center;
    delete straightWall.cx;
    delete straightWall.cz;
    S.dirty3D = true;
    fillProps(); render2D();
  } else if (act === "restoreSharpCorner" && S.sel && S.sel.kind === "wall") {
    var restoreResult = restoreSelectedSharpCorner();
    if (restoreResult.ok) flash(t("wallRestoreCornerDone"), "success");
    else flash(t(restoreResult.reason === "connector-hosted" ? "wallRestoreCornerHosted" : "wallRestoreCornerChanged"), "error");
  } else if (act === "updateCornerTreatment" && S.sel && S.sel.kind === "wall") {
    var oldCornerType = S.sel.ref.cornerTreatment && S.sel.ref.cornerTreatment.type;
    var newCornerType = document.getElementById("w_corner_type").value;
    var newCornerValue = parseLen(document.getElementById("w_corner_value").value);
    var cornerUpdateResult = updateSelectedCornerTreatment(newCornerType, newCornerValue);
    if (cornerUpdateResult.ok)
      flash(t(oldCornerType === newCornerType ? "wallCornerUpdated" : "wallCornerConverted"), "success");
    else {
      var cornerUpdateError = cornerUpdateResult.reason === "hosted" || cornerUpdateResult.reason === "connector-hosted"
        ? "wallRestoreCornerHosted"
        : cornerUpdateResult.reason === "not-shared" || cornerUpdateResult.reason === "changed"
          ? "wallRestoreCornerChanged" : "wm_fillet_large";
      flash(t(cornerUpdateError), "error");
    }
  } else if (act === "squareWall" && S.sel && S.sel.kind === "wall") {
    pushHistory();
    var sqw = squareWall(S.sel.ref, S.wallEditEnd);
    if (sqw) flash(squaredMsg(sqw, "f_wallSquared"));
    else flash(t("f_squareBlocked"), "error");
  } else if (act === "lockWallDim" && S.sel && S.sel.kind === "wall") {
    /* Unlocking a wall opts it out of the constraint engine: it will be
       stretched and swung by edits at its corners like any ordinary sketch
       line. Locking it again holds whatever it measures right now. */
    pushHistory();
    setLocked(S.sel.ref, !isLocked(S.sel.ref));
    flash(t(isLocked(S.sel.ref) ? "f_wallLocked" : "f_wallUnlocked"));
    fillProps();
    render2D();
  }
}

// split out of runAction()
async function runFileAction(act, ev) {
  if (act === "exportWallSchedule") exportWallScheduleFile();
  else if (act === "newPlan") {
    if (window.__plannerChrome) window.__plannerChrome.openStartScreen();
  } else if (act === "photo") {
    if (!(await import("../photomode.js")).openPhotoMode())
      flash(t("f_no3d"), "error");
  } else if (act === "reset") {
    if (typeof window !== "undefined" && !window.confirm(t("reset_confirm"))) return;
    pushHistory();
    defaultApartment();
    S.blueprintTrace = null;
    syncBlueprintTraceControls();
    S.markers = []; // points belong to the plan that was reset away
    S.slabOpenings = [];
    S.annotations = [];
    S.surveyFeatures=[];
    S.workspace.survey=normalizeSurvey(null);
    S.hour = 13;
    S.northAngle = 0;
    S.wallColor = 0xefe9dd;
    document.getElementById("wallcol").value = "#efe9dd";
    loadMEP(null);
    refreshMEPPanel();
    S.planRot = 0;
    S.viewAxis = "top";
    updatePlanGizmo();
    syncEnvUI();
    setTool("select");
    S.dirty3D = true;
    fitView();
    render2D();
    fillProps();
    withoutRoomPrompts(refreshTree); // the starter scene's room is not a discovery
    frameView();
    applyEnv();
  } else if (act === "save") {
    try {
      var savingRevision = getDirtyRevision();
      await saveLocalProject(serialize());
      markSaved(savingRevision);
      flash(t("f_saved"), "success");
    } catch (err) {
      // Storage may still be exhausted; offer a file export in that case.
      var quota =
        err &&
        (err.name === "QuotaExceededError" ||
          err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
          err.code === 22);
      flash(quota ? t("f_saveQuota") : t("f_saveFail"), "error");
    }
  } else if (act === "load") {
    try {
      var raw = await loadLocalProject();
      if (!raw) {
        flash(t("f_noSave"), "error");
        return;
      }
      pushHistory();
      // A saved project can carry custom models whose builder is not resident
      // yet, so applyData may be asynchronous — confirm only once it applied.
      Promise.resolve(applyData(JSON.parse(raw))).then(function (applied) {
        if (!applied) { flash(t("f_loadFail"), "error"); return; }
        markSaved();
        flash(t("f_loaded"), "success");
      }, function () { flash(t("f_loadFail"), "error"); });
    } catch (err) {
      flash(t("f_loadFail"), "error");
    }
  } else if (act === "exportjson") {
    try {
      var blob = new Blob([serialize()], { type: "application/json" });
      var delivery = await deliverExport("home-plan.json", blob);
      if (delivery.saved) flash(t("f_downloaded"), "success");
    } catch (err) {
      flash(t("f_exportFail"), "error");
    }
  } else if (act === "importjson") {
    document.getElementById("importfile").click();
  } else if (act === "importBlueprint") {
    (await import("../ui_blueprint.js")).openBlueprintModal();
  } else if (act === "importBlueprintTrace") {
    (await import("../ui_blueprint_trace.js")).openBlueprintTraceModal();
  } else if (act === "roomScan") {
    (await import("../ui_room_scan.js")).openRoomScanModal();
  } else if (act === "png2d") {
    try {
      /* The plan is two stacked canvases now (model + HUD), so `#plan` alone
         is the model half and exporting it would lose selection chrome,
         guides and cursors. planImageCanvas() renders both synchronously and
         returns a composited offscreen copy. */
      if (planStyle() === "presentation") {
        /* A presentation export must not ship a line-glyph stand-in for a
           piece whose picture is still baking: wait for every sprite at
           this zoom (bounded, so a model that will not render cannot hang
           the export). */
        var dprNow = Math.min(window.devicePixelRatio || 1, 2);
        await (await import("../plan_sprites.js")).spritesSettled(S.items, S.SC, dprNow, 6000);
      }
      var src = planImageCanvas();
      /* …but that copy is offscreen, so its `clientWidth` is 0 and the dpr
         below would silently collapse to 1, halving every label and rule on a
         retina export. Measure the LIVE element instead — it is the one with
         a layout box, and both canvases are sized from it. */
      var live = document.getElementById("plan");
      var extra = 56;
      var out = document.createElement("canvas");
      out.width = src.width;
      out.height = src.height + extra * (window.devicePixelRatio || 1);
      var ctx = out.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(src, 0, 0);
      var dpr = out.width / Math.max(1, (live && live.clientWidth) || src.width);
      var by = src.height;
      var bw = out.width;
      var bh = extra * dpr;
      ctx.strokeStyle = "#20242a";
      ctx.lineWidth = Math.max(1, dpr);
      ctx.strokeRect(0.5 * dpr, by + 0.5 * dpr, bw - dpr, bh - dpr);
      ctx.beginPath();
      ctx.moveTo(bw * 0.46, by);
      ctx.lineTo(bw * 0.46, by + bh);
      ctx.moveTo(bw * 0.68, by);
      ctx.lineTo(bw * 0.68, by + bh);
      ctx.moveTo(bw * 0.84, by);
      ctx.lineTo(bw * 0.84, by + bh);
      ctx.stroke();
      ctx.fillStyle = "#20242a";
      ctx.font = (11 * dpr) + "px Inter, Helvetica, Arial, sans-serif";
      ctx.textBaseline = "middle";
      var title = (S.workspace && S.workspace.name) || "Untitled";
      ctx.fillText(title, 10 * dpr, by + bh * 0.38);
      ctx.font = (9 * dpr) + "px Inter, Helvetica, Arial, sans-serif";
      ctx.fillStyle = "#5b6b80";
      ctx.fillText("Do not scale drawing. Verify all dimensions on site.", 10 * dpr, by + bh * 0.72);
      ctx.fillText("SCALE", bw * 0.47, by + bh * 0.32);
      ctx.fillText("DATE", bw * 0.69, by + bh * 0.32);
      ctx.fillText("SHEET", bw * 0.85, by + bh * 0.32);
      ctx.fillStyle = "#20242a";
      ctx.font = (12 * dpr) + "px Inter, Helvetica, Arial, sans-serif";
      ctx.fillText("A-01", bw * 0.85, by + bh * 0.72);
      ctx.fillText(new Date().toISOString().slice(0, 10), bw * 0.69, by + bh * 0.72);
      // A screen-resolution raster has no physical size, so it has no scale.
      // Stamping "1:20" on it invites someone to measure off the print.
      ctx.fillText("NTS", bw * 0.47, by + bh * 0.72);
      var pngBlob = await new Promise(resolve => out.toBlob(resolve, "image/png"));
      if (!pngBlob) throw new Error("PNG encoding failed");
      var pngDelivery = await deliverExport("home-plan-2d.png", pngBlob);
      if (pngDelivery.saved) flash(t("f_planPng"));
    } catch (err) {
      flash(t("f_pngFail"), "error");
    }
  } else if (act === "png3d") {
    // async: the GPU queue must drain before the canvas can be read back
    snapshot3D().then(function (u3) {
      if (u3) {
        download("home-3d.png", u3);
        flash(t("f_snap3d"));
      } else flash(has3D() ? t("f_snapFail") : t("f_no3d"), "error");
    });
  } else if (act === "exportgltf") {
    /* Straight to the file when the modifier is held — the options are
       remembered, so the second export of an afternoon rarely needs the
       dialog (js/ui_blender.js). */
    var bx = await import("../ui_blender.js");
    if (!has3D()) flash(t("f_no3d"), "error");
    else if (ev && (ev.shiftKey || ev.altKey)) bx.runExport();
    else bx.openBlenderExport();
  } else if (act === "cutPlan") {
    (await import("../ui_nest.js")).openNestForPlan();
  } else if (act === "exportCost") {
    exportCostCSV();
    flash(t("f_downloaded"), "success");
  } else if (act === "uploadFloorTex") {
    uiLocals.currentTexTarget = "floor";
    var texInput = document.getElementById("texInput");
    if (texInput) texInput.click();
  } else if (act === "uploadWallTex") {
    uiLocals.currentTexTarget = "wall";
    var texInput = document.getElementById("texInput");
    if (texInput) texInput.click();
  } else if (act === "clearWallTex" && S.sel && S.sel.kind === "wall") {
    // back to whatever the assembly's own finish layer says
    pushHistory();
    delete S.sel.ref.tex;
    S.dirty3D = true;
    fillProps();
    render2D();
  } else if (act === "exportWallTakeoff" && S.sel && S.sel.kind === "wall") {
    /* The quantities shown for the selected wall, as the same CSV shape the
       project schedule exports — one wall's worth, so a single elevation can
       be priced without exporting the whole building. */
    var toWall = S.sel.ref;
    var toCsv = [['"Wall"', '"Item"', '"Detail"', '"Quantity"'].join(",")];
    wallTakeoffRows(toWall).forEach(function (r) {
      toCsv.push([toWall.id, r.k, r.s || "", r.v]
        .map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","));
    });
    saveTextDownload("wall-" + toWall.id + "-takeoff.csv", toCsv.join("\r\n"));
    flash(t("f_downloaded"), "success");
  }
}

// split out of runAction()
async function runPanelAction(act, ev) {
  if (act === "toggleToolNames") uiLocals.toggleToolNames();
  else if (act === "workspace") (await import("../workspace.js")).openWorkspace();
  else if (act === "openModeler") (await import("../modeler.js")).openModeler();
  else if (act === "uikitCustomize") (await import("../uikit_host/index.js")).openCustomize();
  else if (act === "plannerTutorial") (await import("../planner_tutorial.js")).showPlannerHub();
  else if (act === "agent") (await import("../ui_agent.js")).openAgent();
  else if (act === "friends") {
    var fb = document.getElementById("friendsBtn");
    if (fb) fb.click();
  } else if (act === "toggleLegacy") {
    if (window.__plannerChrome) window.__plannerChrome.toggleLegacyUI();
  } else if (act === "lang") toggleLang();
  else if (act === "tree") {
    document.getElementById("tree").classList.toggle("on");
    refreshTree();
  } else if (act === "rc") {
    var rc = await loadRCModule();
    // walk mode and RC mode both drive the camera — never both
    if (!rc.rcActive() && document.getElementById("walkBtn").classList.contains("active")) {
      toggleWalk(false);
      document.getElementById("walkBtn").classList.remove("active");
      syncWalkView(false);
    }
    if (zombieModule && zombieModule.zActive()) zombieModule.toggleZombies(false);
    if (lavaModule && lavaModule.lavaActive()) lavaModule.toggleLava(false);
    var rcOn = rc.toggleRC();
    flash(rcOn ? t("f_rcOn") : t("f_rcOff"));
  } else if (act === "zombies") {
    var zm = await loadZombieModule();
    // walk / RC / Night Shift / Lava all drive the camera — only one at a time
    if (!zm.zActive()) {
      if (rcModule && rcModule.rcActive()) rcModule.toggleRC(false);
      if (lavaModule && lavaModule.lavaActive()) lavaModule.toggleLava(false);
      if (document.getElementById("walkBtn").classList.contains("active")) {
        toggleWalk(false);
        document.getElementById("walkBtn").classList.remove("active");
        syncWalkView(false);
      }
    }
    var zOn = zm.toggleZombies();
    flash(zOn ? t("f_zombiesOn") : t("f_zombiesOff"));
  } else if (act === "lava") {
    var lv = await loadLavaModule();
    if (!lv.lavaActive()) {
      if (rcModule && rcModule.rcActive()) rcModule.toggleRC(false);
      if (zombieModule && zombieModule.zActive()) zombieModule.toggleZombies(false);
      if (document.getElementById("walkBtn").classList.contains("active")) {
        toggleWalk(false);
        document.getElementById("walkBtn").classList.remove("active");
        syncWalkView(false);
      }
    }
    var lvOn = lv.toggleLava();
    flash(lvOn ? t("f_lavaOn") : t("f_lavaOff"));
  } else if (act === "openTextureGallery") {
    var { openTextureGallery } = await import("../ui_textures.js");
    openTextureGallery();
  } else if (act === "shortcuts") {
    uiLocals.showShortcuts();
  }
}

// split out of runAction()
async function runViewAction(act, ev) {
  if (act === "edit3d") setEdit3D(!S.edit3D);
  else if (act === "dollhouse") {
    var cutOn = !(S.cutaway && S.cutaway.on);
    setCutaway({ on: cutOn });
  } else if (act === "togglePlanStyle") {
    setPlanStyle(planStyle() === "presentation" ? "technical" : "presentation");
  } else if (act === "drawing3d") {
    const on = toggleDrawing3D();
    const button = document.getElementById("drawing3dBtn");
    button.classList.toggle("active", on);
    button.setAttribute("aria-pressed", String(on));
    initDrawingPanel();
    document.getElementById("drawing3dPanel").hidden = !on;
  } else if (act === "viewPlan") {
    if (typeof window.__setViewMode === "function") window.__setViewMode("plan");
    try { localStorage.setItem("home3d_viewmode", "plan"); } catch (_) {}
  } else if (act === "view3d") {
    if (typeof window.__setViewMode === "function") window.__setViewMode("3d");
    try { localStorage.setItem("home3d_viewmode", "3d"); } catch (_) {}
  } else if (act === "viewSplit") {
    if (typeof window.__setViewMode === "function") window.__setViewMode("split");
    try { localStorage.setItem("home3d_viewmode", "split"); } catch (_) {}
  } else if (act === "frameReset") {
    if (S.sel && S.sel.kind === "opening") {
      pushHistory();
      var fo = S.sel.ref;
      var fTargets = fo.paired
        ? fo.paired.map(function (id) { return S.openings.find(function (op) { return op.id === id; }); })
        : [fo];
      fTargets.forEach(function (op) {
        if (!op) return;
        ["frJamb", "frHead", "frSillW", "frDepth", "frMull", "frMullV", "frMullH"].forEach(function (k) {
          delete op[k];
        });
      });
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  } else if (act === "walk") {
    if (rcModule && rcModule.rcActive()) rcModule.toggleRC(false);
    if (zombieModule && zombieModule.zActive()) zombieModule.toggleZombies(false);
    if (lavaModule && lavaModule.lavaActive()) lavaModule.toggleLava(false);
    var on = toggleWalk();
    document.getElementById("walkBtn").classList.toggle("active", on);
    syncWalkView(on);
    if (!on && isPhysicsEnabled()) {
      togglePhysics(false);
      var pb = document.getElementById("physicsBtn");
      if (pb) pb.classList.remove("active");
      S.dirty3D = true;
    }
    flash(on ? t("f_walkOn") : t("f_walkOff"));
  } else if (act === "walkview") {
    var m = toggleWalkView();
    syncWalkView(true, m);
    flash(m === "tpv" ? t("f_viewTpv") : t("f_viewFpv"));
  } else if (act === "freemove") {
    var fm = toggleFreeMove();
    if (fm) document.getElementById("freeMoveBtn").classList.add("active");
    else document.getElementById("freeMoveBtn").classList.remove("active");
  } else if (act === "physics") {
    var pb = document.getElementById("physicsBtn");
    if (isPhysicsEnabled()) {
      togglePhysics(false);
      if (pb) pb.classList.remove("active");
      S.dirty3D = true; // Refresh 3D to reset objects
    } else {
      await loadPhysics();
      togglePhysics(true);
      if (pb) pb.classList.add("active");
      rebuild3D(); // Generate rigid bodies
    }
  } else if (act === "hitmode") {
    await loadPhysics();
    var hm = toggleHitMode();
    var hmb2 = document.getElementById("hitModeBtn");
    if (hmb2) {
      hmb2.innerHTML =
        hm === "hammer"
          ? '<i class="ph ph-hammer"></i>'
          : '<i class="ph ph-hand-fist"></i>';
      hmb2.classList.toggle("active", hm === "hammer");
    }
    flash(hm === "hammer" ? "🔨 Hammer" : "👊 Punch");
  } else if (act === "clearDebris") {
    clearDebris();
  } else if (act === "frame") {
    fitView();
    render2D();
    frameView();
  }
}

// split out of runAction()
async function runHintAction(act, ev) {
  if (act === "hintRect") {
    setTool("rect");
  } else if (act === "hintDoor") {
    setTool("door");
  } else if (act === "hintLibrary") {
    if (window.__plannerChrome) window.__plannerChrome.setLeftTab("library");
  }
}

// split out of runAction()
async function runMarkerAction(act, ev) {
  if (act === "mkPlace") {
    // browse the library and put the chosen piece on the selected point
    // (replacing whatever stood there — addFurnItem handles swap + history).
    // The point stays selected while the browser is open, which is exactly
    // what makes addFurnItem seat the piece instead of dropping it mid-view.
    if (S.sel && S.sel.kind === "marker") {
      var mkHeld = markerItem(S.sel.ref);
      openLibraryPicker(
        function (type) {
          if (S.sel && S.sel.kind === "marker") addFurnItem(type);
        },
        { current: mkHeld ? mkHeld.type : null, title: t("mk_pick_title") }
      );
    }
  } else if (act === "mkRelease") {
    // unpair without touching the object: the point is free again, the
    // object stays exactly where it is
    if (S.sel && S.sel.kind === "marker" && markerItem(S.sel.ref)) {
      pushHistory();
      detachMarker(S.sel.ref);
      fillProps();
      refreshTree();
      render2D();
    }
  } else if (act === "mkDup") {
    // a second spot with the same brief, offset so the copy is not hidden
    // under the original; the copy is selected because it is what you came
    // to position
    if (S.sel && S.sel.kind === "marker") {
      pushHistory();
      var cp = duplicateMarker(S.sel.ref, 30, 30);
      if (cp) select({ kind: "marker", ref: cp });
      refreshTree();
      render2D();
    }
  } else if (act === "mkGoItem") {
    var goIt = S.sel && S.sel.kind === "marker" ? markerItem(S.sel.ref) : null;
    if (goIt) {
      select({ kind: "item", ref: goIt });
      render2D();
    }
  }
}

// split out of runAction()
async function runNodeConstraintAction(act, ev) {
  if (act === "ndSquare") {
    /* Swing the arm about this corner to the nearest right angle from
       the arm that stays. Its LENGTH is preserved — the complaint being
       fixed is the angle, and shortening a wall to square it would trade one
       wrong number for another. */
    if (S.sel && S.sel.kind === "node") {
      pushHistory();
      var sq = squareJoint(S.sel.ref);
      if (sq) flash(squaredMsg(sq));
      else flash(t("f_squareBlocked"), "error");
    }
  } else if (act === "ndSetAngle") {
    if (S.sel && S.sel.kind === "node") showJointAngleDialog(S.sel.ref);
  } else if (act === "ndPin") togglePinSelected();
  else if (act === "ndCoincident") applyNodePairRelation("coincident");
  else if (act === "ndSymmetric") applyNodePairRelation("symmetric");
  else if (act === "ndSymmetricPerp") applyNodePairRelation("symmetricPerp");
  else if (act === "ndCompareAngle") {
    /* Same relation as "Equal angles", authored as a REFERENCE dimension:
       it reads both corners and their difference instead of forcing them
       together. The comparison and the correction are one keystroke apart
       on purpose — you usually want to look before you straighten. */
    S.nodePairReport = true;
    applyNodePairRelation("equalAngle");
    S.nodePairReport = false;
  } else if (act === "ndJoin") applyNodePairRelation("join");
  else if (act === "ndDistance") applyNodePairRelation("distance");
  else if (act === "ndAlignX") applyNodePairRelation("alignX");
  else if (act === "ndAlignZ") applyNodePairRelation("alignZ");
  else if (act === "ndDistanceX") applyNodePairRelation("axisDistX");
  else if (act === "ndDistanceZ") applyNodePairRelation("axisDistZ");
  else if (act === "ndEqualAngle") applyNodePairRelation("equalAngle");
}

// split out of runAction()
async function runOpeningAction(act, ev) {
  if (act === "keepAutoOpen") {
    if (S.sel && S.sel.kind === "room") {
      var rMeta = S.roomMeta[S.sel.ref];
      if (rMeta && rMeta.autoOpenings) {
        pushHistory();
        var oids = rMeta.autoOpenings;
        if (oids && oids.length > 0) {
          var firstOp = S.openings.find(function(o) { return o.id === oids[0]; });
          if (firstOp) {
            var wall = S.walls.find(function(w) { return w.id === firstOp.wall; });
            if (wall) {
              var adjKey = Object.keys(S.roomMeta).find(function(k) { return k.split(",").indexOf(String(wall.id)) > -1; });
              if (adjKey) {
                rMeta.floor = roomFloor(adjKey);
                S.dirty3D = true;
              }
            }
          }
        }
        delete rMeta.autoOpenings;
        fillProps();
      }
    }
  } else if (act === "customAutoOpen") {
    if (S.sel && S.sel.kind === "room") {
      var rMeta = S.roomMeta[S.sel.ref];
      if (rMeta && rMeta.autoOpenings) {
        pushHistory();
        var oids = rMeta.autoOpenings;
        var firstOp;
        if (oids && oids.length > 0) {
          oids.forEach(function(oid) {
            var op = S.openings.find(function(o) { return o.id === oid; });
            if (op) {
              op.width = Math.max(40, op.overlapL - 10);
              op.height = 210;
              if (!firstOp) firstOp = op;
            }
          });
          S.dirty3D = true;
          render2D();
        }
        delete rMeta.autoOpenings;
        if (firstOp) {
          select({ kind: "opening", ref: firstOp });
        } else {
          fillProps();
        }
      }
    }
  } else if (act === "closeAutoOpen") {
    if (S.sel && S.sel.kind === "room") {
      var rMeta = S.roomMeta[S.sel.ref];
      if (rMeta && rMeta.autoOpenings) {
        pushHistory();
        var oids = rMeta.autoOpenings;
        S.openings = S.openings.filter(function(o) { return oids.indexOf(o.id) === -1; });
        delete rMeta.autoOpenings;
        fillProps();
        S.dirty3D = true;
        render2D();
      }
    }
  } else if (act === "flipSwing") {
    /* One verb for the whole hinge: hand first, then the side it opens to.
       Four taps return the door to where it started, so the control is safe
       to press repeatedly — which is how a swing is actually chosen, by
       watching the arc rather than by reading "Right, out" in a dropdown. */
    if (!S.sel || S.sel.kind !== "opening") return;
    var swOp = S.sel.ref;
    if (swOp.type !== "door" || swOp.isSliding || swOp.isPocket) {
      flash(t("f_swingNA"), "error");
      return;
    }
    var SWING_CYCLE = ["R_IN", "L_IN", "L_OUT", "R_OUT"];
    var swAt = SWING_CYCLE.indexOf(swOp.swingDir || "R_IN");
    pushHistory();
    swOp.swingDir = SWING_CYCLE[(swAt < 0 ? 0 : swAt + 1) % SWING_CYCLE.length];
    S.dirty3D = true;
    fillProps();
    render2D();
    flash(t("f_swingNow", { dir: t("d_" + swOp.swingDir.toLowerCase()) }));
  } else if (act === "openwall") openWall();
  else if (act === "addWallDoor" || act === "addWallWindow" || act === "addWallPassage") {
    var openingType = act === "addWallDoor" ? "door" : act === "addWallWindow" ? "window" : "passage";
    var posEl = document.getElementById("ow_pos");
    var along = posEl ? parseFloat(posEl.value) : NaN;
    var placed = placeOpeningOnSelected(openingType, isFinite(along) ? { s: along } : {});
    if (placed) flash(t("f_openingPlaced", { name: t(openingType) }));
  } else if (act === "openseg") {
    if (S.segPreview)
      openSegment(S.segPreview.s, S.segPreview.width, S.segPreview.height);
  } else if (act && act.indexOf("op") === 0 &&
    ["opCentre", "opFromA", "opFromB", "opAlignX", "opAlignZ", "opSpacing"].indexOf(act) !== -1) {
    /* Position dimensions for the selected opening. The two "line up"
       verbs need a second opening, so they arm a pick the way the wall
       relations do; the rest complete immediately. */
    if (!S.sel || S.sel.kind !== "opening") return;
    var op = S.sel.ref;
    if (act === "opAlignX" || act === "opAlignZ") {
      startOpeningAlignPick(op, act === "opAlignX" ? "x" : "z");
      return void flash(t("wc_pick_openAlign"));
    }
    /* Every refusal is decided BEFORE pushHistory, so a rejected click does
       not leave a no-op undo entry that swallows the next Ctrl+Z — the same
       rule the point tool learned. */
    var run = null;
    if (act === "opSpacing") {
      /* Every opening on the SAME wall, in the order they sit along it:
         "equally spaced" is a statement about a run, and openings cannot be
         multi-selected, so asking the user to pick them would be a button
         that never works. */
      run = (S.openings || [])
        .filter(function (q) { return q.wall === op.wall; })
        .sort(function (a, b) { return a.s - b.s; })
        .map(function (q) { return q.id; });
      if (run.length < 3) return void flash(t("wc_openNeed3"), "error");
    }
    pushHistory();
    var opMade = act === "opCentre" ? addOpeningCentre(op.id)
      : act === "opSpacing" ? addOpeningSpacing(run)
        : addOpeningFromCorner(op.id, act === "opFromB" ? "b" : "a", null);
    if (!opMade) return void flash(t("wc_failed"), "error");
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
    flash(t("wc_added", { v: conLabelText(opMade, t) }));
  }
}

// split out of runAction()
async function runWallConstraintAction(act, ev) {
  if (act === "conFlip" || act === "conDelete" || act === "conRepin") {
    /* The three verbs on a dimension picked from the plan. All of them are
       edits to the design, so all of them push history and re-solve — a
       swapped hold or a deleted dimension changes where the corners are. */
    if (!S.sel || S.sel.kind !== "con") return;
    var pc0 = S.sel.ref;
    pushHistory();
    if (act === "conDelete") {
      removeCon(pc0.id);
      select(null);
    } else if (act === "conRepin") {
      repin(pc0.id);
    } else if (!flipConDirection(pc0.id)) {
      flash(t("wc_flipFail"), "error");
    }
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
  } else if ((act === "conHorizontal" || act === "conVertical") && S.sel && S.sel.kind === "wall") {
    pushHistory();
    addWallRelation(act === "conHorizontal" ? "horizontal" : "vertical", S.sel.ref.id);
    solveWallCons();
    fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
  } else if (
    (["conDist", "conRefDim", "conAngle", "conOffset", "conParallel", "conPerpendicular",
      "conCollinear", "conEqualLength", "conPointWall"].indexOf(act) !== -1) &&
    S.sel &&
    S.sel.kind === "wall"
  ) {
    /* Arm the pick and hand the plan back to the user — the second half of
       a dimension is a piece of geometry, and there is no honest way to name
       one in a dropdown. The end it measures FROM is whichever half of the
       wall is currently picked (the same A/B segmented control above), so
       "from this corner, 240 to that one" is two clicks and a number. */
    var conKinds = {
      conDist: "dist", conRefDim: "dist", conAngle: "angle", conOffset: "offset",
      conParallel: "parallel", conPerpendicular: "perpendicular",
      conCollinear: "collinear", conEqualLength: "equalLength",
      conPointWall: "pointWall",
    };
    var kind = conKinds[act];
    if ((kind === "dist" || kind === "pointWall") &&
        S.wallEditEnd !== "a" && S.wallEditEnd !== "b") {
      flash(t("wc_pick_source"), "error");
      return;
    }
    startConPick(kind, S.sel.ref, S.wallEditEnd === "b" ? "b" : "a", act === "conRefDim");
    fillProps();
    flash(t("wc_pick_" + kind));
  }
}

export { runAction };
