import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {defaultExplodeSpacing,createExplodedView,addExplodeStep,applyExplodedView,explodeTargets} from '../js/cad_exploded_view.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

test('automatic explosion scales to widest placed body with clearance, including rotated extents',()=>{
  assert.equal(defaultExplodeSpacing([{x0:-2.5,x1:2.5},{x0:-2.1,x1:2.1},null]),6);
  assert.equal(defaultExplodeSpacing([{x0:-15,x1:15}]),36);
  assert.ok(Math.abs(defaultExplodeSpacing([{x0:0,x1:.05}])-.15)<1e-12);
  assert.equal(defaultExplodeSpacing([null,{x0:Infinity,x1:-Infinity}]),1.2);
});

test('configuration-cleared active pointer reuses the saved seven grouped steps without creating a sixteen-step default',()=>{
 const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const assembly={components:Array.from({length:17},(_,i)=>({id:i+1,transform:{x:i,y:0,z:0}})),activeExplodedView:null,explodedViews:[{id:'book-groups',name:'Exploded View 1',steps:Array.from({length:7},(_,i)=>({id:'step'+i,components:[String(i*2+2),String(i*2+3)],direction:{x:0,y:i+1,z:0}}))}]};
 const groups=JSON.stringify(assembly.explodedViews),poses=JSON.stringify(assembly.components.map(c=>c.transform));let opens=0;
 const context={E:{docType:'assembly',assembly},explodeTargets,applyExplodedView,pushUndo:()=>{},t:x=>x,refreshAll:()=>{},fitPreview:()=>{},flash:()=>{},openExplodedPlayback:()=>opens++,createExplodedView:()=>{throw Error('must reuse saved groups');}};
 vm.runInNewContext(sourceFunctionText(source,'createDefaultExplodedView')+';createDefaultExplodedView();',context);
 assert.equal(assembly.activeExplodedView,'book-groups');assert.equal(assembly.explodedViews.length,1);assert.equal(assembly.explodedViews[0].steps.length,7);assert.equal(JSON.stringify(assembly.explodedViews),groups);assert.equal(JSON.stringify(assembly.components.map(c=>c.transform)),poses);assert.equal(opens,1);assert.deepEqual(assembly.components[1].explodedOffset,{x:0,y:1,z:0});assert.deepEqual(assembly.components[2].explodedOffset,{x:0,y:1,z:0});
});

test('new empty assembly still creates its first default exploded view safely',()=>{
 const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),assembly={components:[]};let opened=0;
 const context={E:{docType:'assembly',assembly},explodeTargets,applyExplodedView,defaultExplodeSpacing,createExplodedView,addExplodeStep,componentWorldBounds:()=>null,pushUndo:()=>{},t:x=>x,refreshAll:()=>{},fitPreview:()=>{},flash:()=>{},openExplodedPlayback:()=>opened++};
 vm.runInNewContext(sourceFunctionText(source,'createDefaultExplodedView')+';createDefaultExplodedView();',context);
 assert.equal(assembly.explodedViews.length,1);assert.equal(assembly.explodedViews[0].steps.length,0);assert.equal(assembly.activeExplodedView,assembly.explodedViews[0].id);assert.equal(opened,1);
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
