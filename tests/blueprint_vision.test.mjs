import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{compileVisionBlueprint,blueprintDimensionScale}from'../js/core/blueprint_vision.js';
import{normalizeWall,wallThickness}from'../js/wall_types.js';
import{decodePNG}from'../tools/png.mjs';
import{recognizeRaster}from'../js/core/blueprint_raster.js';
const image={width:800,height:600,widthCm:1000};
const sample=()=>({walls:[[80,70,720,70,10],[720,70,720,530,10],[720,530,80,530,10],[80,530,80,70,10],[400,70,400,530,8]],
  doors:[[4,400,400,70,'R_OUT']],windows:[[0,220,70,100]],rooms:[{label:'חדר שינה',x:240,y:280},{label:'Living',x:550,y:280}],
  furniture:[{type:'bed',x:200,y:230,w:90,d:150,rot:0},{type:'sofa',x:620,y:350,w:150,d:60,rot:90}],
  dimensions:[{text:'6.40m',valueCm:640,x1:80,y1:550,x2:720,y2:550},{text:'460',valueCm:460,x1:740,y1:70,x2:740,y2:530}],warnings:[]});
test('crop gating and final geometry use the same consensus printed scale',()=>{
 const dims=sample().dimensions,one=blueprintDimensionScale(dims.slice(0,1));
 assert.equal(one.scale,1);assert.equal(one.strong,false);
 assert.equal(blueprintDimensionScale(Array(3).fill(dims[0])).strong,false);
 const consistent=[...dims,{text:'300 cm',valueCm:300,x1:100,y1:100,x2:400,y2:100}];
 assert.equal(blueprintDimensionScale(consistent).strong,true);
 assert.equal(blueprintDimensionScale(consistent,false).scale,null);
 assert.equal(compileVisionBlueprint({...sample(),dimensions:consistent},image).referenceCalibration.cmPerPx,blueprintDimensionScale(consistent).scale);
});

test('general image analysis preserves geometry, original labels, openings and observed furniture',()=>{
  const result=compileVisionBlueprint(sample(),image),g=result.reconstruction;
  assert.equal(result.reviewed,false);assert.equal(result.recognition.scale,'printed');assert.equal(result.recognition.cmPerPx,1);
  assert.equal(result.recognition.enclosedRegions,2);assert.equal(g.items.length,2);
  assert.equal(g.openings.length,2);assert.equal(g.rooms[0].name,'חדר שינה');
  assert.equal(g.annotations.length,2);assert.equal(g.annotations[0].sourceValueCm,640);
  assert.equal(g.openings[0].swingDir,'R_OUT');
  for(const wall of g.walls){const t=wall.thickness;normalizeWall(wall,{});assert.equal(wallThickness(wall,{}),t);}
});
test('recompressed/resized sources use actual image coordinates, without a fingerprint or reference lookup',()=>{
  const data=sample();const before=JSON.stringify(data);
  const original=compileVisionBlueprint(data,image);
  const factor=1.5,scaled=sample();scaled.walls=scaled.walls.map(w=>w.map(n=>n*factor));
  for(const a of [scaled.doors,scaled.windows])a.forEach(o=>{o[1]*=factor;o[2]*=factor;o[3]*=factor;});
  for(const r of scaled.rooms){r.x*=factor;r.y*=factor;}
  for(const it of scaled.furniture)for(const k of ['x','y','w','d'])it[k]*=factor;
  for(const d of scaled.dimensions)for(const k of ['x1','x2','y1','y2'])d[k]*=factor;
  const next=compileVisionBlueprint(scaled,{...image,width:1200,height:900});
  assert.deepEqual(next.reconstruction.nodes,original.reconstruction.nodes);
  assert.equal(next.reconstruction.items[0].w,original.reconstruction.items[0].w);
  assert.equal(JSON.stringify(data),before);
  const source=readFileSync(new URL('../js/blueprint.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/REVIEWED_BLUEPRINTS|SHA-256|images\.reviewed/);
});
test('no printed measurements means explicit estimated fallback scale, no invented dimensions or furniture',()=>{
  const data=sample();data.dimensions=[];data.furniture=[];data.rooms=[];
  const r=compileVisionBlueprint(data,image);
  assert.equal(r.recognition.scale,'fallback');assert.equal(r.layout.w,1000);assert.equal(r.reconstruction.annotations.length,0);assert.equal(r.reconstruction.items.length,0);
  assert.ok(r.warnings.some(s=>s.includes('Scale is estimated')));
  assert.ok(r.warnings.some(s=>s.includes('No readable room labels')));
});
test('manual scale override does not retain misleading printed annotation geometry',()=>{
  const r=compileVisionBlueprint(sample(),{...image,usePrintedScale:false,widthCm:1280});
  assert.equal(r.recognition.scale,'fallback');assert.equal(r.recognition.cmPerPx,2);assert.equal(r.reconstruction.annotations.length,0);
});
test('inconsistent readings and invalid feature records are excluded with warnings',()=>{
  const d=sample();d.dimensions.push({text:'9999',valueCm:9999,x1:100,y1:100,x2:130,y2:100});
  d.doors.push([99,100,100,500,'L_IN']);d.furniture.push({type:'arbitrary-script',x:50,y:50,w:20,d:20,rot:0});
  const r=compileVisionBlueprint(d,image);assert.equal(r.reconstruction.items.length,2);assert.equal(r.reconstruction.openings.length,2);
  assert.equal(r.recognition.rejected.items,1);assert.equal(r.recognition.rejected.openings,1);
  assert.ok(r.warnings.some(s=>s.includes('Inconsistent')));
});
test('blank, repeated/hallucinated walls, open graphs and invalid input do not create an invented plan',()=>{
  assert.throws(()=>compileVisionBlueprint({walls:[]},image),/No architectural/);
  const repeated=sample();repeated.walls.push(...repeated.walls,...repeated.walls);assert.throws(()=>compileVisionBlueprint(repeated,image),/repeated wall/);
  const open=sample();open.walls=open.walls.slice(0,3);assert.throws(()=>compileVisionBlueprint(open,image),/do not enclose/);
  assert.throws(()=>compileVisionBlueprint(sample(),{...image,width:NaN}),/Invalid source/);
});
test('diagonal architecture is retained instead of being replaced by room rectangles',()=>{
  const data={walls:[[50,50,300,50,6],[300,50,420,200,6],[420,200,50,400,6],[50,400,50,50,6]]};
  const r=compileVisionBlueprint(data,{width:500,height:500,widthCm:740});
  const wall=r.reconstruction.walls[1],a=r.reconstruction.nodes[wall.a],b=r.reconstruction.nodes[wall.b];
  assert.notEqual(a.x,b.x);assert.notEqual(a.z,b.z);assert.equal(r.recognition.enclosedRegions,1);
});
test('blue sofa upholstery does not become a glazed wall across a real image fixture',()=>{
  const source=decodePNG(readFileSync(new URL('../fixtures/floorplans/vision-two-room.png',import.meta.url)));
  const result=recognizeRaster(source);
  assert.equal(result.floorplan.rooms.length,2);
  assert.equal(result.segments.length,5);
});
