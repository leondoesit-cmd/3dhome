/* The two planner regressions from the hard QA pass that only the real app can
   show: both live in interaction.js, which is bound to the plan canvas, its
   pointer handlers and the rest of the UI module graph.

   The page's own module instances are reached with a dynamic import — the app
   loads the same URLs, so `S` here is the state the UI is editing. Pointer
   moves are dispatched one animation frame apart because the plan's move
   handler is rAF-throttled: a synchronous burst collapses into a single frame
   and no drag ever happens. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

async function planner(page) {
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
  });
  await page.eval(async () => {
    const [state, inter, plan2d, geom, cons, engine, ui, history] = await Promise.all([
      import("/js/state.js"), import("/js/interaction.js"), import("/js/plan2d.js"),
      import("/js/geometry.js"), import("/js/wall_constraints.js"),
      import("/js/constraint_engine.js"), import("/js/ui.js"), import("/js/history.js"),
    ]);
    const S = state.S, canvas = document.getElementById("plan");
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    function ev(type, x, z) {
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
        pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
        clientX: r.left + plan2d.sx(x), clientY: r.top + plan2d.sz(z),
      }));
    }
    window.__qa = {
      S, inter, plan2d, geom, cons, engine, ui, history, ev, frame,
      click(x, z) { ev("pointerdown", x, z); ev("pointermove", x, z); ev("pointerup", x, z); },
      /* A 600 x 400 room with every wall holding what it reads — what the wall
         tool leaves behind. */
      room() {
        S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
        S.walls = [1, 2, 3, 4].map((id, i) => ({
          id, a: i, b: (i + 1) % 4, thickness: 10, height: 270,
        }));
        S.openings = []; S.items = []; S.wallCons = []; S.roomCons = [];
        S.roomMeta = {}; S.markers = []; S.sel = null;
        engine.syncLocks(); engine.syncClears(); cons.ensureNodeIds();
        inter.setTool("select");
        plan2d.fitView(); plan2d.render2D();
      },
      rooms() { return geom.detectRooms().length; },
      used() { return Object.keys(geom.usedNodes()).length; },
    };
  });
}

test("a wall drawn straight through a room divides it", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__qa;
      q.room();
      q.inter.setTool("wall");
      // start outside the north wall, finish outside the south wall
      q.click(300, -80);
      q.click(300, 480);
      q.inter.finishDraw();
      await q.frame();
      const at = (x, z) => Object.keys(q.geom.usedNodes()).filter((i) => {
        const n = q.S.nodes[i];
        return n && Math.round(n.x) === x && Math.round(n.z) === z;
      }).length;
      return {
        rooms: q.rooms(),
        walls: q.S.walls.map((w) => w.id + ":" + w.a + "->" + w.b),
        north: at(300, 0), south: at(300, 400),
      };
    });
    assert.equal(out.rooms, 2, "the partition divides the room: " + out.walls.join(" "));
    assert.equal(out.north, 1, "the north wall was cut at one shared corner");
    assert.equal(out.south, 1, "and so was the south wall");
    /* east + west untouched, north and south in halves, and the stroke itself in
       three: the tail outside the north wall, the partition, the tail outside
       the south wall. Before the fix there were six — the stroke stopped dead at
       the first wall it met and everything past it was thrown away. */
    assert.equal(out.walls.length, 9, out.walls.join(" "));
  } finally {
    await page.close();
  }
});

test("one undo removes a drawn partition and both invisible host splits", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__qa;
      q.room();
      q.inter.setTool("wall");
      q.click(300, -80);
      q.click(300, 480);
      q.inter.finishDraw();
      await q.frame();
      const drawn = { walls: q.S.walls.length, rooms: q.rooms() };
      q.history.undo();
      await q.frame();
      return { drawn, undone: { walls: q.S.walls.length, rooms: q.rooms() } };
    });
    assert.deepEqual(out.drawn, { walls: 9, rooms: 2 });
    assert.deepEqual(out.undone, { walls: 4, rooms: 1 },
      "undo returns directly to the topology the user saw before drawing");
  } finally {
    await page.close();
  }
});

test("dragging a corner along the next wall does not shred it", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__qa;
      q.room();
      /* Structure is rank 1 under the boot work set ("furniture"), so canDrag()
         refuses a corner and this gesture would never arm. The work set is the
         user's answer to "what am I editing"; a test about wall topology is
         editing structure, so it says so. The refusal itself is covered by the
         next test, which is the half a bare pin would have hidden. */
      q.S.workSet = "structure";
      // grab the north wall's east corner and slide it down the east wall
      q.ui.select({ kind: "wall", ref: q.S.walls[0] });
      q.ev("pointerdown", 600, 0);
      await q.frame();
      const grabbed = q.S.action;
      const growth = [];
      for (let i = 1; i <= 8; i++) {
        q.ev("pointermove", 600, i * 25);
        await q.frame();
        growth.push(q.S.nodes.length);
      }
      q.ev("pointerup", 600, 200);
      await q.frame();
      return {
        grabbed, growth, rooms: q.rooms(), nodes: q.S.nodes.length, used: q.used(),
        walls: q.S.walls.length,
      };
    });
    assert.equal(out.grabbed, "node", "the gesture is a corner drag");
    assert.equal(
      new Set(out.growth).size, 1,
      "the corner count holds still during the drag: " + out.growth.join(","),
    );
    assert.ok(out.walls <= 5, "the host wall was split once, not once per frame");
    assert.equal(out.rooms, 1, "and the room still closes");
    assert.ok(out.nodes - out.used <= 1, "no pile of abandoned corners was left behind");
  } finally {
    await page.close();
  }
});

/* The other half of the rule the test above pins. A corner drag under the
   furniture work set must not quietly half-happen: it selects so the inspector
   still answers, it does not arm, it moves nothing, and it says why. Written
   as a user gesture rather than a canDrag() unit test, because the thing that
   can break is the pointerdown chain, not the predicate. */
test("a corner refuses to drag off the work set, but still selects", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__qa;
      q.room();
      q.S.workSet = "furniture";
      let blocked = null;
      const onBlock = (e) => { blocked = e.detail; };
      window.addEventListener("layers:blocked-drag", onBlock);
      const before = q.S.nodes.map((n) => (n ? n.x + "," + n.z : ""));
      q.ev("pointerdown", 600, 0);
      await q.frame();
      const armed = q.S.action;
      for (let i = 1; i <= 4; i++) { q.ev("pointermove", 600, i * 25); await q.frame(); }
      q.ev("pointerup", 600, 100);
      await q.frame();
      window.removeEventListener("layers:blocked-drag", onBlock);
      return {
        armed,
        selKind: q.S.sel && q.S.sel.kind,
        moved: q.S.nodes.some((n, i) => n && before[i] !== n.x + "," + n.z),
        blocked,
        walls: q.S.walls.length,
      };
    });
    assert.equal(out.armed, null, "the gesture never arms");
    assert.equal(out.selKind, "node", "but the corner is still selected, so the inspector fills");
    assert.equal(out.moved, false, "and nothing in the model moved");
    assert.equal(out.walls, 4, "no wall was split by a drag that did not happen");
    assert.ok(out.blocked, "the refusal is announced so the pill can explain it");
    assert.equal(out.blocked.reason, "rank", "and it names the gate that failed");
    assert.equal(out.blocked.layer, "structure");
    assert.equal(out.blocked.where, "2d");
  } finally {
    await page.close();
  }
});

/* The room prompt and the storey list: both were decisions written down in one
   module and quietly not executed by another, so both are checked here by doing
   the thing a user does rather than by reading either module. */
async function planner2(page) {
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
  });
  await page.eval(async () => {
    const [state, uiTree, geom, cons, engine, history, floors, chrome] = await Promise.all([
      import("/js/state.js"), import("/js/ui_tree.js"), import("/js/geometry.js"),
      import("/js/wall_constraints.js"), import("/js/constraint_engine.js"),
      import("/js/history.js"), import("/js/floors.js"), import("/js/planner_chrome.js"),
    ]);
    const S = state.S;
    window.__qa2 = {
      S, uiTree, geom, history, floors, chrome,
      frame: () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))),
      dialogOpen: () => !!document.querySelector(".bp-overlay"),
      blank() {
        S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.markers = [];
        S.wallCons = []; S.roomCons = []; S.roomMeta = {}; S.slabOpenings = []; S.sel = null;
      },
      /* `n` closed squares side by side, each one a new enclosure. */
      squares(n) {
        S.nodes = []; S.walls = [];
        for (let r = 0; r < n; r++) {
          const base = S.nodes.length, x = r * 600;
          S.nodes.push({ x, z: 0 }, { x: x + 300, z: 0 }, { x: x + 300, z: 300 }, { x, z: 300 });
          for (let i = 0; i < 4; i++)
            S.walls.push({ id: r * 10 + i + 1, a: base + i, b: base + ((i + 1) % 4), thickness: 10, height: 270 });
        }
        engine.syncLocks(); engine.syncClears(); cons.ensureNodeIds();
      },
      floorNames: () => (S.workspace.floors || []).map((f) => f.name),
    };
  });
}

test("dismissing the room prompt declines the room, and still offers the next one", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner2(page);
    const out = await page.eval(async () => {
      const q = window.__qa2;
      const run = async (dismiss) => {
        q.blank();
        q.uiTree.refreshTree();           // seed: no enclosure is "new" yet
        await q.frame();
        q.squares(2);                     // two new enclosures at once
        q.uiTree.refreshTree();
        await q.frame();
        const first = q.dialogOpen();
        dismiss();
        await q.frame();
        const second = q.dialogOpen();
        const keys = q.geom.detectRoomCycles().map((r) => r.key);
        return {
          first, second,
          declined: keys.filter((k) => q.S.roomMeta[k] && q.S.roomMeta[k].noRoom).length,
          rooms: q.geom.detectRooms().length,
        };
      };
      const escape = await run(() =>
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
      const backdrop = await run(() => {
        const overlay = document.querySelector(".bp-overlay");
        if (overlay) overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      return { escape, backdrop };
    });
    for (const [how, r] of Object.entries(out)) {
      assert.equal(r.first, true, how + ": the prompt appeared");
      assert.equal(r.declined, 1, how + ": the dismissed enclosure was declined, not silently created");
      assert.equal(r.second, true, how + ": the second enclosure is still offered");
      assert.equal(r.rooms, 1, how + ": only the undecided one is drawn as a room");
    }
  } finally {
    await page.close();
  }
});

test("adding and deleting a storey are both one undo", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner2(page);
    const out = await page.eval(async () => {
      const q = window.__qa2;
      q.floors.ensureFloors();
      q.S.workspace.floors = [q.S.workspace.floors[0]];
      q.S.workspace.activeFloor = q.S.workspace.floors[0].id;
      q.blank();
      q.uiTree.refreshTree();
      const before = q.floorNames();

      q.chrome.addFloorFromUI();
      await q.frame();
      const added = q.floorNames();
      q.history.undo();
      await q.frame();
      const afterUndoOfAdd = q.floorNames();

      // and the destructive direction, through the same call the panel makes
      q.chrome.addFloorFromUI();
      await q.frame();
      const doomed = q.S.workspace.floors[q.S.workspace.floors.length - 1].id;
      // exactly what the workspace panel's Delete button does
      q.history.beginHistory();
      if (q.floors.removeFloor(doomed)) q.history.commitPending("Delete floor");
      else q.history.cancelPending();
      await q.frame();
      const deleted = q.floorNames();
      q.history.undo();
      await q.frame();
      return { before, added, afterUndoOfAdd, deleted, afterUndoOfDelete: q.floorNames() };
    });
    assert.equal(out.added.length, out.before.length + 1, "the storey was created");
    assert.deepEqual(out.afterUndoOfAdd, out.before, "one undo removes it again");
    assert.equal(out.deleted.length, out.before.length, "the storey was deleted");
    assert.equal(out.afterUndoOfDelete.length, out.before.length + 1,
      "and one undo brings it back — deletion is the direction that needs it most");
  } finally {
    await page.close();
  }
});

test("undo entries do not grow with the number of storeys", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner2(page);
    const out = await page.eval(async () => {
      const q = window.__qa2;
      const ui = await import("/js/ui.js");
      q.floors.ensureFloors();
      q.S.workspace.floors = [q.S.workspace.floors[0]];
      q.S.workspace.activeFloor = q.S.workspace.floors[0].id;
      q.blank();
      q.squares(1);
      q.uiTree.refreshTree();
      await q.frame();
      const project = () => JSON.stringify(ui.sceneObject(true)).length;
      const one = project();
      q.floors.addFloor("Second", 300, true);   // a duplicate: real content
      q.floors.addFloor("Third", 600, true);
      await q.frame();
      return { one, three: project(), floors: q.S.workspace.floors.length };
    });
    assert.equal(out.floors, 3);
    /* Storeys used to embed the storey list, so this ratio was ~78x on the demo
       scene and every save, autosave and undo entry paid it. Three storeys of
       the same plan is three storeys of data. */
    assert.ok(out.three < out.one * 5,
      "three storeys cost " + (out.three / out.one).toFixed(1) + "x one storey");
  } finally {
    await page.close();
  }
});

test("undo crosses a floor switch without losing either storey's plan", opts, async () => {
  /* The snapshot leaves the ACTIVE storey's scene out (it is `spatial`, and a
     second copy per entry is the whole building on every keystroke) and shares
     the inactive ones by reference. This is the path that has to prove it: undo
     back past a floor switch, redo forward again, then go and look at the
     storey that was never active during any of it. */
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner2(page);
    const out = await page.eval(async () => {
      const q = window.__qa2;
      const engine = await import("/js/constraint_engine.js");
      const cons = await import("/js/wall_constraints.js");
      const box = (size) => {
        q.S.nodes = [{ x: 0, z: 0 }, { x: size, z: 0 }, { x: size, z: size }, { x: 0, z: size }];
        q.S.walls = [1, 2, 3, 4].map((id, i) => ({ id, a: i, b: (i + 1) % 4, thickness: 10, height: 270 }));
        engine.syncLocks(); engine.syncClears(); cons.ensureNodeIds();
      };
      const shot = () => ({
        floor: (q.S.workspace.floors.find((f) => f.id === q.S.workspace.activeFloor) || {}).name,
        floors: q.S.workspace.floors.length,
        span: q.S.nodes.length ? Math.round(Math.max(...q.S.nodes.map((n) => n.x))) : 0,
      });
      q.floors.ensureFloors();
      q.S.workspace.floors = [q.S.workspace.floors[0]];
      q.S.workspace.activeFloor = q.S.workspace.floors[0].id;
      const ground = q.S.workspace.activeFloor;
      q.blank(); box(300);                 // ground floor: a 300 box
      q.uiTree.refreshTree();

      q.history.pushHistory();
      q.floors.addFloor("Upper", 300, false);
      box(700);                            // upper: a 700 box
      q.uiTree.refreshTree();
      q.history.pushHistory();
      box(900);                            // upper: widened to 900
      q.uiTree.refreshTree();
      await q.frame();

      const edited = shot();
      q.history.undo(); await q.frame();
      const undo1 = shot();
      q.history.undo(); await q.frame();
      const undo2 = shot();
      q.history.redo(); await q.frame();
      const redo1 = shot();
      q.floors.switchFloor(ground); await q.frame();
      return { edited, undo1, undo2, redo1, backOnGround: shot() };
    });
    assert.deepEqual(out.edited, { floor: "Upper", floors: 2, span: 900 });
    assert.deepEqual(out.undo1, { floor: "Upper", floors: 2, span: 700 }, "one undo, one edit");
    assert.deepEqual(out.undo2, { floor: "Ground floor", floors: 1, span: 300 },
      "the next undo takes the storey away and lands back on the ground plan");
    assert.deepEqual(out.redo1, { floor: "Upper", floors: 2, span: 700 }, "redo brings both back");
    assert.deepEqual(out.backOnGround, { floor: "Ground floor", floors: 2, span: 300 },
      "and the storey that sat out the whole exercise still has its own plan");
  } finally {
    await page.close();
  }
});

test("undo redraws the storey tabs without being told to", opts, async () => {
  /* history.js cannot import planner_chrome.js — that file is its own entry
     point in index.html — so the tab strip is refreshed through a registration
     (onAfterRestore) instead of the name-keyed window hop it used to make. Only
     the real app can show that the registration happened at boot. */
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner2(page);
    const out = await page.eval(async () => {
      const q = window.__qa2;
      const tabs = () => [...document.querySelectorAll("#floor-tabs button")]
        .map((b) => b.textContent.trim()).filter(Boolean);
      q.floors.ensureFloors();
      q.S.workspace.floors = [q.S.workspace.floors[0]];
      q.S.workspace.activeFloor = q.S.workspace.floors[0].id;
      q.uiTree.refreshTree();
      q.chrome.renderFloorTabs();
      await q.frame();
      const before = tabs();
      q.chrome.addFloorFromUI();
      await q.frame();
      const added = tabs();
      q.history.undo();               // deliberately nothing else
      await q.frame();
      return { before, added, afterUndo: tabs() };
    });
    assert.equal(out.added.length, out.before.length + 1, "the new storey got a tab");
    assert.deepEqual(out.afterUndo, out.before, "and undo took the tab away with the storey");
  } finally {
    await page.close();
  }
});
