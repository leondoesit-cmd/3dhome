import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let modelerSource = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
modelerSource = modelerSource.replace(/\r\n/g,"\n");
/* The editor's [he, en] table, split out of js/modeler.js. */
const stringsSource = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
/* Pure mesh/edge/face geometry, split out of js/modeler.js. */
const meshGeometrySource = await readFile(new URL("../js/modeler_mesh_geometry.js", import.meta.url), "utf8");
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometrySource = await readFile(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* Pick-to-reference and reference-to-screen geometry, split out of js/modeler.js. */
const pickGeometrySource = await readFile(new URL("../js/modeler_pick_geometry.js", import.meta.url), "utf8");
const commandSource = await readFile(new URL("../js/modeler_commands.js", import.meta.url), "utf8");
const formSource = await readFile(new URL("../js/modeler_feature_form.js", import.meta.url), "utf8");
const draftSource = await readFile(new URL("../js/modeler_draft.js", import.meta.url), "utf8");
const workflowSource = await readFile(new URL("../js/modeler_workflow.js", import.meta.url), "utf8");
const drawingSource = await readFile(new URL("../js/modeler_drawing.js", import.meta.url), "utf8");
const source = [modelerSource, stringsSource, meshGeometrySource, partGeometrySource, pickGeometrySource, commandSource, formSource, draftSource, workflowSource, drawingSource].join("\n");
const editorViewSource = await readFile(new URL("../js/editor_view.js", import.meta.url), "utf8");
const featureCatalogSource = await readFile(new URL("../js/core/feature_catalog.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("the default Features surface exposes the canonical feature vocabulary", () => {
  for (const command of ["newsketch", "extrude", "extrudecut", "revolvefeature", "sweepfeature", "loftfeature", "filletfeature", "chamferfeature", "shellfeature", "patternfeature", "mirrorfeature", "booleanfeature", "holefeature", "helixfeature", "threadfeature", "knurlfeature", "insertfeature"])
    assert.match(source, new RegExp(`commandButton\\("${command}"`));
  assert.doesNotMatch(source, /commandButton\("rect"/);
  assert.doesNotMatch(source, /commandButton\("circle"/);
  assert.doesNotMatch(source, /commandButton\("sph"/);
  assert.match(source, /commandButton\("directbox"/);
  assert.match(source, /commandButton\("directcyl"/);
  assert.match(source, /commandButton\("directsph"/);
});

test("the editor requires explicit reference selection and renders canonical history", () => {
  assert.match(source, /id=\"mdReferencePicker\"/);
  assert.match(source, /Choose a stable reference/);
  assert.match(source, /function beginSketchWorkflow/);
  assert.match(source, /function buildParametricHistoryTree/);
  assert.match(source, /reorderHistoryNode\(E\.def/);
  assert.match(source, /updateFeatureDefinition\(E\.def/);
});

test("rebuild guidance is reachable without extra clicks and hides raw topology ids", () => {
  assert.match(modelerSource, /wrap\.id = "mdDiagnostics"/);
  assert.match(modelerSource, /md-diagnostic-primary/);
  assert.match(modelerSource, /md-diagnostic-primary \.md-diagnostic-actions button/);
  assert.match(stringsSource, /issueStartHere: \["התחילו כאן", "Start here"\]/);
  assert.match(stringsSource, /issueHelp: \["למה ואיך לתקן", "Why & how to fix"\]/);
  assert.match(modelerSource, /lost a selected face or edge/);
  assert.match(modelerSource, /groupDiagnostics\(issues\)/);
  assert.doesNotMatch(modelerSource, /row\.setAttribute\("role", "button"\)/);
  assert.match(modelerSource, /content\.appendChild\(el\("small", "md-diagnostic-next"[\s\S]{0,500}var disclosure = el\("details", "md-diagnostic-help"\)/);
  assert.match(modelerSource, /function coachRebuildSuggestion/);
  assert.match(modelerSource, /phrase: diagnosticMessage\(rebuildIssue\)/);
  assert.match(modelerSource, /id="mdCoachLabel"/);
  assert.match(modelerSource, /sug\.rebuild \? "coachActRebuild" : "coachNext"/);
  assert.match(modelerSource, /isCanonicalAuthoring\(\) && !sug\.rebuild/);
  assert.match(modelerSource, /target:'#mdParts'/);
  assert.match(styles, /#modeler \.md-diagnostic-help\[open\] \.md-diagnostic-explanation/);
  assert.match(styles, /#modeler \.md-diag-jump/);
});

test("the authoring breadcrumb is a navigator and Finish offers what the profile can become", () => {
  assert.match(source, /function currentWorkflowStep/);
  assert.match(source, /function resumeSketchSession/);
  assert.match(source, /function activateWorkflowStep/);
  assert.match(source, /commandButton\("finishsketch"/);
  assert.match(source, /shouldSkipReferencePicker\(face\)/);
  assert.match(source, /shouldResumeSketchSession\(E\.authoring && E\.authoring.phase, forceNew\)/);
  // Finish offers the features a closed profile could become, rather than
  // opening Extrude on the user's behalf.
  assert.match(source, /featuresForClosedProfile/);
  assert.match(source, /function offerProfileFeatures/);
  /* Narrow on purpose: an explicit Extrude button or command still opens
     Extrude. What must not survive is the editor opening it UNASKED — from
     finishing a sketch, or from the workflow bar's Feature step. */
  const finish = source.slice(source.indexOf("function finishSketchWorkflow"));
  assert.match(finish.slice(0, finish.indexOf("\n}")), /offerProfileFeatures\(\)/);
  const stepFeature = source.slice(source.indexOf('if(step==="feature")'), source.indexOf('if(step==="history")'));
  assert.match(stepFeature, /offerProfileFeatures\(\)/);
  assert.doesNotMatch(stepFeature, /openParametricFeature\("extrude"\)/);
  assert.match(source, /t\("needPlanarOrAnalytic"\)/);
  // a new sketch on an existing solid is a click on the model, not a dialog
  assert.match(source, /function beginFacePick/);
  assert.match(source, /function facePickFromViewport/);
  assert.match(source, /sketchStartMode\(\{/);
  assert.match(source, /if\(start==="pick-face"\)\{beginFacePick\(preferredTool\);return;\}/);
  assert.match(source, /if\(start==="default-plane"\)/);
  assert.match(source, /function startSketchOnDefaultPlane/);
  assert.match(source, /function coachAssemblySuggestion/);
  assert.match(source, /function startBlankPart/);
  assert.match(source, /md-tree-create-sketch md-dashed" \+ \(emptyDoc \? " md-tree-start" : ""\)/);
  assert.match(source, /planePicker:true/);
  assert.match(source, /if \(E\.facePick\) \{/);
  assert.match(source, /return "context"/);
  assert.doesNotMatch(source, /flash\("Select a planar or supported analytic face"\)/);
});

test("canonical save and exact regeneration compile history instead of reconstructing parts", () => {
  assert.match(source, /compileKernelFeatureTree\(E\.def\)/);
  assert.match(source, /var canonical=isCanonicalAuthoring\(\)/);
  assert.match(source, /if \(!canonical[^\n]+rebuildFeatureTreeFromDocument/);
  assert.match(source, /publishRebuildStatus\(E\.def,E\.coreRun\);\s*refreshModelHistoryPane\(\);\s*refreshParts\(\);\s*syncCoach\(\);/);
  assert.match(source, /savedButton\.dataset\.exactSaveValidation=saveGeometryReused\?"reused":"rebuilt"/);
  assert.match(source, /flash\("✓ " \+ t\("saved"\) \+ \(canonical \? " · "/);
});

test("feature parameters are grouped and drive every visual projection live", () => {
  assert.match(source, /function renderFeatureParameterForm/);
  assert.match(source, /function queueNewFeaturePreview/);
  assert.match(source, /Live · sketch, 3D, orthographic and drawing views synced/);
  /* One live entry point for a feature edit: the feature itself, then its
     downstream chain, then the viewport patch. Apply and Cancel still refreshAll. */
  assert.match(source, /pendingFrame=0;syncLiveFeatureEdit\(feature\);/);
  const live = source.match(/function syncLiveFeatureEdit\(feature\)[\s\S]*?\n\}\n/)[0];
  assert.match(live, /syncProjectionFromFeature\(feature\)/);
  assert.match(live, /syncLiveDownstream\(feature\)/);
  assert.match(live, /refreshLivePreview\(\)/);
  assert.doesNotMatch(live, /refreshAll\(\)/);
  assert.match(source, /function cancelFeatureParameterEdit/);
  assert.match(source, /renderedParts\(E\.def\)/);
  // Preview, apply and rebuild all lay a copy through the one helper, so a
  // pattern layout cannot be right in the viewport and wrong on Apply.
  assert.match(source, /placePatternCopy\(copy,state\.params,placement,circularStep\)/);
  assert.match(source, /\["axisX",\s*"axisY",\s*"axisZ"\]/);
});

test("linear pattern exposes independent X Y Z controls and skipped copies", () => {
  for(const field of ["countX","spacingX","spacingIncrementX","countY","spacingY","spacingIncrementY","countZ","spacingZ","spacingIncrementZ","skipInstances"])
    assert.match(featureCatalogSource,new RegExp(`key: "${field}"`));
  assert.match(source,/linearPatternAxisDefinitions\(axisParams\)/);
  assert.match(source,/parseSkippedPatternInstances\(params\.skipInstances\)/);
  assert.match(source,/rememberPatternSettings\(patternMode\);\s*restorePatternSettings\(input\.value\)/);
  assert.match(featureCatalogSource,/key: "radialDistance", label: "Distance from axis"/);
  assert.match(source,/rotatePatternPart\(copy,params\.axis,circularStep\*placement\.circularIndex,params\.radialDistance,params\.pivot\?\?params\.origin\)/);
});

test("topology selection is visible and finish operations preview exact geometry", () => {
  assert.match(source, /new THREE\.TubeGeometry/);
  assert.match(source, /Math\.abs\(tn\.dot\(n\)\) < \.96/);
  assert.match(source, /function queueExactFeaturePreview/);
  assert.match(source, /function addFinishScrubber/);
  assert.match(source, /previewReplacesPartId/);
  // The selection count states the grammar it is counting under: Shift grows
  // the set, Ctrl/Cmd flips one reference.
  assert.match(source, /Shift-click adds, Ctrl\/Cmd-click toggles/);
  assert.match(source, /mergeSmoothTopology\(kernel\.concat\(analytic, extras\)\)/);
  assert.match(source, /syncPreviewFromHistory\(\)/);
});

test("a cut invalidates a cached exact mesh, including Cut after Fillet", () => {
  const invalidation = modelerSource.match(/function invalidatePartMeshAfterEdit\(p, schedule=true\)[\s\S]*?\n\}/)[0];
  const scheduled = [];
  const invalidate = new Function('isKernelBody', 'partNeedsExactMesh', 'scheduleExactMesh', `${invalidation}; return invalidatePartMeshAfterEdit;`)(p => p.kind === 'kernel', p => p.needsExact, p => scheduled.push(p));
  const part = {kind: 'kernel', needsExact: true, meshData: {stale: true}, bounds: {stale: true}, exactPending: true, exactError: 'old failure'};
  invalidate(part);
  assert.equal(part.meshData, undefined);
  assert.equal(part.bounds, undefined);
  assert.equal(part.exactPending, false);
  assert.equal(part.exactError, null);
  assert.deepEqual(scheduled, [part]);
  const deferred = {...part, meshData: {stale: true}, bounds: {stale: true}};
  invalidate(deferred, false);
  assert.equal(deferred.meshData, undefined);
  assert.equal(deferred.bounds, undefined);
  assert.equal(scheduled.length, 1, 'an authoritative rebuild can defer redundant mesh work');
  assert.match(modelerSource, /p\.holes\.push\([\s\S]*invalidatePartMeshAfterEdit\(p\);/);
});

test("face-supported cuts keep the sketch frame and default into material", () => {
  assert.match(modelerSource, /sketch\.frameSpace==="local" \? sketch\.frame : null/);
  assert.match(modelerSource, /planeAxis\(sketch && sketch\.plane \|\| E\.view\)/);
  assert.match(modelerSource, /activeFeatureSketch\.frameSpace==="local"&&activeFeatureSketch\.support\)state\.params\.direction="reverse"/);
  assert.match(modelerSource, /from:start,to:end,endCondition:params\.endCondition/);
});

test("fillet Apply commits a selected face as edges you can toggle individually", () => {
  assert.match(source, /function adoptFinishEdgeSelection/);
  assert.match(source, /function toggleFinishEdges/);
  assert.match(source, /function renderFinishEdgeList/);
  assert.match(source, /data-finish-edges/);
  assert.match(source, /function overlayEdgesOnFace/);
  assert.match(source, /function allCandidateFinishEdges/);
  assert.match(source, /finish \? 0xf2d27a/);
  assert.match(source, /if \(finishCommandActive\(\) && topologyReferencePicked\)/);
  assert.match(source, /return cloneData\(edges.length \? edges : faces\)/);
  assert.match(featureCatalogSource, /kinds: \["edge", "face"\]/);
  assert.match(source, /appliedFeature/);
});

test("model edit supports close zoom through one shared camera limit", () => {
  assert.match(source, /near: 0\.1, far: 5000/);
  assert.match(source, /minDist: 1, maxDist: 2000/);
  assert.match(source, /E\.pv\.zoomBy\(/);
  assert.doesNotMatch(source, /E\.pv\.dist = clamp/);
  assert.match(editorViewSource, /view\.zoomBy = function \(factor\)/);
});

test("model display starts solid with black edges, and can hide them", () => {
  assert.match(source, /displayStyle: "solid"/);
  assert.match(source, /showModelEdges: true/);
  assert.match(source, /data-display="solid" class="on"/);
  assert.match(source, /data-display="transparent"/);
  assert.match(source, /id="mdShowEdges" class="on"/);
  assert.match(source, /setModelDisplay\("solid", false\)/);
  assert.match(source, /setShowModelEdges\(true, false\)/);
  assert.match(source, /function setShowModelEdges/);
  const displaySource = source.slice(source.indexOf("function applyViewportDisplayStyle("), source.indexOf("var decoGroups ="));
  const applyDisplay = new Function(displaySource + "; return applyViewportDisplayStyle;")();
  const mesh = {material:{opacity:.25,transparent:true}};
  applyDisplay(mesh,"solid",false);
  assert.equal(mesh.material.opacity,.25,"solid view preserves the saved finish");
  applyDisplay(mesh,"transparent",false);
  assert.equal(mesh.material.opacity,.25,"X-ray never makes a transparent finish more opaque");
  const opaque = {material:{opacity:1}};
  applyDisplay(opaque,"transparent",false);
  assert.equal(opaque.material.opacity,.3);
  assert.match(source, /function overlayEntriesForPart/);
  assert.match(source, /meshFeatureEdges\(/);
  assert.match(source, /function holeAndCutEdges/);
  assert.match(source, /function promotePickedEdge/);
  assert.match(source, /if \(!kernel\.length\)/);
  assert.match(source, /buildPart\(grp, p, E\.displayStyle\)/);
  assert.doesNotMatch(source, /p\.opacity = style === "transparent"/);
});

test("Drawing mode exposes a two-point Smart Ruler that edits and saves the model", () => {
  assert.match(source, /id="mdDrawingTools"/);
  assert.match(source, /data-drawing-tool="dim"/);
  assert.match(source, /commitDim/);
  assert.match(source, /editPlacedDimension|editDim/);
  assert.doesNotMatch(source, /id="mdDrawingSave"/);
  assert.match(source, /id="mdSave"/);
});

test("Escape cancels tools and selection without closing the document", () => {
  assert.match(source, /function markDocumentClean/);
  // The dirty flag is the current undo-tree node measured against the one that
  // was last saved; currentHistoryNode() is the single reader of that node.
  assert.match(source, /function currentHistoryNode/);
  assert.match(source, /node !== savedHistoryId/);
  assert.match(source, /savedHistoryId = currentHistoryNode\(\)/);
  assert.match(source, /#mdClose"\)\.addEventListener\("click", requestCloseModeler\)/);
  assert.match(source, /cancelReferenceSelection\(\); return/);
  assert.match(source, /It does not close the document/);
  assert.doesNotMatch(source, /if \(E\.sel\) \{ E\.sel = null; refreshAll\(\); return; \}\s*closeModeler\(\); return;/);
});

test("Ctrl+S saves in every mode and Ctrl+8 orients the camera", () => {
  assert.match(source, /chord === "s"[\s\S]*saveCurrentDocument\(\)/);
  assert.match(source, /chord === "z" && e\.shiftKey[\s\S]*doRedo\(\)/);
  assert.match(source, /e\.key === "8" && !editingField[\s\S]*orientModelToView\(true\)/);
  assert.doesNotMatch(source, /else if \(e\.key === "8" && \(e\.ctrlKey \|\| e\.metaKey\)\)/);
});

test("unavailable commands explain why instead of failing silently", () => {
  assert.match(source, /function commandUnavailableReason/);
  assert.match(source, /t\("cmdNeedClosedSketch"\)/);
  assert.match(source, /if \(blocked\) \{ flash\(blocked\); closeCommandSearch\(\); return; \}/);
  assert.match(source, /b\.classList\.toggle\("unavailable", !!why\)/);
});

test("3D model view keeps a rebuild status line", () => {
  assert.match(source, /function rebuildStatusCaption/);
  assert.match(source, /id="mdStatus" role="status"/);
  assert.match(source, /t\("rebuildOk"\)/);
  assert.match(source, /t\("dirtySave"\)/);
  assert.doesNotMatch(styles, /#modeler\.md-is3d:not\(\.md-model-sketching\) \.md-status \{ display: none; \}/);
});

test("R opens parametric Revolve and sketch-revolve has no letter chord", () => {
  assert.doesNotMatch(commandSource, /r:\s*"rev"/);
  assert.match(commandSource, /shortcut:"R"/);
  assert.match(source, /k === "r"\) runCommand\("revolvefeature"\)/);
  assert.match(source, /id === "holefeature"\) openParametricFeature\("hole"\)/);
});

test("SolidWorks-style CAD nav, S-key bar and Instant3D handles are wired", () => {
  assert.match(source, /cadNav: true/);
  assert.match(source, /beginDrag: beginInstant3dDrag/);
  assert.match(source, /gesturePreview: previewMouseGesture/);
  assert.match(source, /function chromeCommandLabel/);
  assert.match(source, /k === "s"\) showShortcutBar\(\)/);
  assert.match(source, /e\.key === " " && !editingField[\s\S]*showViewSelector\(\)/);
  assert.match(editorViewSource, /opts\.cadNav && e\.button === 2/);
  assert.match(editorViewSource, /opts\.beginDrag && primary/);
  assert.match(editorViewSource, /opts\.gesturePreview/);
  assert.match(editorViewSource, /bindThreeFingerPan/);
  assert.match(editorViewSource, /touchList\.length < 3/);
  assert.match(source, /bindThreeFingerPan\(cv/);
});

test("Instant3D writes the feature definition input, not the wrapping label", () => {
  // featureField stamps data-parameter on both <label> and <input>. A bare
  // [data-parameter] selector hits the label first, so Apply would keep the
  // old Depth/Distance while the 3D preview moved.
  assert.match(formSource, /wrap\.dataset\.parameter = field\.key/);
  assert.match(formSource, /input\.dataset\.parameter = field\.key/);
  assert.match(modelerSource, /function instant3dFormControl/);
  assert.match(modelerSource, /#mdQuickSettings input\[data-parameter="' \+ key \+ '"\]/);
  assert.match(modelerSource, /function instant3dAuthoringState/);
  assert.match(modelerSource, /E\.authoring\.featureEdit/);
  assert.match(modelerSource, /distancePointToSegment2d/);
  assert.match(modelerSource, /resolveFinishTargetIds/);
});

test("command search restores focus and names the active option", () => {
  assert.match(source, /E\.commandSearchRestore = document\.activeElement/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /mdCommandOption-/);
  assert.match(source, /role="combobox"/);
});

test("assembly keeps a status line and editor drafts persist locally", () => {
  assert.match(source, /E\.docType === "assembly"/);
  assert.match(source, /function tryRestoreModelerDraft/);
  assert.match(source, /function scheduleModelerDraft/);
  assert.match(draftSource, /home3d_modeler_draft/);
  assert.doesNotMatch(styles, /#modeler\.md-assembly \.md-status,/);
});

test("feature Apply/Cancel sit in equal tracks so the label cannot paint under Apply", () => {
  assert.match(styles, /#modeler \.md-feature-actions \{[^}]*grid-template-columns: minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(styles, /#modeler \.md-quick-apply,\s*#modeler \.md-quick-cancel \{[^}]*overflow: hidden/s);
  assert.match(modelerSource, /namedButton\(btn\('<i class="ph ph-x"><\/i> '\+t\("m_cancel"\)/);
  // Save tooltip and accessible name behavior is exercised by the real
  // syncDirty handler in modeler_save_button.test.mjs.
  assert.doesNotMatch(modelerSource, /save\.title = dirty/);
  // 120px, not the old 158px: the view rail at 158 overlapped the viewport-help
  // control, which "desktop model editor: room context and viewport help do not
  // overlap" now guards with an explicit viewsWidth <= 132 assertion. Pinning
  // 158 here would contradict that test outright.
  assert.match(styles, /--md-hud-col: 120px/);
  assert.match(styles, /body:not\(\.compact-nav\) #modeler \.md-views \{\s*top: 52px/);
  assert.match(styles, /body:not\(\.compact-nav\) #modeler \.md-context-toolbar \{[^}]*width:\s*max-content/s);
  assert.doesNotMatch(styles, /body:not\(\.compact-nav\) #modeler \.md-context-toolbar \{[^}]*inset-inline-end:\s*88px/s);
  assert.match(styles, /#modeler \.md-display \{ flex-direction: column; \}/);
  assert.match(styles, /#modeler \.md-part\.md-core-diagnostic \.nm \{[^}]*white-space: normal/s);
  assert.match(styles, /#modeler \.md-command-items \.md-command > kbd \{ display: none; \}/);
});

test("sketch witness lines and on-face planes are wired in the editor", () => {
  assert.match(source, /placedDimensionHit\(ensureSketch\(E\.def\)/);
  assert.match(source, /selectedId: E\.dimSel/);
  assert.match(source, /refType: "on-face"/);
  assert.match(source, /function createHoleFeature/);
});

test("sketches open Normal To the plane and the live preview is the UV shape", () => {
  assert.match(modelerSource, /sketchNormalTo: true/);
  assert.match(modelerSource, /MODELER_PREFS_VERSION = 2/);
  assert.match(modelerSource, /if \(ver < 2\) \{\s*E\.sketchNormalTo = true/);
  assert.match(modelerSource, /out = \{ prefsVersion: MODELER_PREFS_VERSION\s*[,}]/);
  assert.match(modelerSource, /function sketchCameraFrame\(\)/);
  assert.match(modelerSource, /return standardPlaneFrame\(E\.view, sketch && sketch\.offset\)/);
  assert.match(modelerSource, /if \(frame && E\.pv\.lookAtFrame\) \{ E\.pv\.lookAtFrame\(frame\); return; \}/);
  assert.match(modelerSource, /if \(!force && E\.modelPlaneActive\) return/);
  assert.doesNotMatch(modelerSource, /if \(active\) orientModelToView\(\)/);
  assert.match(modelerSource, /if\(stayIn3D && \(E\.sketchNormalTo \|\| topology\)\)\{\s*captureSketchCameraPose\(\);\s*orientModelToView\(true\);\s*\}/);
  assert.match(modelerSource, /if\(E\.sketchNormalTo\)\{captureSketchCameraPose\(\);orientModelToView\(true\);\}/);
  assert.match(modelerSource, /if \(E\.mode === "3d"\) orientStandardView\(id\)/);
  assert.match(modelerSource, /id="mdNormalToView"/);
  assert.match(modelerSource, /function setSketchNormalTo\(on\)/);
  assert.doesNotMatch(modelerSource, /id="mdNormalToView"[^>]*aria-pressed/);
  assert.doesNotMatch(modelerSource, /#mdNormalToView"\)\.addEventListener\("click", function \(\) \{\s*setSketchNormalTo\(!E\.sketchNormalTo\)/);
  assert.match(modelerSource, /#mdNormalToView"\)\.addEventListener\("click", function \(\) \{\s*orientModelToView\(true\);\s*drawSketch\(\);/);
  assert.doesNotMatch(modelerSource, /function setSketchNormalTo\(on\) \{[^}]*orientModelToView/s);
  assert.match(modelerSource, /function strokeUvRect\(c, u0, v0, u1, v1\)/);
  assert.match(modelerSource, /function pathUvEllipse\(c, o, start, sweep, closed\)/);
  assert.match(modelerSource, /function pathUvCircleArc\(c, center, radius, start, sweep, closed\)/);
  assert.match(modelerSource, /strokeUvRect\(c, E\.drag\.u, E\.drag\.v, E\._mouse\.u, E\._mouse\.v\)/);
  assert.match(modelerSource, /strokeUvCircle\(c, pc\.u, pc\.v, pr\)/);
  assert.match(modelerSource, /positiveArcSweep\(arcStart, arcEnd\)/);
  assert.match(modelerSource, /pathUvCircleArc\(c, o\.center, o\.radius, o\.start, positiveArcSweep\(o\.start, o\.end\), false\)/);
  assert.doesNotMatch(modelerSource, /c\.arc\(ac\.x, ac\.y, ar \* E\.scl/);
  assert.doesNotMatch(modelerSource, /c\.ellipse\(centre\.x, centre\.y, o\.rx \* E\.scl/);
  assert.doesNotMatch(modelerSource, /c\.rect\(Math\.min\(a3\.x, m2\.x\)/);
  assert.doesNotMatch(modelerSource, /pr \* E\.scl/);
  assert.doesNotMatch(styles, /#modeler \.md-vgroup #mdNormalToView\.on/);
});

/* The cheap half of the overlap guard. tests/modeler_viewport_overlap.browser.mjs
   measures real boxes in Chrome; this catches the commonest way a new overlay
   re-creates the bug — pinning itself to a corner that a rail already owns —
   without needing a browser at all. */
test("viewport chrome docks to a rail instead of pinning itself to a corner", () => {
  for (const id of ["mdRailEnd", "mdRailBottom", "mdRailRow"])
    assert.match(modelerSource, new RegExp(`class="md-rail md-rail-[a-z]+" id="${id}"`),
      id + " is missing: the shelves the viewport overlays stack on");
  assert.match(styles, /#modeler \.md-rail \{[^}]*position: absolute[^}]*pointer-events: none/s);
  // A rail is transparent; only what sits on it takes the pointer.
  assert.match(styles, /#modeler \.md-rail > \* \{ pointer-events: auto; \}/);

  // Each of these lives on a rail now, so none of them may carry its own
  // corner: two that do land on top of each other the moment both are open.
  for (const cls of ["md-sketch-plane-chip", "md-context-actions", "md-section-controls",
                     "md-eval-card", "md-profile-offer", "md-face-prompt", "md-sel-filters", "md-breadcrumb"]) {
    const rule = styles.match(new RegExp(`#modeler \\.${cls} \\{([^}]*)\\}`));
    assert.ok(rule, cls + " has no rule to check");
    assert.doesNotMatch(rule[1], /position: (absolute|fixed)/, cls + " re-pinned itself instead of riding its rail");
    assert.doesNotMatch(rule[1], /inset-inline-end:|bottom:|top:/, cls + " carries a corner offset its rail already owns");
  }
  // The hand-tuned dodge the rails replaced. If this comes back, so has the bug.
  assert.doesNotMatch(styles, /\.md-section-controls:not\(\[hidden\]\) ~ \.md-eval-card/);

  // Two stacks grow into the middle of the viewport from opposite ends; each is
  // bounded so they cannot meet on a short window.
  assert.match(styles, /#modeler \.md-rail-bottom \{[^}]*max-height: calc\(50% - 66px\)/s);
  assert.match(styles, /#modeler \.md-context-toolbar \{[^}]*max-height: calc\(50% - 60px\)/s);
  // The view stack is a fixed list of buttons in a viewport of no fixed height.
  assert.match(styles, /body:not\(\.compact-nav\) #modeler \.md-views \{[^}]*max-height: calc\(100% - 132px\)[^}]*overflow-y: auto/s);
});

test("desktop model editor: context toolbar is horizontal, high-contrast, and displays action labels", () => {
  assert.match(styles, /#modeler \.md-context-toolbar \{[^}]*display:\s*flex/s);
  assert.match(styles, /#modeler \.md-context-toolbar \{[^}]*flex-direction:\s*row/s);
  assert.match(styles, /#modeler \.md-context-toolbar \{[^}]*background:\s*var\(--bg-panel\)/s);
  assert.match(styles, /#modeler \.md-context-toolbar button \.md-action-label/);
  assert.match(modelerSource, /showLabels = host\.id === "mdContextToolbar"/);
  assert.match(modelerSource, /md-action-label/);
});
