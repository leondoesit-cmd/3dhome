import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {instant3dDisplayValue,instant3dModelValue,instant3dValueLabel} from '../js/modeler_instant3d.js';
import {featureControlValue} from '../js/modeler_feature_form.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
for(const [unit,display] of [['mm',6],['cm',.6],['in',.6/2.54]])test('Instant3D depth display and model roundtrip in '+unit,()=>{
  assert.ok(Math.abs(instant3dDisplayValue(.6,'depth',unit)-display)<1e-12);
  assert.ok(Math.abs(instant3dModelValue(display,'depth',unit)-.6)<1e-12);
  assert.equal(instant3dDisplayValue(45,'angle',unit),45);assert.equal(instant3dModelValue(45,'angle',unit),45);
});
test('actual chip typing and handle drag publish document values to the numeric feature form exactly once',()=>{
  const input={type:'text',value:'',dispatchEvent(){this.parsed=featureControlValue({field:{type:'number',unit:'length',inputUnit:'mm'},input:this});}};
  const sync=new Function('instant3dFormControl','instant3dDisplayValue','modelLengthUnit','Event',sourceFunctionText(source,'syncFeatureFormValue')+';return syncFeatureFormValue;')(()=>input,instant3dDisplayValue,()=> 'mm',class Event{});
  sync('depth',.6);assert.equal(input.value,'6');assert.ok(Math.abs(input.parsed-.6)<1e-12);
  const E={_instant3dPose:{key:'depth'}},chip={listeners:{},validity:{valid:true},addEventListener(key,fn){this.listeners[key]=fn;}};
  const wrap={querySelector(){return null;},appendChild(){}};
  const create=new Function('E','el','syncFeatureFormValue','instant3dModelValue','modelLengthUnit',sourceFunctionText(source,'instant3dValueChip')+';return instant3dValueChip;')(E,()=>chip,sync,instant3dModelValue,()=> 'mm');
  create({rr:{domElement:{parentElement:wrap}}});chip.valueAsNumber=6;chip.listeners.input();assert.equal(input.value,'6');assert.ok(Math.abs(input.parsed-.6)<1e-12);
  chip.valueAsNumber=10.414123;chip.listeners.input();assert.ok(Math.abs(input.parsed-1.0414123)<1e-12);
});
test('actual chip renderer shows6mm for0.6cm, clean caption and matching bounds while preserving focused text',()=>{
  const chip={value:'0.6',style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];}};
  const pose={key:'depth',value:.6,direction:{x:0,y:1,z:0},origin:{x:0,y:0,z:0}},E={_instant3dPose:pose};
  const document={activeElement:null},control={min:'0.00001',max:'',dataset:{parameterLabel:'Depth'}};
  function vector(){return {x:0,y:0,z:0,set(){return this;},length(){return 1;},normalize(){return this;},addScaledVector(){return this;},project(){return this;}};}
  const sync=new Function('E','document','syncFilletEndpoints','instant3dValueChip','instant3dAuthoringState','instantScratch','modelLengthUnit','instant3dFormControl','instant3dDisplayValue','instant3dValueLabel','featureTypeLabel',sourceFunctionText(source,'syncInstant3dValue')+';return syncInstant3dValue;')(E,document,()=>{},()=>chip,()=>({type:'extrude'}),()=>({dir:vector(),anchor:vector()}),()=> 'mm',()=>control,instant3dDisplayValue,instant3dValueLabel,()=> 'Extrude / Boss');
  const view={cam:{updateMatrixWorld(){}},rr:{domElement:{offsetLeft:0,offsetTop:0,clientWidth:100,clientHeight:100}}};
  sync(view);assert.equal(chip.value,'6');assert.equal(chip.attributes['aria-label'],'Extrude / Boss · Depth (mm)');assert.equal(chip.min,control.min);
  document.activeElement=chip;chip.value='6.123456789';sync(view);assert.equal(chip.value,'6.123456789');
});
