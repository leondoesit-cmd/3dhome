import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMotionStudy,addRotaryMotor,addScrewMotor,addLinearMotor,addGearRelation,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {solveTopologyMates,topologyReference} from '../js/cad_mates.js';
import {setRotation,axisAngleMatrix} from '../js/cad_mate_model.js';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const start=source.indexOf('function createDefaultMotionStudy()');
const end=source.indexOf('\n/* The Evaluate command',start);
const formSource=source.slice(start,end);

test('named saved study reopens and seeks from its captured zero without duplicating studies',async()=>{
  let assembly={components:[{id:'shaft',name:'Shaft',grounded:false,transform:{rz:12}}],mates:[],topologyMates:[]};
  let form,undo=0;
  const context={E:{docType:'assembly',assembly,componentSel:[]},structuredClone,createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy,
    syncFlexibleSpringsAtMotionState:async()=>{},t:s=>s,flash:()=>{},openQuickForm:f=>{form=f;},pushUndo:()=>undo++,invalidateInterference:()=>{},refreshAll:()=>{}};
  const open=()=>vm.runInNewContext(formSource+'\ncreateDefaultMotionStudy();',context);
  open();
  const values={name:'  Double pulley quarter turn  ',motor:'shaft',rpm:60,motorAxis:'z',time:.25};
  assert.equal(await form.onApply({...values,name:'   '}),false);
  assert.equal(undo,0);assert.equal(assembly.motionStudies,undefined,'invalid naming does not mutate the assembly');
  assert.equal(await form.onApply(values),true);
  const id=assembly.motionStudies[0].id;
  assert.equal(assembly.motionStudies[0].name,'Double pulley quarter turn');
  assert.ok(Math.abs(assembly.components[0].transform.rz-102)<1e-8);
  context.E.assembly=assembly=JSON.parse(JSON.stringify(assembly));
  open();
  assert.equal(form.fields.find(f=>f.key==='name').value,'Double pulley quarter turn');
  assert.equal(form.fields.find(f=>f.key==='study').value,id);
  assert.equal(await form.onApply({...values,name:'Double pulley zero',time:0}),true);
  assert.equal(assembly.motionStudies.length,1);
  assert.equal(assembly.motionStudies[0].id,id);
  assert.equal(assembly.motionStudies[0].name,'Double pulley zero');
  assert.ok(Math.abs(assembly.components[0].transform.rz-12)<1e-8,'seeking zero preserves original pose');
  setRotation(assembly.components[0].transform,axisAngleMatrix({x:0,y:0,z:1},Math.PI/4));
  open();
  assert.ok(form.fields.some(f=>f.key==='resetZero'));
  assert.ok(form.fields.some(f=>f.key==='deleteStudy'));
  assert.equal(await form.onApply({...values,resetZero:true,time:0}),true);
  assert.ok(Math.abs(assembly.components[0].transform.rz-45)<1e-8,'reset captures the current pose instead of restoring the old zero');
  open();
  assert.equal(await form.onApply({...values,time:.25}),true);
  assert.ok(Math.abs(assembly.components[0].transform.rz-135)<1e-8,'subsequent seeking uses the new zero');
  open();
  const pose=JSON.stringify(assembly.components);
  assert.equal(await form.onApply({deleteStudy:true}),true);
  assert.equal(assembly.motionStudies.length,0);
  assert.equal(JSON.stringify(assembly.components),pose,'deleting a study preserves the current component placement');
});

test('linear motion form exposes signed travel and persists a stable zero pose',async()=>{
  const assembly={components:[{id:1,name:'Rod',transform:{y:4.5}}],mates:[],topologyMates:[]};
  let form,syncCalls=0;
  const context={E:{docType:'assembly',assembly,componentSel:[]},structuredClone,createMotionStudy,addRotaryMotor,addLinearMotor,addGearRelation,evaluateMotionStudy,
    syncFlexibleSpringsAtMotionState:async()=>{syncCalls++;},t:s=>s,flash:()=>{},openQuickForm:f=>{form=f;},pushUndo:()=>{},invalidateInterference:()=>{},refreshAll:()=>{}};
  vm.runInNewContext(formSource+'\ncreateDefaultMotionStudy();',context);
  form.onLive({study:'new',relation:'none',motorType:'linear'});
  assert.equal(form.hint,'linearMotionHint');
  assert.deepEqual(Array.from(form.fields,f=>f.key),['study','name','motorType','motor','stroke','duration','reciprocate','motorAxis','time']);
  assert.equal(form.fields.find(f=>f.key==='stroke').unit,'length');
  assert.equal(await form.onApply({motor:'1',stroke:-1.5,duration:1,reciprocate:true,motorAxis:'y',time:1,study:'new',motorType:'linear'}),true);
  assert.equal(syncCalls,1);assert.equal(assembly.components[0].transform.y,3);
  const study=assembly.motionStudies[0];
  assert.equal(study.motors[0].basePosition.y,4.5);
  assert.equal(evaluateMotionStudy(assembly,study.id,0).ok,true);
  assert.equal(assembly.components[0].transform.y,4.5);
});

test('plain rotary motion shows motor controls, and gear editing exposes only relevant relation controls',async()=>{
  const assembly={components:[{id:1,name:'Shaft',grounded:false,transform:{}},{id:2,name:'Follower',grounded:false,transform:{}}],mates:[],topologyMates:[]};
  let form;
  const context={E:{docType:'assembly',assembly,componentSel:[]},structuredClone,createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy,
    syncFlexibleSpringsAtMotionState:async()=>{},t:s=>s,flash:()=>{},openQuickForm:f=>{form=f;},pushUndo:()=>{},invalidateInterference:()=>{},refreshAll:()=>{}};
  vm.runInNewContext(formSource+'\ncreateDefaultMotionStudy();',context);
  assert.equal(form.hint,'rotaryMotionHint');
  assert.equal(form.fields.find(f=>f.key==='relation').choices[0].label,'motionMotorOnly');
  assert.deepEqual(Array.from(form.fields,f=>f.key),['study','name','motorType','relation','motor','rpm','motorAxis','pivotX','pivotY','pivotZ','time']);
  assert.equal(await form.onApply({motor:'1',rpm:5,motorAxis:'y',time:1,study:'new',relation:'none'}),true);
  assert.equal((assembly.motionStudies[0].gearRelations || []).length,0);
  assert.ok(Math.abs(assembly.components[0].transform.ry-30)<1e-8);
  form.onLive({study:'new',relation:'new'});
  assert.equal(form.hint,'gearMotionHint');
  for(const key of ['driver','follower','driverTeeth','followerTeeth','driverAxis','followerAxis','mesh'])assert.ok(form.fields.some(f=>f.key===key));
  assert.equal(form.fields.some(f=>f.key==='remove'),false,'a new relation cannot be removed');
  const study=assembly.motionStudies[0];
  const relation=addGearRelation(study,1,2,{driverTeeth:20,followerTeeth:40});
  form.onLive({study:study.id,relation:'none'});
  assert.equal(form.hint,'gearMotionHint','retained existing relations still affect the motor');
  assert.equal(form.fields.find(f=>f.key==='relation').choices[0].label,'motionKeepRelations');
  assert.equal(form.fields.some(f=>f.key==='driver'),false,'retained relations are edited only when selected');
  form.onLive({study:study.id,relation:relation.id});
  assert.ok(form.fields.some(f=>f.key==='remove'));
});

for(const ids of [[1745,1746],['driver','follower']]){
  test(`motion form resolves browser select IDs (${typeof ids[0]}) before evaluating`,async()=>{
    const assembly={components:ids.map(id=>({id,name:String(id),grounded:false,transform:{}})),mates:[],topologyMates:[]};
    let form,undo=0;
    const context={E:{docType:'assembly',assembly,componentSel:[]},structuredClone,createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy,
      syncFlexibleSpringsAtMotionState:async()=>{},t:s=>s,flash:()=>{},openQuickForm:f=>{form=f;},pushUndo:()=>undo++,invalidateInterference:()=>{},refreshAll:()=>{}};
    vm.runInNewContext(formSource+'\ncreateDefaultMotionStudy();',context);
    form.onLive({study:'new',relation:'new'});
    assert.equal(await form.onApply({motor:String(ids[0]),driver:String(ids[0]),follower:String(ids[1]),rpm:5,motorAxis:'y',driverAxis:'y',followerAxis:'y',driverTeeth:20,followerTeeth:40,mesh:'external',remove:false,time:1}),true);
    assert.equal(undo,1);
    assert.equal(assembly.motionStudies[0].motors[0].componentId,ids[0]);
    assert.equal(assembly.motionStudies[0].gearRelations[0].followerId,ids[1]);
    assert.ok(Math.abs(assembly.components[0].transform.ry-30)<1e-8);
    assert.ok(Math.abs(assembly.components[1].transform.ry+15)<1e-8);
  });
}

test('Motion Study form preserves the native numeric Screw mate ID through Apply and reopen',async()=>{
  const axis={x:0,y:0,z:1},origin={x:0,y:0,z:0};
  const reference=(id,name)=>topologyReference(id,'face',name,{surface:'cylinder',origin,axis,radius:0.25});
  const assembly={components:[
    {id:2781,name:'Threaded trunnion',grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
    {id:2787,name:'Lead screw',grounded:false,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}},
  ],mates:[],topologyMates:[{id:2799,type:'screw',pitch:0.4,coupledMotion:true,
    a:reference(2781,'bore'),b:reference(2787,'shaft')}]};
  let form,undo=0,mobilityDuringRefresh;
  const context={E:{docType:'assembly',assembly,componentSel:[],mateDegreesOfFreedom:1},assemblySolveFresh:false,structuredClone,
    createMotionStudy,addRotaryMotor,addScrewMotor,addLinearMotor,addGearRelation,evaluateMotionStudy,
    syncFlexibleSpringsAtMotionState:async()=>{},t:s=>s,flash:()=>{},
    openQuickForm:f=>{form=f;},pushUndo:()=>undo++,invalidateInterference:()=>{},
    refreshAll:()=>{mobilityDuringRefresh=solveTopologyMates(assembly).degreesOfFreedom;}};
  const run=()=>vm.runInNewContext(formSource+'\ncreateDefaultMotionStudy();',context);
  run();form.onLive({study:'new',motorType:'screw'});
  assert.equal(form.fields.find(f=>f.key==='screwMate').choices[0].value,2799);
  assert.equal(await form.onApply({study:'new',motorType:'screw',screwMate:'2799',rpm:60,time:0.25}),true);
  assert.equal(undo,1);
  assert.equal(assembly.motionStudies[0].motors[0].mateId,2799);
  assert.ok(Math.abs(assembly.components[1].transform.z-0.1)<1e-6);
  assert.equal(mobilityDuringRefresh,1,'the undriven assembly retains one physical joint freedom');
  assert.equal(assembly.topologyMates[0].driveTurns,undefined,'Motion Study sets a pose without fixing the Screw mate');
  run();
  assert.equal(await form.onApply({study:assembly.motionStudies[0].id,motorType:'screw',screwMate:'2799',rpm:60,time:0.5}),true);
  assert.equal(assembly.motionStudies[0].motors[0].mateId,2799);
  assert.ok(Math.abs(assembly.components[1].transform.z-0.2)<1e-6,'the saved screw zero survives a second UI Apply');
});
