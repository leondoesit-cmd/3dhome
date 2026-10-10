import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {brimPathsFromDeposition,printGrid} from '../js/core/print_raster.js';
import {toolpathsFromLayers} from '../js/core/print_toolpaths.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/flat_actual_brim_contact.json',import.meta.url)));
function pointDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function distance(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0?0:Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));}
function touches(p,q){const radius=(p.widthMm+q.widthMm)/2+1e-8;for(let i=1;i<p.points.length;i++)for(let j=1;j<q.points.length;j++)if(distance(p.points[i-1],p.points[i],q.points[j-1],q.points[j])<=radius)return true;return false;}
function attachedNetwork(brim,material){const reached=new Set();for(let i=0;i<brim.length;i++)if(material.some(p=>touches(brim[i],p)))reached.add(i);let progress=true;while(progress){progress=false;for(let i=0;i<brim.length;i++)if(!reached.has(i)&&[...reached].some(j=>touches(brim[i],brim[j]))){reached.add(i);progress=true;}}return reached.size;}
const paths=(points,widthMm=.4)=>({points,widthMm});

test('actual FLAT diagnostic exposes detached exterior despite attached inner brim; replacement attaches every network',()=>{
  const before=JSON.stringify(fixture),material=fixture.materialPaths,old=fixture.originalBrimPaths;
  assert.ok(old,'actual diagnostic paths retained');
  const outer=old.find(p=>p.points.some(q=>q[0]<-50));
  assert.equal(material.some(p=>touches(outer,p)),false);
  assert.ok(old.some(p=>material.some(m=>touches(p,m))),'inner contact must not conceal exterior detachment');
  const brim=brimPathsFromDeposition(material,fixture.grid,3.5).map(p=>paths([...p,p[0]]));
  assert.ok(brim.length>0);
  assert.equal(attachedNetwork(brim,material),brim.length);
  for(const p of brim){assert.ok(Math.min(...p.points.map(q=>q[0]))<-50);assert.ok(Math.max(...p.points.map(q=>q[0]))>50);}
  for(const p of brim)assert.deepEqual(p.points[0],p.points.at(-1));
  assert.equal(JSON.stringify(fixture),before,'read-only actual paths and settings preserved');
});

test('separate islands, diagonal beads and enclosed gaps retain attached exterior networks',()=>{
  const material=[paths([[-6,-3],[-2,-3],[-2,3],[-6,3],[-6,-3]]),paths([[2,-3],[6,3]]),paths([[3,-2],[4,-2],[4,-1],[3,-1],[3,-2]])];
  const grid=printGrid({min:[-10,-7],max:[10,7]},.2),before=JSON.stringify(material);
  for(const width of [0,.6,1.2]){const brim=brimPathsFromDeposition(material,grid,width).map(p=>paths([...p,p[0]]));assert.ok(brim.length>1);assert.equal(attachedNetwork(brim,material),brim.length);}
  assert.equal(JSON.stringify(material),before);
  for(const width of [-1,NaN,Infinity,11])assert.throws(()=>brimPathsFromDeposition(material,grid,width),/width/);
});

test('Brim integration preserves same-grid model and support deposition and input source',async()=>{
  const contour={points:[[-5,-5],[5,-5],[5,5],[-5,5]]},source={sourceMeshFingerprint:'attachment-fixture',bounds:{min:[-5,-5,0],max:[5,5,.6]},layers:Array.from({length:3},(_,i)=>({number:i+1,bottomZMm:i*.2,topZMm:(i+1)*.2,objects:[{occurrenceId:'a',contours:[contour]}]}))};
  const before=JSON.stringify(source),skirt=await toolpathsFromLayers(source,{adhesion:'skirt'}),brim=await toolpathsFromLayers(source,{adhesion:'brim'});
  const model=s=>s.layers.map(l=>l.paths.filter(p=>['wall','skin','infill','support'].includes(p.kind)));
  assert.deepEqual(model(brim),model(skirt));assert.equal(JSON.stringify(source),before);
  const first=brim.layers[0];assert.equal(attachedNetwork(first.paths.filter(p=>p.kind==='brim'),model(brim)[0]),first.paths.filter(p=>p.kind==='brim').length);
});
