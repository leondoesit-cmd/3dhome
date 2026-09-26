import { sendAgentChat } from "./agent_transport.js";
import {
  projectAgentContext, queryAgentObjects, searchAgentTools, getAgentHistorySummary,
  getAgentObjectHistory, compareAgentHistory, searchAgentCatalog, livePlacementScene,
} from "./agent_context.js";
import { plannerCommandManifest } from "./commands/index.js";
import { previewPlannerCommand } from "./interaction.js";
import { normalizeTutorDecision } from "./tutor/policy.js";
import { buildAgentSystemPrompt, operationsFromAssistantContent, structuredAssistantContent } from "./agent_prompt.js";
import { placementBatchFitsScene, resolvePlacementIntent } from "./placement_resolver.js";

/* AI previews skip the work-set rule (layers.js aiCanMove): the owner exempted
   the AI, since every change it proposes is confirmed before it applies. */
const AI = Object.freeze({ ai: true });

function tool(name, description, parameters, readOnly) {
  return { type: "function", function: { name: name, description: description, parameters: parameters }, readOnly: !!readOnly };
}
const EMPTY_SCHEMA = { type: "object", properties: {}, additionalProperties: false };
const LIMIT_SCHEMA = { type: "integer", minimum: 1, maximum: 500 };
const OFFSET_SCHEMA = { type: "integer", minimum: 0 };

export const AGENT_TOOLS = Object.freeze([
  tool("get_project_summary", "Read compact live ModelForge state including descriptive walls, item centers/bounds, interaction, warnings, attention, mastery and context budgets.", EMPTY_SCHEMA, true),
  tool("get_app_context", "Read detailed ModelForge context. Prefer focused read tools when possible.", {
    type: "object", properties: { includeEntities: { type: "boolean" }, includeHistory: { type: "boolean" }, entityLimit: LIMIT_SCHEMA, historyLimit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("query_objects", "Read model objects by kind and optional stable IDs. Walls include from/to in cm; items include label and AABB bounds.", {
    type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["nodes", "walls", "openings", "items", "markers", "slabOpenings", "wallConstraints", "roomConstraints", "planVariables", "mepNodes", "mepRuns"] }, ids: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } }, limit: LIMIT_SCHEMA, offset: OFFSET_SCHEMA }, additionalProperties: false,
  }, true),
  tool("search_app_tools", "Search every curated app capability, including help, location, availability and linked model commands.", {
    type: "object", properties: { query: { type: "string" }, limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("get_history_summary", "Read recent history nodes and their affected objects.", {
    type: "object", properties: { limit: LIMIT_SCHEMA, offset: OFFSET_SCHEMA }, additionalProperties: false,
  }, true),
  tool("get_object_history", "Read history for one object such as wall:42.", {
    type: "object", required: ["objectId"], properties: { objectId: { anyOf: [{ type: "string" }, { type: "number" }] }, kind: { type: "string" }, limit: LIMIT_SCHEMA, offset: OFFSET_SCHEMA }, additionalProperties: false,
  }, true),
  tool("compare_history_nodes", "Compare the objects touched by two history nodes.", {
    type: "object", required: ["from", "to"], properties: { from: { anyOf: [{ type: "string" }, { type: "number" }] }, to: { anyOf: [{ type: "string" }, { type: "number" }] } }, additionalProperties: false,
  }, true),
  tool("search_catalog", "Search the furniture catalog and read placement dimensions.", {
    type: "object", properties: { query: { type: "string" }, limit: LIMIT_SCHEMA }, additionalProperties: false,
  }, true),
  tool("list_model_commands", "List commands that can safely create or modify model entities.", EMPTY_SCHEMA, true),
  tool("preview_model_command", "Validate and preview one model-changing command. Call once per independent action. Never paste this JSON in chat. It cannot execute; the user must confirm in trusted UI.", {
    type: "object", required: ["commandId", "params"],
    properties: {
      commandId: { type: "string", enum: ["opening.place", "wall.draw", "item.place", "item.duplicate", "item.move", "room.create"] },
      params: { type: "object", description: "JSON parameters matching the selected command" },
    }, additionalProperties: false,
  }, true),
  tool("preview_item_snap", "Snap or rotate one existing item using live geometry. Use this for wall snaps, beside-item placement, and facing (into-room, west/east/north/south). Omit face on a wall snap to preview both keep-facing and face-into-room. Do not compute x/z yourself.", {
    type: "object", required: ["itemId"],
    properties: {
      itemId: { anyOf: [{ type: "string" }, { type: "number" }] },
      wall: { type: "string", enum: ["left", "right", "top", "bottom"] },
      beside: { type: "object", properties: {
        itemId: { anyOf: [{ type: "string" }, { type: "number" }] },
        side: { type: "string", enum: ["left", "right", "above", "below"] },
      }, required: ["itemId", "side"], additionalProperties: false },
      face: { type: "string", enum: ["keep", "into-room", "both", "west", "east", "north", "south"] },
    }, anyOf: [{ required: ["wall"] }, { required: ["beside"] }, { required: ["face"] }], additionalProperties: false,
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
  var content = contentText(message && message.content), parsed = structuredAssistantContent(content);
  return normalizeTutorDecision(parsed, content);
}
function directMutationRequest(conversation) {
  var latest = (conversation || []).slice().reverse().find(function(entry) {
    return entry && entry.role === "user";
  });
  var text = String(latest && latest.content || "").trim();
  if (!text) return false;
  return /\b(move|snap|place|put|rotate|turn|align|draw|create|add|duplicate)\b/i.test(text) ||
    /\b(?:to|on) the (?:left|right|north|south|top|bottom) of\b|\b(?:against|beside|next to)\b/i.test(text) ||
    /(הזז|העבר|הצמד|מקם|שים|סובב|יישר|צור|הוסף|שכפל|מימין ל|משמאל ל|ליד|לקיר)/.test(text);
}
function latestUserText(conversation) {
  var latest = (conversation || []).slice().reverse().find(function(entry) {
    return entry && entry.role === "user";
  });
  return String(latest && latest.content || "").trim();
}
function initialMutationTools(conversation) {
  var text = latestUserText(conversation);
  var semantic = /\b(snap|against|beside|next to|to the (?:left|right) of|face|facing)\b/i.test(text) ||
    /(הצמד|ליד|מימין ל|משמאל ל|לקיר|פונה|סובב)/.test(text);
  var names = semantic ? ["preview_item_snap"] : ["preview_model_command"];
  return AGENT_TOOLS.filter(function(entry) { return names.includes(entry.function.name); });
}
function leanLocalContext(context) {
  var lean = Object.assign({}, context);
  delete lean.entities;
  delete lean.entityTruncation;
  delete lean.history;
  delete lean.historyTruncation;
  delete lean.capabilities;
  if (lean.workspace) lean.workspace = Object.assign({}, lean.workspace, {
    floors: (lean.workspace.floors || []).map(function(floor) {
      return { id: floor.id, name: floor.name, elevation: floor.elevation, height: floor.height };
    }),
  });
  if (lean.projectSettings) lean.projectSettings = {
    northAngle: lean.projectSettings.northAngle,
    activeLevel: lean.projectSettings.activeLevel,
    snapping: lean.projectSettings.snapping,
  };
  lean.dataAccess = "Use query_objects, history, catalog, and app-tool search tools for omitted detail.";
  return lean;
}
function boundedConversation(conversation, local) {
  var limit = local ? 10 : 24;
  return (conversation || []).slice(-limit).map(function(entry) {
    if (!entry || typeof entry !== "object") return entry;
    var copy = Object.assign({}, entry);
    if (typeof copy.content === "string") copy.content = copy.content.slice(-2400);
    return copy;
  });
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
function choiceProposal(proposals) {
  var visible = proposals.slice(0, 4);
  return {
    ok: true,
    commandId: "choices",
    choices: visible,
    totalChoices: proposals.length,
    truncatedChoices: Math.max(0, proposals.length - visible.length),
    preview: { kind: "choice-carousel", previews: visible.map(function(entry) { return entry.preview; }) },
  };
}
function assembleProposal(unique) {
  if (!unique.length) return null;
  var byTarget = {}, order = [];
  unique.forEach(function (proposal) {
    var target = proposalTarget(proposal);
    if (!byTarget[target]) { byTarget[target] = []; order.push(target); }
    byTarget[target].push(proposal);
  });
  var useFacingCombos = order.some(function (target) {
    var poses = byTarget[target];
    return poses.length > 1 && poses.some(function (entry) {
      return entry.choiceLabelKey === "keep" || entry.choiceLabelKey === "face-room";
    });
  });
  if (useFacingCombos) {
    var keepCombo = [], faceCombo = [], hasFaceChoice = false;
    order.forEach(function (target) {
      var poses = byTarget[target];
      var keep = poses.find(function (entry) { return entry.choiceLabelKey === "keep"; })
        || poses.find(function (entry) { return entry.choiceLabelKey !== "face-room"; })
        || poses[0];
      var face = poses.find(function (entry) { return entry.choiceLabelKey === "face-room"; }) || keep;
      keepCombo.push(keep);
      faceCombo.push(face);
      if (proposalSignature(keep) !== proposalSignature(face)) hasFaceChoice = true;
    });
    if (hasFaceChoice) {
      var a = keepCombo.length === 1 ? keepCombo[0] : batchProposal(keepCombo);
      var b = faceCombo.length === 1 ? faceCombo[0] : batchProposal(faceCombo);
      a.choiceLabelKey = "keep";
      b.choiceLabelKey = "face-room";
      return choiceProposal([a, b]);
    }
  }
  if (unique.length === 1) return unique[0];
  if (order.length === 1) return choiceProposal(byTarget[order[0]]);
  return batchProposal(unique);
}
function validatedPlacementProposal(proposal) {
  if (!proposal) return null;
  if (Array.isArray(proposal.choices)) {
    var choices = proposal.choices.map(validatedPlacementProposal).filter(Boolean);
    if (!choices.length) return null;
    if (choices.length === 1) return choices[0];
    proposal.choices = choices;
    proposal.preview = { kind: "choice-carousel", previews: choices.map(function(entry) { return entry.preview; }) };
    return proposal;
  }
  var commands = Array.isArray(proposal.commands) ? proposal.commands : [proposal];
  var semantic = commands.filter(function(entry) {
    return entry && entry.commandId === "item.move" && entry.plan && entry.plan.params && entry.plan.params.placementGuard;
  }).map(function(entry) {
    var params = entry.plan.params;
    return { itemId: params.itemId, x: params.to.x, z: params.to.z,
      rot: params.rotationSpecified ? params.rotation : null };
  });
  if (semantic.length > 1 && !placementBatchFitsScene(livePlacementScene(), semantic)) return null;
  return proposal;
}
function previewMove(move) {
  var params = { itemId: move.itemId, x: move.x, z: move.z, floorId: move.floorId };
  if (move.rotationSpecified) {
    params.rot = move.rot;
    params.rotationProvenance = move.rotationProvenance || "explicit";
  }
  if (move.holdWallId != null) params.holdWallId = move.holdWallId;
  if (move.placementGuard) params.placementGuard = move.placementGuard;
  var result = previewPlannerCommand("item.move", params, AI);
  if (result && result.ok && move.choiceLabelKey) result.choiceLabelKey = move.choiceLabelKey;
  return result;
}
function snapProposal(args, options) {
  var resolved = resolvePlacementIntent(args, livePlacementScene(), options);
  if (!resolved || !resolved.ok) return resolved || { ok: false, reason: "INVALID_ITEM_POSITION" };
  var proposals = (resolved.moves || []).map(previewMove).filter(function(entry) { return entry && entry.ok; });
  if (!proposals.length) return { ok: false, reason: "INVALID_ITEM_POSITION" };
  var proposal = assembleProposal(proposals);
  if ((resolved.moves || []).some(function(move) { return move.hostWallId != null && move.holdWallId == null; })) {
    proposals.forEach(function(entry) { entry.warnings = ["CURVED_WALL_HOLD_UNSUPPORTED"]; });
    proposal.warnings = ["CURVED_WALL_HOLD_UNSUPPORTED"];
  }
  return proposal;
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
  if (name === "preview_model_command") return previewPlannerCommand(args.commandId, args.params, AI);
  if (name === "preview_item_snap") return snapProposal(args);
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
    compact: false, entityLimit: 80, historyLimit: 20, capabilityDetail: false,
  }));
  var localModel = config.provider === "lmstudio" || config.provider === "ollama";
  if (localModel) context = leanLocalContext(context);
  var system = { role: "system", content: buildAgentSystemPrompt(context) };
  var messages = [system].concat(boundedConversation(conversation, localModel));
  var successfulProposals = [], previewFailures = [], finalMessage = null, loopLimited = true;
  var metrics = { inputTokens: 0, outputTokens: 0, generationMs: 0, timeToFirstTokenMs: null };
  var gemini = config.provider === "gemini" || /generativelanguage\.googleapis\.com/i.test(config.endpoint || "");
  var forceMutationTool = config.provider !== "ollama" && directMutationRequest(conversation);
  function progress(detail) {
    if (typeof options.onProgress === "function") options.onProgress(detail);
  }
  for (var round = 0; round < 6; round++) {
    var forceThisRound = forceMutationTool && round < 3 && !successfulProposals.length;
    var chatOptions = Object.assign({}, options, {
      toolChoice: forceThisRound ? "required" : "auto",
    });
    var roundTools = forceThisRound ? initialMutationTools(conversation) : AGENT_TOOLS;
    var response = await sendAgentChat(config, messages, roundTools.map(function (entry) {
      return { type: entry.type, function: entry.function };
    }), chatOptions);
    if (response.metrics) {
      metrics.inputTokens += response.metrics.inputTokens || 0;
      metrics.outputTokens += response.metrics.outputTokens || 0;
      metrics.generationMs += response.metrics.generationMs || 0;
      if (metrics.timeToFirstTokenMs == null && response.metrics.timeToFirstTokenMs != null)
        metrics.timeToFirstTokenMs = response.metrics.timeToFirstTokenMs;
    }
    var message = response.message || { role: "assistant", content: "" };
    messages.push(message);
    var calls = toolCalls(message);
    if (!calls.length) { finalMessage = message; loopLimited = false; break; }
    var roundProposals = [], roundFailures = [], hadPreviewCall = false;
    var jointSnapTargets = calls.filter(function(call) {
      return call && call.function && call.function.name === "preview_item_snap";
    }).map(function(call) { return argsOf(call).itemId; }).filter(function(id) { return id != null; });
    for (var i = 0; i < calls.length; i++) {
      var call = calls[i], name = call.function && call.function.name, args = argsOf(call), result;
      progress({ phase: "tool", current: i + 1, total: calls.length, name: name || "tool" });
      if (name === "preview_model_command") {
        hadPreviewCall = true;
        result = previewPlannerCommand(args.commandId, args.params, AI);
        if (result.ok) roundProposals.push({ callId: call.id || "preview-" + round + "-" + i, proposal: result });
        else roundFailures.push({ callId: call.id || "preview-" + round + "-" + i,
          name: name, reason: result.reason || "PREVIEW_FAILED" });
      } else if (name === "preview_item_snap") {
        hadPreviewCall = true;
        result = snapProposal(args, { ignoreItemIds: jointSnapTargets.filter(function(id) {
          return String(id) !== String(args.itemId);
        }) });
        if (result && result.ok) {
          var entries = Array.isArray(result.choices) ? result.choices
            : Array.isArray(result.commands) ? result.commands : [result];
          entries.forEach(function(proposal, index) {
            roundProposals.push({ callId: (call.id || "snap") + "-" + index, proposal: proposal });
          });
        } else roundFailures.push({ callId: call.id || "snap-" + round + "-" + i,
          name: name, reason: result && result.reason || "PREVIEW_FAILED" });
      } else {
        var read = executeAgentTool(name, args, contextOptions);
        result = read != null ? read : { ok: false, reason: "UNKNOWN_TOOL" };
      }
      messages.push({
        role: "tool", tool_call_id: call.id || name + "-" + round + "-" + i,
        name: name, content: JSON.stringify(result),
      });
    }
    /* A later preview round is a correction, not an additional alternative to
       stale earlier coordinates. Models that retry a failed batch must reissue
       the complete intended set in that round. */
    if (hadPreviewCall) {
      successfulProposals = roundProposals;
      previewFailures = roundFailures;
      if (roundProposals.length) {
        finalMessage = { role: "assistant", content: "" };
        loopLimited = false;
        break;
      }
    }
  }
  if (loopLimited) finalMessage = { role: "assistant", content: JSON.stringify({
    mode: "answer", message: "I could not finish the tool workflow safely. Please narrow the request and try again.",
    evidence: [{ type: "tool-loop-limit", detail: "The model exceeded six tool rounds." }], confidence: 0,
  }) };
  if (!successfulProposals.length && finalMessage) {
    operationsFromAssistantContent(contentText(finalMessage && finalMessage.content)).forEach(function (op, index) {
      var recovered = previewPlannerCommand(op.commandId, op.params, AI);
      if (recovered && recovered.ok)
        successfulProposals.push({ callId: "recovered-" + index, proposal: recovered });
    });
  }
  progress({ phase: "preview" });
  var unique = [], signatures = new Set();
  successfulProposals.forEach(function(entry) {
    var proposal = entry.proposal;
    var signature = proposalSignature(proposal);
    if (!signatures.has(signature)) { signatures.add(signature); unique.push(proposal); }
  });
  var decision = decisionOf(finalMessage);
  var assembledProposal = assembleProposal(unique);
  var proposal = validatedPlacementProposal(assembledProposal);
  var proposalFailure = assembledProposal && !proposal
    ? { reason: "JOINT_PLACEMENT_CONFLICT" } : null;
  if (proposal) {
    var warnings = Array.from(new Set(unique.flatMap(function(entry) { return entry.warnings || []; })));
    if (warnings.length) proposal.warnings = warnings;
  }
  if (proposal && previewFailures.length) {
    proposal.incomplete = true;
    proposal.failures = previewFailures.slice();
  }
  /* A successfully prepared command has already been resolved and validated
     against the live document. Model confidence must not hide that concrete
     ghost: trusted UI confirmation is the user's final judgement. */
  metrics.tokensPerSecond = metrics.outputTokens && metrics.generationMs
    ? metrics.outputTokens / (metrics.generationMs / 1000) : null;
  progress(Object.assign({ phase: "complete" }, metrics));
  return { message: finalMessage, decision: decision, proposal: proposal,
    proposalFailure: proposalFailure, metrics: metrics };
}

function webMcpHost() {
  if (typeof document !== "undefined" && document.modelContext) return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext) return navigator.modelContext;
  if (typeof window !== "undefined" && window.modelContext) return window.modelContext;
  return null;
}

export function installAgentBridge() {
  var api = Object.freeze({ context: projectAgentContext, commands: plannerCommandManifest,
    preview: function (commandId, params) { return previewPlannerCommand(commandId, params, AI); } });
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
        var execute = function (args) {
          var result = entry.function.name === "preview_model_command"
            ? api.preview(args.commandId, args.params)
            : executeAgentTool(entry.function.name, args || {}, {});
          if ((entry.function.name === "preview_model_command" || entry.function.name === "preview_item_snap") &&
              result && result.ok)
            window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: result }));
          return result;
        };
        /* Current WebMCP hosts read execute from the registration object;
           the second argument keeps older adapters and our embeddable bridge
           compatible during the transition. */
        host.registerTool(Object.assign({}, definition, { execute: execute }), execute);
      } catch (error) {
        window.dispatchEvent(new CustomEvent("agent-webmcp-error", { detail: { name: name, message: String(error && error.message || error) } }));
      }
    });
  }
  return api;
}
