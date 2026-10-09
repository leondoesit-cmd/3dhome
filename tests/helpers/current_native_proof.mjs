import assert from 'node:assert/strict';
import {compileKernelFeatureTree} from '../../js/core/kernel_feature_adapter.js';
import {captureExactTopology} from '../../js/core/exact_topology_cache.js';
import {interferenceDocument} from '../../js/core/worker_interference.js';
import {regenerateFeatures,releaseRegeneration} from '../../js/cad_feature_tree.js';

// Test-local proof must come from today's kernel, never rewritten old signatures.
export async function currentNativeFixtureProof(document){
 const before=JSON.stringify(document),compiled=compileKernelFeatureTree(interferenceDocument(document));
 assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
 const run=await regenerateFeatures({...compiled.document,features:compiled.features});
 try{assert.equal(run.ok,true,JSON.stringify(run.issues));assert.ok(run.finalShape?.shape,'fixture has a final native body');
  const proof=captureExactTopology(document,compiled.features,run);
  assert.equal(JSON.stringify(document),before,'proof regeneration never edits fixture authoring');return proof;
 }finally{releaseRegeneration(run);}
}
