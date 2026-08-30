/* The applyData() contract, pinned at the source.
 *
 * js/modeler.js is no longer on the boot graph, so a project carrying custom
 * model definitions has to fetch the part->geometry builder before it can be
 * applied: applyData() is synchronous whenever it can be and asynchronous only
 * on that path. Two consequences are easy to regress and expensive to notice,
 * so they are asserted here rather than left to a reviewer:
 *
 *   1. a deferred apply that was overtaken must NOT replay over the newer state
 *   2. callers must not report success for an apply that did not happen
 *
 * (2) is the one that bites hardest: markSaved()/markDirty() on a scene that
 * never loaded tells someone their work is safe when it is not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL("../" + p, import.meta.url), "utf8");
const ui = await read("js/ui.js");
const persist = await read("js/persist.js");
const workspace = await read("js/workspace.js");
const planSync = await read("js/plan_sync.js");
const floors = await read("js/floors.js");
const visit = await read("js/visit.js");

test("applyData reports whether it applied, and only the latest request may commit", () => {
  // Every valid request receives an ordering token before it can wait for the
  // builder. Incrementing only on commit makes the oldest waiter win.
  assert.match(ui, /var applyRequestGeneration = 0;/);
  assert.match(ui, /return applyDataRequest\(d, \+\+applyRequestGeneration\);/);
  // A deferred request keeps its original token through the retry and drops
  // itself when anything newer has started.
  assert.match(ui, /if \(applyRequestGeneration !== requestGeneration\) return false;/);
  assert.match(ui, /return applyDataRequest\(d, requestGeneration\);/);
  // and the ordinary path resolves truthy so callers can tell the two apart
  assert.match(ui, /return Promise\.resolve\(true\);/);
});

test("callers do not report success for an apply that was dropped", () => {
  // crash recovery: no markDirty()/"recovered" flash unless it really applied
  assert.match(persist, /\.then\(function \(applied\) \{[\s\S]*?if \(!applied\)/);
  // opening a project: markSaved() would claim the file on screen is this one
  assert.match(workspace, /if \(!applied\) throw new Error\("project apply was superseded"\)/);
  // local save/load and file import must follow the same result contract
  assert.match(ui, /then\(function \(applied\) \{\s*if \(!applied\) \{ flash\(t\("f_loadFail"\)/);
  assert.match(ui, /then\(function \(applied\) \{\s*if \(!applied\) \{ flash\(t\("f_badFile"\)/);
});

test("the remote-apply guard cannot be stranded by a synchronous throw", () => {
  // applyData throws synchronously on a malformed payload; setting the flag
  // before Promise.resolve() existed left applyingRemote true forever, which
  // silently stops every local edit from reaching peers.
  const applyScene = planSync.slice(planSync.indexOf("function applyScene"));
  const body = applyScene.slice(0, applyScene.indexOf("\n}"));
  assert.match(body, /Promise\.resolve\(\)\.then\(function \(\) \{\s*applyingRemote = true;/);
  assert.match(body, /\.finally\(function \(\) \{\s*applyingRemote = false;/);
  assert.ok(
    body.indexOf("Promise.resolve()") < body.indexOf("applyingRemote = true"),
    "the flag must be set inside the promise chain, not before it",
  );
});

test("a floor switch rolls back when its deferred apply fails or is superseded", () => {
  // switchFloor cannot await, so the synchronous catch cannot see a rejection
  // from the builder-fetch path; without a late rollback the storey bookkeeping
  // would stand over a scene that never applied.
  assert.match(floors, /if \(applied && typeof applied\.then === "function"\)/);
  const late = floors.slice(floors.indexOf('typeof applied.then === "function"'));
  assert.match(late.slice(0, 900), /applied\.then\(function \(didApply\) \{[\s\S]*?if \(didApply \|\| switchGeneration !== floorSwitchGeneration\) return;[\s\S]*?workspace\.activeFloor = previous;/);
  assert.match(late.slice(0, 900), /function \(err\) \{[\s\S]*?workspace\.activeFloor = previous;/);
});

test("visit transitions cannot finish after a newer transition or dropped apply", () => {
  assert.match(visit, /let visitGeneration = 0;/);
  assert.match(visit, /const generation = \+\+visitGeneration;/);
  assert.match(visit, /applied = !!\(await applyData\(friend\.model\)\);/);
  assert.match(visit, /if \(generation !== visitGeneration \|\| VISIT\.friend !== friend\) return false;/);
  assert.match(visit, /if \(!applied\) \{ VISIT\.friend = friend; return false; \}/);
});
