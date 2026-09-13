import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();

function clickCanvas(page, points) {
  return page.eval((xy) => {
    const canvas = document.querySelector("#mdCanvas");
    const rect = canvas.getBoundingClientRect();
    for (const [x, y] of xy) {
      const init = { bubbles: true, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", clientX: rect.left + rect.width * x, clientY: rect.top + rect.height * y };
      canvas.dispatchEvent(new PointerEvent("pointerdown", init));
      canvas.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    }
  }, points);
}

test("Sketch Fillet trims an L and keeps a driving radius from the PropertyManager", chrome ? { timeout: 60000 } : { skip: "Chrome unavailable" }, async () => {
  const page = await openPage({ width: 1440, height: 1000, lang: "en" });
  try {
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      openModeler(null, { key: "sketch_fillet", name: "Sketch fillet", parts: [] }, null);
      document.querySelector('#mdModes [data-mode="2d"]').click();
      document.querySelector('[data-command="wall"]').click();
    });
    await page.eval(() => {
      const picker = document.querySelector("#mdReferencePicker");
      if (picker && !picker.hidden) picker.querySelector("button.md-reference-option")?.click();
    });
    const before = await page.eval(() => window.cadSketchSnapshot());
    assert.equal(before.tool, "wall", JSON.stringify({ before, hint: await page.eval(() => document.querySelector("#mdHint")?.textContent) }));

    await clickCanvas(page, [[0.35, 0.72], [0.35, 0.38], [0.68, 0.38]]);
    const drawn = await page.eval(() => window.cadSketchSnapshot());
    assert.equal(drawn.entityTypes.filter((type) => type === "line").length, 2, JSON.stringify(drawn));

    await page.eval(() => document.querySelector('[data-command="sketchfillet"]').click());
    const armed = await page.eval(() => ({
      tool: window.cadSketchSnapshot().tool,
      radius: document.querySelector('#mdQuickSettings [data-parameter="radius"] input')?.value,
      hint: document.querySelector("#mdHint")?.textContent,
    }));
    assert.equal(armed.tool, "sketchfillet", JSON.stringify(armed));
    assert.ok(armed.radius, JSON.stringify(armed));
    await page.eval(() => {
      const input = document.querySelector('#mdQuickSettings [data-parameter="radius"] input');
      input.value = "1";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await clickCanvas(page, [[0.35, 0.38]]);
    const after = await page.eval(() => window.cadSketchSnapshot());
    assert.ok(after.entityTypes.includes("arc"), JSON.stringify(after));
    assert.ok(after.constraintTypes.includes("tangent"));
    assert.ok(after.constraintTypes.includes("radius"));
  } finally {
    await page.close();
  }
});
