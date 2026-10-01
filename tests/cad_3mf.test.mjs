import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBrepPrimitive, disposeBrep } from '../js/cad_kernel.js';
import { exportThreeMf, threeMfFromPositions, printMeshFromPositions } from '../js/cad_3mf.js';

function parts(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=new Map();let offset=0;
  while(view.getUint32(offset,true)===0x04034b50) {
    assert.equal(view.getUint16(offset+8,true),0);
    const size=view.getUint32(offset+18,true),nameSize=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
    const name=new TextDecoder().decode(bytes.subarray(offset+30,offset+30+nameSize)),start=offset+30+nameSize+extra;
    result.set(name,new TextDecoder().decode(bytes.subarray(start,start+size)));offset=start+size;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50);
  const end=bytes.length-22;assert.equal(view.getUint32(end,true),0x06054b50);assert.equal(view.getUint32(end+16,true),offset);assert.equal(view.getUint16(end+10,true),result.size);
  return result;
}

test('native 3MF is a complete OPC package with millimetre Z-up geometry and positive volume', async()=>{
  const body=await makeBrepPrimitive({type:'box',w:2,h:1,d:3});
  try {
    const files=parts(await exportThreeMf(body,'A & "B" <test>'));
    assert.deepEqual([...files.keys()],['[Content_Types].xml','_rels/.rels','3D/3dmodel.model']);
    assert.match(files.get('_rels/.rels'),/Target="\/3D\/3dmodel.model"/);
    assert.match(files.get('[Content_Types].xml'),/application\/vnd.ms-package.3dmanufacturing-3dmodel\+xml/);
    const xml=files.get('3D/3dmodel.model');assert.match(xml,/unit="millimeter"/);assert.match(xml,/A &amp; &quot;B&quot; &lt;test&gt;/);assert.match(xml,/<item objectid="1"\/>/);
    const vertices=[...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(m=>m.slice(1).map(Number));
    const triangles=[...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map(m=>m.slice(1).map(Number));
    assert.equal(vertices.length,8);assert.equal(triangles.length,12);
    assert.deepEqual([0,1,2].map(j=>Math.max(...vertices.map(p=>p[j]))-Math.min(...vertices.map(p=>p[j]))),[20,30,10]);
    let volume=0;for(const t of triangles){const [a,b,c]=t.map(i=>vertices[i]);volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}assert.equal(volume,6000);
  } finally {disposeBrep(body);}
});

test('native curved meshes weld seams into closed consistently oriented print meshes',async()=>{
  for(const type of ['sphere','cylinder']) {
    const body=await makeBrepPrimitive({type,r:1,h:1});
    try {const files=parts(await exportThreeMf(body,type,{quality:'custom',deviationMm:0.01,angleDegrees:5}));assert.ok(files.get('3D/3dmodel.model').includes('<triangles>'));}
    finally {disposeBrep(body);}
  }
});

test('3MF rejects incomplete, nonfinite, open and inconsistently oriented meshes',()=>{
  assert.throws(()=>threeMfFromPositions([0,0,0]),/complete triangles/);
  assert.throws(()=>printMeshFromPositions([Infinity,0,0,1,0,0,0,1,0]),/nonfinite/);
  assert.throws(()=>threeMfFromPositions([0,0,0,1,0,0,0,1,0]),/enclose/);
  const open=[0,0,0,1,0,0,0,1,0, 0,0,0,1,0,0,0,0,1, 0,0,0,0,1,0,0,0,1, 0,0,0,1,0,0,0,-1,0];
  assert.throws(()=>threeMfFromPositions(open),/open|oriented/);
});
