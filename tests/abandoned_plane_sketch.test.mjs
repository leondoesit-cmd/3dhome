import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pruneAbandonedSketches, sketchIsAbandoned } from "../js/sketch_solver.js";

const plane = (id, extra = {}) => ({ id, plane: "top", offset: 0, name: "X·Z sketch", referenceId: "plane:top", points: [], entities: [], constraints: [], ...extra });
const face = () => ({ id: "sk_face", plane: "front", offset: 0, name: "Face sketch", frameSpace: "local", support: { persistentId: "f1:face:end" },
  points: [{ id: 1, x: 0, y: 0 }], entities: [{ id: 2, type: "circle" }], constraints: [] });

/* LENSCAP: Top clicked while the BackCut face sketch was active left sk_30tgo,
   an empty X·Z sketch with no history row, which the tree cannot show. */
const lenscap = () => ({
  activeSketch: "sk_face",
  sketches: [face(), plane("sk_30tgo")],
  history: [{ id: "history:sketch:sk_face", kind: "sketch", targetId: "sk_face" }],
  features: [{ id: "feature_cut", type: "revolveCut", params: { sketchId: "sk_face" } }],
});

test("an empty, unnamed, unrecorded plane sketch is dropped", () => {
  const def = lenscap();
  assert.equal(sketchIsAbandoned(def, def.sketches[1]), true);
  assert.deepEqual(pruneAbandonedSketches(def), ["sk_30tgo"]);
  assert.deepEqual(def.sketches.map((s) => s.id), ["sk_face"]);
  assert.equal(def.activeSketch, "sk_face");
});

test("a sketch with intent is kept", () => {
  const cases = {
    active: (def) => { def.activeSketch = "sk_30tgo"; },
    history: (def) => { def.history.push({ id: "history:sketch:sk_30tgo", kind: "sketch", targetId: "sk_30tgo" }); },
    feature: (def) => { def.features.push({ id: "f2", type: "extrude", params: { sketchId: "sk_30tgo" } }); },
    renamed: (def) => { def.sketches[1].name = "ThreadPath"; },
    points: (def) => { def.sketches[1].points.push({ id: 1, x: 1, y: 1 }); },
    support: (def) => { def.sketches[1].support = { persistentId: "f1:face:start" }; },
  };
  for (const [label, change] of Object.entries(cases)) {
    const def = lenscap();
    change(def);
    assert.deepEqual(pruneAbandonedSketches(def), [], label);
    assert.equal(def.sketches.length, 2, label);
  }
});

test("the only sketch is never removed", () => {
  const def = { activeSketch: "other", sketches: [plane("sk_only")] };
  pruneAbandonedSketches(def);
  assert.equal(def.sketches.length, 1);
});

test("the editor prunes after a view swaps the sketch and before saving", () => {
  const src = fs.readFileSync(new URL("../js/modeler.js", import.meta.url), "utf8");
  assert.match(src, /adoptSketchForView\(\);\r?\n  if \(swapped\) pruneAbandonedSketches\(E\.def\);/);
  assert.match(src, /pruneAbandonedSketches\(E\.def\);\r?\n  if\(canonical\)rebindReplacedSketchProfiles\(E\.def\);\r?\n  var def = JSON\.parse\(JSON\.stringify\(E\.def\)\);/);
});
