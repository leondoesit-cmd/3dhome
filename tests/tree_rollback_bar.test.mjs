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
