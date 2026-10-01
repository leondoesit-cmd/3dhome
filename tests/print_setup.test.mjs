import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNativePrintPositions,printSetupExtents} from '../js/core/print_setup.js';
import {makeBrepPrimitive,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';
import {exportBinaryStl} from '../js/cad_stl.js';

test('print orientation preserves size and places the lowest surface on the bed',()=>{
  const points=[1,2,3, 3,5,7];
  const setup={basePlane:'top',bedWidthMm:40,bedDepthMm:40,bedHeightMm:40};
  assert.deepEqual(Array.from(prepareNativePrintPositions(points,setup)),[-1,0,-2,1,3,2]);
  assert.deepEqual(printSetupExtents(points,'front'),{widthMm:20,depthMm:30,heightMm:40});
  assert.deepEqual(printSetupExtents(points,'right'),{widthMm:30,depthMm:40,heightMm:20});
  assert.deepEqual(points,[1,2,3,3,5,7]);
  assert.throws(()=>prepareNativePrintPositions(points,{...setup,bedDepthMm:39}),/exceeds/);
  assert.throws(()=>prepareNativePrintPositions(points,{...setup,bedHeightMm:NaN}),/positive/);
});

test('prepared native STL is Z-up with positive unchanged volume and rejects an undersized bed',async()=>{
  const body=await makeBrepPrimitive({type:'box',w:2,h:1,d:3});
  try{
    const setup={basePlane:'front',bedWidthMm:30,bedDepthMm:30,bedHeightMm:30};
    const bytes=await exportBinaryStl(body,'bed sample',{quality:'fine',printSetup:setup});
    const view=new DataView(bytes.buffer),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let volume=0;
    for(let i=0;i<view.getUint32(80,true);i++){
      const p=Array.from({length:9},(_,j)=>view.getFloat32(84+i*50+12+j*4,true));
      p.forEach((v,j)=>{lo[j%3]=Math.min(lo[j%3],v);hi[j%3]=Math.max(hi[j%3],v);});
      volume+=(p[0]*(p[4]*p[8]-p[5]*p[7])-p[1]*(p[3]*p[8]-p[5]*p[6])+p[2]*(p[3]*p[7]-p[4]*p[6]))/6;
    }
    assert.deepEqual(hi.map((v,i)=>v-lo[i]),[20,10,30]);assert.equal(lo[2],0);assert.equal(volume,6000);
    await assert.rejects(exportBinaryStl(body,'bed sample',{quality:'fine',printSetup:{...setup,bedHeightMm:29}}),/exceeds/);
    assert.deepEqual(printSetupExtents((await shapeToMeshData(body)).positions,'top'),{widthMm:20,depthMm:30,heightMm:10});
  }finally{disposeBrep(body);}
});
