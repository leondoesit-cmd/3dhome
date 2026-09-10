import { wallCurveGeom, normalizeWallKind } from './wall_curves.js';
import { wallLayerBands } from './wall_types.js';

// Face-to-face dimensions only when all four inner faces form a rectangle.
// Keep reference-line bounds separate; neither value is a usable-area claim.
export function roomMeasurements(state, room) {
  if (!room?.pts?.length) return null;
  const xs=room.pts.map(p=>p.x), zs=room.pts.map(p=>p.z);
  const x0=Math.min(...xs), x1=Math.max(...xs), z0=Math.min(...zs), z1=Math.max(...zs);
  const result={referenceWidth:x1-x0,referenceDepth:z1-z0,interior:null};
  const ids=new Set(String(room.key).split(','));
  const walls=state.walls.filter(w=>ids.has(String(w.id)));
  if (!walls.length || Math.abs(room.area-(x1-x0)*(z1-z0))>0.01) return result;
  const catalog=JSON.parse(JSON.stringify({wallTypes:state.wallTypes||[],walls:[]}));
  const sides={left:[],right:[],top:[],bottom:[]};
  for(const original of walls){
    const w=JSON.parse(JSON.stringify(original)),g=wallCurveGeom(w,state.nodes);
    if(!g || g.kind!=='line' || ['roomDivider','railing','half'].includes(normalizeWallKind(w)) || ['demolition','demolish'].includes(w.phase)) return result;
    const bands=wallLayerBands(w,catalog);
    const low=Math.min(...bands.map(b=>b.start)),high=Math.max(...bands.map(b=>b.end));
    const offset=w.loc==='face' && Math.abs(w.dimSide)===1 ? -w.dimSide*w.thickness/2 : 0;
    const nx=-g.uz,nz=g.ux,ax=g.a.x+nx*offset,az=g.a.z+nz*offset;
    if(Math.abs(g.a.x-g.b.x)<1e-6){
      const left=Math.abs(g.a.x-x0)<1e-6,right=Math.abs(g.a.x-x1)<1e-6;
      if(!left&&!right)return result;
      sides[left?'left':'right'].push(ax+(left?Math.max(nx*low,nx*high):Math.min(nx*low,nx*high)));
    }else if(Math.abs(g.a.z-g.b.z)<1e-6){
      const top=Math.abs(g.a.z-z0)<1e-6,bottom=Math.abs(g.a.z-z1)<1e-6;
      if(!top&&!bottom)return result;
      sides[top?'top':'bottom'].push(az+(top?Math.max(nz*low,nz*high):Math.min(nz*low,nz*high)));
    }else return result;
  }
  if(Object.values(sides).some(values=>!values.length||Math.max(...values)-Math.min(...values)>1e-6))return result;
  const width=sides.right[0]-sides.left[0],depth=sides.bottom[0]-sides.top[0];
  if(width>0&&depth>0){
    result.interior={width,depth};
    result.interiorBounds={x0:sides.left[0],x1:sides.right[0],z0:sides.top[0],z1:sides.bottom[0]};
  }
  return result;
}

export const ROOM_FLOORS=Object.freeze(['wood','laminate','darkwood','parquet','deck','tiles','porcelain','mosaic','hexTile','checker','balcony','marble','marbleDark','terrazzo','granite','slate','brick','pebble','carpet','carpetGrey','vinyl','epoxy','concrete']);
