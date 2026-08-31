import { agentApiKey, validateAgentConfig } from "./agent_config.js";

function trimSlash(value) { return String(value || "").replace(/\/+$/, ""); }
function openAIChatUrl(endpoint) {
  var base = trimSlash(endpoint);
  return /\/v1$/i.test(base) ? base + "/chat/completions" : base + "/v1/chat/completions";
}
function openAIModelsUrl(endpoint) {
  var base = trimSlash(endpoint);
  return /\/v1$/i.test(base) ? base + "/models" : base + "/v1/models";
}
function headers(config) {
  var out = { "Content-Type": "application/json" }, key = agentApiKey();
  if (key) out.Authorization = "Bearer " + key;
  return out;
}
function serverHeaders() {
  var out = { "Content-Type": "application/json" }, key = agentApiKey();
  if (key) out["X-ModelForge-Agent-Token"] = key;
  return out;
}
async function jsonFetch(url, options, fetchImpl) {
  options = options || {};
  var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 60000);
  var external = options.signal, abort = function () { controller.abort(); };
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", abort, { once: true });
  }
  try {
    var response = await fetchImpl(url, Object.assign({}, options, { signal: controller.signal }));
    var data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.error && (data.error.message || data.error) || "HTTP " + response.status);
    return data;
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", abort);
  }
}

export async function listAgentModels(config, fetchImpl = fetch) {
  var valid = validateAgentConfig(Object.assign({}, config, { model: config.model || "probe" }));
  if (!valid.ok && valid.reason !== "MODEL_REQUIRED") throw new Error(valid.reason);
  config = valid.config || config;
  if (config.provider === "server") {
    var status = await jsonFetch("/api/agent/status", { headers: serverHeaders() }, fetchImpl);
    return status.models || (status.model ? [status.model] : []);
  }
  if (config.provider === "ollama") {
    var tags = await jsonFetch(trimSlash(config.endpoint) + "/api/tags", {}, fetchImpl);
    return (tags.models || []).map(function (entry) { return entry.name || entry.model; }).filter(Boolean);
  }
  var models = await jsonFetch(openAIModelsUrl(config.endpoint), { headers: headers(config) }, fetchImpl);
  return (models.data || []).map(function (entry) { return entry.id; }).filter(Boolean);
}

export async function sendAgentChat(config, messages, tools, options = {}) {
  var checked = validateAgentConfig(config);
  if (!checked.ok) throw new Error(checked.reason);
  config = checked.config;
  var fetchImpl = options.fetch || fetch, signal = options.signal;
  if (config.provider === "ollama") {
    var ollama = await jsonFetch(trimSlash(config.endpoint) + "/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ model: config.model, messages: messages, tools: tools, stream: false }),
    }, fetchImpl);
    return { message: ollama.message || { role: "assistant", content: "" } };
  }
  var url = config.provider === "server" ? "/api/agent/chat" : openAIChatUrl(config.endpoint);
  var data = await jsonFetch(url, {
    method: "POST", headers: config.provider === "server" ? serverHeaders() : headers(config), signal,
    body: JSON.stringify({ model: config.model || undefined, messages: messages, tools: tools, tool_choice: "auto" }),
  }, fetchImpl);
  var message = data.choices && data.choices[0] && data.choices[0].message;
  if (!message) throw new Error("INVALID_AGENT_RESPONSE");
  return { message: message };
}
