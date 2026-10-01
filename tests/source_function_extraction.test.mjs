import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFunctionText } from './helpers/source_function.mjs';

test('source function extraction handles CRLF, exports, default objects and nested declarations', () => {
  const source = 'export function first(options = {}) {\r\n  function inner() { return "}"; }\r\n  return inner() + options.value;\r\n}\r\nexport function second() { return 2; }\r\n';
  const fn = Function('return (' + sourceFunctionText(source, 'first') + ')')();
  assert.equal(fn({ value: 'ok' }), '}ok');
  assert.equal(Function('return (' + sourceFunctionText(source, 'inner') + ')')()(), '}');
  assert.equal(Function('return (' + sourceFunctionText(source, 'second') + ')')()(), 2);
});

test('source function extraction rejects missing and ambiguous declarations', () => {
  assert.throws(() => sourceFunctionText('function one() {}', 'missing'), /found 0/);
  assert.throws(() => sourceFunctionText('function one() { function same() {} } function two() { function same() {} }', 'same'), /found 2/);
});
