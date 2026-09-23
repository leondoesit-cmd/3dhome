// Library tile icons rendered from the REAL model.
//
// The old tile art was a fake isometric box scaled to the entry's w/d/h, so a
// sofa, a fridge and a rug all came out as the same slab in a different color —
// nothing in the icon told you what the piece was. Here the piece is built with
// its own build() into a small offscreen WebGL scene, lit and auto-framed, so
// the icon IS the model. Same builder as the 3D view, so a model can never
// disagree with its icon.
import { THREE } from "./three_lazy.js";
import { offscreenGL, offscreenPending, useRig } from "./offscreen_gl.js";
import { FURN, buildItem } from "./furniture.js";
import { clearGroup } from "./primitives.js";

const SIZE = 192; // render resolution; tiles display it at ~48px
// front-right three-quarter view (models face +z): reads depth without hiding
// the front, and stays identical for every entry so the grid looks like a set
// Built on first use, not at module load: three is late-bound (three_lazy.js)
// and THREE.Vector3 does not exist until something has asked for a scene.
let DIR = null;
function dir() {
  return (DIR ||= new THREE.Vector3(0.58, 0.5, 0.86).normalize());
}

const cache = new Map(); // type -> data URL (or "" when the model won't render)
const THUMB_DB = "home3d_thumbnails_v4";
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
    req.onsuccess = () => (req.result || []).forEach((entry) => {
      if (FURN[entry.type] && !cache.has(entry.type)) cache.set(entry.type, entry.url || "");
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

function render(g, type) {
  const f = FURN[type];
  buildItem(g.root, {
    id: "thumb",
    type: type,
    x: 0,
    z: 0,
    w: f.w,
    d: f.d,
    h: f.h,
    rot: 0,
  });
  if (!g.root.children.length) return "";
  const box = new THREE.Box3().setFromObject(g.root);
  if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) return "";
  frame(g.cam, box);
  g.r.setSize(SIZE, SIZE, false);
  useRig(g, "thumb");
  g.r.render(g.scene, g.cam);
  return g.r.domElement.toDataURL();
}

// Rendered icon for a catalog type, or "" if it cannot be drawn. Memoized:
// renderFurnUI() re-runs on every search keystroke, nav step and language
// change, and a re-render per keystroke would stutter the panel.
export function modelThumb(type) {
  const hit = cache.get(type);
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
  cache.set(type, url);
  persistThumb(type, url).catch(() => {});
  return url;
}

export function hasThumb(type) {
  return cache.get(type) !== undefined;
}

// A new or edited custom model may have changed its look.
export function clearThumbCache() {
  cache.clear();
  thumbDB().then((database) => {
    const tx = database.transaction(THUMB_STORE, "readwrite");
    tx.objectStore(THUMB_STORE).clear();
    tx.oncomplete = () => database.close();
  }).catch(() => {});
}
