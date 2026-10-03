import {createPartDocument,createFeatureDefinition} from './core/parametric_document.js';
import {cloneDomain} from './core/schema.js';

// A newly picked standard part is an editable part document inside the
// assembly, with the same native kernel recipe used by standalone Toolbox.
export function assemblyToolboxDocument(generated, options = {}) {
  if (!generated?.ok || !generated.parts?.length) throw new Error(generated?.message || 'Toolbox generated no solid');
  const doc = createPartDocument({key:options.key,name:generated.callout,col:'#c9bfae',metadata:{authoringSystem:'parametric-v1'}});
  const feature = createFeatureDefinition(doc,'toolbox',{
    name:generated.callout,
    references:{sketches:[],features:[],topology:[],references:[]},
    params:cloneDomain(generated.sourceOptions || {}),
  });
  feature.toolboxAutoName=generated.callout;
  doc.parts=generated.parts.map((part,index)=>({...cloneDomain(part),id:options.nextId ? options.nextId() : feature.id+':part:'+index,featureId:feature.id,toolboxFeatureId:feature.id}));
  doc.toolboxParts=generated.metadata ? [{featureId:feature.id,...cloneDomain(generated.metadata)}] : [];
  return doc;
}

// A Toolbox feature lowers all its primitives and recess cutters to one final
// union/cut shape. Its disposable viewport records are not separate body heads.
export function hasSingleToolboxKernelRecipe(doc, parts = doc?.parts || []) {
  if (doc?.metadata?.authoringSystem !== 'parametric-v1' || doc.rollbackIndex != null || (doc.rollback != null && Number(doc.rollback) >= 0)) return false;
  const features = (doc.features || []).filter(feature => !feature.suppressed);
  if (features.length !== 1 || features[0].type !== 'toolbox' || !parts.length) return false;
  return parts.every(part => part.featureId === features[0].id && part.toolboxFeatureId === features[0].id);
}
