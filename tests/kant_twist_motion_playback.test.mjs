import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateMotionStudy} from '../js/cad_motion_study.js';
import {motionPlaybackStepSeconds} from '../js/core/motion_playback.js';

test('actual browser-accepted 36-mate Kant Twist study follows bounded playback through its full native span',t=>{
 const bundle=JSON.parse(readFileSync(new URL('../artifacts/planchard/KT-assembly-motion-accepted-free-home-browser-2026-10-08.mforge',import.meta.url),'utf8'));
 const assembly=bundle.assemblies.find(item=>item.components.length===25),study=assembly.motionStudies[0];
 assert.equal(assembly.topologyMates.length,36);
 const suppressed=assembly.topologyMates.filter(mate=>mate.suppressed).map(mate=>mate.id);
 assert.deepEqual(suppressed,[]);
 const base=assembly.components.map(component=>structuredClone(component.transform));
 const step=motionPlaybackStepSeconds(study),start=performance.now();
 let requests=0;
 for(let time=0;;time=Math.min(10,time+step)){
  const result=evaluateMotionStudy(assembly,study.id,time,{incremental:true});
  assert.equal(result.ok,true,`${time}: ${JSON.stringify(result.issues)} / ${JSON.stringify(result.unsatisfied)}`);
  assert.equal(result.unsatisfied.length,0);assert.equal(result.issues.length,0);
  assert.equal(result.degreesOfFreedom,0,'specified motor drive removes only the physical actuator freedom');
  assert.deepEqual(assembly.topologyMates.filter(mate=>mate.suppressed).map(mate=>mate.id),suppressed);
  if(time>0)requests++;
  if(time===10)break;
 }
 assert.equal(requests,41);
 const movingBrace=assembly.components.find(component=>component.name==='KT07 Brace B +Z');
 const jaw=assembly.components.find(component=>component.name==='KT10 Grip B');
 assert.ok(Math.abs(movingBrace.transform.rz-Math.atan(3/4)*180/Math.PI)<1e-4,'actual brace reaches closing angle');
 assert.ok(Math.abs(jaw.transform.y-16.1)<1e-5,'actual lower jaw reaches the ten-mm opening');
 const reset=evaluateMotionStudy(assembly,study.id,0,{incremental:true});
 assert.equal(reset.ok,true);
 assembly.components.forEach((component,index)=>{
  for(const key of ['x','y','z','rx','ry','rz'])assert.ok(Math.abs((component.transform[key]||0)-(base[index][key]||0))<1e-5,`${component.name}: reset ${key}`);
 });
 t.diagnostic(`41 bounded native forward requests plus home/reset completed in ${Math.round(performance.now()-start)} ms`);
});
