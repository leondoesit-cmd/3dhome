import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {featureField,featureControlValue} from '../js/modeler_feature_form.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

function node(tag,_class,text){return {tag,textContent:text,children:[],dataset:{},classList:{add(){},remove(){}},value:'',appendChild(child){this.children.push(child);},addEventListener(){},setAttribute(){},removeAttribute(){},setCustomValidity(){}};}
for(const [unit,shown,step] of [['mm','100',1],['cm','10',.1],['in','3.93700787402',.1/2.54]])test('quick length field caption, initial value, step and parser agree in '+unit,()=>{
  const host=node('host'),field={key:'distance',type:'number',unit:'length',inputUnit:unit,step:.1,min:1,max:20};
  const input=featureField(host,field,10,{el:node,units:{length:'ft'}});
  assert.equal(host.children[0].children[0].children[0].textContent,unit);
  assert.ok(Math.abs(Number(input.value)-Number(shown))<1e-10);
  assert.ok(Math.abs(Number(input.step)-step)<1e-12);
  assert.ok(Math.abs(featureControlValue({field,input})-10)<1e-10);
  input.value='60mm';assert.equal(featureControlValue({field,input}),6);
});
test('generic feature wrapper uses active document units rather than an inactive component part',()=>{
  const source=modelerSource();let passed;
  const wrap=new Function('featureFieldCore','modelLengthUnit','E','el','featureReferenceOptions',sourceFunctionText(source,'featureField')+';return featureField;')
    ((_h,_f,_v,options)=>{passed=options;},()=> 'mm',{def:{context:{units:{length:'cm',angle:'deg'}}}},node,()=>[]);
  wrap(null,{key:'distance',unit:'length'},10);assert.equal(passed.units.length,'mm');
});

test('actual sketch pattern caption and mm pitch input agree while pattern geometry remains centimetres',()=>{
  const source=modelerSource();
  const strings=fs.readFileSync(new URL('../js/modeler_strings.js',import.meta.url),'utf8');
  const rows=Object.fromEntries(['segLen','shellT','offsetAsk','patternPitch','sheetMetalThickness','sheetMetalFlangeLen'].map(key=>{
    const line=strings.split(/\r?\n/).find(line=>line.trimStart().startsWith(key+':'));
    const row=JSON.parse(line.slice(line.indexOf('['),line.lastIndexOf(']')+1));
    for(const caption of row)assert.ok(!/\bcm\b|ס\\"מ/.test(caption),'length captions rely on the actual unit badge');
    return [key,row[1]];
  }));
  let form;
  const open=new Function('selEntities','flash','t','openQuickForm',sourceFunctionText(source,'patternSelection')+';return patternSelection;')(()=>[{id:'circle'}],()=>{},key=>rows[key]||key,spec=>form=spec);
  open();const field={...form.fields.find(field=>field.key==='pitch'),inputUnit:'mm'};
  assert.equal(field.label,'Pitch (negative reverses it)');
  const host=node('host'),input=featureField(host,field,field.value,{el:node,units:{length:'cm'}});
  assert.equal(input.value,'300');assert.equal(host.children[0].children[0].children[0].textContent,'mm');
  input.value='45';assert.equal(featureControlValue({field,input}),4.5,'45 mm remains4.5 cm in authored pattern geometry');
});
