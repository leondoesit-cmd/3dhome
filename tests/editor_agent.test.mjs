// The AI helper of the model editor and the cabinet designer (js/editor_agent.js):
// it only prepares proposals, names what it picked, and never applies anything.
import { modelerSource } from "./helpers/modeler_source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerEditorAgent, runEditorAgentTurn, commandProposal, searchEditorCommands, editorSystemPrompt } from "../js/editor_agent.js";

const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// A fake model: each call returns the next scripted assistant message.
function script(...replies) {
  const seen = [];
  const send = async (config, messages, tools, options) => {
    seen.push({ messages: messages.slice(), tools: tools.map((t) => t.function.name), options });
    return { message: replies.shift() || { role: "assistant", content: "" } };
  };
  return { send, seen };
}
const call = (name, args, id) => ({ id: id || name, type: "function", function: { name, arguments: JSON.stringify(args) } });

let applied = [];
registerEditorAgent("test", {
  name: "test editor",
  guide: ["- test rule"],
  state: () => ({ open: true, width: 600 }),
  tools: [{ type: "function", function: { name: "propose_width", description: "", parameters: { type: "object" } } }],
  preview: (name, args) => (args.width > 0 && args.width <= 1000
    ? { ok: true, kind: "size", lines: ["width 600 → " + args.width + " mm"], width: args.width }
    : { ok: false, reason: "SIZE_OUT_OF_RANGE" }),
  apply: (p) => { applied.push(p); return { ok: true, steps: 1 }; },
});

test("a request becomes validated proposals and one sentence; nothing is applied", async () => {
  applied = [];
  const { send, seen } = script(
    { role: "assistant", content: "", tool_calls: [call("get_editor_state", {})] },
    { role: "assistant", content: "", tool_calls: [call("propose_width", { width: 800 }, "a"), call("propose_width", { width: 800 }, "b")] },
    { role: "assistant", content: "Width 800 — press Apply." },
  );
  const out = await runEditorAgentTurn("test", "make it 800 wide", { provider: "server" }, { send });
  assert.equal(out.ok, true);
  assert.equal(out.reply, "Width 800 — press Apply.");
  // the same call twice is one proposal
  assert.deepEqual(out.proposals.map((p) => p.width), [800]);
  assert.deepEqual(applied, []);
  // the system prompt carries the rules, the editor's guide and the live document
  const system = seen[0].messages[0].content;
  assert.match(system, /Nothing changes until the user presses Apply/);
  assert.match(system, /- test rule/);
  assert.match(system, /"width":600/);
  // the closing round asks for words only
  assert.equal(seen[2].options.toolChoice, "none");
});

test("a proposal that does not validate is reported to the model and to the card", async () => {
  const { send, seen } = script(
    { role: "assistant", content: "", tool_calls: [call("propose_width", { width: 5000 })] },
    { role: "assistant", content: "That is wider than this cabinet can be." },
  );
  const out = await runEditorAgentTurn("test", "5 metres wide", {}, { send });
  assert.deepEqual(out.proposals, []);
  assert.deepEqual(out.failures, [{ name: "propose_width", reason: "SIZE_OUT_OF_RANGE" }]);
  const toolMsg = seen[1].messages.find((m) => m.role === "tool");
  assert.match(toolMsg.content, /SIZE_OUT_OF_RANGE/);
  assert.equal(out.reply, "That is wider than this cabinet can be.");
});

test("a reply that is JSON never reaches the screen, and the loop is bounded", async () => {
  const json = script({ role: "assistant", content: '{"mode":"propose"}' });
  assert.equal((await runEditorAgentTurn("test", "x", {}, { send: json.send })).reply, "");
  const forever = { send: async () => ({ message: { role: "assistant", content: "", tool_calls: [call("get_editor_state", {})] } }) };
  const out = await runEditorAgentTurn("test", "x", {}, forever);
  assert.deepEqual(out.proposals, []);
  assert.equal((await runEditorAgentTurn("nope", "x", {}, forever)).reason, "NO_EDITOR_AGENT");
});

test("propose_command names a real tool of that editor, or nothing", () => {
  const fillet = commandProposal("model", { label: "fillet", values: "radius 8 mm on the top edges" });
  assert.equal(fillet.ok, true);
  assert.equal(fillet.label, "Fillet");
  assert.equal(fillet.values, "radius 8 mm on the top edges");
  assert.equal(commandProposal("model", { label: "Teleport" }).reason, "UNKNOWN_COMMAND");
  // a cabinet tool is not a model-editor command
  assert.equal(commandProposal("model", { label: "Kitchen run" }).ok, false);
  assert.ok(searchEditorCommands("cab", "partition").some((c) => c.label === "Vertical partition"));
});

test("the cabinet designer proposes sizes, compartments and doors through its own checks", () => {
  const cab = src("js/ui_cabinet_agent.js");
  // sizes through the inputs and applyOverallSize, so the size check (and its dialog) runs
  assert.match(cab, /api\.applyOverallSize\(c\.dim, input\);/);
  assert.match(src("js/ui_cabinet.js"), /api\.applyOverallSize = applyOverallSize;/);
  // compartments with the type buttons' own function; counts in the inspector's ranges
  assert.match(cab, /if \(sec\.t !== p\.type\) \{ applySecType\(p\.type\); n\+\+; \}/);
  assert.match(cab, /var COUNTED = \{ drawers: \[1, 8\], shelves: \[0, 20\], shoe: \[0, 20\], pullout: \[1, 8\] \};/);
  // every AI step is labelled for the history's AI badge
  assert.match(cab, /api\.act\("AI: " \+ c\.dim\);/);
  // Undo counts only the steps that happened: a size the designer asks about is not one
  assert.match(cab, /if \(Math\.abs\(E\.it\[CAB_LIMITS\[c\.dim\]\.field\] - c\.cm\) < 0\.05\) steps\+\+;\s*else asked = true;/);
});

test("the model editor proposes global variables through the equation path", () => {
  const md = modelerSource();
  assert.match(md, /registerEditorAgent\("model", \{/);
  assert.match(md, /var trial = modelAgentTry\(v, expr\);\s*if \(trial\.error\) return \{ ok: false, reason: "BAD_EXPRESSION"/);
  assert.match(md, /pushUndo\("AI: " \+ v\.name\);/);
});

test("the bars offer AI where an editor helper exists, and the card applies only on Apply", () => {
  const shell = src("js/pro_shell.js");
  assert.match(shell, /return editor === "plan" \? !!shell\.ask : !!\(shell\.canAskEditor && shell\.canAskEditor\(editor\)\);/);
  assert.match(shell, /shell\.askEditor && shell\.askEditor\(editor, text, bar\)/);
  const ui = src("js/editor_agent_ui.js");
  assert.match(ui, /\{ label: M\("apply"\), primary: true, run: function \(\) \{ applyAll\(editor, bar, adapter, result\.proposals\); \} \}/);
  assert.match(ui, /if \(!checked\.ok\) \{ proToast\(M\("setup"\)\); return false; \}/);
  assert.match(ui, /for \(var i = 0; i < steps; i\+\+\) adapter\.undo\(\);/);
  assert.match(src("js/pro_ribbon.js"), /import "\.\/editor_agent_ui\.js";/);
  assert.match(editorSystemPrompt("test", { name: "x" }, {}), /never say a change was made/);
});
