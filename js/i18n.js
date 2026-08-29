// Bilingual (he/en) string table + tiny runtime.
// Static HTML is tagged with data-i18n / data-i18n-title / data-i18n-aria /
// data-i18n-ph attributes;
// dynamic strings go through t(key[, vars]) with {token} substitution.
//
// The tables themselves live one per locale in js/i18n/<lang>.js (~100 KB
// each). A session only ever shows one language, so only that one is fetched
// at boot; the other arrives on the first setLang() to it.
//
// t() STAYS SYNCHRONOUS. Nothing here returns a promise to its ~60 callers.
// The active locale is resolved from localStorage and awaited at module scope
// below, so this module has not finished evaluating — and therefore no
// importer's code has run — until its table is in memory. The await is paid
// once, in parallel with the rest of the module graph, instead of by every
// t() call site.
var LOADERS = {
  // Literal specifiers, not import("./i18n/" + lang + ".js"): tools/link_check.mjs
  // follows a dynamic import only when it can read the path.
  he: function () { return import("./i18n/he.js"); },
  en: function () { return import("./i18n/en.js"); },
};
var STR = {};

var lang = "en";
try {
  var s = localStorage.getItem("home3d_lang");
  if (s === "he" || s === "en") lang = s;
} catch (e) {}

function loadLang(l) {
  if (STR[l]) return Promise.resolve(STR[l]);
  return LOADERS[l]().then(function (mod) {
    STR[l] = mod.default;
    return STR[l];
  });
}

// Top-level await — the whole synchronous-t() contract rests on this line.
await loadLang(lang);

export function getLang() {
  return lang;
}

export function t(key, vars) {
  // Both tables carry the same key set, so the old cross-language fallback only
  // ever fired for a key that existed in neither. It still does, when the other
  // table happens to be loaded; otherwise a stray key renders as itself.
  var d = STR[lang] || {};
  var f = STR.he || {};
  var v = d[key] != null ? d[key] : f[key] != null ? f[key] : key;
  if (vars && typeof v === "string")
    v = v.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? vars[k] : m;
    });
  return v;
}

/* Mobile-visible instructions choose an explicit touch variant when one is
   available. Keeping this key-based avoids brittle word replacement inside
   unrelated prose, ARIA labels, or grammatically different translations. */
export function tTouch(key, vars) {
  var touch = false;
  try {
    touch = typeof document !== "undefined" && document.body && document.body.classList.contains("compact-nav");
  } catch (_) {}
  if (touch) {
    var touchKey = key + "_touch";
    var d = STR[lang] || {};
    var f = STR.he || {};
    if (d[touchKey] != null || f[touchKey] != null) return t(touchKey, vars);
  }
  return t(key, vars);
}

// register a callback to re-render dynamic (JS-generated) UI on language change
var listeners = [];
export function onLangChange(fn) {
  listeners.push(fn);
}

export function applyStatic() {
  document.documentElement.lang = lang;
  document.documentElement.dir = "ltr";
  document.title = t("title");
  var q = document.querySelectorAll("[data-i18n]");
  for (var i = 0; i < q.length; i++)
    q[i].textContent = t(q[i].getAttribute("data-i18n"));
  q = document.querySelectorAll("[data-i18n-title]");
  for (i = 0; i < q.length; i++)
    q[i].title = t(q[i].getAttribute("data-i18n-title"));
  q = document.querySelectorAll("[data-i18n-aria]");
  for (i = 0; i < q.length; i++)
    q[i].setAttribute("aria-label", t(q[i].getAttribute("data-i18n-aria")));
  q = document.querySelectorAll("[data-i18n-ph]");
  for (i = 0; i < q.length; i++)
    q[i].placeholder = t(q[i].getAttribute("data-i18n-ph"));
  // <optgroup> shows its `label` attribute, not text content (floor pickers)
  q = document.querySelectorAll("[data-i18n-label]");
  for (i = 0; i < q.length; i++)
    q[i].label = t(q[i].getAttribute("data-i18n-label"));
}

/* setLang() may have to fetch the other table first. It keeps `lang` — and so
   every t() answer — on the current locale until the new table is actually in
   memory, and returns a promise for callers that want to await the swap. A
   failed fetch (offline) leaves the UI in the language it was already in. */
export function setLang(l) {
  var next = l === "en" ? "en" : "he";
  if (STR[next]) {
    commitLang(next);
    return Promise.resolve();
  }
  return loadLang(next).then(function () {
    commitLang(next);
  }, function () {});
}

function commitLang(next) {
  lang = next;
  try {
    localStorage.setItem("home3d_lang", lang);
  } catch (e) {}
  applyStatic();
  for (var i = 0; i < listeners.length; i++) {
    try {
      listeners[i]();
    } catch (e) {}
  }
}

export function toggleLang() {
  return setLang(lang === "he" ? "en" : "he");
}
