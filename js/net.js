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

// SHA-256 stays synchronous even on LAN HTTP/file origins without Web Crypto.
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function rotateRight(x, n) {
  return (x >>> n) | (x << (32 - n));
}
function sha256(token) {
  const input = new TextEncoder().encode(token);
  const bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(bytes.length - 8, Math.floor(input.length / 0x20000000));
  view.setUint32(bytes.length - 4, input.length * 8);
  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15], y = words[i - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[i] = words[i - 16] + s0 + words[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const t1 = (h + s1 + ((e & f) ^ (~e & g)) + SHA256_K[i] + words[i]) | 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const t2 = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, h].forEach((word, i) => { hash[i] += word; });
  }
  const digest = new Uint8Array(32);
  const output = new DataView(digest.buffer);
  hash.forEach((word, i) => output.setUint32(i * 4, word));
  return digest;
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
