import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingArcGeometry,drawingPrimitiveItems,drawingPrimitiveHit,validateDrawingPrimitive} from '../js/core/drawing_primitives.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {ensureSheetDoc,sceneToSvg} from '../js/cad_sheet.js';
const near=(actual,expected,tol=1e-9)=>assert.ok(Math.abs(actual-expected)<tol,`${actual} != ${expected}`);
const points=[{x:140,y:100},{x:100+40/Math.sqrt(2),y:100+40/Math.sqrt(2)},{x:100,y:140}];
function table(){const def={name:'Arc worksheet',parts:[],features:[],sketches:[],history:[]};ensureSheetDoc(def);const steps=[];let answer;
 const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>[],bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,t:k=>k,refresh(){},markDirty(){},flash(){},pushUndo:label=>steps.push({label,snapshot:JSON.stringify(def)}),promptFields:async()=>answer};
 const controller=createDrawingController(host);controller.state.zoom=1;return {def,controller,steps,answer:next=>answer=next,click(p){controller.pointerDown({button:0,ctrlKey:true},p.x,p.y);controller.pointerUp({},p.x,p.y);}};
}
test('three points define an exact quarter arc with directed start-through-end traversal',()=>{
 const arc=drawingArcGeometry(points);near(arc.cx,100);near(arc.cy,100);near(arc.r,40);near(arc.a1-arc.a0,Math.PI/2);assert.equal(arc.anticlockwise,false);
 const reversed=drawingArcGeometry([...points].reverse());near(reversed.a1-reversed.a0,-Math.PI/2);assert.equal(reversed.anticlockwise,true);
});
test('arc through point selects major path and wraps across angle zero correctly',()=>{
 const major=drawingArcGeometry([points[0],{x:60,y:100},points[2]]);near(major.a1-major.a0,-Math.PI*1.5);
 const at=angle=>({x:100+40*Math.cos(angle),y:100+40*Math.sin(angle)});
 const wrap=drawingArcGeometry([at(-.2),at(0),at(.2)]);near(wrap.a1-wrap.a0,.4);
});
test('collinear duplicate nonfinite and out-of-paper arcs reject without whole-circle fallback',()=>{
 for(const ps of [[{x:20,y:20},{x:30,y:30},{x:40,y:40}],[points[0],points[1],points[0]],[points[0],{x:Infinity,y:20},points[2]]])assert.throws(()=>validateDrawingPrimitive({type:'arc',points:ps}));
 // Three points inside the paper but the selected major arc leaves it.
 assert.throws(()=>validateDrawingPrimitive({type:'arc',points:[{x:8,y:16},{x:12,y:16},{x:14,y:8}]},{w:15,h:20}),/whole arc/);
});
test('hit-testing selects only the arc segment and endpoints, not the complementary circle',()=>{
 const value={id:'a',type:'arc',points};assert.equal(drawingPrimitiveHit(value,points[1],.2),true);assert.equal(drawingPrimitiveHit(value,{x:60,y:100},.2),false);assert.equal(drawingPrimitiveHit(value,points[0],.2),true);
});
test('actual canvas arc command collects three picks, edits styles, persists analytic SVG and deletes with Undo',async()=>{
 const t=table(),source=JSON.stringify({parts:t.def.parts,features:t.def.features,sketches:t.def.sketches,history:t.def.history});
 t.controller.setTool('sheetarc');t.click(points[0]);t.click(points[1]);assert.equal(t.steps.length,0);t.click(points[2]);assert.equal(t.steps.length,1);assert.equal(t.controller.state.draft,null);
 const primitive=t.def.drawing.primitives[0];assert.equal(primitive.type,'arc');assert.equal(drawingPrimitiveItems(primitive)[0].type,'arc');
 assert.match(t.controller.svg(),/A40,40 0 0 1 100,140/);assert.doesNotMatch(t.controller.svg(),/<circle[^>]*r="40"/);
 t.controller.setTool('select');t.click(points[1]);assert.deepEqual(t.controller.selection(),{kind:'primitive',id:primitive.id});
 t.answer({x0:'100',y0:'140',x1:String(points[1].x),y1:String(points[1].y),x2:'140',y2:'100',style:'hidden'});await t.controller.editPrimitive(primitive.id);
 assert.match(t.controller.svg(),/A40,40 0 0 0 140,100/);assert.match(t.controller.svg(),/stroke-dasharray/);
 const persisted=JSON.parse(JSON.stringify(t.def));assert.deepEqual(ensureSheetDoc(persisted).primitives,t.def.drawing.primitives);
 assert.equal(JSON.stringify({parts:t.def.parts,features:t.def.features,sketches:t.def.sketches,history:t.def.history}),source);
 t.controller.keyDown({key:'Delete'});assert.equal(t.def.drawing.primitives.length,0);Object.assign(t.def,JSON.parse(t.steps.pop().snapshot));t.controller.invalidate();assert.equal(t.def.drawing.primitives.length,1);
});
test('invalid third pick can be corrected; cancelled arc and invalid edit create no history',async()=>{
 const t=table();t.controller.setTool('sheetarc');t.click({x:30,y:30});t.click({x:40,y:30});t.click({x:50,y:30});assert.equal(t.steps.length,0);assert.equal(t.def.drawing.primitives.length,0);
 t.click({x:40,y:40});assert.equal(t.steps.length,1);
 const primitive=t.def.drawing.primitives[0],snapshot=JSON.stringify(t.def);t.answer({x0:'30',y0:'30',x1:'40',y1:'30',x2:'50',y2:'30',style:'center'});await t.controller.editPrimitive(primitive.id);assert.equal(JSON.stringify(t.def),snapshot);assert.equal(t.steps.length,1);
 t.click({x:80,y:80});t.controller.keyDown({key:'Escape'});assert.equal(t.steps.length,1);assert.equal(t.controller.state.draft,null);
});
test('SVG major and reversed sweep flags match the analytic directed arc',()=>{
 const major=drawingPrimitiveItems({id:'a',type:'arc',points:[points[0],{x:60,y:100},points[2]]})[0];
 const svg=sceneToSvg({paper:{w:200,h:200},items:[major]});assert.match(svg,/A40,40 0 1 0 100,140/);
});

test('actual canvas renderer uses the directed counterclockwise flag without painting a whole circle',()=>{
 const t=table();t.def.drawing.primitives.push({id:'a',type:'arc',points:[...points].reverse(),style:'center'});t.controller.state.fitted=true;
 const calls=[];const context=new Proxy({arc(...args){calls.push(args);},measureText(value){return {width:String(value).length*5};}},{get(target,key){return key in target?target[key]:()=>{};}});
 t.controller.render(context,900,600);const arcs=calls.filter(call=>Math.abs(call[2]-40)<1e-9);assert.equal(arcs.length,1);assert.equal(arcs[0][5],true);near(arcs[0][4]-arcs[0][3],-Math.PI/2);near(arcs[0][0],100);near(arcs[0][1],100);
});
