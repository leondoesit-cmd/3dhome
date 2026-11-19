import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({ resolve(name, context, next) {
  if (name !== 'three' && !name.startsWith('three/')) return next(name, context);
  const path = name === 'three' || name === 'three/webgpu' ? 'three.webgpu.js'
    : name === 'three/tsl' ? 'three.tsl.js' : name.slice(6);
  return { url: new URL('../vendor/three/' + path, import.meta.url).href, shortCircuit: true };
} });
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { search: '' } };
globalThis.location = window.location;
const v = await import('../js/view3d.js');
const { loadThree } = await import('../js/three_lazy.js');
await loadThree();
const { THREE, TSL } = await import('../js/three_lazy.js');
const { applyItemOps, rebuild3D, finishItemDrop3D } = await import('../js/view3d/items_layers.js');
const { createLightLoop } = await import('../js/light_loop.js');
const { S } = await import('../js/state.js');
const { FURN } = await import('../js/furniture.js');
const { apartmentGenerateCommand } = await import('../js/generator.js');
const { executeCommand } = await import('../js/commands/executor.js');

test('warm lamp moves reuse the vendored renderer node-builder states', async t => {
  // Start the real CPU-side render-object and node caches without a GPU
  // device. No command buffers or WebGPU pipelines are submitted.
  const r = new THREE.WebGPURenderer({ canvas: { width: 8, height: 8, style: {} } });
  globalThis.self = { requestAnimationFrame() {}, cancelAnimationFrame() {} };
  r.backend.init = async () => { r.backend.renderer = r; };
  r.hasFeature = () => false;
  r.hasCompatibility = feature => feature === THREE.Compatibility.TEXTURE_COMPARE;
  const { lighting } = createLightLoop(THREE, TSL);
  r.lighting = lighting;
  r.shadowMap.enabled = true;
  await r.init();
  r.clear = () => {}; // cube shadow face clears submit GPU commands
  v.set_renderer(r);
  const scene = v.set_scene(new THREE.Scene()), camera = new THREE.PerspectiveCamera();
  const root = v.set_itemsRoot(new THREE.Group());
  scene.add(root);
  const finish = new THREE.MeshStandardNodeMaterial();
  finish.colorNode = TSL.uniform(new THREE.Color(0xded2c0));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), finish);
  floor.receiveShadow = true;
  scene.add(floor);
  const node = lighting.getNode(scene);
  const ctx = r._renderContexts.get(null, null);
  let builds = 0;
  const create = r.backend.createNodeBuilder.bind(r.backend);
  r.backend.createNodeBuilder = (...args) => {
    const b = create(...args), build = b.build.bind(b);
    b.build = () => { builds++; return build(); };
    return b;
  };
  const depthMaterials = new Set(), shadowMaps = new Set();
  r.render = (shadowScene, shadowCamera) => {
    assert.ok(shadowScene.overrideMaterial.isShadowPassMaterial);
    depthMaterials.add(shadowScene.overrideMaterial);
    shadowMaps.add(r.getRenderTarget());
    const depthCtx = r._renderContexts.get(r.getRenderTarget(), null);
    scene.traverseVisible(mesh => {
      if (!mesh.isMesh || !mesh.castShadow || !shadowCamera.layers.test(mesh.layers)) return;
      const ro = r._objects.get(mesh, shadowScene.overrideMaterial, scene, shadowCamera, node, depthCtx, null, 'shadow');
      r._nodes.getForRender(ro);
    });
  };
  function compileMeshes() {
    const lights = [];
    scene.traverseVisible(o => { if (o.isLight) lights.push(o); });
    node.setLights(lights);
    const shadows = new Set();
    scene.traverseVisible(mesh => {
      if (!mesh.isMesh || !camera.layers.test(mesh.layers)) return;
      const ro = r._objects.get(mesh, mesh.material, scene, camera, node, ctx, null);
      const state = r._nodes.getForRender(ro);
      assert.ok(state.fragmentShader.includes('@fragment'));
      for (const n of state.updateBeforeNodes) if (n instanceof THREE.ShadowNode) shadows.add(n);
    });
    for (const shadow of shadows) shadow.updateShadow({ renderer: r, scene, camera });
  }
  const type = 'floorLamp', f = FURN[type];
  S.nodes = [[0, 0], [200, 0], [400, 0], [400, 200], [200, 200], [0, 200]]
    .map(([x, z]) => ({ x, z }));
  S.walls = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]]
    .map(([a, b], i) => ({ id: i + 1, a, b, thick: 10, height: 250 }));
  const lamp = { type, id: 'lamp', x: 50, z: 100, rot: 0, w: f.w, d: f.d, h: f.h };
  S.items = [lamp];
  const placeholder = new THREE.Group();
  root.add(placeholder);
  v.itemCache.set(lamp.id, { g: placeholder });
  S.items3D.set(lamp.id, 'build');
  applyItemOps();
  compileMeshes();
  const warm = builds;
  assert.ok(warm > 0);
  const casters = depthMaterials.size;
  assert.ok(casters > 0);
  const group = v.itemCache.get(lamp.id).g;
  assert.ok(group.fixture.lights.some(l => l.castShadow));
  for (let i = 0; i < 30; i++) {
    lamp.x += 10;
    S.items3D.set(lamp.id, 'move');
    applyItemOps();
    compileMeshes();
  }
  lamp.hold = { wall: 1, gap: 0 };
  S.items3D.set(lamp.id, 'build');
  applyItemOps();
  compileMeshes();
  assert.equal(builds - warm, 0);
  assert.equal(depthMaterials.size, casters);
  assert.equal(shadowMaps.size, casters);
  assert.equal(v.itemCache.get(lamp.id).g.uuid, group.uuid);
  const mesh = group.children.find(o => o.isMesh);
  mesh.material = new THREE.MeshBasicNodeMaterial();
  mesh.material.colorNode = TSL.vec3(0.12, 0.34, 0.56);
  compileMeshes();
  assert.equal(builds - warm, 1);
  t.diagnostic(`${warm} warm WGSL builds, 0 during 30 moves and release, 1 for a new material graph; ` +
    `${casters} shadow materials and maps retained`);

  // Exercise the structural release path on an actual generated apartment.
  // Only texture identities enter this audit, so the lawn needs no pixels.
  const paint = { fillRect() {}, beginPath() {}, ellipse() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {} };
  globalThis.document = { createElement: () => ({ getContext: () => paint }), getElementById: () => null };
  t.after(() => { delete globalThis.document; });
  // Supply decoded 1-pixel images in place of browser bitmap I/O. Surface
  // materials, their node graphs and render objects use the planner paths.
  t.mock.method(THREE.TextureLoader.prototype, 'load', () =>
    new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1));
  const made = executeCommand(apartmentGenerateCommand, {
    size: 'large', replace: true, replaceInfrastructure: true, infrastructure: true, seed: 3,
  }, { domain: 'planner', state: S, itemCatalog: FURN }, { history: false });
  assert.ok(made.ok);
  S.mep.show = S.mep.show3D = false;
  const placedLamp = S.items.find(it => it.type === type);
  S.sel = { kind: 'item', ref: placedLamp };
  scene.add(v.set_dyn(new THREE.Group()));
  v.set_ready3D(true);
  const renderObjects = t.mock.method(r._objects, 'createRenderObject');
  rebuild3D();
  compileMeshes();
  function structure() {
    const meshes = new Set(), materials = new Set();
    v.structureRoot.traverse(o => {
      if (!o.isMesh) return;
      meshes.add(o);
      for (const m of [].concat(o.material)) materials.add(m);
    });
    return { meshes, materials };
  }
  const before = structure(), structuralWarm = builds, warmObjects = renderObjects.mock.callCount();
  placedLamp.x += 20;
  S.items3D.set(placedLamp.id, 'move');
  applyItemOps();
  S.dirty3D = false;
  finishItemDrop3D();
  if (S.dirty3D) rebuild3D();
  compileMeshes();
  const after = structure();
  assert.equal(after.meshes.difference(before.meshes).size, 0);
  assert.equal(after.materials.difference(before.materials).size, 0);
  assert.equal(builds, structuralWarm);
  assert.equal(renderObjects.mock.callCount(), warmObjects);
  // Replay the former unconditional release rebuild at the identical pose.
  rebuild3D();
  compileMeshes();
  const baseline = structure(), newMeshes = baseline.meshes.difference(after.meshes).size;
  const newMaterials = baseline.materials.difference(after.materials).size;
  const freshObjects = renderObjects.mock.callCount() - warmObjects;
  assert.ok(newMeshes > 0 && newMaterials > 0);
  assert.ok(freshObjects > 0);
  t.diagnostic(`full rebuild: ${newMeshes} new structural meshes, ${newMaterials} new structural materials, ` +
    `${freshObjects} new render objects, ${builds - structuralWarm} WGSL builds; inside-bounds fixture release: 0 of each`);

  const { fitPracticalLights, fitBounceLights } = await import('../js/view3d/lighting.js');
  const fields = [];
  v.set_roomBounce({ setRooms() {}, rooms: () => v.bounceRooms, setPathRecords() {},
    setIrradiance(field) { fields.push(field); } });
  const relight = () => { fitPracticalLights(); fitBounceLights(); };
  rebuild3D();
  relight();
  assert.equal(fields.length, 2);
  const reference = fields.pop();
  fields.length = 0;
  rebuild3D(relight);
  assert.deepEqual(fields, [reference], 'one final field at the same settled geometry and lamp power');
});
