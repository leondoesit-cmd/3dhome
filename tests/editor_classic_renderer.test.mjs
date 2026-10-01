import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as Classic from '../vendor/three/three.module.js';
import * as Core from '../vendor/three/three.core.js';
import { syncEditorClipping } from '../js/editor_renderer_clipping.js';

test('CAD renderer construction bypasses node graph renderer and remains immediately ready', async () => {
  let nodeConstructs = 0;
  class WebGLRenderer {
    constructor(options) { this.options = options; this.isWebGLRenderer = true; }
    render(scene, camera) { this.last = { scene, camera }; }
  }
  class WebGPURenderer { constructor() { nodeConstructs++; throw new RangeError('TSL cycle'); } }
  const source = readFileSync(new URL('../js/gpu.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/m, '').replace(/export /g, '');
  const context = { THREE: { WebGLRenderer, WebGPURenderer }, Promise };
  vm.createContext(context); vm.runInContext(source, context);
  const options = { canvas: {}, classicWebGL: true, alpha: true };
  const renderer = context.createRenderer(options);
  assert.equal(await context.ready(renderer), renderer);
  assert.equal(renderer.initialized, true);
  assert.equal(context.backendName(renderer), 'WebGL2');
  assert.equal(context.render(renderer, 'scene', 'camera'), true);
  assert.deepEqual(renderer.last, { scene: 'scene', camera: 'camera' });
  assert.equal(nodeConstructs, 0);
  assert.equal(renderer.options.classicWebGL, undefined);
  assert.equal(renderer.options.forceWebGL, undefined);
  assert.equal(options.classicWebGL, true, 'construction does not mutate caller options');
  const editor = readFileSync(new URL('../js/editor_view.js', import.meta.url), 'utf8');
  assert.match(editor, /createRenderer\(\{[^}]*classicWebGL: true/);
});

test('vendored classic renderer shares the existing scene and material classes', () => {
  assert.equal(Classic.Scene, Core.Scene);
  assert.equal(Classic.MeshStandardMaterial, Core.MeshStandardMaterial);
  assert.equal(Classic.BufferGeometry, Core.BufferGeometry);
});

test('section clipping applies to model children, preserves authored planes, and restores on disable', () => {
  const renderer = { isWebGLRenderer: true };
  const group = new Classic.Group();
  const original = new Classic.Plane(new Classic.Vector3(1, 0, 0), 1);
  const section = new Classic.Plane(new Classic.Vector3(0, 1, 0), 2);
  const material = new Classic.MeshStandardMaterial({ clippingPlanes: [original] });
  const mesh = new Classic.Mesh(new Classic.BoxGeometry(), material);
  group.add(mesh);
  const helper = new Classic.MeshStandardMaterial();
  group.enabled = true; group.clippingPlanes = [section]; group.clipShadows = true;
  syncEditorClipping(renderer, group);
  assert.equal(renderer.localClippingEnabled, true);
  assert.deepEqual(material.clippingPlanes, [original, section]);
  assert.equal(material.clipShadows, true);
  assert.equal(helper.clippingPlanes, null, 'scene helpers outside model root remain intact');
  const version = material.version;
  syncEditorClipping(renderer, group);
  assert.equal(material.version, version, 'unchanged section does not recompile materials');
  const lateMaterial = new Classic.LineBasicMaterial();
  group.add(new Classic.LineSegments(new Classic.BufferGeometry(), lateMaterial));
  syncEditorClipping(renderer, group);
  assert.deepEqual(lateMaterial.clippingPlanes, [section], 'late asynchronous geometry inherits section');
  group.enabled = false;
  syncEditorClipping(renderer, group);
  assert.deepEqual(material.clippingPlanes, [original]);
  assert.equal(material.clipShadows, false);
  assert.equal(lateMaterial.clippingPlanes, null);
  mesh.geometry.dispose(); material.dispose(); lateMaterial.dispose(); helper.dispose();
});
