import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'Chrome unavailable'};let page;
test.after(async()=>page?.close());
test('photo quota failure preserves stored evidence and allows a clean transfer retry',opts,async()=>{
 page=await openPage({width:1280,height:900});await page.goto('/');
 const result=await page.eval(async()=>{
  const {surveyStore}=await import('/js/survey_store.js'),sync=await import('/js/survey_photo_sync.js');
  await surveyStore('put','retained',{id:'retained',data:'data:image/png;base64,YQ=='});
  const survey={photos:[{attachmentId:'quota-transfer'}]},sent=[],send=(...args)=>sent.push(args);
  const chunk={k:'survey_photo_chunk',projectId:'quota',id:'quota-transfer',count:1,index:0,part:'data:image/png;base64,Yg=='};
  await sync.requestSurveyPhotos(survey,'peer','quota',send);
  const original=IDBObjectStore.prototype.put;let failed=false;
  try{IDBObjectStore.prototype.put=function(){throw new DOMException('Full','QuotaExceededError');};await sync.handleSurveyPhoto(chunk,'peer',survey,'quota',send);}catch(e){failed=e.name==='QuotaExceededError';}finally{IDBObjectStore.prototype.put=original;}
  const retained=await surveyStore('get','retained'),missing=!(await surveyStore('get','quota-transfer'));
  await sync.requestSurveyPhotos(survey,'new-peer','quota',send);await sync.handleSurveyPhoto(chunk,'new-peer',survey,'quota',send);
  return {failed,retained:retained.data,missing,retried:sent.length===2,stored:(await surveyStore('get','quota-transfer')).data};
 });
 assert.deepEqual(result,{failed:true,retained:'data:image/png;base64,YQ==',missing:true,retried:true,stored:'data:image/png;base64,Yg=='});
});
test('prepared application reloads offline with saved survey evidence',opts,async()=>{
 await page.eval(async()=>{await (await import('/js/survey_offline.js')).prepareSurveyOffline();});
 await page.send('Network.enable',{});await page.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 try{
  await page.goto('/');
  const state=await page.eval(async()=>({boot:!!window.__home3dBooted,photo:(await (await import('/js/survey_store.js')).surveyStore('get','retained')).data,worker:!!navigator.serviceWorker.controller}));
  assert.deepEqual(state,{boot:true,photo:'data:image/png;base64,YQ==',worker:true});
 }finally{await page.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});}
});
