import test from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{decodePNG}from'../tools/png.mjs';
import{blueprintTextFeatures,printedLength}from'../js/core/blueprint_text.js';
const image=decodePNG(readFileSync(new URL('../fixtures/floorplans/vision-two-room.png',import.meta.url)));
const walls=[[100,100,800,100,12],[800,100,800,600,12],[800,600,100,600,12],[100,600,100,100,12]];
test('OCR length units convert correctly and room areas never become lengths',()=>{
  assert.equal(printedLength('4.2 m').cm,420);assert.equal(printedLength('900 mm').cm,90);
  assert.equal(printedLength('700 cm').cm,700);assert.equal(printedLength('8′-6″').cm,259.08);
  assert.equal(printedLength('20 m²'),null);assert.equal(printedLength('nonsense'),null);
  assert.equal(printedLength('417').assumed,true);
});
test('printed lengths use real horizontal and vertical extension-line endpoints',()=>{
  const text=[{text:'700 cm',confidence:95,bbox:{x0:399,y0:635,x1:485,y1:660}},
    {text:'500 cm',confidence:95,rotated:true,bbox:{x0:49,y0:300,x1:81,y1:400}}];
  const result=blueprintTextFeatures(text,image,walls);
  assert.equal(result.dimensions.length,2);
  for(const d of result.dimensions)assert.equal(Math.hypot(d.x2-d.x1,d.y2-d.y1),d.valueCm);
});
test('room labels retain their text, numbers and pixel location; ungrounded numbers are not measurements',()=>{
  const lines=[{text:'Bedroom 2',confidence:98,bbox:{x0:205,y0:210,x1:330,y1:240}},
    {text:'חדר שינה',confidence:80,bbox:{x0:550,y0:400,x1:700,y1:430}},
    {text:'900 cm',confidence:97,bbox:{x0:200,y0:300,x1:290,y1:320}}];
  const result=blueprintTextFeatures(lines,image,walls);
  assert.equal(result.rooms[0].label,'Bedroom 2');assert.equal(result.rooms[0].x,267.5);
  assert.equal(result.rooms[1].label,'חדר שינה');assert.equal(result.dimensions.length,0);
});
test('printed room-size pairs need agreement with both measured clear spans; weak text never overrides labels',()=>{
  const box={x0:200,y0:200,x1:250,y1:210};
  const result=blueprintTextFeatures([{text:'688/488',confidence:95,bbox:box},{text:'am',confidence:82,bbox:box},
    {text:'unreadable',confidence:50,bbox:box}],image,walls);
  assert.deepEqual(result.dimensions.map(d=>d.valueCm),[688,488]);assert.equal(result.rooms.length,0);
  assert.ok(result.warnings.some(w=>w.includes('centimeters were assumed')));
  assert.equal(blueprintTextFeatures([{text:'999/100',confidence:95,bbox:box}],image,walls).dimensions.length,0);
});
