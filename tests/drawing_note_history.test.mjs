import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetDoc,ensureSheetDoc,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';

test('ordinary plain and property-linked Note insertions target the live normalized Undo document',async()=>{
  const def={customProperties:{Material:'Aluminum'},drawing:createSheetDoc({views:[]})},history=[];
  let controller,answer={text:'COMMENT',depth:''};
  const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>[],bodiesToken:()=>1,
    canvas:()=>({}),width:()=>900,height:()=>600,t:key=>key,refresh(){},flash(){},
    promptFields:async()=>answer,markDirty:()=>controller.invalidate(),
    pushUndo:()=>{history.push(JSON.stringify(def.drawing));def.drawing=JSON.parse(JSON.stringify(def.drawing));ensureSheetDoc(def);}};
  controller=createDrawingController(host);controller.state.zoom=1;
  const insert=async()=>{controller.setTool('note');controller.pointerDown({button:0},40,50);await new Promise(resolve=>setImmediate(resolve));};
  await insert();
  assert.equal(def.drawing.notes.length,1,'Note must not be added to the detached document captured before Undo');
  assert.equal(def.drawing.notes[0].text,'COMMENT');assert.equal(history.length,1);
  answer={text:'',depth:'property:Material'};await insert();
  assert.equal(def.drawing.notes.length,2);assert.equal(history.length,2);
  assert.deepEqual(def.drawing.notes[1].modelLink,{kind:'property',key:'Material'});
  const before=controller.svg();assert.match(before,/Aluminum/);
  def.customProperties.Material='Steel';
  const changed=controller.svg();assert.match(changed,/Steel/);assert.doesNotMatch(changed,/Aluminum/);
  const cold=JSON.parse(JSON.stringify(def));ensureSheetDoc(cold);
  assert.equal(sceneToSvg(buildSheetScene(cold.drawing,{properties:cold.customProperties})),changed);
  def.drawing=JSON.parse(history[1]);controller.invalidate();
  assert.equal(def.drawing.notes.length,1,'Undo restores the actual previous annotation state');
  assert.doesNotMatch(controller.svg(),/Steel/);
  answer=null;await insert();assert.equal(history.length,2);assert.equal(def.drawing.notes.length,1);
});
