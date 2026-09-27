// Friends & multiplayer panel — the DOM for js/friends.js + js/net.js.
// Lives as a collapsible section in the left sidebar (same pattern as the
// site panel), plus the topbar Friends button with the unread-chat badge.
import { t, getLang, onLangChange } from "./i18n.js";
import { openPanelPop } from "./history_pop.js";
import { flash, openModal } from "./ui.js";
import { geocodeSuggest } from "./site.js";
import * as net from "./net.js";
import {
  FRIENDS,
  addFriend,
  updateFriend,
  removeFriend,
} from "./friends.js";
import { startVisit, goHome, isVisiting, VISIT, initVisit } from "./visit.js";
import { initChat, openChat } from "./ui_chat.js";
import { initPlayers } from "./players.js";

var racePromise = null;
function loadRace() {
  if (!racePromise) racePromise = import("./race.js");
  return racePromise;
}
var drivePromise = null;
function loadDrive() {
  if (!drivePromise) drivePromise = import("./drive.js");
  return drivePromise;
}

function $(id) {
  return document.getElementById(id);
}

let listEl, statusDot, visitBanner;

function isOnline(code) {
  return !!code && net.NET.roster.some((u) => u.code === code);
}
function syncWatchedFriends() {
  net.setWatchedCodes(FRIENDS.map((f) => f.code));
}

// ---- panel -----------------------------------------------------------------
function buildPanel() {
  const sec = document.querySelector(".friends-section");
  if (!sec) return;
  sec.innerHTML =
    "<h3>" + t("fr_title") + "</h3>" +
    // my identity
    '<div class="fr-row"><input id="fr_myname" type="text" maxlength="24" placeholder="' +
    t("fr_myname_ph") + '"/></div>' +
    '<div class="fr-row fr-code-row"><span class="t">' + t("fr_mycode") +
    '</span><code id="fr_mycode"></code>' +
    '<button id="fr_copy" title="' + t("fr_copy") + '"><i class="ph ph-copy"></i></button></div>' +
    // relay server
    '<div class="fr-row"><input id="fr_server" type="text" placeholder="ws://host:8765"/>' +
    '<button id="fr_connect"><span id="fr_dot" class="fr-dot"></span><span id="fr_connlbl"></span></button></div>' +
    '<span class="t fr-hint">' + t("fr_server_hint") + "</span>" +
    // races & missions
    '<button id="fr_race" class="fr-race-btn"><i class="ph ph-flag-checkered"></i> ' +
    t("rc_title") + "</button>" +
    // visiting banner
    '<div id="fr_banner" style="display:none" class="fr-banner"><span></span>' +
    '<button id="fr_gohome"><i class="ph ph-house"></i> ' + t("fr_goHome") + "</button></div>" +
    // list + add
    '<div id="fr_list"></div>' +
    '<button id="fr_add" style="width:100%"><i class="ph ph-user-plus"></i> ' +
    t("fr_add") + "</button>" +
    '<span class="t fr-hint">' + t("fr_share_hint") + "</span>";

  const h = sec.querySelector("h3");
  if (h) {
    h.addEventListener("click", function () {
      sec.classList.toggle("collapsed");
    });
  }

  listEl = $("fr_list");
  statusDot = $("fr_dot");
  visitBanner = $("fr_banner");

  const nameIn = $("fr_myname");
  nameIn.value = net.NET.name;
  nameIn.addEventListener("change", () => {
    net.setMyName(nameIn.value);
    flash(t("fr_nameSaved"), "success");
  });
  $("fr_mycode").textContent = net.NET.code;
  $("fr_copy").addEventListener("click", () => {
    navigator.clipboard
      .writeText(net.NET.code)
      .then(() => flash(t("fr_copied"), "success"))
      .catch(() => {});
  });
  const srvIn = $("fr_server");
  srvIn.value = net.serverURL();
  srvIn.addEventListener("change", () => net.setServerURL(srvIn.value));
  $("fr_connect").addEventListener("click", () => {
    if (net.NET.connected) net.disconnect();
    else {
      net.setServerURL(srvIn.value);
      net.connect();
      flash(t("fr_connecting"));
    }
    syncStatus();
  });
  $("fr_add").addEventListener("click", () => friendModal(null));
  $("fr_race").addEventListener("click", async () =>
    (await loadRace()).openRaceModal(),
  );
  $("fr_gohome").addEventListener("click", goHome);

  syncStatus();
  syncWatchedFriends();
  renderList();
  syncBanner();
}

function syncStatus() {
  if (!statusDot) return;
  statusDot.classList.toggle("on", net.NET.connected);
  $("fr_connlbl").textContent = net.NET.connected
    ? t("fr_disconnect")
    : t("fr_connect");
}

function syncBanner() {
  if (!visitBanner) return;
  if (isVisiting()) {
    visitBanner.style.display = "flex";
    visitBanner.querySelector("span").textContent = t("fr_visiting", {
      name: VISIT.friend.name,
    });
  } else visitBanner.style.display = "none";
}

function renderList() {
  if (!listEl) return;
  listEl.innerHTML = "";
  if (!FRIENDS.length) {
    listEl.innerHTML = '<span class="t fr-hint">' + t("fr_empty") + "</span>";
    return;
  }
  FRIENDS.forEach((f) => {
    const card = document.createElement("div");
    card.className = "fr-card";
    const on = isOnline(f.code);
    card.innerHTML =
      '<div class="fr-card-top"><span class="fr-dot' + (on ? " on" : "") +
      '" title="' + t(on ? "fr_online" : "fr_offline") + '"></span>' +
      '<b></b><span class="fr-card-actions">' +
      '<button data-a="edit" title="' + t("fr_edit") + '"><i class="ph ph-pencil-simple"></i></button>' +
      '<button data-a="del" title="' + t("fr_delete") + '"><i class="ph ph-trash"></i></button>' +
      "</span></div>" +
      '<span class="t fr-addr"></span>' +
      '<div class="fr-card-btns">' +
      '<button data-a="drive"' + (f.lat == null ? " disabled" : "") + '><i class="ph ph-car"></i> ' + t("fr_drive") + "</button>" +
      '<button data-a="visit"><i class="ph ph-door-open"></i> ' + t("fr_visit") + "</button>" +
      '<button data-a="chat"><i class="ph ph-chat-circle-text"></i> ' + t("fr_chat") + "</button>" +
      "</div>";
    card.querySelector("b").textContent = f.name;
    card.querySelector(".fr-addr").textContent =
      (f.address || t("fr_noAddr")) + (f.model ? " · 🏠" : "");
    card.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const a = b.dataset.a;
      if (a === "edit") friendModal(f);
      else if (a === "del") {
        removeFriend(f.id);
        syncWatchedFriends();
        renderList();
      } else if (a === "drive") {
        const drive = await loadDrive();
        if (drive.isDriving()) return;
        if (!drive.startDrive(f, (fr) => startVisit(fr))) flash(t("fr_noAddr"), "error");
      } else if (a === "visit") startVisit(f);
      else if (a === "chat") openChat();
    });
    listEl.appendChild(card);
  });
}

// ---- add / edit modal ------------------------------------------------------
function friendModal(existing) {
  const dlg = openModal(existing ? t("fr_editTitle") : t("fr_addTitle"));
  const b = dlg.body;
  b.innerHTML =
    '<input id="frm_name" type="text" maxlength="40" placeholder="' + t("fr_name_ph") + '"/>' +
    '<input id="frm_code" type="text" maxlength="16" placeholder="' + t("fr_code_ph") + '"/>' +
    '<div style="position:relative">' +
    '<input id="frm_addr" type="text" placeholder="' + t("fr_addr_ph") + '"/>' +
    '<div id="frm_sug" class="fr-suggest"></div></div>' +
    '<label style="display:flex;gap:6px;align-items:center"><span class="t">' + t("site_floor") +
    '</span><input id="frm_floor" type="number" min="0" max="60" value="0" style="width:60px"/></label>' +
    '<div class="fr-row"><button id="frm_model"><i class="ph ph-upload-simple"></i> ' + t("fr_model_load") +
    '</button><span id="frm_model_lbl" class="t"></span></div>' +
    '<input id="frm_file" type="file" accept=".json,application/json" style="display:none"/>';

  const st = {
    lat: existing ? existing.lat : null,
    lon: existing ? existing.lon : null,
    address: existing ? existing.address : "",
    model: existing ? existing.model : null,
  };
  const nameIn = b.querySelector("#frm_name"),
    codeIn = b.querySelector("#frm_code"),
    addrIn = b.querySelector("#frm_addr"),
    floorIn = b.querySelector("#frm_floor"),
    sugEl = b.querySelector("#frm_sug"),
    fileIn = b.querySelector("#frm_file"),
    modelLbl = b.querySelector("#frm_model_lbl");
  if (existing) {
    nameIn.value = existing.name;
    codeIn.value = existing.code || "";
    addrIn.value = existing.address || "";
    floorIn.value = existing.floor || 0;
  }
  modelLbl.textContent = st.model ? t("fr_model_ok") : t("fr_model_none");

  // address autocomplete (same providers as the site panel)
  let debT = null,
    seq = 0;
  addrIn.addEventListener("input", () => {
    st.lat = st.lon = null; // typing invalidates the picked point
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
          st.lat = c.lat;
          st.lon = c.lon;
          st.address = c.label;
          addrIn.value = c.label;
          sugEl.innerHTML = "";
        });
        sugEl.appendChild(it);
      });
    }, 350);
  });

  b.querySelector("#frm_model").addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", () => {
    const file = fileIn.files && fileIn.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        if (!j || !Array.isArray(j.walls)) throw 0;
        st.model = j;
        modelLbl.textContent = t("fr_model_ok") + " · " + file.name;
      } catch (_) {
        flash(t("f_loadFail"), "error");
      }
    };
    rd.readAsText(file);
  });

  const cancel = document.createElement("button");
  cancel.textContent = t("cancel");
  cancel.onclick = dlg.close;
  const save = document.createElement("button");
  save.className = "btn-accent";
  save.textContent = t("fr_save");
  save.onclick = async () => {
    const name = nameIn.value.trim();
    if (!name) {
      nameIn.focus();
      return;
    }
    // typed an address but didn't pick a suggestion → resolve it now
    if (addrIn.value.trim() && st.lat == null) {
      const list = await geocodeSuggest(addrIn.value.trim(), 1, getLang());
      if (list.length) {
        st.lat = list[0].lat;
        st.lon = list[0].lon;
        st.address = list[0].label;
      }
    }
    const data = {
      name,
      code: codeIn.value.trim().toUpperCase(),
      address: st.address || addrIn.value.trim(),
      lat: st.lat,
      lon: st.lon,
      floor: parseInt(floorIn.value, 10) || 0,
      model: st.model,
    };
    if (existing) updateFriend(existing.id, data);
    else addFriend(data);
    syncWatchedFriends();
    dlg.close();
    renderList();
    flash(t("fr_saved"), "success");
  };
  dlg.actions.appendChild(cancel);
  dlg.actions.appendChild(save);
  nameIn.focus();
}

// ---- boot ------------------------------------------------------------------
export function initFriends() {
  initChat();
  initPlayers();
  initVisit();
  buildPanel();

  const tbBtn = $("friendsBtn");
  if (tbBtn)
    tbBtn.addEventListener("click", () => {
      const sec = document.querySelector(".friends-section");
      if (sec) sec.classList.remove("collapsed");
      /* On a phone or a fold the inspector hides this section, so the list
         was out of reach: it opens as a sheet of its own there instead. */
      if (sec && document.body.classList.contains("compact-nav")) {
        openPanelPop(sec, t("fr_title"));
        return;
      }
      openChat();
    });

  net.on("status", () => {
    syncStatus();
    renderList();
  });
  net.on("roster", renderList);
  // Race/drive code is large; load it only for an actual invite or user action.
  net.on("data", (message) => {
    const k = message && message.data && message.data.k;
    if (k === "race_inv" || k === "race_go")
      loadRace().then((race) => race.handleRaceMessage(message));
  });
  net.on("server-error", () => {
    flash(
      getLang() === "en"
        ? "Relay identity rejected. Reset the relay identity file only if this code was intentionally reclaimed."
        : "זהות המשתמש נדחתה בשרת. אפסו את קובץ הזהויות רק אם הקוד נתבע מחדש בכוונה.",
      "error",
    );
    syncStatus();
  });
  window.addEventListener("visit:change", () => {
    syncBanner();
    renderList();
  });
  onLangChange(buildPanel);

  // auto-connect when the page is served by the relay itself; a file:// open
  // waits for an explicit connect so it doesn't ping a server that isn't there
  if (location.protocol === "http:" || location.protocol === "https:")
    net.connect();
}
