import {planarMateFaceChoices} from '../cad_mate_reference_choices.js';
import {createTopologyReference} from './topology.js';

export const holeSupportChoiceKey=reference=>JSON.stringify([reference?.ownerFeatureId || '',reference?.persistentId || '']);
export function holeSupportChoiceReference(choice) {
 if(choice.key==='current')return structuredClone(choice.entry);
 const entry=choice.entry;
 return {...createTopologyReference(entry.ownerFeatureId,entry.kind,entry.persistentId,entry.descriptor),stageFeatureId:entry.ownerFeatureId};
}

// A surviving face ID can name different trimmed geometry at different
// history stages. Keep the stage in both the picker key and native reference.
export function holeSupportChoices(earlier,topologyByStage,currentSupport,latestStageId,unit='cm') {
 const choices=[];
 if(currentSupport?.persistentId)choices.push({key:'current',entry:structuredClone(currentSupport),label:'Current binding · '+(earlier.find(feature=>feature.id===currentSupport.ownerFeatureId)?.name || currentSupport.ownerFeatureId)+' · '+currentSupport.persistentId});
 for(const stage of earlier){
  if(stage.suppressed)continue;
  const entries=topologyByStage.get(stage.id);
  if(!entries)continue;
  for(const choice of planarMateFaceChoices(entries,earlier,unit)){
   const entry={...structuredClone(choice.entry),ownerFeatureId:stage.id};
   choices.push({key:holeSupportChoiceKey(entry),entry,label:(stage.id===latestStageId?'Latest input stage':'Upstream stage')+' · '+(stage.name || stage.id)+' · '+choice.label});
  }
 }
 return choices;
}
