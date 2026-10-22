import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../vendor/acorn/acorn.mjs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {cylinderUVDomain,surfacePoint} from '../js/core/surface_uv.js';
import {solveSketch,translateSketchGeometry} from '../js/sketch_solver.js';
const source=modelerSource();
const descriptor={surface:'cylinder',radius:.29,origin:{x:1.8,y:0,z:0},referenceOrigin:{x:-2.2,y:0,z:0},axis:{x:-1,y:0,z:0},axisRange:[-4.4,-3.6]};

test('journal UV guide translates native reference range into surface origin coordinates',()=>{
 const domain=cylinderUVDomain(descriptor);
 assert.ok(Math.abs(domain.vRange[0]+.4)<1e-12);assert.ok(Math.abs(domain.vRange[1]-.4)<1e-12);
 assert.ok(Math.abs(domain.uPeriod-2*Math.PI*.29)<1e-12);
 assert.ok(Math.abs(surfacePoint(descriptor,0,0).x-1.8)<1e-12);
 assert.ok(Math.abs(surfacePoint(descriptor,0,1.8).x)<1e-12);
 const guide=new Function('cylinderUVDomain','modelLengthText','modelLengthUnit',sourceFunctionText(source,'surfaceUVGuide')+';return surfaceUVGuide;')(cylinderUVDomain,x=>String(Number((x*10).toFixed(4))),()=> 'mm');
 assert.match(guide({frameSpace:'surface-uv',surface:{descriptor}}),/V on this face: -4 to 4 mm/);
 assert.match(guide({frameSpace:'surface-uv',surface:{descriptor}}),/U wraps every 18\.2212 mm/);
 assert.equal(guide({plane:'front'}),'');
 assert.equal(cylinderUVDomain({surface:'sphere',radius:1}),null);
 assert.equal(cylinderUVDomain({...descriptor,axisRange:undefined}).vRange,null);
 const reversed=cylinderUVDomain({...descriptor,axis:{x:2,y:0,z:0},referenceOrigin:{x:2.8,y:0,z:0},axisRange:[0,2]});
 assert.ok(Math.abs(reversed.vRange[0]-1)<1e-12);assert.ok(Math.abs(reversed.vRange[1]-3)<1e-12);
});

function pointSpec(){
 let spec;function visit(n){if(!n||typeof n!=='object')return;if(n.type==='ObjectExpression'&&n.properties.some(p=>p.key?.name==='action'&&p.value.value==='pointcoordinates'))spec=n;for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}
 visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return spec;
}

test('editing a fixed point replaces its fixed target but preserves and reports competing constraints',()=>{
 const spec=pointSpec(),callback=spec.properties.find(p=>p.key.name==='onApply').value;
 function run(competing){
  const sketch={points:[{id:2925,x:0,y:1.8,fixed:false},{id:2926,x:.8,y:1.8}],entities:[{id:2927,type:'line',a:2925,b:2926}],constraints:[{id:2929,type:'fixed',point:2925,x:0,y:1.8},...(competing?[{id:2928,type:'horizontal',entity:2927},{id:2930,type:'fixed',point:2926,x:.8,y:1.8}]:[])]};
  const before=structuredClone(sketch);let discarded=0,refused=0;
  const bindings={sketch,point:sketch.points[0],pushUndo:()=>{},cloneData:structuredClone,uid:()=>4000,resolveSketch:rollback=>{const pts=structuredClone(sketch.points);const info=solveSketch(sketch);const ok=info.status!=='conflicting';if(!ok&&rollback)sketch.points.forEach((p,i)=>Object.assign(p,pts[i]));return ok;},addedConstraintIds:()=>[4000],explainSketchConflict:()=>({ids:[2928,2930]}),constraintCaption:()=> 'Fixed point',refusalMessage:()=> 'Conflicts with Horizontal and Fixed point',H:{discard:()=>discarded++},showSketchRefusal:()=>refused++,refreshAll:()=>{}};
  const handler=new Function(...Object.keys(bindings),'var coordinateError="";return {apply:'+source.slice(callback.start,callback.end)+',error:()=>coordinateError};')(...Object.values(bindings));
  const result=handler.apply({x:0,y:0});
  if(competing){assert.equal(result,false);assert.deepEqual(sketch,before);assert.equal(discarded,1);assert.equal(refused,1);assert.match(handler.error(),/Conflicts with Horizontal/);assert.match(handler.error(),/Translate sketch geometry/);
   translateSketchGeometry(sketch,0,-1.8);assert.equal(solveSketch(sketch).status,'fully-constrained');assert.deepEqual(sketch.points.map(p=>p.y),[0,0]);assert.deepEqual(sketch.constraints.filter(c=>c.type==='fixed').map(c=>c.y),[0,0]);
  }
  else {assert.equal(result,true);assert.ok(Math.abs(sketch.points[0].y)<1e-5);assert.equal(sketch.constraints.filter(c=>c.type==='fixed'&&c.point===2925).length,1);assert.equal(sketch.constraints[0].y,0);}
 }
 run(false);run(true);
});

test('quick form preserves a persistent accessible refusal message after Apply rejects',async()=>{
 const children=[];const element=()=>({appendChild(x){children.push(x);},setAttribute(k,v){this[k]=v;},addEventListener(){},focus(){},classList:{contains:()=>false}});
 const host=element(),E={authoring:{}};let apply,refresh=0,accept=false;
 const bindings={E,motionPlaybackCancel:null,root:{querySelector:()=>host},el:element,t:x=>x,featureField:()=>({value:'0'}),featureControlValue:()=>0,modelLengthUnit:()=> 'mm',namedButton:x=>x,btn:(label,callback,style)=>{if(style==='md-quick-apply')apply=callback;return element();},validateFeatureInputs:()=>true,syncCommandManager:()=>{},document:{body:element()},requestAnimationFrame:fn=>fn(),closeFeaturePanel:()=>{},refreshAll:()=>refresh++};
 const open=new Function(...Object.keys(bindings),sourceFunctionText(source,'openQuickForm')+';return openQuickForm;')(...Object.values(bindings));
 open({action:'pointcoordinates',title:'Coordinates',fields:[{key:'y',type:'number'}],onApply:()=>accept,failureMessage:()=> 'Conflicts with Horizontal'});
 await apply();const alert=children.find(x=>x.role==='alert');assert.equal(alert.hidden,false);assert.equal(alert.textContent,'Conflicts with Horizontal');assert.equal(E.quickAction,'pointcoordinates');assert.equal(refresh,0);
 accept=true;await apply();assert.equal(alert.hidden,true);assert.equal(E.quickAction,null);assert.equal(refresh,1);
});
