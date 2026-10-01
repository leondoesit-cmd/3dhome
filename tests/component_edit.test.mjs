import test from "node:test";
import assert from "node:assert/strict";
import { componentEditCopy, commitComponentEdit } from "../js/core/component_edit.js";
import { createHistory } from "../js/edit_history.js";

test("component material and properties commit atomically and Undo restores source and placement", () => {
  let assembly={components:[{id:1,name:"Bar",modelKey:"saved-bar",transform:{x:3,y:2,z:1,ry:165},def:{name:"Bar",material:{name:"1060",density:2.7},metadata:{customProperties:{PartNumber:"B-1"}},features:[{id:"boss",params:{depth:7}}]}}]};
  const before=JSON.stringify(assembly), working=componentEditCopy(assembly.components[0]);
  working.material.name="2014";
  working.metadata.customProperties.Description="LINKS long bar";
  working.features[0].params.depth=9;
  working.metadata.contextEditor={componentId:1};
  assert.equal(JSON.stringify(assembly),before,"live component stays unchanged during authoring and draft saves");
  const history=createHistory({get:()=>JSON.stringify(assembly),set:s=>assembly=JSON.parse(s)}).seed();
  history.push("Edit component");
  commitComponentEdit(assembly.components[0],working);
  assert.equal(assembly.components[0].def.material.name,"2014");
  assert.equal(assembly.components[0].def.metadata.contextEditor,undefined);
  assert.deepEqual(assembly.components[0].transform,{x:3,y:2,z:1,ry:165});
  assert.equal(assembly.components[0].inContext,undefined,"ordinary editing must not create an associative parent");
  working.material.name="later uncommitted change";
  assert.equal(assembly.components[0].def.material.name,"2014");
  history.undo();assert.equal(JSON.stringify(assembly),before);
  history.redo();assert.equal(assembly.components[0].def.features[0].params.depth,9);
});

test("canceling an in-context working copy preserves the original parent reference and definition", () => {
  const component={id:2,inContext:{parentId:1,reference:{persistentId:"end"}},def:{name:"Cap",parts:[],metadata:{}}};
  const before=JSON.stringify(component), working=componentEditCopy(component);
  working.name="discard";working.parts.push({id:100});
  assert.equal(JSON.stringify(component),before);
  assert.throws(()=>componentEditCopy({asm:{}}),/part component/);
});
