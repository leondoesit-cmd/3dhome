import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.match(modeler, /Kernel ranges are the face/);
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
