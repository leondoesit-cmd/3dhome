// js/light_loop.js: the planner's lights that cast no shadow are drawn by one
// loop over a uniform array instead of one block of shader code each. These
// check what the loop is fed (which lights, in which order, packed how) and
// that it is fed the numbers three's own light nodes would use, so the
// picture cannot change. The GPU half is pixel-compared against three's path
// in tests/planner_light_loop_fidelity.browser.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loopable, splitLights, packLight, LOOP_STRIDE, LOOP_MAX } from "../js/light_loop.js";
import { lightMaskFor, UNMASKED, SKY_ONLY } from "../js/room_bounce.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const three = (await readFile(join(root, "vendor/three/three.webgpu.js"), "utf8")).replace(/\r\n/g, "\n");
const UPGRADE = "three changed under js/light_loop.js — re-verify the loop against this version";

let nextId = 100;
function light(kind, o = {}) {
  return {
    id: o.id ?? nextId++, isPointLight: kind === "point", isSpotLight: kind === "spot",
    isDirectionalLight: kind === "dir", isHemisphereLight: kind === "hemi",
    castShadow: !!o.cast, map: o.map || null, colorNode: o.colorNode || null,
    color: { r: 1, g: 0.5, b: 0.25 }, intensity: o.intensity ?? 2, distance: o.distance ?? 400, decay: 2,
    angle: o.angle ?? 0.6, penumbra: o.penumbra ?? 0.5, userData: o.userData || {},
  };
}
function classBody(name) {
  const i = three.indexOf("\nclass " + name + " ");
  assert.ok(i >= 0, UPGRADE + " (class " + name + " is gone)");
  const j = three.indexOf("\nclass ", i + 1);
  return three.slice(i, j < 0 ? undefined : j);
}

test("the loop takes the point and spot lights that cast no shadow, nothing else", () => {
  assert.equal(loopable(light("point")), true);
  assert.equal(loopable(light("spot")), true);
  assert.equal(loopable(light("point", { cast: true })), false, "a casting light keeps its own shadow map binding");
  assert.equal(loopable(light("spot", { map: {} })), false, "a projected map needs three's projector");
  assert.equal(loopable(light("spot", { colorNode: {} })), false);
  assert.equal(loopable(light("dir")), false);
  assert.equal(loopable(light("hemi")), false);
  assert.equal(loopable(null), false);
});

test("split: loop lights in id order as three adds them; the rest stay three's, in place", () => {
  const sun = light("dir", { id: 21, cast: true }), a = light("point", { id: 300 }), b = light("spot", { id: 150 }),
    c = light("point", { id: 200, cast: true }), hemi = light("hemi", { id: 20 });
  const kept = [], looped = [];
  splitLights([sun, a, hemi, b, c], kept, looped, LOOP_MAX);
  assert.deepEqual(looped.map((l) => l.id), [150, 300]);
  assert.deepEqual(kept.map((l) => l.id), [21, 20, 200]);
  // the arrays are reused per render
  splitLights([a], kept, looped, LOOP_MAX);
  assert.deepEqual([kept.length, looped.length], [0, 1]);
});

test("past the loop's capacity a light falls back to three's own code, still lit", () => {
  const many = Array.from({ length: 5 }, () => light("point"));
  const kept = [], looped = [];
  splitLights(many, kept, looped, 3);
  assert.equal(looped.length, 3);
  assert.equal(kept.length, 2);
});

test("a point light packs the uniforms PointLightNode would hold", () => {
  const l = light("point", { intensity: 3, distance: 512 });
  const out = packLight(new Float32Array(LOOP_STRIDE * 4), 0, l, { x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 }, null, 4);
  assert.deepEqual(Array.from(out.slice(0, 4)), [1, 2, 3, 512], "view position (as lightViewPosition), range");
  assert.deepEqual(Array.from(out.slice(4, 8)), [3, 1.5, 0.75, 2], "colour × intensity (AnalyticLightNode.update), decay");
  assert.equal(out[11], 0, "not a spot: the cone factor is exactly 1");
  assert.equal(out[17], 4, "mask room");
});

test("a spot light packs SpotLightNode's cone and its world position and target", () => {
  const l = light("spot", { angle: 0.7, penumbra: 0.4 });
  const out = packLight(new Float32Array(LOOP_STRIDE * 4), 0, l, { x: 0, y: 0, z: 0 }, { x: 5, y: 6, z: 7 }, { x: 8, y: 9, z: 10 }, UNMASKED);
  assert.deepEqual(Array.from(out.slice(8, 12)), [5, 6, 7, 1]);
  assert.deepEqual(Array.from(out.slice(12, 15)), [8, 9, 10]);
  assert.equal(out[15], Math.fround(Math.cos(0.7)), "coneCos as SpotLightNode.update");
  assert.equal(out[16], Math.fround(Math.cos(0.7 * (1 - 0.4))), "penumbraCos as SpotLightNode.update");
  assert.equal(out[17], UNMASKED);
});

test("a loop light is masked to the room the stock light node would mask it to", () => {
  const shadowsOn = { shadowMap: { enabled: true } }, shadowsOff = { shadowMap: { enabled: false } };
  const lamp = light("point", { userData: { maskRoom: 3, maskRoomUnshadowed: 3 } });
  assert.equal(lightMaskFor(lamp, shadowsOn), 3, "an unshadowed lamp stops at its room's walls");
  const caster = light("point", { cast: true, userData: { maskRoom: UNMASKED, maskRoomUnshadowed: 2 } });
  assert.equal(lightMaskFor(caster, shadowsOn), UNMASKED, "its shadow map stops it");
  assert.equal(lightMaskFor(caster, shadowsOff), 2, "no shadow map drawn here: back to its room");
  assert.equal(lightMaskFor(light("point", { userData: { maskRoom: SKY_ONLY } }), shadowsOn), SKY_ONLY);
  assert.equal(lightMaskFor(light("point"), shadowsOn), UNMASKED, "a game's own light is not masked");
});

test("three still lets a custom lighting manager split the light list", () => {
  // createRenderer sets renderer.lighting before init() hands it to the render lists
  assert.match(classBody("Renderer"), /this\._renderLists = new RenderLists\( this\.lighting \);/, UPGRADE);
  const lighting = classBody("Lighting");
  assert.match(lighting, /\tcreateNode\( lights = \[\] \) \{/, UPGRADE);
  assert.match(lighting, /\tgetNode\( scene \) \{/, UPGRADE);
  assert.match(lighting, /this\.getNode\( scene \)\.getLights\(\)/, UPGRADE + " (nested renders save the full list)");
  const lights = classBody("LightsNode");
  for (const m of ["customCacheKey() {", "setupLightsNode( builder ) {", "setLights( lights ) {", "getLights() {", "get hasLights() {"])
    assert.ok(lights.includes("\t" + m), UPGRADE + " (LightsNode." + m + ")");
  assert.match(lights, /if \( light\.isNode \) \{\s*lightNodes\.push\( light \);/, UPGRADE + " (a node in the list is built as is)");
  for (const name of ["Lighting", "LightsNode", "LightingNode"])
    assert.ok(three.split("\nexport {").pop().includes(" " + name + ","), UPGRADE + " (" + name + " export)");
});

test("the loop body repeats what three's point and spot nodes compute", () => {
  // the lighting model needs only a direction and a colour from a direct light
  assert.match(three, /\tdirect\( \{ lightDirection, lightColor, reflectedLight \}, \/\* builder \*\/ \) \{/, UPGRADE);
  assert.match(three, /const lightTargetDirection = \( light \) => cameraViewMatrix\.transformDirection\( lightPosition\( light \)\.sub\( lightTargetPosition\( light \) \) \);/, UPGRADE);
  assert.match(three, /self\.value\.setFromMatrixPosition\( light\.matrixWorld \);\s*self\.value\.applyMatrix4\( camera\.matrixWorldInverse \);/, UPGRADE + " (view position on the CPU)");
  const spot = classBody("SpotLightNode");
  assert.match(spot, /this\.coneCosNode\.value = Math\.cos\( light\.angle \);/, UPGRADE);
  assert.match(spot, /this\.penumbraCosNode\.value = Math\.cos\( light\.angle \* \( 1 - light\.penumbra \) \);/, UPGRADE);
  assert.match(spot, /return smoothstep\( coneCosNode, penumbraCosNode, angleCosine \);/, UPGRADE);
  assert.match(spot, /let lightColor = colorNode\.mul\( spotAttenuation \)\.mul\( lightAttenuation \);/, UPGRADE);
  assert.match(three, /const lightColor = color\.mul\( attenuation \);/, UPGRADE + " (directPointLight)");
  assert.match(three, /this\.color\.copy\( light\.color \)\.multiplyScalar\( light\.intensity \);/, UPGRADE);
});

/* The three.js half, on three's real classes (no GPU needed). */
const THREE = await import("../vendor/three/three.webgpu.js");
const { createLightLoop } = await import("../js/light_loop.js");

function rig() {
  const { lighting } = createLightLoop(THREE, THREE.TSL, { maskRoom: (l) => (l.userData.maskRoom ?? UNMASKED) });
  const scene = new THREE.Scene(), node = lighting.getNode(scene);
  const camera = new THREE.PerspectiveCamera();
  const frame = (cam) => { cam.updateMatrixWorld(true); return { camera: cam, renderer: { shadowMap: { enabled: true } } }; };
  const lamp = (x, cast) => { const l = new THREE.PointLight(0xffffff, 5, 400); l.position.set(x, 250, 0); l.castShadow = !!cast; scene.add(l); l.updateMatrixWorld(true); return l; };
  const loop = node._loopNode;
  // what a shader build does (UniformArrayNode.setup): allocate, then fill once with no frame
  loop.lightsArray.value = new Float32Array(LOOP_MAX * LOOP_STRIDE * 4);
  loop.lightsArray.update();
  return { lighting, scene, node, camera, frame, lamp, loop };
}

test("the GPU array is packed for the render it is copied in, never the one before", () => {
  const { node, camera, frame, lamp, loop } = rig();
  const a = lamp(100), b = lamp(-300);
  node.setLights([a, b]);
  camera.position.set(0, 0, 500);
  loop.lightsArray.update(frame(camera));
  assert.equal(loop.count.value, 2);
  const value = loop.lightsArray.value;
  assert.deepEqual([value[0], value[1], value[2]], [100, 250, -500], "light a in the camera's view space");
  // a different camera (another pass) in the next render: its own view positions at once
  camera.position.set(0, 0, 900);
  loop.lightsArray.update(frame(camera));
  assert.deepEqual([value[0], value[1], value[2]], [100, 250, -900]);
  assert.equal(value[LOOP_STRIDE * 4], -300, "light b packed after a, in id order");
  // a lamp that starts casting leaves the loop in the same render
  b.castShadow = true;
  node.setLights([a, b]);
  loop.lightsArray.update(frame(camera));
  assert.equal(loop.count.value, 1);
});

test("lamps in the loop are not part of the shader key; a lamp that casts is", () => {
  const { node, lamp } = rig();
  const a = lamp(0), b = lamp(50);
  node.setLights([a]);
  const one = node.customCacheKey();
  node.setLights([a, b]);
  assert.equal(node.customCacheKey(), one, "adding an unshadowed lamp rebuilds nothing");
  b.castShadow = true;
  node.setLights([a, b]);
  assert.notEqual(node.customCacheKey(), one, "a casting lamp has its own code and shadow map");
});

test("three still sees every light, and a scene lit only by the loop is lit", () => {
  const { node, lamp } = rig();
  const a = lamp(0), b = lamp(10);
  node.setLights([a, b]);
  assert.deepEqual(node.getLights(), [a, b], "nested renders save and restore the full list");
  assert.deepEqual(node._lights, [], "three's own list keeps none of them");
  assert.equal(node.hasLights, true);
});
