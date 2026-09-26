import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetDoc,dimensionText} from '../js/cad_sheet.js';
test('dual units use the same geometry, independent precision, and survive serialization',()=>{
 const doc=JSON.parse(JSON.stringify(createSheetDoc({draftingStandard:'ANSI',units:'in',precision:3,secondaryUnits:'mm',secondaryPrecision:2})));
 assert.equal(dimensionText({type:'diameter',measure:.47752},doc),'⌀0.188 [4.78]');
 assert.equal(dimensionText({type:'horizontal',measure:3.4925},doc),'1.375 [34.93]');
 assert.equal(dimensionText({type:'radius',measure:.254},doc),'R0.100 [2.54]');
 assert.equal(dimensionText({type:'horizontal',measure:5.08,tolerance:'±0.005 in'},doc),'2.000 [50.80] ±0.005 in');
 assert.equal(dimensionText({type:'angle',measure:45},doc),'45°');
 assert.equal(dimensionText({type:'horizontal',measure:5.08,text:'REFERENCE ONLY'},doc),'REFERENCE ONLY');
 doc.secondaryUnits='in';assert.equal(dimensionText({measure:5.08},doc),'2.000');
});
