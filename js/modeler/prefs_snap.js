/* The CAD editor's density and preferences, new documents, snapping and
   exact-preview state, split out of js/modeler.js. It shares the editor's state
   through live imports from ../modeler.js. */
import { releaseRegeneration } from "../cad_feature_tree.js";
import { disposeBrep, shapeToMeshData } from "../cad_kernel.js";
import { cadWorkerAvailable, cutIntersectionInCadWorker, regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { validShortcutBindings } from "../core/command_shortcuts.js";
import { bodyDepthRange, cutFootprintsMayOverlap, profileLoopIsSeparateHole } from "../core/cut_scope.js";
import { captureExactDiagnostics } from "../core/exact_diagnostics.js";
import { captureExactTopology } from "../core/exact_topology_cache.js";
import { KERNEL_BODY_KIND, isKernelBody, kernelBodyMeshData, kernelBodySpec, meshDataBounds } from "../core/kernel_body.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { ensureParametricDocument } from "../core/parametric_document.js";
import { inferOrthoSnap, onCurveTargets, pickSnap, sketchSnapTargets } from "../modeler_inference.js";
import { clearTopologyCache, holeLoop } from "../modeler_mesh_geometry.js";
import { boxToExt, cloneData, cutFootprint, cutRangeForAxis, exactBrepForPart, exactCutIntersection, partBounds, partNeedsExactMesh, partSupportsExactMesh } from "../modeler_part_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { refreshParts } from "../modeler/component_mates.js";
import { currentHistoryNode, frameRangeForBounds, partUV, planeAxis } from "../modeler/document_history.js";
import { flash } from "../modeler/drawing_sheet.js";
import { cutTargetFeatureId } from "../modeler/feature_create.js";
import { refreshChangedPart, renderPreview } from "../modeler/library_panel.js";
import { addPart, featureTypeLabel } from "../modeler/library_store.js";
import { syncStatus } from "../modeler/sketch_entities.js";
import { isCanonicalAuthoring } from "../modeler/sketch_workflow.js";
import { loopInteriorPoint } from "../sketch_regions.js";
import { ensureSketch } from "../sketch_solver.js";
import { fin, uid } from "../state.js";
import {
  E, LS_MODELER_PREFS, MODELER_PREFS, MODELER_PREFS_VERSION,
  MODELER_VIEW_PREFS, cancelledExactPreview, exactBuildTimers,
  pendingCutController, root, set_pendingCutController,
} from "../modeler.js";

function syncDensity() {
  if (!root) return;
  root.classList.toggle("md-density-expert",E.expertDensity);
  root.classList.toggle("md-workflow-hidden",!E.workflowVisible);
  var density=root.querySelector("#mdDensity");
  if(density)density.value=E.expertDensity?"expert":E.workflowVisible||E.coachEnabled?"guided":"standard";
  var welcome=root.querySelector("#mdPrefWelcome"), coach=root.querySelector("#mdPrefCoach");
  if(welcome)welcome.checked=E.welcomeOnOpen;
  if(coach)coach.checked=E.coachEnabled;
}
function loadModelerPrefs() {
  try {
    var stored = JSON.parse(localStorage.getItem(LS_MODELER_PREFS)) || {};
    E.commandShortcuts=validShortcutBindings(stored.commandShortcuts);
    MODELER_PREFS.forEach(function (key) { if (typeof stored[key] === "boolean") E[key] = stored[key]; });
    MODELER_VIEW_PREFS.forEach(function (key) {
      if (typeof stored[key] === typeof E[key]) E[key] = stored[key];
    });
    /* v1 defaulted Normal To off, so every existing store has false without
       the user having chosen it. Stamp v2 once so a later uncheck sticks. */
    var ver = Number(stored.prefsVersion) || 0;
    if (ver < 2) {
      E.sketchNormalTo = true;
      saveModelerPrefs();
    }
  } catch (e) {}
}
function saveModelerPrefs() {
  try {
    var out = { prefsVersion: MODELER_PREFS_VERSION,commandShortcuts:E.commandShortcuts || {} };
    MODELER_PREFS.forEach(function (key) { out[key] = !!E[key]; });
    MODELER_VIEW_PREFS.forEach(function (key) { out[key] = E[key]; });
    localStorage.setItem(LS_MODELER_PREFS, JSON.stringify(out));
  } catch (e) {}
}

function newDef() {
  var def=ensureParametricDocument({
    key: "cm_" + Date.now().toString(36), name: t("newModel"), price: 500,
    col: "#c9bfae", parts: [], constraints: [], rollback: null,
    sketches: [], activeSketch: null, variables: [],
    features: [], history:[], referenceGeometry: [], metadata:{authoringSystem:"parametric-v1"},
    notes: [], markups: [], appearances: [],
  });
  def.notes = [];
  def.markups = [];
  def.metadata.authoringSystem="parametric-v1";
  return def;
}
// Drawing stays freehand.  Keep only a little numeric cleanup so repeated
// pointer updates do not accumulate floating-point noise; the visible grid is
// a reference, not a magnet.
function snapV(v) { return Math.round(v * 10) / 10; }

/* ---- object snapping: endpoints, midpoints, centres, origin, then H/V inference ---- */
function snapTargets(excludePart) {
  var ts = sketchSnapTargets(ensureSketch(E.def), { poly: E.poly, excludeEntity: excludePart });
  (E.def.parts || []).forEach(function (p) {
    if (p === excludePart) return;
    var f = partUV(p);
    if (f.type === "rect") {
      var u0 = Math.min(f.u0, f.u1), u1 = Math.max(f.u0, f.u1), v0 = Math.min(f.v0, f.v1), v1 = Math.max(f.v0, f.v1);
      ts.push({ u: u0, v: v0, k: "e" }, { u: u1, v: v0, k: "e" }, { u: u0, v: v1, k: "e" }, { u: u1, v: v1, k: "e" });
    } else if (f.type === "poly") {
      /* Only a poly footprint has loop points. A mesh-projected one (an import,
         a kernel body) answers with segments, and reading .pts off it used to
         throw inside every snap on the plan. */
      var loops = [f.pts || []].concat((p.holes || []).map(function (hl) { return holeLoop(hl); }).filter(function (lp) { return lp.length; }));
      loops.forEach(function (lp) {
        lp.forEach(function (q) { ts.push({ u: q.u, v: q.v, k: "e" }); });
      });
    }
  });
  return ts;
}
function snapPt(uv, excludePart, origin) {
  E._osnap = null;
  var raw = { u: snapV(uv.u), v: snapV(uv.v) };
  if (E.osnap) {
    // fixed spots plus the nearest point on each sketch circle under the pointer
    var picked = pickSnap(uv, snapTargets(excludePart).concat(onCurveTargets(uv, ensureSketch(E.def), origin, E.scl)), {
      scale: E.scl, cycleIndex: E.inferenceIndex, suppress: E._suppressInference,
    });
    E.inferenceCandidates = picked.candidates || [];
    if (picked.snap) {
      E._osnap = picked.snap;
      raw = { u: picked.snap.u, v: picked.snap.v, pointId: picked.snap.pointId || null };
    }
  }
  if (origin && !E._osnap && !E._suppressInference) {
    var ortho = inferOrthoSnap(raw, origin, E.scl, false);
    if (ortho.kind) {
      E._osnap = { u: ortho.point.u, v: ortho.point.v, k: ortho.kind };
      raw = { u: ortho.point.u, v: ortho.point.v };
    }
  }
  return raw;
}

function exactPreviewWasCancelled() {
  return cancelledExactPreview && cancelledExactPreview.document===E.def && cancelledExactPreview.node===currentHistoryNode();
}


async function exactDisplayBody(p, document = E.def, requestedHead = null, options = {}) {
  if (document.metadata?.authoringSystem!=="parametric-v1" || !(document.features || []).some(function(feature){return feature.id===p.featureId;})) {
    var legacy=await exactBrepForPart(p);
    return {brep:legacy,release:function(){disposeBrep(legacy);}};
  }
  var head=requestedHead || cutTargetFeatureId(p,document), compiled=compileKernelFeatureTree(document);
  var displayNode=currentHistoryNode(),displayEditRevision=E.massEditRevision;
  if(!compiled.ok)throw new Error(compiled.issues[0]?.message || "Invalid feature history");
  var run=await regenerateFeatures({...compiled.document,features:compiled.features},{requestedHead:head,massProperties:options.massProperties,signal:options.signal,scope:options.scope,restoreMode:options.restoreMode,coalesceKey:options.coalesceViewport?'viewport:'+head:undefined});
  // A document-wide publication can retire this body without changing history.
  // Gate shared diagnostics and topology with the caller's ownership check too;
  // stale results still follow the normal return/error and release contract.
  if(document===E.def && displayNode===currentHistoryNode() && displayEditRevision===E.massEditRevision && (!options.isCurrent || options.isCurrent())){
    if(run.ok!==false)document.exactTopologyCache=captureExactTopology(document,compiled.features,run);
    if(run.ok===false)E.exactDiagnosticRun=captureExactDiagnostics(document,displayNode,displayEditRevision,run);
    else if(E.exactDiagnosticRun?.kernelRun.issues.every(function(issue){return run.results.has(issue.feature);}))E.exactDiagnosticRun=null;
  }
  var brep=run.results.get(head);
  if(!brep?.shape && !(options.restoreMode==='mesh' && brep?.verifiedSerializedExact===true)){releaseRegeneration(run);throw new Error(run.issues.find(function(issue){return issue.code==='regeneration-failed';})?.message || "The displayed body could not be rebuilt");}
  return {brep:brep,release:function(){releaseRegeneration(run);}};
}

function queueExactMesh(p) {
  if(exactPreviewWasCancelled())return;
  if (!partSupportsExactMesh(p)) return;
  var buildingDocument=E.def;
  if (!(buildingDocument.parts || []).includes(p)) return;
  var scheduled = exactBuildTimers.get(p);
  if (scheduled) { clearTimeout(scheduled); exactBuildTimers.delete(p); }
  var token = (p.exactBuildToken || 0) + 1;
  p.exactBuildToken = token;
  var buildIsCurrent = function () {
    return E.def===buildingDocument && p.exactBuildToken===token && (buildingDocument.parts || []).includes(p);
  };
  p.exactPending = true;
  p.exactError = null;
  syncStatus();
  /* A kernel body has no analytic form to fall back to, so a stale mesh left up
     while the kernel works — or after it fails — would be a different shape
     from the answer. Drop it here, exactly as queueKernelBody does. */
  if (isKernelBody(p)) { delete p.meshData; delete p.bounds; clearTopologyCache(p); }
  refreshChangedPart(p);
  // The full browser kernel is intentionally lazy-loaded.  Keep the editor
  // interactive and replace an indefinite spinner with an actionable status
  // on devices where compiling the WASM module takes unusually long.  The
  // original build is not cancelled: a late result still replaces the
  // lightweight preview below.
  var slowTimer = typeof window !== "undefined" ? setTimeout(function () {
    if (!buildIsCurrent() || !p.exactPending) return;
    p.exactPending = true;
    p.exactError = "Exact geometry is still computing. You can continue editing or cancel the command.";
    refreshChangedPart(p);
  }, 15000) : null;
  exactDisplayBody(p,buildingDocument,null,{restoreMode:'mesh',coalesceViewport:true,isCurrent:buildIsCurrent}).then(async function (display) {
    var brep=display.brep;
    try {
      if (!buildIsCurrent()) return;
      var meshData = brep.verifiedSerializedExact===true ? cloneData(brep.workerMeshData) : await shapeToMeshData(brep, {deflection:0.28,angle:0.18});
      meshData.topology = cloneData(brep.topology || []);
      if (!buildIsCurrent()) return;
      if (isKernelBody(p)) {
        /* This mesh IS the body — it is saved with the document rather than
           rebuilt from analytic fields on load — so the Float32Array normals
           and colours go, because JSON.stringify turns them into {"0":…}.
           buildExactMesh() derives flat normals when they are absent. */
        delete meshData.normals; delete meshData.colors;
        meshData.bounds = meshDataBounds(meshData.positions);
        p.bounds = meshData.bounds;
        clearTopologyCache(p);
      }
      p.meshData = meshData;
      if (buildingDocument.metadata?.authoringSystem === "parametric-v1") p.bounds = meshDataBounds(meshData.positions);
      p.exactPending = false;
      p.exactError = null;
      syncStatus();
      refreshChangedPart(p);
      if (isKernelBody(p) && root) refreshParts();
      if (E.mode === "3d") renderPreview();
    } finally {
      if (slowTimer !== null) clearTimeout(slowTimer);
      display.release();
    }
  }).catch(function (error) {
    if (slowTimer !== null) clearTimeout(slowTimer);
    if (!buildIsCurrent()) return;
    p.exactPending = false;
    p.exactError = String(error && error.message || error);
    console.warn("Exact CAD mesh build failed:", error);
    syncStatus();
    refreshChangedPart(p);
    if (isKernelBody(p) && root) refreshParts();
  });
}

function scheduleExactMesh(p) {
  if (!partNeedsExactMesh(p)) return;
  var old = exactBuildTimers.get(p);
  if (old) clearTimeout(old);
  exactBuildTimers.set(p, setTimeout(function () {
    exactBuildTimers.delete(p);
    queueExactMesh(p);
  }, 140));
}

/* Live parameter drags used to call queueKernelBody on every frame, which
   blanks the mesh and starts OpenCascade before the previous run has
   finished. One delayed rebuild after the pointer settles is enough. */
function scheduleKernelBody(p) {
  if (!isKernelBody(p) || !p.kernel) return;
  var old = exactBuildTimers.get(p);
  if (old) clearTimeout(old);
  exactBuildTimers.set(p, setTimeout(function () {
    exactBuildTimers.delete(p);
    queueKernelBody(p);
  }, 140));
}

/* A committed cut — or a merge, which is the same event with the other sign —
   changes the source solid underneath any cached exact mesh.
   This matters most for Cut-after-Fillet: a same-axis cut can stay a cheap
   profile hole, but the fillet's old mesh would otherwise keep rendering and
   hide the new hole forever.  Drop the stale mesh immediately so the analytic
   fallback shows profile holes, then rebuild when this body still needs the
   exact kernel (cross-cuts, fillets, chamfers, or shells). */
function invalidatePartMeshAfterEdit(p, schedule=true) {
  if (!p) return;
  delete p.meshData;
  // no analytic fallback: stale bounds would keep snapping and framing the
  // shape the cut just removed
  if (isKernelBody(p)) delete p.bounds;
  p.exactPending = false;
  p.exactError = null;
  if (schedule && partNeedsExactMesh(p)) scheduleExactMesh(p);
}

/* ---- kernel bodies ------------------------------------------------------
   Sweep, loft and everything after them produce a solid only OpenCascade can
   compute. queueExactMesh above rebuilds a body from its own analytic fields;
   this rebuilds one from `p.kernel`, the recipe copied off the feature. Same
   token discipline, same status fields, so the inspector, the tree and the
   viewport need to learn nothing new — and an overtaken build cannot land on
   top of a newer one. */
function queueKernelBody(p) {
  if(exactPreviewWasCancelled())return;
  if (!isKernelBody(p) || !p.kernel) return;
  // Canonical Loft/Sweep bodies belong to the feature history. Building their
  // bare legacy recipe here repeats OpenCascade on the UI thread while the
  // complete history is already running in the worker.
  if(isCanonicalAuthoring() && (E.def.features || []).some(function(feature){return feature.id===p.featureId;})) { queueExactMesh(p); return; }
  /* Once cuts or finish operations sit on the body, the recipe alone is no
     longer its shape. exactBrepForPart() starts from the same recipe and then
     applies them, so there is one builder rather than two disagreeing answers. */
  if (partNeedsExactMesh(p)) { queueExactMesh(p); return; }
  var token = (p.exactBuildToken || 0) + 1;
  p.exactBuildToken = token;
  p.exactPending = true;
  p.exactError = null;
  /* No stand-in solid while the kernel works, and none left behind when it
     fails: a kernel body has no analytic form to fall back to, so drawing one
     would mean drawing a different shape from the answer. The step fails alone
     — nothing else in the document is touched — and leaves no ghost. */
  delete p.meshData;
  delete p.bounds;
  clearTopologyCache(p);
  refreshChangedPart(p);
  kernelBodyMeshData(p.kernel, {origin:p.origin, ownerFeatureId:p.featureId || "feature:part:" + p.id}).then(function (meshData) {
    if (p.exactBuildToken !== token) return;
    p.meshData = meshData;
    p.bounds = meshData.bounds;
    p.exactPending = false;
    p.exactError = null;
    clearTopologyCache(p);
    /* The same three surfaces queueExactMesh() refreshes, and for the same
       reason: refreshAll() would re-enter the parametric rebuild from inside an
       async callback the rebuild itself started. */
    refreshChangedPart(p);
    if (root) refreshParts();
    if (E.mode === "3d") renderPreview();
  }).catch(function (error) {
    if (p.exactBuildToken !== token) return;
    p.exactPending = false;
    p.exactError = String(error && error.message || error);
    console.warn("Kernel body build failed:", p.exactError);
    refreshChangedPart(p);
    if (root) refreshParts();
    flash(tf("kernelBodyFailed", {error:p.exactError}));
  });
}


/* One derived preview body for a feature the kernel owns. Canonical feature
   creation has already happened; this is the projection adapter, exactly as
   addPart() is for the analytic kinds. */
function addKernelBodyPart(feature, type, params, sketchSources) {
  var spec;
  try { spec = kernelBodySpec(type, params); }
  catch (error) { flash(String(error && error.message || error)); return null; }
  var part = addPart({
    id: uid(),
    featureId: feature && feature.id,
    kind: KERNEL_BODY_KIND,
    name: (feature && feature.name) || featureTypeLabel(type),
    kernel: spec,
    // The link back to the sketches, kept on the PART: kernelBodySpec drops
    // everything the kernel would not read, and this is not a kernel input.
    ...(sketchSources ? { sketchSources: cloneData(sketchSources) } : {}),
    origin: {x:0, y:0, z:0},
    color: "#b89a6e", metal: .08, rough: .7,
  });
  queueKernelBody(part);
  return part;
}

/* A kernel body loaded from a saved model already carries its last mesh, so it
   draws at once; one that lost it (an older save, a failed build, a cleared
   cache) rebuilds from the recipe instead of staying invisible forever. */
function restoreKernelBodies(def) {
  (def && def.parts || []).forEach(function (part) {
    if (isKernelBody(part) && part.kernel && !(part.meshData && (part.meshData.positions || []).length >= 9)) queueKernelBody(part);
  });
}

async function applyCut(loop,featureId,hint,cutSpec){
  if(E.cutPending)return 0;
  const host=root,controller=new AbortController();set_pendingCutController(controller);E.cutPending=true;
  if(host)host.setAttribute("aria-busy","true");
  try{return await applyCutChecked(loop,featureId,hint,cutSpec,controller.signal);}
  finally{if(pendingCutController===controller)set_pendingCutController(null);E.cutPending=false;if(host)host.removeAttribute("aria-busy");}
}
async function applyCutChecked(loop, featureId, hint, cutSpec, signal) {
  if (!loop || loop.length < 3) return 0;
  // The cut belongs to whatever it overlaps, not to whatever happens to sit
  // under its average point: the centroid of a C-shaped or ring-shaped loop is
  // in the notch, and testing only that point silently cut nothing.
  /* Feature application happens after plane-edit mode may have closed.  The
     sketch still owns its plane, so never fall back to the camera/view here:
     doing so mirrored or displaced cuts authored on a selected face. */
  var sketch=ensureSketch(E.def),frame=sketch && sketch.frameSpace==="local" ? sketch.frame : null;
  var ax=frame ? "frame" : planeAxis(sketch && sketch.plane || E.view),changed=0;
  cutSpec=cutSpec || {};
  var bounded=(cutSpec.endCondition || "through-all") !== "through-all"
    && fin(cutSpec.from) && fin(cutSpec.to);
  var c = hint && fin(hint.u) && fin(hint.v) ? hint : loopInteriorPoint(loop);
  /* The cut's own draft. `draftBase` pins the neutral plane to where the loop
     was drawn, so a through-all cutter stretched across the body still tapers
     from the sketch plane rather than from wherever the stretch started. */
  var draftAngle=Number(cutSpec.draftAngle)||0;
  var draftRecord=draftAngle?{draftAngle:draftAngle,draftOutward:!!cutSpec.draftOutward,draftBase:fin(cutSpec.from)?cutSpec.from:0}:{};
  if(cutSpec.segments)draftRecord.segments=cloneData(cutSpec.segments);
  var skipped = [];
  var document=E.def,originalParts=E.def.parts,signature=JSON.stringify(originalParts),sketchSignature=JSON.stringify(sketch),updated=[];
  for(const original of originalParts)updated.push(await (async function (p) {
    var footprint=cutFootprint(p, frame, ax);
    // Draft may expand beyond the sketch boundary; let the exact stage decide.
    var inside=!!draftAngle || cutFootprintsMayOverlap(loop,footprint);
    /* A cut with a stated depth only reaches as far as it says. Recording it on
       a body outside that depth costs a kernel rebuild that subtracts nothing,
       and makes the history claim a cut that never happened. */
    if (inside && bounded) {
      var reach = bodyDepthRange(partBounds(p), frame, ax);
      var lo = Math.min(cutSpec.from, cutSpec.to), hi = Math.max(cutSpec.from, cutSpec.to);
      if (reach.to <= lo + 1e-6 || reach.from >= hi - 1e-6) inside = false;
    }
    /* A body the exact kernel cannot rebuild cannot be cut. It used to be
       skipped in silence, which reads as "the cut went through the box but not
       through the shape standing on it". Collect it and say so. */
    if (inside && !partSupportsExactMesh(p)) { skipped.push(p.name || p.kind || "body"); return p; }
    if(inside){
      var exactRange=bounded?{from:cutSpec.from,to:cutSpec.to}:frame?frameRangeForBounds(partBounds(p),frame):cutRangeForAxis(partBounds(p),ax);
      var cutDisplay;
      try{
        var pendingCut=(E.def.features || []).find(function(feature){return feature.id===featureId;});
        var cutHead=pendingCut?.inputs?.[0] || cutTargetFeatureId(p,E.def),exactCut={axis:frame?"frame":ax,...(frame?{frame:cloneData(frame)}:{}),...exactRange,loop:loop,...draftRecord};
        var check;
        if(cadWorkerAvailable() && isCanonicalAuthoring()){
          var cutCompiled=compileKernelFeatureTree(E.def);if(!cutCompiled.ok)throw new Error(cutCompiled.issues[0]?.message || 'Invalid feature history');
          check=await cutIntersectionInCadWorker({...cutCompiled.document,features:cutCompiled.features},cutHead,exactCut,{signal:signal});
        } else {
          cutDisplay=await exactDisplayBody(p,E.def,cutHead,{signal:signal,scope:'cut-preflight'});if(signal?.aborted)return p;
          check=await exactCutIntersection(p,exactCut,cutDisplay.brep);
        }
        if(!check.intersects)return p;
      }
      catch(error){skipped.push((p.name||p.kind||"body")+": "+String(error.message||error));return p;}
      finally{if(cutDisplay)cutDisplay.release();}
    }
    if (frame && inside && partSupportsExactMesh(p)) {
      var range=bounded ? {from:cutSpec.from,to:cutSpec.to} : frameRangeForBounds(partBounds(p),frame);
      p.cuts3d=p.cuts3d || [];
      p.cuts3d.push({axis:"frame",frame:cloneData(frame),from:range.from,to:range.to,loop:loop.map(function(q){return {u:q.u,v:q.v};}),featureId:featureId || undefined,...draftRecord});
      changed++;
      invalidatePartMeshAfterEdit(p);
      return p;
    }
    if (p.kind === "box") {
      if (inside) p = boxToExt(p, ax);
    }
    if (inside) {
      var copy = loop.map(function (q) { return { u:q.u, v:q.v }; });
      var containedProfileHole = p.kind === "ext" && p.axis === ax && !bounded
        && !cutSpec.segments
        && !draftAngle   // a drafted cut is a taper; a profile hole is a prism
        && !(p.cuts3d && p.cuts3d.length)
        && profileLoopIsSeparateHole(copy, p.pts || [], (p.holes || []).map(function (hole) { return holeLoop(hole); }));
      if (containedProfileHole) {
        p.holes = p.holes || [];
        p.holes.push(featureId ? { points: copy, featureId: featureId } : copy);
      } else {
        p.cuts3d = p.cuts3d || [];
        var cutRange=bounded ? {from:cutSpec.from,to:cutSpec.to} : cutRangeForAxis(partBounds(p),ax);
        p.cuts3d.push({axis:ax,from:cutRange.from,to:cutRange.to,loop:copy,featureId:featureId || undefined,...draftRecord});
      }
      changed++;
      invalidatePartMeshAfterEdit(p);
    }
    return p;
  })(cloneData(original)));
  if(signal?.aborted || E.def!==document||E.def.parts!==originalParts||JSON.stringify(originalParts)!==signature||JSON.stringify(sketch)!==sketchSignature){E.lastCutSkipped=[signal?.aborted?'Exact CAD computation cancelled':t("cutChangedRetry")];return 0;}
  if(changed)E.def.parts=updated;
  E.lastCutSkipped = skipped;
  return changed;
}

export {
  addKernelBodyPart, applyCut, exactDisplayBody, invalidatePartMeshAfterEdit,
  loadModelerPrefs, newDef, queueExactMesh, queueKernelBody,
  restoreKernelBodies, saveModelerPrefs, scheduleExactMesh,
  scheduleKernelBody, snapPt, snapV, syncDensity,
};
