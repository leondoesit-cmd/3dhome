import test from 'node:test';import assert from 'node:assert/strict';
import {scoreBlueprintRecognition}from'../tools/blueprint_score.mjs';
test('source-image scoring compares scaled/rotated footprints and detects unsupported partitions',()=>{
 const expected={referenceCalibration:{cmPerPx:2,originX:-20,originZ:-10},items:[{type:'bed',x:80,z:90,w:80,d:160,rot:90}],walls:[{a:{x:0,z:0},b:{x:200,z:0}}]};
 const actual={referenceCalibration:{cmPerPx:1,originX:-10,originZ:-5},reconstruction:{items:[{type:'bed',x:40,z:45,w:40,d:80,rot:270},{type:'bed',x:200,z:200,w:40,d:80,rot:0}],nodes:[{x:0,z:0},{x:100,z:0},{x:50,z:50}],walls:[{a:0,b:1},{a:1,b:2}]}};
 const score=scoreBlueprintRecognition(actual,expected);assert.equal(score.fixtureMatches,1);assert.equal(score.fixturePrecision,.5);
 assert.ok(score.actualWallSupport.unsupportedPx>50);assert.equal(score.expectedWallCoverage.fraction,1);
});
