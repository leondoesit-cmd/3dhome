import { S } from './state.js';
/** Deterministic review handoff container. Checksums detect corruption, not authorship. */
import { cabinetProductionStaleness, cabinetProductionCSV, cabinetProductionHTML } from './cabinet_production_workflow.js';
import { cabinetProductionDrawingHTML } from './cabinet_production_drawings.js';
import { cabinetManufacturingReport } from './cabinet_manufacturing.js';
import { cabinetSavedJoineryReport } from './cabinet_joinery.js';
import { cabinetOperationCoverage } from './cabinet_operation_coverage.js';
import { evaluateCabinetStandards } from './cabinet_standards.js';
import { validateCabinetInspectionPlan, cabinetInspectionReport, cabinetInspectionHTML, cabinetInspectionCSV } from './cabinet_inspection.js';

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',') + '}' : JSON.stringify(value);
function freeze(value) { if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
function checksum(value) {
  const text=typeof value==='string'?value:canonical(value);let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return 'checksum-'+(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function assertJSON(value, ancestors=new Set()) {
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
  if(!value||typeof value!=='object'||ancestors.has(value)||!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype)throw new Error('Package inputs must be finite, acyclic JSON data.');
  ancestors.add(value);for(const child of Object.values(value))assertJSON(child,ancestors);ancestors.delete(value);
}
function requireEmbeddedGeometry(items) {
  for(const item of items || []) {
    const metadata=S.parametric?.definitions?.[item?.definitionId]?.metadata;
    if(metadata?.advancedEdits||metadata?.manufacturingReviewRequired||item?.advancedEdits||item?.manufacturingReviewRequired||item?.cab?.advancedEdits||item?.cab?.manufacturingReviewRequired)throw new Error('Portable review packages cannot include external advanced CAD edits or definition-dependent manufacturing geometry. Capture a self-contained cabinet design first.');
  }
}
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function validateSupplemental(recipes,context) {
  if(!Array.isArray(recipes))throw new Error('Supplemental recipes must be an array.');
  assertJSON(recipes);assertJSON(context);
  if(context!==null&&(typeof context!=='object'||Array.isArray(context)||context.facts!=null&&(typeof context.facts!=='object'||Array.isArray(context.facts))||context.evidence!=null&&!Array.isArray(context.evidence)))throw new Error('Standards context requires an object with facts and an evidence array.');
  const ids=new Set();
  for(const recipe of recipes){
    if(!recipe||typeof recipe!=='object'||!nonempty(recipe.itemId)||!nonempty(recipe.sourceSignature)||!nonempty(recipe.partNumber)||!nonempty(recipe.sourceDrawing)||!Array.isArray(recipe.panels))throw new Error('Malformed supplemental drilling recipe.');
    if(ids.has(recipe.itemId))throw new Error('Duplicate supplemental recipe cabinet ID.');ids.add(recipe.itemId);
    for(const panel of recipe.panels){
      if(!panel||!nonempty(panel.partId)||!Array.isArray(panel.holes)||!['l','w','thickness'].every(key=>Number.isFinite(panel[key])&&panel[key]>0))throw new Error('Malformed supplemental recipe panel.');
      for(const hole of panel.holes)if(!hole||!['x','y','d','depth'].every(key=>Number.isFinite(hole[key]))||hole.d<=0||hole.depth<0||!['A','B'].includes(hole.face)||typeof hole.through!=='boolean')throw new Error('Malformed supplemental drilling operation.');
    }
  }
}
const fixedFiles = [
  ['README.txt','text/plain'],['job.json','application/json'],['evidence.json','application/json'],
  ['manufacturing.json','application/json'],['coverage.json','application/json'],['joinery.json','application/json'],['standards.json','application/json'],
  ['parts.csv','text/csv'],['labels.html','text/html'],['traveler.html','text/html'],['drawings.html','text/html'],
];
const inspectionFiles=[['inspection-plan.json','application/json'],['inspection-report.json','application/json'],['inspection.html','text/html'],['inspection.csv','text/csv']];
const packageFiles = value => value.supplemental?.inspectionPlan ? [...fixedFiles,...inspectionFiles] : fixedFiles;
const README='CABINET MANUFACTURING REVIEW PACKAGE\n\nREVIEW ONLY — NOT PRODUCTION RELEASED.\nSource cabinets use the job snapshot, sorted by persistent ID with visual opening/runtime state removed. Recipe itemIndex is canonical presentation metadata; exact recipe coordinates and source references are retained. External advanced CAD edits and definition-dependent manufacturing geometry are rejected because this archive does not embed those external definitions. No application-global state is restored during import.\n\nThis JSON container holds text files in files[].content. Save each content string using its fixed name and MIME type; no ZIP extraction is required. Open HTML files in a browser to inspect or print. Dimensions are millimetres; diagrams are not guaranteed print-to-scale.\n\nReview coverage.json, manufacturing.json, joinery.json and standards.json before interpreting drawings. Missing operations, stock mappings, hardware evidence or standards assessments remain unresolved. Saved edge joinery is review-only and is never included as qualified CNC.\n\nChecksums and exact content checks detect changes within this package, not the authenticity of its author or physical execution. Imported job status and operator history are archival claims. Reopen job.json through the job importer and compare the current design before any new review. Machine/controller, tooling, workholding and physical first-article qualification remain external requirements.\n';
function fileContents(packageValue) {
  const p=packageValue;
  const contents=[README,JSON.stringify(p.job,null,2),JSON.stringify({revision:p.revision,...p.supplemental,hardwareEvidence:p.job.hardwareEvidence},null,2),JSON.stringify(p.manufacturing,null,2),JSON.stringify(p.coverage,null,2),JSON.stringify(p.joinery,null,2),JSON.stringify(p.standards,null,2),cabinetProductionCSV(p.job),cabinetProductionHTML(p.job,{document:'labels'}),cabinetProductionHTML(p.job,{document:'traveler'}),cabinetProductionDrawingHTML(p.job,p.sourceItems,{recipes:p.supplemental.recipes})];
  if(p.supplemental.inspectionPlan)contents.push(JSON.stringify(p.supplemental.inspectionPlan,null,2),JSON.stringify(p.inspection,null,2),cabinetInspectionHTML(p.supplemental.inspectionPlan,p.job,p.sourceItems),cabinetInspectionCSV(p.supplemental.inspectionPlan,p.job,p.sourceItems));
  return contents;
}
export function createCabinetReviewPackage(job,items,{recipes=[],standardsContext=null,inspectionPlan=null}={}) {
  validateSupplemental(recipes,standardsContext);
  if(!job||job.machineReady!==false||job.productionRelease!==false||job.releaseScope!=='review-documents-only')throw new Error('Only a review-document job can be packaged.');
  if(Array.isArray(items))requireEmbeddedGeometry(items);
  if(!Array.isArray(items)||cabinetProductionStaleness(job,items).stale)throw new Error('Review package requires a job matching the current live revision.');
  const sourceItems=clone(job.manifest.sourceItems);
  sourceItems.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  sourceItems.forEach(item=>{delete item.cab.open;delete item.cab.runtimeState;delete item.runtimeState;});
  requireEmbeddedGeometry(sourceItems);
  recipes=clone(recipes).map(recipe=>({...recipe,itemIndex:sourceItems.findIndex(item=>String(item.id)===recipe.itemId)+1})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
  const manufacturing=clone(cabinetManufacturingReport(sourceItems,recipes));
  if(recipes.some(recipe=>!manufacturing.items.some(item=>String(item.id)===recipe.itemId)))throw new Error('Supplemental recipe references an unknown cabinet.');
  const recipeIssues=manufacturing.issues.filter(issue=>String(issue.code).startsWith('recipe-'));
  if(recipeIssues.length)throw new Error(recipeIssues.map(issue=>issue.message).join(' '));
  const p={schema:'modelforge-cabinet-review-package',version:1,revision:job.revision,scope:'review-only',machineReady:false,productionRelease:false,
    job:clone(job),sourceItems,supplemental:{recipes:clone(recipes),standardsContext:clone(standardsContext)},manufacturing,
    coverage:clone(cabinetOperationCoverage(sourceItems,recipes)),joinery:clone(cabinetSavedJoineryReport(sourceItems)),
    standards:standardsContext===null?null:clone(evaluateCabinetStandards(sourceItems,standardsContext))};
  if(inspectionPlan!==null){
    const validation=validateCabinetInspectionPlan(inspectionPlan,job,sourceItems);
    if(!validation.valid)throw new Error(validation.issues.join(' '));
    p.supplemental.inspectionPlan=clone(inspectionPlan);
    p.inspection=clone(cabinetInspectionReport(inspectionPlan,job,sourceItems));
  }
  const contents=fileContents(p);
  p.files=packageFiles(p).map(([name,mime],index)=>({name,mime,content:contents[index],fingerprint:checksum(contents[index])}));
  p.manifest=p.files.map(({name,mime,fingerprint})=>({name,mime,fingerprint}));p.fingerprint=checksum(p);
  return freeze(p);
}
export function validateCabinetReviewPackage(value) {
  const issues=[];
  try{
    assertJSON(value);
    if(!value||value.schema!=='modelforge-cabinet-review-package'||value.version!==1||value.scope!=='review-only'||value.machineReady!==false||value.productionRelease!==false)throw new Error('Unsupported or qualified package claims.');
    const payload=clone(value);delete payload.fingerprint;
    if(checksum(payload)!==value.fingerprint)throw new Error('Package fingerprint does not match its contents or supplemental evidence.');
    validateSupplemental(value.supplemental?.recipes,value.supplemental?.standardsContext);
    if(value.revision!==value.job?.revision||cabinetProductionStaleness(value.job,value.sourceItems).stale)throw new Error('Embedded job and source revision do not match.');
    const expectedFiles=packageFiles(value);
    if(!Array.isArray(value.files)||value.files.length!==expectedFiles.length||!Array.isArray(value.manifest))throw new Error('Invalid package file manifest.');
    for(let index=0;index<expectedFiles.length;index++){
      const file=value.files[index],[name,mime]=expectedFiles[index];
      if(!file||file.name!==name||file.mime!==mime||typeof file.content!=='string'||file.fingerprint!==checksum(file.content))throw new Error('Invalid package file or content checksum: '+name);
    }
    if(canonical(value.manifest)!==canonical(value.files.map(({name,mime,fingerprint})=>({name,mime,fingerprint}))))throw new Error('Package manifest disagrees with its files.');
    // Re-render against the exact source/evidence snapshot; hashes alone are not enough.
    const expected=createCabinetReviewPackage(value.job,value.sourceItems,value.supplemental);
    if(canonical(expected)!==canonical(value))throw new Error('Package evidence, reports or file contents differ from a fresh reconstruction.');
  }catch(error){issues.push(String(error.message||error));}
  return {valid:issues.length===0,issues,machineReady:false,productionRelease:false,scope:'review-only'};
}
export function importCabinetReviewPackage(text) {
  const value=typeof text==='string'?JSON.parse(text):clone(text),validation=validateCabinetReviewPackage(value);
  if(!validation.valid)throw new Error(validation.issues.join(' '));
  return freeze(value);
}
