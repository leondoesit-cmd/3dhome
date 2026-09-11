import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const opts=await findChrome()?{}:{skip:'Chrome unavailable'};
let page;test.after(async()=>page?.close());
test('survey practice preserves project and undo history across a separate document',opts,async()=>{
 page=await openPage({width:1280,height:900});await page.goto('/');await page.waitForBoot();
 const result=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),ui=await import('/js/ui_survey.js'),h=await import('/js/history.js');
  const before=JSON.stringify([S.nodes,S.walls,S.items,S.workspace.activeFloor]);
  const history=h.captureHistorySession();
  await ui.enterPractice('rectangle');
  const practice=S.workspace.survey.mode==='practice'&&S.walls.length===4;
  await ui.returnFromPractice();
  return {practice,restored:JSON.stringify([S.nodes,S.walls,S.items,S.workspace.activeFloor])===before,history:!!history.history};
 });
 assert.deepEqual(result,{practice:true,restored:true,history:true});
});
test('shared 3D input creates walls without touching the 2D scale and can switch mid draft',opts,async()=>{
 const result=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),{dispatchPlannerInput}=await import('/js/planner_input.js'),{setTool}=await import('/js/interaction.js');
  const {applyData}=await import('/js/ui.js');await applyData({nodes:[],walls:[],items:[],openings:[],roomMeta:{}});
  const sc=S.SC;setTool('wall');window.__setViewMode('3d');
  const send=(phase,x,z)=>dispatchPlannerInput(phase,{point:{x,z},scale:1,width:1000,height:800,event:{pointerId:1,buttons:phase==='up'?0:1}});
  send('down',0,0);send('move',300,0);send('up',300,0);
  const first=S.walls.length;
  window.__setViewMode('plan');window.__setViewMode('3d');
  return {first,tool:S.tool,scaleSame:S.SC===sc,toolbar:document.getElementById('plan-tools').parentElement.id};
 });
 assert.equal(result.first,1,JSON.stringify(result));assert.equal(result.tool,'wall');assert.equal(result.scaleSame,true);assert.equal(result.toolbar,'view-3d');
});

test('correction preview is detached and applies with evidence in one undo step',opts,async()=>{
 const result=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{practiceDocument}=await import('/js/survey_practice.js');
  const {prepareSurveyCorrection,applySurveyCorrection}=await import('/js/survey_correction.js');
  const {startSurvey,recordObservation}=await import('/js/survey.js');const h=await import('/js/history.js');
  await applyData(practiceDocument('rectangle'));S.structLocked=false;S.walls.forEach(w=>w.lock=false);S.workspace.survey=startSurvey(S);
  const before=JSON.stringify(S.nodes),o={id:'test-height',missionId:S.workspace.survey.missions[1].id,target:{kind:'wall',id:S.walls[0].id,floorId:S.workspace.activeFloor},field:'height',value:285,unit:'cm',reference:'interior',status:'checked'};
  const preview=prepareSurveyCorrection(S,o);if(!preview.ok)return preview;
  const detached=S.walls[0].height===270&&before===JSON.stringify(S.nodes);
  const token=h.beginHistoryTransaction('Survey correction');applySurveyCorrection(S,preview);S.workspace.survey=recordObservation(S,o);h.commitHistoryTransaction(token);
  const applied=S.walls[0].height===285&&S.workspace.survey.observations.length===1;
  h.undo();const undone=S.walls[0].height===270&&S.workspace.survey.observations.length===0;
  return {detached,applied,undone};
 });
 assert.deepEqual(result,{detached:true,applied:true,undone:true});
});
for(const [width,height,lang] of [[390,844,'en'],[390,844,'he'],[717,829,'he']])test(`survey sheet and view toggle fit ${width}px ${lang}`,opts,async()=>{
 await page.resize(width,height,{mobile:true,touch:true});await page.setLang(lang);await page.goto('/');await page.waitForBoot();
 const result=await page.eval(async()=>{
  const {openSurvey}=await import('/js/ui_survey.js');openSurvey();window.__setViewMode('3d');
  const p=document.getElementById('survey-panel').getBoundingClientRect(),b=document.getElementById('surveyBtn').getBoundingClientRect();
  return {panelFits:p.left>=0&&p.right<=innerWidth+1&&p.top>=0&&p.bottom<=innerHeight,buttonFits:b.left>=0&&b.right<=innerWidth+1,toolbar:document.getElementById('plan-tools').closest('#view-3d')!==null};
 });assert.equal(result.panelFits,true,JSON.stringify(result));assert.equal(result.buttonFits,true,JSON.stringify(result));assert.equal(result.toolbar,true);
});

test('survey room and centre-line corrections preview exact dimensions and honour fixed nodes',opts,async()=>{
 const result=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{practiceDocument}=await import('/js/survey_practice.js');
  const {prepareSurveyCorrection,applySurveyCorrection,currentSurveyDimension}=await import('/js/survey_correction.js');
  const {detectRooms,wallGeom}=await import('/js/geometry.js');
  await applyData(practiceDocument('rectangle'));S.structLocked=false;
  const key=detectRooms()[0].key;S.roomMeta[key]={hid:'survey-room'};
  const target={kind:'room',id:'survey-room',floorId:S.workspace.activeFloor};
  const observation={target,field:'width',value:450,unit:'cm',reference:'interior'};
  const original=JSON.stringify(S.nodes),preview=prepareSurveyCorrection(S,observation);
  if(!preview.ok)return preview;
  const detached=original===JSON.stringify(S.nodes);applySurveyCorrection(S,preview);
  const width=currentSurveyDimension(target,'width'),depth=currentSurveyDimension(target,'depth');
  S.nodes.forEach(n=>n.fixed=true);const refused=prepareSurveyCorrection(S,{...observation,value:480});S.nodes.forEach(n=>delete n.fixed);
  const wall=S.walls[0],wallPreview=prepareSurveyCorrection(S,{target:{...target,kind:'wall',id:wall.id},field:'length',value:500,unit:'cm',reference:'center'});
  if(!wallPreview.ok)return wallPreview;applySurveyCorrection(S,wallPreview);
  return {detached,width,depth,refused:refused.reason,length:wallGeom(S.walls[0]).L};
 });
 assert.deepEqual(result,{detached:true,width:450,depth:290,refused:'SURVEY_LOCKED',length:500});
});

test('survey numeric entries survive correction preview and viewport switching',opts,async()=>{
 await page.resize(1280,900,{mobile:false,touch:false});await page.setLang('en');await page.goto('/');await page.waitForBoot();
 const out=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{practiceDocument}=await import('/js/survey_practice.js'),{startSurvey}=await import('/js/survey.js');
  const {openSurvey}=await import('/js/ui_survey.js');await applyData(practiceDocument('rectangle'));S.structLocked=false;S.walls.forEach(w=>w.lock=false);S.workspace.survey=startSurvey(S);S.sel={kind:'wall',ref:S.walls[0]};openSurvey();
  const action=name=>document.querySelector(`#survey-panel [data-survey-action="${name}"]`);
  action('selected').click();
  const controls=()=>{const fields=[...document.querySelectorAll('#survey-panel .survey-field')];const find=text=>fields.find(f=>f.querySelector('span')?.textContent===text)?.querySelector('input,select,textarea');return {field:find('Measurement'),value:find('Measured value'),note:find('Notes / skip reason')};};
  const c=controls();c.field.value='height';c.field.dispatchEvent(new Event('change'));c.value.value='285';c.value.dispatchEvent(new Event('input'));c.note.value='Laser reading';c.note.dispatchEvent(new Event('input'));action('correct').click();
  window.__setViewMode('plan');window.__setViewMode('3d');
  const after=controls();return {field:after.field.value,value:after.value.value,note:after.note.value,preview:!!action('apply'),height:S.walls[0].height};
 });assert.deepEqual(out,{field:'height',value:'285',note:'Laser reading',preview:true,height:270});
});

test('a stair landing activates its floor while preserving both floor models',opts,async()=>{
 const result=await page.eval(async()=>{
  const {S}=await import('/js/state.js'),{applyData}=await import('/js/ui.js'),{practiceDocument}=await import('/js/survey_practice.js');
  const {navigationFloorTransition}=await import('/js/navigation_geometry.js'),{switchFloorAndWait}=await import('/js/floors.js');
  await applyData(practiceDocument('multilevel'));
  const geometry=()=>JSON.stringify([S.nodes.map(({x,z})=>({x,z})),S.walls.map(({id,a,b,thickness,height})=>({id,a,b,thickness,height})),S.items.map(({id,x,z,w,d,h,rot,elev,configuration})=>({id,x,z,w,d,h,rot,elev,configuration}))]);
  const before=geometry();
  const landing=navigationFloorTransition(S,{x:200,y:299,z:126},{stepHeight:20,slopeLimit:45});
  await switchFloorAndWait(landing.floorId);
  const upper=S.workspace.activeFloor==='practice-upper'&&S.items.length===0&&S.slabOpenings.length===1;
  const activeTab=document.querySelector('#floor-tabs button.active')?.textContent;
  await switchFloorAndWait('practice-ground');
  return {upper,activeTab,restored:geometry()===before};
 });assert.deepEqual(result,{upper:true,activeTab:"Upper",restored:true});
});

test('3D tracing uses the calibrated raster without the 2D canvas',opts,async()=>{
 const result=await page.eval(async()=>{
  const {THREE,loadThree}=await import('/js/three_lazy.js');await loadThree();
  const {buildBlueprintUnderlay3D}=await import('/js/blueprint_3d.js'),{blueprintRaster,pixelToWorld,setBlueprintReference,clearBlueprintReference}=await import('/js/blueprint_trace.js');
  const fixture=document.createElement('canvas');fixture.width=2;fixture.height=2;
  const ref={dataUrl:fixture.toDataURL(),width:200,height:100,cmPerPx:2,rotation:Math.PI/2,originX:10,originZ:20,opacity:.4};
  window.__setViewMode('3d');setBlueprintReference(ref);
  const controls3D=!!document.querySelector('#view-3d #bp-trace-controls');
  const plan=document.getElementById('plan'),before=[plan.width,plan.height],parent=new THREE.Group();
  for(let n=0;n<100&&!blueprintRaster(ref);n++)await new Promise(r=>setTimeout(r,10));
  const mesh=buildBlueprintUnderlay3D(parent,THREE,ref),expected=pixelToWorld(ref,{x:0,y:0}),pos=mesh.geometry.getAttribute('position');
  const hits=[];mesh.raycast(null,hits);let disposed=false;mesh.material.map.addEventListener('dispose',()=>{disposed=true;});mesh.material.dispose();
  clearBlueprintReference();
  return {controls3D,calibrated:Math.abs(pos.getX(0)-expected.x)<.001&&Math.abs(pos.getZ(0)-expected.z)<.001,
   opacity:mesh.material.opacity,noHits:hits.length===0,disposed,canvasUnchanged:JSON.stringify(before)===JSON.stringify([plan.width,plan.height]),
   hidden:buildBlueprintUnderlay3D(parent,THREE,{...ref,visible:false})===null};
 });assert.deepEqual(result,{controls3D:true,calibrated:true,opacity:.4,noHits:true,disposed:true,canvasUnchanged:true,hidden:true});
});
