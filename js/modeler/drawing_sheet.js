/* The CAD editor's drawing-sheet wiring, split out of js/modeler.js. It
   shares the editor's state through live imports from ../modeler.js. */
import { drawingMaterialName } from "../cad_appearances.js";
import { assemblyHasExplodedOffsets } from "../cad_exploded_view.js";
import { SHEET_SIZES, STANDARD_SCALES, defaultViewLabel, ensureSheetDoc, scaleLabel } from "../cad_sheet.js";
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
import { dynDrawHud, pointToLineDistance } from "../modeler/dimension_entry.js";
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
import {
  E, H, activeParts, activeSketchFrame, addOverlayPolyline, addPart, applyCut,
  assemblyDrawingBOMRows, assemblyDrawingBalloonTargets, assemblyExplodeLines,
  authoritativeFinishTopology, axisOfView, btn, buildAssembly, buildPart,
  currentHistoryNode, cutSkipNote, cutTargetFeatureId, defBounds, el,
  fitPreview, hitSketch, instanceLabels, invalidatePartMeshAfterEdit,
  invalidateSketchProjection, isCanonicalAuthoring, mergeTargetBody,
  modelLengthUnit, namedButton, newModel, openQuickForm, partUV,
  pathSketchSpline, pathUvCircleArc, pathUvEllipse, planeAxis,
  positiveArcSweep, pushUndo, queueExactMesh, refreshAll, refusalHint,
  regenerateExactModel, renderedParts, root, sameSketchContext,
  scheduleExactMesh, scheduleModelerDraft, selEntities, selectedSolid,
  setPanelCollapsed, setTab, sizeSketch, sketchOpenPathReadiness,
  sketchProjection, standardPlaneFrame, strokeUvCircle, strokeUvRect,
  syncContextActions, syncHead, syncStatus, syncTools, toPx,
  topologyEntriesForPart,
} from "../modeler.js";

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
async function prepareConfiguredDrawingExport() {
  if(E.docType!=='part'||!E.def?.drawing)return;
  var owner=nativeDrawingOwner(),history=currentHistoryNode(),views=owner.drawing.views;
  var ids=views.map(function(v){return configuredViewId(owner,v);}).filter(Boolean);if(!ids.length)return;
  if((owner.drawing.dims||[]).some(function(d){return d.modelItem||d.coneAngle||d.refs?.some(function(r){return r.pid||r.pid2;});}))
    throw new Error('Named configuration drawing geometry is native; associative dimensions require per-view topology and are unsupported on this sheet');
  var key=JSON.stringify(views),assertCurrent=function(){if(E.def!==owner||currentHistoryNode()!==history||JSON.stringify(owner.drawing.views)!==key)throw new Error('Drawing changed while preparing native configurations; retry export');};
  await configuredNativeCache.prepare(owner,views,{assertCurrent});assertCurrent();drawingSheet().invalidate();
}
function drawingBodies() {
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
    if (E.docType === "assembly" && E.assembly) buildAssembly(group);
    else renderedParts(E.def).forEach(function (part) { buildPart(group, part, "solid"); });
    group.updateMatrixWorld(true);
    group.traverse(function (object) {
      if (!object.isMesh || object.userData.cadOverlay || object.userData.cadInterference != null) return;
      var positions = meshWorldTriangles(object);
      if (positions.length >= 9) {
        var occurrencePath=[],ancestor=object;
        while(ancestor){var occurrenceId=ancestor.userData?.cadComponent??ancestor.userData?.cadSubComponent;if(occurrenceId!=null)occurrencePath.unshift(String(occurrenceId));ancestor=ancestor.parent;}
        var partId=object.userData.cadPart || object.uuid;
        var body = { id: occurrencePath.length?occurrencePath.join('/')+':'+partId:partId, positions: positions };
        var part = renderedParts(E.def).find(function(candidate){return candidate.id===object.userData.cadPart;});
        var exactBounds = part && part.meshData && part.meshData.exactBounds;
        var matrix = object.matrixWorld.elements;
        // An axis-aligned (including quarter-turn) transform preserves exact
        // AABB extrema. General rotations need directional kernel bounds.
        var aligned = [0,1,2].every(function(row){return [0,1,2].filter(function(col){return Math.abs(matrix[col*4+row])>1e-9;}).length===1;});
        if (exactBounds && aligned && E.docType !== "assembly") {
          body.exactBounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
          [0,1].forEach(function(x){[0,1].forEach(function(y){[0,1].forEach(function(z){
            var corner=new THREE.Vector3(x?exactBounds.max.x:exactBounds.min.x,y?exactBounds.max.y:exactBounds.min.y,z?exactBounds.max.z:exactBounds.min.z).applyMatrix4(object.matrixWorld);
            ["x","y","z"].forEach(function(axis){body.exactBounds.min[axis]=Math.min(body.exactBounds.min[axis],corner[axis]);body.exactBounds.max[axis]=Math.max(body.exactBounds.max[axis],corner[axis]);});
          });});});
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

async function chooseDrawingProjectImage() {
  const answer=await sheetForm('Insert project image',[
    {key:'url',label:'Project image URL',type:'text',value:''},
  ],'Use an app-served same-origin static PNG/JPEG asset. Pixels are embedded; external and file URLs are unsupported.',{drawingOnly:true});
  if(!answer)return null;
  return importDrawingProjectImage(answer.url);
}

function chooseDrawingImage() {
  return new Promise(function(resolve,reject){
    if(!root){resolve(null);return;}
    var input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg';input.hidden=true;
    var settled=false;
    function finish(value,error){if(settled)return;settled=true;input.remove();if(error)reject(error);else resolve(value);}
    input.addEventListener('cancel',function(){finish(null);},{once:true});
    input.addEventListener('change',function(){decodeDrawingImage(input.files&&input.files[0]).then(function(asset){finish(asset);},function(error){finish(null,error);});},{once:true});
    root.appendChild(input);input.click();
  });
}

function sheetForm(title, fields, hint, options={}) {
  return new Promise(function (resolve) {
    if (!root) { resolve(null); return; }
    root.classList.add("md-sheet-form");
    var settled = false;
    var finish = function (answer) {
      if (settled) return;
      settled = true;
      root.classList.remove("md-sheet-form");
      resolve(answer);
    };
    var opened = openQuickForm({
      action: "sheetprompt",
      drawingOnly:!!options.drawingOnly,
      icon: "ph-note-pencil",
      title: title,
      hint: hint || fields.map(function (field) { return field.hint; }).filter(Boolean)[0] || t("drawNoteHint"),
      fields: fields.map(function (field) {
        return { key: field.key, label: field.label || title, type: field.type === "checkbox" ? "boolean" : ["boolean","select","textarea"].includes(field.type) ? field.type : "text", choices:field.choices, value: field.value ?? "" };
      }),
      onApply: function (values) {
        var answer = {};
        fields.forEach(function (field) { answer[field.key] = ["boolean","checkbox"].includes(field.type) ? !!values[field.key] : String(values[field.key] || "").trim(); });
        finish(answer);
      },
      onCancel: function () { finish(null); },
    });
    if (!opened) finish(null);
  });
}

function sheetPrompt(title, value) {
  return sheetForm(title, [{ key: "text", label: title, value: value }]).then(function (answer) {
    return answer ? answer.text : null;
  });
}

/* ---- the sheet panel ----
   Drawing mode hides the feature tree and the inspector — neither says anything
   about a sheet — and puts the drafting document's own properties in their
   place: the paper, the views on it, and the title block. Built once and then
   only updated, so a field being typed into is never rebuilt underneath the
   caret. */
function sheetRow(host, label, control) {
  var row = el("label", "md-sheet-row", "<span>" + label + "</span>");
  row.appendChild(control);
  host.appendChild(row);
  return control;
}

function sheetSelect(options, value, onChange) {
  var select = el("select", "");
  options.forEach(function (option) {
    var node = el("option", "", option.label);
    node.value = option.value;
    select.appendChild(node);
  });
  select.value = value;
  select.addEventListener("change", function () { onChange(select.value); });
  return select;
}

function sheetToggle(host, label, checked, onChange) {
  var row = el("label", "md-sheet-check");
  var box = el("input", "");
  box.type = "checkbox";
  box.checked = !!checked;
  box.addEventListener("change", function () { onChange(box.checked); });
  row.appendChild(box);
  row.appendChild(el("span", "", label));
  host.appendChild(row);
  return box;
}

function sheetGroup(host, title, defaultOpen, key) {
  var group = el("details", "md-sheet-group");
  if(key)group.setAttribute('data-sheet-group',key);
  group.open = defaultOpen !== false;
  group.appendChild(el("summary", "", title));
  var body = el("div", "md-sheet-group-body");
  group.appendChild(body);
  host.appendChild(group);
  return body;
}

/* Field values are written straight into the document as you type; the undo
   entry is opened once per visit to a field, so backing out of a title block
   edit does not cost twenty undos. */
function bindTitleField(input, key) {
  var opened = false;
  input.addEventListener("focus", function () { opened = false; });
  input.addEventListener("input", function () {
    if (!opened) { pushUndo(t("opSheetTitle")); opened = true; }
    var doc = drawingDocument();
    doc.title[key] = input.value;
    drawSketch();
  });
}

function bindTitleSource(picker, key, host) {
  picker.addEventListener("change", function () {
    pushUndo(t("opSheetTitle"));
    setSheetTitleSource(drawingDocument(), key, picker.value);
    drawSketch();buildSheetPanel(host);
  });
}

function buildSheetPanel(host) {
  var doc = drawingDocument(), sheet = drawingSheet();
  var owner=E.docType==='assembly'?E.assembly:E.def,ownerIdentity=owner?.key||owner?.id||owner;
  var sameOwner=host._sheetPanelOwner===ownerIdentity&&host._sheetPanelOwnerType===E.docType;
  var groupState=new Map(),scrollTop=sameOwner&&Number.isFinite(host.scrollTop)?Math.max(0,host.scrollTop):0;
  if(sameOwner)host.querySelectorAll('[data-sheet-group]').forEach(function(group){groupState.set(group.getAttribute('data-sheet-group'),group.open);});
  host.innerHTML = "";
  var head = el("div", "md-sheet-head");
  head.innerHTML = '<i class="ph ph-file-dashed"></i><b>' + t("sheetSetup") + "</b>";
  var headActions = el("div", "md-sheet-head-actions");
  var collapseBtn = namedButton(btn('<i class="ph ph-sidebar-simple"></i>', function () {
    setPanelCollapsed("right", true);
  }, "md-sheet-icon"), t("collapsePanel") || "Collapse");
  headActions.appendChild(collapseBtn);
  head.appendChild(headActions);
  host.appendChild(head);

  /* A dangling dimension is drawn in red on the paper, but the paper may be
     scrolled away from it — so the sheet panel is where it can be acted on. */
  var dangling = el("div", "md-sheet-dangling");
  dangling.id = "mdSheetDangling";
  dangling.hidden = true;
  host.appendChild(dangling);

  var setup = sheetGroup(host, t("sheetSetup"),true,'setup');
  sheetRow(setup, t("sheetSize"), sheetSelect(Object.keys(SHEET_SIZES).map(function (key) {
    return { value: key, label: SHEET_SIZES[key].label + "  " + Math.round(SHEET_SIZES[key].w) + "×" + Math.round(SHEET_SIZES[key].h) };
  }), doc.size, function (value) { sheet.setSheetOption("size", value); drawSketch(); })).id = "mdSheetSize";
  sheetRow(setup, t("sheetOrientation"), sheetSelect([
    { value: "landscape", label: t("sheetLandscape") }, { value: "portrait", label: t("sheetPortrait") },
  ], doc.orientation, function (value) { sheet.setSheetOption("orientation", value); drawSketch(); })).id = "mdSheetOrientation";
  sheetRow(setup, t("sheetScale"), sheetSelect([{ value: "fit", label: t("sheetScaleFit") }].concat(
    STANDARD_SCALES.map(function (scale) { return { value: scale.join(":"), label: scaleLabel(scale) }; })
  ), doc.scale === "fit" ? "fit" : scaleLabel(doc.scale).replace(":", ":"), function (value) {
    sheet.setSheetOption("scale", value === "fit" ? "fit" : value.split(":").map(Number));
    drawSketch();
  })).id = "mdSheetScale";
  sheetRow(setup, t("sheetUnits"), sheetSelect([
    { value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m" }, { value: "in", label: "in" },
  ], doc.units, function (value) { sheet.setSheetOption("units", value); drawSketch(); })).id = "mdSheetUnits";
  if(E.docType==='assembly'&&E.assembly){
    setup.appendChild(btn('Auto component balloons',function(){sheet.autoComponentBalloons();drawSketch();},'md-sheet-btn'));
    sheetRow(setup,t('drawingBOMScope'),sheetSelect([{value:'partsOnly',label:t('drawingBOMPartsOnly')},{value:'indented',label:t('drawingBOMIndented')}],E.assembly.drawingSettings?.bomScope==='indented'?'indented':'partsOnly',function(value){
      pushUndo(t('opSheetSetup'));E.assembly.drawingSettings ||= {};E.assembly.drawingSettings.bomScope=value==='indented'?'indented':'partsOnly';
      sheet.invalidate();drawSketch();syncHead();
    })).id='mdSheetBOMScope';
  }
  sheetRow(setup,t("sheetDraftingStandard"),sheetSelect([{value:"custom",label:t("sheetCustomStandard")},{value:"ANSI",label:"ANSI · inch / third angle"},{value:"ISO",label:"ISO · mm / first angle"}],doc.draftingStandard||"custom",function(value){
    sheet.setSheetOption("draftingStandard",value);
    /* A drawing's drafting convention and display units are independent of
       the part's modelling units. ANSI style is also used for MMGS parts; do
       not silently turn their sketches into inches when the sheet is styled. */
    drawSketch();
  })).id="mdSheetStandard";
  sheetRow(setup,t("sheetSecondaryUnits"),sheetSelect([{value:"",label:t("sheetNoSecondary")},...["mm","cm","m","in"].map(value=>({value,label:value}))],doc.secondaryUnits||"",function(value){sheet.setSheetOption("secondaryUnits",value);drawSketch();})).id="mdSheetSecondaryUnits";
  sheetRow(setup,t("sheetSecondaryPrecision"),sheetSelect([0,1,2,3,4,5,6].map(value=>({value:String(value),label:String(value)})),String(doc.secondaryPrecision??2),function(value){sheet.setSheetOption("secondaryPrecision",value);drawSketch();})).id="mdSheetSecondaryPrecision";
  sheetRow(setup,t("sheetPrecision"),sheetSelect([{value:"auto",label:t("sheetPrecisionAuto")},...[0,1,2,3,4,5,6].map(value=>({value:String(value),label:String(value)}))],Number.isInteger(doc.precision)?String(doc.precision):"auto",function(value){sheet.setSheetOption("precision",value);drawSketch();})).id="mdSheetPrecision";
  sheetToggle(setup,t("sheetTrailingZeros"),doc.trailingZeros??Number.isInteger(doc.precision),function(on){sheet.setSheetOption("trailingZeros",on);drawSketch();}).id="mdSheetTrailingZeros";
  sheetRow(setup, t("sheetProjection"), sheetSelect([
    { value: "third", label: t("sheetThirdAngle") }, { value: "first", label: t("sheetFirstAngle") },
  ], doc.projection, function (value) { sheet.setSheetOption("projection", value); drawSketch(); })).id = "mdSheetProjection";
  sheetToggle(setup, t("drawHiddenLines"), doc.showHidden !== false, function (on) { sheet.setSheetOption("showHidden", on); drawSketch(); syncTools(); }).id = "mdSheetHiddenBox";
  sheetToggle(setup, t("sheetShowCenters"), doc.showCenters !== false, function (on) { sheet.setSheetOption("showCenters", on); drawSketch(); }).id = "mdSheetCentersBox";
  sheetToggle(setup, t("sheetShowZones"), doc.showZones !== false, function (on) { sheet.setSheetOption("showZones", on); drawSketch(); }).id = "mdSheetZonesBox";
  setup.appendChild(btn('<i class="ph ph-layout"></i> ' + t("sheetRelayout"), function () { sheet.relayout(); drawSketch(); }, "md-sheet-btn"));
  /* Callouts are read off the feature tree, never typed: the button is here
     rather than in the tool row because it annotates every hole at once. */
  setup.appendChild(btn('<i class="ph ph-crosshair"></i> ' + t("sheetHoleCallouts"), function () { sheet.addHoleCallouts(); drawSketch(); }, "md-sheet-btn"));
  setup.appendChild(btn('<i class="ph ph-ruler"></i> ' + t("drawModelItems"), function () { sheet.insertModelItems(); drawSketch(); }, "md-sheet-btn"));

  var views = sheetGroup(host, t("sheetViews"),true,'views');
  var list = el("div", "md-sheet-views");
  doc.views.forEach(function (view) {
    var selection = sheet.selection();
    var row = el("div", "md-sheet-view" + (selection && selection.kind === "view" && selection.id === view.id ? " on" : ""));
    var name = btn('<i class="ph ph-frame-corners"></i><span>' + (view.label || view.dir) + (sectionHatchCaption(view) ? " · " + sectionHatchCaption(view) : "") + "</span><small>" +
      scaleLabel(sheet.scene().views.find(function (placed) { return placed.id === view.id; })?.scale || view.scale || sheet.scene().scale) + "</small>", function () {
      sheet.select({ kind: "view", id: view.id });
    }, "md-sheet-view-name");
    row.appendChild(name);
    var nativeState=configuredDrawingStatus(view);
    if(nativeState)row.appendChild(el('small','md-sheet-view-native-status',nativeState.status==='ready'?'Native configuration ready · geometry only':nativeState.status==='error'?'Native configuration failed · '+nativeState.reason:nativeState.status==='unsupported'?nativeState.reason:'Native configuration rebuilding'));
    row.appendChild(namedButton(btn('<i class="ph ph-trash"></i>', function () {
      sheet.select({ kind: "view", id: view.id });
      sheet.deleteSelection();
      drawSketch();
    }, "md-sheet-view-del"), t("opDeleteView")));
    list.appendChild(row);
  });
  views.appendChild(list);
  var available = sheet.availableViews();
  if (available.length) {
    var adder = sheetSelect([{ value: "", label: t("sheetAddView") }].concat(available.map(function (dir) {
      return { value: dir, label: defaultViewLabel(dir) };
    })), "", function (value) {
      if (!value) return;
      sheet.addView(value);
      drawSketch();
    });
    adder.className = "md-sheet-add-view";
    views.appendChild(adder);
  }
  var selected = sheet.selection();
  var selectedView = selected && selected.kind === "view" && doc.views.filter(function (view) { return view.id === selected.id; })[0];
  if (selectedView) {
    if(selectedView.section) {
      var sectionTagInput=el('input','');
      sectionTagInput.type='text';sectionTagInput.value=selectedView.section.tag || 'A';
      sectionTagInput.maxLength=8;sectionTagInput.setAttribute('aria-label','Section tag');
      sheetRow(views,'Section tag',sectionTagInput);
      var sectionTagApply=el('button','md-sheet-btn','Apply Section tag');sectionTagApply.type='button';
      bindSectionTagControls(sectionTagInput,sectionTagApply,sheet,selectedView.id,drawSketch);
      views.appendChild(sectionTagApply);
      var sectionPositionUnit=modelLengthUnit(),sectionPositionAxis=selectedView.section.axis==='vertical'?'U':'V';
      var sectionPositionInput=el('input','');sectionPositionInput.type='number';sectionPositionInput.step='any';
      sectionPositionInput.value=String(lengthToDocument(Number(selectedView.section.at)||0,sectionPositionUnit));
      var sectionPositionLabel='Cut line '+sectionPositionAxis+' ('+sectionPositionUnit+')';
      sectionPositionInput.setAttribute('aria-label',sectionPositionLabel);
      sectionPositionInput.title='Signed parent-view coordinate along '+sectionPositionAxis+'.';
      sheetRow(views,sectionPositionLabel,sectionPositionInput);
      var sectionPositionApply=el('button','md-sheet-btn','Apply Section position');sectionPositionApply.type='button';
      bindSectionPositionControls(sectionPositionInput,sectionPositionApply,sheet,selectedView.id,sectionPositionUnit,drawSketch);
      views.appendChild(sectionPositionApply);
    }
    if(selectedView.detail) {
      var detailTagInput=el('input','');
      detailTagInput.type='text';detailTagInput.value=selectedView.detail.tag || 'A';
      detailTagInput.maxLength=8;detailTagInput.setAttribute('aria-label','Detail tag');
      sheetRow(views,'Detail tag',detailTagInput);
      var detailTagApply=el('button','md-sheet-btn','Apply Detail tag');detailTagApply.type='button';
      bindDetailTagControls(detailTagInput,detailTagApply,sheet,selectedView.id,drawSketch);
      views.appendChild(detailTagApply);
    }
    views.appendChild(btn('<i class="ph ph-copy"></i> Copy selected view', function(){
      sheet.duplicateSelectedView();
      drawSketch();
    }, "md-sheet-btn"));
    if((E.def.configurations||[]).length>1){
      sheetRow(views,"Configuration",sheetSelect([{value:"active",label:"Active model"}].concat(E.def.configurations.map(function(cfg){
        return {value:cfg.id,label:cfg.name};
      })),selectedView.configurationId||"active",function(value){
        sheet.setSheetOption("viewConfiguration",value);
        drawSketch();
      })).id="mdSheetViewConfiguration";
    }
    if(selectedView.section || selectedView.alignedSection || selectedView.brokenOut) {
      var hatchPicker=sheetSelect(SECTION_HATCH_PATTERNS,selectedView.hatchPattern || 'uniform',function(value){
        sheet.setSheetOption('viewHatchPattern',value);drawSketch();
      });
      hatchPicker.setAttribute('aria-label','Section hatch pattern');
      sheetRow(views,'Section hatch pattern',hatchPicker);
      views.appendChild(el('small','md-note','Drafting pattern only; does not assign or certify material.'));
    }
    if(selectedView.section) {
      sheetRow(views,'Longitudinal ribs',sheetSelect([{value:'exclude',label:'Leave unhatched'},{value:'hatch',label:'Hatch with section'}],selectedView.section.excludeLongitudinalRibs===false?'hatch':'exclude',function(value){
        sheet.setSheetOption('viewExcludeRibs',value==='exclude');drawSketch();
      }));
    }
    var scaleControl=drawingViewScaleControl(selectedView.scale,t("sheetInherit"),{automatic:selectedView.scaleMode!=='sheet',effectiveScale:sheet.scene?.().views.find(function(placed){return placed.id===selectedView.id;})?.scale});
    sheetRow(views, t("sheetViewScale"), sheetSelect(scaleControl.options, scaleControl.value, function (value) {
      sheet.setSheetOption("viewScale", value === "sheet" || value === "auto" ? value : value.split(":").map(Number));
      drawSketch();
    }));
    sheetRow(views, t("drawHiddenLines"), sheetSelect([
      { value: "sheet", label: t("sheetInherit") }, { value: "on", label: t("drawOn") }, { value: "off", label: t("drawOff") },
    ], selectedView.hidden === null || selectedView.hidden === undefined ? "sheet" : selectedView.hidden ? "on" : "off", function (value) {
      sheet.setSheetOption("viewHidden", value === "sheet" ? "sheet" : value === "on");
      drawSketch();
    }));
    sheetRow(views, "Display style", sheetSelect([
      {value:"edges",label:"Hidden line drawing"},
      {value:"shaded",label:"Shaded"},
      {value:"shadedEdges",label:"Shaded with edges"},
    ], selectedView.displayStyle || "edges", function(value) {
      sheet.setSheetOption("viewDisplayStyle",value);
      drawSketch();
    }));
  }

  var title = sheetGroup(host, t("sheetTitleBlock"), false,'title');
  [["title", t("tbTitle"), "mdSheetTitleField"], ["number", t("tbNumber")], ["revision", t("tbRev")],
    ["author", t("tbAuthor")], ["company", t("tbCompany")], ["material", t("tbMaterial")],
    ["finish", t("tbFinish")], ["mass", t("tbMass")], ["date", t("tbDate")], ["tolerance", t("tbTolerance")],
  ].forEach(function (field) {
    var input = el("input", "");
    input.type = "text";
    input.value = doc.title[field[0]] || "";
    if (field[2]) input.id = field[2];
    input.setAttribute("data-title-field", field[0]);
    var source = doc.title.sources?.[field[0]];
    if (source && source !== "manual") {
      input.value = sheetTitleMeta(doc, E.docType === "assembly" ? E.assembly : E.def)[field[0]];
      input.disabled = true;
    }
    bindTitleField(input, field[0]);
    sheetRow(title, field[1], input);
    if (["title", "number"].includes(field[0])) {
      var picker = el("select", "");
      picker.setAttribute("data-title-source", field[0]);
      picker.setAttribute("aria-label", field[0] === "title" ? "Title source" : "Drawing number source");
      if (!source) { var legacy = el("option", "", "Existing behavior"); legacy.value = "legacy"; legacy.disabled = true; picker.appendChild(legacy); }
      var choices = [["manual", "Manual text"], ...(field[0] === "title" ? [["description", "Model Description"]] : []), ["name", field[0] === "title" ? "Model name" : "Model name (file-name equivalent)"]];
      choices.forEach(function (choice) { var option = el("option", "", choice[1]); option.value = choice[0]; picker.appendChild(option); });
      picker.value = source || "legacy";
      picker.title = "Choosing a source creates a persistent link. Missing source values display blank. Model name is this app's file-name equivalent; no suffix is removed. Existing fields keep their legacy behavior until you choose a source.";
      bindTitleSource(picker, field[0], host);
      sheetRow(title, field[0] === "title" ? "Title source" : "Drawing number source", picker);
    }
  });
  host.setAttribute("data-views", doc.views.map(function (view) { return view.id; }).join(","));
  syncDanglingDims(host);
  host.querySelectorAll('[data-sheet-group]').forEach(function(group){var key=group.getAttribute('data-sheet-group');if(groupState.has(key))group.open=groupState.get(key);});
  host._sheetPanelOwner=ownerIdentity;host._sheetPanelOwnerType=E.docType;
  host.scrollTop=Math.min(scrollTop,Math.max(0,host.scrollHeight-host.clientHeight));
}

/* Which dimensions no longer measure anything, and a way to reach each one.
   Built from the scene, so it can never disagree with what the paper shows. */
function syncDanglingDims(host) {
  var box = host && host.querySelector("#mdSheetDangling");
  if (!box) return;
  var sheet = drawingSheet(), issues = sheet.danglingDims();
  var signature = issues.map(function (issue) { return issue.id; }).join(",");
  if (box.getAttribute("data-issues") === signature) return;
  box.setAttribute("data-issues", signature);
  box.innerHTML = "";
  box.hidden = !issues.length;
  if (!issues.length) return;
  var head = el("div", "md-sheet-dangling-head");
  head.innerHTML = '<i class="ph ph-warning"></i><b>' + t("drawDangling") + "</b>";
  box.appendChild(head);
  box.appendChild(el("div", "md-sheet-dangling-note", tf("drawDanglingCount", { count: issues.length })));
  issues.forEach(function (issue) {
    var button = btn("", function () {
      sheet.select({ kind: issue.kind || "dim", id: issue.id });
    }, "md-sheet-dangling-item");
    /* Persistent ids come from the document, so they go in as text. */
    button.textContent = "⚠ " + (issue.missing.length ? issue.missing.join(", ") : issue.id);
    button.title = t("drawDanglingSelect");
    box.appendChild(button);
  });
}

function syncSheetPanel() {
  if (!root) return;
  var host = root.querySelector("#mdSheetPanel");
  if (!host) return;
  var on = E.mode === "drawing";
  host.hidden = !on;
  if (!on) return;
  var doc = drawingDocument(), sheet = drawingSheet();
  var selection = sheet.selection();
  var signature = doc.views.map(function (view) {
    return view.id + ":" + view.label + ":" + JSON.stringify(view.section) + ":" + drawingViewScaleControl(view.scale).value + ":" + (view.scaleMode||'auto') + ":" + view.hidden + ":" + view.hatchPattern + ":" + view.displayStyle + ":" + (view.configurationId||"")+":"+JSON.stringify(configuredDrawingStatus(view)&&{status:configuredDrawingStatus(view).status,reason:configuredDrawingStatus(view).reason});
  }).join(",") + "#" + (selection && selection.kind === "view" ? selection.id : "") + "#" + JSON.stringify(doc.title.sources || {});
  if (host.getAttribute("data-signature") !== signature) {
    buildSheetPanel(host);
    host.setAttribute("data-signature", signature);
    return;
  }
  var set = function (id, value) {
    var node = host.querySelector(id);
    if (node && node !== document.activeElement) node.value = value;
  };
  set("#mdSheetSize", doc.size);
  set("#mdSheetOrientation", doc.orientation);
  set("#mdSheetScale", doc.scale === "fit" ? "fit" : scaleLabel(doc.scale));
  set("#mdSheetUnits", doc.units);
  set("#mdSheetStandard",doc.draftingStandard||"custom");
  set("#mdSheetSecondaryUnits",doc.secondaryUnits||"");
  set("#mdSheetSecondaryPrecision",String(doc.secondaryPrecision??2));
  set("#mdSheetPrecision", Number.isInteger(doc.precision)?String(doc.precision):"auto");
  var trailingZeros=root.querySelector("#mdSheetTrailingZeros");if(trailingZeros)trailingZeros.checked=doc.trailingZeros??Number.isInteger(doc.precision);
  set("#mdSheetProjection", doc.projection);
  var boxes = { "#mdSheetHiddenBox": doc.showHidden !== false, "#mdSheetCentersBox": doc.showCenters !== false, "#mdSheetZonesBox": doc.showZones !== false };
  Object.keys(boxes).forEach(function (id) {
    var node = host.querySelector(id);
    if (node) node.checked = boxes[id];
  });
  host.querySelectorAll("[data-title-field]").forEach(function (input) {
    var key = input.getAttribute("data-title-field"), source = doc.title.sources?.[key];
    input.disabled = !!source && source !== "manual";
    if (input !== document.activeElement) input.value = input.disabled
      ? sheetTitleMeta(doc, E.docType === "assembly" ? E.assembly : E.def)[key] : doc.title[key] || "";
  });
  syncDanglingDims(host);
}

/* What the hint bar says on a sheet: the armed tool's own instruction, because
   "pan the page" is not why anyone opened a drawing. */
function drawingHintText() {
  var tool = E.sheet ? E.sheet.getTool() : "select";
  if(tool==='insertimage')return 'Click the paper, choose a local PNG/JPEG, then set position and size in paper mm';
  if(tool==='insertprojectimage')return 'Click the paper, enter an app-served PNG/JPEG URL, then set position and size in paper mm';
  if(tool==='editimage')return 'Click an inserted image to edit its paper position and size';
  if(tool==='removeimage')return 'Click an inserted image to remove it; Undo restores it';
  if (tool === "dim") return t("drawDimHint");
  if (tool === "angle") return t("drawAngleHint");
  if (tool === "baseline") return t("drawBaselineHint");
  if (tool === "chain") return t("drawChainHint");
  if (tool === "diam") return t("drawDiamHint");
  if (tool === "section") return t("drawSectionHint");
  if (tool === "detail") return t("drawDetailHint");
  if (tool === "auxiliary") return "Choose a named inclined edge in a principal view, then select its native planar face";
  if (tool === "crop") return "Tap a drawing view and boundary points, then Finish boundary; Cancel discards (Enter/Escape also work)";
  if (tool === "uncrop") return "Click a cropped drawing view to restore its full projection";
  if (tool === "brokenout") return "Tap an orthographic view and boundary points, then Finish boundary to set depth in mm; Cancel discards";
  if (tool === "unbrokenout") return "Click a broken-out drawing view to restore its original projection";
  if (tool === "break") return "Choose a single orthographic view; set original boundary coordinates and printed gap. Dimensions retain actual model values";
  if (tool === "unbreak") return "Click a Break view to restore its complete original projection";
  if (tool === "alternateposition") return "Choose a drawing view, then set an illustrative rigid native-body pose for its phantom overlay";
  if (tool === "alignedsection") return "Pick endpoint A, hinge, endpoint B on a principal parent; Enter unfolds real cut faces; Escape cancels";
  if (tool === "removealternateposition") return "Click a drawing view to remove its Alternate Position overlay";
  if (tool === "note") return t("drawNoteHint");
  if (tool === "sheetarc") return t("drawPaperArcHint");
  if (tool === "sheetellipse") return t("drawPaperEllipseHint");
  if (["sheetline","sheetpolyline","sheetrect","sheetcircle"].includes(tool)) return t("drawPaperHint");
  return t("drawingHint");
}

function drawingDocument() {
  var owner=E.docType==='assembly'&&E.assembly?E.assembly:E.def;
  if (!owner) return null;
  var isNew=!owner.drawing;
  var doc=E.docType==='assembly'?ensureAssemblyDrawingDoc(owner):ensureSheetDoc(owner);
  if(isNew&&owner.documentProperties){var defaults=documentDefaults(owner);doc.units=defaults.lengthUnit;doc.draftingStandard=defaults.draftingStandard;doc.projection=defaults.projection;doc.precision=defaults.lengthPrecision;doc.anglePrecision=defaults.anglePrecision;doc.secondaryUnits=defaults.dualDimensions?(defaults.lengthUnit==='in'?'mm':'in'):null;}
  doc.assemblyLayout=E.docType==='assembly';
  return doc;
}

function drawingSheet() {
  if (!E.sheet) {
    E.sheet = createDrawingController({
      canvas: function () { return E.cv; },
      width: function () { return E.cw; },
      height: function () { return E.ch; },
      viewportInsets: function () {
        var canvas=E.cv?.getBoundingClientRect(),status=root.querySelector("#mdStatus")?.getBoundingClientRect();
        return {bottom:canvas && status && status.right>canvas.left && status.left<canvas.right
          ? Math.max(0,canvas.bottom-Math.max(canvas.top,status.top)) : 0};
      },
      doc: drawingDocument,
      model: function () { return E.docType==='assembly'?E.assembly:E.def; },
      isExplodedView: function () {return E.docType==='assembly' && !!E.assembly && assemblyHasExplodedOffsets(E.assembly);},
      bodies: drawingBodies,
      bodiesForView: configuredDrawingBodies,
      canUseTopologyForView: configuredTopologyAllowed,
      topology: function(){return E.docType==='part'&&E.def?.drawing?.views.some(function(v){return configuredViewId(E.def,v);})?null:drawingTopology();},
      /* The live spelling of every hole, re-read on each build so a callout
         cannot outlive the parameters it was placed from. */
      callouts: function () { return calloutTextById(E.def); },
      holeCallouts: function () {
        return holeCallouts(E.def).map(function (row) { return { ...row, text: calloutText(row) }; });
      },
      bodiesToken: function () { return E.sheetToken; },
      meta: function () {
        var doc = drawingDocument(),owner=E.docType==='assembly'?E.assembly:E.def;
        return { ...sheetTitleMeta(doc, owner), material: doc.title.material || (E.docType==='assembly'?'':drawingMaterialName(E.def)) };
      },
      bom: function () {
        if (E.docType !== "assembly" || !E.assembly) return null;
        return assemblyDrawingBOMRows().map(function (row, index) {
          return { item: row.item ?? index + 1, qty: row.quantity, name: row.name, description: row.description, partNumber: row.partNumber, material: row.material || "" };
        });
      },
      componentBalloons:function(){return E.docType==='assembly'?assemblyDrawingBalloonTargets():[];},
      explodeLines:function(){return E.docType==='assembly'?assemblyExplodeLines():[];},
      pushUndo: pushUndo,
      /* The drag triad: the step is opened on pointerdown while the sheet is
         still untouched, named on pointerup, and dropped when the gesture put
         everything back (a plain click, or Escape). scheduleModelerDraft runs
         on commit only, because an abandoned gesture changed nothing to save. */
      beginUndo: function (label) { H.begin(label || ""); },
      commitUndo: function (label) { if (H.commit(label)) scheduleModelerDraft(); },
      cancelUndo: function () { H.cancel(); },
      markDirty: function () { E.sheet.invalidate(); drawSketch(); syncSheetPanel(); syncStatus(); },
      flash: flash,
      t: t,
      prompt: sheetPrompt,
      promptFields: sheetForm,
      historyToken: currentHistoryNode,
      chooseImage: chooseDrawingImage,
      chooseProjectImage: chooseDrawingProjectImage,
      presetAction: drawingPresetAction,
      refresh: function () { drawSketch(); syncSheetPanel(); syncModelerMobile(); },
      editTitleBlock: function () {
        var field = root && root.querySelector("#mdSheetTitleField");
        if (field) { field.focus(); field.select(); }
      },
    });
    /* The same debugging door cadPreviewView and cadUpdatePreview open: the
       browser tests drive the sheet through it, since a canvas drawing has no
       DOM to assert against. */
    if (typeof window !== "undefined") window.cadDrawingSheet = E.sheet;
  }
  return E.sheet;
}

/* Every rebuild invalidates the projections: the sheet caches them per body
   token because hidden-line removal is far too expensive to redo on a paint. */
function invalidateDrawing() {
  E.sheetToken++;
  if (E.sheet) E.sheet.invalidate();
}

function pathEllipse(c, o) {
  return pathUvEllipse(c, o, 0, Math.PI * 2, true);
}

function sampleSplinePoints(entity, points, segments) {
  var controls = splineControls(entity, points);
  if (!controls) return [];
  var out = [];
  for (var i = 0; i <= segments; i++) out.push(bezierPoint(controls, i / segments));
  return out;
}

function splineLength(entity, points) {
  var samples = sampleSplinePoints(entity, points, 24);
  return samples.reduce(function (length, point, i) {
    return length + (i ? Math.hypot(point.x - samples[i - 1].x, point.y - samples[i - 1].y) : 0);
  }, 0);
}

/* Split view: the sketches, drawn in the model half as well. The 3D view
   never draws a sketch itself — in Model mode the sketch canvas is laid over
   it — so beside the sketch pane it would show nothing until the first
   extrude. Each sketch is sampled on its own plane (framePoint) into a group
   of its own, rebuilt from drawSketch() only when the geometry changed, and
   gone the moment Split is left. The sketch being edited is bright, the rest
   dim. */
function sketchUvPolylines(sketch) {
  var pts = new Map((sketch.points || []).map(function (q) { return [q.id, q]; })), out = [];
  function ring(center, rx, ry, rot, start, sweep) {
    var n = Math.max(8, Math.ceil(64 * Math.abs(sweep) / (Math.PI * 2))), cr = Math.cos(rot || 0), sr = Math.sin(rot || 0), line = [];
    for (var i = 0; i <= n; i++) {
      var a = start + sweep * i / n, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      line.push({ u: center.x + x * cr - y * sr, v: center.y + x * sr + y * cr });
    }
    return line;
  }
  (sketch.entities || []).forEach(function (e) {
    try {
      if (e.projectedCurve && e.projectedCurve.samples) out.push(e.projectedCurve.samples.map(function (q) { return { u: q.u, v: q.v }; }));
      else if (e.type === "line") {
        var a = pts.get(e.a), b = pts.get(e.b);
        if (a && b) out.push([{ u: a.x, v: a.y }, { u: b.x, v: b.y }]);
      } else if (e.type === "spline") {
        var line = sampleSplinePoints(e, pts, 24);
        if (line.length) out.push(line.map(function (p) { return { u: p.x, v: p.y }; }));
      } else if (e.type === "point") {
        var point = pts.get(e.p), tick = 0.5;
        if (point) {
          out.push([{ u: point.x - tick, v: point.y }, { u: point.x + tick, v: point.y }]);
          out.push([{ u: point.x, v: point.y - tick }, { u: point.x, v: point.y + tick }]);
        }
      } else if (e.type === "ellipse") {
        var el = ellipseData(e, pts);
        if (el) out.push(ring(el.center, el.rx, el.ry, el.rot, 0, Math.PI * 2));
      } else if (e.type === "circle" || e.type === "arc") {
        var o = circleData(e, pts);
        if (o) out.push(e.type === "arc" ? ring(o.center, o.radius, o.radius, 0, o.start, positiveArcSweep(o.start, o.end)) : ring(o.center, o.radius, o.radius, 0, 0, Math.PI * 2));
      }
    } catch (error) { /* a half-built entity draws nothing this frame */ }
  });
  return out;
}
function sketchWorldFrame(sketch) {
  return sketch.frameSpace === "local" && sketch.frame ? sketch.frame : standardPlaneFrame(sketch.plane || E.view, sketch.offset);
}
function syncSplitSketch3D() {
  var host = E.pv && E.pv.liveGrp && E.pv.liveGrp.parent;
  var sketches = E.split && E.def && E.docType === "part" ? ensureSketchDoc(E.def) : [];
  var current = sketches.length ? ensureSketch(E.def) : null;
  var lines = sketches.map(function (sketch) { return { sketch: sketch, uv: sketchUvPolylines(sketch) }; });
  var key = host ? JSON.stringify(lines.map(function (l) { return [l.sketch === current, sketchWorldFrame(l.sketch), l.sketch.frameSpace, l.sketch.surface, l.sketch.seamOffset, l.uv]; })) : "";
  var old = E._splitSketchGrp;
  if (old && old.parent === host && key === E._splitSketchKey) return;
  if (old) { if (old.parent) old.parent.remove(old); clearGroup(old); }
  E._splitSketchGrp = null;
  E._splitSketchKey = key;
  if (host && lines.length) {
    var grp = new THREE.Group();
    grp.userData.cadSplitSketch = true;
    lines.forEach(function (l) {
      var frame = sketchWorldFrame(l.sketch), on = l.sketch === current;
      l.uv.forEach(function (uv) {
        addOverlayPolyline(grp, l.sketch.frameSpace === "surface-uv" ? surfaceSketchWorldPolyline(l.sketch, uv) : uv.map(function (q) { return framePoint(frame, q.u, q.v, 0); }), on ? 0x3aa0ff : 0x7d8b99, on ? 27 : 23, null, false);
      });
    });
    host.add(grp);
    E._splitSketchGrp = grp;
    // the first sketch geometry in an empty part is worth framing once
    if (!E._splitFitted && !renderedParts(E.def).length) { fitSplitPreview(); return; }
  }
  if (E.pv && (old || E._splitSketchGrp)) E.pv.render();
}
/* fitPreview() frames the solids, or the sketch being edited — but a part with
   no solid yet is framed as a stock 60-unit box whose middle floats above the
   sketch plane. In Split, with nothing solid, frame the sketches themselves. */
function fitSplitPreview() {
  fitPreview();
  var g = E._splitSketchGrp;
  if (!E.pv || !E.pv.target || !g || renderedParts(E.def).length) return;
  var box = new THREE.Box3().setFromObject(g);
  if (box.isEmpty()) return;
  E._splitFitted = true;
  var c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), db = defBounds(E.def);
  E.pv.frame(Math.max(1, size.length()) * 1.5);
  // the camera orbits center() plus target; center() is that stock box's middle
  E.pv.target.set(c.x, c.y - (db.y0 + db.y1) / 2, c.z);
  E.pv.render();
}

/* The right column's sketch thumbnail (Round-6): in Model view the thumbnail
   slot is empty — the 3D moved to the middle — so it shows the sketch you are
   on (or the last one drawn), fitted, with its name and how defined it is.
   Clicking it edits that sketch. Redrawn only when the sketch, its state or
   the slot's size changed. */
function syncSketchThumb() {
  var box = root && root.querySelector("#mdSketchThumb");
  if (!box) return;
  var sketches = E.def && E.docType === "part" ? ensureSketchDoc(E.def) : [];
  var current = sketches.length ? ensureSketch(E.def) : null;
  var sketch = current && (current.entities || []).length ? current
    : sketches.slice().reverse().find(function (sk) { return (sk.entities || []).length; }) || null;
  var show = !!sketch && E.mode === "3d" && !E.modelPlaneActive && !E.split && !document.body.classList.contains("compact-nav");
  box.hidden = !show;
  if (!show) { E._sketchThumbKey = ""; return; }
  var r = box.getBoundingClientRect();
  if (r.width < 20 || r.height < 20) return;
  var lines = sketchUvPolylines(sketch);
  var key = JSON.stringify([sketch.id, (sketch.constraints || []).length, Math.round(r.width), Math.round(r.height), lines]);
  if (key === E._sketchThumbKey) return;
  E._sketchThumbKey = key;
  var info = solveSketch(sketch);
  box._sketch = sketch;
  var n = sketches.indexOf(sketch) + 1;
  box.querySelector(".md-view-chip").textContent = t("sketchThumbChip").replace("{n}", n) + " · " +
    (info.status === "fully-constrained" ? t("wfFullyDefined") : info.status === "conflicting" ? t("dofConflict")
      : info.status === "over-constrained" ? t("dofOver") : (sketch.constraints || []).length ? t("wfPartialDefined") : t("wfUnderDefined"));
  var cv = box.querySelector("canvas"), dpr = Math.min(2, window.devicePixelRatio || 1), c = cv.getContext("2d");
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, r.width, r.height);
  var u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  lines.forEach(function (l) { l.forEach(function (q) { u0 = Math.min(u0, q.u); u1 = Math.max(u1, q.u); v0 = Math.min(v0, q.v); v1 = Math.max(v1, q.v); }); });
  if (!isFinite(u0)) return;
  var padT = 34, pad = 26, k = Math.min((r.width - pad * 2) / Math.max(1e-6, u1 - u0), (r.height - padT - pad) / Math.max(1e-6, v1 - v0));
  var ox = r.width / 2 - (u0 + u1) / 2 * k, oy = padT + (r.height - padT - pad) / 2 + (v0 + v1) / 2 * k;
  c.lineWidth = 1.6;
  c.lineJoin = "round";
  c.strokeStyle = info.status === "fully-constrained" ? getComputedStyle(document.documentElement).getPropertyValue("--text-main").trim() || "#e5e7eb"
    : info.status === "conflicting" ? "#e5484d" : "#3aa0ff";
  lines.forEach(function (l) {
    c.beginPath();
    l.forEach(function (q, i) { var x = ox + q.u * k, y = oy - q.v * k; if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.stroke();
  });
}
function drawSketch() {
  // openModeler builds the phone chrome (which can fire a resize) before the
  // document is loaded; there is nothing to draw until it is
  if (!E.open || !E.def) return;
  syncSplitSketch3D();
  syncSketchThumb();
  invalidateSketchProjection();   // the camera or the pane may have moved since
  syncContextActions();
  if (!E.cw || !E.ch) sizeSketch();
  var c = E.cx, W = E.cw, H = E.ch;
  var isDark = E.mode === "3d" || (typeof document !== "undefined" && !["light", "classic", "soft"].includes(document.documentElement.getAttribute("data-theme")));
  c.clearRect(0, 0, W, H);
  /* Drawing mode is a drafting table, not the sketch canvas with a border
     drawn round it: modeler_drawing.js owns the paper, the projected views and
     every annotation on them, so nothing below this line runs there. */
  if (E.mode === "drawing") { drawingSheet().render(c, W, H); return; }
  /* Grid and axes. Over the model they belong to the sketch PLANE, so they are
     drawn in u/v and projected like everything else — a grid that recedes with
     the face is what tells you which plane you are drawing on when the camera
     is not square to it. On the flat sheet they stay screen-aligned. */
  var step = E.grid * E.scl;
  while (step < 8) step *= 2;
  c.strokeStyle = "rgba(120,130,140,.15)";
  c.lineWidth = 1;
  var projected = sketchProjection();
  if (projected) {
    var reach = E.grid * 20, spacing = E.grid * (E.scl < 1.2 ? 4 : 1);
    /* A quiet sheet tint separates the aligned sketch plane from the shaded
       solid without hiding either one. It is projected through the same camera
       as the geometry, so orbiting reads as a real drawing plane rather than a
       screen-space HUD. */
    var planeCorners = [toPx(-reach,-reach),toPx(reach,-reach),toPx(reach,reach),toPx(-reach,reach)];
    c.save();
    c.fillStyle = isDark ? "rgba(15,35,62,.12)" : "rgba(226,241,255,.13)";
    c.strokeStyle = isDark ? "rgba(125,211,252,.34)" : "rgba(38,132,199,.28)";
    c.lineWidth = 1; c.setLineDash([7,5]); c.beginPath();
    planeCorners.forEach(function(point,index){if(index)c.lineTo(point.x,point.y);else c.moveTo(point.x,point.y);});
    c.closePath(); c.fill(); c.stroke(); c.restore();
    c.beginPath();
    for (var g = -reach; g <= reach + 1e-6; g += spacing) {
      var lineStart = toPx(-reach, g), lineEnd = toPx(reach, g);
      c.moveTo(lineStart.x, lineStart.y); c.lineTo(lineEnd.x, lineEnd.y);
      var colStart = toPx(g, -reach), colEnd = toPx(g, reach);
      c.moveTo(colStart.x, colStart.y); c.lineTo(colEnd.x, colEnd.y);
    }
    c.stroke();
    c.strokeStyle = "rgba(90,140,220,.55)";
    c.beginPath();
    var uA = toPx(-reach, 0), uB = toPx(reach, 0), vA = toPx(0, -reach), vB = toPx(0, reach);
    c.moveTo(uA.x, uA.y); c.lineTo(uB.x, uB.y); c.moveTo(vA.x, vA.y); c.lineTo(vB.x, vB.y);
    c.stroke();
    c.fillStyle = "rgba(90,110,130,.85)";
    c.font = "11px sans-serif";
    c.fillText("U", uB.x + 4, uB.y - 4);
    c.fillText("V", vB.x + 4, vB.y - 4);
  } else {
    c.beginPath();
    for (var gx = E.ox % step; gx < W; gx += step) { c.moveTo(gx, 0); c.lineTo(gx, H); }
    for (var gy = E.oy % step; gy < H; gy += step) { c.moveTo(0, gy); c.lineTo(W, gy); }
    c.stroke();
    // axes through origin
    c.strokeStyle = "rgba(90,140,220,.5)";
    c.beginPath(); c.moveTo(0, E.oy); c.lineTo(W, E.oy); c.moveTo(E.ox, 0); c.lineTo(E.ox, H); c.stroke();
    c.fillStyle = "rgba(90,110,130,.8)";
    c.font = "11px sans-serif";
    var lbl = activeSketchFrame() ? ["U", "V"] : E.view === "top" ? ["X", "Z"] : E.view === "front" ? ["X", "Y"] : ["Z", "Y"];
    c.fillText(lbl[0], W - 14, E.oy - 6);
    c.fillText(lbl[1], E.ox + 6, 14);
  }

  // parts — a step that is suppressed or below the rollback bar is drawn as a
  // dashed ghost, so the canvas never shows something the model does not have
  var built = renderedParts(E.def);
  (E.def.parts || []).forEach(function (p) {
    // Over the model the shaded solid IS the part. Its flattened u/v outline on
    // top of itself was only ever a stand-in for a model you could not see.
    if (projected) return;
    var f = partUV(p), on = p === E.sel, inactive = built.indexOf(p) < 0;
    c.save();
    if (inactive) { c.globalAlpha = 0.4; c.setLineDash([6, 4]); }
    c.strokeStyle = on ? "#e08030" : "#5a7a9a";
    c.fillStyle = on ? "rgba(224,128,48,.18)" : "rgba(90,122,154,.10)";
    c.lineWidth = on ? 2 : 1.2;
    c.beginPath();
    if (f.type === "rect") {
      var a = toPx(f.u0, f.v0), b = toPx(f.u1, f.v1);
      c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else if (f.type === "circle") {
      var q = toPx(f.u, f.v);
      c.arc(q.x, q.y, f.r * E.scl, 0, 7);
    } else if(f.type === "segments") {
      f.segments.forEach(function(segment){var a=toPx(segment.a.u,segment.a.v),b=toPx(segment.b.u,segment.b.v);c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);});
    } else {
      f.pts.forEach(function (q, i) {
        var s = toPx(q.u, q.v);
        if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
      });
      c.closePath();
      // hole loops as sub-paths; evenodd fill leaves them empty
      (f.holes || p.holes || []).forEach(function (hl) {
        var loop = holeLoop(hl);
        if (!loop.length) return;
        loop.forEach(function (q, i) {
          var s = toPx(q.u, q.v);
          if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
        });
        c.closePath();
      });
    }
    if(f.type!=="segments")c.fill("evenodd"); c.stroke();
    // vertex handles + edge lengths for a selected sketched polygon
    if (on && f.type === "poly") {
      c.fillStyle = isDark ? "#fb923c" : "#e08030";
      f.pts.forEach(function (q, i) {
        var s = toPx(q.u, q.v);
        c.fillRect(s.x - 3, s.y - 3, 6, 6);
        var q2 = f.pts[(i + 1) % f.pts.length], s2 = toPx(q2.u, q2.v);
        var L = Math.hypot(q2.u - q.u, q2.v - q.v);
        c.fillStyle = isDark ? "#fed7aa" : "#7a5a30";
        c.fillText(Math.round(L) + "", (s.x + s2.x) / 2 + 3, (s.y + s2.y) / 2 - 3);
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
      });
    }
    // dimensions for selected rect
    if (on && f.type === "rect") {
      var a2 = toPx(f.u0, f.v0), b2 = toPx(f.u1, f.v1);
      c.fillStyle = isDark ? "#fed7aa" : "#7a5a30";
      c.fillText(Math.round(Math.abs(f.u1 - f.u0)) + "", (a2.x + b2.x) / 2 - 8, Math.min(a2.y, b2.y) - 5);
      c.fillText(Math.round(Math.abs(f.v1 - f.v0)) + "", Math.max(a2.x, b2.x) + 5, (a2.y + b2.y) / 2);
    }
    c.restore();
  });

  // True sketch entities are independent from solid parts. Lines carry
  // constraints and metadata but create no 3D body until a feature consumes a
  // closed profile.
  var sketch = ensureSketch(E.def);
  drawFeatureAreaHatch(c);

  /* Other sketches sharing this plane are drawn first, dimmed and unpickable —
     they are context you constrain against, not geometry you are editing. A
     sketch on another plane is not drawn at all: it is not in this projection,
     and pretending otherwise is what let a top-plane profile extrude as if it
     had been drawn on the front. */
  ensureSketchDoc(E.def).forEach(function (other) {
    if (other === sketch || !sameSketchContext(other,sketch)) return;
    var opts = new Map((other.points || []).map(function (q) { return [q.id, q]; }));
    c.save();
    c.globalAlpha = 0.32;
    c.strokeStyle = "#5a7a9a";
    c.lineWidth = 1.1;
    (other.entities || []).forEach(function (e) {
      c.beginPath();
      if(e.projectedCurve?.samples){e.projectedCurve.samples.forEach(function(p,i){var q=toPx(p.u,p.v);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});
      } else if (e.type === "line") {
        var a = opts.get(e.a), b = opts.get(e.b);
        if (!a || !b) return;
        var sa = toPx(a.x, a.y), sb = toPx(b.x, b.y);
        c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y);
      } else if(e.type==="spline"){pathSketchSpline(c,e,opts);
      } else if (e.type === "ellipse") {
        if (!pathEllipse(c, ellipseData(e, opts))) return;
      } else {
        var o = circleData(e, opts);
        if (!o) return;
        if (e.type === "arc") pathUvCircleArc(c, o.center, o.radius, o.start, positiveArcSweep(o.start, o.end), false);
        else pathUvCircleArc(c, o.center, o.radius, 0, Math.PI * 2, true);
      }
      c.stroke();
    });
    c.restore();
  });

  var spts = new Map((sketch.points || []).map(function (q) { return [q.id, q]; }));
  // a refused dimension or relation paints what it fought
  var refused = refusalHint(sketch);
  var conflicts = refused || (E.solveInfo && E.solveInfo.conflicts) || [];
  var statuses = entityStatuses(sketch, refused ? Object.assign({}, E.solveInfo, { conflicts: refused, status: "conflicting" }) : E.solveInfo);
  var fully = E.solveInfo && E.solveInfo.status === "fully-constrained";
  // Under-defined entities stay blue, fully defined black, conflicts red.
  var live = sketch.frameSpace==="local" ? !!(E.modelPlaneActive || E.mode==="2d") : sketch.plane === E.view;

  (live ? sketch.entities || [] : []).forEach(function (entity) {
    var selected = E.ssel.indexOf(entity) >= 0;
    var status = statuses.entityStatus[entity.id] || (fully ? "fully-defined" : "under-defined");
    c.save();
    if (projected) {
      c.shadowColor = isDark ? "rgba(2,8,23,.95)" : "rgba(255,255,255,.92)";
      c.shadowBlur = 3;
    }
    c.strokeStyle = sketchStatusColor(status, { selected: selected, construction: entity.construction, isDark: isDark });
    c.lineWidth = selected ? 2.3 : Math.max(1.2, entity.weight || 1.2);
    if (entity.construction) c.setLineDash([7, 4]);
    c.beginPath();
    if(entity.projectedCurve?.samples){entity.projectedCurve.samples.forEach(function(p,i){var q=toPx(p.u,p.v);if(i)c.lineTo(q.x,q.y);else c.moveTo(q.x,q.y);});c.stroke();
    } else if (entity.type === "line") {
      // read through the map built above, not by re-scanning the point array:
      // that scan is per line per frame, which is the whole sketch squared
      var a = spts.get(entity.a), b = spts.get(entity.b);
      if (!a || !b) { c.restore(); return; }
      var sa = toPx(a.x, a.y), sb = toPx(b.x, b.y);
      c.moveTo(sa.x, sa.y); c.lineTo(sb.x, sb.y); c.stroke();
      c.setLineDash([]);
      // Only the selected line states its own size. Labelling every segment
      // duplicates whatever dimensions the sketch already carries and buries
      // the constraint glyphs underneath the text.
      if (selected) {
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        var ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        var infoText = Math.round(len * 10) / 10 + " cm · " + Math.round(ang * 10) / 10 + "°";
        var tx = (sa.x + sb.x) / 2 + 5, ty = (sa.y + sb.y) / 2 - 7;
        if (c.fillRect) {
          c.save();
          c.fillStyle = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
          var tw = (c.measureText ? c.measureText(infoText).width : infoText.length * 6.5) + 6;
          c.fillRect(tx - 3, ty - 10, tw, 13);
          c.restore();
        }
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
        c.font = "11px sans-serif";
        c.fillText(infoText, tx, ty);
      }
    } else if (entity.type === "point") {
      var standalone = spts.get(entity.p);
      if (standalone) { var marker = toPx(standalone.x, standalone.y); c.strokeRect(marker.x - 6, marker.y - 6, 12, 12); }
    } else if(entity.type==="spline"){pathSketchSpline(c,entity,spts);c.stroke();
    } else if (entity.type === "ellipse") {
      var el2 = ellipseData(entity, spts);
      if (!pathEllipse(c, el2)) { c.restore(); return; }
      c.stroke();
      c.setLineDash([]);
      if (selected) {
        var ec = toPx(el2.center.x, el2.center.y);
        var infoText = Math.round(el2.rx * 10) / 10 + " × " + Math.round(el2.ry * 10) / 10;
        if (c.fillRect) {
          c.save();
          c.fillStyle = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
          var tw = (c.measureText ? c.measureText(infoText).width : infoText.length * 6.5) + 6;
          c.fillRect(ec.x + 1, ec.y - 12, tw, 13);
          c.restore();
        }
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
        c.font = "11px sans-serif";
        c.fillText(infoText, ec.x + 4, ec.y - 4);
      }
    } else {
      var o = circleData(entity, spts);
      if (!o) { c.restore(); return; }
      var sc = toPx(o.center.x, o.center.y);
      if (entity.type === "arc") pathUvCircleArc(c, o.center, o.radius, o.start, positiveArcSweep(o.start, o.end), false);
      else pathUvCircleArc(c, o.center, o.radius, 0, Math.PI * 2, true);
      c.stroke();
      c.setLineDash([]);
      if (selected) {
        var infoText = "R " + Number(Number(o.radius).toFixed(3));
        if (c.fillRect) {
          c.save();
          c.fillStyle = isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.85)";
          var tw = (c.measureText ? c.measureText(infoText).width : infoText.length * 6.5) + 6;
          c.fillRect(sc.x + 1, sc.y - 12, tw, 13);
          c.restore();
        }
        c.fillStyle = isDark ? "#fb923c" : "#e08030";
        c.font = "11px sans-serif";
        c.fillText(infoText, sc.x + 4, sc.y - 4);
      }
    }
    c.restore();
  });

  // sketch points, drawn over the entities so they stay grabbable
  (live ? sketch.points || [] : []).forEach(function (q) {
    var s = toPx(q.x, q.y), on = E.ssel.indexOf(q) >= 0;
    c.save();
    if (projected) { c.shadowColor = "rgba(2,8,23,.9)"; c.shadowBlur = 3; }
    c.fillStyle = on ? (isDark ? "#fb923c" : "#e08030") : q.fixed ? (isDark ? "#34d399" : "#0f8a6a") : sketchStatusColor(statuses.pointStatus[q.id] || (fully ? "fully-defined" : "under-defined"), { isDark: isDark });
    c.fillRect(s.x - 3, s.y - 3, 6, 6);
    if (q.fixed) { c.strokeStyle = isDark ? "#34d399" : "#0f8a6a"; c.lineWidth = 1; c.strokeRect(s.x - 5, s.y - 5, 10, 10); }
    c.restore();
  });

  if (live) {
    var profileInfo = sketchProfileAnalysis();
    // A faint region fill makes the exact profiles the feature engine sees
    // visible. Open and branched endpoints are called out directly on-canvas.
    profileInfo.profiles.forEach(function (profile) {
      if (!profile.points.length) return;
      c.save(); c.globalAlpha = profile.selected ? 0.14 : 0.065;
      c.fillStyle = profile.selected ? (isDark ? "#fb923c" : "#e08030") : (isDark ? "#38bdf8" : "#2684c7");
      c.beginPath();
      profile.points.forEach(function (p, index) { var sp = toPx(p.u, p.v); if (!index) c.moveTo(sp.x, sp.y); else c.lineTo(sp.x, sp.y); });
      c.closePath(); c.fill(); c.restore();
    });
    var openPathReady=profileInfo.openEnds.length && sketchOpenPathReadiness(sketch);
    profileInfo.openEnds.forEach(function (p) {
      var sp = toPx(p.x, p.y);
      c.save(); c.strokeStyle = openPathReady ? (isDark ? "#38bdf8" : "#2684c7") : (isDark ? "#fca5a5" : "#d0342c"); c.lineWidth = 2; c.beginPath(); c.arc(sp.x, sp.y, 7, 0, Math.PI * 2); c.stroke(); c.restore();
    });
    profileInfo.branchPoints.forEach(function (p) {
      var sp = toPx(p.x, p.y);
      c.save(); c.fillStyle = isDark ? "#fca5a5" : "#d0342c"; c.translate(sp.x, sp.y); c.rotate(Math.PI / 4); c.fillRect(-5, -5, 10, 10); c.restore();
    });
    c.save();
    if (projected) { c.shadowColor = "rgba(2,8,23,.9)"; c.shadowBlur = 3; }
    drawSketchDimensions(c, sketch, E.scl, toPx, conflicts, { selectedId: E.dimSel, isDark: isDark, unit:modelLengthUnit() });
    drawConstraintGlyphs(c, sketch, toPx, conflicts, { isDark: isDark });
    c.restore();
    if (refused) {
      var tagged = [];
      (sketch.constraints || []).forEach(function (constraint) {
        if (refused.indexOf(constraint.id) >= 0) tagged.push.apply(tagged, relationTargets(sketch, constraint));
      });
      drawNameTags(c, sketch, toPx, tagged, sketchInstanceNames(sketch, instanceLabels()));
    }
  }

  // in-progress arc: centre→start fixes the radius; the third point selects
  // the same positive UV sweep that addSketchArc commits.
  if (E.arcTangent && E.arcPts && E.arcPts.length === 1 && E._mouse) {
    c.save(); c.strokeStyle="#2684c7"; c.setLineDash([5,4]); c.beginPath();
    var tangentPreview=tangentArc(E.arcPts[0], E.arcPts[0].tangent, E._mouse);
    if(tangentPreview) {
      var taStart=Math.atan2(tangentPreview.start.v-tangentPreview.centre.v,tangentPreview.start.u-tangentPreview.centre.u);
      var taEnd=Math.atan2(tangentPreview.end.v-tangentPreview.centre.v,tangentPreview.end.u-tangentPreview.centre.u);
      pathUvCircleArc(c,{x:tangentPreview.centre.u,y:tangentPreview.centre.v},tangentPreview.radius,taStart,positiveArcSweep(taStart,taEnd),false);
    } else {
      var taA=toPx(E.arcPts[0].u,E.arcPts[0].v),taB=toPx(E._mouse.u,E._mouse.v);
      c.moveTo(taA.x,taA.y);c.lineTo(taB.x,taB.y);
    }
    c.stroke();c.restore();
  } else if (E.arcThreePoint && E.arcPts && E.arcPts.length && E._mouse) {
    c.save(); c.strokeStyle="#2684c7"; c.setLineDash([5,4]); c.beginPath();
    var previewArc=E.arcPts.length===2 ? threePointArc(E.arcPts[0],E.arcPts[1],E._mouse) : null;
    if(previewArc) {
      var paStart=Math.atan2(previewArc.start.v-previewArc.centre.v,previewArc.start.u-previewArc.centre.u);
      var paEnd=Math.atan2(previewArc.end.v-previewArc.centre.v,previewArc.end.u-previewArc.centre.u);
      pathUvCircleArc(c,{x:previewArc.centre.u,y:previewArc.centre.v},previewArc.radius,paStart,positiveArcSweep(paStart,paEnd),false);
    } else {
      var paA=toPx(E.arcPts[0].u,E.arcPts[0].v),paB=toPx(E._mouse.u,E._mouse.v);
      c.moveTo(paA.x,paA.y);c.lineTo(paB.x,paB.y);
    }
    c.stroke();c.restore();
  } else if (E.arcPts && E.arcPts.length && E._mouse) {
    var arcCentre = E.arcPts[0], ac = toPx(arcCentre.u, arcCentre.v);
    var ar = E.arcPts.length > 1
      ? Math.hypot(E.arcPts[1].u - arcCentre.u, E.arcPts[1].v - arcCentre.v)
      : Math.hypot(E._mouse.u - arcCentre.u, E._mouse.v - arcCentre.v);
    c.save(); c.strokeStyle = "#2684c7"; c.setLineDash([5, 4]);
    c.beginPath();
    if (E.arcPts.length > 1) {
      var arcStart = Math.atan2(E.arcPts[1].v - arcCentre.v, E.arcPts[1].u - arcCentre.u);
      var arcEnd = Math.atan2(E._mouse.v - arcCentre.v, E._mouse.u - arcCentre.u);
      pathUvCircleArc(c, { x:arcCentre.u, y:arcCentre.v }, ar, arcStart, positiveArcSweep(arcStart, arcEnd), false);
    } else {
      pathUvCircleArc(c, { x:arcCentre.u, y:arcCentre.v }, ar, 0, Math.PI * 2, true);
    }
    c.stroke();
    c.fillStyle = "#2684c7"; c.fillRect(ac.x - 3, ac.y - 3, 6, 6);
    c.restore();
  }

  // Connected sketch-line preview. Each committed span is a separate sketch
  // entity; construction spans are dashed and excluded from solid profiles.
  if (E.wallPts && E.wallPts.length && E._mouse) {
    var w0 = E.wallPts[E.wallPts.length - 1], w1 = E._mouse;
    var ws0 = toPx(w0.u, w0.v), ws1 = toPx(w1.u, w1.v);
    c.save();
    c.strokeStyle = E.tool === "constr" ? "#2684c7" : "#18a36b";
    c.lineWidth = 2;
    c.setLineDash([8, 5]);
    c.beginPath(); c.moveTo(ws0.x, ws0.y); c.lineTo(ws1.x, ws1.y); c.stroke();
    c.setLineDash([]);
    c.fillStyle = E.tool === "constr" ? "#2684c7" : "#18a36b";
    c.fillRect(ws0.x - 4, ws0.y - 4, 8, 8);
    var liveL = Math.hypot(w1.u - w0.u, w1.v - w0.v);
    var liveA = (Math.atan2(w1.v - w0.v, w1.u - w0.u) * 180) / Math.PI;
    if (!E.dynInput) c.fillText(Math.round(liveL * 10) / 10 + " cm · " + Math.round(liveA * 10) / 10 + "°", ws1.x + 10, ws1.y - 10);
    c.restore();
  }

  // in-progress slot: centreline, then the full outline once the width is live
  if (E.slotPts && E.slotPts.length && E._mouse) {
    var s0 = E.slotPts[0], s1 = E.slotPts[1] || E._mouse;
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    var sp0 = toPx(s0.u, s0.v), sp1 = toPx(s1.u, s1.v);
    c.beginPath(); c.moveTo(sp0.x, sp0.y); c.lineTo(sp1.x, sp1.y); c.stroke();
    if (E.slotPts.length > 1) {
      var halfW = pointToLineDistance(E._mouse, s0, s1);
      c.setLineDash([]);
      strokeSlotOutline(c, s0, s1, halfW);
    }
    c.fillStyle = "#2684c7"; c.fillRect(sp0.x - 3, sp0.y - 3, 6, 6);
    c.restore();
  }

  if(E.splinePts?.length){
    c.save();c.strokeStyle="#2684c7";c.fillStyle="#2684c7";c.setLineDash([5,4]);c.beginPath();
    var cp=E.splinePts.map(p=>toPx(p.x,p.y));cp.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y);c.fillRect(p.x-3,p.y-3,6,6);});
    if(E._mouse){var end=toPx(E._mouse.u,E._mouse.v);c.lineTo(end.x,end.y);if(cp.length===3){c.stroke();c.setLineDash([]);c.beginPath();c.moveTo(cp[0].x,cp[0].y);c.bezierCurveTo(cp[1].x,cp[1].y,cp[2].x,cp[2].y,end.x,end.y);}}
    c.stroke();c.restore();
  }
  // in-progress ellipse: major axis, then the curve once the minor is live
  if (E.ellPts && E.ellPts.length && E._mouse) {
    var e0 = E.ellPts[0], e1 = E.ellPts[1] || E._mouse;
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    var ep0 = toPx(e0.u, e0.v), ep1 = toPx(e1.u, e1.v);
    c.beginPath(); c.moveTo(ep0.x, ep0.y); c.lineTo(ep1.x, ep1.y); c.stroke();
    if (E.ellPts.length > 1) {
      c.setLineDash([]);
      c.beginPath();
      pathEllipse(c, {
        center: { x: e0.u, y: e0.v },
        rx: Math.hypot(e1.u - e0.u, e1.v - e0.v),
        ry: Math.max(0.01, pointToLineDistance(E._mouse, e0, e1)),
        rot: Math.atan2(e1.v - e0.v, e1.u - e0.u),
      });
      c.stroke();
    }
    c.fillStyle = "#2684c7"; c.fillRect(ep0.x - 3, ep0.y - 3, 6, 6);
    c.restore();
  }

  if(E.quickAction==="modeledgeoffset" && E.offsetPreview){
    c.save();c.strokeStyle="#2684c7";c.lineWidth=2;c.setLineDash([6,4]);
    E.offsetPreview.radii.forEach(function(radius){if(fin(radius)&&radius>1e-6){c.beginPath();strokeUvCircle(c,E.offsetPreview.x,E.offsetPreview.y,radius);c.stroke();}});
    c.restore();
  }

  // in-progress polygon: the n-gon the release will actually build
  if (E.tool === "spoly" && E.drag && E.drag.mode === "spoly" && E._mouse) {
    var pc = { u: E.drag.u, v: E.drag.v };
    var pr = Math.hypot(E._mouse.u - pc.u, E._mouse.v - pc.v);
    var pa = Math.atan2(E._mouse.v - pc.v, E._mouse.u - pc.u);
    c.save(); c.strokeStyle = "#2684c7"; c.lineWidth = 1.5;
    c.beginPath();
    for (var pk = 0; pk <= E.polySides; pk++) {
      var pang = pa + (pk * Math.PI * 2) / E.polySides;
      var pp = toPx(pc.u + Math.cos(pang) * pr, pc.v + Math.sin(pang) * pr);
      if (!pk) c.moveTo(pp.x, pp.y); else c.lineTo(pp.x, pp.y);
    }
    c.stroke();
    c.setLineDash([4, 4]); c.strokeStyle = "rgba(38,132,199,.5)";
    c.beginPath();
    strokeUvCircle(c, pc.u, pc.v, pr);
    c.stroke();
    c.restore();
  }

  // in-progress polygon (green = add material, red dashed = cut)
  var cutting = E.tool === "cut" || E.tool === "cutc";
  if (E.poly && E.poly.length) {
    c.strokeStyle = cutting ? "#c03030" : "#30a060";
    c.lineWidth = 2;
    if (cutting) c.setLineDash([5, 4]);
    c.beginPath();
    E.poly.forEach(function (q, i) {
      var s = toPx(q.u, q.v);
      if (i === 0) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
    });
    if (E._mouse) { var m = toPx(E._mouse.u, E._mouse.v); c.lineTo(m.x, m.y); }
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = cutting ? "#c03030" : "#30a060";
    E.poly.forEach(function (q) { var s = toPx(q.u, q.v); c.fillRect(s.x - 3, s.y - 3, 6, 6); });
  }
  // rubber band for rect/circle/bore — UV corners/circle, then toPx, so the
  // preview is the shape that will land even from an isometric camera
  if (E.drag && (E.drag.mode === "draw" || E.drag.mode === "srect" || E.drag.mode === "scirc") && E._mouse) {
    c.strokeStyle = cutting ? "#c03030" : "#30a060";
    c.lineWidth = 1.5;
    if (cutting) c.setLineDash([5, 4]);
    c.beginPath();
    if (E.tool === "rect" || E.tool === "srect") strokeUvRect(c, E.drag.u, E.drag.v, E._mouse.u, E._mouse.v);
    else strokeUvCircle(c, E.drag.u, E.drag.v, Math.hypot(E._mouse.u - E.drag.u, E._mouse.v - E.drag.v));
    c.stroke();
    c.setLineDash([]);
  }
  // OSNAP marker: □ endpoint, △ midpoint, ○ center, ◇ quadrant, ✛ origin
  if (E._osnap) {
    var sp = toPx(E._osnap.u, E._osnap.v), k = E._osnap.k;
    c.strokeStyle = "#c8a018";
    c.lineWidth = 2;
    c.beginPath();
    if (k === "e") c.rect(sp.x - 5, sp.y - 5, 10, 10);
    else if (k === "m") { c.moveTo(sp.x, sp.y - 6); c.lineTo(sp.x + 6, sp.y + 5); c.lineTo(sp.x - 6, sp.y + 5); c.closePath(); }
    else if (k === "c") c.arc(sp.x, sp.y, 6, 0, 7);
    else if (k === "q") { c.moveTo(sp.x, sp.y - 6); c.lineTo(sp.x + 6, sp.y); c.lineTo(sp.x, sp.y + 6); c.lineTo(sp.x - 6, sp.y); c.closePath(); }
    else { c.moveTo(sp.x - 7, sp.y); c.lineTo(sp.x + 7, sp.y); c.moveTo(sp.x, sp.y - 7); c.lineTo(sp.x, sp.y + 7); }
    c.stroke();
    if (k === "h" || k === "v") {
      c.fillStyle = "#c8a018"; c.font = "700 11px sans-serif";
      c.fillText(k === "h" ? "H" : "V", sp.x + 8, sp.y - 8);
    }
  }
  if (E.drag && E.drag.mode === "box") {
    var bx = Math.min(E.drag.x0, E.drag.x1), by = Math.min(E.drag.y0, E.drag.y1);
    var bw = Math.abs(E.drag.x1 - E.drag.x0), bh = Math.abs(E.drag.y1 - E.drag.y0);
    c.save();
    c.strokeStyle = boxSelectMode(E.drag.x0, E.drag.x1) === "enclosed" ? "#2684c7" : "#c07020";
    c.fillStyle = c.strokeStyle;
    c.globalAlpha = 0.12;
    c.fillRect(bx, by, bw, bh);
    c.globalAlpha = 1;
    c.setLineDash(boxSelectMode(E.drag.x0, E.drag.x1) === "enclosed" ? [] : [5, 4]);
    c.strokeRect(bx, by, bw, bh);
    c.restore();
  }

  drawModelerTouchPrecision(c);
  // typed length/angle/size, last so nothing is drawn over the numbers
  if (E._mouse) {
    var hud = toPx(E._mouse.u, E._mouse.v);
    dynDrawHud(c, hud.x, hud.y);
  }
}

function drawModelerTouchPrecision(c) {
  var tc = E.touchPrecision;
  if (!tc || !E.cv) return;
  drawTouchPrecisionLens(c, E.cv, tc, {
    color: "#2684c7", crosshair: "#e05a46", background: "rgba(246,249,252,.98)",
    distances: modelerTouchDistances(tc), unitLabel: getDomainUnit("details"), handedness:getTouchPrecisionPrefs().handedness,
  });
  c.save();
  c.strokeStyle = "rgba(38,132,199,.68)";
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(tc.ox, tc.oy, 5, 0, Math.PI * 2); c.stroke();
  c.restore();
}

function modelerTouchDistances(tc) {
  var segments = [];
  function addScreenLoop(points, closed) {
    if (!points || points.length < 2) return;
    for (var i = 1; i < points.length; i++) segments.push({ a: points[i - 1], b: points[i] });
    if (closed) segments.push({ a: points[points.length - 1], b: points[0] });
  }
  function addUvLoop(points, closed) {
    addScreenLoop((points || []).map(function (point) {
      return toPx(point.u == null ? point.x : point.u, point.v == null ? point.y : point.v);
    }), closed);
  }
  function addEllipse(center, rx, ry, rotation, start, sweep) {
    var points = [], steps = 48;
    for (var i = 0; i <= steps; i++) {
      var angle = start + sweep * i / steps;
      var x = Math.cos(angle) * rx, y = Math.sin(angle) * ry;
      points.push(toPx(
        center.x + x * Math.cos(rotation) - y * Math.sin(rotation),
        center.y + x * Math.sin(rotation) + y * Math.cos(rotation),
      ));
    }
    addScreenLoop(points, false);
  }

  /* Flat model outlines are visible objects too, not just sketch entities. */
  if (!sketchProjection()) {
    (E.def.parts || []).forEach(function (part) {
      var shape = partUV(part);
      if (!shape) return;
      if (shape.type === "rect") addUvLoop([
        { u: shape.u0, v: shape.v0 }, { u: shape.u1, v: shape.v0 },
        { u: shape.u1, v: shape.v1 }, { u: shape.u0, v: shape.v1 },
      ], true);
      else if (shape.type === "circle") addEllipse({ x: shape.u, y: shape.v }, shape.r, shape.r, 0, 0, Math.PI * 2);
      else if (shape.type === "segments") (shape.segments || []).forEach(function (segment) {
        addUvLoop([segment.a, segment.b], false);
      });
      else {
        addUvLoop(shape.pts, true);
        (shape.holes || part.holes || []).forEach(function (hole) { addUvLoop(holeLoop(hole), true); });
      }
    });
  }

  var sketch = ensureSketch(E.def);
  if (sketch) {
    var points = new Map((sketch.points || []).map(function (point) { return [point.id, point]; }));
    (sketch.entities || []).forEach(function (entity) {
      if (entity.type === "line") {
        var line = lineData(entity, points);
        if (line) addUvLoop([line.a, line.b], false);
        return;
      }
      if (entity.type === "ellipse") {
        var ellipse = ellipseData(entity, points);
        if (ellipse) addEllipse(ellipse.center, ellipse.rx, ellipse.ry, ellipse.rot, 0, Math.PI * 2);
        return;
      }
      var circle = circleData(entity, points);
      if (!circle) return;
      var start = entity.type === "arc" ? circle.start : 0;
      var sweep = entity.type === "arc"
        ? ((circle.end - circle.start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
        : Math.PI * 2;
      addEllipse(circle.center, circle.radius, circle.radius, 0, start, sweep || Math.PI * 2);
    });
  }
  return directionalSegmentDistances(tc.ox, tc.oy, segments, E.scl, 6);
}

/* The slot outline as a path: two parallel sides and two half-circle caps —
   the same shape addSketchSlot builds, so the preview cannot promise geometry
   the commit will not produce. */
function strokeSlotOutline(c, a, b, halfWidth) {
  var dx = b.u - a.u, dy = b.v - a.v, span = Math.hypot(dx, dy);
  if (span < 1e-6 || halfWidth < 1e-6) return;
  // sampled in model space and projected point by point: half the views mirror
  // v, and a canvas arc drawn from an assumed sweep direction caps the wrong end
  var dir = Math.atan2(dy, dx), loop = [];
  var cap = function (centre, from) {
    for (var i = 0; i <= 12; i++) {
      var ang = from + (i / 12) * Math.PI;
      loop.push({ u: centre.u + Math.cos(ang) * halfWidth, v: centre.v + Math.sin(ang) * halfWidth });
    }
  };
  cap(b, dir - Math.PI / 2);
  cap(a, dir + Math.PI / 2);
  c.beginPath();
  loop.forEach(function (p, i) {
    var s = toPx(p.u, p.v);
    if (!i) c.moveTo(s.x, s.y); else c.lineTo(s.x, s.y);
  });
  c.closePath();
  c.stroke();
}

function hitPart(uv, pointerType) {
  // Sketch geometry sits on top of the solids it will become, and is thinner,
  // so it gets first refusal on every pick.
  var sk = hitSketch(uv, pointerType);
  if (sk) return sk;
  // topmost part whose footprint contains uv
  for (var i = E.def.parts.length - 1; i >= 0; i--) {
    var p = E.def.parts[i], f = partUV(p);
    if (f.type === "rect") {
      if (uv.u >= Math.min(f.u0, f.u1) && uv.u <= Math.max(f.u0, f.u1) && uv.v >= Math.min(f.v0, f.v1) && uv.v <= Math.max(f.v0, f.v1)) return p;
    } else if (f.type === "circle") {
      if (Math.hypot(uv.u - f.u, uv.v - f.v) <= f.r) return p;
    } else if (f.type === "segments") {
      var edgeTolerance=(pointerType === "touch" ? 12 : 6)/E.scl;
      if(f.segments.some(function(segment){return pointToLineDistance(uv,segment.a,segment.b)<=edgeTolerance;}))return p;
      if(f.bounds && uv.u>=f.bounds.u0&&uv.u<=f.bounds.u1&&uv.v>=f.bounds.v0&&uv.v<=f.bounds.v1)return p;
    } else {
      var inside = false, pts = f.pts;
      for (var a = 0, b = pts.length - 1; a < pts.length; b = a++) {
        if (pts[a].v > uv.v !== pts[b].v > uv.v &&
          uv.u < ((pts[b].u - pts[a].u) * (uv.v - pts[a].v)) / (pts[b].v - pts[a].v) + pts[a].u) inside = !inside;
      }
      if (inside) return p;
    }
  }
  return null;
}

/* Evaluate results (mass, standards, interference, BOM) and the failures that
   have to be read word for word. These used to be native `alert()`s, which
   block the event loop — the WebGPU viewport freezes mid-frame behind them —
   and look nothing like the rest of the editor. Same dialog chrome as the
   reference picker; Esc and the backdrop dismiss it. */
function report(kicker, title, body) {
  var host = root && root.querySelector("#mdReport");
  if (!host) { flash(title); return; }
  host.querySelector("#mdUnqualifiedDraftExport")?.remove();
  host.querySelector("#mdExpectedContacts")?.remove();
  root.querySelector("#mdReportKicker").textContent = kicker;
  root.querySelector("#mdReportTitle").textContent = title;
  var pre = root.querySelector("#mdReportBody");
  var pick = root.querySelector("#mdPickList");
  if (pick) { pick.hidden = true; pick.innerHTML = ""; }
  if (pre) { pre.hidden = false; pre.textContent = Array.isArray(body) ? body.join("\n") : String(body || ""); }
  host.hidden = false;
}

function showPickList(kicker, title, items, onPick, extra) {
  extra = extra || {};
  var host = root && root.querySelector("#mdReport");
  if (!host) { flash(title); return; }
  host.querySelector("#mdUnqualifiedDraftExport")?.remove();
  host.querySelector("#mdExpectedContacts")?.remove();
  root.querySelector("#mdReportKicker").textContent = kicker;
  root.querySelector("#mdReportTitle").textContent = title;
  var pre = root.querySelector("#mdReportBody");
  var pick = root.querySelector("#mdPickList");
  var toolbar = root.querySelector("#mdPickToolbar");
  var search = root.querySelector("#mdPickSearch");
  var back = root.querySelector("#mdPickBack");
  if (pre) { pre.hidden = true; pre.textContent = ""; }
  if (!pick) { flash(title); return; }
  pick.hidden = false;
  var showToolbar = extra.searchable || typeof extra.onBack === "function";
  if (toolbar) toolbar.hidden = !showToolbar;
  if (back) {
    back.hidden = typeof extra.onBack !== "function";
    back.textContent = t("guideBack");
    back.onclick = extra.onBack || null;
  }
  function paintItems(filterText) {
    pick.textContent = "";
    var visible = items || [];
    if (extra.searchable) {
      var query = String(filterText || "").trim();
      if (typeof extra.filter === "function") visible = extra.filter(query, items || []);
      else if (query) {
        var lower = query.toLowerCase();
        visible = (items || []).filter(function (item) {
          return [item.label, item.hint, item.kind, item.size, item.key].join(" ").toLowerCase().indexOf(lower) >= 0;
        });
      }
    }
    visible.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "md-reference-option";
      var wrap = document.createElement("span");
      var label = document.createElement("b");
      label.textContent = item.label == null ? "" : String(item.label);
      wrap.appendChild(label);
      if (item.hint) {
        var hint = document.createElement("small");
        hint.textContent = String(item.hint);
        wrap.appendChild(hint);
      }
      button.appendChild(wrap);
      button.addEventListener("click", function () { closeReport(); onPick(item); });
      pick.appendChild(button);
    });
  }
  if (search) {
    search.hidden = !extra.searchable;
    search.placeholder = t("toolboxSearch");
    if (!extra.searchable) {
      search.value = "";
      search.oninput = null;
    } else {
      search.oninput = function () { paintItems(search.value); };
      if (extra.searchValue != null) search.value = extra.searchValue;
    }
  }
  paintItems(search && extra.searchable ? search.value : "");
  host.hidden = false;
  if (search && extra.searchable) search.focus();
}

function closeReport() {
  var host = root && root.querySelector("#mdReport");
  if (host) host.hidden = true;
}

function reportOpen() {
  var host = root && root.querySelector("#mdReport");
  return !!(host && !host.hidden);
}

/* A flashed message owns #mdHint for as long as it is on screen. It has to say
   so, because almost every command ends in refreshAll() -> syncTools() ->
   syncHint(), and syncHint rewrites that same element from the active tool —
   so the answer to "what did that command do?" was being overwritten in the
   same tick it was written. syncHint honours FLASH_MS, which is why callers no
   longer have to flash after the refresh. */
var FLASH_MS = 1800;
// `holdMs` keeps a sentence up long enough to read; a one-word hint needs less
function flash(msg, holdMs) {
  var hint = root && root.querySelector("#mdHint");
  if (!hint) return;
  var hold = holdMs || FLASH_MS;
  hint.textContent = msg;
  hint.classList.add("live", "flash");
  E.flashUntil = Date.now() + hold;
  // a held message is a sentence (a refusal naming relations): let it wrap
  hint.classList.toggle("wrap", !!holdMs);
  clearTimeout(E._flashT);
  E._flashT = setTimeout(function () { E.flashUntil = 0; hint.classList.remove("flash", "wrap"); syncTools(); }, hold);
}

// Whether a flashed message is still within its display window.
function flashHolding() {
  return !!(E.flashUntil && Date.now() < E.flashUntil);
}

async function finishPoly() {
  if (E.poly && E.poly.length >= 3 && E.tool === "rev") {
    pushUndo(t("opRevolve"));
    E.sel = addPart({
      id: uid(), kind: "rev", name: "revolve",
      x: 0, z: 0, seg: 32,
      pts: E.poly.map(function (q) { return { u: q.u, v: q.v }; }),
      color: "#b89a6e", metal: 0.08, rough: 0.7,
    });
    E.poly = null;
    refreshAll();
    return;
  }
  if (E.poly && E.poly.length >= 3 && E.tool === "cut") {
    pushUndo(t("opCut"));
    flash(((await applyCut(E.poly)) ? t("cutDone") : t("cutNone")) + cutSkipNote());
    E.poly = null;
    refreshAll();
    return;
  }
  if (E.poly && E.poly.length >= 3) {
    pushUndo(t("opExtrude"));
    var frame=activeSketchFrame(), ax = frame ? "frame" : axisOfView();
    E.sel = addPart({
      id: uid(), kind: "ext", axis: ax, frame:frame ? cloneData(frame) : undefined,
      from: E.baseOff, to: E.baseOff + E.depth,
      pts: E.poly.map(function (q) { return { u: q.u, v: q.v }; }),
      color: "#b89a6e", metal: 0.08, rough: 0.7, name: "extrude",
    });
  }
  E.poly = null;
  refreshAll();
}

/* A cheap fingerprint of everything the profile analysis reads. Any real edit
   moves a point, changes a radius, or adds/removes an entity, and all of those
   land here — so a matching fingerprint means the analysis would return the
   same answer. */
function sketchFingerprint(sketch, selectedIds) {
  var h = 2166136261;
  var mix = function (n) { h = Math.imul(h ^ ((n | 0) + 0x9e3779b9), 16777619) >>> 0; };
  var mixText = function (s) { s = String(s ?? ""); mix(s.length); for (var i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  var mixPoint = function (p) {
    if (p && typeof p === "object") { mixText(p.x); mixText(p.y); }
    else mixText(p);
  };
  mix(sketch.points.length); mix(sketch.entities.length);
  sketch.points.forEach(function (p) { mix(p.x * 1000); mix(p.y * 1000); });
  sketch.entities.forEach(function (e) {
    mixText(e.id); mixText(e.type || "");
    mixPoint(e.a); mixPoint(e.b); mixPoint(e.c);
    mixPoint(e.p); mixPoint(e.center); mixPoint(e.h1); mixPoint(e.h2);
    if (Array.isArray(e.pts)) { mix(e.pts.length); e.pts.forEach(mixPoint); }
    mix((e.radius || 0) * 1000);
    mix(e.construction ? 1 : 0);
    mix((e.r || 0) * 1000); mix((e.rx || 0) * 1000); mix((e.ry || 0) * 1000); mix((e.rot || 0) * 1000);
  });
  (selectedIds || []).forEach(mixText);
  return h;
}
var profileMemo = { sketch: null, key: 0, value: null };

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

var regionMemo = { sketch:null, key:0, scope:"", value:null };
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

var featureAreaMemo = { sketch:null, key:0, scope:"", value:null };
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
