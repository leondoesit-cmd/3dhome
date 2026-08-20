// Smart-home dashboard (left "Home" tab) and per-item inspector controls.
import { S, touchItem3D } from "./state.js";
import { t, getLang, onLangChange } from "./i18n.js";
import { flabel } from "./furniture.js";
import { render2D } from "./plan2d.js";
import { flash, openModal } from "./ui.js";
import { fillProps, select } from "./ui_props.js";
import { pushHistory } from "./history.js";
import { markDirty } from "./persist.js";
import { escapeHTML } from "./safe.js";
import {
  addAutomation,
  applyScene,
  bindingFor,
  capability,
  createSceneFromCurrentState,
  deleteAutomation,
  deleteScene,
  devicesByRoom,
  devicePowered,
  ensureSmart,
  ensureSmartHome,
  estimatePowerUsage,
  evaluateAutomations,
  executeParsedCommand,
  isSmartType,
  listDevices,
  onSmartChange,
  parseVoiceCommand,
  roomEnvironment,
  runAutomationAction,
  setBinding,
  smartIcon,
  smartKind,
} from "./smarthome.js";
import {
  autoBindFromHub,
  commandDevice,
  connectHub,
  disconnectHub,
  hubEntities as liveEntities,
  loadCreds,
  pairHue,
  restoreSession,
  saveCreds,
} from "./smarthome_connect.js";

var panelEl = null;
var rec = null;
var lastHourFired = null;
var currentFilter = "all";

export function initSmartHome() {
  panelEl = document.getElementById("smartHomePanel");
  ensureSmartHome();
  if (panelEl) {
    renderPanel();
    onLangChange(renderPanel);
  }
  onSmartChange(function (detail) {
    if (
      (detail && detail.source === "hub") ||
      (detail && detail.source === "poll") ||
      (detail && detail.source === "ws") ||
      (detail && detail.source === "bind") ||
      (detail && detail.source === "scene_create") ||
      (detail && detail.source === "scene_delete") ||
      (detail && detail.source === "automation_add") ||
      (detail && detail.source === "automation_delete")
    ) {
      renderPanel();
      if (S.sel && S.sel.kind === "item") fillItemSmart(S.sel.ref);
      render2D();
    }
    if (detail && detail.source === "device" && detail.item) {
      var fired = evaluateAutomations(ensureSmartHome().automations, {
        hour: Math.round(S.hour),
        item: detail.item,
        device: { kind: smartKind(detail.item), smart: detail.item.smart },
      });
      fired.forEach(function (a) {
        if (a.trigger && a.trigger.type === "deviceKind") runAutomationAction(a.action, S.items);
      });
    }
  });
  try { restoreSession(); } catch (_) {}
  window.__renderSmartHome = renderPanel;
  setInterval(tickHourAutomations, 20000);
  tickHourAutomations();
}

function tickHourAutomations() {
  var hour = Math.round(Number(S.hour) || 0);
  if (hour === lastHourFired) return;
  lastHourFired = hour;
  var fired = evaluateAutomations(ensureSmartHome().automations, { hour: hour });
  fired.forEach(function (a) {
    if (a.trigger && a.trigger.type === "hour") runAutomationAction(a.action, S.items);
  });
  if (fired.length) {
    renderPanel();
    S.dirty3D = true;
    render2D();
  }
}

export function renderPanel() {
  if (!panelEl) return;
  var hub = ensureSmartHome();
  var devices = listDevices();
  var creds = loadCreds();
  panelEl.innerHTML = "";

  panelEl.appendChild(statusCard(hub, devices));
  panelEl.appendChild(energyCard());
  panelEl.appendChild(filterBar());
  panelEl.appendChild(sceneCard(hub));
  panelEl.appendChild(voiceCard());
  panelEl.appendChild(roomsCard(devices, hub));
  panelEl.appendChild(autoCard(hub));
  panelEl.appendChild(connectCard(hub, creds));
}

function el(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function statusCard(hub, devices) {
  var on = devices.filter(function (d) { return d.powered; }).length;
  var bound = devices.filter(function (d) { return d.binding; }).length;
  var connected = hub.status && hub.status.connected;
  var card = el("div", "sh-status " + (connected ? "ok" : "sim"));
  var title = el("div", "sh-status-title");
  title.innerHTML = '<i class="ph ' + (connected ? "ph-wifi-high" : "ph-house") + '"></i> ' +
    escapeHTML(connected ? t("sh_live") : t("sh_sim"));
  card.appendChild(title);
  var meta = el("div", "sh-status-meta");
  meta.textContent = t("sh_counts", { n: devices.length, on: on, bound: bound });
  card.appendChild(meta);
  if (hub.status && hub.status.error) {
    var err = el("div", "sh-error");
    err.textContent = hubError(hub.status.error);
    card.appendChild(err);
  }
  if (connected && hub.status.host) {
    var host = el("div", "sh-host");
    host.textContent = hub.status.host.replace(/^https?:\/\//, "");
    card.appendChild(host);
  }
  return card;
}

function energyCard() {
  var pow = estimatePowerUsage(S.items);
  var box = el("div", "sh-block sh-energy-box");
  var head = el("div", "sh-energy-head");
  head.innerHTML =
    '<div class="sh-sub"><i class="ph ph-lightning"></i> ' + escapeHTML(t("sh_energy")) + '</div>' +
    '<div class="sh-watts-val">' + (pow.totalWatts >= 1000 ? (pow.totalWatts / 1000).toFixed(2) + " kW" : pow.totalWatts + " W") + '</div>';
  box.appendChild(head);

  var bar = el("div", "sh-energy-bar");
  var tot = Math.max(1, pow.totalWatts);
  var segs = [
    { k: "lighting", col: "#f59e0b", w: pow.byCategory.lighting },
    { k: "climate", col: "#06b6d4", w: pow.byCategory.climate },
    { k: "appliances", col: "#3b82f6", w: pow.byCategory.appliances },
    { k: "media", col: "#8b5cf6", w: pow.byCategory.media },
    { k: "other", col: "#64748b", w: pow.byCategory.other },
  ];
  segs.forEach(function (s) {
    if (s.w > 0) {
      var d = document.createElement("div");
      d.style.width = Math.round((s.w / tot) * 100) + "%";
      d.style.backgroundColor = s.col;
      d.title = s.k + ": " + Math.round(s.w) + "W";
      bar.appendChild(d);
    }
  });
  box.appendChild(bar);

  var meta = el("div", "sh-energy-meta");
  meta.textContent = "~" + pow.costMonthly + " ₪/mo · " + pow.kwhDaily + " " + t("sh_kwh_daily");
  box.appendChild(meta);
  return box;
}

function filterBar() {
  var bar = el("div", "sh-filters");
  var filters = [
    { id: "all", label: t("sh_filter_all") },
    { id: "light", label: t("sh_filter_light") },
    { id: "climate", label: t("sh_filter_climate") },
    { id: "sensor", label: t("sh_filter_sensor") },
    { id: "appliance", label: t("sh_filter_appliance") },
    { id: "media", label: t("sh_filter_media") },
    { id: "plug", label: t("sh_filter_plug") },
  ];
  filters.forEach(function (f) {
    var chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sh-chip" + (currentFilter === f.id ? " active" : "");
    chip.textContent = f.label;
    chip.onclick = function () {
      currentFilter = f.id;
      renderPanel();
    };
    bar.appendChild(chip);
  });
  return bar;
}

function connectCard(hub, creds) {
  var wrap = el("details", "sh-connect");
  wrap.open = !(hub.status && hub.status.connected);
  var sum = document.createElement("summary");
  sum.textContent = t("sh_connect");
  wrap.appendChild(sum);

  var proto = el("select", "sh-proto");
  [["ha", t("sh_proto_ha")], ["hue", t("sh_proto_hue")], ["shelly", t("sh_proto_shelly")]].forEach(function (opt) {
    var o = document.createElement("option");
    o.value = opt[0];
    o.textContent = opt[1];
    if ((creds.proto || "ha") === opt[0]) o.selected = true;
    proto.appendChild(o);
  });
  wrap.appendChild(labeled(t("sh_proto"), proto));

  var url = document.createElement("input");
  url.type = "url";
  url.placeholder = "http://homeassistant.local:8123";
  url.value = creds.url || "";
  url.autocomplete = "off";
  wrap.appendChild(labeled(t("sh_url"), url));

  var token = document.createElement("input");
  token.type = "password";
  token.placeholder = t("sh_token_ph");
  token.value = creds.token || "";
  token.autocomplete = "off";
  var tokenRow = labeled(t("sh_token"), token);
  wrap.appendChild(tokenRow);

  var hint = el("div", "sh-hint");
  hint.textContent = t("sh_ha_hint");
  wrap.appendChild(hint);

  function syncFields() {
    var p = proto.value;
    tokenRow.style.display = p === "ha" ? "" : "none";
    hint.textContent = p === "ha" ? t("sh_ha_hint") : p === "hue" ? t("sh_hue_hint") : t("sh_shelly_hint");
    url.placeholder = p === "ha" ? "http://homeassistant.local:8123" : p === "hue" ? "http://192.168.1.2" : "http://192.168.1.50";
  }
  proto.onchange = syncFields;
  syncFields();

  var row = el("div", "sh-btn-row");
  var go = document.createElement("button");
  go.type = "button";
  go.innerHTML = '<i class="ph ph-plugs-connected"></i> ' + t("sh_test");
  go.onclick = async function () {
    saveCreds({ proto: proto.value, url: url.value.trim(), token: token.value.trim() });
    go.disabled = true;
    try {
      var res = await connectHub(loadCreds());
      if (res.ok) {
        flash(t("sh_connected", { n: (res.entities || []).length }), "success");
        var pairs = autoBindFromHub();
        if (pairs.length) flash(t("sh_bound", { n: pairs.length }), "success");
      } else if (res.needsPair) {
        flash(t("sh_err_hue"), "error");
      } else {
        flash(hubError(res.error || ""), "error");
      }
    } finally {
      go.disabled = false;
      renderPanel();
    }
  };
  row.appendChild(go);

  var pair = document.createElement("button");
  pair.type = "button";
  pair.textContent = t("sh_hue_pair");
  pair.onclick = async function () {
    pair.disabled = true;
    try {
      var res = await pairHue(url.value.trim());
      if (res.ok) {
        flash(t("sh_hue_paired"), "success");
        proto.value = "hue";
        await connectHub(loadCreds());
      } else flash(hubError(res.error || ""), "error");
    } finally {
      pair.disabled = false;
      renderPanel();
    }
  };
  row.appendChild(pair);

  var off = document.createElement("button");
  off.type = "button";
  off.textContent = t("sh_disconnect");
  off.onclick = function () {
    disconnectHub();
    renderPanel();
  };
  row.appendChild(off);
  wrap.appendChild(row);
  return wrap;
}

function hubError(code) {
  if (code === "unauthorized") return t("sh_err_auth");
  if (code === "hue_button" || code === "hue_pair") return t("sh_err_hue");
  if (code === "missing url or token") return t("sh_err_missing");
  return t("sh_err_reach");
}

function labeled(text, control) {
  var lab = document.createElement("label");
  lab.className = "sh-field";
  var span = document.createElement("span");
  span.textContent = text;
  lab.appendChild(span);
  lab.appendChild(control);
  return lab;
}

function sceneCard(hub) {
  var box = el("div", "sh-block");
  var head = el("div", "sh-head-row");
  head.appendChild(el("div", "sh-sub", escapeHTML(t("sh_scenes"))));
  var addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "sh-link-btn";
  addBtn.innerHTML = '<i class="ph ph-plus-circle"></i> ' + escapeHTML(t("sh_scene_new"));
  addBtn.onclick = openCaptureSceneModal;
  head.appendChild(addBtn);
  box.appendChild(head);

  var grid = el("div", "sh-scenes");
  (hub.scenes || []).forEach(function (sc) {
    var b = document.createElement("div");
    b.className = "sh-scene-wrap";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sh-scene";
    btn.innerHTML = '<i class="ph ' + sceneIcon(sc) + '"></i><span>' + escapeHTML(sceneName(sc)) + "</span>";
    btn.onclick = function () {
      pushHistory();
      applyScene(sc, S.items, { source: "ui" });
      pushBoundScene(sc);
      S.dirty3D = true;
      (S.items || []).forEach(function (it) { if (isSmartType(it.type)) touchItem3D(it, "build"); });
      markDirty();
      render2D();
      fillProps();
      renderPanel();
      flash(t("sh_scene_applied", { name: sceneName(sc) }), "success");
    };
    b.appendChild(btn);

    if (!sc.builtin) {
      var del = document.createElement("button");
      del.type = "button";
      del.className = "sh-del-icon";
      del.title = t("sh_scene_deleted");
      del.innerHTML = '<i class="ph ph-trash"></i>';
      del.onclick = function (ev) {
        ev.stopPropagation();
        deleteScene(sc.id);
        markDirty();
        renderPanel();
        flash(t("sh_scene_deleted"), "success");
      };
      b.appendChild(del);
    }
    grid.appendChild(b);
  });
  box.appendChild(grid);
  return box;
}

function sceneIcon(sc) {
  var id = sc && sc.id;
  if (sc && sc.icon) return sc.icon;
  return ({
    morning: "ph-sun-horizon",
    away: "ph-door",
    movie: "ph-film-slate",
    night: "ph-moon",
    dinner: "ph-fork-knife",
    eco: "ph-leaf",
  })[id] || "ph-sparkle";
}

function sceneName(sc) {
  return sc.name || t("sh_scene_" + sc.id) || sc.id;
}

function pushBoundScene(sc) {
  (S.items || []).forEach(function (it) {
    if (!isSmartType(it.type) || !bindingFor(it.id)) return;
    commandDevice(it, it.smart, { source: "scene" });
  });
}

function openCaptureSceneModal() {
  var dlg = openModal(t("sh_scene_new"));
  var nameInp = document.createElement("input");
  nameInp.type = "text";
  nameInp.placeholder = t("sh_scene_name_ph");
  nameInp.value = t("sh_scene_new");
  dlg.body.appendChild(labeled(t("sh_scene_name_ph"), nameInp));

  var iconSel = document.createElement("select");
  [
    ["ph-sparkle", "✨ Sparkle"],
    ["ph-sun", "☀️ Sun"],
    ["ph-moon", "🌙 Moon"],
    ["ph-film-slate", "🎬 Cinema"],
    ["ph-leaf", "🍃 Eco"],
    ["ph-heart", "❤️ Romance"],
    ["ph-music-notes", "🎵 Music"],
    ["ph-flame", "🔥 Warm"],
  ].forEach(function (opt) {
    var o = document.createElement("option");
    o.value = opt[0];
    o.textContent = opt[1];
    iconSel.appendChild(o);
  });
  dlg.body.appendChild(labeled("Icon", iconSel));

  var saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-accent";
  saveBtn.textContent = t("sh_scene_new");
  saveBtn.onclick = function () {
    var name = nameInp.value.trim() || "Custom Scene";
    var icon = iconSel.value;
    createSceneFromCurrentState(name, icon);
    markDirty();
    dlg.close();
    renderPanel();
    flash(t("sh_scene_created", { name: name }), "success");
  };
  dlg.actions.appendChild(saveBtn);
}

function voiceCard() {
  var box = el("div", "sh-block");
  var row = el("div", "sh-voice");
  var input = document.createElement("input");
  input.type = "text";
  input.placeholder = t("sh_voice_ph");
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") runVoice(input.value);
  });
  var talk = document.createElement("button");
  talk.type = "button";
  talk.title = t("sh_voice");
  talk.innerHTML = '<i class="ph ph-microphone"></i>';
  talk.onclick = function () { listenVoice(input); };
  var go = document.createElement("button");
  go.type = "button";
  go.innerHTML = '<i class="ph ph-paper-plane-tilt"></i>';
  go.onclick = function () { runVoice(input.value); };
  row.appendChild(input);
  row.appendChild(talk);
  row.appendChild(go);
  box.appendChild(row);
  return box;
}

function runVoice(text) {
  var parsed = parseVoiceCommand(text, listDevices(), getLang());
  if (!parsed) {
    flash(t("sh_voice_miss"), "error");
    return;
  }
  pushHistory();
  var n = executeParsedCommand(parsed, S.items);
  (S.items || []).forEach(function (it) {
    if (isSmartType(it.type)) {
      touchItem3D(it, "build");
      if (bindingFor(it.id)) commandDevice(it, it.smart, { source: "voice" });
    }
  });
  markDirty();
  S.dirty3D = true;
  render2D();
  renderPanel();
  fillProps();
  flash(t("sh_voice_ok", { n: n }), "success");
}

function listenVoice(input) {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    flash(t("sh_voice_none"), "error");
    return;
  }
  try { if (rec) rec.abort(); } catch (_) {}
  rec = new SR();
  rec.lang = getLang() === "he" ? "he-IL" : "en-US";
  rec.interimResults = false;
  rec.onresult = function (ev) {
    var text = ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
    if (text) {
      input.value = text;
      runVoice(text);
    }
  };
  rec.onerror = function () { flash(t("sh_voice_none"), "error"); };
  rec.start();
}

function roomsCard(devices, hub) {
  var box = el("div", "sh-block");
  box.appendChild(el("div", "sh-sub", escapeHTML(t("sh_devices"))));
  if (!devices.length) {
    var empty = el("div", "sh-empty");
    empty.textContent = t("sh_empty");
    box.appendChild(empty);
    return box;
  }

  var filtered = devices.filter(function (d) {
    if (currentFilter === "all") return true;
    if (currentFilter === "sensor") return d.kind === "sensor" || d.kind === "lock";
    return d.kind === currentFilter;
  });

  if (!filtered.length) {
    var emptyFilter = el("div", "sh-empty");
    emptyFilter.textContent = t("sh_empty");
    box.appendChild(emptyFilter);
    return box;
  }

  var entities = liveEntities() || [];
  devicesByRoom(filtered).forEach(function (group) {
    var env = roomEnvironment(group.room, S.items);
    var roomWrap = el("div", "sh-room-wrap");

    var head = el("div", "sh-room-head");
    var roomTitle = el("div", "sh-room-name");
    roomTitle.textContent = group.room || t("tr_outside");

    var envBadge = el("div", "sh-room-env");
    envBadge.innerHTML =
      '<span class="sh-env-item"><i class="ph ph-thermometer"></i> ' + env.temperature + '°C</span>' +
      '<span class="sh-env-item"><i class="ph ph-drop"></i> ' + env.humidity + '%</span>' +
      (env.motion ? '<span class="sh-env-alert"><i class="ph ph-person"></i></span>' : '') +
      '<span class="sh-env-watts">' + env.watts + 'W</span>';

    var batchBtns = el("div", "sh-room-actions");
    var onBtn = document.createElement("button");
    onBtn.type = "button";
    onBtn.className = "sh-mini-btn";
    onBtn.textContent = t("sh_room_all_on");
    onBtn.onclick = function () {
      group.devices.forEach(function (d) { issue(d.item, { on: true }); });
      renderPanel();
    };

    var offBtn = document.createElement("button");
    offBtn.type = "button";
    offBtn.className = "sh-mini-btn";
    offBtn.textContent = t("sh_room_all_off");
    offBtn.onclick = function () {
      group.devices.forEach(function (d) { issue(d.item, { on: false }); });
      renderPanel();
    };

    batchBtns.appendChild(onBtn);
    batchBtns.appendChild(offBtn);

    head.appendChild(roomTitle);
    head.appendChild(envBadge);
    head.appendChild(batchBtns);
    roomWrap.appendChild(head);

    group.devices.forEach(function (d) {
      roomWrap.appendChild(deviceCard(d, entities, hub));
    });
    box.appendChild(roomWrap);
  });
  return box;
}

function deviceCard(d, entities, hub) {
  var it = d.item;
  ensureSmart(it);
  var card = el("div", "sh-dev" + (d.powered ? " on" : ""));
  var top = el("div", "sh-dev-top");
  var name = el("button", "sh-dev-name");
  name.type = "button";
  name.innerHTML = '<i class="ph ' + smartIcon(it) + '"></i><span>' + escapeHTML(flabel(it.type)) + "</span>";
  name.onclick = function () {
    select({ kind: "item", ref: it });
  };
  top.appendChild(name);
  var tog = document.createElement("button");
  tog.type = "button";
  tog.className = "sh-power" + (d.powered ? " on" : "");
  tog.title = t("sh_power");
  tog.innerHTML = '<i class="ph ph-power"></i>';
  tog.onclick = function () { toggleItem(it); };
  top.appendChild(tog);
  card.appendChild(top);

  var kind = d.kind;
  if (kind === "light") card.appendChild(lightControls(it));
  else if (kind === "climate" || kind === "heater" || kind === "fridge") card.appendChild(climateControls(it, kind));
  else if (kind === "media") card.appendChild(mediaControls(it));
  else if (kind === "cover") card.appendChild(coverControls(it));
  else if (kind === "fan") card.appendChild(fanControls(it));
  else if (kind === "appliance") card.appendChild(applianceControls(it));
  else if (kind === "sensor") card.appendChild(sensorControls(it));
  else if (kind === "lock") card.appendChild(lockControls(it));
  else if (kind === "vacuum") card.appendChild(vacuumControls(it));
  else if (kind === "plug") card.appendChild(plugControls(it));

  if (hub.status && hub.status.connected && entities.length) {
    card.appendChild(bindSelect(it, entities, d.binding));
  } else if (d.binding) {
    var tag = el("div", "sh-bound-tag");
    tag.textContent = d.binding.entityId;
    card.appendChild(tag);
  }
  return card;
}

function lightControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl");
  var bri = slider(0, 100, st.brightness || 0, function (v) {
    issue(it, { on: v > 0, brightness: v });
  });
  row.appendChild(bri);
  var col = document.createElement("input");
  col.type = "color";
  col.value = st.color || "#ffe6b4";
  col.oninput = function () { issue(it, { on: true, color: col.value }); };
  row.appendChild(col);
  return row;
}

function climateControls(it, kind) {
  var st = it.smart;
  var row = el("div", "sh-ctrl sh-climate");
  if (kind === "climate") {
    var sel = document.createElement("select");
    ["off", "cool", "heat", "auto", "dry", "fan"].forEach(function (m) {
      var o = document.createElement("option");
      o.value = m;
      o.textContent = t("sh_hvac_" + m);
      if (st.hvacMode === m) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { issue(it, { hvacMode: sel.value, on: sel.value !== "off" }); };
    row.appendChild(sel);
  }
  var temp = document.createElement("input");
  temp.type = "number";
  temp.min = kind === "fridge" ? "-2" : "16";
  temp.max = kind === "fridge" ? "12" : "32";
  temp.step = "0.5";
  temp.value = st.targetTemp;
  temp.onchange = function () { issue(it, { on: true, targetTemp: parseFloat(temp.value) }); };
  row.appendChild(temp);
  var unit = el("span", "sh-unit", "°C");
  row.appendChild(unit);
  return row;
}

function mediaControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl");
  row.appendChild(slider(0, 100, st.volume || 0, function (v) {
    issue(it, { on: true, volume: v, mute: v === 0 });
  }));
  return row;
}

function coverControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl");
  row.appendChild(slider(0, 100, st.position || 0, function (v) {
    issue(it, { position: v, on: v > 5 });
  }));
  return row;
}

function fanControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl");
  row.appendChild(slider(0, 100, st.speed || 0, function (v) {
    issue(it, { on: v > 0, speed: v });
  }));
  return row;
}

function applianceControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl sh-appl");
  var sel = document.createElement("select");
  ["auto", "eco", "quick", "heavy"].forEach(function (p) {
    var o = document.createElement("option");
    o.value = p;
    o.textContent = t("sh_prog_" + p);
    if (st.program === p) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = function () { issue(it, { on: true, program: sel.value, status: "running" }); };
  row.appendChild(sel);
  var stt = el("span", "sh-status-pill", escapeHTML(st.status || "idle"));
  row.appendChild(stt);
  return row;
}

function sensorControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl sh-sensor-row");

  if (it.type === "motionSensor") {
    var motPill = el("span", "sh-status-pill " + (st.motion ? "alert" : ""), st.motion ? t("sh_motion_detected") : t("sh_motion_clear"));
    var simBtn = document.createElement("button");
    simBtn.type = "button";
    simBtn.className = "sh-mini-btn";
    simBtn.textContent = t("sh_motion_test");
    simBtn.onclick = function () {
      issue(it, { motion: !st.motion });
      renderPanel();
    };
    row.appendChild(motPill);
    row.appendChild(simBtn);
  } else if (it.type === "contactSensor") {
    var coPill = el("span", "sh-status-pill " + (st.contact ? "alert" : ""), st.contact ? t("sh_contact_open") : t("sh_contact_closed"));
    var coBtn = document.createElement("button");
    coBtn.type = "button";
    coBtn.className = "sh-mini-btn";
    coBtn.textContent = t("sh_contact_test");
    coBtn.onclick = function () {
      issue(it, { contact: !st.contact });
      renderPanel();
    };
    row.appendChild(coPill);
    row.appendChild(coBtn);
  } else if (it.type === "smokeDetector") {
    var smPill = el("span", "sh-status-pill " + (st.smoke ? "alert" : ""), st.smoke ? t("sh_smoke_alert") : t("sh_smoke_normal"));
    row.appendChild(smPill);
  } else if (it.type === "tempSensor") {
    var thVal = el("span", "sh-status-pill", st.temperature + "°C · " + st.humidity + "%");
    row.appendChild(thVal);
  }
  return row;
}

function lockControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl");
  var isLocked = st.locked !== false;
  var lBtn = document.createElement("button");
  lBtn.type = "button";
  lBtn.className = "sh-lock-btn " + (isLocked ? "locked" : "unlocked");
  lBtn.innerHTML = '<i class="ph ' + (isLocked ? "ph-lock-key" : "ph-lock-key-open") + '"></i> ' + (isLocked ? t("sh_lock_locked") : t("sh_lock_unlocked"));
  lBtn.onclick = function () {
    issue(it, { locked: !isLocked, on: isLocked });
    renderPanel();
  };
  row.appendChild(lBtn);
  return row;
}

function vacuumControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl sh-vac-row");
  var isClean = st.status === "cleaning";

  var stBtn = document.createElement("button");
  stBtn.type = "button";
  stBtn.className = "sh-mini-btn" + (isClean ? " active" : "");
  stBtn.textContent = isClean ? t("sh_vac_dock") : t("sh_vac_start");
  stBtn.onclick = function () {
    issue(it, { on: !isClean, status: isClean ? "docked" : "cleaning" });
    renderPanel();
  };
  row.appendChild(stBtn);

  var vStatus = el("span", "sh-status-pill", isClean ? t("sh_vac_cleaning") : t("sh_vac_docked"));
  row.appendChild(vStatus);
  return row;
}

function plugControls(it) {
  var st = it.smart;
  var row = el("div", "sh-ctrl");
  var pWatts = el("span", "sh-status-pill", (st.on ? (st.watts || 60) : 0) + " W");
  row.appendChild(pWatts);
  return row;
}

function slider(min, max, value, onChange) {
  var inp = document.createElement("input");
  inp.type = "range";
  inp.min = String(min);
  inp.max = String(max);
  inp.value = String(value);
  inp.oninput = function () { onChange(parseFloat(inp.value)); };
  return inp;
}

function bindSelect(it, entities, binding) {
  var sel = document.createElement("select");
  sel.className = "sh-bind";
  var none = document.createElement("option");
  none.value = "";
  none.textContent = t("sh_unbind");
  sel.appendChild(none);
  var kind = smartKind(it);
  entities.forEach(function (e) {
    if (kind && e.kind && e.kind !== kind && !(kind === "heater" && e.kind === "climate") && !(kind === "appliance" && e.kind === "switch")) return;
    var o = document.createElement("option");
    o.value = e.entity_id;
    o.textContent = e.name || e.entity_id;
    if (binding && binding.entityId === e.entity_id) o.selected = true;
    sel.appendChild(o);
  });
  sel.onchange = function () {
    setBinding(it.id, sel.value ? { proto: loadCreds().proto || "ha", entityId: sel.value, host: loadCreds().url } : null);
    markDirty();
    renderPanel();
  };
  return sel;
}

function autoCard(hub) {
  var box = el("div", "sh-block");
  var head = el("div", "sh-head-row");
  head.appendChild(el("div", "sh-sub", escapeHTML(t("sh_autos"))));
  var addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "sh-link-btn";
  addBtn.innerHTML = '<i class="ph ph-plus-circle"></i> ' + escapeHTML(t("sh_auto_new"));
  addBtn.onclick = openNewAutomationModal;
  head.appendChild(addBtn);
  box.appendChild(head);

  (hub.automations || []).forEach(function (a) {
    var row = el("div", "sh-auto-row");
    var label = el("label", "sh-auto");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!a.enabled;
    cb.onchange = function () {
      a.enabled = cb.checked;
      markDirty();
    };
    label.appendChild(cb);
    var span = document.createElement("span");
    span.textContent = t("sh_auto_" + a.id) || a.name || a.id;
    label.appendChild(span);
    row.appendChild(label);

    if (String(a.id).indexOf("auto-") === 0) {
      var del = document.createElement("button");
      del.type = "button";
      del.className = "sh-del-icon";
      del.innerHTML = '<i class="ph ph-trash"></i>';
      del.onclick = function () {
        deleteAutomation(a.id);
        markDirty();
        renderPanel();
        flash(t("sh_auto_deleted"), "success");
      };
      row.appendChild(del);
    }
    box.appendChild(row);
  });
  return box;
}

function openNewAutomationModal() {
  var dlg = openModal(t("sh_auto_new"));
  var nameInp = document.createElement("input");
  nameInp.type = "text";
  nameInp.placeholder = t("sh_auto_name_ph");
  nameInp.value = t("sh_auto_new");
  dlg.body.appendChild(labeled(t("sh_auto_name_ph"), nameInp));

  var trSel = document.createElement("select");
  [
    ["hour", t("sh_auto_tr_hour")],
    ["motion", t("sh_auto_tr_motion")],
    ["power", t("sh_auto_tr_power_above")],
    ["temp", t("sh_auto_tr_temp_above")],
  ].forEach(function (opt) {
    var o = document.createElement("option");
    o.value = opt[0];
    o.textContent = opt[1];
    trSel.appendChild(o);
  });
  dlg.body.appendChild(labeled(t("sh_auto_trigger"), trSel));

  var acSel = document.createElement("select");
  [
    ["night_scene", t("sh_auto_ac_scene") + " (Night)"],
    ["eco_scene", t("sh_auto_ac_scene") + " (Eco)"],
    ["lights_off", t("sh_auto_ac_kind") + " (Lights Off)"],
    ["lights_on", t("sh_auto_ac_kind") + " (Lights On)"],
  ].forEach(function (opt) {
    var o = document.createElement("option");
    o.value = opt[0];
    o.textContent = opt[1];
    acSel.appendChild(o);
  });
  dlg.body.appendChild(labeled(t("sh_auto_action"), acSel));

  var saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "btn-accent";
  saveBtn.textContent = t("sh_auto_new");
  saveBtn.onclick = function () {
    var tr = { type: "hour", hour: 21 };
    if (trSel.value === "motion") tr = { type: "sensor", sensorType: "motion", equals: true };
    else if (trSel.value === "power") tr = { type: "power_above", threshold: 3500 };
    else if (trSel.value === "temp") tr = { type: "temp_above", threshold: 28 };

    var act = { type: "scene", sceneId: "night" };
    if (acSel.value === "eco_scene") act = { type: "scene", sceneId: "eco" };
    else if (acSel.value === "lights_off") act = { type: "kind", kind: "light", patch: { on: false } };
    else if (acSel.value === "lights_on") act = { type: "kind", kind: "light", patch: { on: true, brightness: 80 } };

    addAutomation({
      name: nameInp.value.trim() || "Automation",
      trigger: tr,
      action: act,
    });
    markDirty();
    dlg.close();
    renderPanel();
    flash(t("sh_auto_created"), "success");
  };
  dlg.actions.appendChild(saveBtn);
}

function toggleItem(it) {
  ensureSmart(it);
  issue(it, { on: !devicePowered(it) });
  renderPanel();
  fillProps();
}

function issue(it, patch) {
  commandDevice(it, patch, { source: "ui" }).then(function (res) {
    if (res && res.ok === false) flash(t("sh_err_reach"), "error");
  });
  render2D();
  markDirty();
}

export function fillItemSmart(it) {
  var host = document.getElementById("smartItemControls");
  if (!host) return;
  host.innerHTML = "";
  if (!it || !isSmartType(it.type)) {
    host.style.display = "none";
    return;
  }
  host.style.display = "flex";
  ensureSmart(it);
  var cap = capability(it.type);
  var head = el("div", "sh-item-head");
  head.innerHTML = '<i class="ph ' + smartIcon(it) + '"></i><span>' + escapeHTML(t("sh_item")) + "</span>";
  host.appendChild(head);
  if (cap.kind === "light") {
    var bind = bindingFor(it.id);
    var entities = liveEntities();
    var hub = ensureSmartHome();
    if (hub.status && hub.status.connected && entities.length) host.appendChild(bindSelect(it, entities, bind));
    else if (bind) {
      var tag = el("div", "sh-bound-tag");
      tag.textContent = bind.entityId;
      host.appendChild(tag);
    }
    return;
  }
  var fake = { item: it, kind: cap.kind, powered: devicePowered(it), binding: bindingFor(it.id), smart: it.smart };
  var body = deviceCard(fake, liveEntities(), ensureSmartHome());
  body.classList.add("sh-dev-embed");
  host.appendChild(body);
}