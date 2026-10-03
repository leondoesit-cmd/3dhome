import test from "node:test";
import assert from "node:assert/strict";
import { refreshedCutProfile } from "../js/core/feature_profile_refresh.js";

const grooveSketch = () => ({
  id:"groove", plane:"side", offset:-2.03,
  points:[{id:"center",x:0,y:0}],
  entities:[
    {id:"outer",type:"circle",c:"center",r:.31},
    {id:"inner",type:"circle",c:"center",r:.26},
  ],
  constraints:[],
});
const staleCut = () => ({
  id:"cut", type:"extrudeCut", inputs:["journal"],
  params:{sketchId:"groove",axis:"x",from:-2.03,to:-1.93,depth:.1,operation:"subtract",
    points:[{u:.29,v:0},{u:0,v:.29},{u:-.29,v:0},{u:0,v:-.29}]},
  references:{sketches:["groove"],features:["journal"],topology:[]},
});

test("editing a narrow groove rebinds its cut to both sketch circles without changing its downstream identity", () => {
  const feature=staleCut();
  const updated=refreshedCutProfile(feature,grooveSketch());
  assert.equal(feature.id,"cut");
  assert.deepEqual(feature.inputs,["journal"]);
  assert.equal(updated.params.points,undefined,"stale disk coordinates are removed");
  assert.deepEqual(updated.params.profileEntityIds,["outer"]);
  assert.deepEqual(updated.params.holeProfileEntityIds,[["inner"]]);
  assert.equal(updated.params.holes.length,1);
  assert.equal(updated.params.from,-2.03);
  assert.equal(updated.params.to,-1.93);
  assert.deepEqual(updated.references.profileEntityIds,["outer"]);
  assert.deepEqual(updated.references.features,["journal"]);
  assert.equal(updated.holeCount,1);
});

test("refresh refuses multiple separate contours instead of silently widening a saved cut", () => {
  const sketch=grooveSketch();
  sketch.points.push({id:"otherCenter",x:2,y:0});
  sketch.entities.push({id:"other",type:"circle",c:"otherCenter",r:.2});
  assert.throws(()=>refreshedCutProfile(staleCut(),sketch),/multiple contours/);
});
