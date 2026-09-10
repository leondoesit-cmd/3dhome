import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage, findChrome } from '../tools/browser_harness.mjs';
const opts = await findChrome() ? {} : {skip:'no Chrome found'};
test('redesign baseline survives undo, save and floor switching; protected generation stays atomic', opts, async()=>{
 const page=await openPage({width:1280,height:900,mobile:false,touch:false});
 try {
  const r=await page.eval(async()=>{
   const {S}=await import('/js/state.js');
   const {editRedesign}=await import('/js/ui_planning_guide.js');
   const {armRoomStamp,updateRoomGhost,commitRoomStamp,previewPlannerCommand,executePlannerProposal}=await import('/js/interaction.js');
   const {undo,redo,beginHistoryTransaction,abortHistoryTransaction}=await import('/js/history.js');
   const {sceneObject,applyData}=await import('/js/ui.js');
   const {addFloor,switchFloor}=await import('/js/floors.js');
   const {generateApartment,buildLayout}=await import('/js/generator.js');
   const {compareBaseline}=await import('/js/redesign.js');
   document.querySelector('[data-start="recreate"]').click();
   armRoomStamp('bedroom');updateRoomGhost(0,0); const room=commitRoomStamp();
   const proposal=previewPlannerCommand('room.stamp',{preset:'bedroom',x:1000,z:1000});
   const started=editRedesign({action:'start',id:'survey',name:'Measured survey'});
   const archived=JSON.stringify(S.workspace.baselines);
   const wall=S.walls[0], wallId=wall.id;
   undo(); const undoStart={archive:S.workspace.baselines.length,policy:S.workspace.redesign[S.workspace.activeFloor]||null};
   redo();
   const before=JSON.stringify(sceneObject(true));
   const denied=generateApartment('small',true);
   let publicDenied=false;try{buildLayout({rooms:[]},true);}catch(e){publicDenied=e.message==='PROTECTED_STRUCTURE';}
   const untouched=JSON.stringify(sceneObject(true))===before;
   const stale=proposal.ok?executePlannerProposal(proposal):null;
   const scope=editRedesign({action:'scope',wallIds:[wallId],allow:true});
   const allowed=S.workspace.redesign[S.workspace.activeFloor].allowedWallIds.slice();
   undo(); const scopeUndone=S.workspace.redesign[S.workspace.activeFloor].allowedWallIds.slice();
   redo();
   const token=beginHistoryTransaction('rollback baseline');
   S.workspace.baselines=Object.freeze([...S.workspace.baselines,{id:'failed'}]);abortHistoryTransaction(token);
   const rollbackClean=S.workspace.baselines.length===1;
   const firstFloor=S.workspace.activeFloor; addFloor();switchFloor(firstFloor);
   const floorKept=JSON.stringify(S.workspace.baselines)===archived;
   const saved=JSON.parse(JSON.stringify(sceneObject(true))); await applyData(saved);
   const loaded=JSON.stringify(S.workspace.baselines)===archived && Object.isFrozen(S.workspace.baselines[0].scene);
   S.nodes[0].x+=3; const report=compareBaseline(S.workspace.baselines[0],S);
   const archiveUnchanged=JSON.stringify(S.workspace.baselines)===archived;
   await applyData({...saved,workspace:undefined}); const legacyClean=S.workspace.baselines.length===0;
   return {room:room.ok,started,undoStart,denied,publicDenied,untouched,scope,allowed,scopeUndone,rollbackClean,floorKept,loaded,archiveUnchanged,report,legacyClean,proposalOk:proposal.ok,stale};
  });
  assert.equal(r.room,true);assert.equal(r.started.ok,true,JSON.stringify(r.started));
  assert.deepEqual(r.undoStart,{archive:1,policy:null});assert.equal(r.denied.reason,'PROTECTED_STRUCTURE');
  for(const key of ['publicDenied','untouched','rollbackClean','floorKept','loaded','archiveUnchanged','legacyClean'])assert.equal(r[key],true,key);
  assert.equal(r.scope.ok,true);assert.equal(r.allowed.length,1);assert.deepEqual(r.scopeUndone,[]);
  assert.ok(r.report.walls.changed.length>0);
  assert.equal(r.proposalOk,true); assert.equal(r.stale.reason,'PROTECTED_STRUCTURE');
 } finally {await page.close();}
});
for (const lang of ['en','he']) test('redesign controls fit the mobile sheet in '+lang,opts,async()=>{
 const page=await openPage({width:390,height:844,mobile:true,touch:true,lang});
 try {
  const r=await page.eval(async(lang)=>{
   const {setLang}=await import('/js/i18n.js'); await setLang(lang);
   const {armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
   const {openPlanningGuide,renderPlanningGuide}=await import('/js/ui_planning_guide.js');
   document.querySelector('[data-start="recreate"]').click();
   armRoomStamp('bedroom');updateRoomGhost(0,0);commitRoomStamp();openPlanningGuide();
   const disclosure=document.querySelector('[data-guide-section="redesign"]');disclosure.open=true;
   const input=disclosure.querySelector('input');input.focus();input.value=lang==='he'?'מדידה מקורית':'Original survey';
   const start=disclosure.querySelector('[data-guide-action="redesign_start"]');start.focus();start.click();
   const compare=document.querySelector('[data-guide-section^="compare-"]');compare.open=true;
   await new Promise(requestAnimationFrame);renderPlanningGuide();
   const host=document.getElementById('planningGuide');
   const bounds=[...host.querySelectorAll('[data-guide-section="redesign"] button,input,.redesign-comparison')].filter(n=>n.getBoundingClientRect().width>0).map(n=>{const b=n.getBoundingClientRect();return {x:b.x,right:b.right};});
   return {bounds,focused:document.activeElement.dataset.guideAction,table:host.querySelector('.redesign-comparison').textContent,overflow:document.documentElement.scrollWidth>window.innerWidth};
  },lang);
  assert.equal(r.overflow,false);assert.equal(r.focused,'redesign_start');assert.ok(r.table.includes('Δ0'));
  for(const b of r.bounds)assert.ok(b.x>=-1&&b.right<=391,JSON.stringify(b));
 }finally{await page.close();}
});
test('scope revocation invalidates opening previews; command rollback never archives a failed capture',opts,async()=>{
 const page=await openPage({width:1280,height:900,mobile:false,touch:false});
 try{
  const r=await page.eval(async()=>{
   const {S}=await import('/js/state.js');
   const {editRedesign}=await import('/js/ui_planning_guide.js');
   const {previewPlannerCommand,executePlannerProposal,armRoomStamp,updateRoomGhost,commitRoomStamp}=await import('/js/interaction.js');
   const {generateApartment}=await import('/js/generator.js');
   const {compareBaseline}=await import('/js/redesign.js');
   const {redesignCommand}=await import('/js/commands/redesign.js');
   const {executeCommand}=await import('/js/commands/executor.js');
   const h=await import('/js/history.js'); const {sceneObject}=await import('/js/ui.js');
   document.querySelector('[data-start="blank"]').click();
   generateApartment('small',true);
   editRedesign({action:'start',id:'furnished',name:'Furnished survey'});
   const unchanged=compareBaseline(S.workspace.baselines[0],S);
   const initialArchive=JSON.stringify(S.workspace.baselines);
   const failed=executeCommand(redesignCommand,{action:'start',id:'failed',name:'Should roll back'}, {
    state:S, services:{sceneObject},history:{begin:h.beginHistoryTransaction,commit:h.commitHistoryTransaction,abort:h.abortHistoryTransaction,current:h.currentHistoryId}
   },{postValidate:()=>({ok:false,reason:'TEST_REJECT'})});
   const rollback=JSON.stringify(S.workspace.baselines)===initialArchive;
   // Use an empty newly drawn room for an unambiguous opening station.
   armRoomStamp('bedroom'); updateRoomGhost(4000,4000); const direct=commitRoomStamp();
   const wall=S.walls[S.walls.length-1],p={wallId:wall.id,type:'door',s:150,width:80,height:210,sill:0};
   editRedesign({action:'scope',wallIds:[wall.id],allow:true});
   const preview=previewPlannerCommand('opening.place',p);
   editRedesign({action:'scope',wallIds:[wall.id],allow:false});
   const before=JSON.stringify(sceneObject(true)),denied=executePlannerProposal(preview);
   const atomic=JSON.stringify(sceneObject(true))===before;
   editRedesign({action:'scope',wallIds:[wall.id],allow:true});
   const fresh=previewPlannerCommand('opening.place',p),applied=executePlannerProposal(fresh);
   return {unchanged,failed,rollback,direct,preview,denied,atomic,applied};
  });
  for(const value of Object.values(r.unchanged)) assert.deepEqual(value.changed,[]);
  assert.equal(r.failed.ok,false);assert.equal(r.rollback,true);assert.equal(r.direct.ok,true);
  assert.equal(r.preview.ok,true,JSON.stringify(r.preview));assert.equal(r.denied.reason,'PROTECTED_STRUCTURE');
  assert.equal(r.atomic,true);assert.equal(r.applied.ok,true,JSON.stringify(r.applied));
 }finally{await page.close();}
});
