/* The CAD editor's interactive sketch guide, split out of js/modeler.js.
   It shares the editor's state through live imports from ../modeler.js. */
import { auditStandardParts, involuteGearOutline } from "../cad_standards.js";
import { registerGeneratedExtrusion } from "../core/generated_extrusion.js";
import { getLang } from "../i18n.js";
import { closeModelerSheet, showModelerSheet } from "../modeler_mobile.js";
import { cloneData, normalizeTransform } from "../modeler_part_geometry.js";
import { TXT, t } from "../modeler_strings.js";
import { welcomeGlyph } from "../modeler_welcome_glyphs.js";
import { addSketchCircle, addSketchRectangle, displayedCoreIssues, resolveSketch, selLines, sketchForView } from "../modeler/sketch_entities.js";
import { closeWelcome, syncCoach, updateTourProgress, welcomeGuideCards } from "../modeler/welcome_coach.js";
import { addSketch, ensureSketch, ensureSketchDoc, sketchPoint, solveSketch } from "../sketch_solver.js";
import { bindSpeakButton, stopSpeaking } from "../speech.js";
import { uid } from "../state.js";
import {
  E, H, activeParts, addPart, closeFeaturePanel, closedSketchProfile,
  fitPreview, fitSketch, flash, invalidateInterference, isCanonicalAuthoring,
  loadAssemblies, newAssembly, newDef, newSketchPoint, openParametricFeature,
  pushUndo, refreshAll, root, saveAssemblies, saveAssemblyDocument,
  selectedSolid, setCommandTab, setDocumentType, setMobileAddSelection,
  setMode, setTab, setTool, setView,
} from "../modeler.js";

/* ================= interactive sketch guide =================
   This is a coach layered over the real editor, not a detached slideshow. Each
   practice step observes the document state, so Continue unlocks only after
   the user has actually performed the modelling action. */
function tourEntityCount() {
  return E.def ? (ensureSketch(E.def).entities || []).length : 0;
}
function tourConstraintCount(type) {
  if (!E.def) return 0;
  return (ensureSketch(E.def).constraints || []).filter(function (c) { return !c.suppressed && c.type === type; }).length;
}
function tourPointSignature() {
  if (!E.def) return "";
  return (ensureSketch(E.def).points || []).map(function (p) {
    return p.id + ":" + Math.round(p.x * 1000) + "," + Math.round(p.y * 1000);
  }).sort().join("|");
}

function mobileTourSteps() {
  return [
    {
      title: "guideMobileIntroTitle",
      body: "guideMobileIntroBody",
      tip: "guideMobileIntroTip",
      target: "#md-nav",
      manual: true,
      noAutoReveal: true,
      prepare: function () {
        if (E.docType !== "part") setDocumentType("part");
        setMode("3d");
        if (document.body.classList.contains("compact-nav")) closeModelerSheet();
      },
    },
    {
      title: "guideMobileNavTitle",
      body: "guideMobileNavBody",
      tip: "guideMobileNavTip",
      target: '[data-mdnav="cmd"]',
      noAutoReveal: true,
      prepare: function () {
        setMode("2d");
        setView("top");
        setCommandTab("sketch");
        if (document.body.classList.contains("compact-nav")) closeModelerSheet();
      },
      done: function () { return E.tool === "srect"; },
    },
    {
      title: "guideMobileSketchTitle",
      body: "guideMobileSketchBody",
      tip: "guideMobileSketchTip",
      target: ".md-mid",
      autoCollapseMobile: true,
      baseline: function () { return tourEntityCount(); },
      prepare: function () {
        if (document.body.classList.contains("compact-nav")) closeModelerSheet();
        setMode("2d");
        setView("top");
        if (E.tool !== "srect") setTool("srect");
      },
      done: function () { return tourEntityCount() >= Number(E.tour.baseline || 0) + 4; },
    },
    {
      title: "guideMobileExtrudeTitle",
      body: "guideMobileExtrudeBody",
      tip: "guideMobileExtrudeTip",
      target: '[data-md-action="extrude"]',
      noAutoReveal: true,
      autoCollapseMobile: true,
      baseline: function () { return tourPartCount("ext"); },
      prepare: function () {
        setMode("2d");
        setCommandTab("features");
        /* Leave sketch phase so the thumb row is Extrude, not Finish-sketch.
           Do not call finishSketchWorkflow(): that auto-opens the feature form
           and the step would never get to ring the Extrude control.
           Auto mode already opened the form — leave the Tree sheet holding it. */
        if (!(E.authoring && E.authoring.featureType)) {
          setTool("select");
          if (E.authoring && E.authoring.phase === "sketch") {
            E.authoring.phase = "model";
            E.authoring.workflowFocus = "feature";
          }
          if (document.body.classList.contains("compact-nav")) closeModelerSheet();
        }
        var sketch = ensureSketch(E.def);
        var lines = (sketch.entities || []).filter(function (entity) { return entity.type === "line"; }).slice(-4);
        if (lines.length) {
          E.ssel = lines;
          E.sel = lines[0];
        }
        if (lines.length === 4 && !(sketch.constraints || []).some(function (constraint) { return constraint._mobileTour; })) {
          var anchor = sketchPoint(sketch, lines[0].a);
          var a0 = sketchPoint(sketch, lines[0].a), b0 = sketchPoint(sketch, lines[0].b);
          var a1 = sketchPoint(sketch, lines[1].a), b1 = sketchPoint(sketch, lines[1].b);
          if (anchor && a0 && b0 && a1 && b1) {
            sketch.constraints.push({ id:uid(), type:"fixed", point:anchor.id, x:anchor.x, y:anchor.y, _mobileTour:true });
            sketch.constraints.push({ id:uid(), type:"distance", entity:lines[0].id, value:Math.hypot(b0.x-a0.x,b0.y-a0.y), _mobileTour:true });
            sketch.constraints.push({ id:uid(), type:"distance", entity:lines[1].id, value:Math.hypot(b1.x-a1.x,b1.y-a1.y), _mobileTour:true });
            resolveSketch(false);
            refreshAll();
          }
        }
      },
      done: function () { return tourPartCount("ext") > Number(E.tour.baseline || 0); },
    },
    {
      title: "guideMobileSelectTitle",
      body: "guideMobileSelectBody",
      tip: "guideMobileSelectTip",
      /* NOT the selection bar: that bar is hidden until something is selected,
         so the step used to ring a 0x0 box. Point at the canvas you tap; the
         bar appears there by itself. */
      target: ".md-mid",
      autoCollapseMobile: true,
      prepare: function () {
        if (document.body.classList.contains("compact-nav")) closeModelerSheet();
        setMode("3d");
        setTool("select");
        setMobileAddSelection(true);
        refreshAll();
      },
      /* prepare() turns add-selection on, so accepting it as proof of work made
         the step complete itself before the user touched anything. */
      done: function () {
        return (E.topologySelection || []).length >= 1;
      },
    },
    {
      title: "guideMobileTreeTitle",
      body: "guideMobileTreeBody",
      tip: "guideMobileTreeTip",
      target: '[data-mdnav="tree"]',
      noAutoReveal: true,
      prepare: function () {
        if (document.body.classList.contains("compact-nav")) closeModelerSheet();
      },
      done: function () {
        if (!root) return false;
        // the TREE sheet specifically — the borrowed panel is the proof
        return !!(root.querySelector("#md-sheet.on .md-left") || root.classList.contains("md-tree-on"));
      },
    },
    {
      title: "guideMobileFinishTitle",
      body: "guideMobileFinishBody",
      tip: "guideMobileFinishTip",
      target: '[data-mdnav="view"]',
      manual: true,
      noAutoReveal: true,
      prepare: function () {
        if (document.body.classList.contains("compact-nav")) closeModelerSheet();
        setMode("3d");
      },
    },
  ];
}

function sketchTourSteps() {
  return [
    { title:"guideIntroTitle", body:"guideIntroBody", tip:"guideIntroTip", target:".md-commandmanager", manual:true },
    { title:"guideToolsTitle", body:"guideToolsBody", tip:"guideToolsTip", target:'[data-command="srect"]',
      prepare:function () { setCommandTab("sketch"); },
      done:function () { return E.tool === "srect"; } },
    { title:"guideDrawTitle", body:"guideDrawBody", tip:"guideDrawTip", target:".md-mid",
      baseline:function () { return tourEntityCount(); },
      prepare:function () { setCommandTab("sketch"); if (E.tool !== "srect") setTool("srect"); },
      done:function () { return tourEntityCount() >= Number(E.tour.baseline || 0) + 4; } },
    { title:"guideMoveTitle", body:"guideMoveBody", tip:"guideMoveTip", target:".md-mid",
      baseline:tourPointSignature,
      prepare:function () { setTool("select"); E.ssel = []; E.sel = null; refreshAll(); },
      done:function () { return !!E.tour.baseline && tourPointSignature() !== E.tour.baseline; } },
    { title:"guideSelectTitle", body:"guideSelectBody", tip:"guideSelectTip", target:".md-mid",
      prepare:function () { setTool("select"); E.ssel = []; E.sel = null; refreshAll(); },
      done:function () { return selLines().length === 1; } },
    { title:"guideDimTitle", body:"guideDimBody", tip:"guideDimTip", target:'[data-tour-prop="length"]',
      baseline:function () { return tourConstraintCount("distance"); },
      prepare:function () { setTool("select"); setTab("shape"); },
      done:function () { return tourConstraintCount("distance") > Number(E.tour.baseline || 0); } },
    { title:"guidePairTitle", body:"guidePairBody", tip:"guidePairTip", target:".md-mid",
      prepare:function () { setTool("select"); E.ssel = []; E.sel = null; setTab("sketch"); refreshAll(); },
      done:function () { return selLines().length === 2; } },
    { title:"guideRelationTitle", body:"guideRelationBody", tip:"guideRelationTip", target:'[data-constraint="equal"]',
      baseline:function () { return tourConstraintCount("equal"); },
      prepare:function () { setTab("sketch"); },
      done:function () { return tourConstraintCount("equal") > Number(E.tour.baseline || 0); } },
    { title:"guideFinishTitle", body:"guideFinishBody", tip:"guideFinishTip", target:'[data-tab="sketch"]', manual:true },
  ];
}

function tourPartCount(kind) {
  return !E.def ? 0 : (E.def.parts || []).filter(function (part) { return !part.suppressed && (!kind || part.kind === kind); }).length;
}
function tourAssemblyTransformSignature() {
  return !E.assembly ? "" : E.assembly.components.map(function (component) {
    var tr = normalizeTransform(component);
    return component.id + ":" + [tr.x,tr.y,tr.z,tr.rx,tr.ry,tr.rz].join(",");
  }).join("|");
}

function tourAllSketchEntityCount(type) {
  if (!E.def) return 0;
  return ensureSketchDoc(E.def).reduce(function (sum, sketch) {
    return sum + (sketch.entities || []).filter(function (entity) { return !type || entity.type === type; }).length;
  }, 0);
}
function tourCutCount() {
  if (!E.def) return 0;
  return (E.def.parts || []).reduce(function (sum, part) {
    return sum + (part.holes || []).length + (part.cuts3d || []).length;
  }, 0);
}
function tourSketchIsFullyDefined(sketch) {
  return !!sketch && (sketch.entities || []).length > 0 && solveSketch(sketch).status === "fully-constrained";
}
function tourActiveSketchIsFullyDefined() {
  return !!E.def && tourSketchIsFullyDefined(ensureSketch(E.def));
}
function tourCubeIsComplete() {
  if (!E.def) return false;
  var modeledSketches = ensureSketchDoc(E.def).filter(function (sketch) {
    return (sketch.entities || []).length > 0;
  });
  var rebuildErrors = displayedCoreIssues().some(function (issue) { return issue.severity === "error"; });
  return modeledSketches.length >= 4
    && modeledSketches.every(tourSketchIsFullyDefined)
    && tourPartCount("ext") >= 1
    && tourCutCount() >= 3
    && !rebuildErrors;
}
function solidworksCubeTourSteps() {
  return [
    {title:"swIntroTitle",body:"swIntroBody",tip:"swIntroTip",target:'.md-commandmanager',manual:true,
      prepare:function(){if(E.docType!=="part")setDocumentType("part");setMode("2d");setView("top");setCommandTab("sketch");}},
    {title:"swPlaneTitle",body:"swPlaneBody",tip:"swPlaneTip",target:'[data-command="srect"]',
      prepare:function(){setMode("2d");setView("top");setCommandTab("sketch");},done:function(){return E.view==="top"&&E.tool==="srect";}},
    {title:"swRectTitle",body:"swRectBody",tip:"swRectTip",target:'.md-mid',baseline:function(){return tourEntityCount();},
      prepare:function(){setMode("2d");setView("top");if(E.tool!=="srect")setTool("srect");},done:function(){return tourEntityCount()>=Number(E.tour.baseline||0)+4;}},
    {title:"swDimTitle",body:"swDimBody",tip:"swDimTip",target:'[data-command="dim"]',
      prepare:function(){setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swExtrudeTitle",body:"swExtrudeBody",tip:"swExtrudeTip",target:'[data-command="extrude"]',baseline:function(){return tourPartCount("ext");},
      prepare:function(){setMode("2d");setCommandTab("features");},done:function(){return tourPartCount("ext")>Number(E.tour.baseline||0);}},
    {title:"swCircleTitle",body:"swCircleBody",tip:"swCircleTip",target:'[data-command="scirc"]',baseline:function(){return tourAllSketchEntityCount("circle");},
      prepare:function(){setMode("3d");setCommandTab("sketch");},done:function(){return tourAllSketchEntityCount("circle")>Number(E.tour.baseline||0);}},
    {title:"swDiameterTitle",body:"swDiameterBody",tip:"swDiameterTip",target:'[data-command="dim"]',
      prepare:function(){setMode("2d");setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swCutTitle",body:"swCutBody",tip:"swCutTip",target:'[data-command="extrudecut"]',baseline:tourCutCount,
      prepare:function(){setMode("3d");setView("front");var p=(E.def.parts||[]).filter(function(q){return q.kind==="ext";}).slice(-1)[0];if(p)E.sel=p;refreshAll();},done:function(){return tourCutCount()>Number(E.tour.baseline||0);}},
    /* The right and top bores repeat the front bore, and they used to be
       `manual` — the guide stopped checking exactly where the work gets hard,
       so Continue passed whether or not anything had been modelled. They now
       observe the document the same way steps 5–7 do. */
    {title:"swRightCircleTitle",body:"swRightCircleBody",tip:"swCircleTip",target:'[data-command="scirc"]',baseline:function(){return tourAllSketchEntityCount("circle");},
      prepare:function(){setMode("2d");setView("side");setCommandTab("sketch");},done:function(){return tourAllSketchEntityCount("circle")>Number(E.tour.baseline||0);}},
    {title:"swRightDimTitle",body:"swRightDimBody",tip:"swDimTip",target:'[data-command="dim"]',
      prepare:function(){setMode("2d");setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swRightCutTitle",body:"swOtherCutsBody",tip:"swFeatureFormTip",target:'[data-command="extrudecut"]',baseline:tourCutCount,
      prepare:function(){setMode("3d");setCommandTab("features");},done:function(){return tourCutCount()>Number(E.tour.baseline||0);}},
    {title:"swTopCircleTitle",body:"swTopCircleBody",tip:"swCircleTip",target:'[data-command="scirc"]',baseline:function(){return tourAllSketchEntityCount("circle");},
      prepare:function(){setMode("2d");setView("top");setCommandTab("sketch");},done:function(){return tourAllSketchEntityCount("circle")>Number(E.tour.baseline||0);}},
    {title:"swTopDimTitle",body:"swTopDimBody",tip:"swDimTip",target:'[data-command="dim"]',
      prepare:function(){setMode("2d");setCommandTab("sketch");},done:tourActiveSketchIsFullyDefined},
    {title:"swTopCutTitle",body:"swOtherCutsBody",tip:"swFeatureFormTip",target:'[data-command="extrudecut"]',baseline:tourCutCount,
      prepare:function(){setMode("3d");setCommandTab("features");},done:function(){return tourCutCount()>Number(E.tour.baseline||0);}},
    {title:"swFilletTitle",body:"swFilletBody",tip:"swFilletTip",target:'#mdParts',
      prepare:function(){setMode("3d");setTab("parts");refreshAll();},done:tourCubeIsComplete},
    {title:"swFinishTitle",body:"swFinishBody",tip:"swFinishTip",target:'[data-mode="3d"]',prepare:function(){setMode("3d");},done:tourCubeIsComplete},
  ];
}
/* The cap sits in its own vertical band above the base. Both practice parts
   used to start at y=0 with the same 20x20 footprint, so the Align X step —
   which only copies X — buried the cap inside the base and left every side and
   bottom face coincident, z-fighting into a dithered mess. Stacked, Align X
   does what its step text promises and no two faces are coplanar. */
function addPracticeAssemblyComponent(index) {
  var color = index ? "#62a6d8" : "#d89b62";
  var def = {
    key:"tour_component_" + index, name:index ? "Tutorial cap" : "Tutorial base", price:0, col:color,
    parts:[{id:uid(),kind:"box",name:index ? "cap" : "base",x0:-10,x1:10,y0:index?12:0,y1:index?20:12,z0:-10,z1:10,color:color,metal:0.05,rough:0.7}],
    constraints:[],sketches:[],features:[],variables:[],
  };
  E.assembly.components.push({
    id:uid(), modelKey:def.key, name:def.name, def:def, visible:true,
    grounded:E.assembly.components.length === 0,
    transform:{x:E.assembly.components.length * 28,y:0,z:0,rx:0,ry:0,rz:0},
  });
}
function ensurePracticeAssembly() {
  if (E.docType !== "assembly") setDocumentType("assembly");
  if (!E.assembly) E.assembly = newAssembly();
  while (E.assembly.components.length < 2) addPracticeAssemblyComponent(E.assembly.components.length);
  E.componentSel = []; E.sel = null;
  setTab("parts"); refreshAll(); fitPreview();
}

function flowerTourSteps() {
  return [
    {title:"flowerIntroTitle",body:"flowerIntroBody",tip:"flowerIntroTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,
      prepare:function(){ if(E.docType!=="part")setDocumentType("part");setMode("2d");setView("front");setCommandTab("features");setTab("parts");}},
    {title:"flowerCenterTitle",body:"flowerCenterBody",tip:"flowerCenterTip",target:'.md-mid',
      baseline:function(){return tourPartCount("sph");},prepare:function(){setView("front");setTool("sph");},
      done:function(){return tourPartCount("sph")>Number(E.tour.baseline||0);}},
    {title:"flowerPetalsTitle",body:"flowerPetalsBody",tip:"flowerPetalsTip",target:'.md-mid',
      baseline:function(){return tourPartCount("sph");},prepare:function(){setTool("sph");},
      done:function(){return tourPartCount("sph")>=Number(E.tour.baseline||0)+4;}},
    {title:"flowerStemTitle",body:"flowerStemBody",tip:"flowerStemTip",target:'.md-mid',
      baseline:function(){return tourPartCount("box");},prepare:function(){setTool("rect");},
      done:function(){return tourPartCount("box")>Number(E.tour.baseline||0);}},
    {title:"flowerPotTitle",body:"flowerPotBody",tip:"flowerPotTip",target:'.md-mid',
      baseline:function(){return tourPartCount("box");},prepare:function(){setTool("rect");},
      done:function(){return tourPartCount("box")>Number(E.tour.baseline||0);}},
    {title:"flowerViewTitle",body:"flowerViewBody",tip:"flowerViewTip",target:'[data-mode="3d"]',
      done:function(){return E.mode==="3d";}},
    {title:"flowerFinishTitle",body:"flowerFinishBody",tip:"flowerFinishTip",target:'[data-tab="look"]',manual:true},
  ];
}

function preparePrimitiveProject(view) {
  if(E.docType!=="part")setDocumentType("part");setMode("2d");setView(view||"top");setCommandTab("features");setTab("parts");
}
function projectViewStep() {
  return {title:"projectViewTitle",body:"projectViewBody",tip:"projectModelTip",target:'[data-mode="3d"]',done:function(){return E.mode==="3d";}};
}
function standardizedPartCount(family) {
  return !E.def?0:(E.def.parts||[]).filter(function(p){return p.standardCompliance&&p.standardCompliance.family===family;}).length;
}
function screwTourSteps() {
  return [
    {title:"screwIntroTitle",body:"screwIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("top");}},
    {title:"screwShaftTitle",body:"screwShaftBody",tip:"projectModelTip",target:'[data-command="stdscrew"]',baseline:function(){return standardizedPartCount("hex-screw");},prepare:function(){setCommandTab("features");},done:function(){return standardizedPartCount("hex-screw")>Number(E.tour.baseline||0);}},
    {title:"standardAuditTitle",body:"standardAuditBody",tip:"projectModelTip",target:'[data-command="standards"]',prepare:function(){setCommandTab("evaluate");},done:function(){return !!(E.def.lastStandardsAudit&&E.def.lastStandardsAudit.ok);}},
    projectViewStep(),
    {title:"screwFinishTitle",body:"screwIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
function gearTourSteps() {
  return [
    {title:"gearIntroTitle",body:"gearIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("top");}},
    {title:"gearBlankTitle",body:"gearBlankBody",tip:"projectModelTip",target:'[data-command="stdgear"]',baseline:function(){return standardizedPartCount("involute-gear");},prepare:function(){setCommandTab("features");},done:function(){return standardizedPartCount("involute-gear")>Number(E.tour.baseline||0);}},
    {title:"standardAuditTitle",body:"standardAuditBody",tip:"projectModelTip",target:'[data-command="standards"]',prepare:function(){setCommandTab("evaluate");},done:function(){return !!(E.def.lastStandardsAudit&&E.def.lastStandardsAudit.ok);}},
    projectViewStep(),
    {title:"gearFinishTitle",body:"gearIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
function studBallTourSteps() {
  return [
    {title:"studIntroTitle",body:"studIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("front");}},
    {title:"studCoreTitle",body:"studCoreBody",tip:"projectModelTip",target:'.md-mid',baseline:function(){return tourPartCount("sph");},prepare:function(){setTool("sph");},done:function(){return tourPartCount("sph")>Number(E.tour.baseline||0);}},
    {title:"studAddTitle",body:"studAddBody",tip:"projectModelTip",target:'.md-mid',baseline:function(){return tourPartCount("sph");},prepare:function(){setTool("sph");},done:function(){return tourPartCount("sph")>=Number(E.tour.baseline||0)+6;}},
    projectViewStep(),
    {title:"studFinishTitle",body:"studIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
/* Pattern is the one feature people report as "broken": it silently does
   nothing without a selected solid, and overlapping spacing looks like a
   no-op. Both failure modes get their own step here. */
function patternTourSteps() {
  return [
    {title:"patternIntroTitle",body:"patternIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("front");}},
    {title:"patternSeedTitle",body:"patternSeedBody",tip:"projectModelTip",target:'.md-mid',
      baseline:function(){return tourPartCount("box");},prepare:function(){setTool("rect");},
      done:function(){return tourPartCount("box")>Number(E.tour.baseline||0);}},
    {title:"patternSelectTitle",body:"patternSelectBody",tip:"projectModelTip",target:'#mdParts',
      prepare:function(){setTool("select");setTab("parts");refreshAll();},
      done:function(){return !!selectedSolid();}},
    {title:"patternOpenTitle",body:"patternOpenBody",tip:"projectModelTip",target:'[data-command="patternfeature"]',
      prepare:function(){setCommandTab("features");},
      done:function(){return E.authoring.featureType==="pattern";}},
    {title:"patternLinearTitle",body:"patternLinearBody",tip:"projectModelTip",target:'#mdQuickSettings',
      baseline:function(){return tourPartCount();},
      done:function(){return tourPartCount()>Number(E.tour.baseline||0);}},
    {title:"patternCircularTitle",body:"patternCircularBody",tip:"projectModelTip",target:'[data-command="patternfeature"]',
      baseline:function(){return tourPartCount();},prepare:function(){setCommandTab("features");},
      done:function(){return tourPartCount()>Number(E.tour.baseline||0);}},
    projectViewStep(),
    {title:"patternFinishTitle",body:"patternIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}
/* The half-profile the dreidel is revolved from: a closed polyline that touches
   the axis at both ends. Closing it is what un-greys the Revolve button, which
   is why the tour has a step for it. */
function tourDreidelProfile() {
  var sketch = sketchForView();
  var ids = [{u:0,v:0},{u:5,v:7},{u:18,v:18},{u:16,v:35},{u:5,v:42},{u:5,v:55},{u:0,v:55}]
    .map(function (q) { return newSketchPoint(sketch, q); });
  var lines = ids.map(function (id, i) {
    return {id:uid(),type:"line",name:"Line",a:id,b:ids[(i+1)%ids.length],construction:false};
  });
  sketch.entities.push.apply(sketch.entities, lines);
  resolveSketch(false);
  E.tour.autoLines = lines;
  refreshAll();
  return lines;
}

/* The Revolve command opens a parametric feature form; it never sets E.tool.
   Watching for a "rev" tool (and then trying to force one with setTool, which a
   parametric document refuses outright) left both of these steps unfinishable —
   patternTourSteps above is the working shape for a step driving a form.
   Revolve is also gated on a closed sketch profile, so the tour draws one
   before it reaches the button; without that step the intro said "draw the
   profile" and the next step pointed at a permanently greyed command. */
function dreidelTourSteps() {
  return [
    {title:"dreidelIntroTitle",body:"dreidelIntroBody",tip:"projectModelTip",target:'.md-command-pane[data-command-pane="features"]',manual:true,prepare:function(){preparePrimitiveProject("front");}},
    {title:"dreidelSketchTitle",body:"dreidelSketchBody",tip:"projectModelTip",target:'[data-command="wall"]',
      prepare:function(){setCommandTab("sketch");setMode("2d");setView("front");setTool("wall");},
      done:function(){return !!closedSketchProfile();}},
    {title:"dreidelToolTitle",body:"dreidelToolBody",tip:"projectModelTip",target:'[data-command="revolvefeature"]',
      prepare:function(){setCommandTab("features");},
      done:function(){return E.authoring.featureType==="revolve";}},
    {title:"dreidelProfileTitle",body:"dreidelProfileBody",tip:"projectModelTip",target:'#mdQuickSettings',
      baseline:function(){return tourPartCount();},prepare:function(){setCommandTab("features");},
      done:function(){return tourPartCount()>Number(E.tour.baseline||0);}},
    projectViewStep(),
    {title:"dreidelFinishTitle",body:"dreidelIntroBody",tip:"projectModelTip",target:'[data-tab="look"]',manual:true},
  ];
}

function assemblyTourSteps() {
  return [
    {title:"assemblyIntroTitle",body:"assemblyIntroBody",tip:"assemblyIntroTip",target:'[data-command-pane="assembly"]',manual:true,prepare:ensurePracticeAssembly},
    {title:"assemblyPickTitle",body:"assemblyPickBody",tip:"assemblyPickTip",target:'#mdParts',
      prepare:function(){setTab("parts");E.componentSel=[];E.sel=null;refreshAll();},
      done:function(){return E.componentSel.length===1;}},
    {title:"assemblyMoveTitle",body:"assemblyMoveBody",tip:"assemblyMoveTip",target:'.md-mid',
      baseline:tourAssemblyTransformSignature,
      prepare:function(){var c=E.assembly&&E.assembly.components.filter(function(q){return !q.grounded;})[0];if(c){E.componentSel=[c];E.sel=c;}setMode("3d");refreshAll();},
      done:function(){return tourAssemblyTransformSignature()!==E.tour.baseline;}},
    {title:"assemblyPairTitle",body:"assemblyPairBody",tip:"assemblyPairTip",target:'#mdParts',
      prepare:function(){setTab("parts");E.componentSel=[];E.sel=null;refreshAll();},
      done:function(){return E.componentSel.length===2;}},
    {title:"assemblyMateTitle",body:"assemblyMateBody",tip:"assemblyMateTip",target:'[data-mate="alignX"]',
      baseline:function(){return E.assembly?(E.assembly.mates||[]).length:0;},prepare:function(){setTab("ops");},
      done:function(){return E.assembly&&(E.assembly.mates||[]).length>Number(E.tour.baseline||0);}},
    {title:"assemblySaveTitle",body:"assemblySaveBody",tip:"assemblySaveTip",target:'#mdSave',
      done:function(){return E.assembly&&loadAssemblies().some(function(a){return a.key===E.assembly.key;});}},
    {title:"assemblyFinishTitle",body:"assemblyFinishBody",tip:"assemblyFinishTip",target:'[data-command-pane="assembly"]',manual:true},
  ];
}

function tourSteps() {
  if (E.tour.track === "mobile") return mobileTourSteps();
  if (E.tour.track === "solidworks") return solidworksCubeTourSteps();
  if (E.tour.track === "flower") return flowerTourSteps();
  if (E.tour.track === "assembly") return assemblyTourSteps();
  if (E.tour.track === "screw") return screwTourSteps();
  if (E.tour.track === "gear") return gearTourSteps();
  if (E.tour.track === "studball") return studBallTourSteps();
  if (E.tour.track === "dreidel") return dreidelTourSteps();
  if (E.tour.track === "pattern") return patternTourSteps();
  return sketchTourSteps();
}

/* document-wide, not root-wide: the mobile nav, the contextual row and the
   selection bar are targets too and they live outside #modeler. Clearing only
   inside root left them marked for the rest of the session. */
function clearTourTarget() {
  document.querySelectorAll(".md-tour-target").forEach(function (node) { node.classList.remove("md-tour-target"); });
  if (root) root.querySelectorAll(".md-tour-click-marker").forEach(function(node){node.remove();});
  E.tour.target = null;
}

function showTourClickMarker(target) {
  if(!root||!target||E.tour.mode!=="auto")return;
  var tr=target.getBoundingClientRect(),rr=root.getBoundingClientRect(),marker=document.createElement("span");
  marker.className="md-tour-click-marker";marker.innerHTML='<i class="ph ph-cursor-click"></i>';
  marker.style.left=(tr.left-rr.left+tr.width/2)+"px";marker.style.top=(tr.top-rr.top+tr.height/2)+"px";
  root.appendChild(marker);
}

function clampTourPosition(position) {
  if (!root) return position;
  var card=root.querySelector(".md-tour-card"), rr=root.getBoundingClientRect();
  if(!card)return position;
  var margin=12,maxX=Math.max(margin,rr.width-card.offsetWidth-margin),maxY=Math.max(margin,rr.height-card.offsetHeight-margin);
  return {x:Math.min(maxX,Math.max(margin,position.x)),y:Math.min(maxY,Math.max(margin,position.y))};
}

function applyTourPosition() {
  if(!root)return;
  var card=root.querySelector(".md-tour-card");if(!card)return;
  if (document.body.classList.contains("compact-nav") && !E.tour.moved) {
    card.style.left = "";
    card.style.top = "";
    return;
  }
  if(!E.tour.position){
    // Parked against the trailing edge, not centred: centred put the card on
    // top of the canvas, which is the one thing most steps ask you to look at.
    var rr=root.getBoundingClientRect();
    E.tour.position={x:Math.max(12,rr.width-card.offsetWidth-24),y:Math.max(12,rr.height-card.offsetHeight-32)};
  }
  E.tour.position=clampTourPosition(E.tour.position);
  card.style.left=E.tour.position.x+"px";card.style.top=E.tour.position.y+"px";
}

/* Keep the card off the control it is pointing at. Only for targets small
   enough to dodge — for the canvas there is nowhere to go, and shuffling the
   card around on every step is worse than leaving it parked. */
function avoidTourTargetOverlap(target) {
  if(!root||!target||E.tour.moved||document.body.classList.contains("compact-nav"))return;
  var card=root.querySelector(".md-tour-card");if(!card)return;
  var rr=root.getBoundingClientRect(),tr=target.getBoundingClientRect(),cr=card.getBoundingClientRect();
  if(tr.width>rr.width*0.5&&tr.height>rr.height*0.5)return;
  if(cr.right<tr.left||cr.left>tr.right||cr.bottom<tr.top||cr.top>tr.bottom)return;
  var margin=16,w=card.offsetWidth,h=card.offsetHeight;
  var options=[
    {x:tr.right-rr.left+margin,y:E.tour.position.y},
    {x:tr.left-rr.left-w-margin,y:E.tour.position.y},
    {x:E.tour.position.x,y:tr.bottom-rr.top+margin},
    {x:E.tour.position.x,y:tr.top-rr.top-h-margin},
  ];
  for(var i=0;i<options.length;i++){
    var o=options[i];
    if(o.x<margin||o.y<margin||o.x+w>rr.width-margin||o.y+h>rr.height-margin)continue;
    var left=rr.left+o.x,top=rr.top+o.y;
    if(left+w<tr.left||left>tr.right||top+h<tr.top||top>tr.bottom){E.tour.position=o;applyTourPosition();return;}
  }
}

function installTourDragging() {
  if(!root)return;
  var card=root.querySelector(".md-tour-card"),handle=root.querySelector(".md-tour-head");
  if(!card||!handle)return;
  handle.addEventListener("pointerdown",function(event){
    if(event.button!==0||event.target.closest("button"))return;
    applyTourPosition();
    E.tour.drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:E.tour.position.x,originY:E.tour.position.y};
    E.tour.moved=true;   // once placed by hand, stop repositioning it for them
    handle.setPointerCapture(event.pointerId);card.classList.add("is-dragging");event.preventDefault();
  });
  handle.addEventListener("pointermove",function(event){
    var drag=E.tour.drag;if(!drag||drag.pointerId!==event.pointerId)return;
    E.tour.position=clampTourPosition({x:drag.originX+event.clientX-drag.startX,y:drag.originY+event.clientY-drag.startY});
    applyTourPosition();
  });
  function finish(event){if(!E.tour.drag||E.tour.drag.pointerId!==event.pointerId)return;E.tour.drag=null;card.classList.remove("is-dragging");}
  handle.addEventListener("pointerup",finish);handle.addEventListener("pointercancel",finish);
}

function tourStepDone(step, index) {
  if (!step || step.manual) return true;
  if (E.tour.completed[index]) return true;
  try {
    var done = !!step.done();
    if (done) E.tour.completed[index] = true;
    return done;
  } catch (error) { return false; }
}

function renderTourDemo(step,index) {
  var host=root&&root.querySelector("#mdTourDemo");if(!host||!step)return;
  if (step.title === "guideMobileIntroTitle") {
    host.hidden=false;
    host.innerHTML='<div class="md-tour-gestures">'+
      '<span><i class="ph ph-hand-swipe-left"></i><b>'+ (getLang()==="en"?"1 finger":"אצבע אחת") +'</b><small>'+ (getLang()==="en"?"Orbit":"סיבוב") +'</small></span>'+
      '<span><i class="ph ph-hand-swipe-right md-two-finger"></i><b>'+ (getLang()==="en"?"2 fingers":"שתי אצבעות") +'</b><small>'+ (getLang()==="en"?"Pan":"הזזה") +'</small></span>'+
      '<span><i class="ph ph-arrows-in-line-horizontal"></i><b>'+ (getLang()==="en"?"Pinch":"צביטה") +'</b><small>'+ (getLang()==="en"?"Zoom":"זום") +'</small></span>'+
      '<span><i class="ph ph-hand-tap"></i><b>'+ (getLang()==="en"?"Long press":"לחיצה ארוכה") +'</b><small>'+ (getLang()==="en"?"Select through":"בחירה דרך") +'</small></span>'+
      '</div>';
    return;
  }
  var form=String(step.target||"").indexOf("QuickSettings")>=0||String(step.title||"").toLowerCase().indexOf("extrude")>=0||String(step.title||"").toLowerCase().indexOf("fillet")>=0;
  var canvas=String(step.target||"").indexOf("md-mid")>=0;
  var phase=form?2:canvas?1:0,icons=form?["ph-cursor-click","ph-keyboard","ph-check-circle"]:canvas?["ph-crosshair","ph-pencil-line","ph-ruler"]:["ph-selection","ph-eye","ph-check-circle"],en=getLang()==="en";
  var labels=form?(en?["Select feature","Fill every field","Apply + rebuild"]:["בחירת תכונה","מילוי כל השדות","Apply ובנייה"]):canvas?(en?["Choose reference","Create geometry","Fully constrain"]:["בחירת מישור","יצירת גאומטריה","הגדרה מלאה"]):(en?["Find the control","Check the result","Continue"]:["מציאת הכלי","בדיקת התוצאה","המשך"]);
  host.hidden=false;host.innerHTML='<div class="md-tour-demo-scene phase-'+phase+'"><span class="md-tour-demo-cursor"><i class="ph ph-cursor"></i></span>'+labels.map(function(label,i){return '<span class="md-tour-demo-stage '+(i===phase?'active':'')+'"><i class="ph '+icons[i]+'"></i><b>'+label+'</b></span>';}).join('<i class="ph ph-arrow-right md-tour-demo-arrow"></i>')+'</div>';
}

function renderTourHub() {
  if (!root) return;
  stopSpeaking();
  var layer=root.querySelector("#mdTour"),tracks=root.querySelector("#mdTourTracks");
  layer.hidden=false;root.classList.add("md-tour-open");clearTourTarget();
  root.querySelector("#mdTourCount").textContent=t("guideTitle");
  root.querySelector("#mdTourTitle").textContent=t("guideHubTitle");
  root.querySelector("#mdTourBody").textContent=t("guideHubBody");
  root.querySelector(".md-tour-progress").hidden=true;
  root.querySelector(".md-tour-tip").hidden=true;
  root.querySelector("#mdTourDemo").hidden=true;
  root.querySelector("#mdTourStatus").hidden=true;
  root.querySelector(".md-tour-actions").hidden=true;
  root.querySelector("#mdTourSlider").hidden=true;
  var speakBtn = root.querySelector("#mdTourSpeak");
  if (speakBtn) {
    bindSpeakButton(
      speakBtn,
      function () {
        var trackList = welcomeGuideCards().map(function (card) {
          return t(card.title) + ": " + t(card.desc);
        }).join(". ");
        return [
          t("guideTitle"),
          t("guideHubTitle"),
          t("guideHubBody"),
          trackList,
        ];
      },
      getLang,
      { labelPlay: t("speakReadAloud"), labelStop: t("speakStop") }
    );
  }
  tracks.hidden=false;
  /* Ten tracks in a 366px floating card is a scroller inside a scroller. On a
     phone the hub is the whole screen; the step cards go back to being small. */
  root.querySelector(".md-tour-card").classList.remove("md-tour-min");
  root.querySelector(".md-tour-card").classList.add("md-tour-hub");
  var compactHub = document.body.classList.contains("compact-nav");
  var cards = welcomeGuideCards();
  var primary = compactHub ? cards.filter(function (card) { return card.phonePrimary; }) : cards;
  var extra = compactHub ? cards.filter(function (card) { return !card.phonePrimary; }) : [];
  function trackButton(card) {
    return '<button type="button" data-tour-track="'+card.track+'">'+
      '<span class="md-tour-glyph art-'+card.art+'">'+welcomeGlyph(card.art)+'</span>'+
      '<span><b>'+t(card.title)+'</b><small>'+t(card.desc)+'</small></span>'+
      '<i class="ph ph-arrow-right"></i></button>';
  }
  tracks.innerHTML = primary.map(trackButton).join("");
  if (extra.length) {
    tracks.innerHTML +=
      '<details class="md-tour-more"><summary>' + t("guideMoreProjects") + "</summary>" +
      '<p class="md-tour-more-note">' + t("guideMoreProjectsNote") + "</p>" +
      extra.map(trackButton).join("") + "</details>";
  }
  tracks.querySelectorAll("[data-tour-track]").forEach(function(button){button.addEventListener("click",function(){renderTourMode(button.getAttribute("data-tour-track"));});});
  requestAnimationFrame(applyTourPosition);
}

function renderTourMode(track) {
  if (!root) return;
  stopSpeaking();
  E.tour.track=track; clearTourTarget();
  root.querySelector("#mdTourCount").textContent=t("guideTitle");
  root.querySelector("#mdTourTitle").textContent=t("guideModeTitle");
  root.querySelector("#mdTourBody").textContent=t("guideModeBody");
  root.querySelector(".md-tour-progress").hidden=true;
  root.querySelector(".md-tour-tip").hidden=true;
  root.querySelector("#mdTourDemo").hidden=true;
  root.querySelector("#mdTourStatus").hidden=true;
  root.querySelector(".md-tour-actions").hidden=false;
  root.querySelector("#mdTourSlider").hidden=true;
  var speakBtn = root.querySelector("#mdTourSpeak");
  if (speakBtn) {
    bindSpeakButton(
      speakBtn,
      function () {
        return [
          t("guideTitle"),
          t("guideModeTitle"),
          t("guideModeBody"),
          t("guideInteractiveMode") + ": " + t("guideInteractiveModeDesc"),
          t("guideAutoMode") + ": " + t("guideAutoModeDesc"),
        ];
      },
      getLang,
      { labelPlay: t("speakReadAloud"), labelStop: t("speakStop") }
    );
  }
  var tracks=root.querySelector("#mdTourTracks"); tracks.hidden=false;
  root.querySelector(".md-tour-card").classList.remove("md-tour-hub");
  tracks.innerHTML='<button type="button" data-tour-mode="interactive"><i class="ph ph-hand-tap"></i><span><b>'+t("guideInteractiveMode")+'</b><small>'+t("guideInteractiveModeDesc")+'</small></span><i class="ph ph-arrow-right"></i></button>'+
    '<button type="button" data-tour-mode="auto"><i class="ph ph-play-circle"></i><span><b>'+t("guideAutoMode")+'</b><small>'+t("guideAutoModeDesc")+'</small></span><i class="ph ph-arrow-right"></i></button>';
  tracks.querySelectorAll("[data-tour-mode]").forEach(function(button){button.addEventListener("click",function(){selectTourTrack(track,button.getAttribute("data-tour-mode"));});});
  var back=root.querySelector("#mdTourBack"); back.disabled=false;
  back.innerHTML='<i class="ph ph-arrow-left"></i>'+t("guideTracksBack");
  back.onclick=function(){E.tour.track=null;E.tour.mode=null;renderTourHub();};
  root.querySelector("#mdTourSkip").hidden=true; root.querySelector("#mdTourNext").hidden=true;
  root.querySelector("#mdTourRestart").hidden=true;
}

function selectTourTrack(track, mode) {
  stopSpeaking();
  E.tour.track=track;E.tour.mode=mode||"interactive";E.tour.step=0;E.tour.completed={};E.tour.userCollapsed=false;
  var back=root&&root.querySelector("#mdTourBack"); if(back)back.onclick=null;
  if(E.tour.mode==="auto") {
    E.tour.autoOrigin={docType:E.docType,def:cloneData(E.def),assembly:cloneData(E.assembly),mode:E.mode,view:E.view,tool:E.tool,commandTab:E.commandTab};
    seekAutomaticTour(0);
  } else prepareTourStep();
}

function renderTour() {
  if (!root || !E.tour.active) return;
  if (!E.tour.track) { renderTourHub(); return; }
  var steps = tourSteps(), index = Math.max(0, Math.min(E.tour.step, steps.length - 1)), step = steps[index];
  var layer = root.querySelector("#mdTour"), done = tourStepDone(step, index);
  layer.hidden = false;
  root.classList.add("md-tour-open");
  root.querySelector("#mdTourTracks").hidden = true;
  root.querySelector(".md-tour-card").classList.remove("md-tour-hub");
  root.querySelector(".md-tour-progress").hidden = false;
  root.querySelector(".md-tour-tip").hidden = false;
  root.querySelector(".md-tour-actions").hidden = false;
  var slider=root.querySelector("#mdTourSlider"),range=root.querySelector("#mdTourRange");
  slider.hidden=E.tour.mode!=="auto";
  if(E.tour.mode==="auto"){range.max=steps.length-1;range.value=index;root.querySelector("#mdTourSliderValue").textContent=(index+1)+" / "+steps.length;}
  var isMobile = document.body.classList.contains("compact-nav");
  var head = root.querySelector("#mdTourHead") || root.querySelector(".md-tour-head");
  if (head) head.title = isMobile ? "" : t("guideMoveCard");
  var titleKey = (isMobile && (step.titleMobile || (TXT[step.title + "Mobile"] ? step.title + "Mobile" : null))) || step.title;
  var bodyKey = (isMobile && (step.bodyMobile || (TXT[step.body + "Mobile"] ? step.body + "Mobile" : null))) || step.body;
  var tipKey = (isMobile && (step.tipMobile || (TXT[step.tip + "Mobile"] ? step.tip + "Mobile" : null))) || step.tip;
  root.querySelector("#mdTourTitle").textContent = E.tour.mode === "auto" ? t("guideAutoWatching") + " · " + t(titleKey) : t(titleKey);
  root.querySelector("#mdTourBody").textContent = E.tour.mode === "auto" ? t("guideAutoBody") : t(bodyKey);
  root.querySelector("#mdTourTip").textContent = t(tipKey);
  renderTourDemo(step,index);
  // The slider counts every card; the header used to count only the practice
  // steps between intro and summary, so the two disagreed on every screen.
  root.querySelector("#mdTourCount").textContent = (index === steps.length - 1 ? t("guideDone") + " · " : "")
    + t("guideStep") + " " + (index + 1) + " " + t("guideOf") + " " + steps.length;
  root.querySelector("#mdTourProgress").style.width = Math.round((index / (steps.length - 1)) * 100) + "%";
  var status = root.querySelector("#mdTourStatus");
  status.hidden = E.tour.mode === "auto" || !!step.manual;
  status.classList.toggle("done", done);
  status.innerHTML = done
    ? '<i class="ph ph-check-circle"></i> ' + t("guideDone")
    : '<i class="ph ph-hand-tap"></i> ' + t("guideWaiting");
  var speakBtn = root.querySelector("#mdTourSpeak");
  if (speakBtn) {
    bindSpeakButton(
      speakBtn,
      function () {
        var titleText = E.tour.mode === "auto" ? t("guideAutoWatching") + " · " + t(titleKey) : t(titleKey);
        var bodyText = E.tour.mode === "auto" ? t("guideAutoBody") : t(bodyKey);
        var countText = root.querySelector("#mdTourCount").textContent;
        return [
          countText + ". " + titleText,
          bodyText,
          t(tipKey),
          E.tour.mode !== "auto" && !step.manual ? (done ? t("guideDone") : t("guideWaiting")) : "",
        ];
      },
      getLang,
      { labelPlay: t("speakReadAloud"), labelStop: t("speakStop") }
    );
  }
  var back = root.querySelector("#mdTourBack"), next = root.querySelector("#mdTourNext"), skip = root.querySelector("#mdTourSkip");
  var restart = root.querySelector("#mdTourRestart");
  back.disabled = false;
  skip.hidden = E.tour.mode === "auto" || !!step.manual;
  restart.hidden = E.tour.mode === "auto" || !!step.manual;
  root.querySelector("#mdTourKeep").hidden = E.tour.mode !== "auto";
  next.hidden = false;
  next.disabled = E.tour.mode === "auto" ? false : !done;
  next.innerHTML = index === steps.length - 1
    ? '<i class="ph ph-check"></i>' + t(E.tour.track === "mobile" ? "guideContinueEditing" : "guideFinishTutorial")
    : t("guideNext") + '<i class="ph ph-arrow-right"></i>';
  back.innerHTML = '<i class="ph ph-arrow-left"></i>' + (index === 0 ? t("guideTracksBack") : t("guideBack"));
  clearTourTarget();
  var target = step.target ? (root.querySelector(step.target) || document.querySelector(step.target)) : null;
  if (target) {
    target.classList.add("md-tour-target");
    E.tour.target = target;
    showTourClickMarker(target);
    // a tool ringed 400px down a borrowed ribbon is still a tool you cannot see
    var scroller = target.closest && target.closest("#md-sheet, .md-command-pane, .md-panel");
    if (scroller) {
      try { target.scrollIntoView({ block: "center", inline: "nearest" }); } catch (error) { target.scrollIntoView(); }
      /* scrollIntoView walks EVERY scrollable ancestor, and #modeler is one of
         them: bringing a tool into view inside the sheet dragged the whole
         editor — card, canvas and all — 81px up the screen. */
      root.scrollTop = 0;
      root.scrollLeft = 0;
    }
  }
  requestAnimationFrame(function () { applyTourPosition(); avoidTourTargetOverlap(target); });
}

function prepareTourStep() {
  var steps = tourSteps(), step = steps[E.tour.step];
  if (!step) return;
  E.tour.preparing = true;
  E.tour.baseline = step.baseline ? step.baseline() : null;
  if (document.body.classList.contains("compact-nav") && !step.noAutoReveal) {
    var targetStr = String(step.target || "");
    if (targetStr.indexOf("data-command") >= 0) showModelerSheet("cmd", step.target);
    else if (targetStr.indexOf("md-mid") >= 0 || targetStr.indexOf("selection-bar") >= 0) closeModelerSheet();
    else if (targetStr.indexOf("data-tour-prop") >= 0) showModelerSheet("props");
    else if (targetStr.indexOf("Hist") >= 0 || targetStr.indexOf("Parts") >= 0 || targetStr.indexOf('data-mdnav="tree"') >= 0) showModelerSheet("tree");
    else if (targetStr.indexOf("mode") >= 0 || targetStr.indexOf('data-mdnav="view"') >= 0) showModelerSheet("view");
  }
  if (step.prepare) step.prepare();
  if (document.body.classList.contains("compact-nav")) {
    var card = root.querySelector(".md-tour-card");
    var shortPhone = window.innerHeight <= 500;
    var canvasStep = String(step.target || "").indexOf("md-mid") >= 0;
    if (card) card.classList.toggle("md-tour-min", !!step.autoCollapseMobile || !!E.tour.userCollapsed || (shortPhone && canvasStep));
  }
  E.tour.preparing = false;
  renderTour();
}

function tourMaterial(color) { return {color:color||"#55b7a7",metal:0.08,rough:0.58}; }
function tourBox(x0,x1,y0,y1,z0,z1,color,name) { return addPart(Object.assign({id:uid(),kind:"box",name:name||"Demo box",x0:x0,x1:x1,y0:y0,y1:y1,z0:z0,z1:z1},tourMaterial(color))); }
function tourCylinder(x,y,z,r,h,color,name) { return addPart(Object.assign({id:uid(),kind:"cyl",name:name||"Demo cylinder",x:x,y:y,z:z,r:r,h:h},tourMaterial(color))); }
function tourSphere(x,y,z,r,color,name) { return addPart(Object.assign({id:uid(),kind:"sph",name:name||"Demo sphere",x:x,y:y,z:z,r:r},tourMaterial(color))); }
function tourCircleLoop(u,v,r,segments) {
  var loop=[];segments=segments||32;
  for(var i=0;i<segments;i++){var a=i*Math.PI*2/segments;loop.push({u:u+Math.cos(a)*r,v:v+Math.sin(a)*r});}
  return loop;
}

function fullyDimensionTourRectangle(lines,size) {
  var sketch=ensureSketch(E.def);if(!lines||lines.length<2)return;
  var anchor=sketchPoint(sketch,lines[0].a);if(!anchor)return;
  sketch.constraints.push({id:uid(),type:"fixed",point:anchor.id,x:anchor.x,y:anchor.y});
  sketch.constraints.push({id:uid(),type:"distance",entity:lines[0].id,value:size});
  sketch.constraints.push({id:uid(),type:"distance",entity:lines[1].id,value:size});
  resolveSketch(false);
}

function fullyDimensionTourCircle(circle,diameter) {
  var sketch=ensureSketch(E.def),centre=circle&&sketchPoint(sketch,circle.c);if(!circle||!centre)return;
  sketch.constraints.push({id:uid(),type:"fixed",point:centre.id,x:centre.x,y:centre.y});
  sketch.constraints.push({id:uid(),type:"diameter",entity:circle.id,value:diameter});resolveSketch(false);
}

function showTourFeatureForm(type,values) {
  openParametricFeature(type);
  Object.keys(values||{}).forEach(function(key){
    var input=root&&root.querySelector('#mdQuickSettings input[data-parameter="'+key+'"],#mdQuickSettings select[data-parameter="'+key+'"]');if(!input)return;
    if(input.type==="checkbox")input.checked=!!values[key];else input.value=values[key];
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
}

function createTourSketch(view,name) {
  var sketch=addSketch(E.def,view,0,name);E.def.activeSketch=sketch.id;E.view=view;
  E.authoring.sketchId=sketch.id;E.authoring.sketchSelection=[sketch.id];return sketch;
}

/* Only ever commit a form that is actually open. The apply button survives in
   the DOM after the panel closes, so an unguarded click applied the previous
   feature a second time. */
function applyOpenTourFeature() {
  var host=root&&root.querySelector("#mdQuickSettings");if(!host||host.hidden)return;
  var button=host.querySelector(".md-quick-apply");if(button)button.click();
}

function insertISO4017Screw() {
  if(E.docType!=="part")setDocumentType("part");
  var group=uid(),spec={family:"hex-screw",standard:"ISO 4017:2022",diameterMm:8,pitchMm:1.25,lengthMm:30,flankAngleDeg:60,toleranceClass:"6g",productGrade:"A",series:"coarse",headAcrossFlatsMm:13,headHeightMm:5.3};
  var acrossCorners=13/Math.sqrt(3)/10,hex=[];
  for(var i=0;i<6;i++){var a=Math.PI/6+i*Math.PI/3;hex.push({u:Math.cos(a)*acrossCorners,v:Math.sin(a)*acrossCorners});}
  pushUndo(t("stdScrewCommand"));
  addPart(Object.assign({id:uid(),kind:"cyl",name:"ISO 4017 M8×30",x:0,y:0,z:0,r:.4,h:3,standardGroupId:group,standardRole:"thread",standardCompliance:spec,threadGeometry:{mode:"modeled",profile:"ISO-metric-60",pitchMm:1.25,flankAngleDeg:60,toleranceClass:"6g"}},tourMaterial("#aeb7c2")));
  addPart(Object.assign({id:uid(),kind:"ext",name:"Hex head",axis:"y",from:3,to:3.53,pts:hex,holes:[],standardGroupId:group,standardRole:"head"},tourMaterial("#bbc3cc")));
  E.def.lastStandardsAudit=null;E.sel=E.def.parts[E.def.parts.length-2];refreshAll();fitSketch();updateTourProgress();
}

function insertISOInvoluteGear() {
  if(E.docType!=="part")setDocumentType("part");
  var spec={family:"involute-gear",standard:"ISO 21771-1:2024",rackStandard:"ISO 53:1998",moduleStandard:"ISO 54:1996",moduleMm:2,teeth:20,pressureAngleDeg:20,profile:"involute",pitchDiameterMm:40,rootGeometry:"rack-generated",cutter:{tipRadiusCoefficient:.38,addendumCoefficient:1.25}};
  spec.mate={...spec};
  pushUndo(t("stdGearCommand"));
  var gearBase=Object.assign({id:uid(),kind:"ext",name:"Rack-generated gear m2 z20",axis:"y",from:0,to:.8,pts:involuteGearOutline(spec),holes:[],standardCompliance:spec},tourMaterial("#d0a84b"));
  if(isCanonicalAuthoring())registerGeneratedExtrusion(E.def,gearBase);
  addPart(gearBase);
  E.def.lastStandardsAudit=null;E.sel=E.def.parts[E.def.parts.length-1];refreshAll();fitSketch();updateTourProgress();
}

function performAutomaticTourStep(track,index,showFields) {
  if(!E.tour.active||E.tour.mode!=="auto")return;
  if(track==="solidworks") {
    if(index===0){setDocumentType("part");E.def=newDef();E.def.name=getLang()==="en"?"CAD cube tutorial":"תרגול קוביית CAD";E.sel=null;E.ssel=[];E.topologySelection=[];E.authoring={phase:"sketch",referenceId:"plane:top",sketchId:null,featureType:null,sketchSelection:[],featureSelection:[]};setMode("2d");setView("top");setCommandTab("sketch");ensureSketch(E.def);}
    if(index===1){setMode("2d");setView("top");setCommandTab("sketch");setTool("srect");}
    if(index===2){var rectLines=addSketchRectangle({u:-30,v:-30},{u:30,v:30});E.tour.autoLines=rectLines||[];}
    if(index===3&&E.tour.autoLines&&E.tour.autoLines.length)fullyDimensionTourRectangle(E.tour.autoLines,60);
    if(index===4){E.depth=60;E.baseOff=0;showTourFeatureForm("extrude",{endCondition:"blind",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,mergeResult:true});if(!showFields)applyOpenTourFeature();}
    if(index===5){setMode("2d");createTourSketch("front","Front bore sketch");setCommandTab("sketch");var circle=addSketchCircle({u:0,v:30},{u:20,v:30});E.tour.autoCircle=circle;E.ssel=circle?[circle]:[];E.sel=circle||null;}
    if(index===6&&E.tour.autoCircle)fullyDimensionTourCircle(E.tour.autoCircle,40);
    if(index===7){showTourFeatureForm("extrudeCut",{endCondition:"through-all",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,keepTool:false});if(!showFields)applyOpenTourFeature();}
    if(index===8){setMode("2d");createTourSketch("side","Right bore sketch");setCommandTab("sketch");E.tour.autoCircle=addSketchCircle({u:0,v:30},{u:20,v:30});}
    if(index===9&&E.tour.autoCircle)fullyDimensionTourCircle(E.tour.autoCircle,40);
    if(index===10){showTourFeatureForm("extrudeCut",{endCondition:"through-all",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,keepTool:false});if(!showFields)applyOpenTourFeature();}
    if(index===11){setMode("2d");createTourSketch("top","Top bore sketch");setCommandTab("sketch");E.tour.autoCircle=addSketchCircle({u:0,v:0},{u:20,v:0});}
    if(index===12&&E.tour.autoCircle)fullyDimensionTourCircle(E.tour.autoCircle,40);
    if(index===13){showTourFeatureForm("extrudeCut",{endCondition:"through-all",depth:60,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,keepTool:false});if(!showFields)applyOpenTourFeature();}
    if(index===14){setMode("3d");setTab("parts");E.topologySelection=[];refreshAll();}
    if(index===15)setMode("3d");
  } else if(track==="sketch") {
    setDocumentType("part");setMode("2d");setView("top");setCommandTab("sketch");
    var sk=ensureSketch(E.def),lines;
    if(index===1)setTool("srect");
    if(index===2){lines=addSketchRectangle({u:-22,v:-14},{u:22,v:14});E.tour.autoLines=lines||[];}
    if(index===3&&E.tour.autoLines&&E.tour.autoLines[0]){var pt=sketchPoint(sk,E.tour.autoLines[0].a);if(pt){pt.x-=6;pt.y-=4;resolveSketch(false);}}
    if(index===4&&E.tour.autoLines){E.ssel=[E.tour.autoLines[0]];E.sel=E.tour.autoLines[0];setTool("select");}
    if(index===5&&E.tour.autoLines){sk.constraints.push({id:uid(),type:"distance",entity:E.tour.autoLines[0].id,value:50});resolveSketch(false);}
    if(index===6&&E.tour.autoLines){E.ssel=[E.tour.autoLines[0],E.tour.autoLines[2]];E.sel=E.tour.autoLines[2];}
    if(index===7&&E.tour.autoLines){sk.constraints.push({id:uid(),type:"equal",a:E.tour.autoLines[0].id,b:E.tour.autoLines[2].id});resolveSketch(false);}
  } else if(track==="flower") {
    preparePrimitiveProject("front");
    if(index===1)tourSphere(0,34,0,7,"#e5a93d","Flower center");
    if(index===2)[[0,48],[-14,34],[14,34],[0,20]].forEach(function(q){tourSphere(q[0],q[1],0,7,"#e678a0","Petal");});
    if(index===3)tourBox(-3,3,-4,20,-3,3,"#55a85b","Stem");
    if(index===4)tourBox(-13,13,-17,-4,-8,8,"#b86f46","Pot");
    if(index===5)setMode("3d");
  } else if(track==="screw") {
    preparePrimitiveProject("top");
    if(index===1)insertISO4017Screw();
    if(index===2){var sa=auditStandardParts({...E.def,parts:activeParts(E.def)});E.def.lastStandardsAudit={at:Date.now(),ok:sa.ok,checked:sa.checked,blocking:sa.blocking};}
    if(index===3)setMode("3d");
  } else if(track==="gear") {
    preparePrimitiveProject("top");
    if(index===1)insertISOInvoluteGear();
    if(index===2){var gaudit=auditStandardParts({...E.def,parts:activeParts(E.def)});E.def.lastStandardsAudit={at:Date.now(),ok:gaudit.ok,checked:gaudit.checked,blocking:gaudit.blocking};}
    if(index===3)setMode("3d");
  } else if(track==="studball") {
    preparePrimitiveProject("front");
    if(index===1)tourSphere(0,20,0,18,"#639bd1","Ball core");
    if(index===2)[[0,41,0],[0,-1,0],[21,20,0],[-21,20,0],[0,20,21],[0,20,-21]].forEach(function(q){tourSphere(q[0],q[1],q[2],5,"#e4b64f","Stud");});
    if(index===3)setMode("3d");
  } else if(track==="dreidel") {
    preparePrimitiveProject("front");
    // one step per index, and the sketch step is index 1 now
    if(index===1)tourDreidelProfile();
    // the demo has to open the same form the step now waits on
    if(index===2)showTourFeatureForm("revolve",{angle:360});
    if(index===3){closeFeaturePanel();E.authoring.featureType=null;addPart(Object.assign({id:uid(),kind:"rev",name:"Dreidel",x:0,z:0,pts:[{u:0,v:0},{u:5,v:7},{u:18,v:18},{u:16,v:35},{u:5,v:42},{u:5,v:55},{u:0,v:55}]},tourMaterial("#7659b8")));}
    if(index===4)setMode("3d");
  } else if(track==="pattern") {
    preparePrimitiveProject("front");
    if(index===1){E.tour.autoSeed=tourBox(12,22,0,10,-5,5,"#5f8fd6","Pattern seed");E.sel=E.tour.autoSeed;setTab("parts");}
    if(index===2){E.sel=E.tour.autoSeed||selectedSolid();setTab("parts");}
    if(index===3||index===4){
      if(!E.sel)E.sel=E.tour.autoSeed;
      if(index===3){showTourFeatureForm("pattern",{mode:"linear",axisX:true,countX:4,spacingX:18});if(!showFields)applyOpenTourFeature();}
    }
    if(index===5){E.sel=E.tour.autoSeed||selectedSolid();showTourFeatureForm("pattern",{mode:"circular",count:6,angle:360,axis:"y",equalSpacing:true});if(!showFields)applyOpenTourFeature();}
    if(index===6)setMode("3d");
  } else if(track==="mobile") {
    if(index===0){setDocumentType("part");setMode("3d");}
    if(index===1){setMode("2d");setView("top");setCommandTab("sketch");setTool("srect");}
    if(index===2){var mobileLines=addSketchRectangle({u:-20,v:-20},{u:20,v:20});E.tour.autoLines=mobileLines||[];}
    if(index===3){E.depth=40;showTourFeatureForm("extrude",{endCondition:"blind",depth:40,offset:0,direction:"forward",symmetric:false,draftAngle:0,draftOutward:false,mergeResult:true});if(!showFields)applyOpenTourFeature();}
    if(index===4){setMode("3d");setMobileAddSelection(true);refreshAll();}
    if(index===5){setMode("3d");}
    if(index===6){setMode("3d");}
  } else if(track==="assembly") {
    ensurePracticeAssembly();
    if(index===1){E.componentSel=[E.assembly.components[1]];E.sel=E.assembly.components[1];}
    if(index===2)E.assembly.components[1].transform.x=12;
    if(index===3){E.componentSel=[E.assembly.components[0],E.assembly.components[1]];E.sel=E.assembly.components[1];}
    if(index===4){E.assembly.components[1].transform.x=E.assembly.components[0].transform.x;E.assembly.mates.push({id:uid(),type:"alignX",a:E.assembly.components[0].id,b:E.assembly.components[1].id});}
    // The Save card demonstrated nothing: it marked itself done without ever
    // writing the assembly, so the demo ended with nothing in the library.
    if(index===5){saveAssemblyDocument();E.tour.demoAssemblyKey=E.assembly.key;}
  }
  E.tour.completed[index]=true;refreshAll();if(E.mode==="3d")fitPreview();
}

function restoreAutomaticTourOrigin() {
  var origin=E.tour.autoOrigin;if(!origin)return;
  setDocumentType(origin.docType);E.def=cloneData(origin.def);E.assembly=cloneData(origin.assembly);
  invalidateInterference();
  H.clear().seed();
  E.sel=null;E.ssel=[];E.componentSel=[];E.tour.autoLines=null;E.tour.autoCircle=null;E.tour.autoSeed=null;
  setCommandTab(origin.commandTab||"features");setView(origin.view||"top");setTool(origin.tool||"select");setMode(origin.mode||"2d");
}

/* Seeking rebuilds the demo from the origin document, which is the only honest
   way to land on an arbitrary step. Stepping forward one is the common case and
   does not need that: the editor already holds the previous step's result, so
   we only commit whatever feature form that step left open and run the new one.
   Replaying every time made each Continue cost more than the one before it. */
function seekAutomaticTour(index, incremental) {
  if(!E.tour.active||E.tour.mode!=="auto")return;
  var steps=tourSteps();index=Math.max(0,Math.min(steps.length-1,index));
  E.tour.preparing=true;
  var from=0;
  if(incremental&&index===E.tour.step+1){applyOpenTourFeature();from=index;}
  else{restoreAutomaticTourOrigin();E.tour.completed={};}
  for(var i=from;i<=index;i++)performAutomaticTourStep(E.tour.track,i,i===index);
  E.tour.step=index;E.tour.preparing=false;prepareTourStep();
}

function startTour() {
  if (!root || !E.open) return;
  closeWelcome();
  E.tour.active = true;
  E.tour.track = null;
  E.tour.mode = null;
  E.tour.step = 0;
  E.tour.completed = {};
  renderTourHub();
  syncCoach();
}

function closeTour() {
  stopSpeaking();
  if (!E.tour) return;
  // A demonstration rewrites the open document — the CAD cube track replaces it
  // outright. Leaving that behind silently threw away whatever the user had on
  // screen before they pressed Guide, so put it back unless they asked to keep
  // the demonstrated model.
  if (E.tour.mode === "auto" && E.tour.autoOrigin) {
    if (E.tour.keepResult) flash(t("guideDemoKept"));
    else {
      // The assembly demo saves, so restoring the document is not enough — drop
      // the library entry it wrote too, or every replay leaves another orphan.
      if (E.tour.demoAssemblyKey) saveAssemblies(E.tour.demoAssemblyKey,{mode:"delete"}).catch(function () {});
      E.tour.preparing = true; restoreAutomaticTourOrigin(); E.tour.preparing = false; refreshAll(); flash(t("guideDemoRestored"));
    }
  }
  E.tour.keepResult = false;
  E.tour.demoAssemblyKey = null;
  E.tour.active = false;
  E.tour.autoOrigin=null;
  E.tour.baseline = null;
  E.tour.preparing = false;
  clearTourTarget();
  if (!root) return;
  root.classList.remove("md-tour-open");
  var layer = root.querySelector("#mdTour");
  if (layer) layer.hidden = true;
  syncCoach();
}

export {
  assemblyTourSteps, closeTour, dreidelTourSteps, flowerTourSteps,
  gearTourSteps, insertISO4017Screw, installTourDragging, mobileTourSteps,
  patternTourSteps, prepareTourStep, renderTour, renderTourMode,
  restoreAutomaticTourOrigin, screwTourSteps, seekAutomaticTour,
  selectTourTrack, sketchTourSteps, solidworksCubeTourSteps, startTour,
  studBallTourSteps, tourMaterial, tourStepDone, tourSteps,
};
