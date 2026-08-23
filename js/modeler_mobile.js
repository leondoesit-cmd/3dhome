/* Model editor — phone/foldable chrome.

   Same disease as the planner had, further along. Measured on 375×812 before
   this existed: SIX stacked header rows (title+doc toggle, name+price, undo/
   redo+guide+save+close, the workflow breadcrumb, the coach bar, the ribbon
   tabs, the ribbon commands) consumed 335px — 41% of the screen — before the
   viewport started; the viewport itself was 394px tall and the tree and the
   inspector sat at y=817 and y=1170, off the bottom of a PAGE you scrolled
   like a document; "Close", the ribbon tabs and four of five crumbs were
   truncated mid-word; and eight floating stacks (view cube, zoom, display
   style, selection filters, start chip, gesture hint, status) overlapped each
   other and the model.

   Same cure, same two rows:

     #md-ctx   contextual: Undo/Redo pinned to the leading edge in every state,
               then the NEXT STEP (the coach's suggestion, which used to own a
               whole row) and the selection's own commands — the ones
               modeler_chrome.contextToolbarItems already computes for the
               floating context toolbar.
     #md-nav   five fixed slots: View / Tree / Commands (primary) / Properties
               / More. Each opens a bottom sheet, so the model stays visible.

   Inert unless <body> carries .compact-nav. The desktop editor keeps every
   element it had — the sheets HOST the real panels rather than copying them,
   so the tree, the inspector and the ribbon have exactly one implementation. */

var api = null,
  ctxBar = null,
  nav = null,
  sheet = null,
  sheetBody = null,
  sheetTitle = null,
  backdrop = null,
  hostSlot = null; // where a borrowed panel goes back to when the sheet closes
var openKey = null;
var borrowed = null; // { node, parent, next } — the panel currently in the sheet
var lastSig = "";
var openCommandGroups = {};
var statusBanner = null;
var selectionBar = null;

function t(k) {
  return api && api.t ? api.t(k) : k;
}
function icon(id) {
  return api && api.cadIcon ? api.cadIcon(id) : "";
}
function compact() {
  return document.body.classList.contains("compact-nav");
}
function dockRail() {
  return document.body.classList.contains("dock-rail");
}
function treeOn() {
  return !!(api && api.root && api.root.classList.contains("md-tree-on"));
}
function setTreeDock(on) {
  if (!api || !api.root) return;
  api.root.classList.toggle("md-tree-on", !!on);
  api.root.dataset.mdTreePref = on ? "on" : "off";
  window.dispatchEvent(new Event("resize"));
}
/* Roomy compact: the tree is a column beside the model, not a covering sheet.
   Default on; the Tree nav slot toggles it. Phone still borrows into #md-sheet. */
function applyTreeDock() {
  if (!api || !api.root) return;
  var want = compact() && dockRail() && api.root.dataset.mdTreePref !== "off";
  if (want && openKey === "tree") closeSheet();
  var was = api.root.classList.contains("md-tree-on");
  api.root.classList.toggle("md-tree-on", want);
  if (was !== want) window.dispatchEvent(new Event("resize"));
}

/* ---- the contextual row ------------------------------------------------- */

var MODE_ICONS = { "3d": "mode3d", "2d": "mode2d", drawing: "drawing" };

/* Up to three, in priority order. A command being defined outranks everything:
   while a feature form is open the only two answers that matter are yes and
   no, and hunting for them in a corner of the viewport is how a half-defined
   extrude gets abandoned. */
function ctxActions() {
  var st = api.state();
  if (st.cornerVisible) {
    return [
      /* Short verbs: "Finish command" ellipses to "Finish com…" in a row that
         is already sharing ~360px with Undo and Redo. */
      { icon: "check", label: t("m_accept"), primary: true, disabled: !st.canAccept, run: api.accept },
      { icon: "cross", label: t("m_cancel"), danger: true, run: api.cancel },
    ];
  }
  var selected = (st.topologyCount || 0) + (st.componentCount || 0);
  var out = [];
  var seen = {};
  function push(item) {
    var key = item.action || item.label;
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push(item);
  }
  /* Closed profile: Extrude is the next modelling verb even with nothing
     picked. The tour rings [data-md-action="extrude"]; without this pin the
     button never exists unless a sketch entity is still selected. */
  if (st.closedSketch) {
    push({
      icon: "extrude",
      action: "extrude",
      label: api.chromeLabel("extrude"),
      primary: true,
      run: function () {
        api.runChrome("extrude");
        sync(true);
      },
    });
  }
  var sug = selected ? null : api.coach();
  if (sug) {
    var command = sug.command || ((String(sug.target || "").match(/data-command="([^"]+)"/) || [])[1] || "");
    push({
      ph: sug.icon,
      action: command,
      label: t(sug.act),
      primary: !st.closedSketch,
      run: function () {
        sug.run();
        sync(true);
      },
    });
  }
  // The selection's own verbs, which otherwise live in a floating toolbar that
  // a finger covers the moment it makes the selection.
  api.contextItems().forEach(function (item) {
    if (out.length >= 3) return;
    push({
      icon: item.id || item.icon,
      action: item.id,
      label: api.chromeLabel(item.id),
      run: function () {
        api.runChrome(item.id);
        sync(true);
      },
    });
  });
  return out.slice(0, 3);
}

function renderSelectionBar() {
  if (!selectionBar) return;
  var st = api.state();
  var selected = (st.topologyCount || 0) + (st.componentCount || 0);
  selectionBar.hidden = !selected;
  if (!selected) { selectionBar.innerHTML = ""; return; }
  var filters = ["all", "face", "edge", "body"];
  var labels = { all: "selFilterAll", face: "selFilterFace", edge: "selFilterEdge", body: "selFilterBody" };
  var at = filters.indexOf(st.selFilter);
  selectionBar.innerHTML = '<strong>' + selected + " " + t("selCountTipTouch") + "</strong>";
  selectionBar.appendChild(btn({
    ph: st.addSelection ? "ph-selection" : "ph-selection-plus",
    label: t(st.addSelection ? "touchReplaceSelection" : "touchAddSelection"),
    on: st.addSelection,
    run: function () { api.setAddSelection(!api.state().addSelection); },
  }));
  selectionBar.appendChild(btn({
    ph: "ph-funnel",
    label: t(labels[st.selFilter] || "selFilterAll"),
    run: function () { api.setSelFilter(filters[(at + 1) % filters.length]); },
  }));
  selectionBar.appendChild(btn({
    ph: "ph-x-circle",
    label: t("touchClearSelection"),
    danger: true,
    iconOnly: true,
    run: api.clearSelection,
  }));
}

function btn(spec) {
  var b = document.createElement("button");
  b.type = "button";
  b.className =
    "mctx-btn" +
    (spec.danger ? " danger" : "") +
    (spec.on ? " on" : "") +
    (spec.primary ? " primary" : "") +
    (spec.iconOnly ? " mctx-icon-only" : "");
  var glyph = spec.ph ? '<i class="ph ' + spec.ph + '"></i>' : icon(spec.icon);
  b.innerHTML = glyph + (spec.iconOnly ? "" : "<span>" + spec.label + "</span>");
  if (spec.disabled) b.disabled = true;
  b.setAttribute("aria-label", spec.label);
  if (spec.action) b.dataset.mdAction = spec.action;
  b.addEventListener("click", function (e) {
    e.preventDefault();
    spec.run();
    sync(true);
  });
  return b;
}

function renderCtx() {
  if (!ctxBar) return;
  ctxBar.innerHTML = "";
  var u = document.createElement("div");
  u.className = "mctx-undo";
  u.appendChild(
    btn({ ph: "ph-arrow-u-up-left", label: t("undo"), iconOnly: true, disabled: !api.canUndo(), run: api.undo }),
  );
  u.appendChild(
    btn({ ph: "ph-arrow-u-up-right", label: t("redo"), iconOnly: true, disabled: !api.canRedo(), run: api.redo }),
  );
  ctxBar.appendChild(u);
  var actions = ctxActions();
  actions.forEach(function (a) {
    ctxBar.appendChild(btn(a));
  });
  ctxBar.classList.toggle("mctx-empty", actions.length === 0);
}

/* ---- bottom sheets ------------------------------------------------------ */

/* The panel sheets BORROW the live panel out of the desktop layout and put it
   back on close. Copying it would mean two trees, two inspectors and two sets
   of listeners drifting apart; moving it means the phone and the desktop are
   the same editor in a different frame. */
function borrow(node, into) {
  if (!node) return;
  release();
  borrowed = { node: node, parent: node.parentNode, next: node.nextSibling };
  (into || hostSlot).appendChild(node);
  node.classList.add("md-borrowed");
}
function release() {
  if (!borrowed) return;
  borrowed.node.classList.remove("md-borrowed");
  // the drawer state is a phone affordance; the desktop ribbon shows every group
  borrowed.node.querySelectorAll(".md-group-open").forEach(function (g) {
    g.classList.remove("md-group-open");
  });
  borrowed.node.querySelectorAll(".md-command-group-label[aria-expanded]").forEach(function (h) {
    h.removeAttribute("aria-expanded");
    h.removeAttribute("aria-describedby");
    h.removeAttribute("role");
    h.removeAttribute("tabindex");
  });
  borrowed.node.querySelectorAll(".md-group-summary").forEach(function (node) { node.remove(); });
  borrowed.parent.insertBefore(borrowed.node, borrowed.next);
  borrowed = null;
}

/* Both the sheet and its backdrop are mounted INSIDE #modeler, not on <body>.
   Every rule the editor's panels are styled by is written `#modeler .md-…`, so
   a panel borrowed out of that subtree would arrive in the sheet with none of
   its own CSS. Being a child also makes `position: absolute; bottom: 0` mean
   "just above the two rows", since #modeler already stops there. */
function ensureSheet() {
  if (sheet) return;
  backdrop = document.createElement("div");
  backdrop.id = "md-sheet-backdrop";
  backdrop.addEventListener("click", closeSheet);
  api.root.appendChild(backdrop);

  sheet = document.createElement("div");
  sheet.id = "md-sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "false");
  sheet.setAttribute("aria-hidden", "true");
  sheet.innerHTML =
    '<div class="m-sheet-grip" aria-hidden="true"></div>' +
    '<div class="m-sheet-head"><h4 id="md-sheet-title"></h4>' +
    '<button type="button" class="m-sheet-x md-sheet-expand" aria-label="Expand"><i class="ph ph-arrows-out-simple"></i></button>' +
    '<button type="button" class="m-sheet-x" aria-label="Close"><i class="ph ph-x"></i></button></div>' +
    '<div class="m-sheet-body" id="md-sheet-body"></div>' +
    '<div class="md-sheet-host" id="md-sheet-host"></div>';
  api.root.appendChild(sheet);
  sheetBody = sheet.querySelector("#md-sheet-body");
  sheetTitle = sheet.querySelector("#md-sheet-title");
  hostSlot = sheet.querySelector("#md-sheet-host");
  sheet.querySelector(".m-sheet-head > .m-sheet-x:last-child").addEventListener("click", closeSheet);
  sheet.querySelector(".md-sheet-expand").addEventListener("click", function () {
    sheet.classList.toggle("tall");
    this.setAttribute("aria-label", sheet.classList.contains("tall") ? "Collapse" : "Expand");
  });

  var y0 = 0,
    live = false;
  sheet.addEventListener(
    "touchstart",
    function (e) {
      live = e.touches.length === 1 && !!e.target.closest(".m-sheet-grip, .m-sheet-head");
      if (live) y0 = e.touches[0].clientY;
    },
    { passive: true },
  );
  sheet.addEventListener(
    "touchmove",
    function (e) {
      if (!live || e.touches.length !== 1) return;
      var dy = e.touches[0].clientY - y0;
      if (dy > 70) {
        live = false;
        closeSheet();
      } else if (dy < -50) {
        live = false;
        sheet.classList.add("tall");
      }
    },
    { passive: true },
  );
  sheet.addEventListener("touchend", function () {
    live = false;
  });

  /* A command picked from the Commands sheet has to get out of the way of the
     thing it just started: a sketch tool needs the canvas the sheet is
     covering. A feature form lives in the left panel — on a phone that means
     switching to the Tree sheet; on dock-rail the tree column is already
     beside the preview, so closing Commands is enough. */
  /* The secondary command groups are drawers on a phone. The listener lives on
     the SHEET, never on the borrowed ribbon: the ribbon goes home to the
     desktop layout on release() and must not carry a phone's handlers with it.
     The open/closed class is cosmetic and release() strips it for the same
     reason. */
  sheet.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var head = e.target.closest && e.target.closest(".md-command-group-label[role='button']");
    if (!head) return;
    e.preventDefault();
    head.click();
  });

  sheet.addEventListener("click", function (e) {
    var head = e.target.closest(".md-command-group-label");
    if (!head || openKey !== "cmd") return;
    var grp = head.closest('.md-command-group[data-cmdgroup="secondary"]');
    if (!grp) return;
    e.preventDefault();
    e.stopPropagation();
    grp.classList.toggle("md-group-open");
    openCommandGroups[head.textContent.trim()] = grp.classList.contains("md-group-open");
    head.setAttribute("aria-expanded", grp.classList.contains("md-group-open") ? "true" : "false");
  });

  sheet.addEventListener("click", function (e) {
    if (openKey !== "cmd" || !e.target.closest("[data-command]")) return;
    setTimeout(function () {
      var form = api.root.querySelector("#mdQuickSettings");
      if (form && !form.hidden) {
        if (dockRail()) {
          closeSheet();
          setTreeDock(true);
        } else showSheet("tree");
      } else closeSheet();
    }, 0);
  });
}

function closeSheet() {
  openKey = null;
  release();
  setSheetSearch(false);
  if (sheet) {
    sheet.classList.remove("on", "tall");
    sheet.setAttribute("aria-modal", "false");
    sheet.setAttribute("aria-hidden", "true");
  }
  if (backdrop) backdrop.classList.remove("on");
  document.body.classList.remove("m-sheet-open");
  syncNav();
}

/* `toggle` is the NAV BUTTON's privilege, nothing else's. The guide calls
   showModelerSheet() to put a sheet on screen; when prepareTourStep() and the
   step's own prepare() both asked for the same sheet the second call used to
   toggle it shut, so every step that said "tap Commands" pointed at a control
   inside a closed sheet. */
function showSheet(key, toggle) {
  ensureSheet();
  if (key === "tree" && dockRail()) {
    if (toggle) setTreeDock(!treeOn());
    else setTreeDock(true);
    syncNav();
    return;
  }
  if (openKey === key) {
    if (toggle) return closeSheet();
    syncNav();
    return;
  }
  release();
  sheetBody.innerHTML = "";
  setSheetSearch(false);
  var title = "";
  if (key === "view") {
    title = t("msheet_view");
    buildViewSheet();
  } else if (key === "tree") {
    title = t("tabTreeLong");
    borrowPanel(".md-left");
  } else if (key === "cmd") {
    title = t("mnav_commands");
    if (api && api.setCommandTab) {
      var st = api.state();
      if (st.mode === "2d" || st.emptyPart) api.setCommandTab("sketch");
      else if (st.docType === "assembly") api.setCommandTab("assembly");
      else api.setCommandTab("features");
    }
    borrowPanel(".md-commandmanager");
    markGroupDrawers();
    setSheetSearch(true);
  } else if (key === "props") {
    title = t("tabShape");
    borrowPanel(".md-right");
  } else if (key === "more") {
    title = t("msheet_more");
    buildMoreSheet();
  }
  sheetTitle.textContent = title;
  openKey = key;
  sheet.classList.add("on");
  sheet.setAttribute("aria-modal", "true");
  sheet.removeAttribute("aria-hidden");
  backdrop.classList.add("on");
  document.body.classList.add("m-sheet-open");
  syncNav();
}

function setSheetSearch(on) {
  if (!sheet) return;
  var head = sheet.querySelector(".m-sheet-head");
  var existing = sheet.querySelector(".md-sheet-search");
  if (existing) existing.remove();
  if (!on || !head) return;
  var b = document.createElement("button");
  b.type = "button";
  b.className = "m-sheet-x md-sheet-search";
  b.setAttribute("aria-label", t("cmdSearch"));
  b.title = t("cmdSearch");
  b.innerHTML = '<i class="ph ph-magnifying-glass"></i>';
  b.addEventListener("click", function () {
    closeSheet();
    api.search();
  });
  head.insertBefore(b, head.querySelector(".m-sheet-x"));
}

function borrowPanel(sel) {
  borrow(api.root.querySelector(sel));
}

/* A <span> heading that toggles a drawer has to say so to anything that is not
   a fingertip. Applied on borrow, undone on release. */
function markGroupDrawers() {
  if (!sheet) return;
  sheet.querySelectorAll('.md-command-group[data-cmdgroup="secondary"]').forEach(function (grp) {
    var head = grp.querySelector(".md-command-group-label");
    if (!head) return;
    var oldSummary = head.querySelector(".md-group-summary");
    if (oldSummary) oldSummary.remove();
    var count = grp.querySelectorAll("[data-command]").length;
    var summary = document.createElement("small");
    summary.className = "md-group-summary";
    summary.textContent = count + " " + (count === 1 ? "tool" : "tools");
    /* Out of the accessible name — appended to the label it read as
       "Direct5 tools" — and into the description instead. */
    summary.id = summary.id || "md-grp-" + Math.random().toString(36).slice(2, 8);
    head.appendChild(summary);
    head.setAttribute("aria-describedby", summary.id);
    grp.classList.toggle("md-group-open", !!openCommandGroups[head.textContent.trim()]);
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    head.setAttribute("aria-expanded", grp.classList.contains("md-group-open") ? "true" : "false");
  });
}

function gridBtn(glyph, label, on, run) {
  var b = document.createElement("button");
  b.type = "button";
  b.className = "m-grid-btn" + (on ? " on" : "");
  b.innerHTML = glyph + "<span>" + label + "</span>";
  b.addEventListener("click", function () {
    run();
    sync(true);
  });
  return b;
}
function section(label) {
  var h = document.createElement("h5");
  h.className = "m-sheet-sec";
  h.textContent = label;
  sheetBody.appendChild(h);
}
function grid(cls) {
  var g = document.createElement("div");
  g.className = "m-grid " + (cls || "");
  sheetBody.appendChild(g);
  return g;
}

function shortPhone() {
  return window.innerHeight <= 500;
}

/* View: the three floating stacks that used to sit on top of the model —
   document mode, standard views, display style — plus the selection filter,
   which is a picking setting and belongs with them rather than in a fourth
   strip along the bottom of the viewport. */
function buildViewSheet() {
  var st = api.state();
  var short = shortPhone();
  if (!short) section(t("msheet_mode"));
  var g1 = grid("m-grid-3");
  [
    ["3d", "mode3d"],
    ["2d", "mode2d"],
    ["drawing", "drawing"],
  ].forEach(function (row) {
    g1.appendChild(
      gridBtn(
        icon(row[1]),
        t(row[0] === "3d" ? "mode3d" : row[0] === "2d" ? "mode2d" : "modeDrawing"),
        st.mode === row[0],
        function () {
          api.setMode(row[0]);
          closeSheet();
        },
      ),
    );
  });

  if (!short) section(t("msheet_views"));
  var g2 = grid(short ? "m-grid-5" : "m-grid-4");
  [
    ["top", "view_top", "view_top_short"],
    ["front", "view_front", "view_front_short"],
    ["side", "view_right", "view_right_short"],
    ["iso", "mode3d", "view_iso_short"],
  ].forEach(function (row) {
    g2.appendChild(
      gridBtn(icon(row[1]), t(row[2]), st.view === row[0], function () {
        api.setView(row[0]);
        closeSheet();
      }),
    );
  });
  if (short) {
    g2.appendChild(gridBtn(icon("fit"), t("zoomFit"), false, function () { api.zoom("fit"); closeSheet(); }));
  } else {
    var g2b = grid("m-grid-1");
    g2b.appendChild(gridBtn(icon("fit"), t("zoomFit"), false, function () { api.zoom("fit"); closeSheet(); }));
  }

  if (!short) section(t("displayStyle"));
  var g3 = grid("m-grid-4");
  g3.appendChild(
    gridBtn(icon("solidView"), t("solidView"), st.display === "solid", function () {
      api.setDisplay("solid");
    }),
  );
  g3.appendChild(
    gridBtn(icon("transparentView"), t("transparentView"), st.display === "transparent", function () {
      api.setDisplay("transparent");
    }),
  );
  g3.appendChild(gridBtn(icon("modelEdges"), t("modelEdges"), st.edges, api.toggleEdges));
  g3.appendChild(
    gridBtn('<i class="ph ph-house-line"></i>', t("contextRoom"), st.contextRoom, api.toggleContextRoom),
  );

  if (!short) section(t("selFilter"));
  var g4 = grid("m-grid-5");
  [
    ["all", "selFilterAll"],
    ["face", "selFilterFace"],
    ["edge", "selFilterEdge"],
    ["sketch", "selFilterSketch"],
    ["body", "selFilterBody"],
  ].forEach(function (row) {
    g4.appendChild(
      gridBtn("", t(row[1]), st.selFilter === row[0], function () {
        api.setSelFilter(row[0]);
      }),
    );
  });
}

/* More: the document itself. Name and price held a permanent full-width row in
   the header for values you set once; save/guide/close were a third row. */
function buildMoreSheet() {
  var st = api.state();
  section(t("msheet_doc"));
  var g0 = grid("m-grid-3");
  g0.appendChild(
    gridBtn(icon("mode3d"), t("docPart"), st.docType === "part", function () {
      api.setDoc("part");
      closeSheet();
    }),
  );
  g0.appendChild(
    gridBtn('<i class="ph ph-stack"></i>', t("docAssembly"), st.docType === "assembly", function () {
      api.setDoc("assembly");
      closeSheet();
    }),
  );
  g0.appendChild(
    gridBtn('<i class="ph ph-file-plus"></i>', t("newModel"), false, function () {
      api.newModel();
      closeSheet();
    }),
  );

  // The real inputs, moved rather than mirrored: two fields cannot be allowed
  // to disagree about the model's name.
  var fields = document.createElement("div");
  fields.className = "md-sheet-fields";
  sheetBody.appendChild(fields);
  // Borrowed through the same bookkeeping as the panels: an input that is
  // moved out and never moved back leaves syncHead() reading a null.
  borrow(api.root.querySelector(".md-head-inputs"), fields);

  section(t("msheet_actions"));
  var g1 = grid("m-grid-3");
  g1.appendChild(
    gridBtn('<i class="ph ph-floppy-disk"></i>', t("save"), false, function () {
      api.save();
      closeSheet();
    }),
  );
  g1.appendChild(
    gridBtn('<i class="ph ph-graduation-cap"></i>', t("guide"), false, function () {
      api.guide();
      closeSheet();
    }),
  );
  g1.appendChild(
    gridBtn('<i class="ph ph-sparkle"></i>', t("emptyStart"), false, function () {
      api.startScreen();
      closeSheet();
    }),
  );
  g1.appendChild(
    gridBtn('<i class="ph ph-magnifying-glass"></i>', t("cmdSearch"), false, function () {
      closeSheet();
      api.search();
    }),
  );
}

/* ---- nav ---------------------------------------------------------------- */

var SLOTS = [
  { key: "view", ph: "ph-cube", label: "msheet_view" },
  { key: "tree", ph: "ph-tree-structure", label: "tabTreeShort" },
  { key: "cmd", ph: "ph-plus", label: "mnav_commands", primary: true },
  { key: "props", ph: "ph-sliders-horizontal", label: "mnav_props" },
  { key: "more", ph: "ph-dots-three-outline", label: "mnav_more" },
];

function buildNav() {
  nav = document.createElement("nav");
  nav.id = "md-nav";
  nav.setAttribute("aria-label", "Model editor navigation");
  SLOTS.forEach(function (s) {
    var b = document.createElement("button");
    b.type = "button";
    b.dataset.mdnav = s.key;
    if (s.primary) b.className = "mnav-primary";
    b.innerHTML = '<i class="ph ' + s.ph + '"></i><span></span>';
    b.addEventListener("click", function () {
      showSheet(s.key, true);
    });
    nav.appendChild(b);
  });
  document.body.appendChild(nav);
}

function syncNav() {
  if (!nav) return;
  var st = api.state();
  nav.querySelectorAll("[data-mdnav]").forEach(function (b) {
    var k = b.dataset.mdnav;
    var on = k === "tree" && dockRail() ? treeOn() : openKey === k;
    b.classList.toggle("active", on);
    b.setAttribute("aria-expanded", on ? "true" : "false");
    var s = SLOTS.filter(function (x) {
      return x.key === k;
    })[0];
    /* NOT querySelector("span"): the View slot inserts .md-nav-glyph as the
       first child, so a bare span lookup returns the glyph from the second
       sync onwards — the mode name was written into it and then wiped by the
       icon assignment below, freezing the label on whatever mode was current
       when the nav was first built. */
    var lab = b.querySelector("span:not(.md-nav-glyph)"),
      ico = b.querySelector("i");
    if (k === "view") {
      // Keep the destination honest; the current document mode is secondary.
      if (ico) ico.className = "ph ph-cube";
      if (lab) lab.textContent = t("msheet_view");
      var g = b.querySelector(".md-nav-glyph");
      if (!g) {
        g = document.createElement("span");
        g.className = "md-nav-glyph";
        b.insertBefore(g, b.firstChild);
      }
      g.innerHTML = icon(MODE_ICONS[st.mode] || "mode3d");
      if (ico) ico.style.display = "none";
      var sub = b.querySelector("small");
      if (!sub) { sub = document.createElement("small"); b.appendChild(sub); }
      sub.textContent = t(st.mode === "2d" ? "mode2d" : st.mode === "drawing" ? "modeDrawing" : "mode3d");
    } else if (lab) lab.textContent = t(s.label);
    if (k === "tree") {
      var count = (st.rebuildErrors || 0) + (st.rebuildWarnings || 0);
      var badge = b.querySelector(".md-nav-badge");
      if (count && !badge) { badge = document.createElement("b"); badge.className = "md-nav-badge"; b.appendChild(badge); }
      if (badge) { badge.textContent = count || ""; badge.hidden = !count; badge.classList.toggle("error", !!st.rebuildErrors); }
    }
  });
}

/* ---- pulse -------------------------------------------------------------- */

function sig() {
  var st = api.state();
  var sug = api.coach();
  return [
    st.mode,
    st.view,
    st.tool,
    st.docType,
    st.commandTab || "",
    st.display,
    st.edges ? 1 : 0,
    st.selFilter,
    st.addSelection ? 1 : 0,
    st.topologyCount || 0,
    st.componentCount || 0,
    st.rebuildErrors || 0,
    st.rebuildWarnings || 0,
    st.contextRoom ? 1 : 0,
    st.cornerVisible ? 1 : 0,
    st.closedSketch ? 1 : 0,
    st.canAccept ? 1 : 0,
    st.selKey,
    api.canUndo() ? 1 : 0,
    api.canRedo() ? 1 : 0,
    sug ? sug.act : "",
  ].join("|");
}

function sync(force) {
  if (!api || !compact() || !api.state().open) return;
  applyTreeDock();
  var s = sig();
  if (!force && s === lastSig) return;
  lastSig = s;
  renderCtx();
  renderSelectionBar();
  syncNav();
  var st = api.state();
  if (statusBanner) {
    var count = st.rebuildErrors || st.rebuildWarnings || 0;
    statusBanner.hidden = !count;
    statusBanner.classList.toggle("error", !!st.rebuildErrors);
    statusBanner.textContent = count ? t(st.rebuildErrors ? "rebuildFail" : "rebuildWarn") + " · " + count : "";
  }
}

export function initModelerMobile(bridge) {
  api = bridge;
  if (!ctxBar) {
    ctxBar = document.createElement("div");
    ctxBar.id = "md-ctx";
    ctxBar.setAttribute("role", "toolbar");
    ctxBar.setAttribute("aria-label", "Model editor context actions");
    document.body.appendChild(ctxBar);
    buildNav();
    ensureSheet();
    statusBanner = document.createElement("div");
    statusBanner.className = "md-mobile-status";
    statusBanner.setAttribute("role", "status");
    statusBanner.hidden = true;
    api.root.appendChild(statusBanner);
    selectionBar = document.createElement("div");
    selectionBar.id = "md-selection-bar";
    selectionBar.setAttribute("role", "toolbar");
    selectionBar.setAttribute("aria-label", t("topologySelection"));
    selectionBar.hidden = true;
    document.body.appendChild(selectionBar);
    document.body.classList.add("md-open");
  }
  applyTreeDock();
  sync(true);
}

// The editor closes by removing its own root: anything borrowed has to go home
// first, or the tree would be deleted along with the sheet holding it.
export function teardownModelerMobile() {
  release();
  closeSheet();
  if (api && api.root) api.root.classList.remove("md-tree-on");
  document.body.classList.remove("md-open");
  if (ctxBar) ctxBar.remove();
  if (nav) nav.remove();
  if (sheet) sheet.remove();
  if (backdrop) backdrop.remove();
  if (statusBanner) statusBanner.remove();
  if (selectionBar) selectionBar.remove();
  ctxBar = nav = sheet = backdrop = sheetBody = sheetTitle = hostSlot = statusBanner = selectionBar = null;
  lastSig = "";
}

export function syncModelerMobile(force) {
  sync(force);
}

export function showModelerSheet(key, targetSelector) {
  showSheet(key, false);
  if (key === "cmd" && targetSelector && sheet) {
    var el = sheet.querySelector(targetSelector);
    if (el) {
      var grp = el.closest('.md-command-group[data-cmdgroup="secondary"]');
      if (grp) {
        grp.classList.add("md-group-open");
        var head = grp.querySelector(".md-command-group-label");
        if (head) {
          head.setAttribute("aria-expanded", "true");
          openCommandGroups[head.textContent.trim()] = true;
        }
      }
    }
  }
}

export function closeModelerSheet() {
  closeSheet();
}

/* Feature forms live in the left panel. On a phone that panel is display:none
   unless it is borrowed into the Tree sheet — picking Extrude from Commands
   already switched sheets, picking it from the thumb row did not. */
export function revealModelerFeatureForm() {
  if (!compact() || !api) return;
  ensureSheet();
  if (dockRail()) {
    if (openKey === "cmd") closeSheet();
    setTreeDock(true);
    syncNav();
    return;
  }
  showSheet("tree", false);
}
