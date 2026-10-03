import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectBundle,importProjectBundleText} from '../js/cad_project_bundle.js';
const native=()=>({key:'QC04',authoringMode:'direct-only',metadata:{authoringSystem:'parametric-v1'},features:[{id:'boss',type:'extrude',params:{depth:.6}},{id:'cut1',type:'extrudeCut',inputs:['boss']},{id:'cut2',type:'extrudeCut',inputs:['cut1']},{id:'boss2',type:'extrude',inputs:['cut2']}],sketches:[1,2,3,4].map(id=>({id:'s'+id,entities:[{type:'circle',r:.3}]})),history:[1,2,3,4,5,6,7,8].map(id=>({id})),parts:[{id:'body',kind:'ext',featureId:'boss',exactPending:false,meshData:{positions:[0,0,0,1,0,0,0,1,0]}}]});
test('QC04-style native authored export refreshes stale empty-document classification without changing geometry or live mode',async()=>{
  const document=native(),before=JSON.stringify(document),bundle=await createProjectBundle(document);
  assert.equal(bundle.mainModel.authoringMode,'fully-parametric');
  const restored=await importProjectBundleText(JSON.stringify(bundle));assert.equal(restored.mainModel.authoringMode,'fully-parametric');
  for(const key of ['features','sketches','history','parts'])assert.deepEqual(restored.mainModel[key],document[key]);
  assert.equal(JSON.stringify(document),before,'export is a snapshot, not a live document edit');
});
test('authored metadata cannot upgrade true direct bodies or imports to fully parametric',async()=>{
  const direct={...native(),parts:[{id:'mesh',kind:'mesh',meshData:{positions:[0,0,0,1,0,0,0,1,0]}}]};
  assert.equal((await createProjectBundle(direct)).mainModel.authoringMode,'hybrid');
  const imported=native();imported.metadata.import={source:'STEP'};
  assert.equal((await createProjectBundle(imported)).mainModel.authoringMode,'hybrid');
  assert.equal((await createProjectBundle({parts:[],features:[],sketches:[],authoringMode:'direct-only',metadata:{authoringSystem:'parametric-v1'}})).mainModel.authoringMode,'direct-only');
});
test('catalog and external definitions retain their explicit capability contract',async()=>{
  const definition=native();definition.metadata={catalogId:'custom-recipe'};definition.authoringMode='hybrid';
  assert.equal((await createProjectBundle(definition)).mainModel.authoringMode,'hybrid');
});

test('QC01/QC03/QC04-style native histories4,6 and8 all refresh stale direct-only export metadata',async()=>{
  for(const [key,count] of [['QC01',2],['QC03',3],['QC04',4]]){
    const document=native();document.key=key;document.features=document.features.slice(0,count);document.sketches=document.sketches.slice(0,count);document.history=document.history.slice(0,count*2);
    const bundle=await createProjectBundle(document);assert.equal(bundle.mainModel.authoringMode,'fully-parametric',key);
    assert.deepEqual(bundle.mainModel.features,document.features);assert.deepEqual(bundle.mainModel.history,document.history);assert.deepEqual(bundle.mainModel.parts,document.parts);
    assert.equal(document.authoringMode,'direct-only','classification is refreshed only in the export snapshot');
  }
});
