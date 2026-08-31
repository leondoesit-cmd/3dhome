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
  assert.equal(validateAgentConfig({ provider: "openai", endpoint: "file:///tmp/model", model: "x" }).reason, "INVALID_AGENT_ENDPOINT");
  assert.equal(validateAgentConfig({ provider: "server" }).ok, true);
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

test("OpenAI-compatible transport sends the session key and normalizes the response", async () => {
  setAgentApiKey("session-key");
  let request;
  const fake = async (url, options) => {
    request = { url, options };
    return response({ choices: [{ message: { role: "assistant", content: "Hello" } }] });
  };
  const out = await sendAgentChat({ provider: "openai", endpoint: "https://models.example/v1", model: "m" }, [], [], { fetch: fake });
  assert.equal(out.message.content, "Hello");
  assert.equal(request.url, "https://models.example/v1/chat/completions");
  assert.equal(request.options.headers.Authorization, "Bearer session-key");
});
