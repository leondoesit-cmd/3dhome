/* The planner's view, panel, hint and marker actions, dispatched by runAction,
   split out of js/ui/run_action.js. It shares the editor's state through live
   imports from ./run_action.js. */
import { pushHistory } from "../history.js";
import { t, toggleLang } from "../i18n.js";
import { setTool } from "../interaction.js";
import { detachMarker, duplicateMarker, markerItem } from "../markers.js";
import { clearDebris, isPhysicsEnabled, loadPhysics, toggleHitMode, togglePhysics } from "../physics_facade.js";
import { planStyle } from "../plan_style.js";
import { fitView, render2D } from "../plan2d.js";
import { S } from "../state.js";
import { openLibraryPicker } from "../ui_libpick.js";
import { fillProps, select } from "../ui_props.js";
import { refreshTree } from "../ui_tree.js";
import { addFurnItem, flash, initDrawingPanel, lavaModule, loadLavaModule, loadRCModule, loadZombieModule, rcModule, setCutaway, setEdit3D, setPlanStyle, syncWalkView, zombieModule } from "../ui.js";
import { frameView, rebuild3D, toggleDrawing3D, toggleFreeMove, toggleWalk, toggleWalkView } from "../view3d.js";
import { uiLocals } from "./ui_locals.js";

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

export { runHintAction, runMarkerAction, runPanelAction, runViewAction };
