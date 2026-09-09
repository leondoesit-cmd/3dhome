/* "Merge instances" inside the real model editor.
 *
 * The unit tests prove the fuse, the clustering and the exact-tree row. Only
 * the running editor can prove the loop closes: the copies are laid, the kernel
 * is asked which of them share material, and the DOCUMENT ends up with the
 * number of bodies the geometry justifies — one for a run that overlaps end to
 * end, and the full count for a run with gaps.
 *
 * The fuse is a second, asynchronous pass, so there is nothing to settle for;
 * window.cadPatternRun resolves on the pass itself. rAF never fires in the
 * headless pane, so nothing here may wait on a frame.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };
let page = null;

const CUBE_DOC = {
  id: "fixture:pattern-merge",
  definitionId: "fixture:pattern-merge",
  key: "fixture_pattern_merge",
  name: "Pattern merge fixture",
  parts: [{
    id: "part:cube", featureId: "feature:cube", kind: "box", name: "Cube",
    color: "#b89a6e", x0: 0, x1: 10, y0: 0, y1: 10, z0: 0, z1: 10,
  }],
};

const runPattern = (params) => page.eval(async (input) => {
  const { openModeler } = await import("/js/modeler.js");
  openModeler(null, structuredClone(input.doc), null);
  const ok = await window.cadPatternRun(input.params);
  return { ok, bodies: window.cadBodySnapshot() };
}, { doc: CUBE_DOC, params });

test.after(async () => { if (page) await page.close(); });

test("a tight linear pattern with Merge instances comes back as one body", opts, async () => {
  page = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  // three 10-cubes at 0, 6 and 12: each shares material with the next
  const run = await runPattern({ mode: "linear", axisX: true, countX: 3, spacingX: 6, mergeResult: true });
  assert.equal(run.ok, true, "the command applied");
  assert.equal(run.bodies.length, 1, "the whole run collapsed onto one host: " + JSON.stringify(run.bodies));
  assert.equal(run.bodies[0].fused, 2, "with the other two instances fused into it");
  assert.equal(run.bodies[0].merges, 1, "as one record for the cluster, not one per instance");
  assert.equal(run.bodies[0].error, null);
});

test("the same pattern spread out keeps every instance a body of its own", opts, async () => {
  const run = await runPattern({ mode: "linear", axisX: true, countX: 3, spacingX: 40, mergeResult: true });
  assert.equal(run.ok, true);
  assert.equal(run.bodies.length, 3, "nothing reaches anything, so nothing merges");
  assert.deepEqual(run.bodies.map((body) => body.fused), [0, 0, 0]);
});

test("a partly overlapping run comes back as the clusters it forms", opts, async () => {
  /* A widening run: the spacing increment puts the instances at 0, 6, 48 and
     126, so only the first two share material. Three bodies — not one, and not
     four, which is the whole claim: the count is the geometry's answer. */
  const run = await runPattern({ mode: "linear", axisX: true, countX: 4, spacingX: 6, spacingIncrementX: 36, mergeResult: true });
  assert.equal(run.ok, true);
  assert.equal(run.bodies.length, 3, "one fused pair and two singles: " + JSON.stringify(run.bodies));
  assert.deepEqual(run.bodies.map((body) => body.fused).sort(), [0, 0, 1]);
});

test("with Merge instances off the same run is still four separate bodies", opts, async () => {
  const run = await runPattern({ mode: "linear", axisX: true, countX: 3, spacingX: 6, mergeResult: false });
  assert.equal(run.ok, true);
  assert.equal(run.bodies.length, 3, "the un-merged answer is unchanged");
  assert.deepEqual(run.bodies.map((body) => body.fused), [0, 0, 0]);
});

test("a merged circular pattern fuses the copies the rotation brings together", opts, async () => {
  // eight instances about Y at a radius that keeps consecutive cubes touching
  const run = await runPattern({ mode: "circular", axis: "y", count: 8, angle: 360, radialDistance: 6, mergeResult: true });
  assert.equal(run.ok, true);
  assert.ok(run.bodies.length < 8, "the ring is not eight loose bodies: " + JSON.stringify(run.bodies));
  assert.ok(run.bodies.some((body) => body.fused > 0), "and the fuse really happened");
});
