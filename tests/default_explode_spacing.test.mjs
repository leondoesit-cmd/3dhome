import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {defaultExplodeSpacing,defaultExplodeLayout,assemblyHasExplodedOffsets,createExplodedView,addExplodeStep,applyExplodedView,explodeTargets} from '../js/cad_exploded_view.js';
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
 const context={E:{docType:'assembly',assembly},assemblyHasExplodedOffsets,explodeTargets,applyExplodedView,pushUndo:()=>{},t:x=>x,refreshAll:()=>{},fitPreview:()=>{},flash:()=>{},openExplodedPlayback:()=>opens++,createExplodedView:()=>{throw Error('must reuse saved groups');}};
 vm.runInNewContext(sourceFunctionText(source,'createDefaultExplodedView')+';createDefaultExplodedView();',context);
 assert.equal(assembly.activeExplodedView,'book-groups');assert.equal(assembly.explodedViews.length,1);assert.equal(assembly.explodedViews[0].steps.length,7);assert.equal(JSON.stringify(assembly.explodedViews),groups);assert.equal(JSON.stringify(assembly.components.map(c=>c.transform)),poses);assert.equal(opens,1);assert.deepEqual(assembly.components[1].explodedOffset,{x:0,y:1,z:0});assert.deepEqual(assembly.components[2].explodedOffset,{x:0,y:1,z:0});
});

test('new empty assembly still creates its first default exploded view safely',()=>{
 const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),assembly={components:[]};let opened=0;
 const context={E:{docType:'assembly',assembly},assemblyHasExplodedOffsets,explodeTargets,applyExplodedView,defaultExplodeLayout,createExplodedView,addExplodeStep,componentWorldBounds:()=>null,pushUndo:()=>{},t:x=>x,refreshAll:()=>{},fitPreview:()=>{},flash:()=>{},openExplodedPlayback:()=>opened++};
 vm.runInNewContext(sourceFunctionText(source,'createDefaultExplodedView')+';createDefaultExplodedView();',context);
 assert.equal(assembly.explodedViews.length,1);assert.equal(assembly.explodedViews[0].steps.length,0);assert.equal(assembly.activeExplodedView,assembly.explodedViews[0].id);assert.equal(opened,1);
});
test('default explode UI uses placed bounds and reopens saved custom steps without changing them',()=>{
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('function createDefaultExplodedView()'),end=source.indexOf('let explodedPlaybackStop',start);
  const assembly={components:Array.from({length:8},(_,i)=>({id:i}))};
  let boundsCalls=0,applied;
  const context={E:{docType:'assembly',assembly},assemblyHasExplodedOffsets,defaultExplodeLayout,createExplodedView,addExplodeStep,
    explodeTargets:a=>a.components.map(component=>({component})),componentWorldBounds:(c,options)=>{assert.equal(options.exploded,false);boundsCalls++;return {x0:-2.5,x1:2.5,z0:-1,z1:1};},
    applyExplodedView:(a,id)=>{applied=id;},pushUndo:()=>{},t:s=>s,refreshAll:()=>{},fitPreview:()=>{},flash:()=>{},openExplodedPlayback:()=>{}};
  vm.runInNewContext(source.slice(start,end)+'\ncreateDefaultExplodedView();',context);
  assert.equal(boundsCalls,8);assert.ok(Math.abs(assembly.explodedViews[0].steps.at(-1).direction.x-5.6)<1e-8);
  assert.ok(Math.abs(assembly.explodedViews[0].steps.at(-1).direction.z-5.2)<1e-8);
  const saved=assembly.explodedViews[0];saved.steps[0].direction.x=2.25;const before=structuredClone(saved);
  vm.runInNewContext('createDefaultExplodedView();',context);
  assert.equal(applied,saved.id);assert.equal(JSON.stringify(saved),JSON.stringify(before));assert.equal(boundsCalls,8);
});

test('compact default rows fit a vice and its small fasteners proportionately without footprint overlap',()=>{
  const bounds=Array.from({length:16},(_,index)=>index===0?{x0:-9,x1:9,z0:-3,z1:3}:
    index===1?{x0:7,x1:15,z0:-1,z1:1}:{x0:4+index,x1:6+index,z0:-1,z1:1});
  const layout=defaultExplodeLayout(bounds);assert.deepEqual(layout[0],{x:0,y:0,z:0});
  const placed=bounds.map((box,index)=>({x0:box.x0+layout[index].x,x1:box.x1+layout[index].x,z0:box.z0+layout[index].z,z1:box.z1+layout[index].z}));
  const width=Math.max(...placed.map(box=>box.x1))-Math.min(...placed.map(box=>box.x0));
  assert.ok(width<54,`default width ${width}cm must stay below three base widths, rather than 324cm`);
  for(let i=0;i<placed.length;i++)for(let j=i+1;j<placed.length;j++){
    const a=placed[i],b=placed[j];assert.ok(a.x1<b.x0 || b.x1<a.x0 || a.z1<b.z0 || b.z1<a.z0,`bodies ${i}/${j} need clearance`);
  }
  assert.deepEqual(defaultExplodeLayout([]),[]);assert.ok(defaultExplodeLayout([null,{x0:NaN}]).every(offset=>Object.values(offset).every(Number.isFinite)));
});

test('explode action labels and accessible pressed state show both main and Pro ribbon presentation state',()=>{
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const button=()=>({label:{},attributes:{},querySelector(){return this.label;},setAttribute(key,value){this.attributes[key]=value;}}),main=button(),pro=button();
  const E={assembly:{components:[{id:1,explodedOffset:null},{id:2,explodedOffset:{x:50,y:0,z:0}}]}};
  const context={E,assemblyHasExplodedOffsets,t:key=>key,root:{querySelectorAll:()=>[main],ownerDocument:{querySelectorAll:()=>[pro]}}};
  vm.runInNewContext(sourceFunctionText(source,'syncExplodeCommandState')+';syncExplodeCommandState();',context);
  for(const b of [main,pro]){assert.equal(b.label.textContent,'collapseExplodeView');assert.equal(b.attributes['aria-pressed'],'true');assert.match(b.title,/assemblyExploded/);}
  applyExplodedView(E.assembly,null);vm.runInNewContext('syncExplodeCommandState();',context);
  for(const b of [main,pro]){assert.equal(b.label.textContent,'explodeAssembly');assert.equal(b.attributes['aria-pressed'],'false');assert.match(b.title,/assemblyAssembled/);}
});
