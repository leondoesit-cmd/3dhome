import {surveyStore} from './survey_store.js';
import {acceptRemote} from './net.js';
// Transfers are scoped to attachment IDs already referenced by this project.
// Chunks stay below relay limits; binary data never enters undo snapshots.
const requested=new Map(),incoming=new Map();
const chunkSize=128*1024,maxLength=42*1024*1024;
export function forgetSurveyPhotoPeer(peer){
 for(const [key,record] of requested)if(record.peer===peer)requested.delete(key);
 for(const [key,record] of incoming)if(record.peer===peer)incoming.delete(key);
}
function expireTransfers(){
 const now=Date.now();
 for(const [key,record] of requested)if(now-record.at>60000)requested.delete(key);
 for(const [key,record] of incoming)if(now-record.at>60000)incoming.delete(key);
}
export async function requestSurveyPhotos(survey,peer,projectId,send){
 expireTransfers();
 for(const photo of survey?.photos||[]){const id=photo.attachmentId,key=projectId+':'+id;if(requested.has(key)||await surveyStore('get',id)||requested.has(key))continue;requested.set(key,{at:Date.now(),peer});try{send({k:'survey_photo_request',projectId,id},peer);}catch(error){requested.delete(key);throw error;}}

}
export async function handleSurveyPhoto(data,peer,survey,projectId,send,ctx){
 expireTransfers();
 if(!data.k?.startsWith('survey_photo_'))return false;
 // Live callers supply room authority; storage-only callers can exercise assembly separately.
 const allowed=()=>!ctx||acceptRemote(data.k,peer,typeof ctx==='function'?ctx():ctx);
 if(!allowed())return true;
 if(data.projectId!==projectId||!survey?.photos?.some(p=>p.attachmentId===data.id))return true;
 if(data.k==='survey_photo_request'){
  const photo=await surveyStore('get',data.id);if(!allowed()||!photo?.data||photo.data.length>maxLength)return true;
  const count=Math.ceil(photo.data.length/chunkSize);
  for(let index=0;index<count;index++)send({k:'survey_photo_chunk',projectId,id:data.id,index,count,part:photo.data.slice(index*chunkSize,(index+1)*chunkSize)},peer);
 }else if(data.k==='survey_photo_chunk'){
  const key=projectId+':'+data.id;
  if(requested.get(key)?.peer!==peer||!Number.isInteger(data.count)||data.count<1||data.count>Math.ceil(maxLength/chunkSize)||!Number.isInteger(data.index)||data.index<0||data.index>=data.count||typeof data.part!=='string'||data.part.length>chunkSize)return true;
  let record=incoming.get(key);if(!record){if(incoming.size>=8)return true;record={peer,count:data.count,parts:new Map(),at:Date.now()};incoming.set(key,record);}
  if(record.peer!==peer||record.count!==data.count)return true;
  if(record.parts.has(data.index)){
   if(record.parts.get(data.index)!==data.part){incoming.delete(key);requested.delete(key);}
   return true;
  }
  record.parts.set(data.index,data.part);
  record.at=Date.now();requested.get(key).at=record.at;
  if(record.parts.size===record.count){const body=Array.from({length:record.count},(_,i)=>record.parts.get(i)).join('');incoming.delete(key);requested.delete(key);if(body.length<=maxLength&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body))await surveyStore('put',data.id,{...survey.photos.find(p=>p.attachmentId===data.id),id:data.id,data:body});}
 }

 return true;
}
