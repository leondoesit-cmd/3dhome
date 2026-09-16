// Project geometry belongs in IndexedDB, not the small localStorage quota.
// Legacy saves remain readable until the first database save succeeds.
function database() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('home3d_projects',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('projects');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
export async function saveLocalProject(raw) {
  if(typeof indexedDB==='undefined'){localStorage.setItem('home3d',raw);return;}
  const db=await database();
  try {await new Promise((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite');
    tx.objectStore('projects').put(raw,'latest');
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error || new Error('Project save aborted'));
  });} finally {db.close();}
}
export async function loadLocalProject() {
  if(typeof indexedDB==='undefined')return localStorage.getItem('home3d');
  const db=await database();
  try {return await new Promise((resolve,reject)=>{
    const request=db.transaction('projects','readonly').objectStore('projects').get('latest');
    request.onsuccess=()=>resolve(request.result ?? localStorage.getItem('home3d'));
    request.onerror=()=>reject(request.error);
  });} finally {db.close();}
}
