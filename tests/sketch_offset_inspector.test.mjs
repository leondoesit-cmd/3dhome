import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {setSketchOffset,sketchOffsetValue} from '../js/core/sketch_offset.js';

function node(){return {children:[],listeners:{},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(type,action){(this.listeners[type] ||= []).push(action);},dispatchEvent(event){for(const action of this.listeners[event.type] || [])action(event);return true;}};}
function fixture(){
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('var propGen = 0;'),end=source.indexOf('\n/* The inspector was one long column:',start);
  assert.ok(start>=0 && end>start);
  const sketch={id:'new-right-sketch',plane:'side',referenceId:'plane:right',frameSpace:'local',offset:0,frame:{origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0}}};
  const E={def:{sketches:[sketch],references:[{id:'plane:right',origin:{x:0,y:0,z:0},normal:{x:1,y:0,z:0}}],features:[],history:[{kind:'sketch',targetId:sketch.id}]}};
  const undo=[],refresh=[],scheduled=[],host=node();
  const context={E,Event,fin:Number.isFinite,setSketchOffset,sketchOffsetValue,t:key=>key,el:node,
    modelLengthUnit:()=> 'mm',lengthToDocument:(cm)=>cm*10,lengthFromDocument:(mm)=>mm/10,
    pushUndo:(...args)=>undo.push(args),refreshAll:()=>refresh.push(true),invalidateSketchProjection:()=>{},syncSketchDrivenParts:()=>{},
    isCanonicalAuthoring:()=>true,scheduleExactRestore:()=>scheduled.push(true),btn:(label,action)=>({label,action})};
  runInNewContext(source.slice(start,end)+'\nthis.add=addSketchOffsetControl;',context);
  const input=context.add(host,sketch.id);
  return {context,E,sketch,undo,refresh,scheduled,host,input};
}

test('retained Offset input commits fill then blur without a native change event, resolving the current document sketch',()=>{
  const f=fixture();f.E.def=structuredClone(f.E.def);f.input.value='39';
  f.input.dispatchEvent(new Event('blur'));
  const current=f.E.def.sketches[0];assert.equal(current.frame.origin.x,3.9);assert.equal(current.supportOffset,3.9);
  assert.equal(current.offset,3.9);assert.equal(f.sketch.frame.origin.x,0,'retained row must not mutate the orphan sketch');
  assert.equal(f.E.def.history[0].status,'pending');assert.equal(f.undo.length,1);assert.equal(f.refresh.length,1);
  f.input.dispatchEvent(new Event('blur'));assert.equal(f.undo.length,1,'repeated blur must not add duplicate undo entries');
});

test('Enter commits Offset and stops the command shortcut; Apply offers the same canonical commit route',()=>{
  for(const method of ['Enter','Apply']){
    const f=fixture();f.input.value='39';let prevented=false,stopped=false;
    if(method==='Enter')f.input.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    else f.host.children.find(child=>child.label==='applySketchOffset').action();
    assert.equal(f.sketch.frame.origin.x,3.9);assert.equal(f.undo.length,1);assert.equal(f.refresh.length,1);
    if(method==='Enter'){assert.equal(prevented,true);assert.equal(stopped,true);}
  }
});

test('native change then blur commits once; invalid values cannot dirty history; dependent feature schedules exact regeneration',()=>{
  const f=fixture();f.E.def.features.push({params:{sketchId:f.sketch.id}});
  f.input.value='39';f.input.dispatchEvent(new Event('change'));f.input.dispatchEvent(new Event('blur'));
  assert.equal(f.undo.length,1);assert.equal(f.scheduled.length,1);assert.equal(f.sketch.frame.origin.x,3.9);
  f.input.value='';f.input.dispatchEvent(new Event('blur'));assert.equal(f.undo.length,1);
});
