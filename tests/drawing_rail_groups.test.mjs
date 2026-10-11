import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawingRailPlan} from '../js/core/drawing_rail_groups.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const commands=[...source.slice(source.indexOf('id="mdDrawingTools"'),source.indexOf('id="mdSheetPanel"')).matchAll(/(?:data-drawing-tool|id)="([^"]+)"/g)].map(m=>m[1]);
test('every native Drawing command stays reachable through purpose groups and bounded pages',()=>{
  for(const size of [1,3,6]){
    const seen=new Set();
    for(const group of drawingRailPlan(commands).groups){
      const first=drawingRailPlan(commands,group,0,size);
      for(let p=0;p<first.pages;p++){
        const plan=drawingRailPlan(commands,group,p,size);
        assert.ok(plan.visible.length<=size+1);assert.equal(plan.visible[0],'select');
        plan.visible.forEach(c=>seen.add(c));
      }
      assert.equal(drawingRailPlan(commands,group,first.pages,size).page,0);
    }
    assert.deepEqual([...seen].sort(),[...new Set(commands)].sort());
  }
});
test('More keeps the actual name/status on their own row and aligns Description with Price',()=>{
  const css=readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
  assert.match(css,/\.md-sheet-fields \.md-head-inputs\s*\{ display:grid !important;[^}]*align-items:start/);
  assert.match(css,/\.md-field:has\(#mdName\)\s*\{ grid-column:1 \/ -1/);
  assert.match(css,/#mdDraftStatus\s*\{ display:block;[^}]*white-space:normal/);
  assert.match(css,/\.md-more-actions\s*\{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important/);
  const mobile=readFileSync(new URL('../js/modeler_mobile.js',import.meta.url),'utf8');
  assert.match(mobile,/section\(t\("msheet_actions"\)\);\s*var g1 = grid\("m-grid-3 m-icon-grid md-more-actions"\)/);
});
test('purpose chooser and next-page controls have explicit Hebrew and English labels',()=>{
  const strings=readFileSync(new URL('../js/modeler_strings.js',import.meta.url),'utf8');
  assert.match(strings,/drawToolGroups:\s*\["קבוצות כלים", "Tool groups"\]/);
  assert.match(strings,/drawNextTools:\s*\["הכלים הבאים", "Next tools"\]/);
});
