import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildTreeModel, flattenTree, findTreeNode, predictedBodies,
  friendlyTreeName, sketchOwnership, sketchReferenceIds, treeMode, CANONICAL, LEGACY,
} from "../js/core/tree_model.js";
import {
  analyzeLegacyMigration, boundsMatch, convertLegacyDocument,
  evaluateMigration, featureEditability, migrationGeometrySummary,
  retainLegacySource, restoreLegacyDocument,
} from "../js/core/migration_check.js";
import { bodiesFromResults, rebuildDefinition } from "../js/core/rebuild.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";

const legacyFixture = JSON.parse(await readFile(new URL("./fixtures/legacy_feature_manager.json", import.meta.url), "utf8"));

/* A canonical document: two features, the first consuming Sketch1 and the
   second consuming Sketch2. */
const canonicalDoc = () => ({
  metadata: { authoringSystem: "parametric-v1" },
  sketches: [
    { id: "s1", name: "Sketch1", referenceId: "plane:top", status: "fully-defined", entities: [{ id: "e1" }] },
    { id: "s2", name: "Sketch2", referenceId: "plane:front", status: "under-defined", entities: [{ id: "e2" }] },
  ],
  features: [
    { id: "f1", name: "Boss-Extrude1", type: "extrude", params: {}, inputs: [], references: { sketches: ["s1"] } },
    { id: "f2", name: "Cut-Extrude1", type: "extrudeCut", params: {}, inputs: ["f1"], references: { sketches: ["s2"] } },
  ],
  history: [
    { id: "h:s1", kind: "sketch", targetId: "s1" },
    { id: "h:f1", kind: "feature", targetId: "f1" },
    { id: "h:s2", kind: "sketch", targetId: "s2" },
    { id: "h:f2", kind: "feature", targetId: "f2" },
  ],
});

const legacyDoc = () => ({
  metadata: { authoringSystem: "legacy-adapter" },
  parts: [
    { id: "p1", name: "Base", kind: "box", x0: 0, x1: 10, y0: 0, y1: 4, z0: 0, z1: 6 },
    { id: "p2", name: "Post", kind: "cyl", x: 0, y: 0, z: 0, r: 2, h: 8 },
  ],
  sketches: [{ id: "ls", name: "Sketch1", plane: "top", entities: [{ id: "e1" }] }],
  rollback: null,
});

test("the mode is reported from the flag the editor already resolved, never re-derived", () => {
  assert.equal(treeMode(canonicalDoc()), CANONICAL);
  assert.equal(treeMode(legacyDoc()), LEGACY);
  // An explicit flag always wins: the tree and the rebuild engine cannot
  // disagree about what a document is.
  assert.equal(treeMode(canonicalDoc(), "legacy-adapter"), LEGACY);
});

test("a feature's sketch references are read from references.sketches and params.sketchId", () => {
  assert.deepEqual(sketchReferenceIds({ references: { sketches: ["s1"] } }), ["s1"]);
  assert.deepEqual(sketchReferenceIds({ params: { sketchId: "s9" } }), ["s9"]);
  assert.deepEqual(sketchReferenceIds({ references: { sketches: [{ id: "s1" }] }, params: { sketchId: "s1" } }), ["s1"]);
  // inputs are feature-to-feature and must never be mistaken for sketches
  assert.deepEqual(sketchReferenceIds({ inputs: ["f1"] }), []);
});

test("storage ids and duplicated generated suffixes are cleaned up for display", () => {
  assert.equal(friendlyTreeName("feature_mtehoax9_1", "Extrude / Boss"), "Extrude / Boss");
  assert.equal(friendlyTreeName("end sketch", "Sketch"), "End sketch");
  assert.equal(friendlyTreeName("Extrude / Boss 2 2", "Feature"), "Extrude / Boss 2");
  const doc = canonicalDoc();
  doc.sketches[0].name = "sketch_raw_123";
  const sketch = findTreeNode(buildTreeModel(doc, { definition: doc }).nodes, "sketch:s1");
  assert.equal(sketch.name, "Sketch");
  assert.equal(sketch.detail, "Top plane · fully defined");
  assert.match(sketch.technicalDetail, /s1/);
});

test("the first consumer in build order owns a sketch", () => {
  const owners = sketchOwnership(canonicalDoc());
  assert.equal(owners.get("s1").ownerId, "f1");
  assert.equal(owners.get("s1").shared, false);
  assert.equal(owners.get("s2").ownerId, "f2");
});

test("a sketch is drawn inside the feature that owns it, and loses its own row", () => {
  const model = buildTreeModel(canonicalDoc(), {});
  const history = findTreeNode(model.nodes, "section:history");
  assert.deepEqual(history.children.map((node) => node.id), ["feature:f1", "feature:f2"]);
  assert.deepEqual(history.children[0].children.map((node) => node.id), ["sketch:s1"]);
  assert.deepEqual(history.children[1].children.map((node) => node.id), ["sketch:s2"]);
});

test("a sketch used by two features keeps its own row instead of being hidden under one", () => {
  const doc = canonicalDoc();
  // Both features now cut regions out of Sketch1 — the sketch-regions case.
  doc.features[1].references.sketches = ["s1"];
  doc.history = doc.history.filter((entry) => entry.targetId !== "s2");
  const owners = sketchOwnership(doc);
  assert.equal(owners.get("s1").shared, true);
  assert.deepEqual(owners.get("s1").consumers, ["f1", "f2"]);
  const history = findTreeNode(buildTreeModel(doc, {}).nodes, "section:history");
  assert.deepEqual(history.children.map((node) => node.id), ["sketch:s1", "feature:f1", "feature:f2"]);
  assert.equal(findTreeNode(history.children, "sketch:s1").shared, true);
  assert.equal(history.children[1].children.length, 0);
});

test("a legacy parts list reaches the same tree through the other adapter", () => {
  const model = buildTreeModel(legacyDoc(), {});
  assert.equal(model.mode, LEGACY);
  const history = findTreeNode(model.nodes, "section:history");
  assert.deepEqual(history.children.map((node) => node.name), ["Base", "Post"]);
  // The rows carry the same capabilities as canonical ones, which is what lets
  // one renderer serve both.
  assert.equal(history.children[0].can.rename, true);
  assert.equal(history.children[0].can.reorder, true);
  assert.equal(history.children[0].can.rollback, true);
  assert.ok(findTreeNode(model.nodes, "section:sketches"));
});

test("the rollback position is reported per document shape", () => {
  const legacy = legacyDoc();
  legacy.rollback = 1;
  assert.equal(buildTreeModel(legacy, {}).rollbackAt, 1);
  const model = buildTreeModel(canonicalDoc(), { rollbackIndex: 2 });
  assert.equal(model.rollbackAt, 2);
  const history = findTreeNode(model.nodes, "section:history");
  assert.equal(history.children[1].rolled, true);
});

test("bodies answer what exists, not how it was built", () => {
  // f2 consumes f1, so only f2 stands.
  assert.deepEqual(predictedBodies(canonicalDoc()).map((body) => body.featureId), ["f2"]);
  // A legacy document has no feature graph; each standing part is a body.
  assert.deepEqual(predictedBodies(legacyDoc()).map((body) => body.name), ["Base", "Post"]);
  const rolled = legacyDoc();
  rolled.rollback = 1;
  assert.deepEqual(predictedBodies(rolled).map((body) => body.name), ["Base"]);
  const section = findTreeNode(buildTreeModel(canonicalDoc(), {}).nodes, "section:bodies");
  assert.match(section.name, /\(1\)$/);
});

test("a published body set is preferred over the predicted one", () => {
  const model = buildTreeModel(canonicalDoc(), {
    bodies: [{ id: "body:f2", featureId: "f2", name: "Imported Body" }],
  });
  const section = findTreeNode(model.nodes, "section:bodies");
  assert.equal(section.children[0].name, "Imported Body");
  // A real body may be renamed; a predicted one has no identity to rename.
  assert.equal(section.children[0].can.rename, true);
  assert.equal(findTreeNode(buildTreeModel(canonicalDoc(), {}).nodes, "section:bodies").children[0].can.rename, false);
});

test("the rebuild publishes bodies keyed by the feature that last shaped them", () => {
  const definition = { features: canonicalDoc().features };
  const results = new Map([
    ["f1", { kind: "feature", type: "extrude", name: "Boss-Extrude1" }],
    ["f2", { kind: "feature", type: "extrudeCut", name: "Cut-Extrude1" }],
  ]);
  assert.deepEqual(bodiesFromResults(definition, results), [
    { id: "body:f2", featureId: "f2", name: "Cut-Extrude1", type: "extrudeCut", index: 0 },
  ]);
  // A sketch result is a profile, never a body.
  assert.deepEqual(bodiesFromResults({ features: [{ id: "s", type: "sketch", inputs: [] }] },
    new Map([["s", { kind: "sketch" }]])), []);
});

test("a body node's id is the body's id, so hiding one actually matches it", () => {
  // Prefixing "body:" onto an id that already carried it produced
  // "body:body:f2" in the tree while the hidden set and the draw filter both
  // spoke "body:f2" — the eye toggled state nothing ever compared against.
  const predicted = findTreeNode(buildTreeModel(canonicalDoc(), {}).nodes, "section:bodies");
  assert.equal(predicted.children[0].id, "body:f2");
  const published = findTreeNode(buildTreeModel(canonicalDoc(), {
    bodies: [{ id: "body:f2", featureId: "f2", name: "Cut-Extrude1" }],
  }).nodes, "section:bodies");
  assert.equal(published.children[0].id, "body:f2");
  // A hidden body reads back as hidden, which is what greys the row.
  const hidden = findTreeNode(buildTreeModel(canonicalDoc(), { hiddenBodies: ["body:f2"] }).nodes, "section:bodies");
  assert.equal(hidden.children[0].suppressed, true);
  assert.equal(predicted.children[0].suppressed, false);
});

test("equations and material are reported as document nodes", () => {
  const doc = canonicalDoc();
  doc.parameters = { width: { value: 10 }, depth: { expression: "width / 2" } };
  const metadata = findTreeNode(buildTreeModel(doc, {}).nodes, "section:metadata");
  const equations = findTreeNode(metadata.children, "meta:equations");
  assert.equal(equations.children.length, 2);
  assert.equal(findTreeNode(equations.children, "meta:equation:depth").detail, "width / 2");
  assert.ok(findTreeNode(metadata.children, "meta:material"));
});

test("a folder groups history rows without reordering the build", () => {
  const doc = canonicalDoc();
  const model = buildTreeModel(doc, { folders: [{ id: "g1", name: "Mounting", memberIds: ["f1", "f2"] }] });
  const history = findTreeNode(model.nodes, "section:history");
  assert.deepEqual(history.children.map((node) => node.kind), ["folder"]);
  assert.deepEqual(history.children[0].children.map((node) => node.targetId), ["f1", "f2"]);
  assert.equal(history.children[0].detail, "2");
  // The document itself is untouched — folders are presentation only.
  assert.deepEqual(doc.history.map((entry) => entry.targetId), ["s1", "f1", "s2", "f2"]);
});

test("collapse state hides children from navigation as well as from the page", () => {
  const model = buildTreeModel(canonicalDoc(), { collapsed: { "section:history": true } });
  const visible = flattenTree(model.nodes).map((entry) => entry.node.id);
  assert.ok(visible.includes("section:history"));
  assert.ok(!visible.includes("feature:f1"));
});

/* ---- the migration gate ---- */

test("a primitive-built legacy document is refused, with the reason", () => {
  const analysis = analyzeLegacyMigration(legacyDoc());
  assert.equal(analysis.ok, false);
  assert.equal(analysis.convertible, 0);
  assert.equal(analysis.blockers[0].code, "unconvertible-part-kind");
  assert.match(analysis.blockers[0].message, /no box feature/);
  assert.equal(convertLegacyDocument(legacyDoc()).ok, false);
});

test("a sketch-driven legacy document converts, and keeps its build order", () => {
  const doc = {
    metadata: { authoringSystem: "legacy-adapter" },
    sketches: [{ id: "ls", name: "Sketch1", plane: "top", entities: [] }],
    parts: [
      { id: "p1", name: "Boss", kind: "ext", sketchId: "ls", profileEntityIds: ["e1"], from: 0, to: 12, axis: "y" },
      { id: "p2", name: "Hub", kind: "rev", pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 5 }], angle: 360 },
    ],
  };
  const analysis = analyzeLegacyMigration(doc);
  assert.equal(analysis.ok, true, JSON.stringify(analysis.blockers));
  const conversion = convertLegacyDocument(doc);
  assert.equal(conversion.ok, true);
  assert.deepEqual(conversion.document.features.map((feature) => feature.type), ["extrude", "revolve"]);
  assert.equal(conversion.document.features[0].params.depth, 12);
  assert.deepEqual(conversion.document.history.map((entry) => entry.kind), ["sketch", "feature", "feature"]);
  assert.equal(conversion.document.metadata.authoringSystem, "parametric-v1");
  // The source is never mutated by the trial conversion.
  assert.equal(doc.metadata.authoringSystem, "legacy-adapter");
  assert.equal(doc.features, undefined);
});

test("every converted feature must have an editor, or the conversion is refused", () => {
  assert.equal(featureEditability([{ id: "a", type: "extrude" }]).ok, true);
  const coverage = featureEditability([{ id: "b", type: "box", name: "Base" }]);
  assert.equal(coverage.ok, false);
  assert.deepEqual(coverage.uneditable.map((entry) => entry.type), ["box"]);
  const verdict = evaluateMigration({
    canonicalRun: { ok: true, document: { features: [{ id: "b", type: "box", name: "Base" }] } },
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons[0].code, "uneditable-feature");
});

test("geometry that does not match after conversion leaves the document alone", () => {
  const a = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 6 } };
  const b = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 6 } };
  assert.equal(boundsMatch(a, b).ok, true);
  const drifted = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4.5, z: 6 } };
  assert.equal(boundsMatch(a, drifted).ok, false);
  const verdict = evaluateMigration({
    analysis: { ok: true, blockers: [] },
    legacyRun: { ok: true, bounds: a },
    canonicalRun: { ok: true, bounds: drifted, document: { features: [] } },
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reasons[0].code, "geometry-differs");
});

test("a healthy, matching conversion passes both gates", () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 4, z: 6 } };
  const verdict = evaluateMigration({
    analysis: { ok: true, blockers: [] },
    legacyRun: { ok: true, bounds },
    canonicalRun: { ok: true, bounds, document: { features: [{ id: "f", type: "extrude", name: "Boss" }] } },
  });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.reasons));
});

test("the seeded legacy fixture passes both engines and all geometry gates", () => {
  const source = structuredClone(legacyFixture);
  const conversion = convertLegacyDocument(source);
  assert.equal(conversion.ok, true, JSON.stringify(conversion.analysis.blockers));
  const legacyRun = rebuildDefinition(structuredClone(source));
  const canonicalRun = rebuildParametricDocument(conversion.document);
  const verdict = evaluateMigration({
    analysis: conversion.analysis,
    legacyDocument: source,
    legacyRun,
    canonicalRun,
  });
  assert.equal(legacyRun.ok, true, JSON.stringify(legacyRun.issues));
  assert.equal(canonicalRun.ok, true, JSON.stringify(canonicalRun.issues));
  assert.equal(verdict.ok, true, JSON.stringify(verdict.reasons));
  assert.equal(verdict.geometry.legacy.bodyCount, 2);
  assert.equal(verdict.geometry.legacy.volume, 252);
  assert.equal(verdict.geometry.legacy.fingerprint, verdict.geometry.canonical.fingerprint);
});

test("same outer bounds cannot hide a changed profile or volume", () => {
  const source = structuredClone(legacyFixture);
  const conversion = convertLegacyDocument(source);
  const canonicalRun = rebuildParametricDocument(conversion.document);
  // Move one profile edge inward while keeping the overall document bounds
  // fixed through the untouched body. A bounds-only gate accepted this class
  // of change; the effective feature fingerprint and volume must not.
  const changedPad = canonicalRun.core.resultList.find((result) => result.type === "extrude");
  changedPad.params.points[1].u = -3;
  changedPad.params.points[2].u = -3;
  const legacySummary = migrationGeometrySummary(source, "legacy");
  const changedSummary = migrationGeometrySummary(canonicalRun, "canonical");
  assert.deepEqual(legacySummary.bounds, changedSummary.bounds);
  assert.notEqual(legacySummary.volume, changedSummary.volume);
  assert.notEqual(legacySummary.fingerprint, changedSummary.fingerprint);
  const verdict = evaluateMigration({ legacyDocument:source, canonicalRun });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reasons.some((reason) => reason.code === "volume-differs"));
  assert.ok(verdict.reasons.some((reason) => reason.code === "geometry-fingerprint-differs"));
});

test("the complete legacy document survives save/reload and restores exactly", () => {
  const source = structuredClone(legacyFixture);
  const conversion = convertLegacyDocument(source);
  const migrated = retainLegacySource(conversion.document, source, {
    migratedAt: 42,
    verification: { fixture:true },
  });
  assert.deepEqual(migrated.legacySource, source);
  assert.equal(migrated.legacySource.customPayload.note, source.customPayload.note);
  assert.equal(migrated.legacySource.sketches.length, 2);
  const reloaded = JSON.parse(JSON.stringify(migrated));
  const restored = restoreLegacyDocument(reloaded);
  assert.deepEqual(restored, source);
  assert.equal(restored.metadata.authoringSystem, "legacy-adapter");
  assert.equal(restored.legacySource, undefined);
});

test("migration blocks modifiers and revolve placements it cannot preserve", () => {
  const modified = structuredClone(legacyFixture);
  modified.parts[0].exactOperations = [{ id:"finish", type:"fillet", amount:1, suppressed:false }];
  assert.ok(analyzeLegacyMigration(modified).blockers.some((blocker) => blocker.code === "unsupported-legacy-modifier"));
  const offsetRevolve = {
    metadata:{authoringSystem:"legacy-adapter"},
    parts:[{id:"rev",kind:"rev",x:5,z:0,angle:360,pts:[{u:0,v:0},{u:2,v:0},{u:2,v:4}]}],
  };
  assert.ok(analyzeLegacyMigration(offsetRevolve).blockers.some((blocker) => blocker.code === "unsupported-revolve-placement"));
});

test("legacy rollback is mapped past the matching feature and its sketch", () => {
  const source = structuredClone(legacyFixture);
  source.rollback = 1;
  const conversion = convertLegacyDocument(source);
  assert.equal(conversion.ok, true);
  assert.deepEqual(conversion.document.history.slice(0, conversion.document.rollbackIndex).map((entry) => entry.targetId), [
    "sketch:legacy:left", "feature:legacy:left",
  ]);
  const run = rebuildParametricDocument(conversion.document);
  assert.equal(run.ok, true, JSON.stringify(run.issues));
  assert.deepEqual(run.bodies.map((body) => body.featureId), ["feature:legacy:left"]);
});

/* ---- the editor actually uses the one renderer ---- */

const modelerSource = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../js/modeler_tree.js", import.meta.url), "utf8");
const styles = await readFile(new URL("../css/styles.css", import.meta.url), "utf8");

test("both document shapes are drawn by the same renderer", () => {
  assert.match(modelerSource, /function buildParametricHistoryTree/);
  assert.match(modelerSource, /function buildLegacyTree/);
  // Each is a thin adapter around one call — that is what makes it one tree.
  assert.equal(modelerSource.match(/^ +renderFeatureManagerTree\(host\);$/gm).length, 2);
  assert.match(modelerSource, /renderTreeModel\(mount, model, treeDeps\(\), treeHandlers\(model\)/);
  // The old second tree is gone rather than left behind as dead code.
  assert.doesNotMatch(modelerSource, /function buildFeatureTree\(/);
  assert.doesNotMatch(modelerSource, /function buildSketchList\(/);
});

test("the renderer carries rename, keyboard navigation, drag and a context menu", () => {
  assert.match(rendererSource, /export function beginRename/);
  assert.match(rendererSource, /event\.key === "F2"/);
  assert.match(rendererSource, /event\.key === "ArrowDown"/);
  assert.match(rendererSource, /row\.draggable = true/);
  assert.match(rendererSource, /contextmenu/);
  assert.match(rendererSource, /role", "tree/);
  assert.match(rendererSource, /let rollbackEmitted = false/);
  assert.match(rendererSource, /if \(rollbackEmitted\) return/);
});

/* The eye hides what is drawn on a body or a component, and stops a feature or
   a mate acting. One verb for all four would promise the wrong thing on half
   of them. */
test("the eye says Hide on a body or component and Suppress on a feature", () => {
  assert.match(rendererSource, /node\.kind === "body" \|\| node\.kind === "component"/);
  assert.match(rendererSource, /node\.kind === "component" \? "treeShowComponent" : "treeShow"/);
  assert.match(rendererSource, /node\.kind === "component" \? "treeHideComponent" : "treeHide"/);
  assert.match(rendererSource, /: deps\.t\(node\.suppressed \? "unsuppress" : "suppress"\)/);
  for (const key of ["treeHide", "treeShow", "treeHideComponent", "treeShowComponent"]) {
    assert.match(modelerSource, new RegExp(key + ": \\["), key + " has no wording");
  }
});

test("focus decides which row the keyboard acts on", () => {
  // Tracking the active row on click alone let focus and activeId drift, so F2
  // renamed whichever row was last clicked — on a fresh tree, a section header
  // that cannot be renamed, which made the key look dead.
  assert.match(rendererSource, /row\.addEventListener\("focusin", \(\) => \{ state\.activeId = node\.id; \}\)/);
});

test("hiding a body leaves it built, exported and weighed", () => {
  assert.match(modelerSource, /function hiddenBodyPart/);
  // The filter sits in the draw path only. Putting it in activeParts would make
  // the eye on a body row quietly change what the document builds, which is
  // suppression wearing a hide icon.
  assert.match(modelerSource, /if\(def===E\.def\) parts=parts\.filter\(function\(part\)\{return !hiddenBodyPart\(part\);\}\);/);
  const activeParts = modelerSource.slice(
    modelerSource.indexOf("function activeParts"),
    modelerSource.indexOf("function hiddenBodyPart"));
  assert.doesNotMatch(activeParts, /hiddenBodies/);
  // Per-document state, cleared when a different model is opened.
  assert.match(modelerSource, /E\.hiddenBodies = \[\];/);
});

test("a folder is created open, so grouping does not read as deleting", () => {
  assert.match(modelerSource, /treeCollapseState\(\)\["folder:" \+ id\] = false/);
});

test("conversion is offered and gated, never applied on load", () => {
  assert.match(modelerSource, /function renderMigrationOffer/);
  assert.match(modelerSource, /function runVerifiedMigration/);
  assert.match(modelerSource, /evaluateMigration\(/);
  // Both engines run before anything is adopted, and the original is retained.
  assert.match(modelerSource, /legacyRun = rebuildDefinition\(cloneData\(E\.def\)/);
  assert.match(modelerSource, /canonicalRun = rebuildParametricDocument\(conversion\.document/);
  assert.match(modelerSource, /retainLegacySource\(conversion\.document, E\.def/);
  assert.match(modelerSource, /function restoreLegacySource/);
  assert.match(modelerSource, /restoreLegacyDocument\(E\.def\)/);
  // openModeler must not convert anything while opening a document.
  const openModeler = modelerSource.slice(modelerSource.indexOf("export function openModeler"));
  assert.doesNotMatch(openModeler.slice(0, 4000), /convertLegacyDocument/);
});

test("the tree indents by depth rather than by nesting containers", () => {
  assert.match(styles, /--md-tree-indent/);
  assert.match(rendererSource, /depth \* 13/);
  assert.match(styles, /#modeler \.md-tree-menu \{/);
  assert.match(styles, /#modeler \.md-tree-rename \{/);
});
