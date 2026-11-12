import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { lengthFromDocument, lengthToDocument } from '../js/core/document_length_units.js';
import { parseSketchDimensionEntry } from '../js/core/sketch_dimension_entry.js';

const source = modelerSource();
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const toolStart = source.indexOf('var DYN_TOOLS = {');
const tools = source.slice(toolStart, source.indexOf('\n};', toolStart) + 3);
const fieldsStart = source.indexOf('function dynFields()');
const fields = source.slice(fieldsStart, source.indexOf('\n', fieldsStart));

function harness(unit, tool, values, live = {}) {
  const labels = [];
  const E = {
    tool, def: { context: { units: { length: unit } } },
    dynInput: { tool, field: Object.keys(values)[0], values },
    mode: 'sketch', drag: { mode: tool, u: 0, v: 0 },
    cw: 800, ch: 600,
  };
  const context = {
    E, fin: Number.isFinite, lengthFromDocument, lengthToDocument, parseSketchDimensionEntry,
    modelLengthUnit: () => unit,
    dynLive: () => live,
    t: key => key,
  };
  vm.runInNewContext([
    tools, functionSource('dynAnchor'), fields,
    functionSource('dynTyped'), functionSource('dynDrawHud'), functionSource('dynKey'), functionSource('dynHasEntry'),
  ].join('\n'), context);
  const canvas = {
    save() {}, restore() {}, fillRect() {}, fillText(label) { labels.push(label); },
    measureText(label) { return { width: label.length * 7 }; },
  };
  return { context, canvas, labels };
}

test('typed sketch lengths use document inches while internal geometry stays in centimeters', () => {
  const h = harness('in', 'srect', { width: '2', height: '5' }, { width: 5.08, height: 12.7 });
  assert.equal(h.context.dynTyped('width'), 5.08);
  assert.equal(h.context.dynTyped('height'), 12.7);
  h.context.dynDrawHud(h.canvas, 100, 100);
  assert.deepEqual(h.labels, ['dyn_width 2 in', 'dyn_height 5 in']);
});

test('explicit unit suffix keystrokes own dynamic length input and convert into centimeters',()=>{
  const h=harness('cm','scirc',{diameter:'100'},{diameter:10});
  h.context.drawSketch=()=>{};
  let prevented=0;
  for(const key of ['m','m'])assert.equal(h.context.dynKey({key,preventDefault(){prevented++;}}),true);
  assert.equal(prevented,2);
  assert.equal(h.context.E.dynInput.values.diameter,'100mm');
  assert.equal(h.context.dynTyped('diameter'),10);
  h.context.dynDrawHud(h.canvas,100,100);
  assert.deepEqual(h.labels,['dyn_diameter 100mm']);
  for(const [raw,expected] of [['2in',5.08],['0.5 m',50],['10cm',10],['1ft',30.48],['100xyz',null]]){
    h.context.E.dynInput.values.diameter=raw;
    assert.equal(h.context.dynTyped('diameter'),expected);
  }
});

test('live sketch dimensions and typed angle/sides retain their respective units', () => {
  const rectangle = harness('in', 'srect', {}, { width: 5.08, height: 12.7 });
  assert.deepEqual(rectangle.context.dynLive(), { width: 5.08, height: 12.7 });
  rectangle.context.dynDrawHud(rectangle.canvas, 100, 100);
  assert.deepEqual(rectangle.labels, ['dyn_width 2 in', 'dyn_height 5 in']);
  const wall = harness('mm', 'wall', { length: '25', angle: '90' });
  assert.equal(wall.context.dynTyped('length'), 2.5);
  assert.equal(wall.context.dynTyped('angle'), 90);
  const polygon = harness('cm', 'spoly', { diameter: '3', sides: '6' });
  assert.equal(polygon.context.dynTyped('diameter'), 3);
  assert.equal(polygon.context.dynTyped('sides'), 6);
});
