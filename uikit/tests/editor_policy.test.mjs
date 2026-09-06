/* What a container accepts, and — more importantly — who gets to decide.
 *
 * The rules in policy.js must follow from the node vocabulary alone. The
 * moment one of them knows that `n:topbar` is a three-track grid, the module
 * has stopped being portable, and no import check can see it because a string
 * is not an import. These tests are written against invented ids on purpose:
 * if a host name ever creeps back into the module, an id that never appears in
 * any application will start behaving differently from one that does.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { containerAccepts, kindOf } from "../editor/policy.js";

const bar = { id: "whatever:bar", type: "bar", children: [] };
const group = { id: "whatever:group", type: "group", children: [] };
const stack = { id: "whatever:stack", type: "stack", children: [] };
const dock = { id: "whatever:dock", type: "dock", children: [] };
const leaf = { id: "whatever:leaf", type: "item", ref: "x" };

const command = { id: "x:cmd", kind: "command" };
const panel = { id: "x:panel", kind: "panel" };

test("kind comes from the entry, whatever the id happens to look like", () => {
  assert.equal(kindOf({ kind: "command" }), "command");
  assert.equal(kindOf({ entry: { kind: "panel" } }), "panel");
  /* An id that LOOKS like a command in one app must not be treated as one.
     The prefixes act:/cmd:/panel: are a host's convention, not uikit's. */
  assert.equal(kindOf({ id: "act:save" }), "item", "no registry, no claim");
  assert.equal(kindOf({ id: "panel:tree" }), "item");
});

test("the registry is consulted however the host chose to supply it", () => {
  const entries = [{ id: "a:thing", kind: "command" }];
  const asArray = entries;
  const asMap = new Map(entries.map((e) => [e.id, e]));
  const asObject = { "a:thing": entries[0] };
  const asRegistryLike = { get: (id) => (id === "a:thing" ? entries[0] : null), ids: () => ["a:thing"] };

  for (const [name, source] of Object.entries({ asArray, asMap, asObject, asRegistryLike })) {
    assert.equal(kindOf({ ref: "a:thing" }, source), "command", name);
  }
  /* A plain array was the case that silently failed: reaching for `.get`
     directly finds nothing on an Array and falls through to guessing. */
  assert.equal(kindOf({ ref: "a:thing" }, asArray), "command");
});

test("a container's own node type is its kind", () => {
  assert.equal(kindOf(bar), "bar");
  assert.equal(kindOf(stack), "stack");
  assert.equal(kindOf(null), null);
});

test("generic rules: commands go in a line, panels go in a stack", () => {
  assert.equal(containerAccepts(bar, command), true);
  assert.equal(containerAccepts(group, command), true);
  assert.equal(containerAccepts(stack, command), false, "a sidebar is not a toolbar");
  assert.equal(containerAccepts(dock, command), false);

  assert.equal(containerAccepts(stack, panel), true);
  assert.equal(containerAccepts(dock, panel), true);
  assert.equal(containerAccepts(group, panel), true);
  assert.equal(containerAccepts(bar, panel), false, "a toolbar of panels is not a toolbar");
});

test("generic rules: separators and menus sit in a line with commands", () => {
  const separator = { id: "x:sep", kind: "separator", type: "separator" };
  const menu = { id: "x:menu", kind: "menu", type: "group" };
  assert.equal(containerAccepts(bar, separator), true);
  assert.equal(containerAccepts(group, separator), true);
  assert.equal(containerAccepts(stack, separator), false);
  assert.equal(containerAccepts(bar, menu), true);
  assert.equal(containerAccepts(group, menu), true);
  assert.equal(containerAccepts(stack, menu), false);
});

test("nothing is accepted by a leaf, a hidden container, or nothing at all", () => {
  assert.equal(containerAccepts(leaf, command), false, "a leaf has no children array");
  assert.equal(containerAccepts({ ...stack, hidden: true }, panel), false);
  assert.equal(containerAccepts(null, panel), false);
  assert.equal(containerAccepts(stack, null), true, "an unclassified thing is a container-ish thing");
});

/* ---- the host's declaration ---------------------------------------------- */

test("a declared accepts list overrides the generic rule in both directions", () => {
  const openBar = { ...bar, constraints: { accepts: ["panel"] } };
  assert.equal(containerAccepts(openBar, panel), true, "a bar that wants panels may have them");
  assert.equal(containerAccepts(openBar, command), false, "and stops taking commands");

  const closedStack = { ...stack, constraints: { accepts: ["command"] } };
  assert.equal(containerAccepts(closedStack, command), true);
  assert.equal(containerAccepts(closedStack, panel), false);
});

test("a list may name exact ids, so fixed children can return without a new kind", () => {
  /* The case this exists for: a container whose children are pinned by the
     host's CSS. Blocking everything would also block putting back a child that
     had been moved out. */
  const fixed = { ...bar, constraints: { accepts: ["p:one", "p:two"] } };
  assert.equal(containerAccepts(fixed, { id: "p:one", kind: "panel" }), true);
  assert.equal(containerAccepts(fixed, { id: "p:two", kind: "panel" }), true);
  assert.equal(containerAccepts(fixed, { id: "p:three", kind: "panel" }), false);
  assert.equal(containerAccepts(fixed, command), false);
});

test('"none" and "*" are the two absolutes', () => {
  assert.equal(containerAccepts({ ...stack, constraints: { accepts: "none" } }, panel), false);
  assert.equal(containerAccepts({ ...stack, accepts: false }, panel), false);
  assert.equal(containerAccepts({ ...bar, constraints: { accepts: ["*"] } }, panel), true);
  assert.equal(containerAccepts({ ...bar, accepts: ["*"] }, command), true);
});

test("an empty list accepts nothing, and is not mistaken for 'undeclared'", () => {
  const sealed = { ...stack, constraints: { accepts: [] } };
  assert.equal(containerAccepts(sealed, panel), false);
  assert.equal(containerAccepts(sealed, command), false);
  assert.equal(containerAccepts(stack, panel), true, "whereas an undeclared stack still takes panels");
});

test("no host's vocabulary is built in", () => {
  /* Every id here is one this repo uses. If any of them ever behaves
     differently from an equivalent invented id, an application's names have
     leaked back into the module. */
  const pairs = [
    [{ id: "n:topbar", type: "bar", children: [] }, { id: "whatever:bar", type: "bar", children: [] }],
    [{ id: "n:left", type: "stack", children: [] }, { id: "whatever:stack", type: "stack", children: [] }],
    [{ id: "n:right", type: "stack", children: [] }, { id: "other:stack", type: "stack", children: [] }],
    [{ id: "n:top", type: "bar", slot: "topbar", children: [] }, { id: "z:bar", type: "bar", children: [] }],
  ];
  for (const [named, anonymous] of pairs) {
    for (const item of [command, panel, { id: "panel:tb-start", kind: "panel" }]) {
      assert.equal(
        containerAccepts(named, item),
        containerAccepts(anonymous, item),
        named.id + " must behave exactly like " + anonymous.id + " for " + item.id
      );
    }
  }
});

test("a slot name is not a rule", () => {
  /* uikit/demo declares its toolbar with slot "topbar" and lost the ability to
     hold a command, because a hardcoded rule matched that string. */
  const demoToolbar = { id: "n:top", type: "bar", slot: "topbar", children: [] };
  assert.equal(containerAccepts(demoToolbar, command), true);
});
