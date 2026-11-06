import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText, withSetters} from './helpers/source_function.mjs';
import {documentDescription,setDocumentDescription,setDocumentProperty} from '../js/core/custom_properties.js';
const source=modelerSource();
function node(tag){return {tag,children:[],style:{},value:'',appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},querySelectorAll(tag){return this.children.filter(child=>child.tag===tag);},setAttribute(){},addEventListener(){},showModal(){},close(){},remove(){},focus(){},closest(){return {style:{}};}};}

function fixture(docType='assembly'){
  const doc={name:'VALVE',customProperties:{Description:'OLD PENDING DESCRIPTION'}},E={docType,assembly:doc,def:doc};
  const fields=Object.fromEntries(['mdName','mdPrice','mdDescription','mdSave'].map(key=>['#'+key,node('input')]));
  fields['#mdDescription'].value='OLD PENDING DESCRIPTION';
  const root=node('root');root.querySelector=id=>fields[id] || null;
  const syncHead=new Function('E','root','documentDescription','modelLengthUnit','t','fin','flabel',withSetters(sourceFunctionText(source,'syncHead'))+';return syncHead;')(E,root,documentDescription,()=> 'cm',key=>key,Number.isFinite,null);
  let saved;
  const save=new Function('E','root','setDocumentDescription','newAssembly','applyAssemblyMates','cloneData','saveAssemblies','assemblyOpenBaseline','report','t','lastAssemblySaveConflict','refreshLib','flash','markDocumentClean','reconcileModelerDraft','updateTourProgress','const H={generation:1,editRevision:()=>1}, assemblySaveSession=doc=>doc, currentHistoryNode=()=>1, applyTrackedUpdates=()=>false, rejectFlexibleSpringPreview=()=>false;'+withSetters(sourceFunctionText(source,'saveAssemblyDocument'))+';return saveAssemblyDocument;')
    (E,root,setDocumentDescription,()=>doc,()=>{},value=>JSON.parse(JSON.stringify(value)),async value=>{saved=value;return true;},null,()=>{},key=>key,false,()=>{},()=>{},()=>{},()=>{},()=>{});
  return {doc,E,root,syncHead,save,get saved(){return saved;}};
}

for(const type of ['assembly','part'])test('custom properties dialog synchronizes '+type+' Description before a subsequent header save',async()=>{
  const f=fixture(type);
  const open=new Function('E','root','document','pushUndo','setDocumentProperty','refreshAll','syncHead',withSetters(sourceFunctionText(source,'openCustomProperties'))+';return openCustomProperties;')
    (f.E,f.root,{createElement:node},()=>{},setDocumentProperty,()=>{},f.syncHead);
  open();const dialog=f.root.children[0],rows=dialog.children.find(child=>child.tag==='div');
  rows.children[0].children[1].value='BUTTERFLY VALVE';
  dialog.children.find(child=>child.textContent==='Save').onclick();
  assert.equal(f.root.querySelector('#mdDescription').value,'BUTTERFLY VALVE');
  if(type==='assembly'){await f.save();assert.equal(f.saved.customProperties.Description,'BUTTERFLY VALVE');}
  else {
    // This is the actual header read in saveModel, before native regeneration.
    const saveSource=sourceFunctionText(source,'saveModel');
    const read=saveSource.match(/setDocumentDescription\(E\.def, root\.querySelector\("#mdDescription"\)\.value\);/)[0];
    new Function('E','root','setDocumentDescription',read)(f.E,f.root,setDocumentDescription);
    assert.equal(f.doc.customProperties.Description,'BUTTERFLY VALVE');
  }
});

test('drawing settings title updates Description and survives actual assembly Save header read',async()=>{
  const f=fixture();
  const el=(tag,_class,text)=>Object.assign(node(tag),{textContent:text});
  const show=new Function('E','root','document','el','sheetRow','sheetSelect','SHEET_SIZES','pushUndo','setDocumentProperty','refreshAll','exportDrawingSvg','syncHead','t',withSetters(sourceFunctionText(source,'showAssemblyDrawingSettings'))+';return showAssemblyDrawingSettings;')
    (f.E,f.root,{createElement:node},el,(host,label,input)=>{input.label=label;host.appendChild(input);return input;},(_options,value)=>Object.assign(node('select'),{value}),{Letter:{}},()=>{},setDocumentProperty,()=>{},()=>{},f.syncHead,key=>key);
  show();const dialog=f.root.children[0];
  dialog.children.find(child=>child.label==='Title').value='BUTTERFLY ASSEMBLY';
  dialog.children.find(child=>child.textContent==='Apply drawing settings').onclick();
  await f.save();assert.equal(f.saved.customProperties.Description,'BUTTERFLY ASSEMBLY');
});
