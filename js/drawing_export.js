const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function drawingBounds(snapshot,{furniture=true}={}){
 const points=[...snapshot.walls,...snapshot.openings,...snapshot.swings,...snapshot.voids,...(furniture?snapshot.items:[]),...snapshot.rooms.map(r=>r.points)].flat();
 if(!points.length)return null;
 const minx=Math.min(...points.map(p=>p.x))-2,maxx=Math.max(...points.map(p=>p.x))+2,minz=Math.min(...points.map(p=>p.z))-2,maxz=Math.max(...points.map(p=>p.z))+2;
 return {minx,maxx,minz,maxz,w:maxx-minx,d:maxz-minz};
}
export function drawingSVG(snapshot,bounds,{furniture=true,dimensions=true,labels=true}={}){
 const x=v=>v-bounds.minx,y=v=>bounds.maxz-v;
 const points=poly=>poly.map(p=>x(p.x)+','+y(p.z)).join(' ');
 const polygons=(list,attributes)=>list.map(poly=>`<polygon points="${points(poly)}" ${attributes}/>`).join('');
 const mask=`<defs><mask id="wall-openings" maskUnits="userSpaceOnUse" x="-100" y="-100" width="${bounds.maxx-bounds.minx+200}" height="${bounds.maxz-bounds.minz+200}"><rect x="-100" y="-100" width="${bounds.maxx-bounds.minx+200}" height="${bounds.maxz-bounds.minz+200}" fill="white"/>${polygons(snapshot.openings,'fill="black"')}</mask></defs>`;
 const walls=`<g id="walls" mask="url(#wall-openings)">${polygons(snapshot.walls,'fill="#20242a"')}</g>`;
 const openings=`<g id="openings">${polygons(snapshot.openings,'fill="none" stroke="#617d8b" stroke-width="1"')}${polygons(snapshot.swings,'fill="none" stroke="#617d8b" stroke-width="1"')}</g>`;
 const voids=`<g id="floor-voids">${polygons(snapshot.voids,'fill="none" stroke="#6a6560" stroke-width="1" stroke-dasharray="8 5"')}</g>`;
 const names=labels?snapshot.rooms.map(room=>`<text x="${x(room.cx)}" y="${y(room.cz)}" text-anchor="middle" font-size="12" fill="#20242a">${esc(room.name)}</text>`).join(''):'';
 const dims=dimensions?snapshot.rooms.filter(room=>room.width&&room.depth).map(room=>`<text x="${x(room.cx)}" y="${y(room.cz)+16}" text-anchor="middle" font-size="9" fill="#555">${Number(room.width.toFixed(2))} × ${Number(room.depth.toFixed(2))} cm</text>`).join(''):'';
 const items=furniture?`<g id="furniture">${polygons(snapshot.items,'fill="#d8c8a8" stroke="#564c3f" stroke-width="1"')}</g>`:'';
 return mask+walls+voids+openings+items+`<g id="room-labels">${names}${dims}</g>`;
}
export function drawingDXF(snapshot,{furniture=true}={}){
 const layers=['WALLS','ROOMS','OPENINGS','DOOR_SWINGS','FLOOR_VOIDS','FURNITURE','LABELS','DIMENSIONS'];
 let out='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n9\n$INSUNITS\n70\n5\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n5\n1\n100\nAcDbSymbolTable\n70\n'+layers.length+'\n';
 for(const layer of layers)out+='0\nLAYER\n2\n'+layer+'\n70\n0\n62\n7\n6\nCONTINUOUS\n';
 out+='0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n';
 const polyline=(points,layer)=>{if(points.length<2)return;out+='0\nLWPOLYLINE\n100\nAcDbEntity\n8\n'+layer+'\n100\nAcDbPolyline\n90\n'+points.length+'\n70\n1\n';for(const p of points)out+='10\n'+p.x+'\n20\n'+p.z+'\n';};
 for(const [key,layer]of [['walls','WALLS'],['openings','OPENINGS'],['swings','DOOR_SWINGS'],['voids','FLOOR_VOIDS']])snapshot[key].forEach(poly=>polyline(poly,layer));
 snapshot.rooms.forEach(room=>polyline(room.points,'ROOMS'));
 if(furniture)snapshot.items.forEach(poly=>polyline(poly,'FURNITURE'));
 // R2007 uses UTF-8; native text also displays correctly in independent readers.
 const text=(value,x,z,layer,height)=>{const safe=String(value).replace(/[\r\n]/g,' ');out+='0\nTEXT\n100\nAcDbEntity\n8\n'+layer+'\n100\nAcDbText\n10\n'+x+'\n20\n'+z+'\n30\n0\n40\n'+height+'\n1\n'+safe+'\n72\n1\n11\n'+x+'\n21\n'+z+'\n31\n0\n100\nAcDbText\n73\n2\n';};
 snapshot.rooms.forEach(room=>{text(room.name,room.cx,room.cz,'LABELS',12);if(room.width&&room.depth)text(Number(room.width.toFixed(2))+' x '+Number(room.depth.toFixed(2))+' cm',room.cx,room.cz-16,'DIMENSIONS',9);});
 return out+'0\nENDSEC\n0\nEOF\n';
}
