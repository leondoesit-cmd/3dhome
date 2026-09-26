// Search and guidance for planner tools. Curated entries understand common
// tasks ("draw a room", "add furniture") while the DOM index keeps ordinary
// commands discoverable without maintaining a second copy of every menu.
import { getLang, onLangChange } from "./i18n.js";
import { seedCuratedToolMetadata } from "./core/tool_registry.js";

var TXT = {
  en: {
    placeholder: "Search tools or what you want to do…",
    aria: "Search tools and actions",
    clear: "Clear search",
    results: "Tools and guidance",
    suggested: "Suggested tools",
    none: "No matching tool",
    noneHint: "Try a tool name or a goal such as “draw a room”, “add furniture”, or “export”.",
    where: "Where",
    how: "How to use",
    show: "Show location",
    start: "Start tool",
    open: "Open",
    use: "Use command",
    keys: "↑↓ navigate · Enter details · Esc close",
    dynamicHow: "Choose this command in the indicated area. If it edits a selection, select the object first.",
    top: "Top toolbar",
    drawing: "Plan view › floating drawing toolbar",
    library: "Left panel › Library",
    structure: "Left panel › Structure",
    tree: "Left panel › Tree",
    inspector: "Right inspector",
    file: "Top toolbar › File",
    edit: "Top toolbar › Edit",
    export: "Top toolbar › Export",
    more: "Top toolbar › More",
    modeler: "Model editor ribbon",
    cabinet: "Cabinet designer",
    ribbon: "Tool ribbon",
  },
  he: {
    placeholder: "חיפוש כלי או פעולה שרוצים לבצע…",
    aria: "חיפוש כלים ופעולות",
    clear: "נקה חיפוש",
    results: "כלים והדרכה",
    suggested: "כלים מוצעים",
    none: "לא נמצא כלי מתאים",
    noneHint: "נסו שם של כלי או מטרה כמו „צייר חדר”, „הוסף רהיטים” או „ייצוא”.",
    where: "איפה",
    how: "איך משתמשים",
    show: "הצג מיקום",
    start: "הפעל כלי",
    open: "פתח",
    use: "השתמש בפקודה",
    keys: "↑↓ ניווט · Enter לפרטים · Esc לסגירה",
    dynamicHow: "בחרו בפקודה באזור המצוין. אם היא עורכת בחירה, בחרו תחילה את האובייקט.",
    top: "סרגל כלים עליון",
    drawing: "תצוגת תוכנית › סרגל כלי השרטוט הצף",
    library: "חלונית שמאל › ספרייה",
    structure: "חלונית שמאל › מבנה",
    tree: "חלונית שמאל › עץ",
    inspector: "חלונית מאפיינים ימנית",
    file: "סרגל עליון › קובץ",
    edit: "סרגל עליון › עריכה",
    export: "סרגל עליון › ייצוא",
    more: "סרגל עליון › עוד",
    modeler: "סרגל עורך המודלים",
    cabinet: "מעצב הארונות",
    ribbon: "סרגל הכלים",
  },
};

function bi(en, he) { return { en: en, he: he }; }
function val(value, lang) {
  return value && typeof value === "object" ? (value[lang] || value.en || "") : (value || "");
}

export var TOOL_SEARCH_ENTRIES = [
  { id: "wall", label: bi("Wall tool", "כלי קיר"), icon: "ph-wall", tool: "wall", location: "drawing",
    keywords: "draw build create wall partition room outline קיר צייר בנה מחיצה",
    help: bi("Click the first corner, then each next corner. Double-click or press Esc to finish the wall run.", "לחצו על הפינה הראשונה ואז על כל פינה נוספת. לחיצה כפולה או Esc מסיימות את רצף הקירות.") },
  { id: "room", label: bi("Draw a rectangular room", "צייר חדר מלבני"), icon: "ph-rectangle", tool: "rect", location: "drawing",
    keywords: "room rectangle floor plan space bedroom kitchen draw create חדר מלבן תוכנית חלל סלון מטבח",
    help: bi("Click one room corner, then the opposite corner. The planner creates four connected walls.", "לחצו על פינה אחת של החדר ואז על הפינה הנגדית. המתכנן ייצור ארבעה קירות מחוברים.") },
  { id: "arcwall", label: bi("Curved wall", "קיר מעוגל"), icon: "ph-bezier-curve", tool: "arcwall", location: "drawing",
    keywords: "arc round curved radius bend wall קשת עגול מעוגל רדיוס",
    help: bi("Place the wall endpoints, then move the pointer to set the curve and click to confirm.", "מקמו את קצות הקיר, הזיזו את המצביע לקביעת הקשת ולחצו לאישור.") },
  { id: "door", label: bi("Add a door", "הוסף דלת"), icon: "ph-door", tool: "door", location: "drawing",
    keywords: "place insert opening entrance doorway add door פתח כניסה הוסף דלת",
    help: bi("Choose Door, then click a wall. Select the new door to edit its width, height and position.", "בחרו דלת ולחצו על קיר. בחרו את הדלת החדשה כדי לערוך רוחב, גובה ומיקום.") },
  { id: "window", label: bi("Add a window", "הוסף חלון"), icon: "ph-frame-corners", tool: "window", location: "drawing",
    keywords: "place insert opening glazing add window חלון פתח זיגוג הוסף",
    help: bi("Choose Window and click a wall. Use the inspector to set width, height and sill height.", "בחרו חלון ולחצו על קיר. בחלונית המאפיינים קובעים רוחב, גובה וגובה סף.") },
  { id: "passage", label: bi("Add an open passage", "הוסף מעבר פתוח"), icon: "ph-columns", tool: "passage", location: "drawing",
    keywords: "opening passage arch doorway no door מעבר פתח בלי דלת",
    help: bi("Choose Passage and click a wall to cut an opening without adding a door leaf.", "בחרו מעבר ולחצו על קיר כדי ליצור פתח ללא כנף דלת.") },
  { id: "slabvoid", label: bi("Create a floor opening", "צור פתח ברצפה"), icon: "ph-stairs", tool: "slabvoid", location: "drawing",
    keywords: "floor slab hole void stairs stairwell opening תקרה רצפה חור מדרגות פתח",
    help: bi("Draw the opening boundary in Plan view. Use it for stairs, shafts, or a void between floors.", "שרטטו את גבול הפתח בתצוגת התוכנית. מתאים למדרגות, פיר או חלל בין קומות.") },
  { id: "select", label: bi("Select and edit", "בחירה ועריכה"), icon: "ph-cursor", tool: "select", location: "drawing",
    keywords: "pointer choose move resize properties inspect edit select סמן בחר הזז שנה מאפיינים ערוך",
    help: bi("Click a wall, room or item. Its editable properties appear in the right inspector.", "לחצו על קיר, חדר או פריט. המאפיינים הניתנים לעריכה יופיעו בחלונית הימנית.") },
  { id: "measure", label: bi("Add a reference point", "הוסף נקודת ייחוס"), icon: "ph-crosshair", tool: "point", location: "drawing",
    keywords: "point marker reference measure annotation coordinate נקודה סימון ייחוס מדידה קואורדינטה",
    help: bi("Place a reference point on the plan, then edit its coordinates, name and note in the inspector.", "מקמו נקודת ייחוס בתוכנית ואז ערכו קואורדינטות, שם והערה בחלונית המאפיינים.") },
  { id: "furniture", label: bi("Add furniture or equipment", "הוסף ריהוט או ציוד"), icon: "ph-armchair", reveal: "library", location: "library",
    keywords: "furniture sofa bed chair table cabinet appliance equipment object library furnish add ריהוט ספה מיטה כיסא שולחן ארון מכשיר ספרייה הוסף",
    help: bi("Open Library, search or browse a category, then click an item to add it. Drag it in the plan to position it.", "פתחו את הספרייה, חפשו או דפדפו בקטגוריה ולחצו על פריט להוספה. גררו אותו בתוכנית כדי למקם אותו.") },
  { id: "modeler", label: bi("Create a custom 3D model", "צור מודל תלת־ממד מותאם"), icon: "ph-cube", action: "openModeler", selector: '[data-act="openModeler"]', location: "more",
    keywords: "cad model editor custom parametric sketch extrude part design מודל עורך שרטוט פרמטרי אקסטרוזיה חלק",
    help: bi("Open Model Editor, start a sketch on a plane, constrain the profile, then extrude or revolve it into a part.", "פתחו את עורך המודלים, התחילו סקיצה על מישור, הגדירו אילוצים ואז בצעו שיחול או סיבוב ליצירת חלק.") },
  { id: "scan", label: bi("Scan a room", "סרוק חדר"), icon: "ph-scan", action: "roomScan", selector: '[data-act="roomScan"]', location: "file",
    keywords: "lidar ar roomplan camera capture import scan phone mobile מדידה מצלמה סריקה חדר אייפון נייד",
    help: bi("Open the room scanner to capture corners with supported mobile AR, or import an Apple RoomPlan JSON file.", "פתחו את סורק החדר כדי ללכוד פינות ב־AR נתמך, או ייבאו קובץ JSON של Apple RoomPlan.") },
  { id: "blueprint", label: bi("Trace a floor plan", "עקוב אחר תוכנית קומה"), icon: "ph-blueprint", action: "importBlueprintTrace", selector: '[data-act="importBlueprintTrace"]', location: "file",
    keywords: "blueprint image pdf trace upload plan background calibrate import שרטוט תמונה תוכנית עקיבה העלאה כיול ייבוא",
    help: bi("Upload a plan image, calibrate it with one known measurement, then trace the walls over the reference.", "העלו תמונת תוכנית, כיילו אותה לפי מידה ידועה אחת ואז עקבו אחר הקירות מעל תמונת הייחוס.") },
  { id: "textures", label: bi("Change materials and textures", "שנה חומרים וטקסטורות"), icon: "ph-paint-brush-broad", action: "openTextureGallery", selector: '[data-act="openTextureGallery"]', location: "more",
    keywords: "material color paint finish surface texture wall floor wood tile חומר צבע גמר משטח טקסטורה קיר רצפה עץ אריח",
    help: bi("Open Texture Gallery, choose or import an image, then apply it to the selected wall, floor or item.", "פתחו את גלריית הטקסטורות, בחרו או ייבאו תמונה והחילו אותה על הקיר, הרצפה או הפריט שנבחרו.") },
  { id: "save", label: bi("Save this project", "שמור את הפרויקט"), icon: "ph-floppy-disk", action: "save", selector: '[data-act="save"]', location: "file",
    keywords: "store backup keep download project save גיבוי פרויקט הורדה שמירה שמור",
    help: bi("Save stores the current project locally. Use Export JSON when you also want a portable project file.", "שמירה מאחסנת את הפרויקט הנוכחי מקומית. השתמשו בייצוא JSON גם לקבלת קובץ פרויקט נייד.") },
  { id: "export", label: bi("Export or download", "ייצוא או הורדה"), icon: "ph-export", action: "exportjson", selector: '[data-act="exportjson"]', location: "export",
    keywords: "download backup json glb image png screenshot file export הורדה גיבוי קובץ תמונה צילום ייצוא",
    help: bi("Use Export for a project JSON, a 2D/3D PNG, or a GLB model. This result opens the portable JSON export.", "בתפריט ייצוא אפשר ליצור JSON של הפרויקט, תמונת 2D/3D או מודל GLB. תוצאה זו מפעילה ייצוא JSON נייד.") },
  { id: "view3d", label: bi("Switch to 3D view", "עבור לתצוגת תלת־ממד"), icon: "ph-cube", action: "view3d", selector: "#view3dBtn", location: "top",
    keywords: "render perspective orbit view model three dimensional 3d תלת ממד תצוגה פרספקטיבה מודל",
    help: bi("Open 3D view. Drag to orbit, Shift/right-drag to pan, and scroll or pinch to zoom.", "פתחו תצוגת תלת־ממד. גררו לסיבוב, Shift או גרירה ימנית להזזה וגלילה או צביטה לזום.") },
  { id: "planview", label: bi("Switch to Plan view", "עבור לתצוגת תוכנית"), icon: "ph-blueprint", action: "viewPlan", selector: "#viewPlanBtn", location: "top",
    keywords: "2d top orthographic floor plan draw view דו ממד תוכנית קומה מבט על שרטוט",
    help: bi("Open the measured top view used for drawing walls, placing openings and arranging items.", "פתחו את מבט העל המדוד המשמש לשרטוט קירות, מיקום פתחים וסידור פריטים.") },
  { id: "walk", label: bi("Walk through the design", "סיור בתוך התכנון"), icon: "ph-person-simple-walk", action: "walk", selector: '[data-act="walk"]', location: "more",
    keywords: "first person walkthrough explore visit wasd move tour walk סיור הליכה גוף ראשון תנועה",
    help: bi("Start Walk mode, then use WASD or arrow keys to move and drag to look around. Esc exits.", "הפעילו מצב סיור, השתמשו ב־WASD או בחצים לתנועה וגררו כדי להביט סביב. Esc יוצא.") },
  { id: "photo", label: bi("Create a photorealistic image", "צור תמונה פוטוריאליסטית"), icon: "ph-camera", action: "photo", selector: '[data-act="photo"]', location: "more",
    keywords: "render photo lighting path trace realistic image camera רינדור צילום תאורה מציאותי תמונה מצלמה",
    help: bi("Frame the 3D view first, then open Photo rendering and choose quality and lighting settings.", "מסגרו תחילה את תצוגת ה־3D, פתחו רינדור פוטו ובחרו הגדרות איכות ותאורה.") },
  { id: "guide", label: bi("Planner wall guide", "מדריך קירות ותכנון"), icon: "ph-graduation-cap", action: "plannerTutorial", selector: "#plannerTutorialBtn", location: "top",
    keywords: "tutorial learn help guide how walls practice instructions מדריך עזרה לימוד תרגול הוראות קירות",
    help: bi("Open the interactive guide for short lessons on walls, openings, constraints and common planning workflows.", "פתחו את המדריך האינטראקטיבי לשיעורים קצרים על קירות, פתחים, אילוצים ותהליכי תכנון נפוצים.") },
  { id: "agent", label: bi("AI helper", "עוזר AI"), icon: "ph-robot", action: "agent", selector: "#agentBtn", location: "top",
    keywords: "ai assistant agent tutor chat model ollama mcp עוזר סוכן בינה צ'אט מודל",
    help: bi("Ask about the current design or preview a command for confirmation.", "שאלו על התכנון הנוכחי או הציגו פקודה לאישור.") },
  { id: "shortcuts", label: bi("Keyboard shortcuts", "קיצורי מקלדת"), icon: "ph-keyboard", action: "shortcuts", selector: "#shortcutsBtn", location: "top",
    keywords: "keys hotkeys commands keyboard speed shortcut מקשים קיצורים פקודות מקלדת",
    help: bi("Open the shortcut reference. Drawing tools also show their number key on the floating toolbar.", "פתחו את רשימת הקיצורים. כלי השרטוט מציגים גם את מקש המספר שלהם בסרגל הצף.") },
  { id: "workspace", label: bi("Manage project workspace", "ניהול סביבת הפרויקט"), icon: "ph-stack", action: "workspace", selector: "#workspaceBtn", location: "top",
    keywords: "project versions workspace collaborate file manage floor פרויקט גרסאות סביבת עבודה שיתוף קובץ קומה",
    help: bi("Open Workspace to manage project-level information, versions and collaboration settings.", "פתחו את סביבת הפרויקט כדי לנהל מידע ברמת הפרויקט, גרסאות והגדרות שיתוף.") },
  { id: "generate", label: bi("Generate an apartment automatically", "יצירת דירה אוטומטית"), icon: "ph-magic-wand", action: "autoGenerate", selector: '[data-act="autoGenerate"]', location: "more",
    keywords: "automatic apartment layout generate rooms magic create דירה אוטומטי פריסה חדרים יצירה",
    help: bi("Open the generator, enter the apartment requirements, then review the generated rooms before refining them.", "פתחו את המחולל, הזינו את דרישות הדירה ובדקו את החדרים שנוצרו לפני המשך העריכה.") },
];

// Search owns presentation metadata only. The semantic registry receives a
// JSON-safe projection; executable command implementations never live here.
seedCuratedToolMetadata(TOOL_SEARCH_ENTRIES);

function normalize(s) {
  return String(s || "").toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function searchToolEntries(entries, query, limit) {
  var q = normalize(query), words = q.split(/\s+/).filter(Boolean);
  if (!q) return entries.slice(0, limit || 6);
  return entries.map(function (entry, order) {
    var labels = normalize(val(entry.label, "en") + " " + val(entry.label, "he"));
    var hay = normalize(labels + " " + (entry.keywords || "") + " " + val(entry.help, "en") + " " + val(entry.help, "he"));
    var score = 0;
    if (labels === q) score += 100;
    if (labels.indexOf(q) === 0) score += 55;
    if (hay.indexOf(q) >= 0) score += 32;
    words.forEach(function (word) {
      if (labels.split(" ").some(function (part) { return part.indexOf(word) === 0; })) score += 12;
      else if (hay.indexOf(word) >= 0) score += 5;
      else score -= 30;
    });
    return { entry: entry, score: score, order: order };
  }).filter(function (item) { return item.score > 0; })
    .sort(function (a, b) { return b.score - a.score || a.order - b.order; })
    .slice(0, limit || 8).map(function (item) { return item.entry; });
}

function controlLabel(el) {
  var span = el.querySelector("span");
  return (span && span.textContent || el.getAttribute("aria-label") || el.title || "").trim();
}

function locationFor(el) {
  if (el.closest("#plan-toolbar")) return "drawing";
  if (el.closest('[data-left-pane="library"]')) return "library";
  if (el.closest('[data-left-pane="structure"]')) return "structure";
  if (el.closest('[data-left-pane="tree"]')) return "tree";
  if (el.closest("#right-inspector")) return "inspector";
  var menu = el.closest(".dropdown-menu");
  if (menu) {
    var owner = menu._dd || menu.parentElement;
    var trigger = owner && owner.querySelector(":scope > .dropdown-trigger");
    var name = controlLabel(trigger || menu);
    if (/file|קובץ/i.test(name)) return "file";
    if (/edit|עריכה/i.test(name)) return "edit";
    if (/export|ייצוא/i.test(name)) return "export";
    return "more";
  }
  return "top";
}

function dynamicEntries(existing) {
  var seen = new Set();
  existing.forEach(function (entry) {
    if (entry.tool) seen.add("tool:" + entry.tool);
    if (entry.action) seen.add("act:" + entry.action);
  });
  var out = [];
  document.querySelectorAll("button[data-tool], button[data-act]").forEach(function (el) {
    var tool = el.getAttribute("data-tool"), action = el.getAttribute("data-act");
    var key = tool ? "tool:" + tool : "act:" + action;
    if (!tool && !action || seen.has(key)) return;
    var label = controlLabel(el);
    if (!label || label.length > 72) return;
    seen.add(key);
    var icon = el.querySelector("i");
    out.push({
      id: "dom-" + key.replace(":", "-"),
      label: label,
      icon: icon ? Array.from(icon.classList).find(function (c) { return c.indexOf("ph-") === 0 && c !== "ph"; }) : "ph-command",
      tool: tool || null,
      action: action || null,
      selector: action ? '[data-act="' + CSS.escape(action) + '"]' : '[data-tool="' + CSS.escape(tool) + '"]',
      location: locationFor(el),
      keywords: label,
      help: null,
      dynamic: true,
    });
  });
  return out;
}

function openLocation(entry) {
  if (entry.location === "library" || entry.location === "structure" || entry.location === "tree") {
    if (window.__plannerChrome) window.__plannerChrome.setLeftTab(entry.location === "structure" ? "structure" : entry.location === "tree" ? "tree" : "library");
    if (document.body.classList.contains("compact-nav")) document.body.classList.add("show-left");
  }
  if (entry.location === "drawing" && window.__runAction) window.__runAction("viewPlan");
  var target = entry.selector ? document.querySelector(entry.selector) : entry.tool ? document.querySelector('[data-tool="' + entry.tool + '"]') : null;
  if (!target && entry.action) target = document.querySelector('[data-act="' + entry.action + '"]');
  if (!target) return;
  var menu = target.closest(".dropdown-menu");
  if (menu) {
    var owner = menu._dd || menu.parentElement;
    var trigger = owner && owner.querySelector(":scope > .dropdown-trigger");
    if (trigger && !menu.classList.contains("open")) trigger.click();
  }
  var section = target.closest(".panel-section");
  if (section) section.classList.remove("collapsed");
  target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  target.classList.remove("tool-search-located");
  void target.offsetWidth;
  target.classList.add("tool-search-located");
  setTimeout(function () { target.classList.remove("tool-search-located"); }, 2500);
}

function runEntry(entry) {
  if (typeof entry.run === "function") {
    entry.run();
  } else if (entry.tool) {
    var btn = document.querySelector('[data-tool="' + entry.tool + '"]');
    if (btn) btn.click();
    if (window.__runAction) window.__runAction("viewPlan");
  } else if (entry.action && window.__runAction) {
    window.__runAction(entry.action);
  } else {
    openLocation(entry);
  }
}

/* Entries other modules contribute (the pro catalog adds model-editor and
   cabinet commands). They carry their own run(), so search never needs to
   know how another editor executes a command. */
var EXTRA_ENTRIES = [];
export function addToolSearchEntries(list) {
  (list || []).forEach(function (entry) { if (entry && entry.id) EXTRA_ENTRIES.push(entry); });
}

export function initToolSearch() {
  var root = document.getElementById("toolSearch");
  if (!root || root.dataset.ready) return;
  root.dataset.ready = "1";
  var input = document.getElementById("toolSearchInput");
  var panel = document.getElementById("toolSearchPanel");
  var results = document.getElementById("toolSearchResults");
  var guide = document.getElementById("toolSearchGuide");
  var clear = root.querySelector(".tool-search-clear");
  var heading = root.querySelector(".tool-search-heading");
  var foot = root.querySelector(".tool-search-foot");
  var shortcut = root.querySelector(".tool-search-shortcut");
  var entries = TOOL_SEARCH_ENTRIES.concat(EXTRA_ENTRIES, dynamicEntries(TOOL_SEARCH_ENTRIES));
  var visible = [], active = -1, selected = null;
  var toolbarParent = root.parentNode, toolbarNext = root.nextSibling;

  function lang() { return getLang() === "he" ? "he" : "en"; }
  function text(key) { return TXT[lang()][key]; }
  function local(entry, key) { return val(entry[key], lang()); }

  function applyLanguage() {
    input.placeholder = text("placeholder");
    input.setAttribute("aria-label", text("aria"));
    clear.setAttribute("aria-label", text("clear"));
    clear.title = text("clear");
    shortcut.textContent = /Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘K" : "Ctrl K";
    foot.textContent = text("keys");
    render();
  }

  function setOpen(open) {
    // The compact topbar is an overflow-clipped glass layer. A fixed child is
    // still clipped by that containing block, so host the expanded palette on
    // body and put it back in its exact toolbar slot when it closes.
    if (open && document.body.classList.contains("compact-nav") && root.parentNode !== document.body) {
      document.body.appendChild(root);
    }
    root.classList.toggle("open", open);
    panel.hidden = !open;
    input.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) input.removeAttribute("aria-activedescendant");
    if (!open && root.parentNode === document.body && toolbarParent) {
      toolbarParent.insertBefore(root, toolbarNext && toolbarNext.parentNode === toolbarParent ? toolbarNext : null);
    }
  }

  function showGuide(entry) {
    selected = entry;
    guide.innerHTML = "";
    var head = document.createElement("div"); head.className = "tool-search-guide-head";
    var glyph = document.createElement("i"); glyph.className = "ph " + (entry.icon || "ph-command");
    var title = document.createElement("strong"); title.textContent = local(entry, "label");
    head.append(glyph, title);
    var where = document.createElement("p");
    var whereLabel = document.createElement("b"); whereLabel.textContent = text("where") + ": ";
    where.append(whereLabel, document.createTextNode(text(entry.location || "top")));
    var how = document.createElement("p");
    var howLabel = document.createElement("b"); howLabel.textContent = text("how") + ": ";
    how.append(howLabel, document.createTextNode(local(entry, "help") || text("dynamicHow")));
    var actions = document.createElement("div"); actions.className = "tool-search-guide-actions";
    var locate = document.createElement("button"); locate.type = "button"; locate.hidden = typeof entry.run === "function" && !entry.selector; locate.innerHTML = '<i class="ph ph-map-pin"></i><span></span>'; locate.querySelector("span").textContent = text("show");
    locate.addEventListener("click", function () {
      setOpen(false);
      // Let the click that chose this button finish bubbling before opening a
      // toolbar menu; the app's global outside-click handler would otherwise
      // immediately close the menu we are trying to point out.
      setTimeout(function () { openLocation(entry); }, 0);
    });
    var run = document.createElement("button"); run.type = "button"; run.className = "primary"; run.innerHTML = '<i class="ph ph-arrow-right"></i><span></span>';
    run.querySelector("span").textContent = entry.tool ? text("start") : entry.action ? text("open") : text("use");
    run.addEventListener("click", function () { setOpen(false); runEntry(entry); });
    actions.append(locate, run);
    guide.append(head, where, how, actions);
    results.querySelectorAll("[role=option]").forEach(function (row) { row.setAttribute("aria-selected", row.dataset.id === entry.id ? "true" : "false"); });
  }

  function setActive(index, focusGuide) {
    if (!visible.length) { active = -1; return; }
    active = (index + visible.length) % visible.length;
    var rows = results.querySelectorAll("[role=option]");
    rows.forEach(function (row, i) { row.classList.toggle("active", i === active); });
    var row = rows[active];
    if (row) {
      input.setAttribute("aria-activedescendant", row.id);
      row.scrollIntoView({ block: "nearest" });
    }
    if (focusGuide) showGuide(visible[active]);
  }

  function render() {
    var query = input.value.trim();
    visible = searchToolEntries(entries, query, 8);
    active = visible.length ? 0 : -1;
    heading.textContent = text(query ? "results" : "suggested");
    results.innerHTML = "";
    guide.innerHTML = "";
    if (!visible.length) {
      var empty = document.createElement("div"); empty.className = "tool-search-empty";
      var strong = document.createElement("strong"); strong.textContent = text("none");
      var small = document.createElement("span"); small.textContent = text("noneHint");
      empty.append(strong, small); results.appendChild(empty); selected = null; return;
    }
    visible.forEach(function (entry, index) {
      var row = document.createElement("button");
      row.type = "button"; row.id = "tool-search-option-" + index; row.dataset.id = entry.id;
      row.setAttribute("role", "option"); row.setAttribute("aria-selected", "false");
      var glyph = document.createElement("i"); glyph.className = "ph " + (entry.icon || "ph-command");
      var copy = document.createElement("span");
      var name = document.createElement("strong"); name.textContent = local(entry, "label");
      var place = document.createElement("small"); place.textContent = text(entry.location || "top");
      copy.append(name, place);
      var arrow = document.createElement("i"); arrow.className = "ph ph-caret-right";
      row.append(glyph, copy, arrow);
      row.addEventListener("mouseenter", function () { setActive(index, false); });
      row.addEventListener("click", function () { setActive(index, true); });
      results.appendChild(row);
    });
    setActive(0, true);
  }

  input.addEventListener("focus", function () { setOpen(true); render(); });
  input.addEventListener("input", function () { clear.hidden = !input.value; setOpen(true); render(); });
  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1, true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1, true); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); showGuide(visible[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); input.blur(); }
  });
  clear.addEventListener("click", function () { input.value = ""; clear.hidden = true; input.focus(); render(); });
  root.querySelector(".tool-search-field").addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    setOpen(true);
    input.focus();
  });
  document.addEventListener("pointerdown", function (e) { if (!root.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); setOpen(true); input.focus(); input.select();
    }
  });
  onLangChange(applyLanguage);
  applyLanguage();
}
