import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyExplodedProgress,assemblyHasExplodedOffsets} from '../js/cad_exploded_view.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

test('playback completes earlier steps before later steps and reset preserves poses',()=>{
  const component={id:'a',transform:{x:3,y:4,z:5}},other={id:'b',transform:{x:1}};
  const assembly={components:[component,other],explodedViews:[{id:'view',steps:[
    {components:['a'],direction:{x:10,y:0,z:0}},
    {components:['b'],direction:{x:0,y:20,z:0}},
    {components:['a'],direction:{x:0,y:0,z:30}},
  ]}]};
  const poses=structuredClone(assembly.components.map(c=>c.transform));
  applyExplodedProgress(assembly,'view',.5);
  assert.deepEqual(component.explodedOffset,{x:10,y:0,z:0});
  assert.deepEqual(other.explodedOffset,{x:0,y:10,z:0});
  applyExplodedProgress(assembly,'view',1);
  assert.deepEqual(component.explodedOffset,{x:10,y:0,z:30});
  applyExplodedProgress(assembly,'view',0);
  assert.equal(assembly.exploded,false);
  assert.deepEqual(component.explodedOffset,{x:0,y:0,z:0});
  assert.deepEqual(assembly.components.map(c=>c.transform),poses);
});

test('playback chooser restores named saved views and their durations while preserving grouped steps and assembly poses',()=>{
 const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 const assembly={activeExplodedView:null,components:[{id:'a',transform:{x:1,y:2,z:3}},{id:'b',transform:{x:4,y:5,z:6}}],explodedViews:[{id:'seven',name:'Book groups',animationDurationSeconds:14,steps:[{id:'s1',components:['a','b'],direction:{x:10,y:0,z:0}}]},{id:'detail',name:'Detail view',animationDurationSeconds:6,steps:[{id:'s2',components:['b'],direction:{x:0,y:5,z:0}}]}]};
 const poses=JSON.stringify(assembly.components.map(c=>c.transform)),groups=JSON.stringify(assembly.explodedViews);let spec,change,undos=0,refreshes=0,frame;
 const duration={value:'14',addEventListener(){}},chooser={value:'seven',addEventListener(event,fn){change=fn;}},actions={children:[],appendChild(x){this.children.push(x);}},host={isConnected:true,hidden:false,querySelector:()=>actions,appendChild(){}};
 const E={docType:'assembly',assembly,quickAction:'explodeplay'};
 const bindings={E,applyExplodedProgress,assemblyHasExplodedOffsets,t:key=>key,syncExplodeCommandState:()=>{},normalizeTransform:c=>c.transform,root:{querySelector:()=>host},openQuickForm:x=>{spec=x;return {duration,view:chooser};},el:()=>({}),btn:(label,callback)=>({label,callback}),requestAnimationFrame:callback=>{frame=callback;return 1;},cancelAnimationFrame:()=>frame=null,refreshAll:()=>refreshes++,fitPreview:()=>{},closeFeaturePanel:()=>{},pushUndo:()=>undos++,syncHead:()=>{}};
 new Function(...Object.keys(bindings),'let explodedPlaybackStop=null;'+sourceFunctionText(source,'openExplodedPlayback')+';openExplodedPlayback();')(...Object.values(bindings));
 assert.equal(assembly.activeExplodedView,'seven');assert.equal(spec.fields[0].label,'Exploded view');assert.deepEqual(spec.fields[0].choices,[{value:'seven',label:'Book groups'},{value:'detail',label:'Detail view'}]);
 actions.children.find(x=>x.label==='Play').callback();assert.ok(frame);
 chooser.value='detail';change();assert.equal(frame,null);assert.equal(assembly.activeExplodedView,'detail');assert.equal(duration.value,'6');assert.deepEqual(assembly.components[1].explodedOffset,{x:0,y:5,z:0});assert.equal(undos,1);assert.equal(refreshes,1);
 actions.children.find(x=>x.label==='Reset').callback();assert.equal(assembly.exploded,false);assert.deepEqual(assembly.components[1].explodedOffset,{x:0,y:0,z:0});assert.equal(JSON.stringify(assembly.components.map(c=>c.transform)),poses);assert.equal(JSON.stringify(assembly.explodedViews),groups);
});

test('sequential progress follows nested occurrence paths and clamps endpoints',()=>{
  const child={id:'same'},sibling={id:'same'},assembly={components:[{id:'parent',kind:'assembly',transform:{rz:90},asm:{components:[child]}},sibling],explodedViews:[{id:'view',steps:[{components:[['parent','same']],direction:{x:10,y:0,z:0}}]}]};
  applyExplodedProgress(assembly,'view',2);
  assert.ok(Math.abs(child.explodedOffset.x)<1e-10);
  assert.ok(Math.abs(child.explodedOffset.y+10)<1e-10);
  assert.equal(sibling.explodedOffset,null);
  applyExplodedProgress(assembly,'view',-1);
  assert.equal(assembly.exploded,false);
});

test('playback moves existing GPU groups without rebuilding geometry; Stop and Reset cancel frames',()=>{
  const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const start=source.indexOf('let explodedPlaybackStop = null;'),end=source.indexOf('\n/* One explode step',start);
  const component={id:'a',transform:{x:3,y:4,z:5}},assembly={components:[component],activeExplodedView:'v',explodedViews:[{id:'v',steps:[{components:['a'],direction:{x:10,y:0,z:0}}]}]};
  const mesh={_cadExplodeComponent:component,userData:{},position:{set(...values){this.values=values;}}};
  const interference={userData:{cadInterference:0},visible:true};
  const E={assembly,docType:'assembly',quickAction:'explodeplay',pv:{grp:{traverse:fn=>{fn(mesh);fn(interference);}},render(){}}};
  let durationChanged;
  const actions={children:[],appendChild(item){this.children.push(item);}},duration={value:'1',addEventListener(event,callback){if(event==='change')durationChanged=callback;}};
  const host={isConnected:true,hidden:false,querySelector:()=>actions,appendChild(){}};
  let pending,refreshes=0,cancellations=0,undoCount=0;
  const run=new Function('E','applyExplodedProgress','normalizeTransform','root','openQuickForm','el','btn','requestAnimationFrame','cancelAnimationFrame','refreshAll','closeFeaturePanel','pushUndo','syncHead','t','assemblyHasExplodedOffsets','syncExplodeCommandState',source.slice(start,end)+';return openExplodedPlayback;');
  const open=run(E,applyExplodedProgress,c=>c.transform,{querySelector:()=>host},()=>({duration}),()=>({}),(_label,cb)=>({cb}),cb=>{pending=cb;return 1;},()=>{pending=null;cancellations++;},()=>refreshes++,()=>{},()=>{undoCount++;},()=>{},key=>key,assemblyHasExplodedOffsets,()=>{});
  open();actions.children[0].cb();pending(100);pending(600);
  assert.deepEqual(mesh.position.values,[8,4,5]);
  assert.equal(interference.visible,false,'the first interference marker must not remain at its assembled coordinates');
  assert.equal(refreshes,0,'frames must not refresh or rebuild the assembly');
  actions.children[1].cb();assert.equal(pending,null);
  actions.children[2].cb();assert.deepEqual(mesh.position.values,[3,4,5]);
  assert.ok(cancellations>0);assert.deepEqual(component.transform,{x:3,y:4,z:5});
  duration.value='20';durationChanged();
  assert.equal(assembly.explodedViews[0].animationDurationSeconds,20);
  assert.equal(undoCount,1,'a valid duration change must be undoable and retained with the saved view');
  duration.value='0';durationChanged();
  assert.equal(assembly.explodedViews[0].animationDurationSeconds,20,'invalid duration must not replace saved settings');
  assert.equal(undoCount,1);
});
