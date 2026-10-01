import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const start=source.indexOf('function applyPrintMeshExportSettings(');
const body=source.slice(start,source.indexOf('\nfunction openStlExportForm(',start));

test('mesh export settings preserve only an already-current native run',()=>{
  for(const current of [true,false]){
    const E={def:{features:[{id:'solid',params:{depth:12}}]},brepStamp:{doc:'part',node:'before'}};
    const old=E.brepStamp,geometry=structuredClone(E.def.features);let node='before',checkedAt;
    const apply=new Function('E','exactRunIsCurrent','pushUndo','exactRunStamp',body+';return applyPrintMeshExportSettings;')(
      E,()=>{checkedAt=node;return current;},()=>{node='after';},()=>({doc:'part',node}));
    apply({quality:'fine',deviationMm:.01,angleDegrees:5});
    assert.equal(checkedAt,'before','verify before the metadata history edit');
    assert.deepEqual(E.def.features,geometry,'native geometry is unchanged');
    assert.equal(E.def.stlExportSettings.quality,'fine');
    if(current)assert.deepEqual(E.brepStamp,{doc:'part',node:'after'});
    else assert.equal(E.brepStamp,old,'never bless an expired or mesh-only run');
  }
});
