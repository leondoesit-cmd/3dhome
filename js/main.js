import { initSurvey } from "./ui_survey.js";
import { initPlanner3D, syncPlannerViewport } from "./planner_3d.js";
// Entry point: wires the modules together and boots the app.
import { S, throttle } from "./state.js";
import { onBeforeSolve, onAfterSolve } from "./wall_constraints.js";
import { resolvePlanParams } from "./plan_params.js";
import { solveRoomCons } from "./room_cons.js";

import { roomHidden } from "./geometry.js";
import { pushHistory } from "./history.js";
import { FURN, flabel, clabel } from "./furniture.js";
import { defaultApartment } from "./demo_house.js";
import { init3D, has3D, frameView, frameDollhouse, setSize } from "./view3d.js";
import { fitView, render2D, sizeCanvas, initPlanGizmo } from "./plan2d.js";
import {
  fillProps,
  initUI,
  refreshTree,
  syncEnvUI,
  serialize,
  applyData,
  flash,
  openModal,
} from "./ui.js";
import { initPersistence } from "./persist.js";
import {
  initInteraction,
  selectAtScreen,
  deleteSel,
  dupSel,
  placeOpeningOnSelected,
} from "./interaction.js";
import { t } from "./i18n.js";
import { applyStatic, onLangChange } from "./i18n.js";
import { initModeler, ensureModelLibrary } from "./modeler_launch.js";
import { refreshCatalogSelect } from "./model_catalog.js";
import { initCabinetUI } from "./ui_cabinet.js";
import { layoutCab, doorSweeps } from "./cabinet.js";
import { bindCabinetHelpers } from "./swing_clearance.js";
import { initPlanSync } from "./plan_sync.js";
import { initSite } from "./ui_site.js";
import { initMEP } from "./ui_mep.js";
import { initSmartHome } from "./ui_smarthome.js";
import { initFriends } from "./ui_friends.js";
import { markerItem, detachMarker } from "./markers.js";
import { initCadHud, applyLangLabels as cadHudLang } from "./cad_hud.js";
import { initMobileShell, refreshMobileShell } from "./mobile_shell.js";
import { initDimKnob } from "./ui_dim_knob.js";
import { windowChromePosture } from "./chrome_posture.js";
import { rebuildProject } from "./core/project.js";
import { initToolSearch } from "./tool_search.js";
import { initProRibbon } from "./pro_ribbon.js";
import { initLayers } from "./layers.js";
import { initLayersUI } from "./ui_layers.js";
import { initPlanToolsDock } from "./plan_tools_dock.js";
import { initRoomPalette } from "./ui_rooms.js";
import { initAgent } from "./agent_launch.js";
import { initTutorRuntime } from "./tutor/runtime.js";
import { initExternalAgentBridge } from "./agent_external_bridge.js";

/* Work-set layer state is a VIEW preference, not part of the document: it
   lives in localStorage and is restored before anything paints, hit-tests or
   raycasts, because every one of those paths asks js/layers.js what the work
   set is. Restoring it after the first render would flash the default
   `furniture` focus over a session that was left on structure. */
initLayers();

// apply static translations for the current language before anything renders
applyStatic();

// Ask the WebGPU adapter whether it is a software rasteriser now, while the
// plan view boots, so the baked-material tier is settled before the first 3D
// material asks for it (js/material_tier.js).
primeGpuTier();

import { addFurnItem } from "./ui.js";
import { CATALOG } from "./furniture.js";
import { SEARCH_ALIASES } from "./furniture_meta.js";
import { modelThumb, thumbAsync, hasThumb, clearThumbCache, loadThumbCache } from "./thumbs.js";
import { escapeHTML } from "./safe.js";
import { primeGpuTier } from "./material_tier.js";

/* Wire the plan-level constraint layers into every solve, here rather than
   inside wall_constraints.js: both of those modules read wallCons(), so
   importing them from it would close an import cycle. Order matters —
   parameters resolve the numbers the solver is about to use, and room rules
   square things up once the dimensions have settled. */
onBeforeSolve(function () { resolvePlanParams(); });
onAfterSolve(function () { solveRoomCons(); });


let navPath = []; // empty = root. [catId] = inside cat. [catId, subId] = inside subcat.
let searchQ = ""; // live library filter; non-empty overrides navPath with a flat result grid

// A model tile shows the model itself, rendered off-screen by thumbs.js. That
// is real WebGL work, so the grid is painted FIRST and the pictures are filled
// in afterwards, asynchronously: a search that matches 60 pieces shows its 60
// labels on the keystroke instead of blocking it on 60 renders. Renders are
// memoized by type, so a category you come back to fills in instantly.
function thumbTag(type) {
  if (hasThumb(type)) {
    const url = modelThumb(type);
    return url
      ? `<img class="furn-thumb" src="${escapeHTML(url)}" alt="" />`
      : blankThumb();
  }
  return `<span class="furn-thumb" data-thumb="${escapeHTML(type)}" aria-hidden="true"></span>`;
}

// A tile whose model cannot be drawn (no WebGL, a build that produced nothing)
// must not emit `<img src="">` — an empty src re-requests the PAGE url and
// fires a resource error. Reserve the space with a plain box instead.
function blankThumb() {
  return `<span class="furn-thumb" aria-hidden="true"></span>`;
}

// Navigation tiles are categories, not objects: they get their own glyph.
function navIcon(node) {
  const icon = /^ph-[a-z0-9-]+$/.test(node.icon || "") ? node.icon : "ph-folder";
  return `<i class="ph ${icon} furn-nav-icon"></i>`;
}

let _hydrateRun = 0;
let _thumbObserver = null;
async function hydrateThumbs(ui) {
  if (_thumbObserver) {
    _thumbObserver.disconnect();
    _thumbObserver = null;
  }
  const run = ++_hydrateRun; // a newer grid supersedes this one mid-flight
  await loadThumbCache();
  if (run !== _hydrateRun || !ui.isConnected) return;
  const pending = Array.from(ui.querySelectorAll("[data-thumb]"));
  if (!pending.length) return;
  // thumbAsync draws a picture the warm-up has not reached yet in short
  // steps off the critical path (a stored one resolves at once), so asking
  // for a whole screenful in one go never blocks the panel.
  const enqueue = (el) => {
    if (!el || !el.isConnected || !el.dataset.thumb) return;
    thumbAsync(el.dataset.thumb).then((url) => {
      if (!el.isConnected || !el.dataset.thumb) return;
      if (url) {
        const img = document.createElement("img");
        img.className = "furn-thumb";
        img.src = url;
        img.alt = "";
        el.replaceWith(img);
      } else {
        el.removeAttribute("data-thumb");
      }
    });
  };
  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        if (run !== _hydrateRun) return observer.disconnect();
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          enqueue(entry.target);
        });
      },
      { root: ui, rootMargin: "120px" },
    );
    _thumbObserver = observer;
    pending.forEach((el) => observer.observe(el));
  } else pending.forEach(enqueue);
}

function renderFurnUI() {
  const ui = document.getElementById("furnUI");
  if (!ui) return;

  var isTouch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || (navigator.maxTouchPoints || 0) > 0;

  let html = "";

  if (searchQ) {
    // flat, deduped result grid across every category. A piece matches when
    // every word of the query is in its label (active language or the Hebrew
    // base), its type id, the shelves it sits on ("bedroom", "kitchen") or its
    // everyday names (SEARCH_ALIASES: "dining", "couch", "basin").
    const words = searchQ.split(/\s+/).filter(Boolean);
    const hay = new Map();
    CATALOG.forEach(cat =>
      (cat.sub || []).forEach(sub =>
        (sub.items || []).forEach(type => {
          if (!FURN[type]) return;
          const shelf = [clabel(cat), cat.label, clabel(sub), sub.label].join(" ").toLowerCase();
          if (hay.has(type)) { hay.set(type, hay.get(type) + " " + shelf); return; }
          hay.set(type, [flabel(type), FURN[type].label, type.replace(/([a-z])([A-Z])/g, "$1 $2"),
            SEARCH_ALIASES[type]].filter(Boolean).join(" ").toLowerCase() + " " + shelf);
        })
      )
    );
    const matches = [];
    hay.forEach((text, type) => {
      if (words.every(w => text.includes(w))) matches.push(type);
    });
    html += `<div class="furn-grid">`;
    matches.slice(0, 60).forEach(type => {
      const label = escapeHTML(flabel(type));
      html += `<div class="furn-item" data-type="${escapeHTML(type)}" draggable="${isTouch ? 'false' : 'true'}" role="button" tabindex="0" aria-label="${label}" title="${label}">
        ${thumbTag(type)}
        <span>${label}</span>
      </div>`;
    });
    html += `</div>`;
    if (!matches.length)
      html = `<div class="t lib-empty">${t("lib_noresults")}</div>`;
    ui.innerHTML = html;
    hydrateThumbs(ui);
    ui.querySelectorAll(".furn-item").forEach(item => {
      item.addEventListener("click", () => addFurnItem(item.dataset.type));
      item.addEventListener("keydown", e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        addFurnItem(item.dataset.type);
      });
    });
    return;
  }

  if (navPath.length > 0) {
    const cat0 = CATALOG.find(c => c.id === navPath[0]);
    const sub0 = cat0 && navPath[1] ? (cat0.sub || []).find(s => s.id === navPath[1]) : null;
    html += `<div class="furn-crumbs">
      <button class="furn-cat" data-crumb="0">${t("library")}</button>`;
    if (cat0) html += `<span>›</span><button class="furn-cat" data-crumb="1">${escapeHTML(clabel(cat0))}</button>`;
    if (sub0) html += `<span>›</span><span>${escapeHTML(clabel(sub0))}</span>`;
    html += `</div>`;
  }

  if (S.placeType && FURN[S.placeType]) {
    html += `<div class="furn-place-banner">${escapeHTML(t("furn_place_armed", { name: flabel(S.placeType) }))}</div>`;
  }

  html += `<div class="furn-grid${navPath.length < 2 ? " furn-grid-nav" : ""}">`;

  if (navPath.length === 0) {
    // ROOT: Show Categories
    CATALOG.forEach(cat => {
      const label = escapeHTML(clabel(cat));
      html += `<div class="furn-item furn-nav" data-nav="${escapeHTML(cat.id)}" role="button" tabindex="0" aria-label="${label}" title="${label}">
        ${navIcon(cat)}
        <span>${label}</span>
      </div>`;
    });
  } else if (navPath.length === 1) {
    // LEVEL 1: Show Subcategories
    const activeCat = CATALOG.find(c => c.id === navPath[0]);
    if (activeCat && activeCat.sub) {
      activeCat.sub.forEach(sub => {
        const label = escapeHTML(clabel(sub));
        html += `<div class="furn-item furn-nav" data-nav="${escapeHTML(sub.id)}" role="button" tabindex="0" aria-label="${label}" title="${label}">
          ${navIcon(sub)}
          <span>${label}</span>
        </div>`;
      });
    }
  } else if (navPath.length === 2) {
    // LEVEL 2: Show Items
    const activeCat = CATALOG.find(c => c.id === navPath[0]);
    if (activeCat) {
      const activeSub = activeCat.sub.find(s => s.id === navPath[1]);
      if (activeSub && activeSub.items) {
        activeSub.items.forEach(type => {
          if (!FURN[type]) return;
          const label = escapeHTML(flabel(type));
          html += `<div class="furn-item" data-type="${escapeHTML(type)}" draggable="${isTouch ? 'false' : 'true'}" role="button" tabindex="0" aria-label="${label}" title="${label}">
            ${thumbTag(type)}
            <span>${label}</span>
          </div>`;
        });
      }
    }
  }

  html += `</div>`;
  ui.innerHTML = html;
  hydrateThumbs(ui);

  ui.querySelectorAll("[data-crumb]").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = parseInt(btn.getAttribute("data-crumb"), 10);
      navPath = navPath.slice(0, n);
      renderFurnUI();
    });
  });

  ui.querySelectorAll('.furn-item').forEach(item => {
    function activate() {
      if (item.dataset.type) {
        addFurnItem(item.dataset.type);
      } else if (item.dataset.nav) {
        navPath.push(item.dataset.nav);
        renderFurnUI();
      }
    }
    item.addEventListener('click', activate);
    item.addEventListener('keydown', e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      activate();
    });
  });
}

function fillFurnSel() {
  renderFurnUI();
}
fillFurnSel();
window.addEventListener("planner-place", function () {
  renderFurnUI();
});
window.addEventListener('catalogUpdated', function () {
  clearThumbCache(); // a new/edited catalog item may have changed its look
  renderFurnUI();
});
// The offscreen thumbnail renderer's GPU backend initialises asynchronously
// (three r185). Tiles drawn before it was live got flat art and were left
// uncached on purpose — repaint them now, WITHOUT clearing the cache.
window.addEventListener('thumbsReady', function () {
  renderFurnUI();
});

// live library search (input clears back to category browsing when emptied)
const furnSearch = document.getElementById("furnSearch");
if (furnSearch) {
  furnSearch.addEventListener("input", () => {
    searchQ = furnSearch.value.trim().toLowerCase();
    renderFurnUI();
  });
}

// re-render everything that has language-dependent text baked in
onLangChange(function () {
  fillFurnSel();
  fillProps();
  refreshTree();
  syncEnvUI();
  cadHudLang();
  render2D();
});

// scene data BEFORE the 3D render loop starts (its first frame runs synchronously)
defaultApartment();
rebuildProject(S, FURN);
/* Keep renderer setup out of synchronous boot. maybeInit3D() handles explicit
   view requests, and the post-boot idle task prepares the hidden shared scene.
   Friends/players already tolerate a scene that has not been created yet. */
initInteraction();
initUI();
initToolSearch();
initProRibbon();
initModeler();
/* Pulls js/modeler.js in only when saved custom models are waiting to register
   into FURN — see ensureModelLibrary(). A session with no custom furniture
   never fetches the 830 KB editor. */
ensureModelLibrary();
initCabinetUI();
bindCabinetHelpers({ layoutCab, doorSweeps });
initPlanSync();
initSite();
initMEP();
initSmartHome();
initFriends(); // friends list + realtime chat/voice + visits (after init3D: avatars need the scene)
initAgent(); // separate AI tutor/command host; Friends chat remains person-to-person
initTutorRuntime();
initExternalAgentBridge();
initPlanGizmo();
initCadHud(); // plan status bar + typed length/angle entry
/* After initCadHud, and after initUI: the chips sync the plan toolbar's
   padlock button, which initUI() binds, and they publish `layers:changed`,
   which js/view3d.js listens for. */
initLayersUI(); // work-set layer chips + the refused-drag unlock pill
/* After the chips exist and after initCadHud: the dock measures the whole
   cluster, and the status bar it must not sit under is created above. */
initRoomPalette(); // preset-room palette, shown with the room-stamp tool
initPlanToolsDock();
initPlanner3D();
initSurvey(); // drag the tool cluster to any edge of the 2D pane
initMobileShell(); // phone/foldable chrome: contextual row + five-slot bottom nav
initDimKnob(); // touch: numeric fields are scrubbed on a rotary dial, not typed
// last: autosave/recovery needs a fully built UI to render its recovery prompt,
// and the error net should not swallow a genuine boot failure above it
initPersistence({
  serialize: serialize,
  applyData: applyData,
  flash: flash,
  openModal: openModal,
});

/* Runtime UI customisation (uikit/), behind mf_uikit and off by default. It
   has to run after every chrome initialiser above, because it adopts the
   elements they built. The import is dynamic so a browser with the flag off
   never fetches the module at all, and a failure here must not take the app
   down with it — the layout is a convenience, the planner underneath it is
   not. */
var chromeCustomizationReady = Promise.resolve();
if (localStorage.getItem("mf_uikit") === "1") {
  chromeCustomizationReady = import("./uikit_host/index.js")
    .then(function (m) { m.initUIKit(); })
    .catch(function (e) { console.warn("uikit did not start", e); });
}

/* One initialization path for visible requests and post-paint background work.
   init3D() itself also shares its in-flight promise with other callers. */
var init3DQueued = false;
var blueprintOverviewPending = false;
var blueprintOverviewActive = false;
function maybeInit3D(background = false) {
  // Layout initializers can request 3D before the plan has painted.
  if (!window.__home3dBooted) return;
  if (has3D() || init3DQueued) return;
  init3DQueued = true;
  // Let the final pane layout settle before selecting the render-target size.
  setTimeout(function () {
    if (has3D()) { init3DQueued = false; return; }
    var L = document.getElementById("view-3d");
    if (!L || (!background && (!L.clientWidth || !L.clientHeight))) { init3DQueued = false; return; }
    init3D().then(function (ok) {
      if (!ok) return;
      var workspace = document.getElementById("center-canvas") || L;
      setSize(L.clientWidth || workspace.clientWidth || 1000, L.clientHeight || workspace.clientHeight || 650);
      if (blueprintOverviewPending) { blueprintOverviewPending = false; frameDollhouse(); }
      else frameView();
    }).catch(function (error) { console.error("3D initialization failed", error); })
      .finally(function () { init3DQueued = false; });
  }, 0);
}

const resizeAll = throttle(() => {
  maybeInit3D();
  if (has3D()) {
    var L = document.getElementById("view-3d");
    if (L) {
      setSize(L.clientWidth, L.clientHeight);
      if (blueprintOverviewActive && L.clientWidth && L.clientHeight) frameDollhouse();
    }
  }
  sizeCanvas();
  render2D();
});
/* The vertical-span probe (furniture_api.baseVSpan) answers "floor-standing"
   while three is still on the way and asks us back once it can measure the
   real model. Repaint so stack heights, elevation bands and marker clearances
   settle on the true numbers. */
window.addEventListener("vspan:ready", function () { render2D(); });
window.addEventListener("resize", resizeAll);
/* The pixel floor under the split has to survive the window getting smaller:
   the share that left a workable plan on a wide screen is a sliver on a narrow
   one, and nothing else re-applies it. */
window.addEventListener("resize", function () { setSplit(curSplit, false); });
if (window.ResizeObserver) {
  var ro = new ResizeObserver(resizeAll);
  var v3 = document.getElementById("view-3d");
  var v2 = document.getElementById("view-2d");
  if (v3) ro.observe(v3);
  if (v2) ro.observe(v2);
}

var resizer = document.getElementById("view-resizer");
var view3d = document.getElementById("view-3d");
var view2d = document.getElementById("view-2d");
if (view3d) {
  view3d.addEventListener("pointerdown", function () { blueprintOverviewActive = false; });
  view3d.addEventListener("wheel", function () { blueprintOverviewActive = false; }, { passive: true });
}

/* The two "drag to orbit / drag item…" bubbles are first-run help, and they
   sit right where the model is. Once a view has actually been used the hint
   has done its job, so it fades out for good (CSS body.used-2d/.used-3d). */
["2d", "3d"].forEach(function (v) {
  var el = v === "2d" ? view2d : view3d;
  if (!el) return;
  var mark = function () {
    document.body.classList.add("used-" + v);
    el.removeEventListener("pointerdown", mark);
    el.removeEventListener("wheel", mark);
  };
  el.addEventListener("pointerdown", mark);
  el.addEventListener("wheel", mark, { passive: true });
});
var centerCanvas = document.getElementById("center-canvas");
var splitOrientationBtn = document.getElementById("splitOrientationBtn");
var SPLIT_KEY = "home3d_viewsplit", // persisted 3D pane share %
  SPLIT_DIR_KEY = "home3d_splitdir";

// Apply the panes' flex ratio, then pin the 2D plan to the same on-screen
// pane heights. sizeCanvas() shifts OX/OY by half the size delta so the world
// point that was at the canvas centre stays there — a pan the user made is
// kept, instead of snapping back to the model's bounding-box centre. We
// resize both surfaces directly here rather than via the throttled `resizeAll`,
// so the split tracks the drag frame-for-frame without a rAF lag.
function syncSurfaces() {
  maybeInit3D();
  if (has3D() && view3d) setSize(view3d.clientWidth, view3d.clientHeight);
  sizeCanvas();
  render2D();
}
var curSplit = 50; // last-applied top-pane %, persisted on drag end
/* A share is not a size. 88% of a 1165px canvas is a 140px plan — wide enough
   for the tool rail and nothing else — so the ratio is clamped in PIXELS too:
   neither pane drops below a strip you could actually work in, whenever the
   canvas is big enough to give both of them that much. Below that the
   percentage limits stand, because on a small screen a lopsided split is the
   point (and js/plan_tools_dock.js compacts the plan's chrome to match).

   The figure is chosen against that module's own thresholds: the narrowest
   plan the divider can leave still DOCKS its panels, compacted to icons,
   rather than falling back to the phone rail — so dragging the split to its
   limit never takes the layer panel away. */
var MIN_PANE = 320;
function splitLimits() {
  if (!centerCanvas || !view3d || !view2d) return { lo: 12, hi: 88 };
  var side = splitIsSide();
  /* The share is of the CONTAINER, but the two panes do not have the container
     to themselves — the divider is in it, and so is anything else docked
     alongside. Measuring the panes is what makes MIN_PANE mean that much plan,
     instead of that much minus whatever else is in the row. */
  var container = side ? centerCanvas.clientWidth : centerCanvas.clientHeight;
  var a = side ? view3d.offsetWidth : view3d.offsetHeight;
  var b = side ? view2d.offsetWidth : view2d.offsetHeight;
  var panes = a + b;
  if (!container || !a || !b || panes < MIN_PANE * 2) return { lo: 12, hi: 88 };
  return {
    lo: Math.max(12, (MIN_PANE / container) * 100),
    hi: Math.min(88, ((panes - MIN_PANE) / container) * 100),
  };
}
function setSplit(topPct, persist) {
  if (!view3d) return;
  var limit = splitLimits();
  curSplit = Math.max(limit.lo, Math.min(limit.hi, topPct));
  view3d.style.flex = "0 0 " + curSplit + "%";
  if (view2d) view2d.style.flex = "1 1 auto";
  syncSurfaces();
  if (persist) persistSplit();
}
function persistSplit() {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(curSplit)));
  } catch (_) {}
}

function splitIsSide() {
  return document.body.classList.contains("split-side");
}
function syncSplitOrientationButton() {
  if (!splitOrientationBtn || !centerCanvas) return;
  var split = !centerCanvas.classList.contains("max-view-2d") &&
    !centerCanvas.classList.contains("max-view-3d");
  splitOrientationBtn.hidden = !split || document.body.classList.contains("compact-nav");
  var side = splitIsSide();
  splitOrientationBtn.setAttribute("aria-pressed", side ? "true" : "false");
  var key = side ? "split_stack" : "split_side";
  splitOrientationBtn.title = t(key);
  splitOrientationBtn.setAttribute("aria-label", t(key));
  var icon = splitOrientationBtn.querySelector("i");
  if (icon) icon.className = side ? "ph ph-rows" : "ph ph-columns";
}
function setSplitDirection(side, persist) {
  document.body.classList.toggle("split-side", !!side);
  if (persist) {
    try { localStorage.setItem(SPLIT_DIR_KEY, side ? "side" : "stack"); } catch (_) {}
  }
  syncSplitOrientationButton();
  setSplit(curSplit, false);
}

// Restore the user's saved split ratio (persists across interactions/reloads).
var savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY));
if (!isNaN(savedSplit)) setSplit(savedSplit, false);
var savedSplitDir = null;
try { savedSplitDir = localStorage.getItem(SPLIT_DIR_KEY); } catch (_) {}
setSplitDirection(savedSplitDir === "side", false);

if (splitOrientationBtn) {
  splitOrientationBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    setSplitDirection(!splitIsSide(), true);
  });
}

if (resizer) {
  var isR = false;
  function startR() {
    isR = true;
    document.body.style.cursor = splitIsSide() ? "col-resize" : "row-resize";
  }
  function endR() {
    if (!isR) return;
    isR = false;
    document.body.style.cursor = "";
    persistSplit(); // write once on release, not every drag frame
  }
  var moveR = throttle((clientX, clientY) => {
    if (!isR || !centerCanvas) return;
    var r = centerCanvas.getBoundingClientRect();
    var side = splitIsSide(), pos = side ? clientX - r.left : clientY - r.top,
      span = side ? r.width : r.height;
    if (pos < 100) pos = 100;
    if (span - pos < 100) pos = span - 100;
    setSplit((pos / span) * 100, false);
  });
  resizer.addEventListener("mousedown", function (e) {
    startR();
    e.preventDefault();
  });
  resizer.addEventListener("touchstart", function () { startR(); }, {
    passive: true,
  });
  window.addEventListener("mousemove", function (e) {
    moveR(e.clientX, e.clientY);
  });
  window.addEventListener(
    "touchmove",
    function (e) {
      moveR(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true },
  );
  window.addEventListener("mouseup", endR);
  window.addEventListener("touchend", endR);
  resizer.addEventListener("dblclick", function () { setSplit(50, true); });
}

// ---- per-view maximize (full-screen a single pane; restores saved split) ----
function setMaximized(viewId) {
  if (!centerCanvas) return;
  var cls3 = "max-view-3d",
    cls2 = "max-view-2d";
  var wasMax =
    (viewId === "view-3d" && centerCanvas.classList.contains(cls3)) ||
    (viewId === "view-2d" && centerCanvas.classList.contains(cls2));
  centerCanvas.classList.remove(cls3, cls2);
  if (!wasMax) centerCanvas.classList.add("max-" + viewId);
  // Update both buttons' icon + tooltip to reflect current state.
  document.querySelectorAll(".view-max-btn").forEach(function (btn) {
    var on = centerCanvas.classList.contains("max-" + btn.dataset.maxView);
    var icon = btn.querySelector("i");
    if (icon) icon.className = on ? "ph ph-arrows-in" : "ph ph-arrows-out";
    btn.title = t(on ? "restoreView" : "maximizeView");
  });
  syncPlannerViewport(centerCanvas.classList.contains("max-view-3d") ? "3d" : centerCanvas.classList.contains("max-view-2d") ? "plan" : "split");
  syncSurfaces();
  syncMobileNav();
  syncSplitOrientationButton();
  // A contextual menu belongs to the pane it was opened over; switching panes
  // used to leave it floating above whatever came next.
  if (window.__hideCtxMenu) window.__hideCtxMenu();
}
// Highlight the bottom-nav view button matching the current pane state.
/* The nav's View slot shows which pane is up (icon + label), so a change of
   pane has to reach it. mobile_shell.js owns the button contents; this is only
   the "something moved" tap on the shoulder. */
function syncMobileNav() {
  refreshMobileShell();
}
// Bottom-nav view switching (mobile). Idempotent: setMaximized toggles, so we
// only call it when the target state differs from the current one.
function setViewMode(mode) {
  if (!centerCanvas) return;
  var is2 = centerCanvas.classList.contains("max-view-2d");
  var is3 = centerCanvas.classList.contains("max-view-3d");
  if (mode === "plan" && !is2) setMaximized("view-2d");
  else if (mode === "3d" && !is3) setMaximized("view-3d");
  else if (mode === "split" && (is2 || is3)) setMaximized(is2 ? "view-2d" : "view-3d");
  else syncMobileNav();
  syncSplitOrientationButton();
  try {
    // Remember the cover-screen choice independently of desktop preferences.
    if (isCompactPhoneViewport()) sessionStorage.setItem(VIEWMODE_KEY, mode);
  } catch (_) {}
}
window.__setViewMode = setViewMode;
window.addEventListener('blueprint:converted', function () {
  blueprintOverviewActive = true;
  blueprintOverviewPending = true;
  setViewMode('3d');
  if (has3D()) requestAnimationFrame(function () {
    var pane = document.getElementById('view-3d');
    if (pane) setSize(pane.clientWidth, pane.clientHeight);
    blueprintOverviewPending = false;
    frameDollhouse();
  });
  else maybeInit3D();
});
window.addEventListener("blueprint:trace-walls", function () {
  // A trace command can be launched while 3D is maximized. Bring the calibrated
  // sheet into view instead of arming an invisible wall tool behind that pane.
  setViewMode("plan");
});
document.querySelectorAll(".view-max-btn").forEach(function (btn) {
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    setMaximized(btn.dataset.maxView);
  });
});
// Phones (Fold cover screen included): the stacked split is too cramped, so
// start in single-pane 2D unless the user already chose a view this session.
var VIEWMODE_KEY = "home3d_mobile_view";
// Read the viewport directly each time: cached MediaQueryList objects can go
// stale in some WebViews/emulated viewports (fold state changes included).
// A phone rotated to landscape is wider than the portrait breakpoint but its
// short edge leaves even less room for a stacked split, so treat it as a phone
// until the viewport is tablet-sized in both dimensions.
function isCompactPhoneViewport() {
  return windowChromePosture().phone;
}
function applyPhoneView(preserveExisting = false) {
  if (preserveExisting && centerCanvas) {
    var current = centerCanvas.classList.contains('max-view-3d') ? '3d' : centerCanvas.classList.contains('max-view-2d') ? 'plan' : 'split';
    if (current !== 'split') { setViewMode(current); return; }
  }
  if (isCompactPhoneViewport()) {
    // Phone / Fold cover screen: stacked split is too cramped — go single-pane.
    var saved = sessionStorage.getItem(VIEWMODE_KEY);
    setViewMode(saved && saved !== "split" ? saved : "plan");
  } else {
    // Keep Planner as the default when unfolding or returning to desktop.
    setViewMode(localStorage.getItem("home3d_viewmode") || "plan");
  }
}
// React to folding/unfolding (the viewport width jumps across 768px). Watch
// plain resize rather than the MediaQueryList change event — some WebViews
// (and emulated viewports) don't dispatch the latter reliably.
var wasPhone = isCompactPhoneViewport();
function checkPhoneCrossing() {
  if (isCompactPhoneViewport() === wasPhone) return;
  wasPhone = isCompactPhoneViewport();
  applyPhoneView(true);
}
window.addEventListener("resize", checkPhoneCrossing);
window.addEventListener("mf-posture", checkPhoneCrossing);
window.addEventListener("mf-posture", syncSplitOrientationButton);
onLangChange(syncSplitOrientationButton);
new ResizeObserver(checkPhoneCrossing).observe(document.body);
applyPhoneView();
syncMobileNav();

// Drawing needs the whole plan on phones and foldables. If a drawing command
// is picked while Split/3D is showing, promote the 2D pane before the first
// canvas gesture; otherwise the wall palette can consume almost the entire
// half-height plan and leave nowhere useful to draw.
var mobileToolRail = document.getElementById("plan-toolbar");
if (mobileToolRail) {
  mobileToolRail.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-tool]");
    if (!btn || btn.dataset.tool === "select" || window.innerWidth > 1024) return;
    if (!centerCanvas.classList.contains("max-view-2d")) setViewMode("plan");
  });
}

// ---- contextual (right-click) menu on the 2D plan ----
var ctxMenu = document.getElementById("ctx-menu");
var planCanvas = document.getElementById("plan");
function hideCtxMenu() {
  if (ctxMenu) ctxMenu.classList.remove("on", "as-sheet");
}
window.__hideCtxMenu = hideCtxMenu;
function ctxItems() {
  // Build the action list from what is currently selected.
  var sel = S.sel;
  var kind = sel ? sel.kind : null;
  var items = [];
  if (kind === "wall") {
    items.push({ key: "ctx_addOpening", icon: "ph ph-door", run: function () { placeOpeningOnSelected("door"); } });
    items.push({ key: "ctx_wallType", icon: "ph ph-ruler", run: focusInspector });
    items.push({ key: "ctx_delete", icon: "ph ph-trash", danger: true, run: deleteSel });
  } else if (kind === "item" || kind === "items") {
    items.push({ key: "ctx_duplicate", icon: "ph ph-copy", run: dupSel });
    if (kind === "item") {
      var it = sel.ref;
      items.push({
        key: it.locked ? "ctx_unlock" : "ctx_lock",
        icon: it.locked ? "ph ph-lock-key-open" : "ph ph-lock-key",
        run: function () {
          it.locked = !it.locked;
          fillProps();
          render2D();
        },
      });
    }
    items.push({ key: "ctx_delete", icon: "ph ph-trash", danger: true, run: deleteSel });
  } else if (kind === "opening") {
    items.push({ key: "ctx_editProps", icon: "ph ph-sliders", run: focusInspector });
    items.push({ key: "ctx_delete", icon: "ph ph-trash", danger: true, run: deleteSel });
  } else if (kind === "marker") {
    items.push({ key: "ctx_editProps", icon: "ph ph-sliders", run: focusInspector });
    if (markerItem(sel.ref))
      items.push({
        key: "mk_release",
        icon: "ph ph-link-break",
        run: function () {
          pushHistory();
          detachMarker(sel.ref);
          fillProps();
          refreshTree();
          render2D();
        },
      });
    items.push({ key: "ctx_delete", icon: "ph ph-trash", danger: true, run: deleteSel });
  } else if (kind === "room") {
    var rKey = sel.ref,
      rHid = roomHidden(rKey);
    items.push({ key: "ctx_editProps", icon: "ph ph-sliders", run: focusInspector });
    items.push({
      key: rHid ? "tr_showRoom" : "tr_hideRoom",
      icon: rHid ? "ph ph-eye" : "ph ph-eye-slash",
      run: function () {
        pushHistory();
        var m = (S.roomMeta[rKey] = S.roomMeta[rKey] || {});
        m.hidden = !m.hidden;
        S.dirty3D = true;
        refreshTree();
        render2D();
      },
    });
    items.push({ key: "ctx_delete", icon: "ph ph-trash", danger: true, run: deleteSel });
  }
  return items;
}
function focusInspector() {
  fillProps();
  // on a phone or a fold the inspector is a sheet: open it, do not scroll to it
  if (document.body.classList.contains("compact-nav")) {
    window.dispatchEvent(new Event("planner-open-props"));
    return;
  }
  var insp = document.getElementById("right-inspector");
  if (insp) insp.scrollIntoView({ block: "nearest" });
}
function showCtxMenu(clientX, clientY) {
  if (!ctxMenu) return;
  var items = ctxItems();
  if (!items.length) {
    hideCtxMenu();
    return;
  }
  ctxMenu.innerHTML = "";
  items.forEach(function (a) {
    var b = document.createElement("button");
    if (a.danger) b.className = "danger";
    b.innerHTML = '<i class="' + a.icon + '"></i><span>' + t(a.key) + "</span>";
    b.addEventListener("click", function () {
      hideCtxMenu();
      a.run();
    });
    ctxMenu.appendChild(b);
  });
  ctxMenu.classList.add("on");
  /* On a phone a menu anchored at the touch point opens UNDER the hand that
     summoned it. Dock it to the bottom edge instead (CSS turns it into a full
     width sheet) and let the finger stay where it is. */
  if (document.body.classList.contains("compact-nav")) {
    ctxMenu.classList.add("as-sheet");
    ctxMenu.style.left = "";
    ctxMenu.style.top = "";
    return;
  }
  ctxMenu.classList.remove("as-sheet");
  // Position within the viewport (flip if it would overflow).
  var mw = ctxMenu.offsetWidth,
    mh = ctxMenu.offsetHeight;
  var x = Math.min(clientX, window.innerWidth - mw - 8);
  var y = Math.min(clientY, window.innerHeight - mh - 8);
  ctxMenu.style.left = Math.max(8, x) + "px";
  ctxMenu.style.top = Math.max(8, y) + "px";
}
if (planCanvas) {
  planCanvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    // Only offer a contextual menu with the select tool active.
    if (S.tool && S.tool !== "select") {
      hideCtxMenu();
      return;
    }
    var r = planCanvas.getBoundingClientRect();
    selectAtScreen(e.clientX - r.left, e.clientY - r.top);
    showCtxMenu(e.clientX, e.clientY);
  });
  /* Touch has no right button: interaction.js turns a press held still into
     this event (having already backed out the drag it started). Same menu,
     same selection step — only the trigger differs. */
  planCanvas.addEventListener("plan-longpress", function (e) {
    if (S.tool && S.tool !== "select") return;
    var r = planCanvas.getBoundingClientRect();
    selectAtScreen(e.detail.clientX - r.left, e.detail.clientY - r.top);
    showCtxMenu(e.detail.clientX, e.detail.clientY);
    if (navigator.vibrate) navigator.vibrate(12); // the press "landed" cue
  });
  // Dismiss on any outside interaction.
  window.addEventListener("pointerdown", function (e) {
    if (ctxMenu && !ctxMenu.contains(e.target)) hideCtxMenu();
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideCtxMenu();
  });
  window.addEventListener("blur", hideCtxMenu);
}

fitView();
render2D();
fillProps();
syncEnvUI();
refreshTree(); // populates the tree (if open) + the live cost estimate
maybeInit3D();
if (has3D()) {
  resizeAll();
  frameView();
}

// Reveal only after the final layout/plan pass and optional saved UI adoption.
chromeCustomizationReady.then(function () {
  window.dispatchEvent(new CustomEvent("planner-boot-ready", { detail: "main" }));
});

// Warm the shared 3D/dollhouse scene after the completed plan has painted.
// A visible 3D request can still initialize immediately through maybeInit3D.
window.addEventListener("planner-boot-ready", function prepareBackground3D() {
  if (!window.__home3dBooted) return;
  window.removeEventListener("planner-boot-ready", prepareBackground3D);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (window.requestIdleCallback) window.requestIdleCallback(() => maybeInit3D(true), { timeout: 2000 });
      else setTimeout(() => maybeInit3D(true), 200);
    });
  });
});
