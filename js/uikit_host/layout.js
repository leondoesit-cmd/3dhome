/* The layout document that describes the chrome 3dhome already has.
 *
 * This is the whole point of the parity phase, and it is meant to be boring:
 * every node here names an element that is already on the page, in the parent
 * it is already in, in the order it is already in. Rendering it must therefore
 * change nothing at all — same elements, same parents, same order, same CSS
 * matching. If turning the flag on moves a single pixel, the description is
 * wrong, and tests/uikit_parity.browser.mjs is what says so.
 *
 * Nothing here is CREATED. Both slots are the host's own elements (#topbar,
 * #left-sidebar), the root binds to #app, and no other slot is declared — so
 * the render adds not one element to the document. That is the strongest form
 * the parity claim can take: uikit is describing this UI, not rebuilding it.
 *
 * The variants are deliberately empty patches for now. The posture that picks
 * them is real (js/uikit_host/variants.js), but what compact and phone SHOULD
 * do to this document is a later phase's decision; today they inherit base
 * completely, which is exactly what the sparse-overlay rule promises.
 */

import { dockLayoutNodes, dockRootChildren } from "./dock.js";
import { ribbonLayoutNodes, ribbonRootChildren } from "./ribbon.js";

export const TOPBAR_CHILDREN = ["panel:tb-start", "panel:tb-center", "panel:tb-end"];

export const TB_START_CHILDREN = [
  "act:openModeler",
  "menu:file",
  "menu:edit",
  "menu:export",
  "act:workspace",
  "act:undo",
  "act:redo",
  "menu:history",
];

export const MENU_FILE_CHILDREN = [
  "act:newPlan",
  "act:save",
  "act:load",
  "act:addFloor",
  "act:importjson",
  "act:importBlueprintTrace",
  "act:importBlueprint",
  "act:roomScan",
  "sep:file-1",
  "act:reset",
];

export const MENU_EDIT_CHILDREN = [
  "btn:undo",
  "btn:redo",
  "sep:edit-1",
  "act:dupSel",
  "act:groupItems",
  "act:ungroupItems",
  "sep:edit-2",
  "act:deleteSel",
];

export const MENU_EXPORT_CHILDREN = [
  "act:exportjson",
  "act:png2d",
  "act:png3d",
  "act:exportgltf",
];

export const MENU_MORE_CHILDREN = [
  "more:openModeler",
  "more:uikitCustomize",
  "more:walk",
  "more:photo",
  "more:rc",
  "more:zombies",
  "more:lava",
  "sep:more-1",
  "more:openTextureGallery",
  "more:autoGenerate",
  "more:friends",
  "more:agent",
  "sep:more-2",
  "more:toggleLegacy",
];

const MENU_CONSTRAINTS = Object.freeze({
  resize: "none",
  accepts: ["command", "separator", "menu"],
  ungroup: false,
});

/* DOM order, in both cases. syncChildren reorders with the fewest moves, so a
   list that already matches the page makes the first render a no-op — which is
   what tests/uikit_parity.browser.mjs checks, and the only way to tell a
   description of this toolbar apart from a rebuild of it.

   Neither list is exhaustive, deliberately. #m-top-selection (the phone title
   mirror), the .separator, #toggle-right and the two hidden file inputs stay
   unclaimed: they are the host's own plumbing, and a layout that never names
   them can never move them. */
export const TB_CENTER_CHILDREN = [
  "grp:toolSearch",
  "grp:viewModes",
  "grp:playModes",
];

export const TB_END_CHILDREN = [
  "act:openTextureGallery",
  "act:autoGenerate",
  "menu:more",
  "btn:friends",
  "act:shortcuts",
  "btn:plannerGuide",
  "btn:agent",
  "btn:videoStudio",
  "btn:settings",
  "btn:theme",
  "act:lang",
];

export const LEFT_TAB_CHILDREN = [
  "tab:library",
  "tab:home",
  "tab:structure",
  "tab:tree",
];

export const LEFT_CHILDREN = [
  "panel:leftTabs",
  "panel:library",
  "panel:smarthome",
  "panel:mep",
  "panel:params",
  "panel:warnings",
  "panel:tree",
];

export const RIGHT_CHILDREN = [
  "panel:inspectorMain",
  "panel:cost",
  "panel:environment",
  "panel:friends",
  "panel:site",
];

export const SLOTS = Object.freeze({
  topbar: "#topbar",
  left: "#left-sidebar",
  right: "#right-inspector",
});
export const SLOT_NAMES = Object.freeze(["topbar", "left", "right"]);

function leaf(ref) {
  return String(ref).indexOf("sep:") === 0
    ? { type: "separator", ref }
    : { type: "item", ref };
}

export function defaultLayout() {
  const nodes = {
    /* The plan pane's eight dock zones are children of the root alongside the
       topbar and the sidebar. They bind to slots that only exist while the
       pane is roomy enough to dock into, and uikit skips a container whose
       slot is absent — so on a phone, where the dock hands its panels back to
       the rail, these eight simply do not render. */
    "n:app": {
      type: "dock",
      children: ["n:topbar", "n:left", "n:right"].concat(dockRootChildren()).concat(ribbonRootChildren()),
    },
    /* Bound to #topbar, so .tb-start / .tb-center / .tb-end stay direct
       children of the grid that lays them out.
     *
       `accepts` names those three by id. #topbar is
       `grid-template-columns: minmax(0,1fr) auto minmax(0,1fr)` — exactly three
       tracks — so a fourth child would be laid out by a rule that does not
       exist for it. Naming them rather than blocking everything keeps a column
       that has been moved out able to come back. This is a fact about this
       app's CSS, which is why it is declared here and not in uikit. */
    "n:topbar": {
      type: "bar",
      slot: "topbar",
      orient: "row",
      children: TOPBAR_CHILDREN.slice(),
      constraints: { accepts: TOPBAR_CHILDREN.slice() },
    },
    /* Bound to #left-sidebar, which is load-bearing: the pane switcher is
       `#left-sidebar > .panel-section`, and one wrapper here would show every
       pane at once. Panels only: a toolbar button dropped into the pane stack
       would be styled by none of the rules that make that column work. */
    "n:left": {
      type: "stack",
      slot: "left",
      children: LEFT_CHILDREN.slice(),
      constraints: { accepts: ["panel"] },
    },
    /* The entity inspector is an essential host control, so it may be widened
       but not hidden. Its internal sections remain independently selectable. */
    "n:right": {
      type: "stack",
      slot: "right",
      children: RIGHT_CHILDREN.slice(),
      constraints: { resize: "x", minW: 240, maxW: 500, hide: false, accepts: ["panel"] },
    },
  };
  for (const ref of TOPBAR_CHILDREN.concat(LEFT_CHILDREN, RIGHT_CHILDREN)) nodes[ref] = leaf(ref);
  /* The three topbar columns are groups, not leaves: their children are the
     app's own menus and buttons, adopted where they already sit. This is what
     gives the structure browser something below the panel to select. */
  const columns = [
    ["panel:tb-start", TB_START_CHILDREN],
    ["panel:tb-center", TB_CENTER_CHILDREN],
    ["panel:tb-end", TB_END_CHILDREN],
  ];
  for (const [id, children] of columns) {
    nodes[id] = {
      type: "group",
      ref: id,
      children: children.slice(),
      constraints: { resize: "none", accepts: ["command", "panel", "group", "item", "menu", "separator"] },
    };
    for (const ref of children) nodes[ref] = leaf(ref);
  }
  /* A dropdown holds its own items, so the tree reads Export > PNG 2D rather
     than parking the four commands at the root next to the toolbar.
   *
     The node is the .dropdown WRAPPER, because that is what sits among
     .tb-start's children and what must keep its place there. Its children go
     wherever the entry's target() says — the .dropdown-menu, which the host
     portals to <body> the moment the menu opens. That is why this works as a
     plain parent/child pair and needed a runtime slot before: the lookup, not
     the layout, is what has to survive the move. */
  const menus = [
    ["menu:file", MENU_FILE_CHILDREN],
    ["menu:edit", MENU_EDIT_CHILDREN],
    ["menu:export", MENU_EXPORT_CHILDREN],
    ["menu:more", MENU_MORE_CHILDREN],
  ];
  for (const [id, children] of menus) {
    nodes[id] = {
      type: "group",
      ref: id,
      orient: "col",
      children: children.slice(),
      constraints: Object.assign({}, MENU_CONSTRAINTS),
    };
    for (const ref of children) nodes[ref] = leaf(ref);
  }
  nodes["panel:leftTabs"] = {
    type: "group",
    ref: "panel:leftTabs",
    children: LEFT_TAB_CHILDREN.slice(),
    constraints: { resize: "none", accepts: ["command", "panel", "item"] },
  };
  for (const ref of LEFT_TAB_CHILDREN) nodes[ref] = leaf(ref);
  Object.assign(nodes, dockLayoutNodes());
  /* The model editor's ribbon. Its four panes only exist while the editor is
     open, so these four containers render nothing the rest of the time. */
  Object.assign(nodes, ribbonLayoutNodes());

  return {
    v: 1,
    variants: {
      base: { root: "n:app", patch: {} },
      compact: { root: "n:app", patch: {} },
      phone: { root: "n:app", patch: {} },
    },
    nodes,
    overrides: { text: {}, tokens: {} },
  };
}

/* ---- migrating a layout saved by an older build -------------------------- */

/* A saved layout names nodes by id, so renaming one or changing what contains
 * what breaks every document already in a user's browser — silently, because a
 * node whose registry entry has gone resolves to a tombstone and a container
 * whose slot is absent renders nothing. That is the correct behaviour for a
 * layout written by a DIFFERENT app; it is the wrong behaviour for one written
 * by this app last week.
 *
 * uikit cannot fix it: these are this application's ids, and it must not learn
 * them (see uikit/editor/policy.js for what happens when it does). So the host
 * migrates its own vocabulary, and uikit calls this on a loaded document.
 *
 * Every step is idempotent: a document already in the current shape passes
 * through unchanged, which is what makes it safe to run on every load rather
 * than behind a version check that would need its own migration.
 */
const RENAMED_NODES = Object.freeze({
  /* The three tb-center regions took a prefix of their own once `panel:` came
     to mean "one of the fifteen curated containers" and nothing else. */
  "panel:toolSearch": "grp:toolSearch",
  "panel:viewModes": "grp:viewModes",
  "panel:playModes": "grp:playModes",
});

/* Menus used to be leaves whose items lived in a slot-bound container parked
   at the root, because an open .dropdown-menu is portaled to <body> and a
   plain parent/child pair would have had the renderer drag those buttons back
   into the wrapper. The entry's target() hook does that job now, so the
   containment can be honest — and a saved document still describing the old
   arrangement has to be folded into it. */
const MENU_ITEM_CONTAINERS = Object.freeze({
  "menuitems:file": "menu:file",
  "menuitems:edit": "menu:edit",
  "menuitems:export": "menu:export",
});

function renameIn(doc, from, to) {
  if (!doc.nodes[from] || doc.nodes[to]) return;
  doc.nodes[to] = doc.nodes[from];
  delete doc.nodes[from];
  if (doc.nodes[to].ref === from) doc.nodes[to].ref = to;
  for (const id of Object.keys(doc.nodes)) {
    const kids = doc.nodes[id].children;
    if (!Array.isArray(kids)) continue;
    const at = kids.indexOf(from);
    if (at >= 0) kids[at] = to;
  }
  for (const name of Object.keys(doc.variants || {})) {
    const variant = doc.variants[name];
    if (variant && variant.root === from) variant.root = to;
    const patch = variant && variant.patch;
    if (patch && Object.prototype.hasOwnProperty.call(patch, from)) {
      patch[to] = patch[from];
      delete patch[from];
    }
  }
}

function dropNode(doc, id) {
  delete doc.nodes[id];
  for (const key of Object.keys(doc.nodes)) {
    const kids = doc.nodes[key].children;
    if (!Array.isArray(kids)) continue;
    const at = kids.indexOf(id);
    if (at >= 0) kids.splice(at, 1);
  }
  for (const name of Object.keys(doc.variants || {})) {
    const patch = doc.variants[name] && doc.variants[name].patch;
    if (patch) delete patch[id];
  }
}

export function migrateSavedLayout(saved) {
  if (!saved || typeof saved !== "object" || !saved.nodes) return saved;
  const doc = JSON.parse(JSON.stringify(saved));

  for (const [from, to] of Object.entries(RENAMED_NODES)) renameIn(doc, from, to);

  const placed = new Set();
  for (const id of Object.keys(doc.nodes)) {
    for (const kid of doc.nodes[id].children || []) placed.add(kid);
  }

  const MENU_DEFAULTS = {
    "menu:file": MENU_FILE_CHILDREN,
    "menu:edit": MENU_EDIT_CHILDREN,
    "menu:export": MENU_EXPORT_CHILDREN,
    "menu:more": MENU_MORE_CHILDREN,
  };
  const menusWithUserChildren = new Set();

  for (const [container, menu] of Object.entries(MENU_ITEM_CONTAINERS)) {
    const node = doc.nodes[menu];
    if (!node) continue;
    const old = doc.nodes[container];
    let items;
    if (old) {
      /* The user's own order is what is being preserved here — that is the
         whole point of migrating rather than resetting — so the items move
         across as they were arranged, not as the default layout lists them. */
      items = Array.isArray(old.children) ? old.children.slice() : [];
      dropNode(doc, container);
      menusWithUserChildren.add(menu);
    } else if (Array.isArray(node.children)) {
      continue; // already the current shape
    } else {
      /* A leaf menu with nothing to fold in: a document from before the items
         were in the layout at all. Seed it from the defaults, minus anything
         the user has since put somewhere else — a menu command dragged onto
         the toolbar must not come back and appear twice. */
      items = MENU_DEFAULTS[menu].filter((id) => !placed.has(id));
    }
    doc.nodes[menu] = Object.assign({}, node, {
      type: "group",
      ref: menu,
      orient: "col",
      children: items,
      constraints: Object.assign({}, MENU_CONSTRAINTS),
    });
    for (const id of items) {
      if (!doc.nodes[id]) doc.nodes[id] = leaf(id);
    }
  }

  /* More used to be a leaf. Fold it into a group the same way, without a
     legacy menuitems:* container to steal children from. */
  const more = doc.nodes["menu:more"];
  if (more && !Array.isArray(more.children)) {
    const items = MENU_MORE_CHILDREN.filter((id) => !placed.has(id));
    doc.nodes["menu:more"] = Object.assign({}, more, {
      type: "group",
      ref: "menu:more",
      orient: "col",
      children: items,
      constraints: Object.assign({}, MENU_CONSTRAINTS),
    });
    for (const id of items) {
      if (!doc.nodes[id]) doc.nodes[id] = leaf(id);
    }
  }

  /* Dividers became nodes after menus did. Insert each default separator next
     to the neighbour it used to follow, but only when this menu has none —
     a user who deleted every divider must not get them back. */
  for (const [menu, defaults] of Object.entries(MENU_DEFAULTS)) {
    const node = doc.nodes[menu];
    if (!node || !Array.isArray(node.children)) continue;
    if (menusWithUserChildren.has(menu)) continue;
    if (node.children.some((id) => String(id).indexOf("sep:") === 0)) continue;
    const kids = node.children.slice();
    for (let i = 0; i < defaults.length; i++) {
      const id = defaults[i];
      if (String(id).indexOf("sep:") !== 0) continue;
      if (doc.nodes[id] || kids.includes(id)) continue;
      let at = kids.length;
      for (let j = i - 1; j >= 0; j--) {
        const found = kids.indexOf(defaults[j]);
        if (found >= 0) { at = found + 1; break; }
      }
      kids.splice(at, 0, id);
      doc.nodes[id] = { type: "separator", ref: id };
    }
    node.children = kids;
    if (!node.constraints) node.constraints = Object.assign({}, MENU_CONSTRAINTS);
    if (node.orient !== "col") node.orient = "col";
  }

  /* Groups default to a row. A menu is a column of items; without this, a
     saved document resolves orient:row and vertical drags never change index. */
  for (const id of Object.keys(doc.nodes)) {
    const n = doc.nodes[id];
    if (!n || n.type !== "group") continue;
    const ref = n.ref || id;
    if (String(id).indexOf("menu:") !== 0 && String(ref).indexOf("menu:") !== 0) continue;
    if (n.orient === "col") continue;
    doc.nodes[id] = Object.assign({}, n, { orient: "col" });
  }

  return doc;
}
