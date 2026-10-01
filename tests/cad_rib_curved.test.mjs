import test from 'node:test';
import assert from 'node:assert/strict';
import {booleanBrep,brepContainsPoint,disposeBrep,makeBrepRevolve,ribBrep,validateBrepForExport} from '../js/cad_kernel.js';
const inch=2.54;
function volume(body){const props=new body.oc.GProp_GProps_1();try{body.oc.BRepGProp.VolumeProperties_1(body.shape,props,false,false,false);return props.Mass();}finally{props.delete();}}
function count(body){const oc=body.oc,explorer=new oc.TopExp_Explorer_2(body.shape,oc.TopAbs_ShapeEnum.TopAbs_SOLID,oc.TopAbs_ShapeEnum.TopAbs_SHAPE);let n=0;try{while(explorer.More()){n++;explorer.Next();}return n;}finally{explorer.delete();}}
const p=(u,v)=>({u:u*inch,v:v*inch});
test('Exercise 7.12 parallel Rib stops on exact outer cone through its full thickness and leaves the cup open',async()=>{
  const cone=await makeBrepRevolve({axis:'y',radialProfile:true,points:[p(0,0),p(.5,0),p(1,3),p(.94,3),p(.45,.06),p(0,.06)]});let rib=null,added=null;
  const recipe={orientation:'parallel',extent:'up-to-body',growthDirection:'negative-u',axis:'z',from:0,side:'both',thickness:.06*inch,points:[p(.62,.12),p(1.06,2.76)]};
  try{
    rib=await ribBrep(cone,recipe);assert.equal(count(rib),1);assert.equal((await validateBrepForExport(rib)).valid,true);
    // Integrate the analytic cone/cross-thickness intersection, not a faceted
    // approximation or a rectangle extending into the hollow interior.
    const width=y=>{const r=.5+y/6,a=.03;return 2*a*(r+.1)-(a*Math.sqrt(r*r-a*a)+r*r*Math.asin(a/r));};
    let integral=0;const n=200,h=(2.76-.12)/n;for(let i=0;i<=n;i++)integral+=(i===0||i===n?1:i%2?4:2)*width(.12+i*h);integral*=h/3*inch**3;
    assert.ok(Math.abs(volume(rib)-volume(cone)-integral)<1e-6,'added volume follows exact circular cone intersections at every depth');
    assert.equal(brepContainsPoint(rib,{x:0,y:2*inch,z:0}),false,'hollow cup is not filled');
    assert.equal(brepContainsPoint(rib,{x:.88*inch,y:2*inch,z:0}),true,'outside web exists beside the cone');
    assert.equal(brepContainsPoint(rib,{x:.88*inch,y:2*inch,z:.031*inch}),false,'web stays within the .06 inch thickness');
    added=await booleanBrep('subtract',rib,cone);assert.equal(count(added),1);
    await assert.rejects(ribBrep(cone,{...recipe,growthDirection:'positive-u'}),/does not reach/);
  }finally{disposeBrep(cone);if(rib)disposeBrep(rib);if(added)disposeBrep(added);}
});
