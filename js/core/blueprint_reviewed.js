/* Reviewed reconstructions are explicit, source-bound records, not recognition
   results. Never apply one to a different image or silently rescale its printed
   dimensions with the raster draft's width field. Coordinates are centimetres. */
export function reviewedBlueprintResult(spec) {
  if (spec?.version !== 1 || spec.units !== 'cm' || !spec.walls?.length)
    throw new Error('Invalid reviewed blueprint.');
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const point = p => p && finite(p.x) && finite(p.z);
  const nodes = [], walls = [], openings = [], items = [];
  const ids = new Map();
  let id = 1;
  function node(p) {
    const existing = nodes.findIndex(n => n.x === p.x && n.z === p.z);
    if (existing !== -1) return existing;
    nodes.push({ x: p.x, z: p.z }); return nodes.length - 1;
  }
  for (const w of spec.walls) {
    if (!w.id || ids.has(w.id) || !point(w.a) || !point(w.b)
      || Math.hypot(w.b.x-w.a.x,w.b.z-w.a.z) < 1
      || !finite(w.thickness) || w.thickness <= 0 || !finite(w.height) || w.height <= 0)
      throw new Error('Invalid reviewed wall: ' + w.id);
    const wall = { id:id++, a:node(w.a), b:node(w.b), thickness:w.thickness,
      height:w.height, wallTypeId:'generic', kind:w.kind || 'normal', datum:'center', phase:'existing',
      layers:[{id:'reviewed-core',thickness:w.thickness,material:'generic-masonry',
        color:'#d8d3c8',role:'core',main:true,structural:true}] };
    walls.push(wall); ids.set(w.id,wall);
  }
  for (const o of spec.openings || []) {
    const wall = ids.get(o.wall);
    const a = wall && nodes[wall.a], b = wall && nodes[wall.b];
    const length = a ? Math.hypot(b.x-a.x,b.z-a.z) : 0;
    if (!wall || !['door','window'].includes(o.type) || !finite(o.s)
      || !finite(o.width) || o.width <= 0 || o.s-o.width/2 < 0 || o.s+o.width/2 > length
      || !finite(o.height) || o.height <= 0 || !finite(o.sill) || o.sill < 0
      || o.sill+o.height > wall.height)
      throw new Error('Invalid reviewed opening: ' + o.wall);
    if (openings.some(p => p.wall === wall.id && Math.abs(p.s-o.s) < (p.width+o.width)/2))
      throw new Error('Overlapping reviewed openings.');
    openings.push({...o,id:id++,wall:wall.id});
  }
  for (const it of spec.items || []) {
    if (!it.type || !point(it) || ![it.w,it.d,it.h].every(n => finite(n) && n > 0)
      || !finite(it.rot)) throw new Error('Invalid reviewed furniture.');
    items.push({...it,id:id++});
  }
  for (const room of spec.rooms || []) {
    if (!point(room.seed) || typeof room.name !== 'string') throw new Error('Invalid reviewed room.');
  }
  const x0 = Math.min(...nodes.map(n=>n.x)), z0 = Math.min(...nodes.map(n=>n.z));
  const w = Math.max(...nodes.map(n=>n.x))-x0, d = Math.max(...nodes.map(n=>n.z))-z0;
  return { reviewed: true, provenance: spec.provenance,
    reconstruction: {nodes,walls,openings,items,nextId:id,rooms:spec.rooms || [],annotations:spec.annotations || []},
    layout:{w,d,rooms:[]}, floorplan:{rooms:spec.rooms || [],walls:[]},
    warnings: spec.provenance.estimates, repaired:false,
    imageSize:spec.imageSize, bounds:spec.bounds, referenceCalibration:spec.referenceCalibration };
}
