import { normalizeSurveyFeatures } from "../survey.js";
const clone=(value)=>value==null?value:typeof structuredClone==="function"?structuredClone(value):JSON.parse(JSON.stringify(value));

export const SPATIAL_SCHEMA_VERSION=4;

/* STOREYS ARE NOT PART OF THE SPATIAL DOCUMENT. They live in
   state.workspace.floors, and each of those carries a `scene` — which is itself
   a document containing a spatial project. Copying the floor list in here made
   that recursive: every floor scene embedded the whole floor list as it stood
   one generation earlier, so each duplicate/switch round-trip multiplied the
   saved size. Measured on the ten-item demo scene, duplicating a storey twice
   took the project from 130 KB to 10 MB — in every save, every autosave and
   (since storeys became undoable) every history entry. Nothing outside this
   file ever read the copy. A legacy document that still carries one is dropped
   on import; workspace.floors has always been written alongside it. */
export function installSpatialProject(state) {
  if (!state.spatial) state.spatial={schemaVersion:SPATIAL_SCHEMA_VERSION,id:state.workspace?.id || "project-default",nodes:state.nodes || [],walls:state.walls || [],wallTypes:state.wallTypes || [],openings:state.openings || [],instances:state.items || [],rooms:state.roomMeta || {},markers:state.markers || [],slabOpenings:state.slabOpenings || [],wallCons:state.wallCons || [],roomCons:state.roomCons || [],planVars:state.planVars || [],cabinetPresets:state.cabinetPresets || [],revision:1};
  state.spatial.schemaVersion=SPATIAL_SCHEMA_VERSION;
  if (state.spatial.floors) delete state.spatial.floors;
  if (!Array.isArray(state.spatial.slabOpenings)) state.spatial.slabOpenings = state.slabOpenings || [];
  spatialFeatures();
  function spatialFeatures() { if (!Array.isArray(state.spatial.surveyFeatures)) state.spatial.surveyFeatures=normalizeSurveyFeatures(state.surveyFeatures); }
  const aliases={surveyFeatures:"surveyFeatures",nodes:"nodes",walls:"walls",wallTypes:"wallTypes",openings:"openings",items:"instances",roomMeta:"rooms",markers:"markers",slabOpenings:"slabOpenings",wallCons:"wallCons",roomCons:"roomCons",planVars:"planVars"};
  Object.entries(aliases).forEach(([legacy,canonical])=>{
    const current=state[legacy];
    if (current!==undefined && state.spatial[canonical]===undefined) state.spatial[canonical]=current;
    Object.defineProperty(state,legacy,{configurable:true,enumerable:true,get(){return state.spatial[canonical];},set(value){state.spatial[canonical]=value;state.spatial.revision=(Number(state.spatial.revision)||0)+1;}});
  });
  return state.spatial;
}

export function exportSpatialProject(state) {
  const spatial=installSpatialProject(state);
  return clone({schemaVersion:spatial.schemaVersion,id:spatial.id,nodes:spatial.nodes,walls:spatial.walls,wallTypes:spatial.wallTypes,openings:spatial.openings,instances:spatial.instances,rooms:spatial.rooms,markers:spatial.markers,slabOpenings:spatial.slabOpenings || [],surveyFeatures:normalizeSurveyFeatures(spatial.surveyFeatures),wallCons:spatial.wallCons,roomCons:spatial.roomCons,planVars:spatial.planVars,cabinetPresets:spatial.cabinetPresets || [],revision:spatial.revision});
}

export function importSpatialProject(state,source={}) {
  const spatial=installSpatialProject(state);
  spatial.surveyFeatures=normalizeSurveyFeatures(source.surveyFeatures);
  spatial.id=source.id || spatial.id; spatial.nodes=clone(source.nodes || []); spatial.walls=clone(source.walls || []); spatial.wallTypes=clone(source.wallTypes || []); spatial.openings=clone(source.openings || []);
  spatial.instances=clone(source.instances || source.items || []); spatial.rooms=clone(source.rooms || source.roomMeta || {}); spatial.markers=clone(source.markers || []); spatial.slabOpenings=clone(source.slabOpenings || []); spatial.wallCons=clone(source.wallCons || []); spatial.roomCons=clone(source.roomCons || []); spatial.planVars=clone(source.planVars || []); spatial.cabinetPresets=clone(source.cabinetPresets || []); spatial.revision=Number(source.revision)||1;
  return spatial;
}

export function touchSpatialProject(state) { const spatial=installSpatialProject(state); spatial.revision=(Number(spatial.revision)||0)+1; return spatial.revision; }
