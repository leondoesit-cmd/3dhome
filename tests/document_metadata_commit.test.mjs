import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {createHistory} from '../js/edit_history.js';
import {documentDescription,setDocumentDescription} from '../js/core/custom_properties.js';
import {createProjectBundle,importProjectBundleText,activeProjectDocument} from '../js/cad_project_bundle.js';

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

for(const docType of ['part','assembly'])test(docType+' Description input survives Settings refresh, save and reopen with one undo per field visit',async()=>{
  let doc={key:'KT01',name:'KT01',parts:[],lengthUnit:'mm',metadata:{authoringSystem:'parametric-v1'}};
  const E={docType,get def(){return doc;},get assembly(){return doc;}};
  const description={value:'',events:{},addEventListener(event,handler){this.events[event]=handler;}};
  const fields={'#mdDescription':description,'#mdName':{},'#mdPrice':{closest:()=>({style:{}})},'#mdSave':{}};
  const root={querySelector:id=>fields[id]||null};
  const history=createHistory({get:()=>JSON.stringify(doc),set:value=>{doc=JSON.parse(value);}});
  const bind=new Function('root','pushUndo','syncUndoButtons',sourceFunctionText(source,'bindDocumentTextField')+';return bindDocumentTextField;')
    (root,(label,tag)=>history.push(label,tag),()=>{});
  bind('#mdDescription',()=>documentDescription(doc),value=>setDocumentDescription(doc,value),'Description',true);
  assert.match(source,/t\("editDescription"\),true\)/,'actual Description wiring enables live commit');
  for(const value of ['Book','Book: KT01','Book: KT01, Planchard 2021']){
    description.value=value;description.events.input();
  }
  const syncHead=new Function('E','root','documentDescription','modelLengthUnit','t','fin','flabel',sourceFunctionText(source,'syncHead')+';return syncHead;')
    (E,root,documentDescription,()=> 'mm',key=>key,Number.isFinite,null);
  syncHead();
  assert.equal(description.value,'Book: KT01, Planchard 2021','unit/settings refresh retains filled text without blur or Enter');
  // The real part Save reads the same header before native regeneration.
  const saveRead=sourceFunctionText(source,'saveModel').match(/setDocumentDescription\(E\.def, root\.querySelector\("#mdDescription"\)\.value\);/)[0];
  new Function('E','root','setDocumentDescription',saveRead)(E,root,setDocumentDescription);
  const bundle=await createProjectBundle(doc,[],[],docType==='assembly' ? {activeAssembly:doc} : {});
  const reopened=activeProjectDocument(await importProjectBundleText(JSON.stringify(bundle)));
  assert.equal(documentDescription(reopened.model || reopened.assembly),description.value,'actual project bundle preserves Description');
  assert.equal(history.tree().length,2,'three input events form one undo step');
  history.undo();assert.equal(documentDescription(doc),'');
  history.redo();assert.equal(documentDescription(doc),'Book: KT01, Planchard 2021');
  description.events.blur();description.value='Revised provenance';description.events.input();
  assert.equal(history.tree().length,3,'next field visit starts a separate edit');
  history.undo();assert.equal(documentDescription(doc),'Book: KT01, Planchard 2021');
});
