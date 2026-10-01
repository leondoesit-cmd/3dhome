// Binary STL is unitless. ModelForge's kernel works in centimeters, so write
// millimeter coordinates for the manufacturing tools that consume STL.
import { shapeToMeshData, validateBrepForExport } from "./cad_kernel.js";
import { prepareNativePrintPositions } from './core/print_setup.js';

export const STL_FINE_MESH = Object.freeze({ deflection: 0.02, angle: 0.08 });
export function stlMeshOptions(settings) {
  if (!settings || settings.quality === 'fine') return { ...STL_FINE_MESH };
  if (settings.quality === 'coarse') return { deflection: 0.1, angle: Math.PI / 9 };
  if (settings.quality !== 'custom') throw new Error('Choose Coarse, Fine or Custom STL resolution');
  const deviation = Number(settings.deviationMm), angle = Number(settings.angleDegrees);
  if (!Number.isFinite(deviation) || deviation < 0.0001 || deviation > 100) throw new Error('STL deviation must be between 0.0001 and 100 mm');
  if (!Number.isFinite(angle) || angle < 0.1 || angle > 45) throw new Error('STL angle must be between 0.1 and 45 degrees');
  return { deflection: deviation / 10, angle: angle * Math.PI / 180 };
}
const CM_TO_MM = 10;
const HEADER_LENGTH = 80;
const TRIANGLE_LENGTH = 50;

export function binaryStlFromPositions(positions, name = "ModelForge") {
  if (!positions || positions.length < 9 || positions.length % 9 !== 0) {
    throw new Error("STL needs complete triangles");
  }
  const triangle = t => {
    const base = t * 9;
    const p = new Array(9);
    for (let i = 0; i < 9; i++) {
      p[i] = Number(positions[base + i]) * CM_TO_MM;
      if (!Number.isFinite(p[i]) || Math.abs(p[i]) > 3.402823466e38) {
        throw new Error("STL contains a nonfinite or out-of-range coordinate");
      }
    }
    const abx = p[3] - p[0], aby = p[4] - p[1], abz = p[5] - p[2];
    const acx = p[6] - p[0], acy = p[7] - p[1], acz = p[8] - p[2];
    const normal = [aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx];
    const length = Math.hypot(...normal);
    return { p, normal, length };
  };
  // OCCT can put a zero-area facet at a sphere pole or periodic seam. Such
  // facets have no surface and no usable STL normal, so omit them.
  const valid = [];
  for (let t = 0; t < positions.length / 9; t++) {
    const { length } = triangle(t);
    if (!Number.isFinite(length)) throw new Error("STL contains an invalid triangle");
    if (length > 0) valid.push(t);
  }
  const count = valid.length;
  if (!count) throw new Error("STL contains no nondegenerate triangles");
  if (count > 0xffffffff || HEADER_LENGTH + 4 + count * TRIANGLE_LENGTH > 0x7fffffff) {
    throw new Error("STL mesh is too large to export");
  }
  const bytes = new Uint8Array(HEADER_LENGTH + 4 + count * TRIANGLE_LENGTH);
  const view = new DataView(bytes.buffer);
  const header = `ModelForge binary STL; coordinates in mm; ${String(name)}`;
  for (let i = 0; i < Math.min(HEADER_LENGTH, header.length); i++) {
    const code = header.charCodeAt(i);
    bytes[i] = code < 32 || code > 126 ? 95 : code;
  }
  view.setUint32(HEADER_LENGTH, count, true);
  for (let t = 0; t < count; t++) {
    const { p, normal, length } = triangle(valid[t]);
    const offset = HEADER_LENGTH + 4 + t * TRIANGLE_LENGTH;
    for (let axis = 0; axis < 3; axis++) view.setFloat32(offset + axis * 4, normal[axis] / length, true);
    for (let i = 0; i < 9; i++) view.setFloat32(offset + 12 + i * 4, p[i], true);
    view.setUint16(offset + 48, 0, true);
  }
  return bytes;
}

export async function exportBinaryStl(brep, name = "model", settings) {
  const meshOptions = stlMeshOptions(settings);
  await validateBrepForExport(brep);
  const mesh = await shapeToMeshData(brep, meshOptions);
  var positions=prepareNativePrintPositions(mesh.positions,settings?.printSetup);
  if(settings?.printSetup) {
    const zUp=new Float64Array(positions.length);
    for(let i=0;i<positions.length;i+=3){zUp[i]=positions[i];zUp[i+1]=-positions[i+2];zUp[i+2]=positions[i+1];}
    positions=zUp;
  }
  return binaryStlFromPositions(positions, name);
}
