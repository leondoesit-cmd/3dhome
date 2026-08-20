// Entry point: wires the modules together and boots the app.
import { S, throttle } from "./state.js";
import { onBeforeSolve, onAfterSolve } from "./wall_constraints.js";
import { resolvePlanParams } from "./plan_params.js";
import { solveRoomCons } from "./room_cons.js";

import { roomHidden } from "./geometry.js";
import { pushHistory } from "./history.js";
import { FURN, flabel, clabel, defaultScene } from "./furniture.js";
import { init3D, has3D, frameView, setSize } from "./view3d.js";
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
import { initModeler, refreshCatalogSelect } from "./modeler.js";
import { initCabinetUI } from "./ui_cabinet.js";
import { initSite } from "./ui_site.js";
import { initMEP } from "./ui_mep.js";
import { initSmartHome } from "./ui_smarthome.js";
import { initFriends } from "./ui_friends.js";
import { markerItem, detachMarker } from "./markers.js";
import { initCadHud, applyLangLabels as cadHudLang } from "./cad_hud.js";
import { initMobileShell, refreshMobileShell } from "./mobile_shell.js";
import { rebuildProject } from "./core/project.js";

// apply static translations for the current language before anything renders
applyStatic();

import { addFurnItem } from "./ui.js";
import { CATALOG } from "./furniture.js";
import { modelThumb, hasThumb, clearThumbCache, loadThumbCache } from "./thumbs.js";
import { escapeHTML } from "./safe.js";

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
// in afterwards, a time-slice per frame: a search that matches 60 pieces shows
// its 60 labels on the keystroke instead of blocking it on 60 renders. Renders
// are memoized by type, so a category you come back to fills in instantly.
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
  const queue = [];
  let scheduled = false;
  // setTimeout, not requestAnimationFrame: rAF is suspended while the page is
  // occluded/backgrounded, which would leave a panel full of blank tiles that
  // only fill in if the compositor happens to wake up.
  const step = () => {
    scheduled = false;
    if (run !== _hydrateRun) return;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 8) {
      const el = queue.shift(),
        url = modelThumb(el.dataset.thumb);
      if (!el.isConnected) continue;
      if (url) {
        const img = document.createElement("img");
        img.className = "furn-thumb";
        img.src = url;
        img.alt = "";
        el.replaceWith(img);
      } else {
        el.removeAttribute("data-thumb");
      }
    }
    if (queue.length) {
      scheduled = true;
      setTimeout(step, 0);
    }
  };
  const enqueue = (el) => {
    if (!el || !el.isConnected || !el.dataset.thumb) return;
    queue.push(el);
    if (!scheduled) {
      scheduled = true;
      setTimeout(step, 0);
    }
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

  let html = "";

  if (searchQ) {
    // flat, deduped result grid across every category (matches the item's
    // label in the active language and the Hebrew base label)
    const seen = new Set();
    const matches = [];
    CATALOG.forEach(cat =>
      (cat.sub || []).forEach(sub =>
        (sub.items || []).forEach(type => {
          if (seen.has(type) || !FURN[type]) return;
          seen.add(type);
          const lbl = flabel(type) || "";
          const base = FURN[type].label || "";
          if (
            lbl.toLowerCase().includes(searchQ) ||
            base.toLowerCase().includes(searchQ)
          )
            matches.push(type);
        })
      )
    );
    html += `<div class="furn-grid">`;
    matches.slice(0, 60).forEach(type => {
      html += `<div class="furn-item" data-type="${escapeHTML(type)}" draggable="true">
        ${thumbTag(type)}
        <span>${escapeHTML(flabel(type))}</span>
      </div>`;
    });
    html += `</div>`;
    if (!matches.length)
      html = `<div class="t lib-empty">${t("lib_noresults")}</div>`;
    ui.innerHTML = html;
    hydrateThumbs(ui);
    ui.querySelectorAll(".furn-item").forEach(item => {
      item.addEventListener("click", () => addFurnItem(item.dataset.type));
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

  html += `<div class="furn-grid">`;

  if (navPath.length === 0) {
    // ROOT: Show Categories
    CATALOG.forEach(cat => {
      html += `<div class="furn-item furn-nav" data-nav="${escapeHTML(cat.id)}">
        ${navIcon(cat)}
        <span>${escapeHTML(clabel(cat))}</span>
      </div>`;
    });
  } else if (navPath.length === 1) {
    // LEVEL 1: Show Subcategories
    const activeCat = CATALOG.find(c => c.id === navPath[0]);
    if (activeCat && activeCat.sub) {
      activeCat.sub.forEach(sub => {
        html += `<div class="furn-item furn-nav" data-nav="${escapeHTML(sub.id)}">
          ${navIcon(sub)}
          <span>${escapeHTML(clabel(sub))}</span>
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
          html += `<div class="furn-item" data-type="${escapeHTML(type)}" draggable="true">
            ${thumbTag(type)}
            <span>${escapeHTML(flabel(type))}</span>
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
    item.addEventListener('click', (e) => {
      if (item.dataset.type) {
        addFurnItem(item.dataset.type);
      } else if (item.dataset.nav) {
        navPath.push(item.dataset.nav);
        renderFurnUI();
      }
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
defaultScene();
rebuildProject(S, FURN);
init3D();
initInteraction();
initUI();
initModeler();
initCabinetUI();
initSite();
initMEP();
initSmartHome();
initFriends(); // friends list + realtime chat/voice + visits (after init3D: avatars need the scene)
initPlanGizmo();
initCadHud(); // plan status bar + typed length/angle entry
initMobileShell(); // phone/foldable chrome: contextual row + five-slot bottom nav
// last: autosave/recovery needs a fully built UI to render its recovery prompt,
// and the error net should not swallow a genuine boot failure above it
initPersistence({
  serialize: serialize,
  applyData: applyData,
  flash: flash,
  openModal: openModal,
});
window.__home3dBooted = true;

const resizeAll = throttle(() => {
  if (has3D) {
    var L = document.getElementById("view-3d");
    if (L) setSize(L.clientWidth, L.clientHeight);
  }
  sizeCanvas();
  render2D();
});
window.addEventListener("resize", resizeAll);
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
var SPLIT_KEY = "home3d_viewsplit"; // persisted top-pane (3D) height %

// Apply the panes' flex ratio, then pin the 2D plan to the same on-screen
// pane heights. sizeCanvas() shifts OX/OY by half the size delta so the world
// point that was at the canvas centre stays there — a pan the user made is
// kept, instead of snapping back to the model's bounding-box centre. We
// resize both surfaces directly here rather than via the throttled `resizeAll`,
// so the split tracks the drag frame-for-frame without a rAF lag.
function syncSurfaces() {
  if (has3D && view3d) setSize(view3d.clientWidth, view3d.clientHeight);
  sizeCanvas();
  render2D();
}
var curSplit = 50; // last-applied top-pane %, persisted on drag end
function setSplit(topPct, persist) {
  if (!view3d) return;
  curSplit = Math.max(12, Math.min(88, topPct));
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

// Restore the user's saved split ratio (persists across interactions/reloads).
var savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY));
if (!isNaN(savedSplit)) setSplit(savedSplit, false);

if (resizer) {
  var isR = false;
  function startR() {
    isR = true;
    document.body.style.cursor = "row-resize";
  }
  function endR() {
    if (!isR) return;
    isR = false;
    document.body.style.cursor = "";
    persistSplit(); // write once on release, not every drag frame
  }
  var moveR = throttle((clientY) => {
    if (!isR || !centerCanvas) return;
    var r = centerCanvas.getBoundingClientRect();
    var topH = clientY - r.top;
    if (topH < 100) topH = 100;
    if (r.height - topH < 100) topH = r.height - 100;
    setSplit((topH / r.height) * 100, false);
  });
  resizer.addEventListener("mousedown", function (e) {
    startR();
    e.preventDefault();
  });
  resizer.addEventListener("touchstart", function () { startR(); }, {
    passive: true,
  });
  window.addEventListener("mousemove", function (e) {
    moveR(e.clientY);
  });
  window.addEventListener(
    "touchmove",
    function (e) {
      moveR(e.touches[0].clientY);
    },
    { passive: true },
  );
  window.addEventListener("mouseup", endR);
  window.addEventListener("touchend", endR);
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
  syncSurfaces();
  syncMobileNav();
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
  try {
    // Only remember choices made on the phone layout, so unfolding (which
    // forces "split") doesn't clobber the preferred cover-screen view.
    if (isCompactPhoneViewport()) sessionStorage.setItem(VIEWMODE_KEY, mode);
  } catch (_) {}
}
window.__setViewMode = setViewMode;
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
  return window.innerWidth <= 768 || (window.innerWidth <= 1024 && window.innerHeight <= 500);
}
function applyPhoneView() {
  if (isCompactPhoneViewport()) {
    // Phone / Fold cover screen: stacked split is too cramped — go single-pane.
    var saved = sessionStorage.getItem(VIEWMODE_KEY);
    setViewMode(saved && saved !== "split" ? saved : "plan");
  } else {
    // Unfolded / tablet / desktop: there's room for both panes again.
    setViewMode("split");
  }
}
// React to folding/unfolding (the viewport width jumps across 768px). Watch
// plain resize rather than the MediaQueryList change event — some WebViews
// (and emulated viewports) don't dispatch the latter reliably.
var wasPhone = isCompactPhoneViewport();
function checkPhoneCrossing() {
  if (isCompactPhoneViewport() === wasPhone) return;
  wasPhone = isCompactPhoneViewport();
  applyPhoneView();
}
window.addEventListener("resize", checkPhoneCrossing);
new ResizeObserver(checkPhoneCrossing).observe(document.body);
if (isCompactPhoneViewport()) applyPhoneView();
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
  var insp = document.getElementById("right-inspector");
  if (insp) insp.scrollIntoView({ block: "nearest" });
  fillProps();
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
if (has3D) {
  resizeAll();
  frameView();
}
