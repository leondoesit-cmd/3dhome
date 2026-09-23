import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingSVG,drawingDXF,drawingBounds} from '../js/drawing_export.js';
const polygon=[{x:0,z:0},{x:100,z:0},{x:100,z:100},{x:0,z:100}];
const scene={walls:[polygon],openings:[polygon],swings:[],voids:[],items:[polygon],rooms:[{points:polygon,cx:50,cz:50,name:'Room <A> חדר',width:90.125,depth:80}]};
test('SVG escapes labels, cuts openings and optionally excludes furniture',()=>{
 const svg=drawingSVG(scene,{minx:0,minz:0,maxx:100,maxz:100},{furniture:false});
 assert.ok(svg.includes('Room &lt;A&gt;'));assert.ok(svg.includes('mask="url(#wall-openings)"'));assert.ok(svg.includes('90.13'));assert.ok(!svg.includes('id="furniture"'));
});
test('DXF declares centimeters and closed geometry on explicit layers',()=>{
 const dxf=drawingDXF(scene);assert.ok(dxf.includes('$INSUNITS\n70\n5'));assert.ok(dxf.includes('AcDbPolyline'));assert.ok(dxf.includes('90\n4\n70\n1'));assert.ok(dxf.includes('8\nROOMS'));assert.ok(dxf.includes('8\nOPENINGS'));assert.ok(dxf.includes('AC1021'));assert.ok(dxf.includes('חדר'));assert.ok(dxf.endsWith('0\nEOF\n'));
});
test('sheet bounds include outward door swings so the title block cannot cover them',()=>{
 const bounds=drawingBounds({...scene,swings:[polygon.map(p=>({x:p.x,z:p.z-90}))]});
 assert.equal(bounds.minz,-92);assert.equal(bounds.maxz,102);assert.equal(bounds.d,194);
});
test('DXF carries the chained exterior dimensions on their own layer',()=>{
 const dxf=drawingDXF(scene,{fmt:cm=>Math.round(cm)+' cm'});
 assert.ok(/0\nLINE\n100\nAcDbEntity\n8\nDIMENSIONS/.test(dxf));
 assert.ok(dxf.includes('\n1\n100 cm\n'),'the overall 100 cm string');
 assert.ok(!drawingDXF(scene,{dimensions:false}).includes('AcDbLine'));
});
