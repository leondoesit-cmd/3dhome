import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3,PerspectiveCamera,OrthographicCamera} from '../vendor/three/three.module.js';
import * as named from '../js/core/named_camera_views.js';
import {orbitTargetFromFrame,frameTargetFromOrbit,switchEditorCamera} from '../js/core/editor_projection.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {libraryBundle,parseLibraryBundle} from '../js/core/model_library_store.js';
const src=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const stateSource=fs.readFileSync(new URL('../js/state.js',import.meta.url),'utf8');
const frame={origin:{x:3,y:9,z:5},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
function viewport(centerY=8){
 const p=new PerspectiveCamera(45,2,.1,5000),o=new OrthographicCamera(-1,1,1,-1,.1,5000),view={az:.7,el:.4,dist:32,target:new Vector3(2,3,4),render(){}};
 const esrc=fs.readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8');
 const a=esrc.indexOf('view.lookAtFrame ='),b=esrc.indexOf('// Keep every zoom entry',a);
 new Function('view','opts','orbitTargetFromFrame','frameTargetFromOrbit','switchEditorCamera','perspectiveCam','normalCam','THREE','bigZoom',`let cam=perspectiveCam,grid=null,orbitProjection='perspective';view.cam=cam;${esrc.slice(a,b)}`)(view,{center:()=>centerY,normalToOrthographic:true},orbitTargetFromFrame,frameTargetFromOrbit,switchEditorCamera,p,o,{},()=>1);
 return view;
}
test('actual viewport orbit and fixed-frame round trips retain world target, zoom and orbit preference',()=>{
 const v=viewport();v.cam.zoom=1.7;const orbit=named.captureNamedCameraPose(v,8);
 assert.deepEqual(orbit.worldTarget,{x:2,y:11,z:4});v.lookAtFrame(frame);const fixed=named.captureNamedCameraPose(v,8);assert.equal(v.cam.isOrthographicCamera,true);assert.equal(fixed.projection,'perspective');assert.deepEqual(fixed.worldTarget,orbit.worldTarget);
 v.orbitTo=()=>{};v.clearFixedFrame(false);v.az=2;v.dist=99;v.target.set(99,99,99);
 named.restoreNamedCameraPose(v,fixed,8);assert.deepEqual(named.captureNamedCameraPose(v,8),fixed);assert.equal(v.cam.isOrthographicCamera,true);
 named.restoreNamedCameraPose(v,orbit,8);assert.equal(v.fixedFrame,null);assert.equal(v.cam.isPerspectiveCamera,true);assert.deepEqual(named.captureNamedCameraPose(v,8),orbit);
 const changedCenter=viewport(20);named.restoreNamedCameraPose(changedCenter,orbit,20);assert.deepEqual(named.captureNamedCameraPose(changedCenter,20),orbit);
});
test('document metadata deep copies, cold persistence and deletion preserve canonical source',()=>{
 const pose=named.captureNamedCameraPose(viewport(),8),doc={id:'part',features:[{id:'boss'}],history:['boss'],sketches:[{id:'sketch'}],parts:[{id:1}]},source=JSON.stringify(doc);
 named.addNamedCameraView(doc,{id:'v1',name:' Study ',pose});pose.worldTarget.x=999;
 assert.equal(named.namedCameraViews(doc)[0].pose.worldTarget.x,2);const returned=named.namedCameraViews(doc);returned[0].pose.dist=999;assert.equal(named.namedCameraViews(doc)[0].pose.dist,32);
 const cold=JSON.parse(JSON.stringify(doc));assert.deepEqual(named.namedCameraViews(cold),named.namedCameraViews(doc));
 const bundle=parseLibraryBundle(JSON.stringify(libraryBundle([{key:'model',def:doc}],[{key:'assembly',assembly:{metadata:doc.metadata,components:[]}}])));
 assert.deepEqual(named.namedCameraViews(bundle.models[0].def),named.namedCameraViews(doc));assert.deepEqual(named.namedCameraViews(bundle.assemblies[0].assembly),named.namedCameraViews(doc));
 const assembly={id:'assembly',components:[],mates:[]};assert.deepEqual(named.namedCameraViews(assembly),[]);
 assert.throws(()=>named.addNamedCameraView(doc,{id:'v2',name:'study',pose:named.captureNamedCameraPose(viewport(),8)}));
 assert.equal(named.removeNamedCameraView(cold,'missing'),false);assert.equal(named.removeNamedCameraView(cold,'v1'),true);assert.deepEqual(named.namedCameraViews(cold),[]);
 const withoutMetadata={...doc};delete withoutMetadata.metadata;assert.equal(JSON.stringify(withoutMetadata),source);
});
test('invalid pose or stored metadata fails before viewport or document mutation',()=>{
 const v=viewport(),pose=named.captureNamedCameraPose(v,8),before=named.captureNamedCameraPose(v,8);
 for(const bad of [{...pose,dist:0},{...pose,zoom:-1},{...pose,el:Infinity},{...pose,worldTarget:{x:NaN,y:0,z:0}},{...pose,projection:'bad'},{...pose,frame:{...frame,xAxis:{x:2,y:0,z:0}}},{...pose,frame:{...frame,yAxis:frame.xAxis}}]){assert.throws(()=>named.restoreNamedCameraPose(v,bad,8));assert.deepEqual(named.captureNamedCameraPose(v,8),before);}
 assert.throws(()=>named.namedCameraViews({metadata:{namedCameraViews:{}}}));assert.throws(()=>named.namedCameraViews({metadata:{namedCameraViews:[{pose}]}}));
 const doc={};assert.throws(()=>named.addNamedCameraView(doc,{id:'',name:'x',pose}));assert.deepEqual(doc,{});
});
function formHarness(type='part'){
 const doc=type==='part'?{id:'p',history:['boss'],features:[{id:'boss'}]}:{id:'a',components:[{id:'leaf'}],mates:[]};
 const E={docType:type,def:type==='part'?doc:null,assembly:type==='assembly'?doc:null,pv:viewport()},state={node:7,undos:0,dirty:0,form:null},S={idc:6478};
 const actualUid=new Function('S',sourceFunctionText(stateSource,'uid')+';return uid;')(S);assert.equal(typeof actualUid(),'number');
 const bindings={E,currentHistoryNode:()=>state.node,captureNamedCameraPose:named.captureNamedCameraPose,namedCameraCenterY:()=>type==='part'?8:0,flash:m=>{state.message=m;},closeChromeOverlays(){},openQuickForm:f=>{state.form=f;},cloneData:v=>JSON.parse(JSON.stringify(v)),addNamedCameraView:named.addNamedCameraView,pushUndo:()=>{state.undos++;state.node++;if(type==='part')E.def=JSON.parse(JSON.stringify(E.def));else E.assembly=JSON.parse(JSON.stringify(E.assembly));},uid:actualUid,scheduleModelerDraft(){},syncDirty:()=>state.dirty++,syncUndoButtons(){}};
 new Function(...Object.keys(bindings),sourceFunctionText(src,'openNamedCameraViewForm')+';openNamedCameraViewForm();')(...Object.values(bindings));return {E,state,doc};
}
test('real ordinary naming form reacquires normalized owner after Undo and marks dirty without CAD changes',()=>{
 for(const type of ['part','assembly']){const h=formHarness(type),canonical=JSON.stringify(h.doc);assert.equal(h.state.form.fields[0].label,'View name');assert.equal(h.state.form.onApply({name:'Saved angle'}),true);assert.equal(h.state.undos,1);assert.equal(h.state.dirty,1);const current=type==='part'?h.E.def:h.E.assembly;assert.equal(named.namedCameraViews(current)[0].name,'Saved angle');assert.equal(named.namedCameraViews(current)[0].id,'6479');const without={...current};delete without.metadata;assert.equal(JSON.stringify(without),canonical);assert.equal(h.doc.metadata,undefined);}
});
test('real naming form rejects changed owner, history and invalid name before Undo',()=>{
 for(const mutate of [h=>h.E.def={id:'other'},h=>h.state.node++,h=>h.E.docType='assembly']){const h=formHarness();mutate(h);assert.equal(h.state.form.onApply({name:'Saved'}),false);assert.equal(h.state.undos,0);}
 const h=formHarness();assert.equal(h.state.form.onApply({name:''}),false);assert.equal(h.state.undos,0);
});
test('ordinary menu exposes capture, current-record recall and delete for both document types',()=>{
 const menu=sourceFunctionText(src,'showViewSelector');assert.match(menu,/Save current view…/);assert.match(menu,/restoreNamedCameraPose/);assert.match(menu,/removeNamedCameraView/);assert.match(menu,/namedCameraViews\(owner\)\.find/);assert.match(src,/md-vgroup md-projection[^\n]+id="mdNamedViews"/);
 const css=fs.readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');assert.match(css,/md-vgroup:not\(\.md-projection\)/);
});
test('real menu recalls current stored record, deletes normalized live document and preserves stale owner',()=>{
 const node=()=>({children:[],appendChild(child){this.children.push(child);},addEventListener(type,fn){this.click=fn;},set innerHTML(value){this.children=[];}}),host=node();
 const E={docType:'assembly',assembly:{id:'a',components:[{id:'part'}],mates:[]},overlays:{},pv:viewport(0)},pose=named.captureNamedCameraPose(E.pv,0);
 named.addNamedCameraView(E.assembly,{id:'saved',name:'Study',pose});let undos=0,snapshot,dirty=0,message;
 const bindings={E,root:{querySelector:()=>host},closeChromeOverlays(){},t:v=>v,VIEW_PRESETS:[],el:()=>node(),btn:(label,fn)=>({...node(),label,click:fn}),openNamedCameraViewForm(){},namedCameraViews:named.namedCameraViews,restoreNamedCameraPose:named.restoreNamedCameraPose,namedCameraCenterY:()=>0,flash:m=>message=m,pushUndo(){snapshot=JSON.parse(JSON.stringify(E.assembly));E.assembly=JSON.parse(JSON.stringify(E.assembly));undos++;},removeNamedCameraView:named.removeNamedCameraView,scheduleModelerDraft(){},syncDirty(){dirty++;},syncUndoButtons(){},syncViewButtons(){},drawSketch(){}};
 const show=new Function(...Object.keys(bindings),sourceFunctionText(src,'showViewSelector')+';return showViewSelector;')(...Object.values(bindings));show();
 const row=host.children.at(-1),recall=row.children[0],remove=row.children[1];E.assembly.metadata.namedCameraViews[0].pose.dist=51;recall.click();assert.equal(E.pv.dist,51);
 const old=E.assembly;remove.click();assert.equal(undos,1);assert.equal(dirty,1);assert.deepEqual(named.namedCameraViews(E.assembly),[]);assert.equal(named.namedCameraViews(old).length,1);assert.equal(named.namedCameraViews(snapshot).length,1);
 E.assembly=snapshot;show();const staleDelete=host.children.at(-1).children[1];E.assembly={id:'other',components:[]};staleDelete.click();assert.equal(undos,1);assert.equal(message,'The view owner changed');assert.equal(E.assembly.metadata,undefined);
});
