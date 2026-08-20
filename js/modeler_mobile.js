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

function t(k) {
  return api && api.t ? api.t(k) : k;
}
function icon(id) {
  return api && api.cadIcon ? api.cadIcon(id) : "";
}
function compact() {
  return document.body.classList.contains("compact-nav");
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
  var out = [];
  var sug = api.coach();
  if (sug)
    out.push({
      ph: sug.icon,
      label: t(sug.act),
      primary: true,
      run: function () {
        sug.run();
        sync(true);
      },
    });
  // The selection's own verbs, which otherwise live in a floating toolbar that
  // a finger covers the moment it makes the selection.
  api.contextItems()
    .slice(0, 3 - out.length)
    .forEach(function (item) {
      out.push({
        icon: item.id || item.icon,
        label: api.chromeLabel(item.id),
        run: function () {
          api.runChrome(item.id);
          sync(true);
        },
      });
    });
  if (!out.length) {
    // Nothing selected, nothing to suggest: the viewport controls that used to
    // float over the model in three separate stacks.
    out.push({ icon: "fit", label: t("zoomFit"), run: function () { api.runCommand("fit"); } });
    out.push({
      icon: st.display === "solid" ? "transparentView" : "solidView",
      label: t(st.display === "solid" ? "transparentView" : "solidView"),
      run: function () {
        api.setDisplay(st.display === "solid" ? "transparent" : "solid");
        sync(true);
      },
    });
    out.push({
      icon: "modelEdges",
      label: t("modelEdges"),
      on: st.edges,
      run: function () {
        api.toggleEdges();
        sync(true);
      },
    });
  }
  return out.slice(0, 3);
}

function btn(spec) {
  var b = document.createElement("button");
  b.type = "button";
  b.className =
    "mctx-btn" +
    (spec.danger ? " danger" : "") +
    (spec.on ? " on" : "") +
    (spec.primary ? " primary" : "");
  var glyph = spec.ph ? '<i class="ph ' + spec.ph + '"></i>' : icon(spec.icon);
  b.innerHTML = glyph + "<span>" + spec.label + "</span>";
  if (spec.disabled) b.disabled = true;
  b.setAttribute("aria-label", spec.label);
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
    btn({ ph: "ph-arrow-u-up-left", label: t("undo"), disabled: !api.canUndo(), run: api.undo }),
  );
  u.appendChild(
    btn({ ph: "ph-arrow-u-up-right", label: t("redo"), disabled: !api.canRedo(), run: api.redo }),
  );
  ctxBar.appendChild(u);
  ctxActions().forEach(function (a) {
    ctxBar.appendChild(btn(a));
  });
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
  sheet.innerHTML =
    '<div class="m-sheet-grip" aria-hidden="true"></div>' +
    '<div class="m-sheet-head"><h4 id="md-sheet-title"></h4>' +
    '<button type="button" class="m-sheet-x" aria-label="Close"><i class="ph ph-x"></i></button></div>' +
    '<div class="m-sheet-body" id="md-sheet-body"></div>' +
    '<div class="md-sheet-host" id="md-sheet-host"></div>';
  api.root.appendChild(sheet);
  sheetBody = sheet.querySelector("#md-sheet-body");
  sheetTitle = sheet.querySelector("#md-sheet-title");
  hostSlot = sheet.querySelector("#md-sheet-host");
  sheet.querySelector(".m-sheet-x").addEventListener("click", closeSheet);

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
     covering. The exception is a feature that opens a parameter form — that
     form lives inside the left panel, so the sheet switches to it rather than
     closing onto a form the user can no longer see. */
  sheet.addEventListener("click", function (e) {
    if (openKey !== "cmd" || !e.target.closest("[data-command]")) return;
    setTimeout(function () {
      var form = api.root.querySelector("#mdQuickSettings");
      if (form && !form.hidden) showSheet("tree");
      else closeSheet();
    }, 0);
  });
}

function closeSheet() {
  openKey = null;
  release();
  if (sheet) sheet.classList.remove("on", "tall");
  if (backdrop) backdrop.classList.remove("on");
  document.body.classList.remove("m-sheet-open");
  syncNav();
}

function showSheet(key) {
  ensureSheet();
  if (openKey === key) return closeSheet();
  release();
  sheetBody.innerHTML = "";
  var title = "";
  if (key === "view") {
    title = t("msheet_view");
    buildViewSheet();
  } else if (key === "tree") {
    title = t("tabTreeLong");
    borrowPanel(".md-left");
  } else if (key === "cmd") {
    title = t("cmdManager");
    borrowPanel(".md-commandmanager");
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
  backdrop.classList.add("on");
  document.body.classList.add("m-sheet-open");
  syncNav();
}

function borrowPanel(sel) {
  borrow(api.root.querySelector(sel));
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

/* View: the three floating stacks that used to sit on top of the model —
   document mode, standard views, display style — plus the selection filter,
   which is a picking setting and belongs with them rather than in a fourth
   strip along the bottom of the viewport. */
function buildViewSheet() {
  var st = api.state();
  section(t("msheet_mode"));
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

  section(t("msheet_views"));
  var g2 = grid("m-grid-4");
  [
    ["top", "view_top", "view_top"],
    ["front", "view_front", "view_front"],
    ["side", "view_right", "view_right"],
    ["iso", "mode3d", "view_iso"],
  ].forEach(function (row) {
    g2.appendChild(
      gridBtn(icon(row[1]), t(row[2]), st.view === row[0], function () {
        api.setView(row[0]);
        closeSheet();
      }),
    );
  });
  var g2b = grid("m-grid-3");
  g2b.appendChild(gridBtn(icon("zoomIn"), t("zoomIn"), false, function () { api.zoom("in"); }));
  g2b.appendChild(gridBtn(icon("zoomOut"), t("zoomOut"), false, function () { api.zoom("out"); }));
  g2b.appendChild(gridBtn(icon("fit"), t("zoomFit"), false, function () { api.zoom("fit"); }));

  section(t("displayStyle"));
  var g3 = grid("m-grid-3");
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

  section(t("selFilter"));
  var g4 = grid("m-grid-3");
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
      showSheet(s.key);
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
    b.classList.toggle("active", openKey === k);
    b.setAttribute("aria-expanded", openKey === k ? "true" : "false");
    var s = SLOTS.filter(function (x) {
      return x.key === k;
    })[0];
    var lab = b.querySelector("span"),
      ico = b.querySelector("i");
    if (k === "view") {
      // The View slot says which document mode you are in, or it costs a tap
      // just to find out.
      if (ico) ico.className = "ph ph-cube";
      if (lab)
        lab.textContent = t(
          st.mode === "2d" ? "mode2d" : st.mode === "drawing" ? "modeDrawing" : "mode3d",
        );
      var g = b.querySelector(".md-nav-glyph");
      if (!g) {
        g = document.createElement("span");
        g.className = "md-nav-glyph";
        b.insertBefore(g, b.firstChild);
      }
      g.innerHTML = icon(MODE_ICONS[st.mode] || "mode3d");
      if (ico) ico.style.display = "none";
    } else if (lab) lab.textContent = t(s.label);
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
    st.display,
    st.edges ? 1 : 0,
    st.selFilter,
    st.contextRoom ? 1 : 0,
    st.cornerVisible ? 1 : 0,
    st.canAccept ? 1 : 0,
    st.selKey,
    api.canUndo() ? 1 : 0,
    api.canRedo() ? 1 : 0,
    sug ? sug.act : "",
  ].join("|");
}

function sync(force) {
  if (!api || !compact() || !api.state().open) return;
  var s = sig();
  if (!force && s === lastSig) return;
  lastSig = s;
  renderCtx();
  syncNav();
}

export function initModelerMobile(bridge) {
  api = bridge;
  if (ctxBar) return;
  ctxBar = document.createElement("div");
  ctxBar.id = "md-ctx";
  ctxBar.setAttribute("role", "toolbar");
  ctxBar.setAttribute("aria-label", "Model editor context actions");
  document.body.appendChild(ctxBar);
  buildNav();
  ensureSheet();
  document.body.classList.add("md-open");
  sync(true);
}

// The editor closes by removing its own root: anything borrowed has to go home
// first, or the tree would be deleted along with the sheet holding it.
export function teardownModelerMobile() {
  release();
  closeSheet();
  document.body.classList.remove("md-open");
  if (ctxBar) ctxBar.remove();
  if (nav) nav.remove();
  if (sheet) sheet.remove();
  if (backdrop) backdrop.remove();
  ctxBar = nav = sheet = backdrop = sheetBody = sheetTitle = hostSlot = null;
  lastSig = "";
}

export function syncModelerMobile(force) {
  sync(force);
}
