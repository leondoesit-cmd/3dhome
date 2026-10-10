import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { addSmartDimension } from '../js/sketch_dimensions.js';
import { solveSketch } from '../js/sketch_solver.js';
import { evaluateFeatureNumber } from '../js/modeler_feature_form.js';
import {dimensionUnit} from '../js/sketch_equations.js';
import {parseSketchDimensionEntry} from '../js/core/sketch_dimension_entry.js';
import {toleranceFields,makeDimensionTolerance} from '../js/core/dimension_tolerance.js';

const source = readFileSync(new URL('../js/modeler.js', import.meta.url), 'utf8');
function load(name, context) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n}', start) + 2;
  return vm.runInNewContext(`(${source.slice(start, end)})`, {cloneData:structuredClone,toleranceFields,makeDimensionTolerance,...context});
}

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test('circular sketch pattern rotation values display and edit in degrees in an inch document',()=>{
  const rotation={type:'rotation',value:90};
  assert.equal(dimensionUnit(rotation),'angle');
  const unit=load('dimensionEditorUnit',{dimensionUnit,E:{def:{context:{units:{length:'in'}}}}});
  assert.equal(unit(rotation),'°');
  const caption=load('constraintKindCaption',{dimensionUnit,modelLengthText:value=>String(value/2.54),modelLengthUnit:()=> 'in'});
  assert.equal(caption(rotation),'90°');
  assert.equal(parseSketchDimensionEntry('90',rotation,'in').value,90);
  assert.equal(parseSketchDimensionEntry('180 / 2',rotation,'in').value,90);
  assert.equal(parseSketchDimensionEntry('90deg',rotation,'in').value,90);
});

test('a smart dimension on a full circle is a diameter; on an arc it stays a radius', () => {
  const sketch = {
    points: [{ id: 'c', x: 0, y: 0 }, { id: 'a', x: 5, y: 0 }, { id: 'b', x: 0, y: 5 }],
    entities: [{ id: 'C', type: 'circle', c: 'c', r: 5 }, { id: 'A', type: 'arc', c: 'c', a: 'a', b: 'b' }],
    constraints: [{ id: 'f', type: 'fixed', point: 'c', x: 0, y: 0 }],
  };
  addSmartDimension(sketch, { type: 'circle', id: 'C' }, 5);
  addSmartDimension(sketch, { type: 'arc', id: 'A' }, 5);
  const [, dia, rad] = sketch.constraints;
  assert.equal(dia.type, 'diameter');
  assert.equal(dia.value, 10);
  assert.equal(rad.type, 'radius');
  dia.value = 11.113; // HOUSING Base Extrude: Ø4.375 in [111.13 mm]
  solveSketch(sketch);
  near(sketch.entities[0].r, 5.5565, 1e-6);
});

function editor(text, constraint, unit = 'cm') {
  const controls = new Map();
  const root = { querySelector: (key) => {
    if (!controls.has(key)) controls.set(key, { value: '', focus() {}, select() {} });
    return controls.get(key);
  } };
  const E = {};
  const base = { root, E, Number, String, hideDimensionEditor() { E.dimEditor = null; }, dimensionEditorUnit: () => unit, positionDimensionEditor() {}, requestAnimationFrame: (fn) => fn() };
  load('showDimensionEditor', base)({}, constraint);
  controls.get('#mdDimValue').value = text;
  return load('applyDimensionEditor', { ...base, dimensionUnit, fin: Number.isFinite, evaluateFeatureNumber, nameAvailable: () => true, pushUndo() {}, activateDrawingSketch() {}, resolveSketch: () => true, refreshAll() {}, H: { discard() {} }, flash() {}, t: (k) => k, constraintMeasure: () => 0 });
}

test('the dimension editor hides float noise but keeps the stored value when accepted unchanged', () => {
  const constraint = { id: 'd', type: 'radius', value: 22.29999999999997 };
  const controls = new Map();
  const root = { querySelector: (key) => { if (!controls.has(key)) controls.set(key, { value: '', focus() {}, select() {} }); return controls.get(key); } };
  const E = {};
  load('showDimensionEditor', { root, E, Number, String, hideDimensionEditor() {}, dimensionEditorUnit: () => 'cm', positionDimensionEditor() {}, requestAnimationFrame: (fn) => fn() })({}, constraint);
  assert.equal(controls.get('#mdDimValue').value, '22.3');
  assert.equal(E.dimEditor.before.value, 22.29999999999997);
});

test('the dimension editor accepts unit suffixes and arithmetic instead of reading "111.13mm" as centimetres', () => {
  for (const [text, expected] of [['111.13mm', 11.113], ['4.375in', 11.1125], ['2*3', 6], ['1.3in + 1mm', 3.402]]) {
    const constraint = { id: 'd', type: 'diameter', value: 5 };
    assert.equal(editor(text, constraint)(), true, text);
    near(constraint.value, expected, 1e-9);
  }
  const angle = { id: 'a', type: 'angle', value: 10 };
  assert.equal(editor('5deg', angle)(), true);
  near(angle.value, 5);
  const bad = { id: 'd', type: 'diameter', value: 5 };
  assert.equal(editor('3 apples', bad)(), false);
  assert.equal(bad.value, 5);
  const wrongUnit = { id: 'a', type: 'angle', value: 10 };
  assert.equal(editor('5mm', wrongUnit)(), false);
});

test('Smart Dimension displays and applies bare inches while storing centimetres', () => {
  const constraint = { id: 'd', type: 'distance', value: 10.16 };
  const controls = new Map();
  const root = { querySelector: key => {
    if (!controls.has(key)) controls.set(key, { value: '', focus() {}, select() {} });
    return controls.get(key);
  } };
  const E = {};
  load('showDimensionEditor', { root, E, Number, String, hideDimensionEditor() {}, dimensionEditorUnit: () => 'in', positionDimensionEditor() {}, requestAnimationFrame: fn => fn() })({}, constraint);
  assert.equal(controls.get('#mdDimValue').value, '4');
  assert.equal(controls.get('#mdDimUnit').textContent, 'in');
  assert.equal(editor('2.0', constraint, 'in')(), true);
  near(constraint.value, 5.08);
});
