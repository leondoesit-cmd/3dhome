/**
 * Optional cabinetmaking starting points.
 *
 * These are documented shop conventions, not laws, certifications or hidden
 * claims that every shop in a region builds the same way. Applying one changes
 * only construction values the cabinet model already understands. Machine,
 * hardware and project-specific dimensions remain explicit elsewhere.
 */
import { checkCab, normalizeSpec } from './cabinet.js';
import { cabinetProductionParts } from './cabinet_production_parts.js';
import { cabinetOperationCoverage } from './cabinet_operation_coverage.js';
import { evaluateCabinetStandards, createCabinetStandardsContext } from './cabinet_standards.js';
import { cabinetProductionStaleness } from './cabinet_production_workflow.js';

export const CABINET_PRODUCTION_PRESET_VERSION = 1;

const preset = value => Object.freeze({
  schema: 'modelforge-cabinet-production-preset',
  version: CABINET_PRODUCTION_PRESET_VERSION,
  ...value,
  construction: Object.freeze({...value.construction}),
  standards: Object.freeze({...value.standards, focus: Object.freeze([...(value.standards?.focus || [])])}),
  notes: Object.freeze([...(value.notes || [])]),
  references: Object.freeze([...(value.references || [])].map(reference=>Object.freeze({...reference}))),
});

const SYSTEM32_REFERENCE=Object.freeze({label:'Hettich System 32 hole-line reference',url:'https://hta.hettich.com/en-de/further-products/assembly-machinery/hole-lines'});

export const CABINET_PRODUCTION_PRESETS = Object.freeze([
  preset({
    id: 'manual', label: 'Manual / shop-defined', labelHe:'ידני / לפי הסדנה', region: 'Custom', regionHe:'מותאם', units: 'mm',
    construction: {system: 'shop-defined', panelMm:null, shelfMm:null, backMm:null, revealMm:null, plinthMm:null, boringPitchMm:null, boringSetbackMm:null},
    standards: {market:'international', focus:['iso7170']},
    notes: ['Makes no dimensional changes. Complete the construction and standards records explicitly.'],
  }),
  preset({
    id: 'global-metric', label: 'Global metric frameless', labelHe:'גלובלי מטרי · ללא מסגרת', region: 'International', regionHe:'בינלאומי', units: 'mm',
    construction: {system:'frameless', panelMm:18, shelfMm:18, backMm:8, revealMm:3, plinthMm:null, boringPitchMm:32, boringSetbackMm:37},
    standards: {market:'international', focus:['iso7170']},
    notes: ['Neutral metric starting point; plinth height stays project-defined.', 'ISO 7170 supplies test methods, not acceptance criteria.'],
    references:[SYSTEM32_REFERENCE],
  }),
  preset({
    id: 'eu-system32', label: 'EU metric · frameless System 32', labelHe:'האיחוד האירופי · System 32 ללא מסגרת', region: 'European Union', regionHe:'האיחוד האירופי', units: 'mm',
    construction: {system:'frameless-system-32', panelMm:18, shelfMm:18, backMm:8, revealMm:3, plinthMm:null, boringPitchMm:32, boringSetbackMm:37},
    standards: {market:'EU', focus:['en14749','reach','iso7170']},
    notes: ['Project-specific plinth, worktop and appliance dimensions are not overwritten.', 'REACH applicability depends on placing-on-market date, materials and exemptions.'],
    references:[SYSTEM32_REFERENCE],
  }),
  preset({
    id: 'uk-system32', label: 'UK metric · frameless System 32', labelHe:'בריטניה · System 32 ללא מסגרת', region: 'United Kingdom', regionHe:'בריטניה', units: 'mm',
    construction: {system:'frameless-system-32', panelMm:18, shelfMm:18, backMm:8, revealMm:3, plinthMm:null, boringPitchMm:32, boringSetbackMm:37},
    standards: {market:'UK', focus:['en14749','iso7170']},
    notes: ['Contract and current UK conformity obligations still require project review.', 'Project-specific plinth, worktop and appliance dimensions are not overwritten.'],
    references:[SYSTEM32_REFERENCE],
  }),
  preset({
    id: 'us-frameless', label: 'US frameless · nominal 3/4 in', labelHe:'ארה״ב ללא מסגרת · 3/4 אינץ׳ נומינלי', region: 'United States', regionHe:'ארצות הברית', units: 'in',
    construction: {system:'frameless', panelMm:19.05, shelfMm:19.05, backMm:6.35, revealMm:3.175, plinthMm:101.6, boringPitchMm:32, boringSetbackMm:37},
    standards: {market:'US', focus:['kcma','awi0641','csu','ada','tsca','iso7170']},
    notes: ['Nominal inch values are stored exactly in millimetres.', 'This is frameless construction; it does not synthesize a face frame.', 'Project scope determines which US rules actually apply.'],
    references:[SYSTEM32_REFERENCE],
  }),
  preset({
    id: 'israel-metric', label: 'Israel metric · frameless', labelHe:'ישראל מטרי · ללא מסגרת', region: 'Israel', regionHe:'ישראל', units: 'mm',
    construction: {system:'frameless-system-32', panelMm:18, shelfMm:18, backMm:8, revealMm:3, plinthMm:140, boringPitchMm:32, boringSetbackMm:37},
    standards: {market:'IL', focus:['iso7170']},
    notes: ['Local mandatory requirements are not yet evaluated by the built-in catalog.', 'Treat the 140 mm plinth as a shop starting point, not a legal requirement.'],
    references:[SYSTEM32_REFERENCE],
  }),
]);

export function cabinetProductionPreset(id) {
  return CABINET_PRODUCTION_PRESETS.find(value => value.id === id) || null;
}

const roundCm = mm => Number((mm / 10).toFixed(4));
const same = (a,b) => Math.abs(Number(a) - Number(b)) < 1e-7;
const familyProduct = family => {
  if (['kitchenBase','kitchenUpper','kitchenTall','kitchenCorner'].includes(family)) return 'kitchen';
  if (family === 'vanity') return 'vanity';
  if (['wardrobe','walkin','hall','shoe'].includes(family)) return 'wardrobe';
  if (['bookcase','shelving'].includes(family)) return 'bookcase';
  if (family === 'office') return 'office';
  return 'unknown';
};

export function inferCabinetProductType(items = []) {
  const types = new Set(items.filter(item => item?.cab).map(item => familyProduct(item.cab.fam)));
  return types.size === 1 && !types.has('unknown') ? [...types][0] : 'unknown';
}

function proposedValues(item, profile) {
  const c = profile.construction, sp = item.cab, values = {};
  if (profile.id === 'manual' || sp.carcass === 'float') return values;
  if (c.panelMm != null) values.panel = roundCm(c.panelMm);
  if (c.shelfMm != null) values.shelf = roundCm(c.shelfMm);
  if (c.backMm != null && sp.back !== 0) values.back = roundCm(c.backMm);
  if (c.revealMm != null) values.gap = roundCm(c.revealMm);
  if (c.plinthMm != null && sp.plinthType !== 'none' && sp.plinth > 0) values.plinth = roundCm(c.plinthMm);
  return values;
}

function preparedItems(items, profile) {
  return items.map(item=>{
    if(item==null)return item;
    const copy=JSON.parse(JSON.stringify(item));
    if(!copy?.cab)return copy;
    Object.assign(copy.cab,proposedValues(item,profile));
    copy.cab.productionConvention = {
      presetId:profile.id,presetVersion:profile.version,region:profile.region,units:profile.units,
      constructionSystem:profile.construction.system,boringPitchMm:profile.construction.boringPitchMm,
      boringSetbackMm:profile.construction.boringSetbackMm,
    };
    normalizeSpec(copy.cab,copy.w,copy.h,copy.d);
    return copy;
  });
}

export function previewCabinetProductionPreset(items = [], presetId = 'manual') {
  const profile = cabinetProductionPreset(presetId);
  if (!profile) throw new Error('Unknown cabinet production preset.');
  const cabinets = items.filter(item => item?.cab);
  const changes = [], skipped = [];
  for (const item of cabinets) {
    const values = proposedValues(item,profile), fields = [];
    for (const [field,after] of Object.entries(values)) if (!same(item.cab[field],after)) fields.push({field,before:item.cab[field],after,units:'cm'});
    const current = item.cab.productionConvention;
    if (!current || current.presetId !== profile.id || current.presetVersion !== profile.version)
      fields.push({field:'productionConvention',before:current?.presetId || null,after:profile.id,units:null});
    if (item.cab.carcass === 'float' && profile.id !== 'manual') skipped.push({itemId:String(item.id),reason:'Floating shelves retain their authored slab construction.'});
    changes.push({itemId:String(item.id),family:item.cab.fam || 'unknown',fields});
  }
  const candidate=preparedItems(items,profile),manifest=cabinetProductionParts(candidate);
  const stockIssues=manifest.issues.filter(issue=>['missing-stock','stock-thickness-mismatch'].includes(issue.code));
  return {schema:'modelforge-cabinet-preset-preview',version:1,preset:profile,cabinetCount:cabinets.length,
    changedCabinets:changes.filter(change=>change.fields.length).length,changes,skipped,stockIssues,
    warnings:['Applying construction dimensions can invalidate edge allowances, saved joinery and drilling recipes. Review the resulting production findings and create a new revision.']};
}

export function applyCabinetProductionPreset(items = [], presetId = 'manual') {
  const preview = previewCabinetProductionPreset(items,presetId), profile = preview.preset;
  // Prepare the full scope before changing any live cabinet. A malformed
  // member must not leave half a kitchen run on the new construction system.
  const prepared=preparedItems(items,profile);
  prepared.forEach((copy,index)=>{if(items[index]?.cab)items[index].cab=copy.cab;});
  return preview;
}

export function standardsContextForCabinetPreset(presetId, items = [], previous = {}) {
  const profile = cabinetProductionPreset(presetId);
  if (!profile) throw new Error('Unknown cabinet production preset.');
  return createCabinetStandardsContext({...previous,
    market:profile.standards.market,
    productType:inferCabinetProductType(items),
    conventionPreset:{id:profile.id,version:profile.version,region:profile.region,focus:[...profile.standards.focus]},
  });
}

const stage = (id,label,status,summary,issues=[]) => ({id,label,status,summary,issues});
const blockerCodes = new Set(['missing-item-id','duplicate-item-id','unsupported-geometry','layout-failed','invalid-edge-allowance','edge-datum-mismatch','edge-topology-mismatch','stale-part-override','invalid-substrate','invalid-rough-allowance','stock-datum-stale','stock-datum-source','stock-datum-offset']);
const operationBlockerCodes = new Set(['saved-joinery-stale','saved-joinery-invalid','machining-stock-datum','generation-failed','missing-part','construction','front-relief','corner-hardware','mechanism-template','joinery-template','drawer-front-template','rejected-hole','hole-edge','hole-intersection','blind-depth','through-depth']);

/** A conservative handoff map. "Complete" means inputs exist, never certification. */
export function cabinetDesignToProductionReadiness(items = [], {recipes=[], standardsContext={}, job=null} = {}) {
  const cabinets=items.filter(item=>item?.cab),production=cabinetProductionParts(cabinets),coverage=cabinetOperationCoverage(cabinets,recipes);
  const standards=evaluateCabinetStandards(cabinets,standardsContext);
  const hard=production.issues.filter(issue=>blockerCodes.has(issue.code));
  for(const item of cabinets){
    try{
      for(const finding of checkCab(JSON.parse(JSON.stringify(item))).filter(value=>value.level==='err'))
        hard.push({code:'construction',itemId:String(item.id),message:finding.msg});
    }catch(error){hard.push({code:'construction-check-failed',itemId:String(item.id),message:String(error.message||error)});}
  }
  const stages=[];
  stages.push(stage('design','Design definition',!cabinets.length||hard.length?'blocked':'complete',
    !cabinets.length?'No cabinets in scope.':hard.length?hard.length+' geometry or identity blockers.':cabinets.length+' cabinets resolve to '+production.parts.length+' physical parts.',hard));
  const conventions=new Set(cabinets.map(item=>item.cab.productionConvention?.presetId).filter(Boolean));
  const conventionIssues=[];
  for(const item of cabinets){
    const recorded=item.cab.productionConvention,profile=cabinetProductionPreset(recorded?.presetId);
    if(!recorded){conventionIssues.push({code:'convention-missing',itemId:String(item.id),message:'Choose a preset or explicitly record Manual / shop-defined.'});continue;}
    if(!profile||recorded.presetVersion!==profile.version){conventionIssues.push({code:'convention-unknown',itemId:String(item.id),message:'The recorded convention is unavailable or from another version.'});continue;}
    for(const [field,expected] of Object.entries(proposedValues(item,profile)))if(!same(item.cab[field],expected))
      conventionIssues.push({code:'convention-drift',itemId:String(item.id),message:`${field} no longer matches the recorded ${profile.label} preset. Reapply it or record Manual / shop-defined.`});
  }
  stages.push(stage('convention','Construction convention',!cabinets.length?'blocked':conventionIssues.length||conventions.size>1?'review':'complete',
    !cabinets.length?'No cabinet convention can be recorded without a cabinet.':conventionIssues.length?conventionIssues.length+' convention findings need review.':conventions.size>1?'Mixed conventions are recorded; confirm the intentional handoff.':'Preset '+([...conventions][0]||'manual')+' is revision-bound.',conventionIssues));
  const stockMissing=production.parts.filter(part=>!part.sheetId||!part.substrate||!part.rough||part.geometry!=='rectangle');
  stages.push(stage('stock','Stock & finished edges',!production.parts.length||stockMissing.length?'blocked':'complete',
    !production.parts.length?'No physical parts are available for stock definition.':stockMissing.length?stockMissing.length+' parts lack matching stock, supported shape, explicit edges or rough blanks.':'Every supported part has matching stock, substrate and rough-blank dimensions.',stockMissing.map(part=>({code:'stock-definition-missing',partId:part.id,message:!part.sheetId?'Select a sheet matching the nominal board thickness.':part.geometry!=='rectangle'?'A non-rectangular board needs a reviewed cutting and contour process.':'Define all four edges and rough allowances.'}))));
  const uncovered=coverage.parts.filter(part=>['missing','generic-partial'].includes(part.coverage));
  const operationIssues=coverage.issues.filter(issue=>operationBlockerCodes.has(issue.code)||String(issue.code).startsWith('recipe-'));
  const unsupported=coverage.parts.filter(part=>part.coverage==='unsupported');
  stages.push(stage('operations','Joinery & machining',!coverage.parts.length||uncovered.length||operationIssues.length?'blocked':unsupported.length?'review':'complete',
    !coverage.parts.length?'No physical parts are available for operation planning.':uncovered.length||operationIssues.length?uncovered.length+' parts lack complete decisions; '+operationIssues.length+' machining or joinery findings remain.':unsupported.length?unsupported.length+' parts need a separate material or contour process.':'Every supported part has a complete recipe or explicit no-drill decision.',
    [...uncovered.map(part=>({code:'operation-coverage',partId:part.id,message:'Complete the shop recipe or record why this part is not drilled.'})),...operationIssues,...unsupported.map(part=>({code:'operation-unsupported',partId:part.id,message:'Review the separate material or contour process for this part.'}))]));
  const applicable=standards.rules.filter(rule=>rule.applicability==='applicable'),failed=standards.rules.filter(rule=>rule.status==='fail'),unknown=standards.rules.filter(rule=>rule.applicability==='unknown');
  stages.push(stage('standards','Standards scope',failed.length?'blocked':unknown.length||applicable.some(rule=>rule.status==='not-evaluated')?'review':'complete',
    failed.length?failed.length+' declared dimensional screens fail.':unknown.length?unknown.length+' applicability decisions need project facts.':applicable.length?applicable.length+' applicable profiles still require independent evidence review.':'No built-in profile is currently applicable; confirm project scope.',[...failed,...unknown]));
  const stale=job ? cabinetProductionStaleness(job,cabinets).stale : false;
  const revisionStatus=!job||stale?'blocked':job.status==='released'?'complete':'review';
  stages.push(stage('revision','Revision & documents',revisionStatus,!job?'Create a revision snapshot after inputs are complete.':stale?'The saved snapshot is stale.':job.status==='released'?'Review documents are released for this exact revision.':'Current snapshot is '+job.status+'; complete human document review.',[]));
  const summary={complete:stages.filter(value=>value.status==='complete').length,review:stages.filter(value=>value.status==='review').length,blocked:stages.filter(value=>value.status==='blocked').length};
  return {schema:'modelforge-cabinet-production-readiness',version:1,status:summary.blocked?'blocked':summary.review?'review-required':'handoff-complete',machineReady:false,productionRelease:false,summary,stages,
    notice:'Handoff completeness only. Machine qualification, hardware verification, physical first article, local code review and authorized production release remain external.'};
}
