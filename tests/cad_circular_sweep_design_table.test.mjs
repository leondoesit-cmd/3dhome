import test from "node:test";
import assert from "node:assert/strict";
import {
  circularSweepTableRows, setActiveConfiguration, setCircularSweepDesignTable,
} from "../js/cad_configurations.js";

function ringDocument() {
  const sketch = {
    id: "path", plane: "front", offset: 0,
    points: [{ id: "origin", x: 0, y: 0 }],
    entities: [{ id: "circle", type: "circle", c: "origin", r: 5.5245 }],
    constraints: [{ id: "diameter", type: "diameter", entity: "circle", value: 11.049 }],
  };
  const sources = { kind: "circular-sweep", diameter: .3175, path: { sketchId: "path", entityIds: ["circle"] } };
  return {
    kind: "part", sketches: [sketch],
    features: [{ id: "sweep", type: "sweep", params: { profileMode: "circular", profileDiameter: .3175, sketchSources: structuredClone(sources) }, inputs: [] }],
    history: [{ kind: "feature", targetId: "sweep", suppressed: false }],
    parts: [{ featureId: "sweep", sketchSources: structuredClone(sources), kernel: { type: "sweep", params: {} }, meshData: { stale: true } }],
  };
}

test("O-RING table switches the authored path dimension and generated sweep profile", () => {
  const doc = ringDocument();
  const rows = circularSweepTableRows(doc);
  assert.deepEqual(rows.map(row => row.name), ["Default", "Small", "Medium", "Large"]);
  assert.equal(rows[0].pathDiameterMm, 110.49);
  assert.equal(rows[0].profileDiameterMm, 3.175);
  setCircularSweepDesignTable(doc, rows);
  assert.equal(doc.configurations.length, 4);
  const small = doc.configurations.find(cfg => cfg.name === "Small");
  setActiveConfiguration(doc, small.id);
  assert.equal(doc.sketches[0].entities[0].r, 5);
  assert.equal(doc.sketches[0].constraints[0].value, 10);
  assert.equal(doc.features[0].params.profileDiameter, .3);
  assert.equal(doc.parts[0].sketchSources.diameter, .3);
  assert.equal(doc.parts[0].meshData, undefined);
  assert.ok(Math.abs(doc.features[0].params.path[0].x - 5) < 1e-9);
  assert.ok(Math.abs(doc.features[0].params.profile[0].x - 5.15) < 1e-9);
  const large = doc.configurations.find(cfg => cfg.name === "Large");
  setActiveConfiguration(doc, large.id);
  assert.equal(doc.sketches[0].entities[0].r, 10);
  assert.equal(doc.features[0].params.profileDiameter, 1);
  setActiveConfiguration(doc, "cfg_default");
  assert.equal(doc.sketches[0].entities[0].r, 5.5245);
  assert.equal(doc.features[0].params.profileDiameter, .3175);
});

test("table values are editable, persist in configurations, and reject invalid rows", () => {
  const doc = ringDocument();
  const rows = circularSweepTableRows(doc);
  rows[3].profileDiameterMm = 5;
  setCircularSweepDesignTable(doc, rows);
  const large = doc.configurations.find(cfg => cfg.name === "Large");
  setActiveConfiguration(doc, large.id);
  assert.equal(doc.features[0].params.profileDiameter, .5);
  assert.equal(circularSweepTableRows(doc)[3].profileDiameterMm, 5);
  const prior = structuredClone(doc.designTable);
  assert.throws(() => setCircularSweepDesignTable(doc, rows.map(row => row.name === "Medium" ? { ...row, profileDiameterMm: -4 } : row)), /Invalid Medium/);
  assert.deepEqual(doc.designTable, prior);
  assert.equal(doc.configurations.length, 4);
});

test("table action only applies to a circular sweep with a bound circle path", () => {
  const doc = ringDocument();
  doc.features[0].params.sketchSources.path.entityIds = ["missing"];
  assert.equal(circularSweepTableRows(doc), null);
  assert.throws(() => setCircularSweepDesignTable(doc, []), /Select a circular-profile sweep/);
});
