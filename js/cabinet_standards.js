/** Versioned, partial standards screening; never a certificate or a complete compliance assessment.
 * context: {market:'US'|'EU'|'UK'|'international', productType, designVersion,
 *   facts:{domesticUse,architecturalCasework,containsRegulatedCompositeWood,
 *     adaRequired,ada8043Required,workSurfaceHeightMm,workSurfaceWidthMm,
 *     adjustableWorkSurface,freestanding,heightMm,massKg,enclosedVolumeLitres,
 *     bedroomClothingStorage,hasDrawersOrHingedDoors,manufacturedOn,
 *     placedOnMarketOn,reachExempt}, evidence:[]}
 * Scope facts describe the whole submitted design; mixed installations need separate assessments.
 * Evidence: {ruleId,edition,designSignature,designVersion,reference,result:'pass'|'fail'}.
 * References remain unverified even if a caller adds a verified:true property.
 * All dimensions in facts are mm, kg or litres, explicitly named; no outer-volume inference.
 */
export const CABINET_STANDARDS_VERSION = '2026-09-22.1';
const profile = (id,label,edition,jurisdiction,source,scope) => Object.freeze({id,label,edition,jurisdiction,source,scope});
export const CABINET_STANDARD_PROFILES = Object.freeze([
  profile('iso7170','ISO 7170','2021 (corrected 2022-03)','International','https://www.iso.org/standard/76864.html','Storage-unit strength, durability and stability test methods; does not specify acceptance criteria.'),
  profile('en14749','EN 14749','2016+A1:2022','EU / UK','https://landingpage.bsigroup.com/LandingPage/Undated?UPI=000000000030407319','Domestic and kitchen storage furniture and kitchen worktops; safety requirements and testing.'),
  profile('kcma','ANSI/KCMA A161.1','2022','US','https://kcma.org/sites/default/files/2024-08/KCMA%20A161.1%202022%20High%20Res.pdf','Kitchen and vanity cabinet performance and construction.'),
  profile('awi0641','ANSI/AWI 0641','2019','US','https://awinet.org/standards/architectural-wood-casework/introduction-foreword-1-0-2-0-architectural-wood-casework/','Architectural wood casework; contractual performance and aesthetic requirements, excluding installation.'),
  profile('csu','16 CFR 1261 / ASTM F2057','F2057-23','US','https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Clothing-Storage-Units','Covered freestanding bedroom clothing storage; testing, warnings and anti-tip provisions.'),
  profile('ada','ADA Standards for Accessible Design','2010','US','https://www.access-board.gov/ada/','Project accessibility scoping and installed clearances; limited section 804.3 dimensional screen below.'),
  profile('tsca','TSCA Title VI / 40 CFR 770','40 CFR 770 (catalog reviewed 2026-09-22)','US','https://www.epa.gov/formaldehyde/formaldehyde-emission-standards-composite-wood-products','Regulated composite wood and finished goods; emissions, traceability and labeling review.'),
  profile('reach','REACH Annex XVII entry 77','Regulation (EU) 2023/1464','EU','https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32023R1464','Formaldehyde releases; market-date and exemptions review, whole-product chamber evidence.'),
]);
export function createCabinetStandardsContext(overrides={}) {
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))overrides={};
  return {market:'international',productType:'unknown',designVersion:1,...overrides,facts:overrides.facts&&typeof overrides.facts==='object'&&!Array.isArray(overrides.facts)?{...overrides.facts}:{},evidence:Array.isArray(overrides.evidence)?[...overrides.evidence]:[]};
}
function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value)??'null';
}
// Exact canonical snapshot avoids hash collisions and binds geometry, materials, hardware and scope.
// This is a freshness token, not a cryptographic signature or evidence authenticity check.
export function cabinetDesignSignature(items,context={}) {
  const {evidence,designSignature,...scope}=createCabinetStandardsContext(context);
  const normalized=Array.isArray(items)?items.map(item=>{
    if(!item||typeof item!=='object')return item;
    const {runtimeState,...design}=item;
    if(design.cab&&typeof design.cab==='object'){const {open,runtimeState:runtime,...cab}=design.cab;design.cab=cab;}
    return design;
  }).sort((a,b)=>canonical(a).localeCompare(canonical(b))):[];
  return 'cabinet-standards:'+CABINET_STANDARDS_VERSION+':'+canonical({items:normalized,scope});
}
const state = (applicability,reason) => ({applicability,reason});
const applicable = reason => state('applicable',reason);
const unknown = reason => state('unknown',reason);
const na = reason => state('not-applicable',reason);
const boolScope = (value,label) => value===true?applicable(label):value===false?na(label+' explicitly excluded.'):unknown('Confirm '+label+'.');
const positive = value => Number.isFinite(value)&&value>0;
function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00Z');
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function scopeFor(id,c) {
  const f=c.facts||{},t=c.productType;
  if(id==='iso7170')return applicable('Storage-furniture test-method reference only.');
  if(id==='en14749')return boolScope(f.domesticUse,'Domestic / kitchen use');
  if(id==='kcma')return ['kitchen','kitchenBase','kitchenUpper','kitchenTall','kitchenCorner','vanity'].includes(t)?applicable('Kitchen or vanity cabinet.'):['bookcase','office','wardrobe','clothing-storage','tvUnit'].includes(t)?na('Declared product is outside kitchen/vanity scope.'):unknown('Confirm kitchen or vanity product classification.');
  if(id==='awi0641')return boolScope(f.architecturalCasework,'Architectural wood casework contract scope');
  if(id==='ada')return boolScope(f.adaRequired,'ADA project scoping');
  if(id==='tsca')return boolScope(f.containsRegulatedCompositeWood,'Regulated composite wood content');
  if(id==='reach'){
    if(f.reachExempt===true)return na('Declared entry 77 exemption; exemption basis requires professional review.');
    if(!validDate(f.placedOnMarketOn))return unknown('Specify placing-on-market date and entry 77 exemption assessment.');
    if(f.placedOnMarketOn<'2026-08-06')return na('Before this entry’s furniture application date; other obligations are not assessed.');
    return f.reachExempt===false?applicable('Declared non-exempt furniture placed on market from 6 August 2026.'):unknown('Determine entry 77 exemptions.');
  }
  if(id==='csu'){
    if(['bookcase','office','tvUnit','laundry','kitchen','kitchenBase','kitchenUpper','kitchenTall','vanity'].includes(t))return na('Declared product category is outside bedroom clothing storage.');
    if([f.freestanding,f.bedroomClothingStorage,f.hasDrawersOrHingedDoors].includes(false))return na('An explicit CSU scope condition is absent.');
    if((positive(f.heightMm)&&f.heightMm<685.8)||(positive(f.massKg)&&f.massKg<13.6077711)||(positive(f.enclosedVolumeLitres)&&f.enclosedVolumeLitres<90.6139090944))return na('Below a CSU scope threshold (27 in, 30 lb, 3.2 ft³).');
    if(![f.freestanding,f.bedroomClothingStorage,f.hasDrawersOrHingedDoors].every(v=>v===true)||![f.heightMm,f.massKg,f.enclosedVolumeLitres].every(positive))return unknown('Confirm freestanding bedroom clothing use, doors/drawers, height, mass and enclosed storage volume measured by the prescribed method.');
    if(!validDate(f.manufacturedOn))return unknown('Specify manufacturing date for the rule’s effective scope.');
    return f.manufacturedOn>'2023-09-01'?applicable('Declared CSU scope and manufacturing date meet this rule’s coverage.'):na('Manufacturing date is outside the stated post-1 September 2023 scope.');
  }
  return unknown('Scope is not implemented.');
}
function evidenceFor(rule,records,signature,version) {
  return records.filter(e=>e&&e.ruleId===rule.id).map(e=>({reference:String(e.reference||''),declaredResult:e.result||'unknown',current:e.designSignature===signature&&e.designVersion===version&&e.edition===rule.edition,verified:false}));
}
export function evaluateCabinetStandards(items,context={}) {
  const c=createCabinetStandardsContext(context),designSignature=cabinetDesignSignature(items,c);
  const rules=[],supported=['US','EU','UK','international'].includes(c.market);
  for(const p of CABINET_STANDARD_PROFILES){
    let scope=scopeFor(p.id,c);
    if(!supported)scope=unknown('Market '+String(c.market)+' is not covered by this catalog; local requirements are not evaluated.');
    else if(p.jurisdiction!=='International'&&!p.jurisdiction.split(' / ').includes(c.market))scope=c.market==='international'?unknown('Select a jurisdiction to determine applicability.'):na('Outside selected market; contractual adoption is not assessed.');
    if(!Array.isArray(items)||!items.length||!items.every(item=>item&&item.cab&&typeof item.cab==='object'&&!Array.isArray(item.cab)))scope=unknown('Supply a nonempty design containing only cabinet items.');
    const rule={...p,profileId:p.id,...scope,method:'evidence-required',status:scope.applicability==='not-applicable'?'not-applicable':'not-evaluated'};
    rule.evidence=evidenceFor(rule,c.evidence,designSignature,c.designVersion);
    if(scope.applicability==='applicable')rule.reason+=' Independent test/document review is required; this app cannot authenticate evidence or certify compliance.';
    if(rule.evidence.length)rule.reason+=rule.evidence.some(e=>e.current)?' Current user references recorded, unverified.':' Evidence is stale or has the wrong edition/version.';
    rules.push(rule);
  }
  const ada=rules.find(r=>r.id==='ada'),f=c.facts;
  for(const [suffix,label,key,test] of [
    ['height','804.3.2 fixed work-surface height','workSurfaceHeightMm',v=>v<=865],
    ['width','804.3 minimum work-surface width','workSurfaceWidthMm',v=>v>=760],
  ]){
    let scope=ada.applicability==='applicable'?boolScope(f.ada8043Required,'Section 804.3 residential work-surface scope'):state(ada.applicability,ada.reason);
    if(scope.applicability==='applicable'&&f.adjustableWorkSurface!==false)scope=unknown('Fixed-surface screening requires explicit adjustableWorkSurface:false; adjustable exceptions need review.');
    const status=scope.applicability==='not-applicable'?'not-applicable':scope.applicability!=='applicable'||!positive(f[key])?'not-evaluated':test(f[key])?'pass':'fail';
    rules.push({...ada,id:'ada-'+suffix,label,method:'declared-dimension-screen',...scope,status,evidence:[],reason:status==='pass'||status==='fail'?'Declared dimension '+f[key]+' mm; only this dimensional provision was screened. Installed accessibility remains unverified.':scope.reason});
  }
  const summary={pass:0,fail:0,'not-applicable':0,'not-evaluated':0};
  for(const r of rules)summary[r.status]++;
  return {schemaVersion:1,catalogVersion:CABINET_STANDARDS_VERSION,designSignature,designVersion:c.designVersion,market:c.market,certified:false,overallStatus:summary.fail?'fail':'not-evaluated',summary,rules,notice:'Partial design screening and unverified evidence register. Not certification, legal advice, or a complete standards assessment. Physical testing and qualified review remain required.'};
}
