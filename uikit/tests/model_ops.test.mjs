/* Every edit the user can make, as arithmetic on a document.
 *
 * The no-op identity contract gets its own assertions throughout: `next === doc`
 * is what stops a drag that ended where it started from filling the undo tree,
 * so it is load-bearing rather than an optimisation. */
import test from "node:test";
import assert from "node:assert/strict";
import { makeNode } from "../model/schema.js";
import { normalizeDoc, parentIndex } from "../model/validate.js";
import {
  clampSize, collapse, group, hide, insert, move, readField, reicon, reorder,
  resetAll, resetNode, resetVariant, resize, retitle, setSlot, setText, setToken, ungroup,
} from "../model/ops.js";

function doc() {
  return normalizeDoc({
    v: 1,
    variants: {
      base: { root: "n:app", patch: {} },
      phone: { root: "n:app", patch: {} },
    },
    nodes: {
      "n:app": { type: "dock", children: ["n:top", "n:left"] },
      "n:top": { type: "bar", orient: "row", children: ["act:new", "act:save", "act:load"] },
      "n:left": { type: "stack", slot: "left", children: ["panel:tree"] },
      "act:new": { type: "item", ref: "act:new" },
      "act:save": { type: "item", ref: "act:save" },
      "act:load": { type: "item", ref: "act:load" },
      "panel:tree": { type: "item", ref: "panel:tree" },
    },
    overrides: { text: {}, tokens: {} },
  }).doc;
}

const kids = (d, id) => d.nodes[id].children;

test("move relocates a node and leaves the old parent tidy", () => {
  const next = move(doc(), { id: "act:save", parent: "n:left", index: 0 });
  assert.deepEqual(kids(next, "n:top"), ["act:new", "act:load"]);
  assert.deepEqual(kids(next, "n:left"), ["act:save", "panel:tree"]);
  assert.equal(parentIndex(next).get("act:save"), "n:left");
});

test("an index past the end appends rather than throwing away the drop", () => {
  const next = move(doc(), { id: "act:new", parent: "n:left", index: 99 });
  assert.deepEqual(kids(next, "n:left"), ["panel:tree", "act:new"]);
});

test("within one parent the index is read after the node has left", () => {
  const d = doc();
  const next = move(d, { id: "act:new", parent: "n:top", index: 2 });
  assert.deepEqual(kids(next, "n:top"), ["act:save", "act:load", "act:new"]);
  assert.equal(move(d, { id: "act:new", parent: "n:top", index: 0 }), d, "already there: same object");
});

test("a container cannot be dropped inside its own subtree", () => {
  const d = doc();
  assert.equal(move(d, { id: "n:top", parent: "act:save" }), d, "leaf target rejected");
  const nested = move(d, { id: "n:left", parent: "n:top", index: 0 });
  assert.equal(move(nested, { id: "n:top", parent: "panel:tree" }), nested);
  assert.equal(move(nested, { id: "n:top", parent: "n:left" }), nested, "would orphan the branch");
});

test("move refuses to touch a document through a non-base variant", () => {
  assert.throws(() => move(doc(), { id: "act:save", parent: "n:left", variant: "phone" }), /structural/);
  assert.throws(() => group(doc(), { ids: ["act:new", "act:save"], id: "g:x", variant: "phone" }), /structural/);
});

test("reorder is move within the current parent", () => {
  const next = reorder(doc(), { id: "act:load", index: 0 });
  assert.deepEqual(kids(next, "n:top"), ["act:load", "act:new", "act:save"]);
});

test("insert places a new node and refuses to overwrite an existing id", () => {
  const d = doc();
  const next = insert(d, { id: "act:undo", node: makeNode("item", { ref: "act:undo" }), parent: "n:top", index: 1 });
  assert.deepEqual(kids(next, "n:top"), ["act:new", "act:undo", "act:save", "act:load"]);
  assert.equal(insert(next, { id: "act:save", parent: "n:top", index: 0 }), next, "id already taken");
  assert.equal(insert(d, { id: "act:undo", parent: "act:save" }), d, "a leaf is not a container");
});

test("group wraps siblings in place and keeps their document order", () => {
  const next = group(doc(), { ids: ["act:load", "act:new"], id: "g:file", label: "File" });
  assert.deepEqual(kids(next, "n:top"), ["g:file", "act:save"]);
  assert.deepEqual(kids(next, "g:file"), ["act:new", "act:load"], "sorted by where they sat, not by selection order");
  assert.equal(next.nodes["g:file"].label, "File");
});

test("group can carry a ref and constraints for a host-owned submenu", () => {
  const next = group(doc(), {
    ids: ["act:new", "act:save"],
    id: "menu:user-1",
    label: "Submenu",
    ref: "menu:user-1",
    constraints: { resize: "none", accepts: ["command", "separator", "menu"] },
    orient: "col",
  });
  const node = next.nodes["menu:user-1"];
  assert.equal(node.ref, "menu:user-1");
  assert.equal(node.label, "Submenu");
  assert.equal(node.orient, "col");
  assert.deepEqual(node.constraints.accepts, ["command", "separator", "menu"]);
  assert.deepEqual(kids(next, "menu:user-1"), ["act:new", "act:save"]);
});

test("group refuses a selection that spans two parents", () => {
  const d = doc();
  assert.equal(group(d, { ids: ["act:save", "panel:tree"], id: "g:x" }), d);
  assert.equal(group(d, { ids: ["act:save"], id: "g:x" }), d, "one node is not a group");
});

test("ungroup splices the children back where the group stood", () => {
  const grouped = group(doc(), { ids: ["act:new", "act:save"], id: "g:file" });
  const next = ungroup(grouped, { id: "g:file" });
  assert.deepEqual(kids(next, "n:top"), ["act:new", "act:save", "act:load"]);
  assert.equal("g:file" in next.nodes, false, "the dissolved container is gone");
});

test("ungroup takes the group's variant patches with it", () => {
  let d = group(doc(), { ids: ["act:new", "act:save"], id: "g:file" });
  d = hide(d, { id: "g:file", hidden: true, variant: "phone" });
  assert.ok(d.variants.phone.patch["g:file"]);
  const next = ungroup(d, { id: "g:file" });
  assert.equal("g:file" in next.variants.phone.patch, false, "no patch left to resurrect");
});

test("presentational edits in base write the node; in a variant they write a sparse patch", () => {
  const d = doc();
  const inBase = hide(d, { id: "n:left", hidden: true });
  assert.equal(inBase.nodes["n:left"].hidden, true);
  assert.deepEqual(inBase.variants.phone.patch, {});

  const inPhone = setSlot(d, { id: "n:left", slot: "sheet", variant: "phone" });
  assert.deepEqual(inPhone.variants.phone.patch["n:left"], { slot: "sheet" });
  assert.equal(inPhone.nodes["n:left"].slot, "left", "base is untouched");
  assert.equal(readField(inPhone, "n:left", "slot", "phone"), "sheet");
  assert.equal(readField(inPhone, "n:left", "slot", "base"), "left");
});

test("resetVariant clears only the requested non-base presentation patch", () => {
  let d = hide(doc(), { id: "n:left", hidden: true, variant: "phone" });
  d = { ...d, variants: { ...d.variants, compact: { root: "n:app", patch: { "n:top": { hidden: true } } } } };
  const next = resetVariant(d, { variant: "phone" });
  assert.deepEqual(next.variants.phone.patch, {});
  assert.deepEqual(next.variants.compact.patch, { "n:top": { hidden: true } });
  assert.equal(resetVariant(next, { variant: "phone" }), next, "an empty patch is a no-op");
  assert.equal(resetVariant(next, { variant: "base" }), next, "base is the shared layout, not a patch");
});

test("setting a field to what it already is changes nothing", () => {
  const d = doc();
  assert.equal(hide(d, { id: "n:left", hidden: false }), d);
  assert.equal(retitle(d, { id: "act:save", label: null }), d);
  assert.equal(collapse(d, { id: "n:top", collapsed: false }), d);
  const named = retitle(d, { id: "act:save", label: "Keep" });
  assert.equal(retitle(named, { id: "act:save", label: "Keep" }), named);
});

test("an empty label is an override, null is a reset", () => {
  const blanked = retitle(doc(), { id: "act:save", label: "" });
  assert.equal(blanked.nodes["act:save"].label, "", "the user cleared it");
  const restored = retitle(blanked, { id: "act:save", label: null });
  assert.equal(restored.nodes["act:save"].label, null, "back to inheriting");
});

test("resize clamps to the constraints the caller passed in", () => {
  assert.deepEqual(clampSize({ w: 10, h: 900 }, { w: 180, h: 120 }, { w: 600, h: 800 }), { w: 180, h: 800 });
  assert.equal(clampSize(null, { w: 1 }, null), null);
  assert.deepEqual(clampSize({ w: "nonsense" }, null, null), null);

  const next = resize(doc(), { id: "n:left", size: { w: 40 }, min: { w: 200 }, max: { w: 500 } });
  assert.deepEqual(next.nodes["n:left"].size, { w: 200 });
  assert.equal(resize(next, { id: "n:left", size: { w: 40 }, min: { w: 200 }, max: { w: 500 } }), next,
    "clamping to the value already stored is still a no-op");
});

test("tokens live on a node, or document-wide when the id is null", () => {
  let d = setToken(doc(), { id: "n:left", name: "--uikit-pad", value: "8px" });
  assert.deepEqual(d.nodes["n:left"].tokens, { "--uikit-pad": "8px" });
  d = setToken(d, { id: "n:left", name: "--uikit-pad", value: null });
  assert.equal(d.nodes["n:left"].tokens, null, "the last token removed clears the map");

  d = setToken(d, { id: null, name: "--uikit-density", value: "compact" });
  assert.deepEqual(d.overrides.tokens, { "--uikit-density": "compact" });
});

test("text overrides are per language, with an explicit everywhere bucket", () => {
  let d = setText(doc(), { key: "menu_file", lang: "he", value: "קובץ שלי" });
  assert.deepEqual(d.overrides.text, { he: { menu_file: "קובץ שלי" } });
  assert.equal(setText(d, { key: "menu_file", lang: "he", value: "קובץ שלי" }), d);

  d = setText(d, { key: "save", value: "Keep" });
  assert.equal(d.overrides.text["*"].save, "Keep");

  d = setText(d, { key: "menu_file", lang: "he", value: null });
  assert.equal("he" in d.overrides.text, false, "an emptied bucket is removed, not left as clutter");
});

test("resetNode deletes the override keys instead of writing today's default", () => {
  let d = retitle(doc(), { id: "act:save", label: "Keep" });
  d = reicon(d, { id: "act:save", icon: "ph-star" });
  d = hide(d, { id: "act:save", hidden: true });
  const node = resetNode(d, { id: "act:save" }).nodes["act:save"];
  assert.equal("label" in node, false);
  assert.equal("icon" in node, false);
  assert.equal("hidden" in node, false);
  assert.equal(node.ref, "act:save", "the placement itself survives");
});

test("resetNode in a variant drops only that breakpoint's patch", () => {
  let d = retitle(doc(), { id: "act:save", label: "Keep" });
  d = hide(d, { id: "act:save", hidden: true, variant: "phone" });
  const next = resetNode(d, { id: "act:save", variant: "phone" });
  assert.equal("act:save" in next.variants.phone.patch, false);
  assert.equal(next.nodes["act:save"].label, "Keep", "base survived");
  assert.equal(resetNode(next, { id: "act:save", variant: "phone" }), next);
});

test("resetAll returns the layout the host shipped, not an invention", () => {
  const shipped = doc();
  const edited = retitle(shipped, { id: "act:save", label: "Keep" });
  const back = resetAll(edited, { defaults: shipped });
  assert.deepEqual(back, shipped);
  assert.notEqual(back, shipped, "a copy, so the host's defaults cannot be edited by reference");

  const blank = resetAll(edited, {});
  assert.deepEqual(Object.keys(blank.nodes), ["n:app"]);
});

test("no op ever mutates the document it was given", () => {
  const d = doc();
  const before = JSON.stringify(d);
  move(d, { id: "act:save", parent: "n:left", index: 0 });
  group(d, { ids: ["act:new", "act:save"], id: "g:x" });
  ungroup(d, { id: "n:top" });
  resize(d, { id: "n:left", size: { w: 400 } });
  setText(d, { key: "save", value: "Keep" });
  setToken(d, { id: null, name: "--x", value: "1" });
  assert.equal(JSON.stringify(d), before);
});
