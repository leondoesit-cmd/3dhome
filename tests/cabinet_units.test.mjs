import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCabinetDimension, formatCabinetDimension } from '../js/cabinet_units.js';

test('cabinet dimension inputs convert decimal and fractional imperial to model cm', () => {
  assert.equal(parseCabinetDimension('600', 'mm'), 60);
  assert.equal(parseCabinetDimension('60', 'cm'), 60);
  assert.equal(parseCabinetDimension('23 5/8', 'in'), 60.0075);
  assert.equal(parseCabinetDimension('3/4', 'in'), 1.905);
  assert.equal(formatCabinetDimension(60.0075, 'in'), '23.625');
  assert.equal(parseCabinetDimension('23 5/8 in', 'mm'), 60.0075);
  assert.equal(parseCabinetDimension('600 mm', 'in'), 60);
  assert.equal(parseCabinetDimension('2', 'ft'), 60.96);
});

test('invalid dimensions fail without silent coercion or ambiguous locale conversion', () => {
  for (const input of ['', '0', '-1', 'NaN', 'Infinity', '1e3', '1,000', '5/0', '2 5/4']) {
    assert.throws(() => parseCabinetDimension(input, 'in'), Error, input);
  }
  assert.throws(() => parseCabinetDimension('3/4', 'mm'));
  assert.throws(() => parseCabinetDimension('10', 'yard'));
});
