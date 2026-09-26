/* The AI helper in the model editor and the cabinet designer (the planner has
 * its own, js/agent_runtime.js). Same rules as the planner's:
 *
 *   - it only prepares: every change is a proposal the user reads and applies
 *     in the bar's card (js/editor_agent_ui.js), never something it did;
 *   - it names what it picked (the tool, the column and compartment, the size
 *     from → to) so the choice can be judged before Apply;
 *   - AI off, or no model configured, and the editor is fully manual.
 *
 * Each editor registers an adapter:
 *
 *   registerEditorAgent("cab", {
 *     name:    "cabinet designer",
 *     guide:   ["rule for the model", …],
 *     state()  -> plain JSON of the live document,
 *     tools:   [extra proposal tools, OpenAI function format],
 *     preview(name, args) -> { ok, reason } | { ok: true, kind, lines: [...], … },
 *     apply(proposal)     -> { ok, reason, steps }   steps: undo steps it made
 *     focus(proposal), clear(), undo()   (optional)
 *   })
 *
 * The shared tools are read-only (the editor's state and its command catalog)
 * plus propose_command, which proposes opening one of the editor's own tools
 * — the honest answer when the work needs a form the user fills in by hand.
 *
 * The transport is injectable (options.send) so tests run the loop without a
 * network; the browser uses sendAgentChat from js/agent_transport.js. */
import { proTools, proLabel } from "./pro_catalog.js";

var adapters = {};
export function registerEditorAgent(editor, adapter) { adapters[editor] = adapter; }
export function editorAgent(editor) { return adapters[editor] || null; }

function tool(name, description, parameters) {
  return { type: "function", function: { name: name, description: description, parameters: parameters } };
}
var COMMON_TOOLS = [
  tool("get_editor_state", "Read the live document of this editor: what is open, its parts, sizes and the current selection.",
    { type: "object", properties: {}, additionalProperties: false }),
  tool("search_editor_commands", "Search this editor's own commands by name or purpose. Returns exact command labels.",
    { type: "object", properties: { query: { type: "string" } }, additionalProperties: false }),
  tool("propose_command", "Propose opening one of this editor's commands by its exact label (from search_editor_commands). Use when the change needs the command's own form; say in `values` what to enter there. It does not run; the user confirms.",
    { type: "object", required: ["label"], properties: { label: { type: "string" }, values: { type: "string", description: "What to enter in the command's form, e.g. \"radius 8 mm on the four top edges\"" } }, additionalProperties: false }),
];

/* The editor's commands the AI may name: every catalog entry with a binding. */
export function editorCommands(editor) {
  return proTools(editor).filter(function (t) { return t.bind; });
}
export function searchEditorCommands(editor, query) {
  var q = String(query || "").trim().toLowerCase(), all = editorCommands(editor);
  var hits = q ? all.filter(function (t) {
    return (t.label + " " + t.group + " " + t.tab).toLowerCase().indexOf(q) >= 0 || proLabel(t.label, "he").indexOf(q) >= 0;
  }) : all;
  return hits.slice(0, 40).map(function (t) { return { label: t.label, group: t.group, tab: t.tab }; });
}
export function commandProposal(editor, args) {
  var label = String(args && args.label || "").trim().toLowerCase();
  var hit = editorCommands(editor).find(function (t) { return t.label.toLowerCase() === label; });
  if (!hit) return { ok: false, reason: "UNKNOWN_COMMAND", hint: "Use search_editor_commands for exact labels." };
  var values = String(args.values || "").trim().slice(0, 200);
  return { ok: true, kind: "command", label: hit.label, group: hit.group, values: values, undoable: false };
}

export function editorSystemPrompt(editor, adapter, state) {
  return [
    "You are the ModelForge " + adapter.name + " assistant. The live document is truth.",
    "",
    "How you act:",
    "- You only prepare changes with the propose_* tools. Nothing changes until the user presses Apply, so never say a change was made.",
    "- Prefer a proposal that changes the document directly; propose_command only when the change needs that command's own form.",
    "- Independent changes in one request are separate proposal calls in the same turn.",
    "- If nothing fits, propose nothing and say in one sentence which command does it by hand.",
    "- Reply in the user's language with one short sentence naming what you picked. No JSON in the reply.",
  ].concat(adapter.guide || []).join("\n") + "\n\nLive document:\n" + JSON.stringify(state == null ? {} : state);
}

function argsOf(call) {
  var raw = call && call.function && call.function.arguments;
  if (raw && typeof raw === "object") return raw;
  try { return JSON.parse(raw || "{}"); } catch (_) { return {}; }
}
function contentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(function (part) { return part && part.text || ""; }).join("\n");
  return "";
}

/* One request, up to five rounds of tool calls. Returns the model's sentence
   and the proposals that validated against the live document; proposals that
   failed are reported to the model so it can correct them in the next round,
   and to the caller so the card can say what could not be prepared. */
export async function runEditorAgentTurn(editor, text, config, options) {
  options = options || {};
  var adapter = adapters[editor];
  if (!adapter) return { ok: false, reason: "NO_EDITOR_AGENT", proposals: [], failures: [] };
  var send = options.send;
  if (!send) send = (await import("./agent_transport.js")).sendAgentChat;
  var tools = COMMON_TOOLS.concat(adapter.tools || []);
  var messages = [
    { role: "system", content: editorSystemPrompt(editor, adapter, adapter.state()) },
    { role: "user", content: String(text || "").trim() },
  ];
  var proposals = [], failures = [], reply = "", signatures = new Set();
  for (var round = 0; round < 5; round++) {
    var response = await send(config, messages, tools, { toolChoice: "auto", signal: options.signal });
    var message = response && response.message || { role: "assistant", content: "" };
    messages.push(message);
    var calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    if (!calls.length) { reply = contentText(message.content).trim(); break; }
    var proposed = false;
    calls.forEach(function (call, i) {
      var name = call.function && call.function.name, args = argsOf(call), result;
      if (name === "get_editor_state") result = adapter.state();
      else if (name === "search_editor_commands") result = searchEditorCommands(editor, args.query);
      else if (/^propose_/.test(name)) {
        proposed = true;
        result = name === "propose_command" ? commandProposal(editor, args) : adapter.preview(name, args);
        if (!result) result = { ok: false, reason: "UNKNOWN_TOOL" };
        if (result.ok) {
          var signature = JSON.stringify([name, args]);
          if (!signatures.has(signature)) { signatures.add(signature); proposals.push(result); }
        } else failures.push({ name: name, reason: result.reason || "PREVIEW_FAILED" });
      } else result = { ok: false, reason: "UNKNOWN_TOOL" };
      messages.push({ role: "tool", tool_call_id: call.id || name + "-" + round + "-" + i, name: name,
        content: JSON.stringify(result && result.ok ? { ok: true, lines: result.lines || [result.label] } : result) });
    });
    // proposals made: one more round lets the model say its sentence, no more
    if (proposed && proposals.length) {
      var closing = await send(config, messages, tools, { toolChoice: "none", signal: options.signal }).catch(function () { return null; });
      reply = closing && closing.message ? contentText(closing.message.content).trim() : "";
      break;
    }
  }
  // a model that answers with JSON anyway must not put it on screen
  if (/^[\[{]/.test(reply)) reply = "";
  return { ok: true, reply: reply.slice(0, 400), proposals: proposals, failures: failures };
}
