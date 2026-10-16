// js/pro_catalog.js matchTools: the one ranking behind the Every command panel
// (Ctrl+K), the phone/fold tool search and the More sheet's "Find a tool".
import test from "node:test";
import assert from "node:assert/strict";
import { matchTools, proTools } from "../js/pro_catalog.js";

const names = (q, eds) => matchTools(q, eds).map((t) => t.editor + ":" + t.label);

test("an exact name comes first", () => {
  assert.equal(names("wall")[0], "plan:Wall");
  assert.equal(names("Door")[0], "plan:Door");
});

test("names that start with the query outrank names that only contain it", () => {
  const hits = names("wall");
  const startsAt = hits.indexOf("plan:Wall types");
  const containsAt = hits.indexOf("plan:Arc wall");
  assert.ok(startsAt > 0 && containsAt > 0, "both found");
  assert.ok(startsAt < containsAt, "Wall types (starts) before Arc wall (word inside)");
});

test("a word inside a name is found: dim → Smart dimension, in the model editor", () => {
  assert.ok(names("dim").includes("model:Smart dimension"));
  assert.ok(names("smart dim").includes("model:Smart dimension"), "several words, all in the name");
});

test("aliases and Hebrew names match", () => {
  assert.ok(names("centre rect").includes("model:Center rectangle"), "British alias");
  assert.equal(names("קיר")[0], "plan:Wall", "Hebrew label");
});

test("words may name the editor or the tab: door plan → the planner's Door", () => {
  assert.equal(names("door plan")[0], "plan:Door");
});

test("the editor filter is respected and empty queries find nothing", () => {
  assert.ok(matchTools("dim", ["plan"]).every((t) => t.editor === "plan"));
  assert.deepEqual(matchTools("   "), []);
  assert.deepEqual(matchTools(null), []);
});

test("only tools that can run are offered, each once", () => {
  for (const q of ["a", "e", "wall", "sketch"]) {
    const hits = matchTools(q);
    assert.ok(hits.every((t) => t.bind), q + ": every hit has a binding");
    const keys = hits.map((t) => t.editor + "|" + t.tab + "|" + t.group + "|" + t.label);
    assert.equal(new Set(keys).size, keys.length, q + ": no duplicates");
  }
});

test("every bound tool can be found by its own name", () => {
  const missed = proTools().filter((t) => t.bind).filter((t) => !matchTools(t.label).some((h) => h.label === t.label && h.editor === t.editor));
  assert.deepEqual(missed.map((t) => t.editor + ":" + t.label), []);
});

/* Two different actions under one Hebrew name cannot be told apart in a
   menu or a search (Erase and Delete were both "מחק"). The same action under
   two English names may share one (Cutaway / Dollhouse). */
test("within an editor, different actions never share a Hebrew name", async () => {
  const { proLabel } = await import("../js/pro_catalog.js");
  const clashes = [];
  for (const ed of ["plan", "model", "cab"]) {
    const byName = new Map();
    for (const t of proTools(ed)) {
      if (!t.bind) continue;
      const he = proLabel(t.label, "he");
      const prev = byName.get(he);
      if (prev && prev.bind !== t.bind && prev.label !== t.label) clashes.push(ed + ": " + he + " = " + prev.label + " / " + t.label);
      else if (!prev) byName.set(he, t);
    }
  }
  assert.deepEqual(clashes, []);
});
