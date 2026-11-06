/* The planner's wall modifier, wall constraint and node constraint actions,
   dispatched by runAction, split out of js/ui/run_action.js. It shares the
   editor's state through live imports from ./run_action.js. */
import { isLocked, setLocked } from "../constraint_engine.js";
import { parseLen } from "../display_units.js";
import { pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { applyNodePairRelation, chamferSelectedWalls, filletSelectedWalls, restoreSelectedSharpCorner, startConPick, togglePinSelected, updateSelectedCornerTreatment } from "../interaction.js";
import { render2D } from "../plan2d.js";
import { S } from "../state.js";
import { fillProps, select, wallFaceMaterials, wallFlipSymmetric } from "../ui_props.js";
import { refreshTree, updateCost } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { flash, openWallTypeEditorDialog, showJointAngleDialog, squareJoint, squareWall, squaredMsg } from "../ui.js";
import { addEqualLengthSet, addEqualSpacing, addOffset, addWallAngle, addWallRelation, flipConDirection, removeCon, repin, solveWallCons } from "../wall_constraints.js";
import { normalizeWallKind } from "../wall_curves.js";
import { flipWall, normalizeWall } from "../wall_types.js";

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

export {
  runNodeConstraintAction, runWallConstraintAction, runWallModifierAction,
};
