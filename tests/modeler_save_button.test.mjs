import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {syncSaveButtonAccessibility} from '../js/modeler_save_button.js';

test('actual dirty-status handler keeps Part/Assembly Save names stable while retaining accessible status and shortcut',()=>{
 const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const handler=source.slice(source.indexOf('function syncDirty()'),source.indexOf('/* The one place that asks before unsaved work'));
 const attributes=new Map([['aria-describedby','mdDraftStatus']]),classes=new Map();
 const button={dataset:{},setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),classList:{toggle:(key,value)=>classes.set(key,value)}};
 let dirty=false,statusCalls=0;
 const context={E:{docType:'part'},root:{querySelector:()=>button},documentDirty:()=>dirty,syncSaveButtonAccessibility,
   t:key=>({save:'Save',saveAssembly:'Save assembly',dirtySave:'Unsaved changes'})[key],syncStatus:()=>statusCalls++};
 vm.runInNewContext(handler+'; globalThis.sync=syncDirty;',context);
 context.sync();assert.equal(attributes.get('aria-label'),'Save');assert.equal(button.dataset.tip,'Ctrl+S');
 dirty=true;context.sync();assert.equal(attributes.get('aria-label'),'Save');assert.equal(classes.get('is-dirty'),true);
 assert.equal(button.dataset.tip,'Unsaved changes · Ctrl+S');
 context.E.docType='assembly';context.sync();assert.equal(attributes.get('aria-label'),'Save assembly');
 dirty=false;context.sync();assert.equal(attributes.get('aria-label'),'Save assembly');assert.equal(classes.get('is-dirty'),false);
 assert.equal(attributes.get('aria-describedby'),'mdDraftStatus');assert.equal(statusCalls,4);
});
