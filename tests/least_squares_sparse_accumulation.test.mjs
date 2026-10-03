import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gaussNewtonStep,solveLinear} from '../js/core/least_squares.js';
import {solveAssemblyMates} from '../js/cad_mate_solver.js';
import {axisAngleMatrix,setRotation} from '../js/cad_mate_model.js';

// Original dense normal-equation assembly is the oracle. The optimizer,
// damping and linear elimination are shared; only skipped zero products differ.
function denseStep(J,r,damping){
  const n=J[0]?.length||0;
  const A=Array.from({length:n},()=>Array(n).fill(0)),b=Array(n).fill(0);
  for(let i=0;i<r.length;i++)for(let j=0;j<n;j++){
    b[j]-=J[i][j]*r[i];
    for(let k=0;k<n;k++)A[j][k]+=J[i][j]*J[i][k];
  }
  for(let i=0;i<n;i++)A[i][i]+=damping;
  return solveLinear(A,b);
}

test('zero-product skipping keeps dense and sparse Jacobian steps bit-for-bit',()=>{
  for(const sparse of [false,true])for(const damping of [1e-12,1e-4,100]){
    const J=Array.from({length:90},(_,i)=>Array.from({length:48},(_,j)=>
      sparse&&(i+j)%7!==0?0:Math.sin(i*13+j*7)/((j%5)+1)));
    const r=J.map((_row,i)=>Math.cos(i*3));
    assert.deepEqual(gaussNewtonStep(J,r,damping),denseStep(J,r,damping));
  }
});

test('actual five-loop mechanism retains exact poses, convergence and diagnostics',async()=>{
  const solverUrl=new URL('../js/cad_mate_solver.js',import.meta.url);
  const denseNumerics=`export {normOf,stableColumnRank} from ${JSON.stringify(new URL('../js/core/least_squares.js',import.meta.url).href)};
    import {solveLinear} from ${JSON.stringify(new URL('../js/core/least_squares.js',import.meta.url).href)};
    export const gaussNewtonStep=${denseStep.toString()};`;
  const numericsUrl='data:text/javascript;base64,'+Buffer.from(denseNumerics).toString('base64');
  const source=fs.readFileSync(solverUrl,'utf8').replace(/from (["'])(\.[^"']+)\1/g,(_match,_quote,path)=>
    `from ${JSON.stringify(path==='./core/least_squares.js'?numericsUrl:new URL(path,solverUrl).href)}`);
  const {solveAssemblyMates:denseSolve}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/re75_native_mates.json',import.meta.url),'utf8'));
  const optimized=structuredClone(fixture),dense=structuredClone(fixture);
  for(const assembly of [optimized,dense])setRotation(assembly.components.find(c=>c.id===fixture.journalId).transform,
    axisAngleMatrix({x:0,y:0,z:1},5*Math.PI/180));
  const options={fixedComponentIds:[fixture.journalId]};
  const actual=solveAssemblyMates(optimized,options),reference=denseSolve(dense,options);
  assert.equal(actual.ok,true);
  assert.deepEqual(actual,reference);
  assert.deepEqual(optimized.components.map(c=>c.transform),dense.components.map(c=>c.transform));
});
