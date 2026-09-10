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
import {
  circularPatternStepDegrees, composeRigidTransforms, patternPlacementTransform,
  patternRotationTransform,
} from "../js/core/pattern_geometry.js";

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

/* The curve layout follows a SKETCH: a quarter arc of 24 points on the top
   plane, which is what patternCurveSketch() reads and sketchWorldPoint() maps
   into the XZ plane. Its first station sits on the CUBE'S CENTRE, because a
   curve placement carries the body's offset from the start of the path along
   with it (v -> R(v - P0) + Pi) — a seed parked away from the path would be
   swung about rather than walked along it. At 40 cm of radius the run is about
   63 cm long: enough to space 10 cm cubes apart and enough to crowd them
   together, which is the whole test. */
const ARC_DOC = {
  ...CUBE_DOC,
  id: "fixture:pattern-merge-curve",
  definitionId: "fixture:pattern-merge-curve",
  key: "fixture_pattern_merge_curve",
  activeSketch: "sketch:arc",
  sketches: [{
    id: "sketch:arc", name: "Path", plane: "top", offset: 0, constraints: [], entities: [],
    points: Array.from({ length: 24 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 23) * (Math.PI / 2);
      return { id: "arc:" + i, x: 5 + 40 * Math.cos(a), y: 45 + 40 * Math.sin(a) };
    }),
  }],
};

/* The curve path is read from the document only while the pattern form is the
   command in hand (resolvePatternCurvePath), which is exactly how a user
   reaches it: pick the sketch, open Pattern, apply. */
const runCurvePattern = (params) => page.eval(async (input) => {
  const { openModeler } = await import("/js/modeler.js");
  window.cadCloseFeatureForm();
  openModeler(null, structuredClone(input.doc), null);
  if (!window.cadOpenFeatureForm("pattern")) return { ok: false, bodies: [] };
  const ok = await window.cadPatternRun(input.params);
  window.cadCloseFeatureForm();
  return { ok, bodies: window.cadBodySnapshot() };
}, { doc: ARC_DOC, params });

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

test("a curve pattern crowded along its sketch fuses into one body", opts, async () => {
  /* Twelve stations over a 63 cm arc is a step of about 5.7 cm, so every 10 cm
     cube reaches the next one and the whole run is one connected lump. */
  const run = await runCurvePattern({ mode: "curve", curveCount: 12, curveAlign: "tangent", mergeResult: true });
  assert.equal(run.ok, true, "the curve pattern applied");
  assert.equal(run.bodies.length, 1, "the crowded run collapsed onto the seed: " + JSON.stringify(run.bodies));
  assert.equal(run.bodies[0].fused, 11, "with all eleven copies fused into it");
  assert.equal(run.bodies[0].merges, 1, "as one record for the cluster");
  assert.equal(run.bodies[0].error, null);
});

test("the same curve pattern spread along the sketch stays separate bodies", opts, async () => {
  // four stations over the same arc is a step of about 21 cm: nothing reaches
  const run = await runCurvePattern({ mode: "curve", curveCount: 4, curveAlign: "tangent", mergeResult: true });
  assert.equal(run.ok, true);
  assert.equal(run.bodies.length, 4, "the spread run is four bodies: " + JSON.stringify(run.bodies));
  assert.deepEqual(run.bodies.map((body) => body.fused), [0, 0, 0, 0]);
});

/* A cluster the SEED IS NOT IN, driven from the real editor.
 *
 * The host of a cluster is its lowest-indexed member, and only member 0 is the
 * seed — so a run whose copies reach each other but not the seed is hosted by a
 * ROTATED copy. A copy's turn is not baked into its BREP; buildPart nests it
 * around the whole body. The stored placement therefore has to be the host's
 * frame, and the two must multiply back out to where the copy was laid.
 *
 * 8 degrees a step with instances 1-2 skipped puts the copies at 24 and 32
 * degrees: they reach each other, and at 40 cm of radius neither reaches the
 * seed. That is the whole scenario the linear cases above cannot produce.
 */
const RING_DOC = {
  ...CUBE_DOC,
  id: "fixture:pattern-merge-ring",
  definitionId: "fixture:pattern-merge-ring",
  key: "fixture_pattern_merge_ring",
  parts: [{ ...CUBE_DOC.parts[0], x0: 40, x1: 50, y0: 0, y1: 10, z0: -5, z1: 5 }],
};
const RING_PARAMS = { mode: "circular", axis: "y", count: 5, angle: 8, equalSpacing: false, radialDistance: 0, skipInstances: "1-2", mergeResult: true };

test("a circular cluster the seed is not in is stored in its host's frame", opts, async () => {
  const run = await page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
    const ok = await window.cadPatternRun(input.params);
    return { ok, bodies: window.cadBodySnapshot() };
  }, { doc: RING_DOC, params: RING_PARAMS });

  assert.equal(run.ok, true, "the command applied");
  assert.equal(run.bodies.length, 2, "the seed stands alone and the two copies fused: " + JSON.stringify(run.bodies));
  const seed = run.bodies.find((body) => !body.rotations.length);
  const host = run.bodies.find((body) => body.fused > 0);
  assert.ok(seed && host, "one untouched seed and one fused host: " + JSON.stringify(run.bodies));
  assert.equal(seed.fused, 0, "the seed hosts a cluster of one and keeps no merge");
  assert.equal(seed.merges, 0);
  assert.equal(host.fused, 1, "the fourth instance was absorbed by the third");
  assert.equal(host.merges, 1);
  assert.equal(host.error, null);
  assert.equal(host.rotations.length, 1, "and the host is a turned copy, not the seed");

  /* The assertion that catches the double turn: the host's own turn applied to
     the stored placement has to be the transform the fourth copy was laid with.
     A placement kept in WORLD space passes through the turn a second time and
     lands off the ring — with the same volume, which is why this is a position
     check and not a volume one. */
  const step = circularPatternStepDegrees(RING_PARAMS, RING_PARAMS.count) * Math.PI / 180;
  const laid = patternPlacementTransform(RING_PARAMS, { circularIndex: 4 }, step);
  const drawn = composeRigidTransforms(patternRotationTransform(host.rotations), host.placements[0]);
  laid.matrix.forEach((value, index) => assert.ok(Math.abs(drawn.matrix[index] - value) < 1e-9,
    "matrix " + index + ": " + drawn.matrix[index] + " vs " + value));
  ["x", "y", "z"].forEach((axis) => assert.ok(Math.abs(drawn.translation[axis] - laid.translation[axis]) < 1e-9,
    axis + ": the fused copy is drawn at " + drawn.translation[axis] + ", it was laid at " + laid.translation[axis]));
});

/* The EXACT TREE the same run produces, from the running editor.
 *
 * The unit tests prove one copy's rows rebuild where the copy was laid; this
 * proves the editor writes those rows at all. Before the fix the tree held only
 * the copy's own body row, so STEP/IGES, mass and interference put every
 * circular copy back at the seed's angle: the ONE assertion that matters here
 * is that a `transformBody` row exists per turned copy and carries that copy's
 * turn. Un-merged on purpose — the gap is in the plain pattern, not in the
 * merge — and rebuilding the tree is what cadFeatureTreeSnapshot does. */
test("the exact tree carries every circular copy's own turn", opts, async () => {
  const params = { mode:"circular", axis:"y", count:4, angle:360, radialDistance:20, mergeResult:false };
  const run = await page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
    const ok = await window.cadPatternRun(input.params);
    return { ok, bodies:window.cadBodySnapshot(), features:window.cadFeatureTreeSnapshot() };
  }, { doc:CUBE_DOC, params });

  assert.equal(run.ok, true, "the command applied");
  assert.equal(run.bodies.length, 4, "four loose bodies: " + JSON.stringify(run.bodies.map((body) => body.id)));
  const turned = run.bodies.filter((body) => body.rotations.length);
  assert.equal(turned.length, 3, "the seed is not turned, the three copies are");

  const turnRows = run.features.filter((feature) => feature.type === "transformBody");
  assert.equal(turnRows.length, 3, "one turn row per turned copy: " + JSON.stringify(run.features.map((f) => f.type)));
  turned.forEach((body) => {
    const row = turnRows.find((feature) => feature.id === "feature:part:" + body.id + ":pattern-turn");
    assert.ok(row, "no turn row for copy " + body.id + ": " + JSON.stringify(turnRows.map((f) => f.id)));
    assert.deepEqual(row.inputs, ["feature:part:" + body.id], "and it wraps that copy's own body");
    const expected = patternRotationTransform(body.rotations);
    expected.matrix.forEach((value, index) => assert.ok(Math.abs(row.params.matrix[index] - value) < 1e-12,
      body.id + " matrix " + index + ": " + row.params.matrix[index] + " vs " + value));
    ["x", "y", "z"].forEach((axis) => assert.ok(Math.abs(row.params.translation[axis] - expected.translation[axis]) < 1e-9,
      body.id + " " + axis + ": " + row.params.translation[axis] + " vs " + expected.translation[axis]));
  });
  // the seed carries no turn, so it gets no row — the tree is not padded
  const seed = run.bodies.find((body) => !body.rotations.length);
  assert.ok(!turnRows.some((feature) => feature.id.startsWith("feature:part:" + seed.id)), "the untouched seed emits nothing");
});

/* ---- the LIVE preview of a merged pattern ----
 *
 * The copies must appear at once — the cheap honest answer — and the fuse is a
 * debounced kernel pass that replaces them when it lands. Both stages are read
 * from cadFinishPreviewSnapshot(), and the form is driven through
 * cadSetFeatureFormParams() rather than by typing: the form's own live path
 * runs off requestAnimationFrame, which never fires in a headless pane.
 */
const openPatternForm = (params) => page.eval(async (input) => {
  const { openModeler } = await import("/js/modeler.js");
  // a form left open by the previous case would draw its ghosts against the
  // document about to be loaded
  window.cadCloseFeatureForm();
  openModeler(null, structuredClone(input.doc), null);
  if (!window.cadOpenFeatureForm("pattern")) return null;
  if (!window.cadSetFeatureFormParams(input.params)) return null;
  return window.cadFinishPreviewSnapshot();
}, { doc: CUBE_DOC, params });

const mergeAnswered = async () => {
  await page.waitUntil(() => {
    const snap = window.cadFinishPreviewSnapshot();
    return !!snap.merge && snap.merge.state !== "approximate";
  }, { what: "the merged pattern preview to answer" });
  return page.eval(() => window.cadFinishPreviewSnapshot());
};

test("a merged pattern previews the copies first and the fused body second", opts, async () => {
  const shown = await openPatternForm({ mode: "linear", axisX: true, countX: 3, spacingX: 6, mergeResult: true });
  assert.equal(shown.type, "pattern");
  assert.equal(shown.parts.length, 2, "the two copies are drawn immediately: " + JSON.stringify(shown.parts));
  assert.deepEqual(shown.parts.map((part) => part.merged), [false, false]);
  assert.equal(shown.merge.state, "approximate", "the fuse has not answered yet");
  // and the badge does not claim the picture is exact while it is the copies
  assert.equal(shown.badge.state, "approximate");
  assert.match(shown.badge.text, /checking which ones merge/i);
  assert.doesNotMatch(shown.badge.text, /synced/i);

  const done = await mergeAnswered();
  assert.equal(done.merge.state, "exact");
  assert.equal(done.merge.bodies, 1, "the run collapses onto one body");
  assert.equal(done.merge.fused, 2);
  assert.equal(done.parts.length, 1, "the fused body replaced the copies: " + JSON.stringify(done.parts));
  assert.equal(done.parts[0].merged, true);
  assert.ok(done.parts[0].triangles > 0, "the fused preview body has no mesh");
  assert.equal(done.badge.state, "exact");
  assert.match(done.badge.text, /merges into 1 bodies/i);
});

test("a spread pattern says so instead of pretending a merge is coming", opts, async () => {
  const shown = await openPatternForm({ mode: "linear", axisX: true, countX: 3, spacingX: 40, mergeResult: true });
  assert.equal(shown.merge.state, "approximate");
  const done = await mergeAnswered();
  assert.equal(done.merge.state, "exact", "nothing overlaps, so the copies ARE the exact answer");
  assert.equal(done.merge.fused, 0);
  assert.equal(done.merge.bodies, 3);
  assert.equal(done.parts.length, 2, "and they are still the two copies");
  assert.deepEqual(done.parts.map((part) => part.merged), [false, false]);
  assert.match(done.badge.text, /stay separate/i);
});

test("with Merge instances off the preview never asks the kernel", opts, async () => {
  const shown = await openPatternForm({ mode: "linear", axisX: true, countX: 3, spacingX: 6, mergeResult: false });
  assert.equal(shown.merge, null, "no fuse pass for an unmerged pattern");
  assert.equal(shown.parts.length, 2);
  assert.equal(shown.badge.state, null, "and no stale merge claim left on the badge");
});

test("closing the form while the fuse is in flight leaks no merged body", opts, async () => {
  // the exact leak this stream found once already: the panel closed, the kernel
  // answered afterwards, and its mesh landed in a scene with no form on it
  const shown = await openPatternForm({ mode: "linear", axisX: true, countX: 4, spacingX: 6, mergeResult: true });
  assert.equal(shown.merge.state, "approximate");
  await page.eval(() => window.cadCloseFeatureForm());
  // the kernel is warm by now; give the run that was in flight room to land
  await page.eval(() => new Promise((resolve) => setTimeout(resolve, 2000)));
  const after = await page.eval(() => ({ preview: window.cadFinishPreviewSnapshot(), bodies: window.cadBodySnapshot() }));
  assert.equal(after.preview.parts.length, 0, "a preview body survived the panel closing");
  assert.equal(after.preview.merge, null, "the fuse pass was not forgotten");
  assert.equal(after.preview.formOpen, false);
  assert.equal(after.bodies.length, 1, "and the document is untouched: " + JSON.stringify(after.bodies));
});
