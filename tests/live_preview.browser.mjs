/* The live feature preview in a real editor, on a body that actually carries a
 * tessellation.
 *
 * A pattern ghost is a rigid copy of a committed body, and it is laid by
 * movePart(), which adds dx/dy/dz straight into meshData.positions. The buffer
 * is a plain Array on purpose (cad_kernel.js keeps it one so saveLib()'s
 * JSON.stringify does not turn it into {"0":..}), so Array.isArray() passes and
 * the write lands. If the ghost SHARES that array with its seed, every ghost
 * laid per keystroke translates the seed's committed geometry — cumulatively,
 * invisibly, and with the triangle count unchanged the whole time. Only bodies
 * that carry meshData are exposed, which is why a primitives-only fixture sees
 * nothing: the fixture below therefore carries one.
 *
 * rAF never fires in a headless pane, so the form is driven through
 * cadSetFeatureFormParams(), which syncs the preview directly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };
let page = null;

/* Two triangles of a real plate. Small enough to compare vertex by vertex,
   and off the origin in all three axes so a translation cannot hide in a zero. */
const PLATE_POSITIONS = [
  1, 2, 3, 21, 2, 3, 21, 2, 13,
  1, 2, 3, 21, 2, 13, 1, 2, 13,
];

const MESH_DOC = {
  id: "fixture:live-preview",
  definitionId: "fixture:live-preview",
  key: "fixture_live_preview",
  name: "Live preview fixture",
  parts: [{
    id: "part:plate", featureId: "feature:plate", kind: "ext", axis: "y", name: "Plate",
    color: "#b89a6e",
    pts: [{ u: 1, v: 3 }, { u: 21, v: 3 }, { u: 21, v: 13 }, { u: 1, v: 13 }],
    from: 2, to: 8,
    meshData: {
      positions: PLATE_POSITIONS.slice(),
      normals: new Array(PLATE_POSITIONS.length).fill(0),
      colors: new Array(PLATE_POSITIONS.length).fill(1),
      faceRanges: [{ persistentId: "feature:plate:face:0", triangleStart: 0, triangleCount: 2 }],
      topology: [{
        kind: "face", ownerFeatureId: "feature:plate", persistentId: "feature:plate:face:0",
        descriptor: { origin: { x: 1, y: 2, z: 3 }, center: { x: 11, y: 2, z: 8 } },
      }],
      subshapeMap: { "feature:plate:face:0": [0, 1] },
    },
  }],
};

test.after(async () => { if (page) await page.close(); });

test("dragging a pattern's count leaves the seed's own vertices untouched", opts, async () => {
  page = await openPage({ width: 1280, height: 800, lang: "en", mobile: false, touch: false });
  const run = await page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
    const before = window.cadPartMeshSnapshot("part:plate");
    if (!window.cadOpenFeatureForm("pattern")) return { opened: false };
    /* Four ticks of a count drag, the way holding the up-arrow on the field
       reads: each one re-lays every ghost from the seed. */
    const ghosts = [];
    [2, 3, 4, 5].forEach((countX) => {
      window.cadSetFeatureFormParams({ mode: "linear", axisX: true, countX, spacingX: 40, mergeResult: false });
      ghosts.push(window.cadFinishPreviewSnapshot().parts.length);
    });
    const after = window.cadPartMeshSnapshot("part:plate");
    window.cadCloseFeatureForm();
    return { opened: true, before, after, ghosts, settled: window.cadPartMeshSnapshot("part:plate") };
  }, { doc: MESH_DOC });

  assert.equal(run.opened, true, "the pattern form did not open");
  assert.deepEqual(run.ghosts, [1, 2, 3, 4], "the drag really laid ghosts: " + JSON.stringify(run.ghosts));
  assert.deepEqual(run.before.positions, PLATE_POSITIONS, "the fixture's mesh did not survive the load");

  /* The assertion the whole file exists for. The count is deliberately checked
     separately: it stays right while every coordinate walks away, which is why
     a triangle-count test never caught this. */
  assert.equal(run.after.count, run.before.count);
  run.before.positions.forEach((value, index) => {
    assert.equal(run.after.positions[index], value,
      "the seed's vertex " + index + " moved to " + run.after.positions[index] + " while its pattern was previewed");
  });
  assert.deepEqual(run.settled.positions, PLATE_POSITIONS, "and closing the form did not paper over it");
});

test("a mirror ghost leaves the seed's own vertices untouched too", opts, async () => {
  const run = await page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
    const before = window.cadPartMeshSnapshot("part:plate");
    if (!window.cadOpenFeatureForm("mirror")) return { opened: false };
    ["plane:right", "plane:front", "plane:top"].forEach(() => {
      window.cadSetFeatureFormParams({});
    });
    const after = window.cadPartMeshSnapshot("part:plate");
    window.cadCloseFeatureForm();
    return { opened: true, before, after };
  }, { doc: MESH_DOC });

  assert.equal(run.opened, true, "the mirror form did not open");
  assert.deepEqual(run.after.positions, run.before.positions);
});

/* The sharing that is still WANTED. normals and colors are Float32Arrays the
   size of the whole tessellation and nothing between opening a form and Apply
   writes them, so a ghost must ride on the seed's — copying them is what froze
   the editor on every keystroke. Identity is the only honest way to say
   "shared", so this reads it off a live ghost rather than off the source. */
test("a live ghost still rides the seed's normal and colour buffers", opts, async () => {
  const shared = await page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
    if (!window.cadOpenFeatureForm("pattern")) return null;
    window.cadSetFeatureFormParams({ mode: "linear", axisX: true, countX: 2, spacingX: 40, mergeResult: false });
    const seed = window.cadSeedAndGhostMesh("part:plate");
    window.cadCloseFeatureForm();
    return seed;
  }, { doc: MESH_DOC });

  assert.ok(shared, "no ghost to read");
  assert.equal(shared.sharesNormals, true, "the ghost copied the seed's normals");
  assert.equal(shared.sharesColors, true, "the ghost copied the seed's colours");
  assert.equal(shared.sharesSubshapeMap, true, "the ghost copied the seed's subshape map");
  assert.equal(shared.sharesPositions, false, "the ghost aliases the seed's positions — movePart writes into them");
  assert.equal(shared.sharesTopology, false, "the ghost aliases the seed's topology — the identity remap writes into it");
});

/* ---- live DOWNSTREAM refresh ----
 *
 * Dragging an extrude's depth used to move that extrude and nothing else, so a
 * pattern OF it — or a fillet ON it — sat at the old shape until Apply. The two
 * tiers are measured by what the DOCUMENT says after a tick: the analytic tier
 * has to have moved already, and the kernel tier has to have withdrawn its
 * stale exact mesh and said so rather than leaving a confident wrong shape up.
 */
const PAD_SKETCH = {
  id: "sketch:pad", name: "Pad", referenceId: "plane:top", plane: "top", offset: 0,
  constraints: [], entities: [],
  points: [
    { id: "pad:p0", x: -8, y: -3, fixed: true }, { id: "pad:p1", x: -2, y: -3, fixed: true },
    { id: "pad:p2", x: -2, y: 3, fixed: true }, { id: "pad:p3", x: -8, y: 3, fixed: true },
  ],
};
const PAD_POINTS = [{ u: -8, v: -3 }, { u: -2, v: -3 }, { u: -2, v: 3 }, { u: -8, v: 3 }];

function padDoc(extra) {
  return {
    id: "fixture:downstream", definitionId: "fixture:downstream", key: "fixture_downstream",
    name: "Downstream fixture", metadata: { authoringSystem: "parametric-v1" },
    parameters: {}, references: [], sketches: [PAD_SKETCH],
    features: [{
      id: "feature:pad", type: "extrude", name: "Pad", inputs: [],
      params: { axis: "y", from: 0, to: 5, depth: 5, points: PAD_POINTS, sketchId: "sketch:pad" },
      references: { sketches: ["sketch:pad"], features: [], topology: [], references: [] },
    }].concat(extra.features || []),
    parts: [{
      id: "part:pad", featureId: "feature:pad", kind: "ext", name: "Pad", axis: "y",
      from: 0, to: 5, pts: PAD_POINTS, holes: [], color: "#4f83cc",
    }].concat(extra.parts || []),
    history: [
      { id: "hist:pad", kind: "feature", targetId: "feature:pad", name: "Pad" },
    ].concat(extra.history || []),
  };
}

/* A plain linear pattern of the pad: layPatternCopies and movePart, no kernel. */
const ANALYTIC_DOC = padDoc({
  features: [{
    id: "feature:pattern", type: "pattern", name: "Pattern", inputs: ["feature:pad"],
    params: { mode: "linear", axisX: true, countX: 3, spacingX: 20, mergeResult: false },
    references: { sketches: [], features: ["feature:pad"], topology: [], references: [] },
  }],
  history: [{ id: "hist:pattern", kind: "feature", targetId: "feature:pattern", name: "Pattern" }],
});

/* The same pad with a fillet on it. A finish operation is OpenCascade work, so
   this is the tier that must never gate a frame. */
const KERNEL_DOC = (() => {
  const doc = padDoc({
    features: [{
      id: "feature:fillet", type: "fillet", name: "Fillet", inputs: ["feature:pad"],
      params: { radius: 1 },
      references: { sketches: [], features: ["feature:pad"], topology: [], references: [] },
    }],
    history: [{ id: "hist:fillet", kind: "feature", targetId: "feature:fillet", name: "Fillet" }],
  });
  /* Real edges, by the persistent ids the pad's own topology generator emits —
     a fillet with no targets would build nothing and the tier would be untested. */
  const edge = (id) => ({ kind: "edge", ownerFeatureId: "feature:pad", persistentId: "feature:pad:edge:" + id });
  doc.features[1].references.topology = [edge("depth:1"), edge("depth:2")];
  doc.parts[0].exactOperations = [{
    id: "feature:fillet", type: "fillet", amount: 1,
    targets: [edge("depth:1"), edge("depth:2")], params: { radius: 1 },
  }];
  return doc;
})();

const driveDepth = (doc, depths) => page.eval(async (input) => {
  const { openModeler } = await import("/js/modeler.js");
  window.cadCloseFeatureForm();
  openModeler(null, structuredClone(input.doc), null);
  const before = window.cadLiveEditSnapshot();
  const ticks = [];
  for (const depth of input.depths) {
    const start = performance.now();
    const ok = window.cadEditFeatureParams("feature:pad", { depth, to: depth });
    ticks.push({ ok, ms: performance.now() - start });
  }
  const after = window.cadLiveEditSnapshot();
  return { before, after, ticks };
}, { doc, depths });

test("an analytic downstream feature follows the drag on the same tick", opts, async () => {
  const run = await driveDepth(ANALYTIC_DOC, [9, 14, 21]);
  assert.ok(run.ticks.every((tick) => tick.ok), "the feature editor did not take the edit");

  const copiesBefore = run.before.bodies.filter((body) => body.derivedFeatureId === "feature:pattern");
  const copiesAfter = run.after.bodies.filter((body) => body.derivedFeatureId === "feature:pattern");
  assert.equal(copiesAfter.length, 2, "the pattern laid its copies: " + JSON.stringify(copiesAfter));

  const seed = run.after.bodies.find((body) => body.id === "part:pad");
  assert.equal(seed.to, 21, "the edited extrude itself followed");

  /* The assertion the tier exists for: the copies are AT the new depth, not the
     old one, without Apply and without a full document rebuild. */
  copiesAfter.forEach((copy) => {
    assert.equal(copy.to, 21, "a pattern copy is still " + copy.to + " deep while its seed is 21");
    assert.equal(Math.round(copy.bounds.y1), 21, "and its bounding box says so too");
  });
  if (copiesBefore.length) {
    assert.notDeepEqual(copiesAfter.map((c) => c.to), copiesBefore.map((c) => c.to));
  }
  // the copies are still spread along X: following the depth must not un-lay them
  assert.deepEqual(copiesAfter.map((copy) => Math.round(copy.bounds.x1)).sort((a, b) => a - b), [18, 38]);

  assert.equal(run.after.downstream, null, "nothing here needs the kernel, so nothing claims to be calculating");
});

test("a kernel-backed downstream feature is debounced and says it is stale", opts, async () => {
  await page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
  }, { doc: KERNEL_DOC });

  const tick = (depth) => page.eval((next) => {
    const start = performance.now();
    const ok = window.cadEditFeatureParams("feature:pad", { depth: next, to: next });
    return { ok, ms: performance.now() - start, snap: window.cadLiveEditSnapshot() };
  }, depth);
  /* Polled from Node, not inside the page: compiling the OpenCascade WASM on a
     cold pane outlasts a single Runtime.evaluate. */
  const settle = async () => {
    await page.waitUntil(() => {
      const snap = window.cadLiveEditSnapshot();
      const part = snap.bodies.find((item) => item.id === "part:pad");
      return !!snap.downstream && snap.downstream.state !== "calculating" && !part.pending
        && (part.triangles > 0 || !!part.error);
    }, { ms: 120000, what: "the debounced downstream rebuild" });
    return page.eval(() => window.cadLiveEditSnapshot());
  };

  const first = await tick(9);
  assert.equal(first.ok, true, "the feature editor did not take the edit");
  assert.ok(first.snap.downstream, "the fillet was not recognised as kernel-backed");
  assert.deepEqual(first.snap.downstream.features, ["feature:fillet"]);
  assert.equal(first.snap.downstream.state, "calculating");
  assert.equal(first.snap.badge.state, "calculating", "the badge says so in the shared vocabulary");
  assert.match(first.snap.badge.text, /recalculating/i);
  assert.doesNotMatch(first.snap.badge.text, /synced/i, "it must not claim the views agree while they do not");

  const built = await settle();
  const builtBody = built.bodies.find((item) => item.id === "part:pad");
  assert.equal(builtBody.error, null, "the debounced rebuild failed: " + builtBody.error);
  assert.ok(builtBody.triangles > 0, "the debounced run produced no exact mesh");
  assert.equal(Math.round(builtBody.bounds.y1), 9, "and it is the fillet at the depth the drag left");
  assert.equal(built.badge.state, "exact", "the badge still says calculating after it settled");

  /* Now the half that matters: three ticks against a body that DOES carry a
     kernel-built mesh. None of them may block, and the stale mesh must go. */
  const ticks = [await tick(14), await tick(18), await tick(21)];
  ticks.forEach((entry) => {
    assert.equal(entry.ok, true);
    assert.ok(entry.ms < 16, "a tick took " + entry.ms.toFixed(2) + "ms — the kernel gated the frame");
  });
  const dragging = ticks[2].snap;
  assert.equal(dragging.downstream.state, "calculating", "the last tick has not settled yet");
  assert.equal(dragging.badge.state, "calculating");
  const body = dragging.bodies.find((item) => item.id === "part:pad");
  assert.equal(body.triangles, 0, "the stale filleted mesh is still on screen as a confident wrong shape");
  assert.equal(body.to, 21, "while the analytic fallback follows the drag");
  assert.equal(Math.round(body.bounds.y1), 21);

  const settled = await settle();
  const rebuilt = settled.bodies.find((item) => item.id === "part:pad");
  assert.equal(rebuilt.error, null, "the second debounced rebuild failed: " + rebuilt.error);
  assert.ok(rebuilt.triangles > 0, "the debounced run never produced a mesh");
  assert.equal(Math.round(rebuilt.bounds.y1), 21, "and it is the fillet at the NEW depth, not the old one");
  assert.equal(settled.badge.state, "exact");
  await page.eval(() => window.cadCloseFeatureForm());
});

/* The numbers, from the running editor rather than from a claim in a comment.
   The cheap tier has to be cheap or it does not belong on every tick, and the
   kernel tier has to stay off the tick even once it has a real mesh to lose. */
test("the analytic tier costs a fraction of a frame and the kernel tier stays off the tick", opts, async () => {
  const DEPTHS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  const load = (doc) => page.eval(async (input) => {
    const { openModeler } = await import("/js/modeler.js");
    window.cadCloseFeatureForm();
    openModeler(null, structuredClone(input.doc), null);
  }, { doc });
  const drag = () => page.eval((depths) => depths.map((depth) => {
    const start = performance.now();
    window.cadEditFeatureParams("feature:pad", { depth, to: depth });
    return performance.now() - start;
  }), DEPTHS);

  // twelve copies, so the analytic number is a fan-out and not a single clone
  const wide = structuredClone(ANALYTIC_DOC);
  wide.features[1].params.countX = 12;
  await load(wide);
  const analytic = await drag();
  const copies = await page.eval(() => window.cadLiveEditSnapshot().bodies.filter((b) => b.derivedFeatureId === "feature:pattern").length);
  assert.equal(copies, 11, "the analytic fan-out under test");

  await load(KERNEL_DOC);
  // measured with the fillet's exact mesh already built, which is the state a
  // real drag starts from and the only one where there is something to lose
  await page.eval(() => window.cadEditFeatureParams("feature:pad", { depth: 5.5, to: 5.5 }));
  await page.waitUntil(() => {
    const part = window.cadLiveEditSnapshot().bodies.find((item) => item.id === "part:pad");
    return part.triangles > 0 || !!part.error;
  }, { ms: 120000, what: "the fillet's exact mesh" });
  const kernel = await drag();
  await page.eval(() => window.cadCloseFeatureForm());

  /* The first tick also opens the feature editor and builds its form, which is
     not what a drag costs. Steady state is ticks 2..n; the first is reported
     separately rather than hidden. */
  const steady = (ticks) => ticks.slice(1);
  const worst = (ticks) => Math.max(...steady(ticks));
  const mean = (ticks) => steady(ticks).reduce((a, b) => a + b, 0) / steady(ticks).length;
  const line = (name, ticks) => name + " first " + ticks[0].toFixed(2)
    + "ms, steady mean " + mean(ticks).toFixed(2) + "ms / worst " + worst(ticks).toFixed(2) + "ms";
  const report = line("analytic x11", analytic) + " | " + line("kernel-backed", kernel);
  console.log("  per-tick: " + report);
  // 16ms is one frame at 60Hz; a tier that cannot hold that has no business
  // running on every tick, and the number is printed either way
  assert.ok(worst(analytic) < 16, "the analytic tier does not fit in a frame — " + report);
  assert.ok(worst(kernel) < 16, "the kernel tier blocked the tick instead of debouncing — " + report);
});
