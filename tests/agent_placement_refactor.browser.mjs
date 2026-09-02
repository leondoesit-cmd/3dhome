import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

test("the A-D carousel stops permanently after the user engages with it", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const id = state.S.idc++;
      state.S.items.push({ id, type: "chair", x: 2000, z: 2000, w: 50, d: 50, h: 90, rot: 0 });
      const choices = [2100, 2200, 2300].map((x) =>
        interaction.previewPlannerCommand("item.move", { itemId: id, x, z: 2000 }));
      window.dispatchEvent(new CustomEvent("agent-external-proposal", {
        detail: { ok: true, commandId: "choices", choices,
          preview: { kind: "choice-carousel", previews: choices.map((choice) => choice.preview) } },
      }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      const card = document.querySelector(".agent-choice-proposal");
      const before = card.querySelector("strong").textContent.trim();
      card.dispatchEvent(new PointerEvent("pointerenter"));
      card.dispatchEvent(new PointerEvent("pointerleave"));
      await new Promise((resolve) => setTimeout(resolve, 1150));
      const after = card.querySelector("strong").textContent.trim();
      card.querySelectorAll("button")[0].click();
      return { before, after };
    });
    assert.match(result.before, /Option A/);
    assert.equal(result.after, result.before, "auto-advance must not resume after pointer leave");
  } finally {
    await page.close();
  }
});

test("external bridge snap calls dispatch the same normalized ghost proposal", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const config = await import("/js/agent_config.js");
      const bridge = await import("/js/agent_external_bridge.js");
      const id = state.S.idc++;
      state.S.items.push({ id, type: "chair", x: 2000, z: 2000, w: 50, d: 50, h: 90, rot: 0 });
      const previousSettings = localStorage.getItem("modelforge_agent_settings_v1");
      const nativeFetch = window.fetch;
      let replied = null;
      bridge.stopExternalAgentBridge();
      config.saveAgentConfig({ externalBridge: true });
      config.setAgentBridgeToken("test-bridge-token");
      window.fetch = async (url, options = {}) => {
        if (String(url).includes("/poll")) return {
          ok: true, status: 200,
          json: async () => ({ id: "external-snap", name: "preview_item_snap", args: { itemId: id, face: "west" } }),
        };
        if (String(url).includes("/reply")) {
          replied = JSON.parse(options.body);
          return { ok: true, status: 200, json: async () => ({ ok: true }) };
        }
        return nativeFetch(url, options);
      };
      const proposal = await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 500);
        window.addEventListener("agent-external-proposal", (event) => {
          clearTimeout(timeout); resolve(event.detail);
        }, { once: true });
        bridge.initExternalAgentBridge();
      });
      bridge.stopExternalAgentBridge();
      window.fetch = nativeFetch;
      config.setAgentBridgeToken("");
      if (previousSettings == null) localStorage.removeItem("modelforge_agent_settings_v1");
      else localStorage.setItem("modelforge_agent_settings_v1", previousSettings);
      return {
        expectedId: id,
        proposal: proposal && { ok: proposal.ok, commandId: proposal.commandId, itemId: proposal.plan && proposal.plan.params.itemId },
        reply: replied && { error: replied.error, commandId: replied.result && replied.result.commandId },
        card: !!document.querySelector(".agent-proposal"),
      };
    });
    assert.deepEqual(result.proposal, { ok: true, commandId: "item.move", itemId: result.expectedId });
    assert.equal(result.reply.error, null);
    assert.equal(result.reply.commandId, "item.move");
    assert.equal(result.card, true);
  } finally {
    await page.close();
  }
});

test("wall geometry changes invalidate a previously shown snap ghost", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const runtime = await import("/js/agent_runtime.js");
      const interaction = await import("/js/interaction.js");
      const base = state.S.nodes.length;
      state.S.nodes.push({ x: 1000, z: 1000 }, { x: 1400, z: 1000 },
        { x: 1400, z: 1400 }, { x: 1000, z: 1400 });
      const ids = [0, 1, 2, 3].map(() => state.S.idc++);
      state.S.walls.push(
        { id: ids[0], a: base, b: base + 1, thickness: 10, height: 280 },
        { id: ids[1], a: base + 1, b: base + 2, thickness: 10, height: 280 },
        { id: ids[2], a: base + 2, b: base + 3, thickness: 10, height: 280 },
        { id: ids[3], a: base + 3, b: base, thickness: 10, height: 280 });
      const item = { id: state.S.idc++, type: "chair", x: 1200, z: 1200, w: 50, d: 50, h: 90, rot: 0 };
      state.S.items.push(item);
      const proposal = runtime.executeAgentTool("preview_item_snap", { itemId: item.id, wall: "right", face: "keep" });
      state.S.nodes[base + 1].x += 30;
      state.S.nodes[base + 2].x += 30;
      const applied = interaction.executePlannerProposal(proposal);
      return { previewOk: proposal.ok, appliedOk: applied.ok, reason: applied.reason, x: item.x, z: item.z };
    });
    assert.equal(result.previewOk, true);
    assert.equal(result.appliedOk, false);
    assert.equal(result.reason, "PLACEMENT_GEOMETRY_CHANGED");
    assert.deepEqual([result.x, result.z], [1200, 1200]);
  } finally { await page.close(); }
});

test("an unrelated occupancy change does not invalidate a safe semantic placement", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const runtime = await import("/js/agent_runtime.js");
      const interaction = await import("/js/interaction.js");
      const base = state.S.nodes.length;
      state.S.nodes.push({ x: 3000, z: 3000 }, { x: 3400, z: 3000 },
        { x: 3400, z: 3400 }, { x: 3000, z: 3400 });
      const wallIds = [0, 1, 2, 3].map(() => state.S.idc++);
      state.S.walls.push(
        { id: wallIds[0], a: base, b: base + 1, thickness: 10, height: 280 },
        { id: wallIds[1], a: base + 1, b: base + 2, thickness: 10, height: 280 },
        { id: wallIds[2], a: base + 2, b: base + 3, thickness: 10, height: 280 },
        { id: wallIds[3], a: base + 3, b: base, thickness: 10, height: 280 });
      const item = { id: state.S.idc++, type: "chair", x: 3200, z: 3200, w: 50, d: 50, h: 90, rot: 0 };
      const obstacle = { id: state.S.idc++, type: "plant", x: 3100, z: 3200, w: 30, d: 30, h: 80, rot: 0 };
      state.S.items.push(item, obstacle);
      const proposal = runtime.executeAgentTool("preview_item_snap", { itemId: item.id, wall: "right", face: "keep" });
      obstacle.x += 10;
      const applied = interaction.executePlannerProposal(proposal);
      return { previewOk: proposal.ok, appliedOk: applied.ok, reason: applied.reason };
    });
    assert.deepEqual(result, { previewOk: true, appliedOk: true });
  } finally { await page.close(); }
});

test("an item moved into the ghost destination invalidates confirmation", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const runtime = await import("/js/agent_runtime.js");
      const interaction = await import("/js/interaction.js");
      const base = state.S.nodes.length;
      state.S.nodes.push({ x: 4000, z: 3000 }, { x: 4400, z: 3000 },
        { x: 4400, z: 3400 }, { x: 4000, z: 3400 });
      const wallIds = [0, 1, 2, 3].map(() => state.S.idc++);
      state.S.walls.push(
        { id: wallIds[0], a: base, b: base + 1, thickness: 10, height: 280 },
        { id: wallIds[1], a: base + 1, b: base + 2, thickness: 10, height: 280 },
        { id: wallIds[2], a: base + 2, b: base + 3, thickness: 10, height: 280 },
        { id: wallIds[3], a: base + 3, b: base, thickness: 10, height: 280 });
      const item = { id: state.S.idc++, type: "chair", x: 4200, z: 3200, w: 50, d: 50, h: 90, rot: 0 };
      const blocker = { id: state.S.idc++, type: "plant", x: 4050, z: 3300, w: 40, d: 40, h: 80, rot: 0 };
      state.S.items.push(item, blocker);
      const proposal = runtime.executeAgentTool("preview_item_snap", { itemId: item.id, wall: "right", face: "keep" });
      blocker.x = proposal.plan.params.to.x; blocker.z = proposal.plan.params.to.z;
      const applied = interaction.executePlannerProposal(proposal);
      return { previewOk: proposal.ok, appliedOk: applied.ok, reason: applied.reason };
    });
    assert.deepEqual(result, { previewOk: true, appliedOk: false, reason: "PLACEMENT_GEOMETRY_CHANGED" });
  } finally { await page.close(); }
});

test("incomplete choices and preserved wall holds are stated in the confirmation UI", opts, async () => {
  const page = await openPage({ width: 1100, height: 760, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const id = state.S.idc++;
      state.S.items.push({ id, type: "chair", x: 2500, z: 2500, w: 50, d: 50, h: 90, rot: 0,
        hold: { wall: state.S.walls[0].id, gap: 0, side: 1 } });
      const a = interaction.previewPlannerCommand("item.move", { itemId: id, x: 2550, z: 2500 });
      const b = interaction.previewPlannerCommand("item.move", { itemId: id, x: 2600, z: 2500 });
      window.dispatchEvent(new CustomEvent("agent-external-proposal", { detail: {
        ok: true, commandId: "choices", choices: [a, b], incomplete: true,
        failures: [{ reason: "ITEM_SOURCE_NOT_FOUND" }], warnings: ["PRESERVED_WALL_HOLD"],
        preview: { kind: "choice-carousel", previews: [a.preview, b.preview] },
      } }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      const text = document.querySelector(".agent-choice-proposal").textContent;
      return { incomplete: /Incomplete request/.test(text), hold: /preserves that hold/.test(text) };
    });
    assert.deepEqual(result, { incomplete: true, hold: true });
  } finally { await page.close(); }
});
