/* Verification of touch interactions in customize mode.
 *
 * Touch rules:
 * - Tap selects at current depth (no drill)
 * - Press still for 500ms drills into container
 * - Movement past 10px drags, cancelling the drill timer
 */
import test from "./helpers/customize_gate.mjs"; // skipped while UI Customize is off
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;

test.after(async () => {
  if (shared) await shared.close();
});

async function customizing() {
  if (!shared) shared = await openPage({ width: 1440, height: 900 });
  await shared.goto("/");
  await shared.eval(() => {
    localStorage.removeItem("mf_uikit");
    localStorage.removeItem("home3d_uikit:planner");
  });
  await shared.goto("/");
  await shared.eval(async () => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
    window.__runAction("uikitCustomize");
    for (let i = 0; i < 400 && !document.querySelector(".uikit-ins"); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const host = await import("/js/uikit_host/index.js");
    window.__ui = host.activeUIKit();
    window.__ed = window.__ui.editor;
    window.__frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  });
  return shared;
}

test("touch tap selects at depth without drilling", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    const topbar = document.getElementById("topbar");
    const rect = topbar.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Dispatch a quick touch tap (pointerdown + pointerup in 50ms)
    document.dispatchEvent(new PointerEvent("pointerdown", {
      pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true,
    }));
    await new Promise((r) => setTimeout(r, 50));
    document.dispatchEvent(new PointerEvent("pointerup", {
      pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true,
    }));
    await window.__frame();

    return {
      selected: ed.selection(),
      focus: ed.focus(),
    };
  });

  assert.ok(result.selected.length > 0, "node selected on touch tap");
  // At root level, single tap on topbar selects topbar, focus remains root
  assert.equal(result.focus, null, "focus did not drill into container on simple tap");
});

test("touch long-press (500ms) drills into container", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    // Start from clean selection
    ed.command("select", { id: null });
    await window.__frame();

    const topbar = document.getElementById("topbar");
    const rect = topbar.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Dispatch touch down and hold still for 550ms
    document.dispatchEvent(new PointerEvent("pointerdown", {
      pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true,
    }));
    await new Promise((r) => setTimeout(r, 550));
    document.dispatchEvent(new PointerEvent("pointerup", {
      pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true,
    }));
    await window.__frame();

    return {
      selected: ed.selection(),
      focus: ed.focus(),
    };
  });

  assert.equal(result.focus, "n:topbar", "long press drilled focus into n:topbar");
});

test("touch drag past 10px threshold cancels drill timer", opts, async () => {
  const page = await customizing();
  const result = await page.eval(async () => {
    const ed = window.__ed;
    ed.command("select", { id: null });
    await window.__frame();

    const topbar = document.getElementById("topbar");
    const rect = topbar.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    document.dispatchEvent(new PointerEvent("pointerdown", {
      pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true,
    }));
    // Move 15px (past TOUCH_DRAG_THRESHOLD = 10)
    await new Promise((r) => setTimeout(r, 50));
    document.dispatchEvent(new PointerEvent("pointermove", {
      pointerType: "touch", clientX: x + 15, clientY: y, bubbles: true,
    }));
    // Wait for the remainder of 550ms
    await new Promise((r) => setTimeout(r, 550));
    document.dispatchEvent(new PointerEvent("pointerup", {
      pointerType: "touch", clientX: x + 15, clientY: y, bubbles: true,
    }));
    await window.__frame();

    return {
      focus: ed.focus(),
    };
  });

  assert.equal(result.focus, null, "touch movement cancelled drill timer, focus remained at root");
});
