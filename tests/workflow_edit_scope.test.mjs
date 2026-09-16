import {formatCmInput} from "../js/ui_cabinet_ctx.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec} from '../js/cabinet.js';
import {syncCabinetDefinition} from '../js/parametric_cabinet.js';
import {captureCabinetSession,restoreCabinetSession} from '../js/cabinet_session.js';
import {writeLen} from '../js/display_units.js';
import {S} from '../js/state.js';

test('instance cabinet edits fork the definition and preserve linked layout; revert restores linkage',()=>{
 const a={id:'scope-a',type:'cabsys',w:120,h:240,d:60,cab:makeSpec('w_classic',120,240,60)};
 const state={items:[a]};syncCabinetDefinition(state,a);
 const b=structuredClone(a);b.id='scope-b';state.items.push(b);
 const before=captureCabinetSession(state,a),oldDefinition=structuredClone(state.parametric.definitions[a.definitionId]);
 a.cab.cols[0].door.t='none';
 syncCabinetDefinition(state,a,{scope:'instance',propagate:false});
 assert.notEqual(a.definitionId,b.definitionId);
 assert.deepEqual(b.cab,before.linked[0].cab);
 assert.deepEqual(state.parametric.definitions[b.definitionId],oldDefinition);
 restoreCabinetSession(state,a,before);
 assert.equal(a.definitionId,b.definitionId);
 assert.deepEqual(a.cab,before.cab);
});

test('editable dimensional values retain fractions despite coarse display settings',()=>{
 const old=S.unitSettings;
 try {
  S.unitSettings={preset:'metric_cm',domains:{}};
  for(const value of [13.97,96.52,274.32]){
   const input={id:'i_w'};writeLen(input,value,{unit:'cm'});assert.equal(Number(input.value),value);
  }
 } finally {S.unitSettings=old;}
});

test("cabinet input retains fractional dimensions on open and unchanged commit",()=>{
 for(const value of [243.84,13.97,96.52])assert.equal(Number(formatCmInput(value)),value);
});
