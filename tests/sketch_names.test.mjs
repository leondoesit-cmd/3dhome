import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { drawNameTags, relationSubjects, relationTargets, sketchInstanceNames } from '../js/sketch_names.js';

/* "It fights: Tangent, Tangent" named nothing a user could find: a slot has four
   tangents. Relations are captioned with the geometry they tie, by SOLIDWORKS-
   style instance names, and those names are tagged on the canvas. */

function slot() {
  return {
    points: [{ id: 'ca', x: 0, y: 0 }, { id: 'cb', x: 40, y: 0 }, { id: 'a0', x: 0, y: 5 }, { id: 'a1', x: 0, y: -5 }, { id: 'b0', x: 40, y: 5 }, { id: 'b1', x: 40, y: -5 }],
    entities: [
      { id: 'S1', type: 'line', a: 'a1', b: 'b1' }, { id: 'CB', type: 'arc', c: 'cb', a: 'b1', b: 'b0' },
      { id: 'S0', type: 'line', a: 'b0', b: 'a0' }, { id: 'CA', type: 'arc', c: 'ca', a: 'a0', b: 'a1' },
      { id: 'CL', type: 'line', a: 'ca', b: 'cb', construction: true },
    ],
    constraints: [
      { id: 't0', type: 'tangent', a: 'S0', b: 'CA' }, { id: 'p1', type: 'parallel', a: 'S1', b: 'CL' },
      { id: 'sym', type: 'symmetric', a: 'a0', b: 'a1', entity: 'CL' }, { id: 'co', type: 'coincident', a: 'a0', b: 'b0' },
      { id: 'on', type: 'pointOnCircle', point: 'b0', entity: 'CA' }, { id: 'fx', type: 'fixed', point: 'ca', x: 0, y: 0 },
      { id: 'len', type: 'distance', entity: 'S0', value: 40 }, { id: 'pp', type: 'distance', a: 'ca', b: 'cb', value: 40 },
      { id: 'pld', type: 'pointLineDistance', point: 'ca', a: 'S1', value: 5 },
    ],
  };
}

test('entities are numbered per type in sketch order, points on their own', () => {
  const names = sketchInstanceNames(slot());
  assert.deepEqual([...names.entities.values()], ['Line1', 'Arc1', 'Line2', 'Arc2', 'Line3']);
  assert.equal(names.points.get('a0'), 'Point3');
});

test('each relation names the geometry it ties, points where the relation is about points', () => {
  const s = slot(), by = (id) => relationSubjects(s, s.constraints.find((c) => c.id === id));
  assert.deepEqual(by('t0'), ['Line2', 'Arc2']);
  assert.deepEqual(by('p1'), ['Line1', 'Line3']);
  assert.deepEqual(by('sym'), ['Point3', 'Point4', 'Line3']);
  assert.deepEqual(by('co'), ['Point3', 'Point5']);
  assert.deepEqual(by('on'), ['Point5', 'Arc2']);
  assert.deepEqual(by('fx'), ['Point1']);
  assert.deepEqual(by('len'), ['Line2']);
  assert.deepEqual(by('pp'), ['Point1', 'Point2']);
  assert.deepEqual(by('pld'), ['Point1', 'Line1']);
});

test('labels are localisable', () => {
  const names = sketchInstanceNames(slot(), { line: 'קו', arc: 'קשת', point: 'נקודה' });
  assert.equal(names.entities.get('CA'), 'קשת2');
  assert.equal(names.points.get('ca'), 'נקודה1');
});

test('name tags are drawn once per target, stacked where they would overlap', () => {
  const s = slot(), calls = [];
  const ctx = { save() {}, restore() {}, beginPath() {}, fill() {}, fillRect() {}, measureText: (t) => ({ width: t.length * 6 }), fillText: (text, x, y) => calls.push([text, x, y]) };
  const targets = [...relationTargets(s, s.constraints[0]), ...relationTargets(s, s.constraints[0]), { id: 'a0', kind: 'point' }, { id: 'a0', kind: 'point' }];
  const drawn = drawNameTags(ctx, s, (x, y) => ({ x: x * 10, y: -y * 10 }), targets);
  assert.equal(drawn, 3);
  assert.deepEqual(calls.map((c) => c[0]), ['Line2', 'Arc2', 'Point3']);
});

test('every refusal in the editor explains itself; none falls back to the bare message', () => {
  const src = modelerSource();
  assert.doesNotMatch(src, /flash\(t\("overDefined"\)\)/);
  const sites = ['function applySketchFilletFromSelection', 'function appendToSketch', 'function smartDimension', 'pushUndo("Point coordinates")', 'pushUndo("Place at sketch origin")', 'function addLineRule', 'var liveSketch = ensureSketch(E.def);'];
  for (const site of sites) {
    const at = src.indexOf(site);
    assert.ok(at >= 0, site);
    assert.match(src.slice(at, at + 2600), /explainSketchConflict\(/, site + ' explains its refusal');
  }
  const list = src.slice(src.indexOf('inp.addEventListener("change", function () {'), src.indexOf('row.appendChild(inp);'));
  assert.match(list, /explainSketchConflict\(sketch, \{ keep: \[con\.id\] \}\)/);
  assert.match(src, /constraintCaption\(constraint, sketch\)|function constraintCaption\(constraint, sketch\)/);
  assert.match(src, /drawNameTags\(c, sketch, toPx,/);
});
