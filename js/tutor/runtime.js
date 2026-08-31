import { S } from "../state.js";
import { loadAgentConfig } from "../agent_config.js";
import { spotlightPlannerTarget } from "../planner_tutorial.js";
import { tutorAttention } from "./attention_tracker.js";
import { deterministicTutorDecision } from "./policy.js";
import { recordSkillOutcome } from "./progress.js";

var initialized = false, lastIntervention = 0, pointerAt = 0;

export function tutorAttentionSnapshot() { return tutorAttention.snapshot(S); }

function consider() {
  var config = loadAgentConfig();
  if (config.proactiveTutor === false) return;
  var now = Date.now();
  if (now - lastIntervention < 12000) return;
  var snapshot = tutorAttention.snapshot(S);
  if (snapshot.frictionScore < 0.35) return;
  var decision = deterministicTutorDecision(snapshot, S);
  if (!decision) return;
  lastIntervention = now;
  if (decision.evidence.some(function (entry) { return entry.type === "failed-prerequisite"; }))
    spotlightPlannerTarget("#plan", 6000);
  window.dispatchEvent(new CustomEvent("agent-tutor-intervention", { detail: decision }));
}

function record(type, payload) {
  tutorAttention.record(type, payload || {});
  consider();
}

export function initTutorRuntime() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  var plan = document.getElementById("plan");
  if (plan) plan.addEventListener("pointermove", function (event) {
    var now = Date.now();
    if (now - pointerAt < 80) return;
    pointerAt = now;
    tutorAttention.pointerMove(event.clientX, event.clientY);
  }, { passive: true });
  window.addEventListener("planner-opening-missed", function () { record("OPENING_EMPTY"); recordSkillOutcome("opening", false); });
  window.addEventListener("planner-draft-cancel", function () { record("DRAFT_CANCEL"); recordSkillOutcome("wall", false); });
  window.addEventListener("plan-undo", function () { record("UNDO"); });
  window.addEventListener("planner-command-failed", function (event) { record("COMMAND_FAILED", event.detail || {}); });
  window.addEventListener("planner-opening-created", function () { recordSkillOutcome("opening", true); });
  window.addEventListener("planner-wall-created", function () { recordSkillOutcome("wall", true); });
  window.addEventListener("planner-room-created", function () { recordSkillOutcome("room", true); });
  window.addEventListener("planner-item-created", function () { recordSkillOutcome("item", true); });
}

