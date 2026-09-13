import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const available=await findChrome();
for(const lang of ['en','he'])test(`survey report elevations and coordinates fit ${lang} desktop and phone`,{skip:!available},async()=>{
 const page=await openPage({width:lang==='he'?390:1280,height:900,lang});
 try{
  await page.goto('/');await page.waitForBoot();
  const result=await page.eval(async(lang)=>{
   const {buildSurveyReport}=await import('/js/survey_report.js'),{st}=await import('/js/survey_strings.js'),{practiceDocument}=await import('/js/survey_practice.js');
   const state=practiceDocument('site');
   state.surveyFeatures.push({id:'benchmark',kind:'point',label:'Benchmark',points:[{x:30,y:-20,z:40}]});
   const input=JSON.stringify(state),html=buildSurveyReport(state,[],st,{language:lang});
   const frame=document.createElement('iframe');frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:999999;background:white';
   const ready=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=html;document.body.append(frame);await ready;
   const doc=frame.contentDocument,rects=[...doc.querySelectorAll('svg,table')].map(e=>e.getBoundingClientRect());
   return {unchanged:JSON.stringify(state)===input,dir:doc.documentElement.dir,language:doc.documentElement.lang,overflow:doc.documentElement.scrollWidth>frame.clientWidth+1,visible:rects.every(r=>r.width>0&&r.left>=0&&r.right<=frame.clientWidth+1),features:doc.querySelectorAll('.survey-feature').length,points:doc.querySelectorAll('circle').length,translated:!doc.body.textContent.includes('report_coordinates')};
  },lang);
  assert.equal(result.unchanged,true);assert.equal(result.dir,lang==='he'?'rtl':'ltr');assert.equal(result.language,lang);
  assert.equal(result.overflow,false);assert.equal(result.visible,true);assert.ok(result.features>0);assert.ok(result.points>=3);assert.equal(result.translated,true);
  await page.eval(()=>document.querySelector('iframe').contentDocument.querySelector('.survey-feature').scrollIntoView());
  await page.screenshot(`/tmp/survey-report-${lang}.png`);
 }finally{await page.close();}
});
