import test from 'node:test';
import assert from 'node:assert/strict';
import { updateAssemblyContexts } from '../js/core/assembly_context.js';
import { apply, rotationOf } from '../js/cad_mate_model.js';

const plane = x => ({persistentId:'end-face',kind:'face',descriptor:{surface:'plane',origin:{x,y:0,z:0},normal:{x:1,y:0,z:0}}});
const fixture = () => {
  const parent={id:'body',grounded:true,transform:{x:0,y:0,z:0,rx:0,ry:0,rz:0},topology:[plane(2)]};
  const cap={id:'cap',transform:{},def:{sketches:[{id:'profile'}],features:[{id:'boss'}]},inContext:{parentId:'body',reference:{componentId:'body',persistentId:'end-face',kind:'face',frameSpace:'component',descriptor:plane(2).descriptor}}};
  return {components:[parent,cap]};
};

test('virtual component follows changed source face and source rotation without changing authored history',()=>{
  const assembly=fixture(),[parent,cap]=assembly.components;
  const history=structuredClone(cap.def);
  assert.deepEqual(updateAssemblyContexts(assembly).issues,[]);
  assert.equal(cap.transform.x,2);
  parent.topology=[plane(3)];parent.transform={x:10,y:4,z:1,rx:0,ry:0,rz:90};
  assert.deepEqual(updateAssemblyContexts(assembly).issues,[]);
  assert.ok(Math.abs(cap.transform.x-10)<1e-8);
  assert.ok(Math.abs(cap.transform.y-7)<1e-8);
  assert.equal(cap.transform.z,1);
  const normal=apply(rotationOf(cap.transform),{x:1,y:0,z:0});
  assert.ok(Math.abs(normal.x)<1e-8 && Math.abs(normal.y-1)<1e-8);
  assert.deepEqual(cap.def,history);
  assert.equal(cap.grounded,true);
  const first=structuredClone(cap.transform);
  updateAssemblyContexts(assembly);assert.deepEqual(cap.transform,first);
});

test('missing parent and circular context are reported, with no fabricated placement',()=>{
  const assembly=fixture(),cap=assembly.components[1];
  cap.inContext.parentId='missing';
  assert.equal(updateAssemblyContexts(assembly).issues[0].message,'Missing context component');
  assert.deepEqual(cap.transform,{});
  cap.inContext.parentId='cap';
  assert.ok(updateAssemblyContexts(assembly).issues.length);
  assert.ok(cap.contextIssue);
});
