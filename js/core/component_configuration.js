import {setActiveConfiguration} from '../cad_configurations.js';
import {compactDocumentTopologySnapshots} from './project_topology_budget.js';

export function replaceComponentDefinition(component, record) {
  if (!record?.key || !Array.isArray(record.parts)) throw new Error('Choose a saved part');
  component.modelKey = record.key;
  component.def = JSON.parse(JSON.stringify(compactDocumentTopologySnapshots(record)));
  component.configurationId = component.def.activeConfiguration || null;
  return component.def;
}

export function setComponentConfiguration(component, configurationId) {
  if (!component?.def) throw new Error('The component needs a saved part definition');
  const configuration = setActiveConfiguration(component.def, configurationId);
  component.configurationId = configuration.id;
  return configuration;
}
