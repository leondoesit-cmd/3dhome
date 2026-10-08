import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {solveSketch} from '../js/sketch_solver.js';
import {addDimensionedCircle} from '../js/sketch_dimensioned_circle.js';
import {lengthFromDocument,lengthToDocument} from '../js/core/document_length_units.js';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture({fixCenter=true,linked=false}={}) {
  let serial=0,discarded=0;
  const sketch={plane:'right',offset:1.6,points:[],entities:[],constraints:[]};
  const [circle]=addDimensionedCircle(sketch,{diameter:2.02,x:0,y:3.4,fixCenter},()=>++serial);
  const center=sketch.points[0],messages=[];
  if(linked){
    const anchor={id:++serial,x:0,y:3.4};sketch.points.push(anchor);
    sketch.constraints.push({id:++serial,type:'fixed',point:anchor.id,x:0,y:3.4},{id:++serial,type:'coincident',a:center.id,b:anchor.id});
  }
  solveSketch(sketch);
  const set=new Function('E','ensureSketch','fin','cloneData','resolveSketch','H','flash',
    sourceFunctionText(source,'setSketchCenterCoordinate')+';return setSketchCenterCoordinate;')(
      {def:sketch},def=>def,Number.isFinite,value=>JSON.parse(JSON.stringify(value)),
      ()=>!['conflicting','over-constrained'].includes(solveSketch(sketch).status),
      {discard:()=>discarded++},message=>messages.push(message));
  return {sketch,circle,center,set,messages,get discarded(){return discarded;}};
}

test('circle inspector edits its fixed center anchor, preserves diameter and persists on the Right datum',()=>{
  const f=fixture();
  assert.equal(f.set(f.center,'x',1.25),true);
  assert.equal(f.set(f.center,'y',4.8),true);
  const reopened=JSON.parse(JSON.stringify(f.sketch)),report=solveSketch(reopened);
  assert.equal(report.status,'fully-constrained');
  assert.equal(report.degreesOfFreedom,0);
  assert.ok(Math.abs(reopened.points[0].x-1.25)<1e-7);
  assert.ok(Math.abs(reopened.points[0].y-4.8)<1e-7);
  assert.equal(reopened.constraints.find(c=>c.type==='fixed').x,1.25);
  assert.equal(reopened.constraints.find(c=>c.type==='fixed').y,4.8);
  assert.equal(reopened.constraints.find(c=>c.type==='diameter').value,2.02);
  assert.ok(Math.abs(reopened.entities[0].r-1.01)<1e-7);
  assert.equal(reopened.plane,'right');assert.equal(reopened.offset,1.6);
  assert.equal(f.discarded,0);assert.equal(f.messages.length,0);
});

test('an unfixed circle center can move without acquiring fixed constraints',()=>{
  const f=fixture({fixCenter:false});
  assert.equal(f.set(f.center,'x',2),true);
  assert.equal(f.set(f.center,'y',-1),true);
  assert.equal(solveSketch(f.sketch).degreesOfFreedom,2);
  assert.equal(f.sketch.constraints.some(c=>c.type==='fixed'),false);
  assert.ok(Math.abs(f.center.x-2)<1e-7&&Math.abs(f.center.y+1)<1e-7);
});

test('another relation controlling an unfixed center refuses its coordinate edit without removing the relation',()=>{
  const f=fixture({fixCenter:false,linked:true}),before=JSON.parse(JSON.stringify(f.sketch));
  assert.equal(f.set(f.center,'x',2),false);
  assert.deepEqual(f.sketch.constraints,before.constraints);
  assert.ok(Math.abs(f.center.x-before.points[0].x)<1e-7);
  assert.ok(Math.abs(f.center.y-before.points[0].y)<1e-7);
  assert.ok(Math.abs(f.circle.r-before.entities[0].r)<1e-7);
  assert.equal(solveSketch(f.sketch).status,'fully-constrained');
  assert.equal(f.discarded,1);assert.match(f.messages[0],/another sketch relation/);
});

test('a conflicting relation also rolls back changed fixed anchor values',()=>{
  const f=fixture({linked:true}),before=JSON.parse(JSON.stringify(f.sketch));
  assert.equal(f.set(f.center,'y',8),false);
  assert.deepEqual(f.sketch.constraints,before.constraints);
  assert.ok(Math.abs(f.center.y-3.4)<1e-7);
  assert.equal(f.discarded,1);
});

function coordinateFixture(sketch) {
  const messages=[];
  let discarded=0;
  const set=new Function('E','ensureSketch','fin','cloneData','resolveSketch','H','flash',
    sourceFunctionText(source,'setSketchCenterCoordinate')+';return setSketchCenterCoordinate;')(
      {def:sketch},def=>def,Number.isFinite,value=>JSON.parse(JSON.stringify(value)),
      ()=>!['conflicting','over-constrained'].includes(solveSketch(sketch).status),
      {discard:()=>discarded++},message=>messages.push(message));
  return {set,messages,get discarded(){return discarded;}};
}

test('a fixed line endpoint can move while its horizontal and length relations drive the other endpoint',()=>{
  const sketch={plane:'top',points:[{id:'a',x:3,y:2},{id:'b',x:7,y:2}],
    entities:[{id:'line',type:'line',a:'a',b:'b'}],constraints:[
      {id:'anchor',type:'fixed',point:'a',x:3,y:2},
      {id:'horizontal',type:'horizontal',entity:'line'},
      {id:'length',type:'distance',entity:'line',value:4}]};
  const f=coordinateFixture(sketch);
  assert.equal(f.set(sketch.points[0],'y',6,'point'),true);
  const reopened=JSON.parse(JSON.stringify(sketch));
  assert.equal(solveSketch(reopened).status,'fully-constrained');
  assert.ok(Math.abs(reopened.points[0].y-6)<1e-7);
  assert.ok(Math.abs(reopened.points[1].y-6)<1e-7);
  assert.ok(Math.abs(reopened.points[1].x-7)<1e-7);
  assert.equal(reopened.constraints.length,3);
  assert.equal(f.discarded,0);
});

test('an ellipse fixed center edit persists while preserving its axes and rotation',()=>{
  const sketch={plane:'right',points:[{id:'c',x:1,y:2}],
    entities:[{id:'ellipse',type:'ellipse',c:'c',rx:3,ry:2,rot:.4,fixed:true}],
    constraints:[{id:'anchor',type:'fixed',point:'c',x:1,y:2}]};
  const f=coordinateFixture(sketch);
  assert.equal(f.set(sketch.points[0],'x',5),true);
  const reopened=JSON.parse(JSON.stringify(sketch));
  assert.equal(solveSketch(reopened).status,'fully-constrained');
  assert.equal(reopened.points[0].x,5);
  assert.deepEqual(reopened.entities[0],sketch.entities[0]);
  assert.equal(reopened.entities[0].rx,3);
  assert.equal(reopened.entities[0].ry,2);
  assert.equal(reopened.entities[0].rot,.4);
});

test('a selected point constrained coincident to another anchor rejects edits with a point-specific message',()=>{
  const sketch={points:[{id:'a',x:1,y:2},{id:'b',x:1,y:2}],entities:[],constraints:[
    {id:'anchor',type:'fixed',point:'a',x:1,y:2},
    {id:'coincident',type:'coincident',a:'a',b:'b'}]};
  const f=coordinateFixture(sketch),before=JSON.parse(JSON.stringify(sketch));
  assert.equal(f.set(sketch.points[1],'x',9,'point'),false);
  assert.deepEqual(sketch,before);
  assert.equal(f.discarded,1);
  assert.match(f.messages[0],/point coordinate.*move the point/);
});

function propertyRows(f){
  const element=tag=>({tag,children:[],events:{},appendChild(child){this.children.push(child);},setAttribute(){},addEventListener(name,handler){this.events[name]=handler;}});
  const undos=[];let refreshes=0;
  const bindings={el:element,fin:Number.isFinite,pushUndo:()=>undos.push(JSON.parse(JSON.stringify(f.sketch))),refreshAll:()=>refreshes++,t:key=>key,
    modelLengthUnit:()=> 'mm',lengthToDocument,lengthFromDocument,E:{def:f.sketch},ensureSketch:def=>def,uid:()=> 'new-radius',
    resolveSketch:()=>!['conflicting','over-constrained'].includes(solveSketch(f.sketch).status),detachDrivenSketchDimension:()=>{}};
  const api=new Function(...Object.keys(bindings),'var propGen=0;'+sourceFunctionText(source,'numRow')+sourceFunctionText(source,'numLengthRow')+sourceFunctionText(source,'setEntityDimension')+';return {numLengthRow,setEntityDimension};')(...Object.values(bindings));
  const host=element('div');
  return {undos,get refreshes(){return refreshes;},coordinate:axis=>api.numLengthRow(host,'Center '+axis.toUpperCase(),()=>f.center[axis],value=>f.set(f.center,axis,value),.1),
    radius:()=>api.numLengthRow(host,'R',()=>f.circle.r,value=>api.setEntityDimension(f.circle,'radius',Math.max(1e-6,value)),.1)};
}
function commitEnter(input,value){
  input.value=value;let prevented=false,stopped=false;
  input.events.keydown({key:'Enter',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.ok(prevented&&stopped);
}

test('Shape circle Center U/V and R commit Enter in document mm through fixed anchors and radial driver',()=>{
  const f=fixture();f.set(f.center,'x',14.6);f.set(f.center,'y',2.5);
  const rows=propertyRows(f),u=rows.coordinate('x'),v=rows.coordinate('y'),radius=rows.radius();
  assert.equal(u.value,'146');commitEnter(u,'170');assert.equal(f.center.x,17);
  u.events.change();assert.equal(rows.undos.length,1,'Enter followed by change does not duplicate history');
  commitEnter(v,'40');assert.equal(f.center.y,4);
  commitEnter(radius,'12');assert.ok(Math.abs(f.circle.r-1.2)<1e-8);
  const reopened=JSON.parse(JSON.stringify(f.sketch));assert.equal(solveSketch(reopened).status,'fully-constrained');
  const anchor=reopened.constraints.find(constraint=>constraint.type==='fixed');assert.equal(anchor.x,17);assert.equal(anchor.y,4);
  assert.ok(Math.abs(reopened.constraints.find(constraint=>constraint.type==='diameter').value-2.4)<1e-8);
  assert.equal(rows.undos.length,3);assert.equal(rows.refreshes,3);
});

test('Shape coordinate Enter preserves conflicting controlling relations and refuses nonfinite input',()=>{
  const f=fixture({linked:true}),before=JSON.parse(JSON.stringify(f.sketch)),rows=propertyRows(f),input=rows.coordinate('x');
  commitEnter(input,'20');assert.deepEqual(f.sketch,before);assert.equal(f.discarded,1);assert.match(f.messages[0],/another sketch relation/);
  commitEnter(input,'');assert.equal(input.value,'0');assert.equal(rows.undos.length,1,'nonfinite text adds no history');
});
