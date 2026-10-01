import test from 'node:test';
import assert from 'node:assert/strict';
import {partBounds,cutFootprint} from '../js/modeler_part_geometry.js';
import {bodyDepthRange,cutFootprintsMayOverlap} from '../js/core/cut_scope.js';

const rect=(u0,v0,u1,v1)=>[{u:u0,v:v0},{u:u1,v:v0},{u:u1,v:v1},{u:u0,v:v1}];
const stock=()=>({kind:'ext',axis:'y',from:0,to:1.27,pts:rect(0,0,10.16,13.97),holes:[],merges3d:[{axis:'y',from:1.27,to:5.08,loop:rect(0,8.255,10.16,13.97)}]});
test('a pending merged stock exposes its raised boss to a bounded Top-plane pocket',()=>{
  const part=stock(),bounds=partBounds(part),reach=bodyDepthRange(bounds,null,'y');
  assert.equal(bounds.y1,5.08);assert.equal(reach.to,5.08);
  const pocket=rect(.635,9.525,9.525,13.97),from=4.445,to=1.27;
  assert.equal(cutFootprintsMayOverlap(pocket,cutFootprint(part,null,'y')),true);
  assert.ok(reach.to>Math.min(from,to) && reach.from<Math.max(from,to),'the authored boss reaches the pocket interval');
});
test('a pending boss outside the original base outline remains a cut candidate',()=>{
  const part=stock();part.merges3d[0].loop=rect(10,8,14,12);
  assert.equal(partBounds(part).x1,14);
  assert.equal(cutFootprintsMayOverlap(rect(12,9,13,10),cutFootprint(part,null,'y')),true);
  part.merges3d[0].suppressed=true;
  assert.equal(partBounds(part).x1,10.16);
  assert.equal(cutFootprintsMayOverlap(rect(12,9,13,10),cutFootprint(part,null,'y')),false);
});
test('a finished exact mesh controls the envelope after later material removal',()=>{
  const part=stock();part.meshData={exactBounds:{min:{x:0,y:0,z:0},max:{x:10,y:4,z:13}}};
  assert.equal(partBounds(part).y1,4);
});
