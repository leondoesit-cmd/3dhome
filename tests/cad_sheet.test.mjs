/* The drawing sheet: projection, paper, and the drafting table.
 *
 * These are the rules a drawing is read by — a hidden edge is dashed, a
 * cylinder is one outline and not 32 chords, the top view sits above the front
 * one in third angle and below it in first, a section removes the half between
 * the reader and the cut — so they are pinned here rather than left to the eye.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  consolidateSegments, cropProjection, projectSolid, sectionBodies, viewAxes, viewBasis, viewForSight,
} from "../js/core/hidden_line.js";
import { polygonArea, tessellatePart, tessellateParts, triangulatePolygon } from "../js/core/part_tessellate.js";
import {
  STANDARD_SCALES, buildSheetScene, chainLoops, createProjector, createSheetDoc, createView,
  ensureSheetDoc, formatLength, hatchLoops, layoutViews, measureDim, removeViewFromSheet,
  scaleLabel, sceneToSvg,
} from "../js/cad_sheet.js";
import { createDrawingController } from "../js/modeler_drawing.js";

const BOX = { kind: "box", x0: -10, x1: 10, y0: 0, y1: 20, z0: -5, z1: 5 };
const bodies = (...parts) => tessellateParts(parts);

/* ---- projection --------------------------------------------------------- */

test("a box front view is four visible lines and nothing dashed", () => {
  const projection = projectSolid(bodies(BOX), "front");
  assert.equal(projection.visible.length, 4);
  assert.equal(projection.hidden.length, 0, "the back face lies exactly under the front one");
  assert.deepEqual(
    { u0: projection.bounds.u0, u1: projection.bounds.u1, v0: projection.bounds.v0, v1: projection.bounds.v1 },
    { u0: -10, u1: 10, v0: 0, v1: 20 });
});

test("an edge the body covers is dashed, not dropped and not solid", () => {
  const behind = { kind: "box", x0: -3, x1: 3, y0: 5, y1: 15, z0: -9, z1: -6 };
  const projection = projectSolid(bodies(BOX, behind), "front");
  assert.equal(projection.visible.length, 4, "only the front box is seen");
  assert.equal(projection.hidden.length, 4, "the box behind it survives as hidden lines");
  const dashed = projection.hidden[0];
  assert.ok(Math.abs(dashed.a.u) <= 3.001 && Math.abs(dashed.b.u) <= 3.001);
});

test("a cylinder is an outline and a smooth circle, not one chord per facet", () => {
  const cylinder = { kind: "cyl", x: 0, y: 0, z: 0, r: 5, h: 12 };
  const front = projectSolid(bodies(cylinder), "front");
  assert.equal(front.visible.length, 4, "two silhouettes and two rims seen edge-on");
  const top = projectSolid(bodies(cylinder), "top");
  const drawn = top.circles.filter((circle) => circle.drawn === "visible");
  assert.equal(drawn.length, 1);
  assert.ok(Math.abs(drawn[0].radius - 5) < 0.2);
  assert.equal(top.visible.length, 0, "the chords were withdrawn in favour of the circle");
});

test("consolidation merges collinear runs and never dashes under a solid line", () => {
  const visible = [
    { a: { u: 0, v: 0 }, b: { u: 5, v: 0 } },
    { a: { u: 5, v: 0 }, b: { u: 10, v: 0 } },
  ];
  const hidden = [{ a: { u: 1, v: 0 }, b: { u: 4, v: 0 } }];
  const merged = consolidateSegments(visible, hidden, 0.01);
  assert.equal(merged.visible.length, 1, "two collinear touching spans are one line");
  assert.equal(merged.hidden.length, 0, "a hidden line beneath a visible one is not drawn");
});

test("standard views map the world axes the way third-angle projection needs", () => {
  assert.deepEqual(viewAxes("front").horizontal, { axis: "x", sign: 1 });
  assert.deepEqual(viewAxes("front").vertical, { axis: "y", sign: 1 });
  assert.deepEqual(viewAxes("top").vertical, { axis: "z", sign: -1 }, "the far side of a top view is up the page");
  assert.deepEqual(viewAxes("right").horizontal, { axis: "z", sign: -1 });
  assert.equal(viewForSight(viewBasis("front").right), "left", "looking along +X is the left view");
});

/* ---- sections and details ------------------------------------------------ */

test("a section removes the half in front of the plane and reports the cut", () => {
  const cut = sectionBodies(bodies(BOX), { normal: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 } });
  assert.ok(cut.bodies.length);
  const kept = cut.bodies[0].positions;
  for (let i = 2; i < kept.length; i += 3) assert.ok(kept[i] <= 1e-6, "nothing survives in front of the plane");
  assert.ok(cut.cuts.length >= 4, "the plane carved a closed outline");
  const loops = chainLoops(cut.cuts.map((edge) => ({
    a: { u: edge.a.x, v: edge.a.y }, b: { u: edge.b.x, v: edge.b.y },
  })), 1e-3);
  assert.ok(loops.length >= 1);
  assert.ok(hatchLoops(loops.map((loop) => loop.map((point) => ({ x: point.u, y: point.v })))).length > 0,
    "a cut face is hatched");
});

test("a detail crops its parent to the callout bubble", () => {
  const projection = projectSolid(bodies(BOX), "front");
  const detail = cropProjection(projection, { u: -10, v: 0, radius: 4 });
  assert.deepEqual(detail.bounds, { u0: -14, u1: -6, v0: -4, v1: 4 });
  for (const segment of detail.visible) {
    assert.ok(Math.hypot(segment.a.u + 10, segment.a.v) <= 4.001);
    assert.ok(Math.hypot(segment.b.u + 10, segment.b.v) <= 4.001);
  }
});

/* ---- tessellation -------------------------------------------------------- */

test("an extrusion's hole survives to the drawing as a hole", () => {
  const ring = (radius, count = 24) => Array.from({ length: count }, (unused, i) => ({
    u: Math.cos((i / count) * Math.PI * 2) * radius,
    v: Math.sin((i / count) * Math.PI * 2) * radius,
  }));
  const plate = {
    kind: "ext", axis: "z", from: 0, to: 2,
    pts: [{ u: -10, v: -10 }, { u: 10, v: -10 }, { u: 10, v: 10 }, { u: -10, v: 10 }],
    holes: [ring(3)],
  };
  const projection = projectSolid(bodies(plate), "front");
  const round = projection.circles.filter((circle) => circle.kind === "round" && circle.visible);
  assert.ok(round.length >= 1, "the bore is recognised as a circle");
  assert.ok(Math.abs(round[0].radius - 3) < 0.2);
});

test("polygon triangulation keeps the winding the projector relies on", () => {
  const square = [{ u: 0, v: 0 }, { u: 4, v: 0 }, { u: 4, v: 4 }, { u: 0, v: 4 }];
  assert.ok(polygonArea(square) > 0);
  assert.equal(triangulatePolygon(square).length, 2);
  assert.equal(triangulatePolygon(square.slice().reverse()).length, 2, "a clockwise loop is corrected, not refused");
  assert.equal(tessellatePart({ kind: "loft" }), null, "a kind with no geometry contributes nothing");
});

/* ---- the sheet ----------------------------------------------------------- */

function sheetWith(views, options = {}) {
  const doc = createSheetDoc(Object.assign({ views }, options));
  const project = createProjector(doc, bodies(BOX));
  return { doc, scene: buildSheetScene(doc, { projection: project }) };
}

test("third angle puts the top view above the front, first angle below it", () => {
  const third = sheetWith(["front", "top"]);
  const [front, top] = third.scene.views;
  assert.ok(top.y < front.y, "third angle: the top view is above");
  assert.equal(top.align, "vertical");
  const first = sheetWith(["front", "top"], { projection: "first" });
  assert.ok(first.scene.views[1].y > first.scene.views[0].y, "first angle: the top view is below");
});

test("an aligned view keeps its projection line however it is placed", () => {
  const doc = createSheetDoc({ views: ["front", "right"] });
  const project = createProjector(doc, bodies(BOX));
  const extents = new Map(doc.views.map((view) => {
    const projection = project(view);
    return [view.id, { w: projection.bounds.u1 - projection.bounds.u0, h: projection.bounds.v1 - projection.bounds.v0 }];
  }));
  doc.views[1].x = 260;
  doc.views[1].y = 12;                        // off the projection line: not allowed
  const layout = layoutViews(doc, extents);
  const front = layout.placements.get(doc.views[0].id);
  const right = layout.placements.get(doc.views[1].id);
  assert.equal(right.y, front.y, "a horizontally aligned view shares the front view's centre line");
  assert.equal(right.x, 260, "and is free along its own axis");
});

test("the sheet scale is one of the standard ones, and it fits the paper", () => {
  const { scene } = sheetWith(["front", "top", "right"]);
  assert.ok(STANDARD_SCALES.some((scale) => scaleLabel(scale) === scaleLabel(scene.scale)));
  for (const place of scene.views) {
    assert.ok(place.box.x >= scene.frame.x0 - 1 && place.box.x + place.box.w <= scene.frame.x1 + 1);
    assert.ok(place.box.y >= scene.frame.y0 - 1 && place.box.y + place.box.h <= scene.frame.y1 + 1);
  }
});

test("dimensions measure the projection and format in the sheet's units", () => {
  const dim = { type: "horizontal", refs: [{ u: -10, v: 0 }, { u: 10, v: 0 }] };
  assert.equal(measureDim(dim), 20);
  assert.equal(formatLength(20, { units: "mm" }), "200");
  assert.equal(formatLength(20, { units: "cm" }), "20");
  assert.equal(formatLength(2.54, { units: "in" }), "1");
  assert.equal(measureDim({ type: "diameter", radius: 3 }), 6);
  assert.equal(measureDim({ type: "angle", refs: [{ u: 1, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 1 }] }), 90);
});

test("the SVG is the same scene at real paper size, with ISO line weights", () => {
  const { scene } = sheetWith(["front", "top", "right", "iso"]);
  const svg = sceneToSvg(scene);
  assert.match(svg, /width="420mm" height="297mm"/);
  assert.match(svg, /stroke-width="0.5"/, "visible outlines");
  assert.match(svg, /THIRD ANGLE/);
  assert.match(svg, />FRONT</);
});

/* ---- the drafting table -------------------------------------------------- */

function table(def) {
  const document = def || { name: "Bracket", parts: [BOX] };
  const host = {
    canvas: () => ({}), width: () => 900, height: () => 600,
    doc: () => ensureSheetDoc(document),
    bodies: () => tessellateParts(document.parts),
    bodiesToken: () => 1,
    pushUndo: () => {}, markDirty: () => {}, flash: () => {}, refresh: () => {},
    t: (key) => key, prompt: async () => null, editTitleBlock: () => {},
  };
  ensureSheetDoc(document);
  return { controller: createDrawingController(host), document };
}

test("a sheet opens with the standard views and can gain and lose one", () => {
  const { controller, document } = table();
  assert.equal(document.drawing.views.length, 4);
  const available = controller.availableViews();
  assert.ok(available.includes("left"));
  controller.addView("left");
  assert.equal(document.drawing.views.length, 5);
  controller.select({ kind: "view", id: document.drawing.views[4].id });
  assert.equal(controller.deleteSelection(), true);
  assert.equal(document.drawing.views.length, 4);
});

test("the sheet keeps one view: the last principal one cannot be deleted", () => {
  const { controller, document } = table();
  const doc = document.drawing;
  for (const view of doc.views.slice(1)) removeViewFromSheet(doc, view.id);
  controller.select({ kind: "view", id: doc.views[0].id });
  controller.deleteSelection();
  assert.equal(doc.views.length, 1, "a drawing with no views is not a drawing");
});

test("sheet setup writes the document the model saves with", () => {
  const { controller, document } = table();
  controller.setSheetOption("size", "A4");
  controller.setSheetOption("projection", "first");
  controller.setSheetOption("units", "cm");
  controller.setSheetOption("showHidden", false);
  assert.deepEqual(
    { size: document.drawing.size, projection: document.drawing.projection, units: document.drawing.units, hidden: document.drawing.showHidden },
    { size: "A4", projection: "first", units: "cm", hidden: false });
  const status = controller.status();
  assert.equal(status.units, "cm");
  assert.equal(status.projection, "first");
});

test("automatic overall dimensions land on the primary view and measure it", () => {
  const { controller, document } = table();
  controller.autoDimension(true);
  const dims = document.drawing.dims;
  assert.equal(dims.length, 2);
  assert.equal(measureDim(dims[0]), 20, "the width of the box");
  assert.equal(measureDim(dims[1]), 20, "and its height");
  controller.autoDimension(true);
  assert.equal(document.drawing.dims.length, 2, "re-running replaces its own dimensions rather than stacking them");
});

test("a stored sheet is what the exporter draws, not a fresh one", () => {
  const { controller, document } = table();
  controller.setSheetOption("size", "A4");
  const svg = controller.svg();
  assert.match(svg, /width="297mm" height="210mm"/);
  assert.equal(createView("front").x, null, "a new view has no position until the layout gives it one");
});
