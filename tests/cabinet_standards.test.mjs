import test from 'node:test';
import assert from 'node:assert/strict';
import {CABINET_STANDARD_PROFILES,createCabinetStandardsContext,cabinetDesignSignature,evaluateCabinetStandards} from '../js/cabinet_standards.js';
const items=[{id:1,w:60,h:90,d:60,cab:{material:'mdf',hinges:'a'}}];
const rule=(report,id)=>report.rules.find(r=>r.id===id);
test('catalog is versioned, sourced, immutable and includes all eight families',()=>{
  assert.equal(CABINET_STANDARD_PROFILES.length,8);
  for(const p of CABINET_STANDARD_PROFILES){assert.ok(p.edition);assert.match(p.source,/^https:/);assert.ok(Object.isFrozen(p));}
});
test('unknown markets and missing facts never produce applicability or compliance',()=>{
  const report=evaluateCabinetStandards(items,{market:'IL'});
  assert.equal(report.certified,false);assert.equal(report.overallStatus,'not-evaluated');
  assert.ok(report.rules.every(r=>r.status==='not-evaluated'&&r.applicability==='unknown'));
  assert.equal(rule(evaluateCabinetStandards(items,{market:'US'}),'csu').applicability,'unknown');
  assert.equal(rule(evaluateCabinetStandards(items,{market:'US',productType:'bookcase'}),'csu').status,'not-applicable');
});
test('CSU applicability uses explicit prescribed-volume and date facts',()=>{
  const facts={freestanding:true,bedroomClothingStorage:true,hasDrawersOrHingedDoors:true,heightMm:700,massKg:14,enclosedVolumeLitres:91,manufacturedOn:'2026-01-01'};
  const run=f=>rule(evaluateCabinetStandards(items,{market:'US',productType:'wardrobe',facts:f}),'csu');
  assert.equal(run(facts).applicability,'applicable');assert.equal(run(facts).status,'not-evaluated');
  assert.equal(run({...facts,massKg:undefined}).applicability,'unknown');
  assert.equal(run({...facts,massKg:13}).status,'not-applicable');
  assert.equal(run({...facts,freestanding:false}).status,'not-applicable');
  assert.equal(run({...facts,manufacturedOn:undefined}).applicability,'unknown');
});
test('evidence is scoped to exact design, context, edition and version and cannot self-verify',()=>{
  const c=createCabinetStandardsContext({market:'US',productType:'kitchen'});
  const first=evaluateCabinetStandards(items,c);
  c.evidence=[{ruleId:'kcma',edition:'2022',designSignature:first.designSignature,designVersion:1,reference:'Lab report 123',result:'pass',verified:true}];
  let r=rule(evaluateCabinetStandards(items,c),'kcma');
  assert.equal(r.evidence[0].current,true);assert.equal(r.evidence[0].verified,false);assert.equal(r.status,'not-evaluated');
  r=rule(evaluateCabinetStandards([{...items[0],w:61}],c),'kcma');assert.equal(r.evidence[0].current,false);
  r=rule(evaluateCabinetStandards(items,{...c,designVersion:2}),'kcma');assert.equal(r.evidence[0].current,false);
  r=rule(evaluateCabinetStandards(items,{...c,facts:{domesticUse:true}}),'kcma');assert.equal(r.evidence[0].current,false);
  c.evidence[0].edition='2017';assert.equal(rule(evaluateCabinetStandards(items,c),'kcma').evidence[0].current,false);
});
test('canonical signature ignores key ordering but binds material/hardware',()=>{
  assert.equal(cabinetDesignSignature([{a:1,b:2}]),cabinetDesignSignature([{b:2,a:1}]));
  assert.notEqual(cabinetDesignSignature(items),cabinetDesignSignature([{...items[0],cab:{material:'plywood',hinges:'a'}}]));
});
test('ADA dimensional screening is limited to explicit scoped fixed surfaces',()=>{
  const facts={adaRequired:true,ada8043Required:true,adjustableWorkSurface:false,workSurfaceHeightMm:865,workSurfaceWidthMm:760};
  const run=f=>evaluateCabinetStandards(items,{market:'US',facts:f});
  assert.equal(rule(run(facts),'ada-height').status,'pass');assert.equal(rule(run(facts),'ada-width').status,'pass');
  assert.equal(run(facts).overallStatus,'not-evaluated');assert.equal(rule(run(facts),'ada').status,'not-evaluated');
  assert.equal(rule(run({...facts,workSurfaceHeightMm:866}),'ada-height').status,'fail');
  assert.equal(rule(run({...facts,adjustableWorkSurface:true}),'ada-height').status,'not-evaluated');
  assert.equal(rule(run({...facts,ada8043Required:undefined}),'ada-height').status,'not-evaluated');
  assert.equal(rule(run({...facts,workSurfaceHeightMm:0}),'ada-height').status,'not-evaluated');
});
test('REACH date/exemptions and material uncertainty remain explicit',()=>{
  const run=f=>rule(evaluateCabinetStandards(items,{market:'EU',facts:f}),'reach');
  assert.equal(run({}).applicability,'unknown');
  assert.equal(run({placedOnMarketOn:'2026-08-06',reachExempt:false}).applicability,'applicable');
  assert.equal(run({placedOnMarketOn:'2026-08-05',reachExempt:false}).status,'not-applicable');
  assert.equal(run({reachExempt:true}).status,'not-applicable');
  assert.equal(rule(evaluateCabinetStandards(items,{market:'US'}),'tsca').applicability,'unknown');
});
test('empty designs cannot pass and inputs remain unchanged',()=>{
  const c={market:'US',facts:{adaRequired:true,ada8043Required:true,adjustableWorkSurface:false,workSurfaceHeightMm:800}};
  const before=JSON.stringify(c);assert.ok(evaluateCabinetStandards([],c).rules.every(r=>r.status==='not-evaluated'));assert.equal(JSON.stringify(c),before);
});
test('malformed context, dates and non-cabinet selections remain unevaluated',()=>{
  for(const context of [null,{evidence:{}},{facts:'bad',evidence:12}])assert.doesNotThrow(()=>evaluateCabinetStandards(items,context));
  assert.ok(evaluateCabinetStandards([{id:2,type:'box'}],{market:'US'}).rules.every(r=>r.status==='not-evaluated'));
  assert.equal(rule(evaluateCabinetStandards(items,{market:'EU',facts:{placedOnMarketOn:'2026-02-30',reachExempt:false}}),'reach').applicability,'unknown');
});
test('signature normalizes cabinet order and ignores visual door animation',()=>{
  const a={...items[0],cab:{...items[0].cab,open:0,runtimeState:{animation:0}}},b={...items[0],id:2};
  assert.equal(cabinetDesignSignature([a,b]),cabinetDesignSignature([b,{...a,runtimeState:{frame:3},cab:{...a.cab,open:1,runtimeState:{animation:1}}}]));
  assert.equal(cabinetDesignSignature(items,{market:'US'}),evaluateCabinetStandards(items,{market:'US'}).designSignature);
});
