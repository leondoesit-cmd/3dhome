/* Inspector joint pairs, pins, constraints, opening constraints, multi-wall and
   room/lamp panes, split out of js/ui_props.js. It shares the editor's state
   through live imports from ../ui_props.js. */
import { fmtAreaM2, fmtLen, unitLabel, writeLen } from "../display_units.js";
import { flabel, isLamp, lampColor } from "../furniture.js";
import { itemsInRoom, jointInfo, roomByKey, roomFloor, roomName, wallClearLength, wallGeom } from "../geometry.js";
import { t } from "../i18n.js";
import { syncInspectorPreview } from "../inspector_preview.js";
import { roomClearArea } from "../room_area.js";
import { roomMeasurements } from "../room_summary.js";
import { S, TILE, hexStr } from "../state.js";
import { fillMEP } from "../ui_mep.js";
import { renderRoomCons } from "../ui_params.js";
import { fillSpecRow } from "../ui_prodsize.js";
import { conRow, fillWallDiagrams, fillWallFinish, fillWallJoins, fillWallTakeoff } from "../ui_props/wall_panels.js";
import { fillJoint, fillMarker, fillSlabVoid, fillVariants, syncWallEnd, syncWallSide } from "../ui_props/wall_sync.js";
import { bindWallTabs, fillWallFlip, fillWallHead, fillWallOpenings } from "../ui_props/wall_tabs.js";
import { fillRoomBoundaries } from "../ui_room_boundaries.js";
import { fillItemSmart } from "../ui_smarthome.js";
import { refreshTree } from "../ui_tree.js";
import { frameSpec } from "../view3d.js";
import { CON_TOL_A, CON_TOL_L, angleSectorAtNode, conCurrent, conDrivable, conError, conLabelText, conSatisfied, conUnit, pinnedNodes, wallCons } from "../wall_constraints.js";
import { normalizeWallGeometry, normalizeWallKind, normalizeWallProfile, wallProfileHeight } from "../wall_curves.js";
import { normalizeWall, wallPhase, wallThickness } from "../wall_types.js";
import {
  baseProfileEnds, conCanFlip, datumForControl, fillHoldRow, fillStackRow,
  fillWallCons, fillWallEndActions, fillWallLock, fillWallTypeSelect, select,
  showPanel, wallTab, writeInspectorLen,
} from "../ui_props.js";

/* The palette for a multi-corner selection. The selection is no longer capped
   at two, so this has to say WHICH verbs the current count supports rather
   than assume a pair: pinning wants any number, the pair relations want
   exactly two, and a button that silently does nothing is worse than a
   disabled one. */
function fillJointPair(nodes) {
  showPanel("node");
  var pair = nodes.length === 2;
  var pairTools = document.getElementById("nd_pair_tools");
  if (pairTools) pairTools.hidden = false;
  ["ndJoin", "ndDistance", "ndAlignX", "ndAlignZ", "ndDistanceX", "ndDistanceZ",
    "ndCoincident", "ndSymmetric", "ndSymmetricPerp"].forEach(function (act) {
    var b = document.querySelector('[data-act="' + act + '"]');
    if (b) b.disabled = !pair;
  });
  document.getElementById("selname_nd").textContent =
    pair ? t("nd_pair_title") : t("nd_multi_title", { n: nodes.length });
  document.getElementById("nd_state").textContent = nodes.map(function (ni, i) {
    var n = S.nodes[ni];
    return (i + 1) + ". V" + (ni + 1) + "  X " + Math.round(n.x) + " · Z " + Math.round(n.z);
  }).join("   ");
  document.getElementById("nd_x").value = "";
  document.getElementById("nd_z").value = "";
  var arms = document.getElementById("nd_arms");
  arms.innerHTML = "";
  nodes.forEach(function (ni, i) {
    var info = jointInfo(ni), row = document.createElement("div");
    row.className = "mk-info-row";
    if (!S.nodePairAngles) S.nodePairAngles = {};
    var sector = angleSectorAtNode(ni);
    row.innerHTML = '<i class="ph ph-map-pin"></i><span class="mk-info-lbl">' +
      (i + 1) + ". " + t("nd_title") + '</span><b>' +
      (sector && info.gaps.length ? Math.round(info.gaps[0].deg * 10) / 10 + "°" : info.arms.length + " " + t("wall")) +
      "</b>";
    arms.appendChild(row);
    if (info.gaps && info.gaps.length > 1) {
      var choose = document.createElement("select");
      choose.className = "con-face-select";
      info.gaps.forEach(function (gap) {
        var opt = document.createElement("option");
        opt.value = gap.a.id + ":" + gap.b.id;
        opt.textContent = "W" + gap.a.id + " ↔ W" + gap.b.id + " · " + Math.round(gap.deg * 10) / 10 + "°";
        choose.appendChild(opt);
      });
      var saved = S.nodePairAngles[ni];
      if (saved) choose.value = saved.w1 + ":" + saved.w2;
      if (!choose.value) choose.selectedIndex = 0;
      function storeSector() {
        var ids = choose.value.split(":").map(Number);
        S.nodePairAngles[ni] = { joint: ni, w1: ids[0], w2: ids[1] };
      }
      storeSector();
      choose.addEventListener("change", function () { storeSector(); fillJointPair(nodes); });
      arms.appendChild(choose);
      sector = S.nodePairAngles[ni];
    }
  });
  var equal = document.getElementById("nd_equal_angle"),
    compare = document.getElementById("nd_compare_angle");
  function picked(ni) { return S.nodePairAngles && S.nodePairAngles[ni] || angleSectorAtNode(ni); }
  var canAngle = pair && !!picked(nodes[0]) && !!picked(nodes[1]);
  if (equal) equal.disabled = !canAngle;
  if (compare) compare.disabled = !canAngle;
  var squareButton = document.getElementById("nd_square_btn");
  if (squareButton) squareButton.disabled = true;
  var setAngle = document.getElementById("nd_set_angle_btn");
  if (setAngle) setAngle.disabled = true;
  syncPinBtn(nodes);
}

/* The pin button is a toggle, so it has to say which way it will go. */
function syncPinBtn(nodes) {
  var btn = document.getElementById("nd_pin_btn");
  if (!btn) return;
  var pins = pinnedNodes(),
    allPinned = nodes.length > 0 && nodes.every(function (ni) { return pins[ni]; });
  btn.classList.toggle("active", allPinned);
  var lbl = btn.querySelector("span");
  if (lbl) lbl.textContent = t(allPinned ? "nd_unpin" : "nd_pin");
}

/* The inspector for ONE dimension, reached by clicking its label on the plan.
   Everything a constraint can be asked is here: what it currently measures
   against what it states, which side it holds, whether it drives at all, and
   the two ways to stop it (suppress, delete). */
function fillCon(c) {
  showPanel("con");
  document.getElementById("selname_con").textContent = conLabelText(c, t);

  var unit = conUnit(c),
    cur = conCurrent(c),
    err = conError(c),
    tol = unit === "deg" ? CON_TOL_A : CON_TOL_L,
    state = document.getElementById("con_state");

  /* Say what it MEASURES, always — including for the pure relations that have
     no value to type. "Parallel: out by 3.2°" is actionable; a red glyph and
     nothing else is not. */
  var txt = cur == null ? t("wc_failed")
    : c.report ? t("wc_reportReads", { v: fmtVal(cur, unit) })
      : conSatisfied(c) ? t("wc_ok", { v: fmtVal(cur, unit) })
        : t("wc_outBy", { v: fmtVal(err, unit), tol: fmtVal(tol, unit) });
  state.textContent = txt;
  state.classList.toggle("con-bad", !c.report && !conSatisfied(c));

  var row = document.getElementById("con_value_row"),
    input = document.getElementById("con_value");
  var typeable = conDrivable(c);
  row.hidden = !typeable;
    if (typeable) {
    input.value = unit === "deg"
      ? String(Math.round((Number(c.value) || 0) * 10) / 10)
      : fmtLen(Number(c.value) || 0, { suffix: false, domain: "plan" });
    document.getElementById("con_value_lbl").textContent =
      unit === "deg" ? t("cad_ang") : unitLabel("plan");
  }
  document.getElementById("con_report").checked = !!c.report;
  document.getElementById("con_off").checked = !!c.off;
  // a pin has nothing to swap and everything else has nothing to re-pin
  var flipBtn = document.querySelector('#conProps [data-act="conFlip"]');
  if (flipBtn) flipBtn.disabled = !conCanFlip(c);
  document.getElementById("con_repin_btn").hidden = c.type !== "fixed";
}
function fmtVal(v, unit) {
  if (v == null) return "?";
  if (unit === "deg") return (Math.round(v * 10) / 10) + "°";
  return fmtLen(v, { domain: "plan" });
}

/* The position dimensions on one opening, listed the same way a wall's are.
   Reuses conRow() so a dimension looks and behaves identically wherever it is
   shown — the value is editable in place, and the delete is in the same spot. */
function fillOpeningCons(o) {
  var host = document.getElementById("o_conList"),
    hint = document.getElementById("o_con_hint");
  if (!host) return;
  host.innerHTML = "";
  var list = wallCons().filter(function (c) {
    if (c.type === "openCentre" || c.type === "openDist") return c.opening === o.id;
    if (c.type === "openAlign") return c.a === o.id || c.b === o.id;
    if (c.type === "openSpacing") return (c.openings || []).indexOf(o.id) !== -1;
    return false;
  });
  if (hint)
    hint.textContent = S.conPick && S.conPick.kind === "openAlign"
      ? t("wc_pick_openAlign")
      : list.length ? "" : t("wc_empty");
  var spacingBtn = document.getElementById("op_spacing_btn");
  if (spacingBtn)
    spacingBtn.disabled =
      (S.openings || []).filter(function (q) { return q.wall === o.wall; }).length < 3;
  list.forEach(function (c) {
    host.appendChild(conRow(c));
  });
}

function fillWallMulti(walls) {
  showPanel("walls");
  document.getElementById("wm_state").textContent = walls.map(function (w, i) {
    return (i + 1) + ". W" + w.id + " · " + fmtLen(wallGeom(w).L);
  }).join("   ");
  ["wmParallel", "wmPerpendicular", "wmCollinear", "wmEqualLength", "wmOffset"].forEach(function (act) {
    var b = document.querySelector('[data-act="' + act + '"]');
    if (b) b.disabled = walls.length !== 2;
  });
  var spacing = document.getElementById("wm_equal_spacing");
  if (spacing) spacing.disabled = walls.length < 3;
  var fillet = document.getElementById("wm_fillet");
  if (fillet) fillet.disabled = walls.length !== 2;
  var chamfer = document.getElementById("wm_chamfer");
  if (chamfer) chamfer.disabled = walls.length !== 2;
}

export function fillProps() {
  document.getElementById("lightProps")?.classList.remove("on");
  var shCtl = document.getElementById("smartItemControls");
  if (shCtl) { shCtl.style.display = "none"; shCtl.innerHTML = ""; }
  S.segPreview = null;
  syncInspectorPreview();
  if (!S.sel) {
    showPanel("empty");
    return;
  }
  if (S.sel.kind === "marker") {
    fillMarker(S.sel.ref);
    refreshTree();
    return;
  }
  if (S.sel.kind === "slabvoid") {
    fillSlabVoid(S.sel.ref);
    refreshTree();
    return;
  }
  if (S.sel.kind === "node") {
    fillJoint(S.sel.ref);
    return;
  }
  if (S.sel.kind === "nodes") {
    fillJointPair(S.sel.refs);
    return;
  }
  if (S.sel.kind === "con") {
    fillCon(S.sel.ref);
    return;
  }
  if (S.sel.kind === "walls") {
    fillWallMulti(S.sel.refs);
    return;
  }
  if (S.sel.kind === "items") {
    showPanel("items");
    return;
  }
  if (S.sel.kind === "mepNode" || S.sel.kind === "mepRun") {
    showPanel("mep");
    fillMEP();
    return;
  }
  if (S.sel.kind === "wall") {
    var w = S.sel.ref, gm = wallGeom(w);
    normalizeWall(w, S);
    showPanel("wall");
    writeInspectorLen("w_len", wallClearLength(w));
    document.getElementById("w_ang").value = Math.round((Math.atan2(gm.dz, gm.dx) * 180) / Math.PI);
    writeInspectorLen("w_th", wallThickness(w, S));
    writeInspectorLen("w_h", w.height);
    fillWallHead(w);
    fillWallEndActions(w);

    fillWallTypeSelect("w_type", w.wallTypeId);
    fillWallTypeSelect("w_upper_type", w.upperWallTypeId || w.wallTypeId);
    var kind = normalizeWallKind(w);
    var kindEl = document.getElementById("w_kind");
    if (kindEl) kindEl.value = kind;
    var phaseEl = document.getElementById("w_phase");
    if (phaseEl) phaseEl.value = wallPhase(w);
    var datumEl = document.getElementById("w_datum");
    if (datumEl) datumEl.value = datumForControl(w.datum);
    ["a", "b"].forEach(function (end) {
      var joinEl = document.getElementById("w_join_" + end);
      if (joinEl) joinEl.value = w.join && w.join[end] || "auto";
    });
    var reverse = document.getElementById("w_reverse");
    if (reverse) {
      reverse.classList.toggle("active", !!w.layersReversed);
      reverse.setAttribute("aria-pressed", w.layersReversed ? "true" : "false");
    }
    var pony = document.getElementById("w_pony_options");
    if (pony) pony.hidden = kind !== "pony";
    var split = document.getElementById("w_split_h");
    if (split) writeLen(split, Number(w.splitHeight) || Math.min(w.height, 110));

    var curve = normalizeWallGeometry(w, S.nodes);
    var bulge = document.getElementById("w_bulge");
    if (bulge) bulge.value = curve && curve.kind === "arc" ? fmtLen(curve.bulge, { suffix: false }) : 0;
    var cornerEditor = document.getElementById("w_corner_editor");
    if (cornerEditor) cornerEditor.hidden = !w.cornerTreatment;
    if (w.cornerTreatment) {
      var cornerType = document.getElementById("w_corner_type");
      var cornerValue = document.getElementById("w_corner_value");
      if (cornerType) cornerType.value = w.cornerTreatment.type || "fillet";
      if (cornerValue) writeLen(cornerValue, Number(w.cornerTreatment.value) || 0);
    }
    var topControls = normalizeWallProfile(w);
    var topA = topControls.length ? wallProfileHeight(w, 0, w.height) : w.height;
    var topB = topControls.length ? wallProfileHeight(w, gm.L, w.height) : w.height;
    var bases = baseProfileEnds(w, gm.L);
    writeLen(document.getElementById("w_top_a"), topA);
    writeLen(document.getElementById("w_top_b"), topB);
    writeLen(document.getElementById("w_base_a"), bases[0]);
    writeLen(document.getElementById("w_base_b"), bases[1]);
    syncWallEnd();
    syncWallSide(w);
    fillWallLock(w);
    fillWallFlip(w);
    fillWallJoins(w);
    bindWallTabs();
    wallTab(S.wallTab || "dims");
    fillWallCons(w);
    fillWallOpenings(w);
    fillWallFinish(w);
    fillWallTakeoff(w);
    fillWallDiagrams(w);

    var sqBtn = document.getElementById("w_square_btn");
    if (sqBtn) {
      var rawAng = (Math.atan2(gm.dz, gm.dx) * 180) / Math.PI;
      var normA = ((rawAng % 90) + 90) % 90;
      var offDeg = normA > 45 ? 90 - normA : normA;
      sqBtn.hidden = offDeg <= 0.05;
      sqBtn.title = t("cw_squareWall");
    }


    var Ls = Math.max(1, Math.round(gm.L)),
      ow = Math.min(100, Math.round(gm.L * 0.6)),
      oh = Math.round(w.height),
      op = Math.round(gm.L / 2);
    var posEl = document.getElementById("ow_pos");
    posEl.max = Ls;
    posEl.value = op;
    document.getElementById("ow_posval").textContent = fmtLen(op);
    writeLen(document.getElementById("ow_w"), ow);
    writeLen(document.getElementById("ow_h"), oh);
    S.segPreview = { s: op, width: ow, height: oh };
  } else if (S.sel.kind === "item") {
    var it = S.sel.ref;
    showPanel("item");
    var stairVoidAction = document.querySelector('[data-act="slabFromStairs"]');
    if (stairVoidAction) stairVoidAction.hidden = it.type !== "stairs";
    writeInspectorLen("i_w", it.w);
    writeInspectorLen("i_d", it.d);
    writeInspectorLen("i_h", it.h);
    document.getElementById("i_rot").value = Math.round(it.rot);
    document.getElementById("i_rot_range").value = Math.round(it.rot);
    document.getElementById("selname2").textContent = flabel(it.type) + (it.locked ? " 🔒" : "");
    fillVariants(it);
    fillSpecRow(it); // linked real-world product, when one was matched
    fillStackRow(it); // the piece it stands on, when it stands on one
    fillHoldRow(it); // and the wall it is held against, when it is held
    fillItemSmart(it);
    var slabRow = document.getElementById("i_slabvoid_row");
    if (slabRow) slabRow.hidden = it.type !== "stairs";
    document.getElementById("lockItemSpan").textContent = it.locked ? t("lockItemOn") : t("lockItem");
    document.getElementById("lockItemBtn").querySelector("i").className = it.locked ? "ph ph-lock-key" : "ph ph-lock-key-open";
    if (isLamp(it)) {
      document.getElementById("lightProps").classList.add("on");
      document.getElementById("l_on").checked = it.lightOn !== false;
      var mul = it.lightI != null ? it.lightI : 1;
      document.getElementById("l_int").value = mul;
      document.getElementById("l_intval").textContent = Math.round(mul * 100) + "%";
      document.getElementById("l_col").value = hexStr(lampColor(it));
      
      document.getElementById("lightSpotProps").style.display = "flex";
      var lTypeSel = document.getElementById("l_type");
      if (it.spot) {
        lTypeSel.value = "spot";
        document.getElementById("l_cone").value = it.cone != null ? it.cone : 45;
        document.getElementById("l_pitch").value = it.pitch != null ? it.pitch : 0;
        document.getElementById("l_cone_l").style.display = "flex";
        document.getElementById("l_pitch_l").style.display = "flex";
      } else {
        lTypeSel.value = "omni";
        document.getElementById("l_cone_l").style.display = "none";
        document.getElementById("l_pitch_l").style.display = "none";
      }
    }
  } else if (S.sel.kind === "opening") {
    var o = S.sel.ref;
    showPanel("opening");
    writeInspectorLen("o_w", o.width);
    writeInspectorLen("o_h", o.height);
    var oUnit = document.getElementById("o_unit");
    if (oUnit) oUnit.textContent = unitLabel("openings");
    writeInspectorLen("o_sill", o.sill);
    document.getElementById("o_sill_l").style.display = o.type === "window" ? "flex" : "none";
    fillOpeningCons(o);
      
    if (o.type === "door") {
      document.getElementById("doorSpecific").style.display = "flex";
      document.getElementById("o_type_sel").value = o.isPocket ? "pocket" : (o.isSliding ? "sliding" : (o.isDouble ? "double" : "standard"));
      if (o.isSliding || o.isPocket) {
        document.getElementById("o_mat").value = o.mat || "wood";
        document.getElementById("o_col").value = o.color || "#ffffff";
        document.getElementById("o_slide_dir").value = o.slideDir || "auto";
        document.getElementById("o_mat_l").style.display = "flex";
        document.getElementById("o_col_l").style.display = "flex";
        document.getElementById("o_dir_l").style.display = "flex";
        document.getElementById("o_swing_dir_l").style.display = "none";
        
        var w = S.walls.find(function(wa) { return wa.ops && wa.ops.indexOf(o) !== -1; });
        if (w) {
          var gm = wallGeom(w);
          var s = Math.max(o.width / 2, Math.min(gm.L - o.width / 2, o.s));
          var spaceLeft = s - o.width / 2;
          var spaceRight = gm.L - (s + o.width / 2);
          
          var canLeft = spaceLeft >= o.width - 10;
          var canRight = spaceRight >= o.width - 10;
          
          var optRight = document.querySelector('#o_slide_dir option[value="1"]');
          var optLeft = document.querySelector('#o_slide_dir option[value="-1"]');
          
          if (!canRight) {
            optRight.disabled = true;
            optRight.textContent = t("d_right") + " (" + t("no_space") + ")";
          } else {
            optRight.disabled = false;
            optRight.textContent = t("d_right");
          }
          
          if (!canLeft) {
            optLeft.disabled = true;
            optLeft.textContent = t("d_left") + " (" + t("no_space") + ")";
          } else {
            optLeft.disabled = false;
            optLeft.textContent = t("d_left");
          }
          
          if (!canRight && !canLeft) {
             document.getElementById("o_slide_warn").style.display = "block";
             document.getElementById("o_slide_dir").disabled = true;
          } else {
             document.getElementById("o_slide_warn").style.display = "none";
             document.getElementById("o_slide_dir").disabled = false;
             var currentVal = document.getElementById("o_slide_dir").value;
             if ((currentVal === "1" && !canRight) || (currentVal === "-1" && !canLeft)) {
                document.getElementById("o_slide_dir").value = "auto";
                o.slideDir = "auto";
             }
          }
        }
      } else {
        document.getElementById("o_mat_l").style.display = "none";
        document.getElementById("o_col_l").style.display = "none";
        document.getElementById("o_dir_l").style.display = "none";
        document.getElementById("o_slide_warn").style.display = "none";
        document.getElementById("o_swing_dir_l").style.display = "flex";
        document.getElementById("o_swing_dir").value = o.swingDir || "R_IN";
      }
      var pairBox = document.getElementById("o_pair_box");
      if (pairBox) pairBox.style.display = o.isDouble ? "grid" : "none";
      if (o.isDouble) {
        var leftLeaf = Number(o.leafA) || o.width / 2;
        writeLen(document.getElementById("o_leaf_a"), leftLeaf, { domain: "openings" });
        writeLen(document.getElementById("o_leaf_b"), o.width - leftLeaf, { domain: "openings" });
      }
      var swingGrid = document.getElementById("o_swing_grid");
      if (swingGrid) {
        swingGrid.style.display = o.isSliding || o.isPocket ? "none" : "grid";
        swingGrid.querySelectorAll("[data-swing]").forEach(function (button) {
          button.classList.toggle("active", button.dataset.swing === (o.swingDir || "R_IN"));
        });
      }
    } else {
      document.getElementById("doorSpecific").style.display = "none";
    }
    // frame / mullion profile — doors and windows only (a passage has no frame)
    var frBox = document.getElementById("o_frame_box");
    if (o.type === "door" || o.type === "window") {
      var FR = frameSpec(o);
      frBox.style.display = "flex";
      document.getElementById("o_fr_jamb").value = FR.jamb;
      document.getElementById("o_fr_head").value = FR.head;
      document.getElementById("o_fr_sillw").value = FR.sillW;
      document.getElementById("o_fr_depth").value = FR.depth;
      document.getElementById("o_fr_mull").value = FR.mull;
      document.getElementById("o_fr_mullv").value = FR.mullV;
      document.getElementById("o_fr_mullh").value = FR.mullH;
      var isWin = o.type === "window";
      document.getElementById("o_fr_sill_l").style.display = isWin ? "flex" : "none";
      document.getElementById("o_fr_mull_l").style.display = isWin ? "flex" : "none";
      document.getElementById("o_fr_mullv_l").style.display = isWin ? "flex" : "none";
      document.getElementById("o_fr_mullh_row").style.display = isWin ? "flex" : "none";
    } else {
      frBox.style.display = "none";
    }

    if (o.type === "passage" && o.overlapL != null) {
      document.getElementById("o_margins_box").style.display = "flex";
      var currentLeft = Math.round((o.s - o.width/2) - (o.overlapCenter - o.overlapL/2));
      var currentRight = Math.round((o.overlapCenter + o.overlapL/2) - (o.s + o.width/2));
      writeLen(document.getElementById("o_m_l"), currentLeft);
      writeLen(document.getElementById("o_m_r"), currentRight);
      writeLen(document.getElementById("o_m_b"), o.sill);
      var wWall = S.walls.find(function(wa) { return wa.id === o.wall; });
      var topM = wWall ? (wWall.height - o.sill - o.height) : 0;
      writeLen(document.getElementById("o_m_t"), topM);
      
      var isSeamless = Math.abs(o.width - o.overlapL) < 2 && Math.abs(topM) < 2 && o.sill <= 1;
      document.getElementById("o_seamless_btn").style.display = isSeamless ? "none" : "block";
      document.getElementById("o_floor_match").style.display = "block";
    } else {
      document.getElementById("o_margins_box").style.display = "none";
      document.getElementById("o_seamless_btn").style.display = "none";
      document.getElementById("o_floor_match").style.display = "none";
    }

    document.getElementById("selname3").textContent = o.type === "door" ? t("door") : o.type === "passage" ? t("passage") : t("window");
  } else if (S.sel.kind === "room") {
    var r = roomByKey(S.sel.ref);
    if (!r) {
      showPanel("empty");
      S.sel = null;
      return;
    }
    showPanel("room");
    var roomTitle = document.getElementById("selname4");
    if (roomTitle) roomTitle.textContent = roomName(r.key) || t("room");
    renderRoomCons(r.key);
    fillRoomBoundaries(r, select);
    document.getElementById("r_name").value = roomName(r.key);
    var size = roomMeasurements(S, r)?.interior;
    var sizeRow = document.getElementById("r_size_row");
    var lHint = document.getElementById("r_l_shape_hint");
    if (sizeRow) sizeRow.style.display = size ? "" : "none";
    if (lHint) lHint.style.display = size ? "none" : "";
    if (size) {
      writeInspectorLen("r_w", size.width);
      writeInspectorLen("r_d", size.depth);
    }
    document.getElementById("r_floor").value = roomFloor(r.key);
    var tScale = S.roomMeta[r.key] && S.roomMeta[r.key].floorScale;
    var rf = roomFloor(r.key);
    document.getElementById("r_floor_scale").value = tScale || (S.roomMeta[r.key] && S.roomMeta[r.key].floorTex ? 200 : (TILE[rf] || 240));
    document.getElementById("r_floor_scale_box").style.display = "block";
    var tBump = S.roomMeta[r.key] && S.roomMeta[r.key].floorBump;
    var bumpVal = tBump != null ? tBump : 0.20;
    var bumpEl = document.getElementById("r_floor_bump");
    if (bumpEl) {
      bumpEl.value = Math.round(bumpVal * 100);
      var bumpValSpan = document.getElementById("r_floor_bump_val");
      if (bumpValSpan) bumpValSpan.textContent = Math.round(bumpVal * 100) + "%";
      var bumpBox = document.getElementById("r_floor_bump_box");
      if (bumpBox) bumpBox.style.display = "block";
    }
    var clearArea = roomClearArea(S, r);
    document.getElementById("r_area").textContent = clearArea.area == null
      ? t("room_area_reference", { area: fmtAreaM2(r.area / 10000) })
      : t("room_area_usable", { area: fmtAreaM2(clearArea.area) });
    document.getElementById("r_wall").value = hexStr(
      S.roomMeta[r.key] && S.roomMeta[r.key].wall != null ? S.roomMeta[r.key].wall : S.wallColor
    );
    document.getElementById("lockRoomSpan").textContent = S.roomMeta[r.key] && S.roomMeta[r.key].locked ? t("lockRoomOn") : t("lockRoom");
    document.getElementById("lockRoomBtn").querySelector("i").className = S.roomMeta[r.key] && S.roomMeta[r.key].locked ? "ph ph-lock-key" : "ph ph-lock-key-open";

    var warnEl = document.getElementById("r_warn");
    if (warnEl) {
      if (roomFloor(r.key) === "balcony") {
        var inR = itemsInRoom(r);
        var weight = 0;
        var hWeights = {
          nft_pipe_75: 15, nft_pipe_110: 30, nft_pipe_160: 60, nft_square_12x12: 30,
          dwc_bucket: 28, rdwc_header: 50, ebb_flow_tray: 450,
          tower_commercial: 45, tower_diy_pvc: 35, water_reservoir_60l: 60, water_chiller: 15
        };
        inR.forEach(function(it) {
          if (hWeights[it.type]) weight += hWeights[it.type];
        });
        var sqm = r.area / 10000;
        var maxW = sqm * 150;
        if (weight > maxW) {
          warnEl.style.display = "block";
          var isEn = document.documentElement.lang === "en";
          if (isEn) {
            warnEl.innerHTML = "<br>⚠ Overweight Warning!<br>Hydro Systems: " + Math.round(weight) + " kg<br>Balcony Limit: " + Math.round(maxW) + " kg";
          } else {
            warnEl.innerHTML = "<br>⚠ חריגת משקל למרפסת!<br>עומס מערכות: " + Math.round(weight) + " ק\"ג<br>מותר: " + Math.round(maxW) + " ק\"ג";
          }
        } else {
          warnEl.style.display = "none";
        }
      } else {
        warnEl.style.display = "none";
      }
    }

    var autoOpenUI = document.getElementById("corridorAutoOpenProps");
    if (autoOpenUI) {
      if (S.roomMeta[r.key] && S.roomMeta[r.key].autoOpenings && S.roomMeta[r.key].autoOpenings.length > 0) {
        autoOpenUI.style.display = "block";
      } else {
        autoOpenUI.style.display = "none";
      }
    }

  } else {
    showPanel("empty");
  }
  refreshTree();
}

export function roomMetaFor() {
  if (!S.sel || S.sel.kind !== "room") return null;
  return (S.roomMeta[S.sel.ref] = S.roomMeta[S.sel.ref] || {});
}

export function selLamp() {
  return S.sel && S.sel.kind === "item" && isLamp(S.sel.ref) ? S.sel.ref : null;
}

export { syncPinBtn };
