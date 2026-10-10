import test from 'node:test';
import assert from 'node:assert/strict';
import {dimensionText,createSheetDoc,ensureSheetDoc} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {makeDimensionTolerance} from '../js/core/dimension_tolerance.js';
import {tessellateParts} from '../js/core/part_tessellate.js';

test('dimension nominal precision rounds live lengths independently of secondary, angular and tolerance formatting',()=>{
  const doc={units:'in',precision:2,trailingZeros:true,secondaryUnits:'mm',secondaryPrecision:2};
  assert.equal(dimensionText({type:'vertical',measure:1.524,precision:3,tolerance:'+0.000/−0.002'},doc),'0.600 [15.24] +0.000/−0.002');
  assert.equal(dimensionText({type:'vertical',measure:1.143,precision:3},doc),'0.450 [11.43]');
  assert.equal(dimensionText({type:'radius',measure:1.27,precision:2},doc),'R0.50 [12.70]');
  assert.equal(dimensionText({type:'horizontal',measure:1.23456,precision:3},{units:'cm',precision:1,trailingZeros:true}),'1.235');
  assert.equal(dimensionText({type:'horizontal',measure:-.00004,precision:3},{units:'cm',trailingZeros:true}),'0.000');
  assert.equal(dimensionText({type:'angle',measure:5.1234,precision:3},doc),'5.1°');
  assert.equal(dimensionText({type:'diameter',measure:1.524,precision:3,text:'SIZE <>',reference:true,quantity:2},doc),'(2X SIZE ⌀0.600 [15.24])');
  for(const precision of [-1,9,NaN,'3'])assert.equal(dimensionText({type:'vertical',measure:1.524,precision},doc),'0.60 [15.24]');
  assert.equal(dimensionText({type:'vertical',measure:1.524,precision:3},{...doc,trailingZeros:false}),'0.6 [15.24]','sheet trailing-zero policy remains independent');
});

test('ordinary precision editor persists through normalized Undo/cold and native reference updates without freezing nominal text',async()=>{
  const def={parts:[{kind:'box',x0:0,x1:1.524,y0:0,y1:2,z0:0,z1:1}],sketches:[{id:'source',constraints:[{id:'length',type:'distance',value:1.524,tolerance:makeDimensionTolerance('.000','-.002','in')}]}],drawing:createSheetDoc({views:['front'],units:'in',precision:2,trailingZeros:true,secondaryUnits:'mm'})};
  const native=[{persistentId:'edge',kind:'edge',descriptor:{curve:'line',endpoints:[{x:0,y:0,z:0},{x:1.524,y:0,z:0}]}}];
  def.drawing.dims=[{id:'dimension',viewId:def.drawing.views[0].id,type:'horizontal',modelItem:'sketch:source:constraint:length',offset:10,refs:[{pid:'edge',kind:'edge',at:'a'},{pid:'edge',kind:'edge',at:'b'}]}];
  const geometry=JSON.stringify(def.parts),history=[],messages=[];let controller,fields,answer;
  const host={doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>tessellateParts(def.parts),bodiesToken:()=>1,topology:()=>native,t:k=>k,
    canvas:()=>({}),width:()=>900,height:()=>600,refresh(){},flash:m=>messages.push(m),markDirty:()=>controller.invalidate(),
    promptFields:async(_title,items)=>{fields=items;return answer;},
    pushUndo:()=>{history.push(JSON.stringify(def.drawing));def.drawing=JSON.parse(JSON.stringify(def.drawing));ensureSheetDoc(def);}};
  controller=createDrawingController(host);
  assert.match(controller.svg(),/0.60 \[15.24\] \+0.000\/−0.002/);
  answer={text:'0.60 [15.24]',precision:'3',tolerance:'',toleranceOverride:false};await controller.editDim('dimension');
  assert.equal(fields.find(f=>f.key==='precision').label,'Nominal decimal places');assert.equal(fields.find(f=>f.key==='precision').choices.length,10);
  assert.equal(def.drawing.dims[0].precision,3);assert.equal(def.drawing.dims[0].text,'');assert.equal(history.length,1);
  assert.match(controller.svg(),/0.600 \[15.24\] \+0.000\/−0.002/);
  def.drawing.dims[0].precision=2;assert.match(controller.svg(),/0.60 \[15.24\]/,'precision metadata alone invalidates the scene cache');
  def.drawing.dims[0].precision=3;
  native[0].descriptor.endpoints[1].x=1.143;controller.invalidate();
  assert.match(controller.svg(),/0.450 \[11.43\] \+0.000\/−0.002/,'live native reference edit keeps3decimals and independent source tolerance');
  const svg=controller.svg(),cold=JSON.parse(JSON.stringify(def));ensureSheetDoc(cold);
  assert.equal(createDrawingController({...host,doc:()=>ensureSheetDoc(cold),model:()=>cold}).svg(),svg);
  answer={text:'<>',precision:'sheet'};await controller.editDim('dimension');assert.equal(def.drawing.dims[0].precision,undefined);assert.match(controller.svg(),/0.45 \[11.43\]/);
  def.drawing=JSON.parse(history.at(-1));controller.invalidate();assert.match(controller.svg(),/0.450 \[11.43\]/,'Undo restores precision metadata');
  for(const precision of ['9','-1','2.5','']){answer={text:'<>',precision};await controller.editDim('dimension');}
  assert.equal(history.length,2);assert.equal(def.drawing.dims[0].precision,3);assert.equal(messages.length,4);
  answer=null;await controller.editDim('dimension');assert.equal(history.length,2);
  def.drawing.dims.push({id:'angle',type:'angle',viewId:def.drawing.views[0].id,refs:[{u:1,v:0},{u:0,v:0},{u:0,v:1}],offset:12});
  await controller.editDim('angle');assert.equal(fields.some(f=>f.key==='precision'),false,'angle formatting is not coupled to the new linear precision control');
  assert.equal(JSON.stringify(def.parts),geometry);
});
