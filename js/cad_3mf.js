// Minimal 3MF Core package: indexed closed mesh, explicit mm, Z-up build space.
// https://github.com/3MFConsortium/spec_core
import { shapeToMeshData, validateBrepForExport } from './cad_kernel.js';
import { stlMeshOptions } from './cad_stl.js';
import { prepareNativePrintPositions } from './core/print_setup.js';

function xmlText(value) {
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}

export function printMeshFromPositions(positions) {
  if (!positions || !positions.length || positions.length % 9) throw new Error('Print mesh needs complete triangles');
  const vertices = [], triangles = [], buckets = new Map(), tolerance = 0.00001;
  function vertex(point) {
    if (point.some(x => !Number.isFinite(x))) throw new Error('Print mesh contains nonfinite coordinates');
    const cell = point.map(x => Math.floor(x / tolerance));
    for (let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++) {
      const candidates = buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(',')) || [];
      for(const index of candidates) if(Math.hypot(...point.map((v,i)=>v-vertices[index][i])) <= tolerance) return index;
    }
    const key=cell.join(','), index=vertices.length;
    vertices.push(point); if(!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(index); return index;
  }
  for(let i=0;i<positions.length;i+=9) {
    // Rotation, not reflection: (X,Y,Z) -> (X,-Z,Y), preserves winding.
    const points=[0,3,6].map(j=>[Number(positions[i+j])*10,-Number(positions[i+j+2])*10,Number(positions[i+j+1])*10]);
    const ab=points[1].map((v,j)=>v-points[0][j]),ac=points[2].map((v,j)=>v-points[0][j]);
    if(!points.flat().every(Number.isFinite)) throw new Error('Print mesh contains nonfinite coordinates');
    if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])===0) continue;
    const ids=points.map(vertex); if(new Set(ids).size===3) triangles.push(ids);
  }
  if(triangles.length<4) throw new Error('Print mesh does not enclose a solid');
  const edges=new Map();
  for(const triangle of triangles) for(let j=0;j<3;j++) {
    const a=triangle[j],b=triangle[(j+1)%3],key=a<b ? a+','+b : b+','+a;
    const edge=edges.get(key)||{count:0,direction:0}; edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);
  }
  if([...edges.values()].some(edge=>edge.count!==2 || edge.direction!==0)) throw new Error('Print mesh has open or inconsistently oriented edges; choose a finer resolution');
  return {vertices,triangles};
}

export function threeMfModelXml(mesh, name='ModelForge') {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Title">'+xmlText(name)+'</metadata><resources><object id="1" type="model" name="'+xmlText(name)+'"><mesh><vertices>'+mesh.vertices.map(p=>'<vertex x="'+p[0]+'" y="'+p[1]+'" z="'+p[2]+'"/>').join('')+'</vertices><triangles>'+mesh.triangles.map(t=>'<triangle v1="'+t[0]+'" v2="'+t[1]+'" v3="'+t[2]+'"/>').join('')+'</triangles></mesh></object></resources><build><item objectid="1"/></build></model>';
}

function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) {crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}

// OPC permits ZIP storage method 0. No dependency or external resource needed.
function storedZip(files) {
  const encoded=files.map(([name,content])=>({name:new TextEncoder().encode(name),data:new TextEncoder().encode(content)}));
  const localSize=encoded.reduce((n,f)=>n+30+f.name.length+f.data.length,0), centralSize=encoded.reduce((n,f)=>n+46+f.name.length,0);
  if(localSize+centralSize+22>0x7fffffff)throw new Error('3MF package is too large');
  const bytes=new Uint8Array(localSize+centralSize+22),view=new DataView(bytes.buffer);let offset=0,central=localSize;
  for(const f of encoded) {
    const crc=crc32(f.data), start=offset;
    view.setUint32(offset,0x04034b50,true);view.setUint16(offset+4,20,true);view.setUint16(offset+6,0x800,true);view.setUint16(offset+12,33,true);
    view.setUint32(offset+14,crc,true);view.setUint32(offset+18,f.data.length,true);view.setUint32(offset+22,f.data.length,true);view.setUint16(offset+26,f.name.length,true);
    bytes.set(f.name,offset+30);bytes.set(f.data,offset+30+f.name.length);offset+=30+f.name.length+f.data.length;
    view.setUint32(central,0x02014b50,true);view.setUint16(central+4,20,true);view.setUint16(central+6,20,true);view.setUint16(central+8,0x800,true);view.setUint16(central+14,33,true);
    view.setUint32(central+16,crc,true);view.setUint32(central+20,f.data.length,true);view.setUint32(central+24,f.data.length,true);view.setUint16(central+28,f.name.length,true);view.setUint32(central+42,start,true);
    bytes.set(f.name,central+46);central+=46+f.name.length;
  }
  view.setUint32(central,0x06054b50,true);view.setUint16(central+8,encoded.length,true);view.setUint16(central+10,encoded.length,true);view.setUint32(central+12,centralSize,true);view.setUint32(central+16,localSize,true);
  return bytes;
}

export function threeMfFromPositions(positions,name) {
  const mesh=printMeshFromPositions(positions);
  return threeMfFromMeshes([mesh],name);
}

export function threeMfFromMeshes(meshes,name='ModelForge') {
  if(!meshes?.length)throw new Error('3MF needs a print mesh');
  const objects=meshes.map((mesh,index)=>'<object id="'+(index+1)+'" type="model" name="'+xmlText(mesh.name || ('Component '+(index+1)))+'"><metadatagroup><metadata name="mf:occurrence" preserve="true">'+xmlText(mesh.occurrenceId || String(index+1))+'</metadata></metadatagroup><mesh><vertices>'+mesh.vertices.map(p=>'<vertex x="'+p[0]+'" y="'+p[1]+'" z="'+p[2]+'"/>').join('')+'</vertices><triangles>'+mesh.triangles.map(t=>'<triangle v1="'+t[0]+'" v2="'+t[1]+'" v3="'+t[2]+'"/>').join('')+'</triangles></mesh></object>').join('');
  const model=meshes.length===1 && !meshes[0].occurrenceId?threeMfModelXml(meshes[0],name):
    '<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:mf="urn:modelforge:print"><metadata name="Title">'+xmlText(name)+'</metadata><metadata name="Description">Placed assembly print snapshot; separate native component occurrences, no editable CAD feature history.</metadata><resources>'+objects+'</resources><build>'+meshes.map((_,index)=>'<item objectid="'+(index+1)+'"/>').join('')+'</build></model>';
  return storedZip([
    ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'],
    ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'],
    ['3D/3dmodel.model',model]
  ]);
}

export async function exportThreeMf(brep,name,settings) {
  await validateBrepForExport(brep);
  const mesh=await shapeToMeshData(brep,stlMeshOptions(settings));
  return threeMfFromPositions(prepareNativePrintPositions(mesh.positions,settings?.printSetup),name);
}
