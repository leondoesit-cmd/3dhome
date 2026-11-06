/* The planner's mobile drawers, foldable layout, topbar menus and action
   dispatch, lifted out of initUI, split out of js/ui/init_ui.js. It shares the
   editor's state through live imports from ./init_ui.js. */
import { initDropdownMenus } from "../dropdown_menus.js";
import { mountHistoryPanel } from "../history.js";
import { S } from "../state.js";
import { renderParams } from "../ui_params.js";
import { initWarnPanel } from "../ui_warn.js";

// lifted out of initUI()
function wireMobileDrawers() {
  // Mobile drawer toggles
  document.getElementById("toggle-left") &&
    document
      .getElementById("toggle-left")
      .addEventListener("click", function (e) {
        document.body.classList.toggle("show-left");
        document.body.classList.remove("show-right");
        syncNavPanels();
      });
  document.getElementById("toggle-right") &&
    document
      .getElementById("toggle-right")
      .addEventListener("click", function (e) {
        document.body.classList.toggle("show-right");
        document.body.classList.remove("show-left");
        syncNavPanels();
      });
  document.getElementById("center-canvas") &&
    document
      .getElementById("center-canvas")
      .addEventListener("click", function (e) {
        /* The hidden tool rail lives inside the canvas, and the fold rail and
           the pro catalog run tools by clicking its buttons: that is a command,
           not a tap on the plan, so it must not close the docked panels. */
        if (e.target && e.target.closest && e.target.closest("#plan-toolbar")) return;
        document.body.classList.remove("show-left");
        document.body.classList.remove("show-right");
        syncNavPanels();
      });

  // Mobile bottom nav + backdrop
  function closeDrawers() {
    document.body.classList.remove("show-left", "show-right");
    syncNavPanels();
  }
  /* The nav's two panel buttons are toggles, so they have to read as pressed
     while their drawer is open — otherwise the only way to tell whether a tap
     landed is to look for the drawer that is covering the screen anyway. The
     three view buttons are highlighted from main.js (syncMobileNav). */
  function syncNavPanels() {
    var b = document.body;
    document.querySelectorAll("#mobile-nav [data-mnav]").forEach(function (el) {
      var k = el.dataset.mnav;
      if (k !== "left" && k !== "right") return;
      var open = b.classList.contains(k === "left" ? "show-left" : "show-right");
      el.classList.toggle("active", open);
      el.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  var backdrop = document.getElementById("drawer-backdrop");
  backdrop && backdrop.addEventListener("click", closeDrawers);

  /* Swipe a drawer back off the edge it came from. The backdrop tap already
     closes it, but on a phone the drawer covers most of the screen and the
     sliver of backdrop left over is a poor target — the gesture is the one
     that needs no aiming. Direction is per-drawer and mirrored for RTL, so
     "away from the edge it is anchored to" always means the same thing. */
  ["left-sidebar", "right-inspector"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var sx = 0,
      sy = 0,
      live = false;
    el.addEventListener(
      "touchstart",
      function (e) {
        live = e.touches.length === 1;
        if (!live) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
      },
      { passive: true },
    );
    el.addEventListener(
      "touchmove",
      function (e) {
        if (!live || e.touches.length !== 1) return;
        var dx = e.touches[0].clientX - sx,
          dy = e.touches[0].clientY - sy;
        // A mostly-vertical drag is the panel's own scroll; leave it alone.
        if (Math.abs(dy) > Math.abs(dx)) {
          live = false;
          return;
        }
        var rtl = document.documentElement.dir === "rtl";
        var outward = id === "left-sidebar" ? (rtl ? 1 : -1) : rtl ? -1 : 1;
        if (dx * outward > 70) {
          live = false;
          closeDrawers();
        }
      },
      { passive: true },
    );
    el.addEventListener("touchend", function () {
      live = false;
    });
  });

  /* The bottom nav itself is owned by js/mobile_shell.js (View / Tools / Add /
     Properties / More, each opening a sheet). Only the drawer plumbing above —
     backdrop tap, outward swipe, closeDrawers — is still shared with it. */
  syncNavPanels();
}

// lifted out of initUI()
function wireFoldablesMenusAndDispatch(applyCompactNav, runAction) {
  window.addEventListener("resize", applyCompactNav);
  applyCompactNav();

  // Galaxy Fold (and other foldables): when the app spans both halves of an
  // unfolded screen, tag the body so CSS can lay the 2D/3D panes side by side
  // across the hinge instead of stacking them over it. Two postures, opposite
  // answers: a vertical crease (side-by-side segments) wants the panes in a
  // row so the seam falls between them; a horizontal crease (a laptop-style
  // half-open book) wants them stacked, for the same reason.
  function foldMq(list) {
    return list
      .map(function (q) {
        try {
          return window.matchMedia(q);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  }
  var vFoldQueries = foldMq([
    "(horizontal-viewport-segments: 2)",
    "(screen-spanning: single-fold-vertical)",
  ]);
  var hFoldQueries = foldMq([
    "(vertical-viewport-segments: 2)",
    "(screen-spanning: single-fold-horizontal)",
  ]);
  function anyMatch(qs) {
    return qs.some(function (mq) {
      return mq.matches;
    });
  }
  function applyFoldSpan() {
    document.body.classList.toggle("fold-span", anyMatch(vFoldQueries));
    document.body.classList.toggle("fold-stack", anyMatch(hFoldQueries));
  }
  vFoldQueries.concat(hFoldQueries).forEach(function (mq) {
    mq.addEventListener
      ? mq.addEventListener("change", applyFoldSpan)
      : mq.addListener(applyFoldSpan);
  });
  applyFoldSpan();

  // Topbar dropdown menus (File / Edit / Export / More). Portaled to <body>
  // because the glass topbar's backdrop-filter would clip a position:fixed
  // child. Open/close/pin/path live in js/dropdown_menus.js so customize-mode
  // pinning and nested submenus cannot drift from a click on a trigger.
  initDropdownMenus(document, {
    onAction: function (act) { runAction(act); },
    selectionKind: function () { return S.sel ? S.sel.kind : null; },
  });

  // Collapsible panel sections (click header to fold)
  document.querySelectorAll(".panel-section > h3").forEach(function (h) {
    h.addEventListener("click", function () {
      h.parentElement.classList.toggle("collapsed");
    });
  });
  // constraint-engine warning list (js/ui_warn.js)
  initWarnPanel();
  renderParams(); // the plan-parameter list is generated, like the warning list
  // the edit tree (js/ui_history.js), scoped to whatever is selected
  mountHistoryPanel(document.getElementById("planHist"));

  function handleActionClick(e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute("data-act");
    if (!act) {
      // try parent
      var p = e.target.closest("button");
      if (p) act = p.getAttribute("data-act");
      if (!act) return;
    }
    runAction(act, e); // the click itself, so an action can read its modifiers
  }

  // Single dispatch point for every named action. Menus, toolbar buttons and
  // keyboard shortcuts all funnel through here, so a shortcut can never drift
  // from what the matching menu item does.
  /* One dispatch point, one global handle. js/mobile_shell.js builds its rows
     at runtime and cannot use the delegated [data-act] listeners bound to the
     static chrome, so it calls in here instead of duplicating any behaviour. */
  window.__runAction = runAction;
  return { handleActionClick };
}

export { wireFoldablesMenusAndDispatch, wireMobileDrawers };
