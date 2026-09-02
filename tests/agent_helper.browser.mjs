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
        webMcp: registered.map((entry) => ({ name: entry.name,
          readOnly: entry.annotations && entry.annotations.readOnlyHint,
          executable: typeof entry.execute === "function" })),
      };
    });
    assert.deepEqual(result.settings, { provider: true, endpoint: true, confirmationCopy: true });
    assert.equal(result.dockOpen, true);
    assert.equal(result.friendsSeparate, true);
    assert.deepEqual(result.commands, ["item.duplicate", "item.move", "item.place", "opening.place", "room.create", "wall.draw"]);
    assert.equal(result.context.domain, "planner");
    assert.ok(result.context.spatial);
    assert.ok(Array.isArray(result.context.spatial.walls));
    assert.equal("namedWalls" in result.context.spatial, false);
    assert.ok(Array.isArray(result.context.capabilities));
    assert.equal(result.context.workspace.role, "owner");
    assert.ok(result.context.attention);
    assert.ok(result.context.mastery);
    assert.ok(result.webMcp.some((entry) => entry.name === "modelforge_project_summary" && entry.readOnly && entry.executable));
  } finally { await page.close(); }
});

test("helper settings opens the agent tab and LM Studio streams visible progress metrics", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const agentConfig = await import("/js/agent_config.js");
      agentConfig.saveAgentConfig({ provider: "lmstudio", endpoint: "http://localhost:1234/v1", model: "local" });
      document.getElementById("agentBtn").click();
      document.getElementById("agentSettings").click();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const settingsOpened = !!document.querySelector(".settings-agent-pane:not([hidden])");
      document.querySelector(".modal .modal-close, .modal button[aria-label='Close']")?.click();
      const encoder = new TextEncoder();
      const originalFetch = window.fetch;
      let requestBody;
      window.fetch = async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return { ok: true, status: 200, body: new ReadableStream({
          start(controller) {
            setTimeout(() => controller.enqueue(encoder.encode(
              'data: {"choices":[{"delta":{"role":"assistant","content":"Ready"}}]}\n\n'
            )), 60);
            setTimeout(() => {
              controller.enqueue(encoder.encode(
                'data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":4,"total_tokens":44}}\n\n' +
                'data: [DONE]\n\n'
              ));
              controller.close();
            }, 130);
          },
        }) };
      };
      try {
        const input = document.getElementById("agentInput");
        input.value = "hello";
        document.getElementById("agentSend").click();
        await new Promise((resolve) => setTimeout(resolve, 25));
        const promptPhase = document.getElementById("agentProgress").dataset.phase;
        await new Promise((resolve) => setTimeout(resolve, 65));
        const generatingPhase = document.getElementById("agentProgress").dataset.phase;
        for (let i = 0; i < 100 && document.getElementById("agentProgress").dataset.phase !== "complete"; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        const progress = document.getElementById("agentProgress");
        return { settingsOpened, promptPhase, generatingPhase, finalPhase: progress.dataset.phase,
          finalText: progress.textContent, streamed: requestBody.stream,
          includeUsage: requestBody.stream_options && requestBody.stream_options.include_usage };
      } finally { window.fetch = originalFetch; }
    });
    assert.equal(result.settingsOpened, true);
    assert.equal(result.promptPhase, "prompt");
    assert.equal(result.generatingPhase, "generating");
    assert.equal(result.finalPhase, "complete");
    assert.match(result.finalText, /tok\/s/);
    assert.match(result.finalText, /40 input · 4 output tokens/);
    assert.equal(result.streamed, true);
    assert.equal(result.includeUsage, true);
  } finally { await page.close(); }
});

test("Gemini mutation requests require a tool and stop as soon as the ghost is ready", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const fridge = state.S.items.find((item) => item.type === "fridge");
      const requestBodies = [];
      const toolMessage = { choices: [{ message: { role: "assistant", content: "", tool_calls: [{
        id: "gemini-snap", type: "function", function: {
          name: "preview_item_snap", arguments: JSON.stringify({ itemId: fridge.id, face: "east" }),
        },
      }] } }], usage: { prompt_tokens: 80, completion_tokens: 12 } };
      const fake = async (_url, options) => {
        requestBodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => toolMessage };
      };
      const turn = await runtime.runAgentTurn({ provider: "gemini",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-3.7-flash", fullContext: true },
      [{ role: "user", content: "rotate the fridge to face east" }], { fetch: fake });
      return { calls: requestBodies.length, toolChoice: requestBodies[0].tool_choice,
        reasoning: requestBodies[0].reasoning_effort,
        streamed: requestBodies[0].stream,
        toolNames: requestBodies[0].tools.map((entry) => entry.function.name),
        schema: requestBodies[0].tools[0].function.parameters,
        commandId: turn.proposal && turn.proposal.commandId };
    });
    assert.equal(result.calls, 1, "a prepared preview does not need a second model round");
    assert.equal(result.toolChoice, "required");
    assert.equal(result.reasoning, "low");
    assert.equal(result.streamed, false);
    assert.deepEqual(result.toolNames, ["preview_item_snap"]);
    assert.doesNotMatch(JSON.stringify(result.schema), /anyOf|additionalProperties/);
    assert.equal(result.commandId, "item.move");
  } finally { await page.close(); }
});

test("LM Studio mutations use one focused required tool and a bounded prompt", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const lamp = state.S.items.find((item) => item.type === "floorLamp");
      const encoder = new TextEncoder();
      let request;
      const fake = async (_url, options) => {
        request = JSON.parse(options.body);
        const chunk = { choices: [{ delta: { role: "assistant", tool_calls: [{
          index: 0, id: "local-move", type: "function", function: {
            name: "preview_model_command", arguments: JSON.stringify({ commandId: "item.move",
              params: { itemId: lamp.id, x: lamp.x, z: lamp.z - 50 } }),
          },
        }] } }] };
        return { ok: true, status: 200, body: new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode("data: " + JSON.stringify(chunk) + "\n\ndata: [DONE]\n\n"));
          controller.close();
        } }) };
      };
      const turn = await runtime.runAgentTurn({ provider: "lmstudio",
        endpoint: "http://localhost:1234/v1", model: "local", fullContext: true,
        includeEntities: true, includeHistory: true, includeTutorial: true, includeAttention: true },
      [{ role: "user", content: "move floor lamp 50cm to the north" }], { fetch: fake });
      return { toolChoice: request.tool_choice,
        toolNames: request.tools.map((entry) => entry.function.name),
        promptChars: request.messages[0].content.length,
        hasEntities: /\"entities\"\s*:/.test(request.messages[0].content),
        commandId: turn.proposal && turn.proposal.commandId };
    });
    assert.equal(result.toolChoice, "required");
    assert.deepEqual(result.toolNames, ["preview_model_command"]);
    assert.ok(result.promptChars < 30000, `local prompt is ${result.promptChars} chars`);
    assert.equal(result.hasEntities, false);
    assert.equal(result.commandId, "item.move");
  } finally { await page.close(); }
});

test("a relational follow-up still forces the local semantic snap tool", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const encoder = new TextEncoder();
      let request;
      const fake = async (_url, options) => {
        request = JSON.parse(options.body);
        return { ok: true, status: 200, body: new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"role":"assistant","content":"Need context"}}]}\n\ndata: [DONE]\n\n'));
          controller.close();
        } }) };
      };
      await runtime.runAgentTurn({ provider: "lmstudio", endpoint: "http://localhost:1234/v1",
        model: "local", fullContext: true }, [
        { role: "user", content: "move the fridge" },
        { role: "assistant", content: "Where?" },
        { role: "user", content: "to the right of the table" },
      ], { fetch: fake });
      return { toolChoice: request.tool_choice,
        toolNames: request.tools.map((entry) => entry.function.name) };
    });
    assert.equal(result.toolChoice, "required");
    assert.deepEqual(result.toolNames, ["preview_item_snap"]);
  } finally { await page.close(); }
});

test("Gemini connection test validates chat and tools before showing green", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const pane = (await import("/js/ui_agent.js")).buildAgentSettingsPane();
      document.body.appendChild(pane);
      const provider = pane.querySelector("select");
      provider.value = "gemini";
      provider.dispatchEvent(new Event("change"));
      const inputs = pane.querySelectorAll(".agent-field input");
      inputs[1].value = "gemini-3.7-flash";
      inputs[2].value = "test-key";
      const bodies = [];
      const originalFetch = window.fetch;
      window.fetch = async (url, options = {}) => {
        if (String(url).endsWith("/models")) return { ok: true, status: 200,
          json: async () => ({ data: [{ id: "gemini-3.7-flash" }] }) };
        bodies.push(JSON.parse(options.body));
        return { ok: false, status: 400, clone() { return this; },
          json: async () => ({ error: { message: "Invalid tool schema" } }) };
      };
      try {
        [...pane.querySelectorAll("button")].find((button) => button.textContent === "Test connection").click();
        for (let i = 0; i < 100 && !pane.querySelector(".agent-test-result").textContent.includes("Invalid tool schema"); i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        return { status: pane.querySelector(".agent-test-result").textContent,
          calls: bodies.length, toolChoice: bodies[0] && bodies[0].tool_choice };
      } finally { window.fetch = originalFetch; pane.remove(); }
    });
    assert.equal(result.calls, 1);
    assert.equal(result.toolChoice, "required");
    assert.match(result.status, /^Agent error: Invalid tool schema/);
    assert.doesNotMatch(result.status, /^Connected/);
  } finally { await page.close(); }
});

test("fenced or mislabeled Gemini decisions render as questions instead of raw JSON", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const content = "```json\n" + JSON.stringify({ mode: "propose", message: "",
        question: "The requested space is occupied. What should I do?",
        options: ["Move the blocker", "Choose another wall", "Cancel"], confidence: 0.5,
        proposedOperations: [] }) + "\n```";
      const fake = async () => ({ ok: true, status: 200, json: async () => ({
        choices: [{ message: { role: "assistant", content } }],
      }) });
      const turn = await runtime.runAgentTurn({ provider: "openai",
        endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
      [{ role: "user", content: "where can it go?" }], { fetch: fake });
      return turn.decision;
    });
    assert.equal(result.mode, "ask");
    assert.equal(result.question, "The requested space is occupied. What should I do?");
    assert.deepEqual(result.options, ["Move the blocker", "Choose another wall", "Cancel"]);
    assert.doesNotMatch(result.message, /```|proposedOperations/);
  } finally { await page.close(); }
});

test("a successful LM Studio connection test saves an available model for chat", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const agentConfig = await import("/js/agent_config.js");
      agentConfig.saveAgentConfig({ provider: "lmstudio", endpoint: "http://localhost:1234/v1", model: "" });
      const pane = (await import("/js/ui_agent.js")).buildAgentSettingsPane();
      document.body.appendChild(pane);
      const originalFetch = window.fetch;
      let chatModel = null;
      window.fetch = async (url, options = {}) => {
        if (String(url).endsWith("/models")) return {
          ok: true, status: 200, json: async () => ({ data: [{ id: "loaded-local-model" }] }),
        };
        chatModel = JSON.parse(options.body).model;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { role: "assistant", content: "Ready" } }],
        }) };
      };
      try {
        [...pane.querySelectorAll("button")].find((button) => button.textContent === "Test connection").click();
        for (let i = 0; i < 100 && !pane.querySelector(".agent-test-result").textContent.includes("Connected"); i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        const savedAfterTest = agentConfig.loadAgentConfig();
        const input = document.getElementById("agentInput");
        input.value = "hello";
        document.getElementById("agentSend").click();
        for (let i = 0; i < 100 && chatModel == null; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        return { savedModel: savedAfterTest.model, chatModel,
          testStatus: pane.querySelector(".agent-test-result").textContent };
      } finally { window.fetch = originalFetch; pane.remove(); }
    });
    assert.equal(result.savedModel, "loaded-local-model");
    assert.equal(result.chatModel, "loaded-local-model");
    assert.match(result.testStatus, /^Connected/);
  } finally { await page.close(); }
});

test("LM Studio chat repairs an older saved configuration with no model", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const agentConfig = await import("/js/agent_config.js");
      agentConfig.saveAgentConfig({ provider: "lmstudio", endpoint: "http://localhost:1234/v1", model: "" });
      const originalFetch = window.fetch;
      let chatModel = null;
      window.fetch = async (url, options = {}) => {
        if (String(url).endsWith("/models")) return {
          ok: true, status: 200, json: async () => ({ data: [{ id: "discovered-local-model" }] }),
        };
        chatModel = JSON.parse(options.body).model;
        return { ok: true, status: 200, json: async () => ({
          choices: [{ message: { role: "assistant", content: "Ready" } }],
        }) };
      };
      try {
        const input = document.getElementById("agentInput");
        input.value = "hello";
        document.getElementById("agentSend").click();
        for (let i = 0; i < 100 && chatModel == null; i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        return { chatModel, savedModel: agentConfig.loadAgentConfig().model,
          messages: document.getElementById("agentMessages").textContent };
      } finally { window.fetch = originalFetch; }
    });
    assert.equal(result.chatModel, "discovered-local-model");
    assert.equal(result.savedModel, "discovered-local-model");
    assert.doesNotMatch(result.messages, /MODEL_REQUIRED/);
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
        applied: applied.ok, appliedReason: applied.reason, bridgeCanExecute, visualPreview, denied: denied.reason,
        afterApply: { walls: state.S.walls.length, nodes: state.S.nodes.length, idc: state.S.idc },
        sawFullContext,
      };
    });
    assert.deepEqual(result.afterPreview, result.before, "tool call only previews");
    assert.deepEqual(result.proposal, { commandId: "room.create", kind: "room" });
    assert.equal(result.applied, true, result.appliedReason);
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
        choices: [{ message: { role: "assistant", content: JSON.stringify({ mode: "ask", question: "I am not confident.", confidence: 0.2, evidence: [], proposedOperations: [] }) } }],
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

test("same-target uncertainty cycles A/B ghost options once per second", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const id = state.S.idc++;
      state.S.items.push({ id, type: "fridge", x: 300, z: 50, w: 75, d: 75, h: 190, rot: 0 });
      let call = 0;
      const fake = async () => ({ ok: true, status: 200, json: async () => call++ === 0 ? {
        choices: [{ message: { role: "assistant", content: "", tool_calls: [
          { id: "option-a", type: "function", function: { name: "preview_model_command", arguments: JSON.stringify({ commandId: "item.move", params: { itemId: id, x: 250, z: 50 } }) } },
          { id: "option-b", type: "function", function: { name: "preview_model_command", arguments: JSON.stringify({ commandId: "item.move", params: { itemId: id, x: 200, z: 50 } }) } },
        ] } }] } : { choices: [{ message: { role: "assistant", content: JSON.stringify({ mode: "ask", question: "Unsure", confidence: 0.1 }) } }] },
      });
      const turn = await runtime.runAgentTurn(
        { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
        [{ role: "user", content: "move the fridge left" }], { fetch: fake },
      );
      window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: turn.proposal }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const card = document.querySelector(".agent-choice-proposal");
      const firstTitle = card.querySelector("strong").textContent.trim();
      await new Promise((resolve) => setTimeout(resolve, 1050));
      const secondTitle = card.querySelector("strong").textContent.trim();
      const labels = [...card.querySelectorAll("button")].map((button) => button.textContent.trim());
      [...card.querySelectorAll("button")].find((button) => button.textContent.trim() === "B").click();
      return {
        commandId: turn.proposal.commandId,
        choiceCount: turn.proposal.choices.length,
        firstTitle, secondTitle, labels,
        x: state.S.items.find((item) => item.id === id).x,
      };
    });
    assert.equal(result.commandId, "choices");
    assert.equal(result.choiceCount, 2);
    assert.match(result.firstTitle, /Option A/);
    assert.match(result.secondTitle, /Option B/);
    assert.deepEqual(result.labels, ["A", "B", "Cancel", "How to fix"]);
    assert.equal(result.x, 200);
  } finally { await page.close(); }
});

test("wall snap without facing offers A keep / B face into the room with fridge on the cooktop run", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const tv = state.S.items.find((item) => item.type === "tv");
      const fridge = state.S.items.find((item) => item.type === "fridge");
      const cooktop = state.S.items.find((item) => item.type === "cooktop");
      let call = 0;
      const fake = async () => ({ ok: true, status: 200, json: async () => call++ === 0 ? {
        choices: [{ message: { role: "assistant", content: "", tool_calls: [
          { id: "tv-snap", type: "function", function: { name: "preview_item_snap", arguments: JSON.stringify({ itemId: tv.id, wall: "right" }) } },
          { id: "fridge-snap", type: "function", function: { name: "preview_item_snap", arguments: JSON.stringify({ itemId: fridge.id, beside: { itemId: cooktop.id, side: "right" } }) } },
        ] } }] } : { choices: [{ message: { role: "assistant", content: JSON.stringify({ mode: "propose", message: "", confidence: 1 }) } }] },
      });
      const turn = await runtime.runAgentTurn(
        { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
        [{ role: "user", content: "snap tv to the right wall and snap fridge to the right of cooktop" }],
        { fetch: fake },
      );
      window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: turn.proposal }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const card = document.querySelector(".agent-choice-proposal");
      const labels = [...card.querySelectorAll("button")].map((button) => button.textContent.trim());
      [...card.querySelectorAll("button")].find((button) => button.textContent.includes("B")).click();
      const applied = state.S.items.find((item) => item.id === tv.id);
      const movedFridge = state.S.items.find((item) => item.id === fridge.id);
      return {
        commandId: turn.proposal.commandId,
        choiceCount: turn.proposal.choices.length,
        labels,
        tvRot: applied.rot, tvX: applied.x,
        fridgeX: movedFridge.x, fridgeZ: movedFridge.z, fridgeRot: movedFridge.rot,
      };
    });
    assert.equal(result.commandId, "choices");
    assert.equal(result.choiceCount, 2);
    assert.match(result.labels[0], /Keep like the ghosted preview/);
    assert.match(result.labels[1], /Rotate to face into the room/);
    assert.equal(result.tvRot, 90);
    assert.equal(result.tvX, 375);
    assert.equal(result.fridgeX, 240);
    assert.equal(result.fridgeZ, 40);
    assert.equal(result.fridgeRot, 0);
  } finally { await page.close(); }
});

test("command JSON dumped in chat is recovered as a confirmable preview", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const tv = state.S.items.find((item) => item.type === "tv");
      const fridge = state.S.items.find((item) => item.type === "fridge");
      const ops = [
        { commandId: "item.move", params: { itemId: tv.id, x: 375, z: 28, rot: 90 } },
        { commandId: "item.move", params: { itemId: fridge.id, x: 240, z: 42 } },
      ];
      const fence = String.fromCharCode(96, 96, 96);
      const dumped = fence + "json\n" + JSON.stringify(ops) + "\n" + fence;
      const fake = async () => ({
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { role: "assistant", content: dumped } }] }),
      });
      const turn = await runtime.runAgentTurn(
        { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
        [{ role: "user", content: "snap tv to the right wall and snap fridge to the right of cooktop" }],
        { fetch: fake },
      );
      return {
        commandId: turn.proposal && turn.proposal.commandId,
        count: turn.proposal && turn.proposal.commands && turn.proposal.commands.length,
        kinds: (turn.proposal && turn.proposal.commands || []).map((entry) => entry.preview && entry.preview.kind),
      };
    });
    assert.equal(result.commandId, "batch");
    assert.equal(result.count, 2);
    assert.deepEqual(result.kinds, ["item-move", "item-move"]);
  } finally { await page.close(); }
});

test("a colliding joint placement reports a specific repairable conflict", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const runtime = await import("/js/agent_runtime.js");
      const state = await import("/js/state.js");
      const base = state.S.nodes.length;
      state.S.nodes.push({ x: 5000, z: 3000 }, { x: 5400, z: 3000 },
        { x: 5400, z: 3400 }, { x: 5000, z: 3400 });
      const walls = [0, 1, 2, 3].map(() => state.S.idc++);
      state.S.walls.push(
        { id: walls[0], a: base, b: base + 1, thickness: 10, height: 280 },
        { id: walls[1], a: base + 1, b: base + 2, thickness: 10, height: 280 },
        { id: walls[2], a: base + 2, b: base + 3, thickness: 10, height: 280 },
        { id: walls[3], a: base + 3, b: base, thickness: 10, height: 280 });
      const a = { id: state.S.idc++, type: "chair", x: 5150, z: 3200, w: 50, d: 50, h: 90, rot: 0 };
      const b = { id: state.S.idc++, type: "chair", x: 5250, z: 3200, w: 50, d: 50, h: 90, rot: 0 };
      state.S.items.push(a, b);
      let call = 0;
      const fake = async () => ({ ok: true, status: 200, json: async () => call++ === 0 ? {
        choices: [{ message: { role: "assistant", content: "", tool_calls: [
          { id: "a", type: "function", function: { name: "preview_item_snap", arguments: JSON.stringify({ itemId: a.id, wall: "right", face: "keep" }) } },
          { id: "b", type: "function", function: { name: "preview_item_snap", arguments: JSON.stringify({ itemId: b.id, wall: "right", face: "keep" }) } },
        ] } }],
      } : { choices: [{ message: { role: "assistant", content: "" } }] } });
      const turn = await runtime.runAgentTurn(
        { provider: "openai", endpoint: "https://model.invalid/v1", model: "test", fullContext: true },
        [{ role: "user", content: "move both chairs to the right wall" }], { fetch: fake });
      return { proposal: turn.proposal, failure: turn.proposalFailure };
    });
    assert.equal(result.proposal, null);
    assert.deepEqual(result.failure, { reason: "JOINT_PLACEMENT_CONFLICT" });
  } finally { await page.close(); }
});

test("joint-conflict Cancel dismisses local choices without drafting a chat message", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const config = await import("/js/agent_config.js");
      const state = await import("/js/state.js");
      const base = state.S.nodes.length;
      state.S.nodes.push({ x: 5000, z: 3000 }, { x: 5400, z: 3000 },
        { x: 5400, z: 3400 }, { x: 5000, z: 3400 });
      const walls = [0, 1, 2, 3].map(() => state.S.idc++);
      state.S.walls.push(
        { id: walls[0], a: base, b: base + 1, thickness: 10, height: 280 },
        { id: walls[1], a: base + 1, b: base + 2, thickness: 10, height: 280 },
        { id: walls[2], a: base + 2, b: base + 3, thickness: 10, height: 280 },
        { id: walls[3], a: base + 3, b: base, thickness: 10, height: 280 });
      const a = { id: state.S.idc++, type: "chair", x: 5150, z: 3200, w: 50, d: 50, h: 90, rot: 0 };
      const b = { id: state.S.idc++, type: "chair", x: 5250, z: 3200, w: 50, d: 50, h: 90, rot: 0 };
      state.S.items.push(a, b);
      config.saveAgentConfig({ provider: "openai", endpoint: "https://model.invalid/v1", model: "test",
        fullContext: true, persistConversation: false });
      let call = 0;
      const originalFetch = window.fetch;
      window.fetch = async () => ({ ok: true, status: 200, json: async () => call++ === 0 ? {
        choices: [{ message: { role: "assistant", content: "", tool_calls: [
          { id: "a", type: "function", function: { name: "preview_item_snap", arguments: JSON.stringify({ itemId: a.id, wall: "right", face: "keep" }) } },
          { id: "b", type: "function", function: { name: "preview_item_snap", arguments: JSON.stringify({ itemId: b.id, wall: "right", face: "keep" }) } },
        ] } }],
      } : { choices: [{ message: { role: "assistant", content: "" } }] } });
      try {
        const input = document.getElementById("agentInput");
        input.value = "move both chairs to the right wall";
        document.getElementById("agentSend").click();
        for (let i = 0; i < 100 && !document.querySelector(".agent-question-options"); i++)
          await new Promise((resolve) => setTimeout(resolve, 10));
        const choices = document.querySelector(".agent-question-options");
        const labels = [...choices.querySelectorAll("button")].map((button) => button.textContent.trim());
        [...choices.querySelectorAll("button")].find((button) => button.textContent.includes("Cancel")).click();
        return { labels, input: input.value, dismissed: !document.querySelector(".agent-question-options") };
      } finally { window.fetch = originalFetch; }
    });
    assert.deepEqual(result.labels, ["A · Move them one at a time", "B · Show different positions", "C · Cancel"]);
    assert.equal(result.input, "");
    assert.equal(result.dismissed, true);
  } finally { await page.close(); }
});
