import test from "node:test";
import assert from "node:assert/strict";
import {
  circularPatternStepDegrees,
  circularPatternPivot,
  linearPatternAxisDefinitions,
  linearPatternCountPerAxis,
  linearPatternDirection,
  linearPatternOffsets,
  parseSkippedPatternInstances,
  patternAxisEnabled,
  rotatePointAroundAxis,
  rotatedPatternBounds,
} from "../js/core/pattern_geometry.js";

test("linear direction toggles support X, Y, and Z together", () => {
  const params = { axisX:true, axisY:false, axisZ:true };
  assert.deepEqual(linearPatternDirection(params),{x:1,y:0,z:1});
  assert.equal(patternAxisEnabled(params,"x"),true);
  assert.equal(patternAxisEnabled(params,"y"),false);
  assert.equal(patternAxisEnabled(params,"z"),true);
});

test("enabled axes build a Cartesian pattern from the preceding result", () => {
  const offsets=linearPatternOffsets({axisX:true,axisY:true,axisZ:true,spacing:10},2);
  assert.equal(offsets.length,7);
  assert.ok(offsets.some((offset)=>offset.x===10&&offset.y===10&&offset.z===10));
  assert.ok(offsets.some((offset)=>offset.x===10&&offset.y===0&&offset.z===10));
  assert.equal(linearPatternCountPerAxis({axisX:true,axisY:true,axisZ:true},100),5);
});

test("each linear axis has an independent count and signed spacing", () => {
  const params={axisX:true,axisY:true,axisZ:false,countX:3,spacingX:10,countY:2,spacingY:-20,skipInstances:"2, 4-5"};
  const offsets=linearPatternOffsets(params);
  assert.deepEqual(offsets.map(({x,y,z,instance})=>({x,y,z,instance})),[
    {x:0,y:-20,z:0,instance:1},
    {x:10,y:-20,z:0,instance:3},
  ]);
  assert.deepEqual([...parseSkippedPatternInstances("2, 5-7")],[2,5,6,7]);
});

test("linear spacing can increase by a fixed distance after every copy", () => {
  const offsets=linearPatternOffsets({axisX:true,axisY:false,axisZ:false,countX:4,spacingX:10,spacingIncrementX:5});
  assert.deepEqual(offsets.map((offset)=>offset.x),[10,25,45]);
});

test("large multi-axis requests are balanced under the crash guard", () => {
  const params={axisX:true,axisY:true,axisZ:true,countX:100,countY:100,countZ:100,spacingX:1,spacingY:1,spacingZ:1};
  const definitions=linearPatternAxisDefinitions(params);
  assert.ok(definitions.reduce((total,definition)=>total*definition.count,1)<=128);
  assert.ok(linearPatternOffsets(params).length<=127);
});

test("legacy single-axis pattern directions remain editable", () => {
  assert.deepEqual(linearPatternDirection({directionAxis:"y",direction:{x:0,y:1,z:0}}),{x:0,y:1,z:0});
  assert.equal(patternAxisEnabled({directionAxis:"y",direction:{x:0,y:1,z:0}},"y"),true);
});

test("circular spacing distinguishes a closed ring from a partial arc", () => {
  assert.equal(circularPatternStepDegrees({count:6,angle:360,equalSpacing:true}),60);
  assert.equal(circularPatternStepDegrees({count:3,angle:180,equalSpacing:true}),90);
  assert.equal(circularPatternStepDegrees({count:3,angle:45,equalSpacing:false}),45);
});

test("circular distance offsets the rotation axis while keeping the seed on the ring", () => {
  const pivot=circularPatternPivot({axis:"y",radialDistance:30});
  assert.deepEqual(pivot,{x:-30,y:0,z:0});
  const opposite=rotatePointAroundAxis({x:0,y:0,z:0},"y",Math.PI,pivot);
  assert.ok(Math.abs(opposite.x+60)<1e-9);
  assert.ok(Math.abs(opposite.z)<1e-9);
  assert.deepEqual(circularPatternPivot({axis:"x",radialDistance:12}),{x:0,y:-12,z:0});
});

test("pattern rotations and bounds work on every model axis", () => {
  const zTurn=rotatePointAroundAxis({x:2,y:0,z:3},"z",Math.PI/2);
  assert.ok(Math.abs(zTurn.x)<1e-9);
  assert.ok(Math.abs(zTurn.y-2)<1e-9);
  assert.equal(zTurn.z,3);
  const bounds=rotatedPatternBounds({x0:1,x1:2,y0:3,y1:4,z0:5,z1:6},[{axis:"x",angle:Math.PI}]);
  assert.ok(Math.abs(bounds.x0-1)<1e-9 && Math.abs(bounds.x1-2)<1e-9);
  assert.ok(Math.abs(bounds.y0+4)<1e-9 && Math.abs(bounds.y1+3)<1e-9);
  assert.ok(Math.abs(bounds.z0+6)<1e-9 && Math.abs(bounds.z1+5)<1e-9);
});
