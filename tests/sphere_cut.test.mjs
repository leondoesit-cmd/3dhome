import test from 'node:test';
import assert from 'node:assert/strict';
import {partSupportsExactMesh,partNeedsExactMesh,exactBrepForPart,exactCutIntersection} from '../js/modeler_part_geometry.js';
import {disposeBrep,shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';

const sphere=()=>({id:'globe',featureId:'sphere1',kind:'sph',x:0,y:0,z:0,r:.6});
function socket(radius=.41){
  return {featureId:'socket',axis:'z',from:-.6,to:0,
    loop:Array.from({length:24},(_,i)=>({u:radius*Math.cos(i*Math.PI/12),v:radius*Math.sin(i*Math.PI/12)})),
    segments:[{type:'circle',center:{u:0,v:0},radius}]};
}

test('native spheres are exact cut targets while invalid radii and untyped meshes remain refused',()=>{
  assert.equal(partSupportsExactMesh(sphere()),true);
  for(const r of [0,-1,NaN,Infinity])assert.equal(partSupportsExactMesh({...sphere(),r}),false);
  assert.equal(partSupportsExactMesh({kind:'mesh'}),false);
  assert.equal(partNeedsExactMesh({...sphere(),cuts3d:[socket()]}),true);
});

test('12mm sphere accepts an exact 8.2mm blind socket, survives reopen, and replays a diameter edit',async()=>{
  const part=sphere();
  const uncut=await exactBrepForPart(part);
  try{
    const mass=await shapeMassProperties(uncut);
    assert.ok(Math.abs(mass.volume-4*Math.PI*.6**3/3)<1e-8);
    const intersection=await exactCutIntersection(part,socket(),uncut);
    assert.equal(intersection.intersects,true,JSON.stringify(intersection));
  }finally{disposeBrep(uncut);}
  part.cuts3d=[socket()];
  const reopened=JSON.parse(JSON.stringify(part));
  for(const radius of [.41,.35]){
    reopened.cuts3d=[socket(radius)];
    const shape=await exactBrepForPart(reopened);
    try{
      const mass=await shapeMassProperties(shape),validation=await validateBrepForExport(shape);
      assert.equal(validation.valid,true,JSON.stringify(validation));assert.equal(validation.solidCount,1);
      const removed=2*Math.PI/3*(.6**3-(.6**2-radius**2)**1.5);
      assert.ok(Math.abs(mass.volume-(4*Math.PI*.6**3/3-removed))<1e-7,`${mass.volume} exact blind socket volume`);
      assert.ok(mass.centerOfMass.z>0,'blind socket removes only the negative-Z hemisphere');
      assert.ok(Math.abs(mass.centerOfMass.x)<1e-8);assert.ok(Math.abs(mass.centerOfMass.y)<1e-8);
      assert.ok(shape.topology.some(entry=>entry.kind==='face'&&entry.descriptor.surface==='cylinder'),'socket wall remains cylindrical');
    }finally{disposeBrep(shape);}
  }
});
