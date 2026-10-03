import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function fixture(){
  const state={open:true,hidden:false,library:false,fingerprints:0,renders:0,tasks:[],cacheReads:0};
  const pane={classList:{contains:()=>state.library}},host={closest:selector=>{assert.equal(selector,'.md-pane[data-pane="lib"]');return pane;}};
  const node=()=>({isConnected:true,appendChild(){},replaceWith(){state.replaced=true;}});
  let releaseCache;
  const cache=new Promise(resolve=>releaseCache=resolve);
  const bindings={E:{get open(){return state.open;}},document:{get hidden(){return state.hidden;}},root:{querySelector:()=>host},FURN:{part:{}},hasThumb:()=>{state.fingerprints++;return false;},modelThumb:()=>{state.renders++;return 'data:image/png;test';},el:node,setTimeout:fn=>{state.tasks.push(fn);return state.tasks.length;},loadThumbCache:()=>{state.cacheReads++;return cache;}};
  const api=new Function(...Object.keys(bindings),'var libThumbQueue=[],libThumbTimer=0;'+['libraryThumbnailsVisible','scheduleLibThumbs','libThumb','fillLibThumbs'].map(name=>sourceFunctionText(source,name)).join('\n')+';return {libThumb,scheduleLibThumbs,pending:()=>libThumbQueue.length};')(...Object.values(bindings));
  return {state,api,releaseCache};
}
test('hidden library cards defer definition fingerprint and native thumbnail rendering until activated',async()=>{
  const f=fixture();f.api.libThumb('part','ph-cube');
  assert.equal(f.state.fingerprints,0);assert.equal(f.state.renders,0);assert.equal(f.state.tasks.length,0);assert.equal(f.api.pending(),1);
  f.state.library=true;f.api.scheduleLibThumbs();f.state.tasks.shift()();f.releaseCache();await Promise.resolve();
  assert.equal(f.state.renders,1);assert.equal(f.state.replaced,true);assert.equal(f.api.pending(),0);
});
for(const reason of ['hidden','closed','tree'])test('thumbnail cache completion pauses when editor becomes '+reason+' and resumes without losing card',async()=>{
  const f=fixture();f.state.library=true;f.api.libThumb('part','ph-cube');f.state.tasks.shift()();
  if(reason==='hidden')f.state.hidden=true;else if(reason==='closed')f.state.open=false;else f.state.library=false;
  f.releaseCache();await Promise.resolve();assert.equal(f.state.renders,0);assert.equal(f.api.pending(),1);
  f.state.hidden=false;f.state.open=true;f.state.library=true;f.api.scheduleLibThumbs();f.state.tasks.shift()();await Promise.resolve();
  assert.equal(f.state.renders,1);assert.equal(f.api.pending(),0);
});
