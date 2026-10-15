import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetDoc,buildSheetScene,sceneToSvg,titleBlockBox} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';

function sheet(title, size='A3') {
 const doc=createSheetDoc({size,views:[],title:{title,revision:'A'}});
 const scene=buildSheetScene(doc,{}),box=titleBlockBox(doc);
 const lines=scene.items.filter(i=>i.type==='text'&&i.fullText===title);
 return {doc,scene,box,lines};
}

test('mobile exercise title preserves word order and reserves revision space in shared scene',()=>{
 const title='MOBILE Ch2 In-Chapter Exercise1 Isometric';
 for(const size of ['A3','A4','Letter']) {
  const {scene,box,lines}=sheet(title,size);
  assert.equal(lines.map(i=>i.text).join(' '),title);
  assert.ok(lines.length>=1&&lines.length<=2);
  assert.ok(lines.every(i=>i.y<box.y+box.h*.42));
  const revision=scene.items.find(i=>i.text==='REV A');
  assert.equal(revision.anchor,"end");
  assert.match(sceneToSvg(scene),/>REV A<\/text>/);
 }
});

test('wrapping never moves trailing short words back before earlier words',()=>{
 const title='MMMMMMMMMMMMMMMMMMM second longer word a b c';
 const {lines}=sheet(title,'A4');
 assert.ok(lines.length===2);
 const visible=lines.map(i=>i.text).join(' ');
 assert.ok(visible.endsWith('…') ? title.startsWith(visible.slice(0,-1)) : visible===title,visible);
});

test('mobile fit canvas title uses same physical font proportion as export',()=>{
 const title='MOBILE Ch2 In-Chapter Exercise1 Isometric';
 const {doc}=sheet(title);
 const canvas={};
 const controller=createDrawingController({doc:()=>doc,model:()=>({}),bodies:()=>[],bodiesToken:()=>1,t:k=>k,canvas:()=>canvas,width:()=>390,height:()=>600,refresh(){}});
 const painted=[];
 const ctx=new Proxy({measureText:()=>({width:10}),fillText(text){painted.push({text,font:this.font});}}, {get(target,key){return key in target?target[key]:(()=>{});},set(target,key,value){target[key]=value;return true;}});
 controller.render(ctx,390,600);
 const revision=painted.find(i=>i.text==='REV A');
 assert.ok(revision,JSON.stringify(painted));
 assert.ok(parseFloat(revision.font.replace(/^bold /,''))<4,revision.font);
});


test('small multiline notes retain paper font size and clear line pitch at mobile fit',()=>{
 const {doc}=sheet('Notes');
 doc.notes=[{id:'n',x:30,y:40,size:2.8,text:'First line\nSecond line\nThird line'}];
 const controller=createDrawingController({doc:()=>doc,model:()=>({}),bodies:()=>[],bodiesToken:()=>1,t:k=>k,canvas:()=>({}),width:()=>390,height:()=>600,refresh(){}});
 const painted=[];
 const ctx=new Proxy({measureText:()=>({width:10}),fillText(text){painted.push({text,font:this.font});}}, {get(target,key){return key in target?target[key]:(()=>{});},set(target,key,value){target[key]=value;return true;}});
 controller.render(ctx,390,600);
 const rows=controller.scene().items.filter(i=>i.noteId==='n'&&i.type==='text');
 assert.equal(rows.length,3);
 for(const row of rows) {
  const fontSize=parseFloat(painted.find(i=>i.text===row.text).font);
  assert.ok(Math.abs(fontSize-row.size*controller.state.zoom)<=.051);
  assert.ok(fontSize<(rows[1].y-rows[0].y)*controller.state.zoom);
 }
});
