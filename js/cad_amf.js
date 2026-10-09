import { shapeToMeshData, validateBrepForExport } from './cad_kernel.js';
import { stlMeshOptions } from './cad_stl.js';
import { printMeshFromPositions } from './cad_3mf.js';
import { prepareNativePrintPositions } from './core/print_setup.js';

// Flat-triangle AMF geometry, explicit millimetres and the same Z-up print
// space as 3MF. XML geometry layout follows ISO/ASTM 52915 and FreeCAD's writer.
export function amfFromPositions(positions, name='ModelForge') {
  const mesh=printMeshFromPositions(positions);
  return amfFromMeshes([mesh],name);
}

export function amfFromMeshes(meshes,name='ModelForge') {
  if(!meshes?.length)throw new Error('AMF needs a print mesh');
  const title=String(name).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const escape=value=>String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<amf unit="millimeter" version="1.2"><metadata type="name">'+title+'</metadata>'+meshes.map((mesh,index)=>'<object id="'+index+'"><metadata type="name">'+escape(mesh.name || name)+'</metadata>'+(mesh.occurrenceId?'<metadata type="ModelForge:occurrence">'+escape(mesh.occurrenceId)+'</metadata>':'')+'<mesh><vertices>'+mesh.vertices.map(p=>'<vertex><coordinates><x>'+p[0]+'</x><y>'+p[1]+'</y><z>'+p[2]+'</z></coordinates></vertex>').join('')+'</vertices><volume>'+mesh.triangles.map(t=>'<triangle><v1>'+t[0]+'</v1><v2>'+t[1]+'</v2><v3>'+t[2]+'</v3></triangle>').join('')+'</volume></mesh></object>').join('')+'</amf>';
  return new TextEncoder().encode(xml);
}

export async function exportAmf(brep,name,settings) {
  await validateBrepForExport(brep);
  const mesh=await shapeToMeshData(brep,stlMeshOptions(settings));
  return amfFromPositions(prepareNativePrintPositions(mesh.positions,settings?.printSetup),name);
}
