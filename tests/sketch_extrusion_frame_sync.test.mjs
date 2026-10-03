import test from 'node:test';
import assert from 'node:assert/strict';
import {reassignSketchPlane} from '../js/core/sketch_plane_edit.js';
import {setSketchOffset} from '../js/core/sketch_offset.js';
import {synchronizeSketchExtrusionFrames} from '../js/core/extrusion_projection.js';

test('changing a committed boss sketch from Right to Top moves its feature and merged preview together',()=>{
  const sketch={id:'guide',plane:'side',referenceId:'plane:right',offset:6,
    points:[{id:'outerCenter',x:.6,y:0},{id:'innerCenter',x:.6,y:0}],
    entities:[{id:'outer',type:'circle',c:'outerCenter',r:2.5},{id:'inner',type:'circle',c:'innerCenter',r:2.3}]};
  const feature={id:'boss',type:'extrude',references:{sketches:['guide']},params:{sketchId:'guide',profileEntityIds:['outer'],holeProfileEntityIds:[['inner']],axis:'x',from:6,to:14,depth:8,offset:0,direction:'forward',endCondition:'blind'}};
  const merge={featureId:'boss',axis:'x',from:6,to:14,loop:[{u:.6,v:0}],holes:[{points:[{u:.6,v:0}]}]};
  const body={id:'base',kind:'ext',axis:'z',from:-2.5,to:-1.8,merges3d:[merge],meshData:{positions:[0]}};
  const doc={sketches:[sketch],features:[feature],parts:[body],references:[]};
  reassignSketchPlane(sketch,{id:'plane:top',type:'plane'},'top');
  setSketchOffset(doc,'guide',6);
  synchronizeSketchExtrusionFrames(doc,'guide');
  assert.equal(feature.params.axis,'y');
  assert.deepEqual([feature.params.from,feature.params.to],[6,14]);
  assert.equal(merge.axis,'y');
  assert.deepEqual([merge.from,merge.to],[6,14]);
  assert.deepEqual(merge.segments,[{type:'circle',center:{u:.6,v:0},radius:2.5}]);
  assert.deepEqual(merge.holes[0].segments,[{type:'circle',center:{u:.6,v:0},radius:2.3}]);
  assert.equal(body.meshData,undefined);
  sketch.points[0].x=0;sketch.points[0].y=.6;
  sketch.points[1].x=0;sketch.points[1].y=.6;
  setSketchOffset(doc,'guide',7);
  synchronizeSketchExtrusionFrames(doc,'guide');
  assert.deepEqual([feature.params.from,feature.params.to],[7,15]);
  assert.deepEqual([merge.from,merge.to],[7,15]);
  assert.deepEqual(merge.segments[0].center,{u:0,v:.6});
  assert.deepEqual(merge.holes[0].segments[0].center,{u:0,v:.6});
});

test('reverse mid-plane and local sketch frames retain signed extent without stale world axis',()=>{
  const frame={origin:{x:0,y:4,z:0},normal:{x:0,y:-1,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:1}};
  const sketch={id:'s',plane:'top',referenceId:'datum',frameSpace:'local',frame,offset:4,entities:[],points:[]};
  const part={id:'p',kind:'ext',featureId:'f',axis:'x',from:1,to:3,pts:[]};
  const feature={id:'f',type:'extrude',references:{sketches:['s']},params:{sketchId:'s',axis:'x',from:1,to:3,depth:2,offset:.5,direction:'reverse',symmetric:true,endCondition:'mid-plane'}};
  const doc={sketches:[sketch],parts:[part],features:[feature]};
  synchronizeSketchExtrusionFrames(doc,'s');
  assert.equal(feature.params.axis,'frame');
  assert.deepEqual([feature.params.from,feature.params.to],[.5,-1.5]);
  assert.equal(part.axis,'frame');
  assert.deepEqual(part.frame,frame);
  assert.deepEqual([part.from,part.to],[.5,-1.5]);
});
