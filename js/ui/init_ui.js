/* The planner's initUI: the top-level UI wiring of toolbars, panels, menus and
   their handlers, split out of js/ui.js. It shares the editor's state through
   live imports from ../ui.js. */
import { syncBlueprintTraceControls } from "../blueprint_trace.js";
import { convertCadToWalls } from "../cad_to_walls.js";
import { windowChromePosture } from "../chrome_posture.js";
import { executeCommand } from "../commands/index.js";
import { captureClear, captureLock, hangStraightRunOnFace, isLocked, setLocked, setWallReference, setWallThicknessPreservingClear, snapshotNodes } from "../constraint_engine.js";
import { loadLocalProject, saveLocalProject } from "../core/project_store.js";
import { applyItemDimension, rebuildProject, requestItemDimension } from "../core/project.js";
import { defaultApartment } from "../demo_house.js";
import { fmtLen, parseLen } from "../display_units.js";
import { initDropdownMenus } from "../dropdown_menus.js";
import { ceilingHeight } from "../elevation.js";
import { deliverExport } from "../export_delivery.js";
import { addSlabOpeningToFloor, floorAbove } from "../floors.js";
import { FURN, clearVSpanCache } from "../furniture.js";
import { convertGeoJsonToWalls } from "../geojson_to_walls.js";
import { itemsInRoom, roomByKey, roomFloor, setWallEnd, wallClearLength, wallDimSide, wallGeom } from "../geometry.js";
import { beginHistory, cancelPending, commitPending, currentHistoryId, mountHistoryPanel, pushHistory, redo, undo } from "../history.js";
import { onLangChange, t, toggleLang } from "../i18n.js";
import { addSpace, applyNodePairRelation, autoArrangeAll, chamferSelectedWalls, deleteSel, dupSel, filletSelectedWalls, openSegment, openWall, placeOpeningOnSelected, restoreSelectedSharpCorner, rotateRoom, setTool, startConPick, startOpeningAlignPick, togglePinSelected, updateSelectedCornerTreatment } from "../interaction.js";
import { alignItems, distributeItems, matchRotation } from "../item_align.js";
import { refaceItem, rotStep, setRotStep } from "../item_orient.js";
import { saveLayers } from "../layers.js";
import { detachMarker, duplicateMarker, markerItem, moveMarker, setMarkerSurface } from "../markers.js";
import { loadMEP } from "../mep.js";
import { applyCabinetDimension, requestCabinetDimension } from "../parametric_cabinet.js";
import { getDirtyRevision, markSaved } from "../persist.js";
import { clearDebris, isPhysicsEnabled, loadPhysics, setStrength, toggleHitMode, togglePhysics } from "../physics_facade.js";
import { planStyle } from "../plan_style.js";
import { broadcastPlanOp } from "../plan_sync.js";
import { fitView, planImageCanvas, render2D, updatePlanGizmo } from "../plan2d.js";
import { activeEditor } from "../pro_shell.js";
import { roomMeasurements } from "../room_summary.js";
import { stairVoidFields } from "../slab_openings.js";
import { pushDevice } from "../smarthome_connect.js";
import { syncSmartFromLamp } from "../smarthome.js";
import { findSupport, rotateWith } from "../stack.js";
import { S, fin, touchItem3D, uid } from "../state.js";
import { normalizeSurvey } from "../survey.js";
import { openLibraryPicker } from "../ui_libpick.js";
import { renderPanel as refreshMEPPanel } from "../ui_mep.js";
import { addParam, renderParams, runRoomConAction } from "../ui_params.js";
import { resizeSelectedRoom } from "../ui_planning_guide.js";
import { fillProps, refreshMarkerReadout, roomMetaFor, selLamp, select, syncWallEnd, syncWallSide, wallFaceMaterials, wallFlipSymmetric, wallTakeoffRows } from "../ui_props.js";
import { exportCostCSV, refreshTree, updateCost, withoutRoomPrompts } from "../ui_tree.js";
import { initWarnPanel, renderWarnPanel } from "../ui_warn.js";
import { applyEnv, frameView, has3D, isWalk, rebuild3D, snapshot3D, toggleDrawing3D, toggleFreeMove, toggleWalk, toggleWalkView } from "../view3d.js";
import { addEqualLengthSet, addEqualSpacing, addOffset, addOpeningCentre, addOpeningFromCorner, addOpeningSpacing, addWallAngle, addWallRelation, conLabelText, conUnit, flipConDirection, removeCon, repin, setConReport, setConSuppressed, setConValue, solveWallCons } from "../wall_constraints.js";
import { normalizeWallKind, normalizeWallProfile, setWallKind } from "../wall_curves.js";
import { activeWallPresetId, isWallDrawTool, setWallDrawFrom, setWallDrawPreset } from "../wall_draw.js";
import { ensureWallTypes, flipWall, normalizeWall, setWallPhase, setWallType, wallLayers } from "../wall_types.js";
import {
  UI_COMMAND_HISTORY, addFurnItem, afterWallDim, applyData, applyRoomFloor,
  bindLength, bindNum, compass, download, editEnd, exportWallScheduleFile,
  flash, fmtHour, initDrawingPanel, lavaModule, loadLavaModule, loadRCModule,
  loadZombieModule, openModal, openWallTypeEditorDialog, parseFieldLength,
  pinDimSide, rcModule, restack, saveTextDownload, serialize, setCutaway,
  setEdit3D, setLockStruct, setPlanStyle, showJointAngleDialog, squareJoint,
  squareWall, squaredMsg, syncCutawayUI, syncEnvUI, syncPlanStyleUI,
  syncRotStepUI, syncWalkView, turnItem, writeFieldLength, zombieModule,
} from "../ui.js";
import {
  wireItemAndRoomInputs, wireWalkTogglesAndWallInputs,
} from "./wall_inputs.js";
import {
  wireDisplayAndPointInspector, wireHistoryAndTools, wireWallColorAndLights,
} from "./inspector_wiring.js";
import {
  wireFoldablesMenusAndDispatch, wireMobileDrawers,
} from "./mobile_chrome.js";

export function initUI() {
  wireWalkTogglesAndWallInputs();
  wireItemAndRoomInputs(runAction);
  var currentTexTarget = null;
  var { texInput } = wireWallColorAndLights();
  if (texInput) {
    texInput.addEventListener("change", function (e) {
      if (!e.target.files.length) return;
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.onload = function(ev) {
        var img = new Image();
        img.onload = function() {
          var canvas = document.createElement("canvas");
          var maxS = 512;
          var w = img.width, h = img.height;
          if (w > maxS || h > maxS) {
            if (w > h) { h = Math.round(h * maxS / w); w = maxS; }
            else { w = Math.round(w * maxS / h); h = maxS; }
          }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          
          if (currentTexTarget === "wall" && S.sel && S.sel.kind === "wall") {
            pushHistory();
            S.sel.ref.tex = dataUrl;
            S.dirty3D = true;
          } else if (currentTexTarget === "floor") {
            var m = roomMetaFor();
            if (m) {
              pushHistory();
              m.floorTex = dataUrl;
              S.dirty3D = true;
              render2D();
            }
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    });
  }

  const { toggleToolNames } = wireHistoryAndTools();

  wireDisplayAndPointInspector();

  // "classic" is the legacy light palette; "light" wears the Round-6 one in that layout
  const themes = ["light", "classic", "soft", "mid", "dark", "chrome"];
  /* The inline bootstrap in index.html has already resolved and applied the
     starting theme, and with nothing stored that answer comes from the
     browser's prefers-color-scheme. Re-deriving it from localStorage alone
     here would overwrite that with light on every dark-mode boot, so an
     explicit stored choice wins first and the bootstrap's answer second. */
  var curTheme = localStorage.getItem("home3d_theme");
  if (!themes.includes(curTheme)) curTheme = document.documentElement.getAttribute("data-theme");
  if (!themes.includes(curTheme)) curTheme = "light";

  const updateThemeIcon = (theme) => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    const icon = btn.querySelector("i");
    if (icon) {
      icon.className = theme === "chrome" ? "ph ph-google-chrome-logo" : (theme === "dark" ? "ph ph-moon" : (theme === "mid" ? "ph ph-cloud-sun" : (theme === "soft" ? "ph ph-cloud" : (theme === "classic" ? "ph ph-sun-dim" : "ph ph-sun"))));
    }
    var label = t("theme_" + theme) + " · " + t("theme_click");
    btn.title = label;
    btn.setAttribute("aria-label", label);
  };

  function applyTheme(theme, persist) {
    if (!themes.includes(theme)) theme = "light";
    curTheme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    if (persist !== false) localStorage.setItem("home3d_theme", theme);
    updateThemeIcon(theme);
    if (persist === false) return;
    window.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
    render2D();
    S.dirty3D = true;
  }

  applyTheme(curTheme, false);
  onLangChange(function () { updateThemeIcon(curTheme); });

  document.getElementById("themeToggle").addEventListener("click", function () {
    let idx = themes.indexOf(curTheme);
    if (idx === -1) idx = 0;
    applyTheme(themes[(idx + 1) % themes.length]);
  });

  wireMobileDrawers();

  /* The bottom nav is for fingers, not for narrow windows: a tablet is as wide
     as a laptop and still has no cursor, so it needs the one-tap pane switcher
     as much as a phone does. A narrow desktop window keeps the hamburgers. */
  var coarse = null;
  try {
    coarse = window.matchMedia("(pointer: coarse)");
  } catch (_) {}
  /* A posture change RETARGETS the closed panels' resting transform — the side
     drawer parks at translateX(±100%), the phone sheet at translateY(100%) —
     and `transition: transform` on #left-sidebar/#right-inspector happily
     animates between the two. Until this first pass runs, the markup is still
     in the side-drawer posture, so on every phone load both closed panels flew
     in across the canvas at negative x. The transition belongs to opening and
     closing a panel, not to deciding which shape it has, so posture settles
     with `.posture-ready` off and CSS holds the transition until the new
     resting place has been painted. */
  var posturePrev = "";
  function settlePosture() {
    /* Two frames: one for the new posture's resting transform to be computed
       and painted, one to be sure it was, before the transition comes back. A
       single frame still hands the animation the old position to start from. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.body.classList.add("posture-ready");
      });
    });
  }
  function applyCompactNav() {
    /* Posture is a pure function of CSS pixels + touch (js/chrome_posture.js).
       An unfolded Fold's inner display reports one segment, so hinge media
       queries never match there — roomy is both-axes tablet-sized instead. */
    var p = windowChromePosture();
    var flipped = document.body.classList.contains("compact-nav") !== p.compact;
    var key = [p.compact, p.dockRail, p.sheetDrawers, p.splitRow, p.sideInspector].join("|");
    var settled = key !== posturePrev;
    if (settled) {
      posturePrev = key;
      document.body.classList.remove("posture-ready");
    }
    document.body.classList.toggle("compact-nav", p.compact);
    if (document.body.classList.contains("touch-desk") !== p.touchDesk) document.body.classList.toggle("touch-desk", p.touchDesk);
    // The floor strip hides itself on a compact layout while there is only one
    // floor; crossing the threshold has to re-ask it, or it stays hidden on a
    // desktop window that was merely narrow a moment ago.
    if (flipped && window.__plannerChrome) window.__plannerChrome.renderFloorTabs();
    document.body.classList.toggle("dock-rail", p.dockRail);
    document.body.classList.toggle("sheet-drawers", p.sheetDrawers);
    document.body.classList.toggle("split-row", p.splitRow);
    document.body.classList.toggle("side-inspector", p.sideInspector);
    if (settled) settlePosture();
    window.dispatchEvent(new CustomEvent("mf-posture"));
  }
  coarse &&
    (coarse.addEventListener
      ? coarse.addEventListener("change", applyCompactNav)
      : coarse.addListener(applyCompactNav));
  const { handleActionClick } = wireFoldablesMenusAndDispatch(applyCompactNav, runAction);
  async function runAction(act, ev) {
    if (S.workspace && S.workspace.role === "viewer") {
      var readOnlyActions = ["workspace", "frame", "togglePlanStyle", "dollhouse", "drawing3d", "walk", "walkview", "freemove", "photo", "png2d", "png3d", "exportjson", "exportgltf", "exportCost", "tree", "shortcuts", "plannerTutorial", "viewPlan", "view3d", "viewSplit", "openModeler", "friends", "toggleLegacy", "newPlan", "toggleToolNames"];
      if (readOnlyActions.indexOf(act) < 0) {
        flash("Viewer access is read-only", "error");
        return;
      }
    }
    if (act === "addFloor") {
      window.__plannerChrome && window.__plannerChrome.addFloorFromUI();
    } else if (act === "undo") undo();
    else if (act === "redo") redo();
    else if (act === "wallTypeEditor") openWallTypeEditorDialog();
    else if (act === "exportWallSchedule") exportWallScheduleFile();
    else if (act === "lockStruct") setLockStruct(!S.lockStruct);
    else if (act === "toggleToolNames") toggleToolNames();
    else if (act === "edit3d") setEdit3D(!S.edit3D);
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
    }
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
    } else if (act === "newPlan") {
      if (window.__plannerChrome) window.__plannerChrome.openStartScreen();
    } else if (act === "viewPlan") {
      if (typeof window.__setViewMode === "function") window.__setViewMode("plan");
      try { localStorage.setItem("home3d_viewmode", "plan"); } catch (_) {}
    } else if (act === "view3d") {
      if (typeof window.__setViewMode === "function") window.__setViewMode("3d");
      try { localStorage.setItem("home3d_viewmode", "3d"); } catch (_) {}
    } else if (act === "viewSplit") {
      if (typeof window.__setViewMode === "function") window.__setViewMode("split");
      try { localStorage.setItem("home3d_viewmode", "split"); } catch (_) {}
    } else if (act === "hintRect") {
      setTool("rect");
    } else if (act === "hintDoor") {
      setTool("door");
    } else if (act === "hintLibrary") {
      if (window.__plannerChrome) window.__plannerChrome.setLeftTab("library");
    } else if (act === "deleteSel") {
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
    } else if (AL_ACTS[act]) {
      /* Align / distribute / match rotation on a multi-item selection. All of
         them are edits to positions, so all of them are undoable and all of
         them re-touch the 3D transforms of what they moved. */
      if (!S.sel || S.sel.kind !== "items") return;
      var picks = S.sel.refs, verb = AL_ACTS[act], n = 0;
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
    } else if (act === "mkPlace") {
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
    } else if (act === "ndSquare") {
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
    }
    else if (act === "wmChamfer") {
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
    }
    else if (["wmParallel", "wmPerpendicular", "wmCollinear", "wmEqualLength", "wmOffset", "wmEqualSpacing", "wmWallAngle", "wmEqualLenSet"].indexOf(act) !== -1) {
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
    }
    else if (act === "mkDup") {
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
    else if (act === "keepAutoOpen") {
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
    } else if (act === "makeSeamless") {
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
    } else if (act === "lang") toggleLang();
    else if (act === "rotL" && S.sel && S.sel.kind === "item") {
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
    } else if (act && act.indexOf("rotStep") === 0) {
      // rotStep15 / rotStep45 / rotStep90
      setRotStep(parseInt(act.slice(7), 10));
      syncRotStepUI();
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
    else if (act === "openwall") openWall();
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
    } else if (act === "conFlip" || act === "conDelete" || act === "conRepin") {
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
    } else if (act === "lockItem" && S.sel && S.sel.kind === "item") {
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
    } else if (act === "tree") {
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
    } else if (act === "photo") {
      if (!(await import("../photomode.js")).openPhotoMode())
        flash(t("f_no3d"), "error");
    } else if (act === "frame") {
      fitView();
      render2D();
      frameView();
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
    } else if (act === "openTextureGallery") {
      var { openTextureGallery } = await import("../ui_textures.js");
      openTextureGallery();
    } else if (act === "uploadFloorTex") {
      currentTexTarget = "floor";
      var texInput = document.getElementById("texInput");
      if (texInput) texInput.click();
    } else if (act === "uploadWallTex") {
      currentTexTarget = "wall";
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
    } else if (act === "shortcuts") {
      showShortcuts();
    }
  }

  // ---- keyboard cheat sheet (topbar ⌨ button, or "?" anywhere) ----
  var shortcutsModal = null;
  /* The guide used to say "Ctrl" on every platform. The app's own handlers have
     always accepted Cmd as well (`var mod = e.ctrlKey || e.metaKey`), so the
     shortcuts worked on a Mac while the documentation for them named a key
     Mac users do not reach for. Substituting only the modifiers — and dropping
     the "+" separators only when something was actually substituted, so the
     row that documents the "+" key is not emptied — keeps every other cap as
     written. */
  var MAC_KEYS = /Mac|iPhone|iPad|iPod/i.test(
    (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ""
  );
  function macCap(part) {
    if (!MAC_KEYS) return part;
    var out = part
      .replace(/\bCtrl\b/g, "⌘")
      .replace(/\bAlt\b/g, "⌥")
      .replace(/\bShift\b/g, "⇧")
      .replace(/\bDel\b/g, "⌫");
    return out === part ? part : out.replace(/\+/g, "");
  }

  /* Any static <kbd data-kbd="..."> in the markup gets the same treatment, so
     a menu item's hint agrees with the guide. Platform does not change while
     the page is open, so this runs once. */
  function applyPlatformKeyCaps() {
    document.querySelectorAll("kbd[data-kbd]").forEach(function (el) {
      el.textContent = macCap(el.getAttribute("data-kbd"));
    });
  }
  applyPlatformKeyCaps();

  function showShortcuts() {
    if (shortcutsModal) {
      shortcutsModal.close();
      shortcutsModal = null;
      return;
    }
    var SECTIONS = [
      ["keys_sec_general", [
        ["Ctrl+S", "k_save"],
        ["Ctrl+O", "k_import"],
        ["Ctrl+E", "k_export"],
        ["?", "k_help"],
      ]],
      ["keys_sec_edit", [
        ["Ctrl+Z", "k_undo"],
        ["Ctrl+Y", "k_redo"],
        ["Ctrl+D", "k_dup"],
        ["Ctrl+A", "k_selall"],
        ["Ctrl+G", "k_group"],
        ["Ctrl+Shift+G", "k_ungroup"],
        ["Del", "k_del"],
        ["R", "k_rot"],
        ["← ↑ → ↓", "k_nudge"],
        ["Esc", "k_esc"],
      ]],
      ["keys_sec_tools", [["1 2 3 4 5", "k_tools"]]],
      ["keys_sec_draft", [
        ["0…9", "k_typedim"],
        ["Tab", "k_typetab"],
        ["Enter", "k_typeok"],
        ["F3", "k_osnap"],
        ["F8", "k_ortho"],
        ["F9", "k_gridsnap"],
      ]],
      ["keys_sec_view", [
        ["F", "k_frame"],
        ["W", "k_walk"],
        ["P", "k_photo"],
        ["C", "k_rc"],
      ]],
      ["keys_sec_nav3d", [
        ["Drag", "k_orbit"],
        ["Shift+Drag / MMB / RMB", "k_pan"],
        ["← ↑ → ↓ / WASD", "k_navmove"],
        ["Q E", "k_navheight"],
        ["+ −", "k_navzoom"],
        ["Wheel", "k_navwheel"],
        ["Double-click", "k_navfocus"],
      ]],
      ["keys_sec_con", [
        ["Ctrl+Shift+P", "k_conParallel"],
        ["Ctrl+Shift+O", "k_conPerp"],
        ["Ctrl+Shift+C", "k_conCollinear"],
        ["Ctrl+Shift+E", "k_conEqual"],
        ["Ctrl+Shift+F", "k_conPin"],
        ["Ctrl+Shift+J", "k_conJoin"],
        ["Ctrl+Shift+M", "k_conSym"],
        ["Alt+drag", "k_conOverride"],
        ["Tab", "k_snapCycle"],
        ["Shift+E/M/I/R/F", "k_snapOnly"],
      ]],
      ["keys_sec_walk", [
        ["WASD", "k_move"],
        ["V", "k_walkview"],
        ["G", "k_hit"],
      ]],
      ["keys_sec_uikit", [
        ["Ctrl+Alt+E", "k_uikit_toggle"],
        ["Ctrl+Alt+U", "k_uikit_reset"],
        ["Tab", "k_uikit_select"],
        ["← ↑ → ↓", "k_uikit_move"],
        ["Alt+Arrow", "k_uikit_moveout"],
        ["Ctrl+G", "k_uikit_group"],
        ["Ctrl+Shift+G", "k_uikit_ungroup"],
        ["Del", "k_uikit_hide"],
        ["Esc", "k_uikit_exit"],
      ]],
    ];
    var m = openModal(t("keys_title"));
    shortcutsModal = m;
    m.onClose(function () {
      shortcutsModal = null;
    });
    var wrap = document.createElement("div");
    wrap.className = "keys-grid";
    SECTIONS.forEach(function (sec) {
      var h = document.createElement("div");
      h.className = "keys-sec";
      h.textContent = t(sec[0]);
      wrap.appendChild(h);
      sec[1].forEach(function (row) {
        var r = document.createElement("div");
        r.className = "keys-row";
        var k = document.createElement("span");
        k.className = "keys-combo";
        // split on spaces so each key gets its own <kbd> cap
        row[0].split(" ").forEach(function (part) {
          var kb = document.createElement("kbd");
          kb.textContent = macCap(part);
          k.appendChild(kb);
        });
        var d = document.createElement("span");
        d.className = "keys-desc";
        d.textContent = t(row[1]);
        r.appendChild(k);
        r.appendChild(d);
        wrap.appendChild(r);
      });
    });
    m.body.appendChild(wrap);
    var hint = document.createElement("div");
    hint.className = "t keys-hint";
    hint.textContent = t("keys_hint");
    m.body.appendChild(hint);
    var closeBtn = document.createElement("button");
    closeBtn.className = "btn-accent";
    closeBtn.textContent = t("keys_close");
    closeBtn.addEventListener("click", function () {
      m.close();
      shortcutsModal = null;
    });
    m.actions.appendChild(closeBtn);
    m.overlay.addEventListener("click", function (e) {
      if (e.target === m.overlay) shortcutsModal = null;
    });
    closeBtn.focus();
  }

  // ---- global keyboard shortcuts ----
  // Editor-wide accelerators. Canvas/selection keys (tools, nudge, rotate) stay
  // in interaction.js; these are the app-level ones that mirror menu items.
  document.addEventListener("keydown", function (e) {
    var ae = document.activeElement;
    if (ae && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return;
    if (isWalk()) return; // walk/drive modes own the keyboard
    if (lavaModule && lavaModule.lavaActive()) return;
    var mod = e.ctrlKey || e.metaKey;
    /* The cabinet designer covers the plan and has its own keys (arrows,
       Delete, Ctrl+C/V, V/H/X, "?" for its own sheet). The plan's accelerators
       must not act on the hidden plan behind it — W walked off into the plan,
       F reframed it, Ctrl+D/A/G duplicated, selected and grouped plan items,
       and "?" opened the planner's sheet over the designer's. Saving, opening
       and exporting the project still go through. */
    if (activeEditor() === "cab" && !(mod && !e.altKey && !e.shiftKey && /^[soe]$/i.test(e.key))) return;
    /* Constraint verbs: Ctrl/Cmd+Shift+letter, acting on whatever is selected.
       Authoring a relation used to mean selecting, then finding the right
       button in the inspector, then clicking the target — fine once, tiring
       for the twentieth. Behind a modifier rather than on bare letters
       because the bare ones are already spoken for (F frames, W walks,
       P photographs) and a drafting verb that fires while you meant to frame
       the view is worse than no shortcut. Checked BEFORE the plain Ctrl block,
       which does not test shiftKey and would otherwise export the project on
       Ctrl+Shift+E. */
    if (mod && e.shiftKey && !e.altKey) {
      var ck = e.key.toLowerCase(), verb = CON_KEYS[ck];
      if (verb) { e.preventDefault(); runConVerb(verb); return; }
    }
    /* Ctrl/Cmd+Alt+E opens the interface customizer. It has to be tested here,
       before the two blocks below that bail out on Alt entirely.
       e.code, NOT e.key: on macOS Option+E is a dead key for the acute accent,
       so the event arrives with key "´" and a shortcut written against the
       letter silently never fires on a Mac. The physical key is the only
       reliable identity for an Alt combination. Routed through runAction so
       the menu item and the shortcut cannot drift apart. */
    if (mod && e.altKey && !e.shiftKey && e.code === "KeyE") {
      e.preventDefault();
      runAction("uikitCustomize");
      return;
    }
    if (mod && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); runAction("save"); }
      else if (k === "o") { e.preventDefault(); runAction("importjson"); }
      else if (k === "e") { e.preventDefault(); runAction("exportjson"); }
      else if (k === "d") { e.preventDefault(); runAction("dupSel"); }
      else if (k === "g") {
        e.preventDefault();
        runAction(e.shiftKey ? "ungroupItems" : "groupItems");
      } else if (k === "a") { e.preventDefault(); selectAllItems(); }
      return;
    }
    if (e.altKey) return;
    if (e.key === "F1") {
      e.preventDefault();
      runAction("plannerTutorial");
    } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
      e.preventDefault();
      showShortcuts();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      runAction("frame");
    } else if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      runAction("walk");
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      runAction("photo");
    } else if (e.key === "c" || e.key === "C") {
      // C for "car" — the RC race was menu-only, which made the whole mode
      // easy to never find. RC's own keymap runs capture-first and stops
      // propagation, so inside the mode C still cycles the camera.
      e.preventDefault();
      runAction("rc");
    }
  });

  /* One letter per relation, chosen for the word rather than the internal
     type name: F for fix, J for join, M for mirror, C for collinear. */
  var CON_KEYS = {
    p: "parallel",
    o: "perpendicular",
    c: "collinear",
    e: "equal",
    f: "pin",
    j: "coincident",
    m: "symmetric",
  };

  /* Apply a relation to the current selection, working out from what IS
     selected what the verb should mean: "equal" is equal length between two
     walls and equal angles between two corners, because that is the same
     intent expressed about different geometry. */
  function runConVerb(verb) {
    var sel = S.sel;
    if (!sel) return flash(t("wc_needSel"), "error");

    if (verb === "pin") {
      if (sel.kind === "node" || sel.kind === "nodes") return void togglePinSelected();
      return flash(t("wc_needCorner"), "error");
    }
    if (sel.kind === "nodes" && sel.refs.length === 2) {
      if (verb === "coincident") return void applyNodePairRelation("coincident");
      if (verb === "symmetric") return void applyNodePairRelation("symmetric");
      if (verb === "equal") return void applyNodePairRelation("equalAngle");
      return flash(t("wc_needWalls"), "error");
    }
    if (sel.kind === "walls" && sel.refs.length === 2) {
      var type = verb === "equal" ? "equalLength" : verb;
      if (["parallel", "perpendicular", "collinear", "equalLength"].indexOf(type) === -1)
        return flash(t("wc_needCorner"), "error");
      pushHistory();
      // the palette's convention: first selected is driven, second is the held
      // reference — the keyboard must not quietly reverse it
      var made = addWallRelation(type, sel.refs[0].id, sel.refs[1].id);
      if (!made) return flash(t("wc_failed"), "error");
      solveWallCons();
      S.dirty3D = true;
      fillProps(); render2D(); refreshTree(); renderWarnPanel(true);
      return void flash(t("wc_added", { v: t("wc_add" + type.charAt(0).toUpperCase() + type.slice(1)) }));
    }
    flash(t("wc_needTwo"), "error");
  }

  /* The align palette, as a table: verb name -> what it does. */
  var AL_ACTS = {
    alLeft: { kind: "align", how: "left" },
    alRight: { kind: "align", how: "right" },
    alCenterX: { kind: "align", how: "centerX" },
    alTop: { kind: "align", how: "top" },
    alBottom: { kind: "align", how: "bottom" },
    alCenterZ: { kind: "align", how: "centerZ" },
    alDistX: { kind: "dist", how: "x" },
    alDistZ: { kind: "dist", how: "z" },
    alSameRot: { kind: "rot" },
  };

  // Ctrl+A — select every unlocked item in the scene (items are a flat list).
  function selectAllItems() {
    var refs = (S.items || []).filter(function (it) {
      return !it.locked;
    });
    if (!refs.length) return;
    select(refs.length > 1 ? { kind: "items", refs: refs } : { kind: "item", ref: refs[0] });
    render2D();
  }

  // Bind right-inspector, topbar, and left-sidebar to the shared click handler
  ["right-inspector", "topbar", "left-sidebar", "center-canvas"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener("click", handleActionClick);
  });

  // file import (hidden <input type=file>)
  document.getElementById("importfile").addEventListener("change", function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        pushHistory();
        var geo = (d && (d.type === "FeatureCollection" || Array.isArray(d.features) || d.type === "Feature")) ? d : null;
        var cad = d.cadEntities || d.cad || ((d.lines || d.arcs) ? d : null);
        if (geo) {
          var convertedGeo = convertGeoJsonToWalls(geo, { height: 300, firstId: S.idc });
          S.nodes = convertedGeo.nodes; S.walls = convertedGeo.walls; S.openings = convertedGeo.openings;
          S.items = []; S.markers = []; S.annotations = []; S.roomMeta = convertedGeo.roomMeta || {}; S.idc = convertedGeo.nextId || S.walls.length + 1;
          ensureWallTypes(S); rebuildProject(S, FURN); S.sel = null; S.dirty3D = true;
          render2D(); fitView(); refreshTree(); updateCost();
        } else if (cad && (Array.isArray(cad.lines) || Array.isArray(cad.arcs))) {
          var converted = convertCadToWalls(cad, {
            wallTypeByLayer: d.wallTypeByLayer || cad.wallTypeByLayer || {},
            singleLineWalls: !!(d.singleLineWalls || cad.singleLineWalls),
            defaultThickness: Number(d.defaultThickness || cad.defaultThickness) || 10,
            height: Number(d.height || cad.height) || 270,
            firstId: S.idc,
          });
          S.nodes = converted.nodes; S.walls = converted.walls; S.openings = converted.openings;
          S.items = []; S.markers = []; S.annotations = []; S.roomMeta = {}; S.idc = converted.nextId;
          ensureWallTypes(S); rebuildProject(S, FURN); S.sel = null; S.dirty3D = true;
          render2D(); fitView(); refreshTree(); updateCost();
          flash(t("f_imported"), "success");
        } else {
          // The imported file is the one path that routinely carries custom
          // models this browser has never seen; wait for the builder.
          Promise.resolve(applyData(d)).then(function (applied) {
            if (!applied) { flash(t("f_badFile"), "error"); return; }
            flash(t("f_imported"), "success");
          }, function () { flash(t("f_badFile"), "error"); });
        }
      } catch (err) {
        flash(t("f_badFile"), "error");
      }
    };
    rd.onerror = function () {
      flash(t("f_readFail"), "error");
    };
    rd.readAsText(f);
  });
}

