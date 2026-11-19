import { modelerSource } from "./helpers/modeler_source.mjs";
import fs from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';
test('mate topology is reused only while exact cache and authoring identities are unchanged',()=>{
 const source=modelerSource();
 const body=source.slice(source.indexOf('function finalMateTopology(document) {'),source.indexOf('function assemblyMateInspector() {'));
 let compiles=0;
 const read=new Function('mateTopologyMemo','compileKernelFeatureTree','interferenceDocument','verifiedFinalTopology',body+'; return finalMateTopology;')(new WeakMap(),()=>{compiles++;return {ok:true,features:[]};},d=>d,()=>['face']);
 const doc={exactTopologyCache:{},history:[{}],features:[],sketches:[]};
 assert.deepEqual(read(doc),['face']);assert.deepEqual(read(doc),['face']);assert.equal(compiles,1);
 doc.exactTopologyCache={};read(doc);assert.equal(compiles,2);
 doc.history.push({});read(doc);assert.equal(compiles,3);
 doc.features=[];read(doc);assert.equal(compiles,4);
});
