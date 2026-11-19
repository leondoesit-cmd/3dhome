// The inspector preview draws stand-ins for every light that can cast, so
// three's per-light shadow nodes (shared by every renderer in the page) are
// never touched by its renderer (js/inspector_lights.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.core.js';
import { createInspectorLights } from '../js/inspector_lights.js';

function plannerScene() {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.position.set(100, 2000, 1900);
  sun.target.position.set(500, 0, 450);
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.layers.enable(5);
  sun.userData = { maskRoom: -1, maskRoomUnshadowed: -2 };
  scene.add(sun, sun.target);
  const dyn = new THREE.Group();
  scene.add(dyn);
  const lamp = new THREE.PointLight(0xffeedd, 2, 400);
  lamp.position.set(300, 240, 300);
  // a live reference in userData, as planner lights carry: never JSON-copied
  lamp.userData = { maskRoom: 2, item: { self: null } };
  lamp.userData.item.self = lamp.userData.item;
  dyn.add(lamp);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1));
  scene.updateMatrixWorld(true);
  return { scene, sun, lamp, dyn };
}

const lightsIn = (scene) => {
  const out = [];
  scene.traverseVisible((o) => { if (o.isLight) out.push(o); });
  return out;
};

test('the preview renders stand-ins, never the lights that can cast', () => {
  const { scene, sun, lamp } = plannerScene();
  const camera = new THREE.PerspectiveCamera();
  const own = createInspectorLights();
  assert.equal(own.swapIn(scene, camera), true, 'a first set of stand-ins is new');
  const drawn = lightsIn(scene);
  assert.ok(!drawn.includes(sun) && !drawn.includes(lamp), 'the originals are hidden');
  assert.equal(drawn.filter((l) => l.isHemisphereLight).length, 1, 'lights that cannot cast stay');
  const [sunIn, lampIn] = own.standIns();
  assert.ok(sunIn.isDirectionalLight && lampIn.isPointLight);
  assert.notEqual(sunIn.shadow, sun.shadow, 'each stand-in has a shadow of its own');
  assert.deepEqual(sunIn.matrixWorld.elements, sun.matrixWorld.elements);
  assert.deepEqual(sunIn.target.matrixWorld.elements, sun.target.matrixWorld.elements);
  assert.equal(sunIn.shadow.camera.layers.mask, sun.shadow.camera.layers.mask, 'the sun still sees shadow-only casters');
  assert.equal(sunIn.shadow.mapSize.x, 4096);
  assert.equal(lampIn.userData, lamp.userData, 'the mask rule is shared, not copied');
  assert.equal(lampIn.castShadow, false);
  own.swapOut(true);
  assert.deepEqual(lightsIn(scene).filter((l) => l.isDirectionalLight || l.isPointLight), [sun, lamp]);
  assert.equal(sunIn.parent, null);
});

test('a light that starts casting is followed only at swapIn', () => {
  const { scene, lamp } = plannerScene();
  const own = createInspectorLights();
  own.swapIn(scene, null);
  own.swapOut(true);
  const lampIn = own.standIns()[1];
  lamp.castShadow = true; // the main view hands it a map
  assert.equal(lampIn.castShadow, false, 'nothing the main view does reaches a stand-in between renders');
  assert.equal(own.swapIn(scene, null), true, 'casting is in three\'s lights key: the cached keys are stale');
  assert.equal(lampIn.castShadow, true);
  assert.equal(lampIn.shadow.needsUpdate, true, 'its map is drawn once it casts');
  own.swapOut(true);
});

test('maps are redrawn after a rebuild or a move, not on every frame', () => {
  const { scene, sun } = plannerScene();
  const own = createInspectorLights();
  own.swapIn(scene, null);
  const sunIn = own.standIns()[0];
  assert.equal(sunIn.shadow.autoUpdate, false);
  assert.equal(sunIn.shadow.needsUpdate, true, 'a new stand-in draws its map');
  own.swapOut(false); // a compile: nothing drawn yet
  own.swapIn(scene, null);
  assert.equal(sunIn.shadow.needsUpdate, true, 'still owed after a compile');
  own.swapOut(true);
  own.swapIn(scene, null);
  assert.equal(sunIn.shadow.needsUpdate, false, 'an orbit frame draws no map');
  own.swapOut(true);
  sun.position.x += 50;
  scene.updateMatrixWorld(true);
  own.swapIn(scene, null);
  assert.equal(sunIn.shadow.needsUpdate, true, 'the sun moved');
  own.swapOut(true);
  own.invalidate();
  own.swapIn(scene, null);
  assert.equal(sunIn.shadow.needsUpdate, true, 'the scene was rebuilt');
  own.swapOut(true);
});

test('a rebuild with new light objects keeps the stand-ins by slot', () => {
  const first = plannerScene();
  const own = createInspectorLights();
  own.swapIn(first.scene, null);
  own.swapOut(true);
  const before = own.standIns();
  const next = plannerScene(); // the same plan built again: new light objects
  assert.equal(own.swapIn(next.scene, null), false, 'same stand-ins, same shader keys');
  assert.deepEqual(own.standIns(), before);
  own.swapOut(true);
  // a slot whose light changed class gets a new stand-in; the old one is disposed
  next.lamp.parent.remove(next.lamp);
  const spot = new THREE.SpotLight();
  next.dyn.add(spot);
  next.scene.updateMatrixWorld(true);
  let disposed = false;
  before[1].addEventListener('dispose', () => { disposed = true; });
  assert.equal(own.swapIn(next.scene, null), true);
  assert.ok(own.standIns()[1].isSpotLight);
  assert.ok(disposed);
  own.swapOut(true);
});

test('hidden lights and lights off the camera layers get no stand-in', () => {
  const { scene, lamp, dyn } = plannerScene();
  const camera = new THREE.PerspectiveCamera();
  dyn.visible = false;
  const own = createInspectorLights();
  own.swapIn(scene, camera);
  assert.deepEqual(own.standIns().map((l) => l.type), ['DirectionalLight']);
  own.swapOut(true);
  dyn.visible = true;
  lamp.layers.set(3);
  own.swapIn(scene, camera);
  assert.deepEqual(own.standIns().map((l) => l.type), ['DirectionalLight']);
  own.swapOut(true);
  own.dispose();
  assert.deepEqual(own.standIns(), []);
});
