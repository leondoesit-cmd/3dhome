import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{decodePNG}from'../tools/png.mjs';
import{recognizeRaster}from'../js/core/blueprint_raster.js';
import{compileVisionBlueprint}from'../js/core/blueprint_vision.js';
import{refineBlueprintFurniture}from'../js/core/blueprint_furniture.js';
import{refineBlueprintOpenings}from'../js/core/blueprint_openings.js';
const image=decodePNG(readFileSync(new URL('../fixtures/floorplans/vision-two-room.png',import.meta.url)));
function proposal(){
  const raster=recognizeRaster(image);
  return compileVisionBlueprint({walls:raster.segments.map(s=>s.vertical?[s.c,s.a,s.c,s.b,s.thickness]:[s.a,s.c,s.b,s.c,s.thickness]),
    furniture:[{type:'bed',x:250,y:380,w:160,d:140,rot:0},{type:'sofa',x:700,y:280,w:250,d:90,rot:0},
      {type:'table',x:670,y:430,w:180,d:90,rot:0},{type:'chair',x:650,y:470,w:40,d:30,rot:0},{type:'chair',x:710,y:470,w:40,d:30,rot:0}],
    dimensions:[{text:'700 cm',valueCm:700,x1:100,y1:650,x2:800,y2:650}]},{width:900,height:700});
}
test('furniture proposals are fitted to actual visible contours rather than catalogue dimensions',()=>{
  const result=refineBlueprintFurniture(proposal(),image),bed=result.reconstruction.items.find(it=>it.type==='bed');
  assert.ok(Math.abs(bed.w-157)<=2);assert.ok(Math.abs(bed.d-206)<=2);
  assert.ok(result.recognition.furnitureRefined>=3);
});
test('measured symbol bounds cannot drift into adjacent furniture during legacy refinement',()=>{
 const result=proposal();result.recognition.symbolGeometry='measured';
 const before=structuredClone(result.reconstruction.items);
 refineBlueprintFurniture(result,image);
 for(const item of before)assert.deepEqual(result.reconstruction.items.find(it=>it.id===item.id),item);
});

test('repeated chairs and a round table require matching visible image symbols',()=>{
  const result=refineBlueprintFurniture(proposal(),image);
  assert.equal(result.reconstruction.items.filter(it=>it.type==='chair').length,4);
  assert.equal(result.reconstruction.items.filter(it=>it.type==='roundTable').length,1);
  assert.ok(result.warnings.some(s=>s.includes('additional furniture symbols')));
  const blank={width:image.width,height:image.height,data:new Uint8ClampedArray(image.data.length).fill(255)};
  const untouched=refineBlueprintFurniture(proposal(),blank);
  assert.equal(untouched.reconstruction.items.length,5);
  assert.equal(untouched.recognition.additionalSymbols,0);
});

test('measured table bounds still allow recovery of the repeated visible chair set',()=>{
 const result=refineBlueprintFurniture(proposal(),image);
 result.reconstruction.items=result.reconstruction.items.filter(it=>!['chair','roundTable'].includes(it.type));
 result.recognition.symbolGeometry='measured';
 const originalTable=structuredClone(result.reconstruction.items.find(it=>it.type==='table'));
 refineBlueprintFurniture(result,image);
 assert.equal(result.reconstruction.items.filter(it=>it.type==='chair').length,4);
 assert.deepEqual(result.reconstruction.items.find(it=>it.id===originalTable.id),originalTable);
});

test('three matching visible dining chairs correct a square TV misclassification in the same set',()=>{
 const result=refineBlueprintFurniture(proposal(),image);
 const wrong=result.reconstruction.items.find(it=>it.type==='chair');wrong.type='tv';
 result.recognition.symbolGeometry='measured';refineBlueprintFurniture(result,image);
 assert.equal(wrong.type,'chair');assert.equal(result.reconstruction.items.filter(it=>it.type==='chair').length,4);
});
test('chairs missed entirely by vision still require a repeated set of visible contours around a measured table',()=>{
  const result=proposal();result.reconstruction.items=result.reconstruction.items.filter(it=>it.type!=='chair');
  refineBlueprintFurniture(result,image);
  assert.equal(result.reconstruction.items.filter(it=>it.type==='chair').length,4);
});
test('misplaced sofa and duplicate chair guesses are reconciled with observed furniture contours',()=>{
  const result=proposal(),cal=result.referenceCalibration;
  const sofa=result.reconstruction.items.find(it=>it.type==='sofa');Object.assign(sofa,{x:700+cal.originX,z:350+cal.originZ,w:180,d:40});
  const chair=result.reconstruction.items.find(it=>it.type==='chair');
  result.reconstruction.items.push({...chair,id:999,x:720+cal.originX,z:590+cal.originZ});
  refineBlueprintFurniture(result,image);
  assert.equal(result.reconstruction.items.filter(it=>it.type==='chair').length,4);
  assert.equal(sofa.w,201);assert.equal(sofa.d,83);
  assert.equal(result.reconstruction.items.filter(it=>it.type==='roundTable').length,1);
});
test('a visible swing arc and leaf correct a window guess, while glazing stays a window',()=>{
  const result=proposal(),cal=result.referenceCalibration;
  const wall=result.reconstruction.walls.find(w=>{
    const a=result.reconstruction.nodes[w.a],b=result.reconstruction.nodes[w.b];return a.x===b.x&&a.x>650;
  });
  const a=result.reconstruction.nodes[wall.a];
  result.reconstruction.openings=[{id:900,wall:wall.id,type:'window',s:490+cal.originZ-a.z,width:78,height:120,sill:90},
    {id:901,wall:wall.id,type:'window',s:230+cal.originZ-a.z,width:118,height:120,sill:90}];
  refineBlueprintOpenings(result,image);
  assert.equal(result.reconstruction.openings[0].type,'door');assert.equal(result.reconstruction.openings[0].sill,0);
  assert.equal(result.reconstruction.openings[1].type,'window');assert.equal(result.recognition.swingSymbols,1);
  const blank={...image,data:new Uint8ClampedArray(image.data.length).fill(255)};
  result.reconstruction.openings[0].type='window';refineBlueprintOpenings(result,blank);
  assert.equal(result.reconstruction.openings[0].type,'window');
});

test('matching a dining set cannot discard an unrelated chair elsewhere in the plan',()=>{
  const result=proposal(),cal=result.referenceCalibration;
  const chair=result.reconstruction.items.find(it=>it.type==='chair');
  result.reconstruction.items.push({...chair,id:999,x:150+cal.originX,z:150+cal.originZ});
  refineBlueprintFurniture(result,image);
  assert.ok(result.reconstruction.items.some(it=>it.id===999));
  assert.equal(result.reconstruction.items.filter(it=>it.type==='chair').length,5);
});
