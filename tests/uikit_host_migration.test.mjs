/* A saved layout, when the host renames its own nodes.
 *
 * uikit stores a document that names nodes by the HOST's ids, so renaming one
 * or changing what contains what invalidates every layout already sitting in a
 * user's browser. The failure is quiet and looks like data loss: a node whose
 * registry entry has gone resolves to a tombstone and renders nothing, and a
 * container bound to a slot the host no longer registers renders nothing
 * either. What a user sees is a menu with no items and a missing search box.
 *
 * These are this application's ids, so uikit cannot repair them without
 * learning its vocabulary. The host migrates its own, and that is what is
 * tested here — as arithmetic over a document, with no browser involved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { migrateSavedLayout, defaultLayout } from "../js/uikit_host/layout.js";

/* The shape the previous build wrote: menus were leaves, their items lived in
   slot-bound containers parked at the root, and the three toolbar-centre
   regions were called panel:* before that prefix came to mean "one of the
   fifteen curated containers". */
function legacyDoc() {
  return {
    v: 1,
    nodes: {
      "n:app": { type: "dock", children: ["n:topbar", "menuitems:file", "menuitems:edit"] },
      "n:topbar": { type: "bar", slot: "topbar", children: ["panel:tb-start", "panel:tb-center"] },
      "panel:tb-start": { type: "group", ref: "panel:tb-start", children: ["menu:file", "menu:edit"] },
      "menu:file": { type: "item", ref: "menu:file" },
      "menu:edit": { type: "item", ref: "menu:edit" },
      "menuitems:file": { type: "group", slot: "menuitems:file", children: ["act:save", "act:newPlan"] },
      "menuitems:edit": { type: "group", slot: "menuitems:edit", children: ["act:dupSel"] },
      "act:save": { type: "item", ref: "act:save", label: "Keep" },
      "act:newPlan": { type: "item", ref: "act:newPlan" },
      "act:dupSel": { type: "item", ref: "act:dupSel" },
      "panel:tb-center": { type: "group", ref: "panel:tb-center", children: ["panel:toolSearch"] },
      "panel:toolSearch": { type: "item", ref: "panel:toolSearch", hidden: true },
    },
    variants: {
      base: { root: "n:app", patch: {} },
      phone: { root: "n:app", patch: { "panel:toolSearch": { hidden: true } } },
    },
    overrides: { text: {}, tokens: {} },
  };
}

test("a renamed node keeps its place, its settings and its variant patch", () => {
  const out = migrateSavedLayout(legacyDoc());

  assert.equal(out.nodes["panel:toolSearch"], undefined, "the old id is gone");
  assert.ok(out.nodes["grp:toolSearch"], "and the node is under the new one");
  assert.equal(out.nodes["grp:toolSearch"].ref, "grp:toolSearch", "its ref follows the rename");
  assert.equal(out.nodes["grp:toolSearch"].hidden, true, "settings on the node survive");
  assert.deepEqual(out.nodes["panel:tb-center"].children, ["grp:toolSearch"],
    "and its parent still lists it, in place");
  assert.ok(out.variants.phone.patch["grp:toolSearch"],
    "a variant patch keyed by the old id follows it too");
  assert.equal(out.variants.phone.patch["panel:toolSearch"], undefined);
});

test("a menu takes back its own items, in the order the user left them", () => {
  const out = migrateSavedLayout(legacyDoc());

  assert.equal(out.nodes["menu:file"].type, "group", "the menu is a container now");
  assert.deepEqual(out.nodes["menu:file"].children, ["act:save", "act:newPlan"],
    "holding the items the user arranged, in that order and not the default one");
  assert.equal(out.nodes["act:save"].label, "Keep", "a rename inside the menu survives");
  assert.equal(out.nodes["menuitems:file"], undefined, "the old container is gone");
  assert.ok(!out.nodes["n:app"].children.includes("menuitems:file"),
    "and the root no longer lists it");
});

/* The awkward case: a document old enough that the menu was a leaf and there
   was no container to fold in. Seeding from the defaults is the only way to
   give it items at all — but anything the user has since moved elsewhere must
   not come back and appear twice. */
test("a leaf menu with nothing to fold in is seeded, without duplicating a moved item", () => {
  const doc = legacyDoc();
  delete doc.nodes["menuitems:file"];
  doc.nodes["n:app"].children = doc.nodes["n:app"].children.filter((c) => c !== "menuitems:file");
  // The user dragged Save out of the menu and onto the toolbar.
  doc.nodes["panel:tb-start"].children.push("act:save");

  const out = migrateSavedLayout(doc);
  const kids = out.nodes["menu:file"].children;

  assert.ok(kids.length > 0, "the menu was given its default items");
  assert.ok(!kids.includes("act:save"), "except the one the user had moved out");
  assert.ok(out.nodes["panel:tb-start"].children.includes("act:save"),
    "which is still where they put it");
  const everywhere = Object.keys(out.nodes)
    .flatMap((id) => out.nodes[id].children || [])
    .filter((c) => c === "act:save");
  assert.equal(everywhere.length, 1, "and appears exactly once in the whole document");
});

test("running it on a current document changes nothing", () => {
  const current = defaultLayout();
  const once = migrateSavedLayout(current);
  const twice = migrateSavedLayout(once);

  assert.deepEqual(once, current, "a document already in the current shape passes through");
  assert.deepEqual(twice, once, "and the migration is idempotent, so it is safe on every load");
});

/* It is handed the object straight out of storage, and the rest of this module
   is (doc) -> doc with no hidden state. Mutating the argument in place would
   alias the caller's document to the migrated one and only show up later, as a
   change nobody made. */
test("the document it was given is left exactly as it was", () => {
  const input = legacyDoc();
  const untouched = JSON.parse(JSON.stringify(input));
  const out = migrateSavedLayout(input);

  assert.deepEqual(input, untouched, "the input is not mutated");
  assert.notEqual(out, input, "and what comes back is a different object");
  assert.notEqual(out.nodes["n:app"].children, input.nodes["n:app"].children,
    "down to the arrays inside it, which a shallow copy would still share");
});

test("rubbish is handed back rather than repaired into something plausible", () => {
  assert.equal(migrateSavedLayout(null), null);
  assert.equal(migrateSavedLayout("not a document"), "not a document");
  assert.deepEqual(migrateSavedLayout({}), {});
});

test("a leaf More menu is promoted and seeded without duplicating a moved item", () => {
  const current = defaultLayout();
  const doc = JSON.parse(JSON.stringify(current));
  doc.nodes["menu:more"] = { type: "item", ref: "menu:more" };
  delete doc.nodes["more:walk"];
  doc.nodes["panel:tb-start"].children.push("more:walk");
  doc.nodes["more:walk"] = { type: "item", ref: "more:walk" };

  const out = migrateSavedLayout(doc);
  assert.equal(out.nodes["menu:more"].type, "group");
  assert.ok(out.nodes["menu:more"].children.includes("more:openModeler"));
  assert.ok(!out.nodes["menu:more"].children.includes("more:walk"),
    "Walk stays on the toolbar where the user put it");
  assert.ok(out.nodes["panel:tb-start"].children.includes("more:walk"));
});

test("separators are seeded only when a menu has none", () => {
  const current = defaultLayout();
  const withNone = JSON.parse(JSON.stringify(current));
  withNone.nodes["menu:file"].children = withNone.nodes["menu:file"].children
    .filter((id) => String(id).indexOf("sep:") !== 0);
  delete withNone.nodes["sep:file-1"];
  const restored = migrateSavedLayout(withNone);
  assert.ok(restored.nodes["menu:file"].children.includes("sep:file-1"),
    "a menu that never had divider nodes gets the shipped one");

  const deleted = JSON.parse(JSON.stringify(current));
  deleted.nodes["menu:file"].children = deleted.nodes["menu:file"].children
    .filter((id) => id !== "sep:file-1");
  delete deleted.nodes["sep:file-1"];
  /* A leftover sibling separator means the user already lived in the
     divider-as-node world and chose to delete this one. */
  deleted.nodes["menu:file"].children.push("sep:user-keep");
  deleted.nodes["sep:user-keep"] = { type: "separator", ref: "sep:user-keep" };
  const left = migrateSavedLayout(deleted);
  assert.ok(!left.nodes["menu:file"].children.includes("sep:file-1"),
    "a menu that still has a separator is not reseeded");
});

test("a saved menu group is a column so items can move vertically", () => {
  const current = defaultLayout();
  assert.equal(current.nodes["menu:edit"].orient, "col");
  const rowish = JSON.parse(JSON.stringify(current));
  delete rowish.nodes["menu:edit"].orient;
  const out = migrateSavedLayout(rowish);
  assert.equal(out.nodes["menu:edit"].orient, "col");
  assert.equal(out.nodes["menu:file"].orient, "col");
});


test("Planner default puts tools and submenus above side layers", () => {
  const doc = defaultLayout();
  assert.deepEqual(doc.nodes["n:pt-top"].children, ["pt:tools", "pt:walls", "pt:rooms"]);
  assert.deepEqual(doc.nodes["n:pt-left"].children, ["pt:layers", "pt:status"]);
  assert.equal(doc.nodes["n:pt-top"].flow, "col");
});

test("old dock upgrades once and subsequent customizations survive", () => {
  const doc = defaultLayout();
  delete doc.plannerDockVersion;
  doc.nodes["n:pt-left"].children = ["pt:tools", "pt:layers", "pt:walls", "pt:rooms"];
  doc.nodes["n:pt-top"].children = ["pt:status"];
  const next = migrateSavedLayout(doc);
  assert.deepEqual(next.nodes["n:pt-top"].children, ["pt:tools", "pt:walls", "pt:rooms"]);
  assert.deepEqual(migrateSavedLayout(next), next);
  next.nodes["n:pt-left"].children.reverse();
  assert.deepEqual(migrateSavedLayout(next).nodes["n:pt-left"].children, next.nodes["n:pt-left"].children);
});
