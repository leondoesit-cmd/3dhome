import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();

test("Reference plane offers through-vertex parallel, and Pattern seed only is in the pattern form", chrome ? { timeout: 60000 } : { skip: "Chrome unavailable" }, async () => {
  const page = await openPage({ width: 1440, height: 1000, lang: "en" });
  try {
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      openModeler(null, { key: "housing_tools", name: "Housing tools", parts: [{ id: "box", name: "Box", kind: "box", x0: 0, x1: 10, y0: 0, y1: 4, z0: 0, z1: 6 }] }, null);
    });
    await page.eval(() => document.querySelector('#modeler [data-command="refplane"]')?.click());
    const plane = await page.eval(() => {
      const form = document.querySelector("#mdQuickSettings");
      const mode = form?.querySelector('[data-parameter="mode"] select, [data-parameter="mode"]');
      const options = Array.from(form?.querySelectorAll("select option") || []).map((option) => option.textContent.trim());
      return { title: form?.querySelector("b")?.textContent || "", options, hint: form?.querySelector("small")?.textContent || "" };
    });
    assert.match(plane.title, /Reference plane/i, JSON.stringify(plane));
    assert.ok(plane.options.some((label) => /through vertex/i.test(label)), JSON.stringify(plane));
    assert.match(plane.hint, /vertex/i);

    await page.eval(() => document.querySelector("#mdQuickSettings .md-quick-cancel")?.click());
    const opened = await page.eval(() => {
      if (typeof window.cadOpenFeatureForm === "function") return window.cadOpenFeatureForm("pattern");
      document.querySelector('#modeler [data-command="patternfeature"]')?.click();
      const form = document.querySelector("#mdQuickSettings");
      return !!(form && !form.hidden && form.innerHTML);
    });
    assert.equal(opened, true, "pattern form opened");
    const pattern = await page.eval(() => {
      const form = document.querySelector("#mdQuickSettings");
      const labels = Array.from(form?.querySelectorAll(".md-feature-field-label, option") || []).map((node) => node.textContent.trim());
      return { visible: !!(form && !form.hidden && form.innerHTML), labels };
    });
    assert.equal(pattern.visible, true, "pattern form opened");
    assert.ok(pattern.labels.some((label) => /pattern seed only/i.test(label)), JSON.stringify(pattern.labels));
    assert.equal(pattern.labels.some((label) => /geometry pattern/i.test(label)), false, JSON.stringify(pattern.labels));
  } finally {
    await page.close();
  }
});
