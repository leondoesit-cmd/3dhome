import test from 'node:test';
import assert from 'node:assert/strict';
import {PLANNING_UNITS,toDisplayLength,fromDisplayLength} from '../js/planning_units.js';
import {normalizePlanningGuide} from '../js/planning_guide.js';
test('display units round-trip model centimeters without changing dimensions',()=>{
 for(const unit of Object.keys(PLANNING_UNITS))assert.ok(Math.abs(fromDisplayLength(toDisplayLength(181.25,unit),unit)-181.25)<1e-10);
 assert.equal(toDisplayLength(350,'m'),3.5);assert.equal(fromDisplayLength(10,'in'),25.4);
 assert.equal(normalizePlanningGuide({details:{displayUnit:'ft'}}).details.displayUnit,'ft');
 assert.equal(normalizePlanningGuide({details:{displayUnit:'invalid'}}).details.displayUnit,undefined);
});
