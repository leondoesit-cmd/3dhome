import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {removeSketch, ensureSketch} from '../js/sketch_solver.js';
import {removeHistoryNode} from '../js/core/parametric_document.js';
const source = modelerSource();
function load(context) {
  const start = source.indexOf('function syncSketchAfterRemoval(');
  const end = source.indexOf('\n}', start) + 2;
  return vm.runInNewContext(`(${source.slice(start, end)})`, context);
}
test('deleting the active Right sketch synchronizes the surviving Front sketch, plane and authoring context', () => {
  const front = {id:'front',plane:'front',referenceId:'plane:front',points:[],entities:[],constraints:[]};
  const right = {id:'right',plane:'side',referenceId:'plane:right',points:[],entities:[],constraints:[]};
  const E = {def:{sketches:[front,right],activeSketch:'right'},view:'side',mode:'3d',modelPlaneActive:true,sketchNormalTo:true,
    authoring:{phase:'sketch',sketchId:'right',referenceId:'plane:right'},ssel:['old'],poly:['old'],drag:{}};
  let chipPlane, cameraPlane;
  const sync = load({E,ensureSketch,solveSketch:()=>({dof:0}),syncModelPlane:()=>{chipPlane=E.view;},orientModelToView:()=>{cameraPlane=E.view;}});
  assert.equal(removeSketch(E.def,'right'),true);
  sync('right');
  assert.equal(E.def.activeSketch,'front');
  assert.equal(E.view,'front');
  assert.equal(chipPlane,'front');
  assert.equal(cameraPlane,'front');
  assert.equal(E.authoring.sketchId,'front');
  assert.equal(E.authoring.referenceId,'plane:front');
  assert.equal(E._solveSketchId,'front');
  assert.equal(E.drag,null);
  assert.equal(E.ssel.length,0);
});
test('removing an inactive sketch preserves the active sketch camera and selection', () => {
  const E={def:{activeSketch:'front'},view:'front',ssel:['selected']};
  const sync=load({E,ensureSketch:()=>({id:'front'})});
  sync('front');
  assert.equal(E.ssel[0],'selected');
});
test('canonical history deletion repairs a dangling active sketch before testing whether the plane changed', () => {
  const front={id:'front',plane:'front',referenceId:'plane:front',points:[],entities:[],constraints:[]};
  const right={id:'right',plane:'side',referenceId:'plane:right',points:[],entities:[],constraints:[]};
  const E={def:{sketches:[front,right],activeSketch:'right',history:[{id:'entry-right',kind:'sketch',targetId:'right'}],features:[],parts:[]},view:'side',authoring:{},mode:'3d',modelPlaneActive:true};
  const sync=load({E,ensureSketch,solveSketch:()=>({dof:0}),syncModelPlane(){}});
  assert.equal(removeHistoryNode(E.def,'entry-right').ok,true);
  assert.equal(E.def.activeSketch,'right','canonical removal leaves an invalid active ID until normalized');
  sync('right');
  assert.equal(E.view,'front');
  assert.equal(E.authoring.sketchId,'front');
});
