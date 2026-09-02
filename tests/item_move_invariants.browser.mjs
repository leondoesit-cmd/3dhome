import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

test("command pose commit carries and rotates descendants, releases markers, and preserves holds", opts, async () => {
  const page = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const parent = { id: state.S.idc++, type: "base", x: 100, z: 100, w: 80, d: 60, h: 90, rot: 0,
        hold: { wall: state.S.walls[0].id, gap: 0, side: 1 } };
      const child = { id: state.S.idc++, type: "plant", x: 110, z: 100, w: 20, d: 20, h: 30,
        rot: 0, on: parent.id, elev: 90 };
      state.S.items.push(parent, child);
      state.S.markers.push({ id: state.S.idc++, x: 100, y: 0, z: 100, surface: "floor", wall: null,
        nx: 0, nz: 0, itemId: parent.id });
      const proposal = interaction.previewPlannerCommand("item.move", {
        itemId: parent.id, x: 200, z: 200, rot: 90,
      });
      const applied = interaction.executePlannerProposal(proposal);
      return {
        ok: applied.ok,
        parent: { x: parent.x, z: parent.z, rot: parent.rot, rotUser: parent.rotUser, hold: parent.hold },
        parentId: parent.id,
        child: { x: child.x, z: child.z, rot: child.rot, on: child.on, elev: child.elev },
        markerItemId: state.S.markers.at(-1).itemId,
      };
    });
    assert.equal(result.ok, true);
    assert.deepEqual([result.parent.x, result.parent.z, result.parent.rot, result.parent.rotUser], [200, 200, 90, 1]);
    assert.deepEqual([result.child.x, result.child.z, result.child.rot, result.child.on], [200, 210, 90, result.parentId]);
    assert.equal(result.markerItemId, null);
    assert.ok(result.parent.hold, "raw coordinates preserve an existing hold");
  } finally { await page.close(); }
});

test("omitted rotation preserves rotation provenance and final support is resolved after a batch", opts, async () => {
  const page = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const stack = await import("/js/stack.js");
      const host = { id: state.S.idc++, type: "base", x: 600, z: 600, w: 100, d: 100, h: 90, rot: 0 };
      const item = { id: state.S.idc++, type: "plant", x: 450, z: 450, w: 20, d: 20, h: 30, rot: 37, rotUser: 1 };
      const child = { id: state.S.idc++, type: "plant", x: 450, z: 450, w: 10, d: 10, h: 10,
        rot: 37, on: item.id, elev: 30 };
      state.S.items.push(host, item, child);
      const proposal = interaction.previewPlannerCommand("item.move", { itemId: item.id, x: 600, z: 600 });
      const rotationSpecified = proposal.plan.params.rotationSpecified;
      const applied = interaction.executePlannerProposal(proposal);
      return { ok: applied.ok, rotationSpecified, rot: item.rot, rotUser: item.rotUser, on: item.on,
        elev: item.elev, childElev: child.elev, itemTop: stack.topOf(item), hostId: host.id };
    });
    assert.equal(result.ok, true);
    assert.equal(result.rotationSpecified, false);
    assert.equal(result.rot, 37);
    assert.equal(result.rotUser, 1);
    assert.equal(result.on, result.hostId);
    assert.equal(result.elev, 90);
    assert.equal(result.childElev, result.itemTop);
  } finally { await page.close(); }
});

test("a batch rejects duplicate item targets before intermediate finalization", opts, async () => {
  const page = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const item = { id: state.S.idc++, type: "chair", x: 1000, z: 1000, w: 50, d: 50, h: 90, rot: 0 };
      state.S.items.push(item);
      const a = interaction.previewPlannerCommand("item.move", { itemId: item.id, x: 1100, z: 1000 });
      const b = interaction.previewPlannerCommand("item.move", { itemId: item.id, x: 1000, z: 1000 });
      const applied = interaction.executePlannerProposal({ commandId: "batch", commands: [a, b] });
      return { ok: applied.ok, reason: applied.reason, x: item.x, z: item.z };
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "AMBIGUOUS_ITEM_TARGET");
    assert.deepEqual([result.x, result.z], [1000, 1000]);
  } finally { await page.close(); }
});

test("locked items cannot produce an agent move preview", opts, async () => {
  const page = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const item = { id: state.S.idc++, type: "chair", x: 700, z: 700, w: 50, d: 50, h: 90, rot: 0, locked: true };
      state.S.items.push(item);
      return interaction.previewPlannerCommand("item.move", { itemId: item.id, x: 800, z: 800 });
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "ITEM_LOCKED");
  } finally { await page.close(); }
});

test("3D elevation reseats descendants and finalizes the gesture state", opts, async () => {
  const page = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const parent = { id: state.S.idc++, type: "base", x: 4000, z: 4000, w: 80, d: 60, h: 90,
        elev: 0, rot: 0 };
      const child = { id: state.S.idc++, type: "plant", x: 4000, z: 4000, w: 20, d: 20, h: 30,
        elev: 90, rot: 0, on: parent.id };
      state.S.items.push(parent, child);
      const began = interaction.begin3DItemDrag(parent), actionDuring = state.S.action;
      interaction.drag3DItemElev(parent, 120);
      interaction.end3DItemDrag();
      return { began, actionDuring, actionAfter: state.S.action, parentElev: parent.elev,
        childElev: child.elev, expectedChildElev: parent.elev + parent.h, childOn: child.on };
    });
    assert.deepEqual(result, { began: true, actionDuring: "item", actionAfter: null,
      parentElev: 120, childElev: 210, expectedChildElev: 210, childOn: result.childOn });
    assert.ok(result.childOn != null);
  } finally { await page.close(); }
});

test("an identical resolved pose has the same 3D-drop and agent-command domain effects", opts, async () => {
  const dragPage = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  const commandPage = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  const run = async (page, mode) => page.eval(async (mode) => {
    const state = await import("/js/state.js");
    const interaction = await import("/js/interaction.js");
    const base = state.S.nodes.length, wallId = 900001, parentId = 900002, childId = 900003, markerId = 900004;
    state.S.nodes.push({ x: 5000, z: 5000 }, { x: 5400, z: 5000 });
    state.S.walls.push({ id: wallId, a: base, b: base + 1, thickness: 10, height: 280 });
    const parent = { id: parentId, type: "base", x: 5100, z: 5100, w: 80, d: 60, h: 90, elev: 0, rot: 0 };
    const child = { id: childId, type: "plant", x: 5110, z: 5100, w: 20, d: 20, h: 30,
      elev: 90, rot: 0, on: parentId };
    const marker = { id: markerId, x: 5100, y: 0, z: 5100, surface: "floor", wall: null,
      nx: 0, nz: 0, itemId: parentId };
    state.S.items.push(parent, child); state.S.markers.push(marker);
    let pose;
    if (mode === "drag") {
      interaction.begin3DItemDrag(parent);
      interaction.drag3DItemTo(parent, 5200, 5035);
      pose = { x: parent.x, z: parent.z, rot: parent.rot };
      state.S.itemSnapWall = wallId;
      interaction.end3DItemDrag();
    } else {
      pose = mode;
      const proposal = interaction.previewPlannerCommand("item.move", { itemId: parentId,
        x: pose.x, z: pose.z, rot: pose.rot, rotationProvenance: "automatic", holdWallId: wallId });
      const applied = interaction.executePlannerProposal(proposal);
      if (!applied.ok) return { error: applied.reason };
    }
    return { pose, domain: {
      parent: { x: parent.x, z: parent.z, rot: parent.rot, elev: parent.elev,
        on: parent.on ?? null, hold: parent.hold ?? null, rotUser: parent.rotUser ?? null },
      child: { x: child.x, z: child.z, rot: child.rot, elev: child.elev, on: child.on ?? null },
      markerItemId: marker.itemId ?? null,
    } };
  }, mode);
  try {
    const dragged = await run(dragPage, "drag");
    const commanded = await run(commandPage, dragged.pose);
    assert.equal(commanded.error, undefined);
    assert.deepEqual(commanded.domain, dragged.domain);
  } finally {
    await dragPage.close(); await commandPage.close();
  }
});

test("a real 2D item drop emits full sync state for the item and its rider", opts, async () => {
  const page = await openPage({ width: 1000, height: 720, lang: "en", mobile: false, touch: false });
  try {
    const result = await page.eval(async () => {
      const state = await import("/js/state.js");
      const interaction = await import("/js/interaction.js");
      const plan2d = await import("/js/plan2d.js");
      const ui = await import("/js/ui.js");
      const parent = { id: state.S.idc++, type: "base", x: 100, z: 100, w: 80, d: 60, h: 90,
        elev: 10, rot: 0, rotUser: 1 };
      const child = { id: state.S.idc++, type: "plant", x: 120, z: 100, w: 20, d: 20, h: 30,
        elev: 100, rot: 0, on: parent.id };
      const other = { id: state.S.idc++, type: "chair", x: 300, z: 100, w: 50, d: 50, h: 90, rot: 0 };
      state.S.nodes = []; state.S.walls = []; state.S.openings = []; state.S.items = [parent, child, other];
      state.S.markers = []; state.S.sel = null;
      interaction.setTool("select"); plan2d.fitView(); plan2d.render2DNow();
      const canvas = document.getElementById("plan"), ops = [];
      window.addEventListener("planner-plan-op-requested", (event) => ops.push(event.detail));
      const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      function send(type, x, z) {
        const rect = canvas.getBoundingClientRect(), X = plan2d.sx(x), Z = plan2d.sz(z);
        const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 77,
          isPrimary: true, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
          clientX: rect.left + X, clientY: rect.top + Z });
        Object.defineProperty(event, "offsetX", { value: X });
        Object.defineProperty(event, "offsetY", { value: Z });
        canvas.dispatchEvent(event);
      }
      send("pointerdown", 70, 100); await frame();
      send("pointermove", 170, 100); await frame();
      send("pointerup", 170, 100); await frame();
      const singleOps = ops.filter((op) => op.type === "itemMove");
      ops.length = 0;
      ui.select({ kind: "items", refs: [parent, other] }); plan2d.render2DNow();
      send("pointerdown", parent.x - 30, parent.z); await frame();
      send("pointermove", parent.x + 70, parent.z); await frame();
      send("pointerup", parent.x + 70, parent.z); await frame();
      return { parentId: parent.id, childId: child.id, otherId: other.id,
        singleOps, multiOps: ops.filter((op) => op.type === "itemMove") };
    });
    assert.deepEqual(result.singleOps.map((op) => op.id), [result.parentId, result.childId]);
    assert.deepEqual(Object.keys(result.singleOps[0]).sort(),
      ["elev", "hold", "id", "on", "rot", "rotUser", "type", "x", "z"].sort());
    assert.equal(result.singleOps[1].on, result.parentId);
    assert.ok(result.singleOps[1].x > 120, "the rider's emitted pose follows the dragged parent");
    assert.deepEqual(result.multiOps.map((op) => op.id),
      [result.parentId, result.childId, result.otherId]);
  } finally { await page.close(); }
});
