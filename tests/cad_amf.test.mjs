import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBrepPrimitive, disposeBrep } from '../js/cad_kernel.js';
import { exportAmf, amfFromPositions } from '../js/cad_amf.js';

test('AMF exports a closed native mesh with explicit millimetres and valid zero-based references',async()=>{
  const body=await makeBrepPrimitive({type:'box',w:2,h:1,d:3});
  try {
    const xml=new TextDecoder().decode(await exportAmf(body,'A & <B>'));
    assert.match(xml,/<amf unit="millimeter" version="1.2">/);
    assert.match(xml,/<metadata type="name">A &amp; &lt;B&gt;<\/metadata>/);
    const vertices=[...xml.matchAll(/<vertex><coordinates><x>([^<]+)<\/x><y>([^<]+)<\/y><z>([^<]+)<\/z>/g)].map(m=>m.slice(1).map(Number));
    const triangles=[...xml.matchAll(/<triangle><v1>(\d+)<\/v1><v2>(\d+)<\/v2><v3>(\d+)<\/v3>/g)].map(m=>m.slice(1).map(Number));
    assert.equal(vertices.length,8);assert.equal(triangles.length,12);
    assert.ok(triangles.flat().every(i=>i>=0 && i<vertices.length));
    assert.deepEqual([0,1,2].map(j=>Math.max(...vertices.map(p=>p[j]))-Math.min(...vertices.map(p=>p[j]))),[20,30,10]);
  } finally {disposeBrep(body);}
  assert.throws(()=>amfFromPositions([0,0,0,1,0,0,0,1,0]),/enclose/);
});
