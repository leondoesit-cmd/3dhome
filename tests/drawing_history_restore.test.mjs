import { stylesSource } from "./helpers/styles_source.mjs";
import { modelerSource } from "./helpers/modeler_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHistory } from '../js/edit_history.js';
import { createHistorySnapshotCodec } from '../js/core/history_value_pool.js';
import { createDrawingController } from '../js/modeler_drawing.js';
import { createSheetDoc } from '../js/cad_sheet.js';
import { tessellateParts } from '../js/core/part_tessellate.js';

test('Drawing mode keeps enabled Undo/Redo controls clickable',()=>{
  const css=stylesSource();
  const selector=css.match(/#modeler\.md-isdrawing \.md-head-actions button([^\{]+)\{\s*pointer-events:\s*none/)[1];
  assert.match(selector,/:not\(#mdUndo\)/,'Undo must be exempt from Drawing header pointer suppression');
  assert.match(selector,/:not\(#mdRedo\)/,'Redo must be exempt from Drawing header pointer suppression');
});

test('actual model-history Undo/Redo rebuilds the cached drawing without entering Model mode',()=>{
  const source=modelerSource();
  const start=source.indexOf('const H = createHistory({');
  const end=source.indexOf('/* ---- what is inside a document',start);
  const E={mode:'drawing',docType:'part',sheetToken:0,assembly:null,
    def:{name:'CYLINDER driving depth acceptance',parts:[{kind:'box',x0:0,x1:1,y0:0,y1:1,z0:0,z1:2}],
      drawing:createSheetDoc({views:['right','iso'],scale:[1,1]})}};
  E.def.drawing.views[1].displayStyle='shaded';
  const controller=createDrawingController({
    doc:()=>E.def.drawing,model:()=>E.def,bodies:()=>tessellateParts(E.def.parts),
    bodiesToken:()=>E.sheetToken,width:()=>1000,height:()=>800,meta:()=>({}),
  });
  E.sheet=controller;
  let paints=0,panels=0,projected='';
  const context={E,createHistory,historySnapshots:createHistorySnapshotCodec(["meshData","exactTopologyCache"]),snapDoc:()=>JSON.stringify({d:E.def,a:E.assembly}),
    scanDoc:()=>[],docSubtree:()=>[],syncUndoButtons(){},syncHead(){},invalidateInterference(){},resolveSketch(){},closeEvalCard(){},
    refreshAll(){paints++;projected=controller.svg();},syncSheetPanel(){panels++;}};
  vm.createContext(context);
  const invalidationStart=source.indexOf('function invalidateDrawing() {');
  vm.runInContext(source.slice(invalidationStart,source.indexOf('function pathEllipse',invalidationStart)),context);
  vm.runInContext(source.slice(start,end)+'\nthis.history=H;',context);
  const original=controller.svg();
  context.history.push('Edit Extrude');
  E.def.parts[0].z1=2.1;
  vm.runInContext('invalidateDrawing()',context);
  const edited=controller.svg();
  assert.notEqual(edited,original,'the driving edit updates the orthographic and shaded drawing');
  context.history.undo();
  assert.equal(E.def.parts[0].z1,2);
  assert.equal(projected,original,'Undo reprojects restored geometry while the drawing remains visible');
  context.history.redo();
  assert.equal(projected,edited,'Redo reprojects changed geometry with the same drawing controller');
  assert.equal(paints,2);
  assert.equal(panels,2,'the Drawing inspector refreshes stale association diagnostics on both history restores');
  assert.equal(E.mode,'drawing');
});

test('actual history Undo/Redo hides stale exact mass before replacing the document',()=>{
  const source=modelerSource();
  const start=source.indexOf('const H = createHistory({');
  const end=source.indexOf('/* ---- what is inside a document',start);
  const card={hidden:false};
  const E={mode:'model',docType:'part',evalCard:'mass',def:{depth:8},assembly:null};
  const context={E,root:{querySelector:()=>card},createHistory,historySnapshots:createHistorySnapshotCodec(["meshData","exactTopologyCache"]),
    snapDoc:()=>JSON.stringify({d:E.def,a:E.assembly}),scanDoc:()=>[],docSubtree:()=>[],
    syncUndoButtons(){},syncHead(){},invalidateDrawing(){},invalidateInterference(){},resolveSketch(){},
    endMeasure(){throw Error('mass restore must not stop a measurement');},
    cancelInterferenceCheck(){throw Error('mass restore must not cancel interference');},
    refreshAll(){assert.equal(card.hidden,true);assert.equal(E.evalCard,null);},syncSheetPanel(){}};
  vm.createContext(context);
  const closeStart=source.indexOf('function closeEvalCard() {');
  vm.runInContext(source.slice(closeStart,source.indexOf('function evalRow(',closeStart)),context);
  vm.runInContext(source.slice(start,end)+'\nthis.history=H;',context);
  context.history.push('Edit stock depth');
  E.def.depth=8.5;
  context.history.undo();
  assert.equal(E.def.depth,8);
  card.hidden=false;E.evalCard='mass';
  context.history.redo();
  assert.equal(E.def.depth,8.5);
  assert.equal(card.hidden,true);
  assert.equal(E.evalCard,null);
});

test('a late exact mesh refreshes the visible drawing and inspector without a WebGL preview',()=>{
  const source=modelerSource();
  const part={id:'late-body',kind:'box',x0:0,x1:1,y0:0,y1:1,z0:0,z1:2,exactPending:true};
  const E={mode:'drawing',docType:'part',sheetToken:0,pv:null,
    def:{parts:[part],drawing:createSheetDoc({views:['right','iso'],scale:[1,1]})}};
  E.def.drawing.views[1].displayStyle='shaded';
  const controller=createDrawingController({
    doc:()=>E.def.drawing,model:()=>E.def,bodies:()=>tessellateParts(E.def.parts),
    bodiesToken:()=>E.sheetToken,width:()=>1000,height:()=>800,meta:()=>({}),
  });
  E.sheet=controller;
  const lightweight=controller.svg();
  let paints=0,panels=0,sizes=0,projected='';
  const context={E,retainExactPreview:()=>false,syncLiveDownstreamBadge(){},syncSizeReadout(){sizes++;},
    drawSketch(){paints++;projected=controller.svg();},syncSheetPanel(){panels++;}};
  vm.createContext(context);
  const invalidationStart=source.indexOf('function invalidateDrawing() {');
  vm.runInContext(source.slice(invalidationStart,source.indexOf('function pathEllipse',invalidationStart)),context);
  const refreshStart=source.indexOf('function refreshChangedPart(part) {');
  vm.runInContext(source.slice(refreshStart,source.indexOf('function patchEditedFeatureLayer()',refreshStart)),context);

  // Simulate authoritative worker publication after the sheet has already
  // cached its lightweight body. The recipe remains unchanged.
  part.meshData={positions:tessellateParts([{...part,z1:2.1}])[0].positions};
  part.exactPending=false;
  assert.equal(controller.svg(),lightweight,'the existing projection remains cached until publication refresh');
  context.refreshChangedPart(part);
  assert.notEqual(projected,lightweight,'the visible sheet consumes the newly published exact mesh');
  assert.equal(projected,controller.svg());
  assert.equal(E.sheetToken,1);
  assert.equal(paints,1);
  assert.equal(panels,1,'association diagnostics refresh with the exact drawing');
  assert.equal(sizes,1);
  assert.equal(E.mode,'drawing');

  E.mode='3d';
  context.refreshChangedPart(part);
  assert.equal(E.sheetToken,2,'hidden drawing projections are also invalidated');
  assert.equal(paints,1,'hidden drawing is not painted');
  assert.equal(panels,1);
});
