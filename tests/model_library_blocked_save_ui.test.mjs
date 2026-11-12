import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('actual Save handler releases busy/pending state after rejected storage and permits retry without marking clean',async()=>{
 const source=modelerSource();
 const handler=source.slice(source.indexOf('function saveCurrentDocument()'),source.indexOf('function syncViewButtons()'));
 const doc={},messages=[],statuses=[],attributes=new Map(),button={dataset:{},removeAttribute:key=>attributes.delete(key)};
 let attempts=0;
 const ctx={E:{docType:'part',def:doc},motionPlaybackCancel:null,documentSaveTasks:new WeakMap(),partHistoryMarker:{},
   saveProgress:key=>{attributes.set('aria-busy','true');button.dataset.savePhase=key;},
   saveModel:()=>{attempts++;return Promise.reject(new Error('Model library upgrade is blocked by another open tab'));},
   root:{querySelector:()=>button},report:(_,__,message)=>messages.push(message),t:key=>key,
   documentDirty:()=>true,syncDraftStatus:key=>statuses.push(key)};
 vm.runInNewContext(handler+'; globalThis.save=saveCurrentDocument;',ctx);
 await ctx.save();
 assert.equal(attempts,1);assert.match(messages[0],/blocked/);
 assert.equal(attributes.has('aria-busy'),false);assert.equal(button.dataset.savePhase,undefined);
 assert.equal(ctx.documentSaveTasks.has(doc),false);assert.equal(statuses.at(-1),'saveStillUnsaved');
 await ctx.save();assert.equal(attempts,2,'rejected write does not permanently deduplicate retry');
 assert.equal(statuses.at(-1),'saveStillUnsaved');
});
