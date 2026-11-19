import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../vendor/three/three.core.js";
import { S } from "../js/state.js";
import { spotFlux } from "../js/room_bounce.js";
import {
  admittedSunFlux, backdropLook, bindWindowOccluders, CLEAR_GLASS, clearWindowSize, daylightCalibration,
  exteriorWindow, followDoorShadow, openingTransmittance, plannerTracerSky, solarState,
  syncDoorDaylight, trackDaylightDoor, windowSkyRGB, WINDOW_ANGLE, WINDOW_PENUMBRA,
} from "../js/view3d/backdrop.js";

const rect = (z0, z1) => ({ pts: [{ x: 0, z: z0 }, { x: 400, z: z0 }, { x: 400, z: z1 }, { x: 0, z: z1 }] });
const opening = { type: "window", width: 120, height: 130, sill: 80, s: 160 };

test("only exterior glazing emits sky flux, proportional to its clear area in cm²", () => {
  const savedNodes = S.nodes;
  try {
    S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }];
    const wall = { a: 0, b: 1, height: 260, thickness: 10 };
    const room = rect(0, 300), next = rect(-250, 0);
    assert.equal(exteriorWindow(opening, wall, [room, next]), null);
    assert.equal(exteriorWindow(opening, wall, []), null);
    const ap = exteriorWindow(opening, wall, [room]);
    assert.equal(ap.room, room);
    assert.equal(ap.nz, 1);
    assert.equal(exteriorWindow(opening, wall, [next]).nz, -1);
    assert.equal(ap.area, (120 - 2) * (130 - 6));
    assert.ok(Math.abs(spotFlux(ap.baseI, WINDOW_ANGLE, WINDOW_PENUMBRA) - CLEAR_GLASS * ap.area) < 1e-8);
    assert.ok(ap.reach >= 4 * Math.hypot(400 - ap.x, 300 - ap.z, ap.y));
    const double = exteriorWindow({ ...opening, width: 238 }, wall, [room]);
    assert.equal(double.baseI, 2 * ap.baseI);
    assert.equal(clearWindowSize({ ...opening, frMull: 200 }).area, 0);
  } finally { S.nodes = savedNodes; }
});

test("exterior passages, glazed sliders and moving opaque doors admit only their transmitted flux", () => {
  const savedNodes = S.nodes;
  try {
    S.nodes = [{ x: 0, z: 0 }, { x: 400, z: 0 }];
    const wall = { a: 0, b: 1, height: 260, thickness: 10 }, rooms = [rect(0, 300)];
    const door = { ...opening, type: "door", sill: 0, open: false };
    const a = exteriorWindow(door, wall, rooms);
    assert.equal(a.baseI, 0);
    const direction = new THREE.Vector3(0, 0.2, -1).normalize();
    assert.equal(admittedSunFlux(a, direction, 10), 0);
    assert.equal(exteriorWindow({ ...door, paired:["mate"], type:"passage" }, wall, rooms), null);
    const passage = exteriorWindow({ ...door, type:"passage" }, wall, rooms);
    assert.equal(passage.baseI, passage.fullBaseI);
    assert.equal(openingTransmittance({ ...door, isSliding:true, mat:"glass" }), 0.9);
    assert.equal(openingTransmittance({ ...door, isSliding:true, open:true }), 0.9);
    const light = new THREE.SpotLight(), pivot = new THREE.Group(), shadow = new THREE.Group();
    light.userData = { aperture: a, maskRoom: 3 };
    pivot.userData.type = "swing";
    trackDaylightDoor(door, pivot);
    followDoorShadow(pivot, shadow);
    let fits = 0;
    for (const [angle, time] of [[Math.PI / 3, 100], [Math.PI / 2, 250], [0, 500]]) {
      pivot.rotation.y = angle;
      syncDoorDaylight(true, time, [light], 2, () => fits++);
      assert.ok(Math.abs(light.intensity - 2 * a.fullBaseI * (1 - Math.cos(angle))) < 1e-7);
      shadow.updateMatrixWorld(true);
      assert.ok(shadow.matrixWorld.equals(pivot.matrix));
    }
    syncDoorDaylight(false, 501, [light], 2, () => fits++);
    assert.equal(light.intensity, 0);
    assert.equal(light.userData.maskRoom, 3);
    assert.ok(fits >= 3);
  } finally { S.nodes = savedNodes; }
});

test("an exterior solar aperture projects onto the beam, and deep window reveals clip grazing light", () => {
  const thin = { nx: 0, nz: 1, w: 100, h: 80, depth: 0 };
  const sunny = new THREE.Vector3(0, 0.6, -0.8);
  const flux = admittedSunFlux(thin, sunny, 4);
  assert.ok(Math.abs(flux - 8000 * 0.8 * CLEAR_GLASS * 4) < 1e-8);
  assert.equal(admittedSunFlux(thin, { x:0, y:0.6, z:0.8 }, 4), 0);
  assert.equal(admittedSunFlux(thin, { x:0, y:-0.6, z:-0.8 }, 4), 0);
  assert.equal(admittedSunFlux(thin, sunny, 0), 0);
  assert.ok(admittedSunFlux({ ...thin, depth: 20 }, sunny, 4) < flux);
  assert.equal(admittedSunFlux({ ...thin, depth: 110 }, sunny, 4), 0);
});

test("a roof or wall shading the window intercepts direct sun before it contributes bounce", () => {
  const aperture = { x: 0, y: 100, z: 10, nx: 0, nz: 1, w: 40, h: 30, depth: 12 };
  const direction = new THREE.Vector3(0, 0.3, -1).normalize();
  const blocker = new THREE.Mesh(new THREE.BoxGeometry(90, 80, 4), new THREE.MeshStandardMaterial());
  blocker.castShadow = true;
  blocker.layers.set(5); // full-height caster retained by a cutaway view
  blocker.position.set(0, 105, -25);
  const building = new THREE.Group(); building.add(blocker);
  bindWindowOccluders(aperture, THREE, [building]);
  assert.equal(admittedSunFlux(aperture, direction, 4), 0);
  blocker.position.x += 44;
  bindWindowOccluders(aperture, THREE, [building]);
  const partial = admittedSunFlux(aperture, direction, 4);
  assert.ok(partial > 0);
  const empty = { ...aperture, sunVisibility: null };
  assert.ok(partial < admittedSunFlux(empty, direction, 4));
});

test("the deep reveal and an outside obstruction attenuate the diffuse sky seen through glazing", () => {
  const ap = { x: 0, y: 120, z: 10, nx: 0, nz: 1, w: 100, h: 100, area: 10000,
    depth: 12, transmission: CLEAR_GLASS };
  const building = new THREE.Group();
  bindWindowOccluders(ap, THREE, [building]);
  assert.ok(ap.skyView > 0.6 && ap.skyView < 1);
  assert.ok(Math.abs(spotFlux(ap.baseI, WINDOW_ANGLE, WINDOW_PENUMBRA) - CLEAR_GLASS * ap.area * ap.skyView) < 1e-7);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2000, 2000, 2), new THREE.MeshStandardMaterial());
  wall.castShadow = true; wall.position.set(0, 150, -20); building.add(wall);
  bindWindowOccluders(ap, THREE, [building]);
  assert.equal(ap.skyView, 0);
  assert.equal(ap.baseI, 0);
});

test("sun fades continuously at the horizon while exterior sky persists into civil twilight", () => {
  assert.equal(solarState(0, 0).sky, 0);
  assert.equal(solarState(12, 0).sky, 1);
  for (const hour of [6, 18]) {
    const before = solarState(hour - 1e-5, 0), after = solarState(hour + 1e-5, 0);
    assert.ok(Math.abs(before.day - after.day) < 1e-4);
    assert.ok(Math.abs(before.sky - after.sky) < 1e-4);
    assert.ok(Math.abs(solarState(hour, 0).sky - 0.5) < 1e-9);
  }
  const dusk = solarState(18.25, 0);
  assert.equal(dusk.day, 0);
  assert.ok(dusk.sky > 0 && dusk.sky < 0.5);
  const b = { r: 0.3, g: 0.5, b: 0.9 };
  const rgb = windowSkyRGB(b, b, 1), half = windowSkyRGB(b, b, 0.5);
  assert.ok(rgb[2] > rgb[1] && rgb[1] > rgb[0]);
  assert.deepEqual(half, rgb.map(v => 0.5 * v));
});

test("noon and night use their calibrated sky and camera grades", () => {
  const zen = new THREE.Color(0x5f93c8), hor = new THREE.Color(0xd8e6f2);
  const look = { sunScale: 1, envScale: 1, exposureScale: 1 };
  const noon = daylightCalibration(solarState(12, 0), zen, hor, look);
  const { envStrength } = noon;
  assert.equal(envStrength, 0.53);
  assert.equal(noon.exposure, 1.28);
  const night = daylightCalibration(solarState(23, 0), zen, hor, look);
  assert.equal(night.direct, 0);
  assert.equal(night.exposure, 1.1);
  assert.ok(night.envStrength < envStrength);
  const pt = plannerTracerSky(zen, hor, hor, envStrength, 1);
  assert.ok(Math.abs(1.35 * pt.zenith[0] - envStrength * 0.55 * zen.r) < 1e-7);
  assert.ok(Math.abs(1.35 * pt.horizon[1] - envStrength * 0.6 * hor.g) < 1e-7);
  assert.ok(Math.abs(1.35 * pt.ground[2] - envStrength * 0.75 * 0.8 * hor.b) < 1e-7);
});

test("dusk dims the sun and window without shutting the camera down", () => {
  const day = backdropLook("studio", true, true), night = backdropLook("studio", true, false);
  function rig(hour) {
    const solar = solarState(hour, 0);
    const blend = key => new THREE.Color(night[key]).lerp(new THREE.Color(day[key]), solar.sky);
    return daylightCalibration(solar, blend("zenith"), blend("horizon"), day);
  }
  const sunset = rig(18), before = rig(18 - 0.0001), after = rig(18 + 0.0001);
  assert.ok(before.direct > 0 && before.direct < 0.001);
  assert.equal(sunset.direct, 0);
  assert.ok(sunset.windowRGB[1] > rig(21).windowRGB[1]);
  assert.ok(Math.abs(before.windowRGB[1] - after.windowRGB[1]) < 0.001);
  assert.ok(Math.abs(before.exposure - after.exposure) < 0.001);
  assert.ok(rig(17).exposure > sunset.exposure && sunset.exposure > rig(21).exposure);
});
