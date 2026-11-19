import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {captureLockPose} from '../js/cad_mates.js';
const source=modelerSource();
function fixture(){
 const components=['base','cover','screw'].map((id,i)=>({id,grounded:i===0,transform:{x:i,y:0,z:0,rx:0,ry:0,rz:0}}));
 const E={assembly:{components,topologyMates:[]},componentSel:components.slice(0,2),topologySelection:[],quickAction:'mate',collectingFeature:true};
 const host={innerHTML:'disabled Add Mate form',hidden:false};let history=0,closed=0,contextSync=0;const messages=[];
 const context={E,t:key=>key,flash:message=>messages.push(message),assemblyPickedRefs:()=>null,mateHolderById:id=>components.find(component=>component.id===id),pushUndo:()=>history++,uid:()=> 'mate'+history,captureLockPose,solveAssembly(){},refreshAll(){},
  root:{querySelector:()=>host},closeFeaturePanel:options=>{assert.equal(options.assemblyPoseOnly,true);E.collectingFeature=false;host.hidden=true;closed++;},syncContextActions:()=>contextSync++};
 context.lockMateComponentPair=new Function(...Object.keys(context),sourceFunctionText(source,'lockMateComponentPair')+';return lockMateComponentPair;')(...Object.values(context));
 context.addTopologyMate=new Function(...Object.keys(context),sourceFunctionText(source,'addTopologyMate')+';return addTopologyMate;')(...Object.values(context));
 const add=new Function(...Object.keys(context),sourceFunctionText(source,'addInspectorTopologyMate')+';return addInspectorTopologyMate;')(...Object.values(context));
 return {E,host,components,add,messages,get history(){return history;},get closed(){return closed;},get contextSync(){return contextSync;}};
}
test('successful inspector Lock closes the stale Add Mate form and next component pair creates its own lock',()=>{
 const f=fixture();assert.equal(f.add('lock'),true);
 assert.equal(f.E.quickAction,null);assert.equal(f.E.collectingFeature,false);assert.equal(f.host.innerHTML,'');assert.equal(f.host.hidden,true);assert.equal(f.closed,1);assert.equal(f.contextSync,1);
 f.E.componentSel=[f.components[0],f.components[2]];assert.equal(f.add('lock'),true);
 assert.equal(f.E.assembly.topologyMates.length,2);assert.equal(f.E.assembly.topologyMates[1].b.componentId,'screw');assert.equal(f.closed,1);
});
test('exact active Lock duplicates are rejected independent of pick order with no pose or history mutation',()=>{
 const f=fixture();f.add('lock');const before=JSON.stringify(f.E.assembly),history=f.history;
 f.E.componentSel.reverse();assert.equal(f.add('lock'),false);assert.equal(f.history,history);assert.equal(JSON.stringify(f.E.assembly),before);assert.deepEqual(f.messages,['lockMateAlreadyExists']);
 f.E.assembly.topologyMates[0].suppressed=true;assert.equal(f.add('lock'),true,'suppressed Lock does not prevent a replacement');assert.equal(f.history,history+1);
});
test('failed inspector creation leaves its form open; unrelated forms are not dismissed by mate success',()=>{
 const f=fixture();f.E.componentSel=[f.components[0]];assert.equal(f.add('lock'),false);assert.equal(f.E.quickAction,'mate');assert.equal(f.closed,0);
 f.E.componentSel=f.components.slice(0,2);f.E.quickAction='motion';assert.equal(f.add('lock'),true);assert.equal(f.E.quickAction,'motion');assert.equal(f.closed,0);
});
