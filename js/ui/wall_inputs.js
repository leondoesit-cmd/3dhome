/* The planner's walk-mode toggles and wall, item and room property inputs,
   lifted out of initUI, split out of js/ui/init_ui.js. It shares the editor's
   state through live imports from ../ui.js. */
import { hangStraightRunOnFace, setWallReference, setWallThicknessPreservingClear, snapshotNodes } from "../constraint_engine.js";
import { applyItemDimension, requestItemDimension } from "../core/project.js";
import { parseLen } from "../display_units.js";
import { ceilingHeight } from "../elevation.js";
import { FURN, clearVSpanCache } from "../furniture.js";
import { roomByKey, setWallEnd, wallClearLength, wallDimSide, wallGeom } from "../geometry.js";
import { cancelPending, commitPending, pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { applyCabinetDimension, requestCabinetDimension } from "../parametric_cabinet.js";
import { setStrength } from "../physics_facade.js";
import { render2D } from "../plan2d.js";
import { roomMeasurements } from "../room_summary.js";
import { S, fin, touchItem3D } from "../state.js";
import { resizeSelectedRoom } from "../ui_planning_guide.js";
import { fillProps, roomMetaFor, syncWallEnd, syncWallSide } from "../ui_props.js";
import { refreshTree, updateCost } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { afterWallDim, applyRoomFloor, bindLength, bindNum, editEnd, flash, openModal, parseFieldLength, pinDimSide, restack, syncWalkView, turnItem, writeFieldLength } from "../ui.js";
import { normalizeWallKind, normalizeWallProfile, setWallKind } from "../wall_curves.js";
import { normalizeWall, setWallPhase, setWallType, wallLayers } from "../wall_types.js";

// lifted out of initUI()
function wireWalkTogglesAndWallInputs() {
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
}

// lifted out of initUI()
function wireItemAndRoomInputs(runAction) {
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
}

export { wireItemAndRoomInputs, wireWalkTogglesAndWallInputs };
