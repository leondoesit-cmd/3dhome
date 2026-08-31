#!/usr/bin/env node
import { deterministicTutorDecision, normalizeTutorDecision } from "../js/tutor/policy.js";

const cases = [
  { name: "opening prerequisite", state: { tool: "door" }, attention: { recentEvents: [{ type: "OPENING_EMPTY" }, { type: "OPENING_EMPTY" }] }, mode: "ask", evidence: "failed-prerequisite" },
  { name: "draft cancellation", state: { tool: "wall" }, attention: { recentEvents: [{ type: "DRAFT_CANCEL" }, { type: "DRAFT_CANCEL" }] }, mode: "coach", evidence: "draft-cancel-loop" },
  { name: "undo retry", state: { tool: "select" }, attention: { recentEvents: [{ type: "UNDO" }, { type: "UNDO" }] }, mode: "ask", evidence: "undo-retry" },
];

let passed = 0;
for (const sample of cases) {
  const decision = normalizeTutorDecision(deterministicTutorDecision(sample.attention, sample.state));
  const ok = decision.mode === sample.mode && decision.evidence.some((entry) => entry.type === sample.evidence);
  if (ok) passed++;
  else process.stderr.write(`failed: ${sample.name}\n`);
}
process.stdout.write(JSON.stringify({ passed, total: cases.length, accuracy: passed / cases.length }) + "\n");
if (passed !== cases.length) process.exitCode = 1;

