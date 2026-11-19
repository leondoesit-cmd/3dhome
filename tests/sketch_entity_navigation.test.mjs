import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {sketchEntityStep,sketchEntitySwipe,selectedSketchNavigationEntity,sketchNavigationTarget} from '../js/core/sketch_entity_navigation.js';

test('entity browsing wraps and starts predictably without a selection',()=>{
  const entities=[{id:'a'},{id:'b'},{id:'c'}];
  assert.equal(sketchEntityStep(entities,null,1),entities[0]);
  assert.equal(sketchEntityStep(entities,null,-1),entities[2]);
  assert.equal(sketchEntityStep(entities,entities[2],1),entities[0]);
  assert.equal(sketchEntityStep(entities,entities[0],-1),entities[2]);
  assert.equal(sketchEntityStep(entities,entities[1],1),entities[2]);
  assert.deepEqual(entities,[{id:'a'},{id:'b'},{id:'c'}]);
});
test('removed selections and empty sketches remain safe',()=>{
  const entity={id:'a'};
  assert.equal(sketchEntityStep([entity],{id:'removed'},1),entity);
  assert.equal(sketchEntityStep([entity],entity,-1),entity);
  assert.equal(sketchEntityStep([],entity,1),null);
});
test('swipes require intentional horizontal travel and follow reading direction',()=>{
  assert.equal(sketchEntitySwipe(-45,4),1);
  assert.equal(sketchEntitySwipe(45,4),-1);
  assert.equal(sketchEntitySwipe(-45,4,true),-1);
  assert.equal(sketchEntitySwipe(45,4,true),1);
  assert.equal(sketchEntitySwipe(12,0),0);
  assert.equal(sketchEntitySwipe(40,35),0);
  assert.equal(sketchEntitySwipe(NaN,0),0);
});
test('completed feature action does not hide actual face-sketch navigator',()=>{
  const node=()=>({dataset:{},setAttribute(){},appendChild(){},addEventListener(){}});
  const strip=node(),sketch={id:'face',entities:[{id:'circle',type:'circle'}]};
  const E={def:{activeSketch:'face',sketches:[sketch]},quickAction:'extrude',docType:'part',mode:'2d',tool:'select',authoring:{phase:'sketch'}};
  let formOpen=false;
  const root={querySelector:selector=>selector==='#mdEntityNav'?strip:formOpen?node():null};
  const bindings={E,root,getLang:()=> 'en',selEntities:()=>[],el:node,btn:node,sketchEntityStep,sketchEntitySwipe,selectedSketchNavigationEntity,sketchNavigationTarget};
  const source=modelerSource();
  const sync=new Function(...Object.keys(bindings),sourceFunctionText(source,'syncSketchEntityNavigator')+';return syncSketchEntityNavigator;')(...Object.values(bindings));
  sync();assert.equal(strip.hidden,false);
  formOpen=true;sync();assert.equal(strip.hidden,true);
});

import {solveSketch} from '../js/sketch_solver.js';
test('native Next selects standalone point record, enables Parameters and applies exact coordinates through existing solver',()=>{
 const point={id:'p',x:1,y:2},entity={id:'point-entity',type:'point',p:'p',name:'Hole position'},sketch={id:'s',points:[point],entities:[entity],constraints:[]};
 const E={def:{activeSketch:'s',sketches:[sketch]},ssel:[],docType:'part',mode:'2d',tool:'select',authoring:{phase:'sketch'}};
 const make=(text='',run)=>({text,run,dataset:{},children:[],setAttribute(k,v){this[k]=v;},appendChild(n){this.children.push(n);},addEventListener(){}}),strip=make();
 Object.defineProperty(strip,'innerHTML',{set(){this.children=[];}});
 let form,history=0,refreshes=0;
 const root={querySelector:s=>s==='#mdEntityNav'?strip:null};
 const bindings={E,root,getLang:()=> 'en',el:()=>make(),btn:(text,run)=>make(text,run),sketchEntityStep,sketchEntitySwipe,selectedSketchNavigationEntity,sketchNavigationTarget,
  selectSketch:p=>E.ssel=[p],refreshSelection:()=>sync(),ensureSketch:()=>sketch,openQuickForm:f=>form=f,surfaceUVGuide:()=>'',cloneData:v=>JSON.parse(JSON.stringify(v)),pushUndo:()=>history++,uid:()=> 'fixed-p',resolveSketch:()=>{solveSketch(sketch);return true;},refreshAll:()=>refreshes++};
 const src=modelerSource();
 const sync=new Function(...Object.keys(bindings),sourceFunctionText(src,'openSketchPointCoordinates')+sourceFunctionText(src,'syncSketchEntityNavigator')+';return syncSketchEntityNavigator;')(...Object.values(bindings));
 sync();strip.children.find(n=>n['aria-label']==='Next sketch entity').run();
 assert.equal(E.ssel[0],point);assert.ok(strip.children.some(n=>n.textContent==='Hole position · 1 / 1'));
 const parameters=strip.children.find(n=>n['aria-label']==='Selected entity parameters');assert.equal(parameters.disabled,false);parameters.run();
 assert.equal(form.title,'Point coordinates');assert.deepEqual(form.fields.map(f=>f.value),[1,2]);
 assert.equal(form.onApply({x:4.25,y:7.5}),true);assert.ok(Math.abs(point.x-4.25)<1e-6);assert.ok(Math.abs(point.y-7.5)<1e-6);
 assert.equal(history,1);assert.equal(refreshes,1);assert.equal(sketch.entities[0],entity);assert.equal(sketch.constraints[0].point,'p');
});

test('navigation maps cold point records by persistent IDs and ignores missing coordinates',()=>{
 const sketch={points:[{id:'p',x:1,y:2}],entities:[{id:'e',type:'point',p:'p'},{id:'line',type:'line',a:'p',b:'q'}]};
 assert.equal(selectedSketchNavigationEntity(sketch,[{id:'p',x:1,y:2}]),sketch.entities[0]);
 assert.equal(sketchNavigationTarget(sketch,sketch.entities[0]),sketch.points[0]);
 assert.equal(selectedSketchNavigationEntity(sketch,[sketch.points[0],sketch.entities[1]]),null);
 assert.equal(sketchNavigationTarget(sketch,{type:'point',p:'missing'}),null);
});
