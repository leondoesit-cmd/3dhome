/* The 3D pane's build preview: draws the primitives js/build3d_ghost.js
   describes (what the active planner tool is about to build) as transparent
   or opaque volumes with a thin edge line.

   Kept off every path the model takes: one Group ("buildGhost") hung on the
   scene itself, not on `dyn`, so it is never raycast (plannerPointer3D and
   focusAt read the pickable roots / dyn only), never selected, never
   exported and never folded into build3D's merges; a rebuild that detached
   it gets it re-attached on the next sync.

   Cheap by construction, because shader re-keying is what makes this app
   hitch: node materials only, made ONCE per tone (a transparent ghost and an
   opaque solid variant) and swapped; opacity is the material's uniform; no
   castShadow / receiveShadow; boxes are one shared unit box scaled per spec;
   prisms and tubes rebuild their geometry only when their own spec changes;
   an unchanged spec list does no work at all. */
import { THREE } from "../three_lazy.js";
import { getMainScene, requestRender } from "../view3d.js";
import { GHOST_TONE_COLORS, ghostSignature } from "../build3d_ghost.js";

var bghGroup = null, bghBoxGeo = null, bghBoxEdges = null;
var bghMats = null; // { ghost: {tone: mat}, solid: {tone: mat}, edge: {tone: mat} }
var bghBoxes = []; // pooled { mesh, edges }
var bghShapes = new Map(); // signature -> { mesh, edges, used }
var bghLastSig = "", bghLastMode = "", bghLastOpacity = -1;

function bghReady() {
  return !!(THREE && THREE.Group && THREE.MeshBasicNodeMaterial && THREE.LineBasicNodeMaterial);
}

function bghEdgeColor(hex) {
  var c = new THREE.Color(hex);
  c.offsetHSL(0, 0, -0.18);
  return c;
}

function bghMaterials() {
  if (bghMats) return bghMats;
  bghMats = { ghost: {}, solid: {}, edge: {} };
  Object.keys(GHOST_TONE_COLORS).forEach(function (tone) {
    var color = GHOST_TONE_COLORS[tone];
    bghMats.ghost[tone] = new THREE.MeshBasicNodeMaterial({
      color: color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    bghMats.solid[tone] = new THREE.MeshBasicNodeMaterial({ color: color, fog: false });
    bghMats.edge[tone] = new THREE.LineBasicNodeMaterial({ color: bghEdgeColor(color), fog: false });
  });
  return bghMats;
}

function bghEnsureGroup() {
  var scene = getMainScene();
  if (!scene || !bghReady()) return null;
  if (!bghGroup) {
    bghGroup = new THREE.Group();
    bghGroup.name = "buildGhost";
    bghGroup.userData.noPick = true;
    bghGroup.userData.noExport = true;
    bghBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    bghBoxEdges = new THREE.EdgesGeometry(bghBoxGeo);
  }
  if (bghGroup.parent !== scene) scene.add(bghGroup);
  return bghGroup;
}

function bghNoShadow(o) {
  o.castShadow = false;
  o.receiveShadow = false;
  o.frustumCulled = false;
  o.renderOrder = 20;
  return o;
}

function bghBox(i) {
  if (bghBoxes[i]) return bghBoxes[i];
  var mats = bghMaterials();
  var mesh = bghNoShadow(new THREE.Mesh(bghBoxGeo, mats.ghost.ok));
  var edges = bghNoShadow(new THREE.LineSegments(bghBoxEdges, mats.edge.ok));
  mesh.add(edges);
  bghGroup.add(mesh);
  bghBoxes[i] = { mesh: mesh, edges: edges };
  return bghBoxes[i];
}

function bghPrismGeometry(spec) {
  var shape = new THREE.Shape(spec.pts.map(function (p) { return new THREE.Vector2(p.x, -p.z); }));
  var geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.5, spec.y1 - spec.y0), bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); // shape (x, -z) extruded along +z  →  plan (x, z), up +y
  geo.translate(0, spec.y0, 0);
  return geo;
}

function bghTubeGeometry(spec) {
  var path = new THREE.CurvePath();
  for (var i = 1; i < spec.pts.length; i++) {
    var a = spec.pts[i - 1], b = spec.pts[i];
    path.add(new THREE.LineCurve3(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)));
  }
  return new THREE.TubeGeometry(path, Math.max(1, (spec.pts.length - 1) * 2), Math.max(1, spec.r || 3), 8, false);
}

function bghShape(spec) {
  var key = ghostSignature([{ shape: spec.shape, pts: spec.pts, y0: spec.y0, y1: spec.y1, r: spec.r }]);
  var entry = bghShapes.get(key);
  if (!entry) {
    var mats = bghMaterials();
    var geo = spec.shape === "tube" ? bghTubeGeometry(spec) : bghPrismGeometry(spec);
    var mesh = bghNoShadow(new THREE.Mesh(geo, mats.ghost.ok));
    var edges = null;
    if (spec.shape === "prism") {
      edges = bghNoShadow(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), mats.edge.ok));
      mesh.add(edges);
    }
    bghGroup.add(mesh);
    entry = { mesh: mesh, edges: edges, used: false };
    bghShapes.set(key, entry);
  }
  return entry;
}

function bghPaint(entry, tone, mode) {
  var mats = bghMaterials(), t = GHOST_TONE_COLORS[tone] ? tone : "ok";
  var want = mode === "solid" ? mats.solid[t] : mats.ghost[t];
  if (entry.mesh.material !== want) entry.mesh.material = want;
  if (entry.edges && entry.edges.material !== mats.edge[t]) entry.edges.material = mats.edge[t];
  entry.mesh.visible = true;
}

/** Show `specs` (ghostSpecs output) in `prefs.mode` ("ghost" | "solid"). */
export function syncBuildGhost(specs, prefs) {
  var mode = prefs && prefs.mode === "solid" ? "solid" : "ghost";
  var opacity = prefs && Number.isFinite(prefs.opacity) ? prefs.opacity : 0.45;
  if (!specs || !specs.length) { hideBuildGhost(); return; }
  var group = bghEnsureGroup();
  if (!group) return;
  var sig = ghostSignature(specs);
  if (sig === bghLastSig && mode === bghLastMode && opacity === bghLastOpacity && group.visible) return;
  var mats = bghMaterials();
  if (opacity !== bghLastOpacity)
    Object.keys(mats.ghost).forEach(function (tone) { mats.ghost[tone].opacity = opacity; });
  bghLastSig = sig; bghLastMode = mode; bghLastOpacity = opacity;
  bghShapes.forEach(function (entry) { entry.used = false; });
  var nBox = 0;
  specs.forEach(function (s) {
    if (s.shape === "box") {
      var b = bghBox(nBox++);
      b.mesh.position.set(s.cx, s.cy, s.cz);
      b.mesh.rotation.set(0, s.rotY || 0, 0);
      b.mesh.scale.set(Math.max(0.1, s.w), Math.max(0.1, s.h), Math.max(0.1, s.d));
      bghPaint(b, s.tone, mode);
    } else if (s.shape === "prism" || s.shape === "tube") {
      var e = bghShape(s);
      e.used = true;
      bghPaint(e, s.tone, mode);
    }
  });
  for (var i = nBox; i < bghBoxes.length; i++) bghBoxes[i].mesh.visible = false;
  bghShapes.forEach(function (entry, key) {
    if (entry.used) return;
    group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    if (entry.edges) entry.edges.geometry.dispose();
    bghShapes.delete(key);
  });
  group.visible = true;
  requestRender();
}

export function hideBuildGhost() {
  if (!bghGroup || !bghGroup.visible) return;
  bghGroup.visible = false;
  bghLastSig = "";
  requestRender();
}
