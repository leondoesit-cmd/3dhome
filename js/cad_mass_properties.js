import { exactBrepForPart } from './modeler_part_geometry.js';
import { disposeBrep, shapeMassProperties } from './cad_kernel.js';
import { computeMassProperties } from './cad_interference.js';

// Rebuild each current body, including cuts and finishing operations. No cache
// keyed only by part id: edits can change geometry without changing identity.
export async function evaluateMassProperties(def, options = {}) {
  const density = Number(options.density) > 0 ? Number(options.density) : 7.85;
  const rows = [];
  for (const part of def.parts || []) {
    if (!part || part.suppressed) continue;
    let solid;
    try {
      solid = await (options.buildSolid || exactBrepForPart)(part);
      rows.push({partId:part.id, accuracy:'exact', ...await shapeMassProperties(solid)});
    } catch (error) {
      // An imported mesh can be approximated. A failed modified primitive
      // cannot be replaced by its pre-cut analytic volume.
      const modified = (part.cuts3d || []).some(p=>!p.suppressed) || (part.merges3d || []).some(p=>!p.suppressed)
        || (part.exactOperations || []).some(p=>!p.suppressed) || part.exactFillet;
      const fallback = modified ? null : computeMassProperties({parts:[part]}, {density});
      rows.push({partId:part.id, accuracy:fallback?.volumeCm3 > 0 ? 'approximate' : 'unavailable',
        volume:fallback?.volumeCm3 || 0, centerOfMass:fallback?.centerOfMass,
        error:String(error.message || error)});
    } finally { if (solid) (options.releaseSolid || disposeBrep)(solid); }
  }
  const measured = rows.filter(row=>row.volume>0), volumeCm3 = measured.reduce((sum,row)=>sum+row.volume,0);
  const centerOfMass = Object.fromEntries(['x','y','z'].map(k=>[k, volumeCm3 ? measured.reduce((sum,row)=>sum+row.volume*row.centerOfMass[k],0)/volumeCm3 : 0]));
  const accuracy = rows.some(row=>row.accuracy==='unavailable') ? 'incomplete' : rows.every(row=>row.accuracy==='exact') ? 'exact' : 'approximate';
  // Parallel-axis theorem. cm^5 * g/cm^3 -> g cm^2 -> kg m^2.
  const inertiaKgM2 = accuracy==='exact' && measured.length ? [[0,0,0],[0,0,0],[0,0,0]] : null;
  if (inertiaKgM2) for (const row of measured) {
    const delta = ['x','y','z'].map(k=>row.centerOfMass[k]-centerOfMass[k]), distance2=delta.reduce((s,v)=>s+v*v,0);
    for (let i=0;i<3;i++) for(let j=0;j<3;j++) inertiaKgM2[i][j] += (row.inertia[i][j]+row.volume*((i===j?distance2:0)-delta[i]*delta[j]))*density*1e-7;
  }
  const bounds = accuracy === 'exact' && measured.length && measured.every(row=>row.bounds)
    ? {min:Object.fromEntries(['x','y','z'].map(k=>[k,Math.min(...measured.map(row=>row.bounds.min[k]))])),
       max:Object.fromEntries(['x','y','z'].map(k=>[k,Math.max(...measured.map(row=>row.bounds.max[k]))]))} : null;
  return {bounds, volumeCm3, massKg:volumeCm3*density/1000, density, centerOfMass, inertiaKgM2, accuracy,
    unmeasured:rows.filter(row=>row.accuracy==='unavailable').length, bodies:rows};
}
