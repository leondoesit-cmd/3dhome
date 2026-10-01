import { exactBrepForPart } from './modeler_part_geometry.js';
import { disposeBrep, shapeMassProperties } from './cad_kernel.js';
import { computeMassProperties } from './cad_interference.js';
import { DEFAULT_MASS_DENSITY, partMaterialDensity, stockMaterialForPart } from './cad_appearances.js';

function fallbackRow(part, density, error) {
  const modified = (part.cuts3d || []).some(p=>!p.suppressed) || (part.merges3d || []).some(p=>!p.suppressed)
    || (part.exactOperations || []).some(p=>!p.suppressed) || part.exactFillet;
  const fallback = modified ? null : computeMassProperties({parts:[part]}, {density});
  const volume = fallback?.volumeCm3 || 0;
  return {partId:part.id, accuracy:volume > 0 ? 'approximate' : 'unavailable',
    volume, centerOfMass:fallback?.centerOfMass, density, massKg:volume*density/1000,
    materialName:part.materialName || stockMaterialForPart(part)?.name || null,
    materialCatalogId:part.materialCatalogId || null,
    error:error == null ? undefined : String(error.message || error)};
}

// Rebuild each current body, including cuts and finishing operations. No cache
// keyed only by part id: edits can change geometry without changing identity.
export async function evaluateMassProperties(def, options = {}) {
  const fallbackDensity = Number(options.density) > 0 ? Number(options.density) : DEFAULT_MASS_DENSITY;
  const rows = [];
  for (const part of def.parts || []) {
    if (!part || part.suppressed) continue;
    const density = partMaterialDensity(part, fallbackDensity);
    let solid;
    try {
      solid = await (options.buildSolid || exactBrepForPart)(part);
      const props = solid.workerMassProperties || await shapeMassProperties(solid);
      rows.push({partId:part.id, accuracy:'exact', ...props, density, massKg:props.volume*density/1000,
        materialName:part.materialName || stockMaterialForPart(part)?.name || null,
        materialCatalogId:part.materialCatalogId || null});
    } catch (error) {
      // An imported mesh can be approximated. A failed modified primitive
      // cannot be replaced by its pre-cut analytic volume.
      rows.push(fallbackRow(part, density, error));
    } finally { if (solid) (options.releaseSolid || disposeBrep)(solid); }
  }
  const measured = rows.filter(row=>row.volume>0), volumeCm3 = measured.reduce((sum,row)=>sum+row.volume,0);
  const massKg = measured.reduce((sum,row)=>sum+(row.massKg || 0),0);
  const centerOfMass = Object.fromEntries(['x','y','z'].map(k=>[k, massKg ? measured.reduce((sum,row)=>sum+(row.massKg||0)*(row.centerOfMass?.[k]||0),0)/massKg : 0]));
  const accuracy = rows.some(row=>row.accuracy==='unavailable') ? 'incomplete' : rows.every(row=>row.accuracy==='exact') ? 'exact' : 'approximate';
  // Parallel-axis theorem. cm^5 * g/cm³ -> g cm^2 -> kg m^2.
  const inertiaKgM2 = accuracy==='exact' && measured.length ? [[0,0,0],[0,0,0],[0,0,0]] : null;
  if (inertiaKgM2) for (const row of measured) {
    const delta = ['x','y','z'].map(k=>row.centerOfMass[k]-centerOfMass[k]), distance2=delta.reduce((s,v)=>s+v*v,0);
    for (let i=0;i<3;i++) for(let j=0;j<3;j++) inertiaKgM2[i][j] += (row.inertia[i][j]+row.volume*((i===j?distance2:0)-delta[i]*delta[j]))*row.density*1e-7;
  }
  const bounds = accuracy === 'exact' && measured.length && measured.every(row=>row.bounds)
    ? {min:Object.fromEntries(['x','y','z'].map(k=>[k,Math.min(...measured.map(row=>row.bounds.min[k]))])),
       max:Object.fromEntries(['x','y','z'].map(k=>[k,Math.max(...measured.map(row=>row.bounds.max[k]))]))} : null;
  const densities = [...new Set(measured.map(row=>row.density))];
  return {bounds, volumeCm3, massKg, massG:massKg*1000, density:densities.length===1?densities[0]:null,
    densities, centerOfMass, inertiaKgM2, accuracy,
    unmeasured:rows.filter(row=>row.accuracy==='unavailable').length, bodies:rows};
}

/* Centre of mass expressed in a user coordinate system: the offset from its
   origin projected on each (possibly reversed) axis. Units follow the inputs. */
export function centerOfMassInSystem(com, system) {
  const d = { x: com.x - (system.origin?.x || 0), y: com.y - (system.origin?.y || 0), z: com.z - (system.origin?.z || 0) };
  const along = (axis = {}) => d.x * (axis.x || 0) + d.y * (axis.y || 0) + d.z * (axis.z || 0);
  return { x: along(system.xAxis), y: along(system.yAxis), z: along(system.zAxis) };
}
