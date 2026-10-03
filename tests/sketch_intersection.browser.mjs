import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();

function clickCanvas(page, points, modifiers = {}) {
  return page.eval((payload) => {
    const canvas = document.querySelector("#mdCanvas");
    const rect = canvas.getBoundingClientRect();
    for (const [x, y] of payload.points) {
      const init = {
        bubbles: true, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse",
        clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y,
        ctrlKey: !!payload.ctrlKey, metaKey: !!payload.metaKey,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", init));
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    }
  }, { points, ...modifiers });
}

test("Add Relations Intersection pins a sketch point to two crossing lines", chrome ? { timeout: 60000 } : { skip: "Chrome unavailable" }, async () => {
  const page = await openPage({ width: 1440, height: 1000, lang: "en" });
  try {
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      openModeler(null, { key: "sketch_intersection", name: "Sketch intersection", parts: [] }, null);
      document.querySelector('#mdModes [data-mode="2d"]').click();
      document.querySelector('[data-command="wall"]').click();
    });
    await page.eval(() => {
      const picker = document.querySelector("#mdReferencePicker");
      if (picker && !picker.hidden) picker.querySelector("button.md-reference-option")?.click();
    });

    await clickCanvas(page, [[0.28, 0.50], [0.72, 0.50]]);
    await page.eval(() => document.querySelector("#modeler [data-command=\"select\"]").click());
    await page.eval(() => document.querySelector("#modeler [data-command=\"wall\"]").click());
    await clickCanvas(page, [[0.50, 0.72], [0.50, 0.28]]);
    await page.eval(() => document.querySelector("#modeler [data-command=\"select\"]").click());

    const drawn = await page.eval(() => window.cadSketchSnapshot());
    assert.equal(drawn.entityTypes.filter((type) => type === "line").length, 2, JSON.stringify(drawn));

    await clickCanvas(page, [[0.28, 0.50]]);
    await clickCanvas(page, [[0.60, 0.50]], { ctrlKey: true });
    await clickCanvas(page, [[0.50, 0.60]], { ctrlKey: true });

    const ready = await page.eval(() => {
      document.querySelector('#modeler [data-tab="sketch"]')?.click();
      const button = document.querySelector('#modeler [data-constraint="intersection"]');
      return {
        exists: !!button,
        disabled: button?.disabled,
        label: button?.textContent,
        tabs: [...document.querySelectorAll("#modeler [data-tab]")].map((tab) => tab.getAttribute("data-tab")),
        constraints: [...document.querySelectorAll("#modeler [data-constraint]")].map((item) => item.getAttribute("data-constraint")),
        snapshot: window.cadSketchSnapshot(),
        picked: [...document.querySelectorAll('.md-geometry-pick[aria-pressed="true"]')].map((item)=>item.textContent),
      };
    });
    assert.equal(ready.exists, true, JSON.stringify(ready));
    assert.equal(ready.disabled, false, JSON.stringify(ready));
    await page.eval(() => document.querySelector('#modeler [data-constraint="intersection"]').click());

    const after = await page.eval(() => window.cadSketchSnapshot());
    assert.ok(after.constraintTypes.includes("intersection"), JSON.stringify(after));
    const pinned = after.points.some((point) =>
      after.points.filter((other) => Math.abs(other.x - point.x) < 0.2).length >= 2
      && after.points.filter((other) => Math.abs(other.y - point.y) < 0.2).length >= 2
    );
    assert.ok(pinned, JSON.stringify(after.points));
  } finally {
    await page.close();
  }
});
