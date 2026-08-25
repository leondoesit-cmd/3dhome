import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("usage: node tools/build_icon_theme_assets.mjs <iconify-source-dir>");

const DEFINITIONS = [
  { id: "lucide", file: "lucide", style: "outline", candidates: n => [n] },
  { id: "material", file: "material-symbols", style: "rounded", candidates: n => [`${n}-rounded`, n, `${n}-outline-rounded`] },
  { id: "mdi", file: "mdi", style: "pictogram", candidates: n => [n, `${n}-outline`] },
  { id: "tabler", file: "tabler", style: "technical", candidates: n => [n, `${n}-filled`] },
  { id: "huge", file: "hugeicons", style: "expressive", candidates: n => [n, `${n}-01`, `${n}-02`, `${n}-03`] },
];

// A tiny set of art-direction overrides keeps visually elementary operators
// distinct too. Without these, Lucide and Tabler intentionally draw the same
// two-stroke minus/X geometry, which would make those symbols look identical.
const THEME_DIRECT = {
  tabler: {
    minus: ["circle-dashed-minus"],
    x: ["square-x"],
  },
};

const DIRECT = {
  "align-bottom-simple": ["align-end-vertical", "align-bottom"],
  "align-center-horizontal": ["align-horizontal-center", "align-center"],
  "align-center-horizontal-simple": ["align-center-horizontal"],
  "align-center-vertical": ["align-vertical-center", "align-center"],
  "align-center-vertical-simple": ["align-center-vertical"],
  "align-left": ["align-start-horizontal", "align-left"],
  "align-right": ["align-end-horizontal", "align-right"],
  "align-top": ["align-start-vertical", "align-top"],
  angle: ["angle", "drafting-compass", "triangle-right"],
  "app-window": ["app-window", "window", "browser"],
  "approximate-equals": ["equal-approximately", "approximate-equals", "equal"],
  "arrow-circle-up": ["circle-arrow-up", "arrow-circle-up"],
  "arrow-clockwise": ["rotate-cw", "rotate-clockwise", "arrow-clockwise", "refresh-cw", "refresh"],
  "arrow-counter-clockwise": ["rotate-ccw", "rotate-left-01", "arrow-counter-clockwise", "history"],
  "arrow-down": ["arrow-downward", "arrow-down-01"],
  "arrow-line-down": ["arrow-down-to-line", "download"],
  "arrow-line-left": ["arrow-left-to-line", "log-in"],
  "arrow-line-right": ["arrow-right-to-line", "log-out"],
  "arrow-line-up": ["arrow-up-to-line", "upload"],
  "arrow-square-out": ["square-arrow-out-up-right", "external-link", "open-in-new"],
  "arrow-u-up-left": ["undo-2", "undo", "arrow-u-left-top"],
  "arrow-u-up-right": ["redo-2", "redo", "arrow-u-right-top"],
  "arrow-up": ["arrow-upward", "arrow-up-01"],
  "arrows-clockwise": ["refresh-cw", "refresh", "arrows-clockwise"],
  "arrows-down-up": ["arrow-down-up", "swap-vertical"],
  "arrows-horizontal": ["move-horizontal", "arrows-horizontal"],
  "arrows-in": ["minimize", "shrink"],
  "arrows-in-cardinal": ["minimize-2", "collapse"],
  "arrows-in-line-horizontal": ["fold-horizontal", "shrink-horizontal"],
  "arrows-in-line-vertical": ["fold-vertical", "shrink-vertical"],
  "arrows-in-simple": ["minimize", "shrink"],
  "arrows-left-right": ["arrow-left-right", "swap-horizontal"],
  "arrows-out": ["maximize", "expand"],
  "arrows-out-cardinal": ["maximize-2", "expand"],
  "arrows-out-line-horizontal": ["unfold-horizontal", "expand-horizontal"],
  "arrows-out-line-vertical": ["unfold-vertical", "expand-vertical"],
  "arrows-out-simple": ["maximize", "expand"],
  "arrows-vertical": ["move-vertical", "arrows-vertical"],
  "axis-arrow": ["axis-3d", "move-3d", "crosshair"],
  "bezier-curve": ["bezier-curve", "vector-curve"],
  blueprint: ["drafting-compass", "blueprint", "floor-plan", "ruler-square"],
  "bookmark-simple": ["bookmark"],
  "bowl-food": ["soup", "bowl-food", "restaurant"],
  "brackets-square": ["brackets", "square-brackets"],
  broadcast: ["radio-tower", "broadcast", "podcast"],
  "building-office": ["building-2", "building", "office-building"],
  "camera-rotate": ["camera", "rotate-3d", "camera-switch"],
  car: ["directions-car", "car-01", "car"],
  "car-profile": ["car-front", "directions-car", "car-01", "car", "roadster"],
  "cards-three": ["panels-top-left", "cards", "stack"],
  "caret-down": ["chevron-down", "arrow-drop-down"],
  "caret-left": ["chevron-left"],
  "caret-right": ["chevron-right"],
  "caret-up": ["chevron-up", "arrow-drop-up"],
  chandelier: ["lamp-ceiling", "lamp-pendant", "lightbulb"],
  "chat-circle-text": ["message-circle-more", "message-circle", "chat"],
  check: ["check", "tick-01", "done"],
  "check-circle": ["circle-check", "check-circle", "checkmark-circle-01", "task-alt"],
  "circle-dashed": ["circle-dashed", "radio-button-unchecked"],
  "circle-half": ["circle-half", "contrast"],
  "circle-notch": ["loader-circle", "progress-activity"],
  "circles-three": ["venn-diagram", "circles", "bubble-chart"],
  "circles-three-plus": ["circle-plus", "add-circle", "bubble-chart"],
  "clock-counter-clockwise": ["history", "clock-arrow-up", "restore"],
  "cloud-sun": ["cloud-sun", "partly-cloudy-day"],
  "coat-hanger": ["shirt", "hanger", "dry-cleaning"],
  columns: ["columns-2", "columns", "view-column"],
  "columns-plus-right": ["panel-right-open", "view-column"],
  "compass-tool": ["drafting-compass", "compass"],
  "copy-simple": ["copy"],
  corners: ["scan", "focus", "frame"],
  "corners-in": ["shrink", "scan-line", "contract"],
  "corners-out": ["expand", "scan", "maximize"],
  couch: ["sofa", "couch"],
  "crosshair-simple": ["crosshair"],
  "cube-focus": ["scan-3d", "box", "deployed-code"],
  "cubes-three": ["boxes", "box", "deployed-code"],
  cursor: ["mouse-pointer-2", "cursor-arrow", "cursor"],
  "cursor-click": ["mouse-pointer-click", "ads-click", "cursor-click"],
  "desktop-tower": ["pc-case", "computer", "desktop-mac"],
  "device-mobile": ["smartphone", "phone-android"],
  dishwasher: ["dishwasher", "washing-machine", "local-laundry-service"],
  distribute: ["align-horizontal-distribute-center", "spacing-horizontal", "space-between"],
  "door-open": ["door-open", "door-front"],
  "dot-outline": ["circle-dot", "radio-button-checked"],
  "dots-nine": ["grip", "apps", "grid-3x3-gap"],
  "dots-three-outline": ["ellipsis", "more-horiz", "more"],
  "download-simple": ["download"],
  "file-arrow-down": ["file-down", "download-file"],
  "file-arrow-up": ["file-up", "upload-file"],
  "file-csv": ["file-spreadsheet", "csv", "table-view"],
  "file-dashed": ["file-question", "draft", "file"],
  "file-step": ["file-down", "file-cog", "file-export"],
  "file-svg": ["file-code", "svg", "code-file"],
  "film-slate": ["clapperboard", "movie"],
  "film-strip": ["film", "movie"],
  "flag-checkered": ["flag", "sports-score"],
  "flip-horizontal": ["flip-horizontal-2", "flip"],
  "floppy-disk": ["save", "save-all"],
  "flow-arrow": ["workflow", "route", "conversion-path"],
  fold: ["fold-horizontal", "unfold-less", "panel-top-close"],
  "folder-minus": ["folder-minus", "folder-remove"],
  "folder-open": ["folder-open"],
  "folder-plus": ["folder-plus", "folder-add", "create-new-folder"],
  folders: ["folders", "folder-copy"],
  "fork-knife": ["utensils", "restaurant"],
  "frame-corners": ["scan", "frame", "crop-free"],
  fridge: ["refrigerator", "fridge", "kitchen"],
  "funnel-simple": ["filter"],
  gear: ["settings", "cog"],
  "gear-six": ["settings-2", "settings", "cog"],
  "graduation-cap": ["graduation-cap", "school"],
  "grid-four": ["grid-2x2", "grid-view"],
  "grid-nine": ["grid-3x3", "apps"],
  hand: ["front-hand", "pan-tool", "pan-01", "hand-grip"],
  "hand-fist": ["hand-fist", "front-hand", "pan-tool", "pan-01"],
  "hand-swipe-left": ["move-left", "swipe-left"],
  "hand-swipe-right": ["move-right", "swipe-right"],
  "hand-tap": ["hand-pointer", "touch-app"],
  "house-line": ["house", "home"],
  eye: ["eye", "visibility", "view"],
  "eye-slash": ["eye-off", "visibility-off", "view-off-slash", "view-off"],
  heart: ["heart", "favorite", "favourite"],
  "image-broken": ["image-off", "broken-image"],
  "image-square": ["image", "image-square"],
  intersect: ["combine", "intersect", "join-inner"],
  "lamp-pendant": ["lamp-ceiling", "lightbulb"],
  layout: ["layout-dashboard", "dashboard", "layout"],
  "line-segment": ["slash", "line", "diagonal-line"],
  "line-segments": ["workflow", "polyline", "timeline"],
  "line-vertical": ["separator-vertical", "vertical-line"],
  "link-break": ["unlink", "link-off"],
  "link-simple": ["link"],
  list: ["list", "view-list", "left-to-right-list-bullet"],
  "list-checks": ["list-checks", "checklist", "check-list"],
  "list-dashes": ["list", "format-list-bulleted"],
  "list-numbers": ["list-ordered", "format-list-numbered"],
  "lock-key": ["lock-keyhole", "lock"],
  "lock-key-open": ["lock-keyhole-open", "lock-open"],
  "lock-simple": ["lock"],
  "lock-simple-open": ["lock-open"],
  lockers: ["archive", "cabinet", "door-sliding"],
  "magic-wand": ["wand-sparkles", "auto-fix-high", "magic"],
  "magnifying-glass": ["search"],
  "map-pin-simple": ["map-pin", "location-on"],
  "microphone-slash": ["mic-off", "microphone-off"],
  microwave: ["microwave", "oven", "kitchen"],
  monitor: ["monitor", "desktop-windows"],
  mountains: ["mountain", "landscape"],
  "music-notes": ["music-2", "music-note"],
  "office-chair": ["armchair", "chair", "event-seat"],
  "paint-brush": ["paintbrush", "paint-brush"],
  "paint-brush-broad": ["paintbrush-2", "format-paint", "paint-brush"],
  "paint-brush-household": ["paint-roller", "format-paint"],
  "paint-roller": ["paint-roller", "format-paint"],
  "paper-plane-right": ["send", "navigation"],
  "paper-plane-tilt": ["send", "near-me"],
  path: ["route", "polyline", "timeline"],
  "pencil-line": ["pencil-line", "edit"],
  "pencil-simple": ["pencil", "edit"],
  "pencil-simple-line": ["pencil-line", "edit-note"],
  person: ["user", "person"],
  "person-simple-walk": ["person-walking", "directions-walk"],
  "play-circle": ["circle-play", "play-circle"],
  "plug-charging": ["plug-zap", "power-plug"],
  "plugs-connected": ["unplug", "power-plug"],
  "plus-circle": ["circle-plus", "add-circle"],
  "projector-screen": ["presentation", "co-present"],
  "push-pin": ["pin", "keep"],
  repeat: ["repeat-2", "repeat"],
  "rocket-launch": ["rocket", "rocket-launch"],
  rows: ["rows-2", "view-stream"],
  "rows-plus-bottom": ["panel-bottom-open", "add-row-below"],
  scales: ["scale", "balance", "balance-scale"],
  scan: ["scan-line", "document-scanner"],
  "seal-check": ["badge-check", "verified"],
  selection: ["scan", "select"],
  "selection-all": ["scan", "select-all"],
  "selection-background": ["panels-top-left", "layers"],
  "selection-plus": ["scan-line", "select-all", "add-box"],
  shapes: ["shapes", "category"],
  "shopping-cart": ["shopping-cart", "cart"],
  "sidebar-simple": ["panel-left", "dock-to-left"],
  "skip-back": ["skip-back", "skip-previous"],
  "skip-forward": ["skip-forward", "skip-next"],
  "sliders-horizontal": ["sliders-horizontal", "tune"],
  "speaker-hifi": ["speaker", "media-output"],
  "speaker-high": ["volume-2", "volume-up"],
  "speaker-slash": ["volume-x", "volume-off"],
  "spinner-gap": ["loader-circle", "progress-activity"],
  spotlight: ["flashlight", "spotlight", "highlight"],
  "square-half": ["square-dashed-bottom", "contrast-square"],
  "square-split-horizontal": ["panel-top", "splitscreen"],
  "squares-four": ["grid-2x2", "grid-view"],
  "stack-plus": ["layers-3", "add-to-photos"],
  "stack-simple": ["layers", "stacks"],
  "star-fill": ["star", "grade"],
  "sun-horizon": ["sunrise", "wb-twilight"],
  swap: ["arrow-left-right", "swap-horiz"],
  target: ["crosshair", "target"],
  television: ["tv", "television"],
  "television-simple": ["tv", "television"],
  "thermometer-hot": ["thermometer-sun", "device-thermostat"],
  toast: ["sandwich", "toast", "bakery-dining"],
  "tray-arrow-down": ["archive-restore", "move-to-inbox", "inbox-arrow-down"],
  "tree-structure": ["git-fork", "account-tree", "hierarchy"],
  trapezoid: ["trapezoid", "shapes", "category"],
  "upload-simple": ["upload"],
  "user-plus": ["user-plus", "person-add"],
  "users-three": ["users", "group"],
  wall: ["brick-wall", "wall", "view-quilt"],
  "warning-circle": ["circle-alert", "error"],
  "warning-octagon": ["octagon-alert", "report"],
  "washing-machine": ["washing-machine", "local-laundry-service"],
  "wifi-high": ["wifi"],
  wrench: ["wrench", "build"],
  "x-circle": ["circle-x", "cancel"],
};

// Cross-library vocabulary for shapes whose common name differs substantially
// between the five source systems. Every entry remains semantic; none points
// to the generic fallback glyph.
Object.assign(DIRECT, {
  "align-bottom": ["align-end-vertical", "box-align-bottom", "align-vertical-bottom"],
  "align-bottom-simple": ["align-end-vertical", "box-align-bottom", "align-vertical-bottom"],
  "align-top": ["align-start-vertical", "box-align-top", "align-vertical-top"],
  armchair: ["armchair", "chair", "seat", "event-seat"],
  angle: ["angle", "drafting-compass", "triangle-right", "change-history"],
  baseball: ["baseball", "ball-baseball", "sports-baseball", "volleyball"],
  bathtub: ["bathtub", "bath", "bathtub-01", "bathtub-02"],
  "bezier-curve": ["spline", "bezier-curve", "line-curve", "vector-square"],
  books: ["books", "library", "book-copy", "library-books"],
  broom: ["broom", "brush-cleaning", "cleaning-services", "cleaning"],
  "building-office": ["building-2", "building", "domain", "office", "office-building"],
  couch: ["sofa", "couch", "weekend"],
  "cooking-pot": ["soup", "cooking", "cooking-pot", "pot", "restaurant"],
  crosshair: ["crosshair", "target", "my-location", "gps-fixed"],
  "crosshair-simple": ["crosshair", "target", "my-location", "gps-fixed"],
  cube: ["cube", "box", "deployed-code"],
  cylinder: ["cylinder", "database", "database-outline"],
  drop: ["droplet", "water-drop", "drop"],
  equals: ["equal", "equals", "equal-sign"],
  "eye-slash": ["eye-off", "visibility-off", "view-off-slash", "view-off", "eye-slash"],
  export: ["share", "upload", "file-export", "export"],
  flame: ["flame", "fire", "local-fire-department"],
  "floppy-disk": ["save", "device-floppy", "floppy-disk"],
  "fork-knife": ["utensils", "restaurant", "tools-kitchen-2", "fork-knife"],
  funnel: ["filter", "filter-alt", "funnel"],
  hammer: ["hammer", "gavel", "handyman"],
  house: ["house", "home"],
  "image-broken": ["image-off", "broken-image", "photo-off"],
  lightbulb: ["lightbulb", "bulb", "lightbulb-on", "emoji-objects"],
  lightning: ["zap", "bolt", "lightning"],
  magnet: ["magnet", "horseshoe-magnet", "nest-cam-magnet-mount"],
  microphone: ["mic", "microphone"],
  minus: ["minus", "minus-sign", "remove"],
  monitor: ["monitor", "device-desktop", "desktop-windows"],
  nut: ["nut", "hexagon", "settings"],
  oven: ["oven", "stove", "cooking", "kitchen"],
  plant: ["sprout", "plant", "plant-2", "potted-plant"],
  polygon: ["polygon", "pentagon", "hexagon", "shapes"],
  printer: ["printer", "print"],
  plus: ["plus", "add", "add-01"],
  "file-plus": ["file-plus", "note-add", "attach-file-add"],
  "file-text": ["file-text", "description", "article"],
  robot: ["bot", "robot", "smart-toy"],
  ruler: ["ruler", "straighten"],
  scissors: ["scissors", "scissor", "content-cut"],
  screwdriver: ["screwdriver", "hammer-screwdriver", "wrench", "tools", "tool"],
  shower: ["shower-head", "shower", "droplet"],
  sliders: ["sliders-horizontal", "adjustments", "tune", "settings-adjust"],
  "sliders-horizontal": ["sliders-horizontal", "adjustments-horizontal", "tune", "settings-adjust"],
  sneaker: ["footprints", "shoe", "sneaker", "running-shoes"],
  snowflake: ["snowflake", "snow", "ac-unit"],
  sparkle: ["sparkles", "sparkle", "auto-awesome", "stars"],
  sphere: ["sphere", "globe-2", "circle-dot"],
  spiral: ["spiral", "spirals", "shell", "waves"],
  stairs: ["stairs", "stairs-01", "chart-no-axes-column-increasing"],
  steps: ["stairs", "stairs-02", "steps", "chart-no-axes-column-increasing"],
  sun: ["sun", "light-mode", "weather-sunny"],
  textbox: ["text-cursor-input", "text-box", "textbox", "input-field"],
  toast: ["toast", "sandwich", "bread", "bakery-dining"],
  toolbox: ["toolbox", "handyman", "briefcase", "tools"],
  towel: ["towel", "dry-cleaning", "cloth"],
  trash: ["trash-2", "trash", "delete"],
  union: ["combine", "merge", "vector-union", "union"],
  warning: ["triangle-alert", "alert-triangle", "warning"],
  "warning-circle": ["circle-alert", "alert-circle", "error"],
  wine: ["wine", "wine-glass", "local-bar", "drink"],
  wrench: ["wrench", "build", "tools"],
  x: ["x", "close", "cancel-01", "cancel"],
  "tree-structure": ["file-tree", "list-tree", "account-tree", "git-fork"],
  "user-plus": ["user-plus", "user-add-01", "person-add"],
  "caret-left": ["chevron-left", "arrow-left-01", "arrow-left"],
  "caret-right": ["chevron-right", "arrow-right-01", "arrow-right"],
  "circles-three": ["venn-diagram", "orbit", "circles", "bubble-chart"],
  "person-simple-walk": ["person-walking", "directions-walk", "footprints", "walk"],
  "arrows-in-line-horizontal": ["fold-horizontal", "arrow-collapse-horizontal", "unfold-less-horizontal"],
  "arrows-in-line-vertical": ["fold-vertical", "arrow-collapse-vertical", "unfold-less-vertical"],
  "arrows-out-line-horizontal": ["unfold-horizontal", "arrow-expand-horizontal", "arrows-horizontal"],
  "arrows-out-line-vertical": ["unfold-vertical", "arrow-expand-vertical", "arrows-vertical"],
  "list-checks": ["list-checks", "check-list", "checklist"],
  "list-numbers": ["list-ordered", "left-to-right-list-number", "format-list-numbered"],
  "paint-roller": ["paint-roller", "format-paint", "paint-bucket", "paint-board"],
});

const FALLBACK = {
  lucide: ["shapes", "box", "circle-help"],
  material: ["category-rounded", "deployed-code-rounded", "help-rounded"],
  mdi: ["shape", "cube", "help-circle"],
  tabler: ["shapes", "box", "help-circle"],
  huge: ["shapes", "cube", "help-circle"],
};

function stripStyle(name, id) {
  if (id === "material") return name.replace(/-(outline-)?(rounded|sharp)$/, "");
  if (id === "mdi") return name.replace(/-outline$/, "");
  if (id === "hugeicons") return name.replace(/-0[1-4]$/, "");
  return name.replace(/-filled$/, "");
}

function tokens(name) {
  const stop = new Set(["simple", "outline", "filled", "regular", "horizontal", "vertical"]);
  return name.split("-").filter(token => token && !stop.has(token) && !/^\d+$/.test(token));
}

function scoreName(candidate, source) {
  const a = new Set(tokens(candidate));
  const b = new Set(tokens(source));
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  if (!common) return 0;
  const union = new Set([...a, ...b]).size;
  return common / union + (candidate.startsWith(source) || source.startsWith(candidate) ? .22 : 0);
}

async function semanticNames() {
  const files = [path.join(repo, "index.html")];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".js") && !["icon_settings.js", "icon_theme_assets.js"].includes(entry.name)) files.push(full);
    }
  }
  await walk(path.join(repo, "js"));
  const found = new Set();
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/ph-[a-z0-9-]+/g)) found.add(match[0]);
  }
  return [...found].sort();
}

function canonicalCandidates(source) {
  const raw = source.replace(/^ph-/, "");
  const out = [raw, ...(DIRECT[raw] || [])];
  out.push(raw.replace(/-simple/g, ""));
  out.push(raw.replace(/-broad|-household|-hifi/g, ""));
  out.push(raw.replace(/^caret-/, "chevron-"));
  return [...new Set(out.filter(Boolean))];
}

function iconForName(collection, name, seen = new Set()) {
  if (collection.icons[name]) return collection.icons[name];
  const alias = collection.aliases && collection.aliases[name];
  if (!alias || seen.has(name)) return null;
  seen.add(name);
  return iconForName(collection, alias.parent, seen);
}

function resolveIcon(def, collection, source) {
  const names = [...Object.keys(collection.icons), ...Object.keys(collection.aliases || {})];
  const raw = source.replace(/^ph-/, "");
  const directed = THEME_DIRECT[def.id] && THEME_DIRECT[def.id][raw];
  if (directed) {
    const exact = directed.find(name => iconForName(collection, name));
    if (exact) return { name: exact, quality: "direct" };
  }
  const candidates = canonicalCandidates(source);
  for (const canonical of candidates) {
    for (const candidate of def.candidates(canonical)) {
      if (iconForName(collection, candidate)) return { name: candidate, quality: "direct" };
    }
  }
  let best = null;
  for (const name of names) {
    const plain = stripStyle(name, def.file);
    let score = 0;
    for (const canonical of candidates) score = Math.max(score, scoreName(plain, canonical));
    if (!best || score > best.score) best = { name, score };
  }
  if (best && best.score >= .32) return { name: best.name, quality: "fuzzy", score: best.score };
  const fallback = (FALLBACK[def.id] || []).find(name => iconForName(collection, name));
  return { name: fallback || names[0], quality: "fallback", score: best ? best.score : 0, suggestion: best ? best.name : "" };
}

const semantic = await semanticNames();
const themes = {};
const report = {};
for (const def of DEFINITIONS) {
  const collection = JSON.parse(await readFile(path.join(sourceRoot, def.file, "package", "icons.json"), "utf8"));
  const icons = {};
  const map = {};
  const quality = { direct: 0, fuzzy: 0, fallback: 0 };
  const weak = [];
  for (const source of semantic) {
    const resolved = resolveIcon(def, collection, source);
    const icon = iconForName(collection, resolved.name);
    map[source] = resolved.name;
    icons[resolved.name] = {
      body: icon.body,
      width: icon.width || collection.width || 24,
      height: icon.height || collection.height || 24,
    };
    quality[resolved.quality]++;
    if (resolved.quality !== "direct") weak.push([source, resolved.name, resolved.quality, resolved.score || 0, resolved.suggestion || ""]);
  }
  themes[def.id] = { style: def.style, icons, map };
  report[def.id] = { quality, weak };
}

const banner = `// Generated by tools/build_icon_theme_assets.mjs from five permissively licensed\n// Iconify collections. Do not edit this file by hand.\n`;
await writeFile(path.join(repo, "js", "icon_theme_assets.js"), banner +
  `export const ICON_SEMANTIC_NAMES = ${JSON.stringify(semantic)};\n` +
  `export const ICON_THEME_ASSETS = ${JSON.stringify(themes)};\n`);
await writeFile(path.join(repo, "tools", "icon_theme_mapping_report.json"), JSON.stringify(report, null, 2) + "\n");
for (const [id, data] of Object.entries(report)) console.log(id, data.quality);
