/* Where "inherit" becomes a value, and where a missing command becomes a
   tombstone instead of a deletion. */
import test from "node:test";
import assert from "node:assert/strict";
import { asRegistry, resolve, resolveText, unplaced, variantRoot } from "../model/resolve.js";
import { hide, retitle, setSlot, setText } from "../model/ops.js";
import { normalizeDoc } from "../model/validate.js";

const REGISTRY = [
  { id: "act:save", kind: "command", title: "Save", icon: "ph-floppy-disk",
    constraints: { minW: 32, minH: 28 } },
  { id: "act:load", kind: "command", title: "Load", icon: "ph-folder-open" },
  { id: "panel:tree", kind: "panel", title: "Tree", icon: "ph-tree-structure",
    constraints: { minW: 180 } },
  { id: "act:gone", kind: "command", title: "Retired", icon: null },
];

function doc() {
  return normalizeDoc({
    v: 1,
    variants: {
      base: { root: "n:app", patch: {} },
      phone: { root: "n:app", patch: {} },
    },
    nodes: {
      "n:app": { type: "dock", children: ["n:top", "n:left"] },
      "n:top": { type: "bar", orient: "row", children: ["act:save", "act:load"] },
      "n:left": { type: "stack", slot: "left", children: ["panel:tree"] },
      "act:save": { type: "item", ref: "act:save" },
      "act:load": { type: "item", ref: "act:load" },
      "panel:tree": { type: "item", ref: "panel:tree" },
    },
    overrides: { text: {}, tokens: {} },
  }).doc;
}

const find = (node, id) => {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = find(child, id);
    if (hit) return hit;
  }
  return null;
};

test("a registry can arrive as a list, a Map or a plain object", () => {
  for (const source of [REGISTRY, new Map(REGISTRY.map((e) => [e.id, e])),
                        Object.fromEntries(REGISTRY.map((e) => [e.id, e]))]) {
    const reg = asRegistry(source);
    assert.equal(reg.get("act:save").title, "Save");
    assert.ok(reg.ids().includes("panel:tree"));
  }
  assert.equal(asRegistry(null).get("anything"), null);
});

test("label and icon fall through to the registry until the user overrides them", () => {
  const { tree } = resolve(doc(), { registry: REGISTRY });
  assert.equal(find(tree, "act:save").label, "Save");
  assert.equal(find(tree, "act:save").icon, "ph-floppy-disk");

  const renamed = retitle(doc(), { id: "act:save", label: "Keep" });
  const after = resolve(renamed, { registry: REGISTRY });
  assert.equal(find(after.tree, "act:save").label, "Keep");
  assert.equal(find(after.tree, "act:save").icon, "ph-floppy-disk", "an icon is not dragged along by a rename");
});

test("a per-language text override renames the string, and the node still wins", () => {
  let d = setText(doc(), { key: "act:save", lang: "he", value: "שמור אצלי" });
  assert.equal(find(resolve(d, { registry: REGISTRY, lang: "he" }).tree, "act:save").label, "שמור אצלי");
  assert.equal(find(resolve(d, { registry: REGISTRY, lang: "en" }).tree, "act:save").label, "Save",
    "the language that was never edited is untouched");

  d = setText(d, { key: "act:save", value: "Keep" }); // the "*" bucket
  assert.equal(find(resolve(d, { registry: REGISTRY, lang: "en" }).tree, "act:save").label, "Keep");
  assert.equal(find(resolve(d, { registry: REGISTRY, lang: "he" }).tree, "act:save").label, "שמור אצלי",
    "an exact language match beats the everywhere bucket");

  const pinned = retitle(d, { id: "act:save", label: "This one" });
  assert.equal(find(resolve(pinned, { registry: REGISTRY, lang: "en" }).tree, "act:save").label, "This one",
    "the placement is more specific than the string");
});

test("resolveText reads the buckets in the documented order", () => {
  let d = setText(doc(), { key: "k", value: "everywhere" });
  assert.equal(resolveText(d, "k", "he"), "everywhere");
  d = setText(d, { key: "k", lang: "he", value: "exact" });
  assert.equal(resolveText(d, "k", "he"), "exact");
  assert.equal(resolveText(d, "k", "en"), "everywhere");
  assert.equal(resolveText(d, "missing", "en"), null);
});

test("a variant patches presentation over the same tree", () => {
  const d = setSlot(doc(), { id: "n:left", slot: "sheet", variant: "phone" });
  assert.equal(find(resolve(d, { registry: REGISTRY, variant: "phone" }).tree, "n:left").slot, "sheet");
  assert.equal(find(resolve(d, { registry: REGISTRY }).tree, "n:left").slot, "left");
  assert.equal(variantRoot(d, "phone"), "n:app");
  assert.equal(variantRoot(d, "nonexistent"), "n:app", "an unknown variant falls through to base");
});

test("a hidden node is resolved and flagged, not dropped", () => {
  const d = hide(doc(), { id: "act:load", hidden: true });
  const node = find(resolve(d, { registry: REGISTRY }).tree, "act:load");
  assert.ok(node, "the renderer decides what hidden looks like, not resolve");
  assert.equal(node.hidden, true);
});

test("a placement whose command is gone is a tombstone in edit mode and absent in normal mode", () => {
  const d = doc();
  d.nodes["act:vanished"] = { type: "item", ref: "act:vanished" };
  d.nodes["n:top"].children.push("act:vanished");

  const normal = resolve(d, { registry: REGISTRY });
  assert.equal(find(normal.tree, "act:vanished"), null, "nothing is drawn for it");
  assert.ok(normal.tombstones.some((t) => t.id === "act:vanished" && t.reason === "no-entry"));
  assert.deepEqual(d.nodes["n:top"].children.includes("act:vanished"), true, "and the document still has it");

  const editing = resolve(d, { registry: REGISTRY, edit: true });
  assert.equal(find(editing.tree, "act:vanished").tombstone, "no-entry");
});

test("an unknown node type tombstones without taking the tree down with it", () => {
  const d = doc();
  d.nodes["n:odd"] = { type: "ribbon", children: [] };
  d.nodes["n:top"].children.push("n:odd");
  const { tree, tombstones } = resolve(d, { registry: REGISTRY, edit: true });
  assert.equal(find(tree, "n:odd").tombstone, "unknown-type");
  assert.equal(find(tree, "act:save").label, "Save", "its siblings resolved normally");
  assert.ok(tombstones.some((t) => t.reason === "unknown-type"));
});

test("a dangling child id resolves as a tombstone rather than throwing", () => {
  const d = doc();
  d.nodes["n:top"].children.push("act:never-existed");
  const { tree } = resolve(d, { registry: REGISTRY, edit: true });
  assert.equal(find(tree, "act:never-existed").tombstone, "unknown-node");
  assert.equal(find(resolve(d, { registry: REGISTRY }).tree, "act:never-existed"), null);
});

test("resolve terminates on a document that is still cyclic mid-edit", () => {
  const d = doc();
  d.nodes["n:top"].children.push("n:app"); // not normalized: exactly what a bad drag leaves
  const { tree } = resolve(d, { registry: REGISTRY, edit: true });
  assert.ok(tree, "returned rather than hanging");
  assert.equal(find(tree, "n:top").children.filter((c) => c.id === "n:app").length, 0);
});

test("constraints travel from the registry to the resolved node", () => {
  const source = doc();
  source.nodes["n:left"].constraints = { resize: "x", minW: 240, hide: false };
  const { tree } = resolve(source, { registry: REGISTRY });
  assert.deepEqual(find(tree, "panel:tree").constraints, { minW: 180 });
  assert.equal(find(tree, "act:load").constraints, null);
  assert.deepEqual(find(tree, "n:left").constraints, { resize: "x", minW: 240, hide: false },
    "a bound container can carry host guardrails without a registry entry");
});

test("unplaced lists what the palette should offer", () => {
  const free = unplaced(doc(), REGISTRY).map((e) => e.id);
  assert.deepEqual(free, ["act:gone"]);

  const hidden = hide(doc(), { id: "act:load", hidden: true });
  assert.equal(unplaced(hidden, REGISTRY).map((e) => e.id).includes("act:load"), false,
    "hidden is placed, just not shown — offering it again would duplicate the node");
});
