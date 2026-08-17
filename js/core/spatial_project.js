const clone=(value)=>value==null?value:typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value));

export const SPATIAL_SCHEMA_VERSION=2;

export function installSpatialProject(state) {
  if (!state.spatial) state.spatial={schemaVersion:SPATIAL_SCHEMA_VERSION,id:state.workspace?.id || "project-default",nodes:state.nodes || [],walls:state.walls || [],wallTypes:state.wallTypes || [],openings:state.openings || [],instances:state.items || [],rooms:state.roomMeta || {},markers:state.markers || [],wallCons:state.wallCons || [],roomCons:state.roomCons || [],planVars:state.planVars || [],floors:state.workspace?.floors || [],cabinetPresets:state.cabinetPresets || [],revision:1};
  state.spatial.schemaVersion=SPATIAL_SCHEMA_VERSION;
  const aliases={nodes:"nodes",walls:"walls",wallTypes:"wallTypes",openings:"openings",items:"instances",roomMeta:"rooms",markers:"markers",wallCons:"wallCons",roomCons:"roomCons",planVars:"planVars"};
  Object.entries(aliases).forEach(([legacy,canonical])=>{
    const current=state[legacy];
    if (current!==undefined && state.spatial[canonical]===undefined) state.spatial[canonical]=current;
    Object.defineProperty(state,legacy,{configurable:true,enumerable:true,get(){return state.spatial[canonical];},set(value){state.spatial[canonical]=value;state.spatial.revision=(Number(state.spatial.revision)||0)+1;}});
  });
  return state.spatial;
}

export function exportSpatialProject(state) {
  const spatial=installSpatialProject(state);
  return clone({schemaVersion:spatial.schemaVersion,id:spatial.id,nodes:spatial.nodes,walls:spatial.walls,wallTypes:spatial.wallTypes,openings:spatial.openings,instances:spatial.instances,rooms:spatial.rooms,markers:spatial.markers,wallCons:spatial.wallCons,roomCons:spatial.roomCons,planVars:spatial.planVars,floors:spatial.floors,cabinetPresets:spatial.cabinetPresets || [],revision:spatial.revision});
}

export function importSpatialProject(state,source={}) {
  const spatial=installSpatialProject(state);
  spatial.id=source.id || spatial.id; spatial.nodes=clone(source.nodes || []); spatial.walls=clone(source.walls || []); spatial.wallTypes=clone(source.wallTypes || []); spatial.openings=clone(source.openings || []);
  spatial.instances=clone(source.instances || source.items || []); spatial.rooms=clone(source.rooms || source.roomMeta || {}); spatial.markers=clone(source.markers || []); spatial.wallCons=clone(source.wallCons || []); spatial.roomCons=clone(source.roomCons || []); spatial.planVars=clone(source.planVars || []); spatial.floors=clone(source.floors || []); spatial.cabinetPresets=clone(source.cabinetPresets || []); spatial.revision=Number(source.revision)||1;
  return spatial;
}

export function touchSpatialProject(state) { const spatial=installSpatialProject(state); spatial.revision=(Number(spatial.revision)||0)+1; return spatial.revision; }
