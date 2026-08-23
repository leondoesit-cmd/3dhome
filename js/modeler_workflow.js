// Pure helpers for the Part → Reference → Sketch → Feature → History loop.
// The editor chrome calls these so a blank part starts on Part, a selected
// face skips the plane picker, Finish continues into Extrude, and History is
// not the default crumb on an empty document.

export function resolveWorkflowStep(input) {
  input = input || {};
  var phase = input.phase || "model";
  if (phase === "reference") return "reference";
  if (phase === "sketch") return "sketch";
  if (input.featureType) return "feature";
  if (input.lastHistoryKind === "sketch" && input.hasClosedProfile) return "feature";
  if (input.workflowFocus === "history" || input.workflowFocus === "context" || input.workflowFocus === "feature") {
    return input.workflowFocus;
  }
  if (input.hasFeatureHistory) return "history";
  if (input.hasSketchHistory) return "feature";
  return "context";
}

export function shouldResumeSketchSession(phase, forceNew) {
  return phase === "sketch" && !forceNew;
}

export function shouldSkipReferencePicker(hasSketchableFace) {
  return !!hasSketchableFace;
}

/* Where a new sketch starts. Asking "which plane?" in a dialog is the wrong
   first question once there is a solid on screen — the answer is almost always
   a face of it, and the fastest way to say which face is to click it. So the
   dialog is reserved for a document with nothing to click yet, or for someone
   who asks for a datum plane explicitly. */
export function sketchStartMode(input) {
  input = input || {};
  if (input.hasSketchableFace) return "selected-face";
  if (input.wantsPlanePicker) return "picker";
  return input.hasSolids ? "pick-face" : "picker";
}

export function nextFeatureAfterFinishedSketch(hasClosedProfile) {
  return hasClosedProfile ? "extrude" : null;
}
