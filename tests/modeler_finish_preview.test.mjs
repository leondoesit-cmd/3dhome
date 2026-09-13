import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { topologyForFeature } from "../js/core/topology.js";
import {
  approximateFinishPreviewShapes,
  capEndForFace,
  chamferVertex,
  filletVertex,
  finishProfileForPart,
  insetLoop,
  profileCornersForEdges,
  projectToProfile,
} from "../js/modeler_finish_preview.js";

const modeler = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
/* The editor's [he, en] table lives in js/modeler_strings.js. */
const modelerStrings = await readFile(new URL("../js/modeler_strings.js", import.meta.url), "utf8");

/* The topology a real pick carries. Building it from the same generator the
   editor uses is the point of these tests: an approximation that matched
   hand-written descriptors but not the editor's would preview nothing. */
function topologyFor(type, params) {
  return topologyForFeature({ id: "feature:part:body", type }, params);
}
function refsBySemantic(entries, kind, semantics) {
  return semantics.map((semantic) => {
    const entry = entries.find((item) => item.kind === kind && item.semantic === semantic);
    assert.ok(entry, "no " + kind + " " + semantic + " in the generated topology");
    return { kind: entry.kind, persistentId: entry.persistentId, descriptor: entry.descriptor };
  });
}

const BOX = { id: "b", kind: "box", x0: -10, x1: 10, y0: 0, y1: 30, z0: -6, z1: 6 };
const BOX_PARAMS = { x0: -10, x1: 10, y0: 0, y1: 30, z0: -6, z1: 6 };

test("a box's vertical edge maps to the profile corner it stands for", () => {
  const profile = finishProfileForPart(BOX);
  assert.equal(profile.mode, "ext");
  assert.equal(profile.axis, "y");
  assert.deepEqual(profile.pts, [{ u: -10, v: -6 }, { u: 10, v: -6 }, { u: 10, v: 6 }, { u: -10, v: 6 }]);
  // world (x, y, z) -> (u, v) for a Y extrusion is (x, z), matching buildExt
  assert.deepEqual(projectToProfile(profile, { x: 10, y: 15, z: 6 }), { u: 10, v: 6 });

  const entries = topologyFor("box", BOX_PARAMS);
  const corners = profileCornersForEdges(profile, refsBySemantic(entries, "edge", ["y:right:front"]));
  assert.deepEqual(corners, [2]);
});

test("an edge that does not run along the sweep has no corner to round", () => {
  const profile = finishProfileForPart(BOX);
  const entries = topologyFor("box", BOX_PARAMS);
  // a top rim runs across the extrusion, not along it
  assert.deepEqual(profileCornersForEdges(profile, refsBySemantic(entries, "edge", ["x:top:front"])), []);
});

test("fillet previews a box corner as an arc, chamfer as a single cut", () => {
  const entries = topologyFor("box", BOX_PARAMS);
  const targets = refsBySemantic(entries, "edge", ["y:right:front"]);
  const rounded = approximateFinishPreviewShapes({ part: BOX, type: "fillet", amount: 3, targets });
  assert.equal(rounded.length, 1);
  assert.equal(rounded[0].kind, "ext");
  assert.equal(rounded[0].from, 0);
  assert.equal(rounded[0].to, 30);
  assert.ok(rounded[0].pts.length > 6, "an arc adds points where the sharp corner was");
  assert.ok(!rounded[0].pts.some((q) => Math.abs(q.u - 10) < 1e-9 && Math.abs(q.v - 6) < 1e-9), "the sharp corner is gone");
  rounded[0].pts.forEach((q) => {
    assert.ok(q.u <= 10 + 1e-9 && q.v <= 6 + 1e-9, "the round stays inside the original corner");
  });

  const cut = approximateFinishPreviewShapes({ part: BOX, type: "chamfer", amount: 3, targets });
  assert.equal(cut[0].pts.length, 5, "one corner becomes two points");
});

test("several picked edges are all rounded, in one preview body", () => {
  const entries = topologyFor("box", BOX_PARAMS);
  const targets = refsBySemantic(entries, "edge", ["y:right:front", "y:left:front", "y:left:back", "y:right:back"]);
  const shapes = approximateFinishPreviewShapes({ part: BOX, type: "fillet", amount: 2, targets });
  assert.equal(shapes.length, 1);
  assert.ok(shapes[0].pts.length >= 4 * 3, "every corner grew an arc");
});

test("shell previews a wall of the asked thickness with an open picked face", () => {
  const entries = topologyFor("box", BOX_PARAMS);
  const top = refsBySemantic(entries, "face", ["top"]);
  const profile = finishProfileForPart(BOX);
  assert.equal(capEndForFace(profile, top[0]), "hi");

  const shapes = approximateFinishPreviewShapes({ part: BOX, type: "shell", amount: 1.5, targets: top });
  assert.equal(shapes.length, 2, "the wall loop plus the floor the open top leaves behind");
  const wall = shapes[0];
  assert.equal(wall.holes.length, 1);
  const inner = wall.holes[0];
  assert.equal(inner.length, 4);
  inner.forEach((q) => {
    assert.ok(Math.abs(Math.abs(q.u) - 8.5) < 1e-6, "inset by the thickness in u");
    assert.ok(Math.abs(Math.abs(q.v) - 4.5) < 1e-6, "inset by the thickness in v");
  });
  const floor = shapes[1];
  assert.equal(floor.from, 0);
  assert.equal(floor.to, 1.5, "the floor is at the closed end");
  assert.equal((floor.holes || []).length, 0);
});

test("a thickness the body cannot hold previews nothing rather than a bad body", () => {
  const entries = topologyFor("box", BOX_PARAMS);
  const top = refsBySemantic(entries, "face", ["top"]);
  assert.deepEqual(approximateFinishPreviewShapes({ part: BOX, type: "shell", amount: 40, targets: top }), []);
});

test("a cylinder rim rounds in its revolved half-section", () => {
  const cylinder = { id: "c", kind: "cyl", x: 0, y: 0, z: 0, r: 8, h: 20 };
  const entries = topologyFor("cylinder", { x: 0, y: 0, z: 0, r: 8, h: 20 });
  const targets = refsBySemantic(entries, "edge", ["top-rim"]);
  const shapes = approximateFinishPreviewShapes({ part: cylinder, type: "fillet", amount: 2, targets });
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].kind, "rev");
  assert.ok(shapes[0].pts.length > 4, "the top-right corner of the section became an arc");
  assert.ok(shapes[0].pts.every((q) => q.u <= 8 + 1e-9 && q.v <= 20 + 1e-9));

  // a cone has no straight section corner in this representation
  assert.deepEqual(approximateFinishPreviewShapes({
    part: { id: "c2", kind: "cyl", x: 0, y: 0, z: 0, r: 8, r2: 3, h: 20 }, type: "fillet", amount: 2, targets,
  }), []);
});

test("an extruded profile is previewed through its own depth edges", () => {
  const points = [{ u: 0, v: 0 }, { u: 20, v: 0 }, { u: 20, v: 12 }, { u: 0, v: 12 }];
  const part = { id: "e", kind: "ext", axis: "z", from: 0, to: 5, pts: points };
  const entries = topologyFor("extrude", { axis: "z", from: 0, to: 5, points });
  const depth = entries.filter((item) => item.kind === "edge" && /depth/.test(item.semantic))
    .map((item) => ({ kind: item.kind, persistentId: item.persistentId, descriptor: item.descriptor }));
  assert.ok(depth.length, "the extrude generator names its depth edges");
  const shapes = approximateFinishPreviewShapes({ part, type: "chamfer", amount: 2, targets: [depth[0]] });
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].axis, "z");
  assert.equal(shapes[0].pts.length, 5);
});

test("nothing to work with previews nothing, and never throws", () => {
  const entries = topologyFor("box", BOX_PARAMS);
  const targets = refsBySemantic(entries, "edge", ["y:right:front"]);
  assert.deepEqual(approximateFinishPreviewShapes({}), []);
  assert.deepEqual(approximateFinishPreviewShapes({ part: BOX, type: "fillet", amount: 0, targets }), []);
  assert.deepEqual(approximateFinishPreviewShapes({ part: BOX, type: "fillet", amount: NaN, targets }), []);
  assert.deepEqual(approximateFinishPreviewShapes({ part: BOX, type: "extrude", amount: 2, targets }), []);
  assert.deepEqual(approximateFinishPreviewShapes({ part: BOX, type: "fillet", amount: 2, targets: [] }), []);
  assert.deepEqual(approximateFinishPreviewShapes({ part: { kind: "sph", r: 4 }, type: "fillet", amount: 2, targets }), []);
});

test("the 2D corner operators have exactly one implementation", () => {
  assert.doesNotMatch(modeler, /^function (filletVertex|chamferVertex|insetLoop|pointInPoly)\(/m);
  assert.match(modeler, /import \{[^}]*filletVertex[^}]*\} from "\.\/modeler_finish_preview\.js"/);
  // the sketch corner tools still reach them through the module
  assert.match(modeler, /chamferVertex\(points, index, amount\) : filletVertex\(points, index, amount\)/);

  const pts = [{ u: 0, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 10 }, { u: 0, v: 10 }];
  const rounded = pts.slice();
  assert.equal(filletVertex(rounded, 1, 2), true);
  assert.ok(rounded.length > 4);
  const cut = pts.slice();
  assert.equal(chamferVertex(cut, 1, 2), true);
  assert.equal(cut.length, 5);
  assert.equal(insetLoop(pts.slice(), 20), null, "an inset that swallows the loop is refused");
});

test("the finish preview is wired through the preview mechanism that already exists", () => {
  assert.match(modeler, /function approximateFinishPreviewParts\(type,state,source\)/);
  assert.match(modeler, /approximateFinishPreviewShapes\(\{part:source,type:type,amount:amount,targets:finishFeatureTargets\(type\)\}\)/);
  // it feeds E.authoring.previewParts, the same channel every other feature uses
  assert.match(modeler, /if\(approximate\.length\)previews\.push\.apply\(previews,approximate\);/);
  assert.match(modeler, /else previews\.push\(finish\);/);
  // and the source body is still replaced, so the ghost is not a second coincident body
  assert.match(modeler, /E\.authoring\.previewReplacesPartId=finish\.id;/);
  // a failure in the approximation degrades to no preview, it does not throw on a frame
  assert.match(modeler, /console\.warn\("approximate finish preview failed:",error\);\n\s*return \[\];/);
});

test("an approximate preview does not claim the views are synced", () => {
  assert.match(modelerStrings, /liveApproxPreview:\s*\["[^"]+",\s*"Approximate preview[^"]*"\]/);
  assert.match(modelerStrings, /approxPreviewName:\s*\["[^"]+\{feature\}",\s*"Approximate \{feature\}"\]/);
  // one whole sentence per key: the feature name is substituted in, not concatenated
  assert.match(modeler, /name:tf\("approxPreviewName",\{feature:featureTypeLabel\(type\)\}\)/);
  // the badge picks its wording from whether an approximation is on screen
  assert.match(modeler, /var approximate=!!\(E\.authoring && E\.authoring\.approxFinishPreview\);/);
  assert.match(modeler, /liveBadge\.setAttribute\("data-preview-state",approximate\?"approximate":"calculating"\)/);
  assert.match(modeler, /t\("liveApproxPreview"\)/);
  // liveViewsSynced remains the claim only the exact-and-synced path makes
  const synced = modeler.slice(modeler.indexOf("function queueNewFeaturePreview"));
  assert.match(synced.slice(0, synced.indexOf("\n}")), /!FINISH_FEATURES\.includes\(type\)/);
  // and that list is the finish features themselves, draft and thicken included
  assert.match(modeler, /var FINISH_FEATURES = \["fillet", "chamfer", "shell", "dome", "draft", "thicken"\];/);
  assert.match(modeler, /liveBadge\.setAttribute\("data-preview-state","exact"\)/);
});

test("live feature preview does not rebuild the parametric document", () => {
  const queueAt = modeler.indexOf("function queueNewFeaturePreview");
  const queue = modeler.slice(queueAt, queueAt + 900);
  assert.match(queue, /refreshLivePreview\(\)/);
  assert.doesNotMatch(queue, /refreshAll\(\)/);
  const liveAt = modeler.indexOf("function refreshLivePreview()");
  assert.ok(liveAt >= 0, "refreshLivePreview exists");
  const live = modeler.slice(liveAt, modeler.indexOf("\nfunction updatePreview()", liveAt));
  assert.doesNotMatch(live, /rebuildParametricDocument|fillInspector|refreshParts\(/);
  assert.match(live, /patchLivePreviewLayer\(\)/);
  assert.match(live, /patchEditedFeatureLayer\(\)/, "editing a history feature patches that body, it does not dispose the scene");
  assert.match(modeler, /E\.pv\.liveGrp = live/);
  assert.match(modeler, /committedRenderedParts\(E\.def\)/);
  const edges = modeler.slice(modeler.indexOf("function setFinishEdges"), modeler.indexOf("\nfunction toggleFinishEdges"));
  assert.match(edges, /queueNewFeaturePreview/);
  assert.match(edges, /return;/);
});

/* WHAT a live ghost shares with its seed is a behavioural claim and lives in
   tests/live_preview.browser.mjs, which reads object identity off a real ghost
   and the seed's vertices off a real document. This only pins that the ghost
   goes through the one helper, and that the helper copies the buffer movePart()
   writes into — sharing positions translated the SEED's committed geometry once
   per ghost per keystroke. */
test("a live pattern ghost goes through the one clone helper", () => {
  assert.match(modeler, /function clonePartForLivePreview\(/);
  assert.match(modeler, /function clonePartWithoutTessellationCopy\(/);
  const preview = modeler.slice(modeler.indexOf("function syncNewFeaturePreview"), modeler.indexOf("\nfunction syncPatternOverlapBadge"));
  assert.match(preview, /clonePartForLivePreview\(seed\)/);
  assert.doesNotMatch(preview, /cloneData\(seed\)/);
  const clone = modeler.match(/function clonedPartMeshData\(mesh\)[\s\S]*?\n\}\n/)[0];
  assert.match(clone, /positions: \(mesh\.positions \|\| \[\]\)\.slice\(\)/, "movePart adds dx/dy/dz straight into this array");
  assert.doesNotMatch(clone, /normals:|colors:/, "the big immutable buffers ride by reference — that is the whole win");
  const exact = modeler.match(/function queueExactMesh\(p\)[\s\S]*?\n\}\n/)[0];
  assert.match(exact, /refreshChangedPart\(p\)/);
  assert.doesNotMatch(exact, /updatePreview\(\)/);
});

/* The two-tier live DOWNSTREAM refresh. WHAT it does — an analytic feature
   following on the tick, a kernel-backed one debounced and declared stale — is
   behavioural and lives in tests/live_preview.browser.mjs. What is pinned here
   is the SHAPE: no fixed-rate timer, and no second scheduler alongside the
   merged-pattern one. A 5-per-second tick was the tempting answer and it is
   wrong in both directions — too slow for the mesh tier to feel connected, and
   still fast enough to queue OpenCascade runs faster than they finish. */
test("downstream refresh debounces on the existing token, it does not add a timer", () => {
  const sync = modeler.match(/function syncLiveDownstream\(feature\)[\s\S]*?\n\}\n/)[0];
  assert.match(sync, /featureRebuildNeedsKernel\(item\)\?heavy:cheap/, "the split is made once, by cost");
  assert.match(sync, /cheap\.forEach\(function\(item\)\{syncProjectionFromFeature\(item\);\}\)/, "the cheap tier runs on the tick");
  assert.match(sync, /E\._featurePreviewToken=token/, "and the heavy tier rides the token the merged-pattern preview already uses");
  assert.match(sync, /PATTERN_MERGE_PREVIEW_DELAY/, "with its delay, not a second constant");
  assert.doesNotMatch(sync, /setInterval|requestAnimationFrame/, "no fixed-rate timer");
  assert.doesNotMatch(modeler, /setInterval\([^)]*[Dd]ownstream/);

  // a superseded run is dropped BEFORE it touches the scene, not after
  const run = modeler.match(/function runLiveDownstream\(features,token\)[\s\S]*?\n\}\n/)[0];
  assert.match(run, /^\s*\/\/[^\n]*\n\s*if\(!liveDownstreamIsLive\(token\)\)return;\s*\n\s*features\.forEach/m);

  // Apply and Cancel still do the full refresh
  const cancel = modeler.match(/function cancelFeatureParameterEdit\(silent\)[\s\S]*?\n\}\n/)[0];
  assert.match(cancel, /refreshAll\(\)/);
});

test("both Hebrew and English are present for every new preview string", () => {
  ["liveApproxPreview", "approxPreviewName",
   "liveDownstreamCalc", "liveDownstreamReady", "liveDownstreamFailed"].forEach((key) => {
    const line = modelerStrings.split("\n").find((row) => row.trim().startsWith(key + ":"));
    assert.ok(line, "missing key " + key);
    const pair = line.match(/\["([^"]+)",\s*"([^"]+)"\]/);
    assert.ok(pair, "key " + key + " is not a [he, en] pair");
    assert.match(pair[1], /[֐-׿]/, key + " has no Hebrew string");
    assert.match(pair[2], /[A-Za-z]/, key + " has no English string");
  });
});

test("closing the feature form tears the preview down", () => {
  const close = modeler.slice(modeler.indexOf("function closeFeaturePanel()"));
  const body = close.slice(0, close.indexOf("\n}\n"));
  assert.match(body, /clearFeaturePreview\(false\);/);
  assert.match(body, /updatePreview\(\);/);
  // syncCommandManager still owns the button state, and stays last
  assert.ok(body.indexOf("clearFeaturePreview") < body.indexOf("syncCommandManager"));
  // and clearing drops both halves of the finish preview
  assert.match(modeler, /E\.authoring\.approxFinishPreview=null;E\.authoring\.pendingExactPreview=null;/);
});

test("the exact result replaces the approximation instead of stacking on it", () => {
  assert.match(modeler, /function adoptExactFinishPreview\(preview\)/);
  assert.match(modeler, /if\(!\(E\.authoring\.previewParts \|\| \[\]\)\.includes\(preview\)\)E\.authoring\.previewParts=\[preview\];/);
  assert.match(modeler, /function finishPreviewIsLive\(preview\)/);
  assert.match(modeler, /token!==E\._featurePreviewToken \|\| !E\.authoring \|\| !finishPreviewIsLive\(preview\)/);
  // a kernel refusal takes the approximation away again
  assert.match(modeler, /if\(E\.authoring && E\.authoring\.approxFinishPreview\)\{adoptExactFinishPreview\(preview\);/);
});
