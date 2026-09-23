import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec} from '../js/cabinet.js';
import {createCabinetProductionJob,validateCabinetProductionJob} from '../js/cabinet_production_workflow.js';
import {cabinetProductionParts} from '../js/cabinet_production_parts.js';
import {cabinetManufacturingReport} from '../js/cabinet_manufacturing.js';
import {panelsOf,quote} from '../js/nest.js';
import {
  CABINET_PRODUCTION_PRESETS, cabinetProductionPreset, inferCabinetProductType,
  previewCabinetProductionPreset, applyCabinetProductionPreset,
  standardsContextForCabinetPreset, cabinetDesignToProductionReadiness,
} from '../js/cabinet_production_presets.js';

const cabinet=(id='cab',preset='k_base_drawers')=>({id,type:'cabsys',w:60,h:90,d:60,cab:makeSpec(preset,60,90,60)});

test('regional presets are immutable, explicit starting points rather than approval claims',()=>{
  assert.deepEqual(CABINET_PRODUCTION_PRESETS.map(value=>value.id),['manual','global-metric','eu-system32','uk-system32','us-frameless','israel-metric']);
  for(const value of CABINET_PRODUCTION_PRESETS){
    assert.ok(Object.isFrozen(value));assert.ok(Object.isFrozen(value.construction));assert.ok(Object.isFrozen(value.standards));
    assert.equal(value.schema,'modelforge-cabinet-production-preset');assert.ok(value.notes.length);assert.ok(Object.isFrozen(value.references));
  }
  assert.equal(cabinetProductionPreset('missing'),null);
});

test('preview is non-mutating and application records exact nominal inch values',()=>{
  const item=cabinet(),before=structuredClone(item),preview=previewCabinetProductionPreset([item],'us-frameless');
  assert.deepEqual(item,before);assert.equal(preview.changedCabinets,1);
  assert.ok(preview.changes[0].fields.some(field=>field.field==='panel'&&field.after===1.905));
  assert.ok(preview.stockIssues.some(issue=>issue.code==='stock-thickness-mismatch'&&issue.message.includes('19.05 mm')));
  applyCabinetProductionPreset([item],'us-frameless');
  assert.equal(item.cab.panel,1.905);assert.equal(item.cab.shelf,1.905);assert.equal(item.cab.back,0.635);assert.equal(item.cab.gap,0.3175);assert.equal(item.cab.plinth,10.16);
  assert.deepEqual(item.cab.productionConvention,{presetId:'us-frameless',presetVersion:1,region:'United States',units:'in',constructionSystem:'frameless',boringPitchMm:32,boringSetbackMm:37});
});

test('nominal inch boards cannot silently use metric stock in a cut plan or reviewed revision',()=>{
  const item=cabinet();applyCabinetProductionPreset([item],'us-frameless');
  const manifest=cabinetProductionParts([item]);
  const mismatches=manifest.issues.filter(issue=>issue.code==='stock-thickness-mismatch');
  assert.ok(mismatches.length>0);
  for(const issue of mismatches){
    const part=manifest.parts.find(part=>part.id===issue.partId);
    assert.equal(part.sheetId,null);
    assert.ok(part.stockCandidateId);
    assert.ok(!panelsOf([item]).some(panel=>panel.id===part.id));
  }
  const estimate=quote([item]);
  assert.equal(estimate.manufacturingReviewRequired,true);
  assert.ok(estimate.productionIssues.some(issue=>issue.code==='stock-thickness-mismatch'));
  const job=createCabinetProductionJob([item]);
  assert.equal(validateCabinetProductionJob(job,[item]).valid,false);
  assert.ok(cabinetManufacturingReport([item]).issues.some(issue=>issue.code==='stock-thickness-mismatch'));
  const readiness=cabinetDesignToProductionReadiness([item],{job});
  assert.equal(readiness.stages.find(stage=>stage.id==='stock').status,'blocked');
});

test('floating shelves keep slab geometry while still recording the convention',()=>{
  const item={id:'float',type:'cabsys',w:120,h:120,d:28,cab:makeSpec('sh_float',120,120,28)},before=item.cab.panel;
  const result=applyCabinetProductionPreset([item],'us-frameless');
  assert.equal(item.cab.panel,before);assert.equal(item.cab.productionConvention.presetId,'us-frameless');assert.equal(result.skipped.length,1);
});

test('preset standards scope infers only homogeneous product families and preserves evidence',()=>{
  const kitchen=cabinet(),wardrobe=cabinet('wardrobe','w_classic');
  assert.equal(inferCabinetProductType([kitchen]),'kitchen');assert.equal(inferCabinetProductType([kitchen,wardrobe]),'unknown');
  assert.equal(inferCabinetProductType([kitchen,{id:'utility',cab:{fam:'laundry'}}]),'unknown');
  const context=standardsContextForCabinetPreset('eu-system32',[kitchen],{facts:{domesticUse:true},evidence:[{ruleId:'x'}]});
  assert.equal(context.market,'EU');assert.equal(context.productType,'kitchen');assert.equal(context.facts.domesticUse,true);assert.equal(context.evidence.length,1);
  assert.deepEqual(context.conventionPreset.focus,['en14749','reach','iso7170']);
});

test('readiness exposes conservative design-to-production blockers and stale revisions',()=>{
  const empty=cabinetDesignToProductionReadiness([]);assert.equal(empty.summary.blocked,5);assert.equal(empty.stages.find(stage=>stage.id==='stock').status,'blocked');
  const item=cabinet();
  let report=cabinetDesignToProductionReadiness([item],{standardsContext:{market:'US',productType:'kitchen'}});
  assert.equal(report.status,'blocked');assert.equal(report.machineReady,false);assert.equal(report.productionRelease,false);
  assert.equal(report.stages.find(stage=>stage.id==='design').status,'complete');
  assert.equal(report.stages.find(stage=>stage.id==='convention').status,'review');
  assert.equal(report.stages.find(stage=>stage.id==='stock').status,'blocked');
  assert.equal(report.stages.find(stage=>stage.id==='operations').status,'blocked');
  const job=createCabinetProductionJob([item]);
  report=cabinetDesignToProductionReadiness([item],{job,standardsContext:{market:'US',productType:'kitchen'}});
  assert.equal(report.stages.find(stage=>stage.id==='revision').status,'review');
  item.w+=1;
  report=cabinetDesignToProductionReadiness([item],{job,standardsContext:{market:'US',productType:'kitchen'}});
  assert.equal(report.stages.find(stage=>stage.id==='revision').status,'blocked');
});

test('changing a recorded construction value flags convention drift until it is reconciled',()=>{
  const item=cabinet();applyCabinetProductionPreset([item],'global-metric');
  let stage=cabinetDesignToProductionReadiness([item]).stages.find(value=>value.id==='convention');
  assert.equal(stage.status,'complete');
  item.cab.panel=1.9;
  stage=cabinetDesignToProductionReadiness([item]).stages.find(value=>value.id==='convention');
  assert.equal(stage.status,'review');
  assert.ok(stage.issues.some(issue=>issue.code==='convention-drift'&&issue.message.includes('panel')));
});

test('preset metadata participates in the production revision',()=>{
  const item=cabinet(),job=createCabinetProductionJob([item]);
  applyCabinetProductionPreset([item],'global-metric');
  assert.equal(job.manifest.sourceItems[0].cab.productionConvention,undefined);
  assert.notEqual(createCabinetProductionJob([item]).revision,job.revision);
});
