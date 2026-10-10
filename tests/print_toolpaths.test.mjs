import test from 'node:test';
import assert from 'node:assert/strict';
import {toolpathsFromLayers,slicePrintMeshes,validateFffSettings} from '../js/core/print_toolpaths.js';
import {printGrid,rasterContours,maskLoops,erodeMask} from '../js/core/print_raster.js';
import {toolpathsGcode,toolpathSvg} from '../js/core/print_toolpath_export.js';

const rect=(x0,y0,x1,y1)=>({points:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],hole:false});
const ring=(r,hole=false)=>({points:Array.from({length:64},(_,i)=>[r*Math.cos(i*Math.PI/32),r*Math.sin(i*Math.PI/32)]),hole});
function layers(shapes,height=.2) {
  return {sourceMeshFingerprint:'test-source',bounds:{min:[-12,-12,0],max:[12,12,shapes.length*height]},layers:shapes.map((contours,i)=>({number:i+1,bottomZMm:i*height,topZMm:(i+1)*height,objects:[{name:'Fixture',occurrenceId:'A',contours}]}))};
}
function count(slice,kind){return slice.layers.reduce((n,l)=>n+l.paths.filter(p=>p.kind===kind).length,0);}
test('conservative raster handles concave slots, holes and diagonal contacts with closed non-crossing retained loops',()=>{
  const g=printGrid({min:[-10,-10],max:[10,10]},.1,1);
  const contour={points:[[-8,-8],[8,-8],[8,8],[2,8],[2,1],[-2,1],[-2,8],[-8,8]]};
  const mask=rasterContours([contour,{...rect(-5,-5,-3,-3),hole:true}],g),loops=maskLoops(erodeMask(mask,g,.2),g);
  assert.ok(loops.length>=2);
  for(const loop of loops)for(const [x,y] of loop) {
    assert.ok(x>-8&&x<8&&y>-8&&y<8);assert.ok(!(x>-2&&x<2&&y>1));assert.ok(!(x>-5&&x<-3&&y>-5&&y<-3));
  }
  const diagonal=printGrid({min:[0,0],max:[2,2]},.5);const bits=new Uint8Array(diagonal.size);bits[0]=1;bits[diagonal.nx+1]=1;
  assert.equal(maskLoops(bits,diagonal).length,2);
});
test('true wall and rectilinear skin/infill paths avoid a real circular hole and change when only density changes',async()=>{
  const source=layers(Array.from({length:10},()=>[ring(10),ring(3,true)])),before=JSON.stringify(source);
  const low=await toolpathsFromLayers(source,{gridMm:.1,infillPercent:15,skinLayers:1}),high=await toolpathsFromLayers(source,{gridMm:.1,infillPercent:20,skinLayers:1});
  assert.ok(count(low,'wall')>0&&count(low,'skin')>0&&count(low,'infill')>0);
  assert.ok(high.estimates.depositionVolumeMm3>low.estimates.depositionVolumeMm3);
  for(const l of low.layers)for(const p of l.paths)for(let i=1;i<p.points.length;i++)for(const t of [0,.25,.5,.75,1]) {
    const a=p.points[i-1],b=p.points[i],r=Math.hypot(a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]));assert.ok(r>3&&r<10);
  }
  const hollow=await toolpathsFromLayers(source,{infillPercent:0,skinLayers:0});assert.equal(count(hollow,'infill'),0);assert.ok(count(hollow,'wall')>0);
  assert.equal(JSON.stringify(source),before);assert.equal(JSON.stringify(low),JSON.stringify(await toolpathsFromLayers(JSON.parse(before),{gridMm:.1,infillPercent:15,skinLayers:1})));
});
test('internal downward counterbore shoulder generates real supports; support mode excludes model-supported columns from bed-only mode',async()=>{
  const counterbore=layers(Array.from({length:10},(_,i)=>[ring(10),ring(i<5?6:3,true)]));
  const support=await toolpathsFromLayers(counterbore,{support:'buildplate',skinLayers:0});
  assert.ok(count(support,'support')>0);assert.ok(support.estimates.supportVolumeMm3>0);
  for(const l of support.layers.filter(l=>l.sourceLayer<=5))for(const p of l.paths.filter(p=>p.kind==='support'))for(const q of p.points)assert.ok(Math.hypot(q[0],q[1])<6);
  const platform=layers([[rect(-10,-10,10,10)],[rect(-10,-10,-6,10)],[rect(-10,-10,-6,10)],[rect(-10,-10,10,10)],[rect(-10,-10,10,10)]]);
  const every=await toolpathsFromLayers(platform,{support:'everywhere',supportGapMm:0}),bed=await toolpathsFromLayers(platform,{support:'buildplate',supportGapMm:0});
  assert.ok(count(every,'support')>0);assert.equal(count(bed,'support'),0);
});
test('adhesion is real geometry, raft raises deposition, and generated footprints enforce bed bounds',async()=>{
  const source=layers(Array.from({length:3},()=>[rect(-5,-5,5,5)]));
  const skirt=await toolpathsFromLayers(source,{adhesion:'skirt'}),brim=await toolpathsFromLayers(source,{adhesion:'brim'}),raft=await toolpathsFromLayers(source,{adhesion:'raft'});
  assert.ok(count(skirt,'skirt')>0);assert.ok(count(brim,'brim')>count(skirt,'skirt'));assert.ok(count(raft,'raft')>0);
  const firstBrim=brim.layers[0].paths.find(p=>p.kind==='brim');assert.ok(firstBrim.points.some(p=>Math.abs(p[0])===5));
  assert.equal(raft.layerCount,5);assert.ok(raft.layers[2].zMm>source.layers[0].topZMm);
  await assert.rejects(toolpathsFromLayers(source,{adhesion:'skirt'},{printSetup:{bedWidthMm:12,bedDepthMm:12,bedHeightMm:5}}),/exceed/);
});
test('explicit-profile G-code replays path extrusion and speed, exports selected layer and rejects unsupported/budget/stale input',async()=>{
  const source=layers(Array.from({length:3},()=>[rect(-5,-5,5,5)])),slice=await toolpathsFromLayers(source);
  const gcode=toolpathsGcode(slice,{bedWidthMm:100,bedDepthMm:100});assert.match(gcode,/G21\nG90\nM82/);assert.match(gcode,/G0.*F6000/);assert.match(gcode,/G1.*F2400/);
  const lines=gcode.split('\n').filter(l=>l.startsWith('G1 ')),last=Number(lines.at(-1).match(/ E([\d.]+)/)[1]);
  assert.ok(Math.abs(last-slice.estimates.filamentLengthMm)<.00001);
  for(const line of lines){assert.ok(Number(line.match(/X([\d.]+)/)[1])>=0);assert.ok(Number(line.match(/Y([\d.]+)/)[1])>=0);}
  assert.match(toolpathSvg(slice,2),/Actual FFF deposition layer 2/);
  assert.throws(()=>toolpathsGcode(slice,{id:'unknown',bedWidthMm:100,bedDepthMm:100}),/supported/);
  assert.throws(()=>validateFffSettings({support:'tree'}),/Unsupported/);
  await assert.rejects(toolpathsFromLayers(source,{}, {maxCells:1}),/budget/);
  await assert.rejects(toolpathsFromLayers(source,{}, {assertCurrent(){throw new Error('stale source');}}),/stale/);
  await assert.rejects(slicePrintMeshes([{vertices:[],triangles:[]}]),/closed/);
});
test('an unresolved sub-grid slot is rejected rather than silently bridged by extrusion',async()=>{
  const source=layers([[rect(-5,-5,5,5),{...rect(.03,-4,.04,4),hole:true}]]);
  await assert.rejects(toolpathsFromLayers(source),/sub-grid boundary/);
});
test('bed fit includes bead half-width, validates dimensions, and independently guards G-code envelope',async()=>{
  const source=layers([[rect(-5,-5,5,5)]]),settings={gridMm:.125,adhesion:'brim',adhesionWidthMm:0};
  await assert.rejects(toolpathsFromLayers(source,settings,{printSetup:{bedWidthMm:10,bedDepthMm:10,bedHeightMm:5}}),/exceed/);
  const slice=await toolpathsFromLayers(source,settings);
  assert.ok(slice.bounds.min[0]<=-5.2&&slice.bounds.max[0]>=5.2);assert.equal(slice.bounds.min[2],0);
  assert.throws(()=>toolpathsGcode(slice,{bedWidthMm:10,bedDepthMm:10}),/bead envelope/);
  await assert.rejects(toolpathsFromLayers(source,{}, {printSetup:{bedWidthMm:NaN,bedDepthMm:10,bedHeightMm:5}}),/finite and positive/);
});
