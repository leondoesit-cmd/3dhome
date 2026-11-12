import { cabinetProductionParts } from './cabinet_production_parts.js';
// Shop-authored, machine-neutral mating operations. No vendor geometry defaults.
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
export function validateCabinetHardwareArticle(article) {
  const issues = [];
  const add = (code,message) => issues.push({code,message});
  if (!article || typeof article !== 'object' || Array.isArray(article)) return [{code:'invalid-article',message:'A hardware article object is required.'}];
  for (const name of ['manufacturer','sku','revision','sourceDrawing']) if (typeof article[name] !== 'string' || !article[name].trim()) add('missing-'+name,'Article requires '+name+'.');
  if (!['dowel','confirmat'].includes(article.kind)) add('unsupported-connector','Only explicitly specified dowel and confirmat connectors are supported.');
  for (const name of ['diameterMm','lengthMm']) if (!positive(article.dimensions?.[name])) add('invalid-'+name,'Connector '+name+' must be positive millimetres.');
  for (const name of ['faceDiameterMm','faceDepthMm','edgeDiameterMm','edgeDepthMm','minEdgeDistanceMm']) if (!positive(article.drilling?.[name])) add('invalid-'+name,'Shop drilling requires positive '+name+'.');
  if (article.drilling?.faceThrough !== undefined && typeof article.drilling.faceThrough !== 'boolean') add('invalid-through','faceThrough must be a boolean.');
  if (article.kind === 'dowel' && article.drilling?.faceThrough) add('unsupported-through-dowel','This mating dowel planner requires a blind face bore.');
  return issues;
}

export function planCabinetJoinery(input = {}) {
  const report = {schema:'modelforge-cabinet-joinery',version:1,units:'mm',status:'review-required',machineReady:false,
    datum:'Face panel: XY lower-left design face, depth into thickness. Edge panel: X along length, Y across thickness, depth into width. Matching X stations require physically aligned lower-left datums.',operations:[],hardware:[],issues:[]};
  const add = (code,message) => report.issues.push({code,message});
  const {facePanel,edgePanel,article,positions,faceOffsetMm,edgeOffsetMm} = input;
  report.issues.push(...validateCabinetHardwareArticle(article));
  for (const [name,panel] of [['face',facePanel],['edge',edgePanel]]) {
    if (!panel || typeof panel.id !== 'string' || !panel.id.trim()) add('invalid-panel-id',name+' panel requires a persistent ID.');
    for (const dim of ['length','width','thickness']) if (!positive(panel?.[dim])) add('invalid-panel',name+' panel '+dim+' must be positive millimetres.');
  }
  if (facePanel?.id === edgePanel?.id) add('same-panel','Mating panels must be distinct.');
  if (!Array.isArray(positions) || !positions.length || positions.length > 1000 || positions.some(p => !positive(p))) add('invalid-positions','Supply 1–1000 positive X stations in millimetres.');
  if (!positive(faceOffsetMm) || !positive(edgeOffsetMm)) add('invalid-offset','Both face and edge offsets must be positive millimetres.');
  if (report.issues.length) return report;
  const d = article.drilling, stations = [...positions].sort((a,b)=>a-b);
  const faceRadius = d.faceDiameterMm / 2, edgeRadius = d.edgeDiameterMm / 2;
  const minFace = Math.max(d.minEdgeDistanceMm,faceRadius), minEdge = Math.max(d.minEdgeDistanceMm,edgeRadius);
  if (faceOffsetMm < minFace || faceOffsetMm > facePanel.width-minFace) add('face-edge-clearance','Face bore violates the specified edge distance or board envelope.');
  // Edge drilling is centered explicitly within board thickness; minEdgeDistance
  // applies to end stations, while the bore radius controls thickness breakout.
  if (edgeOffsetMm <= edgeRadius || edgeOffsetMm >= edgePanel.thickness-edgeRadius) add('edge-breakout','Edge bore must remain inside panel thickness.');
  if (d.faceThrough ? Math.abs(d.faceDepthMm-facePanel.thickness)>1e-6 : d.faceDepthMm >= facePanel.thickness) add('face-penetration','Face depth must be blind, or explicitly through and equal to panel thickness.');
  if (d.edgeDepthMm >= edgePanel.width) add('edge-penetration','Edge depth must remain inside the mating panel width.');
  if (article.dimensions.lengthMm > d.faceDepthMm + d.edgeDepthMm) add('connector-fit','Connector length exceeds the available mating depth.');
  if (article.kind==='dowel' && (article.dimensions.diameterMm > d.faceDiameterMm || article.dimensions.diameterMm > d.edgeDiameterMm)) add('connector-fit','Dowel diameter exceeds a specified bore diameter.');
  if (article.kind==='confirmat' && (d.faceDiameterMm < article.dimensions.diameterMm || d.edgeDiameterMm >= article.dimensions.diameterMm || article.dimensions.lengthMm <= facePanel.thickness)) add('connector-fit','Confirmat clearance must accommodate its diameter, pilot must be smaller, and length must reach the mating panel.');
  stations.forEach((x,index)=>{
    if (x < minFace || x > facePanel.length-minFace || x < minEdge || x > edgePanel.length-minEdge) add('station-clearance','Connector station '+x+' violates a panel end distance.');
    if (index && x-stations[index-1] < Math.max(d.faceDiameterMm,d.edgeDiameterMm)) add('overlapping-connectors','Connector bores overlap or repeat a station.');
  });
  if (report.issues.length) return report;
  const articleId = article.manufacturer+':'+article.sku+':'+article.revision;
  stations.forEach((x,index)=>{
    const pairId = facePanel.id+':'+edgePanel.id+':'+articleId+':'+index;
    report.operations.push({id:pairId+':face',pairId,panelId:facePanel.id,setup:'face',x,y:faceOffsetMm,diameter:d.faceDiameterMm,depth:d.faceDepthMm,through:!!d.faceThrough,articleId},
      {id:pairId+':edge',pairId,panelId:edgePanel.id,setup:'edge',x,y:edgeOffsetMm,diameter:d.edgeDiameterMm,depth:d.edgeDepthMm,through:false,articleId});
  });
  report.hardware.push({manufacturer:article.manufacturer,sku:article.sku,revision:article.revision,sourceDrawing:article.sourceDrawing,kind:article.kind,quantity:stations.length});
  add('shop-verification-required','Shop-authored dimensions require verification of assembly datums, connector fit, tooling and workholding. No machine qualification is implied.');
  return report;
}

const copy = value => JSON.parse(JSON.stringify(value));
function stable(value) { return value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : '{' + Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',') + '}' : JSON.stringify(value); }
const fatalPartIssues = ['missing-item-id','duplicate-item-id','layout-failed','invalid-edge-allowance','invalid-substrate','edge-datum-mismatch','edge-topology-mismatch','stale-part-override','unsupported-edge-allowance','invalid-rough-allowance'];
export function cabinetJoineryRequestForItems(items, request) {
  const manifest = cabinetProductionParts(items);
  if (manifest.issues.some(issue=>fatalPartIssues.includes(issue.code))) throw new Error('Resolve production part identity, topology and allowance errors before reviewing joinery.');
  const next = copy(request);
  for (const key of ['facePanel','edgePanel']) {
    const part = manifest.parts.find(p=>p.id===request?.[key]?.id);
    if (!part || part.geometry!=='rectangle' || part.stockRole==='glass' || !part.finished) throw new Error('Joinery requires two current rectangular wood parts.');
    next[key] = {id:part.id,...(part.substrate||part.finished),dimensionBasis:part.substrate?'substrate':'finished-only'};
  }
  return next;
}
function joineryBinding(manifest, request) {
  const parts = ['facePanel','edgePanel'].map(key=>{
    const p = manifest.parts.find(part=>part.id===request[key]?.id);
    return p ? {id:p.id,finished:p.finished,substrate:p.substrate,edges:p.edges,datum:p.datum,topologyBinding:p.topologyBinding,material:p.material,sheetId:p.sheetId} : null;
  });
  return stable({parts,request});
}
export function createSavedCabinetJoinery(items, request, {id='joinery-'+Date.now(),reviewedAt=new Date().toISOString()}={}) {
  const current = cabinetJoineryRequestForItems(items,request);
  for (const key of ['facePanel','edgePanel']) for (const dimension of ['length','width','thickness']) if(current[key][dimension]!==request[key]?.[dimension]) throw new Error('Part dimensions changed. Review the current joinery request before saving.');
  const report = planCabinetJoinery(current);
  if (!report.operations.length) throw new Error(report.issues.map(issue=>issue.message).join(' '));
  if (typeof id!=='string'||!id.trim()||typeof reviewedAt!=='string'||!Number.isFinite(Date.parse(reviewedAt))) throw new Error('A plan ID and valid review timestamp are required.');
  const manifest=cabinetProductionParts(items), facePart=manifest.parts.find(p=>p.id===current.facePanel.id);
  if (!facePart) throw new Error('Face panel not found in production parts.');
  const ownerItemId=facePart.itemId;
  return {schema:'modelforge-saved-joinery',version:1,id,ownerItemId,request:copy(current),binding:joineryBinding(manifest,current),reviewedAt};
}
export function cabinetSavedJoineryReport(items=[]) {
  const manifest=cabinetProductionParts(items),result={schema:'modelforge-saved-joinery-review',version:1,machineReady:false,plans:[],issues:[],operations:[],hardware:[]};
  const seen=new Set();
  for(const item of items.filter(value=>value?.cab)) {
    const saved=item.cab.joineryPlans;
    if(saved==null)continue;
    if(!Array.isArray(saved)){result.issues.push({code:'saved-joinery-invalid',itemId:String(item.id),message:'Saved joinery plans must be an array.'});continue;}
    for(const plan of saved){
      const ownerItemId=String(item.id), issues=[];
      let report=null;
      try{
        if(!plan||plan.schema!=='modelforge-saved-joinery'||plan.version!==1||typeof plan.id!=='string'||!plan.id.trim()||plan.ownerItemId!==ownerItemId||!Number.isFinite(Date.parse(plan.reviewedAt)))throw new Error('Malformed saved joinery plan.');
        const key=ownerItemId+':'+plan.id;if(seen.has(key))throw new Error('Duplicate saved joinery plan ID.');seen.add(key);
        const current=cabinetJoineryRequestForItems(items,plan.request);
        if(joineryBinding(manifest,current)!==plan.binding)throw new Error('Saved joinery no longer matches its parts, topology or authored request. Revalidate it.');
        if(manifest.parts.find(p=>p.id===current.facePanel.id)?.itemId!==ownerItemId)throw new Error('Joinery plan is stored on the wrong cabinet.');
        report=planCabinetJoinery(current);
        if(!report.operations.length)throw new Error(report.issues.map(i=>i.message).join(' '));
      }catch(error){issues.push({code:'saved-joinery-stale',itemId:ownerItemId,planId:plan?.id,message:String(error.message||error)});}
      const valid=issues.length===0;
      result.plans.push({ownerItemId,id:plan?.id||'',valid,issues,request:valid?copy(plan.request):null,report:valid?report:null});result.issues.push(...issues);
      if(valid){result.operations.push(...report.operations.map(op=>({...op,planId:plan.id,ownerItemId,scope:'saved-joinery-review-only'})));result.hardware.push(...report.hardware.map(article=>({...article,planId:plan.id,ownerItemId})));}
    }
  }
  // Duplicate IDs invalidate all copies, not merely the later record.
  const duplicates=result.plans.filter((p,i,all)=>all.some((other,j)=>j!==i&&p.ownerItemId===other.ownerItemId&&p.id===other.id));
  for(const p of duplicates){p.valid=false;p.report=null;}
  result.operations=result.operations.filter(op=>!duplicates.some(p=>p.ownerItemId===op.ownerItemId&&p.id===op.planId));
  result.hardware=result.hardware.filter(op=>!duplicates.some(p=>p.ownerItemId===op.ownerItemId&&p.id===op.planId));
  result.plans.sort((a,b)=>(a.ownerItemId+':'+a.id).localeCompare(b.ownerItemId+':'+b.id));
  result.operations.sort((a,b)=>(a.ownerItemId+':'+a.planId+':'+a.id).localeCompare(b.ownerItemId+':'+b.planId+':'+b.id));
  result.hardware.sort((a,b)=>(a.ownerItemId+':'+a.planId).localeCompare(b.ownerItemId+':'+b.planId));
  result.issues.sort((a,b)=>(a.itemId+':'+a.planId+':'+a.message).localeCompare(b.itemId+':'+b.planId+':'+b.message));
  return result;
}
