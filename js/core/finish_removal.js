// Removing a finishing operation reconnects the body chain, never feature seeds.
// Topology is rebound only against verified predecessor geometry; unresolved
// references refuse the transaction so the user can repair them explicitly.
const bodyConsumers=new Set(['extrude','extrudeCut','revolve','revolveCut','sweep','sweepCut','loft','hole','fillet','chamfer','shell','draft','dome','rib','thicken','moveBody','splitBody']);
const idOf=value=>typeof value==='string'?value:value?.id || value?.persistentId;
function sameGeometry(a,b){
 if(typeof a==='number'||typeof b==='number')return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-6*Math.max(1,Math.abs(a),Math.abs(b));
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b;
 const keys=Object.keys(a).filter(key=>key!=='semantic');
 return keys.length===Object.keys(b).filter(key=>key!=='semantic').length&&keys.every(key=>sameGeometry(a[key],b[key]));
}
export function planFinishRemoval(document,feature,verifiedTopology=new Map()){
 if(!feature||!['fillet','chamfer'].includes(feature.type)||feature.inputs?.length!==1)return null;
 const predecessor=feature.inputs[0];
 if(!document.features.some(item=>item.id===predecessor&&!item.suppressed))return null;
 const changes=[],issues=[],topology=verifiedTopology.get(predecessor)||[];
 const refuse=(message,reference)=>issues.push({severity:'error',code:'finish-removal-needs-repair',reference,message});
 for(const consumer of document.features){
  if(consumer===feature)continue;
  const usesInput=(consumer.inputs||[]).includes(feature.id);
  const usesFeature=(consumer.references?.features||[]).some(ref=>idOf(ref)===feature.id);
  if(!usesInput&&!usesFeature)continue;
  if(!bodyConsumers.has(consumer.type)||consumer.inputs?.[0]!==feature.id||(consumer.inputs||[]).slice(1).includes(feature.id)){
   refuse(`${consumer.name||consumer.id} uses ${feature.name||feature.id} as a feature reference. Repair that reference before deleting it.`,consumer.id);continue;
  }
  changes.push(()=>{
   consumer.inputs=consumer.inputs.map(id=>id===feature.id?predecessor:id);
   if(consumer.references?.features)consumer.references.features=consumer.references.features.map(ref=>idOf(ref)!==feature.id?ref:typeof ref==='string'?predecessor:{...ref,...(ref.id?{id:predecessor}:{persistentId:predecessor})});
   if(consumer.params?.targetFeatureId===feature.id)consumer.params.targetFeatureId=predecessor;
  });
 }
 const seen=new Set();
 const visit=value=>{
  if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
  if(value.ownerFeatureId===feature.id&&value.persistentId){
   const matches=value.descriptor?topology.filter(item=>item.kind===value.kind&&item.descriptor&&sameGeometry(value.descriptor,item.descriptor)):[];
   if(matches.length!==1){refuse(`Repair reference ${value.persistentId} before deleting ${feature.name||feature.id}: ${matches.length?'ambiguous surviving geometry':'no verified surviving geometry'}.`,value.persistentId);return;}
   const match=matches[0];changes.push(()=>Object.assign(value,{ownerFeatureId:predecessor,persistentId:match.persistentId,semantic:match.semantic,signature:match.signature,descriptor:structuredClone(match.descriptor)}));return;
  }
  Object.values(value).forEach(visit);
 };
 document.features.filter(item=>item!==feature).forEach(visit);
 [document.sketches,document.references,document.referenceGeometry].forEach(visit);
 return {issues,apply(){changes.forEach(change=>change());}};
}
