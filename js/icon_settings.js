import { getLang, t } from "./i18n.js";
import { ICON_SEMANTIC_NAMES, ICON_THEME_ASSETS, loadIconTheme } from "./icon_theme_assets.js";

var THEME_KEY = "home3d_icon_theme";
var OVERRIDES_KEY = "home3d_icon_overrides";
var DEFAULT_THEME = "lucide";
var observer = null;

var THEMES = [
  { id: "lucide", name: "icons_set_lucide", desc: "icons_set_lucide_desc", style: "icons_style_outline", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "material", name: "icons_set_material", desc: "icons_set_material_desc", style: "icons_style_rounded", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "mdi", name: "icons_set_mdi", desc: "icons_set_mdi_desc", style: "icons_style_pictogram", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "tabler", name: "icons_set_tabler", desc: "icons_set_tabler_desc", style: "icons_style_technical", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "huge", name: "icons_set_huge", desc: "icons_set_huge_desc", style: "icons_style_expressive", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "cyber", name: "icons_set_cyber", desc: "icons_set_cyber_desc", style: "icons_style_cyber", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "duotone", name: "icons_set_duotone", desc: "icons_set_duotone_desc", style: "icons_style_duotone", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "retro", name: "icons_set_retro", desc: "icons_set_retro_desc", style: "icons_style_retro", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "brutalist", name: "icons_set_brutalist", desc: "icons_set_brutalist_desc", style: "icons_style_brutalist", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
  { id: "sketch", name: "icons_set_sketch", desc: "icons_set_sketch_desc", style: "icons_style_sketch", icons: ["ph-house", "ph-pencil-line", "ph-gear"] },
];
var LEGACY_THEME_IDS = {
  soft: "lucide", air: "lucide", classic: "lucide",
  technical: "tabler", blueprint: "tabler",
  contrast: "mdi", forge: "mdi", solid: "material",
};
var state = loadState();

/* The ten icon languages are ~117 KB of SVG each and only one is on screen, so
   they load one module at a time. This top-level await is what lets the rest of
   this file stay synchronous: the module does not finish evaluating — so
   initIconSettings() cannot run and no icon can render blank — until the active
   theme's artwork is in memory. Everything else is fetched on demand: another
   theme when it is picked, and all ten when the settings pane wants sample
   cards for them. */
await loadIconTheme(state.theme).catch(function () {
  if (state.theme !== DEFAULT_THEME) return loadIconTheme(DEFAULT_THEME).catch(function () {});
});

var ICON_LABELS = {
  he: {
    "ph-gear": "הגדרות", "ph-gear-six": "הגדרות מתקדמות", "ph-house": "בית",
    "ph-house-line": "בית בקו", "ph-cube": "קובייה", "ph-cube-focus": "מודל תלת־ממד",
    "ph-floppy-disk": "שמירה", "ph-folder-open": "פתיחת קובץ", "ph-file-plus": "קובץ חדש",
    "ph-magnifying-glass": "חיפוש", "ph-plus": "הוספה", "ph-minus": "הפחתה",
    "ph-trash": "מחיקה", "ph-pencil-line": "עריכה", "ph-copy": "העתקה", "ph-copy-simple": "שכפול",
    "ph-check": "אישור", "ph-check-circle": "אישור מוצלח", "ph-x": "סגירה", "ph-x-circle": "ביטול",
    "ph-eye": "הצגה", "ph-eye-slash": "הסתרה", "ph-lock": "נעילה", "ph-lock-simple": "נעילה פשוטה",
    "ph-lock-simple-open": "פתיחה", "ph-list": "תפריט", "ph-dots-three-outline": "פעולות נוספות",
    "ph-caret-down": "פתיחה מטה", "ph-caret-up": "פתיחה מעלה", "ph-caret-left": "חזרה שמאלה",
    "ph-caret-right": "המשך ימינה", "ph-arrow-left": "חץ שמאלה", "ph-arrow-right": "חץ ימינה",
    "ph-arrow-up": "חץ מעלה", "ph-arrow-down": "חץ מטה", "ph-sun": "מצב בהיר", "ph-moon": "מצב כהה",
    "ph-cloud": "ענן", "ph-cloud-sun": "מצב דמדומים", "ph-wall": "קיר", "ph-door": "דלת",
    "ph-door-open": "דלת פתוחה", "ph-window": "חלון", "ph-armchair": "ריהוט", "ph-bed": "מיטה",
    "ph-ruler": "סרגל", "ph-compass-tool": "מצפן שרטוט", "ph-line-segment": "מקטע קו",
    "ph-cursor": "סמן", "ph-hand": "יד", "ph-camera": "מצלמה", "ph-image": "תמונה",
    "ph-play": "הפעלה", "ph-pause": "השהיה", "ph-info": "מידע", "ph-warning-circle": "אזהרה",
    "ph-question": "עזרה", "ph-download-simple": "הורדה", "ph-upload-simple": "העלאה",
    "ph-export": "ייצוא", "ph-printer": "הדפסה", "ph-map-pin": "מיקום", "ph-globe": "עולם",
  },
  en: {},
};

function safeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) {}
}

function loadState() {
  var theme = safeGet(THEME_KEY) || DEFAULT_THEME;
  theme = LEGACY_THEME_IDS[theme] || theme;
  if (!THEMES.some(function (item) { return item.id === theme; })) theme = DEFAULT_THEME;
  var overrides = {};
  try {
    var parsed = JSON.parse(safeGet(OVERRIDES_KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) overrides = parsed;
  } catch (e) {}
  return { theme: theme, overrides: overrides };
}

function saveState() {
  safeSet(THEME_KEY, state.theme);
  safeSet(OVERRIDES_KEY, JSON.stringify(state.overrides));
}

function iconClass(node) {
  if (!node || !node.classList) return "";
  for (var i = 0; i < node.classList.length; i++) {
    var cls = node.classList[i];
    if (cls !== "ph" && /^ph-[a-z0-9-]+$/.test(cls)) return cls;
  }
  return "";
}

/* A theme that is not in memory yet (a `data-icon-static-theme` sample card, or
   a stored theme that failed to load) draws from the default set for now and
   asks for its own artwork; the repaint on arrival re-renders it for real. */
function iconAsset(themeId, semantic) {
  var theme = ICON_THEME_ASSETS[themeId];
  if (!theme) {
    requestTheme(themeId);
    theme = ICON_THEME_ASSETS[DEFAULT_THEME];
  }
  var assetName = theme && theme.map[semantic];
  return assetName && theme.icons[assetName] ? theme.icons[assetName] : null;
}

var requested = {};
function requestTheme(themeId) {
  if (!themeId || requested[themeId]) return;
  requested[themeId] = true;
  loadIconTheme(themeId).then(function () {
    // Drop the render keys this theme drew with the stand-in artwork.
    var stale = document.querySelectorAll('i.ph[data-icon-render-key^="' + themeId + ':"]');
    for (var i = 0; i < stale.length; i++) stale[i].removeAttribute("data-icon-render-key");
    applyTree(document.body);
  }, function () {});
}

function svgMarkup(themeId, semantic) {
  var asset = iconAsset(themeId, semantic);
  if (!asset) return "";
  return '<svg viewBox="0 0 ' + asset.width + " " + asset.height + '" aria-hidden="true" focusable="false">' + asset.body + "</svg>";
}

export function resolveIconName(source) {
  return state.overrides[source] || source;
}

function applyIcon(node) {
  if (!node || node.nodeType !== 1) return;
  if (!node.classList.contains("ph")) return;
  var current = iconClass(node);
  if (!current) return;
  var isStatic = node.getAttribute("data-icon-static") === "true";
  var rendered = node.getAttribute("data-icon-rendered") || "";
  var source = node.getAttribute("data-icon-source") || current;
  // App code sometimes changes an icon in place (eye/eye-slash, play/pause).
  // A class different from our last rendered class is a new semantic source.
  if (!isStatic && rendered && current !== rendered) source = current;
  var target = isStatic ? source : resolveIconName(source);
  var themeId = node.getAttribute("data-icon-static-theme") || state.theme;
  node.setAttribute("data-icon-source", source);
  node.setAttribute("data-icon-rendered", target);
  if (!isStatic && current !== target) {
    node.classList.remove(current);
    node.classList.add(target);
  }
  var renderKey = themeId + ":" + target;
  if (node.getAttribute("data-icon-render-key") !== renderKey) {
    var markup = svgMarkup(themeId, target);
    if (markup) {
      node.innerHTML = markup;
      node.classList.add("icon-svg-rendered");
      node.setAttribute("data-icon-render-key", renderKey);
    }
  }
}

function applyTree(root) {
  if (!root || root.nodeType !== 1) return;
  applyIcon(root);
  var icons = root.querySelectorAll ? root.querySelectorAll("i.ph") : [];
  for (var i = 0; i < icons.length; i++) applyIcon(icons[i]);
}

function applyAll() {
  document.documentElement.setAttribute("data-icon-theme", state.theme);
  applyTree(document.body);
  window.dispatchEvent(new CustomEvent("iconsettingschange", {
    detail: { theme: state.theme, overrides: Object.assign({}, state.overrides) },
  }));
}

export function initIconSettings() {
  applyAll();
  if (observer) return;
  observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var record = records[i];
      if (record.type === "attributes") applyIcon(record.target);
      for (var n = 0; n < record.addedNodes.length; n++) applyTree(record.addedNodes[n]);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
}

function make(tag, cls, text) {
  var node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function staticIcon(name, cls, themeId) {
  var icon = make("i", "ph " + name + (cls ? " " + cls : ""));
  icon.setAttribute("data-icon-static", "true");
  if (themeId) icon.setAttribute("data-icon-static-theme", themeId);
  icon.setAttribute("aria-hidden", "true");
  applyIcon(icon);
  return icon;
}

function labelFor(name) {
  var lang = getLang();
  var known = ICON_LABELS[lang] && ICON_LABELS[lang][name];
  if (known) return known;
  return name.replace(/^ph-/, "").replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function categoryFor(name) {
  if (/arrow|caret|cursor|hand|list|dots|house|compass|map-pin|sidebar/.test(name)) return "navigation";
  if (/plus|minus|trash|pencil|copy|check|x$|download|upload|export|floppy|folder|file|printer|undo|redo|clockwise/.test(name)) return "actions";
  if (/wall|door|window|cube|chair|bed|table|lamp|plant|building|car|bath|sofa|couch|oven|fridge/.test(name)) return "objects";
  if (/camera|image|play|pause|film|music|microphone|speaker/.test(name)) return "media";
  if (/info|warning|question|lock|eye|bell|heart|star|shield|cloud|sun|moon/.test(name)) return "status";
  return "tools";
}

function allGlyphNames() {
  var names = {};
  ICON_SEMANTIC_NAMES.forEach(function (name) { names[name] = true; });
  document.querySelectorAll("i.ph").forEach(function (node) {
    var source = node.getAttribute("data-icon-source") || iconClass(node);
    if (source) names[source] = true;
  });
  return Object.keys(names).sort();
}

var AREA_SELECTORS = [
  ["#topbar", "icons_loc_topbar"], ["#left-sidebar", "icons_loc_library"],
  ["#right-inspector", "icons_loc_inspector"], ["#plan-toolbar", "icons_loc_plan_tools"],
  ["#modeler", "icons_loc_modeler"], ["#cabdes", "icons_loc_cabinet"],
  ["#mobile-shell", "icons_loc_mobile"], ["#workspace", "icons_loc_workspace"],
];

function cleanText(value) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, 72);
}

function areaFor(node) {
  for (var i = 0; i < AREA_SELECTORS.length; i++) {
    if (node.closest(AREA_SELECTORS[i][0])) return t(AREA_SELECTORS[i][1]);
  }
  return t("icons_loc_other");
}

function controlFor(node) {
  var control = node.closest("button, a, label, [role='menuitem'], [role='tab'], [title], [aria-label]");
  if (!control) return labelFor(node.getAttribute("data-icon-source") || iconClass(node));
  var key = control.getAttribute("data-i18n-title") || control.getAttribute("data-i18n-aria");
  var value = key ? t(key) : "";
  if (!value) value = control.getAttribute("aria-label") || control.getAttribute("title") || cleanText(control.textContent);
  if (!value && control.id) value = control.id.replace(/[-_]/g, " ");
  return cleanText(value) || t("icons_unnamed_control");
}

function isVisible(node) {
  return !!(node && node.isConnected && node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
}

function usagesFor(source) {
  var rows = [];
  document.querySelectorAll("i.ph[data-icon-source]").forEach(function (node) {
    if (node.getAttribute("data-icon-source") !== source || node.closest(".settings-modal")) return;
    rows.push({ node: node, area: areaFor(node), control: controlFor(node), visible: isVisible(node) });
  });
  return rows;
}

function usedSources() {
  var counts = {};
  document.querySelectorAll("i.ph[data-icon-source]").forEach(function (node) {
    if (node.closest(".settings-modal")) return;
    var source = node.getAttribute("data-icon-source");
    if (source) counts[source] = (counts[source] || 0) + 1;
  });
  return Object.keys(counts).map(function (name) { return { name: name, count: counts[name] }; })
    .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
}

function matchesSearch(name, query) {
  if (!query) return true;
  var q = query.toLocaleLowerCase();
  return name.toLocaleLowerCase().indexOf(q) >= 0 || labelFor(name).toLocaleLowerCase().indexOf(q) >= 0;
}

function locateUsage(usage, closeSettings) {
  if (!usage.visible) return;
  closeSettings();
  setTimeout(function () {
    var target = usage.node.closest("button, a, [role='menuitem'], [role='tab']") || usage.node;
    try { target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); } catch (e) {}
    target.classList.add("icon-location-pulse");
    if (typeof target.focus === "function") target.focus({ preventScroll: true });
    setTimeout(function () { target.classList.remove("icon-location-pulse"); }, 2400);
  }, 80);
}

export function buildIconSettingsPane(closeSettings) {
  initIconSettings();
  var root = make("div", "icon-settings-ui");
  var selected = "ph-gear";
  var usageQuery = "";
  var usageCategory = "all";
  var pickerOpen = false;
  var pickerQuery = "";
  var glyphs = allGlyphNames();

  var intro = make("div", "icon-settings-intro");
  var introMark = make("span", "icon-settings-intro-mark");
  introMark.appendChild(staticIcon("ph-shapes"));
  var introCopy = make("div");
  introCopy.appendChild(make("strong", null, t("icons_title")));
  introCopy.appendChild(make("p", null, t("icons_intro")));
  intro.appendChild(introMark);
  intro.appendChild(introCopy);
  root.appendChild(intro);

  var themeHead = make("div", "icon-section-head");
  themeHead.appendChild(make("div", null, t("icons_sets")));
  var resetAll = make("button", "icon-text-btn", t("icons_reset_all"));
  resetAll.type = "button";
  resetAll.onclick = function () {
    // Load first, commit second: the UI never switches to a theme whose
    // artwork has not arrived, so no icon blinks empty on the way there.
    loadIconTheme(DEFAULT_THEME).then(function () {
      state.theme = DEFAULT_THEME;
      state.overrides = {};
      saveState(); applyAll(); renderThemes(); renderUsed(); renderDetail();
    }, function () {});
  };
  themeHead.appendChild(resetAll);
  root.appendChild(themeHead);

  var themeGrid = make("div", "icon-theme-grid");
  root.appendChild(themeGrid);

  var customHead = make("div", "icon-section-head icon-custom-head");
  var customCopy = make("div");
  customCopy.appendChild(make("div", null, t("icons_custom")));
  customCopy.appendChild(make("small", null, t("icons_custom_hint")));
  customHead.appendChild(customCopy);
  root.appendChild(customHead);

  var layout = make("div", "icon-custom-layout");
  var browser = make("section", "icon-usage-browser");
  var searchWrap = make("label", "icon-search");
  searchWrap.appendChild(staticIcon("ph-magnifying-glass"));
  var search = make("input");
  search.type = "search";
  search.placeholder = t("icons_search_used");
  search.oninput = function () { usageQuery = search.value.trim(); renderUsed(); };
  searchWrap.appendChild(search);
  browser.appendChild(searchWrap);
  var categories = make("div", "icon-category-row");
  ["all", "navigation", "actions", "objects", "tools", "media", "status"].forEach(function (id) {
    var button = make("button", "icon-category-chip", t("icons_cat_" + id));
    button.type = "button";
    button.dataset.category = id;
    button.onclick = function () { usageCategory = id; renderCategories(); renderUsed(); };
    categories.appendChild(button);
  });
  browser.appendChild(categories);
  var usedGrid = make("div", "icon-used-grid");
  browser.appendChild(usedGrid);
  var detail = make("section", "icon-detail");
  layout.appendChild(browser);
  layout.appendChild(detail);
  root.appendChild(layout);

  function renderThemes() {
    themeGrid.innerHTML = "";
    THEMES.forEach(function (theme) {
      var card = make("button", "icon-theme-card" + (theme.id === state.theme ? " active" : ""));
      card.type = "button";
      card.dataset.theme = theme.id;
      card.setAttribute("aria-pressed", theme.id === state.theme ? "true" : "false");
      var sample = make("span", "icon-theme-sample");
      theme.icons.forEach(function (name) { sample.appendChild(staticIcon(name, null, theme.id)); });
      sample.appendChild(make("b", "icon-theme-style", t(theme.style)));
      var nameRow = make("span", "icon-theme-name");
      nameRow.appendChild(make("strong", null, t(theme.name)));
      if (theme.id === state.theme) nameRow.appendChild(staticIcon("ph-check-circle"));
      card.appendChild(sample);
      card.appendChild(nameRow);
      card.appendChild(make("small", null, t(theme.desc)));
      card.onclick = function () {
        loadIconTheme(theme.id).then(function () {
          state.theme = theme.id; saveState(); applyAll(); renderThemes(); renderUsed(); renderDetail();
        }, function () {});
      };
      themeGrid.appendChild(card);
    });
  }

  function renderCategories() {
    categories.querySelectorAll("button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.category === usageCategory);
    });
  }

  function renderUsed() {
    usedGrid.innerHTML = "";
    var sources = usedSources().filter(function (item) {
      return (usageCategory === "all" || categoryFor(item.name) === usageCategory) && matchesSearch(item.name, usageQuery);
    });
    if (!sources.length) {
      usedGrid.appendChild(make("p", "icon-empty", t("icons_no_results")));
      return;
    }
    sources.forEach(function (item) {
      var button = make("button", "icon-used-card" + (item.name === selected ? " active" : ""));
      button.type = "button";
      button.title = labelFor(item.name);
      button.appendChild(staticIcon(resolveIconName(item.name)));
      var copy = make("span");
      copy.appendChild(make("strong", null, labelFor(item.name)));
      copy.appendChild(make("small", null, t("icons_places_count", { count: item.count })));
      button.appendChild(copy);
      if (state.overrides[item.name]) button.appendChild(make("b", "icon-custom-dot", ""));
      button.onclick = function () { selected = item.name; pickerOpen = false; renderUsed(); renderDetail(); };
      usedGrid.appendChild(button);
    });
  }

  function renderPicker() {
    detail.innerHTML = "";
    var head = make("div", "icon-picker-head");
    var back = make("button", "icon-back-btn");
    back.type = "button";
    back.appendChild(staticIcon("ph-arrow-left"));
    back.appendChild(make("span", null, t("back")));
    back.onclick = function () { pickerOpen = false; renderDetail(); };
    head.appendChild(back);
    head.appendChild(make("strong", null, t("icons_choose_replacement")));
    detail.appendChild(head);
    var searchWrap = make("label", "icon-search icon-picker-search");
    searchWrap.appendChild(staticIcon("ph-magnifying-glass"));
    var input = make("input");
    input.type = "search"; input.placeholder = t("icons_search_catalog"); input.value = pickerQuery;
    input.oninput = function () { pickerQuery = input.value.trim(); paintGlyphs(); };
    searchWrap.appendChild(input); detail.appendChild(searchWrap);
    var meta = make("div", "icon-picker-meta"); detail.appendChild(meta);
    var grid = make("div", "icon-picker-grid"); detail.appendChild(grid);
    function paintGlyphs() {
      grid.innerHTML = "";
      var matches = glyphs.filter(function (name) { return matchesSearch(name, pickerQuery); });
      var shown = matches.slice(0, 180);
      meta.textContent = t("icons_catalog_count", { shown: shown.length, count: matches.length });
      shown.forEach(function (name) {
        var button = make("button", "icon-glyph" + (resolveIconName(selected) === name ? " active" : ""));
        button.type = "button"; button.title = labelFor(name);
        button.appendChild(staticIcon(name));
        button.appendChild(make("span", null, labelFor(name)));
        button.onclick = function () {
          if (name === selected) delete state.overrides[selected];
          else state.overrides[selected] = name;
          saveState(); applyAll(); pickerOpen = false; renderUsed(); renderDetail();
        };
        grid.appendChild(button);
      });
    }
    paintGlyphs();
    setTimeout(function () { input.focus(); }, 0);
  }

  function renderDetail() {
    if (pickerOpen) { renderPicker(); return; }
    detail.innerHTML = "";
    var usages = usagesFor(selected);
    var hero = make("div", "icon-detail-hero");
    var preview = make("span", "icon-detail-preview");
    preview.appendChild(staticIcon(resolveIconName(selected)));
    hero.appendChild(preview);
    var copy = make("div", "icon-detail-copy");
    copy.appendChild(make("small", null, t("icons_selected_icon")));
    copy.appendChild(make("h4", null, labelFor(selected)));
    copy.appendChild(make("code", null, selected));
    hero.appendChild(copy);
    detail.appendChild(hero);
    var buttons = make("div", "icon-detail-actions");
    var change = make("button", "btn-accent", t("icons_change"));
    change.type = "button"; change.onclick = function () { pickerOpen = true; renderDetail(); };
    buttons.appendChild(change);
    var reset = make("button", "icon-text-btn", t("icons_reset_icon"));
    reset.type = "button"; reset.disabled = !state.overrides[selected];
    reset.onclick = function () { delete state.overrides[selected]; saveState(); applyAll(); renderUsed(); renderDetail(); };
    buttons.appendChild(reset);
    detail.appendChild(buttons);
    if (state.overrides[selected]) {
      detail.appendChild(make("p", "icon-override-note", t("icons_override_note", { icon: labelFor(resolveIconName(selected)) })));
    }
    var locationsHead = make("div", "icon-locations-head");
    locationsHead.appendChild(make("strong", null, t("icons_locations")));
    locationsHead.appendChild(make("span", null, String(usages.length)));
    detail.appendChild(locationsHead);
    var list = make("div", "icon-location-list");
    if (!usages.length) list.appendChild(make("p", "icon-empty", t("icons_no_locations")));
    usages.forEach(function (usage) {
      var row = make("button", "icon-location-row" + (usage.visible ? "" : " hidden-location"));
      row.type = "button"; row.disabled = !usage.visible;
      row.appendChild(staticIcon(usage.visible ? "ph-map-pin" : "ph-eye-slash"));
      var rowCopy = make("span");
      rowCopy.appendChild(make("strong", null, usage.control));
      rowCopy.appendChild(make("small", null, usage.area + " · " + t(usage.visible ? "icons_visible_now" : "icons_hidden_now")));
      row.appendChild(rowCopy);
      if (usage.visible) row.appendChild(staticIcon("ph-arrow-square-out"));
      row.onclick = function () { locateUsage(usage, closeSettings); };
      list.appendChild(row);
    });
    detail.appendChild(list);
  }

  renderThemes(); renderCategories(); renderUsed(); renderDetail();
  /* This pane is the one place that shows all ten languages at once (the sample
     row on each card). Fetch the nine that boot did not need and repaint the
     cards as they land — the pane opens on the active theme's real artwork and
     fills in rather than waiting on ~1 MB before it appears. */
  THEMES.forEach(function (item) {
    if (!ICON_THEME_ASSETS[item.id]) loadIconTheme(item.id).then(renderThemes, function () {});
  });
  return root;
}
