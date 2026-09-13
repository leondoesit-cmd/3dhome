import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inferLineRelations,constraintAlreadyPresent} from '../js/modeler_inference.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const start=source.indexOf('function makeWallSegment('),end=source.indexOf('\nfunction finishWallChain(',start);
test('typed small CAD lines preserve their intended endpoint instead of a stale origin snap',()=>{
 const sketch={points:[],entities:[],constraints:[]};let next=0;
 const uid=()=>String(++next),point=(doc,p)=>{if(p.pointId)return p.pointId;const id=uid();doc.points.push({id,x:p.u,y:p.v});return id;};
 const make=new Function('E','sketchForView','newSketchPoint','uid','sketchPoint','inferTangentCircle','inferLineRelations','constraintAlreadyPresent','resolveSketch',source.slice(start,end)+';return makeWallSegment;')({wallWidth:5,_osnap:{k:'o'}},()=>sketch,point,uid,(doc,id)=>doc.points.find(p=>p.id===id),()=>null,inferLineRelations,constraintAlreadyPresent,()=>{});
 const line=make({u:0,v:0},{u:-.254,v:0},{typed:true});
 assert.ok(line,'2.54 mm flange edge must be accepted');
 assert.equal(sketch.points.find(p=>p.id===line.b).x,-.254);
 assert.ok(sketch.constraints.some(c=>c.type==='fixed'&&c.point===line.a));
 assert.ok(!sketch.constraints.some(c=>c.type==='fixed'&&c.point===line.b));
 assert.ok(sketch.constraints.some(c=>c.type==='horizontal'));
 assert.equal(make({u:0,v:0},{u:0,v:0},{typed:true}),null);
});
