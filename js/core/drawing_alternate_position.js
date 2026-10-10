import {projectSolid,projectionBounds} from './hidden_line.js';

export function canAlternatePosition(view) {
  return !!view && ['front','back','top','bottom','left','right','iso','isorear','isoleft'].includes(view.dir)
    && !view.section && !view.alignedSection && !view.detail && !view.auxiliary && !view.cropSketch && !view.brokenOut && !view.breakView
    && !view.exploded && !['shaded','shadedEdges'].includes(view.displayStyle);
}

function vector(value,label) {
  if(!value || !['x','y','z'].every(a=>Number.isFinite(value[a])))throw new Error('Alternate Position needs finite '+label);
  return value;
}

// A named rigid study pose applied to the CURRENT native mesh, never saved ink
// or replacement solid geometry. Rotation is world X, then Y, then Z.
export function alternatePositionBodies(bodies,view) {
  const m=view.alternatePosition;
  if(!canAlternatePosition(view)||m?.version!==1 || typeof m.label!=='string'||!m.label.trim()||m.label.length>120
    ||m.sourceConfigurationId!==(view.configurationId||null)||!Array.isArray(m.bodyIds)||!m.bodyIds.length||m.bodyIds.length>512
    ||!['all','selected'].includes(m.scope)||m.bodyIds.some(id=>typeof id!=='string'||!id)||new Set(m.bodyIds).size!==m.bodyIds.length)throw new Error('Invalid Alternate Position or source configuration; reapply the overlay');
  const translation=vector(m.translation,'translation'),rotation=vector(m.rotation,'rotation'),pivot=vector(m.pivot,'pivot');
  if(['x','y','z'].every(a=>Math.abs(translation[a])<1e-10 && Math.abs(rotation[a]%360)<1e-10))throw new Error('Choose a nonzero alternate translation or rotation');
  const source=new Map();
  for(const b of bodies||[]) {
    const id=String(b.id??'');
    if(!id||source.has(id))throw new Error('Alternate Position needs unique persistent body identities');
    source.set(id,b);
  }
  if(m.scope==='all' && (source.size!==m.bodyIds.length || m.bodyIds.some(id=>!source.has(id))))throw new Error('Alternate Position body set changed; reapply the overlay');
  const angles=['x','y','z'].map(a=>rotation[a]*Math.PI/180),cs=angles.map(Math.cos),sn=angles.map(Math.sin);
  const result=[];
  for(const id of m.bodyIds) {
    const b=source.get(id);
    if(!b?.positions?.length || b.positions.length%9)throw new Error('Alternate Position source body is missing or has invalid triangles');
    const positions=[];
    for(let i=0;i<b.positions.length;i+=3) {
      let x=Number(b.positions[i])-pivot.x,y=Number(b.positions[i+1])-pivot.y,z=Number(b.positions[i+2])-pivot.z;
      if(![x,y,z].every(Number.isFinite))throw new Error('Alternate Position source has nonfinite vertices');
      [y,z]=[cs[0]*y-sn[0]*z,sn[0]*y+cs[0]*z];
      [x,z]=[cs[1]*x+sn[1]*z,-sn[1]*x+cs[1]*z];
      [x,y]=[cs[2]*x-sn[2]*y,sn[2]*x+cs[2]*y];
      positions.push(x+pivot.x+translation.x,y+pivot.y+translation.y,z+pivot.z+translation.z);
    }
    result.push({id:b.id,name:b.name,positions,faceRanges:b.faceRanges});
  }
  return result;
}

export function alternatePositionProjection(base,bodies,view) {
  const alternate=projectSolid(alternatePositionBodies(bodies,view),view.dir,{hidden:false});
  const a=projectionBounds(base),b=projectionBounds(alternate);
  if(!a||!b)throw new Error('Alternate Position needs projectable source and alternate geometry');
  return {...base,alternatePosition:{projection:alternate,modifier:view.alternatePosition},
    presentationCentre:{u:(a.u0+a.u1)/2,v:(a.v0+a.v1)/2},
    displayBounds:{u0:Math.min(a.u0,b.u0),u1:Math.max(a.u1,b.u1),v0:Math.min(a.v0,b.v0),v1:Math.max(a.v1,b.v1)}};
}

export function alternatePositionItems(place) {
  const alternate=place.projection?.alternatePosition;if(!alternate)return [];
  const items=[],metadata={viewId:place.id,alternatePosition:true};
  for(const edge of alternate.projection.visible||[]) {
    const a=place.toSheet(edge.a),b=place.toSheet(edge.b);
    items.push({type:'line',x1:a.x,y1:a.y,x2:b.x,y2:b.y,style:'phantom',...metadata});
  }
  for(const c of alternate.projection.circles||[])if(c.drawn==='visible') {
    const p=place.toSheet(c);items.push({type:'circle',cx:p.x,cy:p.y,r:c.radius*place.k,style:'phantom',...metadata});
  }
  const bounds=projectionBounds(alternate.projection),p=place.toSheet({u:(bounds.u0+bounds.u1)/2,v:bounds.v0});
  items.push({type:'text',x:p.x,y:p.y+5,text:'ALTERNATE: '+alternate.modifier.label,size:2.5,anchor:'middle',...metadata});
  return items;
}
