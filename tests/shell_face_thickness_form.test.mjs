import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createShellFaceThicknessEditor,readShellFaceThicknessRows} from '../js/modeler_shell_thickness_form.js';
import {featureField,readFeatureParameterForm} from '../js/modeler_feature_form.js';
import {featureDefaults,validateFeatureDefinition} from '../js/core/feature_catalog.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

function el(tag,cls,text=''){
 return {tagName:tag.toUpperCase(),children:[],attrs:{},dataset:{},listeners:{},value:'',textContent:text,
  classList:{add(){},remove(){}},get options(){return this.children;},set innerHTML(value){this.children=[];},
  appendChild(child){this.children.push(child);child.parent=this;return child;},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];},
  setCustomValidity(value){this.validity=value;},addEventListener(type,handler){(this.listeners[type] ||= []).push(handler);},
  dispatch(type){for(const handler of this.listeners[type] || [])handler();}};
}
const find=(node,label)=>node.attrs['aria-label']===label || node.tagName==='BUTTON' && node.textContent===label ? node : node.children.map(child=>find(child,label)).find(Boolean);
function fixture(params={thickness:1,direction:'inside',faceThicknesses:[]}){
 const host=el('div'),openingIds=['opening'];let changes=0,choices=['opening','top','bottom'].map(id=>({entry:{persistentId:id,descriptor:{surface:'plane'}},label:id}));
 const editor=createShellFaceThicknessEditor(host,{el,btn:(label,handler)=>{const button=el('button','',label);button.click=handler;return button;},t:key=>key,unit:'mm',
  field:(host,field,value)=>featureField(host,field,value,{el,units:{length:'mm'}}),getParams:()=>params,getChoices:()=>choices,getOpeningIds:()=>openingIds,onChange:()=>changes++,refresh:async()=>{choices=choices.filter(c=>c.entry.persistentId!=='top');}});
 return {host,params,editor,openingIds,get changes(){return changes;},add(id){find(host,'shellRetainedFace').value=id;find(host,'shellAddThickness').click();}};
}
test('10mm default plus two25mm retained-face rows uses actual unit parser and persists independently of openings',()=>{
 const f=fixture();f.add('top');const top=find(f.host,'shellFaceThickness 1');assert.equal(top.value,'10');top.value='25';top.dispatch('input');
 f.add('bottom');const bottom=find(f.host,'shellFaceThickness 2');bottom.value='25 mm';bottom.dispatch('input');
 assert.deepEqual(f.params.faceThicknesses,[{facePersistentId:'top',thickness:2.5},{facePersistentId:'bottom',thickness:2.5}]);
 assert.deepEqual(f.openingIds,['opening']);assert.ok(f.changes>=4);
 const persisted=readFeatureParameterForm([],f.params).params;assert.deepEqual(persisted.faceThicknesses,f.editor.read());
 const cold=fixture(JSON.parse(JSON.stringify(persisted)));assert.equal(find(cold.host,'shellFaceThickness 1').value,'25');assert.deepEqual(cold.editor.read(),f.editor.read());
});
test('invalid input cannot replace saved rows, and refresh preserves raw input while rejecting lost exact face ID',async()=>{
 const f=fixture();f.add('top');const input=find(f.host,'shellFaceThickness 1');input.value='25';input.dispatch('input');
 input.value='5';input.dispatch('input');assert.equal(f.params.faceThicknesses[0].thickness,2.5);assert.throws(()=>f.editor.read(),/at least/);
 input.value='25';input.dispatch('input');await find(f.host,'shellRefreshFaces').click();
 assert.equal(input.value,'25','refresh never silently rewrites the field');assert.equal(f.params.faceThicknesses[0].facePersistentId,'top');assert.throws(()=>f.editor.read(),/unavailable/);
 find(f.host,'shellRemoveThickness').click();assert.deepEqual(f.params.faceThicknesses,[]);assert.deepEqual(f.editor.read(),[]);
});
test('duplicate, removed, curved, thinner and outward rows reject; uniform legacy Shell remains valid',()=>{
 const params={thickness:1,direction:'inside'},choices=[{entry:{persistentId:'top',descriptor:{surface:'plane'}}},{entry:{persistentId:'curved',descriptor:{surface:'cylinder'}}}];
 const row={facePersistentId:'top',thickness:2.5};
 assert.throws(()=>readShellFaceThicknessRows(params,[row,row],choices),/unique/);
 assert.throws(()=>readShellFaceThicknessRows(params,[row],choices,['top']),/removed/);
 assert.throws(()=>readShellFaceThicknessRows(params,[{facePersistentId:'curved',thickness:2.5}],choices),/unavailable/);
 assert.throws(()=>readShellFaceThicknessRows(params,[{...row,thickness:.5}],choices),/at least/);
 assert.throws(()=>readShellFaceThicknessRows({...params,direction:'outside'},[row],choices),/inward/);
 assert.deepEqual(fixture(params).editor.read(),[]);assert.deepEqual(featureDefaults('shell').faceThicknesses,[]);
 const feature={id:'shell',type:'shell',params:{...featureDefaults('shell'),thickness:1,faceThicknesses:[{...row,thickness:.5}]},inputs:['body'],references:{features:['body'],topology:[{kind:'face',persistentId:'opening'}]}};
 assert.ok(validateFeatureDefinition(feature).some(issue=>issue.parameter==='faceThicknesses'));
});
test('creation/edit share rows and validate before Apply; retained IDs use native upstream face refresh without persisted callbacks',()=>{
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
 assert.match(sourceFunctionText(source,'openParametricFeature'),/state\.params\.faceThicknesses=shellEditor\.read\(\)/);
 assert.match(sourceFunctionText(source,'openFeatureEditor'),/feature\.params\.faceThicknesses=shellEditor\.read\(\)/);
 assert.match(sourceFunctionText(source,'addShellFaceThicknessControls'),/topologyInCadWorker\(stage\.document,stage\.head/);
 assert.match(sourceFunctionText(source,'addShellFaceThicknessControls'),/if\(!editedFeature\)state\.syncShellThicknesses=editor\.sync/);
});
