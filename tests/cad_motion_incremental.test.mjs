import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {addRotaryMotor,createMotionStudy,evaluateMotionStudy} from '../js/cad_motion_study.js';

test('browser-authored five-loop crank plays forward from its last exact pose and resets the full assembly',()=>{
 const assembly=JSON.parse(fs.readFileSync(new URL('./fixtures/re75_native_mates.json',import.meta.url),'utf8'));
 const initial=structuredClone(assembly.components.map(c=>c.transform));
 const study=createMotionStudy(assembly,'Five loop crank');
 addRotaryMotor(study,assembly.journalId,12,{x:0,y:0,z:1});
 const first=evaluateMotionStudy(assembly,study.id,5/72,{incremental:true});
 assert.equal(first.ok,true,JSON.stringify(first.unsatisfied));
 assert.equal(first.motionSubsteps,1);
 const second=evaluateMotionStudy(assembly,study.id,10/72,{incremental:true});
 assert.equal(second.ok,true,JSON.stringify(second.unsatisfied));
 assert.equal(second.motionSubsteps,1,'only the next five degrees are solved, not the entire elapsed timeline');
 const pin=assembly.components.find(c=>c.name==='RE10 eccentric crankpin');
 assert.ok(Math.abs(Math.hypot(pin.transform.x,pin.transform.y)-1.8)<1e-6);
 const reset=evaluateMotionStudy(assembly,study.id,0);
 assert.equal(reset.ok,true,JSON.stringify(reset.unsatisfied));
 assert.equal(reset.motionSubsteps,1);
 assembly.components.forEach((c,i)=>{
   assert.ok(Math.hypot(...['x','y','z'].map(key=>c.transform[key]-initial[i][key]))<1e-6,
     'Reset must restore every follower, not only the motor');
 });
});

test('forward playback limits each motor jump to five degrees and invalidates a changed motor',()=>{
 const assembly={components:[{id:'rotor',transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0}}],topologyMates:[]};
 const study=createMotionStudy(assembly,'Rotor');
 const motor=addRotaryMotor(study,'rotor',60,{x:0,y:0,z:1});
 assert.equal(evaluateMotionStudy(assembly,study.id,0,{incremental:true}).ok,true);
 const forward=evaluateMotionStudy(assembly,study.id,.1,{incremental:true});
 assert.equal(forward.ok,true);
 assert.equal(forward.motionSubsteps,8,'36° must be divided into at most 5° solves');
 motor.rpm=30;
 const changed=evaluateMotionStudy(assembly,study.id,.2,{incremental:true});
 assert.equal(changed.ok,true);
 assert.equal(changed.motionSubsteps,1,'a motor edit invalidates the pose cursor and performs a deterministic seek');
});
