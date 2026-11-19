import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {defaultTopologyMateAlignment} from '../js/cad_mate_reference_choices.js';
import {solveTopologyMates,topologyReference} from '../js/cad_mates.js';
import {validLimitMateBounds} from '../js/cad_mate_model.js';

const source=modelerSource();
const point=(x=0,y=0,z=0)=>({x,y,z});
const plane=(component,id,origin,normal)=>topologyReference(component,'face',id,{surface:'plane',origin,normal});
function manager(canAngle,add){
 let form;
 const open=new Function('E','setDocumentType','setTab','flash','t','MATE_PALETTE','mateTypeFits','assemblyPickedRefs','componentLabel','openQuickForm','addTopologyMate','root',sourceFunctionText(source,'openMatePropertyManager')+';return openMatePropertyManager;')
  ({assembly:{}},()=>{},()=>{},()=>{},key=>key,[['lock','','Lock'],['angle','','Angle']],type=>({ok:type==='lock'||canAngle}),()=>({a:{componentId:'base'},b:{componentId:'jaw'}}),id=>id,spec=>{
   form=spec;return Object.fromEntries(spec.fields.map(field=>[field.key,{value:field.value,addEventListener(){},closest(){return{classList:{toggle(){}}};}}]));
  },add,{querySelector:()=>null});
 open();return form;
}

test('Parallel planes shortcut appears only for native angle-compatible picks and stores an ordinary zero-angle mate',()=>{
 const assembly={components:[{id:'base',grounded:true,transform:{}},{id:'jaw',transform:{x:3,y:9,z:2,rz:17}}],topologyMates:[]};
 const picks={a:plane('base','top-base',point(),point(0,1,0)),b:plane('jaw','top-jaw',point(),point(0,1,0))};
 let undos=0,result,serial=0;
 const E={assembly};
 const context={E,flash:()=>{},t:key=>key,validLimitMateBounds,mateTypeFits:()=>({ok:true}),assemblyPickedRefs:()=>picks,mateReferenceFromPick:value=>value,
  mateHolderById:id=>assembly.components.find(component=>component.id===id),mateAlignmentForLockedOrientation:()=>null,componentFreedom:()=>null,
  pushUndo:()=>undos++,uid:()=>++serial,defaultTopologyMateAlignment,clampMateAngle:value=>Math.max(0,Math.min(180,Number(value)||0)),
  solveAssembly:()=>{result=solveTopologyMates(assembly);},refreshAll:()=>{}};
 const add=new Function(...Object.keys(context),sourceFunctionText(source,'addTopologyMate')+';return addTopologyMate;')(...Object.values(context));
 const form=manager(true,add),choice=form.fields.find(field=>field.key==='type').choices.find(choice=>choice.value==='parallel');
 assert.equal(choice.label,'parallelPlanesMate');assert.equal(form.onApply({type:'parallel',angle:45}),true);
 assert.equal(undos,1);assert.equal(result.ok,true);assert.equal(result.degreesOfFreedom,4,'orientation fixes two rotations but leaves translation and axial roll');
 const mate=assembly.topologyMates[0];assert.equal(mate.type,'angle');assert.equal(mate.value,0);assert.equal(mate.angleMin,undefined);
 assert.deepEqual([assembly.components[1].transform.x,assembly.components[1].transform.y,assembly.components[1].transform.z],[3,9,2],'plane origins are not captured');
 const reopened=JSON.parse(JSON.stringify(assembly));assert.equal(solveTopologyMates(reopened).ok,true);
 assert.equal(reopened.topologyMates[0].type,'angle');assert.equal(reopened.topologyMates[0].value,0);
 assert.equal(manager(false,()=>{}).fields.find(field=>field.key==='type').choices.some(choice=>choice.value==='parallel'),false);
});

test('native zero-angle jaw guide removes only the remaining swivel freedom without recapturing translation',()=>{
 const axis=(component,id,origin)=>topologyReference(component,'axis',id,{surface:'axis',origin,axis:point(0,0,1)});
 const assembly={components:[{id:'base',grounded:true,transform:{}},{id:'jaw',transform:{x:6.5,y:11.5,z:0,rz:12}}],topologyMates:[
  {id:'swivel',type:'concentric',a:axis('base','pin',point(6.5,11.5)),b:axis('jaw','bore',point())},
  {id:'z',type:'distance',value:0,aligned:true,a:plane('base','front-base',point(),point(0,0,1)),b:plane('jaw','front-jaw',point(),point(0,0,1))},
 ]};
 assert.equal(solveTopologyMates(assembly).degreesOfFreedom,1);
 const form=manager(true,(type,value)=>{assembly.topologyMates.push({id:'guide',type,value,a:plane('base','top-base',point(),point(0,1,0)),b:plane('jaw','top-jaw',point(),point(0,1,0))});return true;});
 form.onApply({type:'parallel'});const result=solveTopologyMates(assembly);
 assert.equal(result.ok,true);assert.equal(result.degreesOfFreedom,0);assert.equal(result.unsatisfied.length,0);
 assert.ok(Math.abs(assembly.components[1].transform.x-6.5)<1e-6);assert.ok(Math.abs(assembly.components[1].transform.y-11.5)<1e-6);
 assert.ok(Math.abs(assembly.components[1].transform.rz)<1e-5);
});
