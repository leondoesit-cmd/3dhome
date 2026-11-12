import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {addCenterRectangle} from '../js/sketch_center_rectangle.js';
import {solveSketch} from '../js/sketch_solver.js';
import {analyzeSketchProfiles} from '../js/sketch_profiles.js';
import {featureField,featureControlValue} from '../js/modeler_feature_form.js';

const source=modelerSource();
function node(){return {children:[],dataset:{},classList:{add(){}},value:'',appendChild(child){this.children.push(child);},addEventListener(){},setAttribute(){},removeAttribute(){},setCustomValidity(){}};}
for(const [unit,values] of [['mm',{width:'20',height:'8',x:'40',y:'-10'}],['in',{width:'20mm',height:'8mm',x:'40mm',y:'-10mm'}]])test('existing Center rectangle form authors exact driving dimensions in '+unit+' on its current datum',()=>{
  const sketch={id:'KT-rectangle',referenceId:'plane:front',plane:'front',offset:1.6,points:[],entities:[],constraints:[]};
  let form,serial=0,appends=0,selected;
  const E={authoring:{phase:'sketch'},ssel:[]};
  const open=new Function('E','startSketchOnDefaultPlane','setTool','openQuickForm','t','appendToSketch','addCenterRectangle','uid','markDrawnSelection',sourceFunctionText(source,'openCenterRectangle')+';return openCenterRectangle;')
    (E,()=>{throw Error('existing sketch must retain its datum');},()=>{},spec=>form=spec,key=>key,(_label,callback)=>{appends++;return callback(sketch);},addCenterRectangle,()=>++serial,made=>{selected=made;E.ssel=made.map(line=>line.id);});
  open();assert.equal(form.action,'centerrectangle');
  const parsed=Object.fromEntries(form.fields.map(field=>{
    const configured={...field,inputUnit:unit};
    const input=featureField(node(),configured,field.value,{el:node,units:{length:unit}});
    if(field.type==='boolean')input.checked=true;else input.value=values[field.key];
    return[field.key,featureControlValue({field:configured,input})];
  }));
  assert.equal(form.onApply(parsed),true);assert.equal(appends,1);assert.equal(selected.length,4);
  assert.equal(solveSketch(sketch).degreesOfFreedom,0);assert.equal(analyzeSketchProfiles(sketch).profiles.length,1);
  assert.equal(sketch.referenceId,'plane:front');assert.equal(sketch.offset,1.6);
  assert.equal(sketch.entities.filter(entity=>!entity.construction).length,4);
  assert.deepEqual(sketch.constraints.filter(constraint=>constraint.type==='distance').map(constraint=>constraint.value),[2,.8]);
  const reopened=JSON.parse(JSON.stringify(sketch));
  reopened.constraints.find(constraint=>constraint.type==='distance').value=3;
  assert.equal(solveSketch(reopened).degreesOfFreedom,0);
  const corners=reopened.points.slice(0,4);
  assert.ok(Math.abs(Math.min(...corners.map(point=>point.x))-2.5)<1e-7);
  assert.ok(Math.abs(Math.max(...corners.map(point=>point.x))-5.5)<1e-7);
  assert.ok(Math.abs(Math.min(...corners.map(point=>point.y))+1.4)<1e-7);
  assert.ok(Math.abs(Math.max(...corners.map(point=>point.y))+.6)<1e-7);
});
