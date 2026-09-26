import { cabinetProductionStaleness } from './cabinet_production_workflow.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>value&&typeof value==='object'?Array.isArray(value)?'['+value.map(stable).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const text=value=>typeof value==='string'&&value.trim().length>0;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
// A 1e-9 mm comparison margin only absorbs binary-number arithmetic noise.
const comparisonEpsilonMm=1e-9;
const scope={machineReady:false,certified:false,productionRelease:false,scope:'operator-inspection-review-only'};
function criterion(job,value){
  if(!value||!text(value.id)||!text(value.partId)||!['finished','substrate','rough'].includes(value.basis)||!['length','width','thickness'].includes(value.dimension))throw new Error('Characteristic requires an ID, current part ID, dimension basis and dimension.');
  const part=job.manifest.parts.find(p=>p.id===value.partId),nominalMm=part?.[value.basis]?.[value.dimension];
  if(!finite(nominalMm)||nominalMm<=0)throw new Error('The selected part dimension is unknown or invalid.');
  if(!finite(value.minusMm)||!finite(value.plusMm)||value.minusMm<0||value.plusMm<0||value.minusMm>nominalMm||!Number.isFinite(nominalMm+value.plusMm))throw new Error('Supply explicit finite nonnegative minus/plus tolerances in millimetres within a valid dimension range.');
  return {id:value.id.trim(),partId:value.partId,basis:value.basis,dimension:value.dimension,nominalMm,minusMm:value.minusMm,plusMm:value.plusMm};
}
function characteristicBinding(revision,c){return stable({revision,characteristic:c});}
function planBinding(plan){return stable({planId:plan.planId,revision:plan.revision,characteristics:plan.characteristics});}
function checkJob(job,items){
  if(!job||!text(job.revision)||!Array.isArray(job.manifest?.parts)||job.machineReady!==false||job.productionRelease!==false)throw new Error('Inspection requires a valid review job.');
  if(cabinetProductionStaleness(job,items||job.manifest.sourceItems).stale)throw new Error('Inspection job revision is stale or its snapshot was changed.');
}
export function createCabinetInspectionPlan(job,{planId='inspection',characteristics=[]}={}){
  checkJob(job);
  if(!text(planId)||!Array.isArray(characteristics)||!characteristics.length)throw new Error('Inspection plan needs an ID and at least one explicit characteristic.');
  const list=characteristics.map(value=>criterion(job,value)),ids=new Set(),dimensions=new Set();
  for(const c of list){const key=stable([c.partId,c.basis,c.dimension]);if(ids.has(c.id)||dimensions.has(key))throw new Error('Duplicate characteristic ID or part/basis/dimension.');ids.add(c.id);dimensions.add(key);}
  const plan={schema:'modelforge-cabinet-inspection',version:1,planId:planId.trim(),revision:job.revision,...scope,characteristics:list,records:[]};plan.binding=planBinding(plan);return freeze(plan);
}
function checkRecord(record,plan,previous){
  const c=plan.characteristics.find(value=>value.id===record?.characteristicId);
  if(!c||record.revision!==plan.revision||record.characteristicBinding!==characteristicBinding(plan.revision,c))throw new Error('Measurement is not bound to the current characteristic and revision.');
  if(!finite(record.measuredMm)||record.measuredMm<=0)throw new Error('Measured size must be a positive finite millimetre value.');
  for(const key of ['instrumentId','calibrationReference','operator','timestamp'])if(!text(record[key]))throw new Error('Measurement requires '+key+'.');
  const timestamp=Date.parse(record.timestamp);
  if(!Number.isFinite(timestamp)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.timestamp)||new Date(timestamp).toISOString()!==(record.timestamp.includes('.')?record.timestamp:record.timestamp.replace('Z','.000Z')))throw new Error('Measurement timestamp must be a valid UTC ISO timestamp.');
  if(typeof record.note!=='string'||record.sequence!==previous.length+1)throw new Error('Invalid measurement note or history sequence.');
  const earlier=previous.filter(value=>value.characteristicId===c.id).at(-1);
  if(earlier&&timestamp<Date.parse(earlier.timestamp))throw new Error('A new measurement cannot precede the earlier measurement timestamp.');
}
export function validateCabinetInspectionPlan(plan,job,items){
  const issues=[];
  try{
    checkJob(job,items);
    if(!plan||plan.schema!=='modelforge-cabinet-inspection'||plan.version!==1||plan.revision!==job.revision||plan.machineReady!==false||plan.certified!==false||plan.productionRelease!==false||plan.scope!==scope.scope)throw new Error('Inspection plan has invalid claims or a different revision.');
    const expected=createCabinetInspectionPlan(job,{planId:plan.planId,characteristics:plan.characteristics});
    if(stable(plan.characteristics)!==stable(expected.characteristics)||plan.binding!==expected.binding)throw new Error('Inspection nominal dimensions or tolerance binding was changed.');
    if(!Array.isArray(plan.records))throw new Error('Inspection records must be an array.');
    const checked=[];for(const record of plan.records){checkRecord(record,plan,checked);checked.push(record);}
  }catch(error){issues.push(String(error.message||error));}
  return {valid:issues.length===0,issues,...scope};
}
function assertPlan(plan,job,items){const result=validateCabinetInspectionPlan(plan,job,items);if(!result.valid)throw new Error(result.issues.join(' '));}
export function addCabinetInspectionCharacteristic(plan,job,characteristic){
  assertPlan(plan,job);const next=clone(createCabinetInspectionPlan(job,{planId:plan.planId,characteristics:[...plan.characteristics,characteristic]}));next.records=clone(plan.records);return freeze(next);
}
export function recordCabinetInspection(plan,job,items,record){
  if(!Array.isArray(items))throw new Error('Live items are required to record an inspection.');assertPlan(plan,job,items);
  const c=plan.characteristics.find(value=>value.id===record?.characteristicId);if(!c)throw new Error('Unknown inspection characteristic.');
  const next={sequence:plan.records.length+1,revision:plan.revision,characteristicId:c.id,characteristicBinding:characteristicBinding(plan.revision,c),measuredMm:record.measuredMm,instrumentId:record.instrumentId,calibrationReference:record.calibrationReference,operator:record.operator,timestamp:record.timestamp,note:record.note??'',imported:false};
  checkRecord(next,plan,plan.records);return freeze({...clone(plan),records:[...clone(plan.records),next]});
}
export function importCabinetInspectionPlan(value,job,items){
  const plan=typeof value==='string'?JSON.parse(value):clone(value);assertPlan(plan,job,items);
  plan.records=plan.records.map(record=>({...record,imported:true}));return freeze(plan);
}
export function cabinetInspectionReport(plan,job,items){
  const validation=validateCabinetInspectionPlan(plan,job,items),history=Array.isArray(plan?.records)?clone(plan.records).filter(record=>record&&typeof record==='object'):[];
  const characteristics=(Array.isArray(plan?.characteristics)?plan.characteristics:[]).filter(c=>c&&typeof c==='object').map(c=>{
    const records=history.filter(record=>record.characteristicId===c.id),latest=records.at(-1)||null;
    const status=!validation.valid?'stale':!latest?'not-measured':latest.measuredMm>=c.nominalMm-c.minusMm-comparisonEpsilonMm&&latest.measuredMm<=c.nominalMm+c.plusMm+comparisonEpsilonMm?'pass':'fail';
    return {...clone(c),status,latest,history:records};
  });
  const status=!validation.valid?'stale':characteristics.some(c=>c.status==='fail')?'fail':characteristics.some(c=>c.status==='not-measured')?'not-measured':'pass';
  return freeze({schema:'modelforge-cabinet-inspection-report',version:1,planId:plan?.planId||'',revision:plan?.revision||'',status,issues:validation.issues,comparisonEpsilonMm,characteristics,history,...scope});
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const number=value=>String(value??'');
function csv(value){let valueText=String(value??'');if(/^\s*[=+@-]/.test(valueText))valueText="'"+valueText;return '"'+valueText.replace(/"/g,'""')+'"';}
export function cabinetInspectionCSV(plan,job,items){
  const report=cabinetInspectionReport(plan,job,items),rows=[['Scope','Plan','Revision','Characteristic','Part','Basis','Dimension','Nominal mm','Minus mm','Plus mm','Status','Sequence','Latest','Measured mm','Instrument','Calibration reference','Operator','Timestamp','Note','Imported unverified','Comparison epsilon mm']];
  for(const c of report.characteristics){const records=c.history.length?c.history:[null];for(const record of records)rows.push(['OPERATOR REVIEW ONLY — NOT CERTIFICATION',report.planId,report.revision,c.id,c.partId,c.basis,c.dimension,number(c.nominalMm),number(c.minusMm),number(c.plusMm),record&&record.sequence!==c.latest?.sequence?'historical':c.status,record?.sequence,record&&record.sequence===c.latest?.sequence?'yes':'no',number(record?.measuredMm),record?.instrumentId,record?.calibrationReference,record?.operator,record?.timestamp,record?.note,record?.imported?'yes':'no',comparisonEpsilonMm]);}
  return rows.map(row=>row.map(csv).join(',')).join('\r\n');
}
export function cabinetInspectionHTML(plan,job,items){
  const report=cabinetInspectionReport(plan,job,items);
  const rows=report.characteristics.map(c=>`<tr><td>${esc(c.id)}<br>${esc(c.partId)}</td><td>${esc(c.basis)} / ${esc(c.dimension)}</td><td>${esc(number(c.nominalMm))} −${esc(number(c.minusMm))} / +${esc(number(c.plusMm))}</td><td>${esc(c.status)}</td><td>${esc(number(c.latest?.measuredMm))}</td></tr>`).join('');
  const history=report.history.map(r=>`<tr><td>${esc(r.sequence)} / ${esc(r.characteristicId)}</td><td>${esc(number(r.measuredMm))}</td><td>${esc(r.instrumentId)} / ${esc(r.calibrationReference)}</td><td>${esc(r.operator)}<br>${esc(r.timestamp)}</td><td>${r.imported?'IMPORTED, UNVERIFIED — ':''}${esc(r.note)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(report.planId)} inspection</title><style>body{font:13px sans-serif;margin:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #777;padding:7px;overflow-wrap:anywhere;text-align:left}h1,p{overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}strong{color:#922}</style><body><h1>${esc(report.planId)} — dimensional inspection</h1><p>Revision ${esc(report.revision)} · Status ${esc(report.status)} · All dimensions in mm.</p><strong>OPERATOR REVIEW ONLY — NOT CERTIFICATION OR PRODUCTION RELEASE</strong><p>Tolerances are explicitly supplied by the operator and are not rounded for comparisons. A 0.000000001 mm numerical comparison margin absorbs binary arithmetic noise. A pass only compares the latest recorded measurement with those limits. Instrument and calibration references are recorded claims, not independently verified. All prior measurements are retained below.</p>${report.issues.map(issue=>`<p>${esc(issue)}</p>`).join('')}<table><thead><tr><th>Characteristic / part</th><th>Basis / dimension</th><th>Nominal / tolerance mm</th><th>Result</th><th>Latest measured mm</th></tr></thead><tbody>${rows}</tbody></table><h2>Measurement history</h2><table><thead><tr><th>Sequence / characteristic</th><th>Measured mm</th><th>Instrument / calibration</th><th>Operator / timestamp</th><th>Note</th></tr></thead><tbody>${history}</tbody></table></body></html>`;
}
