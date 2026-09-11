import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, findChrome } from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'Chrome unavailable'};

test('density and inspector choices persist; origin planes start a sketch',opts,async()=>{
 const page=await openPage({width:1280,height:800,lang:'en'});
 try {
  await page.goto('/'); await page.waitForBoot();
  await page.eval(()=>document.getElementById('openModelerTop').click());
  await page.waitUntil(()=>!!window.cadPreviewView);
  await page.eval(()=>document.getElementById('mdWelcomeClose').click());
  assert.equal(await page.eval(()=>document.getElementById('modeler').classList.contains('md-right-collapsed')),true);
  assert.equal(await page.eval(()=>!!document.querySelector('#mdCons #mdName')),true);
  assert.equal(await page.eval(()=>document.querySelectorAll('#mdEmptyStart button').length),3);
  assert.equal(await page.eval(()=>window.cadPreviewView.grp.children.filter(x=>x.isMesh&&x.userData.cadReferenceId?.startsWith('plane:')).length),3);
  await page.eval(()=>{document.getElementById('mdToggleRight').click();const d=document.getElementById('mdDensity');d.value='standard';d.dispatchEvent(new Event('change',{bubbles:true}));});
  const prefs=await page.eval(()=>JSON.parse(localStorage.getItem('home3d_modeler_prefs')));
  assert.equal(prefs.rightCollapsedPreference,false); assert.equal(prefs.coachEnabled,false);assert.equal(prefs.workflowVisible,false);
  await page.eval(()=>document.getElementById('mdClose').click());
  await page.eval(()=>document.getElementById('openModelerTop').click());
  await page.waitUntil(()=>getComputedStyle(document.getElementById('modeler')).display!=='none');
  assert.equal(await page.eval(()=>document.getElementById('mdWelcome').hidden),true);
  assert.equal(await page.eval(()=>document.getElementById('modeler').classList.contains('md-right-collapsed')),false);
  await page.eval(()=>document.querySelector('#mdEmptyStart [data-origin-plane="front"]').click());
  await page.waitUntil(()=>window.cadSketchSnapshot().phase==='sketch');
  assert.equal(await page.eval(()=>window.cadSketchSnapshot().plane),'front');
 } finally {await page.close();}
});

test('pattern overlap warning clears with spacing and a typed handle updates the preview',opts,async()=>{
 const page=await openPage({width:1280,height:800,lang:'en'});
 try {
  await page.goto('/');await page.waitForBoot();
  await page.eval(async()=>{const {openModeler}=await import('/js/modeler.js');openModeler(null,{key:'cm_ux_test',name:'Test cube',parts:[{id:'seed',kind:'box',x0:0,x1:10,y0:0,y1:10,z0:0,z1:10,color:'#aaaaaa'}]},null);});
  await page.waitUntil(()=>!!window.cadOpenFeatureForm);
  await page.eval(()=>{window.cadOpenFeatureForm('pattern');window.cadSetFeatureFormParams({mode:'linear',count:3,countX:3,spacing:6,spacingX:6,mergeResult:false});});
  let preview=await page.eval(()=>window.cadFinishPreviewSnapshot());
  assert.equal(preview.patternOverlap,true);assert.ok(preview.parts.some(p=>p.color==='#d0342c'));assert.match(preview.badge.text,/may overlap/);
  await page.eval(()=>window.cadSetFeatureFormParams({spacing:15,spacingX:15}));
  preview=await page.eval(()=>window.cadFinishPreviewSnapshot());assert.equal(preview.patternOverlap,false);assert.doesNotMatch(preview.badge.text,/may overlap/);
  await page.waitUntil(()=>!!document.querySelector('input.md-instant3d-value:not([hidden])'));
  await page.eval(()=>{const chip=document.querySelector('input.md-instant3d-value');chip.value='24';chip.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitUntil(()=>window.cadFinishPreviewSnapshot().params.spacingX===24);
 } finally {await page.close();}
});

test('tree repair works by button and Enter and marks a missing reference',opts,async()=>{
 const page=await openPage({width:1280,height:800,lang:'en'});
 try {
  await page.goto('/');await page.waitForBoot();
  await page.eval(async()=>{
   const {ensureParametricDocument,createSketchDefinition,createFeatureDefinition}=await import('/js/core/parametric_document.js');
   const {createTopologyReference}=await import('/js/core/topology.js');
   const {openModeler}=await import('/js/modeler.js');
   const def=ensureParametricDocument({key:'cm_repair_test',name:'Repair test',parts:[{id:'body',featureId:'base',kind:'ext',axis:'y',from:0,to:10,pts:[{u:0,v:0},{u:10,v:0},{u:10,v:10},{u:0,v:10}],holes:[]}]});
   createSketchDefinition(def,{id:'profile',referenceId:'plane:top',plane:'top',points:[{id:'a',x:0,y:0,fixed:true},{id:'b',x:10,y:0,fixed:true},{id:'c',x:10,y:10,fixed:true},{id:'d',x:0,y:10,fixed:true}],entities:[{id:'e1',type:'line',a:'a',b:'b'},{id:'e2',type:'line',a:'b',b:'c'},{id:'e3',type:'line',a:'c',b:'d'},{id:'e4',type:'line',a:'d',b:'a'}],constraints:[]});
   createFeatureDefinition(def,'extrude',{id:'base',name:'Base',params:{depth:10,axis:'y',from:0,to:10,profileEntityIds:['e1','e2','e3','e4']},references:{sketches:['profile']}});
   const target=createTopologyReference('base','edge','base:missing',{curve:'circle',semantic:'missing',origin:{x:30,y:30,z:30},axis:{x:0,y:1,z:0},measure:1});
   createFeatureDefinition(def,'fillet',{id:'broken',name:'Broken fillet',params:{radius:1,targets:[target]},inputs:['base'],references:{features:['base'],topology:[target]}});
   openModeler(null,def,null);
  });
  await page.waitUntil(()=>!!document.querySelector('[data-node-id="feature:broken"] button.md-tree-warn'));
  await page.waitUntil(()=>!!window.cadPreviewView?.grp,{what:'repair preview scene'});
  await page.eval(()=>document.querySelector('[data-node-id="feature:broken"] button.md-tree-warn').click());
  await page.waitUntil(()=>!document.getElementById('mdQuickSettings').hidden);
  assert.equal(await page.eval(()=>window.cadPreviewView.grp.children.some(x=>x.userData.cadRepairReference==='base:missing')),true);
  assert.match(await page.eval(()=>document.getElementById('mdQuickSettings').textContent),/last known location/);
  await page.eval(()=>document.querySelector('#mdQuickSettings .md-quick-cancel').click());
  await page.eval(()=>{const row=document.querySelector('[data-node-id="feature:broken"]');row.click();row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
  await page.waitUntil(()=>!document.getElementById('mdQuickSettings').hidden);
  assert.match(await page.eval(()=>document.getElementById('mdQuickSettings').textContent),/Broken fillet/);
 } finally {await page.close();}
});
