import test from "node:test";
import assert from "node:assert/strict";
import { installSpatialProject,exportSpatialProject,importSpatialProject } from "../js/core/spatial_project.js";

test("legacy planner collections are live aliases of the canonical spatial document",()=>{
  const state={nodes:[{x:0,z:0}],walls:[],openings:[],items:[{id:1}],roomMeta:{room:{name:"A"}},markers:[],workspace:{id:"house",floors:[]}};
  const spatial=installSpatialProject(state);
  assert.equal(state.items,spatial.instances);
  state.items=[{id:2}]; assert.deepEqual(spatial.instances,[{id:2}]);
  spatial.walls.push({id:"wall"}); assert.equal(state.walls[0].id,"wall");
  const saved=exportSpatialProject(state), restored={workspace:{}};
  importSpatialProject(restored,saved);
  assert.deepEqual(restored.roomMeta,{room:{name:"A"}});
  assert.equal(restored.spatial.id,"house");
});
