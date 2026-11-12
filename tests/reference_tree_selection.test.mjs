import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('selecting a datum row replaces a previous model face pick before sketch creation',()=>{
  const source=modelerSource();
  const code=source.slice(source.indexOf('function selectTreeNode('),source.indexOf('function editTreeNode('));
  const state={topologySelection:[{kind:'face',persistentId:'old-face'}],sel:{id:'body'},ssel:[1]};
  const select=new Function('E','refreshAll',code+';return selectTreeNode;')(state,()=>{});
  select({kind:'reference',targetId:'angled-plane'},{},{ctrlKey:false});
  assert.equal(state.selectedReferenceId,'angled-plane');assert.deepEqual(state.topologySelection,[]);assert.equal(state.sel,null);assert.deepEqual(state.ssel,[]);
  state.topologySelection=[{kind:'edge',persistentId:'axis-source'}];
  select({kind:'reference',targetId:'second-plane'},{},{ctrlKey:true});
  assert.equal(state.topologySelection[0].persistentId,'axis-source','additive picks still support multi-reference commands');
});
