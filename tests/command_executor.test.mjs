import test from "node:test";
import assert from "node:assert/strict";
import {
  executeCommand,
  executeTransaction,
  prepareCommand,
  previewPrepared,
} from "../js/commands/executor.js";

function fixture() {
  const state = { values: [], idc: 1, sel: "keep", tool: "wall" };
  let version = 7, snapshot = null, renders = 0, commits = 0;
  const history = {
    current: () => version,
    begin: () => { snapshot = structuredClone(state); return { version }; },
    commit: () => { snapshot = null; commits += 1; version += 1; },
    abort: () => { Object.keys(state).forEach((key) => delete state[key]); Object.assign(state, snapshot); snapshot = null; },
  };
  const env = {
    domain: "planner", state, history, version: { current: () => version },
    services: { presentCommandResult: () => { renders += 1; } },
  };
  return { state, history, env, get renders() { return renders; }, get commits() { return commits; } };
}

function appendCommand(failOn) {
  return {
    id: "test.append",
    prepare(params, env) {
      return { ok: true, plan: { command: "test.append", expectedVersion: env.version.current(), params: { value: Number(params.value) } } };
    },
    preview(plan) { return { kind: "value", value: plan.params.value }; },
    apply(plan, env) {
      if (plan.params.value === failOn) return { ok: false, reason: "TEST_FAILURE" };
      env.state.values.push(plan.params.value);
      return { ok: true, created: [{ kind: "value", id: plan.params.value }], changed: [], effects: { dirty3D: true } };
    },
  };
}

test("three commands commit one history step and flush presentation once", () => {
  const f = fixture(), command = appendCommand();
  const result = executeTransaction({
    commands: [1, 2, 3].map((value) => ({ command, params: { value } })),
    label: "Batch",
    presentation: { selectCreated: true },
  }, f.env);
  assert.equal(result.ok, true);
  assert.deepEqual(f.state.values, [1, 2, 3]);
  assert.equal(f.commits, 1);
  assert.equal(f.renders, 1);
});

test("a failure in the third command restores the exact pre-batch document", () => {
  const f = fixture(), before = structuredClone(f.state), command = appendCommand(3);
  const result = executeTransaction({
    commands: [1, 2, 3].map((value) => ({ command, params: { value } })),
  }, f.env);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "TEST_FAILURE");
  assert.deepEqual(f.state, before);
  assert.equal(f.commits, 0);
  assert.equal(f.renders, 0);
});

test("stale preview re-prepares and invalidates any normalized parameter change", () => {
  const f = fixture();
  let normalized = 4;
  const command = appendCommand();
  command.prepare = function (_params, env) {
    return { ok: true, plan: { command: "test.append", expectedVersion: env.version.current(), params: { value: normalized } } };
  };
  const prepared = prepareCommand(command, { value: 4 }, f.env);
  f.history.begin();
  f.history.commit();
  normalized = 5;
  const result = executeTransaction({ commands: [{ command, params: { value: 4 }, plan: prepared.plan }] }, f.env);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "PREVIEW_INVALIDATED");
  assert.deepEqual(f.state.values, []);
});

test("preview and programmatic execution do not alter selection or active tool", () => {
  const f = fixture(), command = appendCommand();
  const prepared = prepareCommand(command, { value: 8 }, f.env);
  const before = structuredClone(f.state);
  assert.deepEqual(previewPrepared(prepared, f.env).preview, { kind: "value", value: 8 });
  assert.deepEqual(f.state, before);
  const result = executeCommand(command, { value: 8 }, f.env);
  assert.equal(result.ok, true);
  assert.equal(f.state.sel, "keep");
  assert.equal(f.state.tool, "wall");
});
