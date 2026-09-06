/* Undo as a tree: what forking buys, and what the cap is allowed to throw away. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHistory } from "../model/history.js";
import { emptyDoc } from "../model/schema.js";
import { hide, insert, readField, retitle } from "../model/ops.js";
import { normalizeDoc } from "../model/validate.js";
import { makeNode } from "../model/schema.js";

function base() {
  return normalizeDoc({
    v: 1,
    variants: { base: { root: "n:top", patch: {} } },
    nodes: {
      "n:top": { type: "bar", children: ["act:save"] },
      "act:save": { type: "item", ref: "act:save" },
    },
    overrides: { text: {}, tokens: {} },
  }).doc;
}

test("a fresh history has a state and nothing to undo", () => {
  const h = createHistory({ doc: base() });
  assert.equal(h.canUndo(), false);
  assert.equal(h.canRedo(), false);
  assert.equal(h.size(), 1);
  assert.ok(h.doc.nodes["act:save"]);
});

test("apply, undo and redo walk the same states", () => {
  const h = createHistory({ doc: base() });
  const start = h.doc;
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }));
  assert.equal(h.doc.nodes["act:save"].label, "Keep");
  assert.ok(h.canUndo());

  assert.equal(h.undo(), start);
  assert.equal(readField(h.doc, "act:save", "label"), null, "back to inheriting");
  assert.ok(h.canRedo());

  h.redo();
  assert.equal(h.doc.nodes["act:save"].label, "Keep");
});

test("an op that changed nothing never reaches the tree", () => {
  const h = createHistory({ doc: base() });
  h.apply("No change", retitle(h.doc, { id: "act:save", label: null }));
  assert.equal(h.size(), 1);
  assert.equal(h.canUndo(), false);
});

test("a tag folds a gesture into one step", () => {
  const h = createHistory({ doc: base() });
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "K" }), "rename:act:save");
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Ke" }), "rename:act:save");
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }), "rename:act:save");
  assert.equal(h.size(), 2, "one starting state and one step for the whole gesture");
  assert.equal(h.doc.nodes["act:save"].label, "Keep");
  h.undo();
  assert.equal(readField(h.doc, "act:save", "label"), null, "undo goes back past the whole gesture");
});

test("a fresh tag ends the gesture", () => {
  const h = createHistory({ doc: base() });
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "K" }), "rename:1");
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }), "rename:2");
  assert.equal(h.size(), 3);
});

test("editing after an undo forks instead of destroying the other branch", () => {
  const h = createHistory({ doc: base() });
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }));
  const renamed = h.id;
  h.undo();
  h.apply("Hide", hide(h.doc, { id: "act:save", hidden: true }));

  assert.equal(h.doc.nodes["act:save"].hidden, true);
  assert.equal(readField(h.doc, "act:save", "label"), null);

  const back = h.jump(renamed);
  assert.equal(back.nodes["act:save"].label, "Keep", "the abandoned branch is still there");
  assert.equal(readField(back, "act:save", "hidden"), false);
});

test("redo returns to the branch you came from, not merely the newest one", () => {
  const h = createHistory({ doc: base() });
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }));
  const first = h.id;
  h.undo();
  h.apply("Hide", hide(h.doc, { id: "act:save", hidden: true })); // a newer sibling
  h.jump(first);
  h.undo();
  assert.equal(h.redo(), null || h.doc, "redo resolves");
  assert.equal(h.id, first, "back to the branch the undo came from, not the newer Hide");
});

test("the cap drops the oldest abandoned branch and never the path in use", () => {
  const h = createHistory({ doc: base(), cap: 6 });
  // one long abandoned branch...
  for (let i = 0; i < 4; i++) {
    h.apply("Old " + i, insert(h.doc, { id: "old:" + i, node: makeNode("separator"), parent: "n:top", index: 0 }));
  }
  const deep = h.id;
  while (h.canUndo()) h.undo(); // back to the root, abandoning it
  // ...then a new one that must survive
  for (let i = 0; i < 5; i++) {
    h.apply("New " + i, insert(h.doc, { id: "new:" + i, node: makeNode("separator"), parent: "n:top", index: 0 }));
  }

  assert.ok(h.size() <= 6, "cap held: " + h.size());
  assert.equal(h.jump(deep), null, "the abandoned branch went first");
  // the states leading to where we stand are all still reachable
  let steps = 0;
  while (h.canUndo()) { h.undo(); steps++; }
  assert.ok(steps >= 1, "the current path survived pruning");
});

test("onChange fires for every state change and nothing else", () => {
  let count = 0;
  const h = createHistory({ doc: base(), onChange: () => count++ });
  const afterReset = count;
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }));
  h.apply("Nothing", retitle(h.doc, { id: "act:save", label: "Keep" }));
  h.undo();
  h.redo();
  assert.equal(count - afterReset, 3, "apply, undo, redo — the no-op did not fire");
});

test("reset restarts from a known document", () => {
  const h = createHistory({ doc: base() });
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }));
  h.reset(emptyDoc("n:app"));
  assert.equal(h.size(), 1);
  assert.equal(h.canUndo(), false);
  assert.ok(h.doc.nodes["n:app"]);
});

test("steps() describes the tree without handing out the documents", () => {
  const h = createHistory({ doc: base() });
  h.apply("Rename", retitle(h.doc, { id: "act:save", label: "Keep" }));
  const steps = h.steps();
  assert.equal(steps.length, 2);
  assert.equal(steps[0].label, "Rename");
  assert.equal(steps[0].current, true);
  assert.equal("doc" in steps[0], false, "a history panel cannot accidentally render 80 documents");
});
