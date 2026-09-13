import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSurveyReport} from '../js/survey_report.js';
const features=[
 {id:'roof',label:'Sloping roof',kind:'face',points:[{x:0,y:250,z:0},{x:400,y:350,z:0},{x:400,y:350,z:200},{x:0,y:250,z:200}]},
 {id:'datum',label:'Measured benchmark',kind:'point',points:[{x:-25,y:-12.75,z:15}]}
];
const fixture=()=>({nodes:[],walls:[],openings:[],surveyFeatures:structuredClone(features),workspace:{activeFloor:'a',floors:[{id:'a',name:'Ground'},{id:'b',name:'Upper',scene:{nodes:[],walls:[],surveyFeatures:[{id:'upper',kind:'polyline',points:[{x:10,y:20,z:30},{x:40,y:50,z:60}]}]}}]}});
test('report preserves source geometry and displays heights, coordinates and measured points on each floor',()=>{
 const state=fixture(),before=JSON.stringify(state),html=buildSurveyReport(state);
 assert.equal(JSON.stringify(state),before);
 assert.match(html,/points="0,-250 400,-350 400,-350 0,-250"/);
 assert.match(html,/points="0,-250 0,-350 200,-350 200,-250"/);
 assert.match(html,/<circle cx="-25" cy="15"/);
 assert.match(html,/<td>-25<\/td><td>-12.75<\/td><td>15<\/td>/);
 assert.match(html,/Upper[\s\S]*points="10,-20 40,-50"/);
 assert.equal((html.match(/class="survey-feature"/g)||[]).length,3);
});
test('report uses explicit language and safely escapes feature labels',()=>{
 const state=fixture();state.surveyFeatures[0].label='<script>roof</script>';
 const html=buildSurveyReport(state,[],key=>key==='report_xy'?'חזית X / גובה':key,{language:'he'});
 assert.match(html,/<html lang="he" dir="rtl">/);
 assert.match(html,/חזית X \/ גובה/);
 assert.match(html,/&lt;script&gt;roof&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/name="viewport"/);
 assert.match(buildSurveyReport(state),/<html lang="en" dir="ltr">/);
});
test('report omits invalid feature geometry without losing valid features',()=>{
 const state=fixture();state.surveyFeatures.push({id:'invalid',kind:'point',points:[{x:Infinity,y:0,z:0}]});
 const html=buildSurveyReport(state);assert.doesNotMatch(html,/Infinity|NaN/);assert.match(html,/Measured benchmark/);
});

test('an incomplete floor never borrows the active floor geometry in a report',()=>{
 const state=fixture();state.workspace.floors.push({id:'missing',name:'Unmeasured attic'});
 const html=buildSurveyReport(state);
 assert.match(html,/<h2>Unmeasured attic<\/h2><p>report_missing_floor<\/p>/);
 assert.equal((html.match(/class="survey-feature"/g)||[]).length,3);
});
