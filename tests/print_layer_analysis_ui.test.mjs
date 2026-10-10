import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {analyzePrintLayers,printLayerSvg,printLayerSourceStamp} from '../js/core/print_layer_analysis.js';
import {prepareNativePrintPositions} from '../js/core/print_setup.js';
import {printMeshFromPositions} from '../js/cad_3mf.js';
import {stlMeshOptions} from '../js/cad_stl.js';
import {proTools} from '../js/pro_catalog.js';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function openPrintLayerAnalysis()'),source.indexOf('async function openPrintSetupForm()'));
test('visible pro ribbon and global tool search expose the actual layer-analysis dispatcher',()=>{
  const tools=proTools('model').filter(tool=>tool.bind==='mcmd:layeranalysis');
  assert.equal(tools.length,1);assert.equal(tools[0].label,'Layer analysis');
  assert.match(source,/id === "layeranalysis"\) openPrintLayerAnalysis\(\)/);
});
function harness(onMesh){
  const positions=[
    [0,0,0],[1,0,0],[1,0,-2],[0,0,-2],[0,.2,0],[1,.2,0],[1,.2,-2],[0,.2,-2]
  ],triangles=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]],
  doc={name:'Actual native print test',features:[{id:'box',params:{width:1}}],sketches:[],printSetup:{basePlane:'top',bedWidthMm:100,bedDepthMm:100,bedHeightMm:100}},
  E={docType:'part',def:doc,brepRun:{ok:true,finalShape:{shape:true}}},downloads=[],messages=[],buttons=[],nodes=[];
  let spec,inputs,validated=0;
  const context={E,analyzePrintLayers,printLayerSvg,printLayerSourceStamp,prepareNativePrintPositions,printMeshFromPositions,stlMeshOptions,setTimeout,cloneData:structuredClone,
    exactRunIsCurrent:()=>true,validateBrepForExport:async()=>{validated++;},
    shapeToMeshData:async()=>{await onMesh?.(E);return {positions:triangles.flatMap(t=>t.flatMap(i=>positions[i]))};},
    el:()=>{const node={textContent:'',innerHTML:'',appendChild:()=>{},querySelector:()=>({style:{}})};nodes.push(node);return node;},
    flash:(text)=>messages.push(text),downloadBytes:(bytes,name,type)=>downloads.push({bytes,name,type}),btn:(name,click)=>{buttons.push({name,click});return {};},
    root:{querySelector:()=>({before:()=>{}})},openQuickForm:value=>{spec=value;E.quickAction=value.action;inputs={layerHeightMm:{value:.2},layer:{value:1}};return inputs;}
  };
  vm.runInNewContext(handler+'; globalThis.open = openPrintLayerAnalysis;',context);
  return {E,doc,downloads,messages,buttons,nodes,open:context.open,get spec(){return spec;},get inputs(){return inputs;},get validated(){return validated;}};
}
test('actual UI handler uses oriented native closed mesh and exports genuine contours without CAD writes',async()=>{
  const h=harness(),before=JSON.stringify(h.doc);await h.open();assert.equal(h.validated,1);assert.equal(h.spec.presentationOnly,true);
  await h.spec.onApply({layerHeightMm:.5,layer:2});h.inputs.layerHeightMm.value=.5;
  h.buttons.find(b=>b.name==='Export layer analysis JSON').click();
  const result=JSON.parse(h.downloads[0].bytes);assert.equal(result.layerCount,4);assert.equal(result.layers[0].areaMm2,200);assert.equal(result.printSetup.basePlane,'top');
  assert.equal(result.sourceName,h.doc.name);assert.match(result.qualification,/No perimeters, infill, supports/);
  h.buttons.find(b=>b.name==='Export selected layer SVG').click();assert.match(h.downloads[1].bytes,/Geometric print layer 2/);
  assert.equal(JSON.stringify(h.doc),before);assert.equal(h.E.quickAction,'layeranalysis','analysis keeps preview open');
});
test('changed source or layer height cannot publish a stale analysis',async()=>{
  const h=harness();await h.open();await h.spec.onApply({layerHeightMm:.2,layer:1});
  h.inputs.layerHeightMm.value=.3;h.buttons.find(b=>b.name==='Export layer analysis JSON').click();assert.equal(h.downloads.length,0);assert.match(h.messages.at(-1),/Apply/);
  h.inputs.layerHeightMm.value=.2;h.doc.features[0].params.width=2;h.buttons.find(b=>b.name==='Export layer analysis JSON').click();assert.equal(h.downloads.length,0);assert.match(h.messages.at(-1),/changed/);
});
test('document switch during native preparation never opens a stale layer dialog',async()=>{
  const h=harness(E=>{E.def={name:'Other part'};});await h.open();assert.equal(h.spec,undefined);assert.equal(h.downloads.length,0);assert.match(h.messages[0],/changed/);
});
test('saved orientation is required and cancelling the form prevents export',async()=>{
  const missing=harness();delete missing.doc.printSetup;await missing.open();assert.equal(missing.validated,0);assert.match(missing.messages[0],/Save Print setup/);
  const h=harness();await h.open();await h.spec.onApply({layerHeightMm:.2,layer:1});h.E.quickAction=null;
  h.buttons.find(b=>b.name==='Export layer analysis JSON').click();assert.equal(h.downloads.length,0);assert.match(h.messages.at(-1),/dialog changed/);
});
