/* The kernel-body kind inside the real model editor.
 *
 * The unit tests prove the recipe builds and the walk sites name the kind; only
 * the running editor can prove the loop closes — a document whose body has a
 * recipe and no mesh loads, the kernel rebuilds it, and the viewport ends up
 * with a real mesh whose bounds are the swept shape's. That is exactly the path
 * additive Sweep and Loft take after createMultiSketchFeature adds the part,
 * and before this kind existed it ended in nothing being drawn at all.
 *
 * The recipe is here rather than in a fixture file so the sweep the editor
 * builds and the volume asserted below cannot drift apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };
let page = null;

const SWEPT_DOC = {
  id: "fixture:kernel-body",
  definitionId: "fixture:kernel-body",
  key: "fixture_kernel_body",
  name: "Kernel body fixture",
  parts: [{
    id: "part:swept",
    featureId: "feature:swept",
    kind: "kernel",
    name: "Sweep1",
    color: "#b89a6e",
    origin: { x: 0, y: 0, z: 0 },
    kernel: {
      type: "sweep",
      params: {
        profile: [{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }],
        path: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 20 }],
        orientation: "follow-path",
        twistAngle: 0,
        scale: 1,
        solid: true,
      },
    },
  }],
};

test.after(async () => { if (page) await page.close(); });

test("a body with a recipe and no mesh is rebuilt by the kernel and drawn", opts, async () => {
  page = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  await page.eval(async (doc) => {
    const { openModeler } = await import("/js/modeler.js");
    openModeler(null, doc, null);
  }, SWEPT_DOC);

  // The WASM kernel is lazily compiled, so this is a wait, not a settle. rAF
  // never fires in the headless pane, so nothing here may depend on a frame.
  const built = await page.eval(() => new Promise((resolve) => {
    const started = Date.now();
    const poll = () => {
      const [body] = window.cadKernelBodySnapshot ? window.cadKernelBodySnapshot() : [];
      const entry = (window.cadDecoGroups || []).find((item) => item.part && item.part.kind === "kernel");
      if (body && entry && entry.mesh) {
        resolve({ drawn: true, triangles: body.triangles, bounds: body.bounds, error: body.error, type: body.type });
        return;
      }
      if (body && body.error) { resolve({ drawn: false, error: body.error }); return; }
      if (Date.now() - started > 60000) { resolve({ drawn: false, error: "timed out waiting for the kernel" }); return; }
      setTimeout(poll, 250);
    };
    poll();
  }));

  assert.equal(built.error, null, "the kernel build reported no error");
  assert.equal(built.drawn, true, "a kernel body reaches the viewport as a real mesh");
  assert.equal(built.type, "sweep", "the body still knows the recipe it came from");
  assert.ok(built.triangles > 8, "and it is a tessellated solid, not a stub");
  // 2x2 section carried 20 along the path, however the editor centred it
  assert.ok(Math.abs(built.bounds.z1 - built.bounds.z0 - 20) < 0.5, "the drawn body spans the swept path");
  assert.ok(Math.abs(built.bounds.x1 - built.bounds.x0 - 2) < 0.5, "with the profile's section");

  // and nothing in the parts walk threw on the way — partBounds is the one that
  // historically dies on a kind it does not know
  const clean = page.consoleErrors.filter((line) => !/WebGL|WebGPU|GPUAdapter|getSupportedExtensions|three\.webgpu/i.test(line));
  assert.deepEqual(clean, [], "no parts-walking site threw on the new kind");
});
