// Quarter-screen, selection-fitted 3D preview for the Properties inspector.
// It deliberately shares the live planner scene (so nearby walls, floors and
// furniture remain visible) but owns a small renderer and an orbit-only camera.
import { THREE, threeLoaded } from "./three_lazy.js";
import { S } from "./state.js";
import { createRenderer, ready, render as renderGPU } from "./gpu.js";
import { getDynGroup, getMainScene, getSelectionBox3D, getSelectionObjects3D, init3D } from "./view3d.js";
import { wallById, wallGeom, wallTangentAt } from "./geometry.js";

var host = null,
  canvas = null,
  stateEl = null,
  resetBtn = null,
  renderer = null,
  camera = null,
  overlayScene = null,
  overlayRoot = null,
  overlayDirty = true,
  resizeObserver = null,
  initialized = false,
  visible = false,
  renderQueued = false,
  selectionKey = "",
  // three is late-bound, so these two cannot be built at module scope any more.
  // ensureThreeHere() fills them in before anything reads them.
  selectionBox = null,
  center = null,
  radius = 20,
  theta = Math.PI * 0.25,
  phi = Math.PI * 0.34,
  pointerId = null,
  pointerX = 0,
  pointerY = 0;

var SUPPORTED = {
  item: true,
  items: true,
  wall: true,
  walls: true,
  opening: true,
  room: true,
};

function keyForSelection() {
  var sel = S.sel;
  if (!sel) return "";
  if (sel.ref && sel.ref.id != null) return sel.kind + ":" + sel.ref.id;
  if (sel.kind === "room") return "room:" + String(sel.ref);
  if (sel.refs) return sel.kind + ":" + sel.refs.map(function (ref) {
    return ref && ref.id != null ? ref.id : String(ref);
  }).join(",");
  return sel.kind;
}

function ensureElements() {
  if (host) return true;
  host = document.getElementById("inspectorPreview");
  canvas = document.getElementById("inspectorPreviewCanvas");
  stateEl = document.getElementById("inspectorPreviewState");
  resetBtn = document.getElementById("inspectorPreviewReset");
  if (!host || !canvas) return false;

  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  host.addEventListener("wheel", function (event) {
    // The preview is intentionally orbit-only. Consume the wheel over it so a
    // trackpad cannot accidentally zoom either this camera or the main view.
    event.preventDefault();
  }, { passive: false });
  host.addEventListener("dblclick", function (event) {
    if (event.target === resetBtn) return;
    resetView();
  });
  if (resetBtn) resetBtn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    resetView();
  });
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(function () { scheduleRender(); });
    resizeObserver.observe(host);
  }
  window.addEventListener("scene3d:rebuilt", function () {
    if (!visible) return;
    overlayDirty = true;
    fitSelection(false);
    scheduleRender();
  });
  window.addEventListener("customTextureLoaded", scheduleRender);
  return true;
}

function ensureRenderer() {
  if (renderer || !canvas) return;
  try {
    renderer = createRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      preferWebGL: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    camera = new THREE.PerspectiveCamera(42, 1, 0.5, 50000);
    overlayScene = new THREE.Scene();
    overlayRoot = new THREE.Group();
    overlayRoot.name = "Inspector selection overlay";
    overlayScene.add(new THREE.HemisphereLight(0xffffff, 0x857966, Math.PI * 0.92));
    var overlaySun = new THREE.DirectionalLight(0xfff2df, Math.PI * 1.35);
    overlaySun.position.set(500, 750, 360);
    overlayScene.add(overlaySun);
    overlayScene.add(overlayRoot);
    ready(renderer).then(function () {
      initialized = true;
      fitSelection(false);
      scheduleRender();
    }).catch(function (error) {
      if (window.console && console.error) console.error("Inspector 3D preview failed:", error);
    });
  } catch (error) {
    if (window.console && console.error) console.error("Inspector 3D preview failed:", error);
  }
}

function fitSelection(resetAngles) {
  var box = getSelectionBox3D();
  if (!box || box.isEmpty()) return false;
  var sphere = box.getBoundingSphere(new THREE.Sphere());
  selectionBox.copy(box);
  center.copy(sphere.center);
  radius = Math.max(5, sphere.radius);
  if (resetAngles) {
    var front = frontOrbit();
    theta = front.theta;
    phi = front.phi;
  }
  if (stateEl) stateEl.classList.add("ready");
  return true;
}

// The authored furniture convention is local +Z = front. placeItem rotates the
// model by -rot around Y, so its world-facing vector is (-sin(rot), cos(rot)).
// A wall/opening uses the perpendicular to its tangent. The camera starts on
// that forward normal, almost level with the selection, rather than at the old
// generic bird's-eye diagonal. Dragging can still orbit away from this view.
function frontOrbit() {
  var sel = S.sel,
    thetaFront = Math.PI * 0.25,
    phiFront = Math.PI * 0.47;
  if (!sel) return { theta: thetaFront, phi: phiFront };
  var item = sel.kind === "item" ? sel.ref
    : sel.kind === "items" && sel.refs && sel.refs.length ? sel.refs[0]
      : null;
  if (item) {
    var rotation = THREE.MathUtils.degToRad(Number(item.rot) || 0);
    thetaFront = Math.PI / 2 + rotation;
    return { theta: thetaFront, phi: phiFront };
  }
  var wall = sel.kind === "wall" ? sel.ref
    : sel.kind === "walls" && sel.refs && sel.refs.length ? sel.refs[0]
      : sel.kind === "opening" && sel.ref ? wallById(sel.ref.wall)
        : null;
  if (wall) {
    var geom = wallGeom(wall),
      station = sel.kind === "opening" ? Number(sel.ref.s) || geom.L / 2 : geom.L / 2,
      tangent = wallTangentAt(wall, station) || { x: geom.ux, z: geom.uz },
      nx = -(tangent.z != null ? tangent.z : tangent.uz),
      nz = tangent.x != null ? tangent.x : tangent.ux;
    thetaFront = Math.atan2(nz, nx);
  }
  return { theta: thetaFront, phi: phiFront };
}

function updateCamera(width, height) {
  if (!camera) return;
  camera.aspect = width / Math.max(1, height);
  var halfVertical = THREE.MathUtils.degToRad(camera.fov * 0.5),
    halfHorizontal = Math.atan(Math.tan(halfVertical) * camera.aspect),
    limitingHalfFov = Math.max(0.08, Math.min(halfVertical, halfHorizontal)),
    distance = radius / Math.sin(limitingHalfFov) * 1.12,
    sinPhi = Math.sin(phi);
  camera.near = Math.max(0.25, distance - radius * 2.2);
  camera.far = Math.max(50000, distance + radius * 30);
  camera.position.set(
    center.x + distance * sinPhi * Math.cos(theta),
    center.y + distance * Math.cos(phi),
    center.z + distance * sinPhi * Math.sin(theta),
  );
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

function scheduleRender() {
  if (renderQueued || !visible) return;
  renderQueued = true;
  requestAnimationFrame(function () {
    renderQueued = false;
    paint();
  });
}

function paint() {
  if (!visible || !initialized || !renderer || !camera || !host || host.hidden) return;
  var scene = getMainScene();
  if (!scene) return;
  if (!fitSelection(false)) return;
  var rect = host.getBoundingClientRect(),
    width = Math.max(2, Math.round(rect.width)),
    height = Math.max(2, Math.round(rect.height));
  if (width <= 2 || height <= 2) return;
  renderer.setSize(width, height, false);
  updateCamera(width, height);
  scene.updateMatrixWorld(true);

  // When the selected piece sits against a wall, a perfectly fitted camera can
  // still be looking at the back of that wall. Open only the sight-lines that
  // cross geometry before they enter the selection's bounds. The objects are
  // restored immediately after this renderer has built its draw list, so the
  // main 3D view never changes and the rest of the local context remains.
  var occluders = previewOccluders();
  occluders.forEach(function (object) { object.visible = false; });

  // The main PMREM environment texture belongs to the main renderer's GPU.
  // Direct lights and the full visible scene still provide the local context;
  // temporarily omitting that renderer-owned texture keeps this second canvas
  // portable across WebGPU and WebGL2 backends.
  var environment = scene.environment;
  scene.environment = null;
  if (overlayDirty) rebuildSelectionOverlay();
  try {
    renderGPU(renderer, scene, camera);
    renderSelectionOverlay();
  } finally {
    scene.environment = environment;
    occluders.forEach(function (object) { object.visible = true; });
  }
}

function rebuildSelectionOverlay() {
  if (!overlayRoot) return;
  overlayRoot.traverse(function (object) {
    if (!object.material) return;
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(function (material) {
      material.dispose();
    });
  });
  overlayRoot.clear();
  getSelectionObjects3D().forEach(function (source) {
    source.updateWorldMatrix(true, true);
    var clone = source.clone(true);
    clone.matrix.copy(source.matrixWorld);
    clone.matrixAutoUpdate = false;
    clone.visible = true;
    clone.traverse(function (object) {
      object.visible = true;
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.material) {
        var materials = Array.isArray(object.material) ? object.material : [object.material];
        materials = materials.map(function (material) {
          var copy = material.clone();
          copy.needsUpdate = true;
          return copy;
        });
        object.material = Array.isArray(object.material) ? materials : materials[0];
      }
    });
    overlayRoot.add(clone);
  });
  overlayDirty = false;
}

function renderSelectionOverlay() {
  if (!renderer || !overlayScene || !overlayRoot || !overlayRoot.children.length) return;
  // Keep the already-painted surroundings, but start the selected model with a
  // fresh depth buffer. It therefore appears in front of an occluding wall,
  // while its own tabletop, legs, shelves and glass still depth-test against
  // one another exactly as they do in the main 3D view.
  renderer.autoClear = false;
  renderer.clearDepth();
  try {
    renderGPU(renderer, overlayScene, camera);
  } finally {
    renderer.autoClear = true;
  }
}

function belongsToSelection(object) {
  var sel = S.sel,
    refs = sel && sel.refs || [],
    node = object;
  if (!sel) return false;
  while (node) {
    var data = node.userData || {};
    if (sel.kind === "item" && data.item === sel.ref) return true;
    if (sel.kind === "items" && refs.indexOf(data.item) >= 0) return true;
    if (sel.kind === "wall" && data.wall === sel.ref) return true;
    if (sel.kind === "walls" && refs.indexOf(data.wall) >= 0) return true;
    if (sel.kind === "opening" && data.opening === sel.ref) return true;
    node = node.parent;
  }
  return false;
}

function previewOccluders() {
  var dyn = getDynGroup();
  if (!dyn || !camera || selectionBox.isEmpty()) return [];
  var min = selectionBox.min,
    max = selectionBox.max,
    samples = [center.clone()],
    raycaster = new THREE.Raycaster(),
    entry = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    blocked = new Set();
  [min.x, max.x].forEach(function (x) {
    [min.y, max.y].forEach(function (y) {
      [min.z, max.z].forEach(function (z) {
        samples.push(new THREE.Vector3(x, y, z));
      });
    });
  });
  samples.forEach(function (sample) {
    direction.subVectors(sample, camera.position).normalize();
    raycaster.set(camera.position, direction);
    if (!raycaster.ray.intersectBox(selectionBox, entry)) return;
    var entryDistance = camera.position.distanceTo(entry);
    raycaster.far = Math.max(0, entryDistance - 0.5);
    raycaster.intersectObject(dyn, true).forEach(function (hit) {
      var object = hit.object;
      if (!object || !object.isMesh || !object.visible || belongsToSelection(object)) return;
      blocked.add(object);
    });
  });
  return Array.from(blocked);
}

function resetView() {
  fitSelection(true);
  scheduleRender();
}

function onPointerDown(event) {
  if (!visible || event.button !== 0 || event.target === resetBtn) return;
  pointerId = event.pointerId;
  pointerX = event.clientX;
  pointerY = event.clientY;
  host.classList.add("dragging");
  host.setPointerCapture(pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (event.pointerId !== pointerId) return;
  var dx = event.clientX - pointerX,
    dy = event.clientY - pointerY;
  pointerX = event.clientX;
  pointerY = event.clientY;
  theta -= dx * 0.0105;
  phi = THREE.MathUtils.clamp(phi + dy * 0.0085, 0.18, Math.PI * 0.49);
  scheduleRender();
  event.preventDefault();
}

function onPointerUp(event) {
  if (event.pointerId !== pointerId) return;
  if (host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
  pointerId = null;
  host.classList.remove("dragging");
}

/* The preview mirrors the main 3D scene, so it needs three AND a built scene.
   It can be reached from a session that has never opened the 3D pane (a phone
   on "plan" that selects a wall), so bounce off the build and come back rather
   than throwing.

   init3D(), not loadThree(): loadThree() only populates the three namespace,
   while everything the preview reads — getSelectionObjects3D(), getMainScene()
   — lives on the `dyn` group that build3D() creates. Gating on the library
   alone left the preview waiting forever on a scene nobody had asked for, and
   the animate loop that drains S.dirty3D lives inside build3D too, so pending
   rebuilds were dropped as well. init3D() is idempotent and returns its own
   promise, so repeated selections while it is in flight cost nothing. */
function threeHere() {
  if (!threeLoaded() || !getDynGroup()) {
    init3D().then(function () { syncInspectorPreview(); }, function () {});
    return false;
  }
  if (!selectionBox) {
    selectionBox = new THREE.Box3();
    center = new THREE.Vector3();
  }
  return true;
}

export function syncInspectorPreview() {
  if (!ensureElements()) return;
  var nextVisible = !!(S.sel && SUPPORTED[S.sel.kind]);
  visible = nextVisible;
  host.hidden = !nextVisible;
  if (!nextVisible) {
    pointerId = null;
    host.classList.remove("dragging");
    return;
  }
  // Nothing below this line runs without three, and everything above it does.
  if (!threeHere()) return;
  var nextKey = keyForSelection(), changed = nextKey !== selectionKey;
  selectionKey = nextKey;
  if (changed) overlayDirty = true;
  if (changed && stateEl) stateEl.classList.remove("ready");
  ensureRenderer();
  fitSelection(changed);
  scheduleRender();
}
