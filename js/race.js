// Races & missions — setup UI + multiplayer coordination for js/drive.js.
//
// Solo: pick 2+ points → point-to-point / checkpoint race (time trial with a
// saved local best), or a Crazy-Taxi mission session in a chosen play area.
// Multiplayer: the host broadcasts the definition to everyone in the current
// room; peers join a lobby; the host fires a synchronized 3-2-1 start and
// every client races the same course with live ghost cars + a leaderboard.
//
// Wire protocol (rides net.js sendData, opaque to the relay):
//   {k:'race_inv',  def}          host → room     invitation + full definition
//   {k:'race_join', id}          peer → host     joined the lobby
//   {k:'race_go',   id, players, startAt} host → room  synchronized start
//   {k:'car',       id, x,z,h}    everyone        live pose (drive.js)
//   {k:'race_fin',  id, ms|cash}  everyone        result (drive.js)
import { t, getLang } from "./i18n.js";
import { flash, openModal } from "./ui.js";
import { S } from "./state.js";
import { geocodeSuggest } from "./site.js";
import { FRIENDS } from "./friends.js";
import * as net from "./net.js";
import { startRace, startTaxi, isDriving } from "./drive.js";

function uidRace() {
  return "r" + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
}

export function courseDistanceKm(points) {
  let meters = 0;
  for (let i = 1; i < (points || []).length; i++) {
    const a = points[i - 1], b = points[i];
    const lat = ((a.lat + b.lat) * Math.PI) / 360;
    const dx = (b.lon - a.lon) * 111320 * Math.cos(lat);
    const dy = (b.lat - a.lat) * 111320;
    meters += Math.hypot(dx, dy);
  }
  return meters / 1000;
}

function validRaceDef(def) {
  return !!(
    def && typeof def.id === "string" && def.id.length <= 48 &&
    (def.mode === "race" || def.mode === "taxi") &&
    Array.isArray(def.points) && def.points.length > 0 && def.points.length <= 8 &&
    (def.mode === "taxi" || def.points.length >= 2) &&
    def.points.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
  );
}
function cleanRaceDef(def, host) {
  return {
    id: def.id,
    mode: def.mode,
    host,
    durS: Math.max(60, Math.min(1200, Number(def.durS) || 300)),
    name: String(def.name || "").slice(0, 48),
    points: def.points.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      label: String(p.label || "").slice(0, 100),
    })),
  };
}
function myHomePoint() {
  return S.site && S.site.lat != null
    ? { lat: S.site.lat, lon: S.site.lon, label: t("mr_myHome") }
    : null;
}

// ---- multi-point Leaflet picker -------------------------------------------
// Every click adds a numbered marker; Done returns them in click order.
function openMultiMapPicker(onDone, single) {
  if (typeof L === "undefined") {
    flash(t("site_no_leaflet"), "error");
    return;
  }
  const dlg = openModal(t(single ? "mr_pickArea" : "mr_pickPoints"));
  dlg.overlay.querySelector(".bp-modal").classList.add("race-map-modal");
  dlg.body.innerHTML =
    '<span class="t">' + t(single ? "mr_pickAreaHint" : "mr_pickHint") + "</span>" +
    '<div class="site-map race-map" id="rcMap"></div>' +
    '<div class="race-map-tools"><b id="rcMapSummary"></b><span></span>' +
    '<button type="button" id="rcMapUndo"><i class="ph ph-arrow-counter-clockwise"></i> ' + t("mr_undo") + '</button>' +
    '<button type="button" id="rcMapClear"><i class="ph ph-trash"></i> ' + t("mr_clear") + '</button></div>';
  const mapDiv = dlg.body.querySelector("#rcMap");
  const summary = dlg.body.querySelector("#rcMapSummary");
  const undo = dlg.body.querySelector("#rcMapUndo");
  const clear = dlg.body.querySelector("#rcMapClear");
  const picked = [];
  let map = null, routeLine = null;
  const home = myHomePoint();
  const lat0 = home ? home.lat : 32.0853,
    lon0 = home ? home.lon : 34.7818;
  requestAnimationFrame(() => {
    map = L.map(mapDiv).setView([lat0, lon0], 16);
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 20, attribution: "Esri" },
    ).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      opacity: 0.3,
      attribution: "© OSM",
    }).addTo(map);
    function syncMap() {
      if (routeLine) routeLine.remove();
      routeLine = picked.length > 1
        ? L.polyline(picked.map((p) => [p.lat, p.lon]), {
            color: "#7850ff", weight: 5, opacity: 0.9, dashArray: "10 8",
          }).addTo(map)
        : null;
      picked.forEach((p, i) => p.marker.setIcon(L.divIcon({
        className: "rc-map-pin", html: "<b>" + (i + 1) + "</b>", iconSize: [28, 28],
      })));
      summary.textContent = single
        ? (picked.length ? t("mr_areaReady") : t("mr_needArea"))
        : picked.length + " " + t("mr_pointsN") +
          (picked.length > 1 ? " · " + courseDistanceKm(picked).toFixed(1) + " km" : "");
      undo.disabled = clear.disabled = !picked.length;
    }
    function add(latlng) {
      if (single && picked.length) {
        picked[0].marker.setLatLng(latlng);
        picked[0].lat = latlng.lat;
        picked[0].lon = latlng.lng;
        syncMap();
        return;
      }
      const n = picked.length + 1;
      const marker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({ className: "rc-map-pin", html: "<b>" + n + "</b>", iconSize: [28, 28] }),
      }).addTo(map);
      const point = { lat: latlng.lat, lon: latlng.lng, label: t("mr_point") + " " + n, marker };
      marker.on("drag", () => {
        const ll = marker.getLatLng();
        point.lat = ll.lat; point.lon = ll.lng;
        syncMap();
      });
      picked.push(point);
      syncMap();
    }
    map.on("click", (e) => add(e.latlng));
    undo.onclick = () => {
      const p = picked.pop();
      if (p) p.marker.remove();
      syncMap();
    };
    clear.onclick = () => {
      picked.splice(0).forEach((p) => p.marker.remove());
      syncMap();
    };
    syncMap();
  });
  const cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  const done = document.createElement("button");
  done.className = "btn-accent";
  done.textContent = t("mr_done");
  const close = () => {
    if (map) map.remove();
    dlg.close();
  };
  cancel.onclick = close;
  done.onclick = () => {
    if (!picked.length) {
      flash(t(single ? "mr_needArea" : "mr_needPoints"), "error");
      return;
    }
    close();
    onDone(picked.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label })));
  };
  dlg.actions.appendChild(cancel);
  dlg.actions.appendChild(done);
}

// ---- setup modal -----------------------------------------------------------
export function openRaceModal() {
  if (isDriving()) return;
  const dlg = openModal("🏁 " + t("mr_title"));
  dlg.overlay.querySelector(".bp-modal").classList.add("race-setup-modal");
  const b = dlg.body;
  let mode = "race";
  const points = [];
  const home = myHomePoint();
  if (home) points.push(home);

  b.innerHTML =
    '<div class="rc-modes">' +
    '<button id="rcModeRace" class="on">🏁 ' + t("mr_race") + "</button>" +
    '<button id="rcModeTaxi">🚕 ' + t("tx_title") + "</button></div>" +
    '<span class="t" id="rcModeHint"></span>' +
    '<div id="rcPoints" class="rc-points"></div>' +
    '<div class="rc-addrow">' +
    '<button id="rcAddHome" title="' + t("mr_myHome") + '"><i class="ph ph-house"></i></button>' +
    '<select id="rcAddFriend"><option value="">' + t("mr_friendHome") + "…</option></select>" +
    '<button id="rcAddMap"><i class="ph ph-map-pin"></i> ' + t("mr_map") + "</button></div>" +
    '<div class="race-course-summary"><span id="rcCourseSummary"></span>' +
    '<button type="button" id="rcReverse"><i class="ph ph-arrows-left-right"></i> ' + t("mr_reverse") + '</button></div>' +
    '<div style="position:relative"><input id="rcAddr" type="text" placeholder="' +
    t("fr_addr_ph") + '"/><div id="rcSug" class="fr-suggest"></div></div>' +
    '<div id="rcTaxiOpts" style="display:none"><label style="display:flex;gap:8px;align-items:center">' +
    "<span>" + t("tx_dur") + '</span><select id="rcDur">' +
    '<option value="180">3 min</option><option value="300" selected>5 min</option>' +
    '<option value="600">10 min</option></select></label></div>' +
    '<div id="rcMp" class="rc-mp"><label>' +
    '<input type="checkbox" id="rcMpOn"/> <span></span></label></div>';

  const ptsEl = b.querySelector("#rcPoints"),
    hintEl = b.querySelector("#rcModeHint"),
    taxiOpts = b.querySelector("#rcTaxiOpts"),
    mpBox = b.querySelector("#rcMp"),
    courseSummary = b.querySelector("#rcCourseSummary"),
    reverseBtn = b.querySelector("#rcReverse");

  // friends with a mapped address are one-click checkpoints
  const withAddr = FRIENDS.filter((f) => f.lat != null);
  const frSel = b.querySelector("#rcAddFriend");
  withAddr.forEach((f, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = f.name + " · " + (f.address || "");
    frSel.appendChild(o);
  });

  const peers = Object.keys(net.NET.peers);
  if (net.NET.connected && peers.length) {
    mpBox.querySelector("span").textContent =
      t("mr_invite") + " (" + peers.map((c) => net.peerName(c)).join(", ") + ")";
  } else {
    mpBox.querySelector("input").disabled = true;
    mpBox.classList.add("unavailable");
    mpBox.querySelector("span").textContent = t(net.NET.connected ? "mr_noPlayers" : "mr_offline");
  }

  function syncMode() {
    b.querySelector("#rcModeRace").classList.toggle("on", mode === "race");
    b.querySelector("#rcModeTaxi").classList.toggle("on", mode === "taxi");
    hintEl.textContent = t(mode === "race" ? "mr_raceHint" : "tx_hint");
    taxiOpts.style.display = mode === "taxi" ? "block" : "none";
    renderPoints();
  }
  function renderPoints() {
    ptsEl.innerHTML = "";
    const max = mode === "taxi" ? 1 : 8;
    points.length = Math.min(points.length, max);
    points.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "rc-point";
      row.innerHTML =
        '<span class="rc-num">' + (mode === "taxi" ? "📍" : i + 1) + "</span><span class='rc-lbl'></span>" +
        '<span class="rc-acts">' +
        (i > 0 ? '<button data-a="up"><i class="ph ph-caret-up"></i></button>' : "") +
        '<button data-a="del"><i class="ph ph-x"></i></button></span>';
      row.querySelector(".rc-lbl").textContent = p.label || p.lat.toFixed(4) + ", " + p.lon.toFixed(4);
      row.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        if (btn.dataset.a === "del") points.splice(i, 1);
        else if (btn.dataset.a === "up") {
          const [x] = points.splice(i, 1);
          points.splice(i - 1, 0, x);
        }
        renderPoints();
      });
      ptsEl.appendChild(row);
    });
    if (!points.length)
      ptsEl.innerHTML = '<span class="t">' + t(mode === "taxi" ? "mr_needArea" : "mr_needPoints") + "</span>";
    const km = courseDistanceKm(points);
    courseSummary.textContent = mode === "taxi"
      ? (points.length ? t("mr_areaReady") : "")
      : (points.length > 1 ? points.length + " " + t("mr_pointsN") + " · " + km.toFixed(1) + " km" : "");
    reverseBtn.disabled = mode !== "race" || points.length < 2;
  }
  function addPoint(p) {
    const max = mode === "taxi" ? 1 : 8;
    if (mode === "taxi") points.length = 0;
    if (points.length >= max) {
      flash(t("mr_maxPoints"), "error");
      return;
    }
    points.push(p);
    renderPoints();
  }

  b.querySelector("#rcModeRace").onclick = () => { mode = "race"; syncMode(); };
  b.querySelector("#rcModeTaxi").onclick = () => { mode = "taxi"; syncMode(); };
  b.querySelector("#rcAddHome").onclick = () => {
    const h = myHomePoint();
    if (h) addPoint(h);
    else flash(t("mr_noHome"), "error");
  };
  frSel.onchange = () => {
    const f = withAddr[parseInt(frSel.value, 10)];
    if (f) addPoint({ lat: f.lat, lon: f.lon, label: f.name });
    frSel.value = "";
  };
  b.querySelector("#rcAddMap").onclick = () =>
    openMultiMapPicker((pts) => pts.forEach(addPoint), mode === "taxi");
  reverseBtn.onclick = () => {
    points.reverse();
    renderPoints();
  };

  // address search → suggestion dropdown → checkpoint
  const addrIn = b.querySelector("#rcAddr"),
    sugEl = b.querySelector("#rcSug");
  let debT = null,
    seq = 0;
  addrIn.addEventListener("input", () => {
    clearTimeout(debT);
    const q = addrIn.value.trim();
    if (q.length < 3) {
      sugEl.innerHTML = "";
      return;
    }
    debT = setTimeout(async () => {
      const my = ++seq;
      const list = await geocodeSuggest(q, 5, getLang());
      if (my !== seq) return;
      sugEl.innerHTML = "";
      list.forEach((c) => {
        const it = document.createElement("button");
        it.type = "button";
        it.textContent = c.label;
        it.addEventListener("click", () => {
          addPoint({ lat: c.lat, lon: c.lon, label: c.label });
          addrIn.value = "";
          sugEl.innerHTML = "";
        });
        sugEl.appendChild(it);
      });
    }, 350);
  });

  const cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  cancel.onclick = dlg.close;
  const start = document.createElement("button");
  start.className = "btn-accent";
  start.innerHTML = '<i class="ph ph-flag-checkered"></i> ' + t("mr_start");
  start.onclick = () => {
    const need = mode === "taxi" ? 1 : 2;
    if (points.length < need) {
      flash(t(mode === "taxi" ? "mr_needArea" : "mr_needPoints"), "error");
      return;
    }
    const def = {
      id: uidRace(),
      mode,
      points: points.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label })),
      durS: mode === "taxi" ? parseInt(b.querySelector("#rcDur").value, 10) : 0,
      host: net.NET.code,
    };
    const mp = mpBox.style.display !== "none" && b.querySelector("#rcMpOn").checked;
    dlg.close();
    if (mp) hostLobby(def);
    else launch(def, null);
  };
  dlg.actions.appendChild(cancel);
  dlg.actions.appendChild(start);
  syncMode();
}

// ---- launch ----------------------------------------------------------------
function launch(def, players, startAt) {
  const mp = players
    ? { players, myIndex: Math.max(0, players.indexOf(net.NET.code)), startAt }
    : null;
  const ok = def.mode === "taxi" ? startTaxi(def, mp) : startRace(def, mp);
  if (!ok) flash(t("mr_startFail"), "error");
}

// ---- host lobby ------------------------------------------------------------
function hostLobby(def) {
  net.sendData({ k: "race_inv", def });
  const dlg = openModal("🏁 " + t("mr_lobby"));
  const joined = [net.NET.code];
  dlg.body.innerHTML =
    '<span class="t">' + t("mr_lobbyHint") + '</span><div id="rcLobbyList"></div>';
  const listEl = dlg.body.querySelector("#rcLobbyList");
  function render() {
    // Peer display names are untrusted (relay) — never concatenate into HTML.
    listEl.replaceChildren();
    joined.forEach((c) => {
      const row = document.createElement("div");
      row.className = "rc-point";
      const lbl = document.createElement("span");
      lbl.className = "rc-lbl";
      lbl.textContent =
        c === net.NET.code
          ? (net.NET.name || t("fr_me")) + " 👑"
          : net.peerName(c);
      row.appendChild(lbl);
      listEl.appendChild(row);
    });
  }
  render();
  const unsub = net.on("data", ({ from, data }) => {
    if (data && data.k === "race_join" && data.id === def.id && !joined.includes(from)) {
      joined.push(from);
      render();
      flash(net.peerName(from) + " ✓");
    }
  });
  const cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  cancel.onclick = () => {
    unsub();
    dlg.close();
  };
  const go = document.createElement("button");
  go.className = "btn-accent";
  go.textContent = t("mr_go");
  go.onclick = () => {
    const startAt = Date.now() + 5000;
    unsub();
    dlg.close();
    net.sendData({ k: "race_go", id: def.id, def, players: joined, startAt });
    launch(def, joined, startAt);
  };
  dlg.actions.appendChild(cancel);
  dlg.actions.appendChild(go);
}

// ---- guest side ------------------------------------------------------------
const pendingInv = {}; // id -> def (awaiting race_go after joining)
function onInvite(from, incoming) {
  if (!validRaceDef(incoming)) return;
  const def = cleanRaceDef(incoming, from);
  const dlg = openModal("🏁 " + t("mr_invited", { name: net.peerName(from) }));
  const what =
    (def.mode === "taxi"
      ? "🚕 " + t("tx_title") + " · " + Math.round(def.durS / 60) + " min"
      : "🏁 " + t("mr_race") + " · " + def.points.length + " " + t("mr_pointsN")) +
    (def.points[0].label ? " · " + def.points[0].label : "");
  dlg.body.innerHTML = "<span></span>";
  dlg.body.querySelector("span").textContent = what;
  const no = document.createElement("button");
  no.textContent = t("cancel");
  no.onclick = dlg.close;
  const yes = document.createElement("button");
  yes.className = "btn-accent";
  yes.textContent = t("mr_join");
  yes.onclick = () => {
    dlg.close();
    pendingInv[def.id] = def;
    net.sendData({ k: "race_join", id: def.id }, def.host);
    flash(t("mr_waitingHost"));
  };
  dlg.actions.appendChild(no);
  dlg.actions.appendChild(yes);
}

export function handleRaceMessage({ from, data }) {
    if (!data || typeof data.k !== "string") return;
    if (data.k === "race_inv" && !isDriving()) onInvite(from, data.def);
    else if (data.k === "race_go") {
      // start only if we actually joined this race's lobby
      const def = pendingInv[data.id];
      if (def && from === def.host && Array.isArray(data.players) &&
          data.players.includes(net.NET.code)) {
        delete pendingInv[data.id];
        const startAt = Math.max(Date.now() + 800, Math.min(Date.now() + 30000,
          Number(data.startAt) || Date.now() + 1000));
        launch(def, data.players.slice(0, 12), startAt);
      }
    }
}

var raceInit = false;
export function initRace() {
  if (raceInit) return;
  raceInit = true;
  net.on("data", handleRaceMessage);
}
