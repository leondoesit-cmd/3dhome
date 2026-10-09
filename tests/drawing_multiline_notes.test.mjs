import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {featureField} from '../js/modeler_feature_form.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {ensureSheetDoc} from '../js/cad_sheet.js';
function element(tag,cls='',text=''){
 let value='';return {tagName:tag.toUpperCase(),className:cls,textContent:text,dataset:{},children:[],attrs:{},classList:{add(){},remove(){}},
 get value(){return value;},set value(next){value=String(next);if(tag==='input')value=value.replace(/[\r\n]/g,'');},
 appendChild(child){this.children.push(child);},setAttribute(key,value){this.attrs[key]=value;},addEventListener(){}};
}
function table(){
 const def={name:'Notes only',parts:[],features:[],sketches:[]};ensureSheetDoc(def);let answer=null,fields;
 const history=[];const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>[],bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,t:k=>k,
 refresh(){},markDirty(){},flash(){},pushUndo:label=>history.push({label,snapshot:JSON.stringify(def)}),promptFields:async(title,rows)=>{fields=rows;return answer;}};
 const controller=createDrawingController(host);controller.state.zoom=1;
 return {def,controller,host,history,fields:()=>fields,answer:next=>answer=next};
}
test('actual sheet form passes multiline Note text through a textarea without input newline sanitation',async()=>{
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');let spec;
 const text='FRONT\nTOP\nLEFT & RIGHT',root={classList:{add(){},remove(){}}};
 const form=new Function('root','openQuickForm','t',sourceFunctionText(source,'sheetForm')+';return sheetForm;')(root,next=>{spec=next;return {};},k=>k);
 const promise=form('Note',[{key:'text',label:'Note text',type:'textarea',value:text}]);
 assert.equal(spec.fields[0].type,'textarea');const node=featureField(element('div'),spec.fields[0],text,{el:element});
 assert.equal(node.tagName,'TEXTAREA');assert.equal(node.value,text);assert.equal(node.attrs['aria-label'],'Note text');
 spec.onApply({text:node.value});assert.equal((await promise).text,text);
 // A single-line text input exhibits the browser sanitation that caused the defect.
 assert.equal(featureField(element('div'),{key:'plain',label:'Plain',type:'text'},text,{el:element}).value,'FRONTTOPLEFT & RIGHT');
});
test('actual blank-sheet Note handler requests multiline input and creates readable separate SVG rows',async()=>{
 const f=table();f.answer({text:'FRONT\nTOP\nLEFT & RIGHT',depth:''});f.controller.setTool('note');
 f.controller.pointerDown({button:0},20,60);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.fields()[0].type,'textarea');assert.equal(f.def.drawing.notes[0].text,'FRONT\nTOP\nLEFT & RIGHT');assert.equal(f.history.length,1);
 const rows=f.controller.scene().items.filter(item=>item.noteId&&item.type==='text');assert.deepEqual(rows.map(row=>row.text),['FRONT','TOP','LEFT & RIGHT']);
 assert.ok(rows[1].y>rows[0].y);assert.ok(rows[2].y>rows[1].y);const svg=f.controller.svg();assert.match(svg,/>FRONT<\/text>/);assert.match(svg,/>TOP<\/text>/);assert.match(svg,/LEFT &amp; RIGHT/);
});
test('multiline note spacing honors its own font size and every row can be selected or edited',async()=>{
 const f=table();f.def.drawing.notes.push({id:'n1',x:30,y:70,size:6,text:'A\r\nB\rC'});
 const rows=f.controller.scene().items.filter(item=>item.noteId&&item.type==='text');assert.deepEqual(rows.map(row=>row.text),['A','B','C']);
 assert.equal(rows[1].y-rows[0].y,8.099999999999994);assert.equal(rows[2].size,6);
 f.controller.setTool('select');f.controller.pointerDown({button:0},31,rows[2].y-1);f.controller.pointerUp({},31,rows[2].y-1);assert.deepEqual(f.controller.selection(),{kind:'note',id:'n1'});
 f.answer({text:'One\nTwo'});assert.equal(f.controller.doubleClick({},31,rows[2].y-1),true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.fields()[0].type,'textarea');assert.equal(f.def.drawing.notes[0].text,'One\nTwo');assert.equal(f.history.length,1);
 assert.equal(f.controller.scene().items.filter(item=>item.noteId&&item.type==='text').length,2);
});
test('Fit to sheet reserves measured bottom overlay while keeping the entire paper in view',()=>{
 const f=table();f.host.viewportInsets=()=>({bottom:48});f.controller.fit();
 const {zoom,ox,oy}=f.controller.state;const paper=f.controller.scene().paper;
 assert.ok(ox>=24-1e-9&&oy>=24-1e-9);assert.ok(ox+paper.w*zoom<=900-24+1e-9);assert.ok(oy+paper.h*zoom<=600-48-24+1e-9);
 f.host.viewportInsets=()=>({bottom:0});f.controller.fit();assert.ok(f.controller.state.oy+paper.h*f.controller.state.zoom<=600-24+1e-9);
});
