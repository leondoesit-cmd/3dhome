import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { boundsMayOverlap } from '../js/cad_kernel.js';
import { applyHandleDrag, patternHandlePose } from '../js/modeler_instant3d.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');

test('selected body decorations remain intact while another body is hovered',()=>{
  const a={part:{id:'a',featureId:'fa'},group:{children:[{}]},dirty:true};
  const b={part:{id:'b',featureId:'fb'},group:{children:[{}]},dirty:true};
  const E={pv:{render(){}},topologySelection:[{partId:'a',persistentId:'face-a'}]};
  let builds=0;
  const ctx={E,retainExactPreview:()=>false,decoGroups:[a,b],lastDecoratedHover:null,clearGroup(g){g.children=[];},addTopologyPickEdges(g){g.children.push({build:++builds});},addFaceHighlights(){},addTemporaryAxes(){}};
  runInNewContext(source.slice(source.indexOf('function isEntryAffectedByHover('),source.indexOf('/* Called after each frame:')),ctx);
  ctx.refreshDecorations(); const identity=a.group.children[0];
  for(let i=0;i<20;i++){E.hoverTopology={partId:'b',persistentId:'edge-'+i};ctx.refreshDecorations();}
  assert.equal(a.group.children[0],identity);
  E.topologySelection=[];ctx.refreshDecorations();assert.notEqual(a.group.children[0],identity);
  assert.equal(ctx.isEntryAffectedByHover(a,{persistentId:'unknown'}),false);
});
test('viewport color events recolor decorations without a model rebuild',()=>{
  const handlers={},groups=[{dirty:false}],E={edgeColor:'#000000'};let refreshes=0,saves=0;
  const input={value:'#000000',addEventListener(type,fn){handlers[type]=fn;}};
  const ctx={E,decoGroups:groups,el(tag){return tag==='input'?input:{appendChild(){}};},refreshDecorations(){refreshes++;},saveModelerPrefs(){saves++;}};
  runInNewContext(source.slice(source.indexOf('function appendViewportColor('),source.indexOf('function appendLightRange(')),ctx);
  ctx.appendViewportColor({appendChild(){}},'Edges','edgeColor');input.value='#ff0000';handlers.input();handlers.change();
  assert.equal(E.edgeColor,'#ff0000');assert.equal(groups[0].dirty,true);assert.equal(refreshes,1);assert.equal(saves,1);
});
test('overlap prefilter distinguishes spaced and overlapping cubes',()=>{
  const a={x0:0,x1:10,y0:0,y1:10,z0:0,z1:10};
  assert.equal(boundsMayOverlap(a,{...a,x0:6,x1:16}),true);
  assert.equal(boundsMayOverlap(a,{...a,x0:15,x1:25}),false);
});
test('draft dragging and circular pattern readout use angles',()=>{
  assert.equal(applyHandleDrag('draft',{angle:5},{x:3},{x:1}).angle,8);
  assert.equal(applyHandleDrag('draft',{angle:5},{x:1000},{x:1}).angle,89);
  assert.equal(patternHandlePose({}, {mode:'circular',angle:120,spacingX:20}).value,120);
});
test('typing during a handle drag owns the value and release removes its keyboard listener',()=>{
  const listeners=new Map(),document={activeElement:null};let edits=0;
  const chip={focus(){document.activeElement=chip;},dispatchEvent(){edits++;}};
  const ctx={E:{docType:'part',tool:'select'},document,Event:class {},window:{addEventListener(k,fn){listeners.set(k,fn);},removeEventListener(k){listeners.delete(k);}},
    hitInstant3d(){return {key:'depth',direction:{x:1}};},instant3dAuthoringState(){return {type:'extrude',params:{depth:10}};},instant3dValueChip(){return chip;},screenDeltaToWorld(){throw Error('drag must not overwrite typing');}};
  const start=source.indexOf('function beginInstant3dDrag('),end=source.indexOf('/* Direct assembly manipulation.',start);
  runInNewContext(source.slice(start,end),ctx);
  const view={rr:{domElement:{style:{}}}};
  assert.equal(ctx.beginInstant3dDrag({preventDefault(){},clientX:0,clientY:0},view),true);
  let stopped=false;
  listeners.get('keydown')({key:'5',preventDefault(){},stopImmediatePropagation(){stopped=true;}});
  assert.equal(stopped,true);assert.equal(chip.value,'5');assert.equal(edits,1);
  listeners.get('pointermove')({clientX:100,clientY:0});
  listeners.get('pointercancel')();assert.equal(listeners.size,0);
});
