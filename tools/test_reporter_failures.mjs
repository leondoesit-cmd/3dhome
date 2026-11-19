// Failures-only node:test reporter, built to keep test output cheap for agents.
//
//   node --test --test-reporter=./tools/test_reporter_failures.mjs tests/x.test.mjs
//
// Prints one block per failing leaf test (file:line, name, first lines of the
// error), diagnostics that mention an error, and a single summary line at the
// end. No per-pass lines and no TAP.
import path from "node:path";

const MAX_ERROR_LINES = 15;

function rel(file) {
  if (!file) return "?";
  const r = path.relative(process.cwd(), file);
  return (r && !r.startsWith("..") ? r : file).split(path.sep).join("/");
}

function errorText(error) {
  if (!error) return "(no error details)";
  const inner = error.cause && typeof error.cause === "object" ? error.cause : error;
  const text = inner.stack || inner.message || String(inner);
  // node's own frames (test runner, async hooks) say nothing about the failure
  return String(text).split(/\r?\n/).filter((l) => !/^\s*at .*\(?node:/.test(l)).slice(0, MAX_ERROR_LINES).map((l) => "  " + l).join("\n");
}

export default async function* failuresOnly(source) {
  const started = Date.now();
  let leafPass = 0;
  let leafFail = 0;
  let leafSkip = 0;
  let summary = null;

  for await (const { type, data } of source) {
    if (type === "test:fail") {
      const error = data.details?.error;
      if (error?.failureType === "subtestsFailed") continue;
      leafFail++;
      yield `✗ ${rel(data.file)}:${data.line ?? 0} › ${data.name}\n${errorText(error)}\n`;
    } else if (type === "test:pass") {
      if (data.details?.type === "suite") continue;
      if (data.skip || data.todo) leafSkip++;
      else leafPass++;
    } else if (type === "test:diagnostic") {
      if (/error/i.test(data.message)) yield `${data.message}\n`;
    } else if (type === "test:summary") {
      // Per-file summaries carry data.file; the overall one does not.
      if (!data.file) summary = data;
    }
  }

  let line;
  if (summary?.counts) {
    const c = summary.counts;
    const secs = (summary.duration_ms ?? Date.now() - started) / 1000;
    line = `tests ${c.tests} | pass ${c.passed} | fail ${c.failed} | skipped ${c.skipped + (c.todo || 0)} | ${secs.toFixed(1)}s`;
  } else {
    const secs = (Date.now() - started) / 1000;
    line = `tests ${leafPass + leafFail + leafSkip} | pass ${leafPass} | fail ${leafFail} | skipped ${leafSkip} | ${secs.toFixed(1)}s`;
  }
  yield line + "\n";
}
