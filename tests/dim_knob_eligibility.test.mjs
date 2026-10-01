import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceFunctionText } from './helpers/source_function.mjs';

const source = name => readFileSync(new URL('../js/' + name + '.js', import.meta.url), 'utf8');
const domain = Function('return (' + sourceFunctionText(source('unit_settings'), 'inferDomainFromElementId') + ')')();
const eligible = Function('inferDomainFromElementId', 'return (' + sourceFunctionText(source('ui_dim_knob'), 'knobEligible') + ')')(domain);
const field = (changes = {}) => ({
  tagName: 'INPUT', type: 'text', inputMode: 'decimal', id: 'w_len',
  disabled: false, readOnly: false, getAttribute: () => null, closest: () => null, ...changes,
});

test('the dial accepts typed length fields across planner domains and ordinary numbers', () => {
  for (const id of ['w_len', 'i_w', 'o_w', 'r_d', 'cadLen']) assert.equal(eligible(field({ id })), true, id);
  assert.equal(eligible(field({ type: 'number', inputMode: 'numeric', id: 'count' })), true);
});

test('the dial leaves non-dimensions, protected fields and its own controls alone', () => {
  for (const changes of [
    { id: 'name' }, { inputMode: 'text' }, { type: 'search' },
    { disabled: true }, { readOnly: true }, { tagName: 'TEXTAREA' },
    { getAttribute: () => 'off' }, { closest: () => ({ id: 'dim-knob' }) },
  ]) assert.equal(eligible(field(changes)), false);
  assert.equal(eligible(null), false);
});
