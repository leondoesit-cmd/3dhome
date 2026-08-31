import { sendAgentChat } from "./agent_transport.js";
import {
  projectAgentContext, queryAgentObjects, searchAgentTools, getAgentHistorySummary,
  getAgentObjectHistory, compareAgentHistory, searchAgentCatalog,
} from "./agent_context.js";
import { plannerCommandManifest } from "./commands/index.js";
import { previewPlannerCommand } from "./interaction.js";
import { normalizeTutorDecision, shouldAskBeforeAction } from "./tutor/policy.js";

function tool(name, description, parameters, readOnly) {
  return { type: "function", function: { name: name, description: description, parameters: parameters }, readOnly: !!readOnly };
}
const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };
const LIMIT_SCHEMA = { type: "integer", minimum: 1, maximum: 500 };

export const AGENT_TOOLS = Object.freeze([
  tool("get_project_summary", "Read compact live ModelForge state, interaction, warnings, attention, mastery and context budgets.", EMPTY_SCHEMA, true),
  tool("get_app_context", "Read detailed ModelForge context. Prefer focused read tools when possible.", {
    type: "object", properties: { includeEntities: { type: "boolean" }, includeHistory: { type: "boolean" }, entityLimit: LIMIT_SCHEMA, historyLimit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("query_objects", "Read model objects by kind and optional stable IDs.", {
    type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["nodes", "walls", "openings", "items", "markers", "slabOpenings", "wallConstraints", "roomConstraints", "planVariables", "mepNodes", "mepRuns"] }, ids: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } }, limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("search_app_tools", "Search every curated app capability, including help, location, availability and linked model commands.", {
    type: "object", properties: { query: { type: "string" }, limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("get_history_summary", "Read recent history nodes and their affected objects.", {
    type: "object", properties: { limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("get_object_history", "Read history for one object such as wall:42.", {
    type: "object", required: ["objectId"], properties: { objectId: { anyOf: [{ type: "string" }, { type: "number" }] }, kind: { type: "string" }, limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("compare_history_nodes", "Compare the objects touched by two history nodes.", {
    type: "object", required: ["from", "to"], properties: { from: { anyOf: [{ type: "string" }, { type: "number" }] }, to: { anyOf: [{ type: "string" }, { type: "number" }] } }, additionalProperties: false,
  }, true),
  tool("search_catalog", "Search the furniture catalog and read placement dimensions.", {
    type: "object", properties: { query: { type: "string" }, limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("list_model_commands", "List commands that can safely create or modify model entities.", EMPTY_SCHEMA, true),
  tool("preview_model_command", "Validate and preview one model-changing command. It cannot execute; the user must confirm in trusted UI.", {
    type: "object", required: ["commandId", "params"],
    properties: {
      commandId: { type: "string", enum: ["opening.place", "wall.draw", "item.place", "item.duplicate", "item.move", "room.create"] },
      params: { type: "object", description: "JSON parameters matching the selected command" },
    }, additionalProperties: false,
  }, true),
]);

function argsOf(call) {
  var raw = call && call.function && call.function.arguments;
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(raw || "{}"); } catch (_) { return {}; }
}
function toolCalls(message) { return Array.isArray(message && message.tool_calls) ? message.tool_calls : []; }
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(function (part) { return part && part.text || ""; }).join("\n");
  return "";
}
function decisionOf(message) {
  var content = contentText(message && message.content), parsed = null;
  try { parsed = JSON.parse(content); } catch (_) {}
  return normalizeTutorDecision(parsed, content);
}
function proposalSignature(proposal) {
  return String(proposal && proposal.commandId || "") + ":" + JSON.stringify(proposal && proposal.plan && proposal.plan.params || {});
}
function proposalTarget(proposal) {
  var params = proposal && proposal.plan && proposal.plan.params || {};
  if (params.itemId != null) return "item:" + params.itemId;
  if (params.wallId != null) return "wall:" + params.wallId + ":" + proposal.commandId;
  if (Array.isArray(params.sourceIds)) return "items:" + params.sourceIds.map(String).sort().join(",");
  return proposalSignature(proposal);
}
function batchProposal(proposals) {
  return {
    ok: true,
    commandId: "batch",
    commands: proposals,
    preview: { kind: "batch", previews: proposals.map(function(entry) { return entry.preview; }) },
  };
}
export function executeAgentTool(name, args = {}, contextOptions = {}) {
  if (name === "get_project_summary") return projectAgentContext(Object.assign({}, contextOptions, { compact: true }));
  if (name === "get_app_context") return projectAgentContext(Object.assign({}, contextOptions, args || {}, { compact: false }));
  if (name === "query_objects") return queryAgentObjects(args);
  if (name === "search_app_tools") return searchAgentTools(args);
  if (name === "get_history_summary") return getAgentHistorySummary(args);
  if (name === "get_object_history") return getAgentObjectHistory(args);
  if (name === "compare_history_nodes") return compareAgentHistory(args);
  if (name === "search_catalog") return searchAgentCatalog(args);
  if (name === "list_model_commands") return plannerCommandManifest();
  if (name === "preview_model_command") return previewPlannerCommand(args.commandId, args.params);
  return null;
}

export async function runAgentTurn(config, conversation, options = {}) {
  var contextOptions = {
    includeEntities: config.includeEntities, includeHistory: config.includeHistory,
    includeTutorial: config.includeTutorial, includeAttention: config.includeAttention,
  };
  var context = projectAgentContext(Object.assign({}, contextOptions, config.fullContext === false ? {
    compact: true,
  } : {
    compact: false, entityLimit: 5000, historyLimit: 2000,
  }));
  var system = {
    role: "system",
    content: "You are the ModelForge in-app command assistant. The application owns truth; use focused read tools instead of guessing. When a request maps to a model command, resolve the target and call preview_model_command immediately. Do not narrate coordinates, calculations, limitations, or manual steps before a valid preview. Ask one short question only when the target or required value is genuinely ambiguous. Never claim a change happened: preview is non-mutating and trusted UI confirmation is required. After preparing one proposal, keep message and question empty; the UI shows the ghost and Yes/Cancel/How to fix controls. Return JSON with mode (answer|ask|coach|propose), message, question, options, evidence, confidence, and proposedOperations. Current compact context:\n" + JSON.stringify(context),
  };
  var messages = [system].concat((conversation || []).slice(-24));
  var successfulProposals = [], finalMessage = null, loopLimited = true;
  for (var round = 0; round < 6; round++) {
    var response = await sendAgentChat(config, messages, AGENT_TOOLS.map(function (entry) {
      return { type: entry.type, function: entry.function };
    }), options);
    var message = response.message || { role: "assistant", content: "" };
    messages.push(message);
    var calls = toolCalls(message);
    if (!calls.length) { finalMessage = message; loopLimited = false; break; }
    for (var i = 0; i < calls.length; i++) {
      var call = calls[i], name = call.function && call.function.name, args = argsOf(call), result;
      if (name === "preview_model_command") {
        result = previewPlannerCommand(args.commandId, args.params);
        if (result.ok) successfulProposals.push({ callId: call.id || "preview-" + round + "-" + i, proposal: result });
        else successfulProposals = [];
      } else {
        var read = executeAgentTool(name, args, contextOptions);
        result = read != null ? read : { ok: false, reason: "UNKNOWN_TOOL" };
      }
      messages.push({
        role: "tool", tool_call_id: call.id || name + "-" + round + "-" + i,
        name: name, content: JSON.stringify(result),
      });
    }
  }
  if (loopLimited) finalMessage = { role: "assistant", content: JSON.stringify({
    mode: "answer", message: "I could not finish the tool workflow safely. Please narrow the request and try again.",
    evidence: [{ type: "tool-loop-limit", detail: "The model exceeded six tool rounds." }], confidence: 0,
  }) };
  var unique = [], signatures = new Set();
  successfulProposals.forEach(function(entry) {
    var signature = proposalSignature(entry.proposal);
    if (!signatures.has(signature)) { signatures.add(signature); unique.push(entry.proposal); }
  });
  var proposal = unique.length === 1 ? unique[0] : null;
  var decision = decisionOf(finalMessage);
  if (unique.length > 1) {
    var targets = unique.map(proposalTarget);
    if (new Set(targets).size === targets.length) proposal = batchProposal(unique);
    else {
      decision = normalizeTutorDecision({
        mode: "ask", question: "Which version should I preview?",
        options: unique.slice(0, 4).map(function (_entry, index) { return "Option " + (index + 1); }),
        evidence: [{ type: "multiple-proposals", detail: "Several previews modify the same target." }], confidence: 1,
      });
    }
  }
  if (proposal && shouldAskBeforeAction(decision.confidence, false)) {
    proposal = null;
    decision = normalizeTutorDecision({
      mode: "ask",
      question: decision.question || "I am not confident enough about the target or dimensions yet. What should I clarify before preparing the change?",
      options: decision.options,
      evidence: decision.evidence.concat([{ type: "confidence-gate", detail: "The proposal confidence was below 0.85." }]),
      confidence: decision.confidence,
    });
  }
  return { message: finalMessage, decision: decision, proposal: proposal };
}

function webMcpHost() {
  if (typeof document !== "undefined" && document.modelContext) return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext) return navigator.modelContext;
  if (typeof window !== "undefined" && window.modelContext) return window.modelContext;
  return null;
}

export function installAgentBridge() {
  var api = Object.freeze({ context: projectAgentContext, commands: plannerCommandManifest, preview: previewPlannerCommand });
  window.ModelForgeAgent = api;
  var host = webMcpHost();
  if (host && typeof host.registerTool === "function") {
    AGENT_TOOLS.forEach(function (entry) {
      var name = "modelforge_" + entry.function.name.replace(/^get_(?:app_)?/, "");
      var definition = {
        name: name, description: entry.function.description, inputSchema: entry.function.parameters,
        annotations: { readOnlyHint: entry.readOnly, destructiveHint: false, idempotentHint: true },
      };
      try {
        host.registerTool(definition, function (args) {
          if (entry.function.name === "preview_model_command") return api.preview(args.commandId, args.params);
          return executeAgentTool(entry.function.name, args || {}, {});
        });
      } catch (error) {
        window.dispatchEvent(new CustomEvent("agent-webmcp-error", { detail: { name: name, message: String(error && error.message || error) } }));
      }
    });
  }
  return api;
}
