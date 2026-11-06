import { getEventListeners } from 'node:events';
import { moduleSource } from "./helpers/module_source.mjs";
import * as three from '../vendor/three/three.webgpu.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function jsFiles(dir) {
  return readdirSync(join(root, dir), { recursive: true })
    .filter((f) => /\.js$/.test(f))
    .map((f) => join(dir, f).replace(/\\/g, '/'));
}

function loadGpu(THREE, location) {
  const source = read('js/gpu.js').replace(/^import .*;$/m, '').replace(/export /g, '');
  const context = { THREE, Promise, location, localStorage: { getItem: () => null }, window: { console } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

test('createRenderer always builds WebGPURenderer and kicks its backend init', async () => {
  const built = [];
  class WebGPURenderer {
    constructor(options) { this.options = options; built.push(this); }
    init() { this.initialized = true; this.backend = { isWebGPUBackend: true }; return Promise.resolve(); }
    render(scene, camera) { this.last = { scene, camera }; }
  }
  const gpu = loadGpu({ WebGPURenderer }, { search: '' });
  const options = { canvas: {}, alpha: true };
  const r = gpu.createRenderer(options);
  assert.equal(await gpu.ready(r), r);
  assert.equal(built.length, 1);
  assert.equal(r.options.forceWebGL, false, 'WebGPU backend unless the test switch pins WebGL2');
  assert.equal(r.options.alpha, true);
  assert.equal(options.forceWebGL, undefined, 'construction does not mutate caller options');
  assert.equal(gpu.backendName(r), 'WebGPU');
  assert.equal(gpu.render(r, 'scene', 'camera'), true);
  assert.deepEqual(r.last, { scene: 'scene', camera: 'camera' });
});

test('?forceWebGL still pins the WebGL2 fallback backend', () => {
  class WebGPURenderer {
    constructor(options) { this.options = options; }
    init() { return Promise.resolve(); }
  }
  const gpu = loadGpu({ WebGPURenderer }, { search: '?forceWebGL' });
  assert.equal(gpu.createRenderer({}).options.forceWebGL, true);
});

test('the CAD editor and the offscreen/preview canvases share the WebGPU path', () => {
  const gpu = read('js/gpu.js');
  assert.doesNotMatch(gpu, /WebGLRenderer\(/);
  assert.doesNotMatch(gpu, /classicWebGL|preferWebGL/);
  const editor = read('js/editor_view.js');
  assert.match(editor, /createRenderer\(\{ canvas: cv, antialias: true, alpha: true \}\)/);
  assert.doesNotMatch(editor, /editor_renderer_clipping/);
  // section planes stay on the ClippingGroup root, which the node renderer reads
  assert.match(editor, /new THREE\.ClippingGroup\(\)/);
  assert.doesNotMatch(read('js/three_lazy.js'), /three\.module\.js|WebGLRenderer/);
  for (const rel of ['js/offscreen_gl.js', 'js/inspector_preview.js'])
    assert.doesNotMatch(read(rel), /preferWebGL|forceWebGL|webglcontextlost/, rel);
});

test('no WebGL-only rendering constructs remain in the app', () => {
  // The AR room scan draws through a raw WebXR WebGL layer (WebXR on WebGPU is
  // not shipped), and the material tier keeps a WebGL probe for browsers with
  // no WebGPU adapter. Those are the only places a WebGL context may open.
  const contextAllowed = new Set(['js/ui_room_scan.js', 'js/material_tier.js']);
  const problems = [];
  for (const rel of [...jsFiles('js'), ...jsFiles('uikit')]) {
    // the AR scan's overlay is its own WebGL1 program, not a three.js scene
    if (rel === 'js/ui_room_scan.js') continue;
    const src = read(rel);
    const checks = [
      [/new THREE\.(ShaderMaterial|RawShaderMaterial)\b/, 'raw GLSL material (the node builder swaps it for a blank default)'],
      [/gl_FragColor|gl_Position\s*=/, 'hand-written GLSL'],
      [/\bWebGLRenderer\s*\(/, 'classic WebGLRenderer'],
      [/\b(preferWebGL|classicWebGL)\b/, 'renderer pinned off WebGPU'],
      [/new THREE\.PointsMaterial\b/, 'PointsMaterial (WebGPU draws 1px points; use PointsNodeMaterial on instanced quads)'],
      [/onBeforeCompile\s*=/, 'GLSL patching via onBeforeCompile'],
      // WebGPURenderer ignores these; its shadow nodes read light.shadow.autoUpdate,
      // so code relying on them re-renders every shadow map every frame
      [/shadowMap\.(autoUpdate|needsUpdate)\b/, 'WebGLRenderer-only shadow switch (drive light.shadow.autoUpdate)'],
    ];
    for (const [re, why] of checks) if (re.test(src)) problems.push(`${rel}: ${why}`);
    if (!contextAllowed.has(rel) && /getContext\(\s*["'](webgl2?|experimental-webgl)["']/.test(src))
      problems.push(`${rel}: opens a WebGL context`);
  }
  assert.deepEqual(problems, []);
});

test('ported node materials expose the uniforms their game loops drive', () => {
  const rcWorld = read('js/rc_world.js');
  assert.match(rcWorld, /MeshBasicNodeMaterial/);
  assert.match(rcWorld, /waterUniforms/);
  assert.match(read('js/rc_game.js'), /waterUniforms\.uTime\.value/);
  const view3d = moduleSource("js/view3d.js");
  assert.match(view3d, /TSL\.cubeTexture\(cubeTex/);
  assert.match(view3d, /stars = new THREE\.Mesh\(sg, starMat\)/);
  const zombies = moduleSource("js/zombies_world.js");
  assert.match(zombies, /var motes = new THREE\.Mesh\(mg, moteMat\)/);
  assert.match(zombies, /Z\.motes\.geo\.instanceCount = Z\.motes\.activeN/);
});

test('planner orbit frames stay free of shadow passes and per-mesh uploads', () => {
  const view3d = moduleSource("js/view3d.js");
  // on-demand shadows are driven per light, every painted frame
  assert.match(view3d, /function syncShadowUpdates\(now, box, hold\)/);
  assert.match(view3d, /sh\.autoUpdate = draw;/);
  assert.match(view3d, /syncShadowUpdates\(shadowPass, shadowBox, shadowHold\);\s*syncSelectionOutline\(\);/);
  // the previous camera view matrix is per camera, not per mesh
  assert.match(view3d, /TSL\.velocity\.previousCameraViewMatrix\.setGroup\(TSL\.renderGroup\)/);
});

test('every js file is scanned (sanity)', () => {
  const files = jsFiles('js');
  assert.ok(files.includes('js/view3d.js'));
  assert.ok(files.some((f) => f.startsWith('js/core/')), relative(root, join(root, 'js/core')));
});

test('failed vendored GL initialization releases its context and listener before rejecting ready', async () => {
  const gpu = loadGpu(three, {search:'?forceWebGL'});
  for (const supplied of [false,true]) {
    const canvas = new EventTarget();
    Object.assign(canvas,{width:200,height:120,style:{},setAttribute(){}});
    let losses=0, capabilityReads=0;
    const gl = {
      getExtension(name) { return name === 'WEBGL_lose_context' ? {loseContext(){losses++;}} : null; },
      getSupportedExtensions(){return ['WEBGL_lose_context'];},
      getParameter(){capabilityReads++; throw Error('injected GL capability failure');},
    };
    canvas.getContext=()=>gl;
    const unrelated=()=>{};
    canvas.addEventListener('webglcontextlost',unrelated);
    const renderer=gpu.createRenderer({canvas,...(supplied ? {context:gl} : {})});
    assert.equal(getEventListeners(canvas,'webglcontextlost').length,2);
    await assert.rejects(gpu.ready(renderer),/injected GL capability failure/);
    assert.ok(capabilityReads>0);
    assert.equal(renderer.initialized,false);
    assert.deepEqual(getEventListeners(canvas,'webglcontextlost'),[unrelated]);
    assert.equal(losses,supplied ? 0 : 1);
    await assert.rejects(gpu.ready(renderer),/injected GL capability failure/);
    assert.equal(losses,supplied ? 0 : 1);
  }
});

test('a fallback releases the failed primary backend and only releases the fallback on failure', async()=>{
  for(const failFallback of [false,true]){
    let primaryDisposals=0, fallbackDisposals=0;
    class Renderer {
      constructor(){this.backend={isWebGPUBackend:true,device:{},dispose(){primaryDisposals++;}};}
      async init(){
        this.backend={isWebGPUBackend:true,device:{},dispose(){fallbackDisposals++;}};
        if(failFallback)throw Error('fallback failed');
      }
    }
    const gpu=loadGpu({WebGPURenderer:Renderer},{search:''});
    const renderer=gpu.createRenderer({});
    if(failFallback)await assert.rejects(gpu.ready(renderer),/fallback failed/);
    else await gpu.ready(renderer);
    assert.equal(primaryDisposals,1);
    assert.equal(fallbackDisposals,Number(failFallback));
  }
});
