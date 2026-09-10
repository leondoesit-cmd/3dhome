/* The containers of 3dhome's chrome, as things a layout may place.
 *
 * WHY SELECTORS AND NOT IDS. Only one of these six panel sections has an id.
 * The plan budgeted for adding ids to index.html, and that turns out to be
 * unnecessary and undesirable for this phase: a curated selector is just as
 * stable, it is readable in a way a path hash never is, and it means the
 * parity phase changes ZERO markup — so when the layout renders identically,
 * that is a fact about uikit and not about edits made to help it along.
 *
 * WHY THIS GRANULARITY. These are the elements the host's own stylesheet
 * addresses. `#left-sidebar > .panel-section { display: none }` plus
 * `#left-sidebar[data-left="x"] > [data-left-pane="x"] { display: flex }` is
 * the entire left-pane switcher, and it only works while the panel sections
 * are DIRECT children of #left-sidebar. Adopting at exactly this level keeps
 * every such rule true. Going finer — individual buttons inside .tb-start —
 * is a later phase, and each place it breaks a selector is a rule that has to
 * be changed deliberately rather than discovered in production.
 */

/* `resize` says which edges may be pulled, and it is the host's to declare
   because the host is what knows how its own chrome is laid out. The three
   topbar columns are grid tracks — `grid-template-columns: minmax(0,1fr) auto
   minmax(0,1fr)` — so a width set on one of them fights the grid rather than
   resizing anything, and offering that handle would be a promise the editor
   cannot keep. The sidebar panes stack, so their height is the free axis. */
export const PANELS = [
  // topbar: the three grid columns of #topbar
  { id: "panel:tb-start", sel: "#topbar .tb-start", key: "uikit_p_tb_start", en: "Toolbar start",
    constraints: { resize: "none", accepts: ["command", "panel", "group", "item", "menu", "separator"] } },
  { id: "panel:tb-center", sel: "#topbar .tb-center", key: "uikit_p_tb_center", en: "Toolbar centre",
    constraints: { resize: "none", accepts: ["command", "panel", "group", "item"] } },
  { id: "panel:tb-end", sel: "#topbar .tb-end", key: "uikit_p_tb_end", en: "Toolbar end",
    constraints: { resize: "none", accepts: ["command", "panel", "group", "item", "menu", "separator"] } },

  // Left sidebar panes share the same customization registry as their tabs.
  { id: "panel:leftTabs", sel: "#leftTabs", key: "uikit_p_left_tabs", en: "Pane tabs",
    constraints: { resize: "y", minH: 28, maxH: 240 } },
  { id: "panel:planningGuide", sel: "#planningGuide", key: "guide_title", en: "Project guide",
    constraints: { resize: "y", minW: 180, minH: 120 } },
  { id: "panel:library", sel: "#left-sidebar .panel-section.furn-panel", key: "uikit_p_library", en: "Library",
    constraints: { resize: "y", minW: 180, minH: 120 } },
  { id: "panel:smarthome", sel: "#left-sidebar .panel-section.sh-section", key: "uikit_p_smarthome", en: "Smart home",
    constraints: { resize: "y", minW: 180, minH: 60 } },
  { id: "panel:mep", sel: "#left-sidebar .panel-section.mep-section", key: "uikit_p_mep", en: "Services",
    constraints: { resize: "y", minW: 180, minH: 60 } },
  { id: "panel:params", sel: "#paramSection", key: "uikit_p_params", en: "Parameters",
    constraints: { resize: "y", minW: 180, minH: 60 } },
  { id: "panel:warnings", sel: "#left-sidebar .panel-section.warn-section", key: "uikit_p_warnings", en: "Warnings",
    constraints: { resize: "y", minW: 180, minH: 60 } },
  { id: "panel:tree", sel: "#left-sidebar .panel-section.flex-fill", key: "uikit_p_tree", en: "Tree",
    constraints: { resize: "y", minW: 180, minH: 120 } },

  // right inspector: its five existing direct sections
  { id: "panel:inspectorMain", sel: "#right-inspector > .panel-section:first-child", key: "uikit_p_inspector", en: "Properties",
    constraints: { resize: "y", minH: 160, hide: false } },
  { id: "panel:cost", sel: "#right-inspector > .cost-section", key: "uikit_p_cost", en: "Cost",
    constraints: { resize: "y", minH: 60 } },
  { id: "panel:environment", sel: "#right-inspector > .env-section", key: "uikit_p_environment", en: "Environment",
    constraints: { resize: "y", minH: 60 } },
  { id: "panel:friends", sel: "#right-inspector > .friends-section", key: "uikit_p_friends", en: "Collaborators",
    constraints: { resize: "y", minH: 40 } },
  { id: "panel:site", sel: "#right-inspector > .site-section", key: "uikit_p_site", en: "Site",
    constraints: { resize: "y", minH: 80 } },
];

export function panelEntries(doc) {
  return PANELS.map((panel) => ({
    id: panel.id,
    kind: "panel",
    /* `textKey` is the contract's name for the string an "everywhere" rename
       targets — model/resolve.js reads entry.textKey and falls back to
       entry.id. Naming it anything else meant a panel rename was stored
       against "panel:tree" rather than the i18n key it actually renames. */
    textKey: panel.key,
    titleFallback: panel.en,
    icon: null,
    /* Resolved on every render rather than captured once: a pane can be
       replaced by the code that owns it, and a stale element reference would
       have uikit adopting a node that is no longer in the document. */
    adopt: () => doc.querySelector(panel.sel),
    constraints: panel.constraints || null,
  }));
}

export const menuAt = (d, key, index) => () => {
  const doc = d || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  return doc.querySelector("#topbar [data-i18n-aria='" + key + "']")?.closest(".dropdown")
    || (key === "menu_more" ? doc.querySelector("#moreMenu") : null)
    || (doc.querySelectorAll ? doc.querySelectorAll("#topbar .dropdown")[index] : null)
    || null;
};

export const menuItemsFor = (d, key, index) => () => {
  const doc = d || (typeof document !== "undefined" ? document : null);
  if (!doc) return null;
  const dd = menuAt(doc, key, index)();
  if (!dd) return null;
  return (doc.querySelectorAll ? [...doc.querySelectorAll("body > .dropdown-menu")].find((m) => m._dd === dd) : null)
    || dd.querySelector(".dropdown-menu")
    || null;
};

export function deepEntries(doc, runAction) {
  const d = doc || (typeof document !== "undefined" ? document : null);
  if (!d) return [];

  /* One shape for every deep entry, because there are now twenty-two of them
     across three containers and the next container should cost a line each.
     The fields are the same ones a panel entry carries; what makes these
     different is only that they name something INSIDE a container the layout
     already had, rather than the container itself. */
  const at = (sel) => () => d.querySelector(sel) || null;
  const runs = (act) => () => {
    if (typeof runAction === "function") return runAction(act);
    if (typeof window !== "undefined" && window.__runAction) window.__runAction(act);
  };

  function deep(id, kind, textKey, titleFallback, icon, adopt, run, target, extra) {
    const entry = {
      id, kind, textKey, titleFallback, icon, adopt,
      escapes: true,
      constraints: { resize: "none" },
    };
    if (run) entry.run = run;
    /* Where this container's CHILDREN go, when that is not the element itself.
       A dropdown's node is the .dropdown wrapper — that is what sits among
       .tb-start's children and what must keep its place there — but its items
       belong in the .dropdown-menu, which the host moves to <body> when the
       menu opens. menuItemsFor() finds it in either home, so the hook is the
       whole of what uikit needs to know and none of how it works. */
    if (target) entry.target = target;
    if (extra) Object.assign(entry, extra);
    if (extra && extra.constraints) {
      entry.constraints = Object.assign({ resize: "none" }, extra.constraints);
    }
    return entry;
  }

  const MENU_ACCEPTS = {
    constraints: {
      resize: "none",
      accepts: ["command", "separator", "menu"],
      ungroup: false,
    },
  };

  const atMenuItem = (key, index, act) => () => {
    const menuEl = menuItemsFor(d, key, index)();
    return menuEl ? menuEl.querySelector(`button[data-act='${act}']`) : null;
  };

  const atDivider = (key, index, nth) => () => {
    const menuEl = menuItemsFor(d, key, index)();
    if (!menuEl) return null;
    return menuEl.querySelectorAll(".menu-divider")[nth] || null;
  };

  function placement(id, source, key, index, act, extra) {
    return Object.assign({
      id,
      kind: "command",
      source,
      adopt: atMenuItem(key, index, act),
      escapes: true,
      constraints: { resize: "none" },
    }, extra || {});
  }

  function divider(id, key, index, nth) {
    return {
      id,
      kind: "separator",
      textKey: "uikit_kind_separator",
      titleFallback: "Divider",
      adopt: atDivider(key, index, nth),
      constraints: { resize: "none" },
    };
  }

  return [
    // ---- .tb-start ------------------------------------------------------
    deep("menu:file", "menu", "menu_file", "File menu", "ph-floppy-disk",
      menuAt(d, "menu_file", 0), null, menuItemsFor(d, "menu_file", 0), MENU_ACCEPTS),
    deep("act:newPlan", "command", "new_plan", "New plan", "ph-file-plus",
      atMenuItem("menu_file", 0, "newPlan"), runs("newPlan")),
    deep("act:save", "command", "save", "Save", "ph-floppy-disk",
      atMenuItem("menu_file", 0, "save"), runs("save")),
    deep("act:load", "command", "load", "Load", "ph-folder-open",
      atMenuItem("menu_file", 0, "load"), runs("load")),
    deep("act:addFloor", "command", "floor_add", "Add floor", "ph-stack-plus",
      atMenuItem("menu_file", 0, "addFloor"), runs("addFloor")),
    deep("act:importjson", "command", "importjson_t", "Import JSON", "ph-upload-simple",
      atMenuItem("menu_file", 0, "importjson"), runs("importjson")),
    deep("act:importBlueprintTrace", "command", "bp_trace_menu", "Trace floor plan", "ph-ruler",
      atMenuItem("menu_file", 0, "importBlueprintTrace"), runs("importBlueprintTrace")),
    deep("act:importBlueprint", "command", "bp_menu", "Import blueprint", "ph-blueprint",
      atMenuItem("menu_file", 0, "importBlueprint"), runs("importBlueprint")),
    deep("act:roomScan", "command", "rs_menu", "Mobile room scan", "ph-scan",
      atMenuItem("menu_file", 0, "roomScan"), runs("roomScan")),
    deep("act:reset", "command", "reset", "Reset all", "ph-arrow-counter-clockwise",
      atMenuItem("menu_file", 0, "reset"), runs("reset")),
    divider("sep:file-1", "menu_file", 0, 0),
    deep("menu:edit", "menu", "menu_edit", "Edit menu", "ph-pencil-simple",
      menuAt(d, "menu_edit", 1), null, menuItemsFor(d, "menu_edit", 1), MENU_ACCEPTS),
    deep("btn:undo", "command", "undo", "Undo", "ph-arrow-u-up-left",
      atMenuItem("menu_edit", 1, "undo"), runs("undo")),
    deep("btn:redo", "command", "redo", "Redo", "ph-arrow-u-up-right",
      atMenuItem("menu_edit", 1, "redo"), runs("redo")),
    deep("act:dupSel", "command", "dup", "Duplicate", "ph-copy",
      atMenuItem("menu_edit", 1, "dupSel"), runs("dupSel")),
    deep("act:groupItems", "command", "groupItems", "Group", "ph-stack",
      atMenuItem("menu_edit", 1, "groupItems"), runs("groupItems")),
    deep("act:ungroupItems", "command", "ungroupItems", "Ungroup", "ph-stack-simple",
      atMenuItem("menu_edit", 1, "ungroupItems"), runs("ungroupItems")),
    deep("act:deleteSel", "command", "del", "Delete", "ph-trash",
      atMenuItem("menu_edit", 1, "deleteSel"), runs("deleteSel")),
    divider("sep:edit-1", "menu_edit", 1, 0),
    divider("sep:edit-2", "menu_edit", 1, 1),
    deep("menu:export", "menu", "menu_export", "Export menu", "ph-export",
      menuAt(d, "menu_export", 2), null, menuItemsFor(d, "menu_export", 2), MENU_ACCEPTS),
    deep("act:exportjson", "command", "exportjson_t", "Export JSON", "ph-download-simple",
      atMenuItem("menu_export", 2, "exportjson"), runs("exportjson")),
    deep("act:png2d", "command", "png2d_t", "Export PNG 2D", "ph-image",
      atMenuItem("menu_export", 2, "png2d"), runs("png2d")),
    deep("act:png3d", "command", "png3d_t", "Export PNG 3D", "ph-camera-rotate",
      atMenuItem("menu_export", 2, "png3d"), runs("png3d")),
    deep("act:exportgltf", "command", "exportgltf_t", "Export GLB", "ph-cube",
      atMenuItem("menu_export", 2, "exportgltf"), runs("exportgltf")),
    deep("menu:history", "panel", "hist_title", "History menu", "ph-clock-counter-clockwise",
      at("#topbar .tb-start .history-dropdown-wrap")),
    deep("act:openModeler", "command", "modeler_launch", "Model editor", "ph-cube",
      at("#openModelerTop"), runs("openModeler")),
    deep("act:workspace", "command", "workspace_t", "Project workspace", "ph-stack",
      at("#workspaceBtn"), runs("workspace")),
    deep("act:undo", "command", "undo", "Undo", "ph-arrow-u-up-left",
      at("#topbar .tb-start > button[data-act='undo']"), runs("undo")),
    deep("act:redo", "command", "redo", "Redo", "ph-arrow-u-up-right",
      at("#topbar .tb-start > button[data-act='redo']"), runs("redo")),

    /* ---- .tb-center ----------------------------------------------------
     * Three regions, not their buttons. The view pill and the play pill are
     * styled as single controls — `.tb-pill` draws one rounded group with
     * dividers between its children — so taking them apart would hand the
     * user three naked buttons and no way to get the pill back. The search
     * box is one widget with a panel that portals out of it.
     *
     * #m-top-selection is deliberately absent: it is the phone-only title
     * mirror, kept hidden and written by the mobile shell, and it is the one
     * child the compact-nav rule above exempts. */
    deep("grp:toolSearch", "panel", "uikit_p_tool_search", "Tool search",
      "ph-magnifying-glass", at("#toolSearch")),
    deep("grp:viewModes", "panel", "uikit_p_view_modes", "View switcher",
      "ph-blueprint", at("#viewModePill")),
    deep("grp:playModes", "panel", "uikit_p_play_modes", "Play modes",
      "ph-play", at("#playPill")),

    /* ---- .tb-end -------------------------------------------------------
     * `act:` where the toolbar button carries its own data-act, so this entry
     * REPLACES the one scanCommands would build — an adopted element rather
     * than a fresh button, which is what keeps the badge, the tooltip and the
     * disabled state the app maintains on it. `btn:` where the element has no
     * action name of its own; `act:friends` and `act:agent` already belong to
     * the menu items inside #moreMenu, and quietly re-pointing them at these
     * buttons would change what the palette places. */
    deep("act:openTextureGallery", "command", "tex_gallery", "Texture gallery",
      "ph-paint-brush-broad", at("#texGalleryBtn"), runs("openTextureGallery")),
    deep("act:autoGenerate", "command", "auto_gen", "Auto-generate apartment",
      "ph-magic-wand", at("#autoGenerateBtn"), runs("autoGenerate")),
    deep("menu:more", "menu", "menu_more", "More menu", "ph-dots-three-outline",
      at("#moreMenu"), null, menuItemsFor(d, "menu_more", 3), MENU_ACCEPTS),
    placement("more:openModeler", "act:openModeler", "menu_more", 3, "openModeler"),
    placement("more:uikitCustomize", "act:uikitCustomize", "menu_more", 3, "uikitCustomize", {
      constraints: { resize: "none", hide: false },
    }),
    placement("more:walk", "act:walk", "menu_more", 3, "walk"),
    placement("more:photo", "act:photo", "menu_more", 3, "photo"),
    placement("more:rc", "act:rc", "menu_more", 3, "rc"),
    placement("more:zombies", "act:zombies", "menu_more", 3, "zombies"),
    placement("more:lava", "act:lava", "menu_more", 3, "lava"),
    divider("sep:more-1", "menu_more", 3, 0),
    placement("more:openTextureGallery", "act:openTextureGallery", "menu_more", 3, "openTextureGallery"),
    placement("more:autoGenerate", "act:autoGenerate", "menu_more", 3, "autoGenerate"),
    placement("more:friends", "act:friends", "menu_more", 3, "friends"),
    placement("more:agent", "act:agent", "menu_more", 3, "agent"),
    divider("sep:more-2", "menu_more", 3, 1),
    placement("more:toggleLegacy", "act:toggleLegacy", "menu_more", 3, "toggleLegacy"),
    deep("btn:friends", "command", "fr_title", "Collaborators", "ph-users-three",
      at("#friendsBtn")),
    deep("act:shortcuts", "command", "keys_title", "Keyboard shortcuts", "ph-keyboard",
      at("#shortcutsBtn"), runs("shortcuts")),
    deep("btn:plannerGuide", "command", "planner_guide_title", "Planner guide",
      "ph-graduation-cap", at("#plannerTutorialBtn")),
    deep("btn:agent", "command", "agent_title", "AI helper", "ph-robot", at("#agentBtn")),
    deep("btn:videoStudio", "command", "video_studio_title", "Video studio",
      "ph-film-slate", at("#videoStudioBtn")),
    deep("btn:settings", "command", "settings_title", "Settings", "ph-gear", at("#btn_settings")),
    deep("btn:theme", "command", "theme_toggle", "Theme", "ph-sun", at("#themeToggle")),
    deep("act:lang", "command", "lang_toggle", "Language", "ph-globe",
      at("#langBtn"), runs("lang")),
    // ---- #leftTabs ------------------------------------------------------
    deep("tab:project", "command", "guide_tab", "Project tab", "ph-clipboard-text",
      at("#leftTabs button[data-left-tab='project']"),
      () => {
        const el = d.querySelector("#leftTabs button[data-left-tab='project']");
        if (el) el.click();
      }),
    deep("tab:library", "command", "left_tab_library", "Library tab", "ph-books",
      at("#leftTabs button[data-left-tab='library']"),
      () => {
        const el = d.querySelector("#leftTabs button[data-left-tab='library']");
        if (el) el.click();
      }),
    deep("tab:home", "command", "left_tab_home", "Smart home tab", "ph-house",
      at("#leftTabs button[data-left-tab='home']"),
      () => {
        const el = d.querySelector("#leftTabs button[data-left-tab='home']");
        if (el) el.click();
      }),
    deep("tab:structure", "command", "left_tab_structure", "Structure tab", "ph-building-office",
      at("#leftTabs button[data-left-tab='structure']"),
      () => {
        const el = d.querySelector("#leftTabs button[data-left-tab='structure']");
        if (el) el.click();
      }),
    deep("tab:tree", "command", "left_tab_tree", "Tree tab", "ph-tree-structure",
      at("#leftTabs button[data-left-tab='tree']"),
      () => {
        const el = d.querySelector("#leftTabs button[data-left-tab='tree']");
        if (el) el.click();
      }),
  ];
}
