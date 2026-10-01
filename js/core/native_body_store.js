// Local exact-body reuse across worker idle release and page reload. The key
// is the complete canonical geometry prefix, never a shortened hash or ID.
export function nativeBodyCacheEvictions(records,maxBytes,maxEntries) {
  const entries=records.slice().sort((a,b)=>a.at-b.at),removed=[];
  let bytes=entries.reduce((sum,entry)=>sum+entry.bytes,0);
  while(entries.length>maxEntries || bytes>maxBytes){const entry=entries.shift();bytes-=entry.bytes;removed.push(entry.key);}
  return removed;
}
export function createNativeBodyStore(database = typeof indexedDB === 'undefined' ? null : indexedDB, {maxBytes=64*1024*1024,maxEntries=24}={}) {
  let opening;
  const open=()=>{
    if(!database)return Promise.resolve(null);
    if(!opening)opening=new Promise((resolve)=>{
      const request=database.open('home3d_native_body_cache',1);
      request.onupgradeneeded=()=>{
        request.result.createObjectStore('bodies',{keyPath:'key'});
        request.result.createObjectStore('sizes',{keyPath:'key'});
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>resolve(null);
      request.onblocked=()=>resolve(null);
    });
    return opening;
  };
  return {
    async get(key) {
      try {
        const db=await open();if(!db)return null;
        return await new Promise(resolve=>{
          const request=db.transaction('bodies','readonly').objectStore('bodies').get(key);
          request.onsuccess=()=>{
            const payload=request.result?.payload;
            resolve(payload?.bytes?.byteLength && !payload.metadata?.invalid && !payload.metadata?.approximate ? payload : null);
          };
          request.onerror=()=>resolve(null);
        });
      }catch{return null;}
    },
    async remove(key) {
      try{
        const db=await open();if(!db)return;
        await new Promise(resolve=>{const tx=db.transaction(['bodies','sizes'],'readwrite');
          tx.objectStore('bodies').delete(key);tx.objectStore('sizes').delete(key);
          tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve();});
      }catch{}
    },
    async put(key,payload) {
      if(!payload?.bytes?.byteLength || payload.metadata?.invalid || payload.metadata?.approximate)return;
      try {
        const db=await open();if(!db)return;
        await new Promise(resolve=>{
          const tx=db.transaction(['bodies','sizes'],'readwrite'),bodies=tx.objectStore('bodies'),sizes=tx.objectStore('sizes');
          // Count the binary shape and serialized naming metadata/key. Meshes
          // are not persisted here. Conservatively count text as UTF-16.
          const bytes=payload.bytes.byteLength+2*(key.length+JSON.stringify({metadata:payload.metadata,topology:payload.topology}).length);
          bodies.put({key,payload});sizes.put({key,bytes,at:Date.now()});
          const request=sizes.getAll();
          request.onsuccess=()=>{
            for(const key of nativeBodyCacheEvictions(request.result,maxBytes,maxEntries)){bodies.delete(key);sizes.delete(key);}
          };
          tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve();
        });
      }catch{/* A disabled/full local store only removes the optimization. */}
    },
  };
}
