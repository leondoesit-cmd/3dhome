import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import {
  applyCommand,
  applyScene,
  autoBind,
  defaultScenes,
  devicePowered,
  ensureSmart,
  ensureSmartHome,
  executeParsedCommand,
  flattenHaCalls,
  haEntitiesFromStates,
  haServiceFor,
  hueStateFrom,
  isSmartType,
  listDevices,
  loadSmart,
  matchScore,
  parseVoiceCommand,
  setBinding,
  shellyRpcFrom,
  snapshotSmart,
  stateFromHaEntity,
  evaluateAutomations,
  runAutomationAction,
} from "../js/smarthome.js";

function lamp(id, x, z) {
  return { id: id, type: "ceilingLight", x: x, z: z, w: 46, d: 46, h: 10, rot: 0 };
}
function ac(id, x, z) {
  return { id: id, type: "ac", x: x, z: z, w: 90, d: 24, h: 28, rot: 0 };
}
function tv(id, x, z) {
  return { id: id, type: "tv", x: x, z: z, w: 120, d: 40, h: 55, rot: 0 };
}

function squareRoom() {
  S.nodes = [
    { x: 0, z: 0 },
    { x: 400, z: 0 },
    { x: 400, z: 300 },
    { x: 0, z: 300 },
  ];
  S.walls = [
    { id: 1, a: 0, b: 1, thickness: 10, height: 270 },
    { id: 2, a: 1, b: 2, thickness: 10, height: 270 },
    { id: 3, a: 2, b: 3, thickness: 10, height: 270 },
    { id: 4, a: 3, b: 0, thickness: 10, height: 270 },
  ];
  S.roomMeta = { "1,2,3,4": { name: "Kitchen" } };
  S.items = [];
  S.smarthome = null;
  ensureSmartHome();
}

test("lamps, climate and TVs are controllable and lights write the 3D fields", () => {
  squareRoom();
  var it = lamp(10, 50, 50);
  assert.equal(isSmartType(it.type), true);
  applyCommand(it, { on: true, brightness: 40, color: "#88aaff" });
  assert.equal(it.lightOn, true);
  assert.equal(it.lightI, 0.4);
  assert.equal(it.lightColor, 0x88aaff);
  applyCommand(it, { on: false });
  assert.equal(devicePowered(it), false);
  assert.equal(it.lightOn, false);

  var unit = ac(11, 80, 80);
  applyCommand(unit, { on: true, hvacMode: "heat", targetTemp: 21 });
  assert.equal(unit.smart.hvacMode, "heat");
  assert.equal(unit.smart.targetTemp, 21);
  applyCommand(unit, { on: false });
  assert.equal(unit.smart.hvacMode, "off");
});

test("scenes change every matching appliance in the plan", () => {
  squareRoom();
  var a = lamp(1, 40, 40), b = tv(2, 200, 120), c = ac(3, 300, 40);
  S.items = [a, b, c];
  var movie = defaultScenes().find((s) => s.id === "movie");
  var n = applyScene(movie, S.items);
  // movie is lights + media (+ covers); climate is not a matching appliance
  assert.equal(n, 2);
  assert.equal(a.smart.brightness, 12);
  assert.equal(b.smart.on, true);
  var away = defaultScenes().find((s) => s.id === "away");
  applyScene(away, S.items);
  assert.equal(a.smart.on, false);
  assert.equal(b.smart.on, false);
});

test("voice commands parse English and Hebrew and drive the matching kind", () => {
  squareRoom();
  var kitchenLamp = lamp(1, 50, 50);
  var livingTv = tv(2, 200, 150);
  S.items = [kitchenLamp, livingTv];
  S.roomMeta["1,2,3,4"] = { name: "Kitchen" };

  var en = parseVoiceCommand("turn off the kitchen lights", listDevices(S.items), "en");
  assert.equal(en.type, "command");
  assert.equal(en.kind, "light");
  assert.equal(en.patch.on, false);

  var he = parseVoiceCommand("הדלק אורות", listDevices(S.items), "he");
  assert.equal(he.kind, "light");
  assert.equal(he.patch.on, true);

  var movie = parseVoiceCommand("movie night", [], "en");
  assert.equal(movie.type, "scene");
  assert.equal(movie.sceneId, "movie");

  executeParsedCommand({ type: "all", patch: { on: false } }, S.items);
  assert.equal(kitchenLamp.smart.on, false);
  assert.equal(livingTv.smart.on, false);
});

test("Home Assistant services and inbound states round-trip", () => {
  squareRoom();
  var it = lamp(5, 10, 10);
  S.items = [it];
  ensureSmart(it);
  setBinding(5, { proto: "ha", entityId: "light.kitchen" });
  var call = flattenHaCalls(haServiceFor(it, { on: true, brightness: 55, color: "#ff0000" }))[0];
  assert.equal(call.domain, "light");
  assert.equal(call.service, "turn_on");
  assert.equal(call.data.brightness_pct, 55);
  assert.deepEqual(call.data.rgb_color, [255, 0, 0]);

  var off = flattenHaCalls(haServiceFor(it, { on: false }))[0];
  assert.equal(off.service, "turn_off");

  var fromHa = stateFromHaEntity({
    entity_id: "light.kitchen",
    state: "on",
    attributes: { brightness: 128, rgb_color: [0, 255, 0] },
  });
  assert.equal(fromHa.on, true);
  assert.equal(fromHa.brightness, 50);
  assert.equal(fromHa.color, "#00ff00");

  var climate = ac(6, 20, 20);
  S.items.push(climate);
  ensureSmart(climate);
  setBinding(6, { proto: "ha", entityId: "climate.living" });
  var heat = flattenHaCalls(haServiceFor(climate, { hvacMode: "heat", targetTemp: 22 }));
  assert.ok(heat.some((c) => c.service === "set_hvac_mode"));
  assert.ok(heat.some((c) => c.service === "set_temperature"));
});

test("auto-bind scores a kitchen light onto light.kitchen_ceiling", () => {
  squareRoom();
  S.items = [lamp(1, 80, 80)];
  var devices = listDevices(S.items);
  devices[0].room = "Kitchen";
  var entities = haEntitiesFromStates([
    { entity_id: "light.kitchen_ceiling", state: "on", attributes: { friendly_name: "Kitchen ceiling" } },
    { entity_id: "climate.bedroom", state: "cool", attributes: { friendly_name: "Bedroom AC" } },
  ]);
  var pairs = autoBind(devices, entities);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].entity.entity_id, "light.kitchen_ceiling");
  assert.ok(matchScore(devices[0], entities[0]) > matchScore(devices[0], entities[1]));
});

test("Hue and Shelly payloads follow the live device patch", () => {
  var it = lamp(1, 0, 0);
  applyCommand(it, { on: true, brightness: 50, color: "#0000ff" });
  var hue = hueStateFrom(it, { on: true, brightness: 50 });
  assert.equal(hue.on, true);
  assert.equal(hue.bri, 127);
  assert.ok(hue.sat > 200);
  var shelly = shellyRpcFrom(it, { on: true, brightness: 80 });
  assert.equal(shelly.method, "Light.Set");
  assert.equal(shelly.params.brightness, 80);
  var washer = { id: 2, type: "washer", x: 0, z: 0, w: 60, d: 60, h: 85 };
  applyCommand(washer, { on: true });
  assert.equal(shellyRpcFrom(washer, { on: true }).method, "Switch.Set");
});

test("hub snapshot never stores tokens and load restores bindings", () => {
  squareRoom();
  setBinding(9, { proto: "ha", entityId: "light.a", host: "http://192.168.1.10:8123" });
  var snap = snapshotSmart();
  assert.equal(snap.bindings["9"].entityId, "light.a");
  assert.equal(JSON.stringify(snap).indexOf("Bearer"), -1);
  S.smarthome = null;
  loadSmart(snap);
  assert.equal(ensureSmartHome().bindings["9"].entityId, "light.a");
});

test("hour automations fire the night scene", () => {
  squareRoom();
  var it = lamp(1, 10, 10);
  S.items = [it];
  applyCommand(it, { on: true, brightness: 90 });
  var fired = evaluateAutomations(ensureSmartHome().automations, { hour: 18 });
  assert.ok(fired.some((a) => a.id === "sunset-lights"));
  runAutomationAction(fired[0].action, S.items);
  assert.equal(it.smart.on, true);
  assert.equal(it.smart.brightness, 60);
});

test("smart sensors, locks, vacuums and plugs maintain state and HA mapping", async () => {
  const {
    addAutomation,
    createSceneFromCurrentState,
    deleteAutomation,
    deleteScene,
    estimatePowerUsage,
    roomEnvironment,
  } = await import("../js/smarthome.js");

  squareRoom();
  var mot = { id: 20, type: "motionSensor", x: 50, z: 50, w: 10, d: 10, h: 10 };
  var door = { id: 21, type: "contactSensor", x: 60, z: 60, w: 10, d: 10, h: 10 };
  var temp = { id: 22, type: "tempSensor", x: 70, z: 70, w: 10, d: 10, h: 10 };
  var lock = { id: 23, type: "smartLock", x: 80, z: 80, w: 15, d: 15, h: 25 };
  var vac = { id: 24, type: "vacuum", x: 90, z: 90, w: 35, d: 35, h: 10 };
  var plug = { id: 25, type: "smartPlug", x: 100, z: 100, w: 10, d: 10, h: 10 };

  S.items = [mot, door, temp, lock, vac, plug];

  applyCommand(mot, { motion: true });
  assert.equal(mot.smart.motion, true);

  applyCommand(lock, { locked: false });
  assert.equal(lock.smart.locked, false);
  assert.equal(devicePowered(lock), true);
  applyCommand(lock, { locked: true });
  assert.equal(lock.smart.locked, true);
  assert.equal(devicePowered(lock), false);

  applyCommand(vac, { on: true, status: "cleaning" });
  assert.equal(vac.smart.status, "cleaning");
  assert.equal(devicePowered(vac), true);

  applyCommand(plug, { on: true, watts: 150 });
  assert.equal(plug.smart.watts, 150);
  assert.equal(devicePowered(plug), true);

  // Home assistant translations
  setBinding(23, { proto: "ha", entityId: "lock.front_door" });
  var lockCall = flattenHaCalls(haServiceFor(lock, { locked: true }))[0];
  assert.equal(lockCall.domain, "lock");
  assert.equal(lockCall.service, "lock");

  setBinding(24, { proto: "ha", entityId: "vacuum.robot" });
  var vacCall = flattenHaCalls(haServiceFor(vac, { on: true, status: "cleaning" }))[0];
  assert.equal(vacCall.domain, "vacuum");
  assert.equal(vacCall.service, "start");
});

test("energy calculation and room environment aggregates correctly", async () => {
  const { estimatePowerUsage, roomEnvironment } = await import("../js/smarthome.js");
  squareRoom();

  var l1 = lamp(1, 50, 50);
  var ac1 = ac(2, 60, 60);
  var p1 = { id: 3, type: "smartPlug", x: 70, z: 70, w: 10, d: 10, h: 10 };
  var th = { id: 4, type: "tempSensor", x: 80, z: 80, w: 10, d: 10, h: 10 };

  S.items = [l1, ac1, p1, th];
  applyCommand(l1, { on: true, brightness: 100 });
  applyCommand(ac1, { on: true, hvacMode: "cool", targetTemp: 22 });
  applyCommand(p1, { on: true, watts: 200 });
  applyCommand(th, { temperature: 24, humidity: 45 });

  var pow = estimatePowerUsage(S.items);
  assert.ok(pow.totalWatts > 1000);
  assert.ok(pow.kwhDaily > 0);
  assert.ok(pow.costMonthly > 0);
  assert.ok(pow.byCategory.lighting > 0);
  assert.ok(pow.byCategory.climate > 0);

  var env = roomEnvironment("Kitchen", S.items);
  assert.equal(env.temperature, 24);
  assert.equal(env.humidity, 45);
  assert.ok(env.watts > 0);
});

test("custom scenes and automations CRUD works", async () => {
  const {
    addAutomation,
    createSceneFromCurrentState,
    deleteAutomation,
    deleteScene,
    evaluateAutomations,
  } = await import("../js/smarthome.js");

  squareRoom();
  var l1 = lamp(1, 50, 50);
  S.items = [l1];
  applyCommand(l1, { on: true, brightness: 75, color: "#ff8800" });

  var sc = createSceneFromCurrentState("Party Scene", "ph-balloon");
  assert.ok(sc.id.startsWith("sc-") || sc.id.startsWith("sc"));
  assert.equal(sc.name, "Party Scene");
  assert.equal(ensureSmartHome().scenes.length, 7);

  // Add automation
  var auto = addAutomation({
    name: "Motion Lights",
    trigger: { type: "sensor", sensorType: "motion", equals: true },
    action: { type: "scene", sceneId: sc.id },
  });
  assert.ok(auto.id.startsWith("auto-") || auto.id.startsWith("auto"));

  var fired = evaluateAutomations(ensureSmartHome().automations, {
    sensor: { type: "motion", value: true },
  });
  assert.ok(fired.some((a) => a.id === auto.id));

  // Delete
  deleteAutomation(auto.id);
  assert.equal(ensureSmartHome().automations.some((a) => a.id === auto.id), false);

  deleteScene(sc.id);
  assert.equal(ensureSmartHome().scenes.some((s) => s.id === sc.id), false);
});
