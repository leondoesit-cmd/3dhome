import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=modelerSource();
const wrapper=source.slice(source.indexOf('var pendingCutController=null;'),source.indexOf('async function applyCutChecked('));
test('pending exact cut keeps Cancel interactive and rejects duplicate acceptance',async()=>{
  let resolve,observedSignal;const E={},attributes=new Map(),root={inert:false,setAttribute:(k,v)=>attributes.set(k,v),removeAttribute:k=>attributes.delete(k)};
  const api=new Function('E','root','AbortController','applyCutChecked',wrapper+';return {apply:applyCut,abort:()=>pendingCutController.abort()};')(
    E,root,AbortController,(_loop,_id,_hint,_spec,signal)=>{observedSignal=signal;return new Promise(done=>resolve=done);});
  const first=api.apply([],1,null,{});assert.equal(E.cutPending,true);assert.equal(root.inert,false);assert.equal(attributes.get('aria-busy'),'true');
  assert.equal(await api.apply([],1,null,{}),0);api.abort();assert.equal(observedSignal.aborted,true);
  resolve(0);assert.equal(await first,0);assert.equal(E.cutPending,false);assert.equal(attributes.has('aria-busy'),false);
});
