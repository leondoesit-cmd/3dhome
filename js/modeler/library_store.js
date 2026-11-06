/* The CAD editor's model and assembly library storage and assembly placement,
   split out of js/modeler.js. It shares the editor's state through live imports
   from ../modeler.js. */
import { applyAppearanceOverrides } from "../cad_appearances.js";
import { analyticPartTopology } from "../core/assembly_context.js";
import { ASSEMBLY_ORIGIN_ID, isSubassembly } from "../core/assembly_structure.js";
import { collectAttachmentReferences, exportAttachmentRecords } from "../core/attachment_store.js";
import { deduplicateBooleanProjections } from "../core/boolean_projection.js";
import { verifiedExactTopology } from "../core/exact_topology_cache.js";
import { featureLabel, featureSpec } from "../core/feature_catalog.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { queueModelBackup } from "../core/model_backup_client.js";
import { modelDimensions } from "../core/model_dimensions.js";
import { resolvedLibraryAssembly } from "../core/model_library_store.js";
import { historyEntryRolled } from "../core/parametric_document.js";
import { mergeSmoothTopology } from "../core/topology.js";
import { FURN } from "../furniture.js";
import { featureHistoryIndex } from "../modeler_chrome.js";
import { holeAndCutEdges, holeAndCutFaces, meshCircleEntries, meshFaceEntries, topologyMergeCache } from "../modeler_mesh_geometry.js";
import { translateMarkups, translateNotes } from "../modeler_notes_paint.js";
import { cloneData, migrateBoundaryChangingProfileCuts, movePart, normalizeTransform, partBounds, translateTopologyReferences } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { cutTargetFeatureId } from "../modeler/feature_create.js";
import { updatePreview } from "../modeler/library_panel.js";
import { scheduleExactMesh } from "../modeler/prefs_snap.js";
import { isCanonicalAuthoring } from "../modeler/sketch_workflow.js";
import { sharedRepeat } from "../pbr_material.js";
import { S, fin, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, LS_ASSEMBLIES, LS_MODELS, MATE_ISSUE_KEYS, assemblyLibraryCache,
  libraryChannel, modelLibraryCache,
} from "../modeler.js";

function featureTypeLabel(type) {
  var spec = featureSpec(type);
  return spec ? featureLabel(spec) : type;
}

/* ================= library persistence + FURN registration ================= */
function loadLib() {
  return cloneData(modelLibraryCache);
}

function writeLibraryIndex(lib) {
  try {
    localStorage.setItem(LS_MODELS, JSON.stringify(lib.map(function(model){return {
      key:model.key,name:model.name,w:model.w,d:model.d,h:model.h,partCount:(model.parts || []).length,updatedAt:Date.now()
    };})));
    return true;
  } catch (e) { return false; }
}
function writeAssemblyIndex(list) {
  try {
    localStorage.setItem(LS_ASSEMBLIES, JSON.stringify((list || []).map(function(item){return {
      key:item.key,name:item.name,componentCount:(item.components || []).length,updatedAt:Date.now()
    };})));
    return true;
  } catch (e) { return false; }
}
/* Every library write is mirrored to disk through the relay
   (server/model_backup.mjs). IndexedDB can be cleared by the browser, and that
   has taken finished models with it. Best-effort and deferred: the mirror must
   never slow down or fail the save itself. The cache is handed over because it
   is only ever reassigned, never mutated, so the deferred copy stays exact. */
function diskBackupAttachments(model) {
  return collectAttachmentReferences(model).size ? exportAttachmentRecords(model) : [];
}
function mirrorLibraryToDisk(models) {
  setTimeout(function () {
    try { queueModelBackup(models, { attachmentsFor:diskBackupAttachments }); } catch (e) { /* the save already landed */ }
  }, 0);
}

function signalLibraryChange() { if(libraryChannel)libraryChannel.postMessage("changed"); }

function applyTrackedUpdates(assembly) {
  var resolved=resolvedLibraryAssembly(assembly);
  if(resolved===assembly)return false;
  resolved.components.forEach(function(component,i){
    if(component!==assembly.components[i])Object.assign(assembly.components[i],component);
  });
  return true;
}
function loadAssemblies() {
  return cloneData(assemblyLibraryCache);
}

function newAssembly() {
  return {
    key: "asm_" + Date.now().toString(36),
    name: t("newAssembly"),
    components: [],
    mates: [],
  };
}
function componentDef(component) {
  if (!component) return null;
  if (component.def && Array.isArray(component.def.parts)) return component.def;
  var lib = loadLib();
  for (var i = 0; i < lib.length; i++) if (lib[i].key === component.modelKey) return lib[i];
  var f = FURN[component.modelKey];
  return f && f.custom && Array.isArray(f.custom.parts) ? f.custom : null;
}
/* Where the assembly actually is, in assembly coordinates: every component's
   own bounds, turned and moved into place. Used to frame the camera, so it has
   to account for rotation — the corners are transformed, not the extents. */
/* One component's own bounds placed in assembly coordinates. The corners are
   transformed rather than the extents, because a turned component's box is not
   the turned box of its extents. `blown` folds in the exploded offset when the
   caller wants where the part is being drawn rather than where it is mated. */
function componentWorldBounds(component, options) {
  /* A sub-assembly is as big as everything visible inside it, carried through
     its own pose the same way a part's box is. */
  if (isSubassembly(component)) {
    var inner = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    component.asm.components.forEach(function (child) {
      if (child.visible === false) return;
      var cb = componentWorldBounds(child, options);
      if (!cb) return;
      inner.x0 = Math.min(inner.x0, cb.x0); inner.x1 = Math.max(inner.x1, cb.x1);
      inner.y0 = Math.min(inner.y0, cb.y0); inner.y1 = Math.max(inner.y1, cb.y1);
      inner.z0 = Math.min(inner.z0, cb.z0); inner.z1 = Math.max(inner.z1, cb.z1);
    });
    if (!Number.isFinite(inner.x0)) return null;
    return placedBounds(inner, component, options);
  }
  var def = componentDef(component);
  /* Measured against what defBounds will actually walk. Asking `def.parts`
     instead let a component whose every body is suppressed through, and
     defBounds answers an empty document with a fixed ±30 box — a 60 cm solid
     that renders as nothing, clashes with its neighbours and prints on the
     drawing. */
  if (!def || !activeParts(def).length) return null;
  return placedBounds(defBounds(def), component, options);
}

function placedBounds(b, component, options) {
  var tr = normalizeTransform(component);
  var blown = ((!options || options.exploded !== false) && component.explodedOffset) || { x: 0, y: 0, z: 0 };
  var matrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler((tr.rx * Math.PI) / 180, (tr.ry * Math.PI) / 180, (tr.rz * Math.PI) / 180));
  var out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  [b.x0, b.x1].forEach(function (x) {
    [b.y0, b.y1].forEach(function (y) {
      [b.z0, b.z1].forEach(function (z) {
        var corner = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        var px = corner.x + tr.x + (blown.x || 0), py = corner.y + tr.y + (blown.y || 0), pz = corner.z + tr.z + (blown.z || 0);
        out.x0 = Math.min(out.x0, px); out.x1 = Math.max(out.x1, px);
        out.y0 = Math.min(out.y0, py); out.y1 = Math.max(out.y1, py);
        out.z0 = Math.min(out.z0, pz); out.z1 = Math.max(out.z1, pz);
      });
    });
  });
  return out;
}

function assemblyBounds() {
  var out = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  ((E.assembly && E.assembly.components) || []).forEach(function (component) {
    if (component.visible === false) return;
    var b = componentWorldBounds(component);
    if (!b) return;
    out.x0 = Math.min(out.x0, b.x0); out.x1 = Math.max(out.x1, b.x1);
    out.y0 = Math.min(out.y0, b.y0); out.y1 = Math.max(out.y1, b.y1);
    out.z0 = Math.min(out.z0, b.z0); out.z1 = Math.max(out.z1, b.z1);
  });
  return Number.isFinite(out.x0) ? out : null;
}

/* "1 mates" reads as a bug in the counter. Hebrew and English both want the
   singular spelled out rather than derived, so each count names both keys. */
function countLabel(n, oneKey, manyKey) {
  return n + " " + t(n === 1 ? oneKey : manyKey);
}

function assemblyMateCount(assembly) {
  return (((assembly && assembly.mates) || []).length) + (((assembly && assembly.topologyMates) || []).length);
}

/* A deleted component used to take its legacy mates with it and leave its
   topology mates behind, pointing at nothing, all the way into the saved
   document. Returns how many were dropped so the caller can say so. */
function pruneAssemblyMates(assembly) {
  if (!assembly) return 0;
  var live = new Set((assembly.components || []).map(function (component) { return component.id; }));
  var before = assemblyMateCount(assembly);
  assembly.mates = (Array.isArray(assembly.mates) ? assembly.mates : []).filter(function (mate) {
    return live.has(mate.a) && live.has(mate.b);
  });
  assembly.topologyMates = (Array.isArray(assembly.topologyMates) ? assembly.topologyMates : []).filter(function (mate) {
    return mate.a && mate.b && live.has(mate.a.componentId) && live.has(mate.b.componentId)
      && (!mate.c || live.has(mate.c.componentId) || mate.c.componentId === ASSEMBLY_ORIGIN_ID);
  });
  return before - assemblyMateCount(assembly);
}

function mateIssueLabel(issue) {
  var key = MATE_ISSUE_KEYS[issue && issue.code];
  return key ? t(key) : String((issue && issue.code) || "");
}

function mateIssuesFor(mateId) {
  return (E.mateIssues || []).concat(E.mateUnsatisfied || [])
    .filter(function (issue) { return !issue.componentPath && issue.mate === mateId; });
}

/* How many mates are broken — not how many complaints were filed about them.
   One mate raises several records on the way down: a reference that cannot be
   found reports its own missing topology, and then the mate reports itself
   unresolved. Adding the lists up said "2 unresolved mates" for one mate. */
function brokenMateCount() {
  var mates = new Set();
  (E.mateIssues || []).concat(E.mateUnsatisfied || []).forEach(function (issue) {
    if (issue?.componentPath && issue.code === "context-reference") mates.add(JSON.stringify(["context",issue.componentPath]));
    else if (issue?.mate != null) mates.add(JSON.stringify(["mate",issue.componentPath,issue.mate]));
  });
  return mates.size;
}

/* How many ways a component can still be moved without breaking a mate. Null
   when the last solve did not say — a component no mate moves is not
   "6 degrees free", it is simply not solved for. */
function componentFreedom(componentId) {
  for (var i = 0; i < (E.mateFreedom || []).length; i++) {
    var cluster = E.mateFreedom[i];
    if (cluster && cluster.perComponent && cluster.perComponent[componentId] != null) {
      return cluster.perComponent[componentId];
    }
  }
  return null;
}

function freedomLabel(freedom) {
  if (freedom == null) return "";
  return freedom ? countLabel(freedom, "mateDofOne", "mateDof") : t("mateDofFixed");
}

/* A mate whose face was renamed by a rebuild but found again by its geometry
   still holds — say so, rather than leaving the reattachment invisible. */
function mateReboundFor(mateId) {
  return (E.mateRebindings || []).some(function (entry) { return !entry.componentPath && entry.mate === mateId; });
}

function migrateDefinitionProfileCuts(definition, schedule) {
  var changed = false;
  (definition && definition.parts || []).forEach(function (part) {
    if (!migrateBoundaryChangingProfileCuts(part)) return;
    changed = true;
    if (schedule) scheduleExactMesh(part);
  });
  return changed;
}
/* Compatibility render projection.  In parametric-v1 documents `features` and
   `history` are authoritative; parts are disposable preview records consumed by
   the existing Three.js scene.  Legacy documents still honour their rollback
   index here until migration converts them to canonical history. */
export function activeParts(def) {
  if (!def || !Array.isArray(def.parts)) return [];
  var upto = fin(def.rollback) && def.rollback >= 0 ? Math.min(def.rollback, def.parts.length) : def.parts.length;
  var parts = def.parts.slice(0, upto).filter(function (p) { return p && !p.suppressed; });
  if (def.rollbackIndex != null) parts=parts.filter(function (p) {
    var index = featureHistoryIndex(def.history, p.featureId);
    return index < 0 || !historyEntryRolled(def, index);
  });
  return def.metadata?.authoringSystem==='parametric-v1' ? deduplicateBooleanProjections(parts,def,cutTargetFeatureId) : parts;
}

// Command previews live outside the document so saving, rebuilding and undo
// never mistake transient geometry for design intent.  Every visual surface
// consumes this projection helper, which keeps 2D, 3D and drawing views in sync.
/* Hiding a body is not suppressing the feature that made it. A hidden body is
   still built, still exported, still weighed — it is only left out of the drawn
   scene. Suppression, which the feature row offers, is the other thing: it stops
   the step building at all. Conflating them would make the eye on a body row
   quietly change the model. */
function hiddenBodyPart(part) {
  var hidden = E.hiddenBodies;
  if (!hidden || !hidden.length || !part) return false;
  return hidden.indexOf("body:" + part.id) >= 0
    || (!!part.featureId && hidden.indexOf("body:" + part.featureId) >= 0)
    || (!!part.derivedFeatureId && hidden.indexOf("body:" + part.derivedFeatureId) >= 0);
}

function renderedParts(def) {
  var parts=activeParts(def);
  /* Only the document being edited has a hidden set; a library thumbnail is
     rendered from the same function and must not inherit the editor's state.

     `E` is guarded, not just read: this module registers the saved library into
     FURN at module scope (see loadLib().forEach below), and `var E = {...}` is
     declared AFTER that line, so during boot registration E is still undefined.
     Reading E.def threw for every saved model, registerCustomModel swallowed it
     in its catch and returned false, and NOTHING was registered — so a custom
     model could not be placed, and reopening one from the library found no
     definition and produced a blank document. A document being normalised
     before the editor exists has no editor state to inherit, which is exactly
     what this branch means to express.

     `E.open` for the same reason at the other end: closeModeler() clears
     neither E.def nor E.hiddenBodies, so after the editor closes `def===E.def`
     stays true for that document and a library thumbnail would keep hiding
     bodies the user hid during a finished editing session — and could show a
     transient finish preview. A closed editor is not editing. (The main 3D
     scene never reaches here: custom build closures call activeParts(def).) */
  if(E && E.open && def===E.def) parts=parts.filter(function(part){return !hiddenBodyPart(part);});
  if(E && E.open && def===E.def && E.authoring && Array.isArray(E.authoring.previewParts)){
    /* A finish preview is a temporary replacement for its source body, not a
       second coincident body.  Drawing both made the exact fillet flicker and
       left the old sharp edge visible through the result. */
    if(E.authoring.previewReplacesPartId)parts=parts.filter(function(part){return part.id!==E.authoring.previewReplacesPartId;});
    parts=parts.concat(E.authoring.previewParts);
  }
  if(def && def.appearances && def.appearances.length) parts=applyAppearanceOverrides(parts, def.appearances);
  return parts;
}

function livePreviewParts() {
  return (E && E.authoring && Array.isArray(E.authoring.previewParts)) ? E.authoring.previewParts : [];
}

/* Bodies that already belong to the document. Live ghosts ride a separate
   THREE group so dragging a new feature does not dispose them. */
function committedRenderedParts(def) {
  var live = livePreviewParts();
  if (!live.length) return renderedParts(def);
  var ids = {};
  live.forEach(function (part) { ids[part.id] = true; });
  return renderedParts(def).filter(function (part) { return !ids[part.id]; });
}

/* Add one derived preview part.  Canonical feature creation happens before this
   adapter is called; this function never records design intent. */
function addPart(part) {
  part.id = part.id || uid();
  part.featureId = part.featureId || "feature:part:" + part.id;
  if (fin(E.def.rollback) && E.def.rollback < E.def.parts.length) {
    E.def.parts.splice(E.def.rollback, 0, part);
    E.def.rollback++;
  } else E.def.parts.push(part);
  return part;
}


function defBounds(def) {
  var b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
  renderedParts(def).forEach(function (p) {
    var q = partBounds(p);
    b.x0 = Math.min(b.x0, q.x0); b.x1 = Math.max(b.x1, q.x1);
    b.y0 = Math.min(b.y0, q.y0); b.y1 = Math.max(b.y1, q.y1);
    b.z0 = Math.min(b.z0, q.z0); b.z1 = Math.max(b.z1, q.z1);
  });
  if (b.x1 < b.x0) b = { x0: -30, x1: 30, y0: 0, y1: 60, z0: -30, z1: 30 };
  return b;
}

// Center model in x/z, rest on floor, and compute catalog dims.
function normalizeDef(def) {
  // Cabinet coordinates are the semantic carcass frame, including plinth and
  // motion pivots. Centering the mesh would detach them from that frame.
  if (def.metadata && (def.metadata.adapter === "cabinet" || def.metadata.authoringSystem === "parametric-v1")) return;
  var b = defBounds(def);
  var cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, fy = b.y0;
  var dx=-cx,dy=-fy,dz=-cz;
  def.parts.forEach(function (p) { movePart(p, dx, dy, dz,true); });
  (Array.isArray(def.sketches) ? def.sketches : def.sketch ? [def.sketch] : []).forEach(function(sketch){
    if (sketch.frameSpace==="local" && sketch.frame && sketch.frame.origin) {
      sketch.frame.origin.x+=dx;sketch.frame.origin.y+=dy;sketch.frame.origin.z+=dz;
    } else {
      var du=sketch.plane==="side" ? dz : dx, dv=sketch.plane==="top" ? dz : dy;
      (sketch.points || []).forEach(function(point){point.x+=du;point.y+=dv;});
      if (sketch.plane==="top") sketch.offset=(Number(sketch.offset)||0)+dy;
      else if (sketch.plane==="front") sketch.offset=(Number(sketch.offset)||0)+dz;
      else sketch.offset=(Number(sketch.offset)||0)+dx;
    }
  });
  (def.references || []).forEach(function(reference){
    if (!reference || ["origin","plane:top","plane:front","plane:right","axis:x","axis:y","axis:z"].includes(reference.id) || !reference.origin) return;
    reference.origin.x+=dx;reference.origin.y+=dy;reference.origin.z+=dz;
  });
  translateTopologyReferences({sketches:def.sketches,parts:def.parts,features:def.features},dx,dy,dz);
  translateNotes(def.notes, dx, dy, dz);
  translateMarkups(def.markups, dx, dy, dz);
  b = defBounds(def);
  Object.assign(def, modelDimensions(b));
  if ((def.parts || []).some(function(part){return !!part.parametricEnvelope;}) && def.parameters) {
    if (def.parameters.width && typeof def.parameters.width==="object") def.parameters.width.value=b.x1-b.x0;
    if (def.parameters.depth && typeof def.parameters.depth==="object") def.parameters.depth.value=b.z1-b.z0;
    if (def.parameters.height && typeof def.parameters.height==="object") def.parameters.height.value=b.y1-b.y0;
  }
}


// texture cache for custom-part image textures (shared with primitives' box() via opt.tex)
function applyTexTo(mesh, p, wCm, hCm) {
  if (!mesh || !p.tex) return;
  if (!S.customTexCache) S.customTexCache = {};
  if (!S.customTexCache[p.tex]) {
    var loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    var tl = loader.load(p.tex, function () {
      S.dirty3D = true;
      S.repaint3D = true;
      updatePreview();
    });
    tl.wrapS = tl.wrapT = THREE.RepeatWrapping;
    S.customTexCache[p.tex] = tl;
  }
  // Cloning before the bitmap lands yields a version>0 texture with a null
  // image, which throws inside the renderer's texture upload; the loader
  // callback above re-runs this once the image is decoded.
  if (!S.customTexCache[p.tex].image) return;
  // shared per repeat: every clone is its own GPU upload (see pbr_material.js)
  mesh.material.map = sharedRepeat(S.customTexCache[p.tex], (wCm || 100) / 100, (hCm || 100) / 100, mesh.material);
  mesh.material.color.setHex(0xffffff);
  mesh.material.needsUpdate = true;
}





/* A saved canonical body can have verified exact topology before its display
   mesh finishes rebuilding. The signature check covers the feature prefix and
   every supporting sketch; an edited body must wait for fresh topology. */
function savedExactTopologyForPart(part) {
  if (!part || E.docType !== "part" || !E.def?.exactTopologyCache || !isCanonicalAuthoring()) return null;
  var compiled = compileKernelFeatureTree(E.def);
  if (!compiled.ok) return null;
  var head = cutTargetFeatureId(part, E.def);
  return verifiedExactTopology(E.def, compiled.features).get(head) || null;
}

function topologyEntriesForPart(part) {
  if (!part) return [];
  var featureId = part.featureId || "feature:part:" + part.id;
  var kernel = [];
  if (part.meshData && Array.isArray(part.meshData.topology) && part.meshData.topology.length) {
    kernel = part.meshData.topology;
    var cached = topologyMergeCache.get(part.meshData);
    if (cached) return cached;
  } else {
    var savedExact = savedExactTopologyForPart(part);
    if (savedExact?.length) return mergeSmoothTopology(savedExact);
    /* Kernel runs belong to the part document on E.def. A component carries its
       own document, so borrowing them in an assembly scored a component's faces
       against another document's topology — and could hand one of those foreign
       descriptors to a mate. Neither run is cleared when the document type
       changes, so the guard is on who is asking, not on whether one exists. */
    var sources = [];
    if (E.docType === "part") {
      if (E.brepRun && Array.isArray(E.brepRun.topology)) sources = sources.concat(E.brepRun.topology);
      if (E.coreRun && Array.isArray(E.coreRun.topology)) sources = sources.concat(E.coreRun.topology);
    }
    var seen = new Set();
    kernel = sources.filter(function (entry) {
      if (!entry || seen.has(entry.persistentId)) return false;
      if (entry.ownerFeatureId && entry.ownerFeatureId !== featureId) return false;
      seen.add(entry.persistentId);
      return true;
    });
  }
  var meshCircles = meshCircleEntries(part, featureId);
  /* Rims come from the mesh when there is one, from the loops otherwise; the
     hole walls are only ours to name when no kernel topology describes them. */
  var kernelHasFaces = kernel.some(function (entry) { return entry && entry.kind === "face"; });
  var extras = (meshCircles.length ? meshCircles : holeAndCutEdges(part, featureId))
    .concat(kernel.length ? [] : holeAndCutFaces(part, featureId))
    .concat(kernelHasFaces ? [] : meshFaceEntries(part, featureId));
  var analytic = kernel.length ? [] : analyticPartTopology(part,featureId);
  var entries = mergeSmoothTopology(kernel.concat(analytic, extras));
  if (kernel.length && part.meshData && kernel === part.meshData.topology) topologyMergeCache.set(part.meshData, entries);
  return entries;
}

export {
  addPart, applyTexTo, applyTrackedUpdates, assemblyBounds, assemblyMateCount,
  brokenMateCount, committedRenderedParts, componentDef, componentFreedom,
  countLabel, defBounds, featureTypeLabel, freedomLabel, livePreviewParts,
  loadAssemblies, loadLib, mateIssueLabel, mateIssuesFor, mateReboundFor,
  migrateDefinitionProfileCuts, mirrorLibraryToDisk, newAssembly,
  normalizeDef, pruneAssemblyMates, renderedParts, savedExactTopologyForPart,
  signalLibraryChange, topologyEntriesForPart, writeAssemblyIndex,
  writeLibraryIndex,
};
