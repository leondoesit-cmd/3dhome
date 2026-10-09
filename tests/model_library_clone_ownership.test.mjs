import test from 'node:test';
import assert from 'node:assert/strict';
import {saveModelLibrary,loadModelLibrary,putModelLibraryRecord,putAssemblyLibraryRecord,saveAssemblyLibrary,loadAssemblyLibrary} from '../js/core/model_library_store.js';

test('a keyed model save avoids a third full-library clone while isolating returned records and input',async()=>{
 const initial=[{key:'large-one',nested:{values:Array.from({length:1024},(_,i)=>i)}},{key:'large-two',nested:{value:2}}];
 await saveModelLibrary(initial);const next={key:'large-one',nested:{values:[4,5,6]}};
 const nativeClone=globalThis.structuredClone;let libraryCopies=0;
 globalThis.structuredClone=value=>{const records=Array.isArray(value)?value:value?.records;if(records?.some(record=>record?.key==='large-two'))libraryCopies++;return nativeClone(value);};
 let result;try{result=await putModelLibraryRecord(next,{expected:initial[0]});}finally{globalThis.structuredClone=nativeClone;}
 assert.equal(result.ok,true);assert.equal(libraryCopies,2,'isolate transaction input and internal cache, without cloning the same result again');
 next.nested.values[0]=999;result.records[0].nested.values[0]=123;result.puts[0].nested.values[1]=456;result.records[1].nested.value=789;
 const stored=await loadModelLibrary();assert.deepEqual(stored,[{key:'large-one',nested:{values:[4,5,6]}},{key:'large-two',nested:{value:2}}]);
 const conflict=await putModelLibraryRecord({key:'large-one',nested:{values:[10]}},{expected:initial[0]});assert.equal(conflict.conflict,true);
 conflict.records[0].nested.values[0]=100;assert.deepEqual(await loadModelLibrary(),stored);
});

test('assembly keyed results preserve caller isolation and optimistic conflict checks',async()=>{
 const first={key:'a',components:[{id:'one',transform:{x:1}}]};await saveAssemblyLibrary([first]);
 const next={key:'a',components:[{id:'one',transform:{x:2}}]},result=await putAssemblyLibraryRecord(next,{expected:first});
 result.records[0].components[0].transform.x=50;next.components[0].transform.x=60;
 assert.equal((await loadAssemblyLibrary())[0].components[0].transform.x,2);
 const conflict=await putAssemblyLibraryRecord(first,{expected:first});assert.equal(conflict.conflict,true);
 conflict.records[0].components[0].transform.x=70;assert.equal((await loadAssemblyLibrary())[0].components[0].transform.x,2);
});
