/* The CAD editor's drawing-sheet wiring, split out of js/modeler.js. It
   shares the editor's state through live imports from ../modeler.js. */
import { drawingMaterialName } from "../cad_appearances.js";
import { assemblyHasExplodedOffsets, drawingAssemblyPose } from "../cad_exploded_view.js";
import { assemblySourceBodies, partSourceBodies, placeDrawingBody } from "../cad_configured_drawing.js";
import { SHEET_SIZES, STANDARD_SCALES, defaultViewLabel, effectiveViewSource, ensureSheetDoc, scaleLabel, viewSourceOwner } from "../cad_sheet.js";
import { ensureAssemblyDrawingDoc } from "../core/assembly_drawing_settings.js";
import { setSheetTitleSource, sheetTitleMeta } from "../core/custom_properties.js";
import { lengthToDocument } from "../core/document_length_units.js";
import { applyDocumentDefaults, captureDocumentPreset, documentDefaults, loadDocumentPresets, saveDocumentPreset, validateDocumentDefaults } from "../core/document_presets.js";
import { decodeDrawingImage } from "../core/drawing_image.js";
import { applyDrawingFormat, captureDrawingPreset, loadDrawingPresets, saveDrawingPreset } from "../core/drawing_presets.js";
import { importDrawingProjectImage } from "../core/drawing_project_image.js";
import { drawingViewScaleControl } from "../core/drawing_scale_control.js";
import { aabbFromBox, isUpToFace, resolveExtrudeExtent } from "../core/extrude_extent.js";
import { featureDefaults } from "../core/feature_catalog.js";
import { listLibrarySources, modelLibraryRevision, readLibrarySource } from "../core/model_library_store.js";
import { selectFeatureContours } from "../core/feature_contours.js";
import { canonicalFeatureTopologyReferences } from "../core/feature_input_stage.js";
import { framePoint } from "../core/frame.js";
import { calloutText, calloutTextById, holeCallouts } from "../core/hole_callout.js";
import { configuredBodyAppearance, configuredViewId, createNativeConfiguredDrawingCache } from "../core/native_configured_drawing.js";
import { createFeatureDefinition, recordSketchInHistory, removeHistoryNode } from "../core/parametric_document.js";
import { tessellateParts } from "../core/part_tessellate.js";
import { sketchProfileSegments } from "../core/profile_curves.js";
import { SECTION_HATCH_PATTERNS, sectionHatchCaption } from "../core/section_hatch.js";
import { surfaceSketchWorldPolyline } from "../core/surface_uv.js";
import { boxSelectMode } from "../modeler_chrome.js";
import { bindDetailTagControls, bindSectionPositionControls, bindSectionTagControls, createDrawingController } from "../modeler_drawing.js";
import { entityStatuses, sketchStatusColor } from "../modeler_inference.js";
import { holeLoop } from "../modeler_mesh_geometry.js";
import { syncModelerMobile } from "../modeler_mobile.js";
import { cloneData, partBounds, partPatternRotations } from "../modeler_part_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { thinExtrudeAreas } from "../modeler_thin_extrude_profiles.js";
import { openQuickForm, syncContextActions } from "../modeler/command_manager.js";
import { dynDrawHud, pointToLineDistance } from "../modeler/dimension_entry.js";
import { activeSketchFrame, axisOfView, currentHistoryNode, cutSkipNote, invalidateSketchProjection, partUV, pathUvCircleArc, pathUvEllipse, planeAxis, positiveArcSweep, pushUndo, sameSketchContext, scheduleModelerDraft, sketchProjection, standardPlaneFrame, strokeUvCircle, strokeUvRect, toPx } from "../modeler/document_history.js";
import { assemblyDrawingBOMRows, assemblyDrawingBalloonTargets } from "../modeler/document_io.js";
import { sketchOpenPathReadiness, syncTools } from "../modeler/document_save.js";
import { btn, el, namedButton } from "../modeler/editor_dom.js";
import { newModel } from "../modeler/editor_forms.js";
import { regenerateExactModel } from "../modeler/export_measure.js";
import { cutTargetFeatureId, mergeTargetBody } from "../modeler/feature_create.js";
import { authoritativeFinishTopology } from "../modeler/finish_preview.js";
import { syncHead } from "../modeler/library_io.js";
import { assemblyExplodeLines, buildAssembly } from "../modeler/library_panel.js";
import { activeParts, addPart, defBounds, renderedParts, topologyEntriesForPart } from "../modeler/library_store.js";
import { selectedSolid } from "../modeler/part_commands.js";
import { applyCut, invalidatePartMeshAfterEdit, queueExactMesh, scheduleExactMesh } from "../modeler/prefs_snap.js";
import { instanceLabels, refusalHint } from "../modeler/sketch_dimension_editor.js";
import { hitSketch, selEntities, sizeSketch, syncStatus } from "../modeler/sketch_entities.js";
import { isCanonicalAuthoring, modelLengthUnit, setTab } from "../modeler/sketch_workflow.js";
import { fitPreview, setPanelCollapsed } from "../modeler/view_modes.js";
import { addOverlayPolyline } from "../modeler/viewport_decorations.js";
import { buildPart } from "../modeler/viewport_state.js";
import { clearGroup } from "../primitives.js";
import { drawConstraintGlyphs, drawSketchDimensions } from "../sketch_dimensions.js";
import { drawNameTags, relationTargets, sketchInstanceNames } from "../sketch_names.js";
import { analyzeSketchProfiles, healSketchEndpoints, pointInProfile } from "../sketch_profiles.js";
import { featureAreas, sketchRegions } from "../sketch_regions.js";
import { circleData, ellipseData, ensureSketch, ensureSketchDoc, lineData, sketchPoint, solveSketch } from "../sketch_solver.js";
import { bezierPoint, splineControls } from "../sketch_spline.js";
import { tangentArc } from "../sketch_tangent_arc.js";
import { threePointArc } from "../sketch_three_point_arc.js";
import { fin, uid } from "../state.js";
import { THREE, threeLoaded } from "../three_lazy.js";
import { getTouchPrecisionPrefs } from "../touch_precision_ui.js";
import { directionalSegmentDistances, drawTouchPrecisionLens } from "../touch_precision.js";
import { getDomainUnit } from "../unit_settings.js";
import { E, H, pathSketchSpline, refreshAll, root } from "../modeler.js";
import {
  closedSketchProfile, drawFeatureAreaHatch, extrudeClosedSketch,
  extrusionSketchAreas, featureAreaAt, newSketchPoint, sketchFeatureAreas,
  sketchLinePoints, sketchProfileAnalysis, sketchRegionAnalysis,
  snappedSketchPoint, toggleFeatureArea,
} from "./drawing_sheet_profiles.js";
import {
  closeReport, drawModelerTouchPrecision, finishPoly, flash, flashHolding,
  hitPart, modelerTouchDistances, report, reportOpen, showPickList,
  strokeSlotOutline,
} from "./drawing_sheet_touch.js";
import {
  drawSketch, drawingDocument, drawingHintText, drawingSheet, fitSplitPreview,
  invalidateDrawing, sampleSplinePoints, sketchUvPolylines, splineLength,
  syncSheetPanel,
} from "./drawing_sheet_render.js";
import {
  sheetForm, sheetPrompt, sheetRow, sheetSelect,
} from "./drawing_sheet_forms.js";

/* ================= drawing sheet =================
   The drafting table lives in modeler_drawing.js; everything here is the wiring
   it needs from the editor — the triangles to project, the document to write
   into, undo, and the little dialogs it borrows. */
/* The viewport rounds a box's edges because a solid with a highlight along its
   arris reads as an object rather than as raw CGI. A drawing is a measured
   document: its corners have to be the corners the topology names, or a
   dimension picked on one binds to nothing (the fillet pushes the projected
   corner ~1.1 cm — 5.6% of a 20 cm part — off the sharp vertex). This flag is
   the ONE point where the two diverge: set only around drawingBodies(), so the
   sheet projects the sharp body and the preview the user orbits keeps its
   rounding. */
var sheetSharpSolids = false;

/* One body's world-space triangles. Read from the very geometry the viewport
   builds, so the sheet is a projection of the model the user can see and not a
   second interpretation of the same parameters. */
function meshWorldTriangles(mesh) {
  var geometry = mesh.geometry, attribute = geometry && geometry.attributes && geometry.attributes.position;
  if (!attribute) return [];
  var index = geometry.index, count = index ? index.count : attribute.count;
  if (count < 3) return [];
  var out = new Float64Array(count * 3), point = new THREE.Vector3();
  for (var i = 0; i < count; i++) {
    var at = index ? index.getX(i) : i;
    point.set(attribute.getX(at), attribute.getY(at), attribute.getZ(at)).applyMatrix4(mesh.matrixWorld);
    out[i * 3] = point.x; out[i * 3 + 1] = point.y; out[i * 3 + 2] = point.z;
  }
  return out;
}

/* The whole document as triangle soups, one per body. Ordinary parts use the
   same dependency-free tessellator as export, including exact meshData when
   present. Assemblies and transformed instances still build a detached Three
   group so their placed triangles can be read in world coordinates. */
var configuredNativeOwner=null;
var configuredNativeCache=createNativeConfiguredDrawingCache({onChange:function(owner){
  if(E.docType==='part'&&E.def===owner){invalidateDrawing();if(E.mode==='drawing'){drawSketch();syncSheetPanel();}}
}});
function nativeDrawingOwner() {
  if(configuredNativeOwner!==E.def){if(configuredNativeOwner)configuredNativeCache.cancel(configuredNativeOwner);configuredNativeOwner=E.def;}
  return E.def;
}
function configuredDrawingStatus(view) {
  if(E.docType!=='part')return null;
  var owner=nativeDrawingOwner(),id=configuredViewId(owner,view);
  if(!id)return null;
  return configuredNativeCache.state(owner,id);
}
function configuredDrawingBodies(view,bodies) {
  if(E.docType!=='part')return bodies;
  var owner=nativeDrawingOwner(),id=configuredViewId(owner,view);if(!id)return bodies;
  var state=configuredNativeCache.state(owner,id);
  if(state.status==='ready')return configuredBodyAppearance(owner,state.bodies);
  if(state.status==='missing')configuredNativeCache.request(owner,id).catch(function(){});
  return [];
}
function configuredTopologyAllowed(view) {
  return E.docType!=='part'||!configuredViewId(E.def,view);
}

// Per-view sources store only a library reference. Several views of the same
// model share its tessellation until the loaded library changes.
let sourceRevision = -1;
const sourceEntries = new Map();
function drawingHostIs(source) {
  const owner = E.docType === 'assembly' ? E.assembly : E.def;
  return E.docType === source.kind && owner?.key === source.key;
}
function resolveDrawingViewSource(view) {
  const owner = E.docType === 'assembly' ? E.assembly : E.def;
  const source = effectiveViewSource(owner?.drawing, view);
  if (!source || drawingHostIs(source)) return { status: 'host' };
  const revision = modelLibraryRevision();
  if (sourceRevision !== revision) {
    sourceEntries.clear();
    sourceRevision = revision;
  }
  const id = source.kind + ':' + source.key;
  if (!sourceEntries.has(id)) {
    const record = readLibrarySource(source);
    const name = record?.name || source.name || source.key;
    sourceEntries.set(id, { status: record ? 'ready' : 'missing', source, record, name, bodies: record ? null : [] });
  }
  return sourceEntries.get(id);
}
function drawingSourceBodies(resolved){
  if(!resolved.bodies){
    try{
      resolved.bodies=resolved.source.kind==='part'?savedPartDrawingBodies(resolved.record)
        :assemblySourceBodies(resolved.record,{bodiesOf:savedPartDrawingBodies});
    }catch(error){resolved.bodies=[];resolved.error=String(error&&error.message||error);}
  }
  return resolved.bodies;
}
function assemblyForDrawingSource(resolved) {
  return resolved.status === 'host' ? (E.docType === 'assembly' ? E.assembly : null)
    : resolved.source.kind === 'assembly' ? resolved.record : null;
}

// Cache the copied occurrence tree and triangles once per model revision and
// saved presentation. Several projections can then share one set of bodies.
const assemblyPoses = new WeakMap();
function explicitDrawingPose(view, resolved = resolveDrawingViewSource(view)) {
  if (!view) return null;
  const doc = (E.docType === 'assembly' ? E.assembly : E.def)?.drawing;
  const state = viewSourceOwner(doc, view)?.assemblyState;
  const assembly = state && assemblyForDrawingSource(resolved);
  if (!assembly) return null;
  let cache = assemblyPoses.get(assembly);
  if (!cache || cache.token !== E.sheetToken || cache.revision !== modelLibraryRevision()) {
    cache = {token:E.sheetToken, revision:modelLibraryRevision(), states:new Map()};
    assemblyPoses.set(assembly, cache);
  }
  if (!cache.states.has(state)) cache.states.set(state, {assembly:drawingAssemblyPose(assembly,state)});
  return cache.states.get(state);
}

function drawingViewBodies(view,bodies){
  var resolved=resolveDrawingViewSource(view);
  const pose = explicitDrawingPose(view, resolved);
  if (pose) {
    if (!pose.assembly) return [];
    if (!pose.bodies) {
      try {
        if (resolved.status === 'host') pose.bodies = drawingBodies(pose.assembly);
        else {
          pose.lines = [];
          pose.bodies = assemblySourceBodies(pose.assembly, {bodiesOf:savedPartDrawingBodies, includeOffsets:true, lines:pose.lines});
        }
      } catch (error) { pose.error = error.message; pose.bodies = []; }
    }
    return pose.bodies;
  }
  return resolved.status==='host'?configuredDrawingBodies(view,bodies):drawingSourceBodies(resolved);
}
function savedPartDrawingBodies(def) {
  return partSourceBodies(def, activeParts(def), savedPartMeshBodies);
}
function savedPartMeshBodies(part) {
  const group = new THREE.Group(), meshes = [];
  sheetSharpSolids = true;
  try {
    buildPart(group, part, 'solid');
    group.updateMatrixWorld(true);
    group.traverse(mesh => {
      if (!mesh.isMesh || mesh.userData.cadOverlay || mesh.userData.cadInterference != null) return;
      const positions = meshWorldTriangles(mesh);
      if (positions.length) meshes.push({ id: mesh.userData.cadPart || mesh.uuid, positions });
    });
    return meshes;
  } finally {
    sheetSharpSolids = false;
    clearGroup(group);
  }
}
function drawingViewSourceToken(view){
  var resolved=resolveDrawingViewSource(view);
  return resolved.status==='host'?'':resolved.source.kind+':'+resolved.source.key+'#'+resolved.status+'#'+sourceRevision;
}
function drawingViewSourceIssue(view){
  var resolved=resolveDrawingViewSource(view);
  const pose = explicitDrawingPose(view, resolved);
  if (pose && !pose.assembly) return 'Saved exploded view is missing';
  if (pose) return pose.error || (pose.bodies?.length ? null : "Assembly view has no visible geometry");
  if(resolved.status==='missing')return 'Source model not in library: '+resolved.name;
  if(resolved.status==='ready'&&!drawingSourceBodies(resolved).length)return resolved.error?'Source model failed: '+resolved.error:'Source model has no visible bodies: '+resolved.name;
  return null;
}
function drawingTopologyAllowed(view){
  return configuredTopologyAllowed(view)&&resolveDrawingViewSource(view).status==='host';
}
function drawingSourceChoices(){
  return listLibrarySources().filter(source => !drawingHostIs(source))
    .sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'part' ? -1 : 1);
}
async function prepareConfiguredDrawingExport() {
  if(E.docType!=='part'||!E.def?.drawing)return;
  var owner=nativeDrawingOwner(),history=currentHistoryNode(),views=owner.drawing.views;
  var ids=views.map(function(v){return configuredViewId(owner,v);}).filter(Boolean);if(!ids.length)return;
  if((owner.drawing.dims||[]).some(function(d){return d.modelItem||d.coneAngle||d.refs?.some(function(r){return r.pid||r.pid2;});}))
    throw new Error('Named configuration drawing geometry is native; associative dimensions require per-view topology and are unsupported on this sheet');
  var key=JSON.stringify(views),assertCurrent=function(){if(E.def!==owner||currentHistoryNode()!==history||JSON.stringify(owner.drawing.views)!==key)throw new Error('Drawing changed while preparing native configurations; retry export');};
  await configuredNativeCache.prepare(owner,views,{assertCurrent});assertCurrent();drawingSheet().invalidate();
}
function drawingBodies(assembly = E.assembly) {
  var parts = renderedParts(E.def);
  /* Most part drawings need only the body's triangle soup. Rebuilding an
     entire Three scene here also creates edge-pick and appearance overlays,
     then disposes them while the WebGPU viewport is swapping away. Exact
     meshData already is the authoritative solid, so take it directly. Keep
     the scene path for assemblies and transformed part instances. */
  if (E.docType === "part" && parts.every(function(part){return !partPatternRotations(part).length;})) {
    var direct = tessellateParts(parts);
    if (direct.length === parts.length) return direct.map(function(body,index){
      var exactBounds=parts[index].meshData?.exactBounds;
      var ribMissing=parts.length===1 && !body.sectionRibs?.length && !body.sectionRibIssue && (E.def.features || []).some(function(feature){return feature.type==='rib'&&!feature.suppressed;});
      return {...body,...(exactBounds?{exactBounds}:{}),...(ribMissing?{sectionRibIssue:'Rebuild the part to prepare longitudinal rib hatch exclusion'}:{})};
    });
  }
  if (!threeLoaded() || typeof THREE === "undefined" || !THREE.Group) return tessellateParts(parts);
  var group = new THREE.Group(), bodies = [];
  sheetSharpSolids = true;
  try {
    if (E.docType === "assembly" && assembly) buildAssembly(group, assembly);
    else renderedParts(E.def).forEach(function (part) { buildPart(group, part, "solid"); });
    group.updateMatrixWorld(true);
    group.traverse(function (object) {
      if (!object.isMesh || object.userData.cadOverlay || object.userData.cadInterference != null) return;
      var positions = meshWorldTriangles(object);
      if (positions.length >= 9) {
        var occurrencePath=[],ancestor=object,component=null;
        while(ancestor){
          component ||= ancestor._cadExplodeComponent;
          var occurrenceId=ancestor.userData?.cadComponent??ancestor.userData?.cadSubComponent;
          if(occurrenceId!=null)occurrencePath.unshift(String(occurrenceId));
          ancestor=ancestor.parent;
        }
        var partId=object.userData.cadPart || object.uuid;
        var body = { id: occurrencePath.length?occurrencePath.join('/')+':'+partId:partId, positions: positions };
        const def = component ? component.def || readLibrarySource({kind:'part',key:component.modelKey}) : E.def;
        const mesh = def?.parts?.find(p => p.id === object.userData.cadPart && !p.exactPending)?.meshData;
        if (mesh?.exactBounds || mesh?.sectionRibs || mesh?.sectionRibIssue) {
          const m = object.matrixWorld.elements;
          const matrix = [m[0],m[4],m[8],m[1],m[5],m[9],m[2],m[6],m[10]];
          body = placeDrawingBody({ id:body.id, exactBounds:mesh.exactBounds, sectionRibs:mesh.sectionRibs,
            sectionRibIssue:mesh.sectionRibIssue }, matrix, {x:m[12],y:m[13],z:m[14]}, positions);
        }
        bodies.push(body);
      }
    });
  } catch (error) {
    bodies = [];
  } finally {
    sheetSharpSolids = false;
    clearGroup(group);
  }
  return bodies.length ? bodies : tessellateParts(renderedParts(E.def));
}

/* The named geometry the sheet's dimensions bind to: the same persistent ids
   the feature tree, the fillet overrides and the mates already use, so a
   dimension survives a rebuild for exactly the reasons they do — and dangles
   for exactly the reasons they lose a reference. Triangles alone carry no
   identity, which is why this is a second provider and not a field on one. */
function drawingTopology() {
  /* An assembly's bodies come from component documents whose topology is not
     ours to index; offering an empty one would dangle every bound dimension on
     a sheet whose references are all still there. Absent is not lost. */
  if (E.docType === "assembly") return null;
  var out = [];
  try {
    renderedParts(E.def).forEach(function (part) {
      var entries = topologyEntriesForPart(part);
      if (entries && entries.length) out = out.concat(entries);
    });
  } catch (error) { return null; }
  return out.length ? out : null;
}

/* The form where a window.prompt() used to be, resolved as a promise so the
   sheet's tools can await an answer without freezing the page. One field or
   several — a dimension is edited as its displayed value AND its own
   tolerance, which is one decision and so one dialog. */
async function documentPresetAction(action) {
  try {
    if(E.contextEdit)throw new Error('Finish component editing before choosing document defaults');
    const type=E.docType,owner=type==='assembly'?E.assembly:E.def,node=currentHistoryNode(),kind=type==='assembly'?'assembly-template':'part-template';
    const unchanged=function(){if(E.docType!==type||(type==='assembly'?E.assembly:E.def)!==owner||currentHistoryNode()!==node)throw new Error('Document changed while choosing template; retry');};
    if(action==='properties') {
      const properties=documentDefaults(owner),choices=values=>values.map(value=>({value,label:value}));
      const answer=await sheetForm('Document properties',[
        {key:'lengthUnit',label:'Length unit',type:'select',value:properties.lengthUnit,choices:choices(['mm','cm','m','in','ft'])},
        {key:'massUnit',label:'Mass unit',type:'select',value:properties.massUnit,choices:choices(['g','kg','lb'])},
        {key:'draftingStandard',label:'Drafting standard',type:'select',value:properties.draftingStandard,choices:choices(['ANSI','ISO'])},
        {key:'projection',label:'Default drawing projection',type:'select',value:properties.projection,choices:choices(['first','third'])},
        {key:'lengthPrecision',label:'Length decimal places',type:'number',value:properties.lengthPrecision},
        {key:'anglePrecision',label:'Angle decimal places',type:'number',value:properties.anglePrecision},
        {key:'dualDimensions',label:'Default dual drawing dimensions',type:'boolean',value:properties.dualDimensions},
      ],'Document input units and defaults for new drawings. Existing geometry and existing drawings retain their values.');
      if(!answer)return;unchanged();
      const defaults=validateDocumentDefaults({...answer,angleUnit:'deg',lengthPrecision:Number(answer.lengthPrecision),anglePrecision:Number(answer.anglePrecision)});
      pushUndo('Edit document properties');const current=type==='assembly'?E.assembly:E.def;
      Object.assign(current,applyDocumentDefaults(current,defaults));syncHead();refreshAll();return;
    }
    const records=loadDocumentPresets(localStorage).filter(r=>r.kind===kind);
    if(action==='capture') {
      const defaults=documentDefaults(owner),suggested=(type==='assembly'?'ASM':'PART')+(defaults.lengthUnit==='in'?'-IN-ANSI':'-MM-ISO');
      const answer=await sheetForm('Save '+type+' template',[{key:'name',label:'Local template name',value:suggested}],
        'Captures document units, drafting standard and precision. CAD, sketches, mates, materials, drawings and source identities are excluded.');
      if(!answer)return;unchanged();const previous=records.find(r=>r.name===String(answer.name).trim());
      saveDocumentPreset(localStorage,captureDocumentPreset(owner,{id:previous?.id||crypto.randomUUID(),name:answer.name,kind}));flash('Local '+type+' template saved');return;
    }
    if(!records.length)throw new Error('Save a '+type+' template first');
    const answer=await sheetForm('New from '+type+' template',[{key:'preset',label:'Saved local template',type:'select',value:records[0].id,choices:records.map(r=>({value:r.id,label:r.name}))}],
      'Creates an independent blank document from settings only. Existing saved documents remain unchanged.');
    if(!answer)return;unchanged();const record=records.find(r=>r.id===answer.preset);if(!record)throw new Error('Document template was not found');await newModel(record);
  } catch(error){flash(error.message);}
}

async function drawingPresetAction(action) {
  try {
    if(E.docType!=='part')throw new Error('Drawing presets currently apply to part drawing documents');
    const doc=drawingDocument(),owner=E.def,history=currentHistoryNode();
    const unchanged=function(){if(E.def!==owner||currentHistoryNode()!==history||drawingDocument()!==doc)throw new Error('Document changed while choosing drawing preset; retry');};
    if(action==='saveformat'||action==='savetemplate') {
      const kind=action==='saveformat'?'sheet-format':'drawing-template';
      const answer=await sheetForm(kind==='sheet-format'?'Save sheet format':'Save drawing template',[
        {key:'name',label:'Local preset name',value:kind==='sheet-format'?'MY-A-FORMAT':doc.units==='in'?'A-IN-ANSI':'A-MM-ISO'},
        {key:'paperArt',label:'Include independent paper notes and geometry',type:'boolean',value:false},
      ],'Captures company, author, general tolerance and embedded logos. Model views, dimensions and CAD are excluded. Templates also capture paper and drafting defaults.');
      if(!answer)return;unchanged();
      const records=loadDrawingPresets(localStorage),previous=records.find(r=>r.kind===kind&&r.name===String(answer.name).trim());
      const record=captureDrawingPreset(doc,{id:previous?.id||crypto.randomUUID(),name:answer.name,kind,includePaperArt:answer.paperArt});
      saveDrawingPreset(localStorage,record);flash('Local '+(kind==='sheet-format'?'sheet format':'drawing template')+' saved');return;
    }
    const kind=action==='applyformat'?'sheet-format':'drawing-template',records=loadDrawingPresets(localStorage).filter(r=>r.kind===kind);
    if(!records.length)throw new Error('Save a '+(kind==='sheet-format'?'sheet format':'drawing template')+' first');
    const answer=await sheetForm(action==='applyformat'?'Apply sheet format':'New from drawing template',[
      {key:'preset',label:'Saved local preset',type:'select',value:records[0].id,choices:records.map(r=>({value:r.id,label:r.name}))},
    ],action==='applyformat'?'Matching paper required. Preserves all existing model views, dimensions and CAD. Replaces only previously applied format-owned paper content.':'Creates a new blank Drawing from saved defaults and format. Existing saved model remains unchanged.');
    if(!answer)return;unchanged();const record=records.find(r=>r.id===answer.preset);if(!record)throw new Error('Drawing preset was not found');
    if(action==='newtemplate'){await newModel(record);return;}
    const next=applyDrawingFormat(doc,record);pushUndo('Apply sheet format');E.def.drawing=next;drawingSheet().invalidate();
    refreshAll();flash('Sheet format applied; source views, dimensions and CAD preserved');
  } catch(error){flash(error.message);}
}

/* Evaluate results (mass, standards, interference, BOM) and the failures that
   have to be read word for word. These used to be native `alert()`s, which
   block the event loop — the WebGPU viewport freezes mid-frame behind them —
   and look nothing like the rest of the editor. Same dialog chrome as the
   reference picker; Esc and the backdrop dismiss it. */
var reportOpener = null;
function set_reportOpener(value) { return reportOpener = value; }

/* A flashed message owns #mdHint for as long as it is on screen. It has to say
   so, because almost every command ends in refreshAll() -> syncTools() ->
   syncHint(), and syncHint rewrites that same element from the active tool —
   so the answer to "what did that command do?" was being overwritten in the
   same tick it was written. syncHint honours FLASH_MS, which is why callers no
   longer have to flash after the refresh. */
var FLASH_MS = 1800;

var profileMemo = { sketch: null, key: 0, value: null };

var regionMemo = { sketch:null, key:0, scope:"", value:null };

var featureAreaMemo = { sketch:null, key:0, scope:"", value:null };

export {
  closeReport, closedSketchProfile, documentPresetAction, drawSketch,
  drawingDocument, drawingHintText, drawingSheet, extrudeClosedSketch,
  extrusionSketchAreas, featureAreaAt, finishPoly, fitSplitPreview, flash,
  flashHolding, hitPart, invalidateDrawing, modelerTouchDistances,
  newSketchPoint, prepareConfiguredDrawingExport, report, reportOpen,
  sampleSplinePoints, sheetForm, sheetPrompt, sheetRow, sheetSelect,
  sheetSharpSolids, showPickList, sketchFeatureAreas, sketchLinePoints,
  sketchProfileAnalysis, sketchRegionAnalysis, sketchUvPolylines,
  snappedSketchPoint, splineLength, syncSheetPanel, toggleFeatureArea,
};
// for js/modeler/drawing_sheet_profiles.js (live bindings: it sees every reassignment)
export { featureAreaMemo, profileMemo, regionMemo };
// for js/modeler/drawing_sheet_touch.js (live bindings: it sees every reassignment)
export { FLASH_MS, reportOpener, set_reportOpener };
// for js/modeler/drawing_sheet_render.js (live bindings: it sees every reassignment)
export {
  configuredDrawingStatus, drawingBodies, drawingPresetAction,
  drawingTopology, drawingTopologyAllowed, drawingViewBodies,
  drawingViewSourceIssue, drawingViewSourceToken, explicitDrawingPose,
  resolveDrawingViewSource,
};
// for js/modeler/drawing_sheet_forms.js (live bindings: it sees every reassignment)
export { assemblyForDrawingSource, drawingHostIs, drawingSourceChoices };
