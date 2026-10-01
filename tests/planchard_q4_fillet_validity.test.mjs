import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';

test('browser-authored Q4 interacting fillets normalize redundant Boolean boundaries into a closed solid',async()=>{
  const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/CSWA-Q4-fresh-unaccepted-2026-09-30.mforge',import.meta.url),'utf8'));
  const compiled=compileKernelFeatureTree(bundle.mainModel);
  assert.equal(compiled.ok,true);
  const last=compiled.features.at(-1);
  assert.equal(last.type,'fillet');
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.issues.some(issue=>issue.code==='regeneration-failed'),false,JSON.stringify(run.issues));
    const finished=run.results.get(last.id);
    assert.ok(finished?.shape,'normalization makes the chosen contours usable');
    const finishedMass=await shapeMassProperties(finished);
    assert.ok(Math.abs(finishedMass.volume-1227.6093488556132)<.001,'the repaired result remains a measurable closed solid');
    const prior=run.results.get(last.inputs[0]);
    assert.ok(prior?.shape,'the usable sharp body remains available');
    const mass=await shapeMassProperties(prior);
    assert.ok(Math.abs(mass.volume-1229.369)<.001,'the original closed body remains measurable');
  } finally {releaseRegeneration(run);}
});

test('an impossible Q4 fillet remains failed after normalization and keeps its prior solid',async()=>{
  const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/CSWA-Q4-fresh-unaccepted-2026-09-30.mforge',import.meta.url),'utf8'));
  const compiled=compileKernelFeatureTree(bundle.mainModel),last=compiled.features.at(-1);
  last.params.radius=10;
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.results.has(last.id),false);
    assert.ok(run.issues.some(issue=>issue.code==='regeneration-failed'&&issue.feature===last.id));
    const prior=await shapeMassProperties(run.results.get(last.inputs[0]));
    assert.ok(Math.abs(prior.volume-1229.369)<.001);
  } finally {releaseRegeneration(run);}
});
