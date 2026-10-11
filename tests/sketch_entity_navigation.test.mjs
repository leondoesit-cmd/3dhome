import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
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
test('completed feature action does not hide actual face-sketch navigator',()=>{
  const node=()=>({dataset:{},setAttribute(){},appendChild(){},addEventListener(){}});
  const strip=node(),sketch={id:'face',entities:[{id:'circle',type:'circle'}]};
  const E={def:{activeSketch:'face',sketches:[sketch]},quickAction:'extrude',docType:'part',mode:'2d',tool:'select',authoring:{phase:'sketch'}};
  let formOpen=false;
  const root={querySelector:selector=>selector==='#mdEntityNav'?strip:formOpen?node():null};
  const bindings={E,root,getLang:()=> 'en',selEntities:()=>[],el:node,btn:node,sketchEntityStep,sketchEntitySwipe};
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
  const sync=new Function(...Object.keys(bindings),sourceFunctionText(source,'syncSketchEntityNavigator')+';return syncSketchEntityNavigator;')(...Object.values(bindings));
  sync();assert.equal(strip.hidden,false);
  formOpen=true;sync();assert.equal(strip.hidden,true);
});
