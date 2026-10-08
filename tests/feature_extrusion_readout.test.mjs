import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {formatDocumentLength} from '../js/core/document_length_units.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture(){
 const def=createPartDocument({name:'Offset readout'}),sketch={id:'front',plane:'front',offset:1.2,points:[{id:'a',x:0,y:0},{id:'b',x:1,y:0},{id:'c',x:1,y:1},{id:'d',x:0,y:1}],entities:[['a','b'],['b','c'],['c','d'],['d','a']].map(([a,b],i)=>({id:'e'+i,type:'line',a,b})),constraints:[]};def.sketches.push(sketch);
 const context={E:{def},ensureSketch:()=>sketch,planeAxis:plane=>plane==='front'?'z':plane==='top'?'y':'x',modelLengthUnit:()=> 'mm',formatDocumentLength,t:key=>key,tf:(key,values)=>key+JSON.stringify(values)};
 const text=new Function(...Object.keys(context),sourceFunctionText(source,'featureExtrusionExtentText')+';return featureExtrusionExtentText;')(...Object.values(context));
 return {def,sketch,context,text};
}
test('offset-plane readout exposes double offset and agrees with compiled blind and reversed/mid-plane extents',()=>{
 const f=fixture(),feature=createFeatureDefinition(f.def,'extrude',{references:{sketches:['front']},params:{sketchId:'front',profileEntityIds:['e0','e1','e2','e3'],depth:.62,offset:1.2,endCondition:'blind',direction:'forward'}});
 for(const patch of [{},{offset:0},{offset:1.2,direction:'reverse'},{symmetric:true}]){
  Object.assign(feature.params,patch);const before=JSON.stringify(f.def),compiled=compileKernelFeatureTree(f.def);assert.equal(compiled.ok,true);
  const params=compiled.features.find(item=>item.id===feature.id).params,text=f.text('extrudeCut',feature,feature.params);
  assert.ok(text.includes('"plane":"12 mm"'));assert.ok(text.includes('"start":"'+formatDocumentLength(params.from,'mm')+' mm"'));assert.ok(text.includes('"end":"'+formatDocumentLength(params.to,'mm')+' mm"'));
  assert.equal(JSON.stringify(f.def),before,'readout must not change geometry or authored values');
 }
});
test('readout uses referenced edit sketch and avoids claiming fixed endpoints for measured or invalid extents',()=>{
 const f=fixture(),state={references:{sketches:['front']},params:{offset:1.2,depth:.62,endCondition:'blind'}};
 assert.ok(f.text('extrude',state,state.params).includes('"start":"24 mm"'));
 assert.equal(f.text('extrude',state,{...state.params,endCondition:'through-all'}),'');
 assert.equal(f.text('extrude',state,{...state.params,depth:NaN}),'');
 assert.equal(f.text('extrude',{id:'legacy-sketchless',references:{}},state.params),'');
 assert.equal(f.text('extrude',{references:{sketches:['missing']}},state.params),'');
 f.sketch.frameSpace='local';f.sketch.frame={normal:{x:0,y:0,z:1},origin:{x:0,y:0,z:1.2}};
 assert.ok(f.text('extrude',state,state.params).startsWith('featureExtentSketchNormal'));assert.ok(f.text('extrude',state,state.params).includes('"start":"12 mm"'));
});
test('shared creation/edit parameter form updates its extent output while keeping live parameters unchanged',()=>{
 for(const id of [undefined,'existing-feature']){
  const f=fixture(),row={children:[],appendChild(node){this.children.push(node);}},state={id,references:{sketches:['front']},params:{offset:1.2,depth:.62,endCondition:'blind'}};
  let live,received;const context={...f.context,featureExtrusionExtentText:f.text,renderFeatureParameterFormCore:(host,type,s,callback)=>{live=callback;return [{field:{key:'offset'},input:{closest:()=>row}}];},featureReferenceOptions(){},FEATURE_PATTERN_SEED_TYPES:[],el:(tag,cls,text)=>({textContent:text,attrs:{},setAttribute(key,value){this.attrs[key]=value;}})};
  const render=new Function(...Object.keys(context),sourceFunctionText(source,'renderFeatureParameterForm')+';return renderFeatureParameterForm;')(...Object.values(context));
  render({},'extrudeCut',state,next=>received=next);assert.equal(row.children.length,2);const output=row.children[1];assert.equal(output.attrs['aria-live'],'polite');assert.ok(output.textContent.includes('"start":"24 mm"'));
  const next={params:{...state.params,offset:0},references:{}};live(next);assert.equal(received,next);assert.ok(output.textContent.includes('"start":"12 mm"'));assert.equal(state.params.offset,1.2);
  live({params:{...next.params,endCondition:'up-to-face'},references:{}});assert.equal(output.textContent,'');
 }
});
