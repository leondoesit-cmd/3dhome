import {STOCK_MATERIALS} from './cad_appearances.js';
import {TOOLBOX_MATERIALS} from './toolbox/schema.js';

// Catalog identity is scoped: stock aluminum is 6061, toolbox aluminum is 6063.
// Appearance/density records deliberately supply no strength allowables.
const polymers=new Set(['plastic','pvc-u','cpvc','pex','pex-blue','nylon']);
const finishes=new Set(['chrome','nickel-brushed','matte-black']);
export const ENGINEERING_MATERIALS=Object.freeze([
  ...Object.entries(STOCK_MATERIALS).map(([id,row])=>({...row,id:'stock:'+id,catalog:'stock',family:polymers.has(id)?'polymer':'metal'})),
  ...Object.entries(TOOLBOX_MATERIALS).map(([id,row])=>({...row,id:'toolbox:'+id,catalog:'toolbox',family:id==='beech'?'wood':polymers.has(id)?'polymer':finishes.has(id)?'finish':'metal'})),
  {id:'custom',name:'Custom material',catalog:'custom',family:'custom'},
].map(Object.freeze));
export function engineeringMaterial(id){return ENGINEERING_MATERIALS.find(row=>row.id===id)||null;}
export function materialProfileFor(def,id){return (def?.engineeringMaterials||[]).find(row=>row.id===id)||null;}
export function initialMaterialProfile(catalogId,id){
  const material=engineeringMaterial(catalogId);if(!material)throw new Error('Unknown material catalog identity');
  return {id,catalogId,grade:material.family==='finish'?'':material.name,condition:'',source:'',model:'qualified-rating',
    youngModulusMPa:0,poissonRatio:0,allowableBendingMPa:0,allowableContactMPa:0,
    minTemperatureC:0,maxTemperatureC:0,maxCycles:0,maxHours:0,maxRpm:0,environment:'',lubrication:''};
}
export function validateMaterialProfile(profile,{elastic=false}={}){
  const issues=[],add=(field,message)=>issues.push({code:'material-data',field,message,severity:'error'});
  if(!profile){add('material','Assign a material qualification');return issues;}
  const catalog=engineeringMaterial(profile.catalogId);
  if(!catalog)add('catalogId','Select a recognized material or Custom material');
  for(const field of ['grade','condition','source','environment','lubrication'])if(typeof profile[field]!=='string'||!profile[field].trim())add(field,'Supply '+field+' for the qualified material');
  for(const field of ['maxCycles','maxHours'])if(!Number.isFinite(profile[field])||profile[field]<=0)add(field,field+' must be positive and finite');
  if(!Number.isFinite(profile.maxRpm)||profile.maxRpm<0)add('maxRpm','Qualified speed must be nonnegative and finite');
  if(!Number.isFinite(profile.minTemperatureC)||!Number.isFinite(profile.maxTemperatureC)||profile.minTemperatureC>profile.maxTemperatureC)add('temperature','Supply an ordered qualified temperature range');
  if(elastic){
    if(profile.model!=='isotropic-elastic')add('model','Elastic screening requires an explicitly qualified isotropic model');
    if(catalog?.family==='wood'||catalog?.family==='finish')add('model','Wood and appearance-only entries require a configuration-specific rating; select the actual substrate for elastic screening');
    for(const field of ['youngModulusMPa','allowableBendingMPa','allowableContactMPa'])if(!Number.isFinite(profile[field])||profile[field]<=0)add(field,'Supply a positive qualified '+field);
    if(!Number.isFinite(profile.poissonRatio)||profile.poissonRatio<=-1||profile.poissonRatio>=.5)add('poissonRatio','Poisson ratio must be strictly between -1 and 0.5');
  }
  return issues;
}
export function upsertMaterialProfile(def,profile){
  if(!profile?.id||!engineeringMaterial(profile.catalogId))throw new Error('Material qualification needs an identity and catalog');
  const copy=structuredClone(profile);def.engineeringMaterials=def.engineeringMaterials||[];
  const at=def.engineeringMaterials.findIndex(row=>row.id===copy.id);if(at<0)def.engineeringMaterials.push(copy);else def.engineeringMaterials[at]=copy;
  // Cached reports never survive a material qualification change.
  for(const part of def.parts||[])if(part.materialQualificationId===copy.id||part.gearVerification?.mateMaterialProfileId===copy.id)delete part.gearVerificationReport;
  delete def.lastStandardsAudit;return copy;
}
