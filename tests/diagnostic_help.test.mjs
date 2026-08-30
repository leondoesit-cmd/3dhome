import test from "node:test";
import assert from "node:assert/strict";

import {
  diagnosticHelp, diagnosticAction, groupDiagnostics, rankDiagnostics,
  recommendedDiagnostic, DIAGNOSTIC_CODES,
} from "../js/core/diagnostic_help.js";

test("common rebuild issues explain the cause and give a concrete repair", () => {
  for (const code of [
    "under-constrained-sketch", "over-constrained-sketch",
    "missing-topology-reference", "ambiguous-topology-reference",
    "unavailable-feature-input", "missing-sketch-support",
    "feature-rebuild-failed", "parameter-expression",
  ]) {
    const help = diagnosticHelp({ code });
    assert.ok(help.meaning.length > 20, code + " needs a useful explanation");
    assert.ok(help.fix.length > 30, code + " needs actionable repair guidance");
    assert.ok(help.next.length > 10, code + " needs a short next step");
    assert.ok(help.action, code + " needs a repair action");
  }
});

test("every known rebuild code has bilingual help and a repair action", () => {
  assert.ok(DIAGNOSTIC_CODES.length > 30);
  for (const code of DIAGNOSTIC_CODES) {
    const english = diagnosticHelp({ code }, "en");
    const hebrew = diagnosticHelp({ code }, "he");
    assert.notEqual(english.fix, hebrew.fix, code);
    assert.ok(english.action);
  }
});

test("diagnostic guidance is bilingual and future codes have a safe fallback", () => {
  const english = diagnosticHelp({ code: "missing-topology-reference" }, "en");
  const hebrew = diagnosticHelp({ code: "missing-topology-reference" }, "he");
  assert.notEqual(english.fix, hebrew.fix);
  assert.match(diagnosticHelp({ code: "future-new-code" }).fix, /Show issue/);
  assert.equal(diagnosticHelp({ code: "future-new-code" }).action, "show");
});

test("duplicate topology losses on one feature collapse to a single recommended card", () => {
  const issues = [
    { severity: "warning", code: "under-constrained-sketch", sketchId: "s1", dof: 5 },
    { severity: "error", code: "unavailable-feature-input", featureId: "f2" },
    { severity: "error", code: "missing-topology-reference", featureId: "f1" },
    { severity: "error", code: "missing-topology-reference", featureId: "f1" },
    { severity: "error", code: "missing-topology-reference", featureId: "f1" },
  ];
  const ranked = rankDiagnostics(issues);
  assert.equal(ranked[0].code, "missing-topology-reference");
  const groups = groupDiagnostics(issues);
  assert.equal(groups[0].count, 3);
  assert.equal(groups[0].issue.featureId, "f1");
  assert.equal(recommendedDiagnostic(issues).code, "missing-topology-reference");
  assert.equal(diagnosticAction(groups[0].issue), "edit-feature");
  assert.equal(diagnosticAction({ code: "unavailable-feature-input" }), "repair-upstream");
  assert.equal(diagnosticAction({ code: "under-constrained-sketch" }), "edit-sketch");
});
