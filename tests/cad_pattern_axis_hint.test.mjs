import test from 'node:test';
import assert from 'node:assert/strict';
import { circularPatternAxisFromHistory } from '../js/core/pattern_geometry.js';

test('circular seed pattern follows the shaft axis through downstream cuts and dome', () => {
  const features = [
    { id: 'shaft', type: 'revolve', params: { axis: 'z' }, inputs: [] },
    { id: 'glass', type: 'revolve', params: { axis: 'z' }, inputs: ['shaft'] },
    { id: 'dome', type: 'dome', params: {}, inputs: ['glass'] },
    { id: 'seed', type: 'extrudeCut', params: { axis: 'frame' }, inputs: ['dome'] },
  ];
  assert.equal(circularPatternAxisFromHistory(features, 'seed'), 'z');
  assert.equal(circularPatternAxisFromHistory(features, 'missing', 'x'), 'x');
});
