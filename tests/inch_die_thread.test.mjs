import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeThreadSpec,validateThreadFeature,modeledThreadSolid,threadCallout} from '../js/cad_thread.js';
import {threadPlacementFromFace} from '../js/core/thread_placement.js';

test('ebook HOOK #8-36 inch die retains blank diameter override and exact 36 TPI through save',()=>{
 const input={threadPreset:'inch-die-8-36',diameterMm:3.81,mode:'modeled',side:'external',length:.635,axis:{x:0,y:1,z:0}};
 const saved=JSON.parse(JSON.stringify(normalizeThreadSpec(input)));
 const spec=normalizeThreadSpec(saved);
 assert.equal(spec.diameterMm,3.81);assert.equal(spec.pitchMm,25.4/36);
 assert.ok(Math.abs(spec.turns-9)<1e-12);assert.equal(spec.toleranceClass,'2A');
 assert.equal(validateThreadFeature(spec).ok,true);
 assert.equal(threadCallout(spec),'#8-36 UNF 2A ↓0.25 in');
 const cutter=modeledThreadSolid(spec,{asCutter:true});
 assert.equal(cutter.operation,'subtract');
 assert.equal(cutter.threadGeometry.profile,'Unified-basic-60-flat-root');
 assert.equal(cutter.threadGeometry.fitStatus,'basic-profile-only');
 assert.ok(cutter.sections.flat().every(point=>point.y>=-1e-12 && point.y<=.635+1e-12));
 assert.equal(validateThreadFeature({...spec,toleranceClass:'6g'}).ok,false);
});

test('a picked sweep stem cylinder starts the thread at its boundary rather than its centre',()=>{
 const placement=threadPlacementFromFace({origin:{x:0,y:.3175,z:0},axis:{x:0,y:1,z:0},along:{min:-.3175001,max:.3175001}});
 assert.deepEqual(placement,{origin:{x:0,y:0,z:0},axis:{x:0,y:1,z:0}});
 const rotated=threadPlacementFromFace({origin:{x:3,y:2,z:1},axis:{x:2,y:0,z:0},along:{min:-.5,max:.5}});
 assert.deepEqual(rotated,{origin:{x:2.5,y:2,z:1},axis:{x:1,y:0,z:0}});
});
