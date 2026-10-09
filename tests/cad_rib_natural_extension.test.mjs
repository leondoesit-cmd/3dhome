import test from 'node:test';
import assert from 'node:assert/strict';
import {booleanBrep,disposeBrep,makeBrepPrimitive,ribBrep,shapeMassProperties,validateBrepForExport} from '../js/cad_kernel.js';
import {featureDefaults} from '../js/core/feature_catalog.js';
import {ribGrowthVector} from '../js/core/rib_profile.js';

async function fixture(){
  const base=await makeBrepPrimitive({type:'box',x:-4,y:0,z:0,w:8,h:1,d:10});
  const boss=await makeBrepPrimitive({type:'cylinder',axis:'y',x:0,y:3,z:6,r:2,h:4});
  try{return await booleanBrep('union',base,boss);}finally{disposeBrep(base);disposeBrep(boss);}
}
const params={orientation:'parallel',extent:'up-to-body',axis:'x',from:0,thickness:2,side:'both',growthDirection:'negative-v',points:[{u:0,v:1},{u:2,v:2}]};
const volume=async shape=>(await shapeMassProperties(shape)).volume;
function residualVolume(shape){const oc=shape.oc,props=new oc.GProp_GProps_1();try{oc.BRepGProp.VolumeProperties_1(shape.shape,props,false,false,false);return Math.abs(props.Mass());}finally{props.delete();}}

test('Natural Rib extends a finite straight guide through curved full-width contact, preserving the finite default',async()=>{
  const body=await fixture();let finite=null,natural=null,long=null,left=null,right=null;
  try{
    finite=await ribBrep(body,params);
    natural=await ribBrep(body,{...params,profileExtension:'natural'});
    // At X=±1 the cylinder's near contact is Z=6−sqrt(2²−1²).
    const contact=6-Math.sqrt(3);
    long=await ribBrep(body,{...params,points:[{u:0,v:1},{u:contact,v:1+contact/2}]});
    assert.equal(featureDefaults('rib').profileExtension,'finite');
    assert.ok(await volume(natural)>await volume(finite)+4,'short finite ends remain short; Natural reaches the cylindrical boss');
    const valid=await validateBrepForExport(natural);
    assert.equal(valid.valid,true);assert.equal(valid.solidCount,1);
    left=await booleanBrep('subtract',natural,long);right=await booleanBrep('subtract',long,natural);
    assert.ok(residualVolume(left)<1e-8);assert.ok(residualVolume(right)<1e-8,'residual '+residualVolume(left)+' / '+residualVolume(right));
  }finally{[body,finite,natural,long,left,right].filter(Boolean).forEach(disposeBrep);}
});

test('Natural Rib follows either chain order and an explicit rotated sketch frame',async()=>{
  const body=await fixture();let first=null,reversed=null;
  try{
    first=await ribBrep(body,{...params,profileExtension:'natural'});
    reversed=await ribBrep(body,{...params,axis:'frame',frame:{origin:{x:0,y:0,z:0},xAxis:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0},normal:{x:1,y:0,z:0}},profileExtension:'natural',points:[...params.points].reverse()});
    assert.ok(Math.abs(await volume(first)-await volume(reversed))<1e-8);
    assert.equal((await validateBrepForExport(reversed)).solidCount,1);
  }finally{[body,first,reversed].filter(Boolean).forEach(disposeBrep);}
});

test('Natural Rib rejects missing tangent contact or incomplete thickness coverage instead of inventing a termination',async()=>{
  const body=await fixture();
  try{
    await assert.rejects(ribBrep(body,{...params,profileExtension:'natural',points:[{u:0,v:1},{u:2,v:5}]}),/Natural Rib.*reach/);
    await assert.rejects(ribBrep(body,{...params,profileExtension:'natural',thickness:5}),/Natural Rib.*reach/);
    assert.equal((await validateBrepForExport(body)).valid,true,'failed feature leaves the input body intact');
  }finally{disposeBrep(body);}
});

test('normal-to-guide growth follows the actual straight angle, opposite branch, and rejects ambiguous bends',()=>{
  for(const angle of [0,Math.PI/4,48*Math.PI/180,120*Math.PI/180]){
    const points=[{u:3,v:2},{u:3+7*Math.cos(angle),v:2+7*Math.sin(angle)}];
    const left=ribGrowthVector('normal-left',points),right=ribGrowthVector('normal-right',points);
    assert.ok(Math.abs(left.u+Math.sin(angle))<1e-12);
    assert.ok(Math.abs(left.v-Math.cos(angle))<1e-12);
    assert.ok(Math.abs(left.u+right.u)+Math.abs(left.v+right.v)<1e-12);
  }
  assert.deepEqual(ribGrowthVector('negative-v'),{u:0,v:-1});
  assert.throws(()=>ribGrowthVector('normal-left',[{u:0,v:0},{u:1,v:1},{u:2,v:0}]),/straight guide/);
  assert.throws(()=>ribGrowthVector('normal-left',[{u:0,v:0},{u:0,v:0}]),/straight guide/);
});

test('inclined local guide-normal growth is invariant under sketch-frame rotation and reaches the same native curved contact',async()=>{
  const stock=await fixture(),wall=await makeBrepPrimitive({type:'box',x:-4,y:1,z:-1,w:8,h:4,d:1});
  let body=null,reference=null,rotated=null;
  try{
    body=await booleanBrep('union',stock,wall);
    const points=[{u:0,v:5},{u:2,v:5}];
    reference=await ribBrep(body,{...params,points,profileExtension:'natural',growthDirection:'normal-right'});
    for(const angle of [Math.PI/6,48*Math.PI/180]){
      const c=Math.cos(angle),s=Math.sin(angle);
      const frame={origin:{x:0,y:0,z:0},xAxis:{x:0,y:s,z:c},yAxis:{x:0,y:c,z:-s},normal:{x:1,y:0,z:0}};
      const local=points.map(q=>({u:c*q.u+s*q.v,v:-s*q.u+c*q.v}));
      rotated=await ribBrep(body,{...params,axis:'frame',frame,points:local,profileExtension:'natural',growthDirection:'normal-right'});
      assert.ok(Math.abs(await volume(reference)-await volume(rotated))<1e-7);
      const validation=await validateBrepForExport(rotated);assert.equal(validation.valid,true);assert.equal(validation.solidCount,1);
      disposeBrep(rotated);rotated=null;
    }
  }finally{[stock,wall,body,reference,rotated].filter(Boolean).forEach(disposeBrep);}
});
