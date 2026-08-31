import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";

const modeler = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");
const harness = await readFile(new URL("../tools/browser_harness.mjs", import.meta.url), "utf8");

test("desktop Model Editor exposes section, dependency, and interference visuals", () => {
  assert.match(modeler, /commandButton\("section"/);
  assert.match(modeler, /function setSectionState\(/);
  assert.match(modeler, /function setDependencyHighlight\(/);
  assert.match(modeler, /function addInterferenceVisuals\(/);
  assert.match(styles, /\.md-section-controls/);
  assert.match(styles, /\.md-dependency-upstream/);
});

test("typed sketch dimensions default to editable driving constraints", () => {
  assert.match(modeler, /autoDimTyped:\s*true/);
  assert.match(modeler, /addSmartDimension\(sketch/);
  assert.match(modeler, /if \(e\.key === "Enter" && dynHasEntry\(\)\)/);
});

test("history and zoom icon controls have accessible names", () => {
  assert.match(modeler, /function namedButton\(/);
  assert.match(modeler, /data-zoom="in"[^>]+aria-label=/);
  assert.match(modeler, /data-zoom="out"[^>]+aria-label=/);
  assert.match(modeler, /data-zoom="fit"[^>]+aria-label=/);
});

test("3D hover coalescing resolves the latest pointer sample", () => {
  assert.match(modeler, /latestHoverEvent = \{/);
  assert.match(modeler, /var event = latestHoverEvent;/);
  assert.match(modeler, /if \(event\.buttons\) \{ cancelQueuedHover\(\); return; \}/);
  assert.match(modeler, /pointerleave[\s\S]{0,100}cancelQueuedHover\(\)/);
});

test("browser harness teardown is ordered and bounded", () => {
  const graceful = harness.indexOf("server.close((error)");
  const force = harness.indexOf("server.closeAllConnections()", graceful);
  assert.ok(graceful >= 0 && force > graceful);
  assert.match(harness, /browser harness server did not close/);
  assert.match(harness, /pageWs\.terminate\(\)/);
  assert.match(harness, /child\.signalCode != null/);
  assert.match(harness, /child\.once\("exit"/);
});

test("picking inside a hole resolves the whole bore, not the facet under the cursor", () => {
  // every hole and cut loop is named once and read by both the edge and face pass
  assert.match(modeler, /function forEachCutLoop\(part, visit\)/);
  assert.match(modeler, /function holeAndCutFaces\(part, featureId\)/);
  assert.match(modeler, /faces\.push\.apply\(faces, cutWallTopology\(/);
  assert.match(modeler, /\.concat\(kernel\.length \? \[\] : holeAndCutFaces\(part, featureId\)\)/);
  // a face candidate only wins outright when the hit point lies on it
  assert.match(modeler, /if \(radial <= Math\.max\(0\.4, radius \* 0\.06\)\) contained =/);
  assert.match(modeler, /if \(Math\.abs\(alignment\) >= 0\.9 && planeDistance <= 0\.4\) contained =/);
  assert.match(modeler, /if \(analyticCurvedFace\(containedFace.descriptor\)\) exactFace = true;/);
  // and the overlay lifts off the side the facet shows, not into the material
  assert.match(modeler, /if \(tn\.dot\(n\) < 0\) n\.multiplyScalar\(-1\);/);
});

test("a curved face picks and highlights as one surface, not one tessellated facet", () => {
  assert.match(modeler, /function meshFaceEntries\(part, featureId\)/);
  assert.match(modeler, /function smoothFacesForMesh\(mesh\)/);
  assert.match(modeler, /meshSmoothFaces\(/);
  assert.match(modeler, /descriptor\.surface === "sphere"/);
  assert.match(modeler, /function triangleSetForFace\(/);
  assert.match(modeler, /cadFaceRanges/);
  assert.match(modeler, /:face:mesh:/);
  assert.match(modeler, /analyticCurvedFace\(containedFace.descriptor\)/);
  /* Kernel face ranges are returned before the mesh grouping is consulted;
     falling through would paint an infinite cylinder. Asserted as an order in
     the code, not as the sentence that explains it. */
  const ranges = stripComments(modeler);
  const wanted = ranges.indexOf("if (wanted) {"), grouped = ranges.indexOf("smoothFacesForMesh(mesh)", wanted);
  assert.ok(wanted !== -1 && grouped !== -1 && wanted < grouped,
    "the kernel ranges return before the tessellation fallback");
  assert.match(modeler, /alongSpan && \(along < alongSpan.min - band/);
  assert.match(modeler, /isCylinderTessellationSeam\(edgeEntry, roundWalls\)/);
  assert.doesNotMatch(modeler, /seamCurve !== "circle"/);
});

test("a cut applies to every body under it, and names the ones it cannot take", () => {
  // turned and lofted bodies are rebuildable, so they can be cut
  assert.match(modeler, /function partSupportsExactMesh\(p\)/);
  assert.match(modeler, /if \(p\.kind === "loft"\) return \(p\.pts0 \|\| \[\]\)\.length >= 3/);
  assert.match(modeler, /if \(p\.kind === "rev"\) return \(p\.pts \|\| \[\]\)\.length >= 3 && Math\.abs\(Number\(p\.angle\) \|\| 360\) >= 359\.5/);
  // the exact kernel builds them about the origin and moves them into place
  assert.match(modeler, /makeBrepRevolve\(\{axis:"y",angle:360,points:\[\{u:0,v:0\},\{u:base,v:0\},\{u:top,v:tall\},\{u:0,v:tall\}\]\}\)/);
  assert.match(modeler, /solid=await moveTo\(solid,\{x:p\.x\|\|0,y:0,z:p\.z\|\|0\}\)/);
  assert.match(modeler, /makeBrepLoft\(\{sections:\[section\(p\.pts0,p\.from\),section\(p\.pts1,p\.to\)\]/);
  // and a body that still cannot be cut is reported instead of skipped quietly
  assert.match(modeler, /if \(inside && !partSupportsExactMesh\(p\)\) \{ skipped\.push/);
  assert.match(modeler, /function cutSkipNote\(\)/);
  assert.match(modeler, /cutSkipped: \["לא נחתך", "not cut"\]/);
  assert.match(modeler, /flash\(\(applyCut\(E\.poly\) \? t\("cutDone"\) : t\("cutNone"\)\) \+ cutSkipNote\(\)\)/);
});

test("a cut measures the bodies under it in the cut's own space", () => {
  // not partUV(): that reads the active sketch frame, which Finish sketch has
  // already cleared by the time the cut runs
  assert.match(modeler, /var footprint=cutFootprint\(p, frame, ax\)/);
  assert.match(modeler, /return cutScopeFootprint\(part, partBounds\(part\), frame, axisName/);
  assert.doesNotMatch(modeler, /var footprint=partUV\(p\)/);
});

test("a new feature only claims sketch geometry no earlier feature owns", () => {
  assert.match(modeler, /function unclaimedSketchEntityIds\(sketch\)/);
  assert.match(modeler, /claim\(feature\.params && feature\.params\.profileEntityIds\)/);
  assert.match(modeler, /claim\(part\.profileEntityIds\)/);
  // the arrangement is computed over that scope, not filtered after the fact
  assert.match(modeler, /function sketchRegionAnalysis\(entityIds\)/);
  assert.match(modeler, /var scope = selected\.length \? selected : unclaimedSketchEntityIds\(sketch\)/);
  assert.match(modeler, /var scoped = featureAreas\(analysis, sketchRegionAnalysis\(scope\), selected\)/);
});

/* Mass properties and the BOM used to seize the screen: report() writes into
   #mdReport, which is aria-modal, so you could not orbit the model while
   reading the number you had just asked it for. */
test("mass properties and the BOM are non-modal cards, not #mdReport", () => {
  const code = stripComments(modeler);
  const mass = code.slice(code.indexOf("function showMassProperties("), code.indexOf("function beginMeasure("));
  const bom = code.slice(code.indexOf("function showAssemblyBOM("), code.indexOf("function importStepDocument("));
  [mass, bom].forEach((block) => assert.doesNotMatch(block, /\breport\(/));
  assert.match(mass, /openEvalCard\("mass"/);
  assert.match(bom, /openEvalCard\("bom"/);
  // Every string these two emit is translated; they used to be English literals.
  assert.match(mass, /t\("massVolume"\)/);
  assert.match(mass, /t\("massCentre"\)/);
  assert.match(bom, /t\("bomEmpty"\)/);
  assert.match(bom, /bomCsv\(rows, headers, withMaterial\)/);
  assert.match(code, /id="mdEvalCard"/);
  assert.doesNotMatch(code, /aria-modal="true"[^>]*id="mdEvalCard"/);
  assert.match(styles, /\.md-eval-card/);
  assert.match(styles, /table\.md-bom/);
});

/* refreshAll() ends in syncTools -> syncHint, which owns #mdHint — so a
   flash() written just before it was overwritten in the same tick, and users
   read that as the command having done nothing. */
test("a flashed message survives the refresh that follows it", () => {
  const code = stripComments(modeler);
  assert.match(code, /E\.flashUntil = Date\.now\(\) \+ FLASH_MS/);
  assert.match(code, /function flashHolding\(\) \{\s*return !!\(E\.flashUntil && Date\.now\(\) < E\.flashUntil\);/);
  const hint = code.slice(code.indexOf("function syncHint("));
  assert.match(hint.slice(0, 260), /if \(flashHolding\(\)\) return;/);
  // and the ordering workaround that used to paper over it is gone
  assert.match(code, /if \(why\) flash\(why\);\s*refreshAll\(\);/);
});

test("Measure ships on Evaluate and picks through the topology picker", () => {
  const code = stripComments(modeler);
  assert.match(code, /commandButton\("measure"/);
  assert.match(code, /id === "measure"\) beginMeasure/);
  assert.match(code, /if \(E\.measure\) \{ measureFromPick\(event, view\); return; \}/);
  assert.match(code, /resolveTopologyPick\(event, view, \{ prefer: measure\.mode === "faces"/);
  assert.match(code, /measureAngleBetweenNormals\(/);
  assert.match(code, /measureDistance\(measure\.picks\[0\], measure\.picks\[1\]\)/);
  // the dead import this replaced
  assert.doesNotMatch(code, /evaluateDraftAngle/);
});

test("Angle is a mate the palette offers and the ribbon's PropertyManager can build", () => {
  const code = stripComments(modeler);
  assert.match(code, /\["angle", "ph-angle", "angleMate"\]/);
  assert.match(code, /value: type === "angle" \? clampMateAngle\(value\) : 0/);
  assert.match(code, /id === "mates"\) openMatePropertyManager\(\)/);
  assert.match(code, /function openMatePropertyManager\(\)/);
  // the Ops palette keeps working: the PropertyManager is an extra door
  assert.match(code, /function assemblyMateInspector\(\)/);
  assert.match(code, /MATE_PALETTE\.forEach/);
  assert.match(styles, /\.md-mate-value/);
});
