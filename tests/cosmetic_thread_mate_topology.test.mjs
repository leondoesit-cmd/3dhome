import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {captureExactTopology,verifiedFinalTopology} from '../js/core/exact_topology_cache.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {exactMateReferenceChoices} from '../js/cad_mate_reference_choices.js';
import {interferenceDocument} from '../js/core/worker_interference.js';

const fixture=()=>JSON.parse(fs.readFileSync(new URL('./fixtures/clamp-lead-screw-browser-recipe.json',import.meta.url),'utf8'));

test('saved fresh lead screw trailing cosmetic thread preserves verified native cylindrical mate references',()=>{
  const document=fixture(),compiled=compileKernelFeatureTree(interferenceDocument(document));
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const entries=verifiedFinalTopology(document,compiled.features);
  assert.ok(entries.length>0,'saved exact native faces are available before an assembly display restore');
  const choices=exactMateReferenceChoices(entries,document.features,'mm');
  assert.ok(choices.some(choice=>choice.entry.kind==='face' && choice.entry.descriptor.surface==='cylinder'
    && Math.abs(choice.entry.descriptor.radius-.4)<1e-8),'actual Ø8 shaft cylinder is selectable');
  assert.ok(choices.some(choice=>choice.entry.kind==='axis'),'native cylindrical axes remain available');
  document.features[0].params.depth+=.001;
  assert.deepEqual(verifiedFinalTopology(document,compileKernelFeatureTree(document).features),[],'geometry edits still expire the native proof');
});

test('native Refresh exact mate references rebuilds a cosmetic-threaded lead screw into reachable final body faces',async()=>{
  const document=fixture();delete document.exactTopologyCache;
  const compiled=compileKernelFeatureTree(interferenceDocument(document)),run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try {
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    document.exactTopologyCache=captureExactTopology(document,compiled.features,run);
    const entries=verifiedFinalTopology(document,compiled.features);
    assert.ok(entries.length>0);
    assert.ok(exactMateReferenceChoices(entries,document.features,'mm').some(choice=>choice.entry.kind==='face'
      && choice.entry.descriptor.surface==='cylinder' && Math.abs(choice.entry.descriptor.radius-.4)<1e-8));
    assert.ok(entries.every(entry=>!entry.ownerFeatureId.startsWith(document.features.at(-1).id)),
      'annotation does not supply an invented face or replace the actual body');
  } finally {releaseRegeneration(run);}
});

for(const type of ['thread','knurl','helix'])test(type+' cosmetic detail leaves the surviving native support topology available',()=>{
  const document={parameters:{},sketches:[]},features=[{id:'solid',type:'extrude',params:{depth:1},inputs:[]},
    {id:'annotation',type,params:{mode:'cosmetic'},inputs:['solid']}];
  document.exactTopologyCache=captureExactTopology(document,features,{results:new Map([
    ['solid',{shape:{},topology:[{kind:'face',persistentId:'native-face'}]}],
    ['annotation',{kind:'annotation',topology:[]}]
  ])});
  assert.deepEqual(verifiedFinalTopology(document,features).map(entry=>entry.persistentId),['native-face']);
});
