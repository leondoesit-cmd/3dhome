/* The one offscreen renderer behind the model pictures: the library tiles
   (js/thumbs.js) and the top-down furniture sprites of the presentation plan
   (js/plan_sprites.js).

   One context for both, on purpose: browsers cap live WebGL contexts at ~16
   and evict the oldest past that, and the main 3D view, the drive/lava modes
   and the modeler already hold some. Each consumer sizes the canvas and picks
   its light rig before it renders; nothing else is shared between them.

   The GPU backend comes up asynchronously (js/gpu.js): offscreenGL() returns
   null until it is live and "thumbsReady" is dispatched once it is, so
   callers can ask again. On context loss the bundle is dropped for good and
   callers fall back to their flat art. */
import { THREE, loadThree, threeLoaded } from "./three_lazy.js";
import { createRenderer, ready, LUX } from "./gpu.js";

const SIZE = 192;

let GL = null,
  glDead = false,
  // True from the moment the renderer is requested until its backend is live.
  // Pictures asked for in that window must NOT be memoized as failures.
  glPending = false;

// Small equirect sky/ground gradient, prefiltered once. Without an environment
// map every STEEL/GLASS surface in the catalog renders as a black hole.
function skyEnv(r) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const x = c.getContext("2d"),
    grd = x.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0.0, "#93a8c2");
  grd.addColorStop(0.5, "#eef2f6");
  grd.addColorStop(0.52, "#a49a8d");
  grd.addColorStop(1.0, "#75706a");
  x.fillStyle = grd;
  x.fillRect(0, 0, 64, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(r);
  pm.compileEquirectangularShader();
  const rt = pm.fromEquirectangular(tex);
  pm.dispose();
  tex.dispose();
  return rt.texture;
}

/* Library tiles: key strongly off-axis and a weak fill — white-on-white
   pieces (fridge, toilet, upper cabinets) need a clearly shaded side or they
   dissolve into the panel background at 48px. */
function thumbRig() {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0xffffff, 0x8f959d, LUX * 0.5));
  const key = new THREE.DirectionalLight(0xfff4e6, LUX * 1.35);
  key.position.set(-90, 230, 190);
  g.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9ff, LUX * 0.3);
  fill.position.set(180, 60, -140);
  g.add(fill);
  return g;
}

/* Plan sprites: seen from straight above, so the key comes from high in the
   north-west (the same corner the plan's drop shadows fall away from) and
   casts a shadow map — pillows shade the duvet, a lamp shades its table.
   The ambient is strong because a top view has no sky-facing side to light. */
function spriteRig() {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(0xffffff, 0x9d968a, LUX * 0.36));
  const key = new THREE.DirectionalLight(0xfff1dc, LUX * 1.2);
  key.position.set(-160, 520, -200);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 1.2;
  key.shadow.radius = 3;
  const cam = key.shadow.camera;
  cam.left = -260; cam.right = 260; cam.top = 260; cam.bottom = -260;
  cam.near = 10; cam.far = 1400;
  key.target.position.set(0, 0, 0);
  g.add(key);
  g.add(key.target);
  const fill = new THREE.DirectionalLight(0xe4ecff, LUX * 0.22);
  fill.position.set(200, 300, 220);
  g.add(fill);
  return g;
}

// Builds the offscreen scene. Deferred until the backend is up: PMREMGenerator
// (skyEnv) issues real GPU work and throws on an uninitialized renderer.
function buildGL(r) {
  r.setPixelRatio(1);
  r.setSize(SIZE, SIZE, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = skyEnv(r);
  const rigs = { thumb: thumbRig(), sprite: spriteRig() };
  Object.keys(rigs).forEach(function (k) { scene.add(rigs[k]); });
  const root = new THREE.Group();
  scene.add(root);
  return {
    r: r,
    scene: scene,
    root: root,
    rigs: rigs,
    cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000),
  };
}

/* Switch the scene to one consumer's lights. A top view sees mostly
   up-facing surfaces, which the sky environment floods; the sprites turn it
   down so white bedding and pale upholstery keep their shading. */
const RIG_ENV = { thumb: 1, sprite: 0.45 };
const RIG_EXPOSURE = { thumb: 1, sprite: 0.85 };
export function useRig(g, name) {
  Object.keys(g.rigs).forEach(function (k) { g.rigs[k].visible = k === name; });
  g.scene.environmentIntensity = RIG_ENV[name] != null ? RIG_ENV[name] : 1;
  g.r.toneMappingExposure = RIG_EXPOSURE[name] != null ? RIG_EXPOSURE[name] : 1;
}

export function offscreenPending() {
  return glPending;
}
export function offscreenDead() {
  return glDead;
}

// Returns the offscreen renderer bundle, or null while it is still coming up
// (or permanently, if there is no GPU). Never returns a half-built one.
export function offscreenGL() {
  if (GL) return GL;
  if (glDead || glPending) return null;
  if (typeof document === "undefined") return null;
  /* three is not on the boot path any more, so the catalog panel can render
     before the renderer library even exists. Take the same road as the async
     backend below: reserve the pending flag, fetch three, and re-announce
     "thumbsReady" so the flat art drawn in the meantime is replaced. */
  if (!threeLoaded()) {
    glPending = true;
    loadThree().then(function () {
      glPending = false;
      offscreenGL();
      window.dispatchEvent(new CustomEvent("thumbsReady"));
    }).catch(function () {
      glPending = false;
      glDead = true;
    });
    return null;
  }
  glPending = true;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    // preferWebGL: pictures are read back synchronously (toDataURL for the
    // tiles, drawImage for the sprites), which the WebGL2 backend supports
    // directly (see gpu.js). preserveDrawingBuffer: the readback runs after
    // the draw call returns.
    const r = createRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      preferWebGL: true,
    });
    canvas.addEventListener("webglcontextlost", function () {
      GL = null;
      glDead = true;
    });
    ready(r).then(() => {
      GL = buildGL(r);
      glPending = false;
      // Tell the consumers to ask again — what they drew during init was flat
      // art and was deliberately left out of their caches. NOT
      // "catalogUpdated": that means "the models changed, throw the cached art
      // away" and would wipe the IndexedDB thumb store on every single load.
      window.dispatchEvent(new CustomEvent("thumbsReady"));
    }).catch(() => {
      glPending = false;
      glDead = true;
    });
  } catch (e) {
    glPending = false;
    glDead = true; // no GPU (or context budget exhausted): fall back to flat art
  }
  return null;
}
