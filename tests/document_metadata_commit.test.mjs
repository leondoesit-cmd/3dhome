import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
test('document text blur and Enter commit before a refresh, with one undo per distinct value',()=>{
  const input={value:'New model',events:{},addEventListener(event,handler){this.events[event]=handler;}};
  const doc={name:'New model'};let undo=0,dirty=0;
  const bind=new Function('root','pushUndo','syncUndoButtons',sourceFunctionText(source,'bindDocumentTextField')+';return bindDocumentTextField;')
    ({querySelector:()=>input},()=>undo++,()=>dirty++);
  bind('#mdName',()=>doc.name,value=>doc.name=value,'Rename');
  input.value='  Fresh WA06  ';input.events.blur();input.events.change();
  assert.equal(doc.name,'Fresh WA06');assert.equal(undo,1);assert.equal(dirty,1);
  input.value=doc.name;assert.equal(input.value,'Fresh WA06','document refresh retains committed name');
  const saved=JSON.parse(JSON.stringify(doc));assert.equal(saved.name,'Fresh WA06');
  input.value='Fresh fixture';let prevented=false,stopped=false;
  input.events.keydown({key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  input.events.blur();assert.equal(doc.name,'Fresh fixture');assert.equal(undo,2);assert.ok(prevented&&stopped);
});
