import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../vendor/acorn/acorn.mjs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {defaultSketchPlane} from '../js/modeler_workflow.js';
import {reassignSketchPlane} from '../js/core/sketch_plane_edit.js';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function load(name,bindings){return new Function(...Object.keys(bindings),sourceFunctionText(source,name)+';return '+name+';')(...Object.values(bindings));}

test('empty-part Start sketch Top action overrides last-used Right while ordinary default retains it',()=>{
 const planes=['top','front','right'].map(x=>({id:'plane:'+x,type:'plane'}));
 const E={def:{references:planes,history:[]},lastSketchReferenceId:'plane:right'};let selected,action;
 const start=load('startSketchOnDefaultPlane',{E,defaultSketchPlane,chooseSketchReference:(p,tool)=>selected={p,tool},document:{body:{classList:{contains:()=>false}}}});
 const render=load('renderCreateSketchAction',{E,selectedSketchableFace:()=>null,activeParts:()=>[],t:x=>x,referenceLabel:x=>x.id,btn:(label,callback)=>{action=callback;return {};},startSketchOnDefaultPlane:start});
 render({appendChild(){}},false);action();assert.equal(selected.p.id,'plane:top');assert.equal(selected.tool,'srect');
 start('sslot');assert.equal(selected.p.id,'plane:right');
});

function planeCallback(){let result;function visit(n){if(!n||typeof n!=='object')return;if(n.type==='CallExpression'&&n.callee?.object?.name==='planeSel'&&n.callee.property?.name==='addEventListener')result=n.arguments[1];for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);}}visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return source.slice(result.start,result.end);}

test('committing Right to Top updates authored reference, active working frame, chip and normal camera together',()=>{
 const sketch={id:'s',plane:'side',referenceId:'plane:right',offset:3,points:[{id:1,x:2,y:4}],constraints:[{id:1,type:'fixed',point:1,x:2,y:4}]};
 const geometry=JSON.stringify({points:sketch.points,constraints:sketch.constraints});let camera,chip,refresh=0;
 const E={def:{activeSketch:'s',references:[],history:[{kind:'sketch',targetId:'s',name:'Right sketch'}]},view:'side',mode:'3d',modelPlaneActive:true,authoring:{phase:'sketch',referenceId:'plane:right',sketchId:'s'},pv:{lookAtFrame:x=>camera=x},_proj:{stale:true},poly:{},arcPts:{},drag:{}};
 const standardPlaneFrame=load('standardPlaneFrame',{fin:Number.isFinite});
 const sketchCameraFrame=load('sketchCameraFrame',{E,activeSketchFrame:()=>sketch.frame||null,ensureSketch:()=>sketch,standardPlaneFrame});
 const orientModelToView=load('orientModelToView',{E,sketchCameraFrame});
 const syncCommittedSketchPlane=load('syncCommittedSketchPlane',{E,invalidateSketchProjection:load('invalidateSketchProjection',{E}),syncModelPlane:()=>chip=E.authoring.referenceId,orientModelToView,syncTools:()=>{}});
 const callback=new Function('E','sketch','planeSel','pushUndo','t','reassignSketchPlane','planeLabel','syncCommittedSketchPlane','refreshAll','return '+planeCallback())(E,sketch,{value:'top'},()=>{},x=>x,reassignSketchPlane,x=>x,syncCommittedSketchPlane,()=>refresh++);
 callback();assert.equal(sketch.plane,'top');assert.equal(sketch.referenceId,'plane:top');assert.equal(E.view,'top');assert.equal(E.authoring.referenceId,'plane:top');assert.equal(chip,'plane:top');assert.equal(E.def.activeSketch,'s');assert.equal(E.lastSketchReferenceId,'plane:top');assert.equal(E._proj,undefined);assert.equal(E.drag,null);assert.equal(refresh,1);
 assert.equal(E.def.history[0].name,'top sketch');assert.deepEqual(camera.normal,{x:0,y:1,z:0});assert.deepEqual(camera.yAxis,{x:0,y:0,z:1});assert.equal(JSON.stringify({points:sketch.points,constraints:sketch.constraints}),geometry);
});

test('committed reference stays active in 2D and 3D without adopting another sketch',()=>{
 const sketch={id:'offset',plane:'front',referenceId:'datum:oblique'};const E={def:{},view:'side',mode:'2d',authoring:{phase:'sketch'}};let oriented=0;
 load('syncCommittedSketchPlane',{E,invalidateSketchProjection:()=>{},syncModelPlane:()=>{},orientModelToView:()=>oriented++,syncTools:()=>{}})(sketch);
 assert.equal(E.def.activeSketch,'offset');assert.equal(E.view,'front');assert.equal(E.authoring.referenceId,'datum:oblique');assert.equal(oriented,0);
 E.mode='3d';E.modelPlaneActive=true;
 load('syncCommittedSketchPlane',{E,invalidateSketchProjection:()=>{},syncModelPlane:()=>{},orientModelToView:force=>{assert.equal(force,true);oriented++;},syncTools:()=>{}})(sketch);assert.equal(oriented,1);
});
