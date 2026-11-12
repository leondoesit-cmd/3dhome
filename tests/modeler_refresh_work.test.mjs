import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sourceFunctionText } from './helpers/source_function.mjs';

const source = modelerSource();
function refreshFixture() {
  const work = { solves: 0, builds: 0, selections: 0, supportSyncs: 0, historySyncs: 0 }, E = { mode: '3d', docType: 'assembly', assembly: { components: [] } };
  const context = { E, root: null, assemblySolveFresh: false, assemblyPreviewSolved: false, coreRunFresh: false, histPanel: null,
    applyAssemblyMates() { work.solves++; }, syncFaceSupportedSketchFrames() { work.supportSyncs++; },
    isCanonicalAuthoring: () => false, syncPreviewFromHistory() { work.historySyncs++; },
    refreshViewportSelection() { work.selections++; }, addExplodeLeaders() {}, addInterferenceVisuals() {},
    updatePreview() { work.builds++; context.buildAssembly({ add() {} }); } };
  for (const name of ['syncAssemblyContextBar', 'refreshParts', 'refreshModelHistoryPane', 'fillInspector', 'drawSketch', 'syncStatus', 'syncHint',
    'syncFacePrompt', 'syncExtrudeButton', 'syncActiveFeatureSelectionFeedback', 'syncMassPropertiesEvaluation',
    'syncAuthoringWorkflow', 'syncContextActions', 'updateTourProgress', 'syncModelerMobile']) context[name] = () => {};
  vm.createContext(context);
  vm.runInContext(['refreshAll', 'refreshSelection', 'buildAssembly'].map(name => sourceFunctionText(source, name)).join('\n'), context);
  return { context, work };
}

test('full assembly refresh solves once and standalone construction still solves fresh poses', () => {
  const { context, work } = refreshFixture();
  context.refreshAll(); assert.equal(work.solves, 1); assert.equal(work.builds, 1);
  context.assemblySolveFresh = true; context.refreshAll();
  assert.equal(work.solves, 1, 'an explicit solve is consumed by the next full refresh');
  assert.equal(context.assemblySolveFresh, false);
  context.buildAssembly({ add() {} }); assert.equal(work.solves, 2, 'a separate construction cannot inherit refresh reuse');
  context.refreshAll(); assert.equal(work.solves, 3, 'subsequent edits still solve');
});

test('selection updates controls without solving, syncing supports or rebuilding geometry', () => {
  const { context, work } = refreshFixture();
  context.refreshAll(); const baseline = { ...work };
  for (let index = 0; index < 20; index++) context.refreshSelection();
  assert.equal(work.selections, 20);
  for (const key of ['solves', 'builds', 'supportSyncs', 'historySyncs']) assert.equal(work[key], baseline[key]);
  context.refreshAll(); assert.equal(work.solves, baseline.solves + 1); assert.equal(work.builds, baseline.builds + 1);
});

test('a failed panel refresh cannot leave assembly rendering marked solved', () => {
  const { context, work } = refreshFixture();
  context.fillInspector = () => { throw new Error('Panel failure'); };
  assert.throws(() => context.refreshAll(), /Panel failure/);
  assert.equal(context.assemblyPreviewSolved, false);
  context.buildAssembly({ add() {} }); assert.equal(work.solves, 2);
});

test('2D and 3D sketch selection retain working-geometry reconciliation without repeating the core rebuild', () => {
  for (const [mode, modelPlaneActive] of [['2d', false], ['3d', true]]) {
    const { context, work } = refreshFixture();
    Object.assign(context.E, { mode, modelPlaneActive });
    context.isCanonicalAuthoring = () => true;
    context.rebuildParametricDocument = () => { throw new Error('selection must reuse its existing core run'); };
    context.refreshSelection();
    assert.equal(work.supportSyncs, 1); assert.equal(work.historySyncs, 1);
    assert.equal(work.builds, 1); assert.equal(work.selections, 0);
    assert.equal(context.coreRunFresh, false); assert.equal(context.assemblyPreviewSolved, false);
  }
});
