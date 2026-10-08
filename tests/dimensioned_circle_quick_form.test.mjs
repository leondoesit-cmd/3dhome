import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {featureField,featureControlValue,validateFeatureInputs} from '../js/modeler_feature_form.js';
import {addDimensionedCircle} from '../js/sketch_dimensioned_circle.js';
import {solveSketch} from '../js/sketch_solver.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function node(tag,cls='',text=''){
 return {tagName:tag.toUpperCase(),className:cls,textContent:text,dataset:{},children:[],listeners:{},attrs:{},classList:{add(){},remove(){}},value:'',validity:'',
  appendChild(child){this.children.push(child);child.parent=this;},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},
  addEventListener(type,callback){(this.listeners[type] ||= []).push(callback);},dispatch(type){for(const callback of this.listeners[type] || [])callback();},
  closest(){return null;},focus(){},select(){},setCustomValidity(message){this.validity=message;},checkValidity(){return !this.validity;},reportValidity(){},
  querySelectorAll(selector){const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);return selector==='input[data-parameter-type="number"]'?all.filter(child=>child.tagName==='INPUT'&&child.dataset.parameterType==='number'):all;},querySelector(){return null;}};
}
function fixture(){
 const host=node('div'),sketch={points:[],entities:[],constraints:[]},E={authoring:{phase:'sketch'},def:{},ssel:[]},frames=[],buttons=[];let serial=0;
 const context={E,root:{querySelector:()=>host},motionPlaybackCancel:null,modelLengthUnit:()=> 'mm',featureField:(host,field,value)=>featureField(host,field,value,{el:node,units:{length:'mm'}}),featureControlValue,validateFeatureInputs,el:node,
  t:key=>key,namedButton:button=>button,btn:(label,callback,cls)=>{const button=node('button',cls,label);button.click=callback;buttons.push(button);return button;},requestAnimationFrame:callback=>frames.push(callback),syncCommandManager(){},document:{body:{classList:{contains:()=>false}}},closeFeaturePanel(){},refreshAll(){},fin:Number.isFinite,flash(){},setTool(){},
  appendToSketch:(name,apply)=>apply(sketch),addDimensionedCircle,uid:()=>++serial,markDrawnSelection:made=>E.ssel=made};
 const load=name=>new Function(...Object.keys(context),sourceFunctionText(source,name)+';return '+name+';')(...Object.values(context));
 const quick=load('openQuickForm');let inputs;
 context.openQuickForm=spec=>{inputs=quick(spec);};load('openDimensionedCircle')();
 return {sketch,E,frames,inputs,apply:()=>buttons.find(button=>button.className==='md-quick-apply').click()};
}
for(const [diameter,v] of [['12.2','-6'],['16','0']])test('actual quick circle preserves Diameter '+diameter+' mm while editing center and Fix center without Tab',async()=>{
 const f=fixture();assert.equal(f.inputs.diameter.value,'10');
 f.inputs.diameter.value=diameter;f.inputs.diameter.dispatch('input');
 for(const frame of f.frames)frame();
 f.inputs.x.value='0';f.inputs.x.dispatch('input');f.inputs.y.value=v;f.inputs.y.dispatch('input');
 f.inputs.fixCenter.checked=false;f.inputs.fixCenter.dispatch('input');f.inputs.fixCenter.checked=true;f.inputs.fixCenter.dispatch('change');
 assert.equal(f.inputs.diameter.value,diameter);await f.apply();
 assert.equal(f.sketch.entities.length,1);assert.equal(f.sketch.constraints.find(c=>c.type==='diameter').value,Number(diameter)/10);
 assert.ok(Math.abs(f.sketch.points[0].y-Number(v)/10)<1e-12);assert.equal(solveSketch(f.sketch).status,'fully-constrained');
});
test('unblurred explicit-unit diameter evaluates once and invalid entered text cannot fall back to the default circle',async()=>{
 const f=fixture();f.inputs.diameter.value='12.2mm';f.inputs.diameter.dispatch('input');f.inputs.y.value='-6';f.inputs.y.dispatch('change');await f.apply();
 assert.equal(f.sketch.constraints.find(c=>c.type==='diameter').value,1.22);
 const invalid=fixture();invalid.inputs.diameter.value='bad diameter';await invalid.apply();assert.equal(invalid.sketch.entities.length,0);assert.equal(invalid.inputs.diameter.value,'bad diameter');
});
