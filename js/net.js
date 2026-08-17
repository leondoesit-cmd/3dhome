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

import { sanitizeDisplayName } from "./safe.js";

const LS_ID = "home3d_mp_id",
  LS_TOKEN = "home3d_mp_token",
  LS_NAME = "home3d_mp_name",
  LS_URL = "home3d_mp_url";

function cleanName(n) {
  return sanitizeDisplayName(n, 24);
}

function randCode() {
  // short, human-shareable friend code (no confusable 0/O/1/I)
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)];
  return s.slice(0, 4) + "-" + s.slice(4);
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
};

try {
  NET.code = localStorage.getItem(LS_ID);
  if (!NET.code) {
    NET.code = randCode();
    localStorage.setItem(LS_ID, NET.code);
  }
  NET.token = localStorage.getItem(LS_TOKEN);
  if (!NET.token) {
    NET.token = randToken();
    localStorage.setItem(LS_TOKEN, NET.token);
  }
  NET.name = cleanName(localStorage.getItem(LS_NAME) || "");
} catch (_) {
  NET.code = NET.code || randCode();
  NET.token = NET.token || randToken();
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
//         peer-leave({code,name}), voice-state
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
    case "error":
      if (m.code === "identity_in_use" || m.code === "bad_identity") {
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
        if (u.room === (NET.room || myRoom()) && u.code !== NET.code)
          NET.peers[u.code] = { name: u.name };
      });
      emit("roster");
      emit("room");
      break;
    case "joined":
      if (m.code !== NET.code) {
        const name = cleanName(m.name);
        NET.peers[m.code] = { name };
        emit("peer-join", { code: m.code, name });
        emit("room");
      }
      break;
    case "left":
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
      if (d.k === "chat") {
        const text = String(d.text || "")
          .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
          .slice(0, 2000);
        if (text)
          emit("chat", { from: m.from, name: peerName(m.from), text });
      } else if (d.k === "pose") emit("pose", { from: m.from, pose: d.p });
      else if (d.k === "nopose") emit("pose", { from: m.from, pose: null });
      else if (d.k === "rtc") handleRTC(m.from, d);
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
