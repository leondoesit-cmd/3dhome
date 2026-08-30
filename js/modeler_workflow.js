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
   first question: an empty part already has a Top plane, and a solid on screen
   is almost always sketched on a face of it. The dialog is for someone who
   asks for a datum plane explicitly (the Reference crumb). */
export function sketchStartMode(input) {
  input = input || {};
  if (input.hasSketchableFace) return "selected-face";
  if (input.wantsPlanePicker) return "picker";
  return input.hasSolids ? "pick-face" : "default-plane";
}

export function defaultSketchPlane(references, lastId) {
  var list = references || [];
  var preferred = lastId || "plane:top";
  return list.find(function (reference) { return reference.id === preferred; })
    || list.find(function (reference) { return reference.id === "plane:top"; })
    || list.find(function (reference) { return reference.type === "plane"; })
    || null;
}

export function nextFeatureAfterFinishedSketch(hasClosedProfile) {
  return hasClosedProfile ? "extrude" : null;
}

/* One state model for both the assembly workflow bar and its coach. Insert
   remains current until there are two components, even when the first was
   grounded automatically. The last authored stage is Save; BOM remains an
   assembly command, not a competing workflow destination. */
export function resolveAssemblyWorkflow(input) {
  input = input || {};
  var n = Number(input.components) || 0;
  var phase, stage;
  if (!n) { phase = input.hasLibrary ? "insert-first" : "empty-library"; stage = "insert"; }
  else if (n === 1) { phase = "insert-second"; stage = "insert"; }
  else if (!input.grounded) { phase = "ground"; stage = "ground"; }
  else if (!input.mates) { phase = "mate"; stage = "mate"; }
  else if (input.broken || !input.checked) { phase = "check"; stage = "check"; }
  else { phase = input.dirty ? "save" : null; stage = "save"; }
  return {
    phase: phase,
    stage: stage,
    active: ["insert", "ground", "mate", "check", "save"].indexOf(stage),
    complete: stage === "save" && !input.dirty,
  };
}

/* Kept as the small public coach helper for callers that only need its next
   action; it delegates to the shared workflow model above. */
export function assemblyCoachPhase(input) {
  return resolveAssemblyWorkflow(input).phase;
}
