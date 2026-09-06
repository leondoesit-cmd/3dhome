const STORAGE_KEY = "modelforge_agent_settings_v1";
const PROVIDER_DEFAULTS = Object.freeze({
  lmstudio: Object.freeze({ endpoint: "http://localhost:1234/v1", model: "" }),
  gemini: Object.freeze({ endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.7-flash" }),
  ollama: Object.freeze({ endpoint: "http://localhost:11434", model: "" }),
  openai: Object.freeze({ endpoint: "https://api.openai.com/v1", model: "" }),
  server: Object.freeze({ endpoint: "", model: "" }),
});

export const AGENT_DEFAULTS = Object.freeze({
  provider: "lmstudio",
  endpoint: PROVIDER_DEFAULTS.lmstudio.endpoint,
  model: PROVIDER_DEFAULTS.lmstudio.model,
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
  var provider = ["ollama", "lmstudio", "gemini", "server", "openai"].includes(raw.provider)
    ? raw.provider : AGENT_DEFAULTS.provider;
  var defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider: provider,
    endpoint: String(raw.endpoint || defaults.endpoint).trim().slice(0, 2048),
    model: String(raw.model != null ? raw.model : defaults.model).trim().slice(0, 200),
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
