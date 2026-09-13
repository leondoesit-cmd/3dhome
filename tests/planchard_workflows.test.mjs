import test from 'node:test';
import assert from 'node:assert/strict';
import {addCenterRectangle} from '../js/sketch_center_rectangle.js';
import {solveSketch} from '../js/sketch_solver.js';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {evaluateFeatureNumber} from '../js/modeler_feature_form.js';
import {parallelStraightEdges} from '../js/core/edge_selection.js';
import {modelDimensions} from '../js/core/model_dimensions.js';
import {removeHistoryNode} from '../js/core/parametric_document.js';

test('center rectangle remains centered after a driving dimension changes and serialization', () => {
  let sequence=0;
  let sketch={points:[],entities:[],constraints:[]};
  const lines=addCenterRectangle(sketch,{width:6.858,height:6.858},()=>`center_${++sequence}`);
  assert.equal(solveSketch(sketch).degreesOfFreedom,0);
  assert.equal(analyzeSketchProfiles(sketch).profiles.length,1);
  sketch=JSON.parse(JSON.stringify(sketch));
  sketch.constraints.find(c=>c.type==='distance' && c.entity===lines[0].id).value=8;
  const result=solveSketch(sketch);
  assert.equal(result.degreesOfFreedom,0);
  const xs=sketch.points.slice(0,4).map(p=>p.x);
  assert.ok(Math.abs(Math.min(...xs)+4)<1e-5);
  assert.ok(Math.abs(Math.max(...xs)-4)<1e-5);
  assert.ok(sketch.points.slice(0,4).every(p=>Math.abs(Math.abs(p.y)-3.429)<1e-5));
});

test('feature lengths accept the book inch/mm dimensions and mixed-unit arithmetic',()=>{
  const length={unit:'length'};
  assert.ok(Math.abs(evaluateFeatureNumber('2.7in',length)-6.858)<1e-10);
  assert.ok(Math.abs(evaluateFeatureNumber('68.58 mm',length)-6.858)<1e-10);
  assert.ok(Math.abs(evaluateFeatureNumber('4.5in - (104.14mm - .2in)',length)-1.524)<1e-10);
  assert.equal(evaluateFeatureNumber('5deg',{unit:'angle'}),5);
  assert.throws(()=>evaluateFeatureNumber('5mm',{unit:'angle'}));
  assert.throws(()=>evaluateFeatureNumber('5in',{key:'count'}));
  assert.throws(()=>evaluateFeatureNumber('0mm',{unit:'length',min:1e-6}));
});

test('parallel edge selection collects four uprights but not top rims or arcs',()=>{
  const edge=(id,x,z,reverse=false)=>({persistentId:id,descriptor:{curve:'line',endpoints:reverse?[{x,y:10.414,z},{x,y:0,z}]:[{x,y:0,z},{x,y:10.414,z}]}});
  const uprights=[edge('a',-3.429,-3.429),edge('b',3.429,-3.429,true),edge('c',3.429,3.429),edge('d',-3.429,3.429)];
  const others=[{descriptor:{curve:'circle',axis:{x:0,y:1,z:0}}},{descriptor:{curve:'line',axis:{x:1,y:0,z:0}}},{descriptor:{curve:'line',axis:{x:0,y:0,z:0}}}];
  assert.deepEqual(parallelStraightEdges(uprights[0],[...uprights,...others]),uprights);
  assert.deepEqual(parallelStraightEdges(others[0],uprights),[]);
  assert.deepEqual(parallelStraightEdges(null,uprights),[]);
});

test('library dimensions preserve small parts and fractional millimeters',()=>{
  assert.deepEqual(modelDimensions({x0:-3.429,x1:3.429,y0:0,y1:10.414,z0:-3.429,z1:3.429}),{w:6.858,d:6.858,h:10.414});
  assert.deepEqual(modelDimensions({x0:0,x1:.025,y0:0,y1:.01,z0:0,z1:.025}),{w:.025,d:.025,h:.01});
  assert.throws(()=>modelDimensions({x0:0,x1:NaN,y0:0,y1:1,z0:0,z1:1}));
});

test('deleting a finish feature also removes the source-body operation and stale mesh',()=>{
  const doc={history:[{id:'h1',kind:'feature',targetId:'f1',name:'Side fillets'}],features:[{id:'f1',type:'fillet'}],parts:[{id:'body',exactOperations:[{id:'f1',type:'fillet'},{id:'other',type:'chamfer'}],meshData:{positions:[1,2,3]},exactBuildToken:3}]};
  const result=removeHistoryNode(doc,'h1');
  assert.equal(result.ok,true);
  assert.deepEqual(result.dirtyPartIds,['body']);
  assert.deepEqual(doc.parts[0].exactOperations,[{id:'other',type:'chamfer'}]);
  assert.equal(doc.parts[0].meshData,undefined);
  assert.equal(doc.parts[0].exactBuildToken,4);
  assert.equal(JSON.parse(JSON.stringify(doc)).history.length,0);
});
