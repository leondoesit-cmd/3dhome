import test from "node:test";
import assert from "node:assert/strict";
import { sendAgentChat } from "../js/agent_transport.js";

globalThis.window = {
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { href: "http://localhost/" },
};
globalThis.CustomEvent = class {
  constructor(type, init) { this.type = type; Object.assign(this, init || {}); }
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({
    getContext: () => null, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, appendChild() {},
  }),
  addEventListener() {}, body: { classList: { add() {}, remove() {} } },
};

const { S } = await import("../js/state.js");
const { executeAgentTool, installAgentBridge, runAgentTurn } = await import("../js/agent_runtime.js");

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function modelReply(message) {
  return response({ choices: [{ message }] });
}

function moveCall(id, itemId, x) {
  return {
    id,
    type: "function",
    function: {
      name: "preview_model_command",
      arguments: JSON.stringify({ commandId: "item.move", params: { itemId, x } }),
    },
  };
}

test("server HTTP 504 is classified as a timeout rather than a generic failure", async () => {
  await assert.rejects(
    sendAgentChat(
      { provider: "server" },
      [{ role: "user", content: "move it" }],
      [],
      { fetch: async () => response({ error: "Agent request timed out" }, 504) },
    ),
    (error) => error && error.name === "TimeoutError" && error.message === "AGENT_REQUEST_TIMEOUT",
  );
});

test("preview_item_snap resolves late live items and returns one normalized proposal to every tool host", async () => {
  const previousItems = S.items;
  const previousModelContext = globalThis.document.modelContext;
  try {
    S.items = Array.from({ length: 90 }, (_, index) => ({
      id: 10_000 + index,
      type: "chair",
      x: 1000 + index * 100,
      z: 2000,
      w: 50,
      d: 50,
      h: 90,
      rot: 0,
    }));
    const target = S.items[89];
    const args = { itemId: target.id, face: "west" };
    const direct = executeAgentTool("preview_item_snap", args);

    assert.equal(direct.ok, true);
    assert.equal(direct.commandId, "item.move");
    assert.equal(direct.plan.params.itemId, target.id);
    assert.equal("moves" in direct, false, "raw resolver moves must not escape the tool adapter");

    const registered = new Map();
    globalThis.document.modelContext = {
      registerTool(definition, callback) { registered.set(definition.name, callback); },
    };
    installAgentBridge();
    const webMcp = registered.get("modelforge_preview_item_snap")(args);
    assert.deepEqual(webMcp, direct, "in-app and WebMCP callers receive the same proposal envelope");

    let modelCall = 0;
    const turn = await runAgentTurn(
      { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
      [{ role: "user", content: "face the last chair west" }],
      { fetch: async () => modelCall++ === 0
        ? modelReply({ role: "assistant", content: "", tool_calls: [{
          id: "late-snap", type: "function",
          function: { name: "preview_item_snap", arguments: JSON.stringify(args) },
        }] })
        : modelReply({ role: "assistant", content: JSON.stringify({ mode: "propose", message: "", confidence: 1 }) }) },
    );
    assert.equal(turn.proposal.commandId, "item.move");
    assert.equal(turn.proposal.plan.params.itemId, target.id,
      "turn-start context truncation must not limit tool execution");
  } finally {
    S.items = previousItems;
    if (previousModelContext === undefined) delete globalThis.document.modelContext;
    else globalThis.document.modelContext = previousModelContext;
  }
});

test("a failed preview preserves the ready subset and labels the proposal incomplete", async () => {
  const previousItems = S.items;
  try {
    S.items = [
      { id: 20_001, type: "chair", x: 1000, z: 1000, w: 50, d: 50, h: 90, rot: 0 },
      { id: 20_002, type: "table", x: 1400, z: 1000, w: 100, d: 70, h: 75, rot: 0 },
    ];
    let call = 0;
    const fake = async () => call++ === 0
      ? modelReply({ role: "assistant", content: "", tool_calls: [
        moveCall("ready-a", 20_001, 1100),
        moveCall("missing", 99_999, 1200),
        moveCall("ready-b", 20_002, 1500),
      ] })
      : modelReply({ role: "assistant", content: JSON.stringify({ mode: "propose", message: "", confidence: 1 }) });

    const turn = await runAgentTurn(
      { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
      [{ role: "user", content: "move the chair and table" }],
      { fetch: fake },
    );

    assert.equal(turn.proposal.commandId, "batch");
    assert.equal(turn.proposal.commands.length, 2);
    assert.equal(turn.proposal.incomplete, true);
    assert.deepEqual(turn.proposal.failures, [
      { callId: "missing", name: "preview_model_command", reason: "ITEM_SOURCE_NOT_FOUND" },
    ]);
  } finally {
    S.items = previousItems;
  }
});

test("choice overflow is capped at A-D and explicitly reported", async () => {
  const previousItems = S.items;
  try {
    S.items = [{ id: 30_001, type: "chair", x: 3000, z: 3000, w: 50, d: 50, h: 90, rot: 0 }];
    let call = 0;
    const fake = async () => call++ === 0
      ? modelReply({ role: "assistant", content: "", tool_calls: [0, 1, 2, 3, 4].map((index) =>
        moveCall("choice-" + index, 30_001, 3100 + index * 100)) })
      : modelReply({ role: "assistant", content: JSON.stringify({ mode: "propose", message: "", confidence: 1 }) });

    const turn = await runAgentTurn(
      { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
      [{ role: "user", content: "show alternatives" }],
      { fetch: fake },
    );

    assert.equal(turn.proposal.commandId, "choices");
    assert.equal(turn.proposal.choices.length, 4);
    assert.equal(turn.proposal.totalChoices, 5);
    assert.equal(turn.proposal.truncatedChoices, 1);
  } finally {
    S.items = previousItems;
  }
});
