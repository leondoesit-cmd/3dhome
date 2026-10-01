import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transitionExtrudeProjection} from '../js/core/extrude_projection_transition.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {shapeMassProperties} from '../js/cad_kernel.js';
import {rebuildParametricDocument} from '../js/core/parametric_rebuild.js';

test('editing a merged browser boss into a new body retains both bodies and downstream cuts',async()=>{
  const document=JSON.parse(readFileSync(new URL('../artifacts/planchard/CSWA-Q4-fresh-sharp-2026-09-30.mforge',import.meta.url),'utf8')).mainModel;
  document.rollback=document.parts.length;
  const feature=document.features[2],host=document.parts[0],original=structuredClone(document);
  feature.params.mergeResult=false;
  const changed=transitionExtrudeProjection(document,feature);
  assert.equal(changed.length,2);
  assert.equal(document.parts.length,2);
  assert.equal(document.rollback,2,'the full-history compatibility projection does not hide the new second body');
  const pad=document.parts[1];
  assert.equal(host.merges3d.length,0);
  assert.deepEqual(host.cuts3d.map(item=>item.featureId),[document.features[1].id]);
  assert.deepEqual(pad.cuts3d.map(item=>item.featureId),document.features.slice(3).map(item=>item.id));
  assert.equal(pad.featureId,feature.id);
  assert.equal(pad.sketchId,feature.params.sketchId);
  assert.equal(pad.density,2.8);
  assert.deepEqual(transitionExtrudeProjection(document,feature),[],'repainting is idempotent');
  const preview=rebuildParametricDocument(document,{});
  assert.equal(preview.bodies.length,2,'the separate boss depends on the ramp without consuming it');
  let compiled=compileKernelFeatureTree(document);
  assert.equal(compiled.ok,true);
  let run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.deepEqual(run.issues,[]);
    const ramp=await shapeMassProperties(run.results.get(document.features[1].id));
    const mount=await shapeMassProperties(run.results.get(document.features.at(-1).id));
    assert.ok(ramp.volume>0&&mount.volume>0,'both independent body heads rebuild as closed solids');
    assert.ok(ramp.volume+mount.volume>1229.369,'separate solids include their intentional overlapping material');
  } finally {releaseRegeneration(run);}
  feature.params.mergeResult=true;
  assert.deepEqual(transitionExtrudeProjection(document,feature),[host]);
  assert.equal(document.parts.length,1);
  assert.equal(document.rollback,1);
  assert.equal(host.merges3d.length,1);
  assert.deepEqual(host.cuts3d,original.parts[0].cuts3d);
  compiled=compileKernelFeatureTree(document);
  run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.deepEqual(run.issues,[]);
    const mass=await shapeMassProperties(run.results.get(document.features.at(-1).id));
    assert.ok(Math.abs(mass.volume-1229.369)<.001,'rejoining restores the exact original union');
  } finally {releaseRegeneration(run);}
});
