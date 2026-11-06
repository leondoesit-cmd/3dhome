/* The planner's selection actions (edit, duplicate, rotate, group, lock,
   align...), dispatched by runAction, split out of js/ui/run_action.js. It
   shares the editor's state through live imports from ./run_action.js. */
import { executeCommand } from "../commands/index.js";
import { addSlabOpeningToFloor, floorAbove } from "../floors.js";
import { itemsInRoom, roomByKey, roomFloor } from "../geometry.js";
import { currentHistoryId, pushHistory } from "../history.js";
import { t } from "../i18n.js";
import { addSpace, autoArrangeAll, deleteSel, dupSel, rotateRoom } from "../interaction.js";
import { alignItems, distributeItems, matchRotation } from "../item_align.js";
import { refaceItem, rotStep } from "../item_orient.js";
import { saveLayers } from "../layers.js";
import { fitView, render2D } from "../plan2d.js";
import { stairVoidFields } from "../slab_openings.js";
import { findSupport, rotateWith } from "../stack.js";
import { S, touchItem3D, uid } from "../state.js";
import { renderPanel as refreshMEPPanel } from "../ui_mep.js";
import { addParam, runRoomConAction } from "../ui_params.js";
import { fillProps } from "../ui_props.js";
import { refreshTree, updateCost, withoutRoomPrompts } from "../ui_tree.js";
import { renderWarnPanel } from "../ui_warn.js";
import { UI_COMMAND_HISTORY, applyRoomFloor, flash, openModal, setLockStruct, turnItem } from "../ui.js";
import { uiLocals } from "./ui_locals.js";

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

export { runSelectionAction };
