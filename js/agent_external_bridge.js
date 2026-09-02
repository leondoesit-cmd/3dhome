import { loadAgentConfig, agentBridgeToken } from "./agent_config.js";
import { executeAgentTool } from "./agent_runtime.js";

var initialized = false, timer = null, clientId = "browser-" + Math.random().toString(36).slice(2);

function headers() {
  var out = { "Content-Type": "application/json" }, token = agentBridgeToken();
  if (token) out["X-ModelForge-Bridge-Token"] = token;
  return out;
}
async function reply(id, result, error) {
  await fetch("/api/agent-bridge/reply", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ id: id, result: result, error: error || null }),
  });
}
async function poll() {
  var config = loadAgentConfig();
  if (!config.externalBridge || !agentBridgeToken()) return;
  try {
    var response = await fetch("/api/agent-bridge/poll?client=" + encodeURIComponent(clientId), { headers: headers() });
    if (response.status === 204) return;
    if (!response.ok) throw new Error("Bridge HTTP " + response.status);
    var request = await response.json(), result;
    try {
      result = executeAgentTool(request.name, request.args || {}, {});
      if (result == null) throw new Error("Unknown or unavailable bridge tool");
      if ((request.name === "preview_model_command" || request.name === "preview_item_snap") && result.ok)
        window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: result }));
      await reply(request.id, result, null);
    } catch (error) {
      await reply(request.id, null, String(error && error.message || error));
    }
  } catch (error) {
    window.dispatchEvent(new CustomEvent("agent-bridge-status", { detail: { ok: false, message: String(error && error.message || error) } }));
  }
}

export function initExternalAgentBridge() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  timer = setInterval(poll, 1000);
  poll();
}

export function stopExternalAgentBridge() {
  if (timer) clearInterval(timer);
  timer = null; initialized = false;
}
