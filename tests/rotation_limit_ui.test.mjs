import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {topologyReference,mateRequirementFor,mateFramesSupport,mateFrameSupports} from '../js/cad_mates.js';
import {worldFrame} from '../js/cad_mate_model.js';
import {rotationLimitMateSpec,rotationLimitMeasure} from '../js/cad_rotation_limit_mate.js';
import {addRotationLimitMate,setRotationLimitMateSettings,setRotationLimitMateDrive,setRotationLimitMateReferences} from '../js/cad_rotation_limit_controls.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const axis=(id,name,direction={x:1,y:0,z:0})=>topologyReference(id,'axis',name,{surface:'axis',origin:{x:0,y:0,z:0},axis:direction});
function fixture(){
 const assembly={components:[{id:'reader',grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},{id:'clapper',transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}}],topologyMates:[{id:'hinge',type:'concentric',a:axis('reader','hinge'),b:axis('clapper','hinge')}]};
 let undo=0,accepted=0,form;
 const context={E:{assembly,docType:'assembly'},t:key=>key,flash(){},fin:Number.isFinite,rotationLimitMateSpec,addRotationLimitMate,setRotationLimitMateSettings,setRotationLimitMateDrive,setRotationLimitMateReferences,
  assemblyPickedRefs:()=>({a:axis('reader','reader-axis'),b:axis('clapper','moving-axis')}),mateReferenceFromPick:ref=>ref,mateTypeFits:()=>({ok:true}),mateHolderById:id=>assembly.components.find(c=>c.id===id),uid:()=> 'stop',pushUndo:()=>undo++,acceptRackPinionSolve:()=>accepted++,openQuickForm:spec=>{form=spec;}};
 const add=new Function(...Object.keys(context),sourceFunctionText(source,'addTopologyMate')+';return addTopologyMate;')(...Object.values(context));
 context.addTopologyMate=add;
 const open=new Function(...Object.keys(context),sourceFunctionText(source,'openMateRotationLimitForm')+';return openMateRotationLimitForm;')(...Object.values(context));
 return {context,assembly,add,open,get form(){return form;},get undo(){return undo;},get accepted(){return accepted;}};
}
test('directed hinge form captures ordered home zero and rejects invalid range or backward drive without history',()=>{
 const f=fixture();f.open();assert.equal(f.form.fields.find(field=>field.key==='angleMin').value,-20);
 const before=JSON.stringify(f.assembly);
 assert.equal(f.form.onApply({angleMin:-20,angleMax:0,reverse:false,driveAngle:'1'}),false);
 assert.equal(f.form.onApply({angleMin:-400,angleMax:0,reverse:false,driveAngle:''}),false);
 assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,0);
 assert.equal(f.form.onApply({angleMin:-20,angleMax:0,reverse:false,driveAngle:''}),true);
 const mate=f.assembly.topologyMates.at(-1);assert.equal(mate.a.componentId,'reader');assert.equal(mate.b.componentId,'clapper');assert.ok(mate.rotationMarkerA);assert.equal(mate.driveAngle,undefined);assert.equal(f.undo,1);
});
test('actual directed hinge inspector drives permitted swing, restores invalid input and removes drive atomically',()=>{
 const f=fixture();f.add('rotationlimit',{angleMin:-20,angleMax:0,reverse:false});const mate=f.assembly.topologyMates.at(-1),fields=new Map(),buttons=[];
 const start=source.indexOf("      if(mate.type==='rotationlimit'){",source.indexOf('var extraField = function')),end=source.indexOf('      if (mate.type === "angle") {',start);
 const context={...f.context,mate,mateUiRow:{appendChild(){}},el:()=>({}),extraField:(label,value,step,commit)=>fields.set(label,commit),btn:(label,action)=>{buttons.push(action);return{};}};
 new Function(...Object.keys(context),source.slice(start,end))(...Object.values(context));
 const input={value:''};fields.get('rotationLimitDrive (°)')(-20,input);assert.ok(Math.abs(f.assembly.components[1].transform.rx+20)<1e-6);
 const before=JSON.stringify(f.assembly),undo=f.undo;
 fields.get('rotationLimitDrive (°)')(1,input);assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,undo);assert.equal(input.value,'-20');
 fields.get('mateAngleMinimum (°)')(-10,input);assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,undo);
 fields.get('rotationLimitDrive (°)')(null,input);assert.equal(mate.driveAngle,undefined);assert.equal(f.undo,undo+1);
});
test('actual directed hinge reference repair rejects skew axes without pose or undo changes',()=>{
 const f=fixture();f.add('rotationlimit',{angleMin:-20,angleMax:0,reverse:false,driveAngle:-10});const mate=f.assembly.topologyMates.at(-1);
 const marker='btn("Replace references with selection",function(){',start=source.indexOf(marker)+marker.length,end=source.indexOf('},"md-mate-align"));',start);
 const context={...f.context,mate,picked:{a:axis('reader','new'),b:axis('clapper','bad',{x:0,y:1,z:0})}};
 const callback=new Function(...Object.keys(context),source.slice(start,end));const before=JSON.stringify(f.assembly),undo=f.undo;
 callback(...Object.values(context));assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,undo);
 context.picked={a:axis('clapper','new'),b:axis('reader','new')};callback(...Object.values(context));assert.equal(f.undo,undo+1);assert.equal(mate.a.componentId,'reader');assert.equal(mate.driveAngle,-10);assert.ok(Math.abs(f.assembly.components[1].transform.rx+10)<1e-6);
});
function withRealFit(context){
 const fitContext={...context,mateRequirementFor,mateFramesSupport,mateFrameSupports,worldFrame,mateRequirementLabel:()=> 'axisReferencesRequired'};
 fitContext.mateFramesFit=new Function(...Object.keys(fitContext),sourceFunctionText(source,'mateFramesFit')+';return mateFramesFit;')(...Object.values(fitContext));
 fitContext.mateTypeFits=new Function(...Object.keys(fitContext),sourceFunctionText(source,'mateTypeFits')+';return mateTypeFits;')(...Object.values(fitContext));
 return fitContext;
}
test('actual mate palette accepts differently oriented local hinge axes when their assembled axes agree and native directed drive follows',()=>{
 for(const rotation of [90,-90]){
  const f=fixture(),reader=f.assembly.components[0],clapper=f.assembly.components[1];clapper.transform.ry=rotation;
  const picks={a:axis('reader','reader-x'),b:axis('clapper','moving-z',{x:0,y:0,z:1})};f.assembly.topologyMates[0].b=picks.b;
  const context=withRealFit({...f.context,assemblyPickedRefs:()=>picks});
  assert.equal(context.mateTypeFits('rotationlimit').ok,true);
  const add=new Function(...Object.keys(context),sourceFunctionText(source,'addTopologyMate')+';return addTopologyMate;')(...Object.values(context));
  assert.equal(add('rotationlimit',{angleMin:-20,angleMax:0,reverse:false,driveAngle:-20}),true);
  const mate=f.assembly.topologyMates.at(-1),state=rotationLimitMeasure(mate,worldFrame(picks.a.frame,reader,'component'),worldFrame(picks.b.frame,clapper,'component'),reader,clapper);
  assert.ok(Math.abs(state.angleDegrees+20)<1e-6);assert.equal(f.undo,1);assert.equal(f.accepted,1);
 }
});
test('actual mate palette rejects local-parallel but world-skew hinges with a useful current-pose explanation and no mutation',()=>{
 const f=fixture();f.assembly.components[1].transform.ry=90;
 const context=withRealFit(f.context),before=JSON.stringify(f.assembly),fit=context.mateTypeFits('rotationlimit');
 assert.equal(fit.ok,false);assert.equal(fit.reason,'rotationLimitNeedsParallelAxes');
 assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,0);
});
test('same current-world-axis gate respects rack perpendicular and belt parallel contracts on rotated components',()=>{
 const f=fixture();f.assembly.components[0].transform.ry=90;
 const picks={a:axis('reader','reader-z',{x:0,y:0,z:1}),b:axis('clapper','moving-z',{x:0,y:0,z:1})};
 const context=withRealFit({...f.context,assemblyPickedRefs:()=>picks});
 assert.equal(context.mateTypeFits('rackpinion').ok,true);assert.equal(context.mateTypeFits('belt').ok,false);
 f.assembly.components[1].transform.ry=90;assert.equal(context.mateTypeFits('rackpinion').ok,false);assert.equal(context.mateTypeFits('belt').ok,true);
});
