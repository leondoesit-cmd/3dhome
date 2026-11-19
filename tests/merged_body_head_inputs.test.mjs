import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { bodiesFromResults, leavesInputStanding } from '../js/core/rebuild.js';

/* A merged body is ONE part whose later features (a boss, a shell) are recorded
   on it, so its featureId still names the first feature. A creator that feeds
   that id to the new feature starts a second branch from Base Extrude, and the
   tree shows an extra solid body — HOUSING's Draft1 did exactly that. Every
   creator that acts on the body as a whole takes the body's head instead. */

const src = modelerSource();
const fn = (name) => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  let depth = 0, end = src.indexOf('{', start);
  for (let i = end; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  return src.slice(start, end);
};

const NAMES = ['cutTargetFeatureId', 'quickThickenPart', 'createRibFeature', 'quickMirrorPart', 'quickMoveBodyPart', 'quickSplitBodyPart'];

const bench = () => {
  const def = {
    parts: [],
    history: [],
    features: [
      { id: 'base', type: 'extrude', params: {}, inputs: [] },
      { id: 'boss', type: 'extrude', params: {}, inputs: ['base'] },
    ],
  };
  const body = { id: 'p1', kind: 'extrude', featureId: 'base' };
  def.parts.push(body);
  let n = 0;
  const context = {
    E: { def, sel: body, authoring: {} },
    H: { discard() {} },
    structuredClone,
    selectedSolid: () => body,
    partSupportsExactMesh: () => true,
    featureDefaults: () => ({ thickness: 1, dx: 5, offset: 5, axis: 'y' }),
    finishFeatureTargets: () => [{ kind: 'face', persistentId: 'face:1' }],
    pushUndo() {}, flash() {}, queueExactMesh() {}, refreshAll() {}, recordSketchInHistory() {},
    t: (key) => key, tf: (key) => key,
    isCanonicalAuthoring: () => true,
    createFeatureDefinition: (doc, type, spec) => { const feature = { id: type + ++n, type, ...spec }; doc.features.push(feature); return feature; },
    historyEntryRolled: () => false,
    leavesInputStanding,
    cloneData: (value) => structuredClone(value),
    resetClonedPartIdentity: (part) => ({ ...structuredClone(part), id: 'p' + ++n, featureId: 'clone' + n }),
    mirrorProjectionPart: (part) => part,
    addPart: (part) => def.parts.push(part),
    partBounds: () => ({ x0: 0, x1: 10, y0: 0, y1: 10, z0: 0, z1: 10 }),
    ensureSketch: () => ({ id: 'sketch1', plane: 'xy', offset: 0 }),
    analyzeSketchChains: () => ({ chains: [{ entityIds: ['rib-line'], points: [{ u: 0, v: 0 }, { u: 5, v: 5 }] }] }),
    selEntities: () => [], planeAxis: () => 'z', activeParts: () => [body],
  };
  vm.createContext(context);
  vm.runInContext(NAMES.map(fn).join('\n') +'\nthis.api={' + NAMES.join(',') + '};', context);
  const api = context.api;
  const head = (part) => api.cutTargetFeatureId(part, def);
  const created = () => def.features[def.features.length - 1];
  return { def, body, api, head, created };
};

test('Thicken on a merged body thickens the body as it stands, not Base Extrude', () => {
  const { body, api, head, created } = bench();
  assert.equal(head(body), 'boss');
  assert.equal(api.quickThickenPart({ thickness: 1 }), true);
  const thicken = created();
  assert.deepEqual([...thicken.inputs], ['boss']);
  assert.deepEqual([...thicken.references.features], ['boss']);
  assert.equal(head(body), thicken.id, 'the thicken is now the head, so the body is still one branch');
  api.quickThickenPart({ thickness: 2 });
  assert.deepEqual([...created().inputs], [thicken.id], 'a second thicken follows the first');
});

test('Rib braces the merged body as it stands, and a later step follows the rib', () => {
  const { body, api, head, created } = bench();
  assert.equal(api.createRibFeature({ thickness: 1 }), true);
  const rib = created();
  assert.deepEqual([...rib.inputs], ['boss']);
  assert.deepEqual([...rib.references.features], ['boss']);
  assert.deepEqual([...rib.params.chainEntityIds], ['rib-line'], 'the rib retains its driving open path');
  assert.equal(head(body), rib.id);
  api.quickThickenPart({ thickness: 2 });
  assert.deepEqual([...created().inputs], [rib.id], 'the next modifier follows the rib result');
});

test('Move Body and Split Body take the merged body head', () => {
  const moved = bench();
  assert.equal(moved.api.quickMoveBodyPart({ dx: 5 }), true);
  assert.deepEqual([...moved.created().inputs], ['boss']);
  const split = bench();
  assert.equal(split.api.quickSplitBodyPart({ offset: 5, axis: 'y' }), true);
  const rows = split.def.features.filter((feature) => feature.type === 'splitBody');
  assert.equal(rows.length, 2);
  rows.forEach((row) => assert.deepEqual([...row.inputs], ['boss'], 'both halves are cut from the whole body'));
});

test('Move Body with Copy leaves the original standing: its head stays put and both bodies are published', () => {
  const built = (def) => new Map(def.features.map((feature) => [feature.id, { kind: 'feature', type: feature.type }]));
  const copied = bench();
  assert.equal(copied.api.quickMoveBodyPart({ dx: 5, copy: true }), true);
  const row = copied.created(), copy = copied.def.parts[1];
  assert.equal(copy.derivedFeatureId, row.id, 'the copy is the move row\'s body');
  assert.equal(copied.head(copied.body), 'boss', 'the original does not walk onto the copy\'s move');
  assert.equal(copied.head(copy), row.id, 'the copy starts at its move');
  assert.deepEqual(bodiesFromResults(copied.def, built(copied.def)).map((body) => body.featureId), ['boss', row.id]);
  // a document saved before copies were marked reads the same
  delete copy.derivedFeatureId;
  assert.equal(copied.head(copied.body), 'boss');
  assert.deepEqual(bodiesFromResults(copied.def, built(copied.def)).map((body) => body.featureId), ['boss', row.id]);

  const moved = bench();
  moved.api.quickMoveBodyPart({ dx: 5 });
  const step = moved.created();
  assert.equal(moved.head(moved.body), step.id, 'a plain move is still a step on the body');
  assert.deepEqual(bodiesFromResults(moved.def, built(moved.def)).map((body) => body.featureId), [step.id]);
});

test('Mirror copies the merged body as it stands', () => {
  const { api, created } = bench();
  assert.equal(api.quickMirrorPart({ planeReference: 'plane:right' }), true);
  assert.deepEqual([...created().inputs], ['boss']);
  assert.deepEqual([...created().references.features], ['boss']);
});

test('the body pattern and its live rebuild agree on the head', () => {
  assert.match(fn('quickPatternPart'), /var source=cutTargetFeatureId\(p\);\s*if\(isCanonicalAuthoring\(\)\)try\{feature=createFeatureDefinition\(E\.def,"pattern",\{inputs:\[source\]/);
  // editing a pattern or mirror finds its seed by the input, which is now the head
  assert.equal((src.match(/item\.featureId===feature\.inputs\[0\] \|\| cutTargetFeatureId\(item\)===feature\.inputs\[0\]/g) || []).length, 2);
});
