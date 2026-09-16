import test from 'node:test';
import assert from 'node:assert/strict';
import { openingDrawDefaults, setOpeningDrawDefault } from '../js/opening_draw_defaults.js';
test('opening draft dimensions are isolated by type and returned by value', () => {
  assert.equal(setOpeningDrawDefault('door', 'width', 81.28), true);
  assert.equal(openingDrawDefaults('door').width, 81.28);
  assert.equal(openingDrawDefaults('window').width, 120);
  const copy = openingDrawDefaults('door'); copy.width = 1;
  assert.equal(openingDrawDefaults('door').width, 81.28);
});
test('invalid drafting dimensions do not replace the last usable value', () => {
  const before = openingDrawDefaults('door');
  for (const value of [-1, 0, NaN, Infinity]) assert.equal(setOpeningDrawDefault('door', 'width', value), false);
  assert.deepEqual(openingDrawDefaults('door'), before);
  assert.equal(setOpeningDrawDefault('window', 'sill', 0), true);
  assert.equal(setOpeningDrawDefault('door', 'unknown', 5), false);
  assert.equal(openingDrawDefaults('wall'), null);
});
