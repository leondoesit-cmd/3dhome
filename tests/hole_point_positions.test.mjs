import test from 'node:test';
import assert from 'node:assert/strict';
import {holePositionPointIds,holeCutRecords,holeToolPlacements} from '../js/core/hole_geometry.js';
import {compileKernelFeatureTree} from '../js/core/kernel_feature_adapter.js';
import {regenerateFeatures,releaseRegeneration} from '../js/cad_feature_tree.js';
import {brepContainsPoint,shapeMassProperties} from '../js/cad_kernel.js';
import {holeWizardSolids,holeTableRow,holeWizardSizeChoices} from '../js/cad_hole_wizard.js';

test('explicit positioning points ignore profile endpoints and follow saved coordinates',async()=>{
  const sketch={id:'positions',plane:'top',frameSpace:'local',support:{kind:'face'},
    frame:{origin:{x:0,y:2.54,z:2.54},normal:{x:0,y:1,z:0},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:-1}},
    points:[{id:'hole',x:-3.81,y:0},{id:'circle-centre',x:0,y:0},{id:'construction',x:3.81,y:0}],
    entities:[{id:'position',type:'point',p:'hole'},{id:'old-circle',type:'circle',c:'circle-centre',r:.555625},{id:'datum',type:'point',p:'construction',construction:true}],constraints:[]};
  const params={holeType:'simple',standardSize:'custom',layout:'sketch',diameter:1.11125,depth:1.905,drillPointAngle:118,endCondition:'blind',direction:'forward',sketchId:sketch.id,holePositionPointIds:holePositionPointIds(sketch),profileEntityIds:[]};
  assert.deepEqual(params.holePositionPointIds,['hole']);
  const [record]=holeCutRecords(params,sketch,[]);
  assert.deepEqual(record.params.centres,[{u:-3.81,v:0}]);
  const [placement]=holeToolPlacements(record.params);
  assert.deepEqual(placement.origin,{x:-3.81,y:2.54,z:2.54});
  assert.equal(Math.abs(placement.axis.x),0);
  assert.equal(placement.axis.y,-1);
  assert.equal(Math.abs(placement.axis.z),0);
  const document={id:'hole-block-point',kind:'part',sketches:[sketch],features:[
    {id:'base',type:'box',inputs:[],references:{},params:{x:-6.35,y:-2.54,z:0,w:12.7,h:5.08,d:5.08}},
    {id:'drill',type:'hole',inputs:['base'],references:{sketches:[sketch.id],features:['base'],topology:[]},params},
  ]};
  const baseRun=await regenerateFeatures({features:[document.features[0]],sketches:[]});
  try{
    const face=baseRun.finalShape.topology.find(ref=>ref.kind==='face' && ref.descriptor?.normal?.y>.99);
    assert.ok(face,'positive Y support face exists');
    sketch.support=structuredClone(face);
    document.features[1].references.topology=[structuredClone(face)];
  }finally{releaseRegeneration(baseRun);}
  const saved=JSON.parse(JSON.stringify(document));
  const compiled=compileKernelFeatureTree(saved);
  assert.equal(compiled.ok,true,JSON.stringify(compiled.issues));
  const run=await regenerateFeatures({...compiled.document,features:compiled.features});
  try{
    assert.equal(run.ok,true,JSON.stringify(run.issues));
    assert.equal(brepContainsPoint(run.finalShape,{x:-3.81,y:2,z:2.54}),false);
    assert.equal(brepContainsPoint(run.finalShape,{x:0,y:2,z:2.54}),true);
    const mass=await shapeMassProperties(run.finalShape);
    const radius=1.11125/2,tip=radius/Math.tan(59*Math.PI/180);
    assert.equal(brepContainsPoint(run.finalShape,{x:-3.81,y:2.54-1.905-tip*.5,z:2.54}),false);
    assert.equal(brepContainsPoint(run.finalShape,{x:-3.81+radius*.75,y:2.54-1.905-tip*.5,z:2.54}),true);
    assert.ok(Math.abs(mass.volume-(12.7*5.08*5.08-Math.PI*radius**2*(1.905+tip/3)))<1e-5);
  }finally{releaseRegeneration(run);}
});

test('old flat-bottom holes retain geometry and through holes omit the drill point',()=>{
  const base={holeType:'simple',diameter:1,depth:2,endCondition:'blind'};
  assert.equal(holeWizardSolids(base).solids.length,1);
  assert.equal(holeWizardSolids({...base,drillPointAngle:180}).solids.length,1);
  assert.equal(holeWizardSolids({...base,drillPointAngle:118,endCondition:'through-all'}).solids.length,1);
  assert.throws(()=>holeWizardSolids({...base,drillPointAngle:0}),/Drill point angle/);
});

test('inch reference presets preserve fractional drill and flat machine screw geometry',()=>{
  assert.deepEqual(holeWizardSizeChoices('ANSI Inch','simple','fractional-drill'),['custom','7/16-drill']);
  assert.ok(Math.abs(holeTableRow('7/16-drill').diameterMm-7/16*25.4)<1e-9);
  assert.ok(Math.abs(holeTableRow('3/8-hex').cboreDepthMm-.300*25.4)<1e-9);
  const flat=holeWizardSolids({holeType:'countersink',standardSize:'3/8-flat',endCondition:'blind',depth:3.81});
  assert.equal(flat.hole.csinkAngle,82);
  assert.ok(Math.abs(flat.hole.csinkDiameterMm-.717*25.4)<1e-9);
  assert.throws(()=>holeWizardSolids({holeType:'counterbore',standardSize:'3/8-hex',fit:'loose'}),/no verified loose/);
  const tap=holeWizardSolids({holeType:'tapped',standardSize:'1/4-20',endCondition:'blind',depth:2.54,drillPointAngle:118});
  assert.ok(Math.abs(tap.solids[0].diameter-.201*2.54)<1e-9);
  assert.equal(tap.hole.threadPreset,'unc-quarter-20');
});
