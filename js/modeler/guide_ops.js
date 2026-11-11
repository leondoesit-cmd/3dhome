/* The CAD tutorials' shared operations: what the guide checks in the document,
   and the demonstrations it performs. A demonstration drives the editor through
   the same calls a user's clicks reach — sketch on a plane, add geometry and
   dimensions, finish the sketch, fill a feature form and press Apply — and then
   WAITS for the exact CAD kernel. The old guide raced it: the next step edited
   the sketch while a cut was still being checked, and the cut was dropped with
   "The model changed during the intersection check". Lengths here are in the
   document's internal unit, centimetres (8 = 80 mm). */
import { closedSketchProfile, E, newSketchPoint, openParametricFeature, refreshAll } from "../modeler.js";
import { topologyReferenceFromEntry } from "../modeler_pick_geometry.js";
import { openMatePropertyManager } from "../modeler/component_mates.js";
import { setDocumentType } from "../modeler/document_save.js";
import { newModel, saveAssemblyDocument } from "../modeler/editor_forms.js";
import { setMode } from "../modeler/library_io.js";
import { activeParts, componentDef, loadAssemblies, newAssembly, topologyEntriesForPart } from "../modeler/library_store.js";
import { runCommand } from "../modeler/part_commands.js";
import { newDef } from "../modeler/prefs_snap.js";
import { addSketchCircle, addSketchRectangle, displayedCoreIssues, modelRebuildPending, resolveSketch } from "../modeler/sketch_entities.js";
import { chooseSketchReference, finishSketchWorkflow, setTab, setView } from "../modeler/sketch_workflow.js";
import { assemblyPickedRefs } from "../modeler/viewport_input.js";
import { fitPreview } from "../modeler/view_modes.js";
import { ensureSketch, ensureSketchDoc, sketchPoint, solveSketch } from "../sketch_solver.js";
import { uid } from "../state.js";

function pause(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

/* Settled = no feature form is still applying and the exact rebuild has caught
   up. Every demonstration step ends here, so the next one starts from the
   model the user is looking at. */
async function waitForModel(limitMs) {
  var deadline = Date.now() + (limitMs || 90000);
  await pause(40);
  while (Date.now() < deadline) {
    var form = E.quickFormInstance;
    if (!(form && form.applying) && !modelRebuildPending()) return true;
    await pause(60);
  }
  return false;
}

/* ---- what the checks read ---------------------------------------------- */
function liveFeatures(type) {
  return ((E.def && E.def.features) || []).filter(function (feature) {
    return !feature.suppressed && (!type || feature.type === type);
  });
}
function rebuildErrors() {
  return (displayedCoreIssues() || []).filter(function (issue) { return issue.severity === "error"; });
}
/* A feature step is done when the feature exists AND the model rebuilt clean:
   a red Cut-Extrude in the tree is not a finished step. */
function featureBuilt(type) {
  return E.docType === "part" && liveFeatures(type).length > 0 && !modelRebuildPending() && !rebuildErrors().length;
}
function sketching() { return !!(E.authoring && E.authoring.phase === "sketch"); }
function activeSketch() { return E.def ? ensureSketch(E.def) : null; }
function sketchLines(sketch) {
  return ((sketch && sketch.entities) || []).filter(function (entity) { return entity.type === "line" && !entity.construction; });
}
function sketchCircles(sketch) {
  return ((sketch && sketch.entities) || []).filter(function (entity) { return entity.type === "circle" && !entity.construction; });
}
/* Smart Dimension writes a constraint that carries a value; relations do not. */
function sketchDimensions(sketch) {
  return ((sketch && sketch.constraints) || []).filter(function (constraint) {
    return !constraint.suppressed && Number.isFinite(Number(constraint.value));
  });
}
function sketchFullyDefined(sketch) {
  return !!sketch && (sketch.entities || []).length > 0 && solveSketch(sketch).status === "fully-constrained";
}
function sketchesWith(test) {
  return E.def ? ensureSketchDoc(E.def).filter(test) : [];
}
function standardPartCount(family) {
  return E.def ? activeParts(E.def).filter(function (part) {
    return part.standardCompliance && part.standardCompliance.family === family;
  }).length : 0;
}

/* ---- documents ----------------------------------------------------------- */
/* Interactive tracks start the user's own new document through the editor's
   New command, which asks before throwing away unsaved work; false when they
   said no. Demonstrations skip the question — the guide restores the original
   document when the demonstration closes. */
async function freshDocument(type, ask) {
  if (E.docType !== type) setDocumentType(type);
  if (ask) {
    var before = type === "assembly" ? E.assembly : E.def;
    await newModel();
    var after = type === "assembly" ? E.assembly : E.def;
    if (after === before) return false;
  } else if (type === "assembly") {
    E.assembly = newAssembly();
    E.componentSel = []; E.sel = null; E.topologySelection = [];
  } else {
    E.def = newDef();
    E.sel = null; E.ssel = []; E.topologySelection = [];
    E.authoring = { phase:"model", referenceId:null, sketchId:null, featureType:null, sketchSelection:[], featureSelection:[], workflowFocus:"context" };
  }
  setTab("parts"); setMode("3d"); refreshAll();
  return true;
}

/* ---- demonstration operations -------------------------------------------- */
function planeReference(id) {
  return ((E.def && E.def.references) || []).find(function (reference) { return reference.id === id; }) || null;
}
function sketchOnPlane(planeId, tool) {
  var plane = planeReference(planeId);
  if (plane) chooseSketchReference(plane, tool || "select");
  return activeSketch();
}
/* The top face of the newest solid, as a pick would hand it over. */
function topFaceReference() {
  var part = activeParts(E.def).slice(-1)[0];
  var faces = topologyEntriesForPart(part).filter(function (entry) { return entry.kind === "face"; });
  var best = null, bestY = -Infinity;
  faces.forEach(function (face) {
    var d = face.descriptor || {}, n = d.normal || {}, o = d.origin || {};
    if (d.surface === "plane" && Math.abs((n.y || 0) - 1) < 1e-6 && (o.y || 0) > bestY) { best = face; bestY = o.y || 0; }
  });
  return best ? topologyReferenceFromEntry(best) : null;
}
function selectTopFace() {
  var face = topFaceReference();
  if (face) E.topologySelection = [face];
  refreshAll();
}
function sketchOnTopFace(tool) {
  var face = topFaceReference();
  if (face) chooseSketchReference(face, tool || "select");
  if (!sketching()) sketchOnPlane("plane:top", tool);
  return activeSketch();
}
function drawRectangle(u0, v0, u1, v1) {
  return addSketchRectangle({ u:u0, v:v0 }, { u:u1, v:v1 }) || [];
}
function dimensionLine(line, value) {
  var sketch = activeSketch();
  if (!sketch || !line) return;
  sketch.constraints.push({ id:uid(), type:"distance", entity:line.id, value:value });
  resolveSketch(false);
}
/* Width on a horizontal edge, height on a vertical one — only the ones the
   sketch does not have yet. "Show me" after one hand-made dimension must not
   add a second, redundant one (the solver then calls the sketch
   over-constrained and the next step never completes). Rectangle edges
   alternate horizontal, vertical, horizontal, vertical. */
function dimensionRectangle(lines, width, height) {
  var sketch = activeSketch();
  if (!sketch || lines.length < 4) return;
  var sized = function (i) {
    return (sketch.constraints || []).some(function (c) { return !c.suppressed && c.entity === lines[i].id && Number.isFinite(Number(c.value)); });
  };
  if (!sized(0) && !sized(2)) dimensionLine(lines[0], width);
  if (!sized(1) && !sized(3)) dimensionLine(lines[1], height);
}
function fixPoint(pointId) {
  var sketch = activeSketch(), point = sketch && sketchPoint(sketch, pointId);
  if (!point) return;
  sketch.constraints.push({ id:uid(), type:"fixed", point:point.id, x:point.x, y:point.y });
  resolveSketch(false);
}
function drawCircle(u, v, r) { return addSketchCircle({ u:u, v:v }, { u:u + r, v:v }); }
function dimensionCircle(circle, diameter) {
  var sketch = activeSketch();
  if (!sketch || !circle) return;
  var mine = (sketch.constraints || []).filter(function (c) { return !c.suppressed; });
  if (!mine.some(function (c) { return c.entity === circle.id && (c.type === "diameter" || c.type === "radius"); })) {
    sketch.constraints.push({ id:uid(), type:"diameter", entity:circle.id, value:diameter });
  }
  if (!sketchFullyDefined(sketch)) fixPoint(circle.c);
}
/* An outline through the given points, closed back to the first one. */
function drawPolyline(points) {
  var sketch = activeSketch();
  var ids = points.map(function (q) { return newSketchPoint(sketch, { u:q[0], v:q[1] }); });
  var lines = ids.map(function (id, i) {
    return { id:uid(), type:"line", name:"Line", a:id, b:ids[(i + 1) % ids.length], construction:false };
  });
  sketch.entities.push.apply(sketch.entities, lines);
  resolveSketch(false);
  return lines;
}
async function finishSketch() {
  if (sketching()) finishSketchWorkflow();
  await waitForModel();
}

/* Fill a feature form the way a user would and press Apply. Values are what
   the user would type: "20mm" is read as millimetres whatever the document
   unit. Selects and checkboxes take their value directly. */
function fillForm(host, values) {
  Object.keys(values || {}).forEach(function (key) {
    var input = host.querySelector('input[data-parameter="' + key + '"],select[data-parameter="' + key + '"]');
    if (!input) return;
    if (input.type === "checkbox") input.checked = !!values[key];
    else input.value = values[key];
    input.dispatchEvent(new Event("input", { bubbles:true }));
    input.dispatchEvent(new Event("change", { bubbles:true }));
  });
}
async function applyOpenForm() {
  var host = document.querySelector("#mdQuickSettings");
  var apply = host && !host.hidden && host.querySelector(".md-quick-apply");
  if (apply) apply.click();
  return waitForModel();
}
async function runFeature(type, values) {
  await waitForModel();
  openParametricFeature(type);
  await pause(60);
  var host = document.querySelector("#mdQuickSettings");
  if (!host || host.hidden) return false;
  fillForm(host, values);
  await pause(60);
  await applyOpenForm();
  return liveFeatures(type).length > 0;
}

/* ---- assembly practice ---------------------------------------------------- */
/* Two practice blocks, the cap parked above and to the side of the base so the
   mate visibly pulls it into place. Neither face pair starts coplanar. */
function practiceComponent(index) {
  var color = index ? "#62a6d8" : "#d89b62";
  var def = {
    key:"tour_component_" + index, name:index ? "Tutorial cap" : "Tutorial base", price:0, col:color,
    parts:[{ id:uid(), kind:"box", name:index ? "cap" : "base", x0:-3, x1:3, y0:0, y1:index ? 1.5 : 3, z0:-3, z1:3, color:color, metal:0.05, rough:0.7 }],
    constraints:[], sketches:[], features:[], variables:[],
  };
  return {
    id:uid(), modelKey:def.key, name:def.name, def:def, visible:true, grounded:index === 0,
    transform:{ x:index ? 8 : 0, y:index ? 5 : 0, z:0, rx:0, ry:0, rz:0 },
  };
}
function ensurePracticeAssembly() {
  if (E.docType !== "assembly") setDocumentType("assembly");
  if (!E.assembly) E.assembly = newAssembly();
  while (E.assembly.components.length < 2) E.assembly.components.push(practiceComponent(E.assembly.components.length));
  E.componentSel = []; E.sel = null;
  setTab("parts"); setMode("3d"); refreshAll(); fitPreview();
}
function practiceCap() {
  return E.assembly ? E.assembly.components.find(function (c) { return !c.grounded; }) || null : null;
}
function practiceBase() {
  return E.assembly ? E.assembly.components.find(function (c) { return c.grounded; }) || null : null;
}
function componentFace(component, normalY) {
  var def = component && componentDef(component), part = def && def.parts && def.parts[0];
  var face = topologyEntriesForPart(part).find(function (entry) {
    var n = entry.kind === "face" && entry.descriptor && entry.descriptor.normal;
    return n && Math.abs((n.y || 0) - normalY) < 1e-6;
  });
  return face ? Object.assign({}, topologyReferenceFromEntry(face), { componentId:component.id }) : null;
}
function transformSignature() {
  return E.assembly ? E.assembly.components.map(function (c) {
    var tr = c.transform || {};
    return c.id + ":" + [tr.x, tr.y, tr.z, tr.rx, tr.ry, tr.rz].map(function (v) { return Math.round((v || 0) * 1000); }).join(",");
  }).join("|") : "";
}
function pickMateFaces() {
  var base = practiceBase(), cap = practiceCap();
  var a = componentFace(base, 1), b = componentFace(cap, -1);
  if (a && b) E.topologySelection = [a, b];
  refreshAll();
  return !!assemblyPickedRefs();
}
function liveMates(type) {
  return ((E.assembly && E.assembly.topologyMates) || []).filter(function (mate) {
    return !mate.suppressed && (!type || mate.type === type);
  });
}
async function addCoincidentMate() {
  if (!assemblyPickedRefs()) pickMateFaces();
  openMatePropertyManager();
  await pause(80);
  var host = document.querySelector("#mdQuickSettings");
  if (host && !host.hidden) {
    fillForm(host, { type:"coincident" });
    await pause(60);
    await applyOpenForm();
  }
  refreshAll(); fitPreview();
  return liveMates("coincident").length > 0;
}
function assemblySaved() {
  return !!(E.assembly && loadAssemblies().some(function (saved) { return saved.key === E.assembly.key; }));
}
async function saveAssembly() {
  await saveAssemblyDocument();
  return assemblySaved();
}
function runEditorCommand(id) { runCommand(id); return waitForModel(); }
/* The last step of a track shows what was built from three quarters, not
   from straight above, where a block reads as a flat rectangle. */
function showResult() {
  if (E.authoring && E.authoring.phase === "sketch") return;
  setMode("3d"); setView("iso"); fitPreview();
}

export {
  activeSketch, addCoincidentMate, applyOpenForm, assemblySaved, closedSketchProfile, dimensionCircle,
  dimensionLine, dimensionRectangle, fillForm, drawCircle, drawPolyline, drawRectangle, ensurePracticeAssembly,
  featureBuilt, finishSketch, fixPoint, freshDocument, liveFeatures, liveMates,
  pickMateFaces, practiceBase, practiceCap, rebuildErrors, runEditorCommand, runFeature,
  saveAssembly, selectTopFace, showResult, sketchCircles, sketchDimensions, sketchFullyDefined, sketching, sketchLines,
  sketchOnPlane, sketchOnTopFace, sketchesWith, standardPartCount, transformSignature,
  waitForModel,
};
