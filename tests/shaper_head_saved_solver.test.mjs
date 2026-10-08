import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {setScrewMateDrive} from '../js/cad_screw_controls.js';
import {setRotationLimitMateDrive} from '../js/cad_rotation_limit_controls.js';
import {axisAngleMatrix,rotationVectorMatrix,rotationOf} from '../js/cad_mate_model.js';
const saved=JSON.parse(readFileSync(new URL('./fixtures/shaper-head-browser-native-mates.json',import.meta.url),'utf8'));
test('rotation increments smaller than1e-10 radians remain available to solve lever-arm residuals',()=>{
  for(const angle of [4e-11,2e-13,-4e-11]){
    const m=axisAngleMatrix({x:1,y:0,z:0},angle),v=rotationVectorMatrix({x:angle,y:0,z:0});
    assert.ok(Math.abs(m[2][1]-Math.sin(angle))<1e-25);
    assert.ok(Math.abs(v[2][1]-Math.sin(angle))<1e-25);
  }
});
test('actual saved shaper clapper and locked tool cluster settle at minus4degrees across feed range',()=>{
  for(const feed of [0,10,20]){
    let a=structuredClone(saved);assert.equal(setScrewMateDrive(a,5276,feed).ok,true);assert.equal(setRotationLimitMateDrive(a,5283,-4).ok,true);
    for(let reopen=0;reopen<3;reopen++){
      a=JSON.parse(JSON.stringify(a));const r=solveAssemblyMates(a);
      assert.equal(r.ok,true);assert.equal(r.settled,true,JSON.stringify(r));assert.equal(r.degreesOfFreedom,0);assert.deepEqual(r.unsatisfied,[]);
      const clap=a.components.find(c=>c.name==='SH15'),rot=rotationOf(clap.transform);assert.ok(Math.abs(Math.atan2(rot[2][1],rot[1][1])*180/Math.PI+4)<1e-8);
    }
  }
});
test('actual shaper stop rejection still preserves all poses and constraints atomically',()=>{
  for(const [type,value] of [['feed',-1],['feed',21],['hinge',1],['hinge',-21]]){
    const a=structuredClone(saved),before=JSON.stringify(a);let undo=0;
    const r=type==='feed'?setScrewMateDrive(a,5276,value,()=>undo++):setRotationLimitMateDrive(a,5283,value,()=>undo++);
    assert.equal(r.ok,false);assert.equal(JSON.stringify(a),before);assert.equal(undo,0);
  }
});
