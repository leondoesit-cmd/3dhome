import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {appendSavedLibrarySearch,savedLibraryNameMatches} from '../js/modeler_library_search.js';
import {compactAssemblyTopologySnapshots} from '../js/core/project_topology_budget.js';

function rig(){
 const doc={createElement(tag){return {tagName:tag,ownerDocument:doc,children:[],listeners:{},attributes:{},style:{},hidden:false,
  set innerHTML(value){this.children=[];this.html=value;},
  appendChild(c){this.children.push(c);return c;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.listeners[k]=f;}};}};
 return doc.createElement('div');
}
test('saved names use case-insensitive multiword filtering without changing source records',()=>{
 const record={key:'abc',name:'MOBILE Ch1 Alphabet Lines 1'},before=structuredClone(record);
 assert.equal(savedLibraryNameMatches(record,' alphabet   MOBILE '),true);
 assert.equal(savedLibraryNameMatches(record,'bracket'),false);
 assert.equal(savedLibraryNameMatches({key:'fallback'},'FALLBACK'),true);
 assert.equal(savedLibraryNameMatches({name:'ＡＢＣ'},'abc'),true);
 assert.deepEqual(record,before);
});
test('live search keeps native card identity/actions, clears and restores whole library',()=>{
 const host=rig(),updates=[],search=appendSavedLibrarySearch(host,{query:'mobile',onQuery:q=>updates.push(q)}),cards=Array.from({length:300},(_,i)=>({hidden:false,style:{display:''},open(){return i;},copy(){return i;},remove(){return i;}}));
 cards.forEach((card,i)=>search.add({name:i===299?'MOBILE Ch1 Alphabet Lines 1':`Stored part ${i}`},card));search.apply();
 assert.equal(cards.filter(c=>!c.hidden).length,1);assert.equal(cards[0].style.display,'none');assert.equal(cards[299].style.display,'');assert.equal(cards[299].open(),299);assert.equal(cards[299].copy(),299);assert.equal(cards[299].remove(),299);
 assert.equal(search.input.type,'search');assert.equal(search.input.attributes['aria-label'],'Search saved models');
 search.input.value='unmatched';search.input.listeners.input();assert.ok(cards.every(c=>c.hidden));assert.equal(host.children[1].textContent,'No matching saved models');
 search.input.value='';search.input.listeners.input();assert.equal(cards.filter(c=>!c.hidden).length,300);assert.ok(cards.every(c=>c.style.display===''));assert.deepEqual(updates,['unmatched','']);assert.equal(host.children[1].textContent,'300 / 300');
});
test('native library cards filter, preserve separate queries, and keep guarded open/copy actions through refresh',async()=>{
 const host=rig(),E={docType:'part',def:{key:'current-part'},assembly:{key:'current-assembly'}},queries={part:'',assembly:''};
 const parts=[{key:'bracket',name:'Mobile bracket',parts:[{}]},{key:'plate',name:'Desk plate',parts:[{}]}];
 const assemblies=[{key:'desk',name:'Desk frame',components:[],mates:[]},{key:'mobile',name:'Mobile frame',components:[],mates:[]}];
 const opens=[],copies=[],decisions=[];let accepted=true,dismissed=0;
 E.quickFormInstance={dismiss(){dismissed++;}};
 const el=(tag,cls='',text='')=>{const node=host.ownerDocument.createElement(tag);node.className=cls;node.textContent=text;return node;};
 const H={clear(){return H;},seed(){return H;}};
 const bindings={E,H,root:{querySelector:()=>host},librarySearchQueries:queries,libThumbQueue:[],appendSavedLibrarySearch,
  getLang:()=> 'en',t:key=>key,el,btn:(label,handler,cls)=>{const node=el('button',cls,label);node.addEventListener('click',handler);return node;},
  libThumb:()=>el('img'),loadLib:()=>parts,loadAssemblies:()=>assemblies,FURN:{},S:{idc:1},assemblyOpenBaseline:null,
  countLabel:count=>String(count),assemblyMateCount:assembly=>assembly.mates.length,fin:Number.isFinite,
  confirmDiscardDocument:async key=>{decisions.push(key);return accepted;},
  openModeler:(...args)=>opens.push(args),saveAssemblyCopyAndOpen:assembly=>copies.push(assembly),
  compactAssemblyTopologySnapshots,cloneData:structuredClone,nextDocumentNumericId:()=>1,
 };
 for(const name of ['documentPresetAction','newModel','publishAssemblyModel','libraryTransferButtons','appendLegacyDraftRecovery',
  'appendDiskBackupNote','abandonDocumentExactWork','closeEvalCard','invalidateInterference','markDocumentClean',
  'reconcileModelerDraft','syncHead','refreshAll','fitPreview'])bindings[name]=()=>{};
 const refresh=Function(...Object.keys(bindings),sourceFunctionText(modelerSource(),'refreshLib')+';return refreshLib;')(...Object.values(bindings));
 const cards=()=>host.children.filter(node=>node.className?.split(' ').includes('md-card'));
 const input=()=>host.children[0].children.find(node=>node.tagName==='input');
 const filter=query=>{input().value=query;input().listeners.input();};
 const click=card=>card.listeners.click();
 refresh();assert.equal(host.children[0].className,'md-field','search precedes the action buttons');
 assert.equal(cards().length,2);filter('mobile');
 assert.deepEqual(cards().map(card=>card.hidden),[false,true]);
 const oldCard=cards()[0];refresh();assert.notEqual(cards()[0],oldCard);
 assert.equal(input().value,'mobile');assert.deepEqual(cards().map(card=>card.hidden),[false,true]);
 accepted=false;await click(cards()[0]);assert.equal(opens.length,0);assert.equal(dismissed,0);
 accepted=true;await click(cards()[0]);
 assert.deepEqual(opens,[[null,parts[0],null,true]],'the card forwards its accepted discard to the real open path');
 assert.equal(dismissed,1);assert.deepEqual(decisions,['unsavedOpen','unsavedOpen']);
 E.docType='assembly';refresh();assert.equal(input().value,'','assembly does not inherit the Part query');filter('desk');
 assert.deepEqual(cards().map(card=>card.hidden),[false,true]);
 accepted=false;const previous=E.assembly;await click(cards()[0]);assert.equal(E.assembly,previous);
 accepted=true;await click(cards()[0]);assert.deepEqual(E.assembly,assemblies[0]);assert.notEqual(E.assembly,assemblies[0]);
 assert.equal(input().value,'desk','opening and refreshing an assembly preserves its query');
 const copy=cards()[0].children.find(node=>node.textContent==='saveCopyOpen');let stopped=0;
 await copy.listeners.click({stopPropagation(){stopped++;}});assert.deepEqual(copies,[assemblies[0]]);assert.equal(stopped,1);
 filter('');assert.ok(cards().every(card=>!card.hidden));
 E.docType='part';refresh();assert.equal(input().value,'mobile');assert.deepEqual(cards().map(card=>card.hidden),[false,true]);
});
