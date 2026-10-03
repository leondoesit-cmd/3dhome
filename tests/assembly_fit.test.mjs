import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');

for(const fixedFrame of [null,{origin:{x:10,y:20,z:30}}])test('assembly Fit centers asymmetric exploded bounds'+(fixedFrame?' in a fixed frame':''),()=>{
  const box={x0:-5.5,x1:15.5,y0:-8,y1:39,z0:-20,z1:24};
  const view={fixedFrame,target:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},frame(distance){this.distance=distance;this.target.set(0,0,0);},render(){this.rendered=true;}};
  const E={pv:view,def:{},docType:'assembly'};
  const fit=new Function('E','assemblyBounds',sourceFunctionText(source,'fitPreview')+';return fitPreview;')(E,()=>box);
  fit();
  const origin=fixedFrame?.origin || {x:0,y:0,z:0};
  assert.deepEqual({x:view.target.x+origin.x,y:view.target.y+origin.y,z:view.target.z+origin.z},{x:5,y:15.5,z:2});
  assert.equal(view.distance,Math.hypot(21,47,44)*1.5);
  assert.equal(view.rendered,true);
});

test('empty assembly Fit retains its fallback view without invented bounds',()=>{
  const view={target:{set(){throw new Error('empty bounds must not choose a center');}},frame(distance){this.distance=distance;},render(){}};
  new Function('E','assemblyBounds',sourceFunctionText(source,'fitPreview')+';fitPreview();')({pv:view,def:{},docType:'assembly'},()=>null);
  assert.equal(view.distance,270);
});
