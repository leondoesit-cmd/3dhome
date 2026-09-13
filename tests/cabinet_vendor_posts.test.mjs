import test from 'node:test';
import assert from 'node:assert/strict';
import {cabinetVendorProgram} from '../js/cabinet_vendor_posts.js';
import {cabinetSetupPoint,cabinetCNCBundle} from '../js/cabinet_postprocessor.js';
import {cabinetDrillingRecipeDraft} from '../js/cabinet_manufacturing.js';
import {newCabinetShopProfile} from '../js/cabinet_shop_profiles.js';
import {makeSpec,normalizeSpec} from '../js/cabinet.js';
const tool={number:7,diameter:5,nativeName:'DRILL_5',feed:600,rpm:4000,maxDepth:40,holderDiameter:20,spinupSeconds:2};
function profile(controller='grbl-1.1'){return {...newCabinetShopProfile(controller),travel:{x:2500,y:1500,z:200},safeZ:15,breakthrough:1,origin:{x:13,y:27},native:{woodwopMachine:'WEEKE',biesseOrigin:'1',scmReverseZ:false},tools:[tool]};}
function cabinet(){const i={id:'recipe',type:'cabsys',w:60,h:100,d:60,x:0,y:0,rot:0,cab:makeSpec('w_classic',60,100,60)};i.cab.auto=false;i.cab.cols=[{w:56.4,door:{t:'lift'},secs:[{t:'drawers',h:80,n:2}]}];normalizeSpec(i.cab,i.w,i.h,i.d);return i;}
function completed(i){const [r]=cabinetDrillingRecipeDraft([i]);r.partNumber='Test fixture only';r.sourceDrawing='Fixture drawing revision 1';for(const p of r.panels)p.noDrillReason='Fixture panel intentionally has no mounting holes';r.panels.find(p=>p.role==='drawerFront').holes=[{x:20,y:25,d:5,depth:0,through:true,face:'B'}];return r;}

test('native exports preserve asymmetric drilling positions through every face flip and rotation',()=>{
 for(const face of ['A','B'])for(const flip of ['mirror-x','mirror-y'])for(const rotation of [0,90,180,270]){
  const p={...profile(),flip,rotation},panel={l:120,w:80,thickness:18},pt=cabinetSetupPoint(panel,{x:23,y:31,face},p);
  const setup={panelId:'asymmetric',panelDimensions:panel,rotation,origin:p.origin,face,operations:[{x:pt.x,y:pt.y,depth:19,diameter:5,through:true}]};
  const mpr=cabinetVendorProgram('mpr',setup,tool,p),cix=cabinetVendorProgram('cix',setup,tool,p),xxl=cabinetVendorProgram('xxl',setup,tool,p);
  const m=k=>Number(mpr.match(new RegExp('^'+k+'="([^"]+)"','m'))[1]);
  const c=k=>Number(cix.match(new RegExp('PARAM,NAME='+k+',VALUE=([^\\n]+)'))[1]);
  assert.equal(m('L'),pt.width);assert.equal(m('W'),pt.height);assert.equal(m('XA'),pt.x-13);assert.equal(m('YA'),pt.y-27);assert.equal(m('TI'),19);assert.equal(m('F_'),.6);assert.equal(m('TNO'),7);
  assert.equal(c('X'),pt.x-13);assert.equal(pt.height-c('Y'),pt.y-27);assert.equal(c('Z'),0);assert.equal(c('DP'),19);assert.equal(c('SIDE'),0);assert.equal(c('THR'),0);assert.equal(c('WSP'),600);assert.match(cix,/TNM,VALUE="DRILL_5"/);
  assert.match(xxl,/XPL X=0 Y=0 Z=18 Q=0 R=0/);assert.ok(xxl.includes('XG0 X='+(pt.x-13)+' Y='+(pt.y-27)));assert.match(xxl,/XL2P Z=-19 V=600/);
 }
});
test('SCM reverse-Z changes stock origin, clearance and cutting depth together',()=>{
 const p=profile();p.native.scmReverseZ=true;const text=cabinetVendorProgram('xxl',{panelId:'p',panelDimensions:{l:120,w:80,thickness:18},rotation:0,origin:p.origin,face:'A',operations:[{x:33,y:57,depth:12,diameter:5}]},tool,p);
 assert.match(text,/XPL X=0 Y=0 Z=-18/);assert.match(text,/XG0 Z=-15 T=7/);assert.match(text,/XL2P Z=12 V=600/);
});
test('complete recipes cover drawer fronts and lift mechanisms without modifying source geometry',()=>{
 const i=cabinet(),before=structuredClone(i),p=profile();p.completeRecipes=[completed(i)];
 const b=cabinetCNCBundle([i],p);assert.deepEqual(b.issues,[]);assert.equal(b.status,'simulation-ready');assert.equal(b.setups.length,1);assert.equal(b.setups[0].face,'B');assert.equal(b.setups[0].operations[0].depth,b.setups[0].panelDimensions.thickness+1);assert.deepEqual(i,before);
 assert.equal(b.report.items[0].panels.length,p.completeRecipes[0].panels.length);assert.equal(b.machineReady,false);
});
test('stale, incomplete, duplicate and geometrically invalid complete recipes cannot emit programs',()=>{
 for(const mutate of [
  (r)=>r.sourceSignature+='stale',r=>r.panels.pop(),r=>r.panels[0].noDrillReason='',
  r=>r.panels[0].holes=[{x:-1,y:20,d:5,depth:5,through:false,face:'A'}],
  r=>r.panels[0].xAxis='unknown',r=>r.partNumber='',
  r=>r.panels[0].holes=[null],r=>r.panels[0].holes=[{x:20,y:20,d:5,depth:5,through:'false',face:'A'}],
 ]){const i=cabinet(),p=profile(),r=completed(i);mutate(r);p.completeRecipes=[r];const b=cabinetCNCBundle([i],p);assert.equal(b.status,'blocked');assert.equal(b.files.length,0);assert.ok(b.issues.length);}
 const i=cabinet(),p=profile();p.completeRecipes=[completed(i)];i.w+=1;assert.ok(cabinetCNCBundle([i],p).issues.some(i=>i.code==='recipe-stale'));
 p.completeRecipes=[completed(i),completed(i)];assert.ok(cabinetCNCBundle([i],p).issues.some(i=>i.code==='recipe-duplicate'));
});
test('native settings and tool database names are required, with no arbitrary program injection',()=>{
 const i=cabinet();for(const c of ['homag-woodwop','biesse-bsolid','scm-prisma-xxl']){const p=profile(c);p.completeRecipes=[completed(i)];p.native={};assert.equal(cabinetCNCBundle([i],p).status,'blocked');}
 const p=profile('biesse-bsolid');p.completeRecipes=[completed(i)];p.tools=[{...tool,nativeName:'x"\nEND MACRO'}];assert.equal(cabinetCNCBundle([i],p).status,'blocked');
});
