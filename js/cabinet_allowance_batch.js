import { cabinetProductionParts } from './cabinet_production_parts.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const owner=(items,p)=>items.find(item=>String(item.id)===p.itemId);
const override=(items,p)=>owner(items,p)?.cab?.productionOverrides?.[p.partId];
const matching=(a,b)=>a.id!==b.id&&b.geometry==='rectangle'&&['role','material','sheetId','datum','grain'].every(key=>a[key]===b[key])&&['length','width','thickness','alongGrain','acrossGrain'].every(key=>a.finished?.[key]===b.finished?.[key]);
const badIssue=i=>/^(missing-item-id|duplicate-item-id|layout-failed|missing-stock|invalid-|edge-|unsupported-edge|stale-part-override)/.test(i.code);
function context(items,sourceId){
 const report=cabinetProductionParts(items),source=report.parts.find(p=>p.id===sourceId),issues=[];
 const identity=report.issues.filter(i=>['missing-item-id','duplicate-item-id','layout-failed'].includes(i.code));issues.push(...identity);
 if(!source)issues.push({code:'missing-source',message:'Select a current source part.'});
 else{issues.push(...report.issues.filter(i=>i.partId===source.id&&badIssue(i)));const value=override(items,source);if(source.geometry!=='rectangle'||!source.sheetId||!source.substrate||!source.edges||!value)issues.push({code:'invalid-source',message:'Source must have valid current rectangular-board edge allowances.'});if(value?.roughAllowance&&!source.rough)issues.push({code:'invalid-source-rough',message:'Source rough allowances are invalid.'});}
 return {report,source,issues};
}
export function cabinetAllowanceBatchCandidates(items,sourceId){
 const {report,source,issues}=context(items,sourceId);
 return {valid:!issues.length,issues,source:source||null,candidates:source&&!issues.length?report.parts.filter(p=>matching(source,p)&&!report.issues.some(i=>i.partId===p.id&&badIssue(i))):[]};
}
function signature(items){return canonical(items.map(item=>{const {runtimeState,...result}=item;if(result.cab){const {open,runtimeState:animation,...cab}=result.cab;result.cab=cab;}return result;}).sort((a,b)=>String(a.id).localeCompare(String(b.id))));}
/** Preview only; explicit target IDs are required. All quantities are millimetres. */
export function previewCabinetAllowanceBatch(items,sourceId,targetIds){
 const scope=cabinetAllowanceBatchCandidates(items,sourceId),issues=[...scope.issues],changes=[];
 if(!Array.isArray(targetIds)||!targetIds.length||targetIds.some(id=>typeof id!=='string')||new Set(targetIds).size!==targetIds.length)issues.push({code:'invalid-targets',message:'Select distinct matching target parts explicitly.'});
 if(!issues.length){const sourceValue=override(items,scope.source);for(const id of targetIds){const part=scope.candidates.find(p=>p.id===id);if(!part){issues.push({code:'incompatible-target',message:'A selected target is missing, invalid or no longer an exact role/material/stock/datum/size match.',partId:id});continue;}
   const before=clone(override(items,part)||{}),after={...before,datum:part.datum,topologyBinding:part.topologyBinding,edges:clone(scope.source.edges)};
   delete after.machiningDatum;
   if(sourceValue.roughAllowance)after.roughAllowance={lengthMm:sourceValue.roughAllowance.lengthMm,widthMm:sourceValue.roughAllowance.widthMm};else delete after.roughAllowance;
   // Preserve unrelated target metadata, but discard prior machining approval. Source datums,
   // reviewer signatures and evidence are deliberately never transferred.
   changes.push({partId:id,itemId:part.itemId,localPartId:part.partId,before,after});
 }}
 const preview={schema:'modelforge-allowance-batch',version:1,valid:!issues.length,issues,sourceId,targetIds:Array.isArray(targetIds)?[...targetIds]:[],changes,signature:signature(items)};
 if(preview.valid){const candidate=clone(items);for(const change of changes){const item=candidate.find(it=>String(it.id)===change.itemId);item.cab.productionOverrides||={};item.cab.productionOverrides[change.localPartId]=clone(change.after);}
   const validation=cabinetProductionParts(candidate);for(const issue of validation.issues)if(changes.some(c=>c.partId===issue.partId)&&badIssue(issue))preview.issues.push(issue);preview.valid=!preview.issues.length;
 }return preview;
}
/** Revalidates before writing any object; caller wraps this mutation in undo/history. */
export function applyCabinetAllowanceBatch(items,preview){
 if(!preview?.valid||preview.schema!=='modelforge-allowance-batch'||preview.version!==1)throw new Error('Create a valid batch preview first.');
 const fresh=previewCabinetAllowanceBatch(items,preview.sourceId,preview.targetIds);
 if(!fresh.valid||fresh.signature!==preview.signature||canonical(fresh.changes)!==canonical(preview.changes))throw new Error('The source or targets changed. Preview the batch again before applying.');
 const updates=new Map();for(const change of fresh.changes){const item=items.find(it=>String(it.id)===change.itemId);if(!updates.has(item))updates.set(item,{...(item.cab.productionOverrides||{})});updates.get(item)[change.localPartId]=clone(change.after);}
 for(const [item,values] of updates)item.cab.productionOverrides=values;
 return {applied:fresh.changes.length,partIds:fresh.targetIds};
}
