// Library tile icons rendered from the REAL model.
//
// The old tile art was a fake isometric box scaled to the entry's w/d/h, so a
// sofa, a fridge and a rug all came out as the same slab in a different color —
// nothing in the icon told you what the piece was. Here the piece is built with
// its own build() into a small offscreen 3D scene, lit and auto-framed, so
// the icon IS the model. Same builder as the 3D view, so a model can never
// disagree with its icon.
import { THREE } from "./three_lazy.js";
import { offscreenGL, offscreenPending, offscreenIdle, useRig, shrinkAll, useSmallTextures, dropSmallTextures } from "./offscreen_gl.js";
import { FURN, buildItem } from "./furniture.js";
import { clearGroup } from "./primitives.js";
import { quietPbrLoads, pbrLoading } from "./pbr_material.js";

const SIZE = 192; // render resolution; tiles display it at ~48px
// front-right three-quarter view (models face +z): reads depth without hiding
// the front, and stays identical for every entry so the grid looks like a set
// Built on first use, not at module load: three is late-bound (three_lazy.js)
// and THREE.Vector3 does not exist until something has asked for a scene.
let DIR = null;
function dir() {
  return (DIR ||= new THREE.Vector3(0.58, 0.5, 0.86).normalize());
}

const cache = new Map(); // cache key -> data URL (or "" when the model won't render)

/* The cache key: a catalog type for the built-in pieces (their look only
   changes with the code, which bumps THUMB_DB), and for a saved custom model
   its type plus a fingerprint of its definition — an edited model gets a new
   picture, an unchanged one keeps its stored picture across loads and across
   every "catalogUpdated" (which used to throw the whole store away). */
const sigs = new WeakMap();
function fingerprint(def) {
  let s = sigs.get(def);
  if (s) return s;
  let text = "";
  try { text = JSON.stringify(def) || ""; } catch (e) { text = String(Date.now()); }
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  s = (h >>> 0).toString(36) + "." + text.length.toString(36);
  sigs.set(def, s);
  return s;
}
function keyOf(type) {
  const f = FURN[type];
  return f && f.custom && typeof f.custom === "object" ? type + "#" + fingerprint(f.custom) : type;
}
const THUMB_DB = "home3d_thumbnails_v5";
const THUMB_STORE = "images";

function thumbDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(THUMB_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(THUMB_STORE, { keyPath: "type" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function hydratePersistentCache() {
  const database = await thumbDB();
  return new Promise((resolve) => {
    const tx = database.transaction(THUMB_STORE, "readonly");
    const req = tx.objectStore(THUMB_STORE).getAll();
    // every stored picture: a custom model's key is not in FURN until the
    // editor registers it, and its fingerprint decides whether it still fits
    req.onsuccess = () => (req.result || []).forEach((entry) => {
      if (entry && entry.type && !cache.has(entry.type)) cache.set(entry.type, entry.url || "");
    });
    tx.oncomplete = () => { database.close(); resolve(); };
    tx.onerror = () => { database.close(); resolve(); };
  });
}
async function persistThumb(type, url) {
  const database = await thumbDB();
  const tx = database.transaction(THUMB_STORE, "readwrite");
  tx.objectStore(THUMB_STORE).put({ type, url });
  tx.oncomplete = () => database.close();
}
const persistentReady = hydratePersistentCache().catch(() => {});
export function loadThumbCache() { return persistentReady; }

// The renderer lives in js/offscreen_gl.js, shared with the plan sprites.
function gl() {
  return offscreenGL();
}

// Fit the orthographic frustum to the model's bounding box, exactly: project
// the 8 corners into camera space and size the frustum to their extent. Every
// piece then fills its tile whether it is a 4cm knob or a 3m wardrobe.
function frame(cam, box) {
  const c = box.getCenter(new THREE.Vector3()),
    radius = box.getSize(new THREE.Vector3()).length() || 100;
  cam.position.copy(c).addScaledVector(dir(), radius + 1000);
  cam.up.set(0, 1, 0);
  cam.lookAt(c);
  cam.updateMatrixWorld();
  const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert(),
    p = new THREE.Vector3();
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    p.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z
    ).applyMatrix4(inv);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  // Square frustum, so a model keeps its proportions in a square tile. Very
  // long thin pieces (a 3m NFT pipe, a light strip) would shrink to an
  // invisible hairline if the whole length had to fit, so past ~3:1 the tile
  // crops into the piece instead: a thick, readable section beats a scratch.
  const CAP = 3.2,
    bigE = Math.max(x1 - x0, y1 - y0),
    smallE = Math.min(x1 - x0, y1 - y0),
    fit = Math.min(bigE, Math.max(smallE, bigE / 8) * CAP) || 1;
  const half = (fit / 2) * 1.08,
    mx = (x0 + x1) / 2,
    my = (y0 + y1) / 2;
  cam.left = mx - half;
  cam.right = mx + half;
  cam.top = my + half;
  cam.bottom = my - half;
  cam.near = Math.max(0.1, -z1 - 10);
  cam.far = -z0 + 10;
  cam.updateProjectionMatrix();
}

/* Library materials are 2048 px bitmaps; a tile draws them with small copies
   (shrinkAll / useSmallTextures in js/offscreen_gl.js) whose GPU textures are
   freed right after the readback. */
const TEX_PX = 256;

// `rebuilds`: the caller builds again once the library bitmaps it asked for
// have landed, so the procedural stand-ins for them can be skipped.
function buildModel(parent, type, rebuilds) {
  const f = FURN[type];
  // Quiet: a library material this asks for must not rebuild the 3D view
  // and re-bake the plan sprites when it lands (see quietPbrLoads).
  quietPbrLoads(() => buildItem(parent, {
    // A thumbnail is not a project instance. Registering the synthetic
    // "thumb" item could replace a newer shared definition with the catalog
    // snapshot and populate the project's runtime cache while browsing.
    type: type,
    x: 0,
    z: 0,
    w: f.w,
    d: f.d,
    h: f.h,
    rot: 0,
  }), rebuilds);
}
function boundsOf(root) {
  if (!root.children.length) return null;
  const box = new THREE.Box3().setFromObject(root);
  return box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x) ? null : box;
}
/* Sizes the shared canvas for a tile, only when it is not already: assigning
   canvas.width reallocates the drawing buffer even at the same size (30-60 ms
   on the WebGL2 fallback), and the plan sprites leave it at their own size.
   True when it had to resize. */
function fitSize(g) {
  const cv = g.r.domElement;
  if (cv.width === SIZE && cv.height === SIZE) return false;
  g.r.setSize(SIZE, SIZE, false);
  return true;
}
// The picture itself, synchronous from the draw to the readback: the model
// must already be under g.root and carry its small textures.
function snap(g, box) {
  frame(g.cam, box);
  fitSize(g);
  useRig(g, "thumb");
  g.r.render(g.scene, g.cam);
  return g.r.domElement.toDataURL();
}

function render(g, type) {
  buildModel(g.root, type);
  const box = boundsOf(g.root);
  if (!box) return "";
  const proxies = useSmallTextures(g.root, TEX_PX);
  try {
    return snap(g, box);
  } finally {
    proxies.forEach((p) => p.dispose());
  }
}

function remember(key, url) {
  cache.set(key, url);
  persistThumb(key, url).catch(() => {});
}

// Rendered icon for a catalog type, or "" if it cannot be drawn. Memoized:
// renderFurnUI() re-runs on every search keystroke, nav step and language
// change, and a re-render per keystroke would stutter the panel.
export function modelThumb(type) {
  const key = keyOf(type);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url = "";
  const g = gl();
  // Backend still coming up: hand back flat art for now, but do not memoize it —
  // the catalogUpdated fired on init will bring us back here for the real icon.
  if (!g && offscreenPending()) return "";
  if (g && FURN[type]) {
    try {
      url = render(g, type);
    } catch (e) {
      url = "";
    }
    clearGroup(g.root); // the model is one-shot: free its GPU buffers now
  }
  remember(key, url);
  return url;
}

/* The warm-up's way to the same picture, spread over many short tasks: the
   model is built off-scene, its library textures are allowed to arrive and
   are shrunk off the main thread, its pipelines are compiled with
   compileAsync (which yields between objects), and the GPU is let drain —
   only then is it put under g.root for one short draw and the same-task
   readback. Nothing waits while the model sits in the shared scene, so the
   plan sprites and a tile's synchronous modelThumb() can use the renderer in
   any of the gaps. `slot` is how it waits for its turn between steps: an
   idle moment for the warm-up, a prompt yield for a tile on screen. */
async function warmOne(type, slot = idleSlot) {
  const key = keyOf(type);
  if (cache.has(key) || !FURN[type]) return;
  const model = new THREE.Group();
  let proxies = [];
  try {
    buildModel(model, type, true);
    // A library material it uses still loading means the build fell back to
    // the material's old preset; wait for the bitmaps and build again (the
    // last time keeping the stand-ins, should something still be loading).
    for (let i = 0; i < 2; i++) {
      const loading = pbrLoading();
      if (!loading) break;
      await Promise.race([loading, wait(10000)]);
      if (cache.has(key) || !FURN[type] || keyOf(type) !== key) return;
      clearGroup(model);
      buildModel(model, type, i === 0);
    }
    const box = boundsOf(model);
    if (!box) return remember(key, "");
    await shrinkAll(model, TEX_PX, false);
    await slot();
    let g = gl();
    if (!g || cache.has(key)) return;
    if (fitSize(g)) {
      await slot(); // a resize is a task of its own
      g = gl();
      if (!g || cache.has(key)) return;
    }
    proxies = useSmallTextures(model, TEX_PX);
    frame(g.cam, box);
    useRig(g, "thumb");
    await g.r.compileAsync(model, g.cam, g.scene);
    await offscreenIdle(g);
    await slot();
    g = gl();
    if (!g || cache.has(key)) return;
    g.root.add(model);
    let url = "";
    try {
      url = snap(g, box);
    } catch (e) {
      url = "";
    } finally {
      g.root.remove(model);
    }
    remember(key, url);
  } finally {
    clearGroup(model);
    proxies.forEach((p) => p.dispose());
  }
}

export function hasThumb(type) {
  return cache.get(keyOf(type)) !== undefined;
}

/* A new or edited custom model may have changed its look. Nothing to throw
   away: its fingerprint changed with it, so it is simply rendered afresh
   (by the warm-up below, or when a tile asks). */
export function clearThumbCache() {
  prewarmThumbs();
}

/* ---- the warm-up --------------------------------------------------------
   Every library picture is made ahead of time, in the background, once the
   page has loaded: one model at a time (warmOne), each in many short steps
   taken in idle moments, never in the middle of a frame someone is waiting
   on, and stored (IndexedDB above), so the library,
   the model editor's saved models and the pickers open with their pictures
   already there. Pieces added later (a model saved in the editor, a project
   bringing its own) are picked up the same way. */
let warmQueue = [], warming = false, warmAsked = false;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const idle = typeof requestIdleCallback === "function"
  ? (fn, timeout) => requestIdleCallback(fn, timeout ? { timeout } : undefined)
  : (fn) => setTimeout(() => fn({ timeRemaining: () => 10, didTimeout: false }), 60);
/* Someone is using the app right now: a drag, a wheel turn, typing. The
   warm-up keeps out of the way until it has been quiet for a moment. */
let lastInput = -Infinity;
const INPUT_QUIET_MS = 700;
if (typeof window !== "undefined") {
  const touch = () => { lastInput = performance.now(); };
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, touch, { capture: true, passive: true }));
  window.addEventListener("pointermove", (e) => { if (e.buttons) touch(); }, { capture: true, passive: true });
}
/* Resolves in a genuinely idle moment: no recent input and a browser idle
   period with room left in it. No timeout on purpose — while the 3D view, an
   editor or a drag keeps every frame busy there is no idle time, and the
   warm-up simply pauses until there is. */
function idleSlot() {
  return new Promise((resolve) => {
    const ask = () => idle((deadline) => {
      const quietFor = performance.now() - lastInput;
      if (quietFor < INPUT_QUIET_MS) setTimeout(ask, INPUT_QUIET_MS - quietFor);
      else if (!deadline.didTimeout && deadline.timeRemaining() < 8) ask();
      else resolve();
    });
    ask();
  });
}
async function warmLoop() {
  try {
    while (warmQueue.length) {
      await idleSlot();
      if (!gl()) {
        // the renderer is still coming up (it announces "thumbsReady"), or there is no GPU
        if (offscreenPending()) warmAsked = true;
        return;
      }
      // tiles on screen asked for their pictures (thumbAsync): those go first
      while (asking) await asked;
      const type = warmQueue.shift();
      if (!type || !FURN[type] || hasThumb(type)) continue;
      try {
        await warmOne(type);
      } catch (e) {
        // a model that cannot be drawn keeps its flat art; the next pass retries it
      }
    }
    if (!asking) dropSmallTextures(); // the small copies were only for the warm-up
  } finally {
    warming = false;
  }
}
export function prewarmThumbs() {
  if (typeof document === "undefined") return;
  loadThumbCache().then(() => {
    warmQueue = Object.keys(FURN).filter((type) => !hasThumb(type));
    if (!warmQueue.length || warming) return;
    warming = true;
    warmLoop();
  });
}

/* ---- pictures a tile on screen is waiting for ----------------------------
   A catalog grid opened before the warm-up has reached its models asks here
   instead of drawing them synchronously (modelThumb(): a first-seen model's
   build, texture shrink and pipeline compile in one task, up to a quarter of
   a second each). Same steps as the warm-up, one model at a time, but ahead
   of its queue and without waiting for the user to stop moving: a short
   idle-or-timeout yield between steps keeps every task small. */
const jobs = new Map(); // cache key -> { type, key, promise, resolve }
let urgent = [], batchAt = 0, batchOpen = false;
let asking = false, asked = Promise.resolve(); // `asked` settles when the queue is drained
const soon = () => new Promise((resolve) => idle(resolve, 120));

// Promise of the picture for a catalog type ("" if it cannot be drawn).
// Deduplicated per picture; a stored or already-made picture resolves at once.
export function thumbAsync(type) {
  const key = keyOf(type), hit = cache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);
  if (!FURN[type] || typeof document === "undefined") return Promise.resolve("");
  let job = jobs.get(key);
  if (job) {
    const at = urgent.indexOf(job);
    if (at === -1) return job.promise; // being drawn right now
    urgent.splice(at, 1);
    if (at < batchAt) batchAt--;
  } else {
    job = { type, key };
    job.promise = new Promise((resolve) => { job.resolve = resolve; });
    jobs.set(key, job);
  }
  // The newest grid first, in its own order: the requests made in one go
  // (one grid's tiles) form a batch that goes ahead of older ones, so a
  // category you have already left does not hold up the one on screen.
  if (!batchOpen) {
    batchOpen = true;
    batchAt = 0;
    queueMicrotask(() => { batchOpen = false; });
  }
  urgent.splice(batchAt++, 0, job);
  if (!asking) drainAsked();
  return job.promise;
}
async function drainAsked() {
  asking = true;
  let done;
  asked = new Promise((resolve) => { done = resolve; });
  try {
    await persistentReady;
    while (urgent.length) {
      const job = urgent.shift();
      if (batchAt > 0) batchAt--;
      let url = "";
      // a task of its own: the last picture's draw and readback and the
      // next model's build must not add up to one long task
      await soon();
      try { url = await drawSoon(job); } catch (e) { url = ""; }
      jobs.delete(job.key);
      job.resolve(url);
    }
  } finally {
    asking = false;
    done();
    if (!warming) dropSmallTextures();
  }
}
async function drawSoon({ type, key }) {
  for (let tries = 0; tries < 3; ) {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    if (!FURN[type] || keyOf(type) !== key) return "";
    if (!gl()) {
      if (!offscreenPending()) return ""; // no GPU: the tile keeps its flat art
      await wait(200); // the renderer is still coming up
      continue;
    }
    tries++;
    await warmOne(type, soon);
  }
  return cache.get(key) || "";
}
if (typeof window !== "undefined") {
  window.addEventListener("thumbsReady", () => { if (warmAsked) { warmAsked = false; prewarmThumbs(); } });
  const start = () => setTimeout(prewarmThumbs, 1200);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
