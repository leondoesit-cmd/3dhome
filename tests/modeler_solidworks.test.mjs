import test from "node:test";
import assert from "node:assert/strict";
import {
  constraintAlreadyPresent, entityStatuses, inferLineRelations, inferOrthoSnap,
  inferTangentCircle, nextInferenceIndex, pickSnap, sketchSnapTargets, sketchStatusColor,
} from "../js/modeler_inference.js";
import {
  boxSelectMode, boundsHitBox, confirmationCornerState, contextMenuItems,
  contextToolbarItems, cycleOverlappingHits, featureHistoryIndex, gestureFromSwipe,
  selectionBreadcrumb, selectionFilterAllows, shortcutBarItems, VIEW_PRESETS,
} from "../js/modeler_chrome.js";
import { applyHandleDrag, dimensionValueFromDrag, distancePointToSegment2d, extrudeHandlePose, filletHandlePose, maxFinishAmount, projectDeltaOnAxis } from "../js/modeler_instant3d.js";
import { hiddenAfterIsolate, inferSmartMate, isolateVisibility } from "../js/modeler_smartmates.js";
import { readFile } from "node:fs/promises";

const modelerSource = await readFile(new URL("../js/modeler.js", import.meta.url), "utf8");
import { setHistoryRollback, historyEntryRolled } from "../js/core/parametric_document.js";

const lineSketch = {
  points: [
    { id: "a", x: 0, y: 0, fixed: true },
    { id: "b", x: 40, y: 0 },
    { id: "c", x: 40, y: 20 },
  ],
  entities: [
    { id: "l1", type: "line", a: "a", b: "b" },
    { id: "l2", type: "line", a: "b", b: "c" },
    { id: "circ", type: "circle", c: "c", r: 5 },
  ],
  constraints: [
    { id: "h", type: "horizontal", entity: "l1" },
    { id: "d", type: "distance", entity: "l1", value: 40 },
  ],
};

test("snap targets include origin, endpoints, midpoints and circle centres", () => {
  const targets = sketchSnapTargets(lineSketch);
  assert.ok(targets.some((t) => t.k === "o" && t.u === 0 && t.v === 0));
  assert.ok(targets.some((t) => t.k === "e" && t.pointId === "a"));
  assert.ok(targets.some((t) => t.k === "m" && t.entityId === "l1"));
  assert.ok(targets.some((t) => t.k === "c" && t.pointId === "c"));
  assert.ok(targets.some((t) => t.k === "q"));
});

test("pickSnap cycles nearby candidates and Ctrl suppresses inference", () => {
  const uv = { u: 20.1, v: 0.1 };
  const targets = sketchSnapTargets(lineSketch);
  const first = pickSnap(uv, targets, { scale: 2, cycleIndex: 0 });
  assert.ok(first.candidates.length >= 1);
  const next = pickSnap(uv, targets, { scale: 2, cycleIndex: nextInferenceIndex(first.candidates, 0) });
  if (first.candidates.length > 1) assert.notEqual(next.snap.k + next.snap.entityId, first.snap.k + first.snap.entityId);
  assert.equal(pickSnap(uv, targets, { suppress: true }).snap, null);
});

test("soft ortho snaps a near-horizontal drag onto H, unless suppressed", () => {
  const origin = { u: 0, v: 0 };
  const inferred = inferOrthoSnap({ u: 40, v: 0.4 }, origin, 8, false);
  assert.equal(inferred.kind, "h");
  assert.ok(Math.abs(inferred.point.v) < 1e-9);
  assert.equal(inferOrthoSnap({ u: 40, v: 0.4 }, origin, 8, true).kind, null);
});

test("a horizontal segment infers H and a midpoint snap infers midpoint", () => {
  const line = { id: "n", a: "p0", b: "p1" };
  const rel = inferLineRelations(line, { u: 0, v: 0 }, { u: 12, v: 0 }, { k: "m", entityId: "l1" });
  assert.ok(rel.some((c) => c.type === "horizontal"));
  assert.ok(rel.some((c) => c.type === "midpoint" && c.entity === "l1"));
});

test("a line sitting on a circle infers tangency", () => {
  const tangent = inferTangentCircle(
    { a: { u: 0, v: 5 }, b: { u: 10, v: 5 } },
    [{ id: "circ", r: 5, center: { u: 5, v: 0 } }],
  );
  assert.equal(tangent.id, "circ");
});

test("fixed origin plus H+distance turns the far endpoint black", () => {
  const status = entityStatuses(lineSketch, { status: "under-constrained", conflicts: [] });
  assert.equal(status.pointStatus.a, "fully-defined");
  assert.equal(status.pointStatus.b, "fully-defined");
  assert.equal(status.entityStatus.l1, "fully-defined");
  assert.equal(status.entityStatus.l2, "under-defined");
  assert.equal(sketchStatusColor("fully-defined"), "#1b2733");
  assert.equal(sketchStatusColor("under-defined"), "#2684c7");
  assert.equal(sketchStatusColor("conflicting"), "#d0342c");
});

test("duplicate inferred relations are detected", () => {
  assert.equal(constraintAlreadyPresent(lineSketch, { type: "horizontal", entity: "l1" }), true);
  assert.equal(constraintAlreadyPresent(lineSketch, { type: "vertical", entity: "l1" }), false);
});

test("confirmation corner appears for sketch, feature and in-progress draw", () => {
  assert.equal(confirmationCornerState({ sketchPhase: true }).mode, "sketch");
  assert.equal(confirmationCornerState({ featureType: "extrude", featureLabel: "Extrude" }).label, "Extrude");
  assert.equal(confirmationCornerState({ drawing: true, canAccept: false }).canAccept, false);
  assert.equal(confirmationCornerState({}).visible, false);
});

test("context toolbar and S-key bar follow the current selection", () => {
  const face = contextToolbarItems({ face: true });
  assert.ok(face.some((item) => item.id === "newsketch"));
  assert.ok(face.some((item) => item.id === "extrude"));
  assert.ok(face.some((item) => item.id === "filletfeature"));
  assert.ok(face.some((item) => item.id === "chamferfeature"));
  assert.equal(contextToolbarItems({ closedSketch: true }).length, 0);
  assert.ok(contextToolbarItems({ closedSketch: true, sketchEntity: true }).some((item) => item.id === "extrude"));
  const sketch = shortcutBarItems({ sketchPhase: true });
  assert.equal(sketch[0].id, "select");
  assert.ok(shortcutBarItems({ assembly: true }).some((item) => item.id === "isolate"));
  assert.ok(contextMenuItems({ face: true, hideable: true }).some((item) => item.id === "hide"));
});

test("right-drag gestures map to Extrude / Dimension / Line / Normal To", () => {
  assert.equal(gestureFromSwipe(0, -80), "extrude");
  assert.equal(gestureFromSwipe(0, 80), "dim");
  assert.equal(gestureFromSwipe(-80, 0), "wall");
  assert.equal(gestureFromSwipe(80, 0), "normalTo");
  assert.equal(gestureFromSwipe(2, 2), null);
});

test("selection filters, breadcrumbs, box-select and select-through", () => {
  assert.equal(selectionFilterAllows("face", "all"), true);
  assert.equal(selectionFilterAllows("edge", "face"), false);
  assert.equal(selectionFilterAllows("part", "body"), true);
  const crumbs = selectionBreadcrumb({
    reference: { kind: "face", persistentId: "f1", semantic: "top" },
    part: { id: "p1", featureId: "feat1", name: "Boss" },
  });
  assert.deepEqual(crumbs.map((c) => c.kind), ["face", "feature", "body"]);
  assert.equal(boxSelectMode(10, 40), "enclosed");
  assert.equal(boxSelectMode(40, 10), "crossing");
  assert.equal(boundsHitBox({ x0: 12, y0: 12, x1: 18, y1: 18 }, { x0: 10, y0: 10, x1: 20, y1: 20 }, "enclosed"), true);
  assert.equal(boundsHitBox({ x0: 0, y0: 0, x1: 30, y1: 30 }, { x0: 10, y0: 10, x1: 20, y1: 20 }, "enclosed"), false);
  assert.equal(boundsHitBox({ x0: 0, y0: 0, x1: 30, y1: 30 }, { x0: 10, y0: 10, x1: 20, y1: 20 }, "crossing"), true);
  const cycled = cycleOverlappingHits([{ persistentId: "a" }, { persistentId: "b" }], "a");
  assert.equal(cycled.persistentId, "b");
  assert.equal(VIEW_PRESETS[0].id, "front");
});

test("Instant3D drags change depth along the handle axis", () => {
  const pose = extrudeHandlePose({ x0: 0, x1: 10, y0: 0, y1: 40, z0: 0, z1: 10 }, "y", { depth: 40 });
  assert.equal(pose.origin.y, 40);
  assert.equal(pose.key, "depth");
  assert.equal(projectDeltaOnAxis({ x: 0, y: 5, z: 0 }, pose.direction), 5);
  const next = applyHandleDrag("extrude", { depth: 40 }, { x: 0, y: 5, z: 0 }, pose.direction);
  assert.equal(next.depth, 45);
  assert.equal(applyHandleDrag("chamfer", { distance: 2 }, { x: 3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).distance, 5);
  assert.equal(applyHandleDrag("fillet", { radius: 1 }, { x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }).radius, 3);
  assert.ok(Math.abs(dimensionValueFromDrag(20, 10, 2) - 25) < 1e-9);
  const fillet = filletHandlePose({ x: 10, y: 5, z: 0 }, 5, { x: 1, y: 0, z: 0 });
  assert.equal(fillet.key, "radius");
  assert.ok(fillet.length >= 10);
  assert.ok(distancePointToSegment2d(5, 1, 0, 0, 10, 0) < 1.01);
  assert.ok(distancePointToSegment2d(50, 50, 0, 0, 10, 0) > 20);
  assert.equal(maxFinishAmount({ x0: 0, x1: 10, y0: 0, y1: 40, z0: 0, z1: 20 }), 4.5);
});

test("SmartMates infer coincident faces and concentric cylinders, isolate hides the rest", () => {
  const mate = inferSmartMate(
    { componentId: "a", kind: "face", descriptor: { surface: "plane" } },
    { componentId: "b", kind: "face", descriptor: { surface: "plane" } },
  );
  assert.equal(mate.type, "coincident");
  const concentric = inferSmartMate(
    { componentId: "a", kind: "face", descriptor: { surface: "cylinder" } },
    { componentId: "b", kind: "face", descriptor: { surface: "cylinder" } },
  );
  assert.equal(concentric.type, "concentric");
  assert.equal(inferSmartMate({ componentId: "a", kind: "face" }, { componentId: "a", kind: "face" }), null);
  const vis = isolateVisibility([{ id: "a" }, { id: "b" }, { id: "c" }], ["b"]);
  assert.deepEqual(vis.map((row) => row.visible), [false, true, false]);
  assert.deepEqual(hiddenAfterIsolate([{ id: "a" }, { id: "b" }], ["a"]), ["b"]);
});

test("parametric rollback sits between history nodes", () => {
  const doc = { history: [{ id: "h1" }, { id: "h2" }, { id: "h3" }] };
  assert.equal(setHistoryRollback(doc, 1), 1);
  assert.equal(historyEntryRolled(doc, 0), false);
  assert.equal(historyEntryRolled(doc, 1), true);
  assert.equal(setHistoryRollback(doc, null), 3);
  assert.equal(doc.rollbackIndex, null);
  assert.equal(featureHistoryIndex([{ kind: "sketch", targetId: "s" }, { kind: "feature", targetId: "f" }], "f"), 1);
});

test("an Instant3D handle only appears where it has something to hold on to", () => {
  // no fallback to the world origin: an arrow in the middle of the view with no
  // edge or face under it could not do anything
  assert.doesNotMatch(modelerSource, /filletHandlePose\(origin,/);
  assert.match(modelerSource, /var wantKind = type === "shell" \? "face" : "edge"/);
  assert.match(modelerSource, /function finishFeatureTargets/);
  assert.match(modelerSource, /if \(reference && selectedSolid\(\)\) \{/);
  // sized in screen pixels, so the arrow is never a hairline to grab
  assert.match(modelerSource, /var perPixel = instant3dScale\(E\.pv\);/);
  assert.match(modelerSource, /pose\.length = 82 \* perPixel;/);
  assert.match(modelerSource, /function instant3dScale\(view\)/);
  assert.match(modelerSource, /worldPerPixel/);
  // hovering the arrow says so, rather than silently starting an orbit
  assert.match(modelerSource, /canvas\.style\.cursor = overHandle \? "grab" : "";/);
});
