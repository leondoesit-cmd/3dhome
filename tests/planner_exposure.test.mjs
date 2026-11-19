import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../vendor/three/three.webgpu.js";
import { THREE } from "../js/three_lazy.js";
import { FURN } from "../js/furniture_models.js";
import { fixtureOptics, lampChromaticity, limitPaintReflectance } from "../js/primitives.js";
import { plannerLampIntensity } from "../js/gpu.js";
import { skyRadiance } from "../js/sky_model.js";
import { roomInspectionFill, roomIrradiance, roomSurface, spotFlux } from "../js/room_bounce.js";
import { backdropLook, clearWindowSize, CLEAR_GLASS, configurePlannerOutput, daylightCalibration, solarState,
  WINDOW_ANGLE, WINDOW_PENUMBRA } from "../js/view3d/backdrop.js";

Object.assign(THREE, core);
const { TSL } = core;
const output = {};
configurePlannerOutput(output, core);
const toneMap = new core.StandardNodeLibrary().getToneMappingFunction(output.toneMapping);
assert.equal(output.outputColorSpace, core.SRGBColorSpace);

// Evaluate the constant arithmetic graph of the vendored TSL tone mapper.
// This runs its matrices, exposure bias, fitted curve and clamp on the CPU.
function evaluate(node) {
  if (node.isVarNode) return evaluate(node.node);
  if (node.isShaderCallNodeInternal) return evaluate(node.shaderNode.jsFunc(node.rawInputs));
  if (node.isConstNode) {
    if (typeof node.value === "number") return new core.Vector3().setScalar(node.value);
    return node.value.clone();
  }
  const a = evaluate(node.aNode), b = evaluate(node.bNode);
  if (node.method === "clamp") return a.clamp(b, evaluate(node.cNode));
  if (a.isMatrix3 && node.op === "*") return b.applyMatrix3(a);
  const operation = { "+": "add", "-": "sub", "*": "multiply", "/": "divide" }[node.op];
  assert.ok(operation, node.type);
  return a[operation](b);
}

function displayRadiance(rgb, exposure) {
  const linear = evaluate(toneMap(TSL.vec3(...rgb), TSL.float(exposure)));
  return new core.Color(...linear.toArray()).convertLinearToSRGB().toArray();
}

function display(irradiance, albedo, exposure) {
  const rgb = Array.isArray(albedo) ? albedo : [albedo, albedo, albedo];
  return displayRadiance(irradiance.map((c, i) => c * rgb[i] / Math.PI), exposure);
}

// Integrate direct sun and the projected sky on a horizontal white floor.
function exteriorFloor(look, zen, hor, solar, sun, calibration) {
  const normalY = Math.sin(solar.elevation), normalZ = Math.cos(solar.elevation);
  const direction = [0, normalY, normalZ];
  const ground = new core.Color("#" + look.envGround);
  const sky = {
    zenith: zen.toArray().map(c => 0.55 * c), horizon: hor.toArray().map(c => 0.6 * c),
    ground: [0.9 * ground.r, ground.g, 0.8 * ground.b],
    sunColor: sun.color.toArray(), sunI: 0, glowI: 0.9 * solar.day,
  };
  const floor = sky.sunColor.map(c => sun.intensity * c * Math.max(0, normalY));
  const rows = 48, cols = 64, omega = 4 * Math.PI / (rows * cols);
  for (let i = 0; i < rows; i++) {
    const y = 2 * (i + 0.5) / rows - 1, radius = Math.sqrt(1 - y*y);
    for (let j = 0; j < cols; j++) {
      const angle = 2 * Math.PI * (j + 0.5) / cols;
      const ray = [radius * Math.cos(angle), y, radius * Math.sin(angle)];
      skyRadiance(ray, direction, sky).forEach((c, k) => {
        const sample = c * calibration.envStrength * omega;
        floor[k] += sample * Math.max(0, y);
      });
    }
  }
  return floor;
}

function scene(hour) {
  const solar = solarState(hour, 0), look = backdropLook("studio", true, solar.sky > 0);
  const zen = new core.Color(look.zenith), hor = new core.Color(look.horizon);
  const sun = new core.DirectionalLight();
  sun.color.set(0xfff1db).lerp(new core.Color(0xff7a36), 1 - core.MathUtils.clamp(solar.elevation / 0.7, 0, 1));
  const p = daylightCalibration(solar, zen, hor, look);
  sun.intensity = p.direct;
  const [w, d] = hour === 21 ? [450, 350] : [300, 250];
  const room = { key: "A", pts: [{x:0,z:0},{x:w,z:0},{x:w,z:d},{x:0,z:d}] };
  const finish = { area: roomSurface(room, 260), rho: [0.5, 0.5, 0.5] };
  // Two nominal 1 m windows face away from the sun. Both contribute bounce;
  // only one faces the wall probe. Night retains the original lamp test room.
  const sky = p.windowRGB;
  const light = new core.SpotLight();
  light.angle = WINDOW_ANGLE; light.penumbra = WINDOW_PENUMBRA;
  light.color.setRGB(...sky).multiplyScalar(1 / Math.max(...sky));
  const area = clearWindowSize({ type: "window", width: 100, height: 100 }).area;
  const flux = (hour === 21 ? 10000 : area * CLEAR_GLASS) * Math.max(...sky);
  light.intensity = flux / spotFlux(1, light.angle, light.penumbra);
  const sources = [{ x: 225, z: 1, flux, color: light.color.toArray() }];
  if (hour !== 21) sources.push({ ...sources[0], x: 75 });
  const corner = roomIrradiance([room], sources, [finish], 260)[0];
  const exposure = p.exposure;
  const fill = roomInspectionFill({ daylight: solar.day });
  const floor = exteriorFloor(look, zen, hor, solar, sun, p);
  const bounce = corner.map(c => Math.max(c, fill));
  const wall = bounce.map((c, i) => c + light.color.toArray()[i] * light.intensity / 10000);
  return { exposure, wall, floor, room, finish, corner: bounce };
}

test("17 h Studio/Soft holds direct white and retains detail in a shaded interior", t => {
  const day = scene(17);
  const paint = limitPaintReflectance(new core.MeshStandardMaterial({ color: 0xeeeeee }));
  const sample = (light, albedo) => display(light, albedo, day.exposure);
  const wall = sample(day.wall, paint.color.r), corner = sample(day.corner, paint.color.r);
  const floor = sample(day.floor, paint.color.r);
  const wood = [0xb79971, 0x9b815f].map(hex => sample(day.wall, new core.Color(hex).toArray()));
  t.diagnostic(JSON.stringify({ exposure: day.exposure, wall, corner, floor, wood }));
  // Frozen display sRGB from the pre_light3 rig and vendored ACES: two
  // 100 cm nominal windows, I = legacyIntensity(0.9, 660) * 0.6 * day,
  // blue sky #cfe2f2, 0.44*pi cones, neutral rho=0.5, Soft gain=1.1264.
  // The reference floor includes the masked hemisphere and HDR solar disc.
  function relative(rgb, expected, tolerance) {
    rgb.forEach((c, i) => assert.ok(Math.abs(c / expected[i] - 1) < tolerance,
      c + " outside tolerance for " + expected[i]));
  }
  relative(wall, [0.65779, 0.70165, 0.73621], 0.15);
  relative(corner, [0.13570, 0.15553, 0.17630], 0.20);
  relative(floor, [0.76035, 0.72906, 0.71893], 0.15);
  assert.ok(Math.max(...floor) < 0.97);
  assert.ok(Math.min(...wood[1]) > 0.1 && Math.max(...wood[0]) < 0.9);
  assert.ok(wood[0][1] - wood[1][1] > 0.05);
});

test("21 h Studio/Soft preserves a white wall one metre sideways from the linen shade", t => {
  const night = scene(21), def = FURN.floorLamp;
  const group = new core.Group(), item = {type:"floorLamp", w:def.w, d:def.d, h:def.h};
  def.build(group, item);
  const parts = fixtureOptics(group, item, core, def.lamp).parts;
  const halo = parts.find(p => p.diffuseShade);
  // At shade height both axial beams miss. The side wall faces the finite emitter.
  const intensity = plannerLampIntensity(item, def.lamp);
  const cutoff = (1 - (100 / (4 * def.lamp.dist))**4)**2;
  const e = intensity * halo.fraction * cutoff / (100**2 + halo.radius**2);
  const color = lampChromaticity(new core.Color(), def.lamp.color).toArray();
  const sources = parts.map(p => ({ x:225, z:175, color, flux: 4 * Math.PI * intensity * p.fraction }));
  const indirect = roomIrradiance([night.room], sources, [night.finish], 260)[0];
  const rgb = color.map((c, i) => c * e + indirect[i] + night.corner[i]);
  const wall = display(rgb, 0.85, night.exposure);
  t.diagnostic(JSON.stringify({ exposure: night.exposure, wall }));
  assert.ok(Math.abs(night.exposure - 0.968) < 1e-8);
  const baseline = [0.58862, 0.52606, 0.39227];
  wall.forEach((c, i) => assert.ok(Math.abs(c - baseline[i]) < 0.001));
});
