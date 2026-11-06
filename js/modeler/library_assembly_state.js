/* The CAD editor's model library load/save, cross-tab refresh, tracked updates,
   assembly storage, mates and solving, split out of js/modeler.js. It shares
   the editor's state through live imports from ../modeler.js. */
import { solveTopologyMates } from "../cad_mates.js";
import { assemblyMobilityReport } from "../core/assembly_mobility_status.js";
import { deleteAssemblyLibraryRecord, deleteModelLibraryRecord, loadAssemblyLibrary, loadModelLibrary, loadModelerDraftRecord, mergeStoredAssemblyLibrary, mergeStoredModelLibrary, putAssemblyLibraryRecord, putModelLibraryRecord } from "../core/model_library_store.js";
import { temporaryAxes } from "../core/temporary_axes.js";
import { FURN, PRICE } from "../furniture.js";
import { refreshCatalogSelect } from "../model_catalog.js";
import { readModelerDraft } from "../modeler_draft.js";
import { edgePoints, hexNum } from "../modeler_mesh_geometry.js";
import { cloneData, partBounds } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { fillLibraryLinkStatus } from "../modeler/component_mates.js";
import { assemblySaveSession, documentDirty, modelerDraftStorage } from "../modeler/document_history.js";
import { cancelInterferenceCheck } from "../modeler/document_outputs.js";
import { drawSketch, syncSheetPanel } from "./drawing_sheet_render.js";
import { flash } from "./drawing_sheet_touch.js";
import { finishCommandActive } from "../modeler/finish_preview.js";
import { refreshLib } from "../modeler/library_io.js";
import { updatePreview } from "../modeler/library_panel.js";
import { applyTrackedUpdates, brokenMateCount, countLabel, mirrorLibraryToDisk, pruneAssemblyMates, signalLibraryChange, topologyEntriesForPart, writeAssemblyIndex, writeLibraryIndex } from "../modeler/library_store.js";
import { contextPartTopology, refreshComponents } from "../modeler/tree_assembly.js";
import { decorationWorldPerPixel, overlayEntriesForPart, registerCustomModel, topologyHovered, topologySelected } from "../modeler/viewport_decorations.js";
import { THREE } from "../three_lazy.js";
import {
  E, LS_ASSEMBLIES, LS_MODELS, assemblyLibraryCache, assemblyPreviewSolved,
  documentSaveTasks, mateSolveCount, modelLibraryCache, modelerDraftCache,
  modelerDraftOwnerId, motionPlaybackCancel, root, set_assemblyLibraryCache,
  set_assemblyPreviewSolved, set_assemblySolveFresh,
  set_decoratedWorldPerPixel, set_lastAssemblySaveConflict,
  set_lastLibrarySaveConflict, set_lastLibrarySaveError, set_mateSolveCount,
  set_modelLibraryCache, set_modelerDraftCache,
} from "../modeler.js";

async function initializeModelLibrary() {
  var legacy=[], legacyAssemblies=[];
  try {
    var stored=JSON.parse(localStorage.getItem(LS_MODELS)) || [];
    if (Array.isArray(stored) && stored.some(function(model){return Array.isArray(model.parts);})) legacy=stored;
  } catch(e) {}
  try {
    var storedAssemblies=JSON.parse(localStorage.getItem(LS_ASSEMBLIES)) || [];
    if (Array.isArray(storedAssemblies) && storedAssemblies.some(function(item){return Array.isArray(item.components);})) legacyAssemblies=storedAssemblies;
  } catch(e) {}
  try { set_modelLibraryCache(await loadModelLibrary(legacy)); }
  catch(e) { set_modelLibraryCache(legacy); }
  try { set_assemblyLibraryCache(await loadAssemblyLibrary(legacyAssemblies)); }
  catch(e) { set_assemblyLibraryCache(legacyAssemblies); }
  try {
    set_modelerDraftCache(await loadModelerDraftRecord(modelerDraftOwnerId));
    if (!modelerDraftCache) set_modelerDraftCache(readModelerDraft(modelerDraftStorage(),modelerDraftOwnerId));
  } catch(e) { set_modelerDraftCache(readModelerDraft(modelerDraftStorage(),modelerDraftOwnerId)); }
  writeLibraryIndex(modelLibraryCache);
  writeAssemblyIndex(assemblyLibraryCache);
  // Give models that predate the disk mirror a copy now, not at their next save.
  mirrorLibraryToDisk(modelLibraryCache);
}
async function refreshLibraryFromOtherTab() {
  var previous=new Set(modelLibraryCache.map(function(model){return model.key;}));
  var models=await loadModelLibrary(), assemblies=await loadAssemblyLibrary();
  set_modelLibraryCache(models); set_assemblyLibraryCache(assemblies);
  writeLibraryIndex(models); writeAssemblyIndex(assemblies);
  var current=new Set(models.map(function(model){return model.key;}));
  previous.forEach(function(key){if(!current.has(key)){delete FURN[key];delete PRICE[key];}});
  // Catalogue normalization adds render defaults. Keep the library snapshot
  // byte-for-byte equal to its stored record for optimistic save baselines.
  models.forEach(function(model){registerCustomModel(cloneData(model));});
  if(root && E && E.open){
    refreshCatalogSelect();refreshLib();
    if(E.docType==="assembly"){
      // Defer while a document or inspector edit is in progress.
      if(E.assembly?.components?.some(c=>c.libraryLink) && !documentDirty() &&
         !E.contextEdit && !E.quickAction && !motionPlaybackCancel && !E.drag &&
         !document.activeElement?.matches("input,textarea,select,[contenteditable=true]") && !documentSaveTasks.has(assemblySaveSession(E.assembly))) {
        if(applyTrackedUpdates(E.assembly))redrawTrackedUpdates();
      }
      refreshComponents();
      var status=root.querySelector?.("#mdLibraryLinkStatus");
      if(status && E.sel)fillLibraryLinkStatus(status,E.sel);
    }
    if(E.mode==="drawing"){drawSketch();syncSheetPanel();}
  }
}

async function saveLib(records, options={}) {
  set_lastLibrarySaveError(null);
  try {
    var result=options.mode==="delete" ? await deleteModelLibraryRecord(records)
      : options.mode==="merge" ? await mergeStoredModelLibrary(records,{conflict:options.conflict || "replace"})
      : await putModelLibraryRecord(records,{expected:options.expected});
    set_lastLibrarySaveConflict(!!result.conflict);
    set_modelLibraryCache(cloneData(result.records));
    writeLibraryIndex(modelLibraryCache);
    if(result.ok && options.mode!=="delete") mirrorLibraryToDisk(options.mode==="merge" ? result.puts : [records]);
    if(!result.ok)return false;
    signalLibraryChange();
    return true;
  } catch (e) { set_lastLibrarySaveConflict(false);set_lastLibrarySaveError(e);return false; }
}

function redrawTrackedUpdates() {
  // Rebuild the displayed geometry only. A component inspector can own staged
  // placement inputs even after focus has moved away from the input.
  var previous=assemblyPreviewSolved;
  try {
    set_assemblyPreviewSolved(true);
    invalidateInterference();updatePreview();drawSketch();
  } finally {set_assemblyPreviewSolved(previous);}
  var status=root.querySelector("#mdLibraryLinkStatus");
  if(status && E.sel)fillLibraryLinkStatus(status,E.sel);
}
/* Returns whether the write landed, exactly as saveLib() does. Swallowing the
   quota error and returning nothing let saveAssemblyDocument() announce a save
   that never happened, mark the document clean and delete its recovery draft —
   the one copy of the work that was left. */
async function saveAssemblies(records, options={}) {
  try {
    var result=options.mode==="delete" ? await deleteAssemblyLibraryRecord(records)
      : options.mode==="merge" ? await mergeStoredAssemblyLibrary(records,{conflict:options.conflict || "replace"})
      : await putAssemblyLibraryRecord(records,{expected:options.expected});
    set_assemblyLibraryCache(cloneData(result.records));
    writeAssemblyIndex(assemblyLibraryCache);
    set_lastAssemblySaveConflict(!!result.conflict);
    if(result.ok)signalLibraryChange();
    return !!result.ok;
  } catch (e) { set_lastAssemblySaveConflict(false); return false; }
}

function applyAssemblyMates(assembly, solveOptions) {
  if (!assembly) return null;
  set_mateSolveCount(mateSolveCount + 1);
  /* The old align/distance mates are part of the system the solver solves —
     they used to be applied by hand at the head of every pass, which is the
     best a solver that placed one component at a time could do. Both kinds now
     settle together because they are solved together. */
  var result = solveTopologyMates(assembly, {...solveOptions, partTopology:contextPartTopology});
  /* The solver reports missing topology, ambiguous rebinds, frames it could
     not use, and — since it now measures the result — mates that another mate
     has overridden. That report used to be discarded at this line, which is
     why a mate could quietly stop holding and nothing anywhere said so. */
  E.mateIssues = (result && result.issues) || [];
  E.mateRebindings = (result && result.rebindings) || [];
  E.mateUnsatisfied = (result && result.unsatisfied) || [];
  /* What the mates have not pinned down. The solver reads it off the rank of
     the system it just solved, per independent group of components and per
     component within it, which is the difference between "solved" and "solved,
     and this bracket can still slide and spin". */
  E.mateFreedom = (result && result.clusters) || [];
  E.mateDegreesOfFreedom = (result && result.degreesOfFreedom) || 0;
  E.mateMobilityReport=assemblyMobilityReport(assembly,result,E.mateIssues);
  return result;
}

/* Interference results describe one exact set of visible components at one
   exact arrangement. Component edits, visibility changes and document
   restoration all invalidate that answer even when no mate needs solving. */
function invalidateInterference() {
  cancelInterferenceCheck();
  E.interferenceHits = [];
  E.interferenceChecked = false;
  E.interferenceRevision = (E.interferenceRevision || 0) + 1;
  /* Every path that swaps the assembly or changes which components are in it
     comes through here, which makes it the right place to say a previous solve
     no longer describes the model — an undo that restored a different pose must
     not have its solve skipped by a flag left set by an earlier edit. */
  set_assemblySolveFresh(false);
}

/* Everything that changes an assembly goes through here: drop mates whose
   components have gone, re-solve, and say out loud what the solver could not
   do. Rebuilds call applyAssemblyMates directly — a render is not the place to
   delete data or raise a message. */
function solveAssembly(options) {
  if (!E.assembly) return null;
  /* The red clash boxes describe one arrangement of the components. Any edit
     that moves them makes those boxes a lie, and they used to stay on screen
     until the document type changed. */
  invalidateInterference();
  var dropped = pruneAssemblyMates(E.assembly);
  var result = applyAssemblyMates(E.assembly, options);
  set_assemblySolveFresh(true);
  if (options && options.quiet) return result;
  var notes = [];
  if (dropped) notes.push(countLabel(dropped, "matesCountOne", "matesCount") + " " + t("mateOrphansDropped"));
  var broken = brokenMateCount();
  if (broken) notes.push(countLabel(broken, "assemblyIssueOne", "assemblyIssues"));
  if (notes.length) flash(notes.join(" \u00b7 "));
  return result;
}



function addTopologyPickEdges(parent, part, explicitMesh) {
  if (!part || (E.docType !== "part" && E.docType !== "assembly")) return;
  var mesh = explicitMesh || null;
  if (!mesh) {
    parent.traverse(function (object) {
      if (!mesh && object.isMesh && object.userData && object.userData.cadPart === part.id) mesh = object;
    });
  }
  var bounds = partBounds(part);
  var span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0, 1);
  var show = E.showModelEdges !== false;
  var finish = finishCommandActive();
  overlayEntriesForPart(part, mesh).forEach(function (entry) {
    var points = entry.displayPoints || edgePoints(entry.descriptor);
    if (points.length < 2) return;
    var selected = topologySelected(entry.persistentId, entry), hovered = topologyHovered(entry.persistentId, entry);
    var visible = show || finish || selected || hovered;
    var geometry = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3(p.x, p.y, p.z); }));
    var material = new THREE.LineBasicMaterial({
      color: selected ? hexNum(E.selectedEdgeColor) : hovered ? hexNum(E.hoverColor) : finish ? 0xf2d27a : hexNum(E.edgeColor),
      transparent: true,
      opacity: selected || hovered ? .98 : finish ? .9 : .95,
      depthTest: true,
      depthWrite: false,
    });
    var line = new THREE.Line(geometry, material);
    line.visible = visible;
    line.renderOrder = selected || hovered ? 22 : 20;
    line.userData.cadPart = part.id;
    line.userData.cadFeatureId = entry.ownerFeatureId;
    line.userData.cadTopology = entry;
    line.userData.cadPickVisible = visible;
    parent.add(line);

    if (selected || hovered || finish) {
      var vectors = points.map(function (point) { return new THREE.Vector3(point.x, point.y, point.z); });
      var closed = !!(entry.descriptor && entry.descriptor.curve === "circle" && !entry.descriptor.endpoints);
      if (closed && vectors.length > 2 && vectors[0].distanceToSquared(vectors[vectors.length - 1]) < 1e-8) vectors = vectors.slice(0, -1);
      var path = vectors.length === 2 ? new THREE.LineCurve3(vectors[0], vectors[1]) : new THREE.CatmullRomCurve3(vectors, closed, "centripetal");
      /* Screen-space, like the pick band it is supposed to advertise. Sizing
         the highlight off the MODEL span made it a constant in world units:
         zoomed in it drew a pipe over the edge, zoomed out it thinned to
         nothing while still being pickable at 5-8 px. Falls back to the old
         span-relative numbers when the view cannot say what a pixel is
         worth — a decoration built before the first render. */
      var perPixel = decorationWorldPerPixel();
      /* Stamped HERE, where the width is actually baked into geometry, rather
         than in refreshDecorations(): decorations are also built by the
         preview rebuild, and recording the scale only on one of those paths
         left the stamp at zero, which read as "nothing to compare" and meant
         the re-bake below never fired at all. */
      if (perPixel > 0) set_decoratedWorldPerPixel(perPixel);
      var radius = perPixel > 0
        ? perPixel * (selected ? 2.2 : hovered ? 1.7 : 1.1)
        : selected ? Math.max(.38, span * .0055) : hovered ? Math.max(.26, span * .004) : Math.max(.14, span * .0024);
      var glow = new THREE.Mesh(
        new THREE.TubeGeometry(path, Math.max(8, vectors.length * 2), radius, 6, closed),
        new THREE.MeshBasicMaterial({
          color: selected ? hexNum(E.selectedEdgeColor) : hovered ? hexNum(E.hoverColor) : 0xe7c56a,
          transparent: true,
          opacity: selected ? .95 : hovered ? .8 : .45,
          depthTest: true,
          depthWrite: false,
        })
      );
      glow.renderOrder = selected || hovered ? 24 : 19;
      glow.raycast = function () {};
      parent.add(glow);
    }
  });
}





function addTemporaryAxes(parent,part) {
  if(!E.showTemporaryAxes)return;
  temporaryAxes(part.meshData?.topology || topologyEntriesForPart(part)).forEach(function(axis){
    var from=new THREE.Vector3(axis.from.x,axis.from.y,axis.from.z),to=new THREE.Vector3(axis.to.x,axis.to.y,axis.to.z);
    var perPixel=decorationWorldPerPixel();if(perPixel>0)set_decoratedWorldPerPixel(perPixel);
    var span=from.distanceTo(to),radius=Math.max(span*.0015,perPixel*.8);
    for(var i=0;i<24;i++){
      var start=from.clone().lerp(to,i/24),end=from.clone().lerp(to,(i+.65)/24);
      var dash=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,start.distanceTo(end),6),new THREE.MeshBasicMaterial({color:0x63d8ff,transparent:true,depthTest:false,depthWrite:false}));
      dash.position.copy(start).add(end).multiplyScalar(.5);dash.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());
      dash.renderOrder=30;dash.raycast=function(){};parent.add(dash);
    }
  });
}

export {
  addTemporaryAxes, addTopologyPickEdges, applyAssemblyMates,
  initializeModelLibrary, invalidateInterference, redrawTrackedUpdates,
  refreshLibraryFromOtherTab, saveAssemblies, saveLib, solveAssembly,
};
