/* What the work-set layer system does in a real page, driven through the plan
   canvas rather than through the policy module.

   tests/layers.test.mjs pins the policy (`layerRank`, `canDrag`, the lock
   alias). Nothing there can tell you whether a TV picked up off a wall takes
   the wall with it, because that answer is spread across interaction.js's
   two-pass hit test, plan2d.js's two canvases and ui_layers.js's chips — and
   all three are bound to a live DOM. These are the end-to-end claims.

   Pointer moves go one animation frame apart because interaction.js
   rAF-throttles planMove: a synchronous burst collapses into a single frame
   and no drag happens at all. `offsetX`/`offsetY` are pinned on each event
   because the pointerdown path reads `clientX - rect.left` while the move path
   reads `offsetX`; a browser keeps the two consistent, but a synthetic event
   in a page under viewport emulation does not, and the disagreement shows up
   as a drag that grabs the right object and then throws it across the room.

   3D is deliberately absent: view3d.js needs a real GL/WebGPU context, which
   headless Chrome here does not have (see AGENTS.md). The 3D half of the layer
   work — the roots, the dollhouse cut, one physics body per wall, ghost
   materials — was verified by hand in a GPU browser instead. */
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
    const [state, inter, plan2d, cons, engine, ui, layers] = await Promise.all([
      import("/js/state.js"), import("/js/interaction.js"), import("/js/plan2d.js"),
      import("/js/wall_constraints.js"), import("/js/constraint_engine.js"),
      import("/js/ui.js"), import("/js/layers.js"),
    ]);
    const S = state.S, canvas = document.getElementById("plan");
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    function ev(type, x, z, extra) {
      const r = canvas.getBoundingClientRect();
      const X = plan2d.sx(x), Z = plan2d.sz(z);
      const e = new PointerEvent(type, Object.assign({
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
        pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
        clientX: r.left + X, clientY: r.top + Z,
      }, extra || {}));
      Object.defineProperty(e, "offsetX", { value: X });
      Object.defineProperty(e, "offsetY", { value: Z });
      canvas.dispatchEvent(e);
      return e;
    }
    window.__lay = {
      S, inter, plan2d, engine, ui, layers, canvas, ev, frame,
      click(x, z) { ev("pointerdown", x, z); ev("pointermove", x, z); ev("pointerup", x, z); },
      /* Keyboard shortcuts bail out when the focus is in a field, and the
         inspector is full of them — a click on a wall leaves one focused. */
      key(k, extra) {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        window.dispatchEvent(new KeyboardEvent("keydown", Object.assign(
          { key: k, bubbles: true, cancelable: true }, extra || {})));
      },
      async drag(x0, z0, x1, z1, steps) {
        const n = steps || 8;
        ev("pointerdown", x0, z0);
        await frame();
        const action = S.action;
        for (let i = 1; i <= n; i++) {
          ev("pointermove", x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n);
          await frame();
        }
        ev("pointerup", x1, z1);
        await frame();
        return action;
      },
      // A 600 x 400 room, the four walls holding what they read.
      room() {
        S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }, { x: 600, z: 400 }, { x: 0, z: 400 }];
        S.walls = [1, 2, 3, 4].map((id, i) => ({
          id, a: i, b: (i + 1) % 4, thickness: 10, height: 270,
        }));
        S.openings = []; S.items = []; S.wallCons = []; S.roomCons = [];
        S.roomMeta = {}; S.markers = []; S.sel = null;
        layers.resetLayers();
        engine.syncLocks(); engine.syncClears(); cons.ensureNodeIds();
        inter.setTool("select");
        plan2d.fitView(); plan2d.render2DNow();
      },
      nodes() { return JSON.stringify(S.nodes.map((n) => [n.x, n.z])); },
    };
  });
}

/* The bug the whole layer plan exists to fix: a TV hung on a wall is a small
   target sitting inside a much bigger one, and before the work set the wall
   won the hit test. */
test("a TV on a wall drags without taking the wall with it", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      q.ui.placeFurnAt("tv", 300, 20);
      await q.frame();
      const tv = S.items[0];
      const nodes = q.nodes();
      const action = await q.drag(300, 20, 420, 20);
      return {
        action, workSet: S.workSet,
        selectedIsTv: !!(S.sel && S.sel.ref === tv),
        movedX: Math.round(tv.x - 300),
        wallsHeldStill: q.nodes() === nodes,
      };
    });
    assert.equal(out.workSet, "furniture", "the default work set is what a user starts in");
    assert.equal(out.action, "item", "the press grabbed the TV, not the wall behind it");
    assert.ok(out.selectedIsTv, "and selected it");
    assert.ok(out.movedX > 100, "the TV followed the cursor: " + out.movedX + " cm");
    assert.ok(out.wallsHeldStill, "and not one corner of the room moved");
  } finally {
    await page.close();
  }
});

/* Rank 1 is select-only, not unpickable: the wall you cannot drag must still
   answer a click with its whole inspector, or the layer system has taken the
   plan's primary editing surface away. */
test("a rank-1 wall still selects and fills the inspector", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      await q.frame();
      q.click(120, 0);
      await q.frame();
      const insp = document.getElementById("right-inspector");
      const nodes = q.nodes();
      let blocked = null;
      window.addEventListener("layers:blocked-drag", (e) => { blocked = e.detail; }, { once: true });
      const action = await q.drag(120, 0, 120, 60, 5);
      return {
        selKind: S.sel && S.sel.kind,
        selWall: S.sel && S.sel.ref && S.sel.ref.id,
        fields: insp ? insp.querySelectorAll("input,select").length : 0,
        action, blocked, wallsHeldStill: q.nodes() === nodes,
      };
    });
    assert.equal(out.selKind, "wall", "the click still selects the wall");
    assert.equal(out.selWall, 1);
    assert.ok(out.fields > 10, "and the inspector filled: " + out.fields + " fields");
    assert.equal(out.action, null, "the drag was refused");
    assert.ok(out.wallsHeldStill, "so the wall did not move");
    assert.deepEqual(
      out.blocked && { layer: out.blocked.layer, reason: out.blocked.reason, where: out.blocked.where },
      { layer: "structure", reason: "rank", where: "2d" },
      "and the refusal was announced with the detail ui_layers.js reads",
    );
  } finally {
    await page.close();
  }
});

/* The pill is the only thing that tells a user why a drag did nothing, so its
   absence is indistinguishable from the app being broken. */
test("a refused drag raises the unlock pill, and a double-click pins it", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      await q.frame();
      q.ev("pointerdown", 120, 0);
      const pill = document.querySelector(".unlock-pill");
      const onPress = pill && { hidden: pill.hidden, text: pill.innerText.trim().length > 0 };
      q.ev("pointerup", 120, 0);
      await q.frame();
      // two more refused presses, then the dblclick the browser would synthesize
      q.click(120, 0); q.click(120, 0);
      q.canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await q.frame();
      const sticky = { hidden: pill.hidden, sticky: pill.classList.contains("sticky") };
      pill.querySelector(".up-fix").click();
      await q.frame();
      return { onPress, sticky, workSet: S.workSet, pinned: !!S.workSetPinned, hidden: pill.hidden };
    });
    assert.deepEqual(out.onPress, { hidden: false, text: true }, "the pill shows on the refused press");
    assert.deepEqual(out.sticky, { hidden: false, sticky: true }, "a double-click makes it stay");
    assert.equal(out.workSet, "structure", "and its fix button moves the work set to the refused layer");
    assert.ok(out.pinned, "pinned, so the next tool change does not undo the fix");
    assert.ok(out.hidden, "the pill goes away once it has been acted on");
  } finally {
    await page.close();
  }
});

/* A ghosted layer is rank Infinity: not dimmed-but-clickable, but genuinely not
   there for the pointer. This is what makes routing MEP over a finished plan
   possible at all. */
test("the MEP work set clicks straight through ghosted walls and furniture", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      q.ui.placeFurnAt("tv", 300, 20);
      await q.frame();
      q.key("3", { shiftKey: true, code: "Digit3" }); // solo MEP
      await q.frame();
      const state = {
        workSet: S.workSet,
        structure: S.layers.structure.vis,
        rank: q.layers.layerRank("structure") === Infinity ? "Infinity" : q.layers.layerRank("structure"),
      };
      S.sel = null; q.click(120, 0); await q.frame();
      const onWall = S.sel && S.sel.kind;
      S.sel = null; q.click(300, 20); await q.frame();
      const onTv = S.sel && S.sel.kind;
      return { state, onWall, onTv };
    });
    assert.deepEqual(out.state, { workSet: "mep", structure: "ghost", rank: "Infinity" });
    assert.equal(out.onWall, null, "the click passed through the ghosted wall");
    assert.equal(out.onTv, null, "and through the ghosted TV");
  } finally {
    await page.close();
  }
});

/* The chip strip and the two keyboard paths are the whole UI of the layer
   system; the amber rim is the standing answer to "can a stray drag move a
   wall right now". */
test("the chips, the L lock and the amber rim all say the same thing", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      await q.frame();
      const chip = () => document.querySelector('[data-layer="structure"]').className;
      const rim = () => document.getElementById("view-2d").classList.contains("structure-live") &&
        document.getElementById("view-3d").classList.contains("structure-live");
      q.key("1", { shiftKey: true, code: "Digit1" }); // solo structure
      await q.frame();
      const focused = { workSet: S.workSet, chip: chip(), rim: rim() };
      q.key("l");
      await q.frame();
      const locked = { lockStruct: S.lockStruct, layer: S.layers.structure.locked, chip: chip(), rim: rim() };
      const nodes = q.nodes();
      const refused = await q.drag(300, 400, 300, 460, 5);
      q.key("l");
      await q.frame();
      const unlocked = { lockStruct: S.lockStruct, chip: chip(), rim: rim() };
      const grabbed = await q.drag(300, 400, 300, 460, 5);
      return {
        focused, locked, unlocked, refused, grabbed,
        heldStillWhileLocked: nodes,
        movedAfterUnlock: Math.round(S.nodes[2].z - 400),
      };
    });
    assert.equal(out.focused.workSet, "structure");
    assert.match(out.focused.chip, /\bon\b/, "the chip shows the focused layer");
    assert.ok(out.focused.rim, "and both panes carry the amber rim while a wall is draggable");
    assert.ok(out.locked.lockStruct && out.locked.layer, "L locks the layer through the alias");
    assert.match(out.locked.chip, /locked/, "the chip follows the key");
    assert.ok(!out.locked.rim, "and the rim goes out, because nothing can move a wall now");
    assert.equal(out.refused, null, "a locked structure layer refuses the wall drag");
    assert.ok(!out.unlocked.lockStruct, "L again unlocks");
    assert.ok(out.unlocked.rim, "and the rim comes back");
    assert.equal(out.grabbed, "wall", "the same press now drags the wall");
    assert.ok(out.movedAfterUnlock > 40, "which moved it: " + out.movedAfterUnlock + " cm");
  } finally {
    await page.close();
  }
});

/* Shift+digit was added on top of bindings the digits already had. Both have to
   keep working or the layer system has cost the plan its tool shortcuts. */
test("Shift+1..5 solos a layer and the bare digits still pick tools", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      await q.frame();
      q.key("2", { shiftKey: true, code: "Digit2" });
      await q.frame();
      const solo = {
        workSet: S.workSet,
        vis: Object.keys(S.layers).map((k) => k + ":" + S.layers[k].vis).join(" "),
      };
      const tools = [];
      for (const k of ["2", "3", "1"]) { q.key(k, { code: "Digit" + k }); await q.frame(); tools.push(S.tool); }
      return { solo, tools };
    });
    assert.equal(out.solo.workSet, "furniture", "Shift+2 focuses furniture");
    assert.equal(
      out.solo.vis,
      "structure:ghost furniture:show mep:ghost annotations:ghost underlay:ghost",
      "and solos it",
    );
    assert.deepEqual(out.tools, ["wall", "door", "select"], "the bare digits still pick tools");
  } finally {
    await page.close();
  }
});

/* The canvas split silently broke both plan exports once already: `#plan` alone
   is now only the document half. */
test("the exported plan image carries the HUD layer at full dpr", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__lay, S = q.S;
      q.room();
      q.ui.placeFurnAt("sofa", 200, 200);
      await q.frame();
      S.sel = { kind: "item", ref: S.items[0] }; // selection chrome lives on the HUD
      q.plan2d.render2DNow();
      const plan = document.getElementById("plan"), hud = document.getElementById("plan-hud");
      const img = q.plan2d.planImageCanvas();
      const ink = (c) => {
        const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
        return n;
      };
      return {
        planSize: [plan.width, plan.height],
        hudSize: [hud.width, hud.height],
        imgSize: [img.width, img.height],
        model: ink(plan), hudInk: ink(hud), composite: ink(img),
        // this is the number ui.js's png2d export divides by
        dpr: img.width / Math.max(1, plan.clientWidth),
      };
    });
    assert.deepEqual(out.hudSize, out.planSize, "both canvases are sized by the same numbers");
    assert.deepEqual(out.imgSize, out.planSize, "and the export is the full backing-store size");
    assert.ok(out.hudInk > 0, "the HUD has something on it: " + out.hudInk + " px");
    assert.ok(
      out.composite > out.model,
      "the composite carries more than the model canvas alone (" +
        out.composite + " vs " + out.model + ")",
    );
    assert.ok(out.dpr >= 1, "and the dpr the export computes is the live element's: " + out.dpr);
  } finally {
    await page.close();
  }
});
