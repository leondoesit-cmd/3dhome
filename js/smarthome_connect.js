// Live connection to Home Assistant, Philips Hue and Shelly over the LAN.
// Talks directly when the browser is allowed to (CORS), otherwise through the
// local relay's /api/smarthome proxy so a home hub on 192.168.x is reachable.
import { S, touchItem3D } from "./state.js";
import {
  applyCommand,
  autoBind,
  bindingFor,
  devicePowered,
  emitSmartChange,
  ensureSmart,
  ensureSmartHome,
  flattenHaCalls,
  haEntitiesFromStates,
  haServiceFor,
  hueStateFrom,
  isSmartType,
  listDevices,
  setBinding,
  shellyRpcFrom,
  stateFromHaEntity,
} from "./smarthome.js";

var CREDS_KEY = "home3d_smarthome_creds";
var pollTimer = null;
var ws = null;
var wsId = 1;
var lastEntities = [];
var busy = false;

export function loadCreds() {
  try {
    var raw = localStorage.getItem(CREDS_KEY);
    var d = raw ? JSON.parse(raw) : null;
    if (d && typeof d === "object") {
      return {
        proto: String(d.proto || "ha"),
        url: String(d.url || ""),
        token: String(d.token || ""),
        hueUser: String(d.hueUser || ""),
      };
    }
  } catch (_) {}
  return { proto: "ha", url: "", token: "", hueUser: "" };
}

export function saveCreds(creds) {
  var next = Object.assign(loadCreds(), creds || {});
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify({
      proto: String(next.proto || "ha").slice(0, 16),
      url: String(next.url || "").slice(0, 240),
      token: String(next.token || "").slice(0, 512),
      hueUser: String(next.hueUser || "").slice(0, 80),
    }));
  } catch (_) {}
  return next;
}

export function clearCreds() {
  try { localStorage.removeItem(CREDS_KEY); } catch (_) {}
}

export function hubEntities() {
  return lastEntities;
}

export async function lanRequest(opts) {
  var url = String(opts.url || "");
  var method = String(opts.method || "GET").toUpperCase();
  var headers = opts.headers || {};
  var body = opts.body;
  var bodyText = body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body));
  try {
    var direct = await fetch(url, {
      method: method,
      headers: headers,
      body: method === "GET" || method === "HEAD" ? undefined : bodyText,
    });
    var text = await direct.text();
    if (direct.ok || direct.status === 401 || direct.status === 403) {
      return { ok: direct.ok, status: direct.status, text: text, via: "direct" };
    }
  } catch (_) {}
  var proxy;
  try {
    proxy = await fetch("/api/smarthome", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: url,
        method: method,
        headers: headers,
        body: bodyText,
      }),
    });
  } catch (err) {
    return { ok: false, status: 0, text: String(err && err.message ? err.message : err), via: "proxy" };
  }
  var payload = {};
  try { payload = await proxy.json(); } catch (_) {}
  return {
    ok: !!(payload.ok || (payload.status >= 200 && payload.status < 300)),
    status: payload.status || proxy.status,
    text: payload.text || payload.error || "",
    via: "proxy",
  };
}

function joinUrl(base, path) {
  var b = String(base || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(b)) b = "http://" + b;
  var p = path.charAt(0) === "/" ? path : "/" + path;
  return b + p;
}

function haHeaders(token) {
  return {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseJson(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

export async function testConnection(creds) {
  creds = creds || loadCreds();
  var proto = creds.proto || "ha";
  if (proto === "ha") return testHomeAssistant(creds);
  if (proto === "hue") return testHue(creds);
  if (proto === "shelly") return testShelly(creds);
  return { ok: false, error: "unknown protocol" };
}

async function testHomeAssistant(creds) {
  if (!creds.url || !creds.token) return { ok: false, error: "missing url or token" };
  var res = await lanRequest({
    url: joinUrl(creds.url, "/api/"),
    method: "GET",
    headers: haHeaders(creds.token),
  });
  if (!res.ok) return { ok: false, error: res.status === 401 ? "unauthorized" : (res.text || "unreachable"), status: res.status };
  var states = await fetchHaStates(creds);
  return { ok: true, proto: "ha", entities: states.entities, via: res.via, message: (parseJson(res.text) && parseJson(res.text).message) || "ok" };
}

async function fetchHaStates(creds) {
  var res = await lanRequest({
    url: joinUrl(creds.url, "/api/states"),
    method: "GET",
    headers: haHeaders(creds.token),
  });
  var raw = parseJson(res.text);
  var entities = haEntitiesFromStates(Array.isArray(raw) ? raw : []);
  lastEntities = entities;
  return { ok: res.ok, entities: entities, raw: raw };
}

async function testHue(creds) {
  if (!creds.url) return { ok: false, error: "missing url" };
  if (!creds.hueUser) return { ok: false, error: "hue_pair", needsPair: true };
  var res = await lanRequest({
    url: joinUrl(creds.url, "/api/" + encodeURIComponent(creds.hueUser) + "/lights"),
    method: "GET",
  });
  var data = parseJson(res.text);
  if (!data || typeof data !== "object") return { ok: false, error: res.text || "unreachable" };
  if (Array.isArray(data) && data[0] && data[0].error) {
    return { ok: false, error: data[0].error.description || "hue error", needsPair: data[0].error.type === 1 };
  }
  lastEntities = hueLightsToEntities(data);
  return { ok: true, proto: "hue", entities: lastEntities };
}

function hueLightsToEntities(map) {
  var out = [];
  Object.keys(map || {}).forEach(function (id) {
    var L = map[id];
    if (!L) return;
    out.push({
      entity_id: "light.hue_" + id,
      name: L.name || ("Hue " + id),
      kind: "light",
      hueId: id,
      state: L.state && L.state.on ? "on" : "off",
      attributes: L.state || {},
    });
  });
  return out;
}

export async function pairHue(url) {
  var res = await lanRequest({
    url: joinUrl(url, "/api"),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { devicetype: "modelforge#home" },
  });
  var data = parseJson(res.text);
  var row = Array.isArray(data) ? data[0] : data;
  if (row && row.success && row.success.username) {
    saveCreds({ proto: "hue", url: url, hueUser: row.success.username });
    return { ok: true, username: row.success.username };
  }
  var err = row && row.error;
  if (err && err.type === 101) return { ok: false, error: "hue_button", needsPair: true };
  return { ok: false, error: (err && err.description) || res.text || "hue pair failed" };
}

async function testShelly(creds) {
  if (!creds.url) return { ok: false, error: "missing url" };
  var res = await lanRequest({
    url: joinUrl(creds.url, "/rpc/Shelly.GetDeviceInfo"),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { id: 1, method: "Shelly.GetDeviceInfo" },
  });
  var data = parseJson(res.text);
  if (!res.ok || !data) {
    var gen1 = await lanRequest({ url: joinUrl(creds.url, "/shelly"), method: "GET" });
    data = parseJson(gen1.text);
    if (!data) return { ok: false, error: res.text || "unreachable" };
  }
  var name = (data.result && (data.result.name || data.result.id)) || data.id || data.type || "Shelly";
  lastEntities = [{ entity_id: "switch.shelly", name: String(name), kind: "switch", host: creds.url }];
  return { ok: true, proto: "shelly", entities: lastEntities };
}

export async function connectHub(creds) {
  creds = saveCreds(creds || loadCreds());
  var hub = ensureSmartHome();
  hub.status = { proto: creds.proto || "ha", connected: false, error: "", host: creds.url, entityCount: 0 };
  var result = await testConnection(creds);
  if (!result.ok) {
    hub.status.error = result.error || "failed";
    hub.status.connected = false;
    stopPolling();
    emitSmartChange({ source: "hub", status: hub.status });
    return result;
  }
  hub.status.connected = true;
  hub.status.error = "";
  hub.status.entityCount = (result.entities || []).length;
  hub.status.via = result.via;
  if (creds.proto === "ha") openHaSocket(creds);
  startPolling();
  emitSmartChange({ source: "hub", status: hub.status });
  return result;
}

export function disconnectHub() {
  stopPolling();
  closeHaSocket();
  var hub = ensureSmartHome();
  hub.status.connected = false;
  hub.status.error = "";
  emitSmartChange({ source: "hub", status: hub.status });
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(function () { refreshFromHub(); }, 8000);
  refreshFromHub();
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export async function refreshFromHub() {
  if (busy) return;
  var creds = loadCreds();
  var hub = ensureSmartHome();
  if (!hub.status.connected || !creds.url) return;
  busy = true;
  try {
    if (creds.proto === "ha") {
      var pack = await fetchHaStates(creds);
      if (pack.ok) applyEntityStates(pack.entities);
      hub.status.entityCount = pack.entities.length;
    } else if (creds.proto === "hue") {
      var hue = await testHue(creds);
      if (hue.ok) applyEntityStates(hue.entities);
    }
  } catch (_) {}
  busy = false;
  emitSmartChange({ source: "poll" });
}

function applyEntityStates(entities) {
  lastEntities = entities || [];
  var byId = {};
  lastEntities.forEach(function (e) { byId[e.entity_id] = e; });
  (S.items || []).forEach(function (it) {
    if (!isSmartType(it.type)) return;
    var bind = bindingFor(it.id);
    if (!bind || !bind.entityId || !byId[bind.entityId]) return;
    var patch = stateFromHaEntity(byId[bind.entityId]);
    if (!patch) return;
    applyCommand(it, patch, { silent: true, source: "hub" });
    touchItem3D(it, "build");
  });
}

export function autoBindFromHub() {
  var pairs = autoBind(listDevices(), lastEntities, { min: 48 });
  pairs.forEach(function (p) {
    setBinding(p.itemId, { proto: loadCreds().proto || "ha", entityId: p.entity.entity_id, host: loadCreds().url });
  });
  emitSmartChange({ source: "bind", count: pairs.length });
  return pairs;
}

export async function pushDevice(it, patch) {
  if (!it) return { ok: true, sim: true };
  var bind = bindingFor(it.id);
  var hub = ensureSmartHome();
  if (!bind || !hub.status.connected) return { ok: true, sim: true };
  var creds = loadCreds();
  if (creds.proto === "ha" || bind.proto === "ha") return pushHomeAssistant(it, patch, creds, bind);
  if (creds.proto === "hue" || bind.proto === "hue") return pushHue(it, patch, creds, bind);
  if (creds.proto === "shelly" || bind.proto === "shelly") return pushShelly(it, patch, creds, bind);
  return { ok: true, sim: true };
}

async function pushHomeAssistant(it, patch, creds, bind) {
  var calls = flattenHaCalls(haServiceFor(it, patch) || {
    domain: bind.entityId.split(".")[0],
    service: (patch && patch.on === false) ? "turn_off" : "turn_on",
    data: { entity_id: bind.entityId },
  });
  var last = { ok: true };
  for (var i = 0; i < calls.length; i++) {
    var c = calls[i];
    last = await lanRequest({
      url: joinUrl(creds.url, "/api/services/" + encodeURIComponent(c.domain) + "/" + encodeURIComponent(c.service)),
      method: "POST",
      headers: haHeaders(creds.token),
      body: c.data,
    });
    if (!last.ok) return { ok: false, error: last.text, status: last.status };
  }
  return { ok: true, via: last.via };
}

async function pushHue(it, patch, creds, bind) {
  var hueId = (bind.entityId || "").replace(/^light\.hue_/, "");
  if (!hueId) return { ok: false, error: "missing hue id" };
  var res = await lanRequest({
    url: joinUrl(creds.url, "/api/" + encodeURIComponent(creds.hueUser) + "/lights/" + encodeURIComponent(hueId) + "/state"),
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: hueStateFrom(it, patch),
  });
  return { ok: res.ok, error: res.ok ? "" : res.text, via: res.via };
}

async function pushShelly(it, patch, creds, bind) {
  var host = bind.host || creds.url;
  var rpc = shellyRpcFrom(it, patch);
  var res = await lanRequest({
    url: joinUrl(host, "/rpc"),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { id: 1, method: rpc.method, params: rpc.params },
  });
  return { ok: res.ok, error: res.ok ? "" : res.text, via: res.via };
}

function openHaSocket(creds) {
  closeHaSocket();
  if (typeof WebSocket === "undefined") return;
  var http = joinUrl(creds.url, "/");
  var wsUrl = http.replace(/^http/i, "ws") + "api/websocket";
  try { ws = new WebSocket(wsUrl); } catch (_) { return; }
  wsId = 1;
  ws.onmessage = function (ev) {
    var msg = parseJson(ev.data);
    if (!msg) return;
    if (msg.type === "auth_required") {
      ws.send(JSON.stringify({ type: "auth", access_token: creds.token }));
    } else if (msg.type === "auth_ok") {
      ws.send(JSON.stringify({ id: wsId++, type: "subscribe_events", event_type: "state_changed" }));
    } else if (msg.type === "event" && msg.event && msg.event.data && msg.event.data.entity_id) {
      onHaStateChanged(msg.event.data);
    }
  };
  ws.onerror = function () { closeHaSocket(); };
  ws.onclose = function () { ws = null; };
}

function onHaStateChanged(data) {
  var entity = data.new_state;
  if (!entity || !entity.entity_id) return;
  var patch = stateFromHaEntity(entity);
  (S.items || []).forEach(function (it) {
    var bind = bindingFor(it.id);
    if (!bind || bind.entityId !== entity.entity_id) return;
    applyCommand(it, patch, { silent: true, source: "hub" });
    touchItem3D(it, "build");
  });
  emitSmartChange({ source: "ws", entityId: entity.entity_id });
}

function closeHaSocket() {
  if (ws) {
    try { ws.close(); } catch (_) {}
    ws = null;
  }
}

export async function commandDevice(it, patch, opts) {
  ensureSmart(it);
  applyCommand(it, patch, { source: (opts && opts.source) || "ui" });
  if (it) touchItem3D(it, "build");
  var pushed = await pushDevice(it, patch);
  maybeFireAutomations(it);
  return pushed;
}

function maybeFireAutomations(it) {
  // imported lazily by ui to run automations after a local change
  try {
    var hub = ensureSmartHome();
    var cap = it && it.type;
    emitSmartChange({ source: "device", item: it, kind: cap, powered: devicePowered(it) });
  } catch (_) {}
}

export function restoreSession() {
  var creds = loadCreds();
  var hub = ensureSmartHome();
  if (creds.url && creds.token && creds.proto === "ha") {
    connectHub(creds).catch(function () {});
  } else if (creds.url && creds.proto === "hue" && creds.hueUser) {
    connectHub(creds).catch(function () {});
  } else if (creds.url && creds.proto === "shelly") {
    connectHub(creds).catch(function () {});
  } else {
    hub.status.proto = "sim";
    hub.status.connected = false;
  }
}
