import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

test("AI helper has connection settings, projected context, and a separate dock", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      document.getElementById("btn_settings").click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const tabs = [...document.querySelectorAll(".settings-tabs button")];
      tabs.find((button) => button.textContent.includes("AI agent")).click();
      const settings = {
        provider: !!document.querySelector(".settings-agent-pane select"),
        endpoint: [...document.querySelectorAll(".settings-agent-pane input")].some((input) => input.placeholder.includes("localhost")),
        confirmationCopy: document.querySelector(".agent-settings-intro").textContent.includes("require confirmation"),
      };
      document.querySelector(".modal .modal-close, .modal button[aria-label='Close']")?.click();
      document.getElementById("agentBtn").click();
      const bridge = window.ModelForgeAgent;
      const registered = [];
      document.modelContext = { registerTool(definition) { registered.push(definition); } };
      (await import("/js/agent_runtime.js")).installAgentBridge();
      return {
        settings,
        dockOpen: document.getElementById("agent-dock").classList.contains("on"),
        friendsSeparate: !!document.getElementById("chat-dock"),
        commands: bridge.commands().map((entry) => entry.id),
        context: bridge.context({ includeEntities: false, includeHistory: false }),
        webMcp: registered.map((entry) => ({ name: entry.name, readOnly: entry.annotations && entry.annotations.readOnlyHint })),
      };
    });
    assert.deepEqual(result.settings, { provider: true, endpoint: true, confirmationCopy: true });
    assert.equal(result.dockOpen, true);
    assert.equal(result.friendsSeparate, true);
    assert.deepEqual(result.commands, ["item.duplicate", "item.move", "item.place", "opening.place", "room.create", "wall.draw"]);
    assert.equal(result.context.domain, "planner");
    assert.ok(Array.isArray(result.context.capabilities));
    assert.equal(result.context.workspace.role, "owner");
    assert.ok(result.context.attention);
    assert.ok(result.context.mastery);
    assert.ok(result.webMcp.some((entry) => entry.name === "modelforge_project_summary" && entry.readOnly));
  } finally { await page.close(); }
});

test("agent tool call previews without mutation and executes only after confirmation", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const previewUi = await import("/js/agent_preview.js");
      const before = { walls: state.S.walls.length, nodes: state.S.nodes.length, idc: state.S.idc };
      let call = 0, sawFullContext = false;
      const fake = async (_url, options) => {
        const request = JSON.parse(options.body);
        sawFullContext = sawFullContext || /\"entities\"/.test(request.messages[0].content) &&
          /\"history\"/.test(request.messages[0].content) && /\"capabilities\"/.test(request.messages[0].content);
        return ({
        ok: true,
        status: 200,
        json: async () => call++ === 0 ? {
          choices: [{ message: {
            role: "assistant", content: "",
            tool_calls: [{ id: "preview-1", type: "function", function: {
              name: "preview_model_command",
              arguments: JSON.stringify({ commandId: "room.create", params: { from: { x: 1000, z: 1000 }, to: { x: 1300, z: 1200 } } }),
            } }],
          } }],
        } : { choices: [{ message: { role: "assistant", content: JSON.stringify({ mode: "propose", message: "I prepared the room for confirmation.", evidence: [{ type: "user-request", detail: "A 3 by 2 metre room was requested." }], confidence: 1, proposedOperations: [{ commandId: "room.create", params: { from: { x: 1000, z: 1000 }, to: { x: 1300, z: 1200 } } }] }) } }] },
        });
      };
      const turn = await runtime.runAgentTurn(
        { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", includeEntities: true, includeHistory: true, includeTutorial: true },
        [{ role: "user", content: "Create a 3 by 2 metre room" }],
        { fetch: fake },
      );
      const afterPreview = { walls: state.S.walls.length, nodes: state.S.nodes.length, idc: state.S.idc };
      const bridgeCanExecute = typeof window.ModelForgeAgent.executeConfirmed === "function";
      previewUi.renderAgentPreview(turn.proposal.preview);
      const visualPreview = !!document.querySelector(".agent-canvas-preview .agent-preview-room");
      state.S.workspace.role = "viewer";
      const denied = interaction.executePlannerProposal(turn.proposal);
      state.S.workspace.role = "owner";
      const applied = interaction.executePlannerProposal(turn.proposal);
      return {
        before, afterPreview,
        proposal: { commandId: turn.proposal.commandId, kind: turn.proposal.preview.kind },
        applied: applied.ok, bridgeCanExecute, visualPreview, denied: denied.reason,
        afterApply: { walls: state.S.walls.length, nodes: state.S.nodes.length, idc: state.S.idc },
        sawFullContext,
      };
    });
    assert.deepEqual(result.afterPreview, result.before, "tool call only previews");
    assert.deepEqual(result.proposal, { commandId: "room.create", kind: "room" });
    assert.equal(result.applied, true);
    assert.equal(result.bridgeCanExecute, false);
    assert.equal(result.visualPreview, true);
    assert.equal(result.denied, "PERMISSION_DENIED");
    assert.equal(result.sawFullContext, true);
    assert.equal(result.afterApply.walls, result.before.walls + 4);
    assert.ok(result.afterApply.idc > result.before.idc);
  } finally { await page.close(); }
});

test("item move shows only a ghost and Yes, Cancel, How to fix before applying", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const id = state.S.idc++;
      state.S.items.push({ id, type: "fridge", x: 355, z: 55, w: 75, d: 75, h: 190, rot: 0 });
      const proposal = interaction.previewPlannerCommand("item.move", {
        itemId: id, deltaX: -50, deltaZ: 0,
      });
      window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: proposal }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const card = document.querySelector(".agent-proposal");
      const before = state.S.items.find((item) => item.id === id).x;
      const buttons = [...card.querySelectorAll("button")].map((button) => button.textContent.trim());
      const assistantLines = document.querySelectorAll("#agentMessages .agent-assistant").length;
      const ghost = {
        origin: !!document.querySelector(".agent-preview-origin"),
        destination: !!document.querySelector(".agent-preview-destination"),
      };
      [...card.querySelectorAll("button")].find((button) => button.textContent.trim() === "Yes").click();
      const after = state.S.items.find((item) => item.id === id).x;
      return { before, after, buttons, assistantLines, ghost, cardText: card.textContent.trim() };
    });
    assert.equal(result.before, 355);
    assert.equal(result.after, 305);
    assert.deepEqual(result.buttons, ["Yes", "Cancel", "How to fix"]);
    assert.equal(result.assistantLines, 0);
    assert.deepEqual(result.ghost, { origin: true, destination: true });
    assert.equal(result.cardText, "Applied");
  } finally { await page.close(); }
});

test("two requested moves become one two-ghost atomic confirmation", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const history = await import("/js/history.js");
      const tvId = state.S.idc++, fridgeId = state.S.idc++;
      state.S.items.push(
        { id: tvId, type: "tv", x: 100, z: 100, w: 120, d: 12, h: 75, rot: 0 },
        { id: fridgeId, type: "fridge", x: 355, z: 55, w: 75, d: 75, h: 190, rot: 0 },
      );
      let call = 0;
      const fake = async () => ({ ok: true, status: 200, json: async () => call++ === 0 ? {
        choices: [{ message: { role: "assistant", content: "", tool_calls: [
          { id: "tv-move", type: "function", function: { name: "preview_model_command", arguments: JSON.stringify({ commandId: "item.move", params: { itemId: tvId, x: 800, z: 100 } }) } },
          { id: "fridge-move", type: "function", function: { name: "preview_model_command", arguments: JSON.stringify({ commandId: "item.move", params: { itemId: fridgeId, deltaX: -50 } }) } },
        ] } }] } : {
        choices: [{ message: { role: "assistant", content: JSON.stringify({ mode: "propose", message: "", confidence: 1, evidence: [], proposedOperations: [] }) } }],
      } });
      const turn = await runtime.runAgentTurn(
        { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true,
          includeEntities: true, includeHistory: true, includeTutorial: true, includeAttention: true },
        [{ role: "user", content: "move both items" }], { fetch: fake },
      );
      window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: turn.proposal }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const card = document.querySelector(".agent-proposal");
      const destinations = document.querySelectorAll(".agent-preview-destination").length;
      [...card.querySelectorAll("button")].find((button) => button.textContent.trim() === "Yes").click();
      const applied = {
        commandId: turn.proposal && turn.proposal.commandId,
        commandCount: turn.proposal && turn.proposal.commands.length,
        destinations,
        tvX: state.S.items.find((item) => item.id === tvId).x,
        fridgeX: state.S.items.find((item) => item.id === fridgeId).x,
      };
      history.undo();
      applied.afterOneUndo = {
        tvX: state.S.items.find((item) => item.id === tvId).x,
        fridgeX: state.S.items.find((item) => item.id === fridgeId).x,
      };
      return applied;
    });
    assert.deepEqual(result, {
      commandId: "batch", commandCount: 2, destinations: 2,
      tvX: 800, fridgeX: 305, afterOneUndo: { tvX: 100, fridgeX: 355 },
    });
  } finally { await page.close(); }
});
