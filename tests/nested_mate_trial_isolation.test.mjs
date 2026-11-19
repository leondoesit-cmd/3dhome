import test from 'node:test';
import assert from 'node:assert/strict';
import {topologyReference} from '../js/cad_mate_model.js';
import {setGearMatePhase} from '../js/cad_gear_motion.js';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {addRackPinionMate,setRackPinionMateReferences} from '../js/cad_rack_pinion_controls.js';
import {addRotationLimitMate,setRotationLimitMateReferences} from '../js/cad_rotation_limit_controls.js';
import {createMotionStudy,addRackPinionMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';
import {putAssemblyLibraryRecord,loadAssemblyLibrary} from '../js/core/model_library_store.js';

const body=(id,x=0,grounded=false)=>({id,grounded,transform:{x}});
const group=(id,components)=>({...body(id),kind:'assembly',asm:{components}});
const origin={x:0,y:0,z:0};
const zAxis={surface:'axis',origin,axis:{x:0,y:0,z:1}};
const yAxis={surface:'axis',origin,axis:{x:0,y:1,z:0}};
function source(id){
  const stem=body('stem',2);
  stem.topology=[{persistentId:'shaft',kind:'axis',descriptor:zAxis}];
  const source=group(id,[stem,body('seat',5,true)]);
  source.asm.mates=[{id:'mount',type:'alignX',a:'seat',b:'stem'}];
  return source;
}
function fixture(type){
  const left=source('left'),right=source('right'),carrier=group('carrier',[left,right]);
  carrier.grounded=true;
  const rack=body('rack'),sleeve=body('sleeve');
  sleeve.inContext={parentId:'rack',reference:{componentId:'rack',persistentId:'plane:right'}};
  const assembly={components:[carrier,rack,sleeve],topologyMates:[]};
  const picks=(which,valid)=>[
    topologyReference('carrier',valid?'axis':'face',which+'/stem/'+(valid?'shaft':'plane:right'),valid?zAxis:{}),
    topologyReference('rack','axis','guide',type==='rackpinion'?yAxis:zAxis),
  ];
  const add=type==='rackpinion'?addRackPinionMate:addRotationLimitMate;
  const rebind=type==='rackpinion'?setRackPinionMateReferences:setRotationLimitMateReferences;
  function insert(which,valid,undo,settings={}){
    const [a,b]=picks(which,valid);
    const spec=type==='rackpinion'?{pitchRadius:1}:{angleMin:-20,angleMax:20};
    return add(assembly,{id:'joint',type,a,b,...spec,...settings},undo);
  }
  return {assembly,left,right,insert,rebind:(valid,undo)=>rebind(assembly,'joint',...picks('right',valid),undo)};
}
const stemX=source=>source.asm.components[0].transform.x;
const near=(x,want)=>assert.ok(Math.abs(x-want)<1e-7,`${x} versus ${want}`);

for(const type of ['rackpinion','rotationlimit']){
  test(type+' add isolates a newly required nested source until commit',()=>{
    const {assembly,left,right,insert}=fixture(type);
    const before=structuredClone(assembly);
    const failed=insert('left',false,()=>assert.fail('unexpected undo'));
    assert.equal(failed.ok,false);
    assert.ok(failed.issues.some(i=>i.code==='invalid-axis-frame'),JSON.stringify(failed.issues));
    near(stemX(left),2);
    assert.deepEqual(assembly,before);
    let undos=0;
    const result=insert('left',true,()=>{assert.deepEqual(assembly,before);undos++;});
    assert.ok(result.ok,JSON.stringify(result.issues));
    assert.equal(undos,1);
    near(stemX(left),5);
    near(stemX(right),2);
  });
  test(type+' rebind opens the new nested source and leaves the old source alone',()=>{
    const {assembly,left,right,insert,rebind}=fixture(type);
    assert.ok(insert('left',true).ok);
    left.asm.components[1].transform.x=9;
    const before=structuredClone(assembly);
    const failed=rebind(false,()=>assert.fail('unexpected undo'));
    assert.equal(failed.ok,false);
    assert.ok(failed.issues.some(i=>i.code==='invalid-axis-frame'),JSON.stringify(failed.issues));
    near(stemX(right),2);
    assert.deepEqual(assembly,before);
    let undos=0;
    const result=rebind(true,()=>{
      assert.deepEqual(assembly,before);
      left.asm.components[1].transform.x=12;
      undos++;
    });
    assert.ok(result.ok,JSON.stringify(result.issues));
    assert.equal(undos,1);
    near(stemX(left),5);
    assert.equal(left.asm.components[1].transform.x,12);
    near(stemX(right),5);
    assert.equal(assembly.topologyMates[0].a.persistentId,'right/stem/shaft');
  });
}

test('a rejected rack drive after zero capture discards the solved source',()=>{
  const {assembly,left,insert}=fixture('rackpinion');
  assembly.components.push(body('stop',0,true));
  assembly.topologyMates.push({id:'hold-rack',type:'lock',
    a:{componentId:'stop',kind:'body'},b:{componentId:'rack',kind:'body'}});
  const before=structuredClone(assembly);
  const failed=insert('left',true,()=>assert.fail('unexpected undo'),{driveTurns:0.25});
  assert.equal(failed.ok,false);
  near(stemX(left),2);
  assert.deepEqual(assembly,before);
  assert.ok(insert('left',true).ok,'the undriven zero can be captured');
  near(stemX(left),5);
});

test('gear phase returns a solved nested pose without moving its input',()=>{
  const {assembly,left,right,insert}=fixture('rotationlimit');
  assert.ok(insert('left',true).ok);
  const {a,b}=assembly.topologyMates[0];
  assembly.topologyMates=[{id:'gear',type:'gear',ratioA:20,ratioB:40,a,b}];
  assert.ok(solveAssemblyMates(assembly).ok);
  left.asm.components[1].transform.x=8;
  const before=structuredClone(assembly);
  const result=setGearMatePhase(assembly,'gear',5);
  assert.ok(result.ok,JSON.stringify(result.issues));
  assert.deepEqual(assembly,before);
  const [solved,unused]=result.assembly.components[0].asm.components;
  near(stemX(solved),8);
  assert.equal(unused.asm,right.asm);
});

test('reopened rack motion publishes the rebound source only on successful seeks',async()=>{
  const {assembly,insert,rebind}=fixture('rackpinion');
  assert.ok(insert('left',true).ok);
  assert.ok(rebind(true).ok);
  assembly.components[0].grounded=false;
  const study=createMotionStudy(assembly);
  addRackPinionMotor(study,'joint',6);
  assembly.key='nested-rack-motion';
  assert.ok((await putAssemblyLibraryRecord(assembly)).ok);
  const cold=(await loadAssemblyLibrary()).find(item=>item.key===assembly.key);
  assert.deepEqual(cold,assembly);
  const [carrier,rack,sleeve]=cold.components;
  const [left,right]=carrier.asm.components;
  left.asm.components[1].transform.x=11;
  right.asm.components[1].transform.x=8;
  const untouched=structuredClone(left.asm);
  for(const time of [0,0.25,0.5]){
    const result=evaluateMotionStudy(cold,study.id,time,{incremental:true,playbackRevision:1});
    assert.ok(result.ok,JSON.stringify(result));
    near(stemX(right),8);
    assert.deepEqual(left.asm,untouched);
    near(sleeve.transform.y,rack.transform.y);
  }
  assert.ok(Math.abs(rack.transform.y)>0.01);
  // Break the rebound axis after a successful cached seek. The inner seat
  // can still solve, but neither its new pose nor the clock may be published.
  right.asm.components[1].transform.x=10;
  right.asm.components[0].topology[0].descriptor={surface:'plane',origin,normal:{x:1,y:0,z:0}};
  const before=structuredClone(cold);
  const failed=evaluateMotionStudy(cold,study.id,1,{incremental:true,playbackRevision:2});
  assert.equal(failed.ok,false);
  assert.ok(failed.issues.some(i=>i.code==='invalid-axis-frame'),JSON.stringify(failed.issues));
  assert.deepEqual(cold,before);
});
