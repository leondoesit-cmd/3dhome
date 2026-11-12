/* The CAD editor's topology pick edges, temporary axes, decorations and part
   building, split out of js/modeler.js. It shares the editor's state through
   live imports from ../modeler.js. */
import { FURN, PRICE, buildItem, flabel } from "../furniture.js";
import { getLang } from "../i18n.js";
import { addMeshSharpEdges, buildExactMesh, hexNum } from "../modeler_mesh_geometry.js";
import { buildLoft, buildRev, partBounds, partPatternRotations } from "../modeler_part_geometry.js";
import { sheetSharpSolids } from "../modeler/drawing_sheet.js";
import { addTemporaryAxes, addTopologyPickEdges } from "../modeler/library_assembly_state.js";
import { retainExactPreview } from "../modeler/library_panel.js";
import { applyTexTo } from "../modeler/library_store.js";
import { addFaceAppearances, addFaceHighlights, addPartFeatureOverlays, applyViewportDisplayStyle, buildExt, isEntryAffectedByHover, syncViewportMeshSelection } from "../modeler/viewport_decorations.js";
import { box, clearGroup, cyl, sph } from "../primitives.js";
import { curveSegments } from "../sketch_profiles.js";
import { fin, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, buildPartCount, decoGroups, lastDecoratedHover, set_buildPartCount,
  set_lastDecoratedHover, viewportPartByMesh,
} from "../modeler.js";

function refreshDecorations(render = true) {
  if (retainExactPreview()) return;
  if (!E.pv) return;
  var currentHover = E.hoverTopology;
  decoGroups.forEach(function (entry) {
    var selectionStamp = JSON.stringify((E.topologySelection || []).filter(function (ref) { return isEntryAffectedByHover(entry, ref); }));
    var needsRebuild = entry.group.children.length === 0
      || entry.dirty
      || entry.selectionStamp !== selectionStamp
      || entry.hadHighlight
      || isEntryAffectedByHover(entry, currentHover)
      || isEntryAffectedByHover(entry, lastDecoratedHover);
    if (!needsRebuild) return;
    clearGroup(entry.group);
    E.buildComponent = entry.component || null;
    try {
      addTopologyPickEdges(entry.group, entry.part, entry.mesh);
      addFaceHighlights(entry.group, entry.part, entry.mesh);
      addTemporaryAxes(entry.group,entry.part);
    } finally {
      E.buildComponent = null;
    }
    entry.dirty = false;
    entry.selectionStamp = selectionStamp;
    entry.hadHighlight = isEntryAffectedByHover(entry, currentHover);
  });
  set_lastDecoratedHover(currentHover);
  if (render) E.pv.render();
}

function buildPart(g, p, displayStyle, presentationOnly = false) {
  set_buildPartCount(buildPartCount + 1);
  /* One THREE child per body so a live parameter drag can dispose this part
     without tearing down every other GPU mesh in the viewport. */
  var partRoot = new THREE.Group();
  partRoot.userData.cadPartRoot = p.id;
  partRoot.userData.cadFeatureId = p.featureId || "feature:part:" + p.id;
  if (p.derivedFeatureId) partRoot.userData.cadDerivedFeatureId = p.derivedFeatureId;
  if (p.toolboxFeatureId) partRoot.userData.cadToolboxFeatureId = p.toolboxFeatureId;
  g.add(partRoot);
  g = partRoot;
  var rotations=partPatternRotations(p);
  /* The newest transform is the outermost group: R(new) × R(previous) × body.
     This also makes a pattern of an existing pattern behave predictably. */
  for(var rotationIndex=rotations.length-1;rotationIndex>=0;rotationIndex--){
    var rotation=rotations[rotationIndex],transformGroup=new THREE.Group(),pivot=rotation.pivot || {x:0,y:0,z:0},bodyGroup=new THREE.Group();
    transformGroup.position.set(Number(pivot.x)||0,Number(pivot.y)||0,Number(pivot.z)||0);transformGroup.rotation[rotation.axis]=rotation.angle;
    bodyGroup.position.set(-(Number(pivot.x)||0),-(Number(pivot.y)||0),-(Number(pivot.z)||0));transformGroup.add(bodyGroup);g.add(transformGroup);g=bodyGroup;
  }
  var opt = {
    metal: fin(p.metal) ? p.metal : undefined,
    rough: fin(p.rough) ? p.rough : undefined,
    opacity: fin(p.opacity) ? p.opacity : undefined,
    trans: fin(p.opacity) && p.opacity < 1,
  };
  var col = hexNum(p.color), me = null, b;
  if (p.meshData && !p.exactPending) {
    me = buildExactMesh(g, p);
  } else if (p.kind === "box") {
    if (p.tex) opt.tex = p.tex; // box() handles texture mapping itself
    if (sheetSharpSolids) opt.sharp = true;   // see sheetSharpSolids
    me = box(g, p.x0, p.x1, p.y0, p.y1, p.z0, p.z1, col, opt);
  } else if (p.kind === "cyl") {
    opt.r2 = p.r2 != null ? p.r2 : p.r;
    // The furniture default of 24 sides is fine across a room; under a modeller's
    // nose a 40 cm cylinder shows every one of them.
    opt.seg = curveSegments(Math.max(p.r, opt.r2), Math.PI * 2, 24, 96);
    var cylinderDirection = p.axis ? new THREE.Vector3(p.axis.x, p.axis.y, p.axis.z).normalize() : new THREE.Vector3(0, 1, 0);
    me = cyl(g, p.x + cylinderDirection.x * p.h / 2, p.y + cylinderDirection.y * p.h / 2, p.z + cylinderDirection.z * p.h / 2, p.r, p.h, col, opt);
    if (me && p.axis) me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cylinderDirection);
    if (p.tex) applyTexTo(me, p, Math.PI * 2 * p.r, p.h);
  } else if (p.kind === "sph") {
    me = sph(g, p.x, p.y, p.z, p.r, col, opt);
    if (p.tex) applyTexTo(me, p, 4 * p.r, 4 * p.r);
  } else if (p.kind === "ext") {
    me = buildExt(g, p, opt);
    if (p.tex && me) { b = partBounds(p); applyTexTo(me, p, b.x1 - b.x0, b.y1 - b.y0); }
  } else if (p.kind === "rev") {
    me = buildRev(g, p);
    if (p.tex && me) { b = partBounds(p); applyTexTo(me, p, b.x1 - b.x0, b.y1 - b.y0); }
  } else if (p.kind === "loft") {
    me = buildLoft(g, p); // no UVs on lofted geometry — color/material only
  }
  if (me) {
    /* Display style belongs to the editor viewport, not to the part material.
       Keeping it out of `p.opacity` means toggling X-ray inspection never
       dirties the document or leaks into placed instances of this model. */
    applyViewportDisplayStyle(me, displayStyle, p.previewOnly);
    me.userData.cadPart = p.id;
    me.userData.cadFeatureId = p.featureId || "feature:part:" + p.id;
    me.userData.cadFaceRanges = p.meshData && p.meshData.faceRanges || null;
    me.userData.cadSubshapeMap = p.meshData && p.meshData.subshapeMap || null;
    viewportPartByMesh.set(me, { part: p, component: E.buildComponent || null });
    addMeshSharpEdges(me);
    var deco = new THREE.Group();
    deco.userData.cadDeco = p.id;
    g.add(deco);
    if (!presentationOnly) {
      decoGroups.push({ part: p, mesh: me, group: deco, component: E.buildComponent || null });
      addTopologyPickEdges(deco, p, me);
    }
    addFaceAppearances(g, p, me);
    me.traverse(function (object) {
      if (viewportPartByMesh.has(object)) syncViewportMeshSelection(object);
    });
    if (!presentationOnly) {
      addFaceHighlights(deco, p, me);
      addTemporaryAxes(deco,p);
    }
    addPartFeatureOverlays(g, p);
  }
  return me;
}

// Convert a built-in (procedural) furniture type into an editable part list by
// building its meshes once and reading them back. Unrotated cylinders/spheres
// keep their exact shape; everything else (incl. RoundedBox, whose .parameters
// report the pre-scale unit box) becomes its axis-aligned bounding box.
function defFromBuiltin(type, it) {
  var f = FURN[type];
  if (!f || !f.build) return null;
  var g = new THREE.Group();
  /* Decompose the piece AS IT IS ON SCREEN, not the catalogue default. Copying
     the whole item is what makes that true for every builder at once: variant
     picks the shape and finish, and `cab` carries a modular cabinet's entire
     spec — cherry-picking a field list here is how a cabinet you had just
     designed came back as the stock unit. The copy is deep so a builder that
     caches or normalizes its spec cannot write back into the placed item. */
  var item = JSON.parse(JSON.stringify(it || {}));
  item.type = type;
  item.w = (it && it.w) || f.w;
  item.d = (it && it.d) || f.d;
  item.h = (it && it.h) || f.h;
  try {
    buildItem(g, item);
  } catch (e) {
    return null;
  }
  g.updateMatrixWorld(true);
  var parts = [];
  g.traverse(function (o) {
    if (!o.isMesh || !o.geometry || !o.material) return;
    var mat = o.material;
    var common = {
      id: uid(),
      color: "#" + mat.color.getHexString(),
      metal: fin(mat.metalness) ? mat.metalness : 0.08,
      rough: fin(mat.roughness) ? mat.roughness : 0.8,
    };
    if (mat.transparent && fin(mat.opacity) && mat.opacity < 1) common.opacity = mat.opacity;
    var gt = o.geometry.type, pr = o.geometry.parameters || {};
    var unrotated = !o.rotation.x && !o.rotation.y && !o.rotation.z;
    if (gt === "CylinderGeometry" && unrotated) {
      var p = new THREE.Vector3();
      o.getWorldPosition(p);
      parts.push(Object.assign({
        kind: "cyl", name: "cylinder",
        x: p.x, z: p.z, y: p.y - pr.height / 2,
        r: pr.radiusBottom, r2: pr.radiusTop, h: pr.height,
      }, common));
    } else if (gt === "SphereGeometry") {
      var q = new THREE.Vector3();
      o.getWorldPosition(q);
      parts.push(Object.assign({ kind: "sph", name: "sphere", x: q.x, y: q.y, z: q.z, r: pr.radius }, common));
    } else {
      var bb = new THREE.Box3().setFromObject(o);
      if (!isFinite(bb.min.x) || bb.isEmpty()) return;
      parts.push(Object.assign({
        kind: "box", name: "box",
        x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: bb.max.y, z0: bb.min.z, z1: bb.max.z,
      }, common));
    }
    if (o.geometry.dispose) o.geometry.dispose();
    if (mat.dispose) mat.dispose();
  });
  if (!parts.length) return null;
  return {
    key: "cm_" + Date.now().toString(36),
    name: flabel(type) + (getLang() === "en" ? " (custom)" : " (מותאם)"),
    price: PRICE[type] || 0,
    col: f.col || "#c9bfae",
    parts: parts,
  };
}

export { buildPart, defFromBuiltin, refreshDecorations };
