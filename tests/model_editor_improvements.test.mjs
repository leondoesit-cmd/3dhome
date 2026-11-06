import { modelerSource } from "./helpers/modeler_source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripComments } from "./source.mjs";
import { runInNewContext } from "node:vm";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import {defaultTopologyMateAlignment} from '../js/cad_mate_reference_choices.js';

const modeler = modelerSource();
const functionsText = (...names) => stripComments(names.map((name) => sourceFunctionText(modeler, name)).join("\n"));
/* Pure part geometry and the exact-kernel part recipe, split out of js/modeler.js. */
const partGeometry = await readFile(new URL("../js/modeler_part_geometry.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");
/* Pure mesh/edge/face geometry, split out of js/modeler.js. */
const meshGeometry = await readFile(new URL("../js/modeler_mesh_geometry.js", import.meta.url), "utf8");
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
  assert.match(meshGeometry, /function forEachCutLoop\(part, visit\)/);
  assert.match(meshGeometry, /function holeAndCutFaces\(part, featureId\)/);
  assert.match(meshGeometry, /faces\.push\.apply\(faces, cutWallTopology\(/);
  assert.match(modeler, /\.concat\(kernel\.length \? \[\] : holeAndCutFaces\(part, featureId\)\)/);
  // a face candidate only wins outright when the hit point lies on it
  assert.match(modeler, /if \(radial <= Math\.max\(0\.4, radius \* 0\.06\)\) contained =/);
  assert.match(modeler, /if \(Math\.abs\(alignment\) >= 0\.9 && planeDistance <= 0\.4\) contained =/);
  assert.match(modeler, /if \(analyticCurvedFace\(containedFace.descriptor\) \|\| \(containedFace.descriptor\?\.surface === "plane" && part\?\.meshData\?\.topology\?\.length\)\) exactFace = true;/);
  // and the overlay lifts off the side the facet shows, not into the material
  assert.match(meshGeometry, /if \(tn\.dot\(n\) < 0\) n\.multiplyScalar\(-1\);/);
});

test("a curved face picks and highlights as one surface, not one tessellated facet", () => {
  assert.match(meshGeometry, /function meshFaceEntries\(part, featureId\)/);
  assert.match(meshGeometry, /function smoothFacesForMesh\(mesh\)/);
  assert.match(meshGeometry, /meshSmoothFaces\(/);
  assert.match(modeler, /descriptor\.surface === "sphere"/);
  assert.match(meshGeometry, /function triangleSetForFace\(/);
  assert.match(meshGeometry, /cadFaceRanges/);
  assert.match(meshGeometry, /:face:mesh:/);
  assert.match(modeler, /analyticCurvedFace\(containedFace.descriptor\)/);
  /* Kernel face ranges are returned before the mesh grouping is consulted;
     falling through would paint an infinite cylinder. Asserted as an order in
     the code, not as the sentence that explains it. */
  const ranges = stripComments(meshGeometry);
  const wanted = ranges.indexOf("if (wanted) {"), grouped = ranges.indexOf("smoothFacesForMesh(mesh)", wanted);
  assert.ok(wanted !== -1 && grouped !== -1 && wanted < grouped,
    "the kernel ranges return before the tessellation fallback");
  assert.match(meshGeometry, /alongSpan && \(along < alongSpan.min - band/);
  assert.match(modeler, /isCylinderTessellationSeam\(edgeEntry, roundWalls\)/);
  assert.doesNotMatch(modeler + meshGeometry, /seamCurve !== "circle"/);
});

test("a cut applies to every body under it, and names the ones it cannot take", () => {
  // turned and lofted bodies are rebuildable, so they can be cut
  assert.match(partGeometry, /function partSupportsExactMesh\(p\)/);
  assert.match(partGeometry, /if \(p\.kind === "loft"\) return \(p\.pts0 \|\| \[\]\)\.length >= 3/);
  assert.match(partGeometry, /if \(p\.kind === "rev"\) return \(p\.pts \|\| \[\]\)\.length >= 3 && Number\(p\.angle \?\? 360\)>0/);
  // Cone and revolve recipes carry their actual axis and origin into the kernel.
  assert.match(partGeometry, /makeBrepCone\(\{r1:Math\.abs\(p\.r\),r2:Math\.abs\(p\.r2\),h:p\.h,axis:p\.axis,origin:\{x:p\.x\|\|0,y:p\.y\|\|0,z:p\.z\|\|0\}\}\)/);
  assert.match(partGeometry, /solid=await makeBrepRevolve\(revolveRecipe\(p\)\)/);
  assert.match(partGeometry, /makeBrepLoft\(\{sections:\[section\(p\.pts0,p\.from\),section\(p\.pts1,p\.to\)\]/);
  // and a body that still cannot be cut is reported instead of skipped quietly
  assert.match(modeler, /if \(inside && !partSupportsExactMesh\(p\)\) \{ skipped\.push/);
  assert.match(modeler, /function cutSkipNote\(\)/);
  assert.match(modelerStrings, /cutSkipped: \["לא נחתך", "not cut"\]/);
  assert.match(modeler, /flash\(\(\(await applyCut\(E\.poly\)\) \? t\("cutDone"\) : t\("cutNone"\)\) \+ cutSkipNote\(\)\)/);
});

test("a cut measures the bodies under it in the cut's own space", () => {
  // not partUV(): that reads the active sketch frame, which Finish sketch has
  // already cleared by the time the cut runs
  assert.match(modeler, /var footprint=cutFootprint\(p, frame, ax\)/);
  // Pending merged stock uses its full envelope, not just the original profile.
  // cut_scope and merged_cut_scope exercise both paths in an off-origin frame.
  assert.match(partGeometry, /return cutScopeFootprint\(candidate, partBounds\(part\), frame, axisName/);
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
  const mass = functionsText("showMassProperties");
  const bom = functionsText("showAssemblyBOM");
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
  // a caller may hold a long sentence longer; the default is still FLASH_MS
  assert.match(code, /var hold = holdMs \|\| FLASH_MS;[\s\S]{0,120}E\.flashUntil = Date\.now\(\) \+ hold/);
  assert.match(code, /function flashHolding\(\) \{\s*return !!\(E\.flashUntil && Date\.now\(\) < E\.flashUntil\);/);
  const hint = functionsText("syncHint");
  // the guard must run before syncHint writes any text into #mdHint
  const guard = hint.search(/if \(flashHolding\(\)\) return;/);
  assert.ok(guard > 0, "syncHint yields to a held flash");
  assert.ok(guard < hint.search(/hint\.(textContent|innerHTML)\s*=/), "the flash guard precedes the first hint write");
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
  assert.match(code, /value: type === "angle" \? clampMateAngle\(value\) : type === "distance" \? Number\(value\) : 0/);
  assert.match(code, /id === "mates"\) openMatePropertyManager\(\)/);
  assert.match(code, /function openMatePropertyManager\(\)/);
  // the Ops palette keeps working: the PropertyManager is an extra door
  assert.match(code, /function assemblyMateInspector\(\)/);
  assert.match(code, /MATE_PALETTE\.forEach/);
  assert.match(styles, /\.md-mate-value/);
  // Exercise the actual creation/clamp functions without loading the WebGL
  // editor. Adding planar distances must not change the angle's degree range.
  const source=functionsText('addTopologyMate','clampMateAngle','openFormSubassembly','addInspectorTopologyMate');
  const a={componentId:'anchor',frame:{surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:1}}};
  const b={componentId:'moving',frame:{surface:'plane',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}}};
  const environment={E:{assembly:{topologyMates:[]}},fin:Number.isFinite,defaultTopologyMateAlignment,
    mateTypeFits:()=>({ok:true}),assemblyPickedRefs:()=>({a,b}),mateReferenceFromPick:pick=>pick,
    mateHolderById:id=>({id,grounded:id==='anchor'}),pushUndo:()=>{},t:key=>key,flash:()=>{},
    uid:()=>String(environment.E.assembly.topologyMates.length),solveAssembly:()=>{},refreshAll:()=>{}};
  runInNewContext(source+';this.createMate=addTopologyMate;',environment);
  for(const [input,expected] of [[-20,0],[181,180],[45,45],['90',90],[NaN,0],[Infinity,0]]){
    assert.equal(environment.createMate('angle',input),true);
    const mate=environment.E.assembly.topologyMates.at(-1);
    assert.equal(mate.type,'angle');assert.equal(mate.value,expected);
    assert.equal(mate.a.componentId,'anchor');assert.equal(mate.b.componentId,'moving');
  }
});
