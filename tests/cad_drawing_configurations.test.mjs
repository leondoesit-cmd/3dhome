import test from "node:test";
import assert from "node:assert/strict";
import { createView, createSheetDoc, createProjector } from "../js/cad_sheet.js";
import { projectionBounds } from "../js/core/hidden_line.js";
import { configuredBodiesForView } from "../js/cad_configured_drawing.js";
import { createDrawingController } from "../js/modeler_drawing.js";
import { createDrawingSvg } from "../js/cad_drawings.js";

function ring() {
  const configurations = [
    { id: "small", name: "Small", designTableValues: { pathDiameterMm: 100, profileDiameterMm: 3 } },
    { id: "medium", name: "Medium", designTableValues: { pathDiameterMm: 150, profileDiameterMm: 4 } },
  ];
  return {
    designTable: { kind: "circular-sweep", pathSketchId: "path", sweepFeatureId: "sweep" }, configurations,
    sketches: [{ id: "path", plane: "front", offset: 0, points: [{ id: "c", x: 0, y: 0 }], entities: [{ id: "ring", type: "circle", c: "c", r: 5 }] }],
    features: [{ id: "sweep", type: "sweep", params: { profileMode: "circular", profileDiameter: .3, sketchSources: { kind: "circular-sweep", path: { sketchId: "path", entityIds: ["ring"] } } } }],
  };
}

test("two drawing views project different O-RING design-table configurations", () => {
  const document = ring();
  const sheet = createSheetDoc({ views: ["front"] });
  sheet.views = [createView("front", { id: "s", configurationId: "small", primary: true }), createView("front", { id: "m", configurationId: "medium" })];
  const projector = createProjector(sheet, [], { bodiesForView: view => configuredBodiesForView(document, view, []) });
  const small = projectionBounds(projector(sheet.views[0]));
  const medium = projectionBounds(projector(sheet.views[1]));
  assert.ok(small && medium);
  assert.ok(Math.abs((small.u1 - small.u0) - 10.3) < .08, "Small outside diameter is 103 mm");
  assert.ok(Math.abs((medium.u1 - medium.u0) - 15.4) < .08, "Medium outside diameter is 154 mm");
  assert.ok((medium.u1 - medium.u0) > (small.u1 - small.u0) * 1.4);
  assert.equal(configuredBodiesForView(document, { configurationId: "missing" }, ["active"])[0], "active");
});

test("copying a view preserves its configuration and bound dimensions; changing the copy is independent", () => {
  const doc = createSheetDoc({ views: ["iso"] });
  const original = doc.views[0];
  original.configurationId = "small";
  doc.dims.push({ id: "diam", viewId: original.id, type: "diameter", refs: [{ u: 1, v: 2 }] });
  let dirty = 0;
  const drawing = createDrawingController({
    doc: () => doc, bodies: () => [], bodiesToken: () => 1,
    pushUndo: () => {}, markDirty: () => { dirty++; }, refresh: () => {}, t: text => text,
  });
  drawing.select({ kind: "view", id: original.id });
  const copy = drawing.duplicateSelectedView();
  assert.equal(doc.views.length, 2);
  assert.equal(copy.configurationId, "small");
  assert.equal(doc.dims.length, 2);
  assert.equal(doc.dims[1].viewId, copy.id);
  assert.notEqual(doc.dims[1].id, doc.dims[0].id);
  drawing.setSheetOption("viewConfiguration", "medium");
  assert.equal(copy.configurationId, "medium");
  assert.equal(original.configurationId, "small");
  assert.equal(dirty, 2);
});

test("stored drawing export labels each view with its configuration", () => {
  const document = ring();
  document.name = "O-RING-DESIGN-TABLE";
  document.drawing = createSheetDoc({ views: ["iso"] });
  document.drawing.views = [
    createView("iso", { id: "s", configurationId: "small", primary: true }),
    createView("iso", { id: "m", configurationId: "medium", label: "ISOMETRIC copy" }),
  ];
  const svg = createDrawingSvg(document);
  assert.match(svg, /ISOMETRIC · Small/);
  assert.match(svg, /ISOMETRIC · Medium/);
});
