/* The CAD editor's sketch profile and region analysis and feature-area
   hatching, split out of drawing_sheet.js, split out of
   js/modeler/drawing_sheet.js. It shares the editor's state through live
   imports from ./drawing_sheet.js. */
import { aabbFromBox, isUpToFace, resolveExtrudeExtent } from "../core/extrude_extent.js";
import { featureDefaults } from "../core/feature_catalog.js";
import { selectFeatureContours } from "../core/feature_contours.js";
import { canonicalFeatureTopologyReferences } from "../core/feature_input_stage.js";
import { createFeatureDefinition, recordSketchInHistory, removeHistoryNode } from "../core/parametric_document.js";
import { sketchProfileSegments } from "../core/profile_curves.js";
import { cloneData, partBounds } from "../modeler_part_geometry.js";
import { t } from "../modeler_strings.js";
import { thinExtrudeAreas } from "../modeler_thin_extrude_profiles.js";
import { E, H, refreshAll } from "../modeler.js";
import { analyzeSketchProfiles, healSketchEndpoints, pointInProfile } from "../sketch_profiles.js";
import { featureAreas, sketchRegions } from "../sketch_regions.js";
import { ensureSketch, sketchPoint } from "../sketch_solver.js";
import { uid } from "../state.js";
import { cutSkipNote, planeAxis, pushUndo, toPx } from "./document_history.js";
import { flash, report, sketchFingerprint } from "./drawing_sheet_touch.js";
import { regenerateExactModel } from "./export_measure.js";
import { cutTargetFeatureId, mergeTargetBody } from "./feature_create.js";
import { authoritativeFinishTopology } from "./finish_preview.js";
import { activeParts, addPart } from "./library_store.js";
import { selectedSolid } from "./part_commands.js";
import { applyCut, invalidatePartMeshAfterEdit, queueExactMesh, scheduleExactMesh } from "./prefs_snap.js";
import { selEntities } from "./sketch_entities.js";
import { isCanonicalAuthoring, setTab } from "./sketch_workflow.js";
import { featureAreaMemo, profileMemo, regionMemo } from "./drawing_sheet.js";

/* Called from the canvas every frame, from the extrude button and from the
   sketch pane — three times per refresh for one answer. Memoised on that
   fingerprint so the topology walk runs once per actual change. */
function sketchProfileAnalysis() {
  if (!E.def) return {status:"empty",profiles:[],openEnds:[],branchPoints:[],nearMergeCount:0};
  var sketch = ensureSketch(E.def);
  var selectedIds = selEntities().map(function (entity) { return entity.id; });
  var key = sketchFingerprint(sketch, selectedIds);
  if (profileMemo.sketch === sketch && profileMemo.key === key) return profileMemo.value;
  profileMemo.sketch = sketch;
  profileMemo.key = key;
  profileMemo.value = analyzeSketchProfiles(sketch, {
    selectedIds:selectedIds,
    // half a millimetre is small enough not to erase intentional details, but
    // large enough to repair the common "looks closed" endpoint split.
    tolerance:0.05,
  });
  return profileMemo.value;
}

/* The selected loop wins; otherwise the largest loop is the feature profile.
   Disconnected construction and reference geometry no longer blocks a valid
   region elsewhere in the sketch. */
function closedSketchProfile() {
  var analysis = sketchProfileAnalysis();
  return analysis.profiles.length ? analysis.profiles[0] : null;
}

/* The same answer as sketchProfileAnalysis(), asked of the drawing instead of
   the endpoint graph: which areas does this sketch actually enclose, counting
   the ones that only exist because two curves cross. Memoised on the same
   fingerprint, because the arrangement is the expensive half. */
function sketchRegionAnalysis(entityIds) {
  if (!E.def) return { regions:[], faces:[] };
  var sketch = ensureSketch(E.def);
  var scope = (entityIds || []).slice().sort().join("|");
  var key = sketchFingerprint(sketch, []);
  if (regionMemo.sketch === sketch && regionMemo.key === key && regionMemo.scope === scope) return regionMemo.value;
  regionMemo.sketch = sketch;
  regionMemo.key = key;
  regionMemo.scope = scope;
  regionMemo.value = sketchRegions(sketch, entityIds && entityIds.length
    ? { tolerance:0.05, entityIds:entityIds } : { tolerance:0.05 });
  return regionMemo.value;
}

/* Which entities a *new* feature may claim.
   Overlapping loops fuse into one area on purpose — that is what "how much
   material does this cut remove" means. But a profile an earlier feature
   already owns is not free to be swept into the next one: a circle that was
   extruded into a boss, with a slot later drawn across it in the same sketch,
   came back as one fused blob and got extruded a second time, boss and slot
   together. An id that belongs to another sketch simply never matches here. */
function unclaimedSketchEntityIds(sketch) {
  var claimed = new Set();
  var claim = function (ids) { if (Array.isArray(ids)) ids.forEach(function (id) { if (id != null) claimed.add(id); }); };
  (E.def?.features || []).forEach(function (feature) {
    claim(feature.params && feature.params.profileEntityIds);
    claim(feature.references && feature.references.profileEntityIds);
    (feature.params && feature.params.holeProfileEntityIds || []).forEach(claim);
    (feature.params && feature.params.regionProfileEntityIds || []).forEach(claim);
  });
  (E.def?.parts || []).forEach(function (part) {
    claim(part.profileEntityIds);
    (part.holeProfileEntityIds || []).forEach(claim);
  });
  var drawable = (sketch.entities || []).filter(function (entity) { return !entity.construction; });
  var free = drawable.filter(function (entity) { return !claimed.has(entity.id); }).map(function (entity) { return entity.id; });
  // nothing claimed, or everything claimed: there is no subset to narrow to
  return free.length && free.length < drawable.length ? free : [];
}

/* Every area a feature should act on, computed off the two analyses the editor
   already keeps warm. Lives in sketch_regions.js so it can be tested on its
   own; here it is only wired to the memos and to the current selection. */
/* What the next feature will actually act on, drawn as a hatch over each area.
   The set was already computed — sketchFeatureAreas() — and already used by
   Extrude; it simply was not visible, so "how many of these loops am I about
   to extrude?" had no answer short of pressing the button. The hatch is UI
   over that same set, never a second opinion about it. */
function drawFeatureAreaHatch(c) {
  if (E.docType !== "part" || E.mode === "drawing") return;
  var areas = sketchFeatureAreas();
  if (!areas.length) return;
  var span = Math.max(E.cw, E.ch);
  c.save();
  areas.forEach(function (area) {
    var loop = (area.points || []).map(function (point) { return toPx(point.u, point.v); });
    if (loop.length < 3) return;
    c.beginPath();
    loop.forEach(function (point, index) { index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y); });
    c.closePath();
    // Holes are cut out of the fill, so a ring reads as a ring rather than a disc.
    (area.holes || []).forEach(function (hole) {
      var ring = (hole || []).map(function (point) { return toPx(point.u, point.v); });
      if (ring.length < 3) return;
      c.moveTo(ring[0].x, ring[0].y);
      for (var i = ring.length - 1; i >= 1; i--) c.lineTo(ring[i].x, ring[i].y);
      c.closePath();
    });
    c.save();
    c.clip("evenodd");
    c.globalAlpha = 0.5;
    c.strokeStyle = "#2684c7";
    c.lineWidth = 1;
    c.beginPath();
    // 45° hatch, spaced in screen pixels so it stays legible at any zoom.
    for (var offset = -span; offset < span * 2; offset += 9) {
      c.moveTo(offset, 0);
      c.lineTo(offset + span, span);
    }
    c.stroke();
    c.restore();
  });
  c.restore();
}

/* Which area the pointer is inside, holes excluded. */
function featureAreaAt(u, v) {
  var areas = sketchFeatureAreas();
  for (var i = 0; i < areas.length; i++) {
    var area = areas[i];
    if (!pointInProfile({ u: u, v: v }, area.points || [])) continue;
    var inHole = (area.holes || []).some(function (hole) { return pointInProfile({ u: u, v: v }, hole || []); });
    if (!inHole) return area;
  }
  return null;
}

/* Clicking inside a hatched area takes it out of the feature, or puts it back.
   Inclusion is expressed the way the solver already reads it — as a selection
   of the area's own entities — so this moves nothing but the selection, and
   sselAuto is cleared because a click IS a selection the user made. */
function toggleFeatureArea(area) {
  if (!area) return false;
  var ids = area.sourceEntityIds || [];
  if (!ids.length) return false;
  var sketch = ensureSketch(E.def);
  var entities = (sketch.entities || []).filter(function (entity) { return ids.includes(entity.id); });
  if (!entities.length) return false;
  var chosen = E.sselAuto ? [] : (E.ssel || []).slice();
  var already = entities.every(function (entity) { return chosen.indexOf(entity) >= 0; });
  E.sselAuto = false;
  if (already) E.ssel = chosen.filter(function (item) { return entities.indexOf(item) === -1; });
  else E.ssel = chosen.concat(entities.filter(function (entity) { return chosen.indexOf(entity) === -1; }));
  E.sel = E.ssel[E.ssel.length - 1] || null;
  refreshAll();
  return true;
}

function sketchFeatureAreas(allCandidates, committedContourKeys) {
  // A selection the user made picks the areas; the one the draw tool left
  // behind does not — see markDrawnSelection.
  var activeBossChoice=!allCandidates && (Array.isArray(committedContourKeys)
    || E.authoring && E.authoring.featureType==="extrude" && E.authoring.featurePreviewState);
  var explicit=allCandidates ? [] : Array.isArray(committedContourKeys) ? committedContourKeys
    : activeBossChoice ? E.authoring.featurePreviewState.contourKeys || [] : [];
  var selected = allCandidates || activeBossChoice || E.sselAuto ? [] : selEntities().map(function (entity) { return entity.id; });
  var sketch = ensureSketch(E.def);
  /* Memoised on the same fingerprint as the two analyses it composes. The
     hatch draws this every frame, and while both of those are already cached,
     rebuilding the area list on top of them per frame is the kind of quiet
     per-frame allocation this file has had to hunt down before. */
  var areaKey = sketchFingerprint(sketch, selected);
  var areaScope = selected.slice().sort().join("|")+"/"+(allCandidates?"all":explicit.slice().sort().join("|"));
  if (featureAreaMemo.sketch === sketch && featureAreaMemo.key === areaKey && featureAreaMemo.scope === areaScope) {
    return featureAreaMemo.value;
  }
  var analysis = sketchProfileAnalysis();
  /* Arrange only what this feature may act on. Arranging everything and
     filtering afterwards cannot separate two loops that cross: their fused
     outline is bounded by both, so it answers to either one's selection. */
  var scope = selected.length ? selected : unclaimedSketchEntityIds(sketch);
  var value = null;
  if (scope.length) {
    var scoped = featureAreas(analysis, sketchRegionAnalysis(scope), selected);
    if (scoped.length) value = scoped;
  }
  if (!value) value = featureAreas(analysis, sketchRegionAnalysis(), selected);
  if(explicit.length)value=selectFeatureContours(value,explicit);
  featureAreaMemo.sketch = sketch;
  featureAreaMemo.key = areaKey;
  featureAreaMemo.scope = areaScope;
  featureAreaMemo.value = value;
  return value;
}

/* Extrude or cut with the sketch — the whole sketch. A multi-region cut is
   one feature with several associative loops; the live body still records a
   cutter for each region so its preview matches the exact rebuild. */
function extrusionSketchAreas(params,contourKeys) {
  if(!params.thinFeature)return sketchFeatureAreas(false,contourKeys);
  var state=E.authoring && E.authoring.featurePreviewState;
  var explicit=Array.isArray(contourKeys) ? contourKeys : state && ["extrude","extrudeCut"].includes(E.authoring.featureType) && state.thinChainKeys ? state.thinChainKeys : null;
  var selected=explicit || E.sselAuto ? [] : selEntities().map(function(entity){return entity.id;});
  return thinExtrudeAreas(ensureSketch(E.def),params,{selectedIds:selected,chainKeys:explicit || []});
}

async function extrudeClosedSketch(options) {
  options=options || {};var featureType=options.type || "extrude",params={...featureDefaults(featureType),...options};delete params.type;delete params.contourKeys;
  var analysis = sketchProfileAnalysis(), areas;
  try{areas=extrusionSketchAreas(params,options.contourKeys);}catch(error){flash(String(error.message||error));return false;}
  if (!areas.length) {
    flash(analysis.branchPoints.length ? t("profileBranched") : analysis.openEnds.length ? t("profileOpen") + " · " + analysis.openEnds.length + " " + t("profileEnds") : t("profileEmpty"));
    setTab("sketch");
    return false;
  }
  var sketch = ensureSketch(E.def);
  var target=featureType==="extrudeCut" ? (selectedSolid() || activeParts(E.def)[activeParts(E.def).length-1]) : null;
  var targetFeatureId=target ? cutTargetFeatureId(target) : null;
  if(featureType==="extrudeCut"&&!target){flash(t("extrudeCutNeed"));return false;}
  var pickedEndFace=isUpToFace(params.endCondition)?(E.topologySelection||[]).find(function(item){return item.kind==="face";}):null;
  var endFace=pickedEndFace ? canonicalFeatureTopologyReferences(E.def,[cloneData(pickedEndFace)])[0] : null;
  if(isUpToFace(params.endCondition)&&!endFace){flash(t("upToFaceNeed"));return false;}
  var axis = planeAxis(sketch.plane);
  var normal=sketch.frame && sketch.frame.normal;
  var direction=normal ? (axis==="x" ? Math.sign(normal.x || 1) : axis==="y" ? Math.sign(normal.y || 1) : Math.sign(normal.z || 1)) : 1;
  if (!direction) direction=1;
  var localFrame=sketch.frameSpace==="local" && sketch.frame;
  if (localFrame) direction=1;
  var depth=Math.max(1e-6,Number(params.depth)||E.depth),offset=Number.isFinite(Number(params.offset))?Number(params.offset):E.baseOff;
  var featureDirection=params.direction==="reverse"?-direction:direction,symmetric=!!params.symmetric||params.endCondition==="mid-plane";
  var center=(localFrame?0:sketch.offset)+featureDirection*offset;
  var start=symmetric?center-featureDirection*depth/2:center,end=symmetric?center+featureDirection*depth/2:center+featureDirection*depth;
  var extentHost=target;
  if(!extentHost && endFace && endFace.ownerFeatureId)extentHost=(activeParts(E.def)||[]).find(function(part){return part.featureId===endFace.ownerFeatureId || part.id===endFace.ownerFeatureId;}) || null;
  try {
    var extent=resolveExtrudeExtent({
      ...params, axis:localFrame?"frame":axis, frame:localFrame?cloneData(sketch.frame):undefined,
      from:start, to:end, points:areas[0]&&areas[0].points,
    }, {
      endFace:endFace,
      hostFaces:extentHost?(authoritativeFinishTopology(extentHost)||[]).filter(function(entry){return entry.kind==="face";}):[],
      hostBounds:extentHost?aabbFromBox(partBounds(extentHost)):null,
    });
    start=extent.from;end=extent.to;
  } catch (error) { flash(String(error.message||error)); return false; }
  if(endFace)params.endFace=cloneData(endFace);
  pushUndo(featureType==="extrudeCut" ? t("extrudeCut") : t("opExtrude"));
  var usedIds = [];
  areas.forEach(function (area) {
    if (area.entityIds) usedIds = usedIds.concat(area.entityIds);
    (area.holeEntityIds || []).forEach(function (ids) { usedIds = usedIds.concat(ids); });
  });
  var healed = usedIds.length ? healSketchEndpoints(sketch, usedIds, analysis.tolerance) : 0;
  recordSketchInHistory(E.def,sketch);
  /* An area with a chain behind it stays parametric; one that exists only
     because curves cross has no chain to name, so the feature carries the
     resolved loop instead of a reference that could never resolve. */
  var defineFeature=function (area, inputId, extraAreas) {
    if (!isCanonicalAuthoring()) return null;
    extraAreas=extraAreas || [];
    var profileParams=area.entityIds
      ? { profileEntityIds:area.entityIds, holeProfileEntityIds:area.holeEntityIds || [], holes:cloneData(area.holes || []) }
      : { points:area.points.map(function (q) { return { u:q.u, v:q.v }; }) };
    if(extraAreas.length){
      profileParams.regions=extraAreas.map(function(extra){return extra.points.map(function(q){return {u:q.u,v:q.v};});});
      profileParams.regionProfileEntityIds=extraAreas.map(function(extra){return extra.entityIds || null;});
      if(params.thinFeature)profileParams.thinRegionModes=extraAreas.map(function(extra){return extra.thinMode || params.thinMode;});
    }
    if(params.thinFeature)profileParams.thinMode=area.thinMode || params.thinMode;
    var storedParams={...params};delete storedParams.thinChainModes;
    return createFeatureDefinition(E.def,featureType,{
      inputs:inputId ? [inputId] : [],
      references:{sketches:[sketch.id],features:inputId ? [inputId] : [],topology:endFace?[cloneData(endFace)]:[],references:[],...(area.entityIds ? {profileEntityIds:area.entityIds} : {})},
      params:{...storedParams,depth:depth,offset:offset,axis:localFrame?"frame":axis,...profileParams,sketchId:sketch.id,operation:featureType==="extrudeCut"?"subtract":params.operation || "add",from:start,to:end,...(endFace?{endFace:cloneData(endFace)}:{})},
    });
  };
  if(featureType==="extrudeCut"){
    var cutCount=0,cutSkipped=[],cutFeature=null;
    try{cutFeature=defineFeature(areas[0],targetFeatureId,areas.slice(1));}
    catch(error){H.discard();flash(String(error.message||error));return false;}
    for(var i=0;i<areas.length;i++){
      var cutArea=areas[i];
      var removed=await applyCut(cutArea.points, cutFeature && cutFeature.id, cutArea.interior,{
        segments:cutArea.segments || (cutArea.entityIds ? sketchProfileSegments(sketch,cutArea.entityIds) : undefined),
        axis:localFrame?"frame":axis,frame:localFrame?cloneData(sketch.frame):undefined,
        from:start,to:end,endCondition:params.endCondition,
        draftAngle:Number(params.draftAngle)||0,draftOutward:!!params.draftOutward,
      });
      cutSkipped=cutSkipped.concat(E.lastCutSkipped || []);
      if(!removed)continue;
      cutCount++;
    }
    E.lastCutSkipped=[...new Set(cutSkipped)];
    if(!cutCount){
      if(cutFeature)removeHistoryNode(E.def,"history:feature:"+cutFeature.id);H.discard();
      var refusal=t("cutNone")+cutSkipNote();flash(refusal,8000);
      report("FEATURE", "Cut not applied", refusal);
      return false;
    }
    // applyCut replaces the parts array with rebuilt copies. Keep selection on
    // the affected body, not on the sketch point that was selected before the
    // feature. Otherwise the material pane can edit that point as if it were
    // a solid, and the change disappears on save/rebuild.
    E.sel=E.def.parts.find(function(part){return part.id===target.id;}) || null;
    E.ssel=[];
    E.topologySelection=[];
    E.authoring.featureType=null;E.authoring.phase="model";refreshAll();
    flash("✓ "+t("extrudeCut")+" · "+(params.endCondition || "through-all")+(cutCount>1?" · "+cutCount+" "+t("profileRegions"):"")+cutSkipNote());
    return true;
  }
  var made=[],merged=[],holeCount=0;
  for(var a=0;a<areas.length;a++){
    var area=areas[a],feature=null;
    var part = { id: uid(), kind: "ext", axis: localFrame ? "frame" : axis, frame:localFrame ? cloneData(sketch.frame) : undefined, from: start, to: end,
      pts: area.points, holes:area.holes.slice(),
      profileEntityIds: area.entityIds || undefined, holeProfileEntityIds:area.entityIds && area.holeEntityIds ? area.holeEntityIds : undefined,
      sketchId: sketch.id, sketchDriven: !!area.entityIds, support:cloneData(sketch.support), supportBaseOffset:(Number(sketch.supportOffset)||0)+offset, supportDepth:depth,
      direction:params.direction,symmetric:symmetric,draftAngle:Number(params.draftAngle)||0,draftOutward:!!params.draftOutward,
      featureId:feature ? feature.id : undefined,
      color: "#b89a6e", metal: 0.08, rough: 0.7, name: "Sketch Extrude" };
    /* "Merge result": the boss joins the body it lands on instead of standing
       beside it. Decided before the feature is defined, because a merged
       feature depends on its host and says so in the tree. */
    var host=mergeTargetBody(partBounds(part),params);
    try{feature=defineFeature(area,host?cutTargetFeatureId(host):null);}catch(error){H.discard();flash(String(error.message||error));return false;}
    if(feature){part.featureId=feature.id;part.name=feature.name;}
    holeCount+=area.holes.length;
    if(host){
      host.merges3d=host.merges3d || [];
      host.merges3d.push({axis:part.axis,...(part.frame?{frame:cloneData(part.frame)}:{}),from:start,to:end,loop:area.points.map(function(q){return {u:q.u,v:q.v};}),
        segments:area.segments || (area.entityIds ? sketchProfileSegments(sketch,area.entityIds) : undefined),
        holes:(area.holes || []).map(function(loop,index){return {points:cloneData(loop),segments:area.holeEntityIds && area.holeEntityIds[index] ? sketchProfileSegments(sketch,area.holeEntityIds[index]) : undefined};}),
        draftAngle:Number(params.draftAngle)||0,draftOutward:!!params.draftOutward,draftBase:start,featureId:feature?feature.id:undefined});
      // One sketch can contribute several boss regions to the same host.
      // Invalidate each changed projection, then build the final result once
      // after all merges instead of launching a kernel job per region.
      invalidatePartMeshAfterEdit(host,false);
      merged.push(host);
      continue;
    }
    addPart(part); made.push(part);
    scheduleExactMesh(part);   // a drafted boss has no analytic form to draw
  }
  E.sel = made[made.length-1] || merged[merged.length-1] || E.sel;
  refreshAll();
  if (merged.length && isCanonicalAuthoring()) await regenerateExactModel(undefined,{restoreMode:'mesh'});
  else [...new Set(merged)].forEach(function(part){queueExactMesh(part);});
  flash("✓ " + t("opExtrude") + (made.length > 1 ? " · " + made.length + " " + t("profileRegions") : "")
    + (holeCount ? " · " + holeCount + " " + t("profileHoles") : "") + (healed ? " · " + t("profileHealed") : ""));
  E.authoring.featureType=null;E.authoring.phase="model";
  return true;
}

function sketchLinePoints(line) {
  var sketch = ensureSketch(E.def);
  return { a: sketchPoint(sketch, line.a), b: sketchPoint(sketch, line.b) };
}

function newSketchPoint(sketch, p) {
  if (p.pointId && sketchPoint(sketch, p.pointId)) return p.pointId;
  var id = uid();
  sketch.points.push({ id: id, x: p.u, y: p.v });
  return id;
}

/* The first point of a two-point tool, related to what the press snapped to:
   an existing sketch point is reused (coincident), and the origin fixes it at
   0,0 — as SOLIDWORKS adds Coincident when a circle is started on the origin.
   Without this the centre only LOOKED centred and kept two free DOF. */
function snappedSketchPoint(sketch, at, snap) {
  var id = newSketchPoint(sketch, snap && snap.pointId ? { u: at.u, v: at.v, pointId: snap.pointId } : at);
  if (snap && snap.k === "o" && !snap.pointId) sketch.constraints.push({ id: uid(), type: "fixed", point: id, x: 0, y: 0 });
  return id;
}

export {
  closedSketchProfile, drawFeatureAreaHatch, extrudeClosedSketch,
  extrusionSketchAreas, featureAreaAt, newSketchPoint, sketchFeatureAreas,
  sketchLinePoints, sketchProfileAnalysis, sketchRegionAnalysis,
  snappedSketchPoint, toggleFeatureArea,
};
