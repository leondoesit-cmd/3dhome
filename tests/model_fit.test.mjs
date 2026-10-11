import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const bounds={x0:7,x1:11,y0:2,y1:8.62,z0:-2.8,z1:2.8};
function fixture({fixedFrame=null,sketchBox=null}={}){
  const target={set(x,y,z){Object.assign(this,{x,y,z});}};
  const view={fixedFrame,target,frame(distance,box){this.distance=distance;this.fitBounds=box;target.set(0,0,0);},
    render(){this.renderedCenter=fixedFrame?
      {x:target.x+fixedFrame.origin.x,y:target.y+fixedFrame.origin.y,z:target.z+fixedFrame.origin.z}:
      {x:target.x,y:target.y+(bounds.y0+bounds.y1)/2,z:target.z};}};
  const E={pv:view,def:{},docType:'part'};
  const fit=new Function('E','activeSketchWorldBounds','renderedParts','defBounds',
    sourceFunctionText(source,'fitPreview')+';return fitPreview;')(E,()=>sketchBox,()=>[{}],()=>bounds);
  return {view,fit};
}

test('part Zoom to fit recenters an offset-origin native solid in orbit without doubling its Y center',()=>{
  const f=fixture();
  f.fit();
  assert.deepEqual(f.view.renderedCenter,{x:9,y:5.31,z:0});
  assert.equal(f.view.target.y,0);
  assert.deepEqual(f.view.fitBounds,bounds,'part fit supplies measured bounds for viewport-aware framing');
  assert.ok(Math.abs(f.view.distance-Math.hypot(4,6.62,5.6)*1.5)<1e-12);
  f.view.target.set(-40,15,80);f.fit();
  assert.deepEqual(f.view.renderedCenter,{x:9,y:5.31,z:0},'a repeated Fit removes stale pan');
});

test('part Fit frames a sketch beyond the solid while preserving the orbit model baseline',()=>{
  const f=fixture({sketchBox:{x0:8,x1:12,y0:10,y1:12,z0:1,z1:1}});
  f.fit();
  assert.deepEqual(f.view.renderedCenter,{x:9.5,y:7,z:0});
  assert.ok(Math.abs(f.view.target.y-1.69)<1e-12);
});

test('part Fit in a fixed sketch frame centers relative to its origin',()=>{
  const f=fixture({fixedFrame:{origin:{x:4,y:3,z:2}}});
  f.fit();
  assert.deepEqual(f.view.renderedCenter,{x:9,y:5.31,z:0});
  assert.equal(f.view.target.x,5);assert.equal(f.view.target.z,-2);
  assert.ok(Math.abs(f.view.target.y-2.31)<1e-12);
});
