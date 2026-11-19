import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTreeModel } from '../js/core/tree_model.js';
import { renderTreeModel } from '../js/modeler_tree.js';

/* A sketch its feature owns is drawn inside that feature, so history entries
   outnumber tree rows. The rollback index is a history index; clamping it to
   the row count drew the bar one feature too early while the rebuild rolled
   back only the feature the user picked. */

const sk = (id) => ({ id, name: id, plane: 'top', points: [], entities: [], constraints: [] });
const ft = (id, sketch) => ({ id, name: id, type: 'extrude', params: {}, references: { sketches: [sketch] } });
const doc = () => ({
  schema: 'parametric-v1',
  sketches: [sk('s1'), sk('s2'), sk('s3')],
  features: [ft('Base', 's1'), ft('Loft', 's2'), ft('Battery', 's3')],
  history: [
    { id: 'h1', kind: 'sketch', targetId: 's1' }, { id: 'h2', kind: 'feature', targetId: 'Base' },
    { id: 'h3', kind: 'sketch', targetId: 's2' }, { id: 'h4', kind: 'feature', targetId: 'Loft' },
    { id: 'h5', kind: 'sketch', targetId: 's3' }, { id: 'h6', kind: 'feature', targetId: 'Battery' },
  ],
});

// the smallest DOM the renderer needs: ordered children with a class name
function fakeDeps() {
  const make = (tag, cls) => {
    const node = { tag, className: cls || '', children: [], dataset: {}, style: {}, attrs: {},
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
      classList: { add() {}, toggle() {} } };
    node.style.setProperty = () => {};
    Object.defineProperty(node, 'innerHTML', { set() { node.children = []; }, get() { return ''; } });
    Object.defineProperty(node, 'textContent', { set(v) { node.text = v; }, get() { return node.text || ''; } });
    // anything else the renderer calls on an element is a no-op here
    return new Proxy(node, { get: (target, key) => (key in target || typeof key !== 'string' ? target[key] : () => {}) });
  };
  return { el: (tag, cls) => make(tag, cls), btn: () => make('button'), cadIcon: () => '', namedButton: () => make('button'), t: (k) => k,
    rollbackBar: () => make('div', 'md-rollbar'), host: make('div') };
}

for (const [rollbackIndex, above] of [[3, 'Loft'], [5, 'Battery'], [1, 'Base']]) {
  test(`rolled back at history ${rollbackIndex}: the bar sits directly above ${above}, which is the first rolled row`, () => {
    const model = buildTreeModel(doc(), { authoringSystem: 'parametric-v1', rollbackIndex });
    assert.equal(model.rollbackAt, rollbackIndex);
    const history = model.nodes.find((n) => n.id === 'section:history');
    const firstRolled = history.children.find((n) => n.rolled);
    assert.equal(firstRolled.name, above);
    const deps = fakeDeps();
    renderTreeModel(deps.host, model, deps, {}, {});
    const rows = deps.host.children[0].children;
    const bar = rows.findIndex((r) => r.className === 'md-rollbar');
    assert.ok(bar > 0, 'a bar was drawn');
    assert.equal(rows[bar + 1].dataset.nodeId, 'feature:' + above, 'the row right after the bar is ' + above);
  });
}

test('no rollback: the bar closes the history', () => {
  const model = buildTreeModel(doc(), { authoringSystem: 'parametric-v1', rollbackIndex: 6 });
  assert.equal(model.rollbackAt, 6);
  assert.equal(model.historyCount, 6);
});

test('absorbed sketches retain their precise rollback boundary before their feature',()=>{
  const model=buildTreeModel(doc(),{authoringSystem:'parametric-v1',rollbackIndex:3});
  const loft=model.nodes.find(n=>n.id==='section:history').children.find(n=>n.targetId==='Loft');
  assert.equal(loft.rolled,true);
  assert.equal(loft.children[0].index,2);
  assert.equal(loft.children[0].rolled,false,'the sketch is built before its rolled-out feature');
  assert.equal(loft.children[0].can.rollback,true,'its menu can roll back before the sketch itself');
});

test('a row name\'s tooltip is the name it shows, and rows with buttons reserve their room', async () => {
  const model = buildTreeModel(doc(), { authoringSystem: 'parametric-v1', rollbackIndex: 6 });
  const deps = fakeDeps(), make = deps.el, reserved = [];
  deps.el = (tag, cls) => {
    const node = make(tag, cls);
    node.childNodes = node.children; // the renderer counts a row's buttons
    node.style.setProperty = (k, v) => { if (k === '--md-tree-acts') reserved.push(v); };
    return node;
  };
  renderTreeModel(deps.host, model, deps, {}, {});
  const names = [];
  const walk = (n) => { if (n.className === 'md-tree-name') names.push(n); (n.children || []).forEach(walk); };
  walk(deps.host);
  assert.ok(names.length > 3);
  for (const n of names) assert.equal(n.title, n.text, 'not the internal id');
  assert.ok(names.some((n) => n.dataset.technical), 'the id stays on the element');
  assert.ok(reserved.length > 0 && reserved.every((v) => +v > 0), 'rows with action buttons say how many');
  const { stylesSource } = await import('./helpers/styles_source.mjs');
  // The reservation is built from the same properties that size and place the
  // floating buttons, so the name ends before the actions' start edge for any count.
  const css = stylesSource();
  const prop = (name) => Number((css.match(new RegExp(name + ': (\\d+)px')) || [])[1]);
  const [inset, fade, btn, gap] = ['--md-act-inset', '--md-act-fade', '--md-act-btn', '--md-act-gap'].map(prop);
  assert.match(css, /\.md-tree-row > \.md-history-actions \{ inset-inline-end: var\(--md-act-inset\); padding-inline-start: var\(--md-act-fade\); gap: var\(--md-act-gap\); \}/);
  assert.match(css, /\.md-tree-row > \.md-history-actions > \.md-part-x \{ box-sizing: border-box; width: var\(--md-act-btn\);/);
  assert.match(css, /\.md-tree-row:is\(:hover, :focus-within, \.on\) > \.nm \{\s*padding-inline-end: calc\(var\(--md-act-inset\) \+ var\(--md-act-fade\) \+ var\(--md-tree-acts, 0\) \* \(var\(--md-act-btn\) \+ var\(--md-act-gap\)\)\);/);
  // every button fits its fixed width: the widest is the 17px rollback icon plus 3px padding a side
  assert.ok(btn >= 17 + 2 * 3, 'button width ' + btn);
  for (const n of [1, 2, 3]) {
    const reserved = inset + fade + n * (btn + gap), actions = inset + fade + n * btn + (n - 1) * gap;
    assert.ok(reserved >= actions, n + ' buttons: reserved ' + reserved + ' < actions ' + actions);
  }
});
