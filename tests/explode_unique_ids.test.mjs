import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplodedView,addExplodeStep,normalizeExplodeStepIds,applyExplodedView} from '../js/cad_exploded_view.js';

test('automatic explode steps and views have unique IDs even within one clock tick',()=>{
  const savedNow=Date.now;Date.now=()=>12345678;
  try {
    const assembly={explodedViews:[{id:'ev_saved',name:'Existing',steps:[{id:'step_saved'}]}]};
    const preserved=JSON.stringify(assembly.explodedViews[0]);
    const views=Array.from({length:20},()=>createExplodedView(assembly));
    assert.equal(new Set(views.map(view=>view.id)).size,20);
    const steps=Array.from({length:100},(_,i)=>addExplodeStep(views[0],[i],{x:i,y:0,z:0}));
    assert.equal(new Set(steps.map(step=>step.id)).size,100);
    const chosen=steps[42].id;views[0].steps=views[0].steps.filter(step=>step.id!==chosen);
    assert.equal(views[0].steps.length,99,'removing one ID removes only the selected step');
    assert.equal(JSON.stringify(assembly.explodedViews[0]),preserved,'saved document IDs are never rewritten');
  } finally {Date.now=savedNow;}
});

test('fallback IDs remain unique without browser crypto',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),savedNow=Date.now;
  Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});Date.now=()=>9;
  try {
    const assembly={},view=createExplodedView(assembly);
    const steps=Array.from({length:20},()=>addExplodeStep(view,[1]));
    assert.equal(new Set(steps.map(step=>step.id)).size,20);
    assert.equal(steps.every(step=>step.id.startsWith('step_')),true);
  } finally {Date.now=savedNow;if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});

test('using a legacy collided view repairs only duplicate or missing step IDs and persists the repair',()=>{
  const assembly={components:[{id:'rod',transform:{}}],explodedViews:[{id:'ev_saved',steps:
    ['step_old','step_old','step_distinct',null].map((id,i)=>({id,components:['rod'],direction:{x:i+1,y:0,z:0}}))}]};
  const geometry=JSON.stringify(assembly.explodedViews[0].steps.map(({id,...step})=>step));
  applyExplodedView(assembly,'ev_saved');
  const steps=assembly.explodedViews[0].steps;
  assert.equal(steps[0].id,'step_old');assert.equal(steps[2].id,'step_distinct');
  assert.equal(new Set(steps.map(step=>step.id)).size,4);
  assert.equal(JSON.stringify(steps.map(({id,...step})=>step)),geometry);
  assert.equal(assembly.components[0].explodedOffset.x,10);
  assert.equal(normalizeExplodeStepIds(assembly),0,'subsequent uses keep the repaired identities');
  const roundtrip=JSON.parse(JSON.stringify(assembly));assert.deepEqual(roundtrip.explodedViews,assembly.explodedViews);
});
