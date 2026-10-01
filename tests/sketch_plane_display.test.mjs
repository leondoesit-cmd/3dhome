import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchPlaneDisplay} from '../js/core/sketch_plane_display.js';

test('face attachment takes precedence over legacy principal and datum labels after JSON reopen',()=>{
  const sketch=JSON.parse(JSON.stringify({plane:'front',referenceId:'datum',frameSpace:'local',frame:{normal:{x:0,y:.5,z:.866}},support:{persistentId:'boss:face:side:5'}}));
  const display=sketchPlaneDisplay(sketch,[{id:'datum',name:'Old plane'}]);
  assert.equal(display.kind,'face');assert.equal(display.value,'__support_frame__');assert.equal(display.label,'Face · boss:face:side:5');
});
test('datum and explicit local frames remain distinguishable from principal camera views',()=>{
  assert.deepEqual(sketchPlaneDisplay({plane:'front',referenceId:'datum'},[{id:'datum',name:'Inclined plane'}]),{kind:'reference',value:'datum',label:'Inclined plane'});
  assert.equal(sketchPlaneDisplay({plane:'front',frameSpace:'local',frame:{}}).kind,'frame');
  assert.deepEqual(sketchPlaneDisplay({plane:'top'},[],{principal:p=>'support '+p}),{kind:'principal',value:'top',label:'support top'});
});
