import {prepareNativePrintPositions,printSetupExtents} from './print_setup.js';
import {printMeshFromPositions,threeMfFromMeshes} from '../cad_3mf.js';
import {amfFromMeshes} from '../cad_amf.js';
import {binaryStlFromPositions} from '../cad_stl.js';

// A print layout is an occurrence snapshot, not a new editable CAD feature tree.
// Keep meshes separate even when two leaves refer to the same saved definition.
export function assemblyPrintMeshes(occurrences,setup) {
  if(!Array.isArray(occurrences)||!occurrences.length)throw new Error('Print export needs at least one exact component');
  const positions=new Float64Array(occurrences.reduce((count,item)=>count+(item.positions?.length || 0),0));
  let offset=0;
  for(const item of occurrences){
    if(!item.positions?.length||item.positions.length%9)throw new Error('A component has no complete print triangles: '+item.name);
    positions.set(item.positions,offset);offset+=item.positions.length;
  }
  // One translation for the complete tray preserves the gaps between parts.
  const prepared=prepareNativePrintPositions(positions,setup);
  offset=0;
  return occurrences.map(item=>{
    const mesh=printMeshFromPositions(prepared.subarray(offset,offset+item.positions.length));
    offset+=item.positions.length;
    return {...mesh,name:item.name,occurrenceId:item.occurrenceId};
  });
}

export function assemblyPrintPreview(occurrences) {
  if(!occurrences.length)throw new Error('Print setup needs at least one exact component');
  const positions=occurrences.flatMap(item=>Array.from(item.positions));
  return {bodies:occurrences.length,orientations:Object.fromEntries(['top','front','right'].map(base=>{
    const prepared=prepareNativePrintPositions(positions,{basePlane:base,bedWidthMm:100000,bedDepthMm:100000,bedHeightMm:100000});let at=0;
    const footprints=occurrences.map(item=>{
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let end=at+item.positions.length;at<end;at++){const axis=at%3;lo[axis]=Math.min(lo[axis],prepared[at]);hi[axis]=Math.max(hi[axis],prepared[at]);}
      return {id:item.occurrenceId,name:item.name,xMm:lo[0]*10,yMm:-hi[2]*10,widthMm:(hi[0]-lo[0])*10,depthMm:(hi[2]-lo[2])*10,lowestZMm:lo[1]*10};
    });
    const footprintOverlaps=[];
    for(let i=0;i<footprints.length;i++)for(let j=i+1;j<footprints.length;j++){
      const a=footprints[i],b=footprints[j];
      const width=Math.min(a.xMm+a.widthMm,b.xMm+b.widthMm)-Math.max(a.xMm,b.xMm);
      const depth=Math.min(a.yMm+a.depthMm,b.yMm+b.depthMm)-Math.max(a.yMm,b.yMm);
      if(width>.001 && depth>.001)footprintOverlaps.push({a:a.id,b:b.id});
    }
    return [base,{...printSetupExtents(positions,base),footprints,footprintOverlaps}];
  }))};
}

export function assemblyPrintBytes(occurrences,{format='stl',name='Assembly print',printSetup}={}) {
  if(!['stl','3mf','amf'].includes(format))throw new Error('Choose STL, 3MF or AMF');
  // Assembly outputs consistently use Z-up, including STL without saved setup.
  const setup=printSetup || {basePlane:'top',bedWidthMm:100000,bedDepthMm:100000,bedHeightMm:100000};
  const meshes=assemblyPrintMeshes(occurrences,setup);
  if(format==='3mf')return threeMfFromMeshes(meshes,name);
  if(format==='amf')return amfFromMeshes(meshes,name);
  const positions=[];
  // binaryStlFromPositions expects centimetres, while indexed print meshes are mm.
  for(const mesh of meshes)for(const triangle of mesh.triangles)for(const index of triangle)for(const value of mesh.vertices[index])positions.push(value/10);
  return binaryStlFromPositions(positions,name);
}
