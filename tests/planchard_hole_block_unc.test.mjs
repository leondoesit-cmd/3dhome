import test from 'node:test';
import assert from 'node:assert/strict';
import { holeCallout, holeTableRow, holeWizardSolids, holeWizardThread } from '../js/cad_hole_wizard.js';
import { createFeatureDefinition, createPartDocument } from '../js/core/parametric_document.js';
import { holeCallouts, holeTopologyAnchor } from '../js/core/hole_callout.js';
import { faceFrameOrigin } from '../js/core/frame.js';
import { holeCutRecords, syncHoleCutPlacement } from '../js/core/hole_geometry.js';

test('the 1/4-20 Hole Wizard uses a #7 drill and a Unified 2B thread', () => {
  const row = holeTableRow('1/4-20 UNC');
  assert.equal(row.tapDrillMm, 5.1054);
  const params = {holeType:'tapped',standardSize:'1/4-20',endCondition:'blind',depth:2.54,displayUnit:'in'};
  const {hole,solids} = holeWizardSolids(params);
  assert.equal(hole.standard,'ASME B1.1 UNC');
  assert.equal(hole.toleranceClass,'2B');
  assert.equal(solids[0].diameter,0.51054);
  assert.equal(solids[0].depth,2.54);
  const thread = holeWizardThread(params,{origin:{x:1,y:2,z:1},axis:{x:0,y:-1,z:0}});
  assert.equal(thread.spec.family,'unified-thread');
  assert.equal(thread.spec.pitchMm,1.27);
  assert.equal(thread.spec.toleranceClass,'2B');
  assert.match(thread.callout,/1\/4-20 UNC 2B.*1 in/);
  assert.match(holeCallout(params),/1\/4-20 UNC 2B.*1 in/);
});

test('inch document hole callouts retain fractional drill dimensions after rebuild', () => {
  const def=createPartDocument();
  def.context.units.length='in';
  createFeatureDefinition(def,'box',{id:'stock',params:{x:0,y:0,z:0,w:5.08,h:5.08,d:12.7}});
  def.sketches.push({id:'centres',plane:'top',points:[{id:'p',x:0,y:0}],entities:[{id:'circle',type:'circle',c:'p',r:0.1}]});
  createFeatureDefinition(def,'hole',{id:'drill',inputs:['stock'],params:{holeType:'simple',standardSize:'custom',diameter:1.11125,depth:1.905,endCondition:'blind',sketchId:'centres',layout:'sketch'},references:{sketches:['centres'],features:['stock']}});
  assert.equal(holeCallouts(def)[0].callout,'Ø0.4375 in ↓0.75 in');
});

test('face sketch bounds anchor stays fixed when earlier holes shift the face centroid', () => {
  const face={origin:{x:2.54,y:5.08,z:6.394},normal:{x:0,y:1,z:0},bounds:{min:{x:0,y:5.0799999,z:0},max:{x:5.08,y:5.0800001,z:12.7}}};
  assert.deepEqual(faceFrameOrigin(face,'bounds-center'),{x:2.54,y:5.08,z:6.35});
  assert.equal(faceFrameOrigin(face).z,6.394);
});

test('hole callout leader selects its own circular edge over inherited prior-hole edges', () => {
  const feature='tap4', basis={right:{x:1,y:0,z:0},up:{x:0,y:0,z:-1},forward:{x:0,y:-1,z:0}};
  const circle=(z,radius=0.25527)=>({kind:'edge',descriptor:{curve:'circle',origin:{x:2.54,y:5.08,z},radius}});
  const index=new Map([
    [feature+':edge:generated:circle:1',circle(7.62,0.5159)],
    [feature+':tool:edge:generated:circle:1',circle(10.16)],
    [feature+':face:generated:plane:1',{kind:'face',descriptor:{surface:'plane',origin:{x:2.54,y:5.08,z:7.62}}}],
  ]);
  const anchor=holeTopologyAnchor(index,basis,feature,{u:2.54,v:-10.16});
  assert.equal(anchor.pid,feature+':tool:edge:generated:circle:1');
  assert.equal(holeTopologyAnchor(index,basis,feature,{u:2.54,v:-11.43}),null);
});

test('compatibility hole cut follows a re-anchored placement sketch', () => {
  const feature={id:'tap4',type:'hole',params:{holeType:'tapped',standardSize:'1/4-20',endCondition:'blind',depth:2.54,layout:'sketch',profileEntityIds:['c']}};
  const sketch={plane:'top',frameSpace:'local',frame:{origin:{x:2.54,y:5.08,z:6.394},xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:0,z:-1},normal:{x:0,y:1,z:0}},points:[{id:'p',x:0,y:-3.81}],entities:[{id:'c',type:'circle',c:'p',r:0.25527}]};
  const old=holeCutRecords(feature.params,sketch,['c']);old[0].featureId=feature.id;
  const part={cuts3d:old};
  sketch.frame.origin.z=6.35;
  assert.equal(syncHoleCutPlacement(part,feature,sketch),true);
  assert.equal(part.cuts3d[0].params.frame.origin.z-part.cuts3d[0].params.centres[0].v,10.16);
  assert.equal(syncHoleCutPlacement(part,feature,sketch),false);
});
