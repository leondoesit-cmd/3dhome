import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateMotionStudy} from '../js/cad_motion_study.js';

test('browser vice screw playback advances from the correct pose and resets after seeks',()=>{
  // Bounded native frames from the actual browser export that stopped at
  // 2.2 seconds. Its suppressed journal is preserved as diagnostic evidence;
  // this verifies timeline replay, not acceptance of that mechanical repair.
  const assembly=JSON.parse(readFileSync(new URL('./fixtures/bench-vice-browser-motion.json',import.meta.url),'utf8'));
  const study=assembly.motionStudies[0],jaw=assembly.components.find(c=>c.id===4021);
  for(const time of [0,.1,2,2.2,2.3,2.4,2.5,5,10,2.3,2.4,0]){
    const result=evaluateMotionStudy(assembly,study.id,time,{incremental:true});
    assert.equal(result.ok,true,`${time}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(jaw.transform.x-.5*time)<1e-5,`${time}: jaw travel`);
    for(const key of ['y','z','rx','ry','rz'])assert.ok(Math.abs(jaw.transform[key])<1e-5,`${time}: guided ${key}`);
  }
});
