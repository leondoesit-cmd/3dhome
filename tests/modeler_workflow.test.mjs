import test from "node:test";
import assert from "node:assert/strict";
import {
  nextFeatureAfterFinishedSketch,
  resolveWorkflowStep,
  shouldResumeSketchSession,
  shouldSkipReferencePicker,
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

test("finish sketch continues into Extrude when the profile is closed", () => {
  assert.equal(nextFeatureAfterFinishedSketch(true), "extrude");
  assert.equal(nextFeatureAfterFinishedSketch(false), null);
});
