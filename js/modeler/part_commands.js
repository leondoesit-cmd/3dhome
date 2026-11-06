/* The CAD editor's command dispatch, quick forms, body operations and patterns,
   split out of js/modeler.js. It shares the editor's state through live imports
   from ../modeler.js. */
import { STOCK_MATERIALS } from "../cad_appearances.js";
import { releaseRegeneration } from "../cad_feature_tree.js";
import { brepConnectedGroups, disposeBrep, placeBrep } from "../cad_kernel.js";
import { convertCadToWalls } from "../cad_to_walls.js";
import { executeCommand, wallDrawCommand } from "../commands/index.js";
import { regenerateInCadWorker as regenerateFeatures } from "../core/cad_worker_client.js";
import { setDocumentProperty } from "../core/custom_properties.js";
import { cylindricalHolePlacement } from "../core/cylindrical_hole_placement.js";
import { formatDocumentLength } from "../core/document_length_units.js";
import { captureExactTopology } from "../core/exact_topology_cache.js";
import { featureDefaults } from "../core/feature_catalog.js";
import { FEATURE_PATTERN_SEED_TYPES, compileKernelFeatureTree } from "../core/kernel_feature_adapter.js";
import { createFeatureDefinition, recordSketchInHistory } from "../core/parametric_document.js";
import { circularPatternStepDegrees, composeRigidTransforms, curvePatternPath, invertRigidTransform, patternPlacementTransform, patternRotationTransform } from "../core/pattern_geometry.js";
import { isSketchAxis, isStandaloneSketchAxisRevolve, sketchAxisReference } from "../core/revolve_geometry.js";
import { edgeEndpoints } from "../core/topology_selection.js";
import { createTopologyRegistry, resolveTopologyReference } from "../core/topology.js";
import { pushHistory as pushPlannerHistory } from "../history.js";
import { DIRECT_COMMAND_TOOLS, FEATURE_COMMAND } from "../modeler_commands.js";
import { featureReferenceValue, renderFeatureParameterForm as renderFeatureParameterFormCore } from "../modeler_feature_form.js";
import { cloneData, exactBrepForPart, mirrorProjectionPart, movePart, partBounds, partPatternRotations, partSupportsExactMesh, patternMergeSource, placePatternCopy, resetClonedPartIdentity } from "../modeler_part_geometry.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { t, tf } from "../modeler_strings.js";
import { closeCommandSearch, commandUnavailableReason, openQuickForm, syncCommandManager, toggleIsolate } from "../modeler/command_manager.js";
import { addTopologyMate, openFormSubassembly, openMateBeltForm, openMateGearForm, openMatePropertyManager, openMateRackPinionForm, openMateRotationLimitForm, rejectFlexibleSpringPreview } from "../modeler/component_mates.js";
import { patternCurveSketch, patternPlacements, planeAxis, pushUndo, resolvePatternCurvePath } from "../modeler/document_history.js";
import { exportDrawingSvg, importStepDocument, showAssemblyBOM, showAssemblyDrawingSettings, showMassProperties } from "../modeler/document_io.js";
import { beginMeasure, createDefaultExplodedView, createDefaultMotionStudy, exportBundleDocument, importBundleDocument, openExplodeStepForm, runInterferenceCheck, runStandardsAudit } from "../modeler/document_outputs.js";
import { drawingSheet, flash, newSketchPoint, showPickList } from "../modeler/drawing_sheet.js";
import { el } from "../modeler/editor_dom.js";
import { addReferenceGeometry, downloadBytes, exportIgesDocument, exportStepDocument, openCoordinateSystemForm, openFffSlicePreview, openOffsetPlaneForm, openPrintLayerAnalysis, openPrintSetupForm, openStlExportForm, regenerateExactModel } from "../modeler/export_measure.js";
import { cutTargetFeatureId, documentHelixRecords, selectedSketchIds, showConfigurations } from "../modeler/feature_create.js";
import { exactFinishPreviewBody, exactFinishPreviewPart, finishFeatureTargets } from "../modeler/finish_preview.js";
import { fillSketchPane } from "../modeler/inspector.js";
import { setMode, syncHead } from "../modeler/library_io.js";
import { activeParts, addPart } from "../modeler/library_store.js";
import { invalidatePartMeshAfterEdit, queueExactMesh } from "../modeler/prefs_snap.js";
import { mirrorSelection, patternCircularSelection, patternSelection, toggleDynamicMirror } from "../modeler/sketch_dimension_editor.js";
import { isSketchObject, openCenterRectangle, openCenterSlot, openConvertEntities, openDimensionedCircle, openDimensionedPolygon, openFaceBoundary, openSketchFillet, resolveSketch, selEntities, sketchForView } from "../modeler/sketch_entities.js";
import { insertISO4017Screw } from "../modeler/sketch_guide.js";
import { beginSketchWorkflow, finishSketchWorkflow, fitSketch, isCanonicalAuthoring, modelLengthText, modelLengthUnit, setTab, setTool } from "../modeler/sketch_workflow.js";
import { openComponentPatternForm, projectPartEdges } from "../modeler/tree_assembly.js";
import { fitPreview, setPanelCollapsed, toggleSectionView } from "../modeler/view_modes.js";
import { markDirty as markPlannerDirty } from "../persist.js";
import { render2D } from "../plan2d.js";
import { analyzeSketchChains } from "../sketch_profiles.js";
import { ensureSketch, lineData, sketchById } from "../sketch_solver.js";
import { rasterTextContours } from "../sketch_text.js";
import { toggleConstruction } from "../sketch_trim.js";
import { S, uid } from "../state.js";
import { THREE } from "../three_lazy.js";
import {
  E, H, PATTERN_IDENTITY_PLACEMENT, insertToolboxFastener, openFitCheckForm,
  openParametricFeature, openRackGearForm, openSketchRepairs, refreshAll,
  requestDocumentType, root,
} from "../modeler.js";

function runCommand(id) {
  if (!id) return;
  if(id==="temporaryaxes"){root.querySelector("#mdTemporaryAxes").click();closeCommandSearch();return;}
  if (id === "repeatlast") {
    var last = E.lastOperation;
    if (!last) { flash(t("repeatUnavailable")); return; }
    var reason = commandUnavailableReason(FEATURE_COMMAND[last.type]);
    if (reason) { flash(reason); return; }
    E.topologySelection = [];
    openParametricFeature(last.type, last.params); closeCommandSearch(); return;
  }
  var blocked = commandUnavailableReason(id);
  if (blocked) { flash(blocked); closeCommandSearch(); return; }
  if (id === "directsph" && isCanonicalAuthoring()) { openSphereForm(); closeCommandSearch(); return; }
  if (DIRECT_COMMAND_TOOLS[id]) { setTool(DIRECT_COMMAND_TOOLS[id]); closeCommandSearch(); syncCommandManager(); return; }
  if (id === "directcone") { openConeForm(); closeCommandSearch(); return; }
  if (id === "sketchtext") {
    if (isCanonicalAuthoring() && E.authoring?.phase !== "sketch") {
      if (activeParts(E.def).length) { flash("Open a sketch on the intended plane or face first."); closeCommandSearch(); return; }
      beginSketchWorkflow(null);
    }
    if (isCanonicalAuthoring() && E.authoring?.phase !== "sketch") { closeCommandSearch(); return; }
    openSketchTextForm(); closeCommandSearch(); return;
  }
  if (id === "stocksize") { openStockSizeForm(); closeCommandSearch(); return; }
  if (id === "towalls") { openToWallsForm(); closeCommandSearch(); return; }
  if (id === "finishpreview") { openFinishPreviewChooser(); closeCommandSearch(); return; }
  if (id === "exportglb") { exportModelGlb(); closeCommandSearch(); return; }
  if (id === "equations") { setTab("sketch"); fillSketchPane(); requestAnimationFrame(function () { Array.from(root.querySelectorAll("#mdSketch .md-h5")).find(function (node) { return node.textContent.trim() === t("equations"); })?.scrollIntoView({ block: "nearest" }); }); closeCommandSearch(); return; }
  if (id === "customprops") { openCustomProperties(); closeCommandSearch(); return; }
  if (id === "smartmates") { E.smartMateMode = !E.smartMateMode; setTab("ops"); flash(t("smartMate") + ": " + (E.smartMateMode ? "On" : "Off")); closeCommandSearch(); return; }
  if (id === "sheetmetal") {
    closeCommandSearch();
    setPanelCollapsed("right", false);
    setTab("ops");
    var section = root.querySelector("#mdSheetMetal");
    if (!section) flash(t("sheetMetalSelectPlate"));
    else {
      section.scrollIntoView({ block: "nearest" });
      root.querySelector("#mdSheetConvert")?.click();
    }
    return;
  }
  if (id === "branch") { setTab("hist"); closeCommandSearch(); return; }
  var tools = ["select", "rect", "circle", "sph", "poly", "rev", "cut", "cutc", "wall", "sketchpoint", "srect", "scirc", "sarc", "sslot", "spoly", "sell", "sspline", "dim", "trim", "extend", "offset", "constr"];
  /* A selected sketch entity toggles immediately. With nothing selected the
     command arms the two-point construction-line tool. */
  if (id === "constr" && E.mode !== "drawing") {
    var constrTargets = selEntities();
    if (constrTargets.length) {
      var constrSketch = ensureSketch(E.def);
      pushUndo(t("tool_constr"));
      constrTargets.forEach(function (entity) { toggleConstruction(constrSketch, entity.id); });
      resolveSketch(false);
      closeCommandSearch(); refreshAll(); syncCommandManager();
      return;
    }
  }
  if (tools.indexOf(id) >= 0) { if(id==="sarc"){ E.arcThreePoint=false; E.arcTangent=false; } setTool(id); }
  else if(id==="arc3point") { E.arcThreePoint=true; E.arcTangent=false; E.arcPts=null; setTool("sarc"); }
  else if(id==="tangentarc") { E.arcTangent=true; E.arcThreePoint=false; E.arcPts=null; setTool("sarc"); }
  else if(id==="sketchrepair")openSketchRepairs();
  else if(id==="centerrectangle")openCenterRectangle();
  else if(id==="dimensionedcircle")openDimensionedCircle();
  else if(id==="dimensionedpolygon")openDimensionedPolygon();
  else if(id==="centerslot")openCenterSlot();
  else if(id==="sketchfillet")openSketchFillet();
  else if(id==="faceboundary")openFaceBoundary();
  else if(id==="convertentities")openConvertEntities();
  else if (id === "newsketch") beginSketchWorkflow(null, { forceNew: true });
  else if (id === "finishsketch") finishSketchWorkflow();
  else if (id === "extrude") openParametricFeature("extrude");
  else if (id === "extrudecut") openParametricFeature("extrudeCut");
  else if (id === "revolvefeature") openParametricFeature("revolve");
  else if (id === "revolvecutfeature") openParametricFeature("revolveCut");
  else if (id === "sweepcutfeature") openParametricFeature("sweepCut");
  else if (id === "sweepfeature") openParametricFeature("sweep");
  else if (id === "loftfeature") openParametricFeature("loft");
  else if (id === "filletfeature") openParametricFeature("fillet");
  else if (id === "chamferfeature") openParametricFeature("chamfer");
  else if (id === "shellfeature") openParametricFeature("shell");
  else if (id === "domefeature") openParametricFeature("dome");
  else if (id === "draftfeature") openParametricFeature("draft");
  else if (id === "thickenfeature") openParametricFeature("thicken");
  else if (id === "ribfeature") openParametricFeature("rib");
  else if (id === "splitbodyfeature") openParametricFeature("splitBody");
  else if (id === "movebodyfeature") openParametricFeature("moveBody");
  else if (id === "patternfeature") openParametricFeature("pattern");
  else if (id === "mirrorfeature") openParametricFeature("mirror");
  else if (id === "booleanfeature") openParametricFeature("boolean");
  else if (id === "holefeature") openParametricFeature("hole");
  else if (id === "helixfeature") openParametricFeature("helix");
  else if (id === "threadfeature") openParametricFeature("thread");
  else if (id === "knurlfeature") openParametricFeature("knurl");
  else if (id === "insertfeature") openParametricFeature("insert");
  else if (id === "toolboxfastener") insertToolboxFastener();
  else if (id === "config") showConfigurations();
  else if (id === "screwmate") requestDocumentType("assembly",()=>{setTab("ops");addTopologyMate("screw");});
  else if (id === "gearmate") requestDocumentType("assembly",()=>{setTab("ops");openMateGearForm();});
  else if (id === "beltmate") requestDocumentType("assembly",()=>{setTab("ops");openMateBeltForm();});
  else if (id === "rackpinionmate") requestDocumentType("assembly",()=>{setTab("ops");openMateRackPinionForm();});
  else if (id === "rotationlimitmate") requestDocumentType("assembly",()=>{setTab("ops");openMateRotationLimitForm();});
  else if (id === "formsubassembly") openFormSubassembly();
  else if (id === "symmetricmate") requestDocumentType("assembly",()=>{setTab("ops");addTopologyMate("symmetric");});
  else if (id === "dynamicmirror") toggleDynamicMirror();
  else if (id === "mirror") mirrorSelection();
  else if (id === "pattern") patternSelection();
  else if (id === "circpattern") patternCircularSelection();
  else if (id === "project") projectPartEdges();
  else if (id === "regen") regenerateExactModel("force");
  else if (id === "stepin") importStepDocument();
  else if (id === "stepout") exportStepDocument();
  else if (id === "igesout") exportIgesDocument();
  else if (id === "stlout") openStlExportForm();
  else if (id === "3mfout") openStlExportForm("3mf");
  else if (id === "amfout") openStlExportForm("amf");
  else if (id === "printsetup") openPrintSetupForm();
  else if (id === "layeranalysis") openPrintLayerAnalysis();
  else if (id === "fffslice") openFffSlicePreview();
  else if (id === "drawing") {
    if (E.docType === "assembly" && E.assembly) showAssemblyDrawingSettings();
    else exportDrawingSvg();
  }
  else if (id === "mass") showMassProperties();
  else if (id === "measure") beginMeasure(E.measure && E.measure.mode);
  else if (id === "section") toggleSectionView();
  else if (id === "standards") runStandardsAudit();
  else if (id === "stdscrew") insertISO4017Screw();
  else if (id === "stdgear") openRackGearForm();
  else if (id === "fitcheck") openFitCheckForm();
  else if (id === "bundle") exportBundleDocument();
  else if (id === "bundlein") importBundleDocument();
  else if (id === "refplane") openOffsetPlaneForm();
  else if (id === "refaxis") addReferenceGeometry("axis");
  else if (id === "coordsys") openCoordinateSystemForm();
  else if (id === "refpoint") addReferenceGeometry("point");
  else if (id === "fit") {
    if (E.mode === "drawing") { drawingSheet().fit(); refreshAll(); }
    else if (E.mode === "3d") fitPreview();
    else fitSketch();
  }
  else if (id === "model3d") setMode("3d");
  else if (id === "assembly") requestDocumentType("assembly");
  else if (id === "partdoc") requestDocumentType("part");
  else if (id === "components") requestDocumentType("assembly",()=>setTab("parts"));
  else if (id === "componentpattern") openComponentPatternForm("create");
  else if (id === "editcomponentpattern") openComponentPatternForm("edit");
  else if (id === "removecomponentpattern") openComponentPatternForm("remove");
  else if (id === "mates") openMatePropertyManager();
  else if (id === "explode") createDefaultExplodedView();
  else if (id === "explodestep") openExplodeStepForm();
  else if (id === "motion") createDefaultMotionStudy();
  else if (id === "interference") runInterferenceCheck();
  else if (id === "bom") showAssemblyBOM();
  else if (id === "isolate") toggleIsolate();
  else if (id === "paint") { setMode("3d"); setTool("paint"); }
  else if (id === "note") { if(E.docType==="assembly")showAssemblyDrawingSettings(true);else{setMode("3d");setTool("note");} }
  closeCommandSearch();
  syncCommandManager();
}

function openSphereForm() {
  openQuickForm({
    action:"directsph",icon:"ph-sphere",title:"Sphere",
    hint:"Enter a center and driving diameter. Creates an editable native Sphere feature without a sketch.",
    fields:[
      {key:"x",label:"Center X",type:"number",unit:"length",value:0},
      {key:"y",label:"Center Y",type:"number",unit:"length",value:0},
      {key:"z",label:"Center Z",type:"number",unit:"length",value:0},
      {key:"diameter",label:"Diameter",type:"number",unit:"length",min:1e-6,value:1.2},
    ],
    failureMessage:function(){return "Enter finite center coordinates and a positive diameter.";},
    onApply:function(values){
      var x=Number(values.x),y=Number(values.y),z=Number(values.z),diameter=Number(values.diameter);
      if(![x,y,z,diameter].every(Number.isFinite) || diameter<=0)return false;
      pushUndo("Sphere");
      try{
        var params={x:x,y:y,z:z,r:diameter/2};
        var feature=createFeatureDefinition(E.def,"sphere",{params:params});
        E.sel=addPart({id:uid(),featureId:feature.id,kind:"sph",name:feature.name,x:x,y:y,z:z,r:params.r,color:"#b89a6e",metal:.08,rough:.7});
        refreshAll();return true;
      }catch(error){H.discard();flash(String(error.message || error));return false;}
    },
  });
}

function openConeForm() {
  openQuickForm({
    action: "directcone", icon: "ph-triangle", title: "Cone",
    fields: [
      { key: "r1", label: "Base radius", type: "number", unit: "length", min: 1e-6, value: 5 },
      { key: "r2", label: "Top radius", type: "number", unit: "length", min: 0, value: 0 },
      { key: "h", label: "Height", type: "number", unit: "length", min: 1e-6, value: 10 },
    ],
    onApply: function (values) {
      var r1 = Number(values.r1), r2 = Number(values.r2), h = Number(values.h);
      if (![r1, r2, h].every(Number.isFinite) || r1 <= 0 || r2 < 0 || h <= 0) return false;
      pushUndo("Cone");
      try {
        var params = { x: 0, y: 0, z: 0, r1, r2, h };
        var feature = createFeatureDefinition(E.def, "cone", { params: params });
        E.sel = addPart({ id: uid(), featureId: feature.id, kind: "cyl", name: "Cone", x: 0, y: 0, z: 0, r: r1, r2: r2, h: h, color: "#b89a6e", metal: .08, rough: .7 });
        refreshAll();
        return true;
      } catch (error) { H.discard(); flash(String(error.message || error)); return false; }
    },
  });
}

function openSketchTextForm() {
  openQuickForm({ action: "sketchtext", title: "Sketch text", icon: "ph-text-t",
    hint: "Creates closed editable letter profiles. Extrude to emboss or Extrude cut to engrave.",
    fields: [
      { key: "text", label: "Text (up to 24 characters)", type: "text", value: "TEXT" },
      { key: "height", label: "Letter height (cm)", type: "number", value: 3, min: .1, max: 100 },
      { key: "x", label: "Left position (cm)", type: "number", value: 0 },
      { key: "y", label: "Baseline position (cm)", type: "number", value: 0 },
    ],
    onApply: function(values) {
      const content = values.text.trim();
      if (!content || content.length > 24 || !Number.isFinite(values.height) || values.height < .1 || values.height > 100) { flash("Enter 1–24 characters and a letter height from 0.1 to 100 cm."); return false; }
      let contours;
      try { contours = rasterTextContours(content); } catch (error) { flash(error.message); return false; }
      if (!contours.length) { flash("This font produced no closed letter contours."); return false; }
      const ys = contours.flatMap(loop => loop.map(point => point.y));
      const top = Math.min(...ys), bottom = Math.max(...ys), scale = values.height / Math.max(1, bottom - top);
      const sketch = sketchForView();
      pushUndo("Sketch text");
      for (const contour of contours) {
        const ids = contour.map(point => newSketchPoint(sketch, { u: values.x + point.x * scale, v: values.y + (bottom - point.y) * scale }));
        ids.forEach((id, index) => sketch.entities.push({ id: uid(), type: "line", name: "Text " + content, a: id, b: ids[(index + 1) % ids.length], construction: false, textSource: content }));
      }
      resolveSketch(false); E.sel = null; E.ssel = []; refreshAll(); return true;
    },
  });
}

function openStockSizeForm() {
  var part = selectedSolid();
  if (!part) { flash(t("quickNeedPart")); return; }
  var bounds = partBounds(part), needed = [bounds.x1 - bounds.x0, bounds.y1 - bounds.y0, bounds.z1 - bounds.z0].map(v => Math.max(0.01, v));
  var keys = Object.keys(STOCK_MATERIALS), current = String(part.materialCatalogId || "").replace(/^stock:/, "");
  openQuickForm({ action: "stocksize", title: "Stock size", icon: "ph-ruler",
    fields: [
      { key: "width", label: "Stock width", type: "number", unit: "length", min: needed[0], value: part.stockSize?.width || Math.ceil(needed[0]) },
      { key: "height", label: "Stock height", type: "number", unit: "length", min: needed[1], value: part.stockSize?.height || Math.ceil(needed[1]) },
      { key: "depth", label: "Stock depth", type: "number", unit: "length", min: needed[2], value: part.stockSize?.depth || Math.ceil(needed[2]) },
      { key: "material", label: "Material", type: "select", value: current || "aluminum", choices: keys.map(key => ({ value: key, label: STOCK_MATERIALS[key].name })) },
    ],
    onApply: function (values) {
      var dimensions = [Number(values.width), Number(values.height), Number(values.depth)];
      if (dimensions.some((value, i) => !Number.isFinite(value) || value + 1e-6 < needed[i])) { flash("Stock must enclose the part."); return false; }
      var material = STOCK_MATERIALS[values.material]; if (!material) return false;
      pushUndo("Stock size");
      part.stockSize = { width: dimensions[0], height: dimensions[1], depth: dimensions[2] };
      part.materialCatalogId = "stock:" + values.material; part.materialName = material.name;
      part.color = material.color; part.metal = material.metal; part.rough = material.rough;
      if ((E.def.parts || []).length === 1) setDocumentProperty(E.def, "Stock size", `${dimensions.join(" × ")} cm`);
      refreshAll(); return true;
    },
  });
}

function openToWallsForm() {
  var sketch = ensureSketch(E.def), points = new Map((sketch.points || []).map(p => [p.id, p]));
  var segments = (sketch.entities || []).filter(e => e.type === "line" && !e.construction).map(e => lineData(e, points)).filter(Boolean);
  if (!segments.length) { flash("Draw a line outline in the active sketch first."); return; }
  openQuickForm({ action: "towalls", title: "Sketch outline to planner walls", icon: "ph-wall",
    fields: [{ key: "thickness", label: "Wall thickness", type: "number", unit: "length", min: 1, value: 10 }],
    onApply: function (values) {
      var thickness = Number(values.thickness); if (!(thickness > 0)) return false;
      var cx = S.nodes.length ? S.nodes.reduce((sum, p) => sum + p.x, 0) / S.nodes.length : 0;
      var cz = S.nodes.length ? S.nodes.reduce((sum, p) => sum + p.z, 0) / S.nodes.length : 0;
      var source = { lines: segments.map(segment => ({ a: { x: segment.a.x + cx, z: segment.a.y + cz }, b: { x: segment.b.x + cx, z: segment.b.y + cz } })) };
      var converted = convertCadToWalls(source, { singleLineWalls: true, defaultThickness: thickness, firstId: S.idc, minLength: 1 });
      if (!converted.walls.length) { flash("No walls could be made from this sketch."); return false; }
      pushPlannerHistory();
      for (var wall of converted.walls) {
        var result = executeCommand(wallDrawCommand, {
          from: converted.nodes[wall.a], to: converted.nodes[wall.b],
          thickness: wall.thickness, height: wall.height, type: wall.wallTypeId,
          kind: wall.kind, datum: wall.datum, phase: wall.phase,
        }, { domain: "planner", state: S }, { history: false });
        if (!result.ok) { flash(`Could not make wall: ${result.reason}`); return false; }
      }
      S.dirty3D = true; markPlannerDirty(); render2D();
      flash(`✓ ${converted.walls.length} walls added to the planner`); return true;
    },
  });
}

function openFinishPreviewChooser() {
  if (!selectedSolid()) { flash(t("quickNeedPart")); return; }
  showPickList("Finish preview", "Choose a finish to preview", [
    { id: "fillet", label: t("quickFillet"), hint: "Round selected edges" },
    { id: "chamfer", label: t("quickChamfer"), hint: "Bevel selected edges" },
    { id: "shell", label: t("shellOp"), hint: "Hollow selected face" },
  ], function (item) { openParametricFeature(item.id); });
}

async function exportModelGlb() {
  if(rejectFlexibleSpringPreview())return;
  if (!E.pv?.grp) { flash("Open the 3D model preview first."); return; }
  try {
    var mod = await import("three/addons/exporters/GLTFExporter.js");
    var doc = E.docType === "assembly" ? E.assembly : E.def;
    var name = doc?.name || "model";
    var source = new THREE.Group(); source.name = name;
    source.add(E.pv.grp.clone(true)); source.scale.setScalar(0.01);
    var buffer = await new mod.GLTFExporter().parseAsync(source, { binary: true, onlyVisible: true, trs: true });
    downloadBytes(buffer, name + ".glb", "model/gltf-binary");
  } catch (error) { flash(String(error.message || error)); }
}

function openCustomProperties() {
  var doc = E.docType === "assembly" ? E.assembly : E.def;
  if (!doc) return;
  root.querySelector("#mdCustomPropsDialog")?.remove();
  var dialog = document.createElement("dialog");
  dialog.id = "mdCustomPropsDialog";
  dialog.style.cssText = "max-width:min(32rem,90vw);max-height:80vh;overflow:auto;border-radius:12px;padding:1.2rem";
  var title = document.createElement("h2"); title.textContent = "Custom properties"; dialog.appendChild(title);
  var rows = document.createElement("div"); dialog.appendChild(rows);
  function row(key, value) {
    var line = document.createElement("div"); line.style.cssText = "display:flex;gap:.4rem;margin:.5rem 0";
    var name = document.createElement("input"); name.placeholder = "Name"; name.value = key; name.maxLength = 80;
    var field = document.createElement("input"); field.placeholder = "Value"; field.value = value;
    var remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.onclick = function () { line.remove(); };
    line.append(name, field, remove); rows.appendChild(line);
  }
  Object.entries(doc.customProperties || {}).forEach(function (entry) { row(entry[0], entry[1]); });
  var add = document.createElement("button"); add.type = "button"; add.textContent = "+ Property"; add.onclick = function () { row("", ""); }; dialog.appendChild(add);
  var save = document.createElement("button"); save.type = "button"; save.textContent = "Save"; save.onclick = function () {
    var next = {};
    for (var line of rows.children) {
      var inputs = line.querySelectorAll("input"), key = inputs[0].value.trim(), value = inputs[1].value.trim();
      if (key && value) next[key] = value;
    }
    if (JSON.stringify(next) !== JSON.stringify(doc.customProperties || {})) {
      pushUndo("Custom properties");
      doc.customProperties = {};
      Object.entries(next).forEach(function (entry) { setDocumentProperty(doc, entry[0], entry[1]); });
      if (!Object.keys(next).length) delete doc.customProperties;
      syncHead();refreshAll();
    }
    dialog.close();
  }; dialog.appendChild(save);
  var cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.onclick = function () { dialog.close(); }; dialog.appendChild(cancel);
  dialog.addEventListener("close", function () { dialog.remove(); }, { once: true });
  root.appendChild(dialog); dialog.showModal();
}

/* Common solid operations live beside the viewport with their one or two
   useful parameters exposed immediately. This deliberately avoids bouncing
   through the inspector and modal prompts for the operations used all day. */
function selectedSolid() {
  return E.sel && !isSketchObject(E.sel) && E.sel.kind ? E.sel : null;
}

function quickDuplicatePart() {
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickDuplicate"));
  var q = resetClonedPartIdentity(cloneData(p)); movePart(q, 10, 0, 10); addPart(q); E.sel = q;
  refreshAll(); return true;
}


function quickMirrorPart(options) {
  var params={...featureDefaults("mirror"),...(options || {})};
  if(params.scope==="feature"){
    /* Features to Mirror: reflect the picked addition or cutter on its host. */
    params.seedFeatureIds=Array.from(new Set(params.seedFeatureIds?.length ? params.seedFeatureIds : [params.seedFeatureId].filter(Boolean)));
    params.seedFeatureId=params.seedFeatureIds[0] || "";
    var mirrorSource=(E.def.features || []).find(function(item){return item.id===params.seedFeatureId;});
    var mirrorHost=selectedPatternBody(params.seedFeatureId);
    if(!mirrorHost){flash(t("quickNeedPart"));return false;}
    if(!mirrorSource?.inputs?.[0]){flash("Select the feature to mirror in the history tree");return false;}
    var mirrorPlane=params.planeReference || (E.authoring.referenceId && String(E.authoring.referenceId).indexOf("plane:")===0 ? E.authoring.referenceId : "plane:right");
    var mirrorParams={...params};delete mirrorParams.planeReference;
    pushUndo(t("quickMirror"));
    try{var hostFeatureId=cutTargetFeatureId(mirrorHost);createFeatureDefinition(E.def,"mirror",{inputs:[hostFeatureId],references:{sketches:[],features:Array.from(new Set([hostFeatureId,...params.seedFeatureIds])),topology:[],references:[mirrorPlane]},params:mirrorParams});queueExactMesh(mirrorHost);refreshAll();return true;}
    catch(error){H.discard();flash(String(error.message || error));return false;}
  }
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  pushUndo(t("quickMirror"));
  var planeId=params.planeReference || (E.authoring.referenceId && String(E.authoring.referenceId).indexOf("plane:")===0 ? E.authoring.referenceId : "plane:right");
  var q = mirrorProjectionPart(resetClonedPartIdentity(cloneData(p)),planeId);
  if(!q){H.discard();flash(t("kernelBodyNoMirror"));return false;}
  var feature;
  delete params.planeReference;
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"mirror",{inputs:[source],references:{sketches:[],features:[source],topology:[],references:[planeId]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  if(feature){q.derivedFeatureId=feature.id;q.sourceFeatureId=p.featureId;}
  if(params.keepOriginal!==false)addPart(q);else{var index=E.def.parts.indexOf(p);if(index>=0)E.def.parts.splice(index,1,q);else addPart(q);} E.sel = q; refreshAll(); return true;
}

async function quickRoundPart(kind, amount) {
  var form=E.quickFormInstance;
  var params={...featureDefaults(kind),...(typeof amount==="object"?amount:kind==="fillet"?{radius:amount}:{distance:amount})};
  amount=kind==="fillet"?params.radius:params.distance;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("quickNeedPart")); return false; }
  var sourceFeatureId=cutTargetFeatureId(p);
  /* Edges come from the selection. A face with no edges picked means every
     edge of that face — not the whole body, which is what an empty edge list
     used to do. */
  var targets=finishFeatureTargets(kind,params).filter(function(reference){return reference.kind==="edge" || reference.kind==="face";});
  if (!targets.length) { flash(t("needEdges")); return false; }
  /* An override for an edge that is no longer in the selection means nothing,
     and storing it would make the saved feature claim a radius it never uses. */
  if (kind === "fillet" && Array.isArray(params.edgeRadii)) {
    params.edgeRadii = params.edgeRadii.filter(function (entry) {
      return entry && targets.some(function (reference) { return reference.persistentId === entry.id; });
    });
  }
  // Bind extracted edges to the analytic history names when they describe
  // the same geometry, so a subsequent rebuild can resolve the selection.
  var coreTopology=E.coreRun && (E.coreRun.core || E.coreRun).topology || [];
  var historyRegistry=createTopologyRegistry(coreTopology);
  targets=targets.map(function(reference){
    if(historyRegistry.byPersistentId.has(reference.persistentId))return reference;
    var descriptor=cloneData(reference.descriptor || {});delete descriptor.semantic;
    var resolution=resolveTopologyReference({kind:reference.kind,descriptor:descriptor},historyRegistry,{threshold:.05});
    if (!resolution.topology) return reference;
    var bound=topologyReferenceFromEntry(resolution.topology);
    // Lowered cutter edges retain their kernel name, but depend on the
    // authoring feature that produces the cutter rather than its internal tool.
    var owner=(E.def.features || []).filter(function(feature){
      return bound.ownerFeatureId===feature.id || bound.ownerFeatureId.startsWith(feature.id+":");
    }).sort(function(a,b){return b.id.length-a.id.length;})[0];
    if(owner)bound.ownerFeatureId=owner.id;
    if(Array.isArray(params.edgeRadii))params.edgeRadii.forEach(function(entry){
      if(entry.id===reference.persistentId)entry.id=bound.persistentId;
    });
    return bound;
  });
  if(isCanonicalAuthoring())try{
    var finishDocument=E.def,finishSignature=JSON.stringify(E.def);
    var trial=cloneData(E.def);
    var sourceCompiled=compileKernelFeatureTree(trial);
    if(!sourceCompiled.ok){flash(sourceCompiled.issues[0]?.message || 'Invalid feature history');return false;}
    var sourceRun=await regenerateFeatures({...sourceCompiled.document,features:sourceCompiled.features});
    try {
      var sourceResult=sourceRun.results.get(sourceFeatureId);
      if(!sourceResult?.shape){flash(sourceRun.issues[0]?.message || 'The source body could not be rebuilt');return false;}
      var exactRegistry=createTopologyRegistry(sourceResult.topology || []);
      var verifiedSourceTopology=captureExactTopology(trial,sourceCompiled.features,sourceRun);
      targets=targets.map(function(reference){
        var descriptor=cloneData(reference.descriptor || {});delete descriptor.semantic;
        var resolution=resolveTopologyReference({kind:reference.kind,descriptor},exactRegistry,{threshold:.05});
        if(!resolution.topology || ['missing','ambiguous'].includes(resolution.status))throw new Error('The selected edge could not be matched to the rebuilt body');
        var rebound=topologyReferenceFromEntry(resolution.topology);
        rebound.ownerFeatureId=sourceFeatureId;
        if(Array.isArray(params.edgeRadii))params.edgeRadii.forEach(function(entry){if(entry.id===reference.persistentId)entry.id=rebound.persistentId;});
        return rebound;
      });
    } finally {releaseRegeneration(sourceRun);}
    var trialFeature=createFeatureDefinition(trial,kind,{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:targets,references:[]},params:params});
    // Generated fillet and cut edges exist only in the exact model. Validate
    // against that model, rather than rejecting them in the analytic preview.
    var compiledTrial=compileKernelFeatureTree(trial);
    if(!compiledTrial.ok){flash(compiledTrial.issues[0]?.message || 'Invalid feature history');return false;}
    var trialRun=await regenerateFeatures({...compiledTrial.document,features:compiledTrial.features});
    try {
      var failure=trialRun.issues.find(function(issue){return issue.severity==='error' || issue.code==='regeneration-failed';});
      if(failure){flash(failure.message);return false;}
      if(!trialRun.results.get(trialFeature.id)){flash('The finish feature could not be rebuilt');return false;}
    } finally {releaseRegeneration(trialRun);}
    if((form && !form.isCurrent()) || E.def!==finishDocument || JSON.stringify(E.def)!==finishSignature || E.authoring?.featureType!==kind)return false;
  }catch(error){flash(String(error.message||error));return false;}
  pushUndo(kind === "fillet" ? t("quickFillet") : t("quickChamfer"));
  if(verifiedSourceTopology)E.def.exactTopologyCache=verifiedSourceTopology;
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,kind,{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":"+kind+":"+(p.exactOperations.length+1),
    type:kind,amount:Math.max(.1,amount),targets:targets,params:cloneData(params),
  });
  delete p.exactFillet; delete p.exactFilletTargets; delete p.exactFilletEdges;
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("✓ "+(kind==="fillet"?t("quickFillet"):t("quickChamfer"))+" "+t("appliedFeature"));
  return true;
}

async function quickShellPart(thickness, verifiedPreview=false) {
  var form=E.quickFormInstance;
  var params={...featureDefaults("shell"),...(typeof thickness==="object"?thickness:{thickness:thickness})};thickness=params.thickness;
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("shellFail")); return false; }
  var targets=cloneData((E.topologySelection || []).filter(function(reference){return reference.kind==="face";}));
  if (!targets.length) { flash(t("needFace")); return false; }
  var source=cutTargetFeatureId(p),verified;
  if(!verifiedPreview){
    var preview=exactFinishPreviewPart("shell",{params});
    try{verified=await exactFinishPreviewBody(preview,"shell");}catch(error){flash(String(error.message || error));return false;}finally{if(verified)disposeBrep(verified);}
  }
  if(form && !form.isCurrent())return false;
  pushUndo(t("shellOp"));
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"shell",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":shell:"+(p.exactOperations.length+1),
    type:"shell",amount:Math.max(1e-6,thickness),targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll(); return true;
}

/* Draft, like shell, is recorded as an exact operation on the selected body
   rather than as a new part: the solid keeps its identity and OpenCascade
   re-tilts its walls on the next exact build. */
async function quickDomePart(params) {
  var form=E.quickFormInstance;
  var p=selectedSolid(),targets=finishFeatureTargets("dome");
  if(!p || targets.length!==1){flash("Select one circular planar face for Dome");return false;}
  var preview=exactFinishPreviewPart("dome",{params:params}),verified;
  try{verified=await exactFinishPreviewBody(preview,"dome");}catch(error){flash(String(error.message || error));return false;}finally{if(verified)disposeBrep(verified);}
  if(form && !form.isCurrent())return false;
  pushUndo("Dome");
  try{
    var source=cutTargetFeatureId(p);
    var feature=createFeatureDefinition(E.def,"dome",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});
    p.exactOperations=p.exactOperations || [];
    p.exactOperations.push({id:feature.id,type:"dome",amount:params.height,targets:targets,params:cloneData(params)});
    E.sel=p;queueExactMesh(p);refreshAll();return true;
  }catch(error){H.discard();flash(String(error.message || error));return false;}
}

function quickDraftPart(options) {
  var params={...featureDefaults("draft"),...(typeof options==="object"?options:{angle:options})};
  var angle=Number(params.angle);
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("draftFail")); return false; }
  if (!Number.isFinite(angle) || angle===0) { flash(t("draftFail")); return false; }
  var neutralFace=params.neutralFace || null;
  var targets=finishFeatureTargets("draft").filter(function(reference){return !neutralFace || reference.persistentId!==neutralFace.persistentId;});
  if (!targets.length) { flash(t("needFace")); return false; }
  pushUndo(t("draftOp"));
  /* The body's head, as Shell and Dome use: on a merged body p.featureId is the
     first feature (HOUSING's Base Extrude), and drafting that started a second
     body next to Boss-Stop instead of drafting the part as it stands. */
  var source=cutTargetFeatureId(p);
  var feature;
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"draft",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":draft:"+(p.exactOperations.length+1),
    type:"draft",amount:angle,targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("\u2713 "+t("draftOp")+" "+t("appliedFeature"));
  return true;
}

/* Split Body. The plane cuts once; what the command does with the two halves is
   the whole point of the feature.

   "Both" is not a compound body here — a compound would be one row in the tree
   holding two lumps nobody can pick apart. The half that is kept stays on the
   original part and the other half becomes a part of its own, carrying the same
   source recipe with the complementary split recorded on it. Two rows, two
   bodies, both selectable, both saveable, and neither of them a special kind
   the rest of the editor has to learn about. */
function quickSplitBodyPart(options) {
  var params={...featureDefaults("splitBody"),...(typeof options==="object"?options:{offset:options})};
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("splitBodyFail")); return false; }
  var offset=Number(params.offset);
  if (!Number.isFinite(offset)) { flash(t("splitBodyFail")); return false; }
  var bounds=partBounds(p), axis=params.axis==="x"?"x":params.axis==="z"?"z":"y";
  if (!bounds || offset<=bounds[axis+"0"]+1e-9 || offset>=bounds[axis+"1"]-1e-9) { flash(t("splitBodyFail")); return false; }
  var both=params.keep!=="positive" && params.keep!=="negative";
  pushUndo(t("splitBodyOp"));
  /* Both halves are cut from the SAME body, so both history rows take the
     original part's feature as their input — the clone's own feature id names
     nothing in the tree yet and would dangle. It is the body's head, not its
     first feature, so a merged body is split as it stands. */
  var sourceFeatureId=cutTargetFeatureId(p);
  var record=function(part,keep){
    var half={...params,keep:keep};
    var feature;
    if(isCanonicalAuthoring())feature=createFeatureDefinition(E.def,"splitBody",{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:[],references:[]},params:half});
    part.exactOperations=part.exactOperations || [];
    part.exactOperations.push({
      id:feature ? feature.id : (part.featureId || "feature:part:"+part.id)+":split:"+(part.exactOperations.length+1),
      type:"splitBody",amount:offset,targets:[],params:cloneData(half),
    });
    queueExactMesh(part);
  };
  try{
    if(both){
      var other=resetClonedPartIdentity(cloneData(p));
      other.name=tf("splitBodyHalf",{name:p.name || t("selFilterBody")});
      delete other.meshData; delete other.bounds;
      addPart(other);
      record(p,"positive");
      record(other,"negative");
    } else record(p,params.keep);
  }catch(error){H.discard();flash(String(error.message||error));return false;}
  E.sel=p; refreshAll();
  flash("✓ "+t("splitBodyOp")+" "+t("appliedFeature"));
  return true;
}

/* Move / Copy Body. A move rewrites the body in place; a copy leaves the
   original alone and puts the transform on a new part, because two bodies that
   happen to touch are still two bodies and a fuse would make them one. */
function quickMoveBodyPart(options) {
  var params={...featureDefaults("moveBody"),...(typeof options==="object"?options:{dx:options})};
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("moveBodyFail")); return false; }
  var moved=(Number(params.dx)||0)||(Number(params.dy)||0)||(Number(params.dz)||0)||(Number(params.angle)||0);
  if (!moved) { flash(t("moveBodyNothing")); return false; }
  var copy=!!params.copy;
  pushUndo(t("moveBodyOp"));
  /* `copy` is handled here, not by the kernel: moveBodyBrep's compound is the
     right answer for one BREP result, but a part must be one body. */
  var target=p;
  if(copy){
    target=resetClonedPartIdentity(cloneData(p));
    target.name=tf("moveBodyCopyName",{name:p.name || t("selFilterBody")});
    delete target.meshData; delete target.bounds;
    addPart(target);
  }
  var kernelParams={...params,copy:false};
  var feature;
  // a copy is cut from the original body too, so its row names that body
  var sourceFeatureId=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"moveBody",{inputs:[sourceFeatureId],references:{sketches:[],features:[sourceFeatureId],topology:[],references:[]},params:kernelParams});}catch(error){H.discard();flash(String(error.message||error));return false;}
  /* The copy is the row's body, the way a mirror or pattern copy is: its head
     starts at the move, and the original's head does not walk onto it. */
  if(copy && feature){target.derivedFeatureId=feature.id;target.sourceFeatureId=p.featureId;}
  target.exactOperations=target.exactOperations || [];
  target.exactOperations.push({
    id:feature ? feature.id : (target.featureId || "feature:part:"+target.id)+":movebody:"+(target.exactOperations.length+1),
    type:"moveBody",amount:Number(params.angle)||0,targets:[],params:cloneData(kernelParams),
  });
  E.sel=target; queueExactMesh(target); refreshAll();
  flash("✓ "+t("moveBodyOp")+" "+t("appliedFeature"));
  return true;
}

/* Rib. Sketch-driven like extrude, body-driven like shell: the open line says
   where the web runs, the selected body says what it braces, and the result is
   recorded as an exact operation on that body because a rib IS part of the
   solid it stiffens — never a loose fin standing next to it. */
function createRibFeature(options) {
  var params={...featureDefaults("rib"),...(typeof options==="object"?options:{thickness:options})};
  var thickness=Number(params.thickness);
  if(!Number.isFinite(thickness) || thickness<=0){flash(t("ribFail"));return false;}
  var sketch=ensureSketch(E.def);
  var chain=analyzeSketchChains(sketch,{selectedIds:selEntities().map(function(entity){return entity.id;})}).chains[0];
  if(!chain){flash(t("ribNeedLine"));setTab("sketch");return false;}
  var p=selectedSolid() || activeParts(E.def)[activeParts(E.def).length-1];
  if(!p){flash(t("quickNeedPart"));return false;}
  if(!partSupportsExactMesh(p)){flash(t("ribFail"));return false;}
  var axis=planeAxis(sketch.plane),localFrame=sketch.frameSpace==="local" && sketch.frame;
  var normal=sketch.frame && sketch.frame.normal;
  /* The sketch plane already carries a direction; the form's forward/reverse is
     stated relative to it, so the two are combined once here rather than being
     re-guessed by the kernel. */
  var principal=localFrame || !normal ? 1 : (axis==="x"?Math.sign(normal.x||1):axis==="y"?Math.sign(normal.y||1):Math.sign(normal.z||1)) || 1;
  var ribParams={...params,
    points:chain.points.map(function(q){return {u:q.u,v:q.v};}),
    chainEntityIds:chain.entityIds.slice(),
    axis:localFrame?"frame":axis,
    ...(localFrame?{frame:cloneData(sketch.frame)}:{}),
    from:localFrame?0:(Number(sketch.offset)||0),
    direction:(principal<0)!==(params.direction==="reverse")?"reverse":"forward",
    sketchId:sketch.id,
  };
  pushUndo(t("ribOp"));
  recordSketchInHistory(E.def,sketch);
  var feature;
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"rib",{inputs:[source],references:{sketches:[sketch.id],features:[source],topology:[],references:[]},params:ribParams});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":rib:"+(p.exactOperations.length+1),
    type:"rib",amount:thickness,targets:[],params:cloneData(ribParams),
  });
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("✓ "+t("ribOp")+" "+t("appliedFeature"));
  return true;
}

/* Thicken. Recorded like shell and draft — an exact operation on the selected
   body, not a new part — because the slab it grows is fused back into that
   body. On a surface body (a sweep or loft with "Create solid" off) there is
   nothing to fuse into and the slab becomes the body, which is the whole point:
   a sheet acquires a thickness without changing identity in the tree. */
function quickThickenPart(options) {
  var params={...featureDefaults("thicken"),...(typeof options==="object"?options:{thickness:options})};
  var thickness=Number(params.thickness);
  var p = selectedSolid();
  if (!p) { flash(t("quickNeedPart")); return false; }
  if (!partSupportsExactMesh(p)) { flash(t("thickenFail")); return false; }
  if (!Number.isFinite(thickness) || thickness<=0) { flash(t("thickenFail")); return false; }
  var targets=finishFeatureTargets("thicken");
  if (!targets.length) { flash(t("needFace")); return false; }
  pushUndo(t("thickenOp"));
  var feature;
  /* The body as it stands, not its first feature: on a merged body the first
     feature is only the base, and thickening that starts a second body. */
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"thicken",{inputs:[source],references:{sketches:[],features:[source],topology:targets,references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  p.exactOperations=p.exactOperations || [];
  p.exactOperations.push({
    id:feature ? feature.id : (p.featureId || "feature:part:"+p.id)+":thicken:"+(p.exactOperations.length+1),
    type:"thicken",amount:thickness,targets:targets,params:cloneData(params),
  });
  E.sel=p; queueExactMesh(p); refreshAll();
  flash("✓ "+t("thickenOp")+" "+t("appliedFeature"));
  return true;
}

function clearPatternMerges(featureId) {
  if(!featureId)return;
  (E.def.parts || []).forEach(function(part){
    if(!(part.merges3d || []).length)return;
    var kept=part.merges3d.filter(function(entry){return entry.patternFeatureId!==featureId;});
    if(kept.length===part.merges3d.length)return;
    if(kept.length)part.merges3d=kept;else delete part.merges3d;
    invalidatePartMeshAfterEdit(part);
  });
}

/* Lay one run of pattern copies. Both Apply and the rebuild that follows a
   parameter edit come through here, so a merged pattern does not grow a second
   placement path. `push` is the only difference between the two callers. */
function layPatternCopies(seed, params, feature, placements, circularStep, push) {
  /* Snapshotted BEFORE this pattern's own fusions land on the seed, so the
     copies are the shape the seed was when they were made. */
  var source=params.mergeResult?patternMergeSource(seed):null,entries=[];
  placements.forEach(function(placement,index){
    var copy=resetClonedPartIdentity(cloneData(seed));
    placePatternCopy(copy,params,placement,circularStep);
    if(feature){copy.derivedFeatureId=feature.id;copy.sourceFeatureId=seed.featureId;copy.patternIndex=index+1;copy.patternGridIndex=placement.indices;}
    push(copy);
    entries.push({part:copy,transform:patternPlacementTransform(params,placement,circularStep)});
  });
  E.patternFusion=source&&entries.length?fusePatternInstances(seed,source,entries,feature):null;
  return entries;
}

/* The second pass: ask the kernel which instances share material, then collapse
   each connected cluster onto its first member. A cluster of one is left
   exactly as it was laid. */
function fusePatternInstances(seed, source, entries, feature) {
  if(!partSupportsExactMesh(seed)){flash(t("patternMergeUnsupported"));return;}
  var def=E.def,featureId=feature&&feature.id||null;
  var members=[{part:seed,transform:PATTERN_IDENTITY_PLACEMENT}].concat(entries);
  return (async function(){
    var base=null,copies=[];
    try{
      base=await exactBrepForPart(source);
      for(var index=0;index<members.length;index++)copies.push(await placeBrep(base,members[index].transform));
      var groups=await brepConnectedGroups(copies.map(function(brep,at){return {brep:brep,bounds:partBounds(members[at].part)};}));
      // The document may have moved on while the kernel worked; a stale answer
      // is worse than no answer.
      if(E.def!==def||!members.every(function(member){return (def.parts || []).includes(member.part);}))return;
      var absorbed=[],hosts=[];
      groups.forEach(function(group){
        if(group.length<2)return;
        var host=members[group[0]].part;
        hosts.push(host);
        /* A placement is stored RELATIVE TO THE HOST, never in world space.
           A copy's own turn is NOT baked into its BREP — buildPart nests it as
           groups around the whole body and the exact tree wraps it in the
           `transformBody` row emitPartPatternTurn writes, exactBrepForPart
           itself leaves it out — so a merge fused into that body is turned by
           the host's transform on both routes out. A world placement would
           therefore be turned twice.
           The seed hosts at the identity and a linear copy carries no turn, so
           those clusters read the same either way; a circular or curve cluster
           that does not contain the seed is hosted by a ROTATED copy, and only
           the host-relative form puts it where the copies were. */
        var fromHost=invertRigidTransform(patternRotationTransform(partPatternRotations(host)));
        /* ONE record per cluster, carrying every instance's placement, rather
           than one per instance: the shape being copied is stored once instead
           of N times in the saved model, and the cluster's copies are welded to
           each other before they meet the host. */
        host.merges3d=host.merges3d || [];
        host.merges3d.push({kind:"placed",part:cloneData(source),placements:group.slice(1).map(function(at){return composeRigidTransforms(fromHost,members[at].transform);}),...(featureId?{featureId:featureId,patternFeatureId:featureId}:{})});
        group.slice(1).forEach(function(at){absorbed.push(members[at].part);});
      });
      if(!absorbed.length)return;
      def.parts=(def.parts || []).filter(function(part){return !absorbed.includes(part);});
      hosts.forEach(function(host){invalidatePartMeshAfterEdit(host);queueExactMesh(host);});
      if(absorbed.includes(E.sel))E.sel=hosts[0];
      refreshAll();
      flash("✓ "+tf("patternMerged",{count:absorbed.length,bodies:(def.parts || []).filter(function(part){return part===seed||part.derivedFeatureId===featureId;}).length}));
    }catch(error){
      console.warn("Pattern merge failed:",error);
      if(E.def===def)flash(t("patternMergeFail"));
    }finally{
      copies.forEach(function(copy){disposeBrep(copy);});
      if(base)disposeBrep(base);
    }
  })();
}

function topologyEdgeDirection(entry) {
  var d = entry && entry.descriptor || {};
  if (d.axis && (Number(d.axis.x) || Number(d.axis.y) || Number(d.axis.z))) return { x: Number(d.axis.x) || 0, y: Number(d.axis.y) || 0, z: Number(d.axis.z) || 0 };
  var ends = edgeEndpoints(entry);
  if (ends.length < 2) return null;
  return { x: ends[1].x - ends[0].x, y: ends[1].y - ends[0].y, z: ends[1].z - ends[0].z };
}
function patternParamsFromSelectedEdges(params) {
  var edges = (E.topologySelection || []).filter(function (item) { return item.kind === "edge"; });
  if (!edges.length || params.mode && params.mode !== "linear") return params;
  var next = { ...params };
  var first = topologyEdgeDirection(edges[0]);
  if (first) {
    next.direction1 = first;
    next.direction1Ref = cloneData(edges[0]);
    next.count1 = Number(params.countX || params.count) || 2;
    next.spacing1 = Number(params.spacingX != null ? params.spacingX : params.spacing) || 0;
  }
  if (edges[1]) {
    var second = topologyEdgeDirection(edges[1]);
    if (second) {
      next.direction2 = second;
      next.direction2Ref = cloneData(edges[1]);
      next.count2 = Number(params.countY || params.countZ || params.count) || 2;
      next.spacing2 = Number(params.spacingY != null ? params.spacingY : params.spacingZ != null ? params.spacingZ : params.spacing) || 0;
    }
  }
  return next;
}
function selectedPatternBody(seedId) {
  var selected=selectedSolid();if(selected)return selected;
  function contains(id,seen){if(id===seedId)return true;if(!id || seen.has(id))return false;seen.add(id);var feature=(E.def.features || []).find(function(item){return item.id===id;});return (feature?.inputs || []).some(function(input){return contains(input,seen);});}
  return activeParts(E.def).find(function(part){return contains(cutTargetFeatureId(part),new Set());}) || null;
}
function quickPatternPart(count, pitch) {
  var params={...featureDefaults("pattern"),...(typeof count==="object"?count:{count:count,spacing:pitch})};count=Math.max(2,Math.round(params.count));pitch=Number(params.spacing)||0;
  params=patternParamsFromSelectedEdges(params);
  var p = selectedPatternBody(params.seedFeatureId);
  if (!p) { flash(t("quickNeedPart")); return false; }
  if(params.scope==="feature"){
    var seed=(E.def.features || []).find(function(item){return item.id===params.seedFeatureId;});
    if(!seed?.inputs?.[0]){flash("Select the feature to repeat in the history tree");return false;}
    pushUndo(t("quickPattern"));
    try{var hostId=cutTargetFeatureId(p);createFeatureDefinition(E.def,"pattern",{inputs:[hostId],references:{sketches:[],features:[hostId],topology:[],references:[]},params:params});queueExactMesh(p);refreshAll();return true;}
    catch(error){H.discard();flash(String(error.message || error));return false;}
  }
  var curveSketch=params.mode==="curve"?patternCurveSketch():null;
  /* The path is baked into the feature before it is created, so a reload
     rebuilds the same run of copies without the sketch having to be selected
     again — and so a later edit of the sketch does not silently re-aim it. */
  if(params.mode==="curve"){
    params=resolvePatternCurvePath(params);
    if(curvePatternPath(params).length<2){flash(t("patternNeedCurve"));return false;}
  }
  pushUndo(t("quickPattern"));
  var feature;
  var source=cutTargetFeatureId(p);
  if(isCanonicalAuthoring())try{feature=createFeatureDefinition(E.def,"pattern",{inputs:[source],references:{sketches:curveSketch?[curveSketch.id]:[],features:[source],topology:[],references:[]},params:params});}catch(error){H.discard();flash(String(error.message||error));return false;}
  var circularStep=circularPatternStepDegrees(params,count)*Math.PI/180,placements=patternPlacements(params);
  if(!placements.length){H.discard();flash(t("patternNeedCurve"));return false;}
  layPatternCopies(p,params,feature,placements,circularStep,addPart);
  if(E.authoring.patternOverlap && !params.mergeResult)flash(t("livePatternOverlapHint"));
  refreshAll(); return true;
}

function featureReferenceOptions(type,state) {
  if(type==="helix-reference"){
    var selectedPaths=selectedSketchIds(),pathId=selectedPaths[selectedPaths.length>1?1:0];
    var pathSketch=(E.def.sketches || []).find(function(sketch){return sketch.id===pathId;});
    return [{value:"",label:pathSketch?.name || t("sweepPathSketch")}].concat(documentHelixRecords().map(function(record){
      var owner=(E.def.features || []).find(function(feature){return feature.id===record.featureId;});
      return {value:record.id,label:(owner && owner.name) || record.name || record.id};
    }));
  }
  var expected=type==="axis-reference"?"axis":"plane";
  var choices=(E.def.references || []).filter(function(reference){return reference.type===expected;}).map(function(reference){return {value:reference.id,label:reference.name || reference.id};});
  if(type==="axis-reference" && ["revolve","revolveCut"].includes(state?.type)){
    if(isStandaloneSketchAxisRevolve(state.params))
      return [{value:state.params.axis,label:t("revolveStoredAxis")}];
    var sketch=state.id?sketchById(E.def,state.params.sketchId):ensureSketch(E.def);
    (sketch?.entities || []).forEach(function(entity,index){
      if(entity.type!=="line" || entity.projectedCurve)return;
      var endpoints=[entity.a,entity.b].map(id=>sketch.points.find(p=>p.id===id));
      var location=endpoints.every(Boolean)?endpoints.map(p=>"("+modelLengthText(p.x)+", "+modelLengthText(p.y)+")").join(" → "):"";
      choices.push({value:sketchAxisReference(entity.id),label:(entity.construction?t("revolveCenterline"):t("revolveSketchLine"))+" "+(index+1)+"  "+location});
    });
    var current=featureReferenceValue(state,"axis-reference");
    if(isSketchAxis(current) && !choices.some(choice=>choice.value===current))
      choices.push({value:current,label:t("revolveMissingAxis")});
  }
  return choices;
}

function featureExtrusionExtentText(type,state,params) {
  if(!['extrude','extrudeCut'].includes(type))return '';
  if(!['blind','mid-plane'].includes(params.endCondition || 'blind'))return '';
  var reference=state.references?.sketches?.[0],sketchId=params.sketchId || (typeof reference==='string'?reference:reference?.id);
  var sketch=sketchId?(E.def.sketches || []).find(function(item){return item.id===sketchId;}):!state.id?ensureSketch(E.def):null;
  if(!sketch)return '';
  var axis=planeAxis(sketch.plane),local=sketch.frameSpace==='local'&&sketch.frame;
  if(sketch.frame&&!local)return '';
  var principal=local || !sketch.frame?.normal?1:Math.sign(sketch.frame.normal[axis] || 1);
  var direction=(params.direction==='reverse'?-1:1)*principal;
  var plane=local?0:Number(sketch.offset || 0),offset=Number(params.offset || 0),depth=Number(params.depth);
  if(![plane,offset,depth].every(Number.isFinite)||depth<=0)return '';
  var center=plane+direction*offset,symmetric=params.symmetric || params.endCondition==='mid-plane';
  var from=symmetric?center-direction*depth/2:center,to=symmetric?center+direction*depth/2:center+direction*depth;
  var unit=modelLengthUnit(),length=function(value){return formatDocumentLength(value,unit)+' '+unit;};
  return (local?t('featureExtentSketchNormal'):tf('featureExtentPlane',{axis:axis.toUpperCase(),plane:length(plane)}))+' · '+tf('featureExtentStartEnd',{start:length(from),end:length(to)});
}

function renderFeatureParameterForm(host,type,state,onLive) {
  var extentNote=null,positionNote=null;
  function showCylindricalPosition(params){
    if(!positionNote)return;
    positionNote.hidden=params.cylinderPlacementMethod!=='constraints';if(positionNote.hidden)return;
    try{
      var graph=cylindricalHolePlacement(params,E.def,{allowUnderdefined:true}).positionGraph;
      var pointText=Object.entries(graph.points).map(function(pair){var p=pair[1];return pair[0]+' ('+[p.x,p.y,p.z].map(v=>modelLengthText(v,5)).join(', ')+')';}).join(' · ');
      positionNote.textContent=graph.status+' · '+graph.degreesOfFreedom+' DOF · maximum residual '+graph.maxResidual.toExponential(2)+' cm · '+pointText+' '+modelLengthUnit()+'. Construction A→B. A coincident with top-axis center; B on top plane; enabled OnSurface / AlongZ / AlongY relations drive the native hole. This is a bounded 3D point graph, not a general 3D sketch or generated hole-profile sketch.';
    }catch(error){positionNote.textContent=String(error.message || error);}
  }
  var controls=renderFeatureParameterFormCore(host,type,state,function(next){
    if(extentNote)extentNote.textContent=featureExtrusionExtentText(type,state,next.params);
    showCylindricalPosition(next.params);
    if(onLive)onLive(next);
  },{
    el:el,
    units:{length:modelLengthUnit(),angle:E.def?.context?.units?.angle || "deg"},
    referenceOptions:function(fieldType){return featureReferenceOptions(fieldType,state);},
    featureSeeds:(E.def.features || []).filter(function(feature,index,features){var current=features.findIndex(function(item){return item.id===state.id;});return !feature.suppressed && FEATURE_PATTERN_SEED_TYPES.includes(feature.type) && feature.inputs?.length && (current<0 || index<current);}).map(function(feature){return {value:feature.id,label:feature.name || feature.type};}),
    advancedLabel:t("featureMoreOptions"),
  });
  if(type==="revolve" && isStandaloneSketchAxisRevolve(state.params)){
    var thin=controls.find(control=>control.field.key==="thinFeature");
    thin?.input.closest(".md-quick-field")?.appendChild(el("small","md-note",t("revolveStoredThinHint")));
  }
  if(type==='hole' && state.params?.cylindricalSource){
    positionNote=el('output','md-note');positionNote.setAttribute('aria-live','polite');positionNote.setAttribute('data-cylindrical-position-graph','');
    host.appendChild(positionNote);showCylindricalPosition(state.params);
  }
  if(['extrude','extrudeCut'].includes(type)){
    var offsetControl=controls.find(function(control){return control.field.key==='offset';});
    var offsetRow=offsetControl?.input.closest('.md-quick-field');
    if(offsetRow){
      offsetRow.appendChild(el('small','md-note md-extrusion-extent-note',t('featureStartOffsetHint')));
      extentNote=el('output','md-note md-extrusion-extent-note',featureExtrusionExtentText(type,state,state.params));
      extentNote.setAttribute('aria-live','polite');extentNote.setAttribute('data-extrusion-extent','');
      offsetRow.appendChild(extentNote);
    }
  }
  if(type==="thread"){
    var preset=controls.find(function(control){return control.field.key==="threadPreset";});
    var syncPreset=function(changed){
      var unified=preset && preset.input.value==="unc-quarter-20",custom=preset && preset.input.value==="custom";
      controls.forEach(function(control){
        var key=control.field.key,fixed={diameterMm:6.35,pitchMm:1.27,mode:"cosmetic",series:"coarse",useFitLimits:false};
        if(["series","toleranceClass","useFitLimits"].includes(key)){var wrap=control.input.closest(".md-quick-field");if(wrap)wrap.classList.toggle("parameter-hidden",!!custom);}
        if(Object.prototype.hasOwnProperty.call(fixed,key)){
          control.input.disabled=!!unified || !!custom && ["mode","series","useFitLimits"].includes(key);
          if(custom && ["mode","useFitLimits"].includes(key)){state.params[key]=fixed[key];if(control.input.type==="checkbox")control.input.checked=false;else control.input.value=String(fixed[key]);}
          if(unified){state.params[key]=fixed[key];if(control.input.type==="checkbox")control.input.checked=false;else control.input.value=String(fixed[key]);}
        }
        if(key==="toleranceClass"){
          control.input.disabled=!!custom;
          if(custom){control.input.value="";state.params[key]="";}
          control.input.placeholder=unified?"2A / 2B":"6g / 6H";
          if(changed){control.input.value="";state.params[key]="";}
        }
      });
    };
    syncPreset(false);
    if(preset)preset.input.addEventListener("change",function(){syncPreset(true);});
  }
  return controls;
}

export {
  clearPatternMerges, createRibFeature, featureReferenceOptions,
  layPatternCopies, quickDomePart, quickDraftPart, quickMirrorPart,
  quickMoveBodyPart, quickPatternPart, quickRoundPart, quickShellPart,
  quickSplitBodyPart, quickThickenPart, renderFeatureParameterForm,
  runCommand, selectedPatternBody, selectedSolid,
};
