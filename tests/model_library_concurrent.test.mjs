import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearMemoryModelLibrary, loadModelLibrary, loadAssemblyLibrary,
  putModelLibraryRecord, deleteModelLibraryRecord, mergeStoredModelLibrary,
  putAssemblyLibraryRecord, deleteAssemblyLibraryRecord, mergeStoredAssemblyLibrary,
} from '../js/core/model_library_store.js';
import { forkConflictingModel } from '../js/core/model_save_conflict.js';

test('separate tab snapshots save independent model keys without deleting either', async () => {
  clearMemoryModelLibrary();
  const tabA = await loadModelLibrary();
  const tabB = await loadModelLibrary();
  assert.deepEqual(tabA, tabB);
  assert.equal((await putModelLibraryRecord({key:'bulb',name:'BULB'},{expected:null})).ok,true);
  assert.equal((await putModelLibraryRecord({key:'switch',name:'SWITCH'},{expected:null})).ok,true);
  assert.deepEqual((await loadModelLibrary()).map((item)=>item.key),['bulb','switch']);
});

test('stale same-model save is rejected and does not overwrite a newer version', async () => {
  clearMemoryModelLibrary();
  const original={key:'bulb',name:'BULB',parts:[{id:'first'}]};
  await putModelLibraryRecord(original,{expected:null});
  const tabA=(await loadModelLibrary())[0];
  const tabB=(await loadModelLibrary())[0];
  const newer={...tabA,parts:[{id:'newer'}]};
  assert.equal((await putModelLibraryRecord(newer,{expected:tabA})).ok,true);
  const rejected=await putModelLibraryRecord({...tabB,parts:[{id:'stale'}]},{expected:tabB});
  assert.equal(rejected.ok,false);
  assert.equal(rejected.conflict,true);
  assert.deepEqual((await loadModelLibrary())[0].parts,newer.parts);
});

test('a live conflicting edit can be saved under a new key without replacing the other tab', async () => {
  clearMemoryModelLibrary();
  const original={key:'lenscap',id:'lenscap',definitionId:'lenscap',name:'LENSCAP',
    sketches:[{id:'s1',entities:[{id:'circle'}]}],features:[{id:'f1',kind:'extrude'}]};
  await putModelLibraryRecord(original,{expected:null});
  const baseline=(await loadModelLibrary())[0];
  const live=structuredClone(baseline);
  live.sketches[0].entities.push({id:'new-live-line'});
  live.features.push({id:'f2',kind:'shell'});
  const otherTab={...baseline,name:'LENSCAP from other tab'};
  assert.equal((await putModelLibraryRecord(otherTab,{expected:baseline})).ok,true);
  assert.equal((await putModelLibraryRecord(live,{expected:baseline})).conflict,true);
  const copy=forkConflictingModel(live,'lenscap-copy','LENSCAP recovered copy');
  assert.equal((await putModelLibraryRecord(copy,{expected:null})).ok,true);
  const saved=await loadModelLibrary();
  assert.deepEqual(saved.find(item=>item.key==='lenscap'),otherTab);
  assert.deepEqual(saved.find(item=>item.key==='lenscap-copy'),copy);
  assert.equal(copy.id,'lenscap-copy');
  assert.equal(copy.definitionId,'lenscap-copy');
  assert.equal(copy.features[1].id,'f2');
  assert.equal(live.key,'lenscap');
});

test('a legacy restored draft without a baseline can save as copy without overwriting its saved key', async () => {
  clearMemoryModelLibrary();
  const saved={key:'lenscap',name:'LENSCAP saved',features:[{id:'base'}]};
  await putModelLibraryRecord(saved,{expected:null});
  const recovered={key:'lenscap',name:'LENSCAP live draft',features:[{id:'base'},{id:'new-cut'}]};
  assert.equal((await putModelLibraryRecord(recovered,{expected:null})).conflict,true);
  const copy=forkConflictingModel(recovered,'lenscap-recovered','LENSCAP recovered');
  assert.equal((await putModelLibraryRecord(copy,{expected:null})).ok,true);
  assert.deepEqual((await loadModelLibrary()).find(item=>item.key==='lenscap'),saved);
  assert.deepEqual((await loadModelLibrary()).find(item=>item.key==='lenscap-recovered').features,recovered.features);
});

test('explicit delete and import merge retain unrelated model keys', async () => {
  clearMemoryModelLibrary();
  await putModelLibraryRecord({key:'bulb',name:'BULB'},{expected:null});
  await putModelLibraryRecord({key:'switch',name:'SWITCH'},{expected:null});
  const imported=await mergeStoredModelLibrary([{key:'bulb',name:'BULB imported'},{key:'ring',name:'RING'}],{conflict:'keep-both'});
  assert.equal(imported.ok,true);
  assert.deepEqual((await loadModelLibrary()).map((item)=>item.key),['bulb','switch','bulb-2','ring']);
  await deleteModelLibraryRecord('switch');
  assert.deepEqual((await loadModelLibrary()).map((item)=>item.key),['bulb','bulb-2','ring']);
});

test('assembly saves use the same keyed cross-tab behavior', async () => {
  clearMemoryModelLibrary();
  const a={key:'assembly-a',name:'A'};
  await putAssemblyLibraryRecord(a,{expected:null});
  await putAssemblyLibraryRecord({key:'assembly-b',name:'B'},{expected:null});
  assert.deepEqual((await loadAssemblyLibrary()).map((item)=>item.key),['assembly-a','assembly-b']);
  await mergeStoredAssemblyLibrary([{key:'assembly-a',name:'updated'}],{conflict:'replace'});
  assert.equal((await loadAssemblyLibrary()).find((item)=>item.key==='assembly-a').name,'updated');
  assert.equal((await putAssemblyLibraryRecord({...a,name:'stale'},{expected:a})).conflict,true);
  await deleteAssemblyLibraryRecord('assembly-b');
  assert.deepEqual((await loadAssemblyLibrary()).map((item)=>item.key),['assembly-a']);
});
