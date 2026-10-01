/* The two new forms in a real editor.
 *
 * Both features were extended rather than duplicated, so the risk is not that
 * the kernel is wrong — the pure tests measure that — but that a control sits
 * in the panel and never reaches the parameters. That is the exact defect this
 * work stream keeps finding, so these drive the DOM and read back what the
 * command collected.
 *
 * Skips itself when Chrome is absent — set CHROME_PATH to point at a binary.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

const MODEL = {
  key: "vfillet-model", id: "vfillet-model", definitionId: "vfillet-model",
  name: "Variable model", w: 20, d: 12, h: 8,
  metadata: { authoringSystem: "parametric-v1" },
  parts: [{
    id: "vfillet-part", featureId: "vfillet-box", kind: "box", name: "Body",
    x0: -10, x1: 10, y0: 0, y1: 8, z0: -6, z1: 6,
  }],
};

let shared = null;
test.after(async () => { if (shared) await shared.close(); });

async function editor(model = MODEL) {
  if (!chrome) return null;
  if (!shared) shared = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  const page = shared;
  await page.waitForBoot();
  await page.eval(async (list) => {
    try {
      const { saveModelLibrary } = await import("./js/core/model_library_store.js");
      await saveModelLibrary(list);
    } catch {}
    localStorage.setItem("home3d_models", JSON.stringify(list));
    localStorage.removeItem("home3d_assemblies");
    localStorage.removeItem("home3d_modeler_draft");
    localStorage.removeItem("home3d_modeler_prefs");
  }, [model]);
  await page.goto("/");
  await page.waitForBoot();
  await page.eval(() => { window.confirm = () => true; });
  await page.eval(() => document.getElementById("openModelerTop").click());
  await page.waitUntil(() => {
    const el = document.getElementById("modeler");
    return !!el && getComputedStyle(el).display !== "none";
  }, { what: "the model editor to open" });
  await page.waitUntil(() => {
    const welcome = document.getElementById("mdWelcome");
    if (welcome && !welcome.hidden && getComputedStyle(welcome).display !== "none") {
      const start = welcome.querySelector('[data-welcome-start="continue"]') || welcome.querySelector(".md-welcome-close");
      if (start) { start.click(); return false; }
    }
    return !welcome || welcome.hidden || getComputedStyle(welcome).display === "none";
  }, { what: "the welcome sheet to be out of the way" });
  await page.waitUntil(() => typeof window.cadFinishPreviewSnapshot === "function", { what: "the editor test hooks" });
  await page.eval(() => document.querySelector('#modeler [data-tab="lib"]').click());
  await page.waitUntil(() => [...document.querySelectorAll("#mdLib .md-card")]
    .some((card) => card.querySelector(".nm")?.textContent === model.name), { what: "the seeded model card" });
  await page.eval(() => [...document.querySelectorAll("#mdLib .md-card")]
    .find((card) => card.querySelector(".nm")?.textContent === model.name).click());
  await page.waitUntil(() => window.cadSelectionSnapshot?.().mode === "3d", { what: "the loaded model" });
  return page;
}

async function pickEdge(page) {
  await page.eval(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true })));
  return page.eval(() => {
    const snap = window.cadSelectionSnapshot();
    const at = snap.kinds.findIndex((kind) => kind === "edge");
    return at < 0 ? false : window.cadSelectTopologyById(snap.ids[at]);
  });
}

/* Drive a control the way a person does. requestAnimationFrame never fires in a
   headless pane, so anything these tests read has to be written on the input
   event itself rather than on the next frame. */
const set = (page, selector, value) => page.eval(([css, next]) => {
  const input = document.querySelector(css);
  if (!input) return false;
  if (input.type === "checkbox") input.checked = !!next;
  else input.value = String(next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}, [selector, value]);

test("the fillet form hides its end radius until the fillet is asked to vary", opts, async () => {
  const page = await editor();
  assert.equal(await pickEdge(page), true, "could not pick an edge");
  assert.equal(await page.eval(() => window.cadOpenFeatureForm("fillet")), true);

  const before = await page.eval(() => ({
    keys: [...document.querySelectorAll("#mdQuickSettings [data-parameter]")].map((node) => node.dataset.parameter),
    endHidden: !!document.querySelector('#mdQuickSettings .md-quick-field[data-parameter="endRadius"]')?.classList.contains("parameter-hidden"),
    perEdge: document.querySelectorAll("#mdQuickSettings [data-edge-radius]").length,
  }));
  assert.ok(before.keys.includes("variableRadius") && before.keys.includes("endRadius"), "both controls are on the form");
  assert.equal(before.endHidden, true, "a constant fillet must not ask for a second radius");
  assert.equal(before.perEdge, 0, "and the edge list carries no radius fields yet");

  assert.equal(await set(page, '#mdQuickSettings input[data-parameter="variableRadius"]', true), true, "no control at " + '#mdQuickSettings input[data-parameter="variableRadius"]');
  const after = await page.eval(() => ({
    endHidden: !!document.querySelector('#mdQuickSettings .md-quick-field[data-parameter="endRadius"]')?.classList.contains("parameter-hidden"),
    perEdge: document.querySelectorAll("#mdQuickSettings [data-edge-radius]").length,
    rows: document.querySelectorAll("#mdQuickSettings .md-finish-edge-row").length,
    params: window.cadFinishPreviewSnapshot().params,
    anchors: [...document.querySelectorAll(".md-fillet-endpoint")].map(node=>node.dataset.endpoint),
  }));
  assert.equal(after.endHidden, false, "the end radius appears with the law");
  assert.equal(after.params.variableRadius, true, "and the form actually collected the switch");
  assert.equal(after.rows, 1, "the one selected edge grew a row");
  assert.equal(after.perEdge, 2, "with a start and an end field");
  assert.ok(after.params.edgeRadii[0].startPoint, "physical start anchor is saved");
  assert.ok(after.anchors.includes("start") && after.anchors.includes("end"), "viewport labels name both endpoints");
});

test("a per-edge radius typed into the edge list reaches the feature parameters", opts, async () => {
  const page = await editor();
  assert.equal(await pickEdge(page), true, "could not pick an edge");
  assert.equal(await page.eval(() => window.cadOpenFeatureForm("fillet")), true);
  assert.equal(await set(page, '#mdQuickSettings input[data-parameter="variableRadius"]', true), true, "no control at " + '#mdQuickSettings input[data-parameter="variableRadius"]');
  assert.equal(await set(page, '#mdQuickSettings input[data-edge-radius="radius"]', "0.8"), true, "no control at " + '#mdQuickSettings input[data-edge-radius="radius"]');
  assert.equal(await set(page, '#mdQuickSettings input[data-edge-radius="endRadius"]', "2.4"), true, "no control at " + '#mdQuickSettings input[data-edge-radius="endRadius"]');

  const stored = await page.eval(() => window.cadFinishPreviewSnapshot().params.edgeRadii);
  assert.equal(stored.length, 1, "one override, keyed on the edge that was picked");
  assert.equal(stored[0].radius, 0.8);
  assert.equal(stored[0].endRadius, 2.4);
  assert.equal(await page.eval(() => {
    const snap = window.cadSelectionSnapshot();
    return snap.ids[snap.kinds.indexOf("edge")] === window.cadFinishPreviewSnapshot().params.edgeRadii[0].id;
  }), true, "the override names the selected edge by its persistent id");

  // Emptying the field must drop the override rather than store a zero radius.
  assert.equal(await set(page, '#mdQuickSettings input[data-edge-radius="radius"]', ""), true, "no control at " + '#mdQuickSettings input[data-edge-radius="radius"]');
  const trimmed = await page.eval(() => window.cadFinishPreviewSnapshot().params.edgeRadii);
  assert.equal(trimmed.length, 1);
  assert.equal(trimmed[0].radius, undefined, "the start radius fell back to the feature's own");
  assert.equal(trimmed[0].endRadius, 2.4);
  await page.eval(() => window.cadCloseFeatureForm());
});

test("multiple-radius edge fields use the document length unit", opts, async () => {
  const page = await editor({ ...MODEL, name: "Inch fillet model", context: { units: { length: "in", angle: "deg", mass: "kg", precision: 3 } } });
  assert.equal(await pickEdge(page), true, "could not pick an edge");
  assert.equal(await page.eval(() => window.cadOpenFeatureForm("fillet")), true);
  assert.equal(await set(page, '#mdQuickSettings input[data-parameter="multipleRadius"]', true), true);
  const selector = '#mdQuickSettings input[data-edge-radius="radius"]';
  assert.equal(await set(page, selector, "0.060"), true);
  const state = await page.eval((css) => ({
    stored: window.cadFinishPreviewSnapshot().params.edgeRadii[0]?.radius,
    label: document.querySelector(css)?.parentElement?.textContent,
    value: document.querySelector(css)?.value,
  }), selector);
  assert.ok(Math.abs(state.stored - 0.1524) < 1e-10, "0.060 in must be stored as 0.1524 cm");
  assert.match(state.label, /in/);
  assert.equal(state.value, "0.060", "editing must keep the visible input in inches");
});

test("the pattern form offers a curve layout and activates only its own group", opts, async () => {
  const page = await editor();
  assert.equal(await page.eval(() => window.cadOpenFeatureForm("pattern")), true);
  const modes = await page.eval(() => [...document.querySelector('#mdQuickSettings select[data-parameter="mode"]').options].map((option) => option.value));
  assert.deepEqual(modes, ["linear", "circular", "curve"]);

  assert.equal(await set(page, '#mdQuickSettings select[data-parameter="mode"]', "curve"), true, "no control at " + '#mdQuickSettings select[data-parameter="mode"]');
  const state = await page.eval(() => {
    const inactive = (key) => !!document.querySelector('#mdQuickSettings .md-quick-field[data-parameter="' + key + '"]')?.classList.contains("parameter-inactive");
    return {
      mode: window.cadFinishPreviewSnapshot().params.mode,
      curveCount: inactive("curveCount"),
      curveAlign: inactive("curveAlign"),
      curveSpacing: inactive("curveSpacing"),
      circularCount: inactive("count"),
      axisX: inactive("axisX"),
    };
  });
  assert.equal(state.mode, "curve", "the layout reached the parameters");
  assert.equal(state.curveCount, false, "the curve count is live");
  assert.equal(state.curveAlign, false, "so is the orientation choice");
  assert.equal(state.curveSpacing, true, "arc spacing stays inert while the copies are fitted to the run");
  assert.equal(state.circularCount, true, "the circular count is not");
  assert.equal(state.axisX, true, "nor is the linear X axis");

  assert.equal(await set(page, '#mdQuickSettings select[data-parameter="curveSpacingMode"]', "spacing"), true, "no control at " + '#mdQuickSettings select[data-parameter="curveSpacingMode"]');
  assert.equal(await page.eval(() => !!document.querySelector('#mdQuickSettings .md-quick-field[data-parameter="curveSpacing"]')?.classList.contains("parameter-inactive")),
    false, "asking for a fixed spacing makes the number editable");
  await page.eval(() => window.cadCloseFeatureForm());
});
