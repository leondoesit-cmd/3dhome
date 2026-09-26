import { cabinetProductionParts } from './cabinet_production_parts.js';
import { cabinetManufacturingReport } from './cabinet_manufacturing.js';
import { cabinetSavedJoineryReport } from './cabinet_joinery.js';

// Coverage describes available evidence, never machine qualification. Saved
// mating reviews remain separate from the complete-recipe drilling inventory.
export function cabinetOperationCoverage(items=[],recipes=[]) {
  const production=cabinetProductionParts(items),manufacturing=cabinetManufacturingReport(items,recipes),joinery=cabinetSavedJoineryReport(items);
  const report={schema:'modelforge-cabinet-operation-coverage',version:1,units:'mm',status:'review-required',machineReady:false,parts:[],totals:{parts:0,drilling:0,joineryReview:0,completeDrilling:0,explicitNoDrill:0,genericPartial:0,missing:0,unsupported:0},issues:[]};
  for(const part of production.parts){
    const entry=manufacturing.items.find(item=>item.id===part.itemId&&item.index===part.itemIndex+1);
    const panels=(entry?.panels||[]).filter(panel=>panel.id===part.id);
    const drilling=panels.flatMap(panel=>panel.holes||[]);
    const unsupported=part.geometry!=='rectangle'||part.stockRole==='glass';
    const complete=panels.length===1&&!!panels[0].recipeSource;
    const coverage=unsupported?'unsupported':complete?(drilling.length?'complete-drilling':'explicit-no-drill'):panels.length?'generic-partial':'missing';
    const joineryReviewCount=joinery.operations.filter(op=>op.panelId===part.id).length;
    const issues=(entry?.issues||[]).filter(issue=>!issue.panelId||issue.panelId===part.id||issue.panelId===part.partId);
    report.parts.push({id:part.id,itemId:part.itemId,partId:part.partId,role:part.role,coverage,drillingCount:drilling.length,
      faces:{A:drilling.filter(h=>h.face==='A').length,B:drilling.filter(h=>h.face==='B').length},joineryReviewCount,
      noDrillReason:complete&&!drilling.length?panels[0].noDrillReason:null,issues});
    report.totals.parts++;report.totals.drilling+=drilling.length;report.totals.joineryReview+=joineryReviewCount;
    report.totals[{'complete-drilling':'completeDrilling','explicit-no-drill':'explicitNoDrill','generic-partial':'genericPartial',missing:'missing',unsupported:'unsupported'}[coverage]]++;
  }
  report.parts.sort((a,b)=>a.id.localeCompare(b.id));
  report.issues=[...production.issues,...manufacturing.issues,...joinery.issues].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return report;
}
