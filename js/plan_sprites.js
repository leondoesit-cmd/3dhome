/* Top-down pictures of the REAL furniture models, for the presentation plan.

   Each piece is built with the same buildItem() the 3D view uses, into the
   shared offscreen renderer (js/offscreen_gl.js), and photographed straight
   down with an orthographic camera. The plan then draws that picture in the
   piece's own rotated frame. So the plan cannot disagree with the 3D view: a
   new variant, a resized sofa or an edited custom model changes both.

   Baking is never on the paint path. itemSprite() answers from the cache or
   returns a fallback (the piece's previous picture stretched to its new size,
   or null → the caller draws its line glyph) and queues the bake. The queue
   runs in idle slices of a few milliseconds, newest request per piece wins
   (a resize drag asks for a new size every pointermove and only the last one
   matters), and "planSpritesReady" is dispatched once per slice that
   produced something, so the plan repaints once, not once per picture.

   Frame: the camera looks down -y with up = -z, so screen right is +x and
   screen down is +z — exactly the frame drawItem() draws in after rotating,
   with the piece's front (+z) toward the bottom edge. */
import { THREE } from "./three_lazy.js";
import { offscreenGL, offscreenDead, useRig } from "./offscreen_gl.js";
import { FURN, buildItem } from "./furniture.js";
import { clearGroup } from "./primitives.js";
import { spriteKey, spriteBucket, SPRITE_BUCKETS, SPRITE_VERSION } from "./plan_sprite_key.js";

const PIXEL_BUDGET = 48e6; // ~190 MB of RGBA at most, usually far less
const SLICE_MS = 8,
  SLICE_BAKES = 3;

/* What a key is made of beyond the item itself: `texRev` moves when a custom
   texture finishes loading (a picture baked before it is stale), and a custom
   model's definition hash moves when the modeler edits it. Built-in models
   change only with the code, which SPRITE_VERSION covers — so a key is stable
   across sessions and a picture can be kept on disk. */
let texRev = 0;
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
  return spriteKey(it, bucket, texRev) + "|" + defSig(it.type);
}
const cache = new Map(); // key -> sprite (Map order = LRU order)
const lastById = new Map(); // item id -> its most recent sprite, any key
const queue = new Map(); // item id -> {key, it, bucket, pri}
const failed = new Set(); // keys whose model would not render: never retried
let pixels = 0,
  scheduled = false;

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
  while (pixels > PIXEL_BUDGET && cache.size > 1) {
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
  else if (!(opts && opts.noQueue) && !failed.has(key)) enqueue(it, bucket, key, maxPx);
  return near || (it.id != null ? lastById.get(it.id) : null) || null;
}

function enqueue(it, bucket, key, pri) {
  const id = it.id != null ? it.id : key;
  const cur = queue.get(id);
  if (cur && cur.key === key) return;
  let clone;
  try {
    clone = JSON.parse(JSON.stringify(it));
  } catch (e) {
    return;
  }
  clone.x = 0;
  clone.z = 0;
  clone.rot = 0;
  queue.set(id, { key: key, it: clone, bucket: bucket, pri: pri });
  schedule();
}

function schedule() {
  if (scheduled || !queue.size) return;
  scheduled = true;
  if (typeof requestIdleCallback === "function") requestIdleCallback(pump, { timeout: 150 });
  else setTimeout(pump, 16);
}

function pump() {
  scheduled = false;
  const g = offscreenGL();
  if (!g) {
    // still coming up: "thumbsReady" re-runs us. Dead: drop the queue, the
    // plan keeps its glyphs.
    if (offscreenDead()) queue.clear();
    return;
  }
  const t0 = now();
  let made = 0;
  while (queue.size && made < SLICE_BAKES && now() - t0 < SLICE_MS) {
    let bestId = null,
      best = null;
    queue.forEach(function (req, id) {
      if (!best || req.pri > best.pri) { best = req; bestId = id; }
    });
    queue.delete(bestId);
    if (cache.has(best.key)) continue;
    const sp = bake(g, best.it, best.bucket);
    if (sp) {
      store(best.key, sp);
      if (best.it.id != null) lastById.set(best.it.id, sp);
      if (persistable(best.it)) persist(best.key, sp);
      made++;
    } else failed.add(best.key);
  }
  if (made && typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
  if (queue.size) schedule();
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

function bake(g, it, bucket) {
  let out = null;
  try {
    clearGroup(g.root);
    buildItem(g.root, it);
    if (!g.root.children.length) return null;
    g.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g.root);
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) return null;
    const rect = spriteRect(box, it.w || 0, it.d || 0);
    const rw = rect.x1 - rect.x0,
      rd = rect.z1 - rect.z0,
      L = Math.max(rw, rd);
    const W = Math.max(8, Math.round((bucket * rw) / L)),
      H = Math.max(8, Math.round((bucket * rd) / L));
    const cx = (rect.x0 + rect.x1) / 2,
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
    useRig(g, "sprite");
    g.r.setSize(W, H, false);
    g.r.render(g.scene, cam);
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const cx2 = c.getContext("2d");
    cx2.drawImage(g.r.domElement, 0, 0, W, H, 0, 0, W, H);
    inkOutline(c, cx2, Math.max(1, Math.round(bucket / 160)));
    out = { img: c, rect: rect, w: it.w || 0, d: it.d || 0, px: W * H };
  } catch (e) {
    out = null;
  } finally {
    clearGroup(g.root); // one-shot model: free its GPU buffers now
  }
  return out;
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
const DB_NAME = "home3d_plan_sprites", STORE = "sprites", MAX_PERSIST = 600;
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
function persistable(it) {
  return !it.tex && !it.texParts;
}
function persist(key, sp) {
  if (!sp.img || typeof sp.img.toBlob !== "function") return;
  sp.img.toBlob(function (blob) {
    if (!blob) return;
    const rec = { key: key, v: SPRITE_VERSION, blob: blob, rect: sp.rect, w: sp.w, d: sp.d, t: Date.now() };
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
  createImageBitmap(rec.blob).then(function (bmp) {
    store(key, { img: bmp, rect: rec.rect, w: rec.w, d: rec.d, px: bmp.width * bmp.height });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
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
      rows.forEach(function (r, i) {
        if (r.v !== SPRITE_VERSION || i >= MAX_PERSIST) st.delete(r.key);
        else if (!persisted.has(r.key)) persisted.set(r.key, r);
      });
    };
    tx.oncomplete = function () {
      db.close();
      if (persisted.size && typeof window !== "undefined") window.dispatchEvent(new Event("planSpritesReady"));
    };
    tx.onerror = function () { db.close(); };
  }).catch(function () {});
}

/* A custom texture finished loading: pictures of textured pieces may be
   stale. Pictures of everything else are still right. */
export function invalidateTexturedSprites() {
  texRev++;
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
  hydrate();
}
