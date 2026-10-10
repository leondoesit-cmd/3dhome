import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {createSheetDoc,ensureSheetDoc,SHEET_SIZES,STANDARD_SCALES,scaleLabel} from '../js/cad_sheet.js';
import {setSheetTitleSource,sheetTitleMeta} from '../js/core/custom_properties.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function element(tag='div',cls='',text='') {
  const attrs={},listeners={},node={tagName:tag,children:[],className:cls,textContent:text,value:'',open:false,scrollTop:0,clientHeight:200,maxScroll:240,
    setAttribute(k,v){attrs[k]=v;},getAttribute(k){return attrs[k]??null;},appendChild(n){this.children.push(n);n.parentNode=this;},
    addEventListener(event,fn){listeners[event]=fn;},fire(event){listeners[event]?.();},
    querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);if(selector==='*')return all;
      const match=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);return all.filter(n=>match? n.getAttribute(match[1])!==null&&(match[2]===undefined||n.getAttribute(match[1])===match[2]): selector[0]==='#'&&n.id===selector.slice(1));},
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
  Object.defineProperty(node,'innerHTML',{set(){this.children=[];},get(){return '';}});
  Object.defineProperty(node,'scrollHeight',{get(){return this.clientHeight+this.maxScroll;}});return node;
}
function fixture(){
  const host=element(),def={key:'source-key',name:'BATTERY',customProperties:{Description:'BATTERY, 6-VOLT'},parts:[],features:[],sketches:[],drawing:createSheetDoc({views:[]})},history=[];
  const sheet={selection:()=>null,availableViews:()=>[],scene:()=>({views:[],scale:1})};
  const context={E:{docType:'part',mode:'drawing',def},root:{querySelector:()=>host},document:{activeElement:null},el:element,t:k=>k,
    drawingDocument:()=>ensureSheetDoc(context.E.def),drawingSheet:()=>sheet,SHEET_SIZES,STANDARD_SCALES,scaleLabel,
    namedButton:x=>x,btn:()=>element('button'),setSheetTitleSource,sheetTitleMeta,syncDanglingDims(){},
    drawSketch(){},pushUndo(){history.push(JSON.stringify(context.E.def));context.E.def=JSON.parse(JSON.stringify(context.E.def));}};
  vm.createContext(context);
  for(const name of ['sheetRow','sheetSelect','sheetToggle','sheetGroup','bindTitleField','bindTitleSource','buildSheetPanel'])vm.runInContext(sourceFunctionText(source,name),context);
  return {host,context,history,group:key=>host.querySelector('[data-sheet-group="'+key+'"]'),picker:key=>host.querySelector('[data-title-source="'+key+'"]')};
}

test('actual source selectors retain open Title and closed Setup/Views, scroll and exact source-history mutation',()=>{
  const f=fixture();f.context.buildSheetPanel(f.host);
  assert.equal(f.group('setup').open,true);assert.equal(f.group('views').open,true);assert.equal(f.group('title').open,false);
  f.group('title').open=true;f.group('setup').open=false;f.group('views').open=false;f.host.scrollTop=123;
  const before=JSON.stringify(f.context.E.def);f.picker('title').value='description';f.picker('title').fire('change');
  assert.equal(f.group('title').open,true,'number selector remains inside open Title block');assert.ok(f.picker('number'));
  assert.equal(f.group('setup').open,false);assert.equal(f.group('views').open,false);assert.equal(f.host.scrollTop,123);
  assert.equal(f.context.E.def.drawing.title.sources.title,'description');assert.equal(f.history[0],before);
  const afterTitle=JSON.stringify(f.context.E.def);f.picker('number').value='name';f.picker('number').fire('change');
  assert.equal(f.group('title').open,true);assert.equal(f.host.scrollTop,123);assert.equal(f.history.length,2);assert.equal(f.history[1],afterTitle);
  assert.deepEqual(sheetTitleMeta(f.context.E.def.drawing,f.context.E.def),{title:'BATTERY, 6-VOLT',number:'BATTERY'});
  const restored=JSON.parse(f.history[0]);f.context.E.def=restored;const cad=JSON.stringify(restored);f.context.buildSheetPanel(f.host);
  assert.equal(f.group('title').open,true,'same record Undo keeps presentation');assert.equal(JSON.stringify(restored),cad,'no authored presentation metadata');
});

test('new group/defaults and different owner reset; same-owner scroll restoration is bounded',()=>{
  const f=fixture();f.context.buildSheetPanel(f.host);f.group('title').open=true;f.group('setup').open=false;f.host.scrollTop=999;f.host.maxScroll=15;
  f.context.buildSheetPanel(f.host);assert.equal(f.host.scrollTop,15);assert.equal(f.group('title').open,true);
  const title=f.group('title');title.parentNode.children=title.parentNode.children.filter(n=>n!==title);
  f.context.buildSheetPanel(f.host);assert.equal(f.group('title').open,false,'newly recreated absent group uses first-open default');
  f.group('title').open=true;f.context.E.def={...f.context.E.def,key:'independent-copy',drawing:createSheetDoc({views:[]})};f.host.scrollTop=10;
  f.context.buildSheetPanel(f.host);assert.equal(f.host.scrollTop,0);assert.equal(f.group('title').open,false);assert.equal(f.group('setup').open,true);
  f.host.scrollTop=Infinity;f.context.buildSheetPanel(f.host);assert.equal(f.host.scrollTop,0);
});
