import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {modelerPrecisionTrialAllowed,modelerTouchPrecisionKind} from '../js/touch_precision.js';
const source=modelerSource();
function fn(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}
function harness(){
 const E={tool:'spoly',polySides:6,ssel:[]},sketch={points:[],entities:[],constraints:[]};let id=0,steps=0,changes;
 const input={value:'6',addEventListener(type,callback){assert.equal(type,'change');changes=callback;}};
 const context={E,drawSketch(){},syncHint(){},dynTyped:()=>null,t:x=>x,pushUndo(){steps++;},H:{discard(){steps--;}},refreshAll(){},
  sketchForView:()=>sketch,uid:()=>String(++id),resolveSketch(){},
  newSketchPoint(s,p){const point={id:String(++id),x:p.u,y:p.v};s.points.push(point);return point.id;},
  snappedSketchPoint(s,p){return context.newSketchPoint(s,p);},markDrawnSelection(lines){E.ssel=lines.map(l=>l.id);}};
 vm.runInNewContext([fn('bindPolygonSideControl'),fn('finishTwoPointTool'),fn('addSketchPolygon')].join('\n'),context);
 const downStart=source.indexOf('    if (E.tool === "srect" || E.tool === "scirc" || E.tool === "spoly") {',source.indexOf('cv.addEventListener("pointerdown"'));
 const down=source.slice(downStart,source.indexOf('    if (E.tool === "sslot")',downStart));
 const upStart=source.indexOf('    if (E.drag && (E.drag.mode === "srect" || E.drag.mode === "scirc" || E.drag.mode === "spoly")) {',source.indexOf('var releasePoint = touchPrecisionPoint'));
 const up=source.slice(upStart,source.indexOf('    if (E.drag && E.drag.mode === "spoint")',upStart));
 vm.runInNewContext('function down(e,su,sv){'+down+'}\nfunction up(e,releasePoint){'+up+'}',context);
 context.precisionModelPoint=()=>null;context.toUV=(x,y)=>({u:x,v:y});context.snapPt=p=>p;
 context.bindPolygonSideControl(input);
 return {E,sketch,context,get steps(){return steps;},choose(value){input.value=value;changes();},input};
}
test('Regular polygon keeps two-point touch gestures and loupe even with Rough or Portal selected',()=>{
 for(const mode of ['lens','rough','portal']){
  assert.equal(modelerPrecisionTrialAllowed('spoly'),false,mode);
  assert.equal(modelerTouchPrecisionKind('spoly','2d',true),'lens');
  const h=harness();h.choose('8');h.context.down({clientX:195,clientY:420},0,0);
  h.context.up({clientX:273,clientY:420},{x:2.5,y:0});
  const circle=h.sketch.entities.find(e=>e.type==='circle'),center=h.sketch.points.find(p=>p.id===circle.c);
  assert.equal(center.x,0);assert.equal(center.y,0);assert.equal(circle.r,2.5);
  assert.equal(h.sketch.entities.filter(e=>e.type==='line').length,8);assert.equal(h.steps,1);
  assert.equal(h.sketch.constraints.filter(c=>c.type==='pointOnCircle').length,8);
  assert.equal(h.sketch.constraints.filter(c=>c.type==='equal').length,7);
 }
 assert.equal(modelerPrecisionTrialAllowed('scirc'),true,'other refined creation tools stay available');
});
test('touch side-count selector can change an armed polygon and reject invalid values without history',()=>{
 const h=harness();h.context.down({clientX:195,clientY:420},0,0);
 h.context.up({clientX:195,clientY:420},{x:0,y:0});assert.equal(h.E.drag.sticky,true);assert.equal(h.steps,0);
 h.E.dynInput={tool:'spoly',values:{sides:'6',diameter:'50'}};h.choose('5');
 assert.equal(h.E.polySides,5);assert.equal(h.E.dynInput.values.sides,undefined);assert.equal(h.E.dynInput.values.diameter,'50');
 for(const value of ['2','25','5.5','bad']){h.choose(value);assert.equal(h.E.polySides,5);assert.equal(h.input.value,'5');}
 h.context.down({clientX:273,clientY:420},2.5,0);
 assert.equal(h.sketch.entities.filter(e=>e.type==='line').length,5);assert.equal(h.steps,1);assert.equal(h.E.drag,null);
});
