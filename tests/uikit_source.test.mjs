/* A placement aliases a capability. One hop only. */
import test from "node:test";
import assert from "node:assert/strict";
import { applySource } from "../js/uikit_host/commands.js";

function lookup(map) {
  return (id) => map[id] || null;
}

test("a placement copies run from its source capability", () => {
  let ran = null;
  const cap = { id: "act:walk", kind: "command", run: () => { ran = "walk"; }, act: "walk" };
  const place = { id: "more:walk", kind: "command", source: "act:walk", titleFallback: "Walk" };
  const out = applySource(place, lookup({ "act:walk": cap }));
  assert.equal(out.ok, true);
  assert.equal(out.entry.id, "more:walk");
  assert.equal(out.entry.act, "walk");
  out.entry.run();
  assert.equal(ran, "walk");
});

test("a missing source is refused", () => {
  const out = applySource({ id: "more:walk", source: "act:walk" }, lookup({}));
  assert.equal(out.ok, false);
  assert.equal(out.reason, "missing-source");
});

test("a chained source is refused", () => {
  const cap = { id: "act:walk", kind: "command", run: () => {} };
  const mid = { id: "more:walk", source: "act:walk", run: () => {} };
  const out = applySource(
    { id: "place:more:walk:2", source: "more:walk" },
    lookup({ "act:walk": cap, "more:walk": mid })
  );
  assert.equal(out.ok, false);
  assert.equal(out.reason, "source-is-placement");
});

test("an entry with no source passes through", () => {
  const entry = { id: "act:save", kind: "command" };
  const out = applySource(entry, lookup({}));
  assert.equal(out.ok, true);
  assert.equal(out.entry, entry);
});
