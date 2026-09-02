const MODES = Object.freeze(["answer", "ask", "coach", "propose"]);

function text(value, limit) { return String(value || "").trim().slice(0, limit); }

export function normalizeTutorDecision(value, fallbackMessage = "") {
  var structured = !!(value && typeof value === "object");
  var raw = structured ? value : {};
  var mode = MODES.includes(raw.mode) ? raw.mode : "answer";
  var confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  var evidence = Array.isArray(raw.evidence) ? raw.evidence.slice(0, 12).map(function (entry) {
    return typeof entry === "string" ? { type: "observation", detail: text(entry, 300) } : {
      type: text(entry && entry.type, 80) || "observation",
      detail: text(entry && entry.detail, 300),
    };
  }) : [];
  var operations = Array.isArray(raw.proposedOperations) ? raw.proposedOperations.slice(0, 20).filter(function (entry) {
    return entry && typeof entry === "object" && typeof entry.commandId === "string" && entry.params && typeof entry.params === "object" && !Array.isArray(entry.params);
  }).map(function (entry) { return { commandId: text(entry.commandId, 120), params: entry.params }; }) : [];
  var question = text(raw.question, 1000), hasOptions = Array.isArray(raw.options) && raw.options.length;
  if (question && !operations.length && (hasOptions || !text(raw.message || raw.answer, 4000))) mode = "ask";
  return {
    mode: mode,
    // A parsed structured response owns its fields. Falling back to its source
    // text here would expose fenced JSON whenever the model intentionally left
    // message empty and supplied a question, options, or operations instead.
    message: text(raw.message || raw.answer || (structured ? "" : fallbackMessage), 4000),
    question: mode === "ask" ? question : "",
    options: mode === "ask" && Array.isArray(raw.options)
      ? raw.options.slice(0, 4).map(function (option) { return text(option, 160); }).filter(Boolean) : [],
    evidence: evidence,
    confidence: Math.max(0, Math.min(1, confidence)),
    proposedOperations: operations,
  };
}

// High-confidence local rules remain available with no model connection. They
// only coach or ask; they never mutate the document.
export function deterministicTutorDecision(attention, state = {}) {
  var events = attention && attention.recentEvents || [];
  var count = function (type) { return events.filter(function (event) { return event.type === type; }).length; };
  if ((state.tool === "door" || state.tool === "window" || state.tool === "passage") && count("OPENING_EMPTY") >= 2) {
    return normalizeTutorDecision({
      mode: "ask", confidence: 0.98,
      question: "This opening tool needs an existing wall. Would you like me to show where to click?",
      options: ["Show valid walls", "Explain opening placement", "Not now"],
      evidence: [{ type: "failed-prerequisite", detail: "Two recent opening clicks landed away from a host wall." }],
    });
  }
  if (count("DRAFT_CANCEL") >= 2) {
    return normalizeTutorDecision({
      mode: "coach", confidence: 0.88,
      message: "You have ended several drawing attempts. Click once for the first corner, continue clicking for each wall, then press Escape only when the run is finished.",
      evidence: [{ type: "draft-cancel-loop", detail: "Repeated wall-draft cancellations in the last ten seconds." }],
    });
  }
  if (count("UNDO") >= 2) {
    return normalizeTutorDecision({
      mode: "ask", confidence: 0.82,
      question: "I noticed several quick undo attempts. What result were you trying to get?",
      options: ["Fix alignment", "Fix dimensions", "Place an object", "Something else"],
      evidence: [{ type: "undo-retry", detail: "Multiple undo operations occurred in a short window." }],
    });
  }
  return null;
}

export function shouldAskBeforeAction(confidence, destructive) {
  return !!destructive || Number(confidence) < 0.85;
}
