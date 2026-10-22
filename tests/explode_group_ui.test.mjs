import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {createExplodedView,addExplodeStep,applyExplodedView,explodeTargets} from '../js/cad_exploded_view.js';
import {featureControlValue} from '../js/modeler_feature_form.js';
const source=modelerSource();

test('Explode step seeds all selected components and authors a grouped step without changing mate poses',()=>{
 const components=[1,2,3].map(id=>({id,name:'Component '+id,transform:{x:id,y:0,z:0}}));
 const E={docType:'assembly',assembly:{components,mates:[{id:'keep'}]},componentSel:[components[1],components[2]]};
 const before=JSON.stringify(E.assembly.components.map(c=>c.transform));let spec,undos=0;
 const bindings={E,explodeTargets,openQuickForm:x=>{spec=x;},t:x=>x,flash:()=>{},pushUndo:()=>undos++,createExplodedView,addExplodeStep,applyExplodedView,invalidateInterference:()=>{},refreshAll:()=>{},fitPreview:()=>{}};
 new Function(...Object.keys(bindings),sourceFunctionText(source,'openExplodeStepForm')+';openExplodeStepForm();')(...Object.values(bindings));
 assert.equal(spec.fields[0].type,'feature-seeds');
 assert.deepEqual(spec.fields[0].value,['2','3']);
 assert.equal(spec.fields[0].choices.length,3);
 assert.equal(spec.onApply({components:[],axis:'z',distance:2}),false);
 assert.equal(undos,0);
 assert.equal(spec.onApply({components:['2','3'],axis:'z',distance:2,reverse:true}),true);
 assert.deepEqual(E.assembly.explodedViews[0].steps[0].components,['2','3']);
 assert.deepEqual(components[1].explodedOffset,{x:0,y:0,z:-2});
 assert.deepEqual(components[2].explodedOffset,{x:0,y:0,z:-2});
 assert.equal(components[0].explodedOffset,null);
 assert.equal(JSON.stringify(E.assembly.components.map(c=>c.transform)),before);
 assert.deepEqual(E.assembly.mates,[{id:'keep'}]);
});

test('quick form Apply reads component checkbox selections as an array rather than a text value',async()=>{
 const element=()=>({appendChild(){},addEventListener(){},focus(){},classList:{contains:()=>false}});
 const host=element(),E={def:{},authoring:{}};let apply,received;
 const bindings={E,motionPlaybackCancel:null,root:{querySelector:()=>host},el:element,t:x=>x,featureField:()=>({getSeedIds:()=>['a','b']}),featureControlValue,modelLengthUnit:()=> 'mm',namedButton:x=>x,btn:(label,callback,style)=>{if(style==='md-quick-apply')apply=callback;return element();},validateFeatureInputs:()=>true,syncCommandManager:()=>{},document:{body:element()},requestAnimationFrame:fn=>fn(),closeFeaturePanel:()=>{},refreshAll:()=>{}};
 const spec={action:'explodestep',title:'Explode',fields:[{key:'components',type:'feature-seeds',value:['a']}],onApply:values=>{received=values;}};
 const fn=new Function(...Object.keys(bindings),sourceFunctionText(source,'openQuickForm')+';return openQuickForm;')(...Object.values(bindings));
 fn(spec);await apply();assert.deepEqual(received,{components:['a','b']});
});
