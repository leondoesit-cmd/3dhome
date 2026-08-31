const STORAGE_KEY = "modelforge_agent_settings_v1";

export const AGENT_DEFAULTS = Object.freeze({
  provider: "ollama",
  endpoint: "http://localhost:11434",
  model: "",
  includeEntities: true,
  includeHistory: true,
  includeTutorial: true,
  includeAttention: true,
  fullContext: true,
  proactiveTutor: true,
  persistConversation: false,
  externalBridge: false,
});

let sessionApiKey = "";
let sessionBridgeToken = "";

function clean(raw) {
  raw = raw && typeof raw === "object" ? raw : {};
  var provider = ["ollama", "server", "openai"].includes(raw.provider)
    ? raw.provider : AGENT_DEFAULTS.provider;
  return {
    provider: provider,
    endpoint: String(raw.endpoint || AGENT_DEFAULTS.endpoint).trim().slice(0, 2048),
    model: String(raw.model || "").trim().slice(0, 200),
    includeEntities: raw.includeEntities !== false,
    includeHistory: raw.includeHistory !== false,
    includeTutorial: raw.includeTutorial !== false,
    includeAttention: raw.includeAttention !== false,
    fullContext: raw.fullContext !== false,
    proactiveTutor: raw.proactiveTutor !== false,
    persistConversation: raw.persistConversation === true,
    externalBridge: raw.externalBridge === true,
  };
}

export function loadAgentConfig(storage = globalThis.localStorage) {
  try { return clean(JSON.parse(storage.getItem(STORAGE_KEY) || "{}")); }
  catch (_) { return clean({}); }
}

export function saveAgentConfig(value, storage = globalThis.localStorage) {
  var config = clean(value);
  try { storage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch (_) {}
  return config;
}

export function setAgentApiKey(value) {
  sessionApiKey = String(value || "").trim();
}

export function agentApiKey() { return sessionApiKey; }
export function setAgentBridgeToken(value) { sessionBridgeToken = String(value || "").trim(); }
export function agentBridgeToken() { return sessionBridgeToken; }

export function validateAgentConfig(value) {
  var config = clean(value);
  if (!config.model && config.provider !== "server") return { ok: false, reason: "MODEL_REQUIRED" };
  if (config.provider !== "server") {
    try {
      var url = new URL(config.endpoint);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("protocol");
    } catch (_) { return { ok: false, reason: "INVALID_AGENT_ENDPOINT" }; }
  }
  return { ok: true, config: config };
}
