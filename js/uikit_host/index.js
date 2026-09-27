/* Wiring uikit into 3dhome, behind a flag that is off by default.
 *
 * WHY THE ADAPTER LIVES IN js/ AND NOT IN uikit/adapters/.
 * The plan's file layout put it at uikit/adapters/host_3dhome/, which
 * contradicts the plan's own load-bearing rule that uikit/ must not import
 * from js/ — and this adapter needs tool_search, chrome_posture and i18n. The
 * rule is the architecture; the folder was incidental. Host-specific glue is
 * the HOST's code: it may import from both sides, uikit/ stays importable by
 * an app that has never heard of 3dhome, and extracting the module later is
 * moving a directory rather than disentangling one.
 *
 * The flag is `mf_uikit` in localStorage, matching mf_tool_titles next door.
 * Off, this module costs one localStorage read and nothing else — it is
 * imported dynamically, so its code is not even fetched. On, the layout is
 * applied and uikit is inert until customize mode is switched on.
 *
 * Nothing here is user-visible yet, by design. Phase 3 exists to prove the
 * document can drive the real chrome without changing it.
 */

import { createUIKit, createLocalStorage } from "../../uikit/index.js";
import { getLang, onLangChange, t } from "../i18n.js";
import { ICON_SEMANTIC_NAMES } from "../icon_theme_assets.js";
import { createIconContract } from "./icon_overrides.js";
import { resolveIconName } from "../icon_settings.js";
import { curatedOnlyCommands, scanCommands, titleFor, applySource } from "./commands.js";
import * as dock from "./dock.js";
import * as ribbon from "./ribbon.js";
import { defaultLayout, migrateSavedLayout, SLOTS, SLOT_NAMES } from "./layout.js";
import { panelEntries, deepEntries, PANELS } from "./panels.js";
import { presetList, tokenList } from "./presets.js";
import { applyTextOverrides, createLabelContract } from "./texts.js";
import { chooseVariant } from "./variants.js";
import { getMenuController } from "../dropdown_menus.js";
import { surfaces, connectSurfaces, reconcileMenus, destroyAllMenus } from "./surfaces.js";

const FLAG = "mf_uikit";
const STYLE_ID = "uikit-stylesheet";

/* uikit ships its own stylesheet, and until it is on the page the module is
   subtly broken in ways nothing else notices: the customize overlay is
   position:fixed over the whole viewport, and without `pointer-events: none`
   it swallows every click in the application.
 *
 * It is injected here rather than linked from index.html so a page with the
 * flag off pays nothing for a feature it is not using, and resolved from
 * import.meta.url rather than a path relative to the document so it does not
 * depend on where the app happens to be served from. */
function ensureStylesheet(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const link = doc.createElement("link");
  link.id = STYLE_ID;
  link.rel = "stylesheet";
  link.href = new URL("../../uikit/uikit.css", import.meta.url).href;
  doc.head.appendChild(link);
}

function removeStylesheet(doc) {
  const link = doc.getElementById(STYLE_ID);
  if (link && link.parentNode) link.parentNode.removeChild(link);
}

/* t() answers a missing key with the key itself, so every label in this file
   goes through here and falls back to English rather than showing a key. */
function label(key, fallback) {
  const value = t(key);
  return value == null || value === key ? fallback : value;
}

function reflectCustomizeState(doc, editing) {
  if (!doc || typeof doc.querySelector !== "function") return;
  const control = doc.querySelector('[data-act="uikitCustomize"]');
  if (control) control.setAttribute("aria-checked", editing ? "true" : "false");
}

/* UI Customize mode is switched off for now (owner, 2026-09-27): the Round-6
   desktop layout (css/pro_skin.css) arranges the planner's chrome itself, and
   a saved customisation would rearrange the same header and panels under it.
   Nothing mounts — not the editor, not a saved layout — until this is false
   again; the code and the saved layouts are kept. */
export const CUSTOMIZE_DISABLED = true;

export function uikitEnabled() {
  if (CUSTOMIZE_DISABLED) return false;
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch (_) {
    return false;
  }
}

export function setUikitEnabled(on) {
  try {
    localStorage.setItem(FLAG, on ? "1" : "0");
  } catch (_) {}
}

/* A live registry rather than a snapshot array.
 *
 * Entries are built once — scanning 179 attributes on every render would be
 * silly — but the TITLE is resolved on each get(), because it depends on the
 * current language and the app can switch language without reloading. This is
 * why model/resolve.js takes the registry as something with get()/ids() and
 * not as a frozen list. */
export function createHostRegistry(doc, options) {
  const opts = options || {};
  const lang = opts.lang || getLang;
  const entries = new Map();

  const add = (entry, overwrite) => {
    if (!entry || !entry.id) return;
    if (!overwrite && entries.has(entry.id)) return;
    entries.set(entry.id, entry);
  };
  const addOnce = (entry) => add(entry, false);
  panelEntries(doc).forEach(addOnce);
  deepEntries(doc, opts.run).forEach(addOnce);
  /* The plan dock's four panels. Their adopt() reaches into the dock's own
     wrappers, which exist only once initPlanToolsDock has run — it does, well
     before this, but the entry resolves lazily either way. */
  dock.dockEntries().forEach(addOnce);
  ribbon.ribbonEntries(label).forEach(addOnce);
  scanCommands(doc, opts.run).forEach(addOnce);
  curatedOnlyCommands(doc, opts.run).forEach(addOnce);

  function resolved(entry) {
    if (!entry) return null;
    const sourced = applySource(entry, (id) => entries.get(id) || null);
    if (!sourced.ok) return null;
    entry = sourced.entry;
    const active = lang();
    let title;
    if (entry.kind === "command") {
      title = titleFor(entry, active);
    } else if (entry.textKey) {
      const translated = t(entry.textKey);
      title = translated === entry.textKey ? entry.titleFallback : translated;
    } else {
      title = entry.titleFallback || entry.id;
    }
    return Object.assign({}, entry, { title });
  }

  return {
    get: (id) => resolved(entries.get(id)),
    ids: () => [...entries.keys()],
    size: () => entries.size,
    raw: (id) => entries.get(id) || null,
    add,
  };
}

let instance = null;
let langHooked = false;

function holdDropdownOpen(doc, nodeId, on) {
  const menus = getMenuController();
  if (!menus) return;
  if (!nodeId || !on) {
    menus.closeAll({ preservePinned: false });
    return;
  }
  const el = doc.querySelector('[data-uikit-id="' + nodeId + '"]');
  const dd = menus.dropdownFor(el);
  if (!dd) return;
  menus.openPath(menus.pathOf(dd), { pin: true });
}

function paintMenuItemRoles(doc) {
  if (!doc || typeof doc.querySelectorAll !== "function") return;
  doc.querySelectorAll(".dropdown-menu button").forEach((button) => {
    if (button.classList.contains("dropdown-trigger")) {
      if (!button.getAttribute("aria-haspopup")) button.setAttribute("aria-haspopup", "menu");
      return;
    }
    if (!button.getAttribute("role")) button.setAttribute("role", "menuitem");
  });
}

function hostNames() {
  const map = {
    "n:app": ["uikit_n_app", "Interface"],
    "n:topbar": ["uikit_n_topbar", "Top toolbar"],
    "n:left": ["uikit_n_left", "Left sidebar"],
    "n:right": ["uikit_n_right", "Right inspector"],
  };
  for (const panel of PANELS) {
    if (panel.id && panel.key) {
      map[panel.id] = [panel.key, panel.en || panel.id];
    }
  }
  for (const group of ribbon.GROUPS || []) {
    if (group.key) {
      map[ribbon.groupNodeId(group.key)] = ["md_" + group.key, group.key];
      const btns = (ribbon.RIBBON_BUTTONS && ribbon.RIBBON_BUTTONS[group.key]) || [];
      for (const b of btns) {
        map[ribbon.groupButtonNodeId(group.key, b.id)] = [b.textKey, b.fallback];
      }
    }
  }
  for (const pane of ribbon.PANES || []) {
    map[ribbon.paneNodeId(pane)] = ["md_pane_" + pane, pane];
  }
  for (const zone of dock.ZONES || []) {
    map[dock.zoneNodeId(zone)] = ["uikit_dock_" + zone.replace(/-/g, "_"), zone];
  }
  map["act:openModeler"] = ["modeler_launch", "Model editor"];
  map["menu:file"] = ["menu_file", "File menu"];
  map["menu:edit"] = ["menu_edit", "Edit menu"];
  map["menu:export"] = ["menu_export", "Export menu"];
  map["menu:more"] = ["menu_more", "More menu"];
  map["act:workspace"] = ["workspace_t", "Project workspace"];
  map["act:undo"] = ["undo", "Undo"];
  map["act:redo"] = ["redo", "Redo"];
  map["menu:history"] = ["hist_title", "Edit history"];
  map["tab:project"] = ["guide_tab", "Project tab"];
  map["tab:library"] = ["left_tab_library", "Library tab"];
  map["tab:home"] = ["left_tab_home", "Smart home tab"];
  map["tab:structure"] = ["left_tab_structure", "Structure tab"];
  map["tab:tree"] = ["left_tab_tree", "Tree tab"];
  return map;
}

/* Build and mount. Safe to call when the flag is off — it returns null and
   touches nothing, which is what makes the call site in main.js a one-liner
   with no branch of its own. */
export function initUIKit(options) {
  const opts = options || {};
  if (CUSTOMIZE_DISABLED) return null;
  if (!opts.force && !uikitEnabled()) return null;
  if (instance) return instance;

  const doc = opts.document || document;
  const mount = doc.getElementById(opts.mountId || "app");
  if (!mount) return null;

  ensureStylesheet(doc);
  const registry = createHostRegistry(doc, { run: opts.run });
  connectSurfaces(doc, (entry) => registry.add(entry, true));
  const ui = createUIKit({
    mount,
    registry,
    storage: opts.storage || createLocalStorage({ prefix: "home3d_uikit:" }),
    key: "planner",
    migrateDocument: migrateSavedLayout,
    defaults: defaultLayout(),
    /* Only the three slots the layout actually uses, all borrowed. Declaring
       the default six would have uikit CREATE three empty divs inside #app,
       which is a change to the host's DOM in the one phase whose whole claim
       is that it makes none. */
    slots: SLOTS,
    slotNames: SLOT_NAMES,
    names: hostNames(),
    i18n: { t, lang: getLang, onChange: null },
    /* uikit stores an icon NAME and never learns what a name looks like. The
       host resolves it, so a button uikit places still follows whichever of
       the ten icon sets the user has chosen, and the icon picker offers the
       app's real vocabulary rather than a list uikit invented. */
    icons: {
      ...createIconContract(),
      list: () => ICON_SEMANTIC_NAMES.slice(),
      resolve: resolveIconName,
      render: (name, host) => {
        if (!name) {
          host.className = "uikit-icon";
          return;
        }
        const resolved = resolveIconName(name) || name;
        const cls = resolved.startsWith("ph-") ? resolved : "ph-" + resolved;
        host.className = "uikit-icon ph " + cls;
      },
      iconFor: (node) => {
        if (!node) return null;
        if (node.kind === "action:rename" || node.kind === "rename") return "ph-pencil-simple";
        if (node.kind === "action:reset" || node.kind === "reset") return "ph-arrow-counter-clockwise";
        if (node.icon) return node.icon;
        if (node.entry && node.entry.icon) return node.entry.icon;
        const kind = node.entry && node.entry.kind;
        const type = node.type;
        if (kind === "menu" || type === "group" && node.entry && node.entry.kind === "menu") return "ph-list";
        if (type === "group") return "ph-squares-four";
        if (type === "bar") return "ph-rows";
        if (type === "stack") return "ph-sidebar-simple";
        if (type === "dock") return "ph-layout";
        if (type === "separator") return "ph-minus";
        if (type === "item") {
          return kind === "panel" ? "ph-file-text" : "ph-cursor-click";
        }
        return null;
      },
    },
    /* Renaming one item reaches the element itself, not only uikit's own
       chrome. The words live behind this app's data-i18n* attributes, so the
       host is what writes them; uikit only says which element and what to
       say. `instance` is read lazily because it is assigned below, after
       createUIKit returns. */
    labels: createLabelContract(doc, () => {
      const live = instance;
      return (live && live.doc && live.doc.overrides && live.doc.overrides.text) || null;
    }),
    variants: { choose: chooseVariant },
    /* The host's vocabulary, not uikit's: which layouts it ships as starting
       points, and which of its own CSS variables a user may retint. */
    presets: (scope) => presetList(label, scope),
    tokens: () => tokenList(label),
    exportName: "modelforge-layout",
    holdOpen: (nodeId, on) => holdDropdownOpen(doc, nodeId, on),
    surfaces,
    onRun: (entry) => entry && typeof entry.run === "function" && entry.run(),
    onEditChange: (editing) => {
      reflectCustomizeState(doc, editing);
      if (!editing) {
        const menus = getMenuController();
        if (menus) menus.closeAll({ preservePinned: false });
      }
    },
    /* The dock lays itself out around whatever uikit just placed, so it has to
       run after the render rather than before it. User menus are a projection
       of the document: ensure missing ones, destroy ones the doc no longer
       names. */
    onRender: (resolved) => {
      dock.onRender();
      reconcileMenus(instance && instance.doc);
      paintMenuItemRoles(doc);
    },
  });

  /* Connected before mount: mount() loads the document and renders, and the
     dock's zone slots have to be registerable by then or the eight zone
     containers are skipped on the very first pass. */
  dock.connect(() => instance || ui);
  ribbon.connect(() => instance || ui);
  const parts = dock.attachedParts();
  if (parts && parts.zoneEls) dock.registerZones(parts.zoneEls);

  instance = ui;
  ui.mount();
  reconcileMenus(ui.doc);
  ui.refreshNow();
  applyOverrides(ui, doc);

  /* i18n.onLangChange has no unsubscribe, so this is registered once for the
     life of the page and checks whether there is still an instance to serve
     rather than leaking a listener per mount/unmount cycle. */
  if (!langHooked) {
    langHooked = true;
    onLangChange(() => {
      if (!instance) return;
      instance.refreshNow();
      if (instance.editing && instance.editor) instance.editor.refreshLanguage();
      applyOverrides(instance, instance.mountDocument);
    });
  }

  instance = ui;
  return ui;
}

/* The app has just rewritten its own strings; put the user's back on top. */
function applyOverrides(ui, doc) {
  const document_ = doc || (typeof document !== "undefined" ? document : null);
  if (!document_ || !ui.doc) return 0;
  return applyTextOverrides(document_, ui.doc.overrides && ui.doc.overrides.text, getLang());
}

/* The way in.
 *
 * ONE listener, in the app's own dispatcher. The shortcut lives in js/ui.js
 * next to every other one and calls runAction("uikitCustomize"), which lands
 * here. An earlier version ALSO listened on the document from this module, and
 * the two cancelled out: the capture-phase listener toggled customize mode off
 * and the bubble-phase one turned it straight back on, so the shortcut opened
 * the editor and then could never close it.
 *
 * openCustomize() is what the More menu and the keyboard shortcut both call,
 * and it works from a cold start: if the feature has never been switched on
 * there is nothing mounted for a shortcut to reach, which is exactly the state
 * a first-time user is in. So it turns the flag on, mounts, and enters
 * customize mode in one step. Anything less means the menu item appears to do
 * nothing the first time it is used.
 */
export function openCustomize() {
  if (CUSTOMIZE_DISABLED) return false;
  if (!instance) {
    setUikitEnabled(true);
    if (!initUIKit({ force: true })) return false;
  }
  return toggleCustomize();
}

export function toggleCustomize(on) {
  if (!instance) return false;
  const want = on == null ? !instance.editing : !!on;
  instance.edit(want);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
  return want;
}

export function teardownUIKit() {
  if (!instance) return [];
  const target = instance.mountDocument || document;
  removeStylesheet(target);
  const problems = instance.unmount();
  destroyAllMenus();
  instance = null;
  return problems;
}

export function activeUIKit() {
  return instance;
}

const api = {
  init: initUIKit,
  teardown: teardownUIKit,
  customize: toggleCustomize,
  open: openCustomize,
  active: activeUIKit,
  enabled: uikitEnabled,
  setEnabled: setUikitEnabled,
  registry: createHostRegistry,
  layout: defaultLayout,
};

export default api;

/* A handle for the console and for tests, which need to turn the flag on and
   mount without reloading. Set at module scope: by the time anything can reach
   it, the module has finished evaluating. */
if (typeof window !== "undefined") window.__uikitHost = api;
