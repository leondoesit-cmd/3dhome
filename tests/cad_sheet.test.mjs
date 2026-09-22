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
  STANDARD_SCALES, addViewToSheet, buildSheetScene, chainLoops, createProjector, createSheetDoc, createView,
  ensureSheetDoc, formatLength, hatchLoops, layoutViews, measureDim, removeViewFromSheet,
  scaleLabel, sceneToSvg, titleBlockBox,
} from "../js/cad_sheet.js";
import { createDrawingController } from "../js/modeler_drawing.js";
import { createDrawingSvg } from "../js/cad_drawings.js";
import { topologyForFeature } from "../js/core/topology.js";
import { calloutText, calloutTextById, holeCallouts } from "../js/core/hole_callout.js";

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

function overlappingViewLabels(scene, gap = 2) {
  const hits = [];
  for (let i = 0; i < scene.views.length; i++) {
    for (let j = i + 1; j < scene.views.length; j++) {
      const a = scene.views[i].box, b = scene.views[j].box;
      const overlap = a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
        a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
      if (overlap) hits.push(scene.views[i].view.label + " × " + scene.views[j].view.label);
    }
  }
  return hits;
}

test("pictorials and sections pack beside the principals instead of stacking on them", () => {
  const doc = createSheetDoc({ views: ["front", "top", "right", "iso"] });
  const front = doc.views[0];
  addViewToSheet(doc, "front", { label: "SECTION A-A", parent: front.id, section: { axis: "vertical", at: 0, from: front.id, tag: "A" } });
  addViewToSheet(doc, "right", { label: "SECTION B-B", parent: front.id, section: { axis: "horizontal", at: 0, from: front.id, tag: "B" } });
  addViewToSheet(doc, "top", { label: "SECTION C-C", parent: front.id, section: { axis: "vertical", at: 4, from: front.id, tag: "C" } });
  const project = createProjector(doc, bodies(BOX));
  const scene = buildSheetScene(doc, { projection: project });
  assert.equal(scene.views.length, 7);
  assert.deepEqual(overlappingViewLabels(scene), [], "every view keeps its own paper");
  const placed = Object.fromEntries(scene.views.map((place) => [place.view.label, place]));
  assert.ok(placed.ISOMETRIC.x > placed.FRONT.x, "the isometric sits to the right of the front view");
  assert.ok(placed["SECTION A-A"].x !== placed["SECTION B-B"].x || placed["SECTION A-A"].y !== placed["SECTION B-B"].y);
});

test("eight views with four sections fit on sheet without overlapping or colliding with title block", () => {
  const CYL = { kind: "cyl", x: 0, y: 0, z: 0, r: 5.36, h: 11.3 };
  const doc = createSheetDoc({ views: ["front", "top", "right", "iso"], scale: "fit" });
  const front = doc.views[0];
  addViewToSheet(doc, "front", { label: "SECTION A-A", parent: front.id, section: { axis: "vertical", at: 0, from: front.id, tag: "A" } });
  addViewToSheet(doc, "right", { label: "SECTION B-B", parent: front.id, section: { axis: "horizontal", at: 0, from: front.id, tag: "B" } });
  addViewToSheet(doc, "top", { label: "SECTION C-C", parent: front.id, section: { axis: "vertical", at: 4, from: front.id, tag: "C" } });
  addViewToSheet(doc, "front", { label: "SECTION D-D", parent: front.id, section: { axis: "vertical", at: -2, from: front.id, tag: "D" } });
  const project = createProjector(doc, tessellateParts([CYL]));
  const scene = buildSheetScene(doc, { projection: project });
  assert.equal(scene.views.length, 8);
  assert.deepEqual(overlappingViewLabels(scene), [], "no views overlap on eight-view sheet");
  const title = titleBlockBox(doc);
  for (const place of scene.views) {
    const a = place.box, b = title;
    const collides = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    assert.equal(collides, false, `${place.view.label} must not collide with title block`);
  }
});

test("forced scale places all views without crash or title block overlap", () => {
  const CYL = { kind: "cyl", x: 0, y: 0, z: 0, r: 5.36, h: 11.3 };
  const doc = createSheetDoc({ views: ["front", "top", "right", "iso"], scale: [1, 1] });
  const front = doc.views[0];
  addViewToSheet(doc, "front", { label: "SECTION A-A", parent: front.id, section: { axis: "vertical", at: 0, from: front.id, tag: "A" } });
  addViewToSheet(doc, "right", { label: "SECTION B-B", parent: front.id, section: { axis: "horizontal", at: 0, from: front.id, tag: "B" } });
  addViewToSheet(doc, "top", { label: "SECTION C-C", parent: front.id, section: { axis: "vertical", at: 4, from: front.id, tag: "C" } });
  addViewToSheet(doc, "front", { label: "SECTION D-D", parent: front.id, section: { axis: "vertical", at: -2, from: front.id, tag: "D" } });
  const project = createProjector(doc, tessellateParts([CYL]));
  const scene = buildSheetScene(doc, { projection: project });
  assert.equal(scene.views.length, 8);
  const title = titleBlockBox(doc);
  for (const place of scene.views) {
    const a = place.box, b = title;
    const collides = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    assert.equal(collides, false, `${place.view.label} must not collide with title block even at 1:1 scale`);
  }
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

/* The editor names a part's geometry with topologyForFeature (see
   topologyEntriesForPart in modeler.js); the sheet only ever sees the result,
   so the table can produce it directly. */
function partTopology(part) {
  const feature = { id: "feature:part:" + (part.id || "p") };
  if (part.kind === "box") return topologyForFeature({ ...feature, type: "box" }, part);
  if (part.kind === "ext") {
    return topologyForFeature({ ...feature, type: "extrude" },
      { axis: part.axis, frame: part.frame, from: part.from, to: part.to, points: part.pts });
  }
  return [];
}

function table(def, options = {}) {
  const document = def || { name: "Bracket", parts: [BOX] };
  const table = {
    token: 1,
    topology: options.topology === false ? () => null
      : () => document.parts.flatMap(partTopology),
  };
  /* The editor's history, reduced to what the sheet is allowed to ask of it:
     push a step, or open one (begin) and then name it (commit) or drop it
     (cancel). Snapshots are of the drawing document alone, which is all the
     sheet can touch. */
  const steps = [];
  let pending = null;
  const snapshot = () => JSON.stringify(document.drawing);
  const host = {
    canvas: () => ({}), width: () => 900, height: () => 600,
    doc: () => ensureSheetDoc(document),
    bodies: () => tessellateParts(document.parts),
    topology: () => table.topology(),
    bodiesToken: () => table.token,
    pushUndo: (label) => { pending = null; steps.push({ label, snap: snapshot() }); },
    beginUndo: (label) => { pending = { label, snap: snapshot() }; },
    commitUndo: (label) => { if (pending) steps.push({ label: label || pending.label, snap: pending.snap }); pending = null; },
    cancelUndo: () => { pending = null; },
    markDirty: () => {}, flash: () => {}, refresh: () => {},
    t: (key) => key, prompt: async () => null, editTitleBlock: () => {},
    /* The editor's one-form-many-fields dialog (sheetForm in modeler.js), which
       is a promise because a native prompt froze the WebGPU viewport. */
    promptFields: async (title, fields) => (table.reply ? table.reply(title, fields) : null),
    /* The feature tree, as the sheet is allowed to see it: what each live hole
       is called, re-read on every build (see core/hole_callout.js). */
    holeCallouts: () => holeCallouts(document).map((row) => ({ id: row.id, text: calloutText(row) })),
    callouts: () => calloutTextById(document),
  };
  table.steps = () => steps.map((step) => step.label);
  table.undo = () => {
    const step = steps.pop();
    if (!step) return null;
    document.drawing = JSON.parse(step.snap);
    table.controller.invalidate();
    return step.label;
  };
  ensureSheetDoc(document);
  table.controller = createDrawingController(host);
  /* What a rebuild is, from the sheet's side: the triangles changed. */
  table.rebuild = () => { table.token += 1; table.controller.invalidate(); };
  table.document = document;
  return table;
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

/* ---- associative dimensions ----------------------------------------------
 *
 * The point of the whole sheet: a dimension is anchored to named geometry, so
 * it rewrites itself when the model rebuilds — and when its reference is gone
 * it SAYS SO rather than quietly going on reading the old number.
 */

const PLATE = {
  id: "plate", kind: "ext", axis: "z", from: -5, to: 5,
  pts: [{ u: -10, v: 0 }, { u: 10, v: 0 }, { u: 10, v: 20 }, { u: -10, v: 20 }],
};
const plateDoc = () => ({ name: "Plate", parts: [{ ...PLATE, pts: PLATE.pts.map((p) => ({ ...p })) }] });

/* The depth edge of the plate, as the sheet's own binder would record it: the
   persistent id plus the point it projected to in the top view when it was
   placed. That point is the LAST KNOWN position, never the measurement. */
const depthRef = (at) => ({
  u: -10, v: at === "a" ? 5 : -5, pid: "feature:part:plate:edge:depth:1", kind: "edge", at,
});

function labelOf(controller, dimId) {
  const item = controller.scene().items
    .find((entry) => entry.dimId === dimId && entry.type === "text");
  return item ? item.text : null;
}

test("a dimension bound to a named edge rewrites itself when the model rebuilds", () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  doc.dims.push({
    id: "dDepth", viewId: top.id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  assert.equal(labelOf(rig.controller, "dDepth"), "100", "10 cm of depth, in sheet millimetres");

  rig.document.parts[0].to = 9;                     // the extrude gets deeper
  rig.rebuild();
  assert.equal(labelOf(rig.controller, "dDepth"), "140",
    "the dimension followed the model instead of freezing at its placed value");

  const svg = rig.controller.svg();
  assert.ok(svg.includes(">140<"), "the export reads what the canvas reads");
  assert.ok(!svg.includes(">100<"), "and nothing anywhere still says the old size");
});

test("a legacy dimension with no persistent ids keeps measuring exactly as it did", () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  /* What every sheet saved before this change carries: frozen view points. */
  doc.dims.push({
    id: "dOld", viewId: top.id, type: "vertical", offset: 12,
    refs: [{ u: -10, v: -5 }, { u: -10, v: 5 }],
  });
  assert.equal(labelOf(rig.controller, "dOld"), "100");
  rig.document.parts[0].to = 9;
  rig.rebuild();
  assert.equal(labelOf(rig.controller, "dOld"), "100",
    "an old sheet is never migrated behind the user's back, so it never changes");
  assert.deepEqual(rig.controller.status().dangling, [], "and it is not reported as broken either");
  assert.deepEqual(doc.dims[0].refs, [{ u: -10, v: -5 }, { u: -10, v: 5 }],
    "the stored document was not rewritten");
});

test("a dimension whose reference is gone dangles loudly instead of lying", () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  doc.dims.push({
    id: "dDepth", viewId: top.id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  assert.equal(labelOf(rig.controller, "dDepth"), "100");

  /* The feature that named this edge is deleted: the id resolves to nothing. */
  rig.document.parts[0].id = "plate2";
  rig.rebuild();
  assert.equal(labelOf(rig.controller, "dDepth"), "⚠ (100)",
    "the last known value, flagged and bracketed — never a bare number");
  const issues = rig.controller.status().dangling;
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0].missing, ["feature:part:plate:edge:depth:1", "feature:part:plate:edge:depth:1"]);
  const drawn = rig.controller.scene().items.filter((item) => item.dimId === "dDepth");
  assert.ok(drawn.some((item) => item.style === "dimLost"), "and it is drawn in the dangling style");
  assert.ok(rig.controller.svg().includes("⚠ (100)"), "the export says so too");
});

test("geometry nobody named — an up-to-body rib, a rotated moveBody — dangles, it does not drift", () => {
  /* Those two cases are deliberately unnamed (see topologyForFeature): a rib
     measured against the body it braces and a moveBody that turns about its
     centre of mass cannot be named by a pure function, so their faces resolve
     by extraction and their ids are regenerated on every build. A dimension on
     one must go dangling, NOT slide onto whatever came out closest. */
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  const generated = (ordinal) => ({
    u: 0, v: 5, pid: "feature:rib:1:edge:generated:line:" + ordinal, kind: "edge", at: "a",
  });
  const extraction = [
    { persistentId: "feature:rib:1:edge:generated:line:1", kind: "edge", semantic: "generated-1",
      descriptor: { curve: "line", origin: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, measure: 10 } },
  ];
  rig.topology = () => rig.document.parts.flatMap(partTopology).concat(extraction);
  doc.dims.push({
    id: "dRib", viewId: top.id, type: "vertical", offset: 20,
    refs: [generated(1), depthRef("b")],
  });
  const before = labelOf(rig.controller, "dRib");
  assert.ok(before && !before.startsWith("⚠"), "it reads as a real dimension while the id exists");

  /* The rebuild renumbers the generated names — the same geometry, a new id. */
  extraction[0].persistentId = "feature:rib:1:edge:generated:line:2";
  rig.rebuild();
  assert.equal(labelOf(rig.controller, "dRib"), "⚠ (" + before + ")",
    "an unnamed face's dimension dangles rather than rebinding to the renamed edge");
  assert.deepEqual(rig.controller.status().dangling[0].missing, ["feature:rib:1:edge:generated:line:1"]);
});

test("automatic overall sizes re-read the model, they do not need re-running", () => {
  const rig = table(plateDoc());
  rig.controller.autoDimension(true);
  const dims = rig.document.drawing.dims;
  assert.equal(dims.length, 2);
  assert.equal(labelOf(rig.controller, dims[0].id), "200", "the plate is 20 cm wide");

  rig.document.parts[0].pts[1].u = 20;
  rig.document.parts[0].pts[2].u = 20;
  rig.rebuild();
  assert.equal(labelOf(rig.controller, dims[0].id), "300",
    "the overall size followed the rebuild without anyone clicking Auto Dimension");
});

test("a bound dimension survives the save/load round trip the model takes", () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  doc.dims.push({
    id: "dDepth", viewId: doc.views[0].id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  const reopened = JSON.parse(JSON.stringify(rig.document));
  ensureSheetDoc(reopened);
  assert.deepEqual(reopened.drawing.dims[0].refs, [depthRef("a"), depthRef("b")],
    "the persistent ids are still there after a serialize/parse/ensure cycle");
});

test("with no topology offered at all, a bound dimension freezes rather than crying wolf", () => {
  const rig = table(plateDoc(), { topology: false });
  const doc = rig.document.drawing;
  doc.dims.push({
    id: "dDepth", viewId: doc.views[0].id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  assert.deepEqual(rig.controller.status().dangling, [],
    "absent information is not a lost reference");
});

test("placing a dimension on the drafting table binds it to what was clicked", () => {
  const rig = table(plateDoc());
  const controller = rig.controller;
  controller.fit();
  const front = controller.scene().views.find((place) => place.view.dir === "front");
  const screen = (u, v) => {
    const at = front.toSheet({ u, v });
    return [at.x * controller.state.zoom + controller.state.ox, at.y * controller.state.zoom + controller.state.oy];
  };
  controller.setTool("dim");
  controller.pointerDown({ button: 0 }, ...screen(-10, 20));
  controller.pointerDown({ button: 0 }, ...screen(10, 20));
  controller.pointerMove({ button: 0 }, ...screen(0, 26));
  controller.pointerDown({ button: 0 }, ...screen(0, 26));

  const dim = rig.document.drawing.dims[0];
  assert.ok(dim, "a dimension was placed");
  assert.ok(dim.refs.every((ref) => ref.pid), "both picks bound to named edges");
  assert.equal(labelOf(controller, dim.id), "200");

  rig.document.parts[0].pts[1].u = 20;
  rig.document.parts[0].pts[2].u = 20;
  rig.rebuild();
  assert.equal(labelOf(controller, dim.id), "300", "and it followed the widened profile");
});

test("exact semicircular edges support associative radius dimensions", () => {
  const rig=table({parts:[{...BOX,x0:-2,x1:2,y0:-2,y1:2}]});
  rig.topology=()=>[{persistentId:"slot:end",kind:"edge",descriptor:{curve:"circle",radius:2,measure:2*Math.PI,origin:{x:0,y:0,z:0},axis:{x:0,y:0,z:1},endpoints:[{x:0,y:-2,z:0},{x:0,y:2,z:0}],arcMidpoint:{x:-2,y:0,z:0}}}];
  const c=rig.controller;c.fit();
  const at=clicker(c);
  c.setTool("diam");
  c.pointerDown({button:0},...at(2,0));
  assert.equal(rig.document.drawing.dims.length,0,"the absent half of the circle cannot be picked");
  c.pointerDown({button:0},...at(-2,0));
  const dim=rig.document.drawing.dims[0];
  assert.equal(dim.type,"radius");assert.equal(dim.refs[0].pid,"slot:end");
  assert.equal(labelOf(c,dim.id),"R20");
});

test("concentric diameter picks bind to their own rim and survive rebuild", () => {
  const ring = (r) => Array.from({ length: 64 }, (_, i) => ({ u: r * Math.cos(i * Math.PI / 32), v: r * Math.sin(i * Math.PI / 32) }));
  const rig = table({ parts: [{ kind: "ext", axis: "z", from: 0, to: .635, pts: ring(.55626), holes: [ring(.23876)] }] });
  rig.topology = () => [.23876, .55626].map((radius, i) => ({
    persistentId: "rim:" + i, kind: "edge",
    descriptor: { curve: "circle", radius, origin: { x: 0, y: 0, z: .635 }, axis: { x: 0, y: 0, z: 1 } },
  }));
  const controller = rig.controller;
  controller.fit();
  const front = controller.scene().views.find((place) => place.view.dir === "front");
  for (const radius of [.55626, .23876]) {
    const at = front.toSheet({ u: 0, v: -radius });
    controller.setTool("diam");
    controller.pointerDown({ button: 0 }, at.x * controller.state.zoom + controller.state.ox, at.y * controller.state.zoom + controller.state.oy);
  }
  const dims = rig.document.drawing.dims;
  assert.equal(dims.length, 2);
  assert.deepEqual(dims.map((dim) => dim.refs[0].pid), ["rim:1", "rim:0"]);
  rig.rebuild();
  assert.equal(labelOf(controller, dims[0].id), "⌀11.1");
  assert.equal(labelOf(controller, dims[1].id), "⌀4.8");
});

/* ---- layout drags are edits ---------------------------------------------- */

/* Dragging a view, a dimension or a note used to mutate the document on every
   pointermove and never open a step, so the sheet had undo for everything you
   CREATED and none for anything you MOVED — one Ctrl+Z after nudging a view
   threw away the dimension you placed before it. One gesture is one step now:
   opened while the paper is untouched, named on pointerup, dropped when the
   gesture put everything back. */

function drafting(doc) {
  const rig = table(doc);
  rig.controller.fit();
  rig.controller.autoDimension(true);    // the two overall sizes a real sheet opens with
  return rig;
}

/* Sheet millimetres -> the canvas pixels the controller is driven in. */
const pixels = (controller, point) => [
  point.x * controller.state.zoom + controller.state.ox,
  point.y * controller.state.zoom + controller.state.oy,
];

function dragBy(controller, from, dx, dy, { escape = false } = {}) {
  const to = { x: from.x + dx, y: from.y + dy };
  controller.pointerDown({ button: 0 }, ...pixels(controller, from));
  controller.pointerMove({ button: 0 }, ...pixels(controller, to));
  if (escape) { controller.keyDown({ key: "Escape" }); return; }
  controller.pointerUp({ button: 0 }, ...pixels(controller, to));
}

const near = (value, want, what) =>
  assert.ok(Math.abs(value - want) < 1e-6, what + ": " + value + " is not " + want);

const noteAt = (doc, x, y) => {
  const note = { id: "nDrag", text: "SHARP EDGES", x, y };
  doc.notes.push(note);
  return note;
};

const itemFor = (controller, key, id, type) =>
  controller.scene().items.find((item) => item[key] === id && item.type === type);

/* Where a horizontal dimension's own line sits, which is what a user grabs.
   Pressing anywhere else on it is a legitimate drag too, but the offset is
   recomputed from the pointer rather than nudged, so the arithmetic below would
   be measuring the press point rather than the movement. */
function dimLineAt(controller, dim) {
  const built = controller.scene();
  const place = built.views.find((entry) => entry.id === dim.viewId);
  const shown = built.dims.get(dim.id).dim;
  const a = place.toSheet(shown.refs[0]), b = place.toSheet(shown.refs[1]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - dim.offset };
}

test("a dragged view is one undo step, and undo puts it back", () => {
  const rig = drafting();
  const controller = rig.controller;
  const place = controller.scene().views.find((entry) => entry.view.dir === "front");
  const before = { x: place.x, y: place.y };
  /* ensureSheetDoc rebuilds every view object on each read, so a view is looked
     up fresh rather than held. */
  const stored = () => rig.document.drawing.views.find((view) => view.id === place.id);
  assert.equal(stored().x, null, "an undragged view carries no pinned position");

  dragBy(controller, { x: place.box.x + place.box.w / 2, y: place.box.y + place.box.h / 2 }, 24, -9);
  near(stored().x, before.x + 24, "the view moved with the pointer");
  near(stored().y, before.y - 9, "on both axes, since the primary view is free");
  assert.deepEqual(rig.steps(), ["opMoveView"], "one step for the whole gesture, not one per move");

  assert.equal(rig.undo(), "opMoveView");
  const back = rig.document.drawing.views.find((view) => view.id === place.id);
  assert.equal(back.x, null, "undo restores the document as it was, null and all");
  assert.equal(back.y, null);
});

test("a dragged dimension and a dragged note are each one undo step", () => {
  const rig = drafting();
  const controller = rig.controller;
  const doc = rig.document.drawing;
  const note = noteAt(doc, 30, 40);
  controller.invalidate();

  const dim = doc.dims[0];
  const wasOffset = dim.offset;
  dragBy(controller, dimLineAt(controller, dim), 0, -7);
  near(dim.offset, wasOffset + 7, "a horizontal dimension's offset is measured up from the model");

  const label = itemFor(controller, "noteId", note.id, "text");
  dragBy(controller, { x: label.x + 2, y: label.y - label.size * 0.4 }, 12, 5);
  near(note.x, 42, "the note followed the pointer");
  near(note.y, 45);

  assert.deepEqual(rig.steps(), ["opMoveDim", "opMoveNote"]);
  assert.equal(rig.undo(), "opMoveNote");
  const afterNoteUndo = rig.document.drawing;
  assert.deepEqual(
    [afterNoteUndo.notes[0].x, afterNoteUndo.notes[0].y], [30, 40], "undo puts the note back");
  near(afterNoteUndo.dims[0].offset, wasOffset + 7, "and leaves the dimension where the earlier step left it");
  assert.equal(rig.undo(), "opMoveDim");
  near(rig.document.drawing.dims[0].offset, wasOffset, "the second undo unwinds the dimension");
});

test("Escape during a drag puts the thing back and leaves no step behind", () => {
  const rig = drafting();
  const controller = rig.controller;
  const doc = rig.document.drawing;
  const note = noteAt(doc, 30, 40);
  controller.invalidate();

  const place = controller.scene().views.find((entry) => entry.view.dir === "front");
  const stored = () => rig.document.drawing.views.find((view) => view.id === place.id);
  dragBy(controller, { x: place.box.x + place.box.w / 2, y: place.box.y + place.box.h / 2 }, 40, 25, { escape: true });
  assert.equal(stored().x, null, "the view never moved");
  assert.equal(stored().y, null);

  const dim = doc.dims[0], wasOffset = dim.offset;
  dragBy(controller, dimLineAt(controller, dim), 0, -14, { escape: true });
  assert.equal(dim.offset, wasOffset, "the dimension never moved");

  const label = itemFor(controller, "noteId", note.id, "text");
  dragBy(controller, { x: label.x + 2, y: label.y - label.size * 0.4 }, -20, 30, { escape: true });
  assert.deepEqual([note.x, note.y], [30, 40], "the note never moved");

  assert.deepEqual(rig.steps(), [], "three abandoned gestures, no undo entries");
});

test("a click that never became a drag is not an edit", () => {
  const rig = drafting();
  const controller = rig.controller;
  const place = controller.scene().views.find((entry) => entry.view.dir === "front");
  const centre = { x: place.box.x + place.box.w / 2, y: place.box.y + place.box.h / 2 };
  controller.pointerDown({ button: 0 }, ...pixels(controller, centre));
  controller.pointerUp({ button: 0 }, ...pixels(controller, centre));
  assert.deepEqual(controller.selection(), { kind: "view", id: place.id }, "it selected, which is what a click is for");
  assert.deepEqual(rig.steps(), [], "and left no no-op step in the history");
  assert.equal(rig.document.drawing.views.find((view) => view.id === place.id).x, null,
    "nor pinned the view where the layout happened to put it");
});

/* ---- angle dimensions ----------------------------------------------------
 *
 * measureDim could always compute an angle and dimensionItems could always
 * draw one; there was no way to PLACE one. Three picks — an arm, the corner,
 * the other arm — and each of the three binds on its own, so an angle that
 * opens up when the profile changes reads the new angle.
 */

/* A right-angled plate whose sloped corner opens when the tall side grows. */
const WEDGE = {
  id: "wedge", kind: "ext", axis: "z", from: -5, to: 5,
  pts: [{ u: -10, v: 0 }, { u: 10, v: 0 }, { u: -10, v: 20 }],
};
const wedgeDoc = () => ({ name: "Wedge", parts: [{ ...WEDGE, pts: WEDGE.pts.map((p) => ({ ...p })) }] });

/* Sheet millimetres of a point in one view -> the canvas pixels a click lands
   in, which is the only way into the controller's pointer handlers. */
function clicker(controller, dir = "front") {
  controller.fit();
  const place = controller.scene().views.find((entry) => entry.view.dir === dir);
  return (u, v) => {
    const at = place.toSheet({ u, v });
    return [at.x * controller.state.zoom + controller.state.ox, at.y * controller.state.zoom + controller.state.oy];
  };
}

test("an angle dimension is placed with three picks and every pick binds", () => {
  const rig = table(wedgeDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("angle");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));    // one arm
  controller.pointerDown({ button: 0 }, ...at(10, 0));     // the corner
  controller.pointerDown({ button: 0 }, ...at(-10, 20));   // the other arm

  const dim = rig.document.drawing.dims[0];
  assert.ok(dim, "an angle dimension was placed");
  assert.equal(dim.type, "angle");
  assert.equal(dim.refs.length, 3);
  assert.ok(dim.refs.every((ref) => ref.pid), "all three picks bound to named geometry");
  assert.equal(labelOf(controller, dim.id), "45°");

  rig.document.parts[0].pts[2].v = 40;                     // the slope steepens
  rig.rebuild();
  assert.equal(labelOf(controller, dim.id), "63.4°",
    "the angle followed the rebuilt profile instead of freezing at 45");
});

test("an angle dimension whose corner is gone dangles instead of holding its number", () => {
  const rig = table(wedgeDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("angle");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));
  controller.pointerDown({ button: 0 }, ...at(10, 0));
  controller.pointerDown({ button: 0 }, ...at(-10, 20));
  const dim = rig.document.drawing.dims[0];
  assert.equal(labelOf(controller, dim.id), "45°");

  rig.document.parts[0].id = "wedge2";                     // every id is renamed
  rig.rebuild();
  assert.equal(labelOf(controller, dim.id), "⚠ (45°)",
    "the last known angle, bracketed and flagged");
  assert.equal(controller.status().dangling.length, 1);
});

test("a part-picked angle is abandoned by Escape and leaves nothing behind", () => {
  const rig = table(wedgeDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("angle");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));
  controller.pointerDown({ button: 0 }, ...at(10, 0));
  assert.equal(controller.state.draft?.refs.length, 2, "two of the three picks are in hand");
  assert.equal(controller.keyDown({ key: "Escape" }), true);
  assert.equal(rig.document.drawing.dims.length, 0, "no half-placed dimension was written");
  assert.equal(rig.steps().length, 0, "and no undo step was opened for it");
});

test("an angle dimension round-trips the save the model takes", () => {
  const rig = table(wedgeDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("angle");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));
  controller.pointerDown({ button: 0 }, ...at(10, 0));
  controller.pointerDown({ button: 0 }, ...at(-10, 20));
  const stored = rig.document.drawing.dims[0];
  assert.equal(stored.type, "angle");
  const reopened = JSON.parse(JSON.stringify(rig.document));
  ensureSheetDoc(reopened);
  assert.deepEqual(reopened.drawing.dims[0], stored, "type, offset and all three bound refs survived");
});

/* ---- tolerances ----------------------------------------------------------
 *
 * dim.tolerance rendered as a suffix from the day the sheet was written and
 * nothing could set it. It is per-dimension and it OVERRIDES the title block's
 * general note for that one dimension, so the two must stay legible apart: the
 * general one prints once, above the title block; a specific one prints on the
 * dimension itself.
 */

test("a per-dimension tolerance is set from the dimension's own edit form", async () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  doc.dims.push({
    id: "dDepth", viewId: top.id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  assert.equal(labelOf(rig.controller, "dDepth"), "100");

  rig.reply = async (title, fields) => {
    assert.ok(fields.some((field) => field.key === "tolerance"), "the form offers a tolerance field");
    return { text: "", tolerance: "±0.1" };
  };
  await rig.controller.editDim("dDepth");
  assert.equal(doc.dims[0].tolerance, "±0.1");
  assert.equal(labelOf(rig.controller, "dDepth"), "100 ±0.1");
  assert.deepEqual(rig.steps(), ["opEditDim"], "one undo step for the edit");

  rig.document.parts[0].to = 9;
  rig.rebuild();
  assert.equal(labelOf(rig.controller, "dDepth"), "140 ±0.1",
    "the value still follows the model; the tolerance rides along with it");
  assert.ok(rig.controller.svg().includes("140 ±0.1"), "and the export says the same");
});

test("a tolerance stays on an overridden dimension text and survives the save", async () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  doc.dims.push({
    id: "dDepth", viewId: top.id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  rig.reply = async () => ({ text: "2×⌀5", tolerance: "H7" });
  await rig.controller.editDim("dDepth");
  assert.equal(labelOf(rig.controller, "dDepth"), "2×⌀5 H7",
    "overriding the number does not silently drop the tolerance beside it");

  const reopened = JSON.parse(JSON.stringify(rig.document));
  ensureSheetDoc(reopened);
  assert.equal(reopened.drawing.dims[0].tolerance, "H7", "the field is on the saved document");
  assert.equal(reopened.drawing.dims[0].text, "2×⌀5");
});

test("the general tolerance note and a per-dimension one are different things", () => {
  const rig = table(plateDoc());
  const doc = rig.document.drawing;
  doc.title.tolerance = "ISO 2768-m";
  const top = doc.views.find((view) => view.dir === "top") || doc.views[0];
  doc.dims.push({
    id: "dPlain", viewId: top.id, type: "vertical", offset: 12,
    refs: [depthRef("a"), depthRef("b")],
  });
  assert.equal(labelOf(rig.controller, "dPlain"), "100",
    "a dimension with no tolerance of its own carries no suffix — the general note covers it");
  const svg = rig.controller.svg();
  assert.ok(svg.includes("GENERAL TOL ISO 2768-m"), "the general note prints once, by the title block");
  assert.ok(!svg.includes("100 ISO 2768-m"), "and it is never stamped onto each dimension");
});

/* ---- hole callouts -------------------------------------------------------
 *
 * A callout is read off the feature tree, not typed: it names the hole feature
 * and its leader binds to that hole's own topology, so changing the wizard from
 * M6 to M8 changes the paper, and deleting the hole makes the callout say so.
 * The exporter (cad_drawings.js) spells it through the same module, so there is
 * one "M6×1 6H ↓12" in the codebase.
 */

/* What cutWallTopology emits for a hole: one cylindrical face per bore wall,
   named after the feature that cut it. */
const holeWall = (featureId, radius) => ({
  persistentId: featureId + ":face:hole:0:wall:0",
  kind: "face",
  semantic: "hole:0:wall:0",
  descriptor: { surface: "cylinder", origin: { x: 0, y: 10, z: 0 }, axis: { x: 0, y: 0, z: 1 }, radius },
});

function drilledDoc() {
  const doc = plateDoc();
  doc.features = [{
    id: "feature:hole1", type: "hole",
    params: { holeType: "tapped", standardSize: "M6", endCondition: "blind", depthMm: 12 },
  }];
  return doc;
}

function drilled() {
  const rig = table(drilledDoc());
  rig.topology = () => rig.document.parts.flatMap(partTopology).concat([holeWall("feature:hole1", 0.25)]);
  return rig;
}

const noteText = (controller, noteId) => {
  const item = controller.scene().items.find((entry) => entry.noteId === noteId && entry.type === "text");
  return item ? item.text : null;
};

test("a hole callout comes off the feature tree and follows the wizard", () => {
  const rig = drilled();
  rig.controller.fit();
  rig.controller.addHoleCallouts();
  const note = rig.document.drawing.notes[0];
  assert.ok(note, "a callout was placed");
  assert.equal(note.feature, "feature:hole1", "it names the hole, not a sentence");
  assert.equal(note.leader.pid, "feature:hole1:face:hole:0:wall:0", "and its leader binds to that hole's wall");
  assert.equal(noteText(rig.controller, note.id), "M6×1 6H ↓12");

  rig.document.features[0].params.standardSize = "M8";
  rig.rebuild();
  assert.equal(noteText(rig.controller, note.id), "M8×1.25 6H ↓12",
    "the callout re-read the hole rather than repeating what it said when placed");
});

test("a callout whose hole was deleted dangles instead of naming a hole that is gone", () => {
  const rig = drilled();
  rig.controller.fit();
  rig.controller.addHoleCallouts();
  const note = rig.document.drawing.notes[0];
  rig.document.features.length = 0;                   // the hole is removed
  rig.topology = () => rig.document.parts.flatMap(partTopology);
  rig.rebuild();
  assert.equal(noteText(rig.controller, note.id), "⚠ (M6×1 6H ↓12)",
    "the last thing that hole was called, flagged and bracketed");
  const issues = rig.controller.status().dangling;
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "note");
  assert.ok(rig.controller.scene().items.some((item) => item.noteId === note.id && item.style === "dimLost"),
    "and it is drawn in the dangling style");
});

test("callouts are placed once per hole, as one undo step, and round-trip", () => {
  const rig = drilled();
  rig.controller.fit();
  rig.controller.addHoleCallouts();
  rig.controller.addHoleCallouts();
  assert.equal(rig.document.drawing.notes.length, 1, "a second run does not stack a duplicate on the same hole");
  assert.deepEqual(rig.steps(), ["opAddCallout"], "and the run that added nothing opened no step");

  const reopened = JSON.parse(JSON.stringify(rig.document));
  ensureSheetDoc(reopened);
  const note = reopened.drawing.notes[0];
  assert.equal(note.feature, "feature:hole1");
  assert.equal(note.leader.pid, "feature:hole1:face:hole:0:wall:0");
  assert.equal(note.leader.at, "centre");
});

test("the exporter spells a callout the same way the drafting table does", () => {
  const rig = drilled();
  rig.controller.fit();
  rig.controller.addHoleCallouts();
  const onSheet = noteText(rig.controller, rig.document.drawing.notes[0].id);
  const exported = createDrawingSvg({ ...rig.document, drawing: null }, { holeCallouts: true, useStored: false });
  assert.ok(exported.includes(onSheet), "the same string, from the one module that writes it: " + onSheet);
});

/* ---- baseline and chain runs ---------------------------------------------
 *
 * A run of features is dimensioned from one datum (baseline) or end to end
 * (chain). Both used to mean placing one linear dimension at a time and then
 * dragging each clear of the last. Each member is a dimension in its own right
 * — it binds on its own and dangles on its own — and the stacking is the
 * sheet's own signed offset, not a second layout system.
 */

/* A stepped profile: three distinct u positions to run a dimension across. */
const STEP = {
  id: "step", kind: "ext", axis: "z", from: -5, to: 5,
  pts: [{ u: -10, v: 0 }, { u: 0, v: 0 }, { u: 0, v: 5 }, { u: 10, v: 5 }, { u: 10, v: 20 }, { u: -10, v: 20 }],
};
const stepDoc = () => ({ name: "Step", parts: [{ ...STEP, pts: STEP.pts.map((p) => ({ ...p })) }] });

const labels = (controller, dims) => dims.map((dim) => labelOf(controller, dim.id));

test("a baseline run measures every feature from one datum and stacks clear of itself", () => {
  const rig = table(stepDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("baseline");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));      // the datum
  controller.pointerDown({ button: 0 }, ...at(0, 0));
  controller.pointerDown({ button: 0 }, ...at(10, 5));

  const dims = rig.document.drawing.dims;
  assert.equal(dims.length, 2, "one dimension per feature, all from the datum");
  assert.deepEqual(labels(controller, dims), ["100", "200"]);
  assert.ok(dims.every((dim) => dim.refs.every((ref) => ref.pid)), "every member bound on its own");
  assert.deepEqual(dims.map((dim) => dim.offset), [-12, -20],
    "the second sits one step further out, on the sheet's own signed offset");
  assert.deepEqual(rig.steps(), ["opAddDimRun"], "the run is one undo step, not one per pick");

  rig.document.parts[0].pts[1].u = -4;
  rig.document.parts[0].pts[2].u = -4;
  rig.rebuild();
  assert.deepEqual(labels(controller, dims), ["60", "200"],
    "the member whose feature moved followed it; the other did not budge");
});

test("a chain run measures each span end to end, at one offset", () => {
  const rig = table(stepDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("chain");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));
  controller.pointerDown({ button: 0 }, ...at(0, 0));
  controller.pointerDown({ button: 0 }, ...at(10, 5));

  const dims = rig.document.drawing.dims;
  assert.equal(dims.length, 2);
  assert.deepEqual(labels(controller, dims), ["100", "100"], "each span, not each distance from the start");
  assert.deepEqual(dims.map((dim) => dim.offset), [-12, -12], "a chain reads along one line");
  assert.ok(dims.every((dim) => dim.refs.every((ref) => ref.pid)));
});

test("a run member dangles alone when its own reference goes", () => {
  const rig = table(stepDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("baseline");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));
  controller.pointerDown({ button: 0 }, ...at(0, 0));
  controller.pointerDown({ button: 0 }, ...at(10, 5));
  const dims = rig.document.drawing.dims;
  /* One member's far reference is renamed; the datum and the other member are
     untouched. */
  dims[1].refs[1] = { ...dims[1].refs[1], pid: "feature:part:step:edge:gone:9" };
  rig.rebuild();
  assert.deepEqual(labels(controller, dims), ["100", "⚠ (200)"]);
  assert.equal(controller.status().dangling.length, 1, "one member lost its reference, not the run");
});

test("Escape ends a run and keeps what it already placed", () => {
  const rig = table(stepDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("chain");
  controller.pointerDown({ button: 0 }, ...at(-10, 0));
  controller.pointerDown({ button: 0 }, ...at(0, 0));
  assert.equal(rig.document.drawing.dims.length, 1);
  assert.equal(controller.keyDown({ key: "Escape" }), true);
  assert.equal(controller.state.draft, null, "the run is over");
  assert.equal(rig.document.drawing.dims.length, 1, "and the span already measured stays measured");
  controller.pointerDown({ button: 0 }, ...at(10, 5));
  assert.equal(rig.document.drawing.dims.length, 1, "the next pick starts a new run rather than extending the old one");
});

/* ---- intersection snaps --------------------------------------------------
 *
 * An intersection is a DERIVED point: it has two parents, not one. So its
 * reference names BOTH ids and the point is recomputed by crossing the two
 * named edges in the view's own frame on every build — it follows the model
 * like any other reference, and it goes dangling the moment EITHER parent is
 * gone. It is never re-derived from whichever pair happens to cross nearest.
 *
 * Only crossings of NAMED edges are offered. Two silhouette lines that no
 * topology names cross on the paper and are not snapped to: a snap that cannot
 * say what it is on is the guess this mechanism exists to prevent.
 */

/* A cross of two bars: the horizontal bar's top edge crosses both sides of the
   upright, at (-2, 12) and (2, 12) in the front view. */
const crossDoc = () => ({
  name: "Cross",
  parts: [
    { id: "bar", kind: "box", x0: -20, x1: 20, y0: 8, y1: 12, z0: -5, z1: 5 },
    { id: "post", kind: "box", x0: -2, x1: 2, y0: -20, y1: 20, z0: -5, z1: 5 },
  ],
});

test("a crossing of two named edges is offered as a snap and binds to both parents", () => {
  const rig = table(crossDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("dim");
  controller.pointerMove({ button: 0 }, ...at(-2, 12));
  assert.equal(controller.state.snap?.kind, "cross", "the cursor found the crossing, not the nearest end");

  controller.pointerDown({ button: 0 }, ...at(-2, 12));
  controller.pointerDown({ button: 0 }, ...at(2, 12));
  controller.pointerMove({ button: 0 }, ...at(0, 20));
  controller.pointerDown({ button: 0 }, ...at(0, 20));

  const dim = rig.document.drawing.dims[0];
  assert.ok(dim, "a dimension was placed on two crossings");
  assert.ok(dim.refs.every((ref) => ref.kind === "cross" && ref.pid && ref.pid2),
    "each reference names both of its parents");
  assert.notEqual(dim.refs[0].pid2, dim.refs[1].pid2, "and they are different crossings");
  assert.equal(labelOf(controller, dim.id), "40", "the upright is 4 cm across");

  rig.document.parts[1].x0 = -4;
  rig.document.parts[1].x1 = 4;
  rig.rebuild();
  assert.equal(labelOf(controller, dim.id), "80",
    "the crossings were recomputed from their parents, not held where they were picked");
});

test("an intersection dangles when either of its two parents goes", () => {
  const rig = table(crossDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("dim");
  controller.pointerDown({ button: 0 }, ...at(-2, 12));
  controller.pointerDown({ button: 0 }, ...at(2, 12));
  controller.pointerMove({ button: 0 }, ...at(0, 20));
  controller.pointerDown({ button: 0 }, ...at(0, 20));
  const dim = rig.document.drawing.dims[0];
  assert.equal(labelOf(controller, dim.id), "40");

  /* The horizontal bar is renamed: it is the SECOND parent of both crossings,
     and the upright's edges are still perfectly present. */
  rig.document.parts[0].id = "bar2";
  rig.rebuild();
  assert.equal(labelOf(controller, dim.id), "⚠ (40)",
    "half a parentage is not a reference");
  const issue = controller.status().dangling;
  assert.equal(issue.length, 1);
  assert.ok(issue[0].missing.length > 0 && issue[0].missing.every((pid) => pid.startsWith("feature:part:bar:")),
    "and it names the parent that actually went, not whichever id came first: " + issue[0].missing.join(", "));
});

test("an intersection round-trips both parent ids through the save", () => {
  const rig = table(crossDoc());
  const controller = rig.controller;
  const at = clicker(controller);
  controller.setTool("dim");
  controller.pointerDown({ button: 0 }, ...at(-2, 12));
  controller.pointerDown({ button: 0 }, ...at(2, 12));
  controller.pointerMove({ button: 0 }, ...at(0, 20));
  controller.pointerDown({ button: 0 }, ...at(0, 20));
  const stored = rig.document.drawing.dims[0];
  const reopened = JSON.parse(JSON.stringify(rig.document));
  ensureSheetDoc(reopened);
  assert.deepEqual(reopened.drawing.dims[0].refs, stored.refs, "pid, pid2, kind and at all survived");
});

test('automatic dimensions follow selected view and dual units reach exported SVG',()=>{
 const {controller,document}=table();
 const doc=document.drawing,top=doc.views.find(v=>v.dir==='top');
 controller.state.selection={kind:'view',id:top.id};
 controller.setSheetOption('draftingStandard','ANSI');
 controller.setSheetOption('secondaryUnits','mm');
 controller.setSheetOption('secondaryPrecision',2);
 controller.autoDimension(false);
 assert.ok(doc.dims.every(d=>d.viewId===top.id));
 assert.match(controller.svg(),/\[200\.00\]/);
 assert.equal(doc.projection,'third');
 assert.equal(doc.precision,3);
 const saved=JSON.parse(JSON.stringify(doc));
 assert.equal(saved.secondaryUnits,'mm');
 assert.equal(saved.draftingStandard,'ANSI');
});

test('hole callout leader meets the rim and follows a changed bore radius', () => {
  const rig = drilled();
  rig.controller.fit();
  rig.controller.addHoleCallouts();
  const note = rig.document.drawing.notes[0];
  for (const radius of [0.25, 0.5]) {
    rig.topology = () => rig.document.parts.flatMap(partTopology).concat([holeWall('feature:hole1', radius)]);
    rig.rebuild();
    const scene = rig.controller.scene();
    const resolved = scene.notes.get(note.id).note;
    const place = scene.views.find(view => view.id === note.leader.viewId);
    const centre = place.toSheet(resolved.leader);
    const rim = place.toSheet({u:resolved.leader.u + radius,v:resolved.leader.v});
    const lines = scene.items.filter(item => item.noteId === note.id && item.type === 'line');
    const leader = lines[1];
    assert.ok(Math.abs(Math.hypot(leader.x1-centre.x, leader.y1-centre.y) - Math.hypot(rim.x-centre.x,rim.y-centre.y)) < 1e-8);
    assert.equal(note.leader.at, 'centre', 'stored topology reference remains unchanged');
  }
});
