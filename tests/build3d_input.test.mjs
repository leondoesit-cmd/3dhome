/* Building from the 3D pane: the finger's pick slop through the 3D → plan
   bridge (js/planner_input.js) and the pure rules in js/build3d_input.js. */
import test from "node:test";
import assert from "node:assert/strict";
import { S } from "../js/state.js";
import { moduleSource } from "./helpers/module_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { dispatchPlannerInput, registerPlannerController } from "../js/planner_input.js";
import {
  aimCounts, chainState, dragPlanPoint, dragSamplePlan, groundSampleOk, isCabinetItem, itemDragGrabY,
  planBounds, toolHintKey, touchCommitsOnRelease, viewScale,
} from "../js/build3d_input.js";
import { plannerInputView } from "../js/planner_input.js";

function dispatched(tool, pointerType, extra) {
  const seen = [];
  registerPlannerController({ down: (e) => seen.push(e), move: (e) => seen.push(e), up: (e) => seen.push(e) });
  const prevTool = S.tool, prevPlace = S.placeType;
  S.tool = tool;
  S.placeType = extra && extra.placeType || null;
  try {
    dispatchPlannerInput("down", { point: { x: 10, z: 20 }, scale: 2, width: 400, height: 300, event: { pointerType, pointerId: 7 } });
    dispatchPlannerInput("up", { point: { x: 10, z: 20 }, scale: 2, width: 400, height: 300, event: { pointerType, pointerId: 7 } });
  } finally {
    S.tool = prevTool;
    S.placeType = prevPlace;
  }
  return seen[0];
}

test("a finger on a drawing tool keeps the mouse event type (no 2D loupe) but gets the touch pick slop", () => {
  const e = dispatched("wall", "touch");
  assert.equal(e.pointerType, "mouse");
  assert.equal(e.coarse, true);
  const mouse = dispatched("wall", "mouse");
  assert.equal(mouse.coarse, false);
  // wiring Node cannot run (pointerDown needs the DOM): the flag sizes the pick slop
  const down = sourceFunctionText(moduleSource("js/interaction.js"), "pointerDown");
  assert.match(down, /setPickSlop\(e\.coarse \? "touch" : e\.pointerType\)/);
});

test("the select tool's finger stays a touch; placing a library piece does not open the 2D loupe", () => {
  assert.equal(dispatched("select", "touch").pointerType, "touch");
  const placing = dispatched("select", "touch", { placeType: "sofa" });
  assert.equal(placing.pointerType, "mouse");
  assert.equal(placing.coarse, true);
});

test("a tool whose next press commits previews under the finger and commits on release", () => {
  assert.equal(touchCommitsOnRelease({ tool: "door" }), true);
  assert.equal(touchCommitsOnRelease({ tool: "select", placeType: "sofa" }), true);
  assert.equal(touchCommitsOnRelease({ tool: "wall", drawing: false }), false, "the first corner keeps press-drag-release");
  assert.equal(touchCommitsOnRelease({ tool: "wall", drawing: true }), true);
  assert.equal(touchCommitsOnRelease({ tool: "rect" }), false);
  assert.equal(touchCommitsOnRelease({ tool: "rect", rectDraft: { x: 0, z: 0 } }), true);
  assert.equal(touchCommitsOnRelease({ tool: "erase" }), false, "a stroke tool erases as it goes");
  assert.equal(touchCommitsOnRelease({ tool: "select" }), false);
});

test("a ground sample that ran off past the plan (a grazing ray) is refused", () => {
  const b = planBounds({ nodes: [{ x: 0, z: 0 }, { x: 600, z: 400 }], items: [] });
  assert.deepEqual(b, { x0: 0, z0: 0, x1: 600, z1: 400 });
  assert.equal(groundSampleOk({ x: 300, z: 200 }, b), true);
  assert.equal(groundSampleOk({ x: 2000, z: -1500 }, b), true, "the yard around the house still counts");
  assert.equal(groundSampleOk({ x: 90000, z: 200 }, b), false);
  assert.equal(groundSampleOk({ x: NaN, z: 0 }, b), false);
  assert.equal(groundSampleOk({ x: 1000, z: 0 }, null), true, "an empty plan accepts what is near the origin");
  assert.equal(groundSampleOk({ x: 100000, z: 0 }, null), false);
});

test("the action strip offers what each chain can do", () => {
  assert.equal(chainState({ tool: "wall", drawing: false }), null);
  assert.deepEqual(chainState({ tool: "wall", drawing: true, drawWalls: [] }), { kind: "wall", finish: false, undo: true, cancel: true });
  assert.equal(chainState({ tool: "wall", drawing: true, drawWalls: [4] }).finish, true);
  assert.deepEqual(chainState({ tool: "rect", rectDraft: { x: 0, z: 0 } }), { kind: "rect", finish: false, undo: true, cancel: true });
  assert.equal(chainState({ tool: "mepRoute", mep: { route: { pts: [{}, {}] } } }).finish, true);
  assert.equal(chainState({ tool: "mepRoute", mep: { route: { pts: [{}] } } }).finish, false);
  assert.deepEqual(chainState({ tool: "fitcab" }, true), { kind: "fitcab", finish: false, undo: false, cancel: true });
  assert.equal(chainState({ tool: "fitcab" }, false), null);
  assert.equal(chainState({ tool: "walloffset", offsetDraft: { hostId: 1 } }).kind, "walloffset");
});

test("the hint chip reuses the plan's own next-step keys", () => {
  assert.deepEqual(toolHintKey({ tool: "rect" }), { key: "hint_tool_rect", touch: true });
  assert.deepEqual(toolHintKey({ tool: "rect", rectDraft: {} }), { key: "hint_tool_rect_next", touch: true });
  assert.deepEqual(toolHintKey({ tool: "select", placeType: "bed" }), { key: "hint_tool_place", touch: true });
  assert.equal(toolHintKey({ tool: "window" }).key, "hint_tool_opening");
  assert.equal(toolHintKey({ tool: "roomstamp", roomGhost: { blocked: true } }).key, "rp_overlapShort");
  assert.equal(toolHintKey({ tool: "select" }), null);
});

test("a press that grabbed one piece drags on the plane through the grabbed point", () => {
  const it = { id: 1 };
  const grabbing = { action: "item", sel: { kind: "item", ref: it } };
  assert.equal(itemDragGrabY(grabbing, { point: { x: 0, y: 112, z: 0 } }), 112);
  assert.equal(itemDragGrabY(grabbing, null), 0, "no hit: the floor plane");
  assert.equal(itemDragGrabY({ action: "item", sel: { kind: "items", refs: [it, {}] } }, { point: { y: 50 } }), 50, "a group keeps the original grab plane");
  assert.equal(itemDragGrabY({ action: null, sel: { kind: "item", ref: it } }, { point: { y: 50 } }), null, "a click that did not start a drag");
  assert.equal(itemDragGrabY({ action: "wall", sel: { kind: "wall", ref: {} } }, { point: { y: 50 } }), null);

  assert.deepEqual(dragSamplePlan({ action: "item" }, 112), { plane: true, grabY: 112 });
  assert.deepEqual(dragSamplePlan({ action: "item" }, 0), { plane: true, grabY: 0 });
  assert.equal(dragSamplePlan({ action: null, tool: "select" }, 112), null, "the drag ended (cancelled elsewhere): plain sample");
  assert.equal(dragSamplePlan({ action: "item", tool: "select" }, null), null, "a drag started in the plan, not by this pane's press");
  assert.deepEqual(dragSamplePlan({ tool: "fitcab" }, null), { plane: false, grabY: 0 });
  assert.deepEqual(dragSamplePlan({ action: "fitcab", tool: "select" }, null), { plane: false, grabY: 0 });
  assert.equal(dragSamplePlan(null, 5), null);
});

test("a wall is aimed at only when the cursor is on it, not on the floor in front of it", () => {
  const eye = { x: 0, y: 160, z: 0 };
  const wall = { id: 4, point: { x: 500, y: 120, z: 0 }, nx: -1, nz: 0 };
  // ray down to the floor 300 cm away, the wall behind at 500: the floor is first
  assert.equal(aimCounts({ x: 300, y: 0, z: 0 }, eye, wall), false);
  // the plane point lies past the face (the ray met the wall first)
  assert.equal(aimCounts({ x: 650, y: 0, z: 0 }, eye, wall), true);
  assert.equal(aimCounts({ x: 500, y: 120, z: 0 }, eye, wall), true, "exactly on the face");
  assert.equal(aimCounts(null, eye, wall), true, "a ray rising above the grab plane meets only the wall");
  assert.equal(aimCounts({ x: 650, y: 0, z: 0 }, eye, null), false, "no wall under the cursor");
});

test("the drag's plan point: the aimed face, else the plane point, else keep the last sample", () => {
  const b = { x0: 0, z0: 0, x1: 600, z1: 400 };
  assert.deepEqual(dragPlanPoint({ x: 650, y: 0, z: 10 }, { wallId: 4, x: 500, y: 120, z: 10 }, b), { x: 500, z: 10 });
  assert.deepEqual(dragPlanPoint({ x: 300, y: 80, z: 200 }, null, b), { x: 300, z: 200 });
  assert.equal(dragPlanPoint({ x: 90000, y: 80, z: 200 }, null, b), null, "a grazing ray");
  assert.equal(dragPlanPoint(null, null, b), null);
  assert.ok(Math.abs(viewScale(600, 90, 300) - 1) < 1e-9);
  assert.equal(viewScale(600, undefined, NaN) > 0, true);
});

test("the 3D bridge hands the drag sample to the plan tools next to the hit", () => {
  registerPlannerController({ down() {}, move() {}, up() {} });
  const drag = { ray: { o: { x: 0, y: 160, z: 0 }, d: { x: 1, y: 0, z: 0 } }, aim: { wallId: 4, nx: -1, nz: 0, x: 500, y: 120, z: 0 }, grabY: 80 };
  dispatchPlannerInput("down", { point: { x: 10, z: 20 }, scale: 2, width: 400, height: 300, event: {} });
  assert.equal(plannerInputView().drag, null);
  dispatchPlannerInput("move", { point: { x: 10, z: 20 }, scale: 2, width: 400, height: 300, event: {}, drag });
  assert.equal(plannerInputView().drag, drag);
  dispatchPlannerInput("up", { point: { x: 10, z: 20 }, scale: 2, width: 400, height: 300, event: {} });
});

test("casework opens in the cabinet designer", () => {
  assert.equal(isCabinetItem({ type: "cabsys" }), true);
  assert.equal(isCabinetItem({ type: "sofa", cab: {} }), true);
  assert.equal(isCabinetItem({ type: "wardrobe" }), true);
  assert.equal(isCabinetItem({ type: "sofa" }), false);
  assert.equal(isCabinetItem(null), false);
});

test("wallDragHint: an on-wall piece selected with no tool armed gets the wall-drag hint", async () => {
  const { wallDragHint } = await import("../js/build3d_input.js");
  const { isOnWall } = await import("../js/item_orient.js");
  const tv = { id: 1, type: "tvWall" }, sofa = { id: 2, type: "sofa" };
  assert.equal(wallDragHint({ tool: "select", sel: { kind: "item", ref: tv } }, isOnWall), true);
  assert.equal(wallDragHint({ tool: "select", sel: { kind: "item", ref: sofa } }, isOnWall), false);
  assert.equal(wallDragHint({ tool: "wall", sel: { kind: "item", ref: tv } }, isOnWall), false);
  assert.equal(wallDragHint({ tool: "select", placeType: "art", sel: { kind: "item", ref: tv } }, isOnWall), false);
  assert.equal(wallDragHint({ tool: "select", sel: { kind: "item", ref: { ...tv, locked: true } } }, isOnWall), false);
});
