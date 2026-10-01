import test from 'node:test';
import assert from 'node:assert/strict';
import {compactDocumentTopologySnapshots,compactAssemblyTopologySnapshots} from '../js/core/project_topology_budget.js';

test('large project snapshots retain final and explicitly referenced topology without changing geometry',()=>{
  const cache=Object.fromEntries(['base','middle','final'].map(id=>[id,{signature:id,topology:[{persistentId:id,data:'x'.repeat(300)}]}]));
  const document={parts:[{id:'solid',meshData:{positions:[1,2,3]}}],sketches:[{id:'sketch',points:[],entities:[],constraints:[],support:{ownerFeatureId:'base'}}],
    features:[{id:'base',type:'extrude',params:{depth:1},references:{sketches:['sketch']}},{id:'middle',type:'extrudeCut',inputs:['base'],params:{depth:1},references:{sketches:['sketch'],features:['base']}},{id:'final',type:'extrudeCut',inputs:['middle'],params:{depth:1},references:{sketches:['sketch'],features:['middle']}}],
    history:[{kind:'feature',targetId:'base'},{kind:'feature',targetId:'middle'},{kind:'feature',targetId:'final'}],exactTopologyCache:cache};
  const result=compactDocumentTopologySnapshots(document,100);
  assert.deepEqual(Object.keys(result.exactTopologyCache).sort(),['base','final']);
  assert.equal(result.parts,document.parts);assert.equal(result.features,document.features);assert.equal(result.sketches,document.sketches);
  assert.equal(Object.keys(document.exactTopologyCache).length,3,'live authoring cache is not pruned by export');
  const assembly={components:[{id:'occurrence',def:document}]};
  assert.deepEqual(Object.keys(compactAssemblyTopologySnapshots(assembly,100).components[0].def.exactTopologyCache).sort(),['base','final']);
  const missingFinal={...document,exactTopologyCache:{base:cache.base,middle:cache.middle}};
  assert.equal(compactDocumentTopologySnapshots(missingFinal,100),missingFinal,'a cache with no identifiable final head remains intact');
});
