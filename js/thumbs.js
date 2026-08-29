// Library tile icons rendered from the REAL model.
//
// The old tile art was a fake isometric box scaled to the entry's w/d/h, so a
// sofa, a fridge and a rug all came out as the same slab in a different color —
// nothing in the icon told you what the piece was. Here the piece is built with
// its own build() into a small offscreen WebGL scene, lit and auto-framed, so
// the icon IS the model. Same builder as the 3D view, so a model can never
// disagree with its icon.
import { THREE, loadThree, threeLoaded } from "./three_lazy.js";
import { createRenderer, ready, LUX } from "./gpu.js";
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
let GL = null,
  glDead = false;
const THUMB_DB = "home3d_thumbnails_v2";
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

// True from the moment the renderer is requested until its backend is live.
// Thumbs asked for during that window must NOT be memoized — the cache stores
// "" on failure and would pin every icon to flat art for the rest of the
// session. Under r128's synchronous WebGLRenderer this window did not exist.
let glPending = false;

// Builds the offscreen scene. Deferred until the backend is up: PMREMGenerator
// (skyEnv) issues real GPU work and throws on an uninitialized renderer.
function buildGL(r) {
  r.setPixelRatio(1);
  r.setSize(SIZE, SIZE, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.environment = skyEnv(r);
  // Key strongly off-axis and a weak fill: white-on-white pieces (fridge,
  // toilet, upper cabinets) need a clearly shaded side or they dissolve into
  // the panel background at 48px.
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f959d, LUX * 0.5));
  const key = new THREE.DirectionalLight(0xfff4e6, LUX * 1.35);
  key.position.set(-90, 230, 190);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe9ff, LUX * 0.3);
  fill.position.set(180, 60, -140);
  scene.add(fill);
  const root = new THREE.Group();
  scene.add(root);
  return {
    r: r,
    scene: scene,
    root: root,
    cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000),
  };
}

// Returns the offscreen renderer bundle, or null while it is still coming up
// (or permanently, if there is no GPU). Never returns a half-built one.
function gl() {
  if (GL) return GL;
  if (glDead || glPending) return null;
  /* three is not on the boot path any more, so the catalog panel can render
     before the renderer library even exists. Take the same road as the async
     backend below: reserve the pending flag, fetch three, and re-announce
     "thumbsReady" so the flat art drawn in the meantime is replaced. */
  if (!threeLoaded()) {
    glPending = true;
    loadThree().then(function () {
      glPending = false;
      gl();
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
    // preferWebGL: thumbnails are 48px and are read back synchronously via
    // toDataURL, which the WebGL2 backend supports directly (see gpu.js).
    // preserveDrawingBuffer: toDataURL() runs after the draw call returns
    const r = createRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      preferWebGL: true,
    });
    ready(r).then(() => {
      GL = buildGL(r);
      glPending = false;
      // Tell the catalog UI to ask again — the icons it drew during init were
      // flat art and were deliberately left out of the cache. NOT
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
  if (!g && glPending) return "";
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
