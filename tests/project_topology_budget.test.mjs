import test from 'node:test';
import assert from 'node:assert/strict';
import {compactDocumentTopologySnapshots,compactAssemblyTopologySnapshots} from '../js/core/project_topology_budget.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

test('large project snapshots retain final and explicitly referenced topology without changing geometry',()=>{
  const cache=Object.fromEntries(['base','middle','final'].map(id=>[id,{signature:id,topology:[{persistentId:id,data:'x'.repeat(300)}]}]));
  const document={parts:[{id:'solid',meshData:{positions:[1,2,3]}}],sketches:[{id:'sketch',points:[],entities:[],constraints:[],support:{ownerFeatureId:'base'}}],
    features:[{id:'base',type:'box',params:{w:3,h:2,d:1}},{id:'middle',type:'extrudeCut',inputs:['base'],params:{depth:1},references:{sketches:['sketch'],features:['base']}},{id:'final',type:'extrudeCut',inputs:['middle'],params:{depth:1},references:{sketches:['sketch'],features:['middle']}}],
    history:[{kind:'feature',targetId:'base'},{kind:'sketch',targetId:'sketch'},{kind:'feature',targetId:'middle'},{kind:'feature',targetId:'final'}],exactTopologyCache:cache};
  const result=compactDocumentTopologySnapshots(document,100);
  assert.equal(compileKernelFeatureTree(document).ok,true,'compaction fixture has a valid body-before-face-sketch history');
  assert.deepEqual(Object.keys(result.exactTopologyCache).sort(),['base','final']);
  assert.equal(result.parts,document.parts);assert.equal(result.features,document.features);assert.equal(result.sketches,document.sketches);
  assert.equal(Object.keys(document.exactTopologyCache).length,3,'live authoring cache is not pruned by export');
  const assembly={components:[{id:'occurrence',def:document}]};
  assert.deepEqual(Object.keys(compactAssemblyTopologySnapshots(assembly,100).components[0].def.exactTopologyCache).sort(),['base','final']);
  const missingFinal={...document,exactTopologyCache:{base:cache.base,middle:cache.middle}};
  assert.equal(compactDocumentTopologySnapshots(missingFinal,100),missingFinal,'a cache with no identifiable final head remains intact');
  const invalid={...document,history:[document.history[1],document.history[0],...document.history.slice(2)]};
  assert.equal(compileKernelFeatureTree(invalid).ok,false);
  assert.equal(compactDocumentTopologySnapshots(invalid,100),invalid,'invalid associative history fails closed rather than pruning unknown topology');
});
