import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy} from '../js/cad_motion_study.js';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const start=source.indexOf('function createDefaultMotionStudy()');
const end=source.indexOf('\n/* The Evaluate command',start);

for(const ids of [[1745,1746],['driver','follower']]){
  test(`motion form resolves browser select IDs (${typeof ids[0]}) before evaluating`,()=>{
    const assembly={components:ids.map(id=>({id,name:String(id),grounded:false,transform:{}})),mates:[],topologyMates:[]};
    let form,undo=0;
    const context={E:{docType:'assembly',assembly,componentSel:[]},structuredClone,createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy,
      t:s=>s,flash:()=>{},openQuickForm:f=>{form=f;},pushUndo:()=>undo++,invalidateInterference:()=>{},refreshAll:()=>{}};
    vm.runInNewContext(source.slice(start,end)+'\ncreateDefaultMotionStudy();',context);
    form.onLive({study:'new',relation:'new'});
    assert.equal(form.onApply({motor:String(ids[0]),driver:String(ids[0]),follower:String(ids[1]),rpm:5,motorAxis:'y',driverAxis:'y',followerAxis:'y',driverTeeth:20,followerTeeth:40,mesh:'external',remove:false,time:1}),true);
    assert.equal(undo,1);
    assert.equal(assembly.motionStudies[0].motors[0].componentId,ids[0]);
    assert.equal(assembly.motionStudies[0].gearRelations[0].followerId,ids[1]);
    assert.ok(Math.abs(assembly.components[0].transform.ry-30)<1e-8);
    assert.ok(Math.abs(assembly.components[1].transform.ry+15)<1e-8);
  });
}
