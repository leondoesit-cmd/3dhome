import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateBOM,generateOccurrenceBOM} from '../js/cad_interference.js';
import {assemblyDrawingBOM,occurrenceBOMKey} from '../js/core/assembly_drawing_bom.js';
const source=JSON.parse(readFileSync(new URL('./fixtures/component_pattern_browser_bom_source.json',import.meta.url))).assembly;
const fixture=()=>structuredClone(source);
const generated=a=>a.components.filter(c=>c.componentPattern);

test('actual browser pattern supplies three screw quantities and every generated balloon path in both Drawing BOM scopes',()=>{
 for(const scope of ['partsOnly','indented']) {
  const a=fixture(),before=JSON.stringify(a),bom=assemblyDrawingBOM(a,scope);
  assert.equal(bom.rows.length,2);assert.deepEqual(bom.rows.map(r=>r.quantity),[1,3]);assert.equal(bom.itemByPath.size,4);
  for(const c of a.components.slice(1))assert.equal(String(bom.itemByPath.get(occurrenceBOMKey([c.id]))),'2');
  assert.equal(JSON.stringify(a),before,'source, occurrence poses and recipe remain unchanged by resolved row aggregation');
  const cold=JSON.parse(JSON.stringify(a));assert.deepEqual(assemblyDrawingBOM(cold,scope),bom);
 }
});

test('pure occurrence aggregation retains generated leaves while actual assembly replay removes obsolete children',()=>{
 const a=fixture(),child=generated(a)[0],before=JSON.stringify(child);
 assert.equal(generateOccurrenceBOM([child])[0].quantity,1);assert.equal(JSON.stringify(child),before);
 a.components.find(c=>String(c.id)==='6408').def.features.find(f=>f.id==='feature_munmkxj5_3').params.countX=2;
 const bom=assemblyDrawingBOM(a,'partsOnly');assert.equal(generated(a).length,1);assert.deepEqual(bom.rows.map(r=>r.quantity),[1,2]);
 assert.equal(bom.itemByPath.has(occurrenceBOMKey(['component-pattern:6413:2'])),false);
 a.componentPatterns=[];assert.deepEqual(generateBOM(a).map(r=>r.quantity),[1,1]);assert.equal(generated(a).length,0);
});

test('nested repeated real pattern owners retain scoped identities and current source replay in both scopes',()=>{
 const left=fixture(),right=fixture(),a={components:[{id:'left',kind:'assembly',modelKey:'sub',asm:left},{id:'right',kind:'assembly',modelKey:'sub',asm:right}]};
 for(const scope of ['partsOnly','indented']){
  const bom=assemblyDrawingBOM(a,scope);
  assert.equal(bom.itemByPath.size,8);assert.deepEqual(bom.rows.map(r=>r.quantity),scope==='partsOnly'?[2,6]:[2,2,6]);
  for(const side of ['left','right'])for(const c of a.components.find(c=>c.id===side).asm.components.slice(1))assert.ok(bom.itemByPath.has(occurrenceBOMKey([side,c.id])));
 }
 right.components.find(c=>String(c.id)==='6408').def.features.find(f=>f.id==='feature_munmkxj5_3').suppressed=true;
 const bom=assemblyDrawingBOM(a,'indented');assert.equal(generated(right).length,0);assert.equal(bom.itemByPath.size,6);assert.equal(bom.rows.at(-1).quantity,4);
});

