import test from 'node:test';
import assert from 'node:assert/strict';
import {relationSourceSketchIds,resolveSketchRelationSources} from '../js/core/sketch_relation_sources.js';
import {resolveSketchSources} from '../js/core/swept_sources.js';
import {resolveProfilePoints} from '../js/sketch_solver.js';

test('sweep source profile Pierce follows a circular path edit without a direct sketchId',()=>{
  const path={id:'path',plane:'front',points:[{id:1,x:0,y:0}],entities:[{id:2,type:'circle',c:1,r:5}],constraints:[]};
  const profile={id:'profile',plane:'top',points:[{id:3,x:5,y:0}],entities:[{id:4,type:'circle',c:3,r:.5}],constraints:[{id:5,type:'radius',entity:4,value:.5},{id:6,type:'pierce',point:3,sketchId:'path',entityId:2,x:5,y:0}]};
  const sources={kind:'sweep',profile:{sketchId:'profile',entityIds:[4]},path:{sketchId:'path',entityIds:[2]}};
  const feature={type:'sweep',inputs:[],references:{sketches:['profile','path']},params:{sketchSources:sources}};
  const ids=relationSourceSketchIds(feature);assert.deepEqual(ids,['profile','path']);
  const document={sketches:[path,profile]};path.entities[0].r=5.1;
  const updates=resolveSketchRelationSources(document,ids,()=>null);
  assert.equal(updates.length,1);assert.equal(profile.points[0].x,5);
  assert.ok(Math.abs(updates[0].points[0].x-5.1)<1e-8);
  assert.ok(Math.abs(updates[0].points[0].y)<1e-8);
  const resolved=resolveSketchSources(document,sources,resolveProfilePoints);
  const profileX=resolved.profile.map(p=>p.x);
  assert.ok(Math.abs((Math.min(...profileX)+Math.max(...profileX))/2-5.1)<1e-8);
  assert.ok(Math.abs(resolved.pathSegments[0].from.x-5.1)<1e-8);
});

test('unavailable source relation refuses regeneration instead of keeping a stale profile',()=>{
  const profile={id:'profile',plane:'top',points:[],entities:[],constraints:[{type:'pierce',sketchId:'missing',entityId:2,point:3}]};
  assert.throws(()=>resolveSketchRelationSources({sketches:[profile]},['profile'],()=>null),/unavailable/);
});
