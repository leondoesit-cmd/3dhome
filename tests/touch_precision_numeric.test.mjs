import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sourceFunctionText } from './helpers/source_function.mjs';
import { dispatchPrecisionCommit, precisionModelPoint } from '../js/touch_precision_ui.js';

const ui=readFileSync(new URL('../js/touch_precision_ui.js',import.meta.url),'utf8');
const modeler=modelerSource();

test('explicit numeric target preserves off-canvas projection and ignores drag locks',()=>{
  const state={lock:'v',initialX:20};
  const set=Function('state','rect','clamp','sync','options','return ('+sourceFunctionText(ui,'setTarget')+')')(
    state,()=>({width:100,height:100}),(v,a,b)=>Math.max(a,Math.min(b,v)),()=>{},{},
  );
  set(-30,150,false,{x:0,y:3});
  assert.equal(state.x,-30);assert.equal(state.y,150);
  assert.deepEqual(state.exactModel,{x:0,y:3});
  set(-30,150,false);
  assert.equal(state.x,20);assert.equal(state.y,100);
  assert.equal(state.exactModel,null);
});

test('native precision event carries numeric intent and ordinary touch remains snap eligible',()=>{
  const previous=globalThis.PointerEvent;
  globalThis.PointerEvent=class {constructor(type,values){Object.assign(this,values);this.type=type;}};
  try {
    const events=[];
    const canvas={getBoundingClientRect:()=>({left:10,top:20}),dispatchEvent:e=>events.push(e)};
    dispatchPrecisionCommit(canvas,{x:-30,y:150,exactModel:{x:0,y:3}});
    const expression=modeler.match(/var sp = exactPrecision \? uv : (snapPt\([^;]+?\)), su = sp\.u/)?.[1];
    assert.ok(expression,'native sketch down retains normal snap branch');
    let snaps=0;
    const choose=Function('exactPrecision','uv','snapPt','E','return exactPrecision ? uv : '+expression);
    for(const event of events){
      const exact=precisionModelPoint(event);
      assert.deepEqual(exact,{x:0,y:3});
      assert.deepEqual(choose(exact,{u:exact.x,v:exact.y},()=>{snaps++;return{u:.3,v:3};},{tool:'select'}),{u:0,v:3});
    }
    assert.equal(snaps,0);
    events.length=0;dispatchPrecisionCommit(canvas,{x:40,y:50});
    assert.equal(precisionModelPoint(events[0]),null);
    assert.deepEqual(choose(null,{u:0,v:3},()=>{snaps++;return{u:.3,v:3};},{tool:'select'}),{u:.3,v:3});
    assert.equal(snaps,1);
  } finally {globalThis.PointerEvent=previous;}
});

test('Confirm without coordinate edits preserves the rough pointer target',()=>{
  const state={coordinatesEdited:false,exactModel:null};
  const inputA={value:'0'},inputB={value:'3'};
  let projected=0;
  const apply=Function('state','options','inputA','inputB','setTarget','shownA','shownB','return ('+sourceFunctionText(ui,'applyInputs')+')')(
    state,{modelToScreen:()=>{projected++;return{x:20,y:30};}},inputA,inputB,()=>{},'0','3',
  );
  apply();assert.equal(projected,0);
  state.coordinatesEdited=true;
  apply();assert.equal(projected,1);
  state.coordinatesEdited=false;inputA.value='125';
  apply();assert.equal(projected,2,'Confirm reads the latest value even before input/change is dispatched');
  inputA.value='';apply();assert.equal(projected,2,'an empty coordinate is not silently converted to zero');
});
