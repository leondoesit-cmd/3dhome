import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText, withSetters} from './helpers/source_function.mjs';
import {createExplodedView,applyExplodedView,applyExplodedProgress,assemblyHasExplodedOffsets} from '../js/cad_exploded_view.js';

const source=modelerSource();
test('New exploded view preserves the previous groups, resets nested offsets and leaves assembly poses unchanged',()=>{
  const child={id:'child',transform:{x:2,y:4,z:6}},parent={id:'parent',kind:'assembly',transform:{x:10},asm:{components:[child]}};
  const assembly={components:[parent,{id:'bolt',transform:{x:1,y:3,z:5}}],activeExplodedView:'old',
    explodedViews:[{id:'old',name:'Original automatic view',steps:[{id:'step',components:['bolt',['parent','child']],direction:{x:200,y:0,z:0}}]}]};
  applyExplodedView(assembly,'old',1);
  const original=JSON.stringify(assembly.explodedViews[0]),poses=JSON.stringify([parent.transform,child.transform,assembly.components[1].transform]);
  const E={docType:'assembly',assembly};let undo,opens=0,stops=0,refreshes=0,fits=0;
  const context={E,createExplodedView,applyExplodedView,explodedPlaybackStop:()=>stops++,pushUndo:()=>{undo=structuredClone(assembly);},refreshAll:()=>refreshes++,fitPreview:()=>fits++,syncHead(){},openExplodedPlayback:()=>opens++};
  const create=Function(...Object.keys(context),withSetters('return ('+sourceFunctionText(source,'createEmptyExplodedView')+');'))(...Object.values(context));
  create();
  assert.equal(assembly.explodedViews.length,2);assert.equal(JSON.stringify(assembly.explodedViews[0]),original);
  const added=assembly.explodedViews[1];assert.deepEqual(added.steps,[]);assert.equal(assembly.activeExplodedView,added.id);
  assert.equal(assembly.exploded,false);assert.equal(child.explodedOffset,null);assert.equal(assembly.components[1].explodedOffset,null);
  assert.equal(JSON.stringify([parent.transform,child.transform,assembly.components[1].transform]),poses);
  assert.equal(stops,1);assert.equal(opens,1);assert.equal(refreshes,1);assert.equal(fits,1);
  assert.equal(undo.activeExplodedView,'old');assert.equal(undo.explodedViews.length,1,'one undo recovers the previous active view and pose');
  const reopened=JSON.parse(JSON.stringify(assembly));
  assert.equal(reopened.activeExplodedView,added.id);assert.deepEqual(reopened.explodedViews[1].steps,[]);
  applyExplodedView(reopened,'old',1);assert.equal(reopened.components[1].explodedOffset.x,200,'original view remains playable');
});

test('playback exposes New exploded view and ignores a callback belonging to a replaced assembly',()=>{
  const assembly={components:[],activeExplodedView:'v',explodedViews:[{id:'v',steps:[]}]},E={assembly,docType:'assembly'};
  let created=0;const actions={children:[],appendChild:x=>actions.children.push(x)};
  const context={E,applyExplodedProgress,assemblyHasExplodedOffsets,t:key=>key,explodedPlaybackStop:null,root:{querySelector:()=>({querySelector:()=>actions,appendChild(){}})},
    openQuickForm:()=>({duration:{value:4,addEventListener(){}}}),el:()=>({}),btn:(label,click)=>({label,click}),createEmptyExplodedView:()=>created++};
  const open=Function(...Object.keys(context),withSetters('return ('+sourceFunctionText(source,'openExplodedPlayback')+');'))(...Object.values(context));
  open();const button=actions.children.find(x=>x.label==='New exploded view');assert.ok(button);
  button.click();assert.equal(created,1);
  E.assembly={components:[]};button.click();assert.equal(created,1);
});
