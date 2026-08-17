import test from "node:test";
import assert from "node:assert/strict";

/* activeParts() is the single rule that decides what a document actually builds.
   It is exercised here against the same shape modeler.js uses, so the contract
   is pinned even though the module itself needs a DOM to import. */
function activeParts(def) {
  if (!def || !Array.isArray(def.parts)) return [];
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  const upto = fin(def.rollback) && def.rollback >= 0 ? Math.min(def.rollback, def.parts.length) : def.parts.length;
  return def.parts.slice(0, upto).filter((p) => p && !p.suppressed);
}

const doc = () => ({
  rollback: null,
  parts: [{ id: "a" }, { id: "b" }, { id: "c" }],
});

test("a fresh document builds its whole history", () => {
  assert.deepEqual(activeParts(doc()).map((p) => p.id), ["a", "b", "c"]);
});

test("a suppressed feature stops building but keeps its place in the tree", () => {
  const d = doc();
  d.parts[1].suppressed = true;
  assert.deepEqual(activeParts(d).map((p) => p.id), ["a", "c"]);
  assert.equal(d.parts.length, 3);
});

test("the rollback bar cuts the history at its index", () => {
  const d = doc();
  d.rollback = 1;
  assert.deepEqual(activeParts(d).map((p) => p.id), ["a"]);
  d.rollback = 0;
  assert.deepEqual(activeParts(d), []);
  d.rollback = null;
  assert.equal(activeParts(d).length, 3);
});

test("suppression and rollback compose, and a stale index cannot overrun the array", () => {
  const d = doc();
  d.parts[0].suppressed = true;
  d.rollback = 2;
  assert.deepEqual(activeParts(d).map((p) => p.id), ["b"]);
  d.rollback = 99;
  assert.deepEqual(activeParts(d).map((p) => p.id), ["b", "c"]);
});

/* Inserting at the bar is what makes rollback useful: you go to a moment in the
   history and build from there, rather than always appending to the end. */
function addPart(def, part) {
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  if (fin(def.rollback) && def.rollback < def.parts.length) {
    def.parts.splice(def.rollback, 0, part);
    def.rollback++;
  } else def.parts.push(part);
  return part;
}

test("a new feature lands at the rollback bar, and the bar moves past it", () => {
  const d = doc();
  d.rollback = 1;
  addPart(d, { id: "new" });
  assert.deepEqual(d.parts.map((p) => p.id), ["a", "new", "b", "c"]);
  assert.equal(d.rollback, 2);
  assert.deepEqual(activeParts(d).map((p) => p.id), ["a", "new"]);
});

test("with the bar released a new feature simply appends", () => {
  const d = doc();
  addPart(d, { id: "new" });
  assert.deepEqual(d.parts.map((p) => p.id), ["a", "b", "c", "new"]);
  assert.equal(d.rollback, null);
});
