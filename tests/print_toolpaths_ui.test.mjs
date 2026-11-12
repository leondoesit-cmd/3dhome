import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {slicePrintMeshes,validateFffSettings,FFF_DEFAULTS} from '../js/core/print_toolpaths.js';
import {toolpathSvg,toolpathsGcode} from '../js/core/print_toolpath_export.js';
import {printLayerSourceStamp} from '../js/core/print_layer_analysis.js';
import {prepareNativePrintPositions} from '../js/core/print_setup.js';
import {printMeshFromPositions} from '../js/cad_3mf.js';
import {stlMeshOptions} from '../js/cad_stl.js';
import {proTools} from '../js/pro_catalog.js';
const source=modelerSource();
const handler=source.slice(source.indexOf('async function openFffSlicePreview()'),source.indexOf('async function openPrintSetupForm()'));
function harness(change){
  const vertices=[[-.5,0,.5],[.5,0,.5],[.5,0,-.5],[-.5,0,-.5],[-.5,.1,.5],[.5,.1,.5],[.5,.1,-.5],[-.5,.1,-.5]],triangles=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const doc={name:'Native slice fixture',features:[{id:'boss',params:{height:.1}}],sketches:[],printSetup:{basePlane:'top',bedWidthMm:30,bedDepthMm:30,bedHeightMm:30}},E={docType:'part',def:doc,brepRun:{ok:true,finalShape:{}}},buttons=[],downloads=[],messages=[],undo=[];
  let spec,inputs;
  const context={E,slicePrintMeshes,validateFffSettings,FFF_DEFAULTS,toolpathSvg,toolpathsGcode,printLayerSourceStamp,prepareNativePrintPositions,printMeshFromPositions,stlMeshOptions,setTimeout,cloneData:structuredClone,
    exactRunIsCurrent:()=>true,validateBrepForExport:async()=>{},shapeToMeshData:async()=>{change?.(E);return {positions:triangles.flatMap(t=>t.flatMap(i=>vertices[i]))};},
    el:()=>({textContent:'',innerHTML:'',appendChild(){},querySelector:()=>({style:{}})}),btn:(name,click)=>{buttons.push({name,click});return {};},root:{querySelector:()=>({before(){}})},flash:m=>messages.push(m),pushUndo:m=>undo.push(m),downloadBytes:(bytes,name,type)=>downloads.push({bytes,name,type}),
    openQuickForm:s=>{spec=s;E.quickAction=s.action;inputs=Object.fromEntries(s.fields.map(f=>[f.key,{value:f.value}]));return inputs;}};
  vm.runInNewContext(handler+'; globalThis.open = openFffSlicePreview;',context);
  return {E,doc,buttons,downloads,messages,undo,open:context.open,get spec(){return spec;},get inputs(){return inputs;},values(){return Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value]));}};
}
test('FFF slice command is visible independently of unchanged geometric layer analysis',()=>{
  assert.equal(proTools('model').filter(t=>t.bind==='mcmd:fffslice').length,1);
  assert.match(source,/id === "fffslice"\) openFffSlicePreview\(\)/);
  assert.match(source,/commandButton\("fffslice", "FFF slice preview"\)/);
});
test('actual native-mesh UI generates paths, persists only study settings and exports actual JSON/SVG/G-code',async()=>{
  const h=harness(),before=JSON.stringify(h.doc.features);await h.open();assert.equal(h.spec.presentationOnly,true);
  await h.spec.onApply(h.values());assert.equal(h.undo.length,1);assert.equal(JSON.stringify(h.doc.features),before);assert.equal(h.doc.fffSliceSettings.infillPercent,15);
  for(const b of h.buttons)b.click();assert.equal(h.downloads.length,3);
  const slice=JSON.parse(h.downloads[0].bytes);assert.equal(slice.layerCount,5);assert.ok(slice.layers[0].paths.some(p=>p.kind==='wall'));assert.equal(slice.gcodeProfile,'illustrative-generic-absolute-e');
  assert.match(h.downloads[1].bytes,/Actual FFF deposition/);assert.match(h.downloads[2].bytes,/M82/);
  h.inputs.infillPercent.value=20;h.buttons[0].click();assert.equal(h.downloads.length,3);assert.match(h.messages.at(-1),/Apply/);
  await h.spec.onApply(h.values());h.buttons[0].click();assert.equal(JSON.parse(h.downloads.at(-1).bytes).settings.infillPercent,20);
  h.doc.features[0].params.height=.2;h.buttons[0].click();assert.match(h.messages.at(-1),/changed/);
});
test('stale native preparation and cancelled dialog cannot publish a slice',async()=>{
  const switched=harness(E=>{E.def={name:'Other'};});await switched.open();assert.equal(switched.spec,undefined);assert.match(switched.messages.at(-1),/changed/);
  const h=harness();await h.open();await h.spec.onApply(h.values());h.E.quickAction=null;h.buttons[0].click();assert.equal(h.downloads.length,0);assert.match(h.messages.at(-1),/changed/);
});
