import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {topologyReference} from '../js/cad_mates.js';
import {rackPinionMateSpec} from '../js/cad_rack_pinion_mate.js';
import {addRackPinionMate,setRackPinionMateSettings,setRackPinionMateDrive,setRackPinionMateReferences} from '../js/cad_rack_pinion_controls.js';
import {createMotionStudy,addRackPinionMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {lengthFromDocument,lengthToDocument} from '../js/core/document_length_units.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const p=(x=0,y=0,z=0)=>({x,y,z});
const axis=(id,name,direction,origin=p())=>topologyReference(id,'axis',name,{surface:'axis',origin,axis:direction});
const plane=(id,name,normal)=>topologyReference(id,'face',name,{surface:'plane',origin:p(),normal});
function fixture(){
 const assembly={components:[{id:'base',grounded:true,transform:{...p(),rx:0,ry:0,rz:0}},{id:'pinion',transform:{...p(2.3,15),rx:0,ry:0,rz:0}},{id:'rack',transform:{...p(4.5,9),rx:0,ry:0,rz:0}}],topologyMates:[
  {id:'bearing',type:'concentric',a:axis('base','seat',p(0,0,1),p(2.3,15)),b:axis('pinion','shaft',p(0,0,1))},
  {id:'capture',type:'distance',value:0,aligned:true,a:plane('base','front',p(0,0,1)),b:plane('pinion','front',p(0,0,1))},
  {id:'guide-z',type:'distance',value:0,aligned:true,a:plane('base','front',p(0,0,1)),b:plane('rack','front',p(0,0,1))},
  {id:'guide-x',type:'distance',value:4.5,aligned:true,a:plane('base','right',p(1)),b:plane('rack','right',p(1))},
  {id:'stop',type:'limit',min:3,max:9,aligned:true,a:plane('base','top',p(0,1)),b:plane('rack','top',p(0,1))},
 ]};
 const picks={a:axis('pinion','pinion-axis',p(0,0,1)),b:axis('rack','travel-axis',p(0,1))};
 let undo=0,accepted=0,form;const flashes=[];
 const context={E:{assembly,componentSel:[],docType:'assembly'},t:key=>key,flash:message=>flashes.push(message),fin:Number.isFinite,
  rackPinionMateSpec,addRackPinionMate,assemblyPickedRefs:()=>picks,mateReferenceFromPick:ref=>ref,mateTypeFits:()=>({ok:true}),
  mateHolderById:id=>assembly.components.find(c=>c.id===id),uid:()=> 'rack-native',pushUndo:()=>undo++,acceptRackPinionSolve:()=>accepted++,
  openQuickForm:spec=>{form=spec;},setRackPinionMateSettings,setRackPinionMateDrive,modelLengthUnit:()=> 'mm',lengthFromDocument,lengthToDocument,
  modelLengthText:value=>String(value*10)};
 const add=new Function(...Object.keys(context),sourceFunctionText(source,'addTopologyMate')+';return addTopologyMate;')(...Object.values(context));
 context.addTopologyMate=add;
 const open=new Function(...Object.keys(context),sourceFunctionText(source,'openMateRackPinionForm')+';return openMateRackPinionForm;')(...Object.values(context));
 return {assembly,picks,context,add,open,get form(){return form;},get undo(){return undo;},get accepted(){return accepted;},flashes};
}

test('rack creation form preserves ordered native axes, free drive and atomic invalid input',()=>{
 const f=fixture();f.open();
 assert.equal(f.form.fields.find(field=>field.key==='pitchRadius').unit,'length');
 const before=JSON.stringify(f.assembly);
 assert.equal(f.form.onApply({pitchRadius:0,reverse:false,driveTurns:''}),false);
 assert.equal(f.form.onApply({pitchRadius:1,reverse:false,driveTurns:'Infinity'}),false);
 assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,0);
 assert.equal(f.form.onApply({pitchRadius:1,reverse:false,driveTurns:''}),true);
 const mate=f.assembly.topologyMates.at(-1);
 assert.equal(mate.a.componentId,'pinion');assert.equal(mate.b.componentId,'rack');
 assert.equal(mate.driveTurns,undefined);assert.equal(mate.pitchRadius,1);
 assert.equal(f.undo,1);assert.equal(f.accepted,1);
 const reversed=fixture();reversed.assembly.components.find(c=>c.id==='rack').grounded=true;
 assert.equal(reversed.add('rackpinion',{pitchRadius:1,reverse:false}),false,'grounded rack must not be swapped into pinion role');
 assert.equal(reversed.undo,0);
});

test('actual rack inspector handlers convert radius units, drive full travel, clear drive and reject stop overshoot without undo',()=>{
 const f=fixture();f.add('rackpinion',{pitchRadius:1,reverse:false});
 const mate=f.assembly.topologyMates.at(-1),fields=new Map(),buttons=[];
 const start=source.indexOf("      if(mate.type==='rackpinion'){",source.indexOf('var extraField = function'));
 const block=source.slice(start,source.indexOf('      if (mate.type === "angle") {',start));
 const context={...f.context,mate,mateUiRow:{appendChild(){}},el:()=>({}),extraField:(label,value,step,commit)=>fields.set(label,{value,commit}),btn:(label,action)=>{buttons.push({label,action});return{};}};
 new Function(...Object.keys(context),block)(...Object.values(context));
 const radius=fields.get('rackPinionRadius (mm)'),drive=fields.get('rackPinionDrive'),input={value:''};
 assert.equal(radius.value,10);
 drive.commit(-.954929658551372,input);
 assert.ok(Math.abs(f.assembly.components.find(c=>c.id==='rack').transform.y-3)<1e-7);
 const accepted=JSON.stringify(f.assembly),undo=f.undo;
 drive.commit(-1,input);assert.equal(JSON.stringify(f.assembly),accepted);assert.equal(f.undo,undo);
 assert.equal(input.value,String(mate.driveTurns));
 buttons[0].action();assert.equal(JSON.stringify(f.assembly),accepted,'reversing driven endpoint past its stop is atomic');
 radius.commit(5,input);assert.equal(mate.pitchRadius,.5);
 assert.ok(Math.abs(f.assembly.components.find(c=>c.id==='rack').transform.y-6)<1e-7);
 radius.commit(-1,input);assert.equal(mate.pitchRadius,.5);
 drive.commit(null,input);assert.equal(mate.driveTurns,undefined);
});

test('actual Motion Study form exposes rack mate motor and commits a named constrained endpoint',async()=>{
 const f=fixture();f.add('rackpinion',{pitchRadius:1,reverse:false});
 let form;
 const context={...f.context,createMotionStudy,addRackPinionMotor,evaluateMotionStudy,openQuickForm:spec=>{form=spec;},
  motionScrewMateLabel:()=> 'Pinion → Rack · radius 10 mm',syncFlexibleSpringsAtMotionState:async()=>{},invalidateInterference(){},refreshAll(){}};
 const open=new Function(...Object.keys(context),sourceFunctionText(source,'createDefaultMotionStudy')+';return createDefaultMotionStudy;')(...Object.values(context));
 open();assert.ok(form.fields.find(field=>field.key==='motorType').choices.some(choice=>choice.value==='rackpinion'));
 form.onLive({study:'new',motorType:'rackpinion'});
 assert.equal(form.fields.some(field=>field.key==='motorAxis'),false);
 assert.equal(form.fields.find(field=>field.key==='screwMate').choices[0].label,'Pinion → Rack · radius 10 mm');
 assert.equal(await form.onApply({study:'new',name:'Arbor press full stroke',motorType:'rackpinion',screwMate:'rack-native',rpm:-.954929658551372*6,time:10}),true);
 const study=f.assembly.motionStudies[0];
 assert.equal(study.name,'Arbor press full stroke');assert.equal(study.motors[0].type,'rackpinion');assert.equal(study.motors[0].mateId,'rack-native');
 assert.ok(Math.abs(f.assembly.components.find(c=>c.id==='rack').transform.y-3)<1e-7);
 const before=JSON.stringify(f.assembly),undo=f.undo;
 assert.equal(await form.onApply({study:'new',name:'Beyond stop',motorType:'rackpinion',screwMate:'rack-native',rpm:-6,time:10}),false);
 assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,undo);
});

test('actual Replace references handler rejects incompatible rack axes atomically and preserves driven roles after repair',()=>{
 const f=fixture();f.add('rackpinion',{pitchRadius:1,reverse:false,driveTurns:-.5});
 const mate=f.assembly.topologyMates.at(-1);
 const marker='btn("Replace references with selection",function(){';
 const start=source.indexOf(marker)+marker.length,end=source.indexOf('},"md-mate-align"));',start);
 assert.ok(start>=marker.length && end>start);
 const context={...f.context,mate,picked:{a:axis('pinion','new-pinion',p(0,0,1)),b:axis('rack','bad-travel',p(0,0,1))},
  setRackPinionMateReferences,rebindTopologyMate:()=>{throw new Error('Rack repair must use its transactional native helper');}};
 const callback=new Function(...Object.keys(context),source.slice(start,end));
 const before=JSON.stringify(f.assembly),undo=f.undo,accepted=f.accepted;
 callback(...Object.values(context));
 assert.equal(JSON.stringify(f.assembly),before);assert.equal(f.undo,undo);assert.equal(f.accepted,accepted);
 context.picked={a:axis('rack','new-travel',p(0,-1)),b:axis('pinion','new-pinion',p(0,0,1))};
 const rackY=f.assembly.components.find(c=>c.id==='rack').transform.y;
 callback(...Object.values(context));
 assert.equal(f.undo,undo+1);assert.equal(f.accepted,accepted+1);
 assert.equal(mate.a.componentId,'pinion');assert.equal(mate.b.componentId,'rack');assert.equal(mate.driveTurns,-.5);
 assert.ok(Math.abs(f.assembly.components.find(c=>c.id==='rack').transform.y-rackY)<1e-7,'repair preserves the current driven pose');
 assert.equal(setRackPinionMateDrive(f.assembly,mate.id,-.45).ok,true);
 assert.ok(Math.abs(f.assembly.components.find(c=>c.id==='rack').transform.y-(rackY-.1*Math.PI))<1e-7,'next drive follows the replacement negative travel axis');
});
