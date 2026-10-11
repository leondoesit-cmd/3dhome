import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDrawingController} from '../js/modeler_drawing.js';
import {createSheetDoc,ensureSheetDoc} from '../js/cad_sheet.js';

function rig(){
 let owner={name:'Draft witness',parts:[],drawing:createSheetDoc({views:[]})};
 const history=[],calls={push:0,dirty:0};
 const c=createDrawingController({doc:()=>ensureSheetDoc(owner),model:()=>owner,bodies:()=>[],bodiesToken:()=>1,width:()=>338,height:()=>638,topology:()=>null,
  refresh(){},flash(){},t:k=>k,pushUndo(){calls.push++;history.push(structuredClone(owner));owner=structuredClone(owner);},markDirty(){calls.dirty++;}});
 return {c,calls,get owner(){return owner;},replace(value){owner=value;},undo(){owner=history.pop();}};
}
const touch=id=>({button:0,pointerType:'touch',pointerId:id});
function pick(c,id,x,y){c.pointerDown(touch(id),x,y);c.pointerUp(touch(id),x,y);}

test('touch Finish commits an open four-point polyline through native normalized history; Cancel never saves a draft',()=>{
 const r=rig(),c=r.c;c.setTool('sheetpolyline');
 pick(c,1,200,180);assert.equal(c.draftActions().canFinish,false);assert.equal(c.finishDraft(),false);
 for(const [i,p] of [[2,[110,180]],[3,[110,250]],[4,[200,250]]])pick(c,i,...p);
 assert.deepEqual(c.draftActions(),{kind:'primitive',type:'polyline',pointCount:4,canFinish:true});
 const points=structuredClone(c.state.draft.points);assert.equal(r.owner.drawing.primitives.length,0);
 assert.equal(c.finishDraft(),true);assert.equal(r.calls.push,1);assert.equal(r.calls.dirty,1);
 assert.equal(r.owner.drawing.primitives.length,1);assert.deepEqual(r.owner.drawing.primitives[0].points,points);
 const svg=c.svg();assert.ok(svg.includes('x1="200" y1="180" x2="110" y2="180"'));assert.equal(c.draftActions(),null);
 const saved=structuredClone(r.owner);r.undo();assert.equal(r.owner.drawing.primitives.length,0);
 r.replace(saved);assert.equal(c.svg(),svg);
 c.setTool('sheetpolyline');pick(c,5,80,200);pick(c,6,120,240);
 assert.equal(c.cancelDraft(),true);assert.equal(c.draftActions(),null);assert.equal(r.calls.push,1);
 assert.equal(r.owner.drawing.primitives.length,1);
});

test('duplicate-only picks cannot Finish and a replaced owner cannot inherit touch IDs, pinch or a draft',()=>{
 const r=rig(),c=r.c;c.setTool('sheetpolyline');pick(c,1,80,200);pick(c,2,80,200);
 assert.equal(c.draftActions().pointCount,1);assert.equal(c.draftActions().canFinish,false);assert.equal(c.finishDraft(),false);
 c.beginPinch();const previous=r.owner,previousJSON=JSON.stringify(previous);
 const next={name:'New native drawing',parts:[],drawing:createSheetDoc({views:[]})};r.replace(next);c.resetSession();
 c.setTool('sheetpolyline');assert.equal(c.state.pinching,false);assert.equal(c.state.drag,null);
 pick(c,3,100,250);pick(c,4,140,250);
 assert.equal(c.draftActions().canFinish,true);assert.equal(c.finishDraft(),true);
 assert.equal(r.owner.drawing.primitives.length,1);assert.equal(JSON.stringify(previous),previousJSON);
 assert.equal(r.calls.push,1);
});

test('actual mobile context row shows native Finish/Cancel and point count rather than empty modelling actions',()=>{
 const source=readFileSync(new URL('../js/modeler_mobile.js',import.meta.url),'utf8');
 const start=source.indexOf('function ctxActions()'),end=source.indexOf('\n}',start);
 const r=rig();r.c.setTool('sheetpolyline');pick(r.c,1,80,200);
 const context={api:{state:()=>({mode:'drawing',drawingDraft:r.c.draftActions()}),finishDrawingDraft:()=>r.c.finishDraft(),cancelDrawingDraft:()=>r.c.cancelDraft()},t:k=>k};
 vm.createContext(context);vm.runInContext(source.slice(start,end+2),context);
 let actions=context.ctxActions();assert.equal(actions[0].label,'Finish · 1 points');assert.equal(actions[0].disabled,true);
 assert.equal(actions[1].action,'canceldrawingdraft');pick(r.c,2,140,200);
 actions=context.ctxActions();assert.equal(actions[0].disabled,false);assert.equal(actions[0].label,'Finish · 2 points');
 actions[0].run();assert.equal(r.owner.drawing.primitives.length,1);
 r.c.setTool('sheetpolyline');pick(r.c,3,80,250);context.ctxActions()[1].run();assert.equal(r.c.draftActions(),null);
});

test('ordinary same-document normalization preserves draft and contact ownership; only document-switch hooks reset them',()=>{
 const r=rig(),c=r.c;c.setTool('sheetpolyline');pick(c,1,80,200);
 r.replace(structuredClone(r.owner));pick(c,2,140,200);
 assert.equal(c.draftActions().pointCount,2);assert.equal(c.draftActions().canFinish,true);
 c.beginPinch();r.replace(structuredClone(r.owner));c.scene();assert.equal(c.state.pinching,true);
 c.endPinch();c.setTool('sheetpolyline');pick(c,3,80,200);assert.equal(c.draftActions().pointCount,1);
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 assert.match(source,/E\.def = newDef\(\);\s+E\.sheet\?\.resetSession\(\);/);
 assert.match(source,/E\.def = def \? ensureParametricDocument\(def\) : f \? ensureParametricDocument\(f\) : newDef\(\);\s+E\.sheet\?\.resetSession\(\);/);
 c.resetSession();assert.equal(c.draftActions(),null);assert.equal(c.state.pinching,false);
 assert.equal(r.calls.push,0);assert.equal(r.owner.drawing.primitives.length,0);
});

test('Drawing clears retained Part context and returning to model restores profile operations',()=>{
 const source=readFileSync(new URL('../js/modeler_mobile.js',import.meta.url),'utf8');
 const start=source.indexOf('function ctxActions()'),end=source.indexOf('\n}',start);
 let state={mode:'drawing',closedSketch:true,cornerVisible:true,topologyCount:2,componentCount:1};
 const context={api:{state:()=>state,coach:()=>assert.fail('Drawing cannot consume the Part coach'),
  contextItems:()=>assert.fail('Drawing cannot consume retained Part picks'),chromeLabel:id=>id},
  t:k=>k,CLOSED_SKETCH_VERBS:['extrudecut','revolve','loft'],CTX_MAX_ACTIONS:8};
 vm.createContext(context);vm.runInContext(source.slice(start,end+2),context);
 assert.equal(context.ctxActions().length,0);
 state={mode:'3d',closedSketch:true};context.api.contextItems=()=>[];
 assert.deepEqual(Array.from(context.ctxActions(),item=>item.action),['extrude','extrudecut','revolve','loft']);
});
