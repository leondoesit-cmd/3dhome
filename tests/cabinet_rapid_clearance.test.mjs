import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCabinetRapidClearance} from '../js/cabinet_postprocessor.js';
const tool={diameter:5,holderDiameter:20,holderBottomOffset:-10};
const profile=()=>({safeZ:20,travel:{x:1000,y:1000,z:300},startPosition:{x:0,y:50},clamps:[{x:40,y:40,w:20,h:20,height:15}]});
test('rapid crossing blocked even when plunge endpoints clear the clamp',()=>{
 assert.ok(checkCabinetRapidClearance([{x:100,y:50}],tool,profile()).issues.some(i=>i.code==='rapid-clamp-intersection'));
 const p=profile();delete p.startPosition;
 assert.ok(checkCabinetRapidClearance([{x:0,y:50},{x:100,y:50}],tool,p).issues.length);
});
test('measured clearance and routes around expanded holder envelope accepted',()=>{
 assert.equal(checkCabinetRapidClearance([{x:100,y:50}],{...tool,holderBottomOffset:0},profile()).issues.length,0);
 const p=profile();p.startPosition.y=20;
 assert.equal(checkCabinetRapidClearance([{x:100,y:20}],tool,p).issues.length,0);
 p.startPosition.y=30;assert.ok(checkCabinetRapidClearance([{x:100,y:30}],tool,p).issues.length);
});
test('unknown initial and holder geometry stay unverified, invalid numeric metadata blocks',()=>{
 const p=profile();delete p.startPosition;
 const r=checkCabinetRapidClearance([{x:100,y:50}],{diameter:5,holderDiameter:20},p);
 assert.ok(r.warnings.some(i=>i.code==='initial-rapid-unverified'));assert.ok(r.warnings.some(i=>i.code==='holder-clearance-unknown'));
 assert.ok(checkCabinetRapidClearance([], {...tool,holderBottomOffset:NaN},p).issues.length);
});
test('actual three-decimal output precision controls clamp clearance',()=>{
 const p=profile();p.safeZ=20.0004;p.clamps[0].height=20.0002;
 assert.ok(checkCabinetRapidClearance([{x:100,y:50}],{...tool,holderBottomOffset:0},p).issues.length);
});
