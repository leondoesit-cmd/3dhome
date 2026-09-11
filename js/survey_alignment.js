import { alignScanPoints } from './survey_exchange.js';
const clone=x=>JSON.parse(JSON.stringify(x));
export function alignRoomScan(scan,sourcePair,targetPair){
 const copy=clone(scan),angle=Math.atan2(targetPair[1].z-targetPair[0].z,targetPair[1].x-targetPair[0].x)-Math.atan2(sourcePair[1].z-sourcePair[0].z,sourcePair[1].x-sourcePair[0].x);
 const transform=p=>alignScanPoints([p],sourcePair,targetPair)[0];
 for(const line of copy.cad.lines){line.a=transform(line.a);line.b=transform(line.b);}
 for(const list of [copy.cad.doors,copy.cad.windows,copy.cad.objects])for(const o of list||[]){if(o.center)o.center=transform(o.center);if(o.a)o.a=transform(o.a);if(o.b)o.b=transform(o.b);if(o.rot!=null)o.rot+=angle*180/Math.PI;}
 copy.alignment={source:clone(sourcePair),target:clone(targetPair),rotation:angle};return copy;
}
export function scanReconciliation(converted,state,tolerance=2){
 const merged=clone(converted),shared=[],conflicts=[],mapping=new Map();
 const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<=tolerance;
 for(const w of merged.walls){const a=merged.nodes[w.a],b=merged.nodes[w.b];
  const existing=(state.walls||[]).find(old=>{const c=state.nodes[old.a],d=state.nodes[old.b];return c&&d&&((close(a,c)&&close(b,d))||(close(a,d)&&close(b,c)));});
  if(!existing){
   const length=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
   const overlap=(state.walls||[]).find(old=>{const c=state.nodes[old.a],d=state.nodes[old.b];if(!c||!d||!length)return false;const cross=p=>Math.abs((p.x-a.x)*uz-(p.z-a.z)*ux);if(cross(c)>tolerance||cross(d)>tolerance)return false;const cs=(c.x-a.x)*ux+(c.z-a.z)*uz,ds=(d.x-a.x)*ux+(d.z-a.z)*uz;return Math.min(length,Math.max(cs,ds))-Math.max(0,Math.min(cs,ds))>tolerance;});
   if(overlap)conflicts.push({incoming:w.id,existing:overlap.id,reason:'partial-wall'});
   continue;
  }
  if(existing.geometry?.type==='arc'||existing.geometry?.kind==='arc'||existing.curve){conflicts.push({incoming:w.id,existing:existing.id,reason:'wall-shape'});continue;}
  if(Math.abs(w.thickness-existing.thickness)>tolerance||Math.abs(w.height-existing.height)>tolerance){conflicts.push({incoming:w.id,existing:existing.id,reason:'dimensions'});continue;}
  const reversed=close(a,state.nodes[existing.b]),length=Math.hypot(b.x-a.x,b.z-a.z);
  mapping.set(w.id,{id:existing.id,reversed,length});shared.push({incoming:w.id,existing:existing.id});
 }
 merged.walls=merged.walls.filter(w=>!mapping.has(w.id));
 merged.openings=merged.openings.flatMap(o=>{
  const host=mapping.get(o.wall);if(!host)return [o];
  o.wall=host.id;if(host.reversed)o.s=host.length-o.s;
  const existing=(state.openings||[]).filter(p=>String(p.wall)===String(o.wall));
  const same=existing.find(p=>Math.abs(p.s-o.s)<=tolerance&&Math.abs(p.width-o.width)<=tolerance&&Math.abs(p.height-o.height)<=tolerance&&Math.abs((p.sill||0)-(o.sill||0))<=tolerance&&p.type===o.type);
  if(same)return [];
  if(existing.some(p=>Math.abs(p.s-o.s)<(p.width+o.width)/2))conflicts.push({incoming:o.id,existing:o.wall,reason:'openings'});
  return [o];
 });
 return {converted:merged,shared,conflicts};
}
