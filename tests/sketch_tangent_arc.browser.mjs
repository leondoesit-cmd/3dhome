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

test("Tangent Arc starts on a line endpoint and adds a tangent relation", chrome ? { timeout: 60000 } : { skip: "Chrome unavailable" }, async () => {
  const page = await openPage({ width: 1440, height: 1000, lang: "en" });
  try {
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      openModeler(null, { key: "tangent_arc", name: "Tangent arc", parts: [] }, null);
    });
    if (process.env.MF_BROWSER_GPU === '1') {
      await page.waitUntil(() => !!window.cadPreviewView?.rr, {what:'model preview renderer'});
      await page.eval(async () => { await (await import('/js/gpu.js')).ready(window.cadPreviewView.rr); });
    }
    await page.eval(() => {
      document.querySelector('#mdModes [data-mode="2d"]').click();
      document.querySelector("#modeler [data-command=\"wall\"]").click();
    });
    await page.eval(() => {
      const picker = document.querySelector("#mdReferencePicker");
      if (picker && !picker.hidden) picker.querySelector("button.md-reference-option")?.click();
    });
    await page.eval(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });

    await clickCanvas(page, [[0.40, 0.55], [0.70, 0.55]]);
    await page.eval(() => document.querySelector("#modeler [data-command=\"select\"]").click());
    const drawn = await page.eval(() => window.cadSketchSnapshot());
    assert.equal(drawn.entityTypes.filter((type) => type === "line").length, 1, JSON.stringify(drawn));

    await page.eval(() => document.querySelector("#modeler [data-command=\"tangentarc\"]").click());
    const armed = await page.eval(() => window.cadSketchSnapshot());
    assert.equal(armed.arcMode, "tangent", JSON.stringify(armed));

    const left = armed.screenPoints.reduce((best, point) => point.x < best.x ? point : best);
    const canvas = await page.eval(() => {
      const rect = document.querySelector("#mdCanvas").getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    });
    await page.eval((payload) => {
      const canvasEl = document.querySelector("#mdCanvas");
      const init = { bubbles: true, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", clientX: payload.x, clientY: payload.y };
      canvasEl.dispatchEvent(new PointerEvent("pointerdown", init));
      canvasEl.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
    }, { x: canvas.left + left.x, y: canvas.top + left.y });
    await clickCanvas(page, [[0.28, 0.32]]);

    const after = await page.eval(() => window.cadSketchSnapshot());
    assert.ok(after.entityTypes.includes("arc"), JSON.stringify(after));
    assert.ok(after.constraintTypes.includes("tangent"), JSON.stringify(after));
  } finally {
    await page.close();
  }
});
