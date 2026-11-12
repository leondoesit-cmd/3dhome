/* Regressions from a hard QA pass over the 2D planner, driving the unusual
   multi-step workflows the existing suites do not: dimensions authored on a
   CLOSED room rather than on the open L-shaped chains the constraint tests use,
   and a wall drawn straight ACROSS a room rather than corner to corner.

   Each test pins the user-visible symptom, not the implementation. */
import test from "node:test";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { detectRooms, wallClearLength, wallGeom } from "../js/geometry.js";
import {
  syncLocks, syncClears, settleWallDim, wouldReleaseJoint, snapshotNodes, setLocked,
} from "../js/constraint_engine.js";
import {
  ensureNodeIds, nodeAnchor, addDistance, addFixed, addCoincident, solveWallCons,
  conSatisfied,
} from "../js/wall_constraints.js";
import { extendToHit } from "../js/wall_draw.js";
/* Structural assertions below are about CODE, not prose: several of these
   comments quote the very call they explain (the old window hop, applyData), so
   a regex that cannot tell the two apart passes or fails for the wrong reason. */
import { stripComments as code } from "./source.mjs";

/* A plain 400 x 300 room, corners shared, every wall holding what it reads —
   i.e. what the wall tool leaves behind. */
function room(w = 400, d = 300) {
  S.interiorDims = true;
  S.nodes = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
  S.walls = [1, 2, 3, 4].map((id, i) => ({
    id, a: i, b: (i + 1) % 4, thickness: 10, height: 270,
  }));
  S.openings = []; S.items = []; S.markers = []; S.wallCons = []; S.roomCons = [];
  S.roomMeta = {}; S.slabOpenings = [];
  syncLocks();
  syncClears();
  ensureNodeIds();
  return S.walls;
}

test("a dimension stated across a closed room resizes it instead of tearing it open", () => {
  room(400, 300);
  addFixed(nodeAnchor(0));
  const c = addDistance(nodeAnchor(0), nodeAnchor(1), 500);
  const result = solveWallCons();

  assert.equal(S.nodes.length, 4, "no corner was handed a private copy of itself");
  assert.equal(detectRooms().length, 1, "the room is still a room");
  assert.ok(conSatisfied(c), "and the dimension it was asked for holds");
  assert.equal(result.unresolved, 0);
  // the wall opposite the dimensioned one is the one that yields, exactly as it
  // does when the same number is typed into the wall inspector
  assert.equal(Math.round(S.nodes[1].x), 500);
  assert.equal(Math.round(S.nodes[2].x), 500);
});

test("the same dimension typed in the inspector and stated as a relation agree", () => {
  room(400, 300);
  settleWallDim(S.walls[0], 500, "b", [S.walls[0].id]);
  const typed = S.walls.map((w) => Math.round(wallClearLength(w)));

  room(400, 300);
  addFixed(nodeAnchor(0));
  addDistance(nodeAnchor(0), nodeAnchor(1), 510); // 510 node-to-node = 500 clear
  solveWallCons();
  const stated = S.walls.map((w) => Math.round(wallClearLength(w)));

  assert.deepEqual(stated, typed, "one plan, two ways of saying the same thing");
});

test("a corner placed by hand is not dragged back by the next solve", () => {
  /* The repair above may only run when a joint is actually about to come apart.
     Relaxing on every solve instead undid edits the caller had just made by
     hand — a peer's corner move over the multiplayer relay, or the held side of
     a coincident pair, snapped back to its pre-edit position. */
  room(400, 300);
  const b = { x: 40, z: 260 };
  S.nodes.push({ ...b });
  S.walls.push({ id: 9, a: 4, b: 1, thickness: 10, height: 270 });
  ensureNodeIds();
  const c = addCoincident(nodeAnchor(3), nodeAnchor(4), "a");
  assert.ok(c);
  // move the HELD corner directly, the way a drag or a remote op does
  S.nodes[3].x = 40;
  S.nodes[3].z = 260;
  solveWallCons();
  assert.deepEqual(
    { x: Math.round(S.nodes[3].x), z: Math.round(S.nodes[3].z) },
    { x: 40, z: 260 },
    "the corner stayed where it was put",
  );
  assert.deepEqual(
    { x: Math.round(S.nodes[4].x), z: Math.round(S.nodes[4].z) },
    { x: 40, z: 260 },
    "and the driven corner followed it",
  );
});

test("wouldReleaseJoint answers before anything has been torn", () => {
  room(400, 300);
  const before = snapshotNodes();
  S.nodes[1].x = 500; // stretches walls 1 and 2, neither of them the edit
  assert.equal(wouldReleaseJoint(before, [1]), true, "wall 2 is about to be freed");
  assert.equal(wouldReleaseJoint(before, [1, 2]), false, "unless both are the edit");
  assert.equal(S.nodes.length, 4, "asking does not itself release anything");
  const after = snapshotNodes();
  assert.equal(wouldReleaseJoint(after, []), false, "and a plan that has not moved is quiet");
});

test("an unlocked wall never asks for a joint to be released", () => {
  room(400, 300);
  S.walls.forEach((w) => setLocked(w, false));
  const before = snapshotNodes();
  S.nodes[1].x = 500;
  assert.equal(wouldReleaseJoint(before, []), false);
});

test("a stroke that runs past a wall crosses it instead of stopping at it", () => {
  /* Drawing a partition straight through a room, from outside the north wall to
     outside the south wall, used to leave an 80 cm stub outside the north wall
     and the room undivided: the far end was snapped back to the first wall the
     ray met, and the rest of the stroke was thrown away. */
  S.nodes = [{ x: 0, z: 0 }, { x: 600, z: 0 }];
  S.walls = [{ id: 1, a: 0, b: 1, thickness: 10, height: 270 }];
  S.openings = []; S.drawFrom = null;
  assert.equal(
    extendToHit({ x: 300, z: -80 }, { x: 300, z: 480 }, 30),
    null,
    "560 cm of stroke is not a 80 cm wall aimed at the north wall",
  );
  // aiming a little past it still means "end on it"
  const near = extendToHit({ x: 300, z: -80 }, { x: 300, z: 40 }, 30);
  assert.ok(near, "a small overshoot still snaps onto the wall");
  assert.equal(Math.round(near.z), 0);
  assert.equal(near.kind, "hit");
  // and so does stopping just short of it
  const short = extendToHit({ x: 300, z: -80 }, { x: 300, z: -15 }, 30);
  assert.ok(short, "a stroke that stops just short still reaches the wall");
  assert.equal(Math.round(short.z), 0);
});

test("a terrace of dimensioned rooms still solves in the time an edit has", () => {
  /* The repair is a whole-plan relaxation, so it is run ONCE per solve rather
     than after every constraint in every sweep. Per constraint it was 193
     seconds for ten solves of this plan — the plan below is 46 walls and eight
     dimensions, which is an ordinary drawing, not a stress test. */
  S.nodes = []; S.walls = []; S.openings = []; S.items = []; S.markers = [];
  S.wallCons = []; S.roomCons = []; S.roomMeta = {};
  S.interiorDims = true;
  let id = 1;
  for (let i = 0; i <= 15; i++) S.nodes.push({ x: i * 400, z: 0 }, { x: i * 400, z: 300 });
  for (let i = 0; i <= 15; i++)
    S.walls.push({ id: id++, a: i * 2, b: i * 2 + 1, thickness: 10, height: 270 });
  for (let i = 0; i < 15; i++) {
    S.walls.push({ id: id++, a: i * 2, b: i * 2 + 2, thickness: 10, height: 270 });
    S.walls.push({ id: id++, a: i * 2 + 1, b: i * 2 + 3, thickness: 10, height: 270 });
  }
  syncLocks();
  syncClears();
  ensureNodeIds();
  addFixed(nodeAnchor(0));
  for (let i = 0; i < 8; i++) addDistance(nodeAnchor(i * 2), nodeAnchor(i * 2 + 2), 400 + i);
  /* CPU time, not wall clock: npm test runs files in parallel, and a busy
     machine stretched ~1 s of work past 8 s of wall time. The regression this
     guards against is ~190 s of CPU, which this still catches. */
  const started = process.cpuUsage();
  for (let k = 0; k < 10; k++) {
    S.wallCons[1].value = 400 + (k % 5) * 20; // something actually moves each time
    solveWallCons();
  }
  const used = process.cpuUsage(started), ms = Math.round((used.user + used.system) / 1000);
  assert.ok(ms < 8000, "ten solves of a 46 wall plan took " + ms + "ms of CPU");
});

test("a corner dropped on a wall is committed once, at the end of the gesture", async () => {
  /* Splitting the host on every pointermove re-split what was left of it each
     frame: dragging one corner of a room along the wall beside it produced a
     chain of stubs, a pile of coincident corners and a shape that no longer
     closed. The live drag now only remembers the host. */
  const { readFile } = await import("node:fs/promises");
  const src = moduleSource("js/interaction.js");
  // the pointermove handler lives in wirePlanMove; armDragProxy has a look-alike elsewhere
  const inits = sourceFunctionText(src, "wirePlanMove");
  const move = inits.slice(inits.indexOf('if (S.action === "node" && S.nodeDrag) {'));
  const live = move.slice(0, move.indexOf('S.action === "wall" && S.wallDrag'));
  assert.doesNotMatch(live, /splitWallAt\(p\.wall/, "the live drag no longer splits");
  assert.match(live, /S\.nodeDrag\.landOn = p\.wall\.id/, "it remembers the host instead");
  assert.match(src, /function landNodeOnWall\(ni, host, active\)/);
  assert.match(src, /if \(S\.nodeDrag\.landOn != null\) \{/, "and the end of the drag commits it");
});

test("one drawn partition owns one undo snapshot", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = moduleSource("js/interaction.js");
  const wallPoint = sourceFunctionText(src, "wallPoint");
  assert.match(wallPoint, /if \(!S\.drawing \|\| \(S\.drawWalls \|\| \[\]\)\.length\) pushHistory\(\);/,
    "the initial host split and first visible segment share their snapshot");
  assert.doesNotMatch(wallPoint, /\n\s*pushHistory\(\);\s*\n\s*if \(!S\.drawing\)/,
    "the second endpoint cannot expose an intermediate host-only split");
});

test("both model swaps cancel the same drafts, from one list", async () => {
  /* Undo/redo and a floor switch both replace the model wholesale, and both used
     to carry their own copy of "cancel every in-progress gesture". The copies
     drifted: the floor switch cleared the drawing drafts but left wallProbe,
     hoverItem and nodeDrag pointing into the storey it had just left. */
  const { readFile } = await import("node:fs/promises");
  const [state, floors, history] = await Promise.all([
    readFile(new URL("../js/state.js", import.meta.url), "utf8"),
    readFile(new URL("../js/floors.js", import.meta.url), "utf8"),
    readFile(new URL("../js/history.js", import.meta.url), "utf8"),
  ]);
  const cancel = state.slice(state.indexOf("export function cancelDraftGestures"));
  for (const field of [
    "drawing", "drawFrom", "drawStart", "drawFromSplit", "drawWalls", "wallPress",
    "rectDraft", "arcDraft", "offsetDraft", "joinPick", "previewPt", "segPreview",
    "snapGuides", "snapInfo", "nodeDrag", "dragRoom", "wallProbe", "hoverItem",
    "stackHost", "action",
  ])
    assert.match(cancel, new RegExp("S\\." + field + "\\s*="), field + " is cancelled");

  const switching = code(floors.slice(floors.indexOf("export function switchFloor(id)"), floors.indexOf("/* The storey immediately above")));
  assert.match(switching, /cancelDraftGestures\(\);/, "the floor switch uses it");
  assert.ok(switching.indexOf("cancelDraftGestures()") < switching.indexOf("applyData("),
    "and before the model underneath the draft is replaced");
  assert.match(history, /cancelDraftGestures\(\);/, "so does undo/redo");

  const { S, cancelDraftGestures } = await import("../js/state.js");
  Object.assign(S, { drawing: true, drawFrom: 7, rectDraft: { x: 1, z: 2 }, wallProbe: { wall: 1 }, action: "node" });
  cancelDraftGestures();
  assert.deepEqual(
    { drawing: S.drawing, drawFrom: S.drawFrom, rectDraft: S.rectDraft, wallProbe: S.wallProbe, action: S.action },
    { drawing: false, drawFrom: null, rectDraft: null, wallProbe: null, action: null },
  );
});

test("undo refreshes the storey tabs through a registration, not a global", async () => {
  /* planner_chrome.js is its own entry point in index.html, so history.js cannot
     import it — and reaching it as window.__plannerChrome.renderFloorTabs() put
     the link beyond both gates: rename the property and undo quietly stops
     redrawing the tab strip. */
  const { readFile } = await import("node:fs/promises");
  const [history, chrome] = await Promise.all([
    readFile(new URL("../js/history.js", import.meta.url), "utf8"),
    readFile(new URL("../js/planner_chrome.js", import.meta.url), "utf8"),
  ]);
  assert.match(history, /export function onAfterRestore\(fn\)/);
  assert.doesNotMatch(code(history), /window\.__plannerChrome/, "no name-keyed hop out of history");
  assert.match(chrome, /import \{ pushHistory, onAfterRestore \} from "\.\/history\.js";/);
  assert.match(chrome, /onAfterRestore\(renderFloorTabs\);/);
});

test("dismissing the room dialog goes through a handler openModal actually calls", async () => {
  /* This was a decision written down and never executed. openModal's Escape and
     backdrop listeners call its own internal close(); the dialog reassigned the
     returned `close` PROPERTY, which those listeners never read, so neither
     dismissal ran the decision — no name, no decline, nothing written, while
     the enclosure went on being drawn as a room. onClose() is the hook the
     internal close does invoke. The behaviour itself is driven for real in
     tests/planner_hard_qa.browser.mjs. */
  const { readFile } = await import("node:fs/promises");
  const modal = await readFile(new URL("../js/ui_tree.js", import.meta.url), "utf8");
  const at = modal.indexOf("m.onClose(function");
  assert.ok(at > 0, "the dialog registers a close handler");
  const dismiss = modal.slice(at, modal.indexOf("input.focus();", at));
  assert.match(dismiss, /mm\.noRoom = true/, "dismissal declines the room");
  assert.match(dismiss, /finish\(\)/, "and still offers whatever enclosure is queued behind it");
  assert.doesNotMatch(modal, /m\.close = function/, "no override of a property nothing consults");
});

test("every storey edit takes a snapshot first", async () => {
  const { readFile } = await import("node:fs/promises");
  const chrome = await readFile(new URL("../js/planner_chrome.js", import.meta.url), "utf8");
  const add = chrome.slice(chrome.indexOf("export function addFloorFromUI"), chrome.indexOf("function updateToolHint"));
  assert.match(add, /pushHistory\(\);\s*\n\s*addFloor\(/, "floor creation snapshots the workspace first");

  const ws = await readFile(new URL("../js/workspace.js", import.meta.url), "utf8");
  const floors = ws.slice(ws.indexOf("function drawFloors()"), ws.indexOf("const reference ="));
  // deleting a storey is the destructive direction and was the one left out
  assert.match(floors, /beginHistory\(\);\s*\n\s*if \(removeFloor/, "deletion is undoable");
  assert.match(floors, /elev\.onchange = \(\) => \{ pushHistory\(\);/, "so is re-levelling one");
  assert.doesNotMatch(floors, /cannot be undone/, "and the warning no longer says otherwise");
});

test("a storey scene never contains the storey list", async () => {
  /* A floor's `scene` is a whole document, and the spatial document used to
     carry a copy of workspace.floors — so each scene embedded the floor list as
     it stood one generation earlier. Every duplicate/switch round-trip squared
     it: the ten-item demo scene went from 130 KB to 10 MB after two duplicates,
     in every save, every autosave and every undo entry. Nothing outside
     spatial_project.js ever read the copy. */
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../js/core/spatial_project.js", import.meta.url), "utf8");
  const doc = src.slice(src.indexOf("export function installSpatialProject"));
  assert.doesNotMatch(doc, /floors:\s*state\.workspace/, "storeys are not seeded into the document");
  assert.doesNotMatch(doc, /floors:\s*spatial\.floors/, "nor exported with it");
  assert.doesNotMatch(doc, /spatial\.floors\s*=\s*clone/, "nor imported back into it");

  const { installSpatialProject, exportSpatialProject } = await import("../js/core/spatial_project.js");
  const scene = { id: "floor-1", scene: { huge: "x".repeat(5000) } };
  const state = {
    nodes: [], walls: [], openings: [], items: [], roomMeta: {}, markers: [],
    workspace: { id: "house", activeFloor: "floor-1", floors: [scene] },
  };
  installSpatialProject(state);
  const saved = JSON.stringify(exportSpatialProject(state));
  assert.equal(saved.includes("xxxxx"), false, "no storey scene rode along in the document");
  assert.ok(saved.length < 1000, "an empty plan exports as an empty plan (" + saved.length + " bytes)");
});
