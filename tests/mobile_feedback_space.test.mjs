import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mobileFeedbackSpace} from '../js/core/mobile_feedback_space.js';
const pane = {left:0,right:390,top:48,bottom:792};
const selection = {left:8,right:382,top:740,width:374,height:44};
test('full instruction gutter sits above actual selection and navigation shelves', () => {
  const nav = {...selection,top:684,height:48};
  const s = mobileFeedbackSpace(pane,70,[selection,nav]);
  assert.equal(s.footer,116);
  assert.equal(s.gutter,86);
  assert.ok(pane.bottom-s.footer <= nav.top-8);
});
test('hidden shelves do not leave stale reserve, and wrapped instructions grow the gutter', () => {
  assert.deepEqual(mobileFeedbackSpace(pane,30,[{...selection,width:0,height:0}]),{footer:0,gutter:56});
  assert.deepEqual(mobileFeedbackSpace(pane,110,[]),{footer:0,gutter:126});
});
test('measured hint positioning and paired theme contrast apply to Model and Sketch as well as Drawing', () => {
  const css = readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
  assert.match(css,/body\.compact-nav #modeler \.md-mid > #mdHint\s*\{[^}]*bottom:\s*calc\(var\(--md-mobile-feedback-footer, 0px\) \+ 4px\);[^}]*background:\s*var\(--bg-panel\); color:\s*var\(--text-main\)/);
  const src = readFileSync(new URL('../js/modeler_mobile.js',import.meta.url),'utf8');
  assert.match(src,/function sync\(force\)\s*\{[^}]*adoptHint\(\)/);
  assert.match(src,/setProperty\('--md-mobile-feedback-footer', space\.footer/);
  assert.match(src,/setProperty\('--md-mobile-shelf-footer', shelf\.footer/);
  assert.match(src,/setProperty\('--md-mobile-sketch-footer', sketchSpace\.footer/);
  assert.match(css,/#mdHint\s*\{ inset-inline-start:\s*64px; max-width:\s*calc\(100% - 76px\)/);
  const compact = readFileSync(new URL('../js/pro_compact.js',import.meta.url),'utf8');
  assert.match(compact,/hint\.dataset\.activeInstruction !== "true" && !hint\.classList\.contains\("selection"\)/);
  const modeler = readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  assert.match(modeler,/var instructionTool = E\.mode === "drawing" \? drawingSheet\(\)\.state\.tool : E\.tool;[\s\S]*?hint\.dataset\.activeInstruction = instructionTool/);
});
