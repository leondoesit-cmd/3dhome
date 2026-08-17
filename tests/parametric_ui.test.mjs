import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const editorViewSource = await readFile(new URL("../js/editor_view.js", import.meta.url), "utf8");
const featureCatalogSource = await readFile(new URL("../js/core/feature_catalog.js", import.meta.url), "utf8");

test("the default Features surface exposes the canonical feature vocabulary", () => {
  for (const command of ["newsketch", "extrude", "extrudecut", "revolvefeature", "sweepfeature", "loftfeature", "filletfeature", "chamferfeature", "shellfeature", "patternfeature", "mirrorfeature", "booleanfeature"])
    assert.match(source, new RegExp(`commandButton\\("${command}"`));
  assert.doesNotMatch(source, /commandButton\("rect"/);
  assert.doesNotMatch(source, /commandButton\("circle"/);
  assert.doesNotMatch(source, /commandButton\("sph"/);
});

test("the editor requires explicit reference selection and renders canonical history", () => {
  assert.match(source, /id=\"mdReferencePicker\"/);
  assert.match(source, /Choose a stable reference/);
  assert.match(source, /function beginSketchWorkflow/);
  assert.match(source, /function buildParametricHistoryTree/);
  assert.match(source, /reorderHistoryNode\(E\.def/);
  assert.match(source, /updateFeatureDefinition\(E\.def/);
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
  assert.match(source, /\["axisX","axisY","axisZ"\]/);
});

test("linear pattern exposes independent X Y Z controls and skipped copies", () => {
  for(const field of ["countX","spacingX","spacingIncrementX","countY","spacingY","spacingIncrementY","countZ","spacingZ","spacingIncrementZ","skipInstances"])
    assert.match(featureCatalogSource,new RegExp(`key: "${field}"`));
  assert.match(source,/linearPatternAxisDefinitions\(axisParams\)/);
  assert.match(source,/parseSkippedPatternInstances\(params\.skipInstances\)/);
  assert.match(source,/rememberPatternSettings\(patternMode\);restorePatternSettings\(input\.value\)/);
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
