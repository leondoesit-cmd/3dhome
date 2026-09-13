import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../survey-sw.js',import.meta.url),'utf8');
function worker(){
 const handlers={},stored=new Map();let fail=false,offline=false,version='old',networkFailures=0;
 const cache=name=>{if(!stored.has(name))stored.set(name,new Map());const data=stored.get(name);return {match:async key=>data.get(key)?.clone(),put:async(key,value)=>{if(fail&&key==='/last.js')throw new Error('Quota exceeded');data.set(key,value.clone());}};};
 const context={self:{location:{origin:'https://survey.test'},addEventListener:(key,fn)=>handlers[key]=fn},caches:{open:async name=>cache(name),keys:async()=>[...stored.keys()],delete:async name=>stored.delete(name)},fetch:async url=>{if(offline)throw new Error('offline');if(url==='/last.js'&&networkFailures>0){networkFailures--;throw new TypeError('Network interrupted');}return url==='/survey-assets.json'?Response.json({assets:['/index.html','/last.js']}):new Response(version);},Response,Headers,URL,AbortController,setTimeout,clearTimeout,Date,Math};
 vm.runInNewContext(source,context);
 return {stored,set:(next)=>{({fail=fail,offline=offline,version=version,networkFailures=networkFailures}=next);},prepare:async()=>{let task,result;handlers.message({data:{type:'prepare'},ports:[{postMessage:value=>result=value}],waitUntil:p=>task=p});await task;return result;},fetch:async path=>{let task;handlers.fetch({request:{url:'https://survey.test'+path,method:'GET'},respondWith:p=>task=p});return task?(await task).text():null;}};
}
test('quota failure during offline update retains the complete prepared generation',async()=>{
 const w=worker();assert.equal((await w.prepare()).ok,true);
 w.set({fail:true,version:'new'});assert.equal((await w.prepare()).ok,false);
 w.set({offline:true});assert.equal(await w.fetch('/'),'old');assert.equal(await w.fetch('/last.js'),'old');assert.equal(await w.fetch('/api/private.json'),null);
 assert.equal([...w.stored.keys()].filter(k=>k.includes('assets-')).length,1);
 w.set({offline:false,fail:false});assert.equal((await w.prepare()).ok,true);w.set({offline:true});assert.equal(await w.fetch('/'),'new');
});

test('offline preparation retries one interrupted download without publishing a partial generation',async()=>{
 const w=worker();w.set({networkFailures:1});assert.equal((await w.prepare()).ok,true);
 w.set({offline:true});assert.equal(await w.fetch('/last.js'),'old');
});
test('persistent download failures identify the asset and retain the previous prepared app',async()=>{
 const w=worker();assert.equal((await w.prepare()).ok,true);w.set({version:'new',networkFailures:2});
 const result=await w.prepare();assert.equal(result.ok,false);assert.match(result.error,/Could not download \/last.js/);
 w.set({offline:true});assert.equal(await w.fetch('/last.js'),'old');
 assert.equal([...w.stored.keys()].filter(k=>k.includes('assets-')).length,1);
});
