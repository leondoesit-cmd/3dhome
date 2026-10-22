import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {captureMotionStudyBaseline,createMotionStudy,addScrewMotor,evaluateMotionStudy} from '../js/cad_motion_study.js';

const source=modelerSource();
const start=source.indexOf('function motionScrewMateLabel(');
const formSource=source.slice(start,source.indexOf('\n/* The Evaluate command',start));
const saved=JSON.parse(readFileSync(new URL('./fixtures/shaper-head-browser-native-mates.json',import.meta.url),'utf8'));
function editor(assembly){
  let form,undo=0,captures=0;
  const context={E:{docType:'assembly',assembly,componentSel:[]},structuredClone,createMotionStudy,addScrewMotor,evaluateMotionStudy,
    captureMotionStudyBaseline:(a,s)=>{captures++;return captureMotionStudyBaseline(a,s);},
    t:key=>key,modelLengthText:String,modelLengthUnit:()=> 'cm',flash:()=>{},openQuickForm:f=>{form=f;},
    syncFlexibleSpringsAtMotionState:async()=>{},pushUndo:()=>undo++,invalidateInterference:()=>{},refreshAll:()=>{}};
  const open=()=>{vm.runInNewContext(formSource+'\ncreateDefaultMotionStudy();',context);form.onLive({study:assembly.motionStudies[0].id});return form;};
  return {open,get undo(){return undo;},get captures(){return captures;}};
}
const values={motorType:'screw',screwMate:5276,rpm:120,time:0};

test('actual SH study form explicitly recaptures current native Drives and preserves global mate settings',async()=>{
  const assembly=structuredClone(saved),hinge=assembly.topologyMates.find(m=>m.id===5283);
  hinge.driveAngle=0;
  const ui=editor(assembly),form=ui.open();
  assert.match(form.hint,/motionPoseOnlyBaseline/);
  assert.equal(form.fields.find(f=>f.key==='resetZero').label,'motionResetDriveBaseline');
  const mates=JSON.stringify(assembly.topologyMates);
  assert.equal(await form.onApply({...values,resetZero:true}),true);
  assert.equal(ui.captures,1);assert.equal(ui.undo,1);
  assert.equal(JSON.stringify(assembly.topologyMates),mates);
  const captured=assembly.motionStudies[0].nativeDriveConfiguration;
  assert.equal(captured.find(c=>c.mateId===5283).value,0);
  assert.equal(captured.find(c=>c.mateId===5276).value,null,'free actuator is captured explicitly');
  assert.match(ui.open().hint,new RegExp('motionCapturedDriveBaseline '+captured.length));
  delete hinge.driveAngle;
  const cold=JSON.parse(JSON.stringify(assembly));
  const result=evaluateMotionStudy(cold,cold.motionStudies[0].id,10);
  assert.equal(result.ok,true);assert.equal(result.degreesOfFreedom,0);
  assert.equal(cold.topologyMates.find(m=>m.id===5283).driveAngle,undefined,'study playback does not publish captured Drives globally');
});

test('ordinary legacy study edits do not silently capture live Drives; failed recapture creates no history',async()=>{
  const assembly=structuredClone(saved),ui=editor(assembly);
  assert.equal(await ui.open().onApply(values),true);
  assert.equal(ui.captures,0);assert.equal(ui.undo,1);
  assert.equal(Object.hasOwn(assembly.motionStudies[0],'nativeDriveConfiguration'),false);
  assembly.topologyMates.find(m=>m.id===5283).driveAngle=5;
  const before=JSON.stringify(assembly);
  assert.equal(await ui.open().onApply({...values,resetZero:true}),false);
  assert.equal(ui.captures,1);assert.equal(ui.undo,1);
  assert.equal(JSON.stringify(assembly),before);
});
