/* The planner's initUI: the top-level UI wiring of toolbars, panels, menus and
   their handlers, split out of js/ui.js. It shares the editor's state through
   live imports from ../ui.js. */
import "../blueprint_trace.js";
import { convertCadToWalls } from "../cad_to_walls.js";
import { windowChromePosture } from "../chrome_posture.js";
import "../commands/index.js";
import "../constraint_engine.js";
import "../core/project_store.js";
import { rebuildProject } from "../core/project.js";
import "../demo_house.js";
import "../display_units.js";
import "../dropdown_menus.js";
import "../elevation.js";
import "../export_delivery.js";
import "../floors.js";
import { FURN } from "../furniture.js";
import { convertGeoJsonToWalls } from "../geojson_to_walls.js";
import "../geometry.js";
import { pushHistory } from "../history.js";
import { onLangChange, t } from "../i18n.js";
import "../interaction.js";
import "../item_align.js";
import "../item_orient.js";
import "../layers.js";
import "../markers.js";
import "../mep.js";
import "../parametric_cabinet.js";
import "../persist.js";
import "../physics_facade.js";
import "../plan_style.js";
import "../plan_sync.js";
import { fitView, render2D } from "../plan2d.js";
import "../pro_shell.js";
import "../room_summary.js";
import "../slab_openings.js";
import "../smarthome_connect.js";
import "../smarthome.js";
import "../stack.js";
import { S } from "../state.js";
import "../survey.js";
import "../ui_libpick.js";
import "../ui_mep.js";
import "../ui_params.js";
import "../ui_planning_guide.js";
import { roomMetaFor, select } from "../ui_props.js";
import { refreshTree, updateCost } from "../ui_tree.js";
import "../ui_warn.js";
import "../view3d.js";
import "../wall_constraints.js";
import "../wall_curves.js";
import "../wall_draw.js";
import { ensureWallTypes } from "../wall_types.js";
import { applyData, flash } from "../ui.js";
import {
  wireItemAndRoomInputs, wireWalkTogglesAndWallInputs,
} from "./wall_inputs.js";
import {
  wireDisplayAndPointInspector, wireHistoryAndTools, wireWallColorAndLights,
} from "./inspector_wiring.js";
import {
  wireFoldablesMenusAndDispatch, wireMobileDrawers,
} from "./mobile_chrome.js";
import { runAction } from "./run_action.js";
import { showShortcuts, wireKeyboardShortcuts } from "./keyboard.js";
import { uiLocals } from "./ui_locals.js";

export function initUI() {
  uiLocals.macCap = macCap;
  uiLocals.selectAllItems = selectAllItems;
  uiLocals.showShortcuts = showShortcuts;
  wireWalkTogglesAndWallInputs();
  wireItemAndRoomInputs(runAction);
  uiLocals.currentTexTarget = null;
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
          
          if (uiLocals.currentTexTarget === "wall" && S.sel && S.sel.kind === "wall") {
            pushHistory();
            S.sel.ref.tex = dataUrl;
            S.dirty3D = true;
          } else if (uiLocals.currentTexTarget === "floor") {
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

  ({ toggleToolNames: uiLocals.toggleToolNames } = wireHistoryAndTools());

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

  // ---- keyboard cheat sheet (topbar ⌨ button, or "?" anywhere) ----
  uiLocals.shortcutsModal = null;
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
      el.textContent = uiLocals.macCap(el.getAttribute("data-kbd"));
    });
  }
  applyPlatformKeyCaps();

  wireKeyboardShortcuts();

  /* The align palette, as a table: verb name -> what it does. */
  uiLocals.AL_ACTS = {
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
        /* A bare geometry is GeoJSON too (the converter takes it); routed to
           applyData it read as an empty project and cleared the plan. */
        var geo = (d && (d.type === "FeatureCollection" || Array.isArray(d.features) || d.type === "Feature" ||
          ["Polygon", "MultiPolygon", "LineString", "GeometryCollection"].indexOf(d.type) >= 0)) ? d : null;
        var cad = d.cadEntities || d.cad || ((d.lines || d.arcs) ? d : null);
        if (geo) {
          var convertedGeo = convertGeoJsonToWalls(geo, { height: 300, firstId: S.idc });
          if (!convertedGeo.walls.length) { flash(t("f_badFile"), "error"); return; }
          S.nodes = convertedGeo.nodes; S.walls = convertedGeo.walls; S.openings = convertedGeo.openings;
          S.items = []; S.markers = []; S.annotations = []; S.roomMeta = convertedGeo.roomMeta || {}; S.idc = convertedGeo.nextId || S.walls.length + 1;
          ensureWallTypes(S); rebuildProject(S, FURN); S.sel = null; S.dirty3D = true;
          render2D(); fitView(); refreshTree(); updateCost();
          flash(t("f_imported"), "success");
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

