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

export function initUI() {
  // destruction-strength slider (walk mode): scales material break thresholds
  var strengthSlider = document.getElementById("strengthSlider");
  if (strengthSlider) {
    setStrength(parseFloat(strengthSlider.value));
    strengthSlider.addEventListener("input", function () {
      setStrength(parseFloat(strengthSlider.value));
    });
  }
  // keyboard "V" toggles the walk perspective from view3d; reflect it in the UI
  window.addEventListener("walkview", function (e) {
    syncWalkView(true, e.detail);
    flash(e.detail === "tpv" ? t("f_viewTpv") : t("f_viewFpv"));
  });
  // keyboard "T" toggles physics slow-motion from view3d
  window.addEventListener("slowmo", function (e) {
    flash(t(e.detail ? "f_slowMoOn" : "f_slowMoOff"));
  });
  // keyboard "F" toggles free-move (no-clip) from view3d; reflect it in the UI
  window.addEventListener("freemove", function (e) {
    var fb = document.getElementById("freeMoveBtn");
    if (fb) fb.classList.toggle("active", e.detail);
    flash(e.detail ? t("f_freeOn") : t("f_freeOff"));
  });
  // numeric property inputs
  bindLength("w_len", function (v) {
    var w = S.sel.ref;
    if (S.sel.kind !== "wall") return;
    v = Math.max(5, Math.min(3000, v));
    pinDimSide(w);
    // typed by hand: from now on this length outranks any DERIVED one when the
    // relaxation has to choose which wall yields in an over-constrained loop
    w.dimUser = 1;
    var before = snapshotNodes();
    var gm = wallGeom(w);
    // Add the hidden offset to get the full node-to-node length
    var targetL = v + (gm.L - wallClearLength(w));
    var end = editEnd(w);
    if (end === "mid") {
      // grow/shrink symmetrically about the midpoint — both halves change
      var mx = (gm.a.x + gm.b.x) / 2, mz = (gm.a.z + gm.b.z) / 2, h = targetL / 2;
      // gm is the wall's own line; setWallEnd maps back onto the node line
      setWallEnd(w, "a", { x: mx - gm.ux * h, z: mz - gm.uz * h });
      setWallEnd(w, "b", { x: mx + gm.ux * h, z: mz + gm.uz * h });
    } else if (end === "a") {
      var b = S.nodes[w.b];
      S.nodes[w.a] = { x: b.x - gm.ux * targetL, z: b.z - gm.uz * targetL };
    } else {
      var a = S.nodes[w.a];
      S.nodes[w.b] = { x: a.x + gm.ux * targetL, z: a.z + gm.uz * targetL };
    }
    // the typed number IS the interior dimension the wall now holds. The lock
    // pass runs FIRST (it decides which joints survive the edit); only then are
    // the interior spans of whatever is still attached restored.
    afterWallDim(w, before, v, end);
    return v;
  }, null, "change");
  bindNum("w_ang", function (v) {
    var w = S.sel.ref;
    if (S.sel.kind !== "wall") return;
    pinDimSide(w);
    if (!fin(w.clearL)) w.clearL = wallClearLength(w);
    var heldLength = w.clearL;
    var before = snapshotNodes();
    var gm = wallGeom(w),
      ang = (v * Math.PI) / 180;
    // Pivot about the better-connected end and swing the freer one, matching
    // w_len. This used to always move `b`, so retyping an angle could drag a
    // junction and silently reshape every wall meeting it — while editing the
    // same wall's LENGTH correctly left that junction alone.
    var end = editEnd(w);
    if (end === "mid") {
      var mx = (gm.a.x + gm.b.x) / 2, mz = (gm.a.z + gm.b.z) / 2, h = gm.L / 2;
      setWallEnd(w, "a", { x: mx - Math.cos(ang) * h, z: mz - Math.sin(ang) * h });
      setWallEnd(w, "b", { x: mx + Math.cos(ang) * h, z: mz + Math.sin(ang) * h });
    } else if (end === "a") {
      var b = S.nodes[w.b];
      S.nodes[w.a] = {
        x: b.x - Math.cos(ang) * gm.L,
        z: b.z - Math.sin(ang) * gm.L,
      };
    } else {
      var a = S.nodes[w.a];
      S.nodes[w.b] = {
        x: a.x + Math.cos(ang) * gm.L,
        z: a.z + Math.sin(ang) * gm.L,
      };
    }
    w.lockAng = v;
    afterWallDim(w, before, heldLength, end);
    return v;
  }, null, "change");
  // segmented picker: which half of the wall a length/angle edit moves
  var wEndBox = document.getElementById("w_end");
  if (wEndBox)
    wEndBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-end]");
      if (!b) return;
      S.wallEditEnd = b.dataset.end || null;
      syncWallEnd();
      render2D();
    });
  /* Picking the measured face re-states the dimension without moving anything:
     the wall is the same wall, the tape just moved to the other face — so the
     held interior length is re-read from that face. */
  var wSideBox = document.getElementById("w_side");
  if (wSideBox)
    wSideBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-side]");
      if (!b || !S.sel || S.sel.kind !== "wall") return;
      var w = S.sel.ref,
        v = b.dataset.side;
      pushHistory();
      // on a face-located wall the stored line IS this face, so changing it
      // re-hangs the wall — setWallReference owns both cases
      setWallReference(w, { dimSide: v === "" ? null : +v });
      S.dirty3D = true;
      syncWallSide(w);
      fillProps();
      render2D();
    });
  /* Which line of the wall the model stores. The corner stays where it is and
     the wall re-hangs on it — see setWallReference. "Whole run" (and a
     thickness edit of a collinear run) hangs every member on the same face so
     the interior is flush; a 90° branch sharing the T-node stays welded. */
  var wLocBox = document.getElementById("w_loc");
  if (wLocBox)
    wLocBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-loc]");
      if (!b || b.disabled || !S.sel || S.sel.kind !== "wall") return;
      var w = S.sel.ref,
        v = b.dataset.loc;
      pushHistory();
      if (v === "face-run") hangStraightRunOnFace(w, wallDimSide(w));
      else setWallReference(w, { loc: v });
      S.dirty3D = true;
      refreshTree();
      syncWallSide(w);
      fillProps();
      render2D();
    });

  function editWallDefinition(change, affectsGeometry) {
    if (!S.sel || S.sel.kind !== "wall") return;
    pushHistory();
    normalizeWall(S.sel.ref, S);
    change(S.sel.ref);
    if (affectsGeometry !== false) S.dirty3D = true;
    fillProps();
    render2D();
    updateCost();
  }

  var wallTypeSelect = document.getElementById("w_type");
  if (wallTypeSelect)
    wallTypeSelect.addEventListener("change", function () {
      var typeId = this.value;
      editWallDefinition(function (w) {
        pinDimSide(w);
        var oldThickness = w.thickness;
        setWallType(w, typeId, S);
        var targetThickness = w.thickness;
        // Let the established thickness path keep the selected clear face in
        // place; changing assembly must not silently resize the room.
        w.thickness = oldThickness;
        setWallThicknessPreservingClear(w, targetThickness, editEnd(w));
      });
    });

  var wallKindSelect = document.getElementById("w_kind");
  if (wallKindSelect)
    wallKindSelect.addEventListener("change", function () {
      var kind = normalizeWallKind(this.value);
      editWallDefinition(function (w) {
        setWallKind(w, kind);
      });
    });

  var wallPhaseSelect = document.getElementById("w_phase");
  if (wallPhaseSelect)
    wallPhaseSelect.addEventListener("change", function () {
      var phase = this.value;
      editWallDefinition(function (w) { setWallPhase(w, phase); });
    });

  var wallDatumSelect = document.getElementById("w_datum");
  if (wallDatumSelect)
    wallDatumSelect.addEventListener("change", function () {
      var datum = {
        outer: "exterior",
        mainOutside: "main-exterior",
        mainInside: "main-interior",
        inner: "interior",
      }[this.value] || "center";
      editWallDefinition(function (w) { w.datum = datum; });
    });

  var upperTypeSelect = document.getElementById("w_upper_type");
  if (upperTypeSelect)
    upperTypeSelect.addEventListener("change", function () {
      var typeId = this.value;
      editWallDefinition(function (w) { w.upperWallTypeId = typeId; });
    });

  /* End joins are a segmented picker now rather than a select: three ways two
     walls can meet, drawn instead of named. Same edit either way — "auto"
     removes the override so the joint solver keeps deciding. */
  ["a", "b"].forEach(function (end) {
    var joinBox = document.getElementById("w_join_" + end);
    if (!joinBox) return;
    joinBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-join]");
      if (!b) return;
      var mode = b.dataset.join;
      editWallDefinition(function (w) {
        if (!w.join || typeof w.join !== "object") w.join = {};
        if (mode === "auto") delete w.join[end];
        else w.join[end] = mode;
        if (!Object.keys(w.join).length) delete w.join;
      });
    });
  });

  bindLength("w_split_h", function (v) {
    if (!S.sel || S.sel.kind !== "wall") return;
    S.sel.ref.splitHeight = Math.max(1, Math.min(S.sel.ref.height - 1, v));
    fillProps();
    return S.sel.ref.splitHeight;
  }, null, "change");

  bindLength("w_bulge", function (v) {
    if (!S.sel || S.sel.kind !== "wall") return;
    var w = S.sel.ref;
    v = Math.max(-5, Math.min(5, v));
    if (Math.abs(v) < 0.000001) {
      delete w.geometry;
      delete w.curve;
      delete w.bulge;
    } else {
      w.geometry = { kind: "arc", bulge: v };
      delete w.curve;
      delete w.bulge;
    }
    fillProps();
    return v;
  }, null, "change");

  function updateWallProfile() {
    if (!S.sel || S.sel.kind !== "wall") return;
    var w = S.sel.ref, length = wallGeom(w).L;
    function val(id, fallback) {
      var n = parseLen(document.getElementById(id).value);
      return Number.isFinite(n) ? Math.max(0, Math.min(600, n)) : fallback;
    }
    var topA = val("w_top_a", w.height), topB = val("w_top_b", w.height);
    var baseA = Math.min(val("w_base_a", 0), topA);
    var baseB = Math.min(val("w_base_b", 0), topB);
    // Preserve intermediate controls authored by an imported/elevation edit;
    // these four compact fields only replace the two endpoint controls.
    var middle = normalizeWallProfile(w).filter(function (p) {
      return p.s > 0.000001 && p.s < length - 0.000001;
    });
    var oldBase = w.profile && !Array.isArray(w.profile) && Array.isArray(w.profile.base)
      ? w.profile.base : Array.isArray(w.baseProfile) ? w.baseProfile : [];
    var baseMiddle = oldBase.filter(function (p) {
      var s = Number(Array.isArray(p) ? p[0] : p && p.s);
      return Number.isFinite(s) && s > 0.000001 && s < length - 0.000001;
    });
    w.profile = {
      points: [{ s: 0, height: topA }].concat(middle, [{ s: length, height: topB }]),
      base: [{ s: 0, height: baseA }].concat(baseMiddle, [{ s: length, height: baseB }]),
    };
    delete w.baseProfile;
    w.height = Math.max(topA, topB);
    fillProps();
  }
  ["w_top_a", "w_top_b", "w_base_a", "w_base_b"].forEach(function (id) {
    bindNum(id, function () { updateWallProfile(); }, null, "change");
  });

  bindLength("w_th", function (v) {
    if (S.sel.kind !== "wall") return;
    v = Math.max(2, Math.min(60, v));
    var w = S.sel.ref;
    normalizeWall(w, S);
    pinDimSide(w);
    var authoredLayers = wallLayers(w, S);
    if (w.layersReversed) authoredLayers.reverse();
    authoredLayers = authoredLayers.map(function (layer) { return Object.assign({}, layer); });
    var total = authoredLayers.reduce(function (sum, layer) { return sum + layer.thickness; }, 0);
    var main = authoredLayers.find(function (layer) { return layer.main; }) || authoredLayers[0];
    var others = total - main.thickness;
    v = Math.max(v, others + 0.1);
    main.thickness = v - others;
    w.layers = authoredLayers;
    var result = setWallThicknessPreservingClear(w, v, editEnd(w));
    renderWarnPanel();
    fillProps();
    if (result.released)
      flash(t("f_jointReleased", { n: result.released }));
    return v;
  }, null, "change");
  bindLength("w_h", function (v) {
    if (S.sel.kind === "wall")
      S.sel.ref.height = Math.max(20, Math.min(600, v));
    return S.sel.kind === "wall" ? S.sel.ref.height : v;
  }, null, "change");
  /* Planner sizing is a parameter/configuration request, never a mesh scale.
     Continuous valid edits rebuild immediately; family/module changes wait for
     an explicit choice in this compact proposal dialog. */
  function finishSmartDimension(it, dimension) {
    clearVSpanCache();
    if (dimension === "height") restack(it);
    touchItem3D(it, "build");
    fillProps();
    refreshTree();
    render2D();
  }
  function applySmartChoice(it, dimension, result, alternativeId, dlg) {
    commitPending();
    if (it.cab) applyCabinetDimension(S, it, result, alternativeId);
    else applyItemDimension(S, it, result, alternativeId, FURN[it.type] || {});
    if (dlg) dlg.close();
    finishSmartDimension(it, dimension);
  }
  function showSmartProposal(it, dimension, result, input) {
    var dlg = openModal(t("cfg_required"));
    var message = document.createElement("p");
    message.textContent = result.message || t("cfg_choose");
    dlg.body.appendChild(message);
    (result.issues || []).slice(0, 4).forEach(function (issue) {
      var note = document.createElement("small");
      note.className = "parametric-proposal-issue";
      note.textContent = "• " + (issue.msg || issue.message || issue.code);
      dlg.body.appendChild(note);
    });
    (result.alternatives || []).forEach(function (choice, index) {
      var button = document.createElement("button");
      button.className = index === 0 ? "btn-accent parametric-choice" : "parametric-choice";
      var title = document.createElement("strong");
      title.textContent = choice.label;
      button.appendChild(title);
      if (choice.reason) {
        var reason = document.createElement("small");
        reason.textContent = choice.reason;
        button.appendChild(reason);
      }
      button.addEventListener("click", function () {
        applySmartChoice(it, dimension, result, choice.id, dlg);
      });
      dlg.body.appendChild(button);
    });
    var cancel = document.createElement("button");
    cancel.textContent = t("cfg_keep_size");
    cancel.addEventListener("click", function () {
      cancelPending();
      writeFieldLength(input, it[{ width: "w", depth: "d", height: "h" }[dimension]]);
      dlg.close();
    });
    dlg.actions.appendChild(cancel);
  }
  function bindSmartDimension(id, dimension) {
    var input = document.getElementById(id);
    /* `live` is a scrub tick from the mobile dimension dial (js/ui_dim_knob.js),
       not a finished edit. It applies whatever the model accepts outright and
       says nothing otherwise: a proposal dialog or an error toast belongs to
       the moment the finger lifts, not to the middle of a drag — and the dial
       ends every gesture with a real blur, so both still get their say. */
    function validateDimension(event) {
      if (!S.sel || S.sel.kind !== "item") return;
      var live = !!event && event.type === "mf-scrub";
      var it = S.sel.ref, value = parseFieldLength(this.value);
      var field = { width: "w", depth: "d", height: "h" }[dimension];
      if (!Number.isFinite(value) || Math.abs(value - it[field]) < 0.0001) return;
      var result = it.cab
        ? requestCabinetDimension(it, dimension, value, ceilingHeight())
        : requestItemDimension(S, it, dimension, value, FURN[it.type] || {});
      if (result.status === "applied") applySmartChoice(it, dimension, result, null, null);
      else if (live) return;
      else if (result.status === "proposal") showSmartProposal(it, dimension, result, this);
      else {
        cancelPending();
        writeFieldLength(this, it[{ width: "w", depth: "d", height: "h" }[dimension]]);
        flash(result.message || "That dimension cannot be changed", "error");
      }
    }
    input.addEventListener("blur", validateDimension);
    input.addEventListener("mf-scrub", validateDimension);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); this.blur(); }
    });
  }
  bindSmartDimension("i_w", "width");
  bindSmartDimension("i_d", "depth");
  bindSmartDimension("i_h", "height");
  // rotation is pure transform -> nothing is regenerated at all
  bindNum("i_rot", function (v) {
    if (S.sel.kind === "item") {
      turnItem(S.sel.ref, ((v % 360) + 360) % 360);
      document.getElementById("i_rot_range").value = S.sel.ref.rot;
    }
  }, "move");
  bindNum("i_rot_range", function (v) {
    if (S.sel.kind === "item") {
      turnItem(S.sel.ref, ((v % 360) + 360) % 360);
      document.getElementById("i_rot").value = S.sel.ref.rot;
    }
  }, "move");
  // style/finish variant of the selected piece
  document.getElementById("i_variant").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "item") return;
    pushHistory();
    S.sel.ref.variant = this.value;
    clearVSpanCache(); // a shape variant changes how high the piece reaches
    restack(S.sel.ref);
    touchItem3D(S.sel.ref, "build");
    render2D();
  });
  function syncPaired(firstOp) {
    if (!firstOp.paired) return;
    var w1 = S.walls.find(function(w) { return w.id === firstOp.wall; });
    if (!w1) return;
    var g1 = wallGeom(w1);
    var px = g1.a.x + g1.ux * firstOp.s;
    var pz = g1.a.z + g1.uz * firstOp.s;
    firstOp.paired.forEach(function(oid) {
      if (oid === firstOp.id) return;
      var op = S.openings.find(function(o) { return o.id === oid; });
      if (!op) return;
      var w2 = S.walls.find(function(w) { return w.id === op.wall; });
      if (!w2) return;
      var g2 = wallGeom(w2);
      op.width = firstOp.width;
      op.height = firstOp.height;
      op.sill = firstOp.sill;
      op.s = (px - g2.a.x) * g2.ux + (pz - g2.a.z) * g2.uz;
    });
  }

  bindLength("o_w", function (v) {
    if (S.sel.kind === "opening") {
      var oldWidth = S.sel.ref.width || 1;
      S.sel.ref.width = Math.max(20, Math.min(600, v));
      if (S.sel.ref.isDouble) {
        var share = Math.max(0.15, Math.min(0.85, (Number(S.sel.ref.leafA) || oldWidth / 2) / oldWidth));
        S.sel.ref.leafA = S.sel.ref.width * share;
        S.sel.ref.leafB = S.sel.ref.width - S.sel.ref.leafA;
      }
      syncPaired(S.sel.ref);
      return S.sel.ref.width;
    }
  });
  bindLength("o_h", function (v) {
    if (S.sel.kind === "opening") {
      S.sel.ref.height = Math.max(20, Math.min(400, v));
      syncPaired(S.sel.ref);
      return S.sel.ref.height;
    }
  });
  bindLength("o_sill", function (v) {
    if (S.sel.kind === "opening") {
      S.sel.ref.sill = Math.max(0, Math.min(300, v));
      syncPaired(S.sel.ref);
    }
  });
  /* Frame / mullion profile. Each field writes one optional property on the
     opening; frameSpec() in view3d.js supplies the default when it is absent,
     so a scene saved before this existed still builds the old frame. */
  function bindFrame(id, prop, lo, hi, round) {
    bindLength(id, function (v) {
      if (!S.sel || S.sel.kind !== "opening") return;
      var o = S.sel.ref;
      v = Math.max(lo, Math.min(hi, round ? Math.round(v) : v));
      o[prop] = v;
      syncPaired(o);
      (o.paired || []).forEach(function (oid) {
        var op = S.openings.find(function (x) { return x.id === oid; });
        if (op) op[prop] = v;
      });
      return v;
    });
  }
  bindFrame("o_fr_jamb", "frJamb", 0, 30);
  bindFrame("o_fr_head", "frHead", 0, 30);
  bindFrame("o_fr_sillw", "frSillW", 0, 30);
  bindFrame("o_fr_depth", "frDepth", 0, 20);
  bindFrame("o_fr_mull", "frMull", 0, 20);
  bindFrame("o_fr_mullv", "frMullV", 0, 12, true);
  bindFrame("o_fr_mullh", "frMullH", 0, 12, true);

  bindLength("o_m_l", function(v) {
    if (S.sel.kind === "opening" && S.sel.ref.overlapL != null) {
      var o = S.sel.ref;
      var currentRight = (o.overlapCenter + o.overlapL/2) - (o.s + o.width/2);
      v = Math.max(0, Math.min(o.overlapL - 20 - currentRight, v));
      var newW = o.overlapL - v - currentRight;
      var newS = o.overlapCenter - o.overlapL/2 + v + newW/2;
      o.width = newW; o.s = newS;
      syncPaired(o);
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  });
  bindLength("o_m_r", function(v) {
    if (S.sel.kind === "opening" && S.sel.ref.overlapL != null) {
      var o = S.sel.ref;
      var currentLeft = (o.s - o.width/2) - (o.overlapCenter - o.overlapL/2);
      v = Math.max(0, Math.min(o.overlapL - 20 - currentLeft, v));
      var newW = o.overlapL - currentLeft - v;
      var newS = o.overlapCenter + o.overlapL/2 - v - newW/2;
      o.width = newW; o.s = newS;
      syncPaired(o);
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  });
  bindLength("o_m_b", function(v) {
    if (S.sel.kind === "opening") {
      S.sel.ref.sill = Math.max(0, v);
      syncPaired(S.sel.ref);
      S.dirty3D = true;
      render2D();
      fillProps();
    }
  });
  bindLength("o_m_t", function(v) {
    if (S.sel.kind === "opening") {
      var w = S.walls.find(function(wa) { return wa.id === S.sel.ref.wall; });
      if (w) {
        S.sel.ref.height = Math.max(20, w.height - S.sel.ref.sill - v);
        syncPaired(S.sel.ref);
        S.dirty3D = true;
        render2D();
        fillProps();
      }
    }
  });

  // room name / floor / wall color
  // The command owns history; ordinary bindNum would create a second checkpoint.
  const resizeInspectorRoom = (width, depth) => {
    if (!S.sel || S.sel.kind !== "room") return;
    resizeSelectedRoom({roomKey:S.sel.ref, width, depth});
    // Also restore the accepted values after a refusal or invalid input.
    fillProps();
  };
  for (const [id, axis] of [["r_w", "width"], ["r_d", "depth"]]) {
    document.getElementById(id).addEventListener("change", function () {
      if (!S.sel || S.sel.kind !== "room") return;
      const size = roomMeasurements(S, roomByKey(S.sel.ref))?.interior;
      if (!size) return;
      const value = this.value.trim() === "" ? NaN : parseFieldLength(this.value, id);
      resizeInspectorRoom(axis === "width" ? value : size.width,
        axis === "depth" ? value : size.depth);
    });
  }
  const bindNudgeBtn = (id, deltaW, deltaD) => {
    document.getElementById(id)?.addEventListener("click", () => {
      if (!S.sel || S.sel.kind !== "room") return;
      const size = roomMeasurements(S, roomByKey(S.sel.ref))?.interior;
      if (size) resizeInspectorRoom(size.width + deltaW, size.depth + deltaD);
    });
  };
  bindNudgeBtn("r_w_down", -10, 0);
  bindNudgeBtn("r_w_up", 10, 0);
  bindNudgeBtn("r_d_down", 0, -10);
  bindNudgeBtn("r_d_up", 0, 10);
  document.getElementById("r_name").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.name = this.value;
    render2D();
  });
  document.getElementById("r_floor").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "room") return;
    applyRoomFloor(S.sel.ref, this.value);
  });
  var floorPickBtn = document.getElementById("r_floor_pick");
  if (floorPickBtn)
    floorPickBtn.addEventListener("click", function () {
      runAction("roomFloor");
    });
  document.getElementById("r_floor_scale").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.floorScale = parseFloat(this.value);
    S.dirty3D = true;
  });
  document.getElementById("r_floor_bump").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    var val = parseFloat(this.value) / 100;
    m.floorBump = val;
    var lbl = document.getElementById("r_floor_bump_val");
    if (lbl) lbl.textContent = Math.round(val * 100) + "%";
    S.dirty3D = true;
  });
  var currentTexTarget = null;
  document.getElementById("r_wall").addEventListener("input", function () {
    var m = roomMetaFor();
    if (!m) return;
    commitPending();
    m.wall = parseInt(this.value.slice(1), 16);
    S.dirty3D = true;
  });

  // global wall color
  document.getElementById("wallcol").addEventListener("input", function () {
    commitPending();
    S.wallColor = parseInt(this.value.slice(1), 16);
    S.dirty3D = true;
  });

  // per-fixture light controls
  document.getElementById("l_on").addEventListener("change", function () {
    var it = selLamp();
    if (!it) return;
    pushHistory();
    it.lightOn = this.checked;
    syncSmartFromLamp(it);
    touchItem3D(it, "build");
    pushDevice(it, { on: this.checked });
  });
  document.getElementById("l_int").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.lightI = parseFloat(this.value);
    syncSmartFromLamp(it);
    document.getElementById("l_intval").textContent =
      Math.round(it.lightI * 100) + "%";
    touchItem3D(it, "build");
    pushDevice(it, { brightness: it.smart ? it.smart.brightness : Math.round(it.lightI * 100) });
  });
  document.getElementById("l_col").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.lightColor = parseInt(this.value.slice(1), 16);
    syncSmartFromLamp(it);
    touchItem3D(it, "build");
    pushDevice(it, { color: this.value });
  });
  
  document.getElementById("l_type").addEventListener("change", function () {
    var it = selLamp();
    if (!it) return;
    pushHistory();
    it.spot = this.value === "spot";
    fillProps();
    touchItem3D(it, "build");
  });
  document.getElementById("l_cone").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.cone = parseFloat(this.value);
    touchItem3D(it, "build");
  });
  document.getElementById("l_pitch").addEventListener("input", function () {
    var it = selLamp();
    if (!it) return;
    commitPending();
    it.pitch = parseFloat(this.value);
    touchItem3D(it, "build");
  });
  
  document.getElementById("o_type_sel").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.isSliding = this.value === "sliding";
    S.sel.ref.isPocket = this.value === "pocket";
    S.sel.ref.isDouble = this.value === "double";
    if (S.sel.ref.isDouble) {
      S.sel.ref.leafA = Number(S.sel.ref.leafA) || S.sel.ref.width / 2;
      S.sel.ref.leafB = S.sel.ref.width - S.sel.ref.leafA;
    }
    fillProps();
    S.dirty3D = true;
    render2D();
  });
  document.getElementById("o_mat").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.mat = this.value;
    fillProps();
    S.dirty3D = true;
  });
  document.getElementById("o_col").addEventListener("input", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    commitPending();
    S.sel.ref.color = this.value;
    S.dirty3D = true;
  });
  document.getElementById("o_swing_dir").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.swingDir = this.value;
    fillProps();
    S.dirty3D = true;
    render2D();
  });
  document.querySelectorAll("#o_swing_grid [data-swing]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (!S.sel || S.sel.kind !== "opening") return;
      pushHistory();
      S.sel.ref.swingDir = button.dataset.swing;
      fillProps();
      S.dirty3D = true;
      render2D();
    });
  });
  function setDoorLeaf(which, value) {
    if (!S.sel || S.sel.kind !== "opening" || !S.sel.ref.isDouble) return;
    var o = S.sel.ref, minLeaf = Math.min(20, o.width / 2);
    value = Math.max(minLeaf, Math.min(o.width - minLeaf, value));
    o.leafA = which === "a" ? value : o.width - value;
    o.leafB = o.width - o.leafA;
    return which === "a" ? o.leafA : o.leafB;
  }
  bindLength("o_leaf_a", function (v) { return setDoorLeaf("a", v); });
  bindLength("o_leaf_b", function (v) { return setDoorLeaf("b", v); });
  document.getElementById("o_slide_dir").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "opening") return;
    pushHistory();
    S.sel.ref.slideDir = this.value;
    S.dirty3D = true;
    render2D();
  });

  var texInput = document.getElementById("texInput");
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

  // history: snapshot before a continuous edit (commit on first change, cancel if untouched)
  [
    "w_len",
    "w_ang",
    "w_th",
    "w_h",
    "w_split_h",
    "w_bulge",
    "w_top_a",
    "w_top_b",
    "w_base_a",
    "w_base_b",
    "i_w",
    "i_d",
    "i_h",
    "i_rot",
    "i_rot_range",
    "o_w",
    "o_h",
    "o_sill",
    "o_leaf_a",
    "o_leaf_b",
    "o_fr_jamb",
    "o_fr_head",
    "o_fr_sillw",
    "o_fr_depth",
    "o_fr_mull",
    "o_fr_mullv",
    "o_fr_mullh",
    "r_name",
    "r_wall",
    "mk_x",
    "mk_y",
    "mk_z",
    "mk_name",
    "mk_req",
    "mk_note",
    "sv_x",
    "sv_z",
    "sv_w",
    "sv_d",
    "sv_rot",
    "sv_name",
    "nd_x",
    "nd_z",
    "l_int",
    "l_col",
    "l_cone",
    "l_pitch",
    "o_col",
  ].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("focus", beginHistory);
    el.addEventListener("blur", cancelPending);
  });

  // manual "open segment" controls (live preview while a wall is selected)
  function updSeg() {
    if (!S.sel || S.sel.kind !== "wall") {
      S.segPreview = null;
      return;
    }
    var pos = parseFloat(document.getElementById("ow_pos").value) || 0,
      w = parseLen(document.getElementById("ow_w").value) || 0,
      h = parseLen(document.getElementById("ow_h").value) || 0;
    document.getElementById("ow_posval").textContent = fmtLen(pos);
    S.segPreview = { s: pos, width: w, height: h };
    render2D();
  }
  document.getElementById("ow_pos").addEventListener("input", updSeg);
  document.getElementById("ow_w").addEventListener("input", updSeg);
  document.getElementById("ow_h").addEventListener("input", updSeg);

  // tools
  document.querySelectorAll(".tool").forEach(function (b) {
    // the toolbar also holds toggles (the structure lock) that share the .tool
    // chrome but are actions, not tools — those go through runAction instead
    if (!b.getAttribute("data-tool")) return;
    b.addEventListener("click", function () {
      setTool(b.getAttribute("data-tool"));
    });
  });

  function applyToolNames(on) {
    var bar = document.getElementById("plan-toolbar");
    var btn = document.getElementById("toolNamesToggle");
    if (bar) bar.classList.toggle("show-titles", !!on);
    if (btn) {
      btn.classList.toggle("active", !!on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
    window.dispatchEvent(new Event("resize"));
  }
  function toggleToolNames() {
    var bar = document.getElementById("plan-toolbar");
    var on = bar ? !bar.classList.contains("show-titles") : true;
    applyToolNames(on);
    try { localStorage.setItem("mf_tool_titles", on ? "1" : "0"); } catch (_) {}
  }
  function initToolNames() {
    var on = true;
    try { on = localStorage.getItem("mf_tool_titles") !== "0"; } catch (_) {}
    applyToolNames(on);
  }
  window.__toggleToolNames = toggleToolNames;
  initToolNames();

  /* Keep the command strip scrollable, with navigation outside its viewport.
     Sticky buttons inside a scrolling toolbar covered real commands. */
  function initToolScroll() {
    var bar = document.getElementById('plan-toolbar');
    var names = document.getElementById('toolNamesToggle');
    if (!bar || !names || bar.querySelector('.tool-scroll')) return;
    var strip = document.createElement('div');
    strip.className = 'tool-command-strip';
    Array.from(bar.childNodes).forEach(function (node) {
      if (node !== names) strip.appendChild(node);
    });
    bar.insertBefore(strip, names);
    function arrow(kind, icon, key) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool-scroll tool-scroll-' + kind;
      b.setAttribute('aria-label', t(key));
      b.title = t(key);
      var glyph = document.createElement('i');
      glyph.className = 'ph ph-' + icon;
      glyph.setAttribute('aria-hidden', 'true');
      b.appendChild(glyph);
      return b;
    }
    var prev = arrow('prev', 'caret-left', 'tool_scroll_prev');
    var next = arrow('next', 'caret-right', 'tool_scroll_next');
    bar.insertBefore(prev, strip);
    bar.insertBefore(next, names);
    var lastWidth = 0, lastHost = '';
    function revealSelected() {
      var selected = bar.querySelector('button.tool.active[data-tool]');
      if (!selected) return;
      var outer = strip.getBoundingClientRect(), inner = selected.getBoundingClientRect();
      if (inner.left < outer.left || inner.right > outer.right) {
        selected.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
      }
    }
    function sync() {
      var overflow = bar.dataset.axis === 'h' && strip.scrollWidth > strip.clientWidth + 3;
      prev.hidden = next.hidden = !overflow;
      var host = bar.closest('#view-2d') ? '2d' : '3d';
      if (strip.clientWidth !== lastWidth || host !== lastHost) {
        lastWidth = strip.clientWidth; lastHost = host;
        requestAnimationFrame(revealSelected);
      }
      if (!overflow) return;
      var dir = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
      var progress = Math.max(0, strip.scrollLeft * dir);
      var max = strip.scrollWidth - strip.clientWidth;
      prev.disabled = progress <= 2;
      next.disabled = progress >= max - 2;
    }
    prev.addEventListener('click', function () {
      var dir = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
      strip.scrollBy({ left: -dir * Math.max(160, strip.clientWidth * .62), behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      var dir = getComputedStyle(strip).direction === 'rtl' ? -1 : 1;
      strip.scrollBy({ left: dir * Math.max(160, strip.clientWidth * .62), behavior: 'smooth' });
    });
    strip.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('planner-tool', function () { requestAnimationFrame(revealSelected); });
    window.addEventListener('planner-viewport', function () { requestAnimationFrame(revealSelected); });
    window.addEventListener('resize', function () { requestAnimationFrame(sync); });
    if (window.ResizeObserver) {
      var observer = new ResizeObserver(sync);
      observer.observe(bar);
      observer.observe(strip);
    }
    onLangChange(function () {
      prev.setAttribute('aria-label', t('tool_scroll_prev'));
      prev.title = t('tool_scroll_prev');
      next.setAttribute('aria-label', t('tool_scroll_next'));
      next.title = t('tool_scroll_next');
      requestAnimationFrame(sync);
    });
    requestAnimationFrame(sync);
  }
  initToolScroll();

  function syncWallDrawPalette() {
    var pal = document.getElementById("plan-wall-palette");
    if (!pal) return;
    var wasHidden = pal.hidden;
    pal.hidden = !isWallDrawTool(S.tool);
    // A newly chosen wall tool opens its choices. Once placement begins the
    // palette compacts to one reveal button so it no longer covers the draw.
    if (wasHidden && !pal.hidden) pal.classList.remove("auto-collapsed");
    var collapse = document.getElementById("wallPaletteToggle");
    if (collapse) {
      var expanded = !pal.classList.contains("auto-collapsed");
      collapse.setAttribute("aria-expanded", expanded ? "true" : "false");
      collapse.title = t(expanded ? "wd_collapse" : "wd_expand");
      collapse.setAttribute("aria-label", collapse.title);
      var ci = collapse.querySelector("i");
      if (ci) ci.className = expanded ? "ph ph-caret-left" : "ph ph-sliders-horizontal";
    }
    // These are icon-only toggles whose meaning lives in a `title` tooltip —
    // which touch devices and screen readers never surface. State the choice
    // through aria-pressed and carry the tooltip over as the accessible name.
    var preset = activeWallPresetId();
    pal.querySelectorAll("[data-wall-preset]").forEach(function (b) {
      var on = b.getAttribute("data-wall-preset") === preset;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (!b.getAttribute("aria-label") && b.title) b.setAttribute("aria-label", b.title);
    });
    var from = (S.wallDrawDefaults && S.wallDrawDefaults.from) || "center";
    pal.querySelectorAll("[data-wall-from]").forEach(function (b) {
      var on = b.getAttribute("data-wall-from") === from;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    pal.querySelectorAll(".wd-choice-select").forEach(function (select) {
      select.querySelectorAll("option").forEach(function (option) {
        option.textContent = t(option.dataset.labelKey);
      });
      select.value = select.dataset.choice === "preset" ? preset : from;
      select.setAttribute("aria-label", t(select.dataset.choice === "preset" ? "wd_types" : "wd_from"));
    });
  }
  var pal = document.getElementById("plan-wall-palette");
  if (pal) {
    // Desktop ribbon uses named choices; touch layouts keep the visual buttons.
    [[".wd-types", "data-wall-preset", "preset"], [".wd-loc", "data-wall-from", "from"]].forEach(function (spec) {
      var group = pal.querySelector(spec[0]);
      if (!group) return;
      var select = document.createElement("select");
      select.className = "wd-choice-select";
      select.dataset.choice = spec[2];
      group.querySelectorAll("button").forEach(function (button) {
        var option = document.createElement("option");
        option.value = button.getAttribute(spec[1]);
        option.dataset.labelKey = button.dataset.i18nTitle || button.dataset.i18nAria;
        select.appendChild(option);
      });
      group.after(select);
      select.addEventListener("change", function () {
        if (spec[2] === "preset") setWallDrawPreset(select.value);
        else setWallDrawFrom(select.value);
        syncWallDrawPalette();
        render2D();
      });
    });
    pal.addEventListener("click", function (e) {
      var collapseBtn = e.target.closest("#wallPaletteToggle");
      if (collapseBtn) {
        pal.classList.toggle("auto-collapsed");
        syncWallDrawPalette();
        return;
      }
      var presetBtn = e.target.closest("[data-wall-preset]");
      if (presetBtn) {
        setWallDrawPreset(presetBtn.getAttribute("data-wall-preset"));
        if (!isWallDrawTool(S.tool)) setTool("wall");
        syncWallDrawPalette();
        render2D();
        return;
      }
      var fromBtn = e.target.closest("[data-wall-from]");
      if (fromBtn) {
        setWallDrawFrom(fromBtn.getAttribute("data-wall-from"));
        syncWallDrawPalette();
        render2D();
      }
    });
  }
  window.addEventListener("planner-tool", syncWallDrawPalette);
  window.addEventListener("planner-draw-defaults", syncWallDrawPalette);
  window.addEventListener("planner-draw-start", function () {
    if (pal && !pal.hidden && !pal.closest('.pt-zone[data-zone="top"]')) {
      pal.classList.add("auto-collapsed");
      syncWallDrawPalette();
    }
  });
  onLangChange(syncWallDrawPalette);
  syncWallDrawPalette();

  // display controls
  document.querySelectorAll("[data-plan-style]").forEach(function (b) {
    b.addEventListener("click", function () {
      setPlanStyle(b.getAttribute("data-plan-style"));
    });
  });
  syncPlanStyleUI();
  var cbCut = document.getElementById("cb_cutaway");
  if (cbCut)
    cbCut.addEventListener("change", function () {
      setCutaway({ on: this.checked });
    });
  var cutHIn = document.getElementById("cutawayH");
  if (cutHIn)
    cutHIn.addEventListener("input", function () {
      setCutaway({ height: Number(this.value) });
    });
  document.querySelectorAll("[data-cut-cap]").forEach(function (b) {
    b.addEventListener("click", function () {
      setCutaway({ cap: b.getAttribute("data-cut-cap") });
    });
  });
  syncCutawayUI();
  document.getElementById("cb_dims").addEventListener("change", function () {
    S.showDims = this.checked;
    render2D();
  });
  /* Interior vs centreline dimensions. Switching INTO interior mode re-reads
     every wall's current inside span as its intent, so nothing jumps the moment
     the box is ticked — the geometry only moves on the next edit. */
  var cbInterior = document.getElementById("cb_interior");
  if (cbInterior)
    cbInterior.addEventListener("change", function () {
      S.interiorDims = this.checked;
      if (S.interiorDims) S.walls.forEach(captureClear);
      render2D();
      fillProps();
    });
  document.querySelectorAll(".snap-toggle").forEach(function (cb) {
    cb.addEventListener("change", function () {
      S.snapObj = this.checked;
      document.querySelectorAll(".snap-toggle").forEach(function (other) {
        other.checked = S.snapObj;
      });
    });
  });
  /* Automatic facing (js/item_orient.js). Same shape as the snap toggle it
     sits next to, because it is the same kind of promise: the editor may help
     while you drag, and this is the switch that stops it. */
  document.querySelectorAll(".face-toggle").forEach(function (cb) {
    cb.checked = S.autoFace !== false;
    cb.addEventListener("change", function () {
      S.autoFace = this.checked;
      document.querySelectorAll(".face-toggle").forEach(function (other) {
        other.checked = S.autoFace;
      });
    });
  });
  syncRotStepUI();
  document.getElementById("cb_invisible_roof").addEventListener("change", function () {
    S.invisibleRoof = this.checked;
    S.dirty3D = true;
    window.dispatchEvent(new Event("planner-navigation-restored"));
  });
  document.getElementById("cb_ceil").addEventListener("change", function () {
    S.showCeiling = this.checked;
    S.dirty3D = true;
  });
  document.getElementById("floorsel").addEventListener("change", function () {
    S.floorTex = this.value;
    S.dirty3D = true;
    render2D();
  });

  // environment (sun updates live, no full rebuild)
  document.getElementById("hour").addEventListener("input", function () {
    S.hour = parseFloat(this.value);
    document.getElementById("hourval").textContent = fmtHour(S.hour);
    applyEnv();
  });
  document.getElementById("north").addEventListener("input", function () {
    S.northAngle = parseFloat(this.value);
    document.getElementById("northval").textContent = compass(S.northAngle);
    applyEnv();
    render2D();
  });

  // placeholder-point inspector: position (carries the object standing on it)
  // and a free-text name for the plan label
  bindLength("mk_x", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, v, S.sel.ref.y, S.sel.ref.z);
    refreshMarkerReadout();
  });
  bindLength("mk_y", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, S.sel.ref.x, Math.max(0, v), S.sel.ref.z);
    refreshMarkerReadout();
  });
  bindLength("mk_z", function (v) {
    if (!S.sel || S.sel.kind !== "marker") return;
    moveMarker(S.sel.ref, S.sel.ref.x, S.sel.ref.y, v);
    refreshMarkerReadout();
  });
  var mkSurf = document.getElementById("mk_surface");
  if (mkSurf)
    mkSurf.addEventListener("change", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      pushHistory();
      setMarkerSurface(S.sel.ref, this.value);
      S.dirty3D = true;
      refreshMarkerReadout();
      refreshTree();
      render2D();
    });
  /* The selected dimension's own value. `change` rather than `input`, unlike
     the geometry fields: every keystroke here re-solves the whole constraint
     set and moves corners, so typing "240" would drag the plan to 2 cm and
     then to 24 cm on the way. */
  document.getElementById("con_value").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    var unit = conUnit(S.sel.ref);
    var v = unit === "deg" ? parseFloat(this.value) : parseLen(this.value, "plan");
    if (!Number.isFinite(v)) return;
    pushHistory();
    setConValue(S.sel.ref.id, v);
    var r = solveWallCons();
    if (r.unresolved) flash(t("wc_unresolved", { n: r.unresolved }), "error");
    fillProps();
    refreshTree();
    renderWarnPanel(true);
  });

  /* Report and suppress are the two ways to stop a dimension driving, and they
     are different: a suppressed dimension is switched off, a reference one is
     still measured and still shown — it simply has no say in where the
     geometry goes. */
  document.getElementById("con_report").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    pushHistory();
    setConReport(S.sel.ref.id, this.checked);
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); renderWarnPanel(true);
  });
  document.getElementById("con_off").addEventListener("change", function () {
    if (!S.sel || S.sel.kind !== "con") return;
    pushHistory();
    setConSuppressed(S.sel.ref.id, this.checked);
    solveWallCons();
    S.dirty3D = true;
    fillProps(); render2D(); renderWarnPanel(true);
  });

  /* Typing a corner's coordinates moves the junction itself, so every wall
     meeting it follows — the keyboard equivalent of dragging the bare corner,
     including the re-capture of what those walls now measure. */
  function moveJoint(x, z) {
    if (!S.sel || S.sel.kind !== "node") return;
    var n = S.nodes[S.sel.ref];
    if (!n) return;
    commitPending();
    if (fin(x)) n.x = x;
    if (fin(z)) n.z = z;
    solveWallCons();
    S.walls.forEach(function (w) {
      if (w.a !== S.sel.ref && w.b !== S.sel.ref) return;
      captureLock(w);
      captureClear(w);
    });
    S.dirty3D = true;
    fillProps();
  }
  bindLength("nd_x", function (v) {
    moveJoint(v, null);
  });
  bindLength("nd_z", function (v) {
    moveJoint(null, v);
  });

  /* The point's brief: how much clear space this spot is supposed to keep, and
     a free-text note about what it is for. Neither moves anything — they change
     what the readouts (and the plan's hover card) say about the spot, which is
     the whole job of a placeholder. An empty required-clearance field means
     "no requirement", so it is cleared rather than parsed as 0. */
  var mkReq = document.getElementById("mk_req");
  if (mkReq)
    mkReq.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      var v = parseLen(this.value);
      S.sel.ref.req = this.value === "" || !Number.isFinite(v) ? null : Math.max(0, v);
      refreshMarkerReadout();
      render2D();
    });
  var mkNote = document.getElementById("mk_note");
  if (mkNote)
    mkNote.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      S.sel.ref.note = this.value.slice(0, 80);
      render2D();
    });
  var mkName = document.getElementById("mk_name");
  if (mkName)
    mkName.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "marker") return;
      commitPending();
      S.sel.ref.name = this.value.slice(0, 24);
      refreshMarkerReadout();
      refreshTree();
      render2D();
    });

  bindLength("sv_x", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.x = v;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
  });
  bindLength("sv_z", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.z = v;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
  });
  bindLength("sv_w", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.w = Math.max(40, v);
    return S.sel.ref.w;
  });
  bindLength("sv_d", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.d = Math.max(40, v);
    return S.sel.ref.d;
  });
  bindNum("sv_rot", function (v) {
    if (!S.sel || S.sel.kind !== "slabvoid") return;
    S.sel.ref.rot = ((v % 360) + 360) % 360;
    broadcastPlanOp({ type: "slabMove", id: S.sel.ref.id, x: S.sel.ref.x, z: S.sel.ref.z, rot: S.sel.ref.rot });
    return S.sel.ref.rot;
  });
  var svName = document.getElementById("sv_name");
  if (svName)
    svName.addEventListener("input", function () {
      if (!S.sel || S.sel.kind !== "slabvoid") return;
      commitPending();
      S.sel.ref.name = this.value.slice(0, 32);
      document.getElementById("selname_sv").textContent = S.sel.ref.name || t("sv_title");
      refreshTree();
      render2D();
    });

  var addfurnBtn = document.getElementById("addfurn");
  if (addfurnBtn) {
    addfurnBtn.addEventListener("click", function () {
      var type = document.getElementById("furnsel").value;
      addFurnItem(type);
    });
  }

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

  // Mobile drawer toggles
  document.getElementById("toggle-left") &&
    document
      .getElementById("toggle-left")
      .addEventListener("click", function (e) {
        document.body.classList.toggle("show-left");
        document.body.classList.remove("show-right");
        syncNavPanels();
      });
  document.getElementById("toggle-right") &&
    document
      .getElementById("toggle-right")
      .addEventListener("click", function (e) {
        document.body.classList.toggle("show-right");
        document.body.classList.remove("show-left");
        syncNavPanels();
      });
  document.getElementById("center-canvas") &&
    document
      .getElementById("center-canvas")
      .addEventListener("click", function (e) {
        /* The hidden tool rail lives inside the canvas, and the fold rail and
           the pro catalog run tools by clicking its buttons: that is a command,
           not a tap on the plan, so it must not close the docked panels. */
        if (e.target && e.target.closest && e.target.closest("#plan-toolbar")) return;
        document.body.classList.remove("show-left");
        document.body.classList.remove("show-right");
        syncNavPanels();
      });

  // Mobile bottom nav + backdrop
  function closeDrawers() {
    document.body.classList.remove("show-left", "show-right");
    syncNavPanels();
  }
  /* The nav's two panel buttons are toggles, so they have to read as pressed
     while their drawer is open — otherwise the only way to tell whether a tap
     landed is to look for the drawer that is covering the screen anyway. The
     three view buttons are highlighted from main.js (syncMobileNav). */
  function syncNavPanels() {
    var b = document.body;
    document.querySelectorAll("#mobile-nav [data-mnav]").forEach(function (el) {
      var k = el.dataset.mnav;
      if (k !== "left" && k !== "right") return;
      var open = b.classList.contains(k === "left" ? "show-left" : "show-right");
      el.classList.toggle("active", open);
      el.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  var backdrop = document.getElementById("drawer-backdrop");
  backdrop && backdrop.addEventListener("click", closeDrawers);

  /* Swipe a drawer back off the edge it came from. The backdrop tap already
     closes it, but on a phone the drawer covers most of the screen and the
     sliver of backdrop left over is a poor target — the gesture is the one
     that needs no aiming. Direction is per-drawer and mirrored for RTL, so
     "away from the edge it is anchored to" always means the same thing. */
  ["left-sidebar", "right-inspector"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var sx = 0,
      sy = 0,
      live = false;
    el.addEventListener(
      "touchstart",
      function (e) {
        live = e.touches.length === 1;
        if (!live) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true },
    );
    el.addEventListener(
      "touchmove",
      function (e) {
        if (!live || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - sx,
          dy = e.touches[0].clientY - sy;
        // A mostly-vertical drag is the panel's own scroll; leave it alone.
        if (Math.abs(dy) > Math.abs(dx)) {
          live = false;
          return;
        }
        var rtl = document.documentElement.dir === "rtl";
        var outward = id === "left-sidebar" ? (rtl ? 1 : -1) : rtl ? -1 : 1;
        if (dx * outward > 70) {
          live = false;
          closeDrawers();
        }
      },
      { passive: true },
    );
    el.addEventListener("touchend", function () {
      live = false;
    });
  });

  /* The bottom nav itself is owned by js/mobile_shell.js (View / Tools / Add /
     Properties / More, each opening a sheet). Only the drawer plumbing above —
     backdrop tap, outward swipe, closeDrawers — is still shared with it. */
  syncNavPanels();

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
  window.addEventListener("resize", applyCompactNav);
  applyCompactNav();

  // Galaxy Fold (and other foldables): when the app spans both halves of an
  // unfolded screen, tag the body so CSS can lay the 2D/3D panes side by side
  // across the hinge instead of stacking them over it. Two postures, opposite
  // answers: a vertical crease (side-by-side segments) wants the panes in a
  // row so the seam falls between them; a horizontal crease (a laptop-style
  // half-open book) wants them stacked, for the same reason.
  function foldMq(list) {
    return list
      .map(function (q) {
        try {
          return window.matchMedia(q);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  }
  var vFoldQueries = foldMq([
    "(horizontal-viewport-segments: 2)",
    "(screen-spanning: single-fold-vertical)",
  ]);
  var hFoldQueries = foldMq([
    "(vertical-viewport-segments: 2)",
    "(screen-spanning: single-fold-horizontal)",
  ]);
  function anyMatch(qs) {
    return qs.some(function (mq) {
      return mq.matches;
    });
  }
  function applyFoldSpan() {
    document.body.classList.toggle("fold-span", anyMatch(vFoldQueries));
    document.body.classList.toggle("fold-stack", anyMatch(hFoldQueries));
  }
  vFoldQueries.concat(hFoldQueries).forEach(function (mq) {
    mq.addEventListener
      ? mq.addEventListener("change", applyFoldSpan)
      : mq.addListener(applyFoldSpan);
  });
  applyFoldSpan();

  // Topbar dropdown menus (File / Edit / Export / More). Portaled to <body>
  // because the glass topbar's backdrop-filter would clip a position:fixed
  // child. Open/close/pin/path live in js/dropdown_menus.js so customize-mode
  // pinning and nested submenus cannot drift from a click on a trigger.
  initDropdownMenus(document, {
    onAction: function (act) { runAction(act); },
    selectionKind: function () { return S.sel ? S.sel.kind : null; },
  });

  // Collapsible panel sections (click header to fold)
  document.querySelectorAll(".panel-section > h3").forEach(function (h) {
    h.addEventListener("click", function () {
      h.parentElement.classList.toggle("collapsed");
    });
  });
  // constraint-engine warning list (js/ui_warn.js)
  initWarnPanel();
  renderParams(); // the plan-parameter list is generated, like the warning list
  // the edit tree (js/ui_history.js), scoped to whatever is selected
  mountHistoryPanel(document.getElementById("planHist"));

  function handleActionClick(e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
    if (!act) {
      // try parent
      var p = e.target.closest("button");
      if (p) act = p.getAttribute("data-act");
      if (!act) return;
    }
    runAction(act, e); // the click itself, so an action can read its modifiers
  }

  // Single dispatch point for every named action. Menus, toolbar buttons and
  // keyboard shortcuts all funnel through here, so a shortcut can never drift
  // from what the matching menu item does.
  /* One dispatch point, one global handle. js/mobile_shell.js builds its rows
     at runtime and cannot use the delegated [data-act] listeners bound to the
     static chrome, so it calls in here instead of duplicating any behaviour. */
  window.__runAction = runAction;
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
