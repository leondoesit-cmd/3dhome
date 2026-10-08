import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {validLimitMateBounds} from '../js/cad_mate_model.js';
import {defaultTopologyMateAlignment} from '../js/cad_mate_reference_choices.js';
import {solveTopologyMates,topologyReference} from '../js/cad_mates.js';
import {featureControlValue} from '../js/modeler_feature_form.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture(){
  const components=[{id:'A',grounded:true,transform:{x:0,y:0,z:0}},{id:'B',transform:{x:0,y:9,z:0}}];
  const frame={surface:'plane',origin:{x:0,y:0,z:0},normal:{x:0,y:1,z:0}};
  const picked={a:topologyReference('A','face','topA',frame),b:topologyReference('B','face','topB',frame)};
  const E={assembly:{components,topologyMates:[]},topologySelection:[]};
  let undo=0,solves=0,form,inputs,serial=0;const messages=[],firstSolve=[];
  const add=new Function('E','flash','t','validLimitMateBounds','mateTypeFits','assemblyPickedRefs','mateReferenceFromPick','mateHolderById','mateAlignmentForLockedOrientation','componentFreedom','pushUndo','uid','defaultTopologyMateAlignment','solveAssembly','refreshAll',sourceFunctionText(source,'addTopologyMate')+';return addTopologyMate;')
    (E,message=>messages.push(message),key=>key,validLimitMateBounds,()=>({ok:true}),()=>picked,pick=>pick,id=>components.find(component=>component.id===id),()=>null,()=>({}),()=>undo++,()=>++serial,defaultTopologyMateAlignment,()=>{solves++;firstSolve.push(structuredClone(E.assembly.topologyMates.at(-1)));solveTopologyMates(E.assembly);},()=>{});
  const open=new Function('E','setDocumentType','setTab','flash','t','MATE_PALETTE','mateTypeFits','assemblyPickedRefs','componentLabel','openQuickForm','addTopologyMate','root',sourceFunctionText(source,'openMatePropertyManager')+';return openMatePropertyManager;')
    (E,()=>{},()=>{},message=>messages.push(message),key=>key,[['limit','','Limit'],['distance','','Distance']],()=>({ok:true}),()=>picked,id=>id,spec=>{
      form=spec;inputs=Object.fromEntries(spec.fields.map(field=>[field.key,{value:field.value,events:{},hidden:false,
        closest(){return{classList:{toggle:(_class,hidden)=>{this.hidden=hidden;}}};},addEventListener(event,fn){this.events[event]=fn;}}]));
      return inputs;
    },add,{querySelector:()=>null});
  open();
  return {E,form,inputs,add,messages,firstSolve,get undo(){return undo;},get solves(){return solves;}};
}

test('Limit PropertyManager commits both mm bounds before its first native solve',()=>{
  const f=fixture();
  assert.equal(f.inputs.limitMin.hidden,false);assert.equal(f.inputs.limitMax.hidden,false);
  f.inputs.type.value='distance';f.inputs.type.events.change();assert.equal(f.inputs.limitMin.hidden,true);
  f.inputs.type.value='limit';f.inputs.type.events.change();assert.equal(f.inputs.limitMax.hidden,false);
  const values={type:'limit'};
  for(const [key,value] of [['limitMin','69.570108523704'],['limitMax','90']]){
    const field={...f.form.fields.find(field=>field.key===key),inputUnit:'mm'};
    values[key]=featureControlValue({field,input:{value}});
  }
  assert.equal(f.form.onApply(values),true);assert.equal(f.undo,1);assert.equal(f.solves,1);
  assert.ok(Math.abs(f.firstSolve[0].min-6.9570108523704)<1e-12);assert.equal(f.firstSolve[0].max,9);
  assert.equal(f.E.assembly.components[1].transform.y,9,'90mm home never sees obsolete20mm cap');
  const reopened=JSON.parse(JSON.stringify(f.E.assembly));
  assert.equal(solveTopologyMates(reopened).ok,true);assert.equal(reopened.topologyMates[0].max,9);
});

test('invalid Limit creation is rejected before history, native solve or pose changes',()=>{
  for(const [min,max] of [[9,8],['',9],[6,NaN],[Infinity,9],[undefined,9]]){
    const f=fixture(),before=JSON.stringify(f.E.assembly);
    assert.equal(f.form.onApply({type:'limit',limitMin:min,limitMax:max}),false);
    assert.equal(JSON.stringify(f.E.assembly),before);assert.equal(f.undo,0);assert.equal(f.solves,0);
    assert.deepEqual(f.messages,['mateLimitInvalidRange']);
  }
});

test('Limit creation retains legacy defaults and accepts finite signed or equal bounds',()=>{
  const legacy=fixture();assert.equal(legacy.add('limit'),true);
  assert.equal(legacy.firstSolve[0].min,0);assert.equal(legacy.firstSolve[0].max,2);
  for(const bounds of [{min:-9,max:9},{min:9,max:9}]){
    const f=fixture();assert.equal(f.add('limit',bounds),true);
    assert.equal(f.firstSolve[0].min,bounds.min);assert.equal(f.firstSolve[0].max,bounds.max);
  }
});
