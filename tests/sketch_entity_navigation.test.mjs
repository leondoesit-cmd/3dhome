import test from 'node:test';
import assert from 'node:assert/strict';
import {sketchEntityStep,sketchEntitySwipe} from '../js/core/sketch_entity_navigation.js';

test('entity browsing wraps and starts predictably without a selection',()=>{
  const entities=[{id:'a'},{id:'b'},{id:'c'}];
  assert.equal(sketchEntityStep(entities,null,1),entities[0]);
  assert.equal(sketchEntityStep(entities,null,-1),entities[2]);
  assert.equal(sketchEntityStep(entities,entities[2],1),entities[0]);
  assert.equal(sketchEntityStep(entities,entities[0],-1),entities[2]);
  assert.equal(sketchEntityStep(entities,entities[1],1),entities[2]);
  assert.deepEqual(entities,[{id:'a'},{id:'b'},{id:'c'}]);
});
test('removed selections and empty sketches remain safe',()=>{
  const entity={id:'a'};
  assert.equal(sketchEntityStep([entity],{id:'removed'},1),entity);
  assert.equal(sketchEntityStep([entity],entity,-1),entity);
  assert.equal(sketchEntityStep([],entity,1),null);
});
test('swipes require intentional horizontal travel and follow reading direction',()=>{
  assert.equal(sketchEntitySwipe(-45,4),1);
  assert.equal(sketchEntitySwipe(45,4),-1);
  assert.equal(sketchEntitySwipe(-45,4,true),-1);
  assert.equal(sketchEntitySwipe(45,4,true),1);
  assert.equal(sketchEntitySwipe(12,0),0);
  assert.equal(sketchEntitySwipe(40,35),0);
  assert.equal(sketchEntitySwipe(NaN,0),0);
});
