import test from 'node:test';
import assert from 'node:assert/strict';
import { documentDescription, setDocumentDescription, documentProperty, sheetTitleText } from '../js/core/custom_properties.js';

test('the sheet title follows Description while it is linked, and a typed title overrides it', () => {
  const def = { name: 'HOUSING', customProperties: { Description: 'HOUSING FOR 6VOLT FLASHLIGHT' } };
  assert.equal(sheetTitleText({ title: { title: 'HOUSING' } }, def), 'HOUSING FOR 6VOLT FLASHLIGHT');
  assert.equal(sheetTitleText({ title: {} }, def), 'HOUSING FOR 6VOLT FLASHLIGHT');
  assert.equal(sheetTitleText(null, def), 'HOUSING FOR 6VOLT FLASHLIGHT');
  def.customProperties.Description = 'HOUSING, 6 V FLASHLIGHT';
  assert.equal(sheetTitleText({ title: { title: 'HOUSING' } }, def), 'HOUSING, 6 V FLASHLIGHT');
  assert.equal(sheetTitleText({ title: { title: 'FLASHLIGHT BODY' } }, def), 'FLASHLIGHT BODY');
  assert.equal(sheetTitleText({ title: { title: 'LENS' } }, { name: 'LENS' }), 'LENS');
});

test('a stored drawing whose title is still the model name exports with the Description', () => {
  const def = { name: 'HOUSING', customProperties: { Description: 'HOUSING FOR 6VOLT FLASHLIGHT' }, parts: [] };
  const texts = buildDrawingScene(def, { doc: { ...buildDrawingSceneDoc(def) } }).items.filter((item) => item.type === 'text').map((item) => item.text);
  assert.ok(texts.includes('HOUSING FOR 6VOLT FLASHLIGHT'), texts.join(' | '));
});

function buildDrawingSceneDoc(def) {
  return ensureSheetDoc({ name: def.name });
}
import { bomTableRows } from '../js/modeler_commands.js';
import { buildDrawingScene } from '../js/cad_drawings.js';
import { ensureSheetDoc } from '../js/cad_sheet.js';

test('Description is a named custom property that trims, clears and survives a JSON round trip', () => {
  const def = { name: 'HOUSING' };
  setDocumentDescription(def, '  HOUSING FOR 6VOLT FLASHLIGHT ');
  assert.deepEqual(def.customProperties, { Description: 'HOUSING FOR 6VOLT FLASHLIGHT' });
  const saved = JSON.parse(JSON.stringify(def));
  assert.equal(documentDescription(saved), 'HOUSING FOR 6VOLT FLASHLIGHT');
  assert.equal(saved.name, 'HOUSING');
  setDocumentDescription(def, '');
  assert.equal(def.customProperties, undefined);
  assert.equal(documentDescription({}), '');
  assert.equal(documentProperty({ customProperties: { PartNo: 42 } }, 'PartNo'), '42');
});

test('the drawing title block shows Description, falling back to the model name', () => {
  const withDescription = { name: 'HOUSING', customProperties: { Description: 'HOUSING FOR 6VOLT FLASHLIGHT' }, parts: [] };
  const titleOf = (def) => buildDrawingScene(def).items.filter((item) => item.type === 'text').map((item) => item.text);
  assert.ok(titleOf(withDescription).includes('HOUSING FOR 6VOLT FLASHLIGHT'));
  assert.ok(titleOf({ name: 'LENS', parts: [] }).includes('LENS'));
});

test('BOM rows carry the component model Description', () => {
  const rows = bomTableRows(
    [{ key: 'cm_housing', name: 'HOUSING', quantity: 1 }, { key: 'cm_switch', name: 'SWITCH', quantity: 1 }],
    [{ modelKey: 'cm_housing', def: { customProperties: { Description: 'HOUSING FOR 6VOLT FLASHLIGHT' } } }, { modelKey: 'cm_switch', def: {} }],
  );
  assert.equal(rows[0].description, 'HOUSING FOR 6VOLT FLASHLIGHT');
  assert.equal(rows[0].name, 'HOUSING');
  assert.equal(rows[1].description, '');
});
