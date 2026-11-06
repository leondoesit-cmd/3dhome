import test from 'node:test';
import { moduleSource } from "./helpers/module_source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHistory } from '../js/edit_history.js';
import { createHistoryValuePool } from '../js/core/history_value_pool.js';
import { historyPoolRoots, retainHistoryPool } from '../js/core/history_pool_roots.js';
import { exportSpatialProject, importSpatialProject } from '../js/core/spatial_project.js';
import { ensureParametricProject, exportParametricProject, importParametricProject } from '../js/core/project.js';
import { normalizeBlueprintReference } from '../js/blueprint_trace.js';

const source = readFileSync(new URL('../js/history.js', import.meta.url), 'utf8');
function rig(code = source) {
  const S = { nodes: [{ x: 0, z: 0 }, { x: 100, z: 0 }], walls: [{ id: 1, a: 0, b: 1, tex: 'data:image/png;base64,AAAA' }],
    items: [{ id: 2, type: 'box', definitionId: 'box', x: 20 }], idc: 3, roof: null, blueprintTrace: null,
    parametric: { definitions: { box: { id: 'box', parameters: { width: { value: 20 } } } }, revision: 1 },
    workspace: { id: 'test', activeFloor: 'ground', floors: [{ id: 'ground', scene: {} }, { id: 'upper', scene: { walls: [{ id: 9 }] } }], baselines: [] } };
  const noop = () => {};
  let timer;
  let snapshots = 0;
  const context = { S, createHistory, createHistoryValuePool, historyPoolRoots, retainHistoryPool,
    exportSpatialProject: (...args) => { snapshots++; return exportSpatialProject(...args); }, importSpatialProject,
    ensureParametricProject, exportParametricProject, importParametricProject, normalizeBlueprintReference,
    structuredClone, setTimeout: fn => { timer = fn; return 1; }, clearTimeout: noop,
    mergeBaselineArchives: (a, b) => b, snapshotSmart: () => null, loadSmart: noop,
    rebuildProject: noop, FURN: {}, cancelDraftGestures: noop, captureFloor: noop,
    syncBlueprintTraceControls: noop, ensureMEP: () => S.mep ||= {}, render2D: noop,
    fillProps: noop, refreshTree: noop, withoutRoomPrompts: fn => fn(), refreshMEPPanel: noop,
    markDirty: noop, t: v => v, flabel: v => v, window: {},
  };
  vm.createContext(context);
  vm.runInContext(code.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/export /g, '') +
    '\nthis.api={H,snap,apply,captureHistorySession,restoreHistorySession,armHistoryGesture,disarmHistoryGesture,prepareHistoryGesture,beginHistory,pushHistory,commitPending,cancelPending,beginHistoryTransaction,abortHistoryTransaction,vectorById};', context);
  const api = context.api;
  return { S, context, ...api, collect: () => timer?.(), snapshots: () => snapshots, reset: () => { snapshots = 0; } };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('actual pointerDown arms without snapshots and pointercancel restores the first mutation', () => {
  const r = rig(), noop = () => {};
  const interaction = moduleSource("js/interaction.js");
  const down = interaction.slice(interaction.indexOf('  let gestureSession = null;'), interaction.indexOf('  plan.addEventListener("pointerdown", function(e)'));
  const end = interaction.slice(interaction.indexOf('  function endAction(e) {'), interaction.indexOf('  registerPlannerController({down:pointerDown'));
  Object.assign(r.context, { plan: { classList: { add: noop } }, spacePan: false, setPickSlop: noop,
    beginSnapSession: noop, inputBounds: () => ({ left: 0, top: 0 }), isElevation: () => true,
    elevationHit: () => ({ kind: 'marker', ref: { id: 10 } }), select: value => { r.S.sel = value; },
    canDrag: () => true, cancelLongPress: noop, stopAutoPan: noop, dropDragProxy: noop, endSnapSession: noop });
  vm.runInContext(down + end, r.context);
  r.H.seed(); r.reset();
  const event = { button: 1, clientX: 0, clientY: 0, preventDefault: noop };
  r.context.pointerDown(event); r.context.endAction({ type: 'pointercancel' });
  r.S.tool = 'select';
  r.context.pointerDown({ ...event, button: 0 }); r.context.endAction({ type: 'pointercancel' });
  assert.equal(r.snapshots(), 0, 'pan and unmoved selected marker never snapshot');
  const eager = r.captureHistorySession();
  r.context.pointerDown({ ...event, button: 0 });
  r.commitPending(); r.S.nodes[0].x = 99;
  r.context.endAction({ type: 'pointercancel' });
  assert.equal(r.S.nodes[0].x, 0);
  assert.deepEqual(r.H.retainedSnapshots(), [...eager.history.nodes.values()].map(node => node.snap).concat(eager.history.lastFull));
  r.reset(); r.pushHistory('after cancellation');
  assert.equal(r.snapshots(), 1, 'the ended gesture cannot capture a later edit');
});

test('armed pan and selection click take no snapshots or checkpoints', () => {
  const r = rig(); r.H.seed(); r.reset(); let captures = 0;
  const arm = () => r.armHistoryGesture(() => { captures++; r.captureHistorySession(); });
  arm(); r.disarmHistoryGesture(); // pan
  arm(); r.beginHistory(); r.cancelPending(); r.disarmHistoryGesture(); // selected object, no move
  assert.equal(captures, 0); assert.equal(r.snapshots(), 0); assert.equal(r.H.canUndo(), false);
});

for (const pending of [false, true]) test(`cancelled drag matches eager rollback, including pools and provisional=${pending}`, () => {
  const r = rig(); r.H.seed(); r.pushHistory('previous'); r.S.nodes[0].x = 10;
  r.H.undo(); // retain a redo branch
  if (pending) r.beginHistory();
  const eager = r.captureHistorySession();
  const tree = plain(r.H.tree()), undo = r.H.canUndo(), redo = r.H.canRedo();
  let saved, captures = 0;
  r.armHistoryGesture(() => { captures++; saved = r.captureHistorySession(); });
  r.beginHistory(); r.commitPending('drag');
  r.S.nodes[0].x = 200; r.S.walls[0].tex = null; r.S.workspace.floors.pop();
  r.pushHistory('provisional addition'); r.S.nodes[0].z = 70;
  r.beginHistory(); r.cancelPending();
  // Drop every root in the active tree to force checkpoint-owned pool recovery.
  r.H.clear(); r.collect();
  r.disarmHistoryGesture(); r.restoreHistorySession(saved);
  assert.equal(captures, 1); assert.equal(saved.model, eager.model);
  assert.deepEqual(saved.history, eager.history);
  assert.equal(r.S.nodes[0].x, 0); assert.equal(r.S.nodes[0].z, 0);
  assert.equal(r.S.walls[0].tex, 'data:image/png;base64,AAAA');
  assert.equal(r.S.workspace.floors[1].scene.walls[0].id, 9);
  assert.deepEqual(plain(r.H.tree()), tree);
  assert.equal(r.H.canUndo(), undo); assert.equal(r.H.canRedo(), redo);
  assert.equal(r.H.isPending(), pending);
});

test('large vectors share a token, survive undo and pool collection, and come back as the same frozen object', () => {
  const r = rig();
  r.S.blueprintTrace = normalizeBlueprintReference({ width: 1000, height: 700, cmPerPx: 1,
    vector: { segs: Array.from({ length: 100000 }, (_, i) => i), dsegs: [], texts: [] } });
  r.H.seed(); const first = r.snap();
  r.pushHistory('move'); r.S.nodes[0].x = 5;
  const second = r.snap();
  assert.equal(r.vectorById.size, 1); assert.ok(first.length < 5000); assert.ok(second.length < 5000);
  assert.equal(JSON.parse(first).blueprintTrace.vector, JSON.parse(second).blueprintTrace.vector);
  const live = r.S.blueprintTrace.vector;
  r.H.undo(); assert.equal(r.S.blueprintTrace.vector.segs.length, 100000);
  // the pool shares the checked vector: undo hands back that very object (blueprint_trace keys its Path2D on it)
  assert.equal(r.S.blueprintTrace.vector, live); assert.ok(Object.isFrozen(live) && Object.isFrozen(live.segs));
  r.H.redo(); assert.equal(r.S.blueprintTrace.vector, live); r.H.undo();
  assert.equal(r.vectorById.size, 1); r.snap(); assert.equal(r.vectorById.size, 1);
  const saved = r.captureHistorySession(true), token = JSON.parse(saved.model).blueprintTrace.vector;
  assert.throws(() => { r.S.blueprintTrace.vector.segs[0] = -99; }, TypeError, 'a checked vector cannot be edited in place');
  assert.equal(r.vectorById.get(token).segs[0], 0);
  r.S.blueprintTrace = null; r.H.clear(); r.collect(); assert.equal(r.vectorById.size, 0);
  r.restoreHistorySession(saved); assert.equal(r.S.blueprintTrace.vector.segs[0], 0);
  // a portable checkpoint carries a structured clone; restoring it pools the checked, frozen copy
  const restored = r.S.blueprintTrace.vector; assert.ok(Object.isFrozen(restored)); assert.equal(r.vectorById.get(token), restored);
  assert.equal(JSON.parse(r.snap()).blueprintTrace.vector, token);
  r.S.blueprintTrace = { ...r.S.blueprintTrace, vector: { segs: [0, 0, 1, 1], texts: [], dsegs: [] } };
  assert.notEqual(JSON.parse(r.snap()).blueprintTrace.vector, token);
});

test('immediate serialization is byte-identical to the old detached snapshot path', () => {
  const old = rig(source.replace('exportSpatialProject(S, { detached: false })', 'exportSpatialProject(S)')
    .replace('parametric: { schemaVersion: project.schemaVersion, definitions: project.definitions, revision: project.revision }', 'parametric: exportParametricProject(S)'));
  const fast = rig();
  for (const r of [old, fast]) r.S.surveyFeatures = [{ id: 'survey:1', kind: 'point', points: [{ x: 4, y: 0, z: 5 }] }];
  assert.equal(fast.snap(), old.snap());
  assert.equal(JSON.parse(fast.snap()).spatial.surveyFeatures.length, 1);
  assert.deepEqual(fast.captureHistorySession().pools.definitions, old.captureHistorySession().pools.definitions);
});

test('spatial export remains detached by default and immediate view retains live arrays', () => {
  const r = rig(), detached = exportSpatialProject(r.S), immediate = exportSpatialProject(r.S, { detached: false });
  assert.equal(JSON.stringify(detached), JSON.stringify(immediate));
  assert.equal(immediate.walls, r.S.walls); assert.notEqual(detached.walls, r.S.walls);
  detached.walls[0].tex = 'changed'; assert.equal(r.S.walls[0].tex, 'data:image/png;base64,AAAA');
});
