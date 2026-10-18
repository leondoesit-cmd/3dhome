import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

/* A blank plan with one square room, one door and one sofa, laid out in world
   coordinates the test can convert back to screen points. Built by hand rather
   than by driving the tools, so a failure here is about the verbs under test
   and not about whatever the drawing tools did that day. */
const FIXTURE = `async () => {
  const start = document.getElementById("start-screen");
  if (start) start.hidden = true;
  const { S } = await import("./js/state.js");
  const { render2D } = await import("./js/plan2d.js");
  S.walls.length = 0; S.nodes.length = 0; S.openings.length = 0; S.items.length = 0;
  S.sel = null; S.SC = 1; S.OX = 40; S.OY = 40; S.viewAxis = "top";
  const n = (x, z) => (S.nodes.push({ x, z }), S.nodes.length - 1);
  const a = n(0, 0), b = n(400, 0), c = n(400, 400), d = n(0, 400);
  [[a, b], [b, c], [c, d], [d, a]].forEach(([p, q], i) =>
    S.walls.push({ id: 700 + i, a: p, b: q, thickness: 10, height: 260 }));
  S.openings.push({ id: 800, type: "door", wall: 700, s: 200, width: 90, height: 205, sill: 0, swingDir: "R_IN" });
  S.items.push({ id: 900, type: "sofa", x: 200, z: 200, w: 180, d: 90, h: 80, rot: 0 });
  render2D();
}`;

const rowLabels = () =>
  [...document.querySelectorAll("#m-ctx button")].map((b) => b.getAttribute("aria-label"));

test("the contextual row offers each kind the verb that kind answers to", opts, async () => {
  // 360px is the narrowest phone the compact layout claims to serve: the row
  // has to hold its widest state there without becoming a swipeable rail.
  const page = await openPage({ width: 360, height: 780, lang: "en", mobile: true, touch: true });
  try {
    // This is the classic full-width context row's no-scroll contract.
    // Round-6 intentionally relocates it into a narrower scrolling dock;
    // pro_compact.browser.mjs covers that separate presentation.
    await page.eval(() => localStorage.setItem("mf.proSkin", "0"));
    await page.goto("/");
    await page.eval(new Function("return (" + FIXTURE + ")()"));
    const rows = await page.eval(async () => {
      const { S } = await import("./js/state.js");
      const { select } = await import("./js/ui.js");
      const bar = document.getElementById("m-ctx");
      const out = {};
      const snap = async (tag, sel) => {
        select(sel);
        await new Promise((r) => setTimeout(r, 320));
        out[tag] = {
          labels: [...bar.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")),
          overflow: bar.scrollWidth - bar.clientWidth,
        };
      };
      await snap("item", { kind: "item", ref: S.items[0] });
      await snap("door", { kind: "opening", ref: S.openings[0] });
      await snap("wall", { kind: "wall", ref: S.walls[0] });
      await snap("none", null);
      return out;
    });

    assert.deepEqual(rows.item.labels, ["Undo", "Redo", "Rotate 90°", "Finish", "Edit", "More"]);
    assert.deepEqual(rows.door.labels, ["Undo", "Redo", "Flip swing", "Edit", "Delete"]);
    assert.deepEqual(rows.wall.labels, ["Undo", "Redo", "Add door", "Finish", "Add window", "More"]);
    assert.deepEqual(rows.none.labels, ["Undo", "Redo", "Center view", "OSNAP", "ORTHO", "GRID"], "Undo/Redo stay first while classic framing and drafting aids remain available");
    Object.entries(rows).forEach(([tag, row]) =>
      assert.ok(row.overflow <= 0, `the ${tag} row fits 360px without scrolling (${row.overflow}px over)`));
  } finally {
    await page.close();
  }
});

test("Rotate and Flip swing are single taps and are undoable", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await page.eval(new Function("return (" + FIXTURE + ")()"));
    const result = await page.eval(async () => {
      const { S } = await import("./js/state.js");
      const { select } = await import("./js/ui.js");
      const { undo } = await import("./js/history.js");
      const press = (label) =>
        document.querySelector('#m-ctx button[aria-label="' + label + '"]').click();
      const settle = () => new Promise((r) => setTimeout(r, 320));

      select({ kind: "item", ref: S.items[0] });
      await settle();
      const rotBefore = S.items[0].rot;
      press("Rotate 90°");
      const rotAfter = S.items[0].rot;
      undo();
      const rotUndone = S.items[0].rot;

      select({ kind: "opening", ref: S.openings[0] });
      await settle();
      const swings = [S.openings[0].swingDir];
      for (let i = 0; i < 4; i++) {
        press("Flip swing");
        swings.push(S.openings[0].swingDir);
      }
      return { rotBefore, rotAfter, rotUndone, swings };
    });
    assert.equal(result.rotAfter, (result.rotBefore + 90) % 360, "one tap is a quarter turn");
    assert.equal(result.rotUndone, result.rotBefore, "the turn is one undo step");
    assert.deepEqual(result.swings, ["R_IN", "L_IN", "L_OUT", "R_OUT", "R_IN"],
      "four taps walk the hinge all the way back to where it started");
  } finally {
    await page.close();
  }
});

test("double-tap turns the piece under the finger, and nothing when there is none", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await page.eval(new Function("return (" + FIXTURE + ")()"));
    const out = await page.eval(async () => {
      const { S } = await import("./js/state.js");
      const plan = document.getElementById("plan");
      const at = (x, z) => {
        const b = plan.getBoundingClientRect();
        return { clientX: b.left + S.OX + x * S.SC, clientY: b.top + S.OY + z * S.SC };
      };
      const dbl = (pt) => plan.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, ...pt }));
      const it = S.items[0];
      const before = it.rot;
      dbl(at(it.x, it.z));
      const onPiece = it.rot;
      dbl(at(it.x, it.z + 260)); // bare floor well clear of the sofa
      const offPiece = it.rot;
      const door = S.openings[0];
      const swingBefore = door.swingDir;
      dbl(at(200, 0)); // the door's midpoint on the top wall
      return { before, onPiece, offPiece, swingBefore, swingAfter: door.swingDir };
    });
    assert.equal(out.onPiece, (out.before + 90) % 360, "a double-tap on the piece turns it");
    assert.equal(out.offPiece, out.onPiece, "a double-tap on bare floor turns nothing");
    assert.notEqual(out.swingAfter, out.swingBefore, "a double-tap on the door flips its swing");
  } finally {
    await page.close();
  }
});

test("two fingers undo, three redo", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await page.eval(new Function("return (" + FIXTURE + ")()"));
    const out = await page.eval(async () => {
      const { S } = await import("./js/state.js");
      const { canUndo, canRedo } = await import("./js/history.js");
      const { select } = await import("./js/ui.js");
      const plan = document.getElementById("plan");
      const b = plan.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      let pid = 400;
      const tap = (fingers) => {
        const ids = [];
        for (let i = 0; i < fingers; i++) {
          const pointerId = ++pid;
          ids.push(pointerId);
          plan.dispatchEvent(new PointerEvent("pointerdown", {
            bubbles: true, pointerId, pointerType: "touch",
            clientX: x + i * 30, clientY: y, isPrimary: i === 0,
          }));
        }
        ids.reverse().forEach((pointerId) =>
          plan.dispatchEvent(new PointerEvent("pointerup", {
            bubbles: true, pointerId, pointerType: "touch", clientX: x, clientY: y,
          })));
      };
      select({ kind: "item", ref: S.items[0] });
      await new Promise((r) => setTimeout(r, 320));
      document.querySelector('#m-ctx button[aria-label="Rotate 90°"]').click();
      const armed = { undo: canUndo(), redo: canRedo(), rot: S.items[0].rot };
      tap(2);
      const undone = { undo: canUndo(), redo: canRedo(), rot: S.items[0].rot };
      tap(3);
      const redone = { undo: canUndo(), redo: canRedo(), rot: S.items[0].rot };
      return { armed, undone, redone };
    });
    assert.equal(out.armed.undo, true);
    assert.equal(out.undone.rot, (out.armed.rot + 270) % 360, "two fingers put the turn back");
    assert.equal(out.undone.redo, true, "and leave something to redo");
    assert.equal(out.redone.rot, out.armed.rot, "three fingers redo it");
    assert.equal(out.redone.redo, false);
  } finally {
    await page.close();
  }
});

test("a finger closes its own loop from further out than a mouse does", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    const closed = await page.eval(async () => {
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      const { S } = await import("./js/state.js");
      const { setTool } = await import("./js/interaction.js");
      const { render2D } = await import("./js/plan2d.js");
      const plan = document.getElementById("plan");

      /* Overview zoom is the regime this is about: a whole floor plan on a
         phone screen, where the 30cm wall-join tolerance is only a handful of
         pixels and the snap radius is what actually catches the corner. At
         SC 0.5 and above the join tolerance already covers more screen than
         any snap radius and touch and mouse measure the same. */
      const SC = 0.2;
      function reset() {
        S.walls.length = 0; S.nodes.length = 0; S.openings.length = 0; S.items.length = 0;
        S.drawing = false; S.drawStart = null; S.drawFrom = null; S.drawWalls = [];
        S.sel = null; S.previewPt = null;
        S.SC = SC; S.OX = 200; S.OY = 200; S.viewAxis = "top";
        render2D();
      }
      const at = (x, z) => {
        const b = plan.getBoundingClientRect();
        return { x: b.left + S.OX + x * S.SC, y: b.top + S.OY + z * S.SC };
      };
      let pid = 900;
      const tap = (pt, pointerType) => {
        const pointerId = ++pid;
        const base = { bubbles: true, pointerId, pointerType, isPrimary: true,
          clientX: pt.x, clientY: pt.y, button: 0, buttons: 1 };
        plan.dispatchEvent(new PointerEvent("pointerdown", base));
        plan.dispatchEvent(new PointerEvent("pointerup", { ...base, buttons: 0 }));
      };
      /* Three sides of a square, then a fourth tap missing the start corner by
         `off` screen pixels along the outward diagonal — clear of both wall
         lines, so only the corner snap can catch it. A closed run is four
         walls over four nodes with the tool no longer drawing; a missed one
         leaves a fifth node and a loose stub. */
      function closes(pointerType, off) {
        reset();
        setTool("wall");
        [[0, 0], [300, 0], [300, 300], [0, 300]].forEach((p) => tap(at(p[0], p[1]), pointerType));
        const corner = at(0, 0), k = off / Math.SQRT2;
        tap({ x: corner.x - k, y: corner.y - k }, pointerType);
        const ok = S.walls.length === 4 && S.nodes.length === 4 && !S.drawing;
        setTool("select");
        return ok;
      }
      // 14px is the authored mouse radius; touch multiplies it by PICK_SLOP.
      const out = {
        near: { touch: closes("touch", 10), mouse: closes("mouse", 10) },
        mid: { touch: closes("touch", 20), mouse: closes("mouse", 20) },
        far: { touch: closes("touch", 40), mouse: closes("mouse", 40) },
      };
      reset();
      return out;
    });
    assert.deepEqual(closed.near, { touch: true, mouse: true },
      "a tap on the corner closes the loop however you are pointing");
    assert.deepEqual(closed.mid, { touch: true, mouse: false },
      "a fingertip's worth of miss closes it; the same miss with a mouse is a real instruction");
    assert.deepEqual(closed.far, { touch: false, mouse: false },
      "a genuine miss still draws where you asked, whatever the pointer");
  } finally {
    await page.close();
  }
});

/* A bare square room, plus the helpers to point at its floor. */
const ROOM_FIXTURE = `async () => {
  const start = document.getElementById("start-screen");
  if (start) start.hidden = true;
  const { S } = await import("./js/state.js");
  const { render2D } = await import("./js/plan2d.js");
  S.walls.length = 0; S.nodes.length = 0; S.openings.length = 0; S.items.length = 0;
  S.roomMeta = {}; S.sel = null; S.SC = 1; S.OX = 40; S.OY = 40; S.viewAxis = "top";
  const n = (x, z) => (S.nodes.push({ x, z }), S.nodes.length - 1);
  const a = n(0, 0), b = n(400, 0), c = n(400, 400), d = n(0, 400);
  [[a, b], [b, c], [c, d], [d, a]].forEach(([p, q], i) =>
    S.walls.push({ id: 700 + i, a: p, b: q, thickness: 10, height: 260 }));
  render2D();
}`;

test("double-tapping a room floor opens a picker of real swatches", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await page.eval(new Function("return (" + ROOM_FIXTURE + ")()"));
    const out = await page.eval(async () => {
      const { S } = await import("./js/state.js");
      const plan = document.getElementById("plan");
      const box = plan.getBoundingClientRect();
      plan.dispatchEvent(new MouseEvent("dblclick", {
        bubbles: true,
        clientX: box.left + S.OX + 200 * S.SC,
        clientY: box.top + S.OY + 200 * S.SC,
      }));
      await new Promise((r) => setTimeout(r, 400));
      const modal = document.querySelector(".bp-overlay .floor-pick-body");
      const tiles = modal ? [...modal.querySelectorAll("[data-floor]")] : [];
      const swatch = tiles[0] && tiles[0].querySelector("img");
      const options = [...document.querySelectorAll("#r_floor option")].map((o) => o.value);
      const key = S.sel && S.sel.ref;
      // Measured while the picker is still up: the click below closes it.
      const tileWidth = tiles[0] ? Math.round(tiles[0].getBoundingClientRect().width) : 0;
      tiles.find((tile) => tile.dataset.floor === "terrazzo").click();
      await new Promise((r) => setTimeout(r, 200));
      return {
        selected: S.sel && S.sel.kind,
        offered: tiles.map((tile) => tile.dataset.floor),
        options,
        groups: modal ? [...modal.querySelectorAll(".floor-pick-sec")].map((h) => h.textContent) : [],
        marked: modal ? [...modal.querySelectorAll(".floor-tile.on")].map((t) => t.dataset.floor) : null,
        planDefault: S.floorTex,
        // A swatch is a real painted PNG, not a placeholder box.
        swatchPainted: !!swatch && swatch.src.startsWith("data:image/png") && swatch.src.length > 400,
        tileWidth,
        floor: (S.roomMeta[key] || {}).floor,
        closed: !document.querySelector(".bp-overlay .floor-pick-body"),
      };
    });
    assert.equal(out.selected, "room", "the double-tap selects the room it landed in");
    assert.deepEqual(out.offered, out.options,
      "the picker offers exactly the materials the inspector select does");
    assert.deepEqual(out.groups, ["Wood", "Tile", "Stone", "Soft & poured"]);
    assert.deepEqual(out.marked, [out.planDefault],
      "a room that has never been given its own floor marks the plan-wide default");
    assert.equal(out.swatchPainted, true);
    assert.ok(out.tileWidth >= 44, `swatches are real touch targets (${out.tileWidth}px)`);
    assert.equal(out.floor, "terrazzo", "one tap sets the floor");
    assert.equal(out.closed, true, "and closes the picker");
  } finally {
    await page.close();
  }
});

test("picking a preset drops an uploaded floor image, and undo brings both back", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    await page.eval(new Function("return (" + ROOM_FIXTURE + ")()"));
    const out = await page.eval(async () => {
      const { S } = await import("./js/state.js");
      const { select } = await import("./js/ui.js");
      const { undo } = await import("./js/history.js");
      const geom = await import("./js/geometry.js");
      const key = geom.detectRooms()[0].key;
      select({ kind: "room", ref: key });
      await new Promise((r) => setTimeout(r, 340));
      const row = [...document.querySelectorAll("#m-ctx button")].map((b) => b.getAttribute("aria-label"));
      const bar = document.getElementById("m-ctx");

      const meta = (S.roomMeta[key] = S.roomMeta[key] || {});
      meta.floor = "wood";
      meta.floorTex = "data:image/png;base64,AAAA";
      document.querySelector('#m-ctx button[aria-label="Floor"]').click();
      await new Promise((r) => setTimeout(r, 400));
      const marked = [...document.querySelectorAll(".floor-tile.on")].map((t) => t.dataset.floor);
      document.querySelector('.floor-tile[data-floor="marble"]').click();
      await new Promise((r) => setTimeout(r, 200));
      const after = { floor: S.roomMeta[key].floor, tex: !!S.roomMeta[key].floorTex };
      undo();
      const undone = { floor: (S.roomMeta[key] || {}).floor, tex: !!(S.roomMeta[key] || {}).floorTex };
      return { row, overflow: bar.scrollWidth - bar.clientWidth, marked, after, undone };
    });
    assert.deepEqual(out.row, ["Undo", "Redo", "Floor", "Finish", "More"],
      "a room's row leads with the property nobody can name from memory");
    assert.ok(out.overflow <= 0, "and still fits without scrolling");
    assert.deepEqual(out.marked, ["wood"], "the picker opens showing what the floor is now");
    assert.deepEqual(out.after, { floor: "marble", tex: false },
      "a preset replaces the uploaded image instead of hiding behind it");
    assert.deepEqual(out.undone, { floor: "wood", tex: true },
      "and one undo returns the image as well as the material");
  } finally {
    await page.close();
  }
});
