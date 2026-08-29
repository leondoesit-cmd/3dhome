/* Regressions from a hard QA pass over the model editor, driving the awkward
   multi-step workflows the existing suites do not: the rollback bar dragged
   above a feature that consumes an earlier one, and a named configuration
   switched on a document whose steps are suppressed through the history.

   Each test pins the user-visible symptom, not the implementation. */
import test from "node:test";
import assert from "node:assert/strict";

import {
  activeHistoryTargetIds, applyHistoryToPreviewParts, createFeatureDefinition,
  createPartDocument, createSketchDefinition, setHistoryRollback, suppressHistoryNode,
} from "../js/core/parametric_document.js";
import { rebuildParametricDocument } from "../js/core/parametric_rebuild.js";
import { bodiesFromResults } from "../js/core/rebuild.js";
import { buildTreeModel, predictedBodies } from "../js/core/tree_model.js";
import {
  applyConfiguration, captureConfiguration, createConfiguration, ensureConfigurations,
  setActiveConfiguration,
} from "../js/cad_configurations.js";

/* A block with a hole through it: the smallest document in which one step
   consumes another, which is what the rollback bar has to survive. */
function blockWithHole() {
  const document = createPartDocument({ id: "part:hard-qa" });
  const profile = createSketchDefinition(document, {
    id: "sketch:base", name: "Base profile", referenceId: "plane:top",
    points: [
      { id: "p0", x: 0, y: 0, fixed: true }, { id: "p1", x: 40, y: 0, fixed: true },
      { id: "p2", x: 40, y: 20, fixed: true }, { id: "p3", x: 0, y: 20, fixed: true },
    ],
    entities: [
      { id: "e0", type: "line", a: "p0", b: "p1" }, { id: "e1", type: "line", a: "p1", b: "p2" },
      { id: "e2", type: "line", a: "p2", b: "p3" }, { id: "e3", type: "line", a: "p3", b: "p0" },
    ],
    constraints: [],
  });
  const base = createFeatureDefinition(document, "extrude", {
    id: "feature:base",
    references: { sketches: [profile.id], features: [], topology: [], references: [] },
    params: { depth: 20, profileEntityIds: ["e0", "e1", "e2", "e3"] },
  });
  const bore = createSketchDefinition(document, {
    id: "sketch:hole", name: "Hole", referenceId: "plane:top",
    points: [{ id: "hc", x: 20, y: 10, fixed: true }],
    entities: [{ id: "circle", type: "circle", c: "hc", r: 3, fixed: true }],
  });
  const cut = createFeatureDefinition(document, "extrudeCut", {
    id: "feature:cut", inputs: [base.id],
    references: { sketches: [bore.id], features: [base.id], topology: [], references: [] },
    params: { endCondition: "through-all", depth: 30, profileEntityIds: ["circle"] },
  });
  return { document, profile, base, bore, cut };
}

test("rolling back above a cut leaves the block it was cut from standing", () => {
  /* The body set is read off the authoring features, and a cut records the
     extrude it consumes. Below the bar the cut never runs — but it still
     counted as that extrude's consumer, so the one body the rolled-back model
     DOES have was reported as consumed by a step that is not there, and the
     Solid Bodies folder emptied the moment the bar moved. */
  const { document, base } = blockWithHole();
  assert.equal(rebuildParametricDocument(document).bodies.length, 1);

  setHistoryRollback(document, 2); // sketch + extrude live, hole rolled away
  const rolled = rebuildParametricDocument(document);
  assert.equal(rolled.ok, true);
  assert.deepEqual(rolled.bodies.map((body) => body.featureId), [base.id],
    "the block is still a body with the hole rolled away");

  setHistoryRollback(document, 0);
  assert.equal(rebuildParametricDocument(document).bodies.length, 0,
    "and a document rolled to the top has nothing standing");

  setHistoryRollback(document, null);
  assert.deepEqual(rebuildParametricDocument(document).bodies.map((body) => body.featureId),
    ["feature:cut"], "releasing the bar returns the cut body");
});

test("a step the rebuild never reached is not a consumer", () => {
  // the unit underneath: only results that exist may consume anything
  const definition = {
    features: [
      { id: "f1", type: "extrude", inputs: [] },
      { id: "f2", type: "extrudeCut", inputs: ["f1"] },
    ],
  };
  const results = new Map([["f1", { kind: "feature", type: "extrude", name: "Boss" }]]);
  assert.deepEqual(bodiesFromResults(definition, results).map((body) => body.featureId), ["f1"]);
});

test("the tree predicts the bodies of the rolled-back model, not of the whole one", () => {
  /* Before a rebuild publishes anything the tree predicts the body set from the
     feature graph. It read the graph whole, so with the bar set it offered the
     eye and the rename on bodies the rolled-back model does not have. */
  const { document } = blockWithHole();
  setHistoryRollback(document, 2);
  assert.deepEqual(predictedBodies(document).map((body) => body.featureId), ["feature:base"]);

  const section = buildTreeModel(document, { rollbackIndex: 2 }).nodes
    .find((node) => node.id === "section:bodies");
  assert.match(section.name, /\(1\)$/);

  setHistoryRollback(document, 0);
  assert.deepEqual(predictedBodies(document), []);
});

test("switching configuration changes what is drawn, not only what is flagged", () => {
  /* Suppression is read off the HISTORY entry — the compiled tree, the preview
     parts the viewport draws and the tree row all consult it. A configuration
     wrote only the feature, so switching to one that removes the boss left the
     boss on screen and the tree row unmarked. */
  const { document, cut } = blockWithHole();
  document.parts = [
    { id: "part:base", featureId: "feature:base" },
    { id: "part:cut", featureId: cut.id },
  ];
  ensureConfigurations(document);
  document.configurations.push(createConfiguration({
    id: "cfg_solid", name: "Solid", suppressedFeatureIds: [cut.id],
  }));

  setActiveConfiguration(document, "cfg_solid");
  assert.equal(document.history.find((entry) => entry.targetId === cut.id).suppressed, true);
  assert.equal(activeHistoryTargetIds(document).has(cut.id), false);
  applyHistoryToPreviewParts(document);
  assert.equal(document.parts[1].suppressed, true, "the drawn preview lost the cut");

  setActiveConfiguration(document, "cfg_default");
  assert.equal(document.history.find((entry) => entry.targetId === cut.id).suppressed, false);
  applyHistoryToPreviewParts(document);
  assert.equal(!!document.parts[1].suppressed, false, "and gets it back");
});

test("a configuration captured from the tree's own suppression round-trips", () => {
  /* Suppressing in the tree writes the history entry; capturing a configuration
     reads the feature. The two stayed in step only as long as nothing switched
     configuration in between — switching back to Default used to leave a
     tree-suppressed step hidden while reporting it as live. */
  const { document, cut } = blockWithHole();
  ensureConfigurations(document);
  suppressHistoryNode(document, "history:feature:" + cut.id, true);
  const captured = captureConfiguration(document, { name: "Solid" });
  assert.deepEqual(captured.suppressedFeatureIds, [cut.id]);

  setActiveConfiguration(document, "cfg_default");
  assert.equal(document.history.find((entry) => entry.targetId === cut.id).suppressed, false);
  assert.equal(rebuildParametricDocument(document).bodies.map((body) => body.featureId).join(),
    "feature:cut", "Default builds the cut again");

  setActiveConfiguration(document, captured.id);
  assert.equal(document.history.find((entry) => entry.targetId === cut.id).suppressed, true);
  assert.deepEqual(rebuildParametricDocument(document).bodies.map((body) => body.featureId),
    ["feature:base"], "and the captured configuration is the block on its own");
});

test("applying a configuration to a document with no history touches nothing else", () => {
  const legacy = { features: [{ id: "f1", suppressed: true }], parts: [{ id: "p1" }] };
  applyConfiguration(legacy, createConfiguration({ suppressedFeatureIds: [] }));
  assert.equal(legacy.features[0].suppressed, false);
  assert.equal(legacy.history, undefined);
});

/* ---- a failure is local, and suppression takes its children with it -------

   Two behaviours every CAD system has and this editor did not: a step that
   cannot build fails on its own row while the rest of the model regenerates,
   and suppressing a parent suppresses what that parent feeds. */

function blockWithHoleAndBoss() {
  const built = blockWithHole();
  const { document } = built;
  const profile = createSketchDefinition(document, {
    id: "sketch:boss", name: "Boss profile", referenceId: "plane:top",
    points: [{ id: "bc", x: 60, y: 10, fixed: true }],
    entities: [{ id: "bcircle", type: "circle", c: "bc", r: 5, fixed: true }],
  });
  const boss = createFeatureDefinition(document, "extrude", {
    id: "feature:boss",
    references: { sketches: [profile.id], features: [], topology: [], references: [] },
    params: { depth: 12, profileEntityIds: ["bcircle"] },
  });
  return { ...built, bossProfile: profile, boss };
}

test("a broken step fails on its own row while the rest of the model rebuilds", () => {
  /* The kernel run was gated on the history analysis, so one feature whose
     sketch had gone missing took every unrelated body down with it: the whole
     viewport emptied and the tree blamed a step the user had not touched. */
  const { document, bore, boss } = blockWithHoleAndBoss();
  assert.equal(rebuildParametricDocument(document).bodies.length, 2);

  document.sketches = document.sketches.filter((sketch) => sketch.id !== bore.id);
  const run = rebuildParametricDocument(document);
  assert.equal(run.ok, false, "the document still reports itself as broken");
  assert.deepEqual(run.bodies.map((body) => body.featureId), ["feature:base", boss.id],
    "but the block and the boss are still standing");
  const state = new Map(run.status.map((entry) => [entry.targetId, entry.state]));
  assert.equal(state.get("feature:cut"), "failed", "and only the cut is blamed");
  assert.equal(state.get(boss.id), "rebuilt");
});

test("suppressing a step suppresses what it feeds", () => {
  /* Left alone, the cut went on consuming an extrude that no longer built —
     which the rebuild reported as an error against the cut and used to answer
     by blanking the document. */
  const { document, base, cut, boss } = blockWithHoleAndBoss();
  const entry = suppressHistoryNode(document, "history:feature:" + base.id, true);
  assert.deepEqual(entry.cascaded, [cut.id], "the cut went with its parent");
  assert.equal(document.history.find((item) => item.targetId === cut.id).suppressed, true);
  assert.equal(document.features.find((item) => item.id === boss.id).suppressed, false,
    "the boss, which consumes nothing of the base, is untouched");

  const run = rebuildParametricDocument(document);
  assert.equal(run.ok, true, "suppressing a parent is an ordinary edit, not a failure");
  assert.deepEqual(run.bodies.map((body) => body.featureId), [boss.id]);
});

test("releasing a parent releases exactly what it took, and nothing else", () => {
  /* SolidWorks' "unsuppress with dependents", minus the trap: a step the user
     suppressed by hand before the cascade ran is not the parent's to give back. */
  const { document, base, cut, boss } = blockWithHoleAndBoss();
  suppressHistoryNode(document, "history:feature:" + boss.id, true); // by hand
  suppressHistoryNode(document, "history:feature:" + base.id, true); // takes the cut

  const released = suppressHistoryNode(document, "history:feature:" + base.id, false);
  assert.deepEqual(released.cascaded, [cut.id]);
  assert.equal(document.features.find((item) => item.id === cut.id).suppressed, false);
  assert.equal(document.features.find((item) => item.id === boss.id).suppressed, true,
    "the hand-suppressed boss stayed suppressed");
});

test("the cascade follows the sketch as well as the solid, all the way down", () => {
  const { document, profile, base, bore, cut } = blockWithHole();
  const second = createFeatureDefinition(document, "extrudeCut", {
    id: "feature:cut2", inputs: [cut.id],
    references: { sketches: [bore.id], features: [cut.id], topology: [], references: [] },
    params: { endCondition: "blind", depth: 4, profileEntityIds: ["circle"] },
  });
  const entry = suppressHistoryNode(document, "history:sketch:" + profile.id, true);
  assert.deepEqual(entry.cascaded, [base.id, cut.id, second.id],
    "the sketch, the extrude that uses it, the cut on that and the cut on that");
  assert.equal(rebuildParametricDocument(document).ok, true);
});

test("cascade can be declined for a caller that owns the whole set", () => {
  const { document, base, cut } = blockWithHole();
  suppressHistoryNode(document, "history:feature:" + base.id, true, { cascade: false });
  assert.equal(document.features.find((item) => item.id === cut.id).suppressed, false);
});

test("a configuration removes what its features feed, not only the features", () => {
  const { document, base, cut, boss } = blockWithHoleAndBoss();
  ensureConfigurations(document);
  document.configurations.push(createConfiguration({
    id: "cfg_boss-only", name: "Boss only", suppressedFeatureIds: [base.id],
  }));
  setActiveConfiguration(document, "cfg_boss-only");
  assert.equal(document.history.find((item) => item.targetId === cut.id).suppressed, true,
    "the cut cannot survive a configuration that removes the block");
  const run = rebuildParametricDocument(document);
  assert.equal(run.ok, true);
  assert.deepEqual(run.bodies.map((body) => body.featureId), [boss.id]);

  setActiveConfiguration(document, "cfg_default");
  assert.equal(document.history.find((item) => item.targetId === cut.id).suppressed, false);
  assert.equal(rebuildParametricDocument(document).bodies.length, 2);
});
