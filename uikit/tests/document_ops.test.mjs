/* Presets, export/import, and which variables a host lets a user rewrite. */
import test from "node:test";
import assert from "node:assert/strict";
import { isSafeTokenName, isSafeTokenValue } from "../runtime/tokens.js";
import { normalizeDoc } from "../model/validate.js";
import { emptyDoc } from "../model/schema.js";
import { hide, resize, setToken } from "../model/ops.js";

const allowed = new Set(["--accent", "--accent-hover"]);

test("uikit's own variables are always writable", () => {
  assert.ok(isSafeTokenName("--uikit-gap"));
  assert.ok(isSafeTokenName("--uikit-anything-at-all", new Set()));
});

test("a host variable is writable only once the host has declared it", () => {
  assert.ok(isSafeTokenName("--accent", allowed), "declared: uikit may retint the app");
  assert.equal(isSafeTokenName("--accent", new Set()), false, "undeclared: refused");
  assert.equal(isSafeTokenName("--bg-app", allowed), false, "a neighbouring variable is not implied");
});

test("a name that is not a custom property is never writable", () => {
  for (const bad of ["accent", "-accent", "--", "color", "--a b", "--x;y", 7, null]) {
    assert.equal(isSafeTokenName(bad, allowed), false, String(bad));
  }
});

test("values that could escape the declaration are refused, whatever the name", () => {
  assert.ok(isSafeTokenValue("#4f46e5"));
  assert.ok(isSafeTokenValue("6px"));
  assert.ok(isSafeTokenValue(null), "clearing is always allowed");
  for (const bad of ["url(http://x/y)", "red; background: url(x)", "}", "<script>", "expression(1)"]) {
    assert.equal(isSafeTokenValue(bad), false, bad);
  }
  assert.equal(isSafeTokenValue("a".repeat(200)), false, "and nothing absurdly long");
});

/* ---- export / import ------------------------------------------------------
 *
 * Exercised against normalizeDoc directly, which is the path createUIKit's
 * importLayout takes: the point is that a document survives the round trip
 * including the parts THIS build does not understand. */

function layout() {
  let doc = normalizeDoc({
    v: 1,
    variants: { base: { root: "n:app", patch: {} }, phone: { root: "n:app", patch: {} } },
    nodes: {
      "n:app": { type: "dock", children: ["n:left"] },
      "n:left": { type: "stack", slot: "left", children: ["panel:tree"] },
      "panel:tree": { type: "item", ref: "panel:tree" },
    },
    overrides: { text: {}, tokens: {} },
  }).doc;
  doc = hide(doc, { id: "panel:tree", hidden: true, variant: "phone" });
  doc = resize(doc, { id: "n:left", size: { w: 340 } });
  doc = setToken(doc, { id: null, name: "--accent", value: "#ff0000" });
  return doc;
}

test("a layout survives export and import unchanged", () => {
  const doc = layout();
  const text = JSON.stringify(doc, null, 2);
  const back = normalizeDoc(JSON.parse(text));
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.doc, doc);
  assert.match(text, /\n/, "pretty-printed, so a layout stays diffable and hand-editable");
});

test("an import carries through fields this build has never heard of", () => {
  const doc = layout();
  doc.nodes["panel:tree"].futureField = { deep: true };
  doc.futureTopLevel = 7;
  const back = normalizeDoc(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(back.doc.nodes["panel:tree"].futureField, { deep: true });
  assert.equal(back.doc.futureTopLevel, 7);
});

test("importing rubbish reports rather than throwing", () => {
  for (const junk of [null, 7, "text", [], { nodes: "no" }]) {
    const back = normalizeDoc(junk);
    assert.ok(back.doc && back.doc.variants.base, "still a usable document");
    assert.ok(back.problems.length, "and it says what was wrong");
  }
});

test("a preset is a difference from the shipped layout, not a copy of it", () => {
  /* The property that matters: a preset built by applying ops keeps every node
     the default has, so a panel added to the app later appears in it too. A
     hand-written preset silently would not. */
  const shipped = layout();
  const preset = hide(resize(shipped, { id: "n:left", size: { w: 232 } }), {
    id: "panel:tree", hidden: true,
  });
  assert.deepEqual(Object.keys(preset.nodes), Object.keys(shipped.nodes),
    "same nodes, different values");
  assert.equal(preset.nodes["n:left"].size.w, 232);
  assert.notEqual(preset, shipped, "and the shipped document was not mutated");
  assert.equal(shipped.nodes["n:left"].size.w, 340);
});

test("an empty document is a valid export target", () => {
  const back = normalizeDoc(JSON.parse(JSON.stringify(emptyDoc("n:root"))));
  assert.deepEqual(back.problems, []);
});
