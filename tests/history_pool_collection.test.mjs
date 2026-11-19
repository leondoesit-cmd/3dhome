import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../js/edit_history.js';
import { createHistoryValuePool } from '../js/core/history_value_pool.js';
import { historyPoolRoots } from '../js/core/history_pool_roots.js';

test('pool cleanup preserves branches, live model, and independent saved checkpoints', () => {
  const pool = createHistoryValuePool();
  let model = { revision: 0, data: 'x'.repeat(1000) };
  const get = () => JSON.stringify({ parametric: pool.pack(model) });
  const set = value => { model = pool.unpack(JSON.parse(value).parametric); };
  const history = createHistory({ get, set, cap: 4 });
  history.seed();
  history.push('one'); model = { ...model, revision: 1 };
  history.push('two'); model = { ...model, revision: 2 };
  history.undo();
  history.push('branch'); model = { ...model, revision: 3 };
  const saved = history.saveSession();
  const checkpoint = pool.entries(historyPoolRoots(history.retainedSnapshots()));
  function collect() { pool.retain(historyPoolRoots(history.retainedSnapshots().concat(get()))); }
  collect(); history.undo(); assert.equal(model.revision, 1);
  history.redo(); assert.equal(model.revision, 3);
  for (let i = 4; i < 100; i++) { history.push('edit'); model = { ...model, revision: i }; }
  const before = pool.entries().length;
  collect(); assert.ok(before > 90); assert.ok(pool.entries().length <= 6);
  pool.restore(checkpoint); set(saved.nodes.get(saved.pos).snap); history.loadSession(saved);
  history.undo(); assert.equal(model.revision, 1);
  history.redo(); assert.equal(model.revision, 3);
});

test('restored definition tokens cannot collide with new allocations', () => {
  const pool = createHistoryValuePool(); pool.restore([['@model-history:900', '{"x":1}']]);
  assert.equal(pool.pack({ x: 1 }), '@model-history:900');
  assert.equal(pool.pack({ x: 2 }), '@model-history:901');
});

test('checkpoint token collisions remove reverse aliases from the previous session', () => {
  const pool=createHistoryValuePool();
  const token=pool.pack({x:1});
  pool.restore([[token,'{"x":2}']]);
  assert.deepEqual(pool.unpack(pool.pack({x:1})),{x:1});
  assert.deepEqual(pool.unpack(token),{x:2});
});
