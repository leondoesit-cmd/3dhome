import test from "node:test";
import assert from "node:assert/strict";
import { ensureSketch, ensureSketchDoc, addSketch } from "../js/sketch_solver.js";
import { recordSketchInHistory, ensureParametricDocument } from "../js/core/parametric_document.js";

test("reopening a sketch-free Toolbox body never authors an empty sketch through display queries", () => {
  const doc = { features: [{ id: "screw", type: "toolbox" }], history: [{ kind: "feature", targetId: "screw" }], parts: [{ toolboxFeatureId: "screw" }], sketches: [], sketch: { points: [], entities: [], constraints: [] } };
  const idle = ensureSketch(doc);
  assert.equal(ensureSketch(doc), idle);
  assert.deepEqual(ensureSketchDoc(doc), []);
  const reopened = JSON.parse(JSON.stringify(doc));
  ensureSketch(reopened);
  assert.equal(reopened.sketches.length, 0);
  assert.equal(reopened.history.length, 1);
  // Starting Sketch on a reference is an explicit authored operation.
  recordSketchInHistory(reopened, ensureSketch(reopened));
  assert.equal(reopened.sketches.length, 1);
  assert.equal(reopened.history[1].kind, "sketch");
  assert.equal(ensureSketch(reopened).id, reopened.sketches[0].id);
});

test("real legacy sketch geometry is migrated even alongside a Toolbox feature", () => {
  const doc = { features: [{ type: "toolbox" }], sketch: { points: [{ id: "p", x: 1, y: 2 }], entities: [], constraints: [] } };
  assert.equal(ensureSketchDoc(doc).length, 1);
  assert.equal(doc.sketches[0].points[0].id, "p");
});

test("saved unrecorded default working sketch cannot become a history step during canonical normalization", () => {
  const source = { features: [{ id: "screw", type: "toolbox" }], history: [{ kind: "feature", targetId: "screw" }],
    sketches: [{ id: "idle", name: "X·Z sketch", plane: "top", offset: 0, points: [], entities: [], constraints: [] }] };
  const reopened = ensureParametricDocument(source);
  assert.equal(reopened.sketches.length, 0);
  assert.equal(reopened.history.length, 1);
  const explicitlyAuthored = structuredClone(source);
  explicitlyAuthored.history.push({ kind: "sketch", targetId: "idle" });
  assert.equal(ensureParametricDocument(explicitlyAuthored).sketches.length, 1, "intentional empty sketches remain editable");
});

test("an explicit added sketch on a Toolbox body is its sole sketch; new blank documents still initialize normally", () => {
  const doc = { features: [{ id: "nut", type: "toolbox" }], parts: [{}], sketches: [] };
  const sketch = addSketch(doc, "front", 2, "Machining sketch");
  assert.equal(doc.sketches.length, 1);
  assert.equal(ensureSketch(doc), sketch);
  const blank = {};
  assert.equal(ensureSketch(blank).plane, "top");
  assert.equal(blank.sketches.length, 1);
});
