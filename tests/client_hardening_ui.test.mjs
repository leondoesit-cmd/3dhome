import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parse } from '../vendor/acorn/acorn.mjs';
import { safeHref } from '../js/safe.js';

// Execute the actual rendering functions without importing the GPU module graph.
async function renderer(file, name, context) {
  const source = await readFile(new URL('../js/' + file, import.meta.url), 'utf8');
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id.name === name) found = node;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(parse(source, { ecmaVersion: 'latest', sourceType: 'module' }));
  assert.ok(found, name);
  return vm.runInNewContext('(' + source.slice(found.start, found.end) + ')', context);
}

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
    this.classList = { add() {}, remove() {} };
  }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this[key] = value; }
  set innerHTML(value) {
    this.html = value; this.children = [];
    // Only the static class-bearing markup used by these renderers is needed.
    for (const match of value.matchAll(/<(\w+)[^>]*class="([^"]+)"[^>]*>/g)) {
      const child = new Element(match[1]); child.className = match[2]; this.appendChild(child);
    }
  }
  get firstChild() { return this.children[0]; }
  click() { this.onclick?.(); }
  querySelector(selector) {
    return descendants(this).find(el => selector.startsWith('.') ?
      selector.slice(1).split('.').every(cls => (el.className || '').split(' ').includes(cls)) : el.tagName === selector);
  }
}
function descendants(element) { return element.children.flatMap(child => [child, ...descendants(child)]); }
function node(tag, text) { const element = new Element(tag); element.textContent = text; return element; }
function el(tag, cls, text) { const element = node(tag, text); element.className = cls; return element; }

test('texture cards render API names as text and allow only hex badge colors', async () => {
  const createCard = await renderer('ui_textures.js', 'createTextureCard', {
    document: { createElement: tag => new Element(tag) }, getLang: () => 'en',
    selectedTexture: null, previewBackground: () => 'url("https://example.com/thumb.jpg")',
    isFavorite: () => false, applySelectedTexture() {},
  });
  const attack = '<img src=x onerror="alert(1)"> & "name"';
  for (const color of ['#abc', '#ABCD', '#123456', '#12ab34CD', undefined, '', 'red', '#12', '#123456789', '#ggg', 'url(https://bad.test)', '#abc; color:red', '#abc" onmouseover="alert(1)']) {
    const card = createCard({ id: 'remote', name: { en: attack }, source: attack,
      sourceColor: color, thumbUrl: 'https://example.com/thumb.jpg', scale: attack }, 0, true);
    const title = card.querySelector('.tex-card-title'), badge = card.querySelector('.tex-card-badge');
    assert.equal(title.textContent, attack);
    assert.equal(title.title, attack);
    assert.equal(badge.textContent, attack);
    assert.equal(badge.style.background || '', /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#8b5cf6', 'invalid API colours fall back to the house purple');
    assert.equal(card.querySelector('.tex-card-meta').textContent, attack + ' cm');
    for (const element of [card, ...descendants(card)]) assert.ok(!(element.html || '').includes(attack));
  }
});

for (const url of ['javascript:alert(1)', 'java\tscript:alert(1)', '//evil.test', '/relative', '', 'HTTPS://EXAMPLE.COM/product', 'mailto:shop@example.com']) {
  test('product links are clickable only for a safe URL: ' + JSON.stringify(url), async () => {
    const row = new Element('div'), list = new Element('div');
    const context = { document: { getElementById: () => row }, el, safeHref, fmtDims: () => '1 × 2 × 3', t: key => key,
      list, chosen: null, swap: false, renderChosen() {}, setManual() {} };
    const fill = await renderer('ui_prodsize.js', 'fillSpecRow', context);
    fill({ spec: { title: 'Product', url } });
    const result = await renderer('ui_prodsize.js', 'renderResults', context);
    result({ results: [{ title: 'Product', url, conf: 1 }] });
    const expected = safeHref(url);
    assert.equal(row.querySelector('a').href || '', expected);
    assert.equal(list.querySelector('a')?.href || '', expected);
    if (!expected) assert.equal(list.querySelector('a'), undefined);
  });

  test('cabinet reference and standards links share the URL guard: ' + JSON.stringify(url), async () => {
    const presetSummary = new Element('div'), rules = new Element('div');
    const context = { node, safeHref, label: en => en, getLang: () => 'en', getItems: () => [],
      presetSummary, presetChanges: new Element('div'), presetSelect: { value: 'test' },
      previewCabinetProductionPreset: () => ({ preset: { construction: {}, standards: { focus: [] }, notes: [],
        references: [{ label: 'Reference', url }] }, changes: [], skipped: [], stockIssues: [] }),
      rules, session: { context: {} }, states: { pass: ['Pass', 'Pass'] },
      evaluateCabinetStandards: () => ({ rules: [{ status: 'pass', source: url, edition: '1' }] }) };
    (await renderer('ui_cabinet_production.js', 'showPresetPreview', context))();
    (await renderer('ui_cabinet_production.js', 'assess', context))();
    for (const parent of [presetSummary, rules]) assert.equal(parent.querySelector('a').href || '', safeHref(url));
  });
}
