import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSurveyVertex,surveyVertexPlane} from '../js/survey_vertex.js';
const face={id:'roof',kind:'face',category:'roof',label:'Roof',points:[{x:0,y:200,z:0},{x:100,y:250,z:0},{x:100,y:250,z:100},{x:0,y:200,z:100}]};
test('roof vertex preview retains its measured plane and leaves evidence untouched',()=>{
 const state={surveyFeatures:[face],workspace:{survey:{observations:[{value:200,status:'checked'}]}}},before=JSON.stringify(state);
 const preview=previewSurveyVertex(state,'roof',1,{x:120,y:260,z:0});
 assert.equal(preview.points[1].y,260);assert.equal(JSON.stringify(state),before);
 assert.equal(previewSurveyVertex(state,'roof',1,{x:120,y:300,z:0}),null);
 const {normal}=surveyVertexPlane(face,1);assert.ok(Math.abs(normal.x+normal.y/2)<1e-8);
});
test('vertex editing respects locked geometry, role, finite coordinates and valid indices',()=>{
 for(const state of [{surveyFeatures:[{...face,locked:true}]},{surveyFeatures:[face],structLocked:true},{surveyFeatures:[face],workspace:{role:'viewer'}}])assert.equal(previewSurveyVertex(state,'roof',0,face.points[0]),null);
 assert.equal(previewSurveyVertex({surveyFeatures:[face]},'roof',9,face.points[0]),null);
 assert.equal(previewSurveyVertex({surveyFeatures:[face]},'roof',0,{x:NaN,y:0,z:0}),null);
});
test('grid snapping preserves sloped measured planes and layer locks',async()=>{
 const {snapSurveyVertex}=await import('../js/survey_vertex.js');
 const snapped=snapSurveyVertex({x:103,y:251.5,z:7},surveyVertexPlane(face,0),5);
 assert.ok(Math.abs(snapped.y-200-snapped.x/2)<1e-8);
 for(const layer of [{vis:'show',locked:true},{vis:'hide'},{vis:'show',pickOverride:false}])assert.equal(previewSurveyVertex({surveyFeatures:[face],layers:{structure:layer}},'roof',0,face.points[0]),null);
});
test('headroom remains detectable when the first three measured roof points are collinear',async()=>{
 const {navigationPosition}=await import('../js/navigation_geometry.js');
 const roof={id:'low-roof',kind:'face',points:[{x:0,y:150,z:0},{x:50,y:150,z:0},{x:100,y:150,z:0},{x:100,y:150,z:100},{x:0,y:150,z:100}]};
 const state={surveyFeatures:[roof]};assert.equal(navigationPosition(state,{x:50,y:0,z:50},{height:165}).reason,'headroom');
 assert.equal(navigationPosition(state,{x:50,y:0,z:50},{height:140}).clear,true);
});
test('a walker clears the upper linked stair opening without stopping at its lip',async()=>{
 const {practiceDocument}=await import('../js/survey_practice.js'),{moveSurveyWalker}=await import('../js/navigation_geometry.js');
 const d=practiceDocument('multilevel'),upper=d.workspace.floors[1],state={...upper.scene,workspace:{...d.workspace,activeFloor:upper.id}};
 const before=JSON.stringify(state),next=moveSurveyWalker(state,{x:200,y:0,z:125},0,-35,{radius:18,height:165,stepHeight:20,slopeLimit:45});
 assert.equal(next.z,90);assert.equal(next.y,0);assert.equal(next.hit,false);assert.equal(JSON.stringify(state),before);
});
