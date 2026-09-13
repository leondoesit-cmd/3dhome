import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBrepExtrusion,booleanBrep,extractBrepTopology,shellBrep,disposeBrep,shapeMassProperties} from '../js/cad_kernel.js';
test('LENSCAP shells both openings with a constant wall and preserved opening planes',async()=>{
const frame={origin:{x:0,y:0,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},normal:{x:0,y:0,z:1}};
const base=await makeBrepExtrusion({points:[{u:6.223,v:0},{u:0,v:6.223},{u:-6.223,v:0},{u:0,v:-6.223}],segments:[{type:'circle',center:{u:0,v:0},radius:6.223}],from:0,to:-4.3815,frame,draftAngle:5,draftOutward:true});
const cut=await makeBrepExtrusion({points:[{u:4.92125,v:0},{u:0,v:4.92125},{u:-4.92125,v:0},{u:0,v:-4.92125}],segments:[{type:'circle',center:{u:0,v:0},radius:4.92125}],from:0,to:-.6985,frame,draftAngle:5});
const body=await booleanBrep('subtract',base,cut);const topology=extractBrepTopology(body,{ownerFeatureId:'cut'}).topology;
const faces=topology.filter(t=>t.kind==='face'&&t.descriptor.surface==='plane'&&t.descriptor.origin.z<-.1);
let result,overlap;
try{result=await shellBrep(body,.381,{facePersistentIds:faces.map(f=>f.persistentId),join:'round'});const mass=await shapeMassProperties(result);assert.ok(Math.abs(mass.bounds.min.z+4.3815)<1e-6);assert.ok(Math.abs(mass.bounds.max.z)<1e-6);const k=Math.tan(5*Math.PI/180),shift=.381/Math.cos(5*Math.PI/180);
const integral=(a,b,lo,hi)=>a*a*(hi-lo)+a*b*(hi*hi-lo*lo)+b*b/3*(hi**3-lo**3);
const outerWall=(lo,hi)=>integral(6.223,-k,lo,hi)-integral(6.223-shift,-k,lo,hi);
const innerWall=(lo,hi)=>integral(4.92125+shift,k,lo,hi)-integral(4.92125,k,lo,hi);
const expected=Math.PI*(outerWall(-4.3815,-.381)+innerWall(-.6985,-.381)+integral(6.223,-k,-.381,0)-integral(4.92125,k,-.381,0));
assert.ok(Math.abs(mass.volume-expected)<1e-5,JSON.stringify({volume:mass.volume,expected}));overlap=await booleanBrep('intersect',result,body);assert.ok(Math.abs((await shapeMassProperties(overlap)).volume-mass.volume)<1e-5,'Inward shell must remain inside the original solid');}finally{if(overlap)disposeBrep(overlap);if(result)disposeBrep(result);}
disposeBrep(body);disposeBrep(cut);disposeBrep(base);

});
