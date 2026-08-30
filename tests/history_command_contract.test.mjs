import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const historySource = await readFile(new URL("../js/history.js", import.meta.url), "utf8");

test("planner history exposes guarded command transactions", () => {
  assert.match(historySource, /export function beginHistoryTransaction\(label\)/);
  assert.match(historySource, /export function commitHistoryTransaction\(token, label\)/);
  assert.match(historySource, /export function abortHistoryTransaction\(token\)/);
  assert.match(historySource, /token !== activeTransaction/);
  assert.match(historySource, /H\.abort\(\)/);
});

test("planner history exposes only plain read projections", () => {
  assert.match(historySource, /export function currentHistoryId\(\)[\s\S]*?return H\.position\(\);/);
  assert.match(historySource, /export function historyTree\(\)[\s\S]*?return cloneJSON\(H\.tree\(\)\);/);
  assert.match(historySource, /export function historyTargets\(id\)[\s\S]*?return cloneJSON\(H\.targetsOf\(id\)\);/);
  assert.match(historySource, /export function historyScope\(id\)[\s\S]*?return Array\.from\(H\.scope\(id\), String\);/);
  assert.doesNotMatch(historySource, /export function historyObjects\(\)[\s\S]*?return H\.objects\(\)/);
});
