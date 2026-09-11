const memory=new Map();
export async function surveyStore(action,key,value) {
  if(typeof indexedDB==='undefined'){if(action==='put')memory.set(key,value);if(action==='delete')memory.delete(key);return memory.get(key);}
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('home3d_survey',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('records',action==='get'?'readonly':'readwrite'),store=tx.objectStore('records');
    const r=action==='put'?store.put(value,key):action==='delete'?store.delete(key):store.get(key);
    let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Survey storage aborted'));
  });}finally{db.close();}
}
export async function storeSurveyPhoto(file) {
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>30*1024*1024)throw new Error('SURVEY_PHOTO_INVALID');
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);});
  const id='photo-'+crypto.randomUUID();
  const record={id,attachmentId:id,name:file.name,mimeType:file.type,at:Date.now()};
  await surveyStore('put',id,{...record,data});return record;
}
export async function surveyPhotoAttachments(survey,{allowMissing=false}={}) {
  const result=[];for(const p of survey.photos||[]){const record=await surveyStore('get',p.attachmentId);if(!record&&!allowMissing)throw new Error('SURVEY_PHOTO_MISSING');result.push(record||{...p,missing:true});}return result;
}
