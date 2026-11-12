import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=modelerSource();
const start=source.indexOf('  var sketchAction = root && root.querySelector("#mdSketchOnFace");');
const end=source.indexOf('  // the rebuild banner',start);
assert.ok(start>=0&&end>start);
const sync=new Function('E','root','selectedSketchableFace',source.slice(start,end));
test('native face-sketch action hides while editing a projected sketch and returns for idle selected face',()=>{
  const button={hidden:false},root={querySelector:()=>button},E={docType:'part',mode:'3d',modelPlaneActive:true,facePick:false};
  let queried=0;const selected=()=>{queried++;return {id:'face'};};
  sync(E,root,selected);assert.equal(button.hidden,true);assert.equal(queried,0);
  E.modelPlaneActive=false;sync(E,root,selected);assert.equal(button.hidden,false);
  E.facePick=true;sync(E,root,selected);assert.equal(button.hidden,true);
  E.facePick=false;sync(E,root,()=>null);assert.equal(button.hidden,true);
  E.mode='drawing';sync(E,root,selected);assert.equal(button.hidden,true);
  E.mode='sketch';sync(E,root,selected);assert.equal(button.hidden,true);
});
