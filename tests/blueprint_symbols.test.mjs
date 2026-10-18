import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{decodePNG}from'../tools/png.mjs';
import{recognizeRaster}from'../js/core/blueprint_raster.js';
import{blueprintSymbols}from'../js/core/blueprint_symbols.js';

test('whole bed, sofa, tables and four separate chairs have source-pixel bounds',()=>{
 const image=decodePNG(readFileSync(new URL('../fixtures/floorplans/vision-two-room.png',import.meta.url)));
 const r=recognizeRaster(image),walls=r.segments.map(s=>s.vertical?[s.c,s.a,s.c,s.b,s.thickness]:[s.a,s.c,s.b,s.c,s.thickness]);
 const symbols=blueprintSymbols(image,walls);
 for(const [x,y,w,d]of [[245,387.5,157,206],[650,490,121,81],[655,335,81,81],[655,224,201,83]])
  assert.ok(symbols.some(s=>s.x===x&&s.y===y&&s.w===w&&s.d===d));
 assert.equal(symbols.filter(s=>s.w===36&&s.d===29).length,4);
 const blank={width:100,height:100,data:new Uint8ClampedArray(40000).fill(255)};
 assert.deepEqual(blueprintSymbols(blank),[]);
});
