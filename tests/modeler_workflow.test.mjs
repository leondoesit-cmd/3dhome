import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assemblyCoachPhase,
  resolveAssemblyWorkflow,
  defaultSketchPlane,
  featuresForClosedProfile,
  resolveWorkflowStep,
  shouldResumeSketchSession,
  shouldSkipReferencePicker,
  sketchStartMode,
} from "../js/modeler_workflow.js";

test("a blank part sits on Part, not History", () => {
  assert.equal(resolveWorkflowStep({ phase: "model" }), "context");
  assert.equal(resolveWorkflowStep({}), "context");
});

test("reference and sketch phases win over later crumbs", () => {
  assert.equal(resolveWorkflowStep({ phase: "reference", hasFeatureHistory: true }), "reference");
  assert.equal(resolveWorkflowStep({ phase: "sketch", hasClosedProfile: true }), "sketch");
});

test("a closed profile waiting on a sketch step is Feature", () => {
  assert.equal(resolveWorkflowStep({
    phase: "model",
    lastHistoryKind: "sketch",
    hasClosedProfile: true,
    hasSketchHistory: true,
  }), "feature");
  assert.equal(resolveWorkflowStep({ featureType: "extrude", phase: "model" }), "feature");
});

test("history is active after features exist, or when the user opens it", () => {
  assert.equal(resolveWorkflowStep({
    phase: "model",
    lastHistoryKind: "feature",
    hasFeatureHistory: true,
    hasSketchHistory: true,
  }), "history");
  assert.equal(resolveWorkflowStep({
    phase: "model",
    workflowFocus: "history",
    hasSketchHistory: true,
  }), "history");
});

test("explicit Part / Feature crumbs stick until the phase changes", () => {
  assert.equal(resolveWorkflowStep({
    phase: "model",
    workflowFocus: "context",
    hasFeatureHistory: true,
  }), "context");
  assert.equal(resolveWorkflowStep({
    phase: "model",
    workflowFocus: "feature",
    hasFeatureHistory: true,
  }), "feature");
});

test("a selected face skips the plane picker; an open sketch resumes", () => {
  assert.equal(shouldSkipReferencePicker({ kind: "face" }), true);
  assert.equal(shouldSkipReferencePicker(null), false);
  assert.equal(shouldResumeSketchSession("sketch", false), true);
  assert.equal(shouldResumeSketchSession("sketch", true), false);
  assert.equal(shouldResumeSketchSession("model", false), false);
});

test("a closed profile is offered to every feature that could consume it", () => {
  /* This used to answer "extrude", and finishing a sketch opened that form
     unasked — right for a boss, wrong for a hole, a revolve, or a profile
     someone was only defining. Extrude still leads, because leading is not
     the same as deciding. */
  assert.deepEqual(featuresForClosedProfile(true), ["extrude", "extrudeCut", "revolve", "hole"]);
  assert.equal(featuresForClosedProfile(true)[0], "extrude");
  assert.deepEqual(featuresForClosedProfile(false), []);
});

test("a new sketch asks you to click a face; the plane dialog is the fallback", () => {
  // a solid on screen: pick the face you mean, no dialog
  assert.equal(sketchStartMode({ hasSolids: true }), "pick-face");
  // nothing modelled yet — sketch on Top instead of asking which plane
  assert.equal(sketchStartMode({ hasSolids: false }), "default-plane");
  // an already selected face short-circuits both
  assert.equal(sketchStartMode({ hasSketchableFace: true, hasSolids: true }), "selected-face");
  // asking for a datum plane still gets the dialog
  assert.equal(sketchStartMode({ hasSolids: true, wantsPlanePicker: true }), "picker");
  assert.equal(sketchStartMode({ hasSolids: false, wantsPlanePicker: true }), "picker");
});

test("an empty part picks Top, or the last plane the user sketched on", () => {
  const planes = [
    { id: "plane:front", type: "plane" },
    { id: "plane:top", type: "plane" },
    { id: "plane:right", type: "plane" },
  ];
  assert.equal(defaultSketchPlane(planes).id, "plane:top");
  assert.equal(defaultSketchPlane(planes, "plane:right").id, "plane:right");
  assert.equal(defaultSketchPlane([{ id: "plane:front", type: "plane" }]).id, "plane:front");
  assert.equal(defaultSketchPlane([]), null);
});

test("assembly coach follows insert → second → ground → mate → check → save", () => {
  assert.equal(assemblyCoachPhase({ components: 0, hasLibrary: false }), "empty-library");
  assert.equal(assemblyCoachPhase({ components: 0, hasLibrary: true }), "insert-first");
  assert.equal(assemblyCoachPhase({ components: 1, hasLibrary: true, grounded: 1 }), "insert-second");
  assert.equal(assemblyCoachPhase({ components: 2, grounded: 0 }), "ground");
  assert.equal(assemblyCoachPhase({ components: 2, grounded: 1, mates: 0 }), "mate");
  assert.equal(assemblyCoachPhase({ components: 2, grounded: 1, mates: 1, checked: false }), "check");
  assert.equal(assemblyCoachPhase({ components: 2, grounded: 1, mates: 1, broken: 1, checked: true }), "check");
  assert.equal(assemblyCoachPhase({ components: 2, grounded: 1, mates: 1, checked: true, dirty: true }), "save");
  assert.equal(assemblyCoachPhase({ components: 2, grounded: 1, mates: 1, checked: true, dirty: false }), null);
});

test("assembly bar and coach share one Insert → Ground → Mate → Check → Save state", () => {
  assert.deepEqual(resolveAssemblyWorkflow({ components: 0, hasLibrary: true }), {
    phase: "insert-first", stage: "insert", active: 0, complete: false,
  });
  assert.deepEqual(resolveAssemblyWorkflow({ components: 1, grounded: 1 }), {
    phase: "insert-second", stage: "insert", active: 0, complete: false,
  }, "a grounded first component must not advance the bar beyond Insert");
  assert.deepEqual(resolveAssemblyWorkflow({ components: 2, grounded: 0 }), {
    phase: "ground", stage: "ground", active: 1, complete: false,
  });
  assert.deepEqual(resolveAssemblyWorkflow({ components: 2, grounded: 1, mates: 0 }), {
    phase: "mate", stage: "mate", active: 2, complete: false,
  });
  assert.deepEqual(resolveAssemblyWorkflow({ components: 2, grounded: 1, mates: 1, checked: false }), {
    phase: "check", stage: "check", active: 3, complete: false,
  });
  assert.deepEqual(resolveAssemblyWorkflow({ components: 2, grounded: 1, mates: 1, checked: true, dirty: true }), {
    phase: "save", stage: "save", active: 4, complete: false,
  });
  assert.deepEqual(resolveAssemblyWorkflow({ components: 2, grounded: 1, mates: 1, checked: true, dirty: false }), {
    phase: null, stage: "save", active: 4, complete: true,
  });
});

test("assembly UI consumes the shared state and ends in Save", () => {
  const source = readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
  assert.match(source, /var ASSEMBLY_WORKFLOW = \["wfInsert", "wfGround", "wfMate", "wfCheck", "wfSave"\]/);
  assert.match(source, /function coachAssemblySuggestion\(\) \{\s*var state = assemblyWorkflowState\(\);\s*var phase = state\.phase;/);
  assert.match(source, /history: function \(\) \{ saveCurrentDocument\(\); \}/);
  assert.doesNotMatch(source, /var ASSEMBLY_WORKFLOW = \[[^\]]*"wfBom"/);
});
