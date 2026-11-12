import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {addDimensionedPolygon} from '../js/sketch_dimensioned_polygon.js';
import {filletSketchCorner} from '../js/sketch_fillet.js';
import {solveSketch,circleData} from '../js/sketch_solver.js';
import {createHistory} from '../js/edit_history.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=modelerSource();
function fixture(){
 let serial=0;const uid=()=>++serial,sketch={id:'q1',plane:'front',offset:0,points:[],entities:[],constraints:[]};
 addDimensionedPolygon(sketch,{sides:4,diameter:3.414213562373095*2.54,x:0,y:0,rotation:0,fixCenter:true,fixRotation:true},uid);
 assert.equal(solveSketch(sketch).status,'fully-constrained');
 const vertices=sketch.points.filter(p=>p.id!==sketch.entities[0].c).map(p=>({...p}));
 const E={def:{sketches:[sketch]},ssel:[]},H=createHistory({get:()=>JSON.stringify(E.def),set:value=>{E.def=JSON.parse(value);}});H.clear();
 let selected=vertices[0].id;
 const context={E,ensureSketch:()=>E.def.sketches[0],selPoints:()=>[{id:selected}],selFilletCurves:()=>[],cloneData:structuredClone,uid,filletSketchCorner,
  pushUndo:label=>H.push(label),H,t:k=>k,flash:()=>{},resolveSketch:()=>solveSketch(E.def.sketches[0]).converged};
 const apply=new Function(...Object.keys(context),sourceFunctionText(source,'applySketchFilletFromSelection')+';return applySketchFilletFromSelection;')(...Object.values(context));
 return {E,H,vertices,select:id=>{selected=id;},apply:(radius=1.27)=>apply({radius,dimension:true,keepCorners:true})};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);
function checkSharp(f,scale=1){const s=f.E.def.sketches[0];for(const original of f.vertices){const p=s.points.find(p=>p.id===original.id);assert.ok(p);near(p.x,original.x*scale);near(p.y,original.y*scale);}assert.equal(solveSketch(s).status,'fully-constrained');}

test('actual Q1 polygon fillet handler retains its sharp vertices and first R0.5in center, Undo and cold Redo',()=>{
 const f=fixture();assert.equal(f.apply(),true);checkSharp(f);
 const s=f.E.def.sketches[0],arc=s.entities.find(e=>e.type==='arc'),center=s.points.find(p=>p.id===arc.c);near(center.x,2.54);near(center.y,0);
 assert.equal(s.constraints.filter(c=>c.type==='equal').length,3);
 f.H.undo();assert.equal(f.E.def.sketches[0].entities.filter(e=>e.type==='arc').length,0);checkSharp(f);
 f.H.redo();checkSharp(f);const cold=JSON.parse(JSON.stringify(f.E.def.sketches[0]));assert.equal(solveSketch(cold).status,'fully-constrained');
});

test('four sequential polygon fillets preserve original sides and driving diameter edits through cold JSON',()=>{
 const f=fixture();for(const vertex of f.vertices){f.select(vertex.id);assert.equal(f.apply(),true);checkSharp(f);}
 const s=f.E.def.sketches[0];assert.equal(s.entities.filter(e=>e.type==='arc').length,4);assert.equal(s.constraints.filter(c=>c.type==='equal').length,3);
 assert.equal(s.entities.filter(e=>e.virtualSharpSideFor).length,4);
 const cold=JSON.parse(JSON.stringify(s)),guide=cold.constraints.find(c=>c.type==='diameter');guide.value*=1.1;assert.equal(solveSketch(cold).status,'fully-constrained');
 for(const original of f.vertices){const p=cold.points.find(p=>p.id===original.id);near(p.x,original.x*1.1);near(p.y,original.y*1.1);}
 const points=new Map(cold.points.map(p=>[p.id,p]));for(const arc of cold.entities.filter(e=>e.type==='arc'))near(circleData(arc,points).radius,1.27);
});

test('actual polygon fillet handler rejects an oversized corner without changing constraints or Undo history',()=>{
 const f=fixture(),before=JSON.stringify(f.E.def);assert.equal(f.apply(100),false);
 assert.equal(JSON.stringify(f.E.def),before);assert.equal(f.H.canUndo(),false);
 checkSharp(f);
});
