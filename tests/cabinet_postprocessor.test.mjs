import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec,normalizeSpec} from '../js/cabinet.js';
import {cabinetCNCBundle,cabinetSetupPoint,applyCabinetHardwareTemplates} from '../js/cabinet_postprocessor.js';
import {newCabinetShopProfile,validateCabinetShopProfile,parseCabinetShopProfile,CABINET_CONTROLLER_PROFILES} from '../js/cabinet_shop_profiles.js';
function item(){const it={id:'nc',type:'cabsys',w:60,h:100,d:60,x:0,y:0,rot:0,cab:makeSpec('w_classic',60,100,60)};it.cab.auto=false;it.cab.cols=[{w:56.4,door:{t:'hinged',leaves:1,hinge:'L'},secs:[{t:'shelves',h:80,n:2}]}];normalizeSpec(it.cab,it.w,it.h,it.d);return it;}
function setup(controller='grbl-1.1'){return {...newCabinetShopProfile(controller),name:'Test fixture',native:{woodwopMachine:'WEEKE',biesseOrigin:'1',scmReverseZ:false},travel:{x:2500,y:1300,z:150},safeZ:15,breakthrough:1,tools:[5,35].map((diameter,i)=>({number:i+1,nativeName:`D${diameter}`,diameter,feed:200,rpm:3000,maxDepth:40,holderDiameter:Math.max(40,diameter),spinupSeconds:2}))};}
test('every implemented dialect builds deterministic, separate face/tool simulation files',()=>{
 for(const c of CABINET_CONTROLLER_PROFILES.filter(c=>c.implemented)){
 const profile=setup(c.id),bundle=cabinetCNCBundle([item()],profile);
 assert.deepEqual(bundle.issues,[]);assert.equal(bundle.status,'simulation-ready');assert.equal(bundle.machineReady,false);assert.ok(bundle.files.length>=3);
 assert.deepEqual(bundle,cabinetCNCBundle([item()],profile));
 for(const file of bundle.files){assert.ok(file.content.includes('SIMULATION ONLY'));if(['linear','g81'].includes(c.dialect))assert.ok(file.content.includes('G90 G21 G17 G94 G54')); assert.ok(!/NaN|undefined|Infinity/.test(file.content));assert.ok(!file.content.includes('M6'));if(['linear','g81'].includes(c.dialect))assert.ok(file.content.endsWith('M5\nM2\n')); }
 }
});
test('Grbl expands drills into linear moves; LinuxCNC cancels every drilling cycle',()=>{
 const grbl=cabinetCNCBundle([item()],setup()).files.map(f=>f.content).join('');assert.ok(!grbl.includes('G81'));assert.ok(grbl.includes('G1 Z-'));assert.ok(!grbl.includes('T1 M6'));
 const linux=cabinetCNCBundle([item()],setup('linuxcnc')).files.map(f=>f.content).join('');assert.equal((linux.match(/G81/g)||[]).length,(linux.match(/G80/g)||[]).length);assert.ok(linux.includes('G98 G81'));
});
test('face mirrors and rotations transform asymmetric points within rotated panel bounds',()=>{
 const panel={l:100,w:60},profile=setup();profile.origin={x:10,y:20};
 for(const flip of ['mirror-x','mirror-y'])for(const rotation of [0,90,180,270])for(const face of ['A','B']){
  profile.flip=flip;profile.rotation=rotation;const p=cabinetSetupPoint(panel,{x:20,y:15,face},profile);
  assert.ok(p.x>=10&&p.x<=10+p.width);assert.ok(p.y>=20&&p.y<=20+p.height);
 }
 profile.flip='mirror-y';profile.rotation=0;assert.deepEqual(cabinetSetupPoint(panel,{x:20,y:15,face:'B'},profile),{x:30,y:65,width:100,height:60});
 profile.rotation=90;assert.deepEqual(cabinetSetupPoint(panel,{x:20,y:15,face:'B'},profile),{x:25,y:40,width:60,height:100});
});
test('every XY move starts at clearance and every through hole includes the configured allowance',()=>{
 const b=cabinetCNCBundle([item()],setup());
 for(const f of b.files){let z=null;for(const line of f.content.split('\n')){if(/^G0 Z/.test(line))z=Number(line.slice(4));if(/^G0 X/.test(line))assert.equal(z,15);if(/^G1 Z/.test(line))z=-1;}}
 for(const s of b.setups)for(const op of s.operations.filter(h=>h.through))assert.equal(op.depth,s.panelDimensions.thickness+1);
});
test('missing tools, tool reach, stock envelope and clamp collisions block the entire bundle',()=>{
 for(const mutate of [p=>p.tools.pop(),p=>p.tools[0].maxDepth=1,p=>p.travel.x=10,p=>p.clamps=[{x:0,y:0,w:2500,h:1300,height:5}]]){
  const p=setup();mutate(p);const b=cabinetCNCBundle([item()],p);assert.equal(b.status,'blocked');assert.equal(b.files.length,0);assert.equal(b.setups.length,0);assert.ok(b.issues.length);
 }
});
test('proprietary and unknown targets never fall back to generic G-code',()=>{
 for(const id of [...CABINET_CONTROLLER_PROFILES.filter(c=>!c.implemented).map(c=>c.id),'invented']){const b=cabinetCNCBundle([item()],setup(id));assert.equal(b.files.length,0);assert.ok(b.issues.some(i=>i.code==='controller-unsupported'));}
});
test('unresolved construction and mechanism findings remain blockers',()=>{
 const i=item();i.cab.cols[0].door.t='lift';const b=cabinetCNCBundle([i],setup());assert.equal(b.files.length,0);assert.ok(b.issues.some(i=>i.code==='mechanism-template'));
});
test('shop templates replace operations without mutating the source or injecting code',()=>{
 const panel={holes:[{id:'a',kind:'cup',x:80,y:20,d:35,depth:12.5,face:'B'}]},before=structuredClone(panel);
 const t={id:'custom-cup',kind:'cup',partNumber:'shop-123',source:'drawing revision 2',holes:[{dx:0,dy:0,diameter:35,depth:13,through:false}]};
 const edited=applyCabinetHardwareTemplates(panel,[t]);assert.deepEqual(panel,before);assert.equal(edited.holes[0].depth,13);
 const p=setup();p.name='evil)\nM3\n(';p.hardwareTemplates=[t];const b=cabinetCNCBundle([item()],p);assert.equal(b.status,'simulation-ready');assert.ok(b.setups.flatMap(s=>s.operations).some(h=>h.diameter===35&&h.depth===13));
});
test('profile validation rejects malformed entries and unsafe numeric values without throwing',()=>{
 for(const value of [null,{},'bad',{...setup(),tools:[null]},{...setup(),clamps:[null]},{...setup(),hardwareTemplates:[null]},{...setup(),hardwareTemplates:4},{...setup(),safeZ:Infinity},{...setup(),tools:[{...setup().tools[0],feed:1e-9}]}])assert.ok(validateCabinetShopProfile(value).length);
 assert.throws(()=>parseCabinetShopProfile('bad'));assert.throws(()=>parseCabinetShopProfile(' '.repeat(250001)));
 assert.equal(parseCabinetShopProfile(JSON.stringify(setup())).issues.length,0);
});
test('tool ambiguity and insufficient clamp clearance cannot produce programs',()=>{
 const p=setup();p.tools.push({...p.tools[0]});assert.ok(validateCabinetShopProfile(p).length);
 p.tools=setup().tools;p.clamps=[{x:0,y:0,w:20,h:20,height:15}];assert.ok(validateCabinetShopProfile(p).some(i=>i.code==='clamp-clearance'));
});
