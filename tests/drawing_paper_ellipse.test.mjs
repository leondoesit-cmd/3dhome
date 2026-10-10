import test from 'node:test';import assert from 'node:assert/strict';
import {drawingEllipsePoints,drawingEllipseGeometry,drawingPrimitiveItems,drawingPrimitiveHit,validateDrawingPrimitive} from '../js/core/drawing_primitives.js';
import {createDrawingController} from '../js/modeler_drawing.js';import {ensureSheetDoc,sceneToSvg} from '../js/cad_sheet.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const points=drawingEllipsePoints({cx:100,cy:100,rx:40,ry:20,rotation:30});
function table(){const def={name:'Ellipse witness',parts:[],features:[],sketches:[],history:[]};ensureSheetDoc(def);const undo=[],redo=[],messages=[];let answer,pending;
 const host={doc:()=>ensureSheetDoc(def),model:()=>def,historyToken:()=>undo.length,bodies:()=>[],bodiesToken:()=>0,canvas:()=>({}),width:()=>900,height:()=>600,t:k=>k,refresh(){},markDirty(){},flash:m=>messages.push(m),pushUndo:l=>{undo.push(JSON.stringify(def));redo.length=0;def.drawing=structuredClone(def.drawing);},promptFields:async(title,fields)=>{pending=fields;return answer;}};
 const controller=createDrawingController(host);controller.state.zoom=1;return {def,host,controller,undo,messages,get fields(){return pending;},answer:v=>answer=v?{startAngle:'0',endAngle:'360',...v}:v,click(p){controller.pointerDown({button:0,ctrlKey:true},p.x,p.y);controller.pointerUp({},p.x,p.y);},undoStep(){redo.push(JSON.stringify(def));Object.assign(def,JSON.parse(undo.pop()));controller.invalidate();},redoStep(){undo.push(JSON.stringify(def));Object.assign(def,JSON.parse(redo.pop()));controller.invalidate();}};
}
test('true rotated ellipse derives positive semi-axes and rejects degenerate/full-paper overflow',()=>{
 const e=drawingEllipseGeometry(points);near(e.cx,100);near(e.rx,40);near(e.ry,20);near(e.rotation,Math.PI/6);
 const i=drawingPrimitiveItems({type:'ellipse',points,style:'center'})[0];assert.equal(i.type,'ellipse');assert.match(sceneToSvg({paper:{w:210,h:210},items:[i]}),/<ellipse cx="100" cy="100" rx="40" ry="20" transform="rotate\(30 100 100\)"/);
 for(const ps of [[points[0],points[0],points[2]],[points[0],points[1],points[1]],drawingEllipsePoints({cx:100,cy:100,rx:20,ry:40,rotation:0})])assert.throws(()=>validateDrawingPrimitive({type:'ellipse',points:ps}));
 assert.throws(()=>validateDrawingPrimitive({type:'ellipse',points:drawingEllipsePoints({cx:30,cy:30,rx:40,ry:20,rotation:45})},{w:100,h:100}),/whole ellipse/);
 assert.throws(()=>validateDrawingPrimitive({type:'ellipse',points:[points[0],points[1],{x:NaN,y:20}]}));
});
test('ellipse hit testing selects the true rotated curve, not its bounding box or circle',()=>{
 const p={type:'ellipse',points};assert.equal(drawingPrimitiveHit(p,points[1],.01),true);assert.equal(drawingPrimitiveHit(p,points[2],.01),true);assert.equal(drawingPrimitiveHit(p,{x:100,y:100},1),false);
 const a=.73,c=Math.cos(Math.PI/6),s=Math.sin(Math.PI/6),q={x:100+40*Math.cos(a)*c-20*Math.sin(a)*s,y:100+40*Math.cos(a)*s+20*Math.sin(a)*c};assert.equal(drawingPrimitiveHit(p,q,.001),true);
 assert.equal(drawingPrimitiveHit(p,{x:140,y:100},.1),false);
});
test('ordinary three-pick ellipse and normalized-history coordinate editor persist analytic SVG, style, Undo and cold state without CAD changes',async()=>{
 const t=table(),cad=JSON.stringify([t.def.parts,t.def.features,t.def.sketches,t.def.history]);t.controller.setTool('sheetellipse');t.click(points[0]);t.click(points[1]);assert.equal(t.undo.length,0);t.click(points[2]);assert.equal(t.undo.length,1);
 const p=t.def.drawing.primitives[0];assert.equal(p.type,'ellipse');assert.match(t.controller.svg(),/<ellipse/);
 t.controller.setTool('select');t.click(points[1]);assert.equal(t.controller.selection().id,p.id);
 t.answer({cx:'120.25',cy:'80.75',rx:'35.5',ry:'12.25',rotation:'-25',style:'hidden'});await t.controller.editPrimitive(p.id);
 assert.deepEqual(t.fields.slice(0,5).map(f=>f.label),['Center X (paper mm)','Center Y (paper mm)','Major semi-axis (paper mm)','Minor semi-axis (paper mm)','Rotation (degrees)']);
 const live=t.def.drawing.primitives[0];assert.notEqual(live,p);const e=drawingEllipseGeometry(live.points);near(e.cx,120.25);near(e.ry,12.25);near(e.rotation,-25*Math.PI/180);assert.equal(live.style,'hidden');
 const svg=t.controller.svg();assert.match(svg,/rx="35.5" ry="12.25" transform="rotate\(-25 120.25 80.75\)"/);assert.match(svg,/stroke-dasharray/);
 const cold=JSON.parse(JSON.stringify(t.def)),coldController=createDrawingController({...t.host,model:()=>cold,doc:()=>ensureSheetDoc(cold)});assert.equal(coldController.svg(),svg);
 t.undoStep();near(drawingEllipseGeometry(t.def.drawing.primitives[0].points).rx,40);t.redoStep();assert.equal(t.controller.svg(),svg);assert.equal(JSON.stringify([t.def.parts,t.def.features,t.def.sketches,t.def.history]),cad);
 t.controller.state.selection={kind:'primitive',id:p.id};t.controller.keyDown({key:'Delete'});assert.equal(t.def.drawing.primitives.length,0);t.undoStep();assert.equal(t.controller.svg(),svg);
});
test('invalid picks, edits, cancel and stale document do not add history or replace geometry',async()=>{
 const t=table();t.controller.setTool('sheetellipse');t.click({x:60,y:60});t.click({x:90,y:60});t.click({x:80,y:60});assert.equal(t.undo.length,0);t.click({x:60,y:75});assert.equal(t.undo.length,1);
 const p=t.def.drawing.primitives[0],before=JSON.stringify(t.def);for(const answer of [null,{cx:'60',cy:'60',rx:'',ry:'15',rotation:'0'},{cx:'60',cy:'60',rx:'30',ry:'-15',rotation:'0'},{cx:'60',cy:'60',rx:'30',ry:'15',rotation:'NaN'}]){t.answer(answer);await t.controller.editPrimitive(p.id);assert.equal(JSON.stringify(t.def),before);assert.equal(t.undo.length,1);}
 t.controller.setTool('sheetellipse');t.click({x:140,y:70});t.controller.keyDown({key:'Escape'});assert.equal(t.controller.state.draft,null);assert.equal(t.undo.length,1);
 t.host.promptFields=async()=>{t.def.drawing=structuredClone(t.def.drawing);return {cx:'60',cy:'60',rx:'25',ry:'15',rotation:'0',style:'center'};};await t.controller.editPrimitive(p.id);assert.equal(t.undo.length,1);assert.match(t.messages.at(-1),/changed/);
});
test('Canvas invokes true ellipse with the same center, semi-axes and rotation as SVG',()=>{
 const t=table();t.def.drawing.primitives.push({id:'e',type:'ellipse',points,style:'outline'});t.controller.state.fitted=true;
 const calls=[],c=new Proxy({ellipse(...a){calls.push(a);},measureText(v){return {width:String(v).length*5};}},{get:(o,k)=>k in o?o[k]:()=>{}});t.controller.render(c,900,600);assert.equal(calls.length,1);near(calls[0][0],100);near(calls[0][2],40);near(calls[0][3],20);near(calls[0][4],Math.PI/6);
});

test('half ellipse uses genuine elliptic SVG/Canvas arcs and selects only the visible half including endpoints',()=>{
 const points=drawingEllipsePoints({cx:100,cy:100,rx:40,ry:20,rotation:0}),upper={id:'h',type:'ellipse',points,startAngle:180,endAngle:360,style:'outline'};
 const item=drawingPrimitiveItems(upper)[0],svg=sceneToSvg({paper:{w:210,h:210},items:[item]});assert.match(svg,/M60,100A40,20 0 0 1 140,100/);assert.doesNotMatch(svg,/<ellipse|<circle/);
 assert.equal(drawingPrimitiveHit(upper,{x:100,y:80},.001),true);assert.equal(drawingPrimitiveHit(upper,{x:100,y:120},.1),false);assert.equal(drawingPrimitiveHit(upper,{x:60,y:100},.001),true);
 const reverse={...upper,startAngle:360,endAngle:180};assert.match(sceneToSvg({paper:{w:210,h:210},items:drawingPrimitiveItems(reverse)}),/A40,20 0 0 0 60,100/);
 const t=table();t.def.drawing.primitives.push(reverse);t.controller.state.fitted=true;const calls=[],context=new Proxy({ellipse(...a){calls.push(a);},measureText(v){return {width:String(v).length*5};}},{get:(o,k)=>k in o?o[k]:()=>{}});t.controller.render(context,900,600);assert.equal(calls.length,1);near(calls[0][5],Math.PI*2);near(calls[0][6],Math.PI);assert.equal(calls[0][7],true);
});
test('ellipse arc angle range, wrap, large sweep and rotated exact paper extrema are validated',()=>{
 for(const [startAngle,endAngle] of [[0,0],[0,361],[0,NaN],[Infinity,180],[null,180]])assert.throws(()=>validateDrawingPrimitive({type:'ellipse',points,startAngle,endAngle}));
 const item=drawingPrimitiveItems({type:'ellipse',points,startAngle:330,endAngle:390})[0];near(item.a1-item.a0,Math.PI/3);assert.equal(item.anticlockwise,false);
 assert.match(sceneToSvg({paper:{w:210,h:210},items:drawingPrimitiveItems({type:'ellipse',points,startAngle:0,endAngle:270})}),/A40,20 30 1 1 /);
 const p=drawingEllipsePoints({cx:15,cy:50,rx:30,ry:20,rotation:0});assert.doesNotThrow(()=>validateDrawingPrimitive({type:'ellipse',points:p,startAngle:-90,endAngle:90},{w:100,h:100}));assert.throws(()=>validateDrawingPrimitive({type:'ellipse',points:p,startAngle:90,endAngle:270},{w:100,h:100}),/whole ellipse arc/);
 const rotated=drawingEllipsePoints({cx:30,cy:30,rx:40,ry:20,rotation:45});assert.throws(()=>validateDrawingPrimitive({type:'ellipse',points:rotated,startAngle:90,endAngle:270},{w:100,h:100}),/whole ellipse arc/);
});
test('ordinary angle fields trim a saved full ellipse to a native half through normalized Undo/Redo and cold SVG',async()=>{
 const t=table();t.controller.setTool('sheetellipse');for(const p of points)t.click(p);const p=t.def.drawing.primitives[0],full=t.controller.svg();
 t.answer({cx:'100',cy:'100',rx:'40',ry:'20',rotation:'30',startAngle:'180',endAngle:'360',style:'outline'});await t.controller.editPrimitive(p.id);
 assert.deepEqual(t.fields.slice(5,7).map(f=>f.label),['Start angle (degrees)','End angle (degrees)']);const live=t.def.drawing.primitives[0];assert.equal(live.startAngle,180);assert.equal(live.endAngle,360);const half=t.controller.svg();assert.doesNotMatch(half,/<ellipse/);assert.match(half,/A40,20 30 0 1 /);
 const cold=structuredClone(t.def),c=createDrawingController({...t.host,model:()=>cold,doc:()=>ensureSheetDoc(cold)});assert.equal(c.svg(),half);t.undoStep();assert.equal(t.controller.svg(),full);t.redoStep();assert.equal(t.controller.svg(),half);
 const before=JSON.stringify(t.def),count=t.undo.length;t.answer({cx:'100',cy:'100',rx:'40',ry:'20',rotation:'30',startAngle:'',endAngle:'360',style:'outline'});await t.controller.editPrimitive(p.id);assert.equal(JSON.stringify(t.def),before);assert.equal(t.undo.length,count);
});
