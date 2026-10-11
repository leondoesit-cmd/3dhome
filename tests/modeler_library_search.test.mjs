import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {appendSavedLibrarySearch,savedLibraryNameMatches} from '../js/modeler_library_search.js';

function rig(){const doc={createElement(){return {children:[],listeners:{},attributes:{},appendChild(c){this.children.push(c);},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,f){this.listeners[k]=f;}};}};return {ownerDocument:doc,...doc.createElement()};}
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
test('both native library branches register real cards and preserve query through refresh',()=>{
 const src=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),start=src.indexOf('function refreshLib()'),end=src.indexOf('\nfunction syncHead()',start),body=src.slice(start,end);
 assert.match(body,/assemblySearch\.add\(assembly,card\)/);assert.match(body,/partSearch\.add\(m,card\)/);
 assert.match(body,/librarySearchQueries\[libraryKind\]=value/);
 assert.ok(body.indexOf('appendSavedLibrarySearch(')<body.indexOf('host.appendChild(btn('),'search precedes all action buttons on the narrow phone pane');
 assert.match(body,/saveAssemblyCopyAndOpen\(assembly\)/);assert.match(body,/openModeler\(null, m, null\)/);
});
