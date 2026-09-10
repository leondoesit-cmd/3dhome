import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAreaReport} from '../js/project_area.js';
const rect=(x,z,w,d)=>[{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
test('indoor area subtracts wall unions and void intersections while footprint counts solids once',()=>{
 const input={rooms:[{key:'1',pts:rect(0,0,100,100)}],metadata:{'1':{roomType:'bedroom'}},wallSolids:[{id:1,points:rect(-10,-10,120,20)}],voids:[rect(50,50,100,100)]};
 const r=projectAreaReport(input);assert.equal(r.indoor,.65);assert.equal(r.footprint,.89);assert.equal(r.measurable,true);
});
test('door thresholds restore floor through wall solids but not through voids',()=>{
 const r=projectAreaReport({rooms:[{key:'1',pts:rect(0,0,100,100)}],metadata:{'1':{roomType:'bedroom'}},wallSolids:[{id:1,points:rect(0,0,100,10)}],apertures:[rect(0,0,20,10)],voids:[rect(0,0,10,10)]});
 assert.equal(r.indoor,.91);
});
test('outdoor and disconnected rooms prevent a misleading whole-property measurement',()=>{
 const rooms=[{key:'1,2',pts:rect(0,0,100,100)},{key:'2,3',pts:rect(100,0,100,100)},{key:'4',pts:rect(500,0,100,100)}];
 const metadata={'1,2':{roomType:'bedroom'},'2,3':{roomType:'terrace'},'4':{roomType:'bedroom'}};
 const r=projectAreaReport({rooms,metadata,wallSolids:[]});assert.equal(r.indoor,2);assert.equal(r.outdoor,1);assert.equal(r.components.length,2);assert.equal(r.measurable,false);
 const unknown=projectAreaReport({rooms,metadata:{},wallSolids:[]});assert.equal(unknown.unclassified,3);assert.equal(unknown.measurable,false);
});
