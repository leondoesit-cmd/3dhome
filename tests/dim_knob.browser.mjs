import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

/* A wall has to be selected for the length field to be bound to anything, so
   every case here starts from the same real selection rather than poking a
   detached input. */
async function planWithWallSelected() {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  await page.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    const { S } = await import("/js/state.js");
    const { select } = await import("/js/ui_props.js");
    select({ kind: "wall", ref: S.walls[0] });
    window.__testWall = () => S.walls[0];
  });
  return page;
}

/* PointerEvent, not click: the dial claims the tap in the capture phase, which
   is the only place it can get in front of focus and the soft keyboard. */
function tap(selectorOrNode, x, y) {
  const node = typeof selectorOrNode === "string" ? document.querySelector(selectorOrNode) : selectorOrNode;
  const r = node.getBoundingClientRect();
  node.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      composed: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: x == null ? r.left + r.width / 2 : x,
      clientY: y == null ? r.top + r.height / 2 : y,
      cancelable: true,
    }),
  );
}

test("tapping a dimension field on a phone opens the dial instead of the keyboard", opts, async () => {
  const page = await planWithWallSelected();
  try {
    const state = await page.eval((tapSrc) => {
      eval("window.__tap = " + tapSrc);
      window.__tap("#w_len");
      const dial = document.getElementById("dim-knob");
      const field = document.getElementById("w_len");
      return {
        exists: !!dial,
        visible: !!dial && !dial.hidden,
        label: dial && dial.querySelector(".dk-label").textContent,
        unit: dial && dial.querySelector(".dk-unit").textContent,
        readout: dial && dial.querySelector(".dk-value").textContent,
        fieldValue: field.value,
        focused: document.activeElement === field,
        readOnly: field.readOnly,
        inputMode: field.getAttribute("inputmode"),
        marked: field.classList.contains("dim-knob-live"),
      };
    }, tap.toString());
    assert.equal(state.visible, true, "the dial is up");
    assert.equal(state.label, "Length", "it names the field it owns");
    assert.equal(state.unit, "cm");
    assert.equal(state.readout, state.fieldValue, "the readout starts on the field's value");
    assert.equal(state.focused, true, "the field really has focus, so undo is snapshotted");
    assert.equal(state.readOnly, true, "readOnly is what keeps the soft keyboard down");
    assert.equal(state.inputMode, "none");
    assert.equal(state.marked, true);
  } finally {
    await page.close();
  }
});

test("turning the dial scrubs the wall live, in one undo step", opts, async () => {
  const page = await planWithWallSelected();
  try {
    const result = await page.eval(async (tapSrc) => {
      eval("window.__tap = " + tapSrc);
      const { S } = await import("/js/state.js");
      const { wallClearLength } = await import("/js/geometry.js");
      const wall = window.__testWall();
      const field = document.getElementById("w_len");
      const before = { value: Number(field.value) };
      window.__tap("#w_len");

      const dial = document.querySelector("#dim-knob .dk-dial");
      const r = dial.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const radius = r.width / 2 - 6;
      const send = (type, deg, stamp) =>
        dial.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 2, pointerType: "touch",
            clientX: cx + Math.cos((deg * Math.PI) / 180) * radius,
            clientY: cy + Math.sin((deg * Math.PI) / 180) * radius,
          }),
        );
      /* Twelve 5-degree steps, 40ms apart: 0.125 deg/ms is deliberate travel,
         well under the acceleration knee, so this is 60 degrees at gain 1 and
         the arithmetic is exact rather than dependent on frame timing. */
      send("pointerdown", -90);
      const frames = [];
      for (let i = 1; i <= 12; i++) {
        await new Promise((r2) => setTimeout(r2, 40));
        send("pointermove", -90 + i * 5);
        await new Promise((r2) => requestAnimationFrame(r2));
        frames.push(Number(field.value));
      }
      send("pointerup", -30);
      await new Promise((r2) => requestAnimationFrame(r2));

      const scrubbed = Number(field.value);
      const step = document.querySelector("#dim-knob .dk-step").textContent;
      const liveWall = Math.round(wallClearLength(wall));
      // close the dial the way Done does, then undo once
      document.querySelector("#dim-knob .dk-done").click();
      const { undo } = await import("/js/history.js");
      undo();
      /* undo swaps the whole model in, so the wall to measure afterwards is
         the restored one, not the object the scrub was holding. */
      return {
        before: before.value,
        scrubbed,
        step,
        moved: frames.filter((v, i) => i > 0 && v !== frames[i - 1]).length,
        liveWall,
        afterUndo: Math.round(wallClearLength(S.walls[0])),
        dialClosed: document.getElementById("dim-knob").hidden,
        stillReadOnly: document.getElementById("w_len").readOnly,
      };
    }, tap.toString());

    assert.ok(result.scrubbed > result.before, `dial raised the length ${result.before} -> ${result.scrubbed}`);
    assert.equal(result.scrubbed, result.before + 10, "60 degrees of slow turn is ten base steps");
    assert.ok(result.moved >= 5, "the value moves continuously through the drag, not once at the end");
    assert.equal(result.step, "±1", "a deliberate turn stays on the field's own unit");
    assert.equal(result.liveWall, result.scrubbed, "the model followed the scrub, not just the box");
    assert.equal(result.afterUndo, result.before, "one whole scrub undoes as one step, not twelve");
    assert.equal(result.dialClosed, true);
    assert.equal(result.stillReadOnly, false, "the field is handed back exactly as it was");
  } finally {
    await page.close();
  }
});

test("a fast flick climbs the step ladder; the strip scrubs the same value", opts, async () => {
  const page = await planWithWallSelected();
  try {
    const result = await page.eval(async (tapSrc) => {
      eval("window.__tap = " + tapSrc);
      window.__tap("#w_th");
      const field = document.getElementById("w_th");
      const start = Number(field.value);
      const wheel = document.querySelector("#dim-knob .dk-wheel");
      const r = wheel.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const send = (type, x) =>
        wheel.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 3, pointerType: "touch",
            clientX: x, clientY: y,
          }),
        );
      send("pointerdown", r.left + 10);
      send("pointermove", r.left + 200); // one flick, no frames in between
      await new Promise((r2) => requestAnimationFrame(r2));
      const step = document.querySelector("#dim-knob .dk-step").textContent;
      send("pointerup", r.left + 200);
      await new Promise((r2) => requestAnimationFrame(r2));
      const flicked = Number(field.value);
      const settled = document.querySelector("#dim-knob .dk-step").textContent;
      document.querySelector("#dim-knob .dk-done").click();
      return { start, flicked, step, settled, max: field.getAttribute("max") };
    }, tap.toString());

    assert.notEqual(result.step, "±1", "a flick is a magnitude, not a millimetre: " + result.step);
    assert.ok(result.flicked > result.start, "the strip moved the value up");
    assert.equal(result.settled, "±1", "letting go restores fine resolution");
  } finally {
    await page.close();
  }
});

test("the field is the source of truth in both directions", opts, async () => {
  const page = await planWithWallSelected();
  try {
    const result = await page.eval(async (tapSrc) => {
      eval("window.__tap = " + tapSrc);
      window.__tap("#w_h");
      const field = document.getElementById("w_h");
      // something else in the app writes the field while the dial is open
      field.value = "255";
      await new Promise((r) => requestAnimationFrame(r));
      const adopted = document.querySelector("#dim-knob .dk-value").textContent;
      document.querySelector("#dim-knob .dk-nudge[data-dir='1']").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 4, pointerType: "touch" }),
      );
      await new Promise((r) => requestAnimationFrame(r));
      const nudged = Number(field.value);
      document.querySelector("#dim-knob .dk-close").click();
      return { adopted, nudged, hookRemoved: !Object.getOwnPropertyDescriptor(field, "value") };
    }, tap.toString());

    assert.equal(result.adopted, "255", "an external write reaches the readout");
    assert.equal(result.nudged, 256, "and the next nudge continues from it");
    assert.equal(result.hookRemoved, true, "the shadowing accessor does not outlive the dial");
  } finally {
    await page.close();
  }
});

test("a desktop window never gets the dial", opts, async () => {
  const page = await openPage({ width: 1440, height: 900, lang: "en", mobile: false, touch: false });
  try {
    const state = await page.eval(async (tapSrc) => {
      eval("window.__tap = " + tapSrc);
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      const { S } = await import("/js/state.js");
      const { select } = await import("/js/ui_props.js");
      select({ kind: "wall", ref: S.walls[0] });
      window.__tap("#w_len");
      return {
        compact: document.body.classList.contains("compact-nav"),
        dial: !!document.getElementById("dim-knob"),
        readOnly: document.getElementById("w_len").readOnly,
      };
    }, tap.toString());
    assert.equal(state.compact, false);
    assert.equal(state.dial, false, "nothing is built on a pointer layout");
    assert.equal(state.readOnly, false, "typing is untouched on the desktop");
  } finally {
    await page.close();
  }
});

test("an item dimension applies live, but its proposal dialog waits for the release", opts, async () => {
  const page = await openPage({ width: 390, height: 844, lang: "en", mobile: true, touch: true });
  try {
    const result = await page.eval(async (tapSrc) => {
      eval("window.__tap = " + tapSrc);
      const start = document.getElementById("start-screen");
      if (start) start.hidden = true;
      const { S } = await import("/js/state.js");
      const { select } = await import("/js/ui_props.js");
      const item = S.items[0];
      select({ kind: "item", ref: item });
      window.__tap("#i_w");

      const field = document.getElementById("i_w");
      const before = item.w;
      const dial = document.querySelector("#dim-knob .dk-dial");
      const r = dial.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 - 6;
      const send = (type, deg) =>
        dial.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true, cancelable: true, pointerId: 5, pointerType: "touch",
            clientX: cx + Math.cos((deg * Math.PI) / 180) * rad,
            clientY: cy + Math.sin((deg * Math.PI) / 180) * rad,
          }),
        );
      send("pointerdown", -90);
      const midDrag = [];
      for (let i = 1; i <= 6; i++) {
        await new Promise((r2) => setTimeout(r2, 40));
        send("pointermove", -90 + i * 5);
        await new Promise((r2) => requestAnimationFrame(r2));
        midDrag.push(item.w);
      }
      const dialogsDuringDrag = document.querySelectorAll("dialog[open]").length;
      send("pointerup", -60);
      await new Promise((r2) => requestAnimationFrame(r2));
      document.querySelector("#dim-knob .dk-done").click();
      return { before, after: item.w, midDrag, field: Number(field.value), dialogsDuringDrag };
    }, tap.toString());

    assert.equal(result.after, result.before + 5, "six 5-degree steps resized the piece by 5 cm");
    assert.equal(result.field, result.after, "the box and the model agree");
    assert.ok(
      result.midDrag.some((w, i) => i > 0 && w !== result.midDrag[i - 1]),
      "the piece resizes DURING the drag — this field commits on blur, so it needs the live channel",
    );
    assert.equal(result.dialogsDuringDrag, 0, "no proposal dialog opens mid-gesture");
  } finally {
    await page.close();
  }
});
