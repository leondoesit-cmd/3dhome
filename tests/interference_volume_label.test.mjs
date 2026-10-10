import test from 'node:test';
import assert from 'node:assert/strict';
import {interferenceVolumeLabel} from '../js/core/interference_volume_label.js';

test('small positive native overlaps are never displayed as zero', () => {
  for (const volume of [0.0004, 0.00000462165, 1e-12, Number.MIN_VALUE]) {
    const label = interferenceVolumeLabel(volume);
    assert.ok(parseFloat(label) > 0, label);
    assert.ok(Math.abs(parseFloat(label) - volume) <= volume * 0.005 || volume === Number.MIN_VALUE);
  }
  assert.equal(interferenceVolumeLabel(0.0004), '0.000400 cm³');
});

test('usual report precision and units remain explicit', () => {
  assert.equal(interferenceVolumeLabel(0), '0.000 cm³');
  assert.equal(interferenceVolumeLabel(0.001), '0.001 cm³');
  assert.equal(interferenceVolumeLabel(0.074), '0.074 cm³');
  assert.equal(interferenceVolumeLabel(1.23456), '1.235 cm³');
});

test('invalid native volume cannot be presented as a measurement', () => {
  for (const value of [-1, NaN, Infinity, '0.001', null]) {
    assert.throws(() => interferenceVolumeLabel(value), /Invalid interference volume/);
  }
});
