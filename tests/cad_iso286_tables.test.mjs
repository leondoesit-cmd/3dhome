import test from 'node:test';
import assert from 'node:assert/strict';
import {FIT_TABLE_DATA as data,holeTolerance,shaftTolerance,evaluateFit,fitLimitSource} from '../js/cad_fits.js';
import {validateManufacturingTables} from '../js/manufacturing_tables.js';
test('every published fit band has the IT width, exact upper boundary, and finite limits',()=>{
 let count=0;
 for(const [key,rows]of Object.entries(data.limits)){
  const [,letter,grade]=key.match(/^([A-Za-z]+)(\d+)$/),fn=letter===letter.toUpperCase()?holeTolerance:shaftTolerance;
  for(const [lo,hi,lower,upper]of rows){
   const it=data.ranges.find(r=>hi<=r.max).it[grade];assert.ok(Math.abs(upper-lower-it)<1e-6,key);
   for(const d of [(lo+hi)/2,hi]){const result=fn(d,letter,grade);assert.equal(result.EI??result.ei,lower,key);assert.equal(result.ES??result.es,upper,key);}
   count++;
  }
 }
 assert.equal(Object.keys(data.limits).length,415);assert.ok(count>7400);assert.equal(validateManufacturingTables().ok,true);
});
test('all eleven ISO corrigendum entries and the separately disclosed width-rule repair are pinned',()=>{
 assert.equal(holeTolerance(200,'A',9).EI,660);assert.equal(holeTolerance(3150,'H',1).ES,26);
 for(const d of [6,10])assert.deepEqual(holeTolerance(d,'JS',1),{EI:-.5,ES:.5,IT:1});
 assert.equal(holeTolerance(315,'J',6).EI,-7);assert.equal(holeTolerance(120,'S',9).EI,-166);
 assert.equal(holeTolerance(500,'S',9).EI,-407);assert.equal(holeTolerance(18,'S',10).EI,-98);
 assert.equal(shaftTolerance(3,'c',12).ei,-160);assert.equal(shaftTolerance(6,'k',13).es,180);
 assert.equal(shaftTolerance(280,'x',9).es,605);assert.equal(shaftTolerance(250,'za',11).es,1110);
 assert.equal(fitLimitSource(240,'za',11).correction.source,'derived-es-equals-ei-plus-IT');
 assert.equal(data.corrections.filter(c=>c.source==='corrigendum-2013').length,11);
});
test('restrictions and blank cells fail rather than extrapolating to another grade or band',()=>{
 for(const [d,l,g]of [[1,'A',9],[1,'B',8],[1,'H',14],[1,'JS',16],[1,'N',9],[10,'K',9],[14,'V',6],[18,'Y',6],[24,'T',6],[100,'CD',6],[501,'A',9],[3151,'H',7],[20,'H',19]])assert.throws(()=>holeTolerance(d,l,g),/Unsupported|outside/,`${d} ${l}${g}`);
 for(const code of ['H01/h1','H07/h6','H0/h6','H19/h6'])assert.throws(()=>evaluateFit(20,code),/Unsupported/);
 for(const d of [NaN,Infinity,-1,0])assert.throws(()=>evaluateFit(d,'H7/g6'));
 assert.equal(holeTolerance(3,'K',9).ES,0);assert.equal(holeTolerance(1.001,'H',14).ES,250);
 assert.deepEqual(holeTolerance(50,'J',10),holeTolerance(50,'JS',10));
 assert.equal(evaluateFit(150,'H7/g6').shaft.es,-14);assert.equal(evaluateFit(3150,'H7/h6').hole.IT,210);
});
test('independent NSK reference limits retain K/M/N/P special hole deviations',()=>{
 assert.deepEqual(holeTolerance(50,'K',7),{EI:-18,ES:7,IT:25});
 assert.deepEqual(holeTolerance(50,'M',7),{EI:-25,ES:0,IT:25});
 assert.deepEqual(holeTolerance(50,'N',7),{EI:-33,ES:-8,IT:25});
 assert.deepEqual(holeTolerance(50,'P',7),{EI:-42,ES:-17,IT:25});
 assert.deepEqual(shaftTolerance(50,'k',6),{ei:2,es:18,IT:16});
 // Crossing a subsidiary diameter band changes the s deviation inside one IT band.
 assert.equal(shaftTolerance(40,'s',6).ei,43);assert.equal(shaftTolerance(40.001,'s',6).ei,43);
});
