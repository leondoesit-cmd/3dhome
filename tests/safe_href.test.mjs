import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHref } from '../js/safe.js';

test('safeHref normalizes explicit allowed URLs', () => {
  for (const [input, expected] of [
    ['https://EXAMPLE.com:443/a/../product?q=1#size', 'https://example.com/product?q=1#size'],
    ['HTTP://Example.com:80', 'http://example.com/'],
    [' https://example.com/a b ', 'https://example.com/a%20b'],
    ['mailto:shop@example.com?subject=Sizes', 'mailto:shop@example.com?subject=Sizes'],
    ['https://example.com/?next=javascript:alert(1)', 'https://example.com/?next=javascript:alert(1)'],
  ]) assert.equal(safeHref(input), expected, input);
});

test('safeHref rejects unsafe schemes, relative URLs and obfuscation', () => {
  for (const input of [
    '', null, undefined, 42, {}, ['https://example.com'],
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' java\tscript:alert(1)',
    'java\nscript:alert(1)', 'java\rscript:alert(1)', '\u0000javascript:alert(1)',
    'java script:alert(1)', 'javascript&#58;alert(1)', 'java%73cript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)',
    'file:///etc/passwd', 'blob:https://example.com/id', 'ftp://example.com',
    '/product', './product', '../product', 'product', '?q=1', '#size',
    '//example.com', '///example.com', '\\example.com', '/\\example.com',
    'https:example.com', 'https:/example.com', 'https:///example.com',
    'https:\\example.com', 'https://', 'https://[invalid]',
    'ht\ttps://example.com', 'https://example.com/\u007f', '\nhttps://example.com',
  ]) assert.equal(safeHref(input), '', JSON.stringify(input));
});

test('safeHref respects the caller protocol allowlist', () => {
  assert.equal(safeHref('http://example.com', { allow: ['https:'] }), '');
  assert.equal(safeHref('mailto:a@example.com', { allow: ['https:'] }), '');
  assert.equal(safeHref('https://example.com', { allow: [] }), '');
  assert.equal(safeHref('HTTPS://EXAMPLE.COM', { allow: ['https:'] }), 'https://example.com/');
  assert.equal(safeHref('ftp://example.com', { allow: ['ftp:'] }), 'ftp://example.com/');
});
