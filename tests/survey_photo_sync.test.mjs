import test from 'node:test';
import assert from 'node:assert/strict';
import {requestSurveyPhotos,handleSurveyPhoto} from '../js/survey_photo_sync.js';
import {surveyStore} from '../js/survey_store.js';

test('only requested photos from the selected peer are accepted and assembled',async()=>{
 const id='photo-sync-test',survey={photos:[{attachmentId:id}]},sent=[];
 await requestSurveyPhotos(survey,'source','project',(data,peer)=>sent.push({data,peer}));
 assert.equal(sent.length,1);assert.equal(sent[0].peer,'source');
 const chunk={k:'survey_photo_chunk',projectId:'project',id,count:1,index:0,part:'data:image/png;base64,YQ=='};
 await handleSurveyPhoto(chunk,'other',survey,'project',()=>{});assert.equal(await surveyStore('get',id),undefined);
 await handleSurveyPhoto(chunk,'source',survey,'project',()=>{});assert.equal((await surveyStore('get',id)).data,chunk.part);
 await requestSurveyPhotos(survey,'source','project',()=>assert.fail('already stored'));
 await surveyStore('delete',id);
});
test('an interrupted photo transfer can restart from another peer after expiry',async t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);
 const id='photo-retry-test',survey={photos:[{attachmentId:id}]};
 await requestSurveyPhotos(survey,'old','retry',()=>{});
 await handleSurveyPhoto({k:'survey_photo_chunk',projectId:'retry',id,count:2,index:0,part:'data:image/png;'},'old',survey,'retry',()=>{});
 now+=61000;let requests=0;
 await requestSurveyPhotos(survey,'new','retry',()=>requests++);assert.equal(requests,1);
 await handleSurveyPhoto({k:'survey_photo_chunk',projectId:'retry',id,count:1,index:0,part:'data:image/png;base64,YQ=='},'new',survey,'retry',()=>{});
 assert.equal((await surveyStore('get',id)).data,'data:image/png;base64,YQ==');await surveyStore('delete',id);
});
test('slow progressing transfers survive, conflicting duplicates require a clean retry',async t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);
 const id='slow-transfer',survey={photos:[{attachmentId:id}]},project='slow';
 await requestSurveyPhotos(survey,'source',project,()=>{});
 const chunk=(index,part)=>({k:'survey_photo_chunk',projectId:project,id,count:3,index,part});
 now+=50000;await handleSurveyPhoto(chunk(2,'YQ=='),'source',survey,project,()=>{});
 now+=50000;await handleSurveyPhoto(chunk(0,'data:image/png;'),'source',survey,project,()=>{});
 now+=50000;await handleSurveyPhoto(chunk(1,'base64,'),'source',survey,project,()=>{});
 assert.equal((await surveyStore('get',id)).data,'data:image/png;base64,YQ==');await surveyStore('delete',id);
 await requestSurveyPhotos(survey,'source',project,()=>{});
 await handleSurveyPhoto(chunk(0,'data:image/png;'),'source',survey,project,()=>{});
 await handleSurveyPhoto(chunk(0,'different'),'source',survey,project,()=>{});
 await handleSurveyPhoto(chunk(1,'base64,'),'source',survey,project,()=>{});
 assert.equal(await surveyStore('get',id),undefined);
 let retried=0;await requestSurveyPhotos(survey,'other',project,()=>retried++);assert.equal(retried,1);
});
test('failed sends can retry immediately instead of waiting for expiration',async()=>{
 const survey={photos:[{attachmentId:'send-failure'}]};
 await assert.rejects(requestSurveyPhotos(survey,'source','send-failure',()=>{throw new Error('Disconnected');}));
 let sent=0;await requestSurveyPhotos(survey,'replacement','send-failure',()=>sent++);assert.equal(sent,1);
});
test('peer departure releases incomplete transfers for immediate replacement',async()=>{
 const {forgetSurveyPhotoPeer}=await import('../js/survey_photo_sync.js');
 const survey={photos:[{attachmentId:'departed-photo'}]};
 await requestSurveyPhotos(survey,'departed','departure',()=>{});forgetSurveyPhotoPeer('departed');
 let sent=0;await requestSurveyPhotos(survey,'replacement','departure',()=>sent++);assert.equal(sent,1);
});
