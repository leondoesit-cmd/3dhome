/* The CAD editor's saved-model library panel: room placement, JSON
   import/export, disk backups, draft recovery and thumbnails, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { explodeLines } from "../cad_exploded_view.js";
import { flattenAssembly, isSubassembly } from "../core/assembly_structure.js";
import { withRetiredGpuChildren } from "../core/gpu_child_retirement.js";
import { render as gpuRender } from "../gpu.js";
import { normalizeTransform } from "../modeler_part_geometry.js";
import { addFlexibleSpringPreview, syncSizeReadout } from "../modeler/component_mates.js";
import { occurrenceWorldBounds } from "../modeler/document_outputs.js";
import { drawSketch, invalidateDrawing, syncSheetPanel } from "../modeler/drawing_sheet.js";
import { activeParts, committedRenderedParts, componentDef, defBounds, livePreviewParts, renderedParts } from "../modeler/library_store.js";
import { syncRetainedExactPreviewStatus, syncSketchOpenPathFeedback } from "../modeler/sketch_entities.js";
import { addAssemblyContextGhosts, syncLiveDownstreamBadge } from "../modeler/tree_assembly.js";
import { applySectionClipping, syncSectionHelper } from "../modeler/view_modes.js";
import { addDocumentOverlays, syncViewportMeshSelection } from "../modeler/viewport_decorations.js";
import { addInstant3dHandles } from "../modeler/viewport_input.js";
import { clearGroup } from "../primitives.js";
import { S } from "../state.js";
import { THREE } from "../three_lazy.js";
import { getMainScene, has3D } from "../view3d.js";
import {
  E, applyAssemblyMates, assemblyPreviewSolved, buildPart, decoGroups,
} from "../modeler.js";

function buildAssembly(parent, assembly = E.assembly) {
  if (!assembly) return;
  if (assembly === E.assembly && !assemblyPreviewSolved) applyAssemblyMates(assembly);
  assembly.components.forEach(function (component) {
    if (component.visible === false) return;
    var group = buildComponentGroup(component, null, "");
    if (!group) return;
    group.traverse(function (object) { syncViewportMeshSelection(object, component); });
    parent.add(group);
  });
  if (assembly === E.assembly) {
    addExplodeLeaders(parent);
    addInterferenceVisuals(parent);
  }
}

/* Explode lines: a dashed leader from each moved component's mated centre to
   where the exploded view drew it. Never part of the model, only of the view. */
function assemblyExplodeLines(assembly = E.assembly) {
  var occurrences=flattenAssembly(assembly,{visibleOnly:true});
  return explodeLines(assembly, function (component,target) {
    var matching=occurrences.filter(function(occurrence){return target.path.every(function(id,index){return String(occurrence.path[index])===id;});});
    var b=null;
    matching.forEach(function(occurrence){var next=occurrenceWorldBounds(occurrence.component,occurrence.placement);if(!next)return;if(!b)b=Object.assign({},next);else ['x','y','z'].forEach(function(axis){b[axis+'0']=Math.min(b[axis+'0'],next[axis+'0']);b[axis+'1']=Math.max(b[axis+'1'],next[axis+'1']);});});
    return b ? { x:(b.x0 + b.x1) / 2, y:(b.y0 + b.y1) / 2, z:(b.z0 + b.z1) / 2 } : null;
  });
}
function addExplodeLeaders(parent) {
  assemblyExplodeLines().forEach(function (line) {
    var geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(line.from.x, line.from.y, line.from.z), new THREE.Vector3(line.to.x, line.to.y, line.to.z)]);
    var leader = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color:0x4dabf7, dashSize:.6, gapSize:.35, depthTest:false }));
    leader.computeLineDistances(); leader.renderOrder = 60; leader.userData.cadExplodeLine = line.id; parent.add(leader);
  });
}

/* One component's group. A top-level component carries `cadComponent` — it is
   what gets picked, selected, dragged and mated. The children of a sub-assembly
   carry `cadSubComponent` instead, sit at their own poses inside it, and build
   their parts under the path prefix their faces are named by on the
   sub-assembly (see builtTopologyId). */
function buildComponentGroup(component, top, prefix, presentationOnly = false) {
  var group = new THREE.Group(), tr = normalizeTransform(component);
  group._cadExplodeComponent = component;
  group.name = component.name || component.modelKey || component.assemblyKey || "";
  if (top) group.userData.cadSubComponent = component.id;
  else group.userData.cadComponent = component.id;
  if (isSubassembly(component)) {
    component.asm.components.forEach(function (child) {
      if (child.visible === false) return;
      var inner = buildComponentGroup(child, top || component, prefix + child.id + "/", presentationOnly);
      if (inner) group.add(inner);
    });
  } else {
    var def = componentDef(component);
    if (!def || !Array.isArray(def.parts)) return null;
    /* Face highlights and pick edges are built per part and have no other way
       to know which instance they belong to. Two components off the same
       library model share every persistent id, so without this the selected
       face lights up on both. */
    E.buildComponent = top ? { id: top.id, prefix: prefix } : component;
    /* Cleared even if a part throws. Leaving it set would filter every later
       selection and hover against a component that is no longer being built,
       so face highlights stop appearing anywhere until the editor is reopened. */
    try {
      if(!addFlexibleSpringPreview(group,component))activeParts(def).forEach(function (part) { buildPart(group, part, E.displayStyle, presentationOnly); });
    } finally {
      E.buildComponent = null;
    }
  }
  /* An exploded view is a viewing offset, not a change to the model: it is
     added to the pose here and never written back to the transform, so
     collapsing the view restores the mated position exactly. */
  var blown = component.explodedOffset || null;
  group.position.set(tr.x + (blown && blown.x || 0), tr.y + (blown && blown.y || 0), tr.z + (blown && blown.z || 0));
  group.rotation.set((tr.rx * Math.PI) / 180, (tr.ry * Math.PI) / 180, (tr.rz * Math.PI) / 180);
  if(component.transparent)group.traverse(function(object){
    if(!object.isMesh || !object.material)return;
    var materials=Array.isArray(object.material)?object.material:[object.material];
    materials=materials.map(function(material){var copy=material.clone();copy.transparent=true;copy.opacity=.22;copy.depthWrite=false;return copy;});
    object.material=Array.isArray(object.material)?materials:materials[0];
  });
  return group;
}

function addInterferenceVisuals(parent) {
  (E.interferenceHits || []).forEach(function (hit,index) {
    var bounds=hit && hit.bounds;if(!bounds)return;
    var sx=bounds.x1-bounds.x0,sy=bounds.y1-bounds.y0,sz=bounds.z1-bounds.z0;
    if(!(sx>0&&sy>0&&sz>0))return;
    var geometry=new THREE.BoxGeometry(sx,sy,sz);
    var material=new THREE.MeshBasicMaterial({color:0xff244f,transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide});
    var mesh=new THREE.Mesh(geometry,material);mesh.position.set((bounds.x0+bounds.x1)/2,(bounds.y0+bounds.y1)/2,(bounds.z0+bounds.z1)/2);
    mesh.renderOrder=80;mesh.userData.cadInterference=index;mesh.userData.interferencePair=[hit.a,hit.b];parent.add(mesh);
    var wire=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0xff0038,transparent:true,opacity:.95}));
    wire.position.copy(mesh.position);wire.renderOrder=81;wire.userData.cadInterference=index;parent.add(wire);
  });
}

function fillLivePreviewGroup(live) {
  if (!live) return;
  livePreviewParts().forEach(function (part) { buildPart(live, part, E.displayStyle); });
  addInstant3dHandles(live);
}

function dropPreviewDecorationGroups() {
  for (var i = decoGroups.length - 1; i >= 0; i--) {
    if (decoGroups[i].part && decoGroups[i].part.previewOnly) decoGroups.splice(i, 1);
  }
}

function setCommittedPartVisible(partId, visible) {
  if (!E.pv || !E.pv.grp || !partId) return;
  E.pv.grp.children.forEach(function (child) {
    if (child === E.pv.liveGrp) return;
    var match = false;
    child.traverse(function (object) {
      var data = object.userData;
      if (data && (data.cadPart === partId || data.cadDeco === partId || data.cadPartRoot === partId)) match = true;
    });
    if (match) child.visible = visible;
  });
}

function syncReplacedBodyVisibility() {
  var hideId = E.authoring && E.authoring.previewReplacesPartId || null;
  if (E._hiddenPreviewReplaceId && E._hiddenPreviewReplaceId !== hideId) {
    setCommittedPartVisible(E._hiddenPreviewReplaceId, true);
  }
  if (hideId) setCommittedPartVisible(hideId, false);
  E._hiddenPreviewReplaceId = hideId;
}

function patchLivePreviewLayer() {
  if (!E.pv || !E.pv.liveGrp || !E.pv.liveGrp.parent) return false;
  dropPreviewDecorationGroups();
  return withRetiredGpuChildren(E.pv.liveGrp,function(){return true;},function(){return new THREE.Group();},clearGroup,function(){
  fillLivePreviewGroup(E.pv.liveGrp);
  applySectionClipping(E.pv.liveGrp);
  syncReplacedBodyVisibility();
  var box = new THREE.Box3().setFromObject(E.pv.grp);
  E.pv.pickBounds = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere());
  E.pv.render();
  return true;
  });
}

function markLiveDirtyPart(part) {
  if (!part || !part.id) return;
  if (!E._liveDirtyPartIds) E._liveDirtyPartIds = {};
  E._liveDirtyPartIds[part.id] = true;
}

function partBelongsToFeature(part, featureId) {
  if (!part || !featureId) return false;
  if (part.featureId === featureId || part.derivedFeatureId === featureId || part.toolboxFeatureId === featureId) return true;
  if ((part.exactOperations || []).some(function (operation) { return operation.id === featureId; })) return true;
  if ((part.merges3d || []).some(function (merge) { return merge.featureId === featureId; })) return true;
  return false;
}

function gpuChildMatchesPartIds(child, ids) {
  if (!child || !ids || child === (E.pv && E.pv.liveGrp)) return false;
  var data = child.userData || {};
  if (data.cadPartRoot && ids[data.cadPartRoot]) return true;
  var hit = false;
  child.traverse(function (object) {
    var user = object.userData;
    if (!user) return;
    if ((user.cadPart && ids[user.cadPart]) || (user.cadDeco && ids[user.cadDeco]) || (user.cadPartRoot && ids[user.cadPartRoot])) hit = true;
  });
  return hit;
}

function gpuChildMatchesFeature(child, featureId) {
  if (!featureId || !child || child === (E.pv && E.pv.liveGrp)) return false;
  var hit = false;
  child.traverse(function (object) {
    var user = object.userData;
    if (!user) return;
    if (user.cadFeatureId === featureId || user.cadDerivedFeatureId === featureId || user.cadToolboxFeatureId === featureId) hit = true;
  });
  return hit;
}

function dropCommittedGpu(matchChild) {
  if (!E.pv || !E.pv.grp) return;
  var doomed = [];
  E.pv.grp.children.forEach(function (child) {
    if (child === E.pv.liveGrp) return;
    if (matchChild(child)) doomed.push(child);
  });
  doomed.forEach(function (child) {
    E.pv.grp.remove(child);
    clearGroup(child);
  });
}

function dropDecoMatching(matchPart) {
  for (var i = decoGroups.length - 1; i >= 0; i--) {
    if (decoGroups[i].part && matchPart(decoGroups[i].part)) decoGroups.splice(i, 1);
  }
}

function paintViewportAfterPartialRebuild() {
  if (!E.pv || !E.pv.grp) return;
  applySectionClipping(E.pv.grp);
  if (E.pv.liveGrp) applySectionClipping(E.pv.liveGrp);
  syncReplacedBodyVisibility();
  var box = new THREE.Box3().setFromObject(E.pv.grp);
  E.pv.pickBounds = box.isEmpty() ? null : box.getBoundingSphere(new THREE.Sphere());
  E.pv.render();
}

function collectDirtyPartIds(featureId, extraIds) {
  var ids = Object.assign({}, extraIds || {});
  decoGroups.forEach(function (entry) {
    if (entry.part && (ids[entry.part.id] || (featureId && partBelongsToFeature(entry.part, featureId)))) ids[entry.part.id] = true;
  });
  (E.def.parts || []).forEach(function (part) {
    if (ids[part.id] || (featureId && partBelongsToFeature(part, featureId))) ids[part.id] = true;
  });
  return ids;
}

function rebuildCommittedPartsById(ids) {
  if (!E.pv || !E.pv.grp || !ids) return;
  committedRenderedParts(E.def).forEach(function (part) {
    if (ids[part.id]) buildPart(E.pv.grp, part, E.displayStyle);
  });
}

/* One body changed (exact mesh landed, hover edge, kernel blanked). Do not
   dispose the rest of the viewport. */
function refreshChangedPart(part) {
  refreshChangedParts([part]);
}

function refreshChangedParts(parts) {
  if (!parts.length) return;
  invalidateDrawing();
  refreshChangedPartPreviews(parts);
  if (E.mode === "drawing") { drawSketch(); syncSheetPanel(); }
}

function refreshChangedPartPreviews(parts) {
  var visible = parts.filter(part => part && (part.previewOnly || !retainExactPreview()));
  if (!visible.length) return;
  if (typeof window !== "undefined") window.cadRefreshChangedPart = refreshChangedPart;
  syncLiveDownstreamBadge();
  if (E.def) syncSizeReadout();
  if (!E.pv) return;
  if (E.docType === "assembly" || E.pv.inRoom || !E.pv.grp) {
    updatePreview();
    return;
  }
  var ids = Object.create(null);
  for (const part of visible) if (!part.previewOnly) ids[part.id] = true;
  if (Object.keys(ids).length) {
    dropCommittedGpu(function (child) { return gpuChildMatchesPartIds(child, ids); });
    dropDecoMatching(function (item) { return ids[item.id]; });
    rebuildCommittedPartsById(ids);
  }
  if (visible.some(part => part.previewOnly)) {
    if (!patchLivePreviewLayer()) updatePreview();
  } else if ((E.authoring && E.authoring.previewParts || []).length) {
    if (!patchLivePreviewLayer()) paintViewportAfterPartialRebuild();
  } else {
    paintViewportAfterPartialRebuild();
  }
}

function patchEditedFeatureLayer() {
  if (!E.pv || !E.pv.grp || !E.pv.liveGrp || !E.pv.liveGrp.parent) return false;
  if (E.docType === "assembly" || E.pv.inRoom) return false;
  var featureId = E.authoring && E.authoring.featureEdit && E.authoring.featureEdit.featureId;
  if (!featureId) return false;
  var ids = collectDirtyPartIds(featureId, E._liveDirtyPartIds);
  return withRetiredGpuChildren(E.pv.grp,function (child) {
    return child!==E.pv.liveGrp && (gpuChildMatchesPartIds(child, ids) || gpuChildMatchesFeature(child, featureId));
  },function(){return new THREE.Group();},clearGroup,function(){
  dropDecoMatching(function (part) { return ids[part.id] || partBelongsToFeature(part, featureId); });
  rebuildCommittedPartsById(ids);
  E._liveDirtyPartIds = null;
  return patchLivePreviewLayer();
  });
}

/* Viewport-only refresh for a live feature ghost. refreshAll() clones the
   parametric document, rebuilds the FeatureManager and inspector, and
   disposes every GPU buffer — none of that changes while a new feature's
   parameters are being dragged. Apply and Cancel still go through refreshAll. */
function refreshLivePreview() {
  if (typeof window !== "undefined") window.cadRefreshLivePreview = refreshLivePreview;
  syncSketchOpenPathFeedback();
  if (E.authoring && E.authoring.featureEdit) {
    if (!patchEditedFeatureLayer()) updatePreview();
    drawSketch();
    return;
  }
  if (E.docType === "assembly" || (E.pv && E.pv.inRoom) || !patchLivePreviewLayer()) {
    updatePreview();
  }
  drawSketch();
}

/* Preserve only GPU objects from this document while a committed canonical
   edit restores its exact result. Model meshes remain invalidated normally:
   the retained view is never an export, measurement or topology source. */
function retainingExactPreview() {
  return !!(E.docType==="part" && E.exactRestoring && E.pv && !E.pv.inRoom
    && E.pv.committedDocument===E.def && E.pv.grp
    && E.pv.grp.children.some(function(child){return child.userData && child.userData.cadPartRoot;}));
}
function retainExactPreview() {
  if(!retainingExactPreview())return false;
  syncReplacedBodyVisibility();
  if(E.pv.liveGrp && E.pv.liveGrp.children.length)clearGroup(E.pv.liveGrp);
  E.hoverTopology=null;
  syncRetainedExactPreviewStatus();
  return true;
}
function updatePreview() {
  if (typeof window !== "undefined") window.cadUpdatePreview = updatePreview;
  /* The sheet projects the same bodies this rebuild is about to replace, and
     hidden-line removal is far too expensive to redo per paint — so this is
     where its cache is told the model moved. */
  invalidateDrawing();
  if(retainExactPreview())return;
  decoGroups.length = 0;   // truncate, never reassign: window.cadDecoGroups holds this reference
  E._hiddenPreviewReplaceId = null;
  if (!E.pv) return;
  E.pv.committedDocument=E.docType==="part"?E.def:null;
  if (E.pv.inRoom) {
    clearGroup(E.pv.roomGrp);
    if (E.docType === "part") {
      renderedParts(E.def).forEach(function (p) { buildPart(E.pv.roomGrp, p, E.displayStyle); });
      addDocumentOverlays(E.pv.roomGrp, E.def);
    }
    applySectionClipping(E.pv.roomGrp);
  } else if (E.pv.roomGrp && E.pv.roomGrp.children.length) {
    clearGroup(E.pv.roomGrp);
  }
  E.pv.rebuild(function (grp) {
    if (E.docType === "assembly") buildAssembly(grp);
    else {
      committedRenderedParts(E.def).forEach(function (p) { buildPart(grp, p, E.displayStyle); });
      addAssemblyContextGhosts(grp);
      addDocumentOverlays(grp, E.def);
    }
    var live = new THREE.Group();
    live.userData.cadLivePreview = true;
    E.pv.liveGrp = live;
    grp.add(live);
    fillLivePreviewGroup(live);
    applySectionClipping(grp);
  });
  syncSectionHelper();
}

function renderPreview() {
  if (E.pv) E.pv.render();
}

/* The context room: drop the live working copy into the real scene at the
   item's transform (same placement convention as view3d buildItem), hide the
   stale placed instance, render once with full room lighting and occlusion,
   then put everything back. Returns true when it has drawn, which tells the
   shared viewport to skip its own plain-backdrop pass. */
function drawInRoom(view) {
  if (E.docType === "assembly") return false;
  if (!view.inRoom || !has3D()) return false;
  var scene = getMainScene();
  if (!scene) return false;

  var b = defBounds(E.def),
    cy = (b.y0 + b.y1) / 2,
    d = view.dist,
    az = view.az,
    elv = view.el,
    cx = Math.sin(az) * Math.cos(elv) * d,
    cy2 = Math.sin(elv) * d,
    cz = Math.cos(az) * Math.cos(elv) * d;

  // Where the model lives in the room: the item being edited, or the floor-plan
  // content centre for a from-scratch model.
  var wx = 0, wz = 0, elev = 0, rot = 0;
  if (E.srcItem) {
    wx = E.srcItem.x;
    wz = E.srcItem.z;
    rot = E.srcItem.rot || 0;
    if (E.srcItem.elev != null) elev = E.srcItem.elev;
  } else if (S.nodes.length) {
    S.nodes.forEach(function (n) { wx += n.x; wz += n.z; });
    wx /= S.nodes.length;
    wz /= S.nodes.length;
  }
  var wy = elev + cy;

  var rg = E.pv.roomGrp;
  rg.position.set(wx, elev, wz);
  rg.rotation.y = (-rot * Math.PI) / 180;

  var oldMesh = null;
  if (E.srcItem) {
    scene.traverse(function (o) {
      if (o.userData && o.userData.item === E.srcItem) oldMesh = o;
    });
    if (oldMesh) oldMesh.visible = false;
  }
  scene.add(rg);

  // Keep the EXACT same viewing angle as the isolated view: shift the camera to
  // the item's world position and rotate the offset to match its rotation.
  var savedFar = view.cam.far;
  view.cam.far = 12000;
  view.cam.updateProjectionMatrix();
  view.rr.autoClear = true;

  var ang = (-rot * Math.PI) / 180;
  var offset = new THREE.Vector3(cx, cy2, cz);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);

  view.cam.position.set(wx + offset.x, wy + offset.y, wz + offset.z);
  view.cam.lookAt(wx, wy, wz);
  gpuRender(view.rr, scene, view.cam);

  view.cam.far = savedFar;
  view.cam.updateProjectionMatrix();
  scene.remove(rg);
  if (oldMesh) oldMesh.visible = true;
  return true;
}

export {
  addExplodeLeaders, assemblyExplodeLines, buildAssembly, buildComponentGroup,
  drawInRoom, markLiveDirtyPart, partBelongsToFeature, refreshChangedPart,
  refreshChangedPartPreviews, refreshChangedParts, refreshLivePreview,
  renderPreview, retainExactPreview, retainingExactPreview, updatePreview,
};
