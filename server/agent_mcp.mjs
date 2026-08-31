#!/usr/bin/env node
// Standard JSON-RPC-over-stdio MCP adapter for a live ModelForge browser.
// The relay token and URL are supplied to this process, never written to disk.
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

const BRIDGE_URL = String(process.env.HOME3D_MCP_BRIDGE_URL || "http://127.0.0.1:8765").replace(/\/+$/, "");
const BRIDGE_TOKEN = String(process.env.HOME3D_AGENT_BRIDGE_TOKEN || "");
const empty = { type: "object", properties: {}, additionalProperties: false };
const limit = { type: "integer", minimum: 1, maximum: 500 };
const TOOLS = [
  { name: "get_project_summary", description: "Read compact live ModelForge state, interaction, warnings, attention and mastery.", inputSchema: empty, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "get_app_context", description: "Read detailed live ModelForge context with explicit budgets.", inputSchema: { type: "object", properties: { includeEntities: { type: "boolean" }, includeHistory: { type: "boolean" }, entityLimit: limit, historyLimit: limit }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "query_objects", description: "Read model objects by kind and optional IDs.", inputSchema: { type: "object", required: ["kind"], properties: { kind: { type: "string" }, ids: { type: "array" }, limit }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "search_app_tools", description: "Search ModelForge capabilities and help.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "get_history_summary", description: "Read recent history and affected objects.", inputSchema: { type: "object", properties: { limit }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "get_object_history", description: "Read history for one object such as wall:42.", inputSchema: { type: "object", required: ["objectId"], properties: { objectId: {}, kind: { type: "string" }, limit }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "compare_history_nodes", description: "Compare affected objects between history nodes.", inputSchema: { type: "object", required: ["from", "to"], properties: { from: {}, to: {} }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "search_catalog", description: "Search furniture catalog identifiers and dimensions.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "list_model_commands", description: "List safe previewable ModelForge commands.", inputSchema: empty, annotations: { readOnlyHint: true, destructiveHint: false } },
  { name: "preview_model_command", description: "Prepare a non-mutating command preview in the browser. Execution still requires confirmation inside ModelForge.", inputSchema: { type: "object", required: ["commandId", "params"], properties: { commandId: { type: "string", enum: ["opening.place", "wall.draw", "item.place", "item.duplicate", "item.move", "room.create"] }, params: { type: "object" } }, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } },
];

function send(message) { process.stdout.write(JSON.stringify(message) + "\n"); }
function result(id, value) { send({ jsonrpc: "2.0", id, result: value }); }
function failure(id, code, message, data) { send({ jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } }); }

async function bridgeCall(name, args) {
  if (!BRIDGE_TOKEN) throw new Error("HOME3D_AGENT_BRIDGE_TOKEN is required");
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(BRIDGE_URL + "/api/agent-bridge/call", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-ModelForge-Bridge-Token": BRIDGE_TOKEN },
      body: JSON.stringify({ id: randomUUID(), name, args: args || {} }),
    });
    let body;
    try { body = await response.json(); } catch (_) { body = {}; }
    if (!response.ok) throw new Error(body.error || "Bridge HTTP " + response.status);
    return body.result;
  } finally { clearTimeout(timer); }
}

async function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || !message.method) return;
  const id = message.id, method = message.method;
  if (id == null) return;
  try {
    if (method === "initialize") return result(id, {
      protocolVersion: message.params && message.params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "modelforge-live", version: "1.0.0" },
      instructions: "Connects to an open ModelForge browser. Tools are read-only or preview-only; confirm model changes in the app.",
    });
    if (method === "ping") return result(id, {});
    if (method === "tools/list") return result(id, { tools: TOOLS });
    if (method === "tools/call") {
      const name = String(message.params && message.params.name || "");
      if (!TOOLS.some((entry) => entry.name === name)) return failure(id, -32602, "Unknown tool");
      const value = await bridgeCall(name, message.params && message.params.arguments || {});
      return result(id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, isError: false });
    }
    return failure(id, -32601, "Method not found");
  } catch (error) {
    return result(id, { content: [{ type: "text", text: String(error && error.message || error) }], isError: true });
  }
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  let message;
  try { message = JSON.parse(line); }
  catch (_) { return; }
  handle(message);
});
