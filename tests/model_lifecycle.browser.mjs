/* End-to-end ownership and persistence coverage for the seam between the
   Model Editor and the Planner.  The lower-level CAD suites prove rebuild and
   topology contracts; this test proves that a saved reusable definition keeps
   its identity while two placed instances retain independent overrides across
   editor save, plan undo/redo, a browser reload, and JSON import. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? { timeout: 45_000 } : { skip: "no Chrome found (set CHROME_PATH)" };
const NO_GL = /getSupportedExtensions|WebGL|WebGPU|GPUAdapter|three\.webgpu/i;

async function waitUntil(page, predicate, message, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.eval(predicate)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(message);
}

test("a reusable model survives edit, instances, undo/redo, reload, and project import", opts, async () => {
  const page = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  try {
    await page.eval(async () => {
      const { openModeler } = await import("/js/modeler.js");
      const definition = {
        id: "definition:lifecycle", definitionId: "definition:lifecycle",
        key: "cm_lifecycle_qa", name: "Lifecycle QA", price: 125,
        w: 100, d: 60, h: 80, col: "#6688aa",
        metadata: { authoringSystem: "legacy-adapter", source: "model-editor" },
        parameters: {
          width: { id: "width", name: "width", value: 100, exposure: "planner" },
          depth: { id: "depth", name: "depth", value: 60, exposure: "planner" },
          height: { id: "height", name: "height", value: 80, exposure: "planner" },
        },
        parts: [{
          id: "body:lifecycle", featureId: "feature:body:lifecycle", kind: "box", name: "Body",
          x0: -50, x1: 50, y0: 0, y1: 80, z0: -30, z1: 30,
          color: "#6688aa", parametricEnvelope: "box",
        }],
      };
      openModeler(null, definition, null);
      document.querySelector('#mdWelcome [data-welcome-start="continue"]')?.click();
      document.querySelector(".md-welcome-close")?.click();
      document.getElementById("mdSave").click();
    });

    await waitUntil(page, async () => {
      const { S } = await import("/js/state.js");
      return !!S.parametric.definitions["definition:lifecycle"];
    }, "the Model Editor did not commit the reusable definition");

    const initial = await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { closeModeler } = await import("/js/modeler.js");
      const { rebuildProject } = await import("/js/core/project.js");
      const { pushHistory } = await import("/js/history.js");
      closeModeler();
      S.items = [
        { id: "instance:a", type: "cm_lifecycle_qa", definitionId: "definition:lifecycle", x: 10, z: 20, rot: 0, w: 120, d: 60, h: 80, parameterOverrides: { width: 120, depth: 60, height: 80 } },
        { id: "instance:b", type: "cm_lifecycle_qa", definitionId: "definition:lifecycle", x: 240, z: 20, rot: 90, w: 180, d: 75, h: 90, parameterOverrides: { width: 180, depth: 75, height: 90 } },
      ];
      rebuildProject(S, {});
      pushHistory("Edit shared model");
      return {
        revision: S.parametric.definitions["definition:lifecycle"].revision,
        ids: S.items.map((item) => item.definitionId),
        widths: S.items.map((item) => item.parameterOverrides.width),
      };
    });
    assert.deepEqual(initial.ids, ["definition:lifecycle", "definition:lifecycle"]);
    assert.deepEqual(initial.widths, [120, 180]);

    await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { openModeler } = await import("/js/modeler.js");
      const edited = structuredClone(S.parametric.definitions["definition:lifecycle"]);
      edited.name = "Lifecycle QA edited";
      edited.price = 225;
      edited.parts[0].color = "#aa6644";
      edited.parts[0].y1 = 95;
      edited.h = 95;
      edited.parameters.height.value = 95;
      openModeler(null, edited, S.items[0]);
      document.getElementById("mdSave").click();
    });

    await waitUntil(page, async () => {
      const { S } = await import("/js/state.js");
      return S.parametric.definitions["definition:lifecycle"]?.name === "Lifecycle QA edited";
    }, "editing a placed model did not update its shared definition");

    const edited = await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { closeModeler } = await import("/js/modeler.js");
      const { serialize } = await import("/js/ui.js");
      closeModeler();
      const json = serialize();
      localStorage.setItem("model-lifecycle-qa", json);
      return {
        json,
        revision: S.parametric.definitions["definition:lifecycle"].revision,
        definitionCount: Object.keys(S.parametric.definitions).length,
        items: S.items.map((item) => ({ id: item.id, definitionId: item.definitionId, w: item.w, h: item.h, overrides: item.parameterOverrides })),
      };
    });
    assert.ok(edited.revision > initial.revision, "shared definition revision did not advance");
    assert.deepEqual(edited.items.map((item) => item.definitionId), ["definition:lifecycle", "definition:lifecycle"]);
    assert.deepEqual(edited.items.map((item) => item.overrides.width), [120, 180], "shared save baked one instance width into the definition");
    assert.deepEqual(edited.items.map((item) => item.overrides.height), [80, 90], "shared save overwrote instance-local heights");

    const history = await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { undo, redo } = await import("/js/history.js");
      undo();
      const afterUndo = {
        name: S.parametric.definitions["definition:lifecycle"]?.name,
        widths: S.items.map((item) => item.parameterOverrides.width),
      };
      redo();
      const afterRedo = {
        name: S.parametric.definitions["definition:lifecycle"]?.name,
        widths: S.items.map((item) => item.parameterOverrides.width),
      };
      return { afterUndo, afterRedo };
    });
    assert.equal(history.afterUndo.name, "Lifecycle QA");
    assert.deepEqual(history.afterUndo.widths, [120, 180]);
    assert.equal(history.afterRedo.name, "Lifecycle QA edited");
    assert.deepEqual(history.afterRedo.widths, [120, 180]);

    await page.goto("/");
    const roundTrip = await page.eval(async () => {
      const { S } = await import("/js/state.js");
      const { applyData, serialize } = await import("/js/ui.js");
      const json = localStorage.getItem("model-lifecycle-qa");
      applyData(json);
      const exported = JSON.parse(serialize());
      // Import the exported object once more, matching the JSON file workflow.
      applyData(exported);
      const definition = S.parametric.definitions["definition:lifecycle"];
      return {
        name: definition?.name,
        revision: definition?.revision,
        definitionIds: Object.keys(S.parametric.definitions),
        items: S.items.map((item) => ({ id: item.id, definitionId: item.definitionId, overrides: item.parameterOverrides })),
        embeddedModels: exported.customModels.map((model) => model.key),
        exportedDefinitions: Object.keys(exported.parametric.definitions),
      };
    });
    assert.equal(roundTrip.name, "Lifecycle QA edited");
    assert.equal(roundTrip.revision, edited.revision);
    assert.equal(roundTrip.definitionIds.filter((id) => id === "definition:lifecycle").length, 1,
      "reload/import duplicated or lost the reusable definition");
    assert.equal(roundTrip.exportedDefinitions.filter((id) => id === "definition:lifecycle").length, 1,
      "project export duplicated or omitted the reusable definition");
    assert.deepEqual(roundTrip.items.map((item) => item.id), ["instance:a", "instance:b"]);
    assert.deepEqual(roundTrip.items.map((item) => item.definitionId), ["definition:lifecycle", "definition:lifecycle"]);
    assert.deepEqual(roundTrip.items.map((item) => item.overrides.width), [120, 180]);
    assert.ok(roundTrip.embeddedModels.includes("cm_lifecycle_qa"), "project export omitted the used custom model");

    const errors = page.consoleErrors.filter((message) => !NO_GL.test(message));
    assert.deepEqual(errors, [], "lifecycle emitted browser errors: " + errors.join("\n"));
  } finally {
    await page.close();
  }
});
