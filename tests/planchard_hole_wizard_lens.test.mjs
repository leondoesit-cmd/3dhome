import test from 'node:test';
import assert from 'node:assert/strict';
import {featureEditorGroups} from '../js/core/feature_catalog.js';
import {holeCallout,holeTableRow,holeWizardSizeChoices,holeWizardSolids,normalizeHoleWizard} from '../js/cad_hole_wizard.js';
import {holeToolPlacements} from '../js/core/hole_geometry.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} differs from ${expected}`);

test('LENS Hole Wizard exposes ANSI Inch, Hex Bolt, 1/2 Normal',()=>{
  const fields=featureEditorGroups('hole').flatMap(group=>group.fields);
  const choice=(key)=>fields.find(field=>field.key===key)?.choices.map(item=>item.value);
  assert.ok(choice('standard').includes('ANSI Inch'));
  assert.ok(choice('fastenerType').includes('hex-bolt'));
  assert.ok(choice('standardSize').includes('1/2'));
  assert.deepEqual(holeWizardSizeChoices('ANSI Inch'),['custom','1/2','3/8-hex','1/4-20']);
  assert.deepEqual(holeWizardSizeChoices('ANSI Inch','tapped'),['custom','1/4-20']);
  assert.ok(!holeWizardSizeChoices('ISO 273').includes('1/2'));
  near(holeTableRow('1/2').normalMm,17/32*25.4);
  assert.throws(()=>normalizeHoleWizard({holeType:'tapped',standardSize:'1/2'}),/clearance size/);
  assert.throws(()=>normalizeHoleWizard({standardSize:'1/2',fit:'loose'}),/verified Normal/);
});

test('book LENS through counterbore retains the custom inch recess and clearance bore',()=>{
  const params={holeType:'counterbore',standard:'ANSI Inch',fastenerType:'hex-bolt',
    standardSize:'1/2',fit:'normal',endCondition:'through-all',
    cboreDiameter:.600*2.54,cboreDepth:.200*2.54,displayUnit:'in'};
  const saved=JSON.parse(JSON.stringify(params));
  const hole=normalizeHoleWizard(saved);
  assert.equal(hole.standard,'ANSI Inch');
  assert.equal(hole.fastenerType,'hex-bolt');
  near(hole.diameterMm,17/32*25.4);
  near(hole.cboreDiameterMm,.600*25.4);
  near(hole.cboreDepthMm,.200*25.4);
  const {solids}=holeWizardSolids(saved);
  assert.equal(solids[0].endCondition,'through-all');
  near(solids[0].diameter,17/32*2.54);
  near(solids[1].diameter,.600*2.54);
  near(solids[1].depth,.200*2.54);
  assert.match(holeCallout(saved),/Ø0\.53125 in THRU.*Ø0\.6 in.*0\.2 in/);
});

test('LENS support-face hole travels into the selected face from a centred position',()=>{
  const face={origin:{x:0,y:0,z:2},normal:{x:0,y:0,z:1},
    xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0}};
  const params={frame:face,support:{kind:'face'},direction:'forward',centres:[{u:0,v:0}],
    diameter:17/32*2.54,endCondition:'through-all',from:0};
  const [placement]=holeToolPlacements(params,{min:{x:-3,y:-3,z:0},max:{x:3,y:3,z:2}});
  assert.deepEqual(placement.origin,{x:0,y:0,z:2});
  near(placement.axis.x,0);
  near(placement.axis.y,0);
  near(placement.axis.z,-1);
  assert.ok(placement.depth>2);
});
