const clone=value=>value===undefined?null:JSON.parse(JSON.stringify(value));
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const equal=(a,b)=>canonical(a??null)===canonical(b??null);
function validate(job){
 if(!job||job.schema!=='modelforge-cabinet-production-job'||job.version!==1||typeof job.jobId!=='string'||typeof job.revision!=='string'||job.manifest?.units!=='mm'||!Array.isArray(job.manifest?.parts)||!Array.isArray(job.hardwareEvidence))throw new Error('Revision comparison requires version 1 production jobs with millimetre manifests.');
 for(const values of [job.manifest.sourceItems,job.manifest.joinery?.plans])if(values!==undefined&&!Array.isArray(values))throw new Error('Source items and saved joinery plans must be arrays.');
 const ids=new Set();for(const p of job.manifest.parts){if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))throw new Error('Revision comparison requires unique physical part IDs.');ids.add(p.id);}
}
function collectionChanges(before,after,key){
 const groups=values=>{const out=new Map();for(const value of values||[]){const id=key(value);if(!out.has(id))out.set(id,[]);out.get(id).push(value);}for(const values of out.values())values.sort((a,b)=>canonical(a).localeCompare(canonical(b)));return out;};
 const a=groups(before),b=groups(after);
 return [...new Set([...a.keys(),...b.keys()])].sort().flatMap(id=>equal(a.get(id),b.get(id))?[]:[{id,change:!a.has(id)?'added':!b.has(id)?'removed':'changed',before:clone(a.get(id)),after:clone(b.get(id))}]);
}
const fields=['itemId','partId','role','geometry','finished','substrate','rough','edges','material','stockRole','sheetId','grain','datum','topologyBinding','stockMapping','banding'];
export function compareCabinetProductionJobs(before,after){
 validate(before);validate(after);
 const report={schema:'modelforge-cabinet-revision-diff',version:1,units:'mm',status:'review-only',machineReady:false,
  before:{jobId:before.jobId,revision:before.revision},after:{jobId:after.jobId,revision:after.revision},
  summary:{added:0,removed:0,changed:0,topologyReplacements:0,unchanged:0},parts:[],joineryChanges:[],hardwareEvidenceChanges:[],sourceChanges:[],issues:[]};
 const a=new Map(before.manifest.parts.map(p=>[p.id,p])),b=new Map(after.manifest.parts.map(p=>[p.id,p]));
 for(const id of [...new Set([...a.keys(),...b.keys()])].sort()){
  const prior=a.get(id),next=b.get(id);const changed=fields.filter(field=>!equal(prior?.[field],next?.[field]));
  if(prior&&next&&!changed.length){report.summary.unchanged++;continue;}
  const change=!prior?'added':!next?'removed':'changed';report.summary[change]++;
  const replaced=!!prior&&!!next&&!equal(prior.topologyBinding,next.topologyBinding);
  if(replaced)report.summary.topologyReplacements++;
  const dimensionDeltas={};
  for(const kind of ['finished','substrate','rough']){
   const deltas={};for(const axis of ['length','width','thickness']){const old=prior?.[kind]?.[axis],value=next?.[kind]?.[axis];deltas[axis]=Number.isFinite(old)&&Number.isFinite(value)?Number((value-old).toFixed(9)):null;}
   dimensionDeltas[kind]=deltas;
  }
  report.parts.push({id,change,physicalContinuity:replaced?'unverified-topology-replacement':prior&&next?'same-semantic-id':'not-applicable',
   fields:changed.map(field=>({field,before:clone(prior?.[field]),after:clone(next?.[field])})),dimensionDeltas});
 }
 report.joineryChanges=collectionChanges(before.manifest.joinery?.plans,after.manifest.joinery?.plans,p=>String(p.ownerItemId)+':'+String(p.id));
 report.hardwareEvidenceChanges=collectionChanges(before.hardwareEvidence,after.hardwareEvidence,p=>String(p?.partId)+':'+String(p?.sku));
 report.sourceChanges=collectionChanges(before.manifest.sourceItems,after.manifest.sourceItems,p=>String(p?.id));
 if(report.summary.topologyReplacements)report.issues.push({code:'topology-replacement',message:'A reused semantic ID after topology changes does not establish continuity of the same physical board.'});
 if(!report.parts.length&&report.sourceChanges.length)report.issues.push({code:'source-only-change',message:'Source settings changed without a part dimension or manufacturing-field change.'});
 if(before.jobId!==after.jobId)report.issues.push({code:'different-jobs',message:'These snapshots have different job IDs; correspondence is based only on part IDs.'});
 return freeze(report);
}
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cabinetRevisionDiffHTML(before,after){
 const report=compareCabinetProductionJobs(before,after);
 const rows=report.parts.map(p=>'<tr><td>'+escapeHTML(p.id)+'</td><td>'+escapeHTML(p.change)+'<br>'+escapeHTML(p.physicalContinuity)+'</td><td>'+p.fields.map(f=>'<b>'+escapeHTML(f.field)+'</b>: '+escapeHTML(JSON.stringify(f.before))+' → '+escapeHTML(JSON.stringify(f.after))).join('<br>')+'</td></tr>').join('');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Cabinet revision comparison</title><style>body{font:13px sans-serif;margin:24px}table{border-collapse:collapse;width:100%;table-layout:fixed}th:first-child{width:20%}th:nth-child(2){width:20%}td,th{padding:8px;border:1px solid #aaa;text-align:left;overflow-wrap:anywhere}tr{break-inside:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere}@media print{body{margin:0}}</style><h1>Cabinet revision comparison</h1><p>Review only — no machine qualification.</p><p>'+escapeHTML(report.before.jobId)+' / '+escapeHTML(report.before.revision)+' → '+escapeHTML(report.after.jobId)+' / '+escapeHTML(report.after.revision)+'</p><pre>'+escapeHTML(JSON.stringify(report.summary,null,2))+'</pre><table><thead><tr><th>Part</th><th>Change / continuity</th><th>Changed fields</th></tr></thead><tbody>'+rows+'</tbody></table><h2>Joinery review changes</h2><pre>'+escapeHTML(JSON.stringify(report.joineryChanges,null,2))+'</pre><h2>Hardware evidence changes</h2><pre>'+escapeHTML(JSON.stringify(report.hardwareEvidenceChanges,null,2))+'</pre><h2>Source settings changes</h2><pre>'+escapeHTML(JSON.stringify(report.sourceChanges,null,2))+'</pre><h2>Review findings</h2><pre>'+escapeHTML(JSON.stringify(report.issues,null,2))+'</pre></html>';
}
export function cabinetRevisionDiffCSV(before,after){
 const r=compareCabinetProductionJobs(before,after),rows=[['REVIEW ONLY','Units','mm'],['Category','ID','Change','Field','Before','After','Physical continuity']];
 for(const p of r.parts){if(!p.fields.length)rows.push(['part',p.id,p.change,'','','',p.physicalContinuity]);for(const f of p.fields)rows.push(['part',p.id,p.change,f.field,JSON.stringify(f.before),JSON.stringify(f.after),p.physicalContinuity]);}
 for(const [category,changes] of [['joinery',r.joineryChanges],['hardware evidence',r.hardwareEvidenceChanges],['source',r.sourceChanges]])for(const change of changes)rows.push([category,change.id,change.change,'',JSON.stringify(change.before),JSON.stringify(change.after),'']);
 for(const issue of r.issues)rows.push(['review',issue.code,issue.message]);
 const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 return rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
