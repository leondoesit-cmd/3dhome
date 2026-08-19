import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const modelerSource = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const commandSource = await readFile(new URL("../js/modeler_commands.js", import.meta.url), "utf8");
const formSource = await readFile(new URL("../js/modeler_feature_form.js", import.meta.url), "utf8");
const draftSource = await readFile(new URL("../js/modeler_draft.js", import.meta.url), "utf8");
const workflowSource = await readFile(new URL("../js/modeler_workflow.js", import.meta.url), "utf8");
const source = [modelerSource, commandSource, formSource, draftSource, workflowSource].join("\n");
const editorViewSource = await readFile(new URL("../js/editor_view.js", import.meta.url), "utf8");
const featureCatalogSource = await readFile(new URL("../js/core/feature_catalog.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("the default Features surface exposes the canonical feature vocabulary", () => {
  for (const command of ["newsketch", "extrude", "extrudecut", "revolvefeature", "sweepfeature", "loftfeature", "filletfeature", "chamferfeature", "shellfeature", "patternfeature", "mirrorfeature", "booleanfeature", "holefeature"])
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

test("the authoring breadcrumb is a navigator and Finish continues into Extrude", () => {
  assert.match(source, /function currentWorkflowStep/);
  assert.match(source, /function resumeSketchSession/);
  assert.match(source, /function activateWorkflowStep/);
  assert.match(source, /commandButton\("finishsketch"/);
  assert.match(source, /shouldSkipReferencePicker\(face\)/);
  assert.match(source, /shouldResumeSketchSession\(E\.authoring && E\.authoring.phase, forceNew\)/);
  assert.match(source, /nextFeatureAfterFinishedSketch/);
  assert.match(source, /t\("needPlanarOrAnalytic"\)/);
  assert.match(source, /return "context"/);
  assert.doesNotMatch(source, /flash\("Select a planar or supported analytic face"\)/);
});

test("canonical save and exact regeneration compile history instead of reconstructing parts", () => {
  assert.match(source, /compileKernelFeatureTree\(E\.def\)/);
  assert.match(source, /var canonical=isCanonicalAuthoring\(\)/);
  assert.match(source, /if \(!canonical[^\n]+rebuildFeatureTreeFromDocument/);
});

test("feature parameters are grouped and drive every visual projection live", () => {
  assert.match(source, /function renderFeatureParameterForm/);
  assert.match(source, /function queueNewFeaturePreview/);
  assert.match(source, /Live · sketch, 3D, orthographic and drawing views synced/);
  assert.match(source, /syncProjectionFromFeature\(feature\);refreshAll\(\)/);
  assert.match(source, /function cancelFeatureParameterEdit/);
  assert.match(source, /renderedParts\(E\.def\)/);
  assert.match(source, /rotatePatternPart\(copy,state\.params\.axis/);
  assert.match(source, /\["axisX",\s*"axisY",\s*"axisZ"\]/);
});

test("linear pattern exposes independent X Y Z controls and skipped copies", () => {
  for(const field of ["countX","spacingX","spacingIncrementX","countY","spacingY","spacingIncrementY","countZ","spacingZ","spacingIncrementZ","skipInstances"])
    assert.match(featureCatalogSource,new RegExp(`key: "${field}"`));
  assert.match(source,/linearPatternAxisDefinitions\(axisParams\)/);
  assert.match(source,/parseSkippedPatternInstances\(params\.skipInstances\)/);
  assert.match(source,/rememberPatternSettings\(patternMode\);\s*restorePatternSettings\(input\.value\)/);
  assert.match(featureCatalogSource,/key: "radialDistance", label: "Distance from axis"/);
  assert.match(source,/state\.params\.radialDistance/);
});

test("topology selection is visible and finish operations preview exact geometry", () => {
  assert.match(source, /new THREE\.TubeGeometry/);
  assert.match(source, /Math\.abs\(tn\.dot\(n\)\) < \.96/);
  assert.match(source, /function queueExactFeaturePreview/);
  assert.match(source, /function addFinishScrubber/);
  assert.match(source, /previewReplacesPartId/);
  assert.match(source, /Ctrl\/Cmd-click adds or removes/);
});

test("model edit supports close zoom through one shared camera limit", () => {
  assert.match(source, /near: 0\.1, far: 5000/);
  assert.match(source, /minDist: 1, maxDist: 2000/);
  assert.match(source, /E\.pv\.zoomBy\(/);
  assert.doesNotMatch(source, /E\.pv\.dist = clamp/);
  assert.match(editorViewSource, /view\.zoomBy = function \(factor\)/);
});

test("trackpad gestures orbit and pinch-zoom instead of stepping the camera", () => {
  assert.match(editorViewSource, /classifyViewportWheel\(e, "3d"\)/);
  assert.match(source, /classifyViewportWheel\(e, sketchProjection\(\) \? "3d" : "2d"\)/);
  assert.match(editorViewSource, /view\.orbitBy = function/);
  assert.doesNotMatch(editorViewSource, /e\.deltaY > 0 \? 1\.12/);
  assert.doesNotMatch(source, /e\.deltaY > 0 \? 1\.12/);
});

test("model display starts solid and toggles transparency without editing materials", () => {
  assert.match(source, /displayStyle: "solid"/);
  assert.match(source, /data-display="solid" class="on"/);
  assert.match(source, /data-display="transparent"/);
  assert.match(source, /setModelDisplay\("solid", false\)/);
  assert.match(source, /material\.opacity = style === "transparent" \? 0\.3 : 1/);
  assert.match(source, /buildPart\(grp, p, E\.displayStyle\)/);
  assert.doesNotMatch(source, /p\.opacity = style === "transparent"/);
});

test("Drawing mode exposes a two-point Smart Ruler that edits and saves the model", () => {
  assert.match(source, /id="mdDrawingTools"/);
  assert.match(source, /data-drawing-tool="dim"/);
  assert.match(source, /function beginSmartRulerPoint/);
  assert.match(source, /mode:"dimension"/);
  assert.match(source, /editPlacedDimension/);
  assert.match(source, /id="mdDrawingSave"/);
  assert.match(source, /#mdDrawingSave"\)\.addEventListener\("click", saveCurrentDocument\)/);
});

test("Escape cancels tools and selection without closing the document", () => {
  assert.match(source, /function markDocumentClean/);
  assert.match(source, /tree\[i\]\.i !== savedHistoryId/);
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

test("sketch witness lines and on-face planes are wired in the editor", () => {
  assert.match(source, /placedDimensionAt\(ensureSketch\(E\.def\)/);
  assert.match(source, /selectedId: E\.dimSel/);
  assert.match(source, /refType: "on-face"/);
  assert.match(source, /function createHoleFeature/);
});
