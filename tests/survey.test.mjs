import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceDocument} from '../js/survey_practice.js';
import {startSurvey,recordObservation,markSurveyMission,surveyProgress,normalizeSurveyFeatures} from '../js/survey.js';
import {createSurveyExchange,parseSurveyExchange,alignScanPoints,StableScanPoint} from '../js/survey_exchange.js';
import {normalizeNavigationProfile,passageClearance,cameraRetraction} from '../js/navigation_profile.js';
import {drawingDXF,drawingSVG,drawingBounds} from '../js/drawing_export.js';
const fixture=()=>{const s=practiceDocument('rectangle');s.workspace.survey=startSurvey(s);return s;};
test('survey checked evidence becomes stale after target geometry changes',()=>{
 const s=fixture(),m=s.workspace.survey.missions[1],target={kind:'wall',id:s.walls[0].id,floorId:s.workspace.activeFloor};
 s.workspace.survey=recordObservation(s,{id:'a',missionId:m.id,target,field:'length',value:400,status:'checked',unit:'cm'});
 s.workspace.survey=markSurveyMission(s,m.id,'checked');assert.equal(surveyProgress(s).checked,1);
 s.nodes[1].x+=10;assert.equal(surveyProgress(s).checked,0);assert.equal(surveyProgress(s).observations[0].stale,true);
 assert.equal(s.workspace.survey.observations[0].value,400);
});
test('incomplete and skipped missions do not count as verified',()=>{
 const s=fixture(),m=s.workspace.survey.missions[0];assert.throws(()=>markSurveyMission(s,m.id,'checked'));
 assert.throws(()=>markSurveyMission(s,m.id,'skipped'));
 s.workspace.survey=markSurveyMission(s,m.id,'skipped','Locked room');assert.equal(surveyProgress(s).checked,0);assert.equal(surveyProgress(s).skipped,1);
});
test('exchange round trip preserves floors, metadata, source observations and photos',()=>{
 const s=practiceDocument('site');s.workspace.survey=startSurvey(s);s.workspace.navigationProfile={radius:35};
 s.workspace.survey.photos=[{id:'p',attachmentId:'p',name:'reference',mimeType:'image/png'}];
 const a={id:'p',data:'data:image/png;base64,YQ=='};
 const output=parseSurveyExchange(JSON.stringify(createSurveyExchange(s,[a])));
 assert.deepEqual(output.geometry.surveyFeatures,normalizeSurveyFeatures(s.surveyFeatures));assert.equal(output.navigationProfile.radius,35);assert.deepEqual(output.attachments,[a]);
 assert.equal(output.floors[0].scene.walls.length,s.walls.length);
});
test('exchange converts every floor to centimetres and rejects malformed identities',()=>{
 const data=createSurveyExchange(fixture());data.units='m';const result=parseSurveyExchange(data);
 assert.equal(result.geometry.nodes[1].x,40000);assert.equal(result.floors[0].scene.nodes[1].x,40000);
 data.geometry.walls.push({...data.geometry.walls[0]});assert.throws(()=>parseSurveyExchange(data),/GEOMETRY/);
});
test('alignment is rigid and refuses implicit rescaling',()=>{
 const p=alignScanPoints([{x:2,z:1}],[{x:0,z:0},{x:10,z:0}],[{x:100,z:20},{x:100,z:30}]);
 assert.deepEqual(p,[{x:99,z:22}]);assert.throws(()=>alignScanPoints([], [{x:0,z:0},{x:10,z:0}], [{x:0,z:0},{x:15,z:0}]),/SCALE/);
});
test('stable capture clears samples on lost tracking and requires a fresh stable window',()=>{
 const s=new StableScanPoint();let p;for(let i=0;i<6;i++)p=s.add({x:100,y:0,z:20},i*30);assert.deepEqual(p,{x:100.00000000000001,y:0,z:20});
 assert.equal(s.add(null,200),null);assert.equal(s.add({x:100,y:0,z:20},230),null);
});
test('navigation profile changes clearance without changing model geometry',()=>{
 const s=fixture(),before=JSON.stringify(s);assert.equal(passageClearance(80,200,{radius:42}).passable,false);assert.equal(passageClearance(80,200,{radius:18}).passable,true);
 assert.equal(JSON.stringify(s),before);assert.equal(normalizeNavigationProfile({height:140,eyeHeight:170}).eyeHeight,140);
 assert.equal(cameraRetraction(230,60,230,.016),60);assert.ok(cameraRetraction(60,230,230,.016)>60);assert.ok(cameraRetraction(60,230,230,.016)<230);
});
test('survey drawing exports preserve XYZ elevations without closing polylines',()=>{
 const snapshot={walls:[],openings:[],swings:[],voids:[],items:[],rooms:[],surveyFeatures:normalizeSurveyFeatures([{id:'roof',kind:'polyline',points:[{x:0,y:270,z:0},{x:200,y:350,z:100}]}])};
 const dxf=drawingDXF(snapshot);assert.match(dxf,/30\n350\n/);assert.match(dxf,/70\n8\n/);assert.match(drawingSVG(snapshot,drawingBounds(snapshot)),/polyline/);
});

test('physical navigation honours closed doors, low obstacles and rotated floor voids',async()=>{
 const {navigationPosition,moveSurveyWalker}=await import('../js/navigation_geometry.js');
 const s=fixture(),p={radius:18,height:165};
 assert.equal(navigationPosition(s,{x:120,z:0},p).clear,false);
 s.openings[0].open=true;assert.equal(navigationPosition(s,{x:120,z:0},p).clear,true);
 assert.equal(navigationPosition(s,{x:120,z:0},{radius:44,height:165}).clear,false);
 s.items=[{id:20,type:'beam',x:200,z:150,w:200,d:40,h:30,elev:150}];assert.equal(navigationPosition(s,{x:200,z:150},p).reason,'headroom');
 s.items=[];s.slabOpenings=[{id:30,x:200,z:150,w:100,d:100,rot:45}];assert.equal(navigationPosition(s,{x:200,z:150},p).reason,'floor-opening');
 const next=moveSurveyWalker(s,{x:100,y:0,z:150},200,0,p);assert.ok(next.x<200);assert.equal(next.hit,true);
});
test('stairs depend on both riser and slope settings',async()=>{
 const {stairSupport}=await import('../js/navigation_geometry.js');
 const s={items:[{id:1,type:'stairs',x:0,z:0,w:100,d:400,h:300}]};
 assert.equal(stairSupport(s,{x:0,z:0},{stepHeight:0}).blocked,true);
 assert.equal(stairSupport(s,{x:0,z:0},{stepHeight:30,slopeLimit:40}).y,150);
 assert.equal(stairSupport(s,{x:0,z:0},{stepHeight:30,slopeLimit:20}).blocked,true);
});
test('shared-wall reconciliation preserves existing IDs and refuses conflicting dimensions',async()=>{
 const {scanReconciliation}=await import('../js/survey_alignment.js');
 const s=fixture(),incoming=structuredClone(s);incoming.walls=incoming.walls.map((w,i)=>({...w,id:100+i}));incoming.openings=[];
 const same=scanReconciliation(incoming,s);assert.equal(same.shared.length,4);assert.equal(same.converted.walls.length,0);
 incoming.walls[0].height=300;const mismatch=scanReconciliation(incoming,s);assert.equal(mismatch.conflicts.length,1);assert.equal(mismatch.converted.walls.length,1);
});
test('non-planar site faces are refused, not flattened',()=>{
 assert.deepEqual(normalizeSurveyFeatures([{id:'bad',kind:'face',points:[{x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:0,z:10},{x:0,y:5,z:10}]}]),[]);
});

test('exchange applies a declared rigid transform and retains the source transform',()=>{
 const data=createSurveyExchange(fixture());data.transform={translation:{x:10,y:20,z:30},rotationY:Math.PI/2};
 const parsed=parseSurveyExchange(data);assert.ok(Math.abs(parsed.geometry.nodes[1].x-10)<1e-8);assert.equal(parsed.geometry.nodes[1].z,430);assert.equal(parsed.floors[0].elevation,20);assert.deepEqual(parsed.sourceTransform,data.transform);
});
test('incomplete reports retain unavailable photo references',async()=>{
 const {buildSurveyReport}=await import('../js/survey_report.js');const html=buildSurveyReport(fixture(),[{id:'missing-image',missing:true}]);assert.match(html,/missing-image/);assert.match(html,/SURVEY_PHOTO_MISSING/);assert.match(html,/incomplete/);
});

test('exchange rotates unrotated instances and free service coordinates together',()=>{
 const s=fixture();s.items=[{id:'chair',type:'chair',x:100,z:50,w:50,d:50,h:80}];s.mep={nodes:[{id:'n',x:100,z:50}],runs:[{id:'r',pts:[{x:100,z:50},{x:200,z:50}]}]};
 const data=createSurveyExchange(s);data.transform={translation:{x:10,y:0,z:30},rotationY:Math.PI/2};const parsed=parseSurveyExchange(data);
 assert.equal(parsed.geometry.items[0].rot,90);assert.ok(Math.abs(parsed.mep.nodes[0].x+40)<1e-8);assert.equal(parsed.mep.runs[0].pts[1].z,230);
});

test('room ceilings constrain headroom even when ceiling presentation is hidden',async()=>{
 const {navigationPosition}=await import('../js/navigation_geometry.js');const s=fixture(),rooms=[{key:'low',ceilH:150,pts:s.nodes}];
 assert.equal(navigationPosition(s,{x:200,z:150},{height:165},rooms).reason,'headroom');
 assert.equal(navigationPosition(s,{x:200,z:150},{height:140},rooms).clear,true);
});

test('partial shared walls respect the existing wall lock',async()=>{
 const {scanReconciliation}=await import('../js/survey_alignment.js');const s=fixture();
 const incoming={nodes:[{x:100,z:0},{x:300,z:0}],walls:[{id:77,a:0,b:1,height:270,thickness:10}],openings:[]};
 assert.equal(scanReconciliation(incoming,s).conflicts[0].reason,'split-locked');
});

test('every floor service layout follows exchange units and alignment',()=>{
 const data=createSurveyExchange(fixture());data.units='m';
 data.floors[0].scene.mep={nodes:[{id:'socket',x:1,z:2,h:1.2}],runs:[{id:'circuit',pts:[{x:1,z:2},{x:3,z:2}]}]};
 data.transform={translation:{x:1,y:0,z:0},rotationY:Math.PI/2};
 const out=parseSurveyExchange(data).floors[0].scene.mep;
 assert.ok(Math.abs(out.nodes[0].x+100)<1e-8);assert.equal(out.nodes[0].h,120);assert.equal(out.runs[0].pts[1].z,300);
});

test('walking changes floors only at clear stair landings and returns to floor height',async()=>{
 const {navigationFloorTransition,navigationPosition,moveSurveyWalker}=await import('../js/navigation_geometry.js');
 const s=practiceDocument('multilevel'),p={stepHeight:20,slopeLimit:45};
 const before=JSON.stringify(s);
 assert.equal(navigationFloorTransition(s,{x:200,y:150,z:325},p),null);
 const up=navigationFloorTransition(s,{x:200,y:299,z:126},p);
 assert.equal(up.floorId,'practice-upper');assert.equal(up.position.y,-.75);
 const upper={...s.workspace.floors[1].scene,workspace:{...s.workspace,activeFloor:'practice-upper'}};
 assert.equal(navigationPosition(upper,{x:200,y:-.75,z:100},p).y,0);
 const down=navigationFloorTransition(upper,{x:200,y:-299,z:524},p);
 assert.equal(down.floorId,'practice-ground');
 assert.equal(navigationFloorTransition(s,{x:200,y:299,z:126},{stepHeight:0}),null);
 s.workspace.floors[1].scene.items=[{id:'landing-block',x:200,z:126,w:80,d:80,h:200}];
 assert.equal(navigationFloorTransition(s,{x:200,y:299,z:126},p),null);
 s.workspace.floors[1].scene.items=[];
 assert.equal(JSON.stringify(s),before);
 const approach=moveSurveyWalker(s,{x:200,y:0,z:530},0,-20,p);
 assert.ok(approach.y>0);assert.equal(approach.hit,false);
});
