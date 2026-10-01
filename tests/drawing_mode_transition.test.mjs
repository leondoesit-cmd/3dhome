import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("drawing viewport relocation suppresses rendering before mode controls update",()=>{
  const source=readFileSync(new URL("../js/editor_view.js",import.meta.url),"utf8");
  const start=source.indexOf("export function createViewportSwap(o) {");
  assert.ok(start>=0);
  const host={insertBefore(){},appendChild(){}};
  const wrap={parentElement:host,nextSibling:null};
  let resized=0,renders=0,big=null;
  const context={};vm.createContext(context);
  vm.runInContext(source.slice(start).replace("export function", "function"),context);
  const swap=context.createViewportSwap({wrap,panelHost:host,bigHost:host});
  const view={invalidateSize(){resized++;},setBig(value,render){big=value;if(render!==false){renders++;throw new RangeError("Shader build cycle");}}};
  assert.doesNotThrow(()=>swap(false,view,{render:false}));
  assert.equal(resized,1);assert.equal(big,false);assert.equal(renders,0);
  assert.throws(()=>swap(true,view),/Shader build cycle/);
  assert.equal(big,true);assert.equal(renders,1);
  const modeler=readFileSync(new URL("../js/modeler.js",import.meta.url),"utf8");
  assert.match(modeler,/swapView\(m === "3d" \|\| split, E\.pv, \{ render: m !== "drawing" \}\)/);
});

test("drawing host layout cannot compile a hidden preview shader during mode transition",()=>{
  const source=readFileSync(new URL("../js/modeler.js",import.meta.url),"utf8");
  const start=source.indexOf("function layout3DHost() {");
  const end=source.indexOf("/* Frame whatever is modelled",start);
  assert.ok(start>=0&&end>start);
  let resized=0,renders=0;
  const E={mode:"drawing",pv:{invalidateSize(){resized++;},render(){renders++;throw new RangeError("Shader build cycle");}}};
  const context={E};vm.createContext(context);
  vm.runInContext(source.slice(start,end),context);
  assert.doesNotThrow(()=>vm.runInContext("layout3DHost()",context));
  assert.equal(resized,1);assert.equal(renders,0);
  E.mode="3d";
  assert.throws(()=>vm.runInContext("layout3DHost()",context),/Shader build cycle/);
  assert.equal(renders,1,"visible model rendering is still requested");
  E.pv=null;
  assert.doesNotThrow(()=>vm.runInContext("layout3DHost()",context));
});
