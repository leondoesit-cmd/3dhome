/* The planner's file/project and undo/redo actions, dispatched by runAction,
   split out of js/ui/run_action.js. It shares the editor's state through live
   imports from ../ui.js and ./ui_locals.js. */
import { syncBlueprintTraceControls } from "../blueprint_trace.js";
import { loadLocalProject, saveLocalProject } from "../core/project_store.js";
import { defaultApartment } from "../demo_house.js";
import { deliverExport } from "../export_delivery.js";
import { pushHistory, redo, undo } from "../history.js";
import { t } from "../i18n.js";
import { setTool } from "../interaction.js";
import { loadMEP } from "../mep.js";
import { getDirtyRevision, markSaved } from "../persist.js";
import { planStyle } from "../plan_style.js";
import { fitView, planImageCanvas, render2D, updatePlanGizmo } from "../plan2d.js";
import { S } from "../state.js";
import { normalizeSurvey } from "../survey.js";
import { renderPanel as refreshMEPPanel } from "../ui_mep.js";
import { fillProps, wallTakeoffRows } from "../ui_props.js";
import { exportCostCSV, refreshTree, withoutRoomPrompts } from "../ui_tree.js";
import { applyData, download, exportWallScheduleFile, flash, saveTextDownload, serialize, syncEnvUI } from "../ui.js";
import { applyEnv, frameView, has3D, snapshot3D } from "../view3d.js";
import { uiLocals } from "./ui_locals.js";
import { csvCell } from "../wall_schedule.js";
import { today as sheetDate } from "../sheet_print.js";

export const RUN_HISTORY_ACTIONS = new Set(["undo", "redo"]);

// split out of runAction()
async function runHistoryAction(act, ev) {
  if (act === "undo") undo();
  else if (act === "redo") redo();
}

export const RUN_FILE_ACTIONS = new Set([
  "exportWallSchedule", "newPlan", "photo", "reset", "save", "load", "exportjson", "importjson",
  "importBlueprint", "importBlueprintTrace", "roomScan", "png2d", "png3d", "exportgltf",
  "cutPlan", "exportCost", "uploadFloorTex", "uploadWallTex", "clearWallTex", "exportWallTakeoff",
]);

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
      ctx.fillText(sheetDate(), bw * 0.69, by + bh * 0.72);
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
        .map(csvCell).join(","));
    });
    saveTextDownload("wall-" + toWall.id + "-takeoff.csv", toCsv.join("\r\n"));
    flash(t("f_downloaded"), "success");
  }
}

export { runFileAction, runHistoryAction };
