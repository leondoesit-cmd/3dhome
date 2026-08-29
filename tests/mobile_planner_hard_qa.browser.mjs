/* Mobile coverage for the planner transaction regressions. These drive the
   compact shell and touch pointer path: sharing implementation with desktop is
   useful only if the phone's own controls preserve the same action boundary. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

async function mobilePlanner(page) {
  await page.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const [state, inter, plan2d, geom, cons, engine, floors, chrome] = await Promise.all([
      import("/js/state.js"), import("/js/interaction.js"), import("/js/plan2d.js"),
      import("/js/geometry.js"), import("/js/wall_constraints.js"),
      import("/js/constraint_engine.js"), import("/js/floors.js"),
      import("/js/planner_chrome.js"),
    ]);
    const S = state.S, plan = document.getElementById("plan");
    let pointerId = 1200;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const at = (x, z) => {
      const box = plan.getBoundingClientRect();
      return { x: box.left + plan2d.sx(x), y: box.top + plan2d.sz(z) };
    };
    const tap = (x, z) => {
      const point = at(x, z), id = ++pointerId;
      const base = { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch",
        isPrimary: true, clientX: point.x, clientY: point.y, button: 0, buttons: 1 };
      plan.dispatchEvent(new PointerEvent("pointerdown", base));
      plan.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
    };
    window.__mobileQa = {
      S, inter, plan2d, geom, floors, chrome, tap, frame,
      room() {
        S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
        S.walls = [1, 2, 3, 4].map((id, i) => ({
          id, a: i, b: (i + 1) % 4, thickness: 10, height: 270,
        }));
        S.openings = []; S.items = []; S.markers = []; S.slabOpenings = [];
        S.wallCons = []; S.roomCons = []; S.roomMeta = {}; S.sel = null;
        engine.syncLocks(); engine.syncClears(); cons.ensureNodeIds();
        inter.setTool("select"); plan2d.fitView(); plan2d.render2D();
      },
      blank() {
        S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.markers = [];
        S.slabOpenings = []; S.wallCons = []; S.roomCons = []; S.roomMeta = {}; S.sel = null;
        inter.setTool("select"); plan2d.fitView(); plan2d.render2D();
      },
    };
  });
}

test("mobile partition and its host splits undo as one touch action", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await mobilePlanner(page);
    const out = await page.eval(async () => {
      const q = window.__mobileQa;
      q.room();
      q.inter.setTool("wall");
      q.tap(300, -80); q.tap(300, 480);
      q.inter.finishDraw(); await q.frame();
      const drawn = { walls: q.S.walls.length, rooms: q.geom.detectRooms().length };
      const undo = document.querySelector('#m-ctx button[aria-label="Undo"]');
      const enabled = !!undo && !undo.disabled;
      if (undo) undo.click();
      await q.frame();
      return { enabled, drawn, undone: { walls: q.S.walls.length, rooms: q.geom.detectRooms().length } };
    });
    assert.equal(out.enabled, true, "the phone exposes Undo after the touch gesture");
    assert.deepEqual(out.drawn, { walls: 9, rooms: 2 });
    assert.deepEqual(out.undone, { walls: 4, rooms: 1 });
  } finally { await page.close(); }
});

test("mobile floor switch cancels the first rectangle corner", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await mobilePlanner(page);
    const out = await page.eval(async () => {
      const q = window.__mobileQa;
      q.floors.ensureFloors();
      q.S.workspace.floors = [q.S.workspace.floors[0]];
      q.S.workspace.activeFloor = q.S.workspace.floors[0].id;
      q.blank(); q.floors.captureFloor(); q.chrome.renderFloorTabs();
      q.inter.setTool("rect");
      /* This is the exact state after the phone's first-corner confirmation;
         setting it directly avoids making this floor-switch test depend on
         which precision-input preference the test browser retained. */
      q.S.rectDraft = { x: 0, z: 0 };
      const onGround = !!q.S.rectDraft;
      q.chrome.addFloorFromUI(); await q.frame();
      const clearedOnUpper = q.S.rectDraft == null;
      q.tap(200, 200); await q.frame();
      const upperHasOnlyFirstCorner = !!q.S.rectDraft && q.S.walls.length === 0;
      return { onGround, clearedOnUpper, upperHasOnlyFirstCorner,
        walls: q.S.walls.map((wall) => ({ a: wall.a, b: wall.b })), nodes: q.S.nodes.length,
        dialogs: document.querySelectorAll('.bp-overlay').length };
    });
    assert.deepEqual(out, {
      onGround: true, clearedOnUpper: true, upperHasOnlyFirstCorner: true,
      walls: [], nodes: 0, dialogs: 0,
    });
  } finally { await page.close(); }
});

test("mobile More adds a floor, mobile Undo removes it, and backdrop declines a room", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await mobilePlanner(page);
    const out = await page.eval(async () => {
      const q = window.__mobileQa;
      q.floors.ensureFloors(); q.S.workspace.floors = [q.S.workspace.floors[0]];
      q.S.workspace.activeFloor = q.S.workspace.floors[0].id; q.blank(); q.chrome.renderFloorTabs();
      document.querySelector('[data-mnav="more"]').click(); await q.frame();
      const add = [...document.querySelectorAll("#m-sheet-body button")]
        .find((button) => /New floor|Add floor/i.test(button.textContent));
      const mobileRoute = !!add;
      if (add) add.click(); await q.frame();
      const added = q.S.workspace.floors.length;
      const undo = document.querySelector('#m-ctx button[aria-label="Undo"]');
      if (undo) undo.click(); await q.frame();
      const undone = q.S.workspace.floors.length;

      /* Create a new enclosure and dismiss it using the phone's natural modal
         cancellation path: tapping the shaded backdrop, not a keyboard key. */
      q.blank();
      const uiTree = await import("/js/ui_tree.js");
      uiTree.refreshTree(); await q.frame();
      q.S.nodes = [{ x: 0, z: 0 }, { x: 300, z: 0 }, { x: 300, z: 300 }, { x: 0, z: 300 }];
      q.S.walls = [1, 2, 3, 4].map((id, i) => ({ id, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
      uiTree.refreshTree(); await q.frame();
      const overlay = document.querySelector(".bp-overlay");
      const prompted = !!overlay;
      if (overlay) overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      await q.frame();
      const cycle = q.geom.detectRoomCycles()[0];
      return { mobileRoute, added, undone, prompted,
        declined: !!(cycle && q.S.roomMeta[cycle.key] && q.S.roomMeta[cycle.key].noRoom) };
    });
    assert.deepEqual(out, { mobileRoute: true, added: 2, undone: 1, prompted: true, declined: true });
  } finally { await page.close(); }
});

test("mobile view detour cannot preserve a hidden drawing gesture", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await mobilePlanner(page);
    const out = await page.eval(async () => {
      const q = window.__mobileQa;
      q.blank();
      q.inter.setTool("rect");
      q.S.rectDraft = { x: 25, z: 40 };
      const view = document.querySelector('[data-mnav="view"]');
      view.click(); await q.frame();
      const after3D = { tool: q.S.tool, draft: q.S.rectDraft };
      const in3D = document.getElementById("center-canvas").classList.contains("max-view-3d");
      view.click(); await q.frame();
      const backInPlan = document.getElementById("center-canvas").classList.contains("max-view-2d");
      q.tap(120, 120); await q.frame();
      return { in3D, backInPlan, after3D,
        afterReturnTap: { tool: q.S.tool, draft: q.S.rectDraft, walls: q.S.walls.length } };
    });
    assert.equal(out.in3D, true);
    assert.equal(out.backInPlan, true);
    assert.deepEqual(out.after3D, { tool: "select", draft: null });
    assert.deepEqual(out.afterReturnTap, { tool: "select", draft: null, walls: 0 },
      "the first tap back on Plan is ordinary selection, not a hidden second corner");
  } finally { await page.close(); }
});

test("two-finger undo cancels a wall run after its first host split", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await mobilePlanner(page);
    const out = await page.eval(async () => {
      const q = window.__mobileQa, plan = document.getElementById("plan");
      q.room(); q.inter.setTool("wall");
      q.tap(300, 0); await q.frame(); // first corner splits the north host
      const split = { walls: q.S.walls.length, drawing: q.S.drawing };
      const box = plan.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2;
      const ids = [1801, 1802];
      ids.forEach((pointerId, i) => plan.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, pointerId, pointerType: "touch", isPrimary: i === 0,
        clientX: x + i * 30, clientY: y,
      })));
      ids.reverse().forEach((pointerId) => plan.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true, pointerId, pointerType: "touch", clientX: x, clientY: y,
      })));
      await q.frame();
      return { split, undone: { walls: q.S.walls.length, drawing: q.S.drawing,
        drawFrom: q.S.drawFrom, rooms: q.geom.detectRooms().length } };
    });
    assert.deepEqual(out.split, { walls: 5, drawing: true });
    assert.deepEqual(out.undone, { walls: 4, drawing: false, drawFrom: null, rooms: 1 });
  } finally { await page.close(); }
});
