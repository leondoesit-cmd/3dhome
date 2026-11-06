/* The planner's door/window (opening) actions, dispatched by runAction, split
   out of js/ui/run_action.js. It shares the editor's state through live imports
   from ../ui.js. */
import { roomFloor } from "../geometry.js";
import { pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { openSegment, openWall, placeOpeningOnSelected, startOpeningAlignPick } from "../interaction.js";
import { render2D } from "../plan2d.js";
import { S } from "../state.js";
import { fillProps, select } from "../ui_props.js";
import { refreshTree } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { flash } from "../ui.js";
import { addOpeningCentre, addOpeningFromCorner, addOpeningSpacing, conLabelText, solveWallCons } from "../wall_constraints.js";

export const RUN_OPENING_ACTIONS = new Set([
  "keepAutoOpen", "customAutoOpen", "closeAutoOpen", "flipSwing", "openwall", "addWallDoor",
  "addWallWindow", "addWallPassage", "openseg", "opCentre", "opFromA", "opFromB", "opAlignX",
  "opAlignZ", "opSpacing",
]);

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

export { runOpeningAction };
