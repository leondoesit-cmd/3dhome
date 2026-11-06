import { stylesSource } from "./helpers/styles_source.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dimensionEditorPosition} from '../js/core/dimension_editor_position.js';
const box = {left:0,right:390,top:48,bottom:792,width:390,height:744};
const bar = {left:8,right:382,top:740,bottom:784,width:374,height:44};
test('a bottom touch keeps the Apply row above the topology selection bar', () => {
  const p = dimensionEditorPosition(box,278,260,195,790,[bar]);
  assert.ok(box.top+p.y+260 <= bar.top-10);
});
test('stacked entity navigation and enlarged selection controls reserve their measured heights', () => {
  const navigation = {...bar,top:660,bottom:708,height:48};
  const p = dimensionEditorPosition(box,278,300,195,780,[bar,navigation]);
  assert.ok(box.top+p.y+300 <= navigation.top-10);
  const short = dimensionEditorPosition(box,278,700,195,780,[navigation]);
  assert.equal(short.y,10);
  assert.equal(box.top+short.y+short.maxHeight,navigation.top-10);
});
test('hidden controls with zero rectangles and unrelated overlays do not move a desktop editor', () => {
  const p = dimensionEditorPosition(box,278,184,380,790,[{...bar,width:0,height:0},{...bar,left:500,right:600}]);
  assert.equal(p.x,102);
  assert.equal(p.y,550);
});
test('mini editor nested grids let tolerance fields shrink within the border box', () => {
  const css = stylesSource();
  assert.match(css, /\.md-dimension-editor label\s*\{[^}]*min-width:\s*0;[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(css, /\.md-dimension-editor select\s*\{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box/);
  assert.match(css, /\.md-dimension-editor label > span\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere/);
});
test('closed mobile sheets remove descendant controls from rendering and hit testing', () => {
  const css = stylesSource();
  assert.match(css, /#md-sheet\[aria-hidden="true"\]\s*\{[^}]*display:\s*none;[^}]*pointer-events:\s*none/);
});
