/* The document's promises about missing fields, unknown fields and versions.
 *
 * These are the invariants the rest of the module is allowed to assume, and
 * the ones that decide whether a layout survives an app upgrade. Everything
 * here runs without a DOM on purpose: if it needed a browser it would not get
 * run on every change, and these are exactly the rules that break silently. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DOC_VERSION, defaultsFor, docVersion, emptyDoc, isContainer, isLeaf,
  isKnownType, makeNode, migrate, needsMigration, withDefaults,
} from "../model/schema.js";
import { normalizeDoc, parentIndex } from "../model/validate.js";

test("null label and icon mean inherit, and are the default", () => {
  const node = makeNode("item", { ref: "act:save" });
  assert.equal(node.label, null);
  assert.equal(node.icon, null);
  assert.equal(node.hidden, false);
  assert.equal(defaultsFor("item").size, null);
});

test("withDefaults keeps keys this build has never heard of", () => {
  const filled = withDefaults({ type: "item", ref: "act:save", futureField: { deep: 1 }, label: "Keep" });
  assert.equal(filled.label, "Keep", "an explicit value is not overwritten by the default");
  assert.deepEqual(filled.futureField, { deep: 1 });
});

test("containers and leaves are distinguishable, unknown types are neither", () => {
  assert.ok(isContainer("bar") && isContainer("stack") && isContainer("float"));
  assert.ok(isLeaf("item") && isLeaf("separator"));
  assert.equal(isContainer("item"), false);
  assert.equal(isKnownType("ribbon"), false);
});

test("a document with no version is v0 and migrates up the ladder", () => {
  const legacy = { root: "n:bar", nodes: { "n:bar": { type: "bar", children: [] } } };
  assert.equal(docVersion(legacy), 0);
  assert.ok(needsMigration(legacy));

  const migrated = migrate(legacy);
  assert.equal(migrated.v, DOC_VERSION);
  assert.equal(migrated.variants.base.root, "n:bar");
  assert.deepEqual(migrated.overrides, { text: {}, tokens: {} });
  assert.equal("root" in migrated, false, "the promoted field is not left behind as a second source of truth");
  assert.equal(needsMigration(migrated), false);
});

test("a document from the future is returned untouched, never guessed at", () => {
  const future = { v: DOC_VERSION + 5, nodes: {}, variants: { base: { root: "x", patch: {} } }, mystery: 7 };
  const out = migrate(future);
  assert.equal(out, future, "no migration ran");
  assert.equal(out.mystery, 7);
});

test("normalizeDoc reports a future version rather than silently downgrading it", () => {
  const { doc, problems } = normalizeDoc({
    v: DOC_VERSION + 1,
    nodes: { "n:root": { type: "dock", children: [] } },
    variants: { base: { root: "n:root", patch: {} } },
  });
  assert.equal(doc.v, DOC_VERSION + 1);
  assert.ok(problems.some((p) => p.code === "future-version"));
});

test("an unknown node type is preserved, not corrected", () => {
  const { doc, problems } = normalizeDoc({
    v: 1,
    variants: { base: { root: "n:root", patch: {} } },
    nodes: {
      "n:root": { type: "dock", children: ["n:odd"] },
      "n:odd": { type: "ribbon", children: [], vendorField: true },
    },
    overrides: { text: {}, tokens: {} },
  });
  assert.equal(doc.nodes["n:odd"].type, "ribbon");
  assert.equal(doc.nodes["n:odd"].vendorField, true);
  assert.ok(problems.some((p) => p.code === "unknown-type" && p.id === "n:odd"));
});

test("a dangling child id is kept so it can become a visible tombstone", () => {
  const { doc, problems } = normalizeDoc({
    v: 1,
    variants: { base: { root: "n:root", patch: {} } },
    nodes: { "n:root": { type: "dock", children: ["n:gone"] } },
    overrides: { text: {}, tokens: {} },
  });
  assert.deepEqual(doc.nodes["n:root"].children, ["n:gone"], "not quietly deleted");
  assert.ok(problems.some((p) => p.code === "dangling-child" && p.id === "n:gone"));
});

/* A loop that hangs off the root can never form: the single-parent rule drops
   the second claim before a cycle exists. The case breakCycles is actually for
   is a loop with no root above it at all — two containers that only reference
   each other, which is what a bad merge of two documents produces. */
test("a detached cycle is broken at a stable point and reported", () => {
  const cyclic = {
    v: 1,
    variants: { base: { root: "n:root", patch: {} } },
    nodes: {
      "n:root": { type: "dock", children: [] },
      "n:a": { type: "bar", children: ["n:b"] },
      "n:b": { type: "bar", children: ["n:a"] },
    },
    overrides: { text: {}, tokens: {} },
  };
  const { doc, problems } = normalizeDoc(cyclic);
  assert.ok(problems.some((p) => p.code === "cycle"));
  // the same document always loses the same edge, on any machine
  assert.deepEqual(
    normalizeDoc(cyclic).problems.filter((p) => p.code === "cycle"),
    problems.filter((p) => p.code === "cycle")
  );
  const parents = parentIndex(doc);
  // whichever edge was cut, walking up from every node now terminates
  for (const id of Object.keys(doc.nodes)) {
    const seen = new Set();
    for (let cursor = id; cursor != null; cursor = parents.get(cursor)) {
      assert.equal(seen.has(cursor), false, "still cyclic at " + cursor);
      seen.add(cursor);
    }
  }
});

test("a loop through the root is prevented by the single-parent rule alone", () => {
  const { doc, problems } = normalizeDoc({
    v: 1,
    variants: { base: { root: "n:root", patch: {} } },
    nodes: {
      "n:root": { type: "dock", children: ["n:a"] },
      "n:a": { type: "bar", children: ["n:b"] },
      "n:b": { type: "bar", children: ["n:a"] },
    },
    overrides: { text: {}, tokens: {} },
  });
  assert.ok(problems.some((p) => p.code === "duplicate-parent" && p.id === "n:a"));
  assert.equal(problems.some((p) => p.code === "cycle"), false, "no cycle was ever built");
  assert.deepEqual(doc.nodes["n:b"].children, []);
});

test("a node claimed by two parents keeps the first claim", () => {
  const { doc, problems } = normalizeDoc({
    v: 1,
    variants: { base: { root: "n:root", patch: {} } },
    nodes: {
      "n:root": { type: "dock", children: ["n:one", "n:two"] },
      "n:one": { type: "bar", children: ["act:save"] },
      "n:two": { type: "bar", children: ["act:save"] },
      "act:save": { type: "item", ref: "act:save" },
    },
    overrides: { text: {}, tokens: {} },
  });
  assert.deepEqual(doc.nodes["n:one"].children, ["act:save"]);
  assert.deepEqual(doc.nodes["n:two"].children, []);
  assert.ok(problems.some((p) => p.code === "duplicate-parent" && p.id === "act:save"));
});

test("a node that is its own child is cut, everything else in it survives", () => {
  const { doc, problems } = normalizeDoc({
    v: 1,
    variants: { base: { root: "n:root", patch: {} } },
    nodes: {
      "n:root": { type: "dock", children: ["n:bar"] },
      "n:bar": { type: "bar", children: ["n:bar", "act:save"] },
      "act:save": { type: "item", ref: "act:save" },
    },
    overrides: { text: {}, tokens: {} },
  });
  assert.deepEqual(doc.nodes["n:bar"].children, ["act:save"]);
  assert.ok(problems.some((p) => p.code === "self-child"));
});

test("normalizeDoc never mutates its argument and never throws on rubbish", () => {
  const raw = { v: 1, nodes: { "n:root": { type: "dock", children: ["n:root"] } },
                variants: { base: { root: "n:root", patch: {} } }, overrides: { text: {}, tokens: {} } };
  const before = JSON.stringify(raw);
  normalizeDoc(raw);
  assert.equal(JSON.stringify(raw), before);

  for (const junk of [null, undefined, 7, "doc", [], { nodes: 5 }, { nodes: { x: null } }]) {
    const { doc } = normalizeDoc(junk);
    assert.ok(doc && doc.nodes && doc.variants.base, "returned a usable document for " + JSON.stringify(junk));
  }
});

test("a document missing base gets one promoted rather than an invented empty root", () => {
  const { doc, problems } = normalizeDoc({
    v: 1,
    variants: { phone: { root: "n:root", patch: {} } },
    nodes: { "n:root": { type: "dock", children: [] } },
    overrides: { text: {}, tokens: {} },
  });
  assert.equal(doc.variants.base.root, "n:root");
  assert.ok(problems.some((p) => p.code === "missing-base-variant"));
});

test("emptyDoc round-trips through normalizeDoc with nothing to report", () => {
  const { doc, problems } = normalizeDoc(emptyDoc("n:app"));
  assert.deepEqual(problems, []);
  assert.equal(doc.variants.base.root, "n:app");
  assert.equal(doc.nodes["n:app"].type, "dock");
});
