// Publish a complete cache only after all assets are stored. A failed update
// leaves the last prepared application usable, including after worker restart.
const PREFIX='modelforge-survey-',LEGACY=PREFIX+'v1',META=PREFIX+'manifest';
let preparation=null;
async function activeCache(){
  const record=await (await caches.open(META)).match('/active-survey-cache');
  return record?await record.text():LEGACY;
}
async function cacheAsset(cache,path){
  let response,body;
  for(let attempt=0;attempt<2;attempt++){
    try{response=await fetch(path,{cache:'reload'});if(response.ok&&response.status!==206)body=await response.arrayBuffer();}
    catch(error){if(!attempt)continue;throw new Error('Could not download '+path+': '+error.message);}
    if(response.ok&&response.status!==206)break;
    if(!attempt&&[502,503,504].includes(response.status))continue;
    throw new Error('Could not download '+path+' (HTTP '+response.status+')');
  }
  // Storage errors are not network retries. Publish only after every write
  // finishes, so failure cleanup cannot race another write in this batch.
  const headers=new Headers(response.headers);
  headers.delete('content-encoding');headers.delete('content-length');
  try{await cache.put(path,new Response(body,{status:response.status,statusText:response.statusText,headers}));}
  catch(error){throw new Error('Could not store '+path+': '+error.message);}
}
async function prepare(){
  const name=PREFIX+'assets-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  try{
    const response=await fetch('/survey-assets.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Asset list unavailable');
    const {assets}=await response.json();
    if(!Array.isArray(assets)||!assets.length||assets.some(path=>typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.startsWith('/api/')||/[?#]/.test(path)))throw new Error('Invalid asset list');
    const cache=await caches.open(name);
    for(let i=0;i<assets.length;i+=8){
      const batch=await Promise.allSettled(assets.slice(i,i+8).map(path=>cacheAsset(cache,path)));
      const failed=batch.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    }
    const previous=await activeCache();
    await (await caches.open(META)).put('/active-survey-cache',new Response(name));
    // Keep the previous complete generation for requests already in flight.
    try{for(const key of await caches.keys())if(key.startsWith(PREFIX)&&![META,name,previous].includes(key))await caches.delete(key);}catch{/* Cache cleanup must not undo a published generation. */}
  }catch(error){await caches.delete(name);throw error;}
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='prepare')return;
  if(!preparation)preparation=prepare().finally(()=>{preparation=null;});
  event.waitUntil(preparation.then(()=>event.ports[0]?.postMessage({ok:true}),error=>event.ports[0]?.postMessage({ok:false,error:error.message})));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||!(url.pathname==='/'||/\.(html|js|mjs|css|wasm|gz|woff2?|ttf|json|svg|png|webp|jpg)$/.test(url.pathname)))return;
  event.respondWith((async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
    try{const response=await fetch(event.request,{signal:controller.signal});if(response.ok)return response;
      const cached=await (await caches.open(await activeCache())).match(url.pathname==='/'?'/index.html':url.pathname);return cached||response;
    }catch(error){const cached=await (await caches.open(await activeCache())).match(url.pathname==='/'?'/index.html':url.pathname);if(cached)return cached;throw error;}
    finally{clearTimeout(timer);}
  })());
});
