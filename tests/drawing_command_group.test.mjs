import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingCommandGroup} from '../js/core/drawing_command_group.js';
test('drawing menu names groups by purpose instead of the first arbitrary item',()=>{
  assert.equal(drawingCommandGroup('sheetline'),'drawGroupGeometry');
  assert.equal(drawingCommandGroup('sheetellipse'),'drawGroupGeometry');
  assert.equal(drawingCommandGroup('chain'),'drawGroupDimensions');
  assert.equal(drawingCommandGroup('insertprojectimage'),'drawGroupAnnotations');
  assert.equal(drawingCommandGroup('newtemplate'),'drawGroupFormats');
  assert.equal(drawingCommandGroup('alignedsection'),'drawGroupViews');
  assert.equal(drawingCommandGroup('mdSheetFit'),'drawGroupDisplay');
  assert.equal(drawingCommandGroup('mdSheetModelItems'),'drawGroupModelDimensions');
  assert.equal(drawingCommandGroup('mdSheetExport'),'drawGroupOutput');
});
