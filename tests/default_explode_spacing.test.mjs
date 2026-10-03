import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {defaultExplodeSpacing,createExplodedView,addExplodeStep} from '../js/cad_exploded_view.js';

test('automatic explosion scales to widest placed body with clearance, including rotated extents',()=>{
  assert.equal(defaultExplodeSpacing([{x0:-2.5,x1:2.5},{x0:-2.1,x1:2.1},null]),6);
  assert.equal(defaultExplodeSpacing([{x0:-15,x1:15}]),36);
  assert.ok(Math.abs(defaultExplodeSpacing([{x0:0,x1:.05}])-.15)<1e-12);
  assert.equal(defaultExplodeSpacing([null,{x0:Infinity,x1:-Infinity}]),1.2);
});
test('default explode UI uses placed bounds and reopens saved custom steps without changing them',()=>{
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('function createDefaultExplodedView()'),end=source.indexOf('let explodedPlaybackStop',start);
  const assembly={components:Array.from({length:8},(_,i)=>({id:i}))};
  let boundsCalls=0,applied;
  const context={E:{docType:'assembly',assembly},defaultExplodeSpacing,createExplodedView,addExplodeStep,
    explodeTargets:a=>a.components.map(component=>({component})),componentWorldBounds:(c,options)=>{assert.equal(options.exploded,false);boundsCalls++;return {x0:-2.5,x1:2.5};},
    applyExplodedView:(a,id)=>{applied=id;},pushUndo:()=>{},t:s=>s,refreshAll:()=>{},fitPreview:()=>{},flash:()=>{},openExplodedPlayback:()=>{}};
  vm.runInNewContext(source.slice(start,end)+'\ncreateDefaultExplodedView();',context);
  assert.equal(boundsCalls,8);assert.equal(assembly.explodedViews[0].steps.at(-1).direction.x,42);
  const saved=assembly.explodedViews[0];saved.steps[0].direction.x=2.25;const before=structuredClone(saved);
  vm.runInNewContext('createDefaultExplodedView();',context);
  assert.equal(applied,saved.id);assert.equal(JSON.stringify(saved),JSON.stringify(before));assert.equal(boundsCalls,8);
});
