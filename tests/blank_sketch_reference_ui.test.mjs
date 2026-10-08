import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {sketchStartMode,shouldResumeSketchSession,shouldSkipReferencePicker} from '../js/modeler_workflow.js';
import {createPartDocument,recordSketchInHistory} from '../js/core/parametric_document.js';
import {ensureSketch,addSketch} from '../js/sketch_solver.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function load(name,context){return new Function(...Object.keys(context),sourceFunctionText(source,name)+';return '+name+';')(...Object.values(context));}
test('explicit New sketch on a blank part picks Right before recording exactly one sketch, with cancellation leaving geometry/history unchanged',()=>{
 const def=createPartDocument({name:'Blank plane choice'}),E={docType:'part',mode:'3d',def,authoring:{phase:'model'},topologySelection:[],sketchNormalTo:false};
 const picker={hidden:true},options={innerHTML:'',children:[],appendChild(button){this.children.push(button);}};
 const root={querySelector:selector=>selector==='#mdReferencePicker'?picker:selector==='#mdReferenceOptions'?options:null};
 let undo=0;
 const context={E,root,sketchStartMode,shouldResumeSketchSession,shouldSkipReferencePicker,selectedSketchableFace:()=>null,activeParts:()=>[],syncFacePrompt(){},syncAuthoringWorkflow(){},t:key=>key,
  el:()=>({addEventListener(type,callback){this.click=callback;}}),referenceLabel:ref=>ref.name||ref.id,
  pushUndo:()=>undo++,ensureSketch,addSketch,recordSketchInHistory,referencePlaneView:ref=>ref.id==='plane:right'?'side':ref.id==='plane:front'?'front':'top',syncModelPlane(){},setCommandTab(){},setTab(){},setTool(){},refreshAll(){},drawSketch(){},requestAnimationFrame(){}};
 context.chooseSketchReference=load('chooseSketchReference',context);
 context.showReferencePicker=load('showReferencePicker',context);
 const begin=load('beginSketchWorkflow',context),cancel=load('cancelReferenceSelection',context),before=JSON.stringify(def);
 begin(null,{forceNew:true});assert.equal(picker.hidden,false);assert.equal(E.authoring.phase,'reference');assert.equal(JSON.stringify(def),before);assert.equal(undo,0);assert.equal(options.children.length,3);
 cancel();assert.equal(picker.hidden,true);assert.equal(JSON.stringify(def),before);assert.equal(undo,0);
 options.children=[];begin(null,{forceNew:true});options.children[def.references.filter(ref=>ref.type==='plane').findIndex(ref=>ref.id==='plane:right')].click();
 assert.equal(undo,1);assert.equal(def.sketches.length,1);assert.equal(def.history.filter(item=>item.kind==='sketch').length,1);assert.equal(ensureSketch(def).referenceId,'plane:right');assert.equal(ensureSketch(def).plane,'side');assert.equal(picker.hidden,true);
});
test('blank drawing-tool shortcuts, active sessions and selected-face/solid workflows keep their existing routing',()=>{
 const E={docType:'part',def:{},authoring:{phase:'model'}},calls=[];let solids=false,face=null;
 const context={E,sketchStartMode,shouldResumeSketchSession,shouldSkipReferencePicker,selectedSketchableFace:()=>face,activeParts:()=>solids?[{}]:[],
  showReferencePicker:tool=>calls.push(['picker',tool]),startSketchOnDefaultPlane:tool=>calls.push(['default',tool]),beginFacePick:tool=>calls.push(['face-pick',tool]),chooseSketchReference:(ref,tool)=>calls.push(['selected-face',tool]),resumeSketchSession:tool=>calls.push(['resume',tool])};
 const begin=load('beginSketchWorkflow',context);
 begin('scirc');assert.deepEqual(calls.pop(),['default','scirc']);
 begin(null,{forceNew:true});assert.deepEqual(calls.pop(),['picker',null]);
 E.authoring.phase='sketch';begin('srect');assert.deepEqual(calls.pop(),['resume','srect']);E.authoring.phase='model';
 solids=true;begin(null,{forceNew:true});assert.deepEqual(calls.pop(),['face-pick',null]);
 face={kind:'face',descriptor:{surface:'plane'}};begin('sslot',{forceNew:true});assert.deepEqual(calls.pop(),['selected-face','sslot']);
});
test('visible face prompt switches to datum-plane choices without recording a sketch or hiding the editor',()=>{
 const def=createPartDocument({name:'Existing-solid reference flow'}),E={docType:'part',mode:'3d',def,authoring:{phase:'model'}},before=JSON.stringify(def);
 const prompt={hidden:true},canvas={style:{}},picker={hidden:true},options={innerHTML:'',children:[],appendChild(button){this.children.push(button);}};
 const root={querySelector:selector=>({'#mdFacePrompt':prompt,'#mdPrev':canvas,'#mdReferencePicker':picker,'#mdReferenceOptions':options})[selector]};
 const context={E,root,flash(){},refreshAll(){},syncAuthoringWorkflow(){},t:key=>key,referenceLabel:ref=>ref.name||ref.id,el:()=>({addEventListener(){}})};
 context.syncFacePrompt=load('syncFacePrompt',context);context.showReferencePicker=load('showReferencePicker',context);
 const begin=load('beginFacePick',context),planes=load('cancelFacePick',context);
 begin('sslot');assert.equal(prompt.hidden,false);assert.equal(canvas.style.cursor,'crosshair');assert.equal(E.authoring.phase,'reference');assert.equal(JSON.stringify(def),before);
 planes(true);assert.equal(prompt.hidden,true);assert.equal(canvas.style.cursor,'');assert.equal(picker.hidden,false);assert.equal(options.children.length,3);assert.equal(E.authoring.preferredTool,'sslot');assert.equal(JSON.stringify(def),before);
});
