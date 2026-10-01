import test from "node:test";
import assert from "node:assert/strict";
import { expandUnitLiterals, dimensionUnit, resolveEquations, evaluateExpression } from "../js/sketch_equations.js";
import { evaluateFeatureNumber } from "../js/modeler_feature_form.js";
import { parseSketchDimensionEntry } from "../js/core/sketch_dimension_entry.js";

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("G24: unit literals expand to centimetres and degrees", () => {
  close(evaluateExpression(expandUnitLiterals("4.900in", "length")), 12.446);
  close(evaluateExpression(expandUnitLiterals("111.13 mm", "length")), 11.113);
  close(evaluateExpression(expandUnitLiterals("0.5rad", "angle")), 90 / Math.PI);
  assert.equal(expandUnitLiterals("Width / 2", "length"), "Width / 2");
  assert.throws(() => expandUnitLiterals("5deg", "length"), /Incorrect unit/);
  assert.equal(dimensionUnit({ type: "angle" }), "angle");
  assert.equal(dimensionUnit({ type: "distance" }), "length");
});

test("G24: a stored dimension expression with units rebuilds, named or not", () => {
  const def = {
    variables: [],
    sketches: [{ constraints: [
      { id: "c1", type: "distance", name: "Dia", value: 1, expr: "4.900in" },
      { id: "c2", type: "distance", value: 1, expr: "Dia / 2 + 1mm" },
      { id: "c3", type: "angle", value: 1, expr: "0.25rad*0 + 5deg" },
    ] }],
  };
  const { errors } = resolveEquations(def);
  assert.deepEqual(errors, []);
  const [c1, c2, c3] = def.sketches[0].constraints;
  close(c1.value, 12.446);
  close(c2.value, 6.323);
  close(c3.value, 5);
});

test("G24: feature fields keep their unit handling", () => {
  close(evaluateFeatureNumber("111.13mm", { key: "depth", unit: "length" }), 11.113);
  close(evaluateFeatureNumber("2*3.1", { key: "depth", unit: "length" }), 6.2);
});

test("G24: the constraint-list field uses document units for numbers and numeric arithmetic", () => {
  const radius = { type: 'radius' };
  for (const text of ['2', '2.0', '2e0', '1+1', '4/2']) {
    const entry = parseSketchDimensionEntry(text, radius, 'in');
    close(entry.value, 5.08);
    assert.equal(entry.expr, null);
  }
  close(parseSketchDimensionEntry('20', radius, 'mm').value, 2);
  close(parseSketchDimensionEntry('90.0', { type: 'angle' }, 'in').value, 90);
});

test("G24: named and unit-literal equations remain linked to internal centimetres", () => {
  const width = { type: 'distance' };
  const linked = parseSketchDimensionEntry('Width / 2 + 1mm', width, 'in', name => name === 'Width' ? 10.16 : undefined);
  close(linked.value, 5.18);
  assert.equal(linked.expr, 'Width / 2 + 1mm');
  const literal = parseSketchDimensionEntry('2in', width, 'mm');
  close(literal.value, 5.08);
  assert.equal(literal.expr, '2in');
  assert.throws(() => parseSketchDimensionEntry('2 apples', width, 'in'), /Unknown name|Unexpected/);
});
