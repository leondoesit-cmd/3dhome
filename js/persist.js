// Session safety net: autosave, crash recovery, an unsaved-changes guard, and a
// last-resort handler for errors that would otherwise leave a blank page.
//
// Deliberately dependency-light: it takes serialize/applyData/flash/openModal
// from main.js rather than importing ui.js, so there is no import cycle with
// the module it protects. history.js and ui.js only import the tiny
// markDirty/markSaved pair from here.
import { t } from "./i18n.js";
import { needsRecovery } from "./recovery.js";

const AUTO_KEY = "home3d_auto"; // { json, at } — the rolling background copy
const LIVE_KEY = "home3d_live"; // {sessionId: heartbeat timestamp}
const CLEAN_KEY = "home3d_clean"; // {sessionId: clean-shutdown timestamp}
const CHANNEL = "home3d_sessions";
const DEBOUNCE_MS = 1500;
const BEAT_MS = 5000; // how often a live session refreshes its heartbeat
const STALE_MS = 20000; // no beat for this long ⇒ that session died
const RECOVERY_DB = "home3d_recovery";
const RECOVERY_STORE = "snapshots";

var api = null; // { serialize, applyData, flash, openModal }
var dirty = false; // model changed since the last explicit save/export
var timer = null;
var lastWritten = null; // avoid rewriting an identical payload
var quotaWarned = false;
var sessionId = makeSessionId();
var sessionChannel = null;
var probes = new Map();

function makeSessionId() {
  try {
    var a = new Uint32Array(4);
    crypto.getRandomValues(a);
    return Array.from(a, function (n) { return n.toString(36); }).join("-");
  } catch (_) {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }
}

function recoveryDB() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    var req = indexedDB.open(RECOVERY_DB, 1);
    req.onupgradeneeded = function () {
      if (!req.result.objectStoreNames.contains(RECOVERY_STORE))
        req.result.createObjectStore(RECOVERY_STORE, { keyPath: "id" });
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}
async function writeAutoDB(snap) {
  var database = await recoveryDB();
  return new Promise(function (resolve, reject) {
    var tx = database.transaction(RECOVERY_STORE, "readwrite");
    tx.objectStore(RECOVERY_STORE).put(Object.assign({ id: "latest" }, snap));
    tx.oncomplete = function () { database.close(); resolve(); };
    tx.onerror = function () { database.close(); reject(tx.error); };
  });
}
async function readAutoDB() {
  var database = await recoveryDB();
  return new Promise(function (resolve, reject) {
    var tx = database.transaction(RECOVERY_STORE, "readonly");
    var req = tx.objectStore(RECOVERY_STORE).get("latest");
    req.onsuccess = function () { resolve(req.result || null); };
    req.onerror = function () { reject(req.error); };
    tx.oncomplete = function () { database.close(); };
  });
}
async function clearAutoDB() {
  var database = await recoveryDB();
  return new Promise(function (resolve) {
    var tx = database.transaction(RECOVERY_STORE, "readwrite");
    tx.objectStore(RECOVERY_STORE).delete("latest");
    tx.oncomplete = function () { database.close(); resolve(); };
    tx.onerror = function () { database.close(); resolve(); };
  });
}

/* ---- dirty tracking ------------------------------------------------------
   Called from the app's existing mutation choke points, so autosave does not
   need its own notion of what counts as an edit. */
export function markDirty() {
  dirty = true;
  if (!api) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(writeAuto, DEBOUNCE_MS);
}
export function markSaved() {
  dirty = false;
}
export function isDirty() {
  return dirty;
}

function writeAuto() {
  timer = null;
  if (!api) return;
  var json;
  try {
    json = api.serialize();
  } catch (e) {
    return; // a serializer failure must never break editing
  }
  if (json === lastWritten) return;
  var snap = { json: json, at: Date.now(), session: sessionId };
  // Large scene JSON belongs in IndexedDB, which has a much larger quota and
  // writes off the main thread. localStorage keeps only recovery metadata; a
  // compact scene is duplicated there as a synchronous page-exit fallback.
  writeAutoDB(snap).catch(function () {
    try { localStorage.setItem(AUTO_KEY, JSON.stringify(snap)); } catch (_) {}
  });
  try {
    localStorage.setItem(
      AUTO_KEY,
      JSON.stringify(json.length < 500000 ? snap : { at: snap.at, session: sessionId, indexedDB: true }),
    );
    lastWritten = json;
  } catch (e) {
    // Almost always the ~5 MB quota, blown by embedded base64 textures. Say so
    // once — silently failing to autosave is worse than a one-time nudge.
    if (!quotaWarned) {
      quotaWarned = true;
      api.flash(t("f_autoQuota"), "error");
    }
  }
}

/* ---- crash recovery ------------------------------------------------------
   A live session refreshes LIVE_KEY every BEAT_MS and clears it on a clean
   exit. At startup a *stale* heartbeat means the previous session died without
   unwinding (crash, kill, OS restart) and its autosave is worth offering back.

   The heartbeat is what makes this multi-tab safe: a plain "is it set?" flag
   would make every second tab think the first one had crashed. A fresh
   timestamp means another tab is alive right now, so we stay quiet.

   A normal reload or close exits cleanly and is never prompted about — that
   case is covered by the beforeunload guard instead. */
function readAuto() {
  try {
    var raw = localStorage.getItem(AUTO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function readMap(key) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return {};
    if (/^\d+$/.test(raw)) return { legacy: parseInt(raw, 10) };
    var value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (_) { return {}; }
}
function writeMap(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}
function beat() {
  var leases = readMap(LIVE_KEY), now = Date.now();
  Object.keys(leases).forEach(function (id) {
    if (!isFinite(leases[id]) || now - leases[id] > STALE_MS * 3) delete leases[id];
  });
  leases[sessionId] = now;
  writeMap(LIVE_KEY, leases);
}
function dropLease() {
  var leases = readMap(LIVE_KEY);
  delete leases[sessionId];
  writeMap(LIVE_KEY, leases);
}
function markClean() {
  var clean = readMap(CLEAN_KEY), now = Date.now();
  clean[sessionId] = now;
  var ids = Object.keys(clean);
  if (ids.length > 40)
    ids.sort(function (a, b) { return clean[b] - clean[a]; })
      .slice(40).forEach(function (id) { delete clean[id]; });
  writeMap(CLEAN_KEY, clean);
}
function installSessionChannel() {
  if (typeof BroadcastChannel !== "function") return;
  try {
    sessionChannel = new BroadcastChannel(CHANNEL);
    sessionChannel.onmessage = function (event) {
      var m = event.data || {};
      if (m.type === "probe" && m.session === sessionId)
        sessionChannel.postMessage({ type: "alive", nonce: m.nonce });
      else if (m.type === "alive" && probes.has(m.nonce)) {
        probes.get(m.nonce)(true);
        probes.delete(m.nonce);
      }
    };
  } catch (_) { sessionChannel = null; }
}
function probeSession(target) {
  if (!sessionChannel || !target) return Promise.resolve(null);
  return new Promise(function (resolve) {
    var nonce = sessionId + ":" + Date.now() + ":" + Math.random();
    var done = false;
    probes.set(nonce, function (value) {
      if (done) return;
      done = true;
      resolve(value);
    });
    sessionChannel.postMessage({ type: "probe", session: target, nonce: nonce });
    setTimeout(function () {
      if (done) return;
      done = true;
      probes.delete(nonce);
      resolve(false);
    }, 250);
  });
}
async function shouldRecover(snap, leasesBeforeBeat) {
  var alive = snap && snap.session ? await probeSession(snap.session) : null;
  return needsRecovery(snap, {
    now: Date.now(),
    staleMs: STALE_MS,
    alive: alive,
    cleanAt: snap && snap.session ? readMap(CLEAN_KEY)[snap.session] : undefined,
    leaseAt: snap && snap.session ? leasesBeforeBeat[snap.session] : undefined,
    legacyLeaseAt: leasesBeforeBeat.legacy,
  });
}
function offerRecovery(snap) {
  if (!snap || !snap.json) return;

  var when = "";
  try {
    when = new Date(snap.at).toLocaleString();
  } catch (e) {}

  var m = api.openModal(t("rec_title"));
  var p = document.createElement("p");
  p.className = "warn-text";
  p.textContent = t("rec_body") + (when ? " (" + when + ")" : "");
  m.body.appendChild(p);

  var restore = document.createElement("button");
  restore.className = "btn-primary";
  restore.textContent = t("rec_restore");
  restore.addEventListener("click", function () {
    try {
      api.applyData(JSON.parse(snap.json));
      // A recovered plan has not yet been explicitly saved in this session.
      markDirty();
      api.flash(t("rec_done"), "success");
    } catch (e) {
      api.flash(t("rec_fail"), "error");
    }
    m.close();
  });

  var fresh = document.createElement("button");
  fresh.textContent = t("rec_fresh");
  fresh.addEventListener("click", function () {
    try {
      localStorage.removeItem(AUTO_KEY);
    } catch (e) {}
    clearAutoDB().catch(function () {});
    m.close();
  });

  m.actions.appendChild(fresh);
  m.actions.appendChild(restore);
  restore.focus();
}

/* ---- global failure net --------------------------------------------------
   Without this an exception during module init leaves a white page with the
   reason only in devtools. Show something a person can act on. */
function showFatal(msg) {
  if (document.getElementById("fatal-banner")) return;
  var b = document.createElement("div");
  b.id = "fatal-banner";
  b.setAttribute("role", "alert");
  b.textContent = msg;
  (document.body || document.documentElement).appendChild(b);
}
function installErrorNet() {
  window.addEventListener("error", function (e) {
    var el = e && e.target && e.target !== window ? e.target : null;
    if (el && el.tagName) {
      // A resource failed. Only code and styles are load-bearing enough to
      // warrant a page-level banner — a decorative image that did not resolve
      // (an empty catalog thumbnail, say) must stay silent, or the app cries
      // wolf on a perfectly healthy page.
      var tag = el.tagName.toUpperCase();
      if (tag === "SCRIPT" || tag === "LINK") showFatal(t("err_asset"));
      return;
    }
    if (api && api.flash) api.flash(t("err_generic"), "error");
    else showFatal(t("err_generic"));
  }, true);
  window.addEventListener("unhandledrejection", function () {
    if (api && api.flash) api.flash(t("err_generic"), "error");
  });
}

export function initPersistence(deps) {
  api = deps;
  installErrorNet();

  // Read previous state before adding this tab's lease. BroadcastChannel tells
  // a real second tab apart from a freshly-reopened crashed session.
  var localSnap = readAuto();
  var leasesBeforeBeat = readMap(LIVE_KEY);
  installSessionChannel();
  beat();
  setInterval(beat, BEAT_MS);

  // Warn before losing edits to an accidental reload or tab close. Modern
  // browsers ignore the message and show their own, but returnValue must be set.
  window.addEventListener("beforeunload", function (e) {
    if (!dirty) return;
    writeAuto(); // one last copy before we go
    e.preventDefault();
    e.returnValue = "";
    return "";
  });
  // pagehide is the reliable "we are actually leaving" signal on mobile Safari,
  // where beforeunload often never fires.
  window.addEventListener("pagehide", function () {
    if (dirty) writeAuto();
    markClean();
    dropLease();
    if (sessionChannel) sessionChannel.close();
  });
  // backgrounding a tab is the last moment we are guaranteed to run on mobile
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && dirty) writeAuto();
  });

  readAutoDB().catch(function () { return null; }).then(function (dbSnap) {
    var snap = dbSnap && dbSnap.json && (!localSnap || !localSnap.json || (dbSnap.at || 0) >= (localSnap.at || 0)) ? dbSnap : localSnap;
    return shouldRecover(snap, leasesBeforeBeat).then(function (recover) {
      if (recover && snap && snap.json) offerRecovery(snap);
    });
  });
}
