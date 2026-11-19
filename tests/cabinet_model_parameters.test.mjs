import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cabinetParameterCm,
  cabinetParameterStep,
  cabinetParameterValue,
  cabinetParametersHeading,
} from "../js/modeler/cabinet_parameter_units.js";
import { makeSpec } from "../js/cabinet.js";
import { cabinetDefinitionFromItem } from "../js/core/cabinet_definition.js";
import { ensureParametricDocument, createPartDocument } from "../js/core/parametric_document.js";
import { documentLengthUnit } from "../js/core/document_length_units.js";
import { modelerSource } from "./helpers/modeler_source.mjs";
import { sourceFunctionText } from "./helpers/source_function.mjs";

test("A8: cabinet parameters show and take the model's length unit; storage stays cm", () => {
  assert.equal(cabinetParameterValue(43, "mm"), 430);
  assert.equal(cabinetParameterValue(43, "cm"), 43);
  assert.equal(cabinetParameterValue(43, "m"), 0.43);
  assert.equal(cabinetParameterValue(2.54, "in"), 1);
  assert.equal(cabinetParameterCm(430, "mm"), 43);
  assert.equal(cabinetParameterCm(0.43, "m"), 43);
  assert.equal(cabinetParameterCm(43, "unknown"), 43, "an unknown unit is cm");
  for (const unit of ["mm", "cm", "m", "in", "ft"]) {
    assert.ok(Math.abs(cabinetParameterCm(cabinetParameterValue(1.8, unit), unit) - 1.8) < 1e-9, unit + " round-trips");
  }
  assert.equal(cabinetParameterStep("mm"), 1);
  assert.equal(cabinetParameterStep("cm"), 0.1);
  assert.equal(cabinetParameterStep("m"), 0.001);
});

test("A8: the heading names the unit", () => {
  // the planner language at Node load is English
  assert.equal(cabinetParametersHeading("mm"), "Cabinet parameters (mm)");
  assert.equal(cabinetParametersHeading("cm"), "Cabinet parameters (cm)");
});

test("A8: the panel converts before the min/max check and rebuild", () => {
  const fn = sourceFunctionText(modelerSource(), "fillCabinetParameters");
  assert.doesNotMatch(fn, /\(cm\)|ס״מ/);
  assert.match(fn, /var unit = modelLengthUnit\(\)/);
  assert.match(fn, /var value = cabinetParameterCm\(typed, unit\);\s*if \(value < parameter\.min \|\| value > parameter\.max\) return;/);
  assert.match(fn, /cabinetParameterValue\(parameter\.value, unit\)/);
  assert.match(fn, /cabinetParameterStep\(unit\)/);
});

test("A8: the Model command example is unit-neutral in both languages", () => {
  const shell = readFileSync(new URL("../js/pro_shell.js", import.meta.url), "utf8");
  assert.match(shell, /“set height to 430”/);
  assert.match(shell, /„גובה 430”/);
  assert.doesNotMatch(shell, /430mm|430 מ״מ/);
});

test("A7: cabinet parameter labels take the free width; the number keeps a fixed slot", () => {
  const css = readFileSync(new URL("../css/styles_16_dial_lava_layers.css", import.meta.url), "utf8");
  const label = /#modeler \.md-cab-parameters \.md-grid-cell \.t \{([^}]*)\}/.exec(css);
  assert.ok(label, "label rule");
  assert.match(label[1], /flex: 1 1 auto/);
  assert.match(label[1], /min-inline-size: 0/);
  assert.match(label[1], /max-inline-size: none/);
  assert.match(label[1], /text-align: start/);
  assert.match(label[1], /white-space: normal/);
  const input = /#modeler \.md-cab-parameters \.md-grid-cell input\[type="number"\] \{([^}]*)\}/.exec(css);
  assert.ok(input, "input rule");
  assert.match(input[1], /flex: none/);
  assert.match(input[1], /inline-size: 72px/);
});

// What modelLengthUnit() reports for a document openModeler() has loaded.
const editorUnit = (definition) => documentLengthUnit(ensureParametricDocument(structuredClone(definition)).context?.units?.length);
const cabinetItem = () => ({ id: "unit", type: "cabsys", w: 120, h: 240, d: 60, cab: makeSpec("w_classic", 120, 240, 60) });

test("a cabinet document defaults to mm; an explicit unit wins; other documents stay cm", () => {
  assert.match(sourceFunctionText(modelerSource(), "modelLengthUnit"), /documentLengthUnit\(document\?\.context\?\.units\?\.length\)/);
  const fresh = cabinetDefinitionFromItem(cabinetItem());
  assert.equal(fresh.metadata.adapter, "cabinet");
  assert.equal(editorUnit(fresh), "mm");
  for (const unit of ["cm", "in"]) {
    const chosen = ensureParametricDocument(structuredClone(fresh));
    chosen.context.units.length = unit;
    const reopened = cabinetDefinitionFromItem(cabinetItem(), chosen);
    assert.equal(editorUnit(reopened), unit, "the saved " + unit + " survives a rebuild from the item");
    // Display only: geometry, cut list, quote and price are unit-independent.
    for (const key of ["parts", "features", "parameters"]) assert.deepEqual(reopened[key], fresh[key], key);
    for (const key of ["bom", "hardware", "quote", "price"]) assert.deepEqual(reopened.metadata[key], fresh.metadata[key], key);
  }
  assert.equal(editorUnit(createPartDocument({ key: "plain" })), "cm");
  assert.equal(editorUnit({ id: "legacy", parts: [] }), "cm");
});
