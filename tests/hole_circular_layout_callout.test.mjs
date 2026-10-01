import test from 'node:test';
import assert from 'node:assert/strict';
import { holeLayoutPoints } from '../js/cad_hole_wizard.js';
import { holeCallouts, calloutText } from '../js/core/hole_callout.js';
import { FEATURE_CATALOG } from '../js/core/feature_catalog.js';

test('circular hole layout honours the first-hole angle', () => {
  const pts = holeLayoutPoints({ layout: 'circular', count: 6, radius: 1.96, startAngle: 90 });
  assert.equal(pts.length, 6);
  assert.ok(Math.abs(pts[0].u) < 1e-12 && Math.abs(pts[0].v - 1.96) < 1e-12, 'first hole sits on +V');
  assert.ok(Math.abs(pts[3].u) < 1e-12 && Math.abs(pts[3].v + 1.96) < 1e-12, 'fourth hole is opposite');
  const flat = holeLayoutPoints({ layout: 'circular', count: 6, radius: 1.96 });
  assert.ok(Math.abs(flat[0].u - 1.96) < 1e-12 && Math.abs(flat[0].v) < 1e-12, 'no angle keeps the +U default');
});

test('hole wizard exposes the first-hole angle as a validated editable field', () => {
  const hole = FEATURE_CATALOG.hole;
  assert.equal(hole.defaults.startAngle, 0);
  assert.equal(hole.parameters.startAngle.unit, 'deg');
  const keys = hole.editor.groups.flatMap((group) => group.fields.map((field) => field.key));
  assert.ok(keys.includes('startAngle'));
});

test('a bolt-circle hole layout is called out with its count and EQ SP', () => {
  const def = {
    sketches: [],
    features: [{ id: 'bolt', type: 'hole', params: { holeType: 'simple', standardSize: 'custom', diameter: 1.27, endCondition: 'through-all', layout: 'circular', count: 6, radius: 4.9784, startAngle: 90, axis: 'z', displayUnit: 'in' } }],
  };
  const [row] = holeCallouts(def);
  assert.equal(row.quantity, 6);
  assert.equal(row.equalSpacing, true);
  assert.match(calloutText(row), /×6 EQ SP\./);
  const single = holeCallouts({ sketches: [], features: [{ id: 'one', type: 'hole', params: { holeType: 'simple', standardSize: 'custom', diameter: 1, endCondition: 'through-all', layout: 'circular', count: 1, radius: 2, axis: 'z' } }] })[0];
  assert.equal(single.equalSpacing, false);
});
