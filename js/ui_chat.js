// Chat dock — realtime text + voice with everyone in my current room.
// DOM is built here; realtime transport lives in js/net.js.
import { t } from "./i18n.js";
import { flash } from "./ui.js";
import * as net from "./net.js";
import { VISIT } from "./visit.js";
import { escapeHTML } from "./safe.js";

let dock, msgsEl, inputEl, micBtn, titleEl, peersEl;
let unread = 0;
const audioEls = {}; // peer code -> <audio> playing their mic

export function chatOpen() {
  return dock && dock.classList.contains("on");
}
export function openChat() {
  if (!dock) return;
  dock.classList.add("on");
  unread = 0;
  syncBadge();
  inputEl.focus();
}
export function closeChat() {
  if (dock) dock.classList.remove("on");
}
export function toggleChat() {
  chatOpen() ? closeChat() : openChat();
}

function syncBadge() {
  const b = document.getElementById("friendsBadge");
  if (!b) return;
  b.textContent = unread > 9 ? "9+" : String(unread);
  b.style.display = unread > 0 ? "flex" : "none";
}

function addLine(html, cls) {
  const el = document.createElement("div");
  el.className = "chat-line " + (cls || "");
  el.innerHTML = html;
  msgsEl.appendChild(el);
  while (msgsEl.children.length > 200) msgsEl.firstChild.remove();
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function addMsg(name, text, mine) {
  // name + text come from peers/self; always escape before innerHTML.
  addLine(
    '<span class="chat-name">' + escapeHTML(name) + "</span>" + escapeHTML(text),
    mine ? "chat-mine" : "",
  );
}
function addSys(text) {
  addLine(escapeHTML(text), "chat-sys");
}

function syncHeader() {
  if (!titleEl) return;
  titleEl.textContent = VISIT.friend
    ? t("ch_at", { name: VISIT.friend.name })
    : t("ch_home");
  const names = Object.keys(net.NET.peers).map((c) => net.peerName(c));
  peersEl.textContent = names.length
    ? names.join(", ")
    : net.NET.connected
      ? t("ch_alone")
      : t("ch_offline");
}

function sendCurrent() {
  const text = inputEl.value.trim();
  if (!text) return;
  if (!net.NET.connected) {
    flash(t("ch_offline"), "error");
    return;
  }
  if (net.sendChat(text)) {
    addMsg(net.NET.name || t("fr_me"), text, true);
    inputEl.value = "";
  }
}

async function toggleMic() {
  if (net.voiceOn()) {
    net.stopVoice();
  } else {
    if (!net.NET.connected) {
      flash(t("ch_offline"), "error");
      return;
    }
    const ok = await net.startVoice();
    if (ok) flash(t("ch_micOn"), "success");
  }
  micBtn.classList.toggle("active", net.voiceOn());
  micBtn.innerHTML = net.voiceOn()
    ? '<i class="ph ph-microphone"></i>'
    : '<i class="ph ph-microphone-slash"></i>';
}

export function initChat() {
  dock = document.createElement("div");
  dock.id = "chat-dock";
  dock.innerHTML =
    '<div class="chat-head">' +
    '<div class="chat-titles"><span id="chatTitle"></span><span id="chatPeers" class="t"></span></div>' +
    '<button id="chatMic" title="Voice" aria-label="Toggle Voice"><i class="ph ph-microphone-slash"></i></button>' +
    '<button id="chatClose" title="Close" aria-label="Close Chat"><i class="ph ph-x"></i></button>' +
    "</div>" +
    '<div id="chatMsgs"></div>' +
    '<div class="chat-inrow"><input id="chatInput" type="text" maxlength="500" aria-label="Chat message"/>' +
    '<button id="chatSend" title="Send" aria-label="Send message"><i class="ph ph-paper-plane-right"></i></button></div>';
  document.body.appendChild(dock);
  msgsEl = dock.querySelector("#chatMsgs");
  inputEl = dock.querySelector("#chatInput");
  micBtn = dock.querySelector("#chatMic");
  titleEl = dock.querySelector("#chatTitle");
  peersEl = dock.querySelector("#chatPeers");
  inputEl.placeholder = t("ch_ph");
  dock.querySelector("#chatClose").addEventListener("click", closeChat);
  dock.querySelector("#chatSend").addEventListener("click", sendCurrent);
  micBtn.addEventListener("click", toggleMic);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendCurrent();
    e.stopPropagation(); // don't trigger walk-mode/global hotkeys while typing
  });

  net.on("chat", ({ name, text }) => {
    addMsg(name, text, false);
    if (!chatOpen()) {
      unread++;
      syncBadge();
      flash(name + ": " + text.slice(0, 60));
    }
  });
  net.on("peer-join", ({ code, name }) => {
    addSys(t("ch_joined", { name: name || code }));
    syncHeader();
  });
  net.on("peer-leave", ({ name, code }) => {
    addSys(t("ch_left", { name: name || code }));
    syncHeader();
  });
  net.on("room", syncHeader);
  net.on("status", syncHeader);
  window.addEventListener("visit:change", syncHeader);

  // voice playback: one hidden autoplaying <audio> per speaking peer
  net.on("voice-track", ({ code, stream }) => {
    if (!stream) {
      if (audioEls[code]) {
        audioEls[code].srcObject = null;
        audioEls[code].remove();
        delete audioEls[code];
      }
      return;
    }
    let a = audioEls[code];
    if (!a) {
      a = document.createElement("audio");
      a.autoplay = true;
      a.style.display = "none";
      document.body.appendChild(a);
      audioEls[code] = a;
    }
    a.srcObject = stream;
    a.play().catch(() => {});
  });
  net.on("voice-error", () => flash(t("ch_micFail"), "error"));

  syncHeader();
}
