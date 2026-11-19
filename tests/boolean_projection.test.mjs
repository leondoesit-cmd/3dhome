import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateBooleanProjections} from '../js/core/boolean_projection.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {historyEntryRolled} from '../js/core/parametric_document.js';
import {leavesInputStanding} from '../js/core/rebuild.js';

const source=modelerSource();
const start=source.indexOf('function cutTargetFeatureId('),end=source.indexOf('\n/* Bodies come only',start);
const head=vm.runInNewContext('('+source.slice(start,end).replace('document = E.def','document')+')',{historyEntryRolled,leavesInputStanding,Set,Map});
function fixture(){
  const features=[{id:'ramp',type:'extrude',inputs:[]},{id:'pad',type:'extrude',inputs:[],params:{mergeResult:false}},
    {id:'join',type:'boolean',inputs:['ramp','pad'],params:{keepTools:false},state:'rebuilt'},
    {id:'round',type:'fillet',inputs:['join']}];
  return {features,history:features.map(feature=>({kind:'feature',targetId:feature.id})),parts:[{featureId:'ramp'},{featureId:'pad'}]};
}
test('Combine and its later finishes display and measure a common result once',()=>{
  const document=fixture();
  assert.equal(head(document.parts[0],document),'round');
  assert.equal(head(document.parts[1],document),'round');
  assert.equal(deduplicateBooleanProjections(document.parts,document,head).length,1);
  assert.equal(document.parts.length,2,'rollback source records remain intact');
});
test('failed or rolled-back Combine keeps its two source projections available',()=>{
  const document=fixture();document.features[2].state='failed';
  assert.equal(deduplicateBooleanProjections(document.parts,document,head).length,2);
  document.features[2].state='rebuilt';document.rollbackIndex=2;
  assert.equal(head(document.parts[0],document),'ramp');
  assert.equal(head(document.parts[1],document),'pad');
  assert.equal(deduplicateBooleanProjections(document.parts,document,head).length,2);
});
test('Keep tool bodies does not replace the tool with the combined result',()=>{
  const document=fixture();document.features[2].params.keepTools=true;
  assert.equal(head(document.parts[1],document),'pad');
  assert.equal(deduplicateBooleanProjections(document.parts,document,head).length,2);
});

test('seed-only mirror is the displayed and measured body head, with rollback and suppression respected',()=>{
  const features=[{id:'base',type:'extrude',inputs:[],params:{}},{id:'rib',type:'extrude',inputs:['base'],params:{mergeResult:true}},
    {id:'reflection',type:'mirror',inputs:['rib'],params:{scope:'feature',seedFeatureId:'rib'}}];
  const document={features,history:features.map(feature=>({kind:'feature',targetId:feature.id}))};
  assert.equal(head({featureId:'base'},document),'reflection');
  features[2].suppressed=true;
  assert.equal(head({featureId:'base'},document),'rib');
  features[2].suppressed=false;document.rollbackIndex=2;
  assert.equal(head({featureId:'base'},document),'rib');
  delete document.rollbackIndex;features[2].params.scope='body';
  assert.equal(head({featureId:'base'},document),'rib','whole-body reflection has its own display projection');
});
