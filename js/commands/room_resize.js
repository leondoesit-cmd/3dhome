import {footprint,inside} from "../layout_analysis.js";
import { roomMeasurements } from '../room_summary.js';
import { wallCurveGeom } from '../wall_curves.js';
import { wallLayerBands } from '../wall_types.js';

const fail = reason => ({ ok: false, reason });
const near = (a, b) => Math.abs(a - b) < 1e-6;

export const roomResizeCommand = Object.freeze({
  id: 'room.resize_exact',
  prepare(params, env) {
    const state = env.state;
    if (state.workspace?.role === 'viewer') return fail('READ_ONLY');
    const room = env.services.detectRooms().find(r => r.key === params.roomKey);
    const measurement = roomMeasurements(state, room);
    if (!measurement?.interior) return fail('ROOM_NOT_RECT');
    const width = Number(params.width), depth = Number(params.depth);
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 20 || depth < 20)
      return fail('INVALID_ROOM_SIZE');
    if (state.structLocked || state.layers?.structure?.locked || state.roomMeta[room.key]?.locked)
      return fail('ROOM_LOCKED');
    // This direct capture edit never silently rearranges possessions or services.
    if ((state.items?.length && !params.preserveContents) || state.mep?.nodes?.length || state.mep?.runs?.length || state.slabOpenings?.length)
      return fail('RESIZE_CONTENTS');
    if (state.wallCons?.length || state.roomCons?.length || state.markers?.length)
      return fail('RESIZE_CONSTRAINTS');
    const ids = new Set(room.key.split(','));
    const own = state.walls.filter(w => ids.has(String(w.id)));
    if (own.some(w => w.locked)) return fail('ROOM_LOCKED');
    const foreign = state.walls.filter(w => !ids.has(String(w.id)));
    const x0 = Math.min(...room.pts.map(p => p.x)), x1 = Math.max(...room.pts.map(p => p.x));
    const z0 = Math.min(...room.pts.map(p => p.z)), z1 = Math.max(...room.pts.map(p => p.z));
    const delta = { x: width - measurement.interior.width, z: depth - measurement.interior.depth };
    const nodeIds = [...new Set(own.flatMap(w => [w.a, w.b]))];
    const moves = new Map();
    for (const [axis, low, high] of [['x', x0, x1], ['z', z0, z1]]) {
      if (Math.abs(delta[axis]) < 1e-8) continue;
      let chosen = null;
      for (const side of [high, low]) {
        const nodes = nodeIds.filter(i => near(state.nodes[i][axis], side));
        if (!nodes.length || nodes.some(i => foreign.some(w => w.a === i || w.b === i))) continue;
        chosen = { nodes, shift: near(side, high) ? delta[axis] : -delta[axis] }; break;
      }
      if (!chosen) return fail('ROOM_SIDE_SHARED');
      for (const i of chosen.nodes) {
        if (!moves.has(i)) moves.set(i, { index: i, ...state.nodes[i] });
        moves.get(i)[axis] += chosen.shift;
      }
    }
    if ([...moves.keys()].some(i => state.nodes[i].locked || state.nodes[i].fixed || state.nodes[i].pinned)) return fail('ROOM_LOCKED');
    const nodes = state.nodes.map((n, i) => moves.has(i) ? { ...n, x: moves.get(i).x, z: moves.get(i).z } : n);
    const ownPoints = nodeIds.map(i => nodes[i]);
    const bounds = { x0: Math.min(...ownPoints.map(p => p.x)), x1: Math.max(...ownPoints.map(p => p.x)),
      z0: Math.min(...ownPoints.map(p => p.z)), z1: Math.max(...ownPoints.map(p => p.z)) };
    // Refuse before creating overlaps or new topology. Shared, stationary edges
    // are allowed; another wall inside the resulting rectangle is not.
    const catalog = JSON.parse(JSON.stringify({wallTypes:state.wallTypes || [],walls:[]}));
    const reach = original => {
      const wall = JSON.parse(JSON.stringify(original));
      const bands = wallLayerBands(wall,catalog);
      const offset = wall.loc === 'face' && Math.abs(wall.dimSide) === 1 ? -wall.dimSide*wall.thickness/2 : 0;
      return Math.max(...bands.flatMap(b => [Math.abs(offset+b.start),Math.abs(offset+b.end)]));
    };
    const ownReach = Math.max(...own.map(reach));
    for (const wall of foreign) {
      const g = wallCurveGeom(wall, nodes);
      if (!g || g.kind !== 'line') return fail('RESIZE_NEIGHBOUR');
      const margin = reach(wall) + ownReach;
      const touchesFixedCorner = own.some(w => w.a === wall.a || w.a === wall.b || w.b === wall.a || w.b === wall.b);
      const pad = touchesFixedCorner ? -1e-6 : margin;
      if (Math.min(g.a.x,g.b.x) < bounds.x1 + pad && Math.max(g.a.x,g.b.x) > bounds.x0 - pad &&
          Math.min(g.a.z,g.b.z) < bounds.z1 + pad && Math.max(g.a.z,g.b.z) > bounds.z0 - pad)
        return fail('RESIZE_NEIGHBOUR');
    }
    const clear = {x0:measurement.interiorBounds.x0+bounds.x0-x0,x1:measurement.interiorBounds.x1+bounds.x1-x1,
      z0:measurement.interiorBounds.z0+bounds.z0-z0,z1:measurement.interiorBounds.z1+bounds.z1-z1};
    if(params.preserveContents){
      for(const item of state.items||[]){
        const points=footprint(item);
        const belongs=inside(item,room.pts);
        const fits=points.every(p=>p.x>=clear.x0&&p.x<=clear.x1&&p.z>=clear.z0&&p.z<=clear.z1);
        const intersects=Math.min(...points.map(p=>p.x))<clear.x1&&Math.max(...points.map(p=>p.x))>clear.x0&&Math.min(...points.map(p=>p.z))<clear.z1&&Math.max(...points.map(p=>p.z))>clear.z0;
        if((belongs&&!fits)||(!belongs&&intersects))return fail('RESIZE_CONTENTS');
      }
    }
    const openings = [];
    const changedWalls = own.filter(w => moves.has(w.a) || moves.has(w.b));
    for (const wall of changedWalls) {
      const before = wallCurveGeom(wall, state.nodes), after = wallCurveGeom(wall, nodes);
      if (!after || after.length < 1e-6 || before.ux*after.ux + before.uz*after.uz < 0.999999) return fail("INVALID_ROOM_SIZE");
      const da = { x: after.a.x-before.a.x, z: after.a.z-before.a.z };
      const db = { x: after.b.x-before.b.x, z: after.b.z-before.b.z };
      const translated = near(da.x,db.x) && near(da.z,db.z);
      for (const opening of state.openings.filter(o => String(o.wall) === String(wall.id))) {
        if (opening.locked || opening.pair != null || opening.pairId != null) return fail('RESIZE_OPENING');
        const s = opening.s - (translated ? 0 : da.x*before.ux + da.z*before.uz);
        if (!Number.isFinite(s) || s-opening.width/2 < -1e-6 || s+opening.width/2 > after.length+1e-6)
          return fail('RESIZE_OPENING');
        const axis = Math.abs(after.ux) > 0.5 ? 'x' : 'z';
        const direction = axis === 'x' ? after.ux : after.uz;
        const ends = [s-opening.width/2,s+opening.width/2].map(station => after.a[axis]+direction*station);
        if (Math.min(...ends) < clear[axis+'0']-1e-6 || Math.max(...ends) > clear[axis+'1']+1e-6)
          return fail('RESIZE_OPENING');
        openings.push({ id: opening.id, s });
      }
    }
    return { ok: true, plan: { command: 'room.resize_exact', params: { roomKey: room.key, width, depth,
      nodes: [...moves.values()].map(n => ({ index:n.index, x:n.x, z:n.z })), openings,
      wallIds: changedWalls.map(w => w.id) } } };
  },
  apply(plan, env) {
    const { state } = env, p = plan.params;
    p.nodes.forEach(n => Object.assign(state.nodes[n.index], { x:n.x, z:n.z }));
    p.openings.forEach(o => { state.openings.find(current => current.id === o.id).s = o.s; });
    p.wallIds.forEach(id => env.services.captureLock?.(state.walls.find(w => w.id === id)));
    return { ok:true, changed:[{kind:'room',id:p.roomKey}, ...p.wallIds.map(id=>({kind:'wall',id})),
      ...p.openings.map(o=>({kind:'opening',id:o.id}))], effects:{dirty3D:true,refreshTree:true,refreshInspector:true} };
  },
});
