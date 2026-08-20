// Smart home: catalogue of controllable furniture, live device state, scenes,
// automations, voice parsing, energy monitoring, and protocol mapping (Home Assistant / Hue / Shelly).
// Pure model — no DOM, no network — so Node tests can drive it without THREE.
import { S, uid, clamp, fin, hexStr } from "./state.js";
import { detectRooms, roomName, pointInPoly } from "./geometry.js";

export const SMART_KINDS = [
  "light",
  "climate",
  "media",
  "switch",
  "cover",
  "appliance",
  "fridge",
  "fan",
  "heater",
  "sensor",
  "lock",
  "vacuum",
  "plug",
];

var TYPE_CAP = {
  ceilingLight: { kind: "light", icon: "ph-lightbulb" },
  pendant: { kind: "light", icon: "ph-lamp-pendant" },
  chandelier: { kind: "light", icon: "ph-chandelier" },
  floorLamp: { kind: "light", icon: "ph-lamp" },
  wallLamp: { kind: "light", icon: "ph-lamp" },
  tableLamp: { kind: "light", icon: "ph-lamp" },
  trackLight: { kind: "light", icon: "ph-spotlight" },
  lightStrip: { kind: "light", icon: "ph-minus" },
  led_grow_light: { kind: "light", icon: "ph-plant" },
  ac: { kind: "climate", icon: "ph-snowflake" },
  acCassette: { kind: "climate", icon: "ph-snowflake" },
  acDucted: { kind: "climate", icon: "ph-wind" },
  acOutdoor: { kind: "climate", icon: "ph-sun" },
  thermostat: { kind: "climate", icon: "ph-thermometer-hot" },
  radiator: { kind: "heater", icon: "ph-thermometer-hot" },
  waterHeater: { kind: "heater", icon: "ph-drop" },
  towelRail: { kind: "heater", icon: "ph-towel" },
  tv: { kind: "media", icon: "ph-television" },
  tvWall: { kind: "media", icon: "ph-television-simple" },
  soundbar: { kind: "media", icon: "ph-speaker-hifi" },
  speaker: { kind: "media", icon: "ph-speaker-high" },
  fridge: { kind: "fridge", icon: "ph-fridge" },
  wineFridge: { kind: "fridge", icon: "ph-wine" },
  oven: { kind: "appliance", icon: "ph-oven" },
  cooktop: { kind: "switch", icon: "ph-cooking-pot" },
  microwave: { kind: "appliance", icon: "ph-microwave" },
  dishwasher: { kind: "appliance", icon: "ph-dishwasher" },
  washer: { kind: "appliance", icon: "ph-washing-machine" },
  dryer: { kind: "appliance", icon: "ph-washing-machine" },
  hood: { kind: "fan", icon: "ph-fan" },
  coffeeMachine: { kind: "appliance", icon: "ph-coffee" },
  toaster: { kind: "switch", icon: "ph-toast" },
  kettle: { kind: "switch", icon: "ph-coffee" },
  ceilingFan: { kind: "fan", icon: "ph-fan" },
  fireplace: { kind: "switch", icon: "ph-flame" },
  curtain: { kind: "cover", icon: "ph-app-window" },
  motorizedBlind: { kind: "cover", icon: "ph-app-window" },
  desktop_pc: { kind: "switch", icon: "ph-desktop-tower" },
  laptop: { kind: "switch", icon: "ph-laptop" },
  printer: { kind: "switch", icon: "ph-printer" },
  monitor: { kind: "switch", icon: "ph-monitor" },
  motionSensor: { kind: "sensor", icon: "ph-broadcast" },
  contactSensor: { kind: "sensor", icon: "ph-door-open" },
  tempSensor: { kind: "sensor", icon: "ph-thermometer" },
  smokeDetector: { kind: "sensor", icon: "ph-warning-octagon" },
  smartLock: { kind: "lock", icon: "ph-lock-key" },
  vacuum: { kind: "vacuum", icon: "ph-robot" },
  smartPlug: { kind: "plug", icon: "ph-plug" },
};

var KIND_HA = {
  light: ["light"],
  climate: ["climate"],
  media: ["media_player", "remote"],
  switch: ["switch", "input_boolean", "remote"],
  cover: ["cover"],
  appliance: ["switch", "vacuum", "sensor"],
  fridge: ["climate", "switch"],
  fan: ["fan", "switch"],
  heater: ["water_heater", "climate", "switch"],
  sensor: ["binary_sensor", "sensor"],
  lock: ["lock"],
  vacuum: ["vacuum"],
  plug: ["switch", "sensor"],
};

var KIND_DEFAULTS = {
  light: { on: true, brightness: 100, color: "#ffe6b4", colorTemp: 350 },
  climate: { on: true, hvacMode: "cool", targetTemp: 23, currentTemp: 24, fan: "auto" },
  media: { on: false, volume: 30, mute: false, source: "hdmi1", playing: false },
  switch: { on: false },
  cover: { on: true, position: 100 },
  appliance: { on: false, program: "auto", remaining: 0, status: "idle" },
  fridge: { on: true, targetTemp: 4, door: false },
  fan: { on: false, speed: 40 },
  heater: { on: false, targetTemp: 45 },
  sensor: { on: false, motion: false, contact: false, temperature: 22, humidity: 45, smoke: false, battery: 100 },
  lock: { on: true, locked: true },
  vacuum: { on: false, status: "docked", battery: 100, fanSpeed: "standard" },
  plug: { on: false, watts: 0, kWh: 0.1 },
};

export const POWER_RATINGS = {
  ceilingLight: 40, pendant: 40, chandelier: 120, floorLamp: 25, wallLamp: 15, tableLamp: 15,
  trackLight: 50, lightStrip: 20, led_grow_light: 150,
  ac: 1500, acCassette: 1800, acDucted: 2400, acOutdoor: 2000, thermostat: 5,
  radiator: 1200, waterHeater: 2500, towelRail: 150, ceilingFan: 60, hood: 180,
  tv: 120, tvWall: 130, soundbar: 40, speaker: 30,
  desktop_pc: 220, laptop: 65, printer: 30, monitor: 35,
  fridge: 110, wineFridge: 90, oven: 2200, cooktop: 1800, microwave: 1000, dishwasher: 1400,
  washer: 1800, dryer: 2200, coffeeMachine: 1200, toaster: 800, kettle: 1800, fireplace: 1500,
  vacuum: 35, smartPlug: 60, smartLock: 2, motionSensor: 0.5, contactSensor: 0.2,
  tempSensor: 0.5, smokeDetector: 0.5, curtain: 10, motorizedBlind: 10,
};

var listeners = [];

export function capability(type) {
  return TYPE_CAP[type] || null;
}
export function isSmartType(type) {
  return !!TYPE_CAP[type];
}
export function smartKind(it) {
  var cap = it && TYPE_CAP[it.type];
  return cap ? cap.kind : null;
}
export function smartIcon(itOrType) {
  var type = itOrType && itOrType.type ? itOrType.type : itOrType;
  var cap = TYPE_CAP[type];
  return cap ? cap.icon : "ph-plugs-connected";
}

export function devicePowered(it) {
  if (!it) return false;
  var st = it.smart;
  var cap = TYPE_CAP[it.type];
  if (st) {
    if (cap && cap.kind === "lock") return st.locked === false;
    if (cap && cap.kind === "sensor") return !!(st.motion || st.contact || st.smoke || st.on);
    if (cap && cap.kind === "vacuum") return st.on === true || st.status === "cleaning" || st.status === "returning";
    if (st.on === false) return false;
    if (st.hvacMode === "off") return false;
    if (st.on === true) return true;
  }
  if (cap && cap.kind === "light") return it.lightOn !== false;
  return !!(st && st.on);
}

export function ensureSmartHome() {
  if (!S.smarthome) {
    S.smarthome = emptyHub();
  } else {
    var h = S.smarthome;
    if (!h.bindings || typeof h.bindings !== "object") h.bindings = {};
    if (!Array.isArray(h.scenes)) h.scenes = defaultScenes();
    if (!Array.isArray(h.automations)) h.automations = defaultAutomations();
    if (!h.status) h.status = { proto: "sim", connected: false, error: "" };
  }
  return S.smarthome;
}

function emptyHub() {
  return {
    bindings: {},
    scenes: defaultScenes(),
    automations: defaultAutomations(),
    status: { proto: "sim", connected: false, error: "", host: "", entityCount: 0 },
  };
}

export function defaultState(type) {
  var cap = TYPE_CAP[type];
  var base = cap ? KIND_DEFAULTS[cap.kind] : { on: false };
  var out = {};
  Object.keys(base).forEach(function (k) { out[k] = base[k]; });
  return out;
}

export function ensureSmart(it) {
  if (!it || !TYPE_CAP[it.type]) return null;
  if (!it.smart || typeof it.smart !== "object") it.smart = defaultState(it.type);
  var d = defaultState(it.type);
  Object.keys(d).forEach(function (k) {
    if (it.smart[k] === undefined) it.smart[k] = d[k];
  });
  return it.smart;
}

export function applyCommand(it, patch, opts) {
  if (!it) return null;
  var cap = TYPE_CAP[it.type];
  if (!cap) return null;
  var st = ensureSmart(it);
  var p = patch && typeof patch === "object" ? patch : {};
  if (p.on !== undefined) st.on = !!p.on;

  if (cap.kind === "light") {
    if (fin(p.brightness)) st.brightness = clamp(Math.round(p.brightness), 0, 100);
    if (typeof p.color === "string" && /^#[0-9a-fA-F]{6}$/.test(p.color)) st.color = p.color.toLowerCase();
    if (fin(p.colorTemp)) st.colorTemp = clamp(Math.round(p.colorTemp), 153, 500);
    if (st.brightness === 0) st.on = false;
    if (p.on === true && st.brightness === 0) st.brightness = 100;
    syncLampVisual(it, st);
  } else if (cap.kind === "climate" || cap.kind === "heater" || cap.kind === "fridge") {
    if (typeof p.hvacMode === "string") st.hvacMode = sanitizeHvac(p.hvacMode);
    if (fin(p.targetTemp)) st.targetTemp = clamp(p.targetTemp, cap.kind === "fridge" ? -2 : 10, cap.kind === "fridge" ? 12 : 32);
    if (fin(p.currentTemp)) st.currentTemp = p.currentTemp;
    if (typeof p.fan === "string") st.fan = p.fan;
    if (p.door !== undefined) st.door = !!p.door;
    if (st.hvacMode === "off") st.on = false;
    if (p.on === false) st.hvacMode = "off";
    if (p.on === true && st.hvacMode === "off") st.hvacMode = cap.kind === "heater" ? "heat" : "cool";
  } else if (cap.kind === "media") {
    if (fin(p.volume)) st.volume = clamp(Math.round(p.volume), 0, 100);
    if (p.mute !== undefined) st.mute = !!p.mute;
    if (typeof p.source === "string") st.source = p.source.slice(0, 40);
    if (p.playing !== undefined) st.playing = !!p.playing;
  } else if (cap.kind === "cover") {
    if (fin(p.position)) st.position = clamp(Math.round(p.position), 0, 100);
    if (p.on === true) st.position = 100;
    if (p.on === false) st.position = 0;
    st.on = st.position > 5;
  } else if (cap.kind === "fan") {
    if (fin(p.speed)) st.speed = clamp(Math.round(p.speed), 0, 100);
    if (st.speed === 0) st.on = false;
    if (p.on === true && st.speed === 0) st.speed = 40;
  } else if (cap.kind === "appliance") {
    if (typeof p.program === "string") st.program = p.program.slice(0, 40);
    if (fin(p.remaining)) st.remaining = Math.max(0, Math.round(p.remaining));
    if (typeof p.status === "string") st.status = p.status.slice(0, 40);
    if (p.on === true && st.status === "idle") st.status = "running";
    if (p.on === false) st.status = "idle";
  } else if (cap.kind === "lock") {
    if (p.locked !== undefined) {
      st.locked = !!p.locked;
      st.on = !st.locked;
    } else if (p.on !== undefined) {
      st.on = !!p.on;
      st.locked = !st.on;
    }
  } else if (cap.kind === "sensor") {
    if (p.motion !== undefined) st.motion = !!p.motion;
    if (p.contact !== undefined) st.contact = !!p.contact;
    if (fin(p.temperature)) st.temperature = p.temperature;
    if (fin(p.humidity)) st.humidity = clamp(Math.round(p.humidity), 0, 100);
    if (p.smoke !== undefined) st.smoke = !!p.smoke;
    if (fin(p.battery)) st.battery = clamp(Math.round(p.battery), 0, 100);
    if (p.on !== undefined) st.on = !!p.on;
    else st.on = !!(st.motion || st.contact || st.smoke);
  } else if (cap.kind === "vacuum") {
    if (typeof p.status === "string") st.status = p.status;
    if (p.on === true && (st.status === "docked" || st.status === "paused")) st.status = "cleaning";
    if (p.on === false && st.status === "cleaning") st.status = "docked";
    if (fin(p.battery)) st.battery = clamp(Math.round(p.battery), 0, 100);
    if (typeof p.fanSpeed === "string") st.fanSpeed = p.fanSpeed;
    st.on = st.status === "cleaning";
  } else if (cap.kind === "plug") {
    if (p.on !== undefined) {
      st.on = !!p.on;
      if (!st.on) st.watts = 0;
      else if (!st.watts) st.watts = 60;
    }
    if (fin(p.watts)) st.watts = Math.max(0, p.watts);
    if (fin(p.kWh)) st.kWh = Math.max(0, p.kWh);
  }

  if (!(opts && opts.silent)) emitSmartChange({ item: it, patch: p, source: (opts && opts.source) || "local" });
  return st;
}

function sanitizeHvac(mode) {
  var m = String(mode || "").toLowerCase();
  return ["off", "heat", "cool", "auto", "dry", "fan"].indexOf(m) !== -1 ? m : "off";
}

function syncLampVisual(it, st) {
  it.lightOn = !!st.on;
  it.lightI = (st.brightness || 0) / 100;
  if (st.color) {
    var n = parseInt(st.color.slice(1), 16);
    if (isFinite(n)) it.lightColor = n;
  }
}

export function syncSmartFromLamp(it) {
  if (!it || !TYPE_CAP[it.type] || TYPE_CAP[it.type].kind !== "light") return null;
  var st = ensureSmart(it);
  st.on = it.lightOn !== false;
  if (fin(it.lightI)) st.brightness = clamp(Math.round(it.lightI * 100), 0, 200);
  if (fin(it.lightColor)) st.color = hexStr(it.lightColor);
  return st;
}

export function onSmartChange(fn) {
  if (typeof fn !== "function") return function () {};
  listeners.push(fn);
  return function off() {
    var i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

export function emitSmartChange(detail) {
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](detail || {}); } catch (_) {}
  }
}

export function itemRoomName(it, rooms) {
  rooms = rooms || detectRooms();
  if (!it) return "";
  for (var i = 0; i < rooms.length; i++) {
    if (pointInPoly(it.x, it.z, rooms[i].pts)) {
      return roomName(rooms[i].key) || "";
    }
  }
  return "";
}

export function listDevices(items, rooms) {
  items = items || S.items || [];
  rooms = rooms || detectRooms();
  var hub = ensureSmartHome();
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cap = TYPE_CAP[it.type];
    if (!cap) continue;
    ensureSmart(it);
    var room = itemRoomName(it, rooms);
    out.push({
      id: it.id,
      type: it.type,
      kind: cap.kind,
      icon: cap.icon,
      room: room,
      item: it,
      smart: it.smart,
      binding: hub.bindings[String(it.id)] || null,
      powered: devicePowered(it),
    });
  }
  return out;
}

export function devicesByRoom(devices) {
  var groups = {};
  var order = [];
  (devices || []).forEach(function (d) {
    var key = d.room || "";
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(d);
  });
  return order.map(function (key) {
    return { room: key, devices: groups[key] };
  });
}

/* ---- Energy & Environment engine ---------------------------------------- */
export function estimatePowerUsage(items, rooms) {
  items = items || S.items || [];
  rooms = rooms || detectRooms();
  var totalWatts = 0;
  var activeCount = 0;
  var byCategory = { lighting: 0, climate: 0, appliances: 0, media: 0, other: 0 };
  var byRoom = {};

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cap = TYPE_CAP[it.type];
    if (!cap) continue;
    var st = it.smart || {};
    var baseW = POWER_RATINGS[it.type] || 25;
    var w = 0;
    var isPowered = devicePowered(it);

    if (cap.kind === "plug") {
      w = isPowered ? (st.watts != null ? st.watts : baseW) : 0.5;
    } else if (cap.kind === "light") {
      w = isPowered ? Math.max(2, Math.round(baseW * ((st.brightness || 100) / 100))) : 0.4;
    } else if (cap.kind === "climate" || cap.kind === "heater") {
      if (isPowered) {
        w = st.hvacMode === "fan" ? 80 : (st.hvacMode === "dry" ? Math.round(baseW * 0.6) : baseW);
      } else {
        w = 1.5;
      }
    } else if (cap.kind === "fan") {
      w = isPowered ? Math.max(5, Math.round(baseW * ((st.speed || 50) / 100))) : 0.5;
    } else if (cap.kind === "appliance") {
      w = isPowered ? (st.status === "running" ? baseW : Math.round(baseW * 0.15)) : 1.0;
    } else if (cap.kind === "media") {
      w = isPowered ? (st.playing ? baseW : Math.round(baseW * 0.4)) : 1.0;
    } else if (cap.kind === "vacuum") {
      w = isPowered ? baseW : (st.battery < 99 ? 25 : 2);
    } else {
      w = isPowered ? baseW : 0.3;
    }

    if (isPowered) activeCount++;
    totalWatts += w;

    if (cap.kind === "light") byCategory.lighting += w;
    else if (cap.kind === "climate" || cap.kind === "heater" || cap.kind === "fan") byCategory.climate += w;
    else if (cap.kind === "appliance" || cap.kind === "fridge") byCategory.appliances += w;
    else if (cap.kind === "media") byCategory.media += w;
    else byCategory.other += w;

    var rName = itemRoomName(it, rooms) || "other";
    byRoom[rName] = (byRoom[rName] || 0) + w;
  }

  var kwhDaily = (totalWatts * 24) / 1000;
  var costMonthly = kwhDaily * 30 * 0.62;

  return {
    totalWatts: Math.round(totalWatts),
    activeCount: activeCount,
    totalCount: items.filter(function (x) { return TYPE_CAP[x.type]; }).length,
    byCategory: byCategory,
    byRoom: byRoom,
    kwhDaily: Math.round(kwhDaily * 10) / 10,
    costMonthly: Math.round(costMonthly),
  };
}

export function roomEnvironment(rName, items, rooms) {
  items = items || S.items || [];
  rooms = rooms || detectRooms();
  var temps = [];
  var humids = [];
  var motion = false;
  var contactOpen = false;
  var smokeAlert = false;
  var activeCount = 0;
  var roomWatts = 0;

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cap = TYPE_CAP[it.type];
    if (!cap) continue;
    if (itemRoomName(it, rooms) !== rName) continue;
    var st = it.smart || {};
    if (devicePowered(it)) activeCount++;

    if (st.temperature != null) temps.push(st.temperature);
    else if (st.currentTemp != null) temps.push(st.currentTemp);
    else if (st.targetTemp != null) temps.push(st.targetTemp);

    if (st.humidity != null) humids.push(st.humidity);
    if (st.motion) motion = true;
    if (st.contact) contactOpen = true;
    if (st.smoke) smokeAlert = true;

    var baseW = POWER_RATINGS[it.type] || 25;
    roomWatts += devicePowered(it) ? baseW : 0.5;
  }

  var avgTemp = temps.length ? Math.round((temps.reduce(function (a, b) { return a + b; }, 0) / temps.length) * 10) / 10 : 23;
  var avgHumid = humids.length ? Math.round(humids.reduce(function (a, b) { return a + b; }, 0) / humids.length) : 48;

  return {
    room: rName,
    temperature: avgTemp,
    humidity: avgHumid,
    motion: motion,
    contactOpen: contactOpen,
    smokeAlert: smokeAlert,
    activeCount: activeCount,
    watts: Math.round(roomWatts),
  };
}

/* ---- Scenes ------------------------------------------------------------- */
export function defaultScenes() {
  return [
    scene("morning", [
      { kind: "light", patch: { on: true, brightness: 70, color: "#ffe6b4" } },
      { kind: "climate", patch: { on: true, hvacMode: "cool", targetTemp: 23 } },
      { kind: "cover", patch: { on: true, position: 100 } },
      { kind: "media", patch: { on: false } },
    ]),
    scene("away", [
      { kind: "light", patch: { on: false } },
      { kind: "media", patch: { on: false } },
      { kind: "switch", patch: { on: false } },
      { kind: "fan", patch: { on: false } },
      { kind: "appliance", patch: { on: false } },
      { kind: "climate", patch: { on: true, hvacMode: "auto", targetTemp: 26 } },
      { kind: "cover", patch: { on: false, position: 0 } },
      { kind: "lock", patch: { locked: true } },
    ]),
    scene("movie", [
      { kind: "light", patch: { on: true, brightness: 12, color: "#ffb070" } },
      { kind: "media", patch: { on: true, volume: 35, playing: true } },
      { kind: "cover", patch: { on: false, position: 0 } },
    ]),
    scene("night", [
      { kind: "light", patch: { on: false } },
      { kind: "media", patch: { on: false } },
      { kind: "switch", patch: { on: false } },
      { kind: "fan", patch: { on: false } },
      { kind: "appliance", patch: { on: false } },
      { kind: "climate", patch: { on: true, hvacMode: "cool", targetTemp: 22 } },
      { kind: "lock", patch: { locked: true } },
    ]),
    scene("dinner", [
      { kind: "light", patch: { on: true, brightness: 85, color: "#ffd9a0" } },
      { kind: "hood", type: "hood", patch: { on: true, speed: 50 } },
      { kind: "media", patch: { on: false } },
    ]),
    scene("eco", [
      { kind: "light", patch: { brightness: 35 } },
      { kind: "climate", patch: { on: true, hvacMode: "auto", targetTemp: 25 } },
      { kind: "switch", patch: { on: false } },
      { kind: "plug", patch: { on: false } },
    ]),
  ];
}

function scene(id, rules) {
  return { id: id, builtin: true, rules: rules };
}

export function createSceneFromCurrentState(name, icon, roomFilter) {
  var hub = ensureSmartHome();
  var items = S.items || [];
  var itemPatches = {};
  var rooms = detectRooms();

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cap = TYPE_CAP[it.type];
    if (!cap) continue;
    var rName = itemRoomName(it, rooms);
    if (roomFilter && rName !== roomFilter) continue;
    if (!it.smart) continue;
    itemPatches[String(it.id)] = JSON.parse(JSON.stringify(it.smart));
  }

  var scId = newId("sc");
  var sc = {
    id: scId,
    name: String(name || "Custom Scene").slice(0, 50),
    icon: icon || "ph-sparkle",
    builtin: false,
    itemPatches: itemPatches,
  };
  hub.scenes.push(sc);
  emitSmartChange({ source: "scene_create", scene: sc });
  return sc;
}

export function deleteScene(sceneId) {
  var hub = ensureSmartHome();
  var idx = (hub.scenes || []).findIndex(function (s) { return s.id === sceneId; });
  if (idx !== -1 && !hub.scenes[idx].builtin) {
    var removed = hub.scenes.splice(idx, 1)[0];
    emitSmartChange({ source: "scene_delete", scene: removed });
    return true;
  }
  return false;
}

export function defaultAutomations() {
  return [
    { id: "sunset-lights", name: "Sunset Lights", enabled: true, trigger: { type: "hour", hour: 18 }, action: { type: "kind", kind: "light", patch: { on: true, brightness: 60 } } },
    { id: "late-off", name: "Late Night Lockdown", enabled: false, trigger: { type: "hour", hour: 23 }, action: { type: "scene", sceneId: "night" } },
    { id: "tv-dim", name: "Movie Dimming", enabled: true, trigger: { type: "deviceKind", kind: "media", attr: "on", equals: true }, action: { type: "kind", kind: "light", patch: { brightness: 15 } } },
    { id: "motion-light", name: "Motion Detected Light", enabled: false, trigger: { type: "sensor", sensorType: "motion", equals: true }, action: { type: "kind", kind: "light", patch: { on: true, brightness: 80 } } },
    { id: "eco-power", name: "Eco Peak Limiter", enabled: false, trigger: { type: "power_above", threshold: 4500 }, action: { type: "scene", sceneId: "eco" } },
  ];
}

export function addAutomation(auto) {
  var hub = ensureSmartHome();
  var item = Object.assign({
    id: newId("auto"),
    name: (auto && auto.name) || "Custom Automation",
    enabled: true,
    trigger: (auto && auto.trigger) || { type: "hour", hour: 20 },
    action: (auto && auto.action) || { type: "kind", kind: "light", patch: { on: false } },
  }, auto || {});
  hub.automations.push(item);
  emitSmartChange({ source: "automation_add", automation: item });
  return item;
}

export function updateAutomation(autoId, patch) {
  var hub = ensureSmartHome();
  var a = (hub.automations || []).find(function (x) { return x.id === autoId; });
  if (!a) return null;
  Object.assign(a, patch || {});
  emitSmartChange({ source: "automation_update", automation: a });
  return a;
}

export function deleteAutomation(autoId) {
  var hub = ensureSmartHome();
  var idx = (hub.automations || []).findIndex(function (x) { return x.id === autoId; });
  if (idx !== -1) {
    var removed = hub.automations.splice(idx, 1)[0];
    emitSmartChange({ source: "automation_delete", automation: removed });
    return true;
  }
  return false;
}

export function applyScene(sceneObj, items, opts) {
  if (!sceneObj) return 0;
  items = items || S.items || [];
  var n = 0;
  var rules = sceneObj.rules || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cap = TYPE_CAP[it.type];
    if (!cap) continue;
    for (var r = 0; r < rules.length; r++) {
      var rule = rules[r];
      if (rule.itemId != null && String(rule.itemId) !== String(it.id)) continue;
      if (rule.type && rule.type !== it.type) continue;
      if (rule.kind && rule.kind !== cap.kind) continue;
      if (rule.room && itemRoomName(it) !== rule.room) continue;
      applyCommand(it, rule.patch, { silent: true, source: (opts && opts.source) || "scene" });
      n++;
      break;
    }
  }
  if (sceneObj.itemPatches) {
    Object.keys(sceneObj.itemPatches).forEach(function (id) {
      var it = items.find(function (x) { return String(x.id) === String(id); });
      if (it) {
        applyCommand(it, sceneObj.itemPatches[id], { silent: true, source: "scene" });
        n++;
      }
    });
  }
  emitSmartChange({ scene: sceneObj, count: n, source: (opts && opts.source) || "scene" });
  return n;
}

export function snapshotSmart(hub) {
  hub = hub || ensureSmartHome();
  return {
    bindings: JSON.parse(JSON.stringify(hub.bindings || {})),
    scenes: (hub.scenes || []).map(function (s) {
      return { id: s.id, builtin: !!s.builtin, name: s.name || undefined, icon: s.icon || undefined, rules: s.rules, itemPatches: s.itemPatches };
    }),
    automations: JSON.parse(JSON.stringify(hub.automations || [])),
  };
}

export function loadSmart(data) {
  var hub = ensureSmartHome();
  if (!data || typeof data !== "object") {
    hub.bindings = {};
    hub.scenes = defaultScenes();
    hub.automations = defaultAutomations();
    return hub;
  }
  hub.bindings = data.bindings && typeof data.bindings === "object" ? data.bindings : {};
  hub.scenes = Array.isArray(data.scenes) && data.scenes.length ? data.scenes : defaultScenes();
  hub.automations = Array.isArray(data.automations) ? data.automations : defaultAutomations();
  return hub;
}

export function setBinding(itemId, binding) {
  var hub = ensureSmartHome();
  if (!binding) delete hub.bindings[String(itemId)];
  else hub.bindings[String(itemId)] = {
    proto: String(binding.proto || "ha").slice(0, 16),
    entityId: String(binding.entityId || "").slice(0, 120),
    host: String(binding.host || "").slice(0, 180),
  };
  return hub.bindings[String(itemId)] || null;
}

export function bindingFor(itemId) {
  return ensureSmartHome().bindings[String(itemId)] || null;
}

/* ---- name matching (bind a 3D piece to a real entity) -------------------- */
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_./-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

var TYPE_ALIASES = {
  light: ["light", "lamp", "bulb", "אור", "מנורה", "תאורה"],
  climate: ["ac", "climate", "hvac", "aircon", "air", "thermostat", "מזגן", "מיזוג", "תרמוסטט"],
  media: ["tv", "television", "media", "speaker", "soundbar", "טלוויזיה", "טלויזיה", "רמקול"],
  cover: ["cover", "curtain", "blind", "shade", "וילון", "תריס"],
  appliance: ["washer", "dishwasher", "oven", "dryer", "microwave", "כביסה", "מדיח", "תנור"],
  fridge: ["fridge", "refrigerator", "freezer", "מקרר"],
  fan: ["fan", "hood", "מאוורר", "קולט"],
  heater: ["heater", "radiator", "boiler", "דוד", "רדיאטור"],
  switch: ["switch", "plug", "outlet", "pc", "מתג", "שקע"],
  sensor: ["motion", "sensor", "contact", "door", "window", "smoke", "גלאי", "חיישן", "עשן"],
  lock: ["lock", "deadbolt", "doorlock", "מנעול", "נעילה"],
  vacuum: ["vacuum", "cleaner", "robot", "רובוט", "שואב"],
  plug: ["plug", "socket", "outlet", "שקע"],
};

export function matchScore(device, entity) {
  if (!device || !entity) return 0;
  var name = normName(entity.name || entity.friendly_name || entity.entity_id);
  var eid = normName(entity.entity_id);
  var room = normName(device.room);
  var type = normName(device.type);
  var kind = device.kind;
  var score = 0;
  var domains = KIND_HA[kind] || [];
  var domain = String(entity.entity_id || "").split(".")[0];
  if (domains.indexOf(domain) !== -1) score += 40;
  else if (entity.kind === kind) score += 36;
  else return 0;
  if (room && (name.indexOf(room) !== -1 || eid.indexOf(room) !== -1)) score += 30;
  if (type && (name.indexOf(type) !== -1 || eid.indexOf(type) !== -1)) score += 20;
  var aliases = TYPE_ALIASES[kind] || [];
  for (var i = 0; i < aliases.length; i++) {
    if (name.indexOf(aliases[i]) !== -1 || eid.indexOf(aliases[i]) !== -1) {
      score += 12;
      break;
    }
  }
  return score;
}

export function autoBind(devices, entities, opts) {
  devices = devices || [];
  entities = entities || [];
  var min = opts && fin(opts.min) ? opts.min : 50;
  var used = {};
  var pairs = [];
  devices.forEach(function (d) {
    var best = null, bestScore = 0;
    entities.forEach(function (e, i) {
      if (used[i]) return;
      var s = matchScore(d, e);
      if (s > bestScore) { bestScore = s; best = { entity: e, index: i, score: s }; }
    });
    if (best && best.score >= min) {
      used[best.index] = true;
      pairs.push({ itemId: d.id, entity: best.entity, score: best.score });
    }
  });
  return pairs;
}

/* ---- Home Assistant mapping ---------------------------------------------- */
export function haServiceFor(it, patch) {
  var cap = it && TYPE_CAP[it.type];
  if (!cap) return null;
  var bind = bindingFor(it.id);
  if (!bind || !bind.entityId) return null;
  var domain = bind.entityId.split(".")[0];
  var data = { entity_id: bind.entityId };
  var st = it.smart || {};
  var p = patch || {};
  var on = p.on !== undefined ? p.on : st.on;

  if (cap.kind === "light" || domain === "light") {
    if (on === false) return { domain: domain || "light", service: "turn_off", data: data };
    if (fin(p.brightness)) data.brightness_pct = clamp(Math.round(p.brightness), 1, 100);
    if (typeof p.color === "string") {
      var rgb = hexToRgb(p.color);
      if (rgb) data.rgb_color = rgb;
    }
    return { domain: "light", service: "turn_on", data: data };
  }
  if (cap.kind === "climate" || domain === "climate") {
    if (on === false || p.hvacMode === "off") return { domain: "climate", service: "turn_off", data: data };
    var calls = [];
    if (p.hvacMode && p.hvacMode !== "off") {
      calls.push({ domain: "climate", service: "set_hvac_mode", data: { entity_id: bind.entityId, hvac_mode: p.hvacMode } });
    }
    if (fin(p.targetTemp)) {
      calls.push({ domain: "climate", service: "set_temperature", data: { entity_id: bind.entityId, temperature: p.targetTemp } });
    }
    if (!calls.length) calls.push({ domain: "climate", service: "turn_on", data: data });
    return calls;
  }
  if (cap.kind === "media" || domain === "media_player") {
    if (on === false) return { domain: domain || "media_player", service: "turn_off", data: data };
    var out = [{ domain: "media_player", service: "turn_on", data: { entity_id: bind.entityId } }];
    if (fin(p.volume)) out.push({ domain: "media_player", service: "volume_set", data: { entity_id: bind.entityId, volume_level: clamp(p.volume, 0, 100) / 100 } });
    if (p.mute !== undefined) out.push({ domain: "media_player", service: "volume_mute", data: { entity_id: bind.entityId, is_volume_muted: !!p.mute } });
    if (p.playing === true) out.push({ domain: "media_player", service: "media_play", data: { entity_id: bind.entityId } });
    if (p.playing === false) out.push({ domain: "media_player", service: "media_pause", data: { entity_id: bind.entityId } });
    return out;
  }
  if (cap.kind === "cover" || domain === "cover") {
    if (fin(p.position)) return { domain: "cover", service: "set_cover_position", data: { entity_id: bind.entityId, position: clamp(Math.round(p.position), 0, 100) } };
    return { domain: "cover", service: on === false ? "close_cover" : "open_cover", data: data };
  }
  if (cap.kind === "fan" || domain === "fan") {
    if (on === false) return { domain: domain || "fan", service: "turn_off", data: data };
    if (fin(p.speed) && domain === "fan") return { domain: "fan", service: "set_percentage", data: { entity_id: bind.entityId, percentage: clamp(Math.round(p.speed), 0, 100) } };
    return { domain: domain || "switch", service: "turn_on", data: data };
  }
  if (cap.kind === "lock" || domain === "lock") {
    return { domain: "lock", service: (p.locked === true || on === false) ? "lock" : "unlock", data: data };
  }
  if (cap.kind === "vacuum" || domain === "vacuum") {
    if (on === false || p.status === "docked") return { domain: "vacuum", service: "return_to_base", data: data };
    if (p.status === "paused") return { domain: "vacuum", service: "pause", data: data };
    return { domain: "vacuum", service: "start", data: data };
  }
  return { domain: domain || "switch", service: on === false ? "turn_off" : "turn_on", data: data };
}

export function flattenHaCalls(call) {
  if (!call) return [];
  return Array.isArray(call) ? call : [call];
}

export function stateFromHaEntity(entity) {
  if (!entity) return null;
  var domain = String(entity.entity_id || "").split(".")[0];
  var st = entity.state;
  var a = entity.attributes || {};
  var on = st !== "off" && st !== "unavailable" && st !== "unknown" && st !== "closed" && st !== "locked";

  if (domain === "light") {
    var bri = a.brightness != null ? Math.round((Number(a.brightness) / 255) * 100) : (on ? 100 : 0);
    var color = Array.isArray(a.rgb_color) ? rgbToHex(a.rgb_color[0], a.rgb_color[1], a.rgb_color[2]) : undefined;
    return { on: on, brightness: bri, color: color };
  }
  if (domain === "climate" || domain === "water_heater") {
    return {
      on: st !== "off",
      hvacMode: sanitizeHvac(a.hvac_mode || st),
      targetTemp: Number(a.temperature) || Number(a.target_temp) || undefined,
      currentTemp: Number(a.current_temperature) || undefined,
      fan: a.fan_mode,
    };
  }
  if (domain === "media_player") {
    return {
      on: on,
      volume: a.volume_level != null ? Math.round(Number(a.volume_level) * 100) : undefined,
      mute: !!a.is_volume_muted,
      playing: st === "playing",
      source: a.source,
    };
  }
  if (domain === "cover") {
    var pos = a.current_position != null ? Number(a.current_position) : (st === "open" ? 100 : 0);
    return { on: pos > 5, position: pos };
  }
  if (domain === "fan") {
    return { on: on, speed: a.percentage != null ? Number(a.percentage) : (on ? 40 : 0) };
  }
  if (domain === "lock") {
    return { on: st === "unlocked", locked: st === "locked" };
  }
  if (domain === "vacuum") {
    return {
      on: st === "cleaning",
      status: st,
      battery: a.battery_level != null ? Number(a.battery_level) : undefined,
    };
  }
  if (domain === "binary_sensor") {
    var dc = a.device_class || "";
    var isMo = dc === "motion" || dc === "occupancy";
    var isCo = dc === "door" || dc === "window" || dc === "opening" || dc === "garage_door";
    var isSm = dc === "smoke" || dc === "gas";
    return {
      on: st === "on",
      motion: isMo ? st === "on" : undefined,
      contact: isCo ? st === "on" : undefined,
      smoke: isSm ? st === "on" : undefined,
    };
  }
  if (domain === "sensor") {
    var uom = a.unit_of_measurement || "";
    var sdc = a.device_class || "";
    var out = { on: on };
    if (uom.indexOf("°") !== -1 || sdc === "temperature") out.temperature = Number(st);
    if (uom === "%" || sdc === "humidity") out.humidity = Number(st);
    if (uom.toLowerCase() === "w" || sdc === "power") out.watts = Number(st);
    return out;
  }
  return { on: on };
}

export function haEntitiesFromStates(states) {
  if (!Array.isArray(states)) return [];
  var skip = { sun: 1, zone: 1, person: 1, device_tracker: 1, persistent_notification: 1, event: 1, update: 1, button: 1, todo: 1, calendar: 1, weather: 1, conversation: 1, tts: 1, stt: 1, assist_satellite: 1 };
  return states.filter(function (e) {
    var d = String(e.entity_id || "").split(".")[0];
    return e && e.entity_id && !skip[d] && e.state !== "unavailable";
  }).map(function (e) {
    var d = e.entity_id.split(".")[0];
    var kind = "switch";
    if (d === "light") kind = "light";
    else if (d === "climate" || d === "water_heater") kind = "climate";
    else if (d === "media_player" || d === "remote") kind = "media";
    else if (d === "cover") kind = "cover";
    else if (d === "fan") kind = "fan";
    else if (d === "lock") kind = "lock";
    else if (d === "vacuum") kind = "vacuum";
    else if (d === "binary_sensor" || d === "sensor") kind = "sensor";
    return {
      entity_id: e.entity_id,
      name: (e.attributes && (e.attributes.friendly_name || e.attributes.name)) || e.entity_id,
      friendly_name: e.attributes && e.attributes.friendly_name,
      kind: kind,
      state: e.state,
      attributes: e.attributes || {},
    };
  });
}

/* ---- Hue / Shelly payloads ----------------------------------------------- */
export function hueStateFrom(it, patch) {
  var st = it && it.smart ? it.smart : {};
  var p = patch || {};
  var on = p.on !== undefined ? !!p.on : !!st.on;
  var body = { on: on };
  var bri = fin(p.brightness) ? p.brightness : st.brightness;
  if (on && fin(bri)) body.bri = clamp(Math.round((bri / 100) * 254), 1, 254);
  var color = typeof p.color === "string" ? p.color : st.color;
  if (on && color) {
    var rgb = hexToRgb(color);
    if (rgb) {
      var hs = rgbToHueSat(rgb[0], rgb[1], rgb[2]);
      body.hue = hs.hue;
      body.sat = hs.sat;
    }
  }
  return body;
}

export function shellyRpcFrom(it, patch) {
  var cap = it && TYPE_CAP[it.type];
  var p = patch || {};
  var st = it && it.smart ? it.smart : {};
  var on = p.on !== undefined ? !!p.on : !!st.on;
  if (!cap) return { method: "Switch.Set", params: { id: 0, on: on } };
  if (cap.kind === "light") {
    var params = { id: 0, on: on };
    if (fin(p.brightness) || fin(st.brightness)) params.brightness = clamp(Math.round(p.brightness != null ? p.brightness : st.brightness), 0, 100);
    return { method: "Light.Set", params: params };
  }
  if (cap.kind === "cover") {
    var pos = fin(p.position) ? p.position : (on ? 100 : 0);
    return { method: "Cover.GoToPosition", params: { id: 0, pos: clamp(Math.round(pos), 0, 100) } };
  }
  return { method: "Switch.Set", params: { id: 0, on: on } };
}

export function hexToRgb(hex) {
  var m = String(hex || "").match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  var n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return hexStr(((clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)) >>> 0);
}
export function rgbToHueSat(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = max === 0 ? 0 : d / max;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { hue: Math.round((h / 360) * 65535), sat: Math.round(s * 254) };
}

/* ---- voice / text commands ----------------------------------------------- */
export function parseVoiceCommand(text, devices, lang) {
  var raw = String(text || "").trim();
  if (!raw) return null;
  var q = normName(raw);
  lang = lang || guessLang(raw);
  var sceneHit = matchScenePhrase(q, lang);
  if (sceneHit) return { type: "scene", sceneId: sceneHit };

  var allOff = lang === "he"
    ? /^(כבה הכל|כבו הכל|כבה את הכל|כיבוי כללי)$/.test(q)
    : /^(all off|turn everything off|lights? out)$/.test(q);
  if (allOff) return { type: "all", patch: { on: false } };

  var allOn = lang === "he"
    ? /^(הדלק הכל|הדליקו הכל|הדלק את הכל)$/.test(q)
    : /^(all on|turn everything on)$/.test(q);
  if (allOn) return { type: "all", patch: { on: true } };

  var lockMatch = lang === "he"
    ? /(נעל|לנעול|נעילה|נעול|נעלי)/.test(q)
    : /\b(lock)\b/.test(q);
  var unlockMatch = lang === "he"
    ? /(פתח נעילה|בטל נעילה|לפתוח נעילה|שחרר נעילה)/.test(q)
    : /\b(unlock)\b/.test(q);
  if (lockMatch && !unlockMatch) return { type: "command", kind: "lock", patch: { locked: true, on: false } };
  if (unlockMatch) return { type: "command", kind: "lock", patch: { locked: false, on: true } };

  var vacMatch = lang === "he"
    ? /(שואב|לשאוב|שאיבה|נקה בית|ניקיון רובוטי)/.test(q)
    : /\b(vacuum|clean|robot)\b/.test(q);
  if (vacMatch) {
    var isStop = lang === "he" ? /(עצור|חזור|עגינה|כבה)/.test(q) : /\b(stop|dock|return|off)\b/.test(q);
    return { type: "command", kind: "vacuum", patch: { on: !isStop, status: isStop ? "docked" : "cleaning" } };
  }

  var on = detectOnOff(q, lang);
  var kind = detectKind(q, lang);
  var room = detectRoom(q, devices || []);
  var temp = detectTemp(q);
  var bri = detectBrightness(q, lang);
  var patch = {};
  if (on !== null) patch.on = on;
  if (temp != null) {
    patch.targetTemp = temp;
    patch.on = true;
    kind = kind || "climate";
  }
  if (bri != null) {
    patch.brightness = bri;
    patch.on = bri > 0;
    kind = kind || "light";
  }
  if (!Object.keys(patch).length && !kind && !room) return null;
  if (!Object.keys(patch).length) patch.on = true;
  return { type: "command", kind: kind, room: room, patch: patch };
}

function guessLang(text) {
  return /[\u0590-\u05FF]/.test(text) ? "he" : "en";
}
function detectOnOff(q, lang) {
  if (lang === "he") {
    if (/(כבה|כבו|כבוי|סגור|סגרי)/.test(q)) return false;
    if (/(הדלק|הדליקי|הדליקו|פתח|פתחי|הפעל)/.test(q)) return true;
  } else {
    if (/\b(off|close|shut|stop)\b/.test(q)) return false;
    if (/\b(on|open|start|play)\b/.test(q)) return true;
  }
  return null;
}
function detectKind(q, lang) {
  var table = lang === "he"
    ? [
        [/אור|תאורה|מנור/, "light"],
        [/מזגן|מיזוג|תרמוסטט/, "climate"],
        [/טלוויז|טלויז|רמקול/, "media"],
        [/וילון|תריס/, "cover"],
        [/מאוורר|קולט/, "fan"],
        [/מקרר/, "fridge"],
        [/מנעול/, "lock"],
        [/שואב/, "vacuum"],
        [/שקע/, "plug"],
      ]
    : [
        [/\blights?\b|\blamps?\b|\bbulbs?\b/, "light"],
        [/\bac\b|\bclimate\b|\bhvac\b|\bair\b|\bthermostat\b/, "climate"],
        [/\btv\b|\btelevision\b|\bspeaker\b/, "media"],
        [/\bcurtains?\b|\bblinds?\b|\bcovers?\b/, "cover"],
        [/\bfan\b|\bhood\b/, "fan"],
        [/\bfridge\b|\brefrigerator\b/, "fridge"],
        [/\blocks?\b/, "lock"],
        [/\bvacuum\b|\brobot\b/, "vacuum"],
        [/\bplugs?\b|\boutlet\b/, "plug"],
      ];
  for (var i = 0; i < table.length; i++) if (table[i][0].test(q)) return table[i][1];
  return null;
}
function detectRoom(q, devices) {
  var rooms = [];
  (devices || []).forEach(function (d) {
    if (d.room && rooms.indexOf(d.room) === -1) rooms.push(d.room);
  });
  var best = "", bestLen = 0;
  rooms.forEach(function (r) {
    var n = normName(r);
    if (n && q.indexOf(n) !== -1 && n.length > bestLen) { best = r; bestLen = n.length; }
  });
  return best || "";
}
function detectTemp(q) {
  var m = q.match(/(\d{2})\s*(?:°|c|celsius|מעלות)?/);
  if (!m) return null;
  var n = parseInt(m[1], 10);
  return n >= 16 && n <= 32 ? n : null;
}
function detectBrightness(q, lang) {
  var m = q.match(/(\d{1,3})\s*%/);
  if (m) return clamp(parseInt(m[1], 10), 0, 100);
  if (lang === "he") {
    if (/עמעם|חלש|נמוך/.test(q)) return 20;
    if (/חזק|מלא|בהיר/.test(q)) return 100;
  } else {
    if (/\bdim\b|\blow\b/.test(q)) return 20;
    if (/\bbright\b|\bfull\b/.test(q)) return 100;
  }
  return null;
}
function matchScenePhrase(q, lang) {
  var map = lang === "he"
    ? [
        ["בוקר", "morning"],
        ["יציאה", "away"],
        ["away", "away"],
        ["סרט", "movie"],
        ["לילה", "night"],
        ["ערב", "dinner"],
        ["ארוחה", "dinner"],
        ["חסכוני", "eco"],
        ["חיסכון", "eco"],
        ["eco", "eco"],
      ]
    : [
        ["morning", "morning"],
        ["good morning", "morning"],
        ["away", "away"],
        ["leave", "away"],
        ["movie", "movie"],
        ["film", "movie"],
        ["night", "night"],
        ["sleep", "night"],
        ["dinner", "dinner"],
        ["eco", "eco"],
        ["energy", "eco"],
      ];
  for (var i = 0; i < map.length; i++) {
    if (q.indexOf(map[i][0]) !== -1 && (lang === "he" ? /סצנ|מצב|scene/.test(q) || map[i][0].length > 3 || q === map[i][0] : true)) {
      if (lang === "en" && (q.indexOf("scene") !== -1 || /^(good )?morning$|^away$|^movie( night)?$|^night$|^dinner$|^eco$/.test(q) || q.indexOf(map[i][0]) !== -1))
        return map[i][1];
      if (lang === "he") return map[i][1];
    }
  }
  if (lang === "en" && /\bmovie\b/.test(q)) return "movie";
  if (lang === "he" && /סרט/.test(q)) return "movie";
  return null;
}

export function executeParsedCommand(parsed, items) {
  if (!parsed) return 0;
  items = items || S.items || [];
  if (parsed.type === "scene") {
    var sceneObj = (ensureSmartHome().scenes || []).find(function (s) { return s.id === parsed.sceneId; });
    return applyScene(sceneObj, items, { source: "voice" });
  }
  var n = 0;
  var rooms = detectRooms();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var cap = TYPE_CAP[it.type];
    if (!cap) continue;
    if (parsed.type === "command") {
      if (parsed.kind && cap.kind !== parsed.kind) continue;
      if (parsed.room && itemRoomName(it, rooms) !== parsed.room) continue;
    }
    applyCommand(it, parsed.patch, { silent: true, source: "voice" });
    n++;
  }
  emitSmartChange({ parsed: parsed, count: n, source: "voice" });
  return n;
}

/* ---- automations --------------------------------------------------------- */
export function evaluateAutomations(autos, ctx) {
  autos = autos || ensureSmartHome().automations || [];
  ctx = ctx || {};
  var fired = [];
  for (var i = 0; i < autos.length; i++) {
    var a = autos[i];
    if (!a || !a.enabled || !a.trigger) continue;
    if (matchTrigger(a.trigger, ctx)) fired.push(a);
  }
  return fired;
}

function matchTrigger(tr, ctx) {
  if (tr.type === "hour") return Number(ctx.hour) === Number(tr.hour);
  if (tr.type === "sun") return ctx.sun === tr.event;
  if (tr.type === "sensor") {
    if (!ctx.sensor) return false;
    var stype = ctx.sensor.sensorType || ctx.sensor.type;
    if (tr.sensorType && stype !== tr.sensorType) return false;
    return ctx.sensor.value === tr.equals;
  }
  if (tr.type === "temp_above") {
    return ctx.temperature != null && ctx.temperature > tr.threshold;
  }
  if (tr.type === "temp_below") {
    return ctx.temperature != null && ctx.temperature < tr.threshold;
  }
  if (tr.type === "power_above") {
    return ctx.totalWatts != null && ctx.totalWatts > tr.threshold;
  }
  if (tr.type === "deviceKind") {
    var d = ctx.device;
    return d && d.kind === tr.kind && d.smart && d.smart[tr.attr] === tr.equals;
  }
  if (tr.type === "device") {
    return ctx.item && String(ctx.item.id) === String(tr.itemId) && ctx.item.smart && ctx.item.smart[tr.attr] === tr.equals;
  }
  return false;
}

export function runAutomationAction(action, items) {
  if (!action) return 0;
  if (action.type === "scene") {
    var sceneObj = (ensureSmartHome().scenes || []).find(function (s) { return s.id === action.sceneId; });
    return applyScene(sceneObj, items, { source: "automation" });
  }
  if (action.type === "kind") {
    var n = 0;
    (items || S.items || []).forEach(function (it) {
      var cap = TYPE_CAP[it.type];
      if (cap && cap.kind === action.kind) {
        applyCommand(it, action.patch, { silent: true, source: "automation" });
        n++;
      }
    });
    emitSmartChange({ source: "automation", count: n });
    return n;
  }
  if (action.type === "room") {
    var nr = 0;
    var rms = detectRooms();
    (items || S.items || []).forEach(function (it) {
      if (!TYPE_CAP[it.type]) return;
      if (itemRoomName(it, rms) === action.room) {
        applyCommand(it, action.patch, { silent: true, source: "automation" });
        nr++;
      }
    });
    emitSmartChange({ source: "automation", count: nr });
    return nr;
  }
  if (action.type === "device") {
    var target = (items || S.items || []).find(function (x) { return String(x.id) === String(action.itemId); });
    if (target) {
      applyCommand(target, action.patch, { silent: true, source: "automation" });
      emitSmartChange({ source: "automation", count: 1 });
      return 1;
    }
  }
  return 0;
}

export function newId(prefix) {
  return (prefix || "sh") + "-" + uid();
}

export { TYPE_CAP, KIND_HA };
