/* Top-down pictures of the REAL furniture models, for the presentation plan.

   Each piece is built with the same buildItem() the 3D view uses, into the
   shared offscreen renderer (js/offscreen_gl.js), and photographed straight
   down with an orthographic camera. The plan then draws that picture in the
   piece's own rotated frame. So the plan cannot disagree with the 3D view: a
   new variant, a resized sofa or an edited custom model changes both.

   Baking is never on the paint path. itemSprite() answers from the cache or
   returns a fallback (the piece's previous picture stretched to its new size,
   or null → the caller draws its line glyph) and queues the bake. The queue
   runs one piece at a time in idle moments, newest request per piece wins
   (a resize drag asks for a new size every pointermove and only the last one
   matters), and "planSpritesReady" is dispatched at most every NOTE_MS while
   pictures land, so the plan repaints once per batch, not once per picture.
   Several pieces are baked together (bakeBatch()), sharing one compile and
   one GPU wait; how many comes from the device budget (js/device_budget.js).

   One bake is several short steps, not one long one (see bakeBatch()): the 2k
   library bitmaps are shrunk off the main thread and the pipelines compiled
   with compileAsync before the piece is drawn and read back in one short
   synchronous step.

   Frame: the camera looks down -y with up = -z, so screen right is +x and
   screen down is +z — exactly the frame drawItem() draws in after rotating,
   with the piece's front (+z) toward the bottom edge. */
import { THREE } from "./three_lazy.js";
import { offscreenGL, offscreenDead, offscreenIdle, useRig, shrinkAll, useSmallTextures, setSpritesUrgent } from "./offscreen_gl.js";
import { FURN, buildItem, itemVSpan } from "./furniture.js";
import { rememberVSpan, seedVSpan, spanOfBox, vSpanKeyOf } from "./furniture_api.js";
import { deviceBudget, noteBakeMs, noteBackgroundLongTask } from "./device_budget.js";
import { clearGroup } from "./primitives.js";
import { pbrLoading } from "./pbr_material.js";
import { S } from "./state.js";
import { isPresentation } from "./plan_style.js";
import { spriteKey, spriteBucket, SPRITE_BUCKETS, SPRITE_VERSION } from "./plan_sprite_key.js";

// cache size from the shared device budget (js/device_budget.js): ~64-380 MB
// of RGBA at most, usually far less
function pixelBudget() {
  return deviceBudget().spritePixelBudget;
}
const NOTE_MS = 150; // at most one plan repaint this often while pictures land

/* What a key is made of beyond the item itself: a custom model's definition
   hash, which moves when the modeler edits it. Built-in models change only
   with the code, which SPRITE_VERSION covers — so a key is stable across
   sessions and a picture can be kept on disk.
   Textures still loading are NOT in the key (a load counter there made every
   texture that landed re-bake every piece, and made every picture on disk
   miss in the next session): a picture baked while any load was pending is
   marked provisional instead (see prepare()), is never kept on disk, and is
   dropped when a load lands. */
const defSigs = new Map();
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}
function defSig(type) {
  if (defSigs.has(type)) return defSigs.get(type);
  const f = FURN[type];
  let sig = "b";
  if (f && f.custom) {
    try { sig = "c" + hashStr(JSON.stringify(f.custom)); } catch (e) { sig = "c?"; }
  }
  defSigs.set(type, sig);
  return sig;
}
function keyFor(it, bucket) {
  return spriteKey(it, bucket, 0) + "|" + defSig(it.type);
}
const cache = new Map(); // key -> sprite (Map order = LRU order)
const lastById = new Map(); // item id -> its most recent sprite, any key
const queue = new Map(); // item id -> {key, it, bucket, pri}
const failed = new Set(); // keys whose model would not render: never retried
let pixels = 0,
  scheduled = false,
  baking = false,
  // bumped by every texture load (invalidateTexturedSprites): a provisional
  // bake that was in flight across one missed that invalidation
  texGen = 0;

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function remember(key, sp) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, sp);
}
function store(key, sp) {
  remember(key, sp);
  pixels += sp.px;
  const budget = pixelBudget();
  while (pixels > budget && cache.size > 1) {
    const oldest = cache.keys().next().value;
    pixels -= cache.get(oldest).px;
    cache.delete(oldest);
  }
}

/* The picture for `it` at the current zoom, or the best stand-in, or null.
   A sprite is {img, rect:{x0,z0,x1,z1} in cm of the baked piece, w, d}:
   draw it scaled by it.w/sp.w and it.d/sp.d so a stand-in baked at another
   size still covers the right footprint. `opts.noQueue` asks without
   queueing a bake (mid-gesture). */
export function itemSprite(it, SC, dpr, opts) {
  if (!it || offscreenDead() || typeof document === "undefined") return null;
  const maxPx = Math.max(it.w || 0, it.d || 0) * SC * (dpr || 1);
  const bucket = spriteBucket(maxPx);
  const key = keyFor(it, bucket);
  if (quietWake && urgentWork()) quietWake();
  const hit = cache.get(key);
  if (hit) {
    remember(key, hit);
    if (it.id != null) lastById.set(it.id, hit);
    queue.delete(it.id);
    return hit;
  }
  // the same piece at another zoom: better than a stretched stand-in
  let near = null;
  for (let i = SPRITE_BUCKETS.length - 1; i >= 0; i--) {
    const other = cache.get(keyFor(it, SPRITE_BUCKETS[i]));
    if (other) { near = other; break; }
  }
  if (persisted.has(key)) fromDisk(key);
  else if (!(opts && opts.noQueue) && !failed.has(key)) enqueue(it, bucket, key, maxPx + ((opts && opts.boost) || 0));
  return near || (it.id != null ? lastById.get(it.id) : null) || null;
}

function enqueue(it, bucket, key, pri, ahead) {
  const id = (it.id != null ? it.id : key) + (ahead ? "|ahead" : "");
  const cur = queue.get(id);
  if (cur && cur.key === key) {
    if (pri > cur.pri) cur.pri = pri; // asked again by the paint: it is on screen
    return;
  }
  let clone;
  try {
    clone = JSON.parse(JSON.stringify(it));
  } catch (e) {
    return;
  }
  clone.x = 0;
  clone.z = 0;
  clone.rot = 0;
  queue.set(id, { key: key, it: clone, bucket: bucket, pri: pri, ahead: !!ahead });
  schedule();
}

/* The next zoom step's picture, made ahead of time on devices with room for
   it (js/plan_sprite_prewarm.js asks): zooming in then finds it ready. It
   waits behind every picture someone is looking at, in quiet moments only,
   and is its own queue entry, so it never replaces the piece's current one. */
export function prebakeSprite(it, bucket) {
  if (!it || offscreenDead() || typeof document === "undefined") return;
  const key = keyFor(it, bucket);
  if (cache.has(key) || persisted.has(key) || failed.has(key)) return;
  enqueue(it, bucket, key, -1, true);
}
// anything queued that a viewer is waiting for (not only pictures ahead)
function waitedFor() {
  let any = false;
  queue.forEach(function (req) { if (!req.ahead) any = true; });
  return any;
}

const idle = typeof requestIdleCallback === "function"
  ? function (fn) { requestIdleCallback(fn, { timeout: 150 }); }
  : function (fn) { setTimeout(fn, 16); };
function idleTick() {
  return new Promise(function (resolve) { idle(resolve); });
}

/* Pictures someone is looking at (the presentation plan on screen) bake at
   once and go before the library tiles' warm-up; pictures made ahead of
   time (js/plan_sprite_prewarm.js, while the technical plan is shown) wait
   for a quiet moment — no input for a while, a real idle period — and stop
   for the next pointer press. */
function urgentWork() {
  return isPresentation() && (typeof document === "undefined" || document.visibilityState !== "hidden");
}
let lastInput = -Infinity;
const INPUT_QUIET_MS = 700;
if (typeof window !== "undefined") {
  const touch = function () { lastInput = now(); };
  ["pointerdown", "wheel", "keydown", "touchstart"].forEach(function (ev) {
    window.addEventListener(ev, touch, { capture: true, passive: true });
  });
  window.addEventListener("pointermove", function (e) { if (e.buttons) touch(); }, { capture: true, passive: true });
}
// set while pump() waits for a quiet moment: a paint of the presentation
// plan wakes it at once instead of leaving it parked until the page is idle
let quietWake = null;
function quietSlot() {
  return new Promise(function (resolve) {
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      quietWake = null;
      resolve();
    };
    quietWake = finish;
    const ask = function () {
      if (done) return;
      if (urgentWork()) return void finish(); // the user switched to the presentation plan meanwhile
      const quietFor = now() - lastInput;
      if (quietFor < INPUT_QUIET_MS) return void setTimeout(ask, INPUT_QUIET_MS - quietFor);
      if (typeof requestIdleCallback !== "function") return void setTimeout(finish, 50);
      requestIdleCallback(function (deadline) {
        if (deadline.timeRemaining() < 8) ask();
        else finish();
      });
    };
    ask();
  });
}

function schedule() {
  if (scheduled || baking || !queue.size) return;
  scheduled = true;
  idle(pump);
}

function announce() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
}
// One repaint for a burst of pictures arriving on their own (from disk).
let notePending = false;
function announceSoon() {
  if (notePending) return;
  notePending = true;
  setTimeout(function () {
    notePending = false;
    announce();
  }, NOTE_MS / 3);
}

async function pump() {
  scheduled = false;
  if (!offscreenGL()) {
    // still coming up: "thumbsReady" re-runs us. Dead: drop the queue, the
    // plan keeps its glyphs.
    if (offscreenDead()) queue.clear();
    return;
  }
  baking = true;
  let made = 0,
    noted = now();
  try {
    while (queue.size && !offscreenDead()) {
      const urgent = urgentWork() && waitedFor();
      // the plan's pictures go before the library tiles' warm-up, even those
      // made ahead of time: a closed panel's tiles are what nobody is about to
      // look at, and the warm-up's readback stalls on the GPU work of a bake
      // (a 200+ ms task when the two met)
      setSpritesUrgent(true);
      if (!urgent) {
        await quietSlot();
        if (!queue.size || offscreenDead()) break;
      }
      // the best few requests (highest priority first), batch size from the
      // shared device budget
      const n = Math.max(1, deviceBudget().bakesPerSlice), batch = [];
      while (batch.length < n && queue.size) {
        let bestId = null,
          best = null;
        queue.forEach(function (req, id) {
          if (!best || req.pri > best.pri) { best = req; bestId = id; }
        });
        queue.delete(bestId);
        if (!cache.has(best.key)) batch.push({ id: bestId, req: best });
      }
      if (!batch.length) continue;
      const gen = texGen;
      const sps = await bakeBatch(batch.map(function (b) { return b.req; }));
      batch.forEach(function (b, i) {
        const sp = sps[i], best = b.req;
        if (sp && sp.prov && gen !== texGen) {
          // a texture landed while this one was baking: its invalidation ran
          // before the picture existed, so caching it would keep the fallback
          // look for good. Show it as the stand-in and bake it again.
          if (best.it.id != null) lastById.set(best.it.id, sp);
          if (!queue.has(b.id)) queue.set(b.id, best);
        } else if (sp) {
          store(best.key, sp);
          if (best.it.id != null) lastById.set(best.it.id, sp);
          if (persistable(best.it, sp)) persist(best.key, sp);
          made++;
        } else if (!offscreenDead()) failed.add(best.key);
      });
      if (made && now() - noted > NOTE_MS) {
        announce();
        made = 0;
        noted = now();
      }
      await idleTick();
    }
  } finally {
    baking = false;
    setSpritesUrgent(false);
  }
  if (made) announce();
  if (offscreenDead()) queue.clear();
  else schedule();
  flushPersist();
}

/* Frame the piece: its bounding box united with its nominal footprint (a
   piece may overhang it — a chair pushed under a table, a duvet over the
   bed edge), padded a little so soft edges are not clipped. */
export function spriteRect(box, w, d) {
  const x0 = Math.min(box.min.x, -w / 2),
    x1 = Math.max(box.max.x, w / 2),
    z0 = Math.min(box.min.z, -d / 2),
    z1 = Math.max(box.max.z, d / 2),
    pad = 1 + 0.015 * Math.max(x1 - x0, z1 - z0);
  return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
}

/* Texture size for a picture `bucket` px across: a material's bitmap covers
   at most the whole piece, so it never needs more pixels than the picture. */
function texPx(bucket) {
  return bucket <= 256 ? 256 : 512;
}

// Points the camera (and the shadow-casting key light) straight down at `rect`.
function aim(g, box, rect, L) {
  const rw = rect.x1 - rect.x0,
    rd = rect.z1 - rect.z0,
    cx = (rect.x0 + rect.x1) / 2,
    cz = (rect.z0 + rect.z1) / 2,
    cam = g.cam;
  cam.left = -rw / 2;
  cam.right = rw / 2;
  cam.top = rd / 2;
  cam.bottom = -rd / 2;
  cam.near = 1;
  cam.far = box.max.y - Math.min(0, box.min.y) + 1000;
  cam.position.set(cx, box.max.y + 500, cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(cx, 0, cz);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  // the shadow camera must cover the whole piece, however big
  const key = g.rigs.sprite.children.find(function (c) { return c.isDirectionalLight && c.castShadow; });
  if (key) {
    const r = L * 0.75 + 60,
      sc = key.shadow.camera;
    key.position.set(cx - 160, box.max.y + 520, cz - 200);
    key.target.position.set(cx, 0, cz);
    key.target.updateMatrixWorld();
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.updateProjectionMatrix();
  }
}
/* Every picture is drawn into the top-left W x H of one canvas the size of
   the largest bucket, not into a canvas resized to each piece: a resize
   reallocates the drawing buffer, ~30-60 ms on the WebGL2 fallback, and
   every piece has a size of its own. */
const CANVAS_PX = SPRITE_BUCKETS[SPRITE_BUCKETS.length - 1];
// true when it had to resize (the library tiles draw at their own size)
function fitCanvas(g) {
  const cv = g.r.domElement;
  if (cv.width === CANVAS_PX && cv.height === CANVAS_PX) return false;
  g.r.setSize(CANVAS_PX, CANVAS_PX, false);
  return true;
}
function setUp(g, box, rect, L, W, H) {
  aim(g, box, rect, L);
  useRig(g, "sprite");
  fitCanvas(g);
  g.r.setViewport(0, 0, W, H);
}

/* Is any texture still on its way? The library bitmaps (pbrLoading) and the
   plain texture caches, which several builders fill and whose entries have
   no image until their load lands. */
function texturesPending() {
  if (pbrLoading()) return true;
  return [S.customTexCache, S.customBumpCache].some(function (c) {
    if (!c) return false;
    for (const k in c) if (c[k] && !c[k].image) return true;
    return false;
  });
}
const LOAD_WAIT_MS = 3000;
function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* Pictures in batches, in steps that each keep the main thread short. Each
   piece is built off-scene in a task of its own and its big bitmaps shrunk
   off the main thread (to small per-picture textures, freed after the
   readback); then the whole batch's pipelines are compiled with ONE
   compileAsync and ONE wait for the GPU to drain, and each piece is put
   under g.root for one draw and the same-task readback, again one task per
   piece. The fixed waits (compile, drain, idle tick) are paid once per batch
   instead of once per piece; the pictures are the ones a single bake makes.
   The renderer is shared with the library tiles, which may use it in any of
   the gaps, so camera, rig and size are set again right before each draw.
   Resolves to one sprite (or null when the piece will not render) per
   request, in order. */
function yieldTask() {
  return new Promise(function (resolve) { setTimeout(resolve, 0); });
}
async function prepare(it, bucket) {
  const model = new THREE.Group(),
    px = texPx(bucket),
    t = now();
  const p = { it: it, bucket: bucket, model: model, px: px, proxies: [], syncMs: 0 };
  try {
    buildItem(model, it);
    // A library material it uses still loading means the build fell back to
    // the material's old preset: wait for the bitmaps (briefly) and build
    // again, rather than bake a picture that is stale as soon as they land.
    for (let i = 0; i < 2; i++) {
      const loading = pbrLoading();
      if (!loading) break;
      await Promise.race([loading, wait(LOAD_WAIT_MS)]);
      clearGroup(model);
      buildItem(model, it);
    }
    p.prov = texturesPending();
    if (!model.children.length) return release(p);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    // the plan needs the piece's height too (hung above the cut or not):
    // this build is the one baseVSpan() would make, so hand it over
    rememberVSpan(it, box);
    p.vk = vSpanKeyOf(it);
    p.vs = spanOfBox(box, it);
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) return release(p);
    const rect = spriteRect(box, it.w || 0, it.d || 0);
    const rw = rect.x1 - rect.x0,
      rd = rect.z1 - rect.z0,
      L = Math.max(rw, rd);
    Object.assign(p, { box: box, rect: rect, L: L,
      W: Math.max(8, Math.round((bucket * rw) / L)), H: Math.max(8, Math.round((bucket * rd) / L)) });
    p.syncMs += now() - t;
    await shrinkAll(model, px, false);
    return p;
  } catch (e) {
    return release(p);
  }
}
function release(p) {
  if (!p) return null;
  clearGroup(p.model); // one-shot model: free its GPU buffers now
  p.proxies.forEach(function (x) { x.dispose(); }); // and its small textures' GPU copies
  p.proxies = [];
  return null;
}
// One piece's draw and readback, in one short synchronous step.
function drawPrepared(g, p) {
  setUp(g, p.box, p.rect, p.L, p.W, p.H);
  g.root.add(p.model);
  const t = now();
  try {
    g.r.render(g.scene, g.cam);
    const c = document.createElement("canvas");
    c.width = p.W;
    c.height = p.H;
    const cx2 = c.getContext("2d");
    cx2.drawImage(g.r.domElement, 0, 0, p.W, p.H, 0, 0, p.W, p.H);
    inkOutline(c, cx2, Math.max(1, Math.round(p.bucket / 160)));
    return { img: c, rect: p.rect, w: p.it.w || 0, d: p.it.d || 0, px: p.W * p.H, prov: p.prov, vk: p.vk, vs: p.vs };
  } finally {
    g.root.remove(p.model);
    const drawMs = now() - t;
    noteBakeMs(p.syncMs + drawMs);
    if (!urgentWork() && Math.max(drawMs, p.syncMs) > 50) noteBackgroundLongTask(Math.max(drawMs, p.syncMs));
    g.r.setViewport(0, 0, CANVAS_PX, CANVAS_PX); // the next user of the canvas gets all of it
  }
}
async function bakeBatch(reqs) {
  const preps = [];
  for (let i = 0; i < reqs.length; i++) {
    if (i) await yieldTask(); // each build a task of its own
    preps.push(await prepare(reqs[i].it, reqs[i].bucket));
  }
  const live = preps.filter(Boolean);
  const out = preps.map(function () { return null; });
  if (!live.length) return out;
  try {
    let g = offscreenGL();
    if (!g) return out;
    if (fitCanvas(g)) {
      await idleTick(); // a resize is a task of its own
      g = offscreenGL();
      if (!g) return out;
    }
    const holder = new THREE.Group();
    live.forEach(function (p) {
      p.proxies = useSmallTextures(p.model, p.px);
      holder.add(p.model);
    });
    setUp(g, live[0].box, live[0].rect, live[0].L, live[0].W, live[0].H);
    try {
      await g.r.compileAsync(holder, g.cam, g.scene);
    } finally {
      live.forEach(function (p) { holder.remove(p.model); });
    }
    await offscreenIdle(g);
    for (let i = 0; i < preps.length; i++) {
      const p = preps[i];
      if (!p) continue;
      await idleTick();
      g = offscreenGL();
      if (!g) break;
      try { out[i] = drawPrepared(g, p); } catch (e) { out[i] = null; }
    }
    return out;
  } catch (e) {
    return out;
  } finally {
    preps.forEach(release);
  }
}

/* A thin dark contour round the piece, drawn UNDER it: the silhouette in ink,
   nudged one step in each direction. It is what makes a pale sofa on a pale
   floor read as a drawn object rather than a smudge, the line weight a
   rendered presentation plan puts round every piece. */
function inkOutline(c, ctx, px) {
  const sil = document.createElement("canvas");
  sil.width = c.width;
  sil.height = c.height;
  const sx = sil.getContext("2d");
  sx.drawImage(c, 0, 0);
  sx.globalCompositeOperation = "source-in";
  sx.fillStyle = "rgba(38,31,24,.62)";
  sx.fillRect(0, 0, sil.width, sil.height);
  ctx.save();
  ctx.globalCompositeOperation = "destination-over";
  [[px, 0], [-px, 0], [0, px], [0, -px]].forEach(function (o) {
    ctx.drawImage(sil, o[0], o[1]);
  });
  ctx.restore();
}

/* Resolves once every piece has its exact picture at this zoom (or after
   `timeoutMs`), for exports that must not contain a glyph stand-in. */
export function spritesSettled(items, SC, dpr, timeoutMs) {
  const until = now() + (timeoutMs || 4000);
  // the plan draws a piece whose height is not yet measured as its glyph:
  // measure them all now (synchronously is fine for an export)
  (items || []).forEach(function (it) {
    try { itemVSpan(it); } catch (e) { /* drawn as floor-standing */ }
  });
  return new Promise(function (resolve) {
    (function poll() {
      let missing = 0;
      (items || []).forEach(function (it) {
        const maxPx = Math.max(it.w || 0, it.d || 0) * SC * (dpr || 1);
        const key = keyFor(it, spriteBucket(maxPx));
        if (!cache.has(key)) {
          missing++;
          itemSprite(it, SC, dpr);
        }
      });
      if (!missing || offscreenDead() || now() > until) return resolve(!missing);
      setTimeout(poll, 60);
    })();
  });
}

/* ---- pictures kept between sessions (IndexedDB) ----
   Baking a plan full of furniture costs a second or two of GPU time on every
   load; decoding the same pictures from disk costs a fraction of that and no
   GPU at all. Pieces with a custom texture stay memory-only — the texture may
   not have loaded when the picture was taken. */
const DB_NAME = "home3d_plan_sprites", STORE = "sprites";
const persisted = new Map(); // key -> {blob, rect, w, d}
const decoding = new Set();
function openDB() {
  return new Promise(function (resolve, reject) {
    if (typeof indexedDB === "undefined") return reject(new Error("no IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: "key" }); };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}
/* A textured piece's texture is part of its key (tex / texParts are shape
   fields, js/plan_sprite_key.js), and a picture baked while any texture was
   still loading is provisional and never reaches here, so a textured
   picture that is not provisional is as stable as any other. */
function persistable(it, sp) {
  return !!it && !(sp && sp.prov);
}
/* toBlob reads the picture back from the GPU, and while anything else is
   compiling or uploading there (the 3D view right after a plan is
   generated, the next bakes) that read waits behind it: 50-80 ms of blocked
   main thread per picture, against 2-5 ms on a quiet GPU. So pictures go to
   disk only once baking has stopped, one per genuinely idle moment. */
const toPersist = new Map(); // key -> sprite waiting to be written
let persisting = false;
function persist(key, sp) {
  if (!sp.img || typeof sp.img.toBlob !== "function") return;
  toPersist.set(key, sp);
  flushPersist();
}
function quietMoment(fn) {
  if (typeof requestIdleCallback !== "function") return void setTimeout(fn, 200);
  requestIdleCallback(function (deadline) {
    if (deadline.timeRemaining() < 8) quietMoment(fn);
    else fn();
  });
}
function flushPersist() {
  if (persisting || baking || queue.size || !toPersist.size) return;
  persisting = true;
  quietMoment(function () {
    persisting = false;
    if (baking || queue.size) return; // pump() asks again when it is done
    const key = toPersist.keys().next().value;
    encode(key, toPersist.get(key));
    toPersist.delete(key);
    flushPersist();
  });
}
function encode(key, sp) {
  sp.img.toBlob(function (blob) {
    if (!blob) return;
    const rec = { key: key, v: SPRITE_VERSION, blob: blob, rect: sp.rect, w: sp.w, d: sp.d, t: Date.now(), vk: sp.vk, vs: sp.vs };
    persisted.set(key, rec);
    openDB().then(function (db) {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = function () { db.close(); };
      tx.onerror = function () { db.close(); };
    }).catch(function () {});
  }, "image/png");
}
function fromDisk(key) {
  const rec = persisted.get(key);
  if (!rec || decoding.has(key) || typeof createImageBitmap !== "function") return;
  decoding.add(key);
  seedVSpan(rec.vk, rec.vs);
  createImageBitmap(rec.blob).then(function (bmp) {
    store(key, { img: bmp, rect: rec.rect, w: rec.w, d: rec.d, px: bmp.width * bmp.height, vk: rec.vk, vs: rec.vs });
    announceSoon();
  }).catch(function () {
    persisted.delete(key); // unreadable: bake it again next time it is asked for
  }).finally(function () {
    decoding.delete(key);
  });
}
/* Load the index of kept pictures; drop ones from an older SPRITE_VERSION and
   the oldest beyond the cap. */
function hydrate() {
  openDB().then(function (db) {
    const tx = db.transaction(STORE, "readwrite"), st = tx.objectStore(STORE), req = st.getAll();
    req.onsuccess = function () {
      const rows = (req.result || []).sort(function (a, b) { return b.t - a.t; });
      const MAX_PERSIST = deviceBudget().spritePersistCap;
      rows.forEach(function (r, i) {
        if (r.v !== SPRITE_VERSION || i >= MAX_PERSIST) st.delete(r.key);
        else if (!persisted.has(r.key)) {
          persisted.set(r.key, r);
          seedVSpan(r.vk, r.vs); // the plan knows each kept piece's height without building it
        }
      });
    };
    tx.oncomplete = function () {
      db.close();
      if (persisted.size && typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
    };
    tx.onerror = function () { db.close(); };
  }).catch(function () {});
}

/* A texture finished loading: pictures baked while one was pending may be
   stale, so they leave the cache (they stay the pieces' stand-ins in
   lastById until the new picture lands). Every other picture is still right. */
export function invalidateTexturedSprites() {
  texGen++;
  cache.forEach(function (sp, key) {
    if (!sp.prov) return;
    cache.delete(key);
    pixels -= sp.px;
  });
  failed.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
}
/* The catalogue changed (a model added or edited in the modeler): custom
   definitions are re-hashed, so an edited model's pictures simply miss. */
export function invalidateSprites() {
  defSigs.clear();
  failed.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
}

if (typeof window !== "undefined") {
  window.addEventListener("catalogUpdated", invalidateSprites);
  window.addEventListener("customTextureLoaded", invalidateTexturedSprites);
  // the renderer came up: work queued while it was pending can run now
  window.addEventListener("thumbsReady", schedule);
  // leaving the page (tab hidden, closed): keep what was made this session
  // now, rather than one picture per quiet moment that may never come
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "hidden") return;
    toPersist.forEach(function (sp, key) { encode(key, sp); });
    toPersist.clear();
  });
  hydrate();
}
