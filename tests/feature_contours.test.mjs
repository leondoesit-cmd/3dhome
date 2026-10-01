import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSketchProfiles } from "../js/sketch_profiles.js";
import { featureAreas, sketchRegions } from "../js/sketch_regions.js";
import { featureContourKey, selectFeatureContours } from "../js/core/feature_contours.js";

function circles() {
  return {
    points:[{ id:"origin", x:0, y:0 }],
    entities:[2.25, 2, 1.75].map((r, index) => ({ id:`circle-${index}`, type:"circle", c:"origin", r })),
    constraints:[],
  };
}

test("a three-circle face sketch lets one Boss select its outer ring without filling the centre", () => {
  const sketch=circles();
  const areas=featureAreas(analyzeSketchProfiles(sketch),sketchRegions(sketch));
  assert.equal(areas.length,2);
  const ring=areas.find((area)=>area.holes.length===1);
  const centre=areas.find((area)=>area.holes.length===0);
  assert.ok(ring && centre);
  assert.notEqual(featureContourKey(ring),featureContourKey(centre));
  assert.deepEqual(selectFeatureContours(areas,[featureContourKey(ring)]),[ring]);
  assert.equal(selectFeatureContours(areas,[featureContourKey(ring)])[0].holes.length,1);
  assert.deepEqual(selectFeatureContours(areas,[]),areas,"no explicit choice keeps the all-contour cut behavior");
});

test("multiple explicit contours retain their sketch order and a missing choice cannot select a different region", () => {
  const sketch=circles();
  const areas=featureAreas(analyzeSketchProfiles(sketch),sketchRegions(sketch));
  const keys=areas.map(featureContourKey);
  assert.deepEqual(selectFeatureContours(areas,[keys[1],keys[0]]),areas);
  assert.deepEqual(selectFeatureContours(areas,["missing"]),[]);
});
