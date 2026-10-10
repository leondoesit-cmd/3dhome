import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {holeWizardSizeChoices,holeTableRow,normalizeHoleWizard,holeWizardSolids} from '../js/cad_hole_wizard.js';
import {featureEditorGroups} from '../js/core/feature_catalog.js';
import {formatDocumentLength} from '../js/core/document_length_units.js';

const source=readFileSync(new URL('../js/modeler_feature_form.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('      var standard = controls.find'),source.indexOf('      var tapped = holeType'));
function form(sizeValue='M6',unit='mm',savedDepth='6.6'){
  const fields={standard:'ANSI Inch',standardSize:sizeValue,holeType:'counterbore',fastenerType:'socket-head-cap-screw',fit:'normal',diameter:'6.6',cboreDiameter:'11',cboreDepth:savedDepth};
  const controls=Object.entries(fields).map(([key,value])=>{const input={value,options:key==='fit'?[{value:'normal'},{value:'close'},{value:'loose'}]:key==='standardSize'?[{value:'M6'},{value:'1/4-20'}]:[],appendChild(option){this.options.push(option);}};Object.defineProperty(input,'innerHTML',{set(){this.options=[];}});return {field:{key,inputUnit:unit},input};});
  const env={controls,holeWizardSizeChoices,holeTableRow,formatDocumentLength,el:(tag,cls,label)=>({label})};
  return {controls,sync(key){new Function(...Object.keys(env),'changedKey',block)(...Object.values(env),key);},get(key){return controls.find(c=>c.field.key===key).input;}};
}
test('ANSI Inch Socket Head Cap Screw clearance choices exclude hex/tap identities and expose a real quarter-inch row',()=>{
  assert.deepEqual(holeWizardSizeChoices('ANSI Inch','counterbore','socket-head-cap-screw'),['custom','1/4-shcs']);
  assert.deepEqual(holeWizardSizeChoices('ANSI Inch','tapped','socket-head-cap-screw'),['custom','1/4-20']);
  const row=holeTableRow('1/4-shcs');assert.equal(row.fastenerType,'socket-head-cap-screw');assert.equal(row.normalMm,7.14375);assert.equal(row.cboreDiaMm,11.1125);assert.equal(row.cboreDepthMm,6.35);
  assert.ok(featureEditorGroups('hole').flatMap(g=>g.fields).find(f=>f.key==='standardSize').choices.some(c=>c.value==='1/4-shcs' && /clearance/.test(c.label)));
});
test('actual dynamic size form selects SHCS clearance and propagates exact source dimensions in mm/in',()=>{
  for(const [unit,values] of [['mm',[7.14375,11.1125,6.35]],['in',[.28125,.4375,.25]]]){
    const f=form('M6',unit);f.sync('fastenerType');assert.equal(f.get('standardSize').value,'1/4-shcs');
    assert.deepEqual(f.get('standardSize').options.map(o=>o.value),['custom','1/4-shcs']);assert.match(f.get('standardSize').options[1].label,/Socket Head Cap Screw \(clearance\)/);
    ['diameter','cboreDiameter','cboreDepth'].forEach((key,i)=>assert.ok(Math.abs(Number(f.get(key).value)-values[i])<1e-9));
  }
});
test('opening legacy SHCS quarter-inch records preserves their key and customized head recess',()=>{
  const f=form('1/4-20','mm','8.89');f.sync(undefined);assert.equal(f.get('standardSize').value,'1/4-20');assert.equal(f.get('cboreDepth').value,'8.89');
  assert.match(f.get('standardSize').options.find(o=>o.value==='1/4-20').label,/legacy size key/);
  f.sync('cylinderAlongZ');assert.equal(f.get('standardSize').value,'1/4-20');assert.equal(f.get('cboreDepth').value,'8.89');
});
test('new clearance key drives exact bore/recess solids and rejects being used as a tapped/hex size',()=>{
  const params={holeType:'counterbore',standard:'ANSI Inch',fastenerType:'socket-head-cap-screw',standardSize:'1/4-shcs',fit:'normal',endCondition:'through-all',cboreDepth:.889};
  const cold=JSON.parse(JSON.stringify(params)),wizard=holeWizardSolids(cold);
  assert.equal(wizard.hole.diameterMm,7.14375);assert.equal(wizard.hole.cboreDiameterMm,11.1125);assert.equal(wizard.hole.cboreDepthMm,8.89);
  assert.ok(Math.abs(wizard.solids[0].diameter-.714375)<1e-12);assert.ok(Math.abs(wizard.solids[1].depth-.889)<1e-12);
  assert.throws(()=>normalizeHoleWizard({...params,holeType:'tapped'}),/clearance size/);
  assert.throws(()=>normalizeHoleWizard({...params,fastenerType:'hex-bolt'}),/Socket Head Cap Screw/);
  assert.deepEqual(cold,params);
});
