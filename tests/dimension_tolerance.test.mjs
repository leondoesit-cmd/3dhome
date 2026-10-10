import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDimensionTolerance,formatDimensionTolerance,resolveDimensionTolerance} from '../js/core/dimension_tolerance.js';
import {createSheetDoc,createProjector,buildSheetScene,sceneToSvg,ensureSheetDoc} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {tessellateParts} from '../js/core/part_tessellate.js';

test('source unilateral inch deviations persist and convert without changing nominal geometry',()=>{
  const tol=makeDimensionTolerance('.000','-.002','in');
  assert.equal(formatDimensionTolerance(tol,'in'),'+0.000/−0.002');
  assert.equal(formatDimensionTolerance(tol,'mm'),'+0.000/−0.051');
  assert.equal(tol.lower,-.00508);
  assert.deepEqual(JSON.parse(JSON.stringify(tol)),tol);
  for(const pair of [['','0'],['Infinity','0'],['-1','1']])assert.throws(()=>makeDimensionTolerance(...pair));
  assert.equal(formatDimensionTolerance(makeDimensionTolerance('1','-1','deg'),'mm'),'+1/−1°');
});

test('native-bound sheet scene follows source tolerance, explicit override and cold source edits',()=>{
  const model={parts:[{kind:'box',x0:0,x1:2,y0:0,y1:3,z0:0,z1:1}],sketches:[{id:'sk',constraints:[{id:'D',type:'distance',value:2,tolerance:makeDimensionTolerance('.000','-.002','in')}]}]};
  const sourceGeometry=JSON.stringify(model.parts);
  const doc=createSheetDoc({units:'in',views:['front']});
  doc.dims.push({id:'dim',viewId:doc.views[0].id,type:'horizontal',modelItem:'sketch:sk:constraint:D',refs:[{pid:'edge',kind:'edge',at:'a'},{pid:'edge',kind:'edge',at:'b'}],offset:12});
  const topology=[{persistentId:'edge',kind:'edge',descriptor:{curve:'line',endpoints:[{x:0,y:0,z:0},{x:2,y:0,z:0}]}}];
  const render=(d,m)=>buildSheetScene(d,{model:m,topology,projection:createProjector(d,tessellateParts(m.parts))});
  let scene=render(doc,model);
  assert.equal(scene.dims.get('dim').dim.tolerance,'+0.000/−0.002');
  assert.equal(scene.dims.get('dim').dangling,false);
  assert.match(sceneToSvg(scene),/−0.002/);
  assert.equal(doc.dims[0].tolerance,undefined,'render does not bake source metadata into stored override');
  model.sketches[0].constraints[0].tolerance=makeDimensionTolerance('.001','-.003','in');
  assert.equal(render(doc,model).dims.get('dim').dim.tolerance,'+0.001/−0.003');
  doc.dims[0].tolerance='H7';
  assert.equal(render(doc,model).dims.get('dim').dim.tolerance,'H7');
  doc.dims[0].tolerance='';doc.dims[0].toleranceOverride=true;
  assert.equal(render(doc,model).dims.get('dim').dim.tolerance,'');
  doc.dims[0].toleranceOverride=false;
  const reopened=JSON.parse(JSON.stringify({...model,drawing:doc}));
  assert.equal(render(ensureSheetDoc(reopened),reopened).dims.get('dim').dim.tolerance,'+0.001/−0.003');
  assert.equal(JSON.stringify(model.parts),sourceGeometry);
  model.sketches[0].constraints=[];
  assert.equal(render(doc,model).dims.get('dim').dim.tolerance,'','removed metadata never leaves a stale cached suffix');
});

test('feature-owned tolerances resolve separately from sketch and legacy drawing text',()=>{
  const model={features:[{id:'boss',dimensionTolerances:{depth:makeDimensionTolerance('.1','-.1','mm')}}]};
  assert.equal(resolveDimensionTolerance({modelItem:'feature:boss:depth'},model,{units:'mm'}).tolerance,'+0.1/−0.1');
  assert.equal(resolveDimensionTolerance({modelItem:'feature:boss:depth',tolerance:'±.02'},model,{units:'mm'}).tolerance,'±.02');
});


test('controller invalidates metadata-only changes and writes override to normalized live record',async()=>{
  const def={parts:[{kind:'box',x0:0,x1:2,y0:0,y1:3,z0:0,z1:1}],sketches:[{id:'s',constraints:[{id:'d',value:2,tolerance:makeDimensionTolerance('0','-.002','in')}]}],drawing:createSheetDoc({units:'in',views:['front']})};
  def.drawing.dims.push({id:'D',viewId:def.drawing.views[0].id,type:'horizontal',refs:[{u:0,v:0},{u:2,v:0}],offset:10,modelItem:'sketch:s:constraint:d'});
  let answer={text:'<>',tolerance:'',toleranceOverride:true};
  const controller=createDrawingController({doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>tessellateParts(def.parts),bodiesToken:()=>1,topology:()=>null,t:s=>s,canvas:()=>({}),width:()=>900,height:()=>600,promptFields:async()=>answer,pushUndo:()=>ensureSheetDoc(def),markDirty:()=>{},refresh:()=>{}});
  assert.match(controller.svg(),/−0.002/);
  def.sketches[0].constraints[0].tolerance=makeDimensionTolerance('.001','-.004','in');
  assert.match(controller.svg(),/−0.004/,'metadata-only source edit invalidates unchanged body token');
  await controller.editDim('D');
  assert.equal(def.drawing.dims[0].toleranceOverride,true);
  assert.doesNotMatch(controller.svg(),/−0.004/);
  answer={text:'<>',tolerance:'',toleranceOverride:false};
  await controller.editDim('D');
  assert.match(controller.svg(),/−0.004/);
});
