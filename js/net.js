// Realtime multiplayer core — relay connection + identity + rooms + voice.
// No DOM here (UI lives in js/ui_friends.js / js/ui_chat.js).
//
// Transport: one WebSocket to the bundled relay (server/relay.mjs). All
// app-level payloads ride inside {t:'msg', data:{k:...}} envelopes, either
// room-broadcast or targeted (`to` = a peer's friend code). Voice is a
// browser-native WebRTC audio mesh; the relay only carries the signaling.
//
// Room model: every player is always in exactly one "apartment" room —
// their own (apt:<myCode>) when home, or a friend's (apt:<friendCode>)
// while visiting. The room's owner is the authority for the scene: on
// join, visitors ask the owner for the live layout (see js/visit.js).

import { sha256 } from "./core/sha256.js";
import { sanitizeDisplayName } from "./safe.js";

const LS_ID = "home3d_mp_id",
  LS_TOKEN = "home3d_mp_token",
  LS_NAME = "home3d_mp_name",
  LS_URL = "home3d_mp_url";

function cleanName(n) {
  return sanitizeDisplayName(n, 24);
}

export function codeFor(token) {
  const digest = sha256(token);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let bits = 0;
  for (let i = 0; i < 5; i++) bits = bits * 256 + digest[i];
  let code = "";
  for (let shift = 35; shift >= 0; shift -= 5) code += alphabet[Math.floor(bits / 2 ** shift) & 31];
  return code.slice(0, 4) + "-" + code.slice(4);
}

function randToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let raw = "";
  bytes.forEach((b) => { raw += String.fromCharCode(b); });
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const NET = {
  code: null, // my friend code (persistent identity)
  token: null, // private proof that this browser owns the friend code
  name: "", // my display name
  ws: null,
  connected: false,
  room: null, // current room id (apt:<code>)
  roster: [], // [{code,name,room}] — everyone on the relay
  peers: {}, // code -> {name} for peers in MY current room
  joined: false, // the relay has admitted this connection to NET.room
  admissions: Object.create(null), // code -> view/edit, held only by the owner
  knocks: Object.create(null),
};

// Transport membership and owner approval are independent of a saved UI role.
export function remoteContext() {
  return { code: NET.code, owner: roomOwner(), joined: NET.joined,
    members: NET.peers, admissions: NET.admissions };
}
export function acceptRemote(kind, from, ctx) {
  if (!ctx?.joined || !ctx.code || !ctx.owner || !from || from === ctx.code ||
      !Object.hasOwn(ctx.members || {}, from)) return false;
  const host = ctx.code === ctx.owner;
  const right = Object.hasOwn(ctx.admissions || {}, from) ? ctx.admissions[from] : null;
  const admitted = right === "view" || right === "edit";
  if (["plan_sync", "plan_op", "scene", "project_present"].includes(kind))
    return !host && from === ctx.owner;
  if (kind === "plan_op_req") return host && right === "edit";
  if (kind === "plan_hello" || kind === "scene_req") return host && admitted;
  if (kind === "survey_photo_request") return host ? admitted : from === ctx.owner;
  if (kind === "survey_photo_chunk") return host ? right === "edit" : from === ctx.owner;
  if (["project_comment", "plan_cursor", "rtc"].includes(kind)) return host ? admitted : true;
  return false;
}
export function sameProject(mine, theirs) {
  return typeof mine === "string" && !!mine && typeof theirs === "string" && !!theirs && mine === theirs;
}
export function answerKnock(code, right) {
  if (!Object.hasOwn(NET.knocks, code) || !["view", "edit", "deny"].includes(right)) return false;
  if (!send({ t: right === "deny" ? "deny" : "admit", code })) return false;
  if (right !== "deny") NET.admissions[code] = right;
  delete NET.knocks[code];
  emit("knocks");
  return true;
}

try {
  NET.code = localStorage.getItem(LS_ID);
  NET.token = localStorage.getItem(LS_TOKEN);
  NET.name = cleanName(localStorage.getItem(LS_NAME) || "");
} catch (_) {}
if (!NET.code || !NET.token) {
  NET.token = NET.token || randToken();
  NET.code = codeFor(NET.token);
  try {
    localStorage.setItem(LS_TOKEN, NET.token);
    localStorage.setItem(LS_ID, NET.code);
  } catch (_) {}
}

export function myRoom() {
  return "apt:" + NET.code;
}
export function isHome() {
  return !NET.room || NET.room === myRoom();
}
export function roomOwner() {
  return NET.room ? NET.room.slice(4) : NET.code;
}
export function setMyName(n) {
  NET.name = cleanName(n);
  try {
    localStorage.setItem(LS_NAME, NET.name);
  } catch (_) {}
  if (NET.connected)
    send({ t: "hello", code: NET.code, name: NET.name, token: NET.token });
}

// ---- server URL -----------------------------------------------------------
export function serverURL() {
  let u = "";
  try {
    u = localStorage.getItem(LS_URL) || "";
  } catch (_) {}
  if (u) return u;
  // The desktop shell (desktop/src-tauri) names the relay: its own origin
  // (http://mf.localhost, mf://localhost) serves files, not WebSockets.
  const desktop = typeof window !== "undefined" ? window.__MF_DESKTOP__ : null;
  if (desktop) return desktop.relayUrl || "ws://localhost:8765";
  // served by the bundled relay? then the same host speaks WebSocket too
  if (location.protocol === "http:" || location.protocol === "https:")
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  return "ws://localhost:8765";
}
export function setServerURL(u) {
  try {
    if (u) localStorage.setItem(LS_URL, u.trim());
    else localStorage.removeItem(LS_URL);
  } catch (_) {}
}

// ---- tiny event bus -------------------------------------------------------
// events: status(connected), roster, room(peers changed), chat({from,name,text}),
//         pose({from,pose}), data({from,data}), peer-join({code,name}),
//         peer-leave({code,name}), voice-state, identity-changed({from,to})
const subs = {};
export function on(ev, fn) {
  (subs[ev] = subs[ev] || []).push(fn);
  return () => {
    subs[ev] = (subs[ev] || []).filter((f) => f !== fn);
  };
}
function emit(ev, arg) {
  (subs[ev] || []).forEach((fn) => {
    try {
      fn(arg);
    } catch (e) {
      console.error("net handler failed", ev, e);
    }
  });
}


// 256 K UTF-16 chars fit in <= 768 KB UTF-8. Eight unacknowledged parts bound
// a slow recipient's relay queue to ~2-6 MB. 20 ms leaves room under 120 msgs/s
// for cursors/poses and receiver acks; 64 M chars bounds reassembly memory.
export const TRANSFER = Object.freeze({ chunkChars: 256 * 1024, window: 8, partIntervalMs: 20,
  highWater: 4 * 1024 * 1024, stallMs: 30000, maxChars: 64 * 1024 * 1024,
  maxPartChars: 1024 * 1024, maxIncoming: 2 });

export function transferBounds(text, chunkChars) {
  if (!Number.isInteger(chunkChars) || chunkChars < 2) throw new RangeError("chunkChars must be >= 2");
  const bounds = [0];
  while (bounds[bounds.length - 1] < text.length) {
    let end = Math.min(text.length, bounds[bounds.length - 1] + chunkChars);
    if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff &&
        text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--;
    bounds.push(end);
  }
  return bounds;
}

export function createTransfers({ send, bufferedAmount = () => 0, emit = () => {}, admit = () => false,
  limits = TRANSFER, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  randomId = () => randToken().slice(0, 32) }) {
  const cfg = { ...TRANSFER, ...limits }, outgoing = new Map(), incoming = new Map();
  let timer = null, nextPartAt = -Infinity;
  function wire(data, to) { try { return send(data, to) !== false; } catch (_) { return false; } }
  function event(record, state) { emit("transfer", { from: record.from, kind: record.kind, id: record.id, state }); }
  function cancel(id, to) { wire({ k: "xfer_cancel", id }, to); }
  function finish(record, ok, notify = true) {
    if (!outgoing.delete(record.id)) return;
    if (!ok && notify) cancel(record.id, record.to);
    record.resolve(ok);
  }
  function fail(record, notify = true) {
    if (incoming.get(record.from) !== record) return;
    incoming.delete(record.from);
    if (notify) cancel(record.id, record.from);
    event(record, "failed");
  }
  function schedule() {
    if (timer !== null) { clearTimer(timer); timer = null; }
    if (!outgoing.size && !incoming.size) return;
    const at = now();
    let delay = Infinity;
    for (const record of incoming.values()) delay = Math.min(delay, Math.max(1, record.at + cfg.stallMs - at));
    for (const record of outgoing.values()) {
      delay = Math.min(delay, Math.max(1, record.at + cfg.stallMs - at));
      if (record.next < record.n && record.next - record.ack - 1 < cfg.window)
        delay = Math.min(delay, bufferedAmount() > cfg.highWater ? 50 : Math.max(0, nextPartAt - at));
    }
    timer = setTimer(pump, delay);
  }
  function pump() {
    timer = null;
    const at = now();
    for (const record of incoming.values()) if (at - record.at >= cfg.stallMs) fail(record);
    for (const record of outgoing.values()) if (at - record.at >= cfg.stallMs) finish(record, false);
    if (at >= nextPartAt && bufferedAmount() <= cfg.highWater) {
      for (const record of outgoing.values()) {
        if (record.next >= record.n || record.next - record.ack - 1 >= cfg.window) continue;
        const i = record.next++;
        outgoing.delete(record.id); outgoing.set(record.id, record);
        nextPartAt = at + cfg.partIntervalMs;
        const data = { k: "xfer", kind: record.kind, id: record.id, i, n: record.n,
          total: record.text.length, part: record.text.slice(record.bounds[i], record.bounds[i + 1]) };
        if (record.projectId !== undefined) data.projectId = record.projectId;
        if (!wire(data, record.to)) finish(record, false);
        break;
      }
    }
    schedule();
  }
  function allowed(kind, from, header) { try { return admit(kind, from, header) === true; } catch (_) { return false; } }
  function validId(id) { return typeof id === "string" && id.length >= 1 && id.length <= 64; }
  return {
    send(data, to) {
      if (typeof to !== "string" || !to) return Promise.resolve(false);
      let text;
      try { text = JSON.stringify(data); } catch (_) { return Promise.resolve(false); }
      if (typeof text !== "string" || text.length > cfg.maxChars) return Promise.resolve(false);
      for (const record of outgoing.values()) if (record.to === to && record.kind === data.k) finish(record, false);
      if (text.length <= cfg.chunkChars) { schedule(); return Promise.resolve(wire(data, to)); }
      if (typeof data.k !== "string" || !data.k || data.k.length > 64) return Promise.resolve(false);
      const id = randomId();
      if (!validId(id) || outgoing.has(id)) return Promise.resolve(false);
      const bounds = transferBounds(text, cfg.chunkChars);
      return new Promise(resolve => {
        outgoing.set(id, { id, kind: data.k, to, text, bounds, n: bounds.length - 1, next: 0, ack: -1,
          projectId: typeof data.projectId === "string" ? data.projectId : undefined, at: now(), resolve });
        schedule();
      });
    },
    receive(from, d) {
      if (!d || !["xfer", "xfer_ack", "xfer_cancel"].includes(d.k)) return false;
      if (!validId(d.id)) {
        // An invalid id cannot name live work; bound any data reflected back.
        if (d.k === "xfer") cancel(typeof d.id === "string" ? d.id.slice(0, 64) : "", from);
        return true;
      }
      if (d.k !== "xfer") {
        const record = outgoing.get(d.id);
        if (record && record.to === from) {
          if (d.k === "xfer_cancel") finish(record, false, false);
          else if (Number.isInteger(d.i) && d.i >= 0 && d.i < record.n && d.i < record.next && d.i > record.ack) {
            record.ack = d.i; record.at = now();
            if (record.ack === record.n - 1) finish(record, true);
          }
        }
        const received = incoming.get(from);
        if (d.k === "xfer_cancel" && received?.id === d.id) fail(received, false);
        schedule(); return true;
      }
      let record = incoming.get(from);
      // Stale parts cannot disrupt a newer transfer from the same sender.
      if (Number.isInteger(d.i) && d.i > 0 && record?.id !== d.id) return true;
      const valid = typeof d.kind === "string" && d.kind.length > 0 && d.kind.length <= 64 &&
        Number.isInteger(d.total) && d.total >= 1 && d.total <= cfg.maxChars &&
        Number.isInteger(d.n) && d.n >= 1 && d.n <= d.total &&
        Number.isInteger(d.i) && d.i >= 0 && d.i < d.n &&
        typeof d.part === "string" && d.part.length >= 1 && d.part.length <= cfg.maxPartChars &&
        (d.projectId === undefined || typeof d.projectId === "string");
      if (!valid || !allowed(d.kind, from, d)) {
        if (record?.id === d.id) fail(record); else cancel(d.id, from);
        schedule(); return true;
      }
      if (d.i === 0) {
        if (record) incoming.delete(from);
        let total = d.total;
        for (const active of incoming.values()) total += active.total;
        if (incoming.size >= cfg.maxIncoming || total > cfg.maxChars) {
          cancel(d.id, from); schedule(); return true;
        }
        record = { from, id: d.id, kind: d.kind, projectId: d.projectId, total: d.total, n: d.n,
          parts: [], length: 0, at: now() };
        incoming.set(from, record); event(record, "start");
      }
      if (d.i !== record.parts.length || d.n !== record.n || d.total !== record.total ||
          d.kind !== record.kind || d.projectId !== record.projectId || record.length + d.part.length > record.total) {
        fail(record); schedule(); return true;
      }
      record.parts.push(d.part); record.length += d.part.length; record.at = now();
      if (record.parts.length === record.n) {
        let payload;
        try { payload = JSON.parse(record.parts.join("")); } catch (_) {}
        if (record.length !== record.total || !payload || Object.getPrototypeOf(payload) !== Object.prototype ||
            payload.k !== record.kind || (record.projectId !== undefined && payload.projectId !== record.projectId)) {
          fail(record); schedule(); return true;
        }
        incoming.delete(from);
        wire({ k: "xfer_ack", id: d.id, i: d.i }, from);
        emit("data", { from, data: payload }); event(record, "done");
      } else wire({ k: "xfer_ack", id: d.id, i: d.i }, from);
      schedule(); return true;
    },
    dropPeer(code) {
      for (const record of outgoing.values()) if (record.to === code) finish(record, false);
      const record = incoming.get(code); if (record) fail(record);
      schedule();
    },
    reset() {
      for (const record of outgoing.values()) finish(record, false);
      for (const record of incoming.values()) fail(record);
      nextPartAt = -Infinity; schedule();
    },
  };
}

const largeAdmissions = new Map();
const transfers = createTransfers({ send: sendData, bufferedAmount: () => NET.ws?.bufferedAmount || 0,
  emit, admit: (kind, from, header) => largeAdmissions.get(kind)?.(from, header) === true });
export function sendLarge(data, to) { return transfers.send(data, to); }
export function receiveLarge(kind, admit) {
  largeAdmissions.set(kind, admit);
  return () => { if (largeAdmissions.get(kind) === admit) largeAdmissions.delete(kind); };
}

// ---- connection (auto-reconnect with backoff) -----------------------------
let wantConnect = false,
  retryMs = 1000,
  retryTimer = null;
let watchedCodes = [];

export function setWatchedCodes(codes) {
  watchedCodes = [...new Set((codes || []).map((c) => String(c || "").toUpperCase()))]
    .filter((c) => /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(c))
    .slice(0, 200);
  if (NET.connected) send({ t: "watch", codes: watchedCodes });
}

export function connect() {
  wantConnect = true;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (NET.ws && (NET.ws.readyState === 0 || NET.ws.readyState === 1)) return;
  let ws;
  try {
    ws = new WebSocket(serverURL());
  } catch (e) {
    scheduleRetry();
    return;
  }
  NET.ws = ws;
  ws.onopen = () => {
    retryMs = 1000;
    NET.connected = true;
    send({ t: "hello", code: NET.code, name: NET.name, token: NET.token });
    // (re)enter whichever room we were in — home by default
    send({ t: "join", room: NET.room || myRoom() });
    send({ t: "watch", codes: watchedCodes });
    emit("status", true);
  };
  ws.onclose = () => {
    const was = NET.connected;
    NET.connected = false;
    NET.joined = false;
    transfers.reset();
    NET.admissions = Object.create(null);
    NET.knocks = Object.create(null);
    emit("knocks");
    NET.peers = {};
    NET.roster = [];
    if (was) {
      emit("status", false);
      emit("room");
      emit("roster");
    }
    closeAllVoice();
    if (wantConnect) scheduleRetry();
  };
  ws.onerror = () => {}; // onclose follows and handles it
  ws.onmessage = (ev) => {
    let m;
    try {
      m = JSON.parse(ev.data);
    } catch (_) {
      return;
    }
    handle(m);
  };
}
export function disconnect() {
  wantConnect = false;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (NET.ws) NET.ws.close();
}
function scheduleRetry() {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (wantConnect) connect();
  }, retryMs);
  retryMs = Math.min(retryMs * 1.6, 15000);
}

function send(obj) {
  if (NET.ws && NET.ws.readyState === 1) {
    try {
      NET.ws.send(JSON.stringify(obj));
      return true;
    } catch (_) {}
  }
  return false;
}

// ---- rooms ----------------------------------------------------------------
export function joinRoom(room) {
  NET.room = room;
  NET.joined = false;
  transfers.reset();
  NET.peers = {};
  closeAllVoice(); // per-room mesh; the new room re-establishes it
  send({ t: "join", room });
  emit("room");
}
export function goHomeRoom() {
  joinRoom(myRoom());
}

// ---- app-level payloads ---------------------------------------------------
export function sendData(data, to) {
  return send(to ? { t: "msg", to, data } : { t: "msg", data });
}
export function sendChat(text) {
  // Strip control chars; UI still escapes on render — this is depth-in-depth.
  text = String(text || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 2000);
  if (!text) return false;
  return sendData({ k: "chat", text });
}
// pose broadcast throttled to ~12 Hz — walk:look fires per-frame while moving
let lastPoseAt = 0,
  lastPoseJSON = "";
export function sendPose(pose) {
  const now = performance.now();
  const j = pose ? JSON.stringify(pose) : "";
  if (j === lastPoseJSON) return;
  if (pose && now - lastPoseAt < 80) return;
  lastPoseAt = now;
  lastPoseJSON = j;
  sendData(pose ? { k: "pose", p: pose } : { k: "nopose" });
}

function handle(m) {
  switch (m.t) {
    case "knock":
      NET.knocks[m.code] = { code: m.code, name: cleanName(m.name) };
      emit("knocks");
      break;
    case "pending":
    case "denied":
      if (m.room !== (NET.room || myRoom())) break;
      NET.joined = false;
      transfers.reset();
      NET.peers = {};
      closeAllVoice();
      emit("room");
      emit(m.t, { room: m.room });
      break;
    case "admitted":
      if (m.room !== (NET.room || myRoom())) break;
      NET.joined = true;
      emit("admitted", { room: m.room });
      break;
    case "error":
      if (m.code === "identity_in_use" || m.code === "bad_identity") {
        const derived = codeFor(NET.token);
        if (NET.code !== derived) {
          const from = NET.code;
          NET.code = derived;
          if (NET.room === "apt:" + from) NET.room = myRoom();
          try {
            localStorage.setItem(LS_TOKEN, NET.token);
            localStorage.setItem(LS_ID, NET.code);
          } catch (_) {}
          emit("identity-changed", { from, to: derived });
          // onclose retries with the derived identity. Another rejection then
          // takes the terminal path below, so migration cannot loop.
          if (NET.ws) NET.ws.close();
          break;
        }
        wantConnect = false;
        emit("server-error", m.code);
      }
      break;
    case "roster":
      NET.roster = (m.users || []).map((u) => ({
        ...u,
        name: cleanName(u && u.name),
      }));
      // refresh my in-room peer table from the roster (names may change)
      NET.peers = {};
      NET.roster.forEach((u) => {
        if (NET.joined && u.room === (NET.room || myRoom()) && u.code !== NET.code)
          NET.peers[u.code] = { name: u.name };
      });
      emit("roster");
      emit("room");
      break;
    case "joined":
      if (NET.joined && m.room === (NET.room || myRoom()) && m.code !== NET.code) {
        const name = cleanName(m.name);
        NET.peers[m.code] = { name };
        emit("peer-join", { code: m.code, name });
        emit("room");
      }
      break;
    case "left":
      transfers.dropPeer(m.code);
      if (NET.peers[m.code]) {
        const name = NET.peers[m.code].name;
        delete NET.peers[m.code];
        closeVoicePeer(m.code);
        emit("peer-leave", { code: m.code, name });
        emit("room");
      }
      break;
    case "msg": {
      const d = m.data || {};
      if (transfers.receive(m.from, d)) break;
      if (d.k === "chat") {
        const text = String(d.text || "")
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
          .slice(0, 2000);
        if (text)
          emit("chat", { from: m.from, name: peerName(m.from), text });
      } else if (d.k === "pose") emit("pose", { from: m.from, pose: d.p });
      else if (d.k === "nopose") emit("pose", { from: m.from, pose: null });
      else if (d.k === "rtc") {
        if (acceptRemote("rtc", m.from, remoteContext())) handleRTC(m.from, d);
      }
      else emit("data", { from: m.from, data: d });
      break;
    }
  }
}
export function peerName(code) {
  if (code === NET.code) return NET.name || code;
  const p = NET.peers[code];
  if (p && p.name) return cleanName(p.name) || code;
  const u = NET.roster.find((u) => u.code === code);
  return cleanName(u && u.name) || code;
}

// ---- voice (WebRTC audio mesh, relay = signaling) -------------------------
// Toggling the mic ON creates/renews a connection to every room peer with the
// local mic attached; peers answer (attaching their own mic if they have voice
// on). Track playback is handled by ui_chat.js via the 'voice-track' event.
const RTC_CFG = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
let micStream = null;
const rtc = {}; // code -> RTCPeerConnection

export function voiceOn() {
  return !!micStream;
}
export async function startVoice() {
  if (micStream) return true;
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    emit("voice-error", e);
    return false;
  }
  emit("voice-state");
  // (re)offer to everyone in the room with the mic attached
  Object.keys(NET.peers).forEach((code) => makeOffer(code));
  return true;
}
export function stopVoice() {
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  // drop the mesh entirely; peers that still talk re-offer and we answer recv-only
  closeAllVoice();
  emit("voice-state");
}
function pc(code) {
  if (rtc[code]) return rtc[code];
  const c = new RTCPeerConnection(RTC_CFG);
  rtc[code] = c;
  c.onicecandidate = (e) => {
    if (e.candidate) sendData({ k: "rtc", ice: e.candidate }, code);
  };
  c.ontrack = (e) => emit("voice-track", { code, stream: e.streams[0] });
  c.onconnectionstatechange = () => {
    if (c.connectionState === "failed" || c.connectionState === "closed")
      closeVoicePeer(code);
  };
  return c;
}
async function makeOffer(code) {
  closeVoicePeer(code); // fresh negotiation each time keeps state simple
  const c = pc(code);
  if (micStream) micStream.getTracks().forEach((t) => c.addTrack(t, micStream));
  try {
    const offer = await c.createOffer({ offerToReceiveAudio: true });
    await c.setLocalDescription(offer);
    sendData({ k: "rtc", sdp: c.localDescription }, code);
  } catch (e) {
    console.warn("voice offer failed", e);
  }
}
async function handleRTC(from, d) {
  try {
    if (d.sdp && d.sdp.type === "offer") {
      closeVoicePeer(from);
      const c = pc(from);
      if (micStream)
        micStream.getTracks().forEach((t) => c.addTrack(t, micStream));
      await c.setRemoteDescription(d.sdp);
      const ans = await c.createAnswer();
      await c.setLocalDescription(ans);
      sendData({ k: "rtc", sdp: c.localDescription }, from);
    } else if (d.sdp && d.sdp.type === "answer") {
      if (rtc[from]) await rtc[from].setRemoteDescription(d.sdp);
    } else if (d.ice) {
      if (rtc[from]) await rtc[from].addIceCandidate(d.ice);
    }
  } catch (e) {
    console.warn("rtc signal failed", e);
  }
}
function closeVoicePeer(code) {
  if (rtc[code]) {
    try {
      rtc[code].close();
    } catch (_) {}
    delete rtc[code];
    emit("voice-track", { code, stream: null });
  }
}
function closeAllVoice() {
  Object.keys(rtc).forEach(closeVoicePeer);
}
