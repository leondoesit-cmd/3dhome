import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_DEFAULTS,
  agentApiKey,
  loadAgentConfig,
  saveAgentConfig,
  setAgentApiKey,
  validateAgentConfig,
} from "../js/agent_config.js";
import { listAgentModels, sendAgentChat } from "../js/agent_transport.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}
function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test("agent settings persist connection metadata but keep the API key session-only", () => {
  const storage = memoryStorage();
  setAgentApiKey("secret-token");
  saveAgentConfig({ provider: "openai", endpoint: "https://models.example/v1", model: "cad-agent" }, storage);
  const loaded = loadAgentConfig(storage);
  assert.equal(loaded.provider, "openai");
  assert.equal(loaded.model, "cad-agent");
  assert.equal(loaded.fullContext, true);
  assert.equal(agentApiKey(), "secret-token");
  assert.doesNotMatch(storage.getItem("modelforge_agent_settings_v1"), /secret-token/);
});

test("agent configuration validates providers, model and HTTP endpoints", () => {
  assert.equal(validateAgentConfig(AGENT_DEFAULTS).reason, "MODEL_REQUIRED");
  assert.equal(validateAgentConfig({ provider: "ollama", endpoint: "http://localhost:11434", model: "" }).reason, "MODEL_REQUIRED");
  assert.equal(validateAgentConfig({ provider: "openai", endpoint: "file:///tmp/model", model: "x" }).reason, "INVALID_AGENT_ENDPOINT");
  assert.equal(validateAgentConfig({ provider: "server" }).ok, true);
});

test("provider defaults do not leak LM Studio settings into other backends", () => {
  const storage = memoryStorage();
  storage.setItem("modelforge_agent_settings_v1", JSON.stringify({ provider: "ollama" }));
  assert.deepEqual(
    (({ provider, endpoint, model }) => ({ provider, endpoint, model }))(loadAgentConfig(storage)),
    { provider: "ollama", endpoint: "http://localhost:11434", model: "" },
  );
  storage.setItem("modelforge_agent_settings_v1", JSON.stringify({ provider: "openai" }));
  assert.deepEqual(
    (({ provider, endpoint, model }) => ({ provider, endpoint, model }))(loadAgentConfig(storage)),
    { provider: "openai", endpoint: "https://api.openai.com/v1", model: "" },
  );
});

test("Gemini has an isolated OpenAI-compatible endpoint and model default", () => {
  const storage = memoryStorage();
  storage.setItem("modelforge_agent_settings_v1", JSON.stringify({ provider: "gemini" }));
  assert.deepEqual(
    (({ provider, endpoint, model }) => ({ provider, endpoint, model }))(loadAgentConfig(storage)),
    { provider: "gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.7-flash" },
  );
});

test("Ollama model discovery and chat use its native endpoints and tools", async () => {
  const seen = [];
  const fake = async (url, options = {}) => {
    seen.push({ url, options });
    if (url.endsWith("/api/tags")) return response({ models: [{ name: "qwen3:8b" }] });
    return response({ message: { role: "assistant", content: "Ready" } });
  };
  const config = { provider: "ollama", endpoint: "http://localhost:11434/", model: "qwen3:8b" };
  assert.deepEqual(await listAgentModels(config, fake), ["qwen3:8b"]);
  const out = await sendAgentChat(config, [{ role: "user", content: "help" }], [{ type: "function", function: { name: "context" } }], { fetch: fake });
  assert.equal(out.message.content, "Ready");
  assert.equal(seen[1].url, "http://localhost:11434/api/chat");
  assert.match(seen[1].options.body, /"tools"/);
});

test("OpenAI-compatible and LM Studio transport send the session key and normalize the response", async () => {
  setAgentApiKey("session-key");
  let request;
  const fake = async (url, options) => {
    request = { url, options };
    return response({ choices: [{ message: { role: "assistant", content: "Hello" } }] });
  };
  const out = await sendAgentChat({ provider: "lmstudio", endpoint: "http://localhost:1234/v1", model: "qwen3.8-27b" }, [], [], { fetch: fake });
  assert.equal(out.message.content, "Hello");
  assert.equal(request.url, "http://localhost:1234/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer session-key");
});

test("LM Studio streaming rebuilds tool calls and reports token performance", async () => {
  const encoder = new TextEncoder();
  const events = [
    { choices: [{ delta: { role: "assistant", tool_calls: [{ index: 0, id: "call-1", type: "function",
      function: { name: "preview_item_snap", arguments: '{"itemId":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "15}" } }] } }] },
    { choices: [], usage: { prompt_tokens: 120, completion_tokens: 8, total_tokens: 128 } },
  ].map((entry) => `data: ${JSON.stringify(entry)}\n\n`).join("") + "data: [DONE]\n\n";
  const progress = [];
  let body;
  const fake = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200, body: new ReadableStream({
      start(controller) {
        const bytes = encoder.encode(events);
        controller.enqueue(bytes.slice(0, 37));
        controller.enqueue(bytes.slice(37));
        controller.close();
      },
    }) };
  };
  const out = await sendAgentChat(
    { provider: "lmstudio", endpoint: "http://localhost:1234/v1", model: "local" }, [], [],
    { fetch: fake, onProgress: (entry) => progress.push(entry) },
  );
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.deepEqual(out.message.tool_calls, [{ id: "call-1", type: "function",
    function: { name: "preview_item_snap", arguments: '{"itemId":15}' } }]);
  assert.equal(out.metrics.inputTokens, 120);
  assert.equal(out.metrics.outputTokens, 8);
  assert.ok(out.metrics.tokensPerSecond > 0);
  assert.equal(progress[0].phase, "prompt");
  assert.ok(progress.some((entry) => entry.phase === "generating" && entry.estimated));
});

test("Gemini uses non-streaming completion, low reasoning, and sanitized tools", async () => {
  let request;
  const fake = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return response({ choices: [{ message: { role: "assistant", content: "Ready" } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 } });
  };
  const out = await sendAgentChat({ provider: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.7-flash" },
  [], [{ type: "function", function: { name: "lookup", parameters: {
    type: "object", additionalProperties: false, properties: {
      id: { anyOf: [{ type: "string" }, { type: "number" }] },
    }, anyOf: [{ required: ["id"] }],
  } } }], { fetch: fake, toolChoice: "required" });
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(request.body.stream, false);
  assert.equal(request.body.reasoning_effort, "low");
  assert.equal(request.body.tool_choice, "required");
  assert.deepEqual(request.body.tools[0].function.parameters, {
    type: "object", properties: { id: { type: "string" } },
  });
  assert.equal(out.message.content, "Ready");
  assert.equal(out.metrics.inputTokens, 10);
});

test("Gemini retries one fast 503 and exposes retry progress", async () => {
  const progress = [];
  let calls = 0;
  const fake = async () => {
    calls++;
    if (calls === 1) return response({}, 503);
    return response({ choices: [{ message: { role: "assistant", content: "Recovered" } }] });
  };
  const out = await sendAgentChat({ provider: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash" },
  [], [], { fetch: fake, onProgress: (entry) => progress.push(entry) });
  assert.equal(calls, 2);
  assert.equal(out.message.content, "Recovered");
  assert.ok(progress.some((entry) => entry.phase === "retry" && entry.attempt === 2));
});

test("a persistent empty Gemini 503 becomes a useful provider error", async () => {
  let calls = 0;
  await assert.rejects(sendAgentChat({ provider: "gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-flash" },
  [], [], { fetch: async () => { calls++; return response({}, 503); } }),
  /Gemini is temporarily unavailable \(HTTP 503\)/);
  assert.equal(calls, 2);
});

test("model timeout is distinct from user cancellation", async () => {
  const waitingFetch = async (_url, options) => await new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  await assert.rejects(
    sendAgentChat({ provider: "openai", endpoint: "https://models.example/v1", model: "m" }, [], [], {
      fetch: waitingFetch, timeoutMs: 10,
    }),
    (error) => error.name === "TimeoutError" && error.message === "AGENT_REQUEST_TIMEOUT",
  );

  const controller = new AbortController();
  const request = sendAgentChat({ provider: "openai", endpoint: "https://models.example/v1", model: "m" }, [], [], {
    fetch: waitingFetch, timeoutMs: 1000, signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(request, (error) => error.name === "AbortError");
});

test("an unexpected provider abort is retried once and not reported as user cancellation", async () => {
  let calls = 0;
  const flakyFetch = async (_url, options) => {
    calls++;
    if (calls === 1) throw new DOMException("provider interrupted", "AbortError");
    return response({ choices: [{ message: { role: "assistant", content: "Recovered" } }] });
  };
  const out = await sendAgentChat(
    { provider: "openai", endpoint: "https://models.example/v1", model: "m" }, [], [], { fetch: flakyFetch },
  );
  assert.equal(out.message.content, "Recovered");
  assert.equal(calls, 2);
});
