import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHistory } from "../js/edit_history.js";

test("plan undo cancels a continued-wall gesture before rendering restored nodes", async () => {
  const historySource = await readFile(new URL("../js/history.js", import.meta.url), "utf8");
  const planSource = await readFile(new URL("../js/plan2d.js", import.meta.url), "utf8");
  const stateSource = await readFile(new URL("../js/state.js", import.meta.url), "utf8");

  /* The list itself now lives in state.js, shared with the floor switch, which
     replaces the model for the same reason — so this asserts that undo calls it
     and that the helper still covers the rubber band plan2d dereferences. */
  assert.match(historySource, /cancelDraftGestures\(\);/);
  assert.match(stateSource, /export function cancelDraftGestures\(\)/);
  const cancel = stateSource.slice(stateSource.indexOf("export function cancelDraftGestures"));
  assert.match(cancel, /S\.drawing = false;[\s\S]*S\.drawFrom = null;[\s\S]*S\.previewPt = null;/);
  assert.match(planSource, /S\.nodes\[S\.drawFrom\][\s\S]*S\.previewPt/);
});

test("an editor can resume a matching timeline and rejects stale external edits", () => {
  let model = { width: 80, open: 0 };
  const snapshot = () => JSON.stringify(model);
  const history = createHistory({
    get: snapshot,
    set: (json) => { model = JSON.parse(json); },
    // Preview-only door movement should not invalidate the design timeline.
    key: (json) => {
      const value = JSON.parse(json);
      delete value.open;
      return JSON.stringify(value);
    },
  });

  history.seed();
  model.width = 100;
  history.observe("Resize");
  assert.equal(history.matchesCurrent(), true);
  assert.equal(history.canUndo(), true);

  model.open = 0.8;
  assert.equal(history.matchesCurrent(), true);

  model.width = 120;
  assert.equal(history.matchesCurrent(), false);
});

test("abort restores a provisional transaction and discards its history step", () => {
  let model = { walls: [{ id: 1 }], openings: [] };
  const H = createHistory({
    get: () => JSON.stringify(model),
    set: (json) => { model = JSON.parse(json); },
  });
  H.seed();
  const before = H.position();

  H.begin("Place opening");
  assert.equal(H.isPending(), true);
  model.openings.push({ id: 2, wallId: 1 });
  model.walls[0].changed = true;

  assert.equal(H.abort(), true);
  assert.equal(H.isPending(), false);
  assert.deepEqual(model, { walls: [{ id: 1 }], openings: [] });
  assert.equal(H.position(), before);
  assert.equal(H.tree().length, 1, "the aborted step is not left in the tree");
  assert.equal(H.canUndo(), false);
});

test("a failed abort keeps transaction ownership instead of discarding its snapshot", () => {
  let model = { n: 0 };
  let rejectRestore = false;
  const H = createHistory({
    get: () => JSON.stringify(model),
    set: (json) => {
      if (rejectRestore) return false;
      model = JSON.parse(json);
    },
  });
  H.seed();
  H.begin("Change");
  model.n = 1;
  rejectRestore = true;

  assert.equal(H.abort(), false);
  assert.equal(H.isPending(), true);
  assert.equal(H.tree().length, 2);

  rejectRestore = false;
  assert.equal(H.abort(), true);
  assert.equal(H.isPending(), false);
  assert.deepEqual(model, { n: 0 });
});

/* The history is a TREE: rolling back and editing forks instead of destroying
   what came after, and both futures stay reachable. */
test("editing from a rolled-back step forks instead of truncating", () => {
  let model = { parts: [] };
  const H = createHistory({
    get: () => JSON.stringify(model),
    set: (json) => { model = JSON.parse(json); },
  });
  H.seed();
  H.push("box");
  model.parts.push("box");
  H.push("hole");
  model.parts.push("hole");

  const atBox = H.tree().find((s) => s.label === "box").i;
  H.jump(atBox);
  assert.deepEqual(model.parts, ["box"]);

  H.push("fillet");
  model.parts.push("fillet");
  assert.deepEqual(model.parts, ["box", "fillet"]);

  // the abandoned branch is still listed, and still clickable
  const tree = H.tree();
  const hole = tree.find((s) => s.label === "hole");
  assert.ok(hole, "the rolled-past step survives the fork");
  assert.equal(hole.rel, "other");
  assert.equal(tree.filter((s) => s.branch).length, 1);
  assert.equal(H.branches(), 1);

  H.jump(hole.i);
  assert.deepEqual(model.parts, ["box", "hole"]);
});

test("undo/redo walk the branch you came from", () => {
  let model = { n: 0 };
  const H = createHistory({ get: () => JSON.stringify(model), set: (j) => { model = JSON.parse(j); } });
  H.seed();
  H.push("a"); model.n = 1;
  H.push("b"); model.n = 2;
  H.undo();
  assert.equal(model.n, 1);
  H.redo();
  assert.equal(model.n, 2);
  // fork, then check redo follows the branch the marker last left
  H.undo(); H.undo();
  H.push("c"); model.n = 9;
  H.undo();
  assert.equal(model.n, 0);
  H.redo();
  assert.equal(model.n, 9, "redo returns down the branch it just came up");
});

/* The second axis: every step knows which objects it touched, derived by
   diffing an inventory of the snapshot — no call site declares anything. */
test("steps name the objects they touched, and scope to an object's children", () => {
  let model = { rooms: [{ id: "r1", name: "Kitchen" }], items: [{ id: "i1", room: "r1", x: 0 }, { id: "i2", room: "r1", x: 5 }] };
  const H = createHistory({
    get: () => JSON.stringify(model),
    set: (j) => { model = JSON.parse(j); },
    scan: (json) => {
      const s = JSON.parse(json);
      return [
        ...s.rooms.map((r) => ({ id: "room:" + r.id, kind: "room", label: r.name, sig: JSON.stringify(r) })),
        ...s.items.map((i) => ({ id: "item:" + i.id, parent: "room:" + i.room, kind: "item", label: i.id, sig: JSON.stringify(i) })),
      ];
    },
    subtree: (id) => (id === "room:r1" ? model.items.map((i) => "item:" + i.id) : []),
  });
  H.seed();

  H.push("Move sofa");
  model.items[0].x = 40;
  H.push("Rename room");
  model.rooms[0].name = "Galley";
  H.push("Delete lamp");
  model.items.splice(1, 1);

  const steps = H.tree();
  const move = steps.find((s) => s.label === "Move sofa");
  assert.deepEqual(move.targets.map((t) => t.id), ["item:i1"]);
  assert.equal(move.targets[0].change, "edit");

  const rename = steps.find((s) => s.label === "Rename room");
  assert.deepEqual(rename.targets.map((t) => t.id), ["room:r1"]);
  // the label is the one recorded when the step was taken
  assert.equal(rename.targets[0].label, "Galley");

  const del = steps.find((s) => s.label === "Delete lamp");
  assert.deepEqual(del.targets.map((t) => [t.id, t.change]), [["item:i2", "del"]]);

  // scoping a room keeps every step that touched it or anything inside it,
  // INCLUDING the piece that was deleted and is no longer a live child
  const scope = H.scope("room:r1");
  assert.ok(scope.has("item:i1") && scope.has("item:i2"));
  assert.equal(H.touches(move.i, scope), true);
  assert.equal(H.touches(del.i, scope), true);

  const only = H.scope("item:i1");
  assert.equal(H.touches(move.i, only), true);
  assert.equal(H.touches(rename.i, only), false);
});

test("the cap prunes abandoned branches before the path you are on", () => {
  let model = { n: 0 };
  const H = createHistory({ get: () => JSON.stringify(model), set: (j) => { model = JSON.parse(j); }, cap: 6 });
  H.seed();
  for (let i = 1; i <= 4; i++) { H.push("main" + i); model.n = i; }
  const back = H.tree().find((s) => s.label === "main1").i;
  H.jump(back);
  H.push("side"); model.n = 100;
  for (let i = 5; i <= 12; i++) { H.push("more" + i); model.n = i; }

  const labels = H.tree().map((s) => s.label);
  assert.ok(H.length() <= 7, "the cap is honoured");
  assert.ok(labels.includes("more12"), "the newest step on the live branch survives");
  assert.ok(!labels.includes("main4"), "the abandoned branch withered first");
});
test("document revisions follow their own edits through coalescing, undo and tree replacement",()=>{
  let scope="part", value="original";
  const history=createHistory({get:()=>value,set:s=>{value=s;},editScope:()=>scope}).seed();
  history.push("width","drag");value="first";const first=history.editRevision("part");
  history.push("width","drag");value="second";const second=history.editRevision("part");
  assert.notEqual(first,second,"editing the same node after Save still dirties the Part");
  scope="assembly";history.push("placement","drag");value="placed";
  const placement=history.editRevision("assembly");assert.equal(history.editRevision("part"),second);
  history.undo();assert.equal(value,"second");assert.equal(history.editRevision("assembly"),0);
  history.redo();assert.equal(value,"placed");assert.equal(history.editRevision("assembly"),placement);
  history.clear().seed();assert.equal(history.editRevision("part"),second);
  history.push("temporary");history.discard();assert.equal(history.editRevision("assembly"),placement);
  history.begin("drag");const duringDrag=history.editRevision("assembly");value="moved after Save";history.commit();
  assert.notEqual(history.editRevision("assembly"),duringDrag,"a save during a gesture cannot mark its later result clean");
  history.undo();assert.equal(history.editRevision("assembly"),placement);
});

test("history generation distinguishes replacement trees that reuse node numbers",()=>{
  let model="first";
  const history=createHistory({get:()=>model,set:value=>{model=value;}}).seed();
  history.push("edit");model="second";
  const generation=history.generation,session=history.saveSession();
  const node=()=>history.tree().find(entry=>entry.current)?.i;
  const edited=node();
  history.undo();history.redo();
  assert.equal(node(),edited);
  assert.equal(history.generation,generation);
  history.clear();
  const cleared=history.generation;
  assert.notEqual(cleared,generation);
  history.seed();history.push("different edit");
  assert.equal(node(),edited);
  const reseeded=history.generation;
  assert.notEqual(reseeded,cleared);
  history.loadSession(session);
  assert.equal(node(),edited);
  assert.notEqual(history.generation,reseeded);
});
