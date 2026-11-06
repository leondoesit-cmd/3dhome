/* The CAD editor's imported bundles, exploded views, motion studies,
   interference checks and assembly drawing/BOM/3MF/STEP outputs, split out of
   js/modeler.js. It shares the editor's state through live imports from
   ../modeler.js. */
import { hasSingleToolboxKernelRecipe } from "../cad_assembly_toolbox.js";
import { measureAngleBetweenNormals, measureDistance } from "../cad_evaluate.js";
import { addExplodeStep, applyExplodedView, assemblyHasExplodedOffsets, createExplodedView, defaultExplodeLayout, explodeTargets } from "../cad_exploded_view.js";
import { releaseRegeneration } from "../cad_feature_tree.js";
import { detectInterference } from "../cad_interference.js";
import { disposeBrep, placeBrep } from "../cad_kernel.js";
import { rotationOf } from "../cad_mate_model.js";
import { addGearRelation, addLinearMotor, addRackPinionMotor, addRotaryMotor, addScrewMotor, captureMotionStudyBaseline, createMotionStudy, evaluateMotionStudy } from "../cad_motion_study.js";
import { createProjectBundle, exportProjectBundle, importProjectBundle, importProjectBundleText } from "../cad_project_bundle.js";
import { auditStandardParts } from "../cad_standards.js";
import { contactAuditSummary, expectedContactFor, recordExpectedContact, removeExpectedContact } from "../core/assembly_contact_audit.js";
import { assemblyInterferenceScope } from "../core/assembly_interference_scope.js";
import { boundsAtPlacement, flattenAssembly } from "../core/assembly_structure.js";
import { assemblyPrintInCadWorker, cadWorkerAvailable, interferenceInCadWorker, regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { interferenceVolumeLabel } from "../core/interference_volume_label.js";
import { compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { readProjectBundleUrl } from "../core/project_bundle_url.js";
import { interferenceDocument } from "../core/worker_interference.js";
import { getLang } from "../i18n.js";
import { cloneData, normalizeTransform } from "../modeler_part_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { openQuickForm, syncCommandManager } from "../modeler/command_manager.js";
import { componentLabel, rejectFlexibleSpringPreview, syncFlexibleSpringsAtMotionState } from "../modeler/component_mates.js";
import { currentHistoryNode, pushUndo } from "../modeler/document_history.js";
import { openExplodedPlayback, openImportedBundle, openMotionPlayback, showMassProperties } from "../modeler/document_io.js";
import { flash, report } from "../modeler/drawing_sheet.js";
import { btn, el } from "../modeler/editor_dom.js";
import { downloadBytes, evalCardActions, openEvalCard } from "../modeler/export_measure.js";
import { invalidateInterference } from "../modeler/library_assembly_state.js";
import { setMode, syncHead } from "../modeler/library_io.js";
import { updatePreview } from "../modeler/library_panel.js";
import { activeParts, componentDef, defBounds } from "../modeler/library_store.js";
import { syncHint } from "../modeler/sketch_entities.js";
import { modelLengthText, modelLengthUnit, syncAssemblyWorkflow } from "../modeler/sketch_workflow.js";
import { resolveTopologyPick } from "../modeler/topology_pick.js";
import { fitPreview } from "../modeler/view_modes.js";
import { fin } from "../state.js";
import { THREE } from "../three_lazy.js";
import { E, H, explodedPlaybackStop, refreshAll, root } from "../modeler.js";

/* Closing the card ends whatever was writing into it — a measurement in
   progress has no other readout, so its close button is the card's. */
function closeEvalCard() {
  var host = root && root.querySelector("#mdEvalCard");
  if (host) host.hidden = true;
  var owner = E.evalCard;
  E.evalCard = null;
  if (owner === "mass") E.massEvaluation=null;
  if (owner === "measure") endMeasure();
  if (owner === "interference") cancelInterferenceCheck();
}

function evalRow(host, label, value) {
  var row = el("div", "md-eval-row");
  row.appendChild(el("span", "", label));
  row.appendChild(el("b", "", value));
  host.appendChild(row);
  return row;
}

function massEvaluationChanged(evaluation) {
  return evaluation.type!==E.docType || evaluation.document!==(E.docType==="assembly"?E.assembly:E.def)
    || evaluation.node!==currentHistoryNode() || evaluation.editRevision!==(E.massEditRevision || 0);
}

function syncMassPropertiesEvaluation() {
  if(E.evalCard!=="mass" || !E.massEvaluation || !massEvaluationChanged(E.massEvaluation))return;
  void showMassProperties();
}

/* ---- Measure ----
   cad_evaluate.js has done the arithmetic all along; what was missing was a
   way to hand it two points. Picks come from the same resolveTopologyPick()
   the selection uses, so Measure can reach exactly what the rest of the editor
   can pick — and an edge answers with a vertex or a circle centre rather than
   with the point under the cursor, which is what makes "corner to corner" and
   "hole to hole" two-click answers. */
function beginMeasure(mode) {
  if (E.mode !== "3d") setMode("3d");
  E.measure = { mode: mode === "faces" ? "faces" : "points", picks: [] };
  renderMeasureCard();
  flash(t(E.measure.mode === "faces" ? "measureFacesHint" : "measureHint"));
  syncCommandManager();
}

function endMeasure() {
  if (!E.measure) return;
  E.measure = null;
  syncCommandManager();
  syncHint();
}

function measureCoordinates(pick) {
  return "X " + modelLengthText(pick.x,8) + "   Y " + modelLengthText(pick.y,8) + "   Z " + modelLengthText(pick.z,8) + " " + modelLengthUnit();
}

function renderMeasureCard() {
  var measure = E.measure;
  if (!measure) return;
  var body = openEvalCard("measure", t("cmdEvaluate"), t("measureTool"));
  if (!body) return;
  var faces = measure.mode === "faces";
  body.appendChild(el("div", "md-note", t(faces ? "measureFacesHint" : "measureHint")));
  [0, 1].forEach(function (index) {
    var pick = measure.picks[index];
    var label = faces ? (index ? t("measureFaceB") : t("measureFaceA")) : (index ? t("measurePointB") : t("measurePointA"));
    evalRow(body, label, !pick ? "—"
      : faces ? pick.label
      : measureCoordinates(pick) + (pick.snap ? " · " + pick.snap : ""));
  });
  if (measure.picks.length === 2) {
    if (faces) {
      evalRow(body, t("measureAngle"), measureAngleBetweenNormals(measure.picks[0].normal, measure.picks[1].normal) + "°");
    } else {
      var span = measureDistance(measure.picks[0], measure.picks[1]);
      evalRow(body, t("measureLength"), modelLengthText(span.distance,10) + " " + modelLengthUnit());
      evalRow(body, "ΔX / ΔY / ΔZ", [span.dx,span.dy,span.dz].map(value=>modelLengthText(value,10)).join(" / ") + " " + modelLengthUnit());
    }
  }
  var actions = evalCardActions();
  if (!actions) return;
  [["points", t("measureModePoints")], ["faces", t("measureModeFaces")]].forEach(function (entry) {
    var button = btn(entry[1], function () { beginMeasure(entry[0]); }, measure.mode === entry[0] ? "on" : "");
    actions.appendChild(button);
  });
  actions.appendChild(btn('<i class="ph ph-arrow-counter-clockwise"></i> ' + t("measureReset"), function () {
    E.measure.picks = [];
    renderMeasureCard();
  }));
}

/* A pick is reported in the picked component's OWN space, and two points
   measured in two components' spaces are not a distance. Both of these bring
   one back out to assembly space; in a part document there is no component and
   they are the identity. */
function measureWorldMatrix(component) {
  var tr = normalizeTransform(component);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(tr.x, tr.y, tr.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler((tr.rx * Math.PI) / 180, (tr.ry * Math.PI) / 180, (tr.rz * Math.PI) / 180)),
    new THREE.Vector3(1, 1, 1)
  );
}

function measureWorldPoint(component, point) {
  if (!component || !point) return point;
  var out = new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(measureWorldMatrix(component));
  return { x: out.x, y: out.y, z: out.z };
}

function measureWorldDirection(component, direction) {
  if (!component || !direction) return direction;
  var out = new THREE.Vector3(direction.x, direction.y, direction.z).transformDirection(measureWorldMatrix(component));
  return { x: out.x, y: out.y, z: out.z };
}

/* The points an edge offers instead of the point the ray hit. A line edge is
   stored as a midpoint, a direction and a length, so both of its ends are
   derivable; a circular edge offers its centre, and offers it unconditionally
   — a hole rim is picked at the rim and measured from the middle. */
function measureSnapCandidates(reference) {
  var descriptor = reference && reference.descriptor, out = [];
  if (!descriptor || !descriptor.origin) return out;
  var origin = descriptor.origin;
  if (descriptor.curve === "circle") {
    out.push({ point: { x: origin.x, y: origin.y, z: origin.z }, snap: t("measureSnapCentre"), always: true });
    return out;
  }
  if (descriptor.curve === "line" && descriptor.axis && fin(Number(descriptor.measure))) {
    var axis = descriptor.axis;
    var length = Math.hypot(axis.x, axis.y, axis.z) || 1;
    var half = Math.abs(Number(descriptor.measure)) / 2;
    [-1, 1].forEach(function (sign) {
      out.push({
        point: {
          x: origin.x + (axis.x / length) * half * sign,
          y: origin.y + (axis.y / length) * half * sign,
          z: origin.z + (axis.z / length) * half * sign,
        },
        snap: t("measureSnapVertex"), always: false,
      });
    });
  }
  return out;
}

function measureFromPick(event, view) {
  var measure = E.measure;
  var found = resolveTopologyPick(event, view, { prefer: measure.mode === "faces" ? "face" : E.selectionFilter }) || {};
  var component = found.component || null;
  var reference = found.reference || null;
  if (measure.mode === "faces") {
    var descriptor = reference && reference.descriptor;
    var normal = descriptor && descriptor.surface === "plane" && descriptor.normal ? descriptor.normal : found.pickNormal;
    if (!normal) { flash(t("measureNeedFace")); return; }
    pushMeasurePick({
      normal: measureWorldDirection(component, normal),
      label: String((reference && (reference.semantic || reference.kind)) || t("measureSnapFace")).replace(/[:_-]+/g, " "),
    });
    return;
  }
  var hits = found.hits || [];
  var hit = found.pickPoint ? measureWorldPoint(component, found.pickPoint)
    : hits.length && hits[0].point ? { x: hits[0].point.x, y: hits[0].point.y, z: hits[0].point.z }
    : null;
  var tolerance = (view && typeof view.worldPerPixel === "function" ? view.worldPerPixel() : .2) * 18;
  var best = null, bestDistance = tolerance;
  (reference && reference.kind === "edge" ? measureSnapCandidates(reference) : []).forEach(function (candidate) {
    var world = measureWorldPoint(component, candidate.point);
    var distance = hit ? Math.hypot(world.x - hit.x, world.y - hit.y, world.z - hit.z) : 0;
    if (candidate.always) { best = { x: world.x, y: world.y, z: world.z, snap: candidate.snap }; bestDistance = -1; return; }
    if (bestDistance >= 0 && distance <= bestDistance) {
      bestDistance = distance;
      best = { x: world.x, y: world.y, z: world.z, snap: candidate.snap };
    }
  });
  if (!best && !hit) { flash(t("measureNothing")); return; }
  pushMeasurePick(best || { x: hit.x, y: hit.y, z: hit.z, snap: "" });
}

function pushMeasurePick(pick) {
  if (E.measure.picks.length >= 2) E.measure.picks = [];
  E.measure.picks.push(pick);
  renderMeasureCard();
}

function standardsGate(action,options) {
  var audit = auditStandardParts({...E.def,parts:activeParts(E.def)});
  E.def.lastStandardsAudit = {at:Date.now(),ok:audit.ok,checked:audit.checked,blocking:audit.blocking};
  if (audit.ok) return true;
  // Authoring drafts must remain recoverable before service qualification.
  // Exact manufacturing exports continue to use the blocking gate below.
  if (action === "Save") return true;
  if(options?.unqualifiedDraft===true){
    E.def.lastUnqualifiedGeometryExport={at:Date.now(),action:action,status:"unqualified-draft",blocking:cloneData(audit.blocking)};
    return true;
  }
  report(t("reportKickerStandards"), tf("auditBlocked", {x: action}), audit.blocking.map(function (i) { return "• " + (i.partName || i.partId) + ": " + i.message; }));
  if(typeof options?.onDraft==="function"){
    var host=root.querySelector("#mdReport"),source=E.def;
    var disclosure=el("div","md-draft-export-disclosure",""),button=el("button","btn-accent","Export unqualified draft");
    disclosure.id="mdUnqualifiedDraftExport";
    disclosure.appendChild(el("p","","Local geometry exchange only. Standards qualification has not passed. The filename will identify an UNQUALIFIED_DRAFT; audit failures remain in the editable document."));
    button.type="button";
    button.addEventListener("click",function(){
      if(E.def!==source){flash("The document changed. Start the export again.");return;}
      host.hidden=true;disclosure.remove();options.onDraft();
    });
    disclosure.appendChild(button);root.querySelector("#mdReportBody").after(disclosure);
  }
  return false;
}

function runStandardsAudit() {
  var audit = auditStandardParts({...E.def,parts:activeParts(E.def)});
  E.def.lastStandardsAudit = {at:Date.now(),ok:audit.ok,checked:audit.checked,blocking:audit.blocking};
  if (!audit.checked) { report(t("reportKickerStandards"), t("auditNothing"), t("auditNothingBody")); return; }
  if (audit.ok) report(t("reportKickerStandards"), t("auditPassed"), audit.checked === 1 ? t("auditPassedBodyOne") : tf("auditPassedBody", {n: audit.checked}));
  else report(t("reportKickerStandards"), t("auditFailed"), audit.blocking.map(function (i) { return "• " + (i.partName || i.partId) + ": " + i.message; }));
}

async function exportBundleDocument() {
  if(rejectFlexibleSpringPreview())return;
  try {
    // A document export carries this document, not the unrelated assembly
    // library (whose embedded exact parts can dwarf a small authored part).
    var bundle = await createProjectBundle(E.def, [], [], {
      activeAssembly:E.docType === "assembly" ? cloneData(E.assembly) : null,
    });
    exportProjectBundle(bundle); flash("✓ " + t("bundleExported"));
  } catch (error) { flash(t("errBundle") + ": " + String(error.message || error)); }
}

function importBundleDocument() {
  var dialog=document.createElement("dialog");dialog.className="md-properties-dialog";
  var title=document.createElement("h3");title.textContent=t("importBundle");dialog.appendChild(title);
  var hint=document.createElement("p");hint.textContent=getLang()==="en"?"Choose a project file or paste its JSON content.":"בחרו קובץ פרויקט או הדביקו את תוכן ה-JSON שלו.";dialog.appendChild(hint);
  var browse=document.createElement("button");browse.type="button";browse.textContent=getLang()==="en"?"Choose bundle file":"בחרו קובץ פרויקט";dialog.appendChild(browse);
  var label=document.createElement("label");label.textContent=getLang()==="en"?"Bundle JSON":"JSON של הפרויקט";
  var text=document.createElement("textarea");text.rows=8;text.style.cssText="width:100%;box-sizing:border-box;font-family:monospace";text.setAttribute("aria-label","Bundle JSON");label.appendChild(text);dialog.appendChild(label);
  var status=document.createElement("p");status.setAttribute("role","status");dialog.appendChild(status);
  var paste=document.createElement("button");paste.type="button";paste.textContent=getLang()==="en"?"Open pasted bundle":"פתחו פרויקט שהודבק";dialog.appendChild(paste);
  var urlLabel=document.createElement("label");urlLabel.textContent=getLang()==="en"?"Project link on this server":"קישור פרויקט בשרת הזה";
  var urlInput=document.createElement("input");urlInput.type="text";urlInput.setAttribute("aria-label","Project link on this server");urlInput.placeholder="/projects/model.mforge";urlInput.style.cssText="width:100%;box-sizing:border-box";urlLabel.appendChild(urlInput);dialog.appendChild(urlLabel);
  var openLink=document.createElement("button");openLink.type="button";openLink.textContent=getLang()==="en"?"Open project link":"פתיחת קישור פרויקט";dialog.appendChild(openLink);
  openLink.addEventListener("click",async function(){
    openLink.disabled=true;status.textContent=getLang()==="en"?"Opening project…":"פותח פרויקט…";
    try{var bundle=await importProjectBundleText(await readProjectBundleUrl(urlInput.value,location.href));dialog.close();await openImportedBundle(bundle);}
    catch(error){var message=t("errBundle")+": "+String(error.message || error);status.textContent=message;openLink.disabled=false;if(!dialog.open)flash(message);}
  });
  var cancel=document.createElement("button");cancel.type="button";cancel.textContent=t("cancel");dialog.appendChild(cancel);
  cancel.addEventListener("click",function(){dialog.close();});
  dialog.addEventListener("close",function(){dialog.remove();},{once:true});
  paste.addEventListener("click",async function(){
    paste.disabled=true;
    try{var bundle=await importProjectBundleText(text.value);dialog.close();await openImportedBundle(bundle);}
    catch(error){var message=t("errBundle")+": "+String(error.message || error);status.textContent=message;paste.disabled=false;if(!dialog.open)flash(message);}
  });
  browse.addEventListener("click",function(){dialog.close();chooseBundleFile();});
  root.appendChild(dialog);dialog.showModal();
}

function chooseBundleFile() {
  var input=document.createElement("input"); input.type="file"; input.accept=".mforge,application/json";
  input.addEventListener("change",async function(){
    var file=input.files && input.files[0]; if (!file) return;
    try {
      var bundle=await importProjectBundle(file);
      await openImportedBundle(bundle);
    } catch(error) { flash(t("errBundle") + ": " + String(error.message || error)); }
  });
  input.click();
}

/* What a discard approval covered: the open document, its history position and
   the command form on screen with its edits. Work that yields after the
   approval compares against this before it replaces the document. */
function documentOwnership() {
  var form = E.quickFormInstance;
  return { open:E.open, type:E.docType, def:E.def, assembly:E.assembly, contextEdit:E.contextEdit, form:form,
    pending:!!form?.hasPendingEdits(), formEdits:form?.editSnapshot(), applying:form?.applying, generation:H.generation, history:currentHistoryNode(),
    edit:H.editRevision(E.contextEdit ? "component" : E.docType) };
}
function documentStillOwned(owner) {
  var now = documentOwnership();
  return Object.keys(owner).every(function (key) { return owner[key] === now[key]; });
}

/* Explode and collapse are the same command. Once the offsets render, a
   one-way explode is a trap: nothing else in the editor puts the components
   back, and the offsets follow the assembly into the saved document. */
function createDefaultExplodedView() {
  if (E.docType !== "assembly" || !E.assembly) return;
  var exploded = assemblyHasExplodedOffsets(E.assembly);
  if (exploded) {
    pushUndo(t("collapseExplodeView"));
    applyExplodedView(E.assembly,null);
    refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true}); fitPreview(); flash("\u2713 " + t("collapseExplodeView"));
    openExplodedPlayback(); return;
  }
  pushUndo(t("explodeView"));
  var saved=(E.assembly.explodedViews || []).find(function(view){return view.id===E.assembly.activeExplodedView;}) || (E.assembly.explodedViews || [])[0];
  if(saved){E.assembly.activeExplodedView=saved.id;applyExplodedView(E.assembly,saved.id,1);refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});fitPreview();flash("✓ "+saved.name);openExplodedPlayback();return;}
  var view = createExplodedView(E.assembly, "Exploded View " + ((E.assembly.explodedViews || []).length + 1));
  var occurrences=flattenAssembly(E.assembly);
  var layout=defaultExplodeLayout(occurrences.map(function(occurrence){return occurrenceWorldBounds(occurrence.component,occurrence.placement);}));
  occurrences.forEach(function (occurrence, index) {
    if (index) addExplodeStep(view, [occurrence.path.map(String).join('/')], layout[index]);
  });
  E.assembly.activeExplodedView = view.id;
  applyExplodedView(E.assembly, view.id, 1); refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true}); fitPreview(); flash("\u2713 " + view.name);
  openExplodedPlayback();
}

function createEmptyExplodedView() {
  if (E.docType !== "assembly" || !E.assembly) return;
  if (explodedPlaybackStop) explodedPlaybackStop();
  pushUndo("New exploded view");
  var view=createExplodedView(E.assembly,"Exploded View " + ((E.assembly.explodedViews || []).length + 1));
  E.assembly.activeExplodedView=view.id;
  applyExplodedView(E.assembly,null);
  refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true});fitPreview();syncHead();
  openExplodedPlayback();
}

/* One explode step at a time, as the book builds its exploded view: pick a
   component, a direction and a distance; the step joins the active exploded
   view (the first step creates it) and the leader line shows the move. */
function openExplodeStepForm() {
  if (E.docType !== "assembly" || !E.assembly || (E.assembly.components || []).length < 2) return;
  var targets=explodeTargets(E.assembly);
  var selected = targets.filter(function(target){return (E.componentSel || []).includes(target.component);}).map(function(target){return target.key;});
  if(!selected.length)selected=[targets[0].key];
  openQuickForm({ action:"explodestep", presentationOnly:true, icon:"ph-arrows-out", title:t("explodeStep"), hint:t("explodeStepHint"), fields:[
    { key:"components", label:t("components"), type:"feature-seeds", value:selected, choices:targets.map(function(target){return {value:target.key,label:target.label};}) },
    { key:"axis", label:t("explodeDirection"), type:"select", value:"z", choices:[{ value:"x", label:"X" }, { value:"y", label:"Y" }, { value:"z", label:"Z" }] },
    { key:"distance", label:t("explodeDistance"), type:"number", unit:"length", value:10, step:.1 },
    { key:"reverse", label:t("explodeReverse"), type:"boolean", value:false },
  ], onApply:function (values) {
    var selectedTargets = targets.filter(function(item){return (values.components || []).includes(item.key);});
    var distance = Number(values.distance) * (values.reverse ? -1 : 1);
    if (!selectedTargets.length || !Number.isFinite(distance) || !distance) { flash(t("explodeStepInvalid")); return false; }
    pushUndo(t("explodeStep"));
    var view = (E.assembly.explodedViews || []).find(function (v) { return v.id === E.assembly.activeExplodedView; });
    if (!view) { view = createExplodedView(E.assembly, "Exploded View " + ((E.assembly.explodedViews || []).length + 1)); E.assembly.activeExplodedView = view.id; }
    var vector = { x:0, y:0, z:0 }; vector[values.axis] = distance;
    addExplodeStep(view, selectedTargets.map(function(target){return target.key;}), vector);
    applyExplodedView(E.assembly, view.id, 1); invalidateInterference(); refreshAll({assemblyPoseOnly:true,skipAssemblySolve:true}); fitPreview();
    flash("✓ " + view.name + " · " + view.steps.length);
    return true;
  } });
}

function motionScrewMateLabel(mate) {
  var labelOf=function(id){var component=E.assembly.components.find(function(item){return String(item.id)===String(id);});return component?.name || component?.modelKey || String(id);};
  if(mate.type==='rackpinion')return (mate.name || t('rackPinionMate'))+' · '+labelOf(mate.a?.componentId)+' → '+labelOf(mate.b?.componentId)
    +' · radius '+modelLengthText(Number(mate.pitchRadius)||0,6)+' '+modelLengthUnit()+' · #'+mate.id;
  var hand=mate.handedness==='lh' || mate.handedness==='left' ? 'LH' : 'RH';
  return (mate.name || 'Screw mate')+' · '+labelOf(mate.a?.componentId)+' ↔ '+labelOf(mate.b?.componentId)
    +' · lead '+modelLengthText(Number(mate.pitch)||0,6)+' '+modelLengthUnit()+'/turn · '+hand+' · #'+mate.id;
}

function assemblyPrintRequests() {
  if(!E.assembly)throw new Error("No assembly is open");
  return flattenAssembly(E.assembly,{visibleOnly:true}).map(function(occurrence){
    var component=occurrence.component,def=componentDef(component),place=occurrence.placement;
    return {id:component.id,occurrenceId:occurrence.path.join("/"),label:occurrence.parents.concat(component).map(function(item){return item.name || item.modelKey || item.assemblyKey || String(item.id);}).join(" / "),
      document:def?.metadata?.authoringSystem==="parametric-v1" && (activeParts(def).length===1 || hasSingleToolboxKernelRecipe(def,activeParts(def)))?interferenceDocument(def):null,
      placement:{matrix:[place.x.x,place.y.x,place.z.x,place.x.y,place.y.y,place.z.y,place.x.z,place.y.z,place.z.z],translation:place.origin}};
  });
}

async function exportAssemblyPrintDocument(settings,format,printDocument) {
  if(rejectFlexibleSpringPreview())return false;
  if(E.docType!=="assembly" || E.assembly!==printDocument)return false;
  try{
    var requests=assemblyPrintRequests(),stamp=JSON.stringify(requests),name=printDocument.name || "Assembly print";
    var result=await assemblyPrintInCadWorker(requests,{...settings,format,name},{onProgress:function(p){flash((p.name || p.stage)+"…");}});
    if(E.docType!=="assembly" || E.assembly!==printDocument || stamp!==JSON.stringify(assemblyPrintRequests()))throw new Error("Assembly changed during export; export again from its current pose");
    pushUndo("Print mesh export settings");printDocument.stlExportSettings=cloneData(settings);
    downloadBytes(result.bytes,name+"."+format,format==="3mf"?"model/3mf":format==="amf"?"application/xml":"model/stl");
    flash("✓ "+format.toUpperCase()+" · "+result.bodies+" exact components · mm · Z-up");return true;
  }catch(error){flash("Assembly print export failed: "+String(error.message || error),6000);return false;}
}
function createDefaultMotionStudy() {
  if (E.docType !== "assembly" || !E.assembly || !E.assembly.components.length) return;
  const show=(studyId,relationId="none",motorType)=>{
    const study=(E.assembly.motionStudies||[]).find(s=>s.id===studyId),motor=study?.motors?.[0];
    motorType ||= motor?.type || "rotary";
    const relation=study?.gearRelations?.find(r=>r.id===relationId);
    const components=E.assembly.components.filter(c=>!c.grounded),choices=components.map(c=>({value:c.id,label:c.name||c.id}));
    const coupledScrews=(E.assembly.topologyMates||[]).filter(m=>m.type==="screw"&&m.coupledMotion);
    const rackMates=(E.assembly.topologyMates||[]).filter(m=>m.type==='rackpinion');
    const coupledMotor=['screw','rackpinion'].includes(motorType),coupledMates=motorType==='rackpinion'?rackMates:coupledScrews;
    if(!components.length){flash(t("motionNeedsMovable"));return;}
    const driver=relation?.driverId||motor?.componentId||E.componentSel[0]?.id||components[0].id;
    const axisName=a=>!a?"y":a.x===1&&a.y===0&&a.z===0?"x":a.z===1&&a.x===0&&a.y===0?"z":a.y===1&&a.x===0&&a.z===0?"y":"custom";
    const axes=["x","y","z"].map(value=>({value,label:value.toUpperCase()}));
    const axisChoices=a=>axisName(a)==="custom"?axes.concat({value:"custom",label:t("motionSavedAxis")}):axes;
    const baselineCaption=!study?t("motionNewDriveBaseline"):Array.isArray(study.nativeDriveConfiguration)?t("motionCapturedDriveBaseline")+" "+study.nativeDriveConfiguration.length:study.nativeDriveConfiguration===undefined?t("motionPoseOnlyBaseline"):t("motionInvalidDriveBaseline");
    openQuickForm({action:"motion",title:t("motionStudy"),hint:(motorType==='rackpinion'?t('rackPinionHint'):motorType==="screw"?"Turn a coupled Screw mate: relative axial travel follows its lead, and the linkage follows the assembly constraints.":t(motorType==="linear" ? "linearMotionHint" : relationId!=="none" || study?.gearRelations?.length ? "gearMotionHint" : "rotaryMotionHint"))+" "+baselineCaption,fields:[
      {key:"study",label:t("motionStudy"),type:"select",value:studyId||"new",choices:[{value:"new",label:t("motionNewStudy")},...(E.assembly.motionStudies||[]).map(s=>({value:s.id,label:s.name}))]},
      {key:"name",label:"Study name",type:"text",value:study?.name||"Motion Study "+((E.assembly.motionStudies||[]).length+1)},
      ...(study ? [{key:"resetZero",label:t("motionResetDriveBaseline"),type:"boolean",value:false},{key:"deleteStudy",label:"Delete this study",type:"boolean",value:false}] : []),
      {key:"motorType",label:t("motionMotorType"),type:"select",value:motorType,choices:[{value:"rotary",label:t("motionRotary")},{value:"linear",label:t("motionLinear")},...(coupledScrews.length?[{value:"screw",label:"Screw mate"}]:[]),...(rackMates.length?[{value:'rackpinion',label:t('rackPinionMate')}]:[])]},
      ...(motorType==="rotary" ? [{key:"relation",label:t("motionRelation"),type:"select",value:relationId,choices:[{value:"none",label:t(study?.gearRelations?.length ? "motionKeepRelations" : "motionMotorOnly")},{value:"new",label:t("motionAddRelation")},...(study?.gearRelations||[]).map(r=>({value:r.id,label:(components.find(c=>c.id===r.driverId)?.name||r.driverId)+" → "+(components.find(c=>c.id===r.followerId)?.name||r.followerId)}))]}] : []),
      ...(coupledMotor?[{key:"screwMate",label:motorType==='rackpinion'?t('rackPinionMate'):"Coupled Screw mate",type:"select",value:motor?.mateId||coupledMates[0]?.id,choices:coupledMates.map(m=>({value:m.id,label:motionScrewMateLabel(m)}))}]:[{key:"motor",label:t("motionMotor"),type:"select",value:motor?.componentId||driver,choices}]),
      ...(motorType==="linear" ? [
      {key:"stroke",label:t("motionStroke"),type:"number",unit:"length",value:motor?.stroke??-1.5,step:.1},
      {key:"duration",label:t("motionTravelDuration"),type:"number",value:motor?.duration??1,min:.001,step:.1},
      {key:"reciprocate",label:t("motionReciprocate"),type:"boolean",value:motor?.reciprocate??false}
      ] : [{key:"rpm",label:t("motionRPM"),type:"number",value:motor?.rpm??12,step:1}]),
      ...(coupledMotor?[]:[{key:"motorAxis",label:t("motionMotorAxis"),type:"select",value:axisName(motor?.axis),choices:axisChoices(motor?.axis)}]),
      ...(motorType==="rotary" ? [
      {key:"pivotX",label:"Pivot X (local)",type:"number",unit:"length",value:motor?.pivot?.x??0,step:.1},
      {key:"pivotY",label:"Pivot Y (local)",type:"number",unit:"length",value:motor?.pivot?.y??0,step:.1},
      {key:"pivotZ",label:"Pivot Z (local)",type:"number",unit:"length",value:motor?.pivot?.z??0,step:.1}
      ] : []),
      ...(motorType==="rotary" && relationId!=="none" ? [
      {key:"driver",label:t("motionDriver"),type:"select",value:driver,choices},
      {key:"follower",label:t("motionFollower"),type:"select",value:relation?.followerId||components.find(c=>c.id!==driver)?.id||driver,choices},
      {key:"driverTeeth",label:t("gearTeeth"),type:"number",value:relation?.driverTeeth??20,min:1,step:1},
      {key:"followerTeeth",label:t("gearMateTeeth"),type:"number",value:relation?.followerTeeth??40,min:1,step:1},
      {key:"driverAxis",label:t("motionDriverAxis"),type:"select",value:axisName(relation?.driverAxis),choices:axisChoices(relation?.driverAxis)},
      {key:"followerAxis",label:t("motionFollowerAxis"),type:"select",value:axisName(relation?.followerAxis),choices:axisChoices(relation?.followerAxis)},
      {key:"mesh",label:t("motionMesh"),type:"select",value:relation?.mesh||"external",choices:[{value:"external",label:t("motionExternal")},{value:"internal",label:t("motionInternal")}]},
      ...(relation ? [{key:"remove",label:t("motionRemoveRelation"),type:"boolean",value:false}] : []),
      ] : []),
      {key:"time",label:t("motionTime"),type:"number",value:study?.time??1,step:.1}
    ],onLive:v=>{if(v.study!==(studyId||"new"))show(v.study);else if(v.motorType && v.motorType!==motorType)show(studyId,"none",v.motorType);else if(motorType==="rotary" && v.relation!==relationId)show(studyId,v.relation,motorType);},onApply:async (v,isCurrent)=>{
      if(v.deleteStudy && study) {
        pushUndo(t("motionStudy"));
        E.assembly.motionStudies=(E.assembly.motionStudies||[]).filter(s=>s.id!==study.id);
        refreshAll();flash("Motion study deleted");return true;
      }
      // HTML selects return strings; occurrence IDs retain their saved type.
      // Resolve the chosen rows before the motion graph's strict ID comparisons.
      const selectedComponentId=value=>E.assembly.components.find(c=>String(c.id)===String(value))?.id;
      const selectedScrewMate=(E.assembly.topologyMates||[]).find(m=>(motorType==='rackpinion'?m.type==='rackpinion':m.type==='screw'&&m.coupledMotion)&&String(m.id)===String(v.screwMate));
      v={...v,motor:selectedComponentId(v.motor),driver:selectedComponentId(v.driver),follower:selectedComponentId(v.follower),screwMate:selectedScrewMate?.id};
      const trial=structuredClone(E.assembly),target=(trial.motionStudies||[]).find(s=>s.id===studyId)||createMotionStudy(trial,"Motion Study "+((trial.motionStudies||[]).length+1));
      if(v.name != null) {
        const name=String(v.name).trim();
        if(!name){flash("Enter a study name");return false;}
        target.name=name;
      }
      if(v.resetZero) {
        delete target.baseRotations;delete target.beltBaselines;
        for(const savedMotor of target.motors||[]) {
          delete savedMotor.baseRotation;delete savedMotor.basePosition;delete savedMotor.baseTurns;
        }
      }
      const axis=(k,saved)=>k==="custom"?saved:({x:k==="x"?1:0,y:k==="y"?1:0,z:k==="z"?1:0});
      if(target.motors[0] && (target.motors[0].componentId!==v.motor || target.motors[0].mateId!==v.screwMate || target.motors[0].type!==motorType)){delete target.motors[0].baseRotation;delete target.motors[0].basePosition;delete target.motors[0].baseTurns;delete target.baseRotations;}
      if(motorType==="linear"){
        if(target.gearRelations?.length){flash(t("linearGearConflict"));return false;}
        if(target.motors.length)Object.assign(target.motors[0],{type:"linear",componentId:v.motor,stroke:v.stroke,duration:v.duration,reciprocate:v.reciprocate,axis:axis(v.motorAxis,motor?.axis)});else addLinearMotor(target,v.motor,v.stroke,v.duration,axis(v.motorAxis,motor?.axis),v.reciprocate);
      }else if(coupledMotor){
        if(!selectedScrewMate){flash(motorType==='rackpinion'?t('rackPinionMate'):"Choose a coupled Screw mate");return false;}
        if(target.gearRelations?.length){flash(t("linearGearConflict"));return false;}
        if(target.motors.length)Object.assign(target.motors[0],{type:motorType,mateId:v.screwMate,rpm:v.rpm});
        else if(motorType==='rackpinion')addRackPinionMotor(target,v.screwMate,v.rpm);
        else addScrewMotor(target,v.screwMate,v.rpm);
      }else {
        const pivot={x:v.pivotX??0,y:v.pivotY??0,z:v.pivotZ??0};
        if(!Object.values(pivot).every(Number.isFinite)){flash("Enter finite local pivot coordinates");return false;}
        if(target.motors.length)Object.assign(target.motors[0],{type:"rotary",componentId:v.motor,rpm:v.rpm,axis:axis(v.motorAxis,motor?.axis),pivot});
        else addRotaryMotor(target,v.motor,v.rpm,axis(v.motorAxis,motor?.axis),pivot);
      }
      if(motorType==="rotary" && relationId!=="none"){
        target.gearRelations=(target.gearRelations||[]).filter(r=>r.id!==relationId);
        if(!v.remove)addGearRelation(target,v.driver,v.follower,{driverTeeth:v.driverTeeth,followerTeeth:v.followerTeeth,mesh:v.mesh,driverAxis:axis(v.driverAxis,relation?.driverAxis),followerAxis:axis(v.followerAxis,relation?.followerAxis)});
      }
      if(v.resetZero)captureMotionStudyBaseline(trial,target);
      const result=evaluateMotionStudy(trial,target.id,v.time);
      if(!result.ok){flash((result.issues||[]).concat(result.unsatisfied||[]).map(i=>i.code).join("; "));return false;}
      pushUndo(t("motionStudy"));
      trial.components.forEach((component,i)=>{E.assembly.components[i].transform=component.transform;});
      if(motorType==="screw"){
        const solvedMate=trial.topologyMates.find(m=>m.id===v.screwMate);
        if(solvedMate?.coupledAxialBasis==="component-origin"){
          selectedScrewMate.coupledAxialBasis=solvedMate.coupledAxialBasis;
          selectedScrewMate.coupledAxial0=solvedMate.coupledAxial0;
          selectedScrewMate.coupledPhase0=solvedMate.coupledPhase0;
        }
      }
      if(motorType==='rackpinion'){
        const solvedMate=trial.topologyMates.find(m=>m.id===v.screwMate);
        selectedScrewMate.pinionRoll0=solvedMate.pinionRoll0;
        selectedScrewMate.rackTravel0=solvedMate.rackTravel0;
      }
      E.assembly.motionStudies=trial.motionStudies;await syncFlexibleSpringsAtMotionState(E.assembly);
      if(isCurrent && !isCurrent())return false;
      invalidateInterference();refreshAll();flash(t("motionStudyAdded"));return true;
    }});
    if(study && typeof root!=="undefined"){
      const actions=root?.querySelector('#mdQuickSettings .md-feature-actions');
      const instance=E.quickFormInstance;
      if(actions)actions.appendChild(btn("Preview saved motion",()=>{if(instance===E.quickFormInstance)openMotionPlayback(study.id);},"md-quick-apply"));
    }
  };
  show(E.assembly.motionStudies?.at(-1)?.id);
}

/* The Evaluate command is explicit, so spend the kernel work needed to answer
   it for feature-built parts. AABB overlap alone can be entirely empty space:
   the BATTERY terminal and BATTERYPLATE holder make their envelopes overlap by
   71.68 cm³ while their exact solids share no material. */
async function exactInterferenceBrep(component, placement, onProgress, options={}) {
  var def=componentDef(component);
  if(def?.metadata?.authoringSystem!=="parametric-v1") return null;
  // finalShape names one feature-tree head; a multi-body document needs each
  // body placed separately before a negative result can be called exact.
  if(activeParts(def).length!==1 && !hasSingleToolboxKernelRecipe(def,activeParts(def))) return null;
  var compiled=compileKernelFeatureTree(def), run=null;
  if(!compiled.ok) return null;
  try {
    run=await regenerateFeatures({...compiled.document,features:compiled.features},{...options,scope:"interference",onProgress});
    if(!run.ok || !run.finalShape?.shape) return null;
    onProgress?.({stage:"placement",name:component.interferenceLabel});
    var transform=component.transform || {};
    return await placeBrep(run.finalShape,{
      matrix:placement ? [
        placement.x.x,placement.y.x,placement.z.x,
        placement.x.y,placement.y.y,placement.z.y,
        placement.x.z,placement.y.z,placement.z.z,
      ] : rotationOf(transform).flat(),
      translation:placement ? placement.origin : {x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0},
    });
  } finally {if(run)releaseRegeneration(run);}
}

function occurrenceWorldBounds(component, placement) {
  var def=componentDef(component);
  if(!def || !activeParts(def).length) return null;
  return boundsAtPlacement(defBounds(def),placement);
}

function cancelInterferenceCheck() {
  var job=E.interferenceJob;
  if(!job)return;
  job.cancelled=true;
  job.controller.abort();
}

async function runInterferenceCheck() {
  if(rejectFlexibleSpringPreview())return;
  if (E.docType !== "assembly" || !E.assembly) return;
  if(E.interferenceJob){flash(E.interferenceJob.stageText || t("interferenceChecking"));return;}
  /* The detector's own fallback only knows boxes, cylinders and spheres and
     ignores rotation, so a feature-built or turned component measured as
     nothing and the check reported a clean assembly. Measure here, where the
     real part bounds live, and hand the result over. Mated position, not
     exploded position — an exploded view is not a clash. */
  var revision = E.interferenceRevision || 0;
  var scope = assemblyInterferenceScope(E.assembly, E.componentSel, flattenAssembly(E.assembly,{visibleOnly:true}));
  var scopeCaption = scope.wholeAssembly ? t("interferenceScopeAll") : tf("interferenceScopeSelected", {names:scope.roots.map(function(component){return component.name || String(component.id);}).join(" · ")});
  var measured = scope.occurrences.map(function (occurrence) {
    var component=occurrence.component;
    return Object.assign({}, component, {
      id:occurrence.path.length===1 ? component.id : occurrence.path.join("/"),
      interferenceLabel:occurrence.parents.concat(component).map(function(item){return item.name || item.modelKey || item.assemblyKey || String(item.id);}).join(" / "),
      placement:occurrence.placement,
      bounds:occurrenceWorldBounds(component,occurrence.placement),
    });
  });
  var labels=new Map(measured.map(function(component){return [component.id,component.interferenceLabel];}));
  var job={revision:revision,assembly:E.assembly,controller:new AbortController(),cancelled:false,stageText:t("interferenceChecking")};
  E.interferenceJob=job;
  var progressBody=openEvalCard("interference",t("reportKickerEvaluate"),t("interferenceChecking"));
  if(progressBody)progressBody.appendChild(el("p","md-note",scopeCaption));
  var progressText=el("p","md-note");
  if(progressBody)progressBody.appendChild(progressText);
  var progressActions=evalCardActions();
  if(progressActions)progressActions.appendChild(btn(t("m_cancel"),function(){cancelInterferenceCheck();closeEvalCard();}));
  var setProgress=function(text){
    if(E.interferenceJob!==job || job.cancelled)return;
    job.stageText=text;
    if(E.evalCard==="interference")progressText.textContent=text;
  };
  var placed=[];
  var hits;
  setProgress(t("interferenceStagestart"));
  try {
    if(cadWorkerAvailable()){
      var requests=measured.map(function(component){
        var def=componentDef(component),placement=component.placement,transform=component.transform || {};
        return {id:component.id,label:component.interferenceLabel,bounds:component.bounds,
          document:def?.metadata?.authoringSystem==="parametric-v1" && (activeParts(def).length===1 || hasSingleToolboxKernelRecipe(def,activeParts(def))) ? interferenceDocument(def) : null,
          placement:{matrix:placement ? [placement.x.x,placement.y.x,placement.z.x,placement.x.y,placement.y.y,placement.z.y,placement.x.z,placement.y.z,placement.z.z] : rotationOf(transform).flat(),
            translation:placement ? placement.origin : {x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0}}};
      });
      hits=await interferenceInCadWorker(requests,{signal:job.controller.signal,onProgress:function(progress){
        if(progress.stage==="intersection")setProgress(t("interferenceStageintersection")+" · "+labels.get(progress.a)+" ↔ "+labels.get(progress.b));
        else setProgress(t("interferenceStage"+progress.stage)+" · "+(labels.get(progress.componentId) || "")+" · "+(progress.name || progress.stage));
      }});
    }else{
    for(var component of measured) {
      if (job.cancelled || revision !== (E.interferenceRevision || 0)) return;
      setProgress(t("interferenceChecking") + " · " + component.interferenceLabel);
      var solid=await exactInterferenceBrep(component,component.placement,function(progress){
        if(revision===(E.interferenceRevision || 0))setProgress(t("interferenceStage"+progress.stage)+" · "+component.interferenceLabel+" · "+(progress.name || progress.stage));
      },{signal:job.controller.signal});
      if(solid){component.brep=solid;placed.push(solid);}
    }
    hits=await detectInterference(measured,{signal:job.controller.signal,onProgress:function(pair){setProgress(t("interferenceStageintersection")+" · "+labels.get(pair.a)+" ↔ "+labels.get(pair.b));}});
    }
  } catch(error) {
    if(error.name==="AbortError")job.cancelled=true;
    if(job.cancelled)return;
    report(t("reportKickerEvaluate"),t("interferenceCheckFailed"),String(error.message || error));
    return;
  } finally {
    placed.forEach(disposeBrep);
    if(E.interferenceJob===job){
      E.interferenceJob=null;
      if(E.evalCard==="interference")closeEvalCard();
      if(job.cancelled)flash(t("interferenceCancelled"));
    }
  }
  /* A boolean-kernel check can finish after the user has hidden, inserted or
     moved something. Do not let that obsolete answer overwrite invalidation. */
  if (revision !== (E.interferenceRevision || 0)) return;
  E.interferenceHits = hits;
  E.interferenceChecked = scope.wholeAssembly;
  syncAssemblyWorkflow();
  updatePreview();
  renderAssemblyInterferenceReport(hits,labels,scopeCaption);
}

function renderAssemblyInterferenceReport(hits,labels,scopeCaption) {
  var summary=contactAuditSummary(E.assembly,hits),confirmed=summary.rawExact;
  report(t("reportKickerEvaluate"), !hits.length ? t("interferenceNone") : confirmed===0 ? t("interferencePossible") : hits.length === 1 ? t("interferenceFoundOne") : tf("interferenceFound", {n: confirmed}),
    hits.length ? [scopeCaption,"Native overlaps: "+summary.rawExact+" · Declared contacts: "+summary.declared+" · Unreviewed overlaps: "+summary.unreviewed+" · Bounds only: "+summary.boundsOnly,t("interferenceVisualized")].concat(hits.map(function (h) {
      // Component ids mean nothing to the person reading the report.
      return "• " + (labels.get(h.a) || componentLabel(h.a)) + " ↔ " + (labels.get(h.b) || componentLabel(h.b)) +
        (h.exact ? "   " + interferenceVolumeLabel(h.volume) + (h.bounds ? "\n  X " + h.bounds.x0.toFixed(4) + "…" + h.bounds.x1.toFixed(4) + " · Y " + h.bounds.y0.toFixed(4) + "…" + h.bounds.y1.toFixed(4) + " · Z " + h.bounds.z0.toFixed(4) + "…" + h.bounds.z1.toFixed(4) + " cm" : "") : "   " + t("interferenceBoundsOnly")) + (expectedContactFor(E.assembly,h) ? "\n  Declared contact: "+expectedContactFor(E.assembly,h).reason : "");
    })) : scopeCaption + "\n" + t("interferenceNoneBody"));
  if(!confirmed)return;
  var container=el("div");container.id="mdExpectedContacts";
  container.appendChild(el("p","md-note","Declared contacts remain measured overlaps. This annotation is not a geometric clearance pass."));
  hits.filter(function(hit){return hit.exact;}).forEach(function(hit,index){
    var label=(labels.get(hit.a) || componentLabel(hit.a))+" ↔ "+(labels.get(hit.b) || componentLabel(hit.b));
    var row=el("div","md-contact-row"),record=expectedContactFor(E.assembly,hit);
    var pair=el("strong"),action;
    pair.textContent=label;
    pair.dir="auto";
    row.appendChild(pair);
    function refreshContact() {
      refreshAll();
      renderAssemblyInterferenceReport(hits,labels,scopeCaption);
      root.querySelectorAll("#mdExpectedContacts button")[index]?.focus();
    }
    if(record){
      action=btn("Remove declared contact",function(){pushUndo("Remove declared contact");removeExpectedContact(E.assembly,hit);refreshContact();});
    }else{
      var reason=el("input","md-input");reason.type="text";reason.placeholder="Describe the intended contact";reason.setAttribute("aria-label","Reason for expected contact · "+label);
      row.appendChild(reason);
      action=btn("Record expected contact",function(){
        if(!reason.value.trim()){flash("Describe the intended contact before recording it");reason.focus();return;}
        pushUndo("Record expected contact");recordExpectedContact(E.assembly,hit,reason.value);refreshContact();
      });
    }
    action.setAttribute("aria-label",action.textContent+" · "+label);
    row.appendChild(action);
    container.appendChild(row);
  });
  root.querySelector("#mdReport section")?.appendChild(container);
}

export {
  assemblyPrintRequests, beginMeasure, cancelInterferenceCheck, closeEvalCard,
  createDefaultExplodedView, createDefaultMotionStudy,
  createEmptyExplodedView, documentOwnership, documentStillOwned, evalRow,
  exportAssemblyPrintDocument, exportBundleDocument, importBundleDocument,
  massEvaluationChanged, measureCoordinates, measureFromPick,
  occurrenceWorldBounds, openExplodeStepForm, runInterferenceCheck,
  runStandardsAudit, standardsGate, syncMassPropertiesEvaluation,
};
