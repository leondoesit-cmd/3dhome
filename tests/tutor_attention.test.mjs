import test from "node:test";
import assert from "node:assert/strict";
import { AttentionTracker } from "../js/tutor/attention_tracker.js";
import { deterministicTutorDecision, normalizeTutorDecision, shouldAskBeforeAction } from "../js/tutor/policy.js";
import { recordSkillOutcome, tutorProgressSnapshot, resetTutorProgress } from "../js/tutor/progress.js";
import { buildTutorDataset } from "../tools/generate_tutor_dataset.mjs";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("attention tracker detects undo, draft, and opening friction in a bounded window", () => {
  let now = 1000;
  const tracker = new AttentionTracker({ now: () => now, windowMs: 10000, capacity: 6 });
  tracker.record("OPENING_EMPTY"); tracker.record("OPENING_EMPTY"); tracker.record("UNDO");
  assert.ok(tracker.score({ ignoredWarnings: {} }) >= 0.6);
  assert.equal(tracker.snapshot({ tool: "door" }).recentEvents.length, 3);
  now += 10001;
  assert.equal(tracker.score({ ignoredWarnings: {} }), 0);
});

test("deterministic tutor handles the opening prerequisite without a model", () => {
  const decision = deterministicTutorDecision({ recentEvents: [{ type: "OPENING_EMPTY" }, { type: "OPENING_EMPTY" }] }, { tool: "door" });
  assert.equal(decision.mode, "ask");
  assert.equal(decision.evidence[0].type, "failed-prerequisite");
  assert.ok(decision.options.length >= 2);
});

test("structured tutor decisions reject malformed operations and gate low confidence", () => {
  const decision = normalizeTutorDecision({ mode: "propose", confidence: 2, proposedOperations: [{ nope: true }, { commandId: "wall.draw", params: { from: 1 } }] });
  assert.equal(decision.confidence, 1);
  assert.deepEqual(decision.proposedOperations.map((entry) => entry.commandId), ["wall.draw"]);
  assert.equal(shouldAskBeforeAction(0.5, false), true);
  assert.equal(shouldAskBeforeAction(0.99, true), true);
});

test("skill mastery records outcomes, decays, and infers an experienced project baseline", () => {
  const storage = memoryStorage();
  recordSkillOutcome("opening", true, { storage, now: 1000 });
  let snapshot = tutorProgressSnapshot({ walls: [], openings: [] }, { storage, now: 1000 });
  assert.equal(snapshot.skills.opening.attempts, 1);
  assert.ok(snapshot.skills.opening.mastery > 0);
  snapshot = tutorProgressSnapshot({ walls: Array(40).fill({}), openings: Array(16).fill({}) }, { storage, now: 1000 + 365 * 86400000 });
  assert.ok(snapshot.skills.wall.mastery >= 0.8);
  assert.ok(snapshot.skills.opening.mastery >= 0.75);
  resetTutorProgress(storage);
  assert.equal(tutorProgressSnapshot({}, { storage }).skills.opening.attempts, 0);
});

test("synthetic training generator produces deterministic structured examples", () => {
  const a = buildTutorDataset(12, 7), b = buildTutorDataset(12, 7);
  assert.deepEqual(a, b);
  assert.equal(a.length, 12);
  assert.ok(a.every((row) => row.synthetic && row.messages.length === 3));
});

