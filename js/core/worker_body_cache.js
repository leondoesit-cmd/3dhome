// These body operations have no extrusion/boundary-update side effects. A
// worker may restore them only after its entire upstream geometry key matches.
export function isWorkerCacheBody(type) {
  return type==='shell' || type==='draft' || type==='union' || type==='fillet' || type==='chamfer';
}
