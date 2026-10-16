/* The one offscreen renderer behind the model pictures: the library tiles
   (js/thumbs.js) and the top-down furniture sprites of the presentation plan
   (js/plan_sprites.js).

   One renderer for both, on purpose: every renderer is a GPU device (or, on
   the WebGL2 fallback, a context, which browsers cap at ~16 and evict past
   that), and the main 3D view, the drive/lava modes and the modeler already
   hold some. Each consumer sizes the canvas and picks its light rig before
   it renders; nothing else is shared between them.

   The GPU backend comes up asynchronously (js/gpu.js): offscreenGL() returns
   null until it is live and "thumbsReady" is dispatched once it is, so
   callers can ask again. On device or context loss the bundle is dropped for
   good and callers fall back to their flat art. */
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
async function skyEnv(r) {
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
  const target = await precompilePmrem(r, pm, tex);
  const rt = pm.fromEquirectangular(tex, target);
  pm.dispose();
  tex.dispose();
  return rt.texture;
}

/* PMREMGenerator compiles its shaders synchronously on first use: ~0.7 s of
   blocked main thread on the WebGL2 fallback (ANGLE/D3D11), the longest task
   the thumbnail warm-up caused. Compile them through compileAsync first, on
   the generator's own planes and target, so fromEquirectangular() finds them
   ready. These are internals of the vendored r185 generator; if they ever
   change shape this returns null and the synchronous path runs as before. */
async function precompilePmrem(r, pm, tex) {
  try {
    pm._setSizeFromTexture(tex);
    const target = pm._allocateTarget(false);
    pm._init(target);
    await pm.compileEquirectangularShader(); // creates the equirect material
    if (!pm._equirectMaterial || !pm._ggxMaterial || !pm._lodMeshes) return target;
    pm._equirectMaterial.fragmentNode.value = tex;
    const cam = new THREE.OrthographicCamera(),
      prev = r.getRenderTarget(),
      jobs = [];
    r.setRenderTarget(target); // compileAsync reads the target synchronously
    try {
      jobs.push(r.compileAsync(new THREE.Mesh(pm._lodMeshes[0].geometry, pm._equirectMaterial), cam));
      jobs.push(r.compileAsync(new THREE.Mesh(pm._lodMeshes[1].geometry, pm._ggxMaterial), cam));
    } finally {
      r.setRenderTarget(prev);
    }
    await Promise.all(jobs);
    return target;
  } catch (e) {
    return null;
  }
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
async function buildGL(r) {
  r.setPixelRatio(1);
  r.setSize(SIZE, SIZE, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = await skyEnv(r);
  const rigs = { thumb: thumbRig(), sprite: spriteRig() };
  Object.keys(rigs).forEach(function (k) { scene.add(rigs[k]); });
  const root = new THREE.Group();
  scene.add(root);
  const g = {
    r: r,
    scene: scene,
    root: root,
    rigs: rigs,
    cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000),
  };
  /* The renderer's very first frame builds its output pass (tone mapping +
     colour space) and scene-level nodes synchronously, which compileAsync
     does not cover: ~70 ms that used to land inside the first picture's
     draw-and-readback task. Pay it here, on an empty scene, in a task of
     its own. */
  await new Promise(function (resolve) { setTimeout(resolve, 0); });
  try {
    useRig(g, "thumb");
    r.render(scene, g.cam);
  } catch (e) {}
  return g;
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

/* Resolves once the GPU has drained everything submitted so far (texture
   uploads, mipmaps, a compile's work), so a same-task readback that follows
   waits on its own frame only. */
export function offscreenIdle(g) {
  const backend = g && g.r && g.r.backend;
  const device = backend && backend.device;
  if (device && device.queue && typeof device.queue.onSubmittedWorkDone === "function")
    return device.queue.onSubmittedWorkDone().catch(function () {});
  /* WebGL2 fallback: a fence, polled without blocking. Chrome reports a
     signalled fence late at times (~0.3 s for a few ms of work), so the wait
     is capped: past FENCE_MS the readback is cheaper than waiting longer. */
  const gl = backend && backend.gl;
  if (!gl || typeof gl.fenceSync !== "function") return Promise.resolve();
  return new Promise(function (resolve) {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) return resolve();
    gl.flush();
    const t0 = performance.now();
    const poll = function () {
      if (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < FENCE_MS) return void setTimeout(poll, 4);
      gl.deleteSync(sync);
      resolve();
    };
    poll();
  });
}
const FENCE_MS = 50;

/* ---- picture-sized textures ----------------------------------------------
   A tile is 192 px of a whole model and a sprite at most 512 px, but the
   library materials are 2048 px bitmaps, and every material clone is a GPU
   texture of its own on this renderer: uploading one
   (copyExternalImageToTexture, which decodes the WebP on the main thread)
   cost ~0.3 s, a model needs several, and none of them was ever freed. So
   pictures are drawn with small copies instead: one canvas of at most `px`
   per source bitmap and size, shared by every picture that uses it, and
   per-picture texture objects that are disposed (freeing their GPU copy) as
   soon as the picture has been read back. */
let small = new WeakMap(); // THREE.Source -> Map(px -> THREE.Source holding the small canvas)

function imageSize(img) {
  if (!img || typeof img !== "object") return null;
  const w = img.naturalWidth || img.videoWidth || img.width || 0,
    h = img.naturalHeight || img.videoHeight || img.height || 0;
  return w > 0 && h > 0 ? [w, h] : null;
}
function isBig(tex, px) {
  if (!tex || !tex.isTexture || tex.isRenderTargetTexture || tex.isDataTexture || tex.isCubeTexture || tex.isVideoTexture) return false;
  const s = imageSize(tex.image);
  return !!s && Math.max(s[0], s[1]) > px;
}
function smallOf(source, px) {
  const bySize = small.get(source);
  return (bySize && bySize.get(px)) || null;
}
function keepSmall(source, px, canvas) {
  let bySize = small.get(source);
  if (!bySize) small.set(source, (bySize = new Map()));
  if (!bySize.has(px)) bySize.set(px, new THREE.Source(canvas));
  return bySize.get(px);
}
function canvasFor(img, px) {
  const s = imageSize(img), k = px / Math.max(s[0], s[1]);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(s[0] * k));
  c.height = Math.max(1, Math.round(s[1] * k));
  return c;
}
// Synchronous: drawImage decodes the bitmap on the main thread (tens of ms
// for a 2k WebP). Only for a picture that is wanted right now; still far
// cheaper than uploading the full bitmap.
function shrinkSync(img, px) {
  const c = canvasFor(img, px);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}
// Asynchronous: the bytes are fetched again (from the HTTP cache) and decoded
// and resized by createImageBitmap off the main thread.
async function shrinkAsync(img, px) {
  const c = canvasFor(img, px),
    opts = { resizeWidth: c.width, resizeHeight: c.height, resizeQuality: "medium" };
  let bmp = null;
  try {
    if (typeof img.src === "string" && img.src) bmp = await createImageBitmap(await (await fetch(img.src)).blob(), opts);
  } catch (e) { bmp = null; }
  if (!bmp) {
    try { bmp = await createImageBitmap(img, opts); } catch (e) { return shrinkSync(img, px); }
  }
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c;
}

function bigTextures(root, px) {
  const found = new Set();
  root.traverse(function (o) {
    if (!o.material) return;
    [].concat(o.material).forEach(function (m) {
      for (const k in m) if (isBig(m[k], px)) found.add(m[k]);
    });
  });
  return found;
}
/* Makes sure every bitmap under `root` bigger than `px` has its small copy
   (awaiting the off-thread decode unless `sync`). */
export async function shrinkAll(root, px, sync) {
  for (const tex of bigTextures(root, px)) {
    if (smallOf(tex.source, px)) continue;
    const c = sync ? shrinkSync(tex.image, px) : await shrinkAsync(tex.image, px);
    keepSmall(tex.source, px, c);
  }
}
/* Swaps every texture under `root` bigger than `px` for a per-picture
   texture over its small copy (made on the spot, synchronously, if it is
   still missing). Returns the swapped-in textures, to dispose() once the
   picture has been read back. */
export function useSmallTextures(root, px) {
  const made = new Map();
  root.traverse(function (o) {
    if (!o.material) return;
    [].concat(o.material).forEach(function (m) {
      for (const k in m) {
        const tex = m[k];
        if (!isBig(tex, px)) continue;
        let p = made.get(tex);
        if (!p) {
          const src = smallOf(tex.source, px) || keepSmall(tex.source, px, shrinkSync(tex.image, px));
          p = tex.clone(); // keeps wrap, repeat, colour space, flipY…
          p.source = src;
          p.needsUpdate = true;
          made.set(tex, p);
        }
        m[k] = p;
      }
    });
  });
  return Array.from(made.values());
}
/* Lets the small copies go (they are remade on demand), for a consumer that
   has finished a big batch of pictures. */
export function dropSmallTextures() {
  small = new WeakMap();
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
    // Pictures are read back in the same task as the draw (toDataURL for the
    // tiles, drawImage for the sprites). Both backends serve that read from
    // the canvas's current frame, WebGPU included. preserveDrawingBuffer
    // keeps the WebGL2 fallback's buffer alive until the read lands.
    const r = createRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    // WebGPU device loss and WebGL context loss both arrive here.
    r.onDeviceLost = function () {
      GL = null;
      glDead = true;
    };
    ready(r).then(() => buildGL(r)).then((bundle) => {
      glPending = false;
      if (glDead) return; // lost while the environment was being made
      GL = bundle;
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
