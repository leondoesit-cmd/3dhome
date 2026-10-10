// Read-only sections of a closed mm/Z-up print mesh. These contours are not
// perimeters, infill, supports, nozzle paths or machine instructions.
function area(points) {
  return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
}
function inside(point,polygon) {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
function closedMesh(mesh) {
  const vertices=mesh?.vertices,triangles=mesh?.triangles,edges=new Map();
  if(!Array.isArray(vertices)||!Array.isArray(triangles)||triangles.length<4)throw new Error('Layer analysis needs a closed indexed mesh');
  if(vertices.length>500000||triangles.length>100000)throw new Error('Layer mesh exceeds its bounded vertex/triangle budget');
  if(vertices.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>!Number.isFinite(v))))throw new Error('Layer mesh has nonfinite coordinates');
  for(const triangle of triangles){
    if(!Array.isArray(triangle)||triangle.length!==3||new Set(triangle).size!==3||triangle.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))throw new Error('Layer mesh has invalid triangle indices');
    const [a,b,c]=triangle.map(i=>vertices[i]),ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    if(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])===0)throw new Error('Layer mesh contains a degenerate triangle');
    for(let i=0;i<3;i++){
      const a=triangle[i],b=triangle[(i+1)%3],key=a<b?a+','+b:b+','+a;
      const edge=edges.get(key)||{count:0,direction:0};edge.count++;edge.direction+=a<b?1:-1;edges.set(key,edge);
    }
  }
  if([...edges.values()].some(edge=>edge.count!==2||edge.direction!==0))throw new Error('Layer mesh has open or inconsistently oriented edges');
}
export function printLayerSourceStamp(source,printSetup) {
  const document={...source};
  // Regeneration changes these derived fields without changing print geometry.
  for(const key of ['parts','exactTopologyCache','verifiedExactTopology','meshData','topology','diagnostics','lastRebuild','lastStandardsAudit','exactBuildToken'])delete document[key];
  document.features=(source.features||[]).map(feature=>{const value={...feature};delete value.state;delete value.diagnostics;return value;});
  // Legacy native direct documents keep authoring primitives in parts rather
  // than a feature tree. Their dimensions must still invalidate an analysis.
  if(!document.features.length)document.parts=(source.parts||[]).map(part=>{
    const value={...part};for(const key of ['meshData','exactBuildToken','exactError','exactPending'])delete value[key];return value;
  });
  return JSON.stringify({document,printSetup});
}
function section(mesh,z,tolerance) {
  const points=[],buckets=new Map(),segments=[],adjacency=new Map(),unique=new Set();
  function weld(point){
    const cell=point.map(v=>Math.floor(v/tolerance));
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(const id of buckets.get([cell[0]+x,cell[1]+y].join(','))||[])
      if(Math.hypot(points[id][0]-point[0],points[id][1]-point[1])<=tolerance)return id;
    const id=points.length,key=cell.join(',');points.push(point);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
  }
  for(const triangle of mesh.triangles){
    const vertices=triangle.map(i=>mesh.vertices[i]),hits=[];
    for(let j=0;j<3;j++){
      const a=vertices[j],b=vertices[(j+1)%3],da=Math.abs(a[2]-z)<=tolerance?0:a[2]-z,db=Math.abs(b[2]-z)<=tolerance?0:b[2]-z;
      // Half-open intersection convention: on-plane vertices belong above.
      // Coplanar facets are ignored; their boundary comes from adjacent facets.
      if((da>=0)===(db>=0))continue;
      const t=da/(da-db);hits.push(weld([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]));
    }
    const ids=[...new Set(hits)];if(ids.length<2)continue;
    if(ids.length!==2)throw new Error('Ambiguous layer intersection');
    const [a,b]=ids,key=a<b?a+','+b:b+','+a;
    if(unique.has(key))throw new Error('Duplicate layer edge; touching or overlapping surfaces need review');
    unique.add(key);const index=segments.length;segments.push(ids);
    for(const id of ids){if(!adjacency.has(id))adjacency.set(id,[]);adjacency.get(id).push(index);}
  }
  if([...adjacency.values()].some(edges=>edges.length!==2))throw new Error('Layer has open or branching contours; choose a different height or finer mesh');
  const visited=new Set(),contours=[];
  for(let first=0;first<segments.length;first++){
    if(visited.has(first))continue;
    const start=segments[first][0],path=[],startEdge=first;let node=start,edge=startEdge;
    do{
      if(visited.has(edge))throw new Error('Layer contour failed to close');
      path.push(points[node]);visited.add(edge);
      const next=segments[edge][0]===node?segments[edge][1]:segments[edge][0];
      const candidates=adjacency.get(next);edge=candidates[0]===edge?candidates[1]:candidates[0];node=next;
    }while(node!==start);
    // Triangulation diagonals create redundant collinear section vertices.
    let changed=true;
    while(changed&&path.length>3){changed=false;for(let i=0;i<path.length;i++){
      const a=path[(i+path.length-1)%path.length],b=path[i],c=path[(i+1)%path.length];
      const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
      if(Math.abs(cross)<=tolerance*Math.hypot(c[0]-a[0],c[1]-a[1])){path.splice(i,1);changed=true;break;}
    }}
    if(path.length<3||Math.abs(area(path))<=tolerance*tolerance)throw new Error('Layer contains a degenerate contour');
    contours.push({points:path});
  }
  for(const contour of contours){
    const depth=contours.filter(other=>other!==contour&&inside(contour.points[0],other.points)).length;
    contour.nestingDepth=depth;contour.hole=depth%2===1;
    if((area(contour.points)>0)===contour.hole)contour.points.reverse();
    contour.signedAreaMm2=area(contour.points);
  }
  return contours;
}
export async function analyzePrintLayers(meshes,{layerHeightMm=0.2,toleranceMm=0.00001,maxLayers=2000,maxTriangleSections=20000000,yieldControl,assertCurrent}={}) {
  if(!Number.isFinite(layerHeightMm)||layerHeightMm<0.01||layerHeightMm>100)throw new Error('Layer height must be between 0.01 and 100 mm');
  if(!Number.isFinite(toleranceMm)||toleranceMm<=0||toleranceMm>0.001)throw new Error('Invalid layer weld tolerance');
  if(!Array.isArray(meshes)||!meshes.length)throw new Error('Layer analysis needs print meshes');
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0,hash=2166136261;
  for(const mesh of meshes){closedMesh(mesh);triangles+=mesh.triangles.length;
    for(const p of mesh.vertices)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
    for(const text of [JSON.stringify(mesh.vertices),JSON.stringify(mesh.triangles)])for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619)>>>0;
  }
  if(lo[2]<-toleranceMm||Math.abs(lo[2])>toleranceMm)throw new Error('Layer mesh must be placed on the Z=0 print bed');
  const count=Math.ceil((hi[2]-lo[2])/layerHeightMm);
  if(!count||count>maxLayers||count*triangles>maxTriangleSections)throw new Error('Layer analysis exceeds its bounded layer/triangle budget; increase layer height');
  const layers=[];
  for(let index=0;index<count;index++){
    assertCurrent?.();if(index%25===0&&yieldControl)await yieldControl();assertCurrent?.();
    const bottom=index*layerHeightMm,top=Math.min((index+1)*layerHeightMm,hi[2]),z=(bottom+top)/2;
    const objects=meshes.map((mesh,i)=>({name:mesh.name||'Body '+(i+1),occurrenceId:mesh.occurrenceId||String(i+1),contours:section(mesh,z,toleranceMm)}));
    layers.push({number:index+1,bottomZMm:bottom,topZMm:top,sectionZMm:z,objects,areaMm2:objects.reduce((sum,item)=>sum+item.contours.reduce((value,c)=>value+c.signedAreaMm2,0),0)});
  }
  assertCurrent?.();
  return {schema:'modelforge-print-layer-analysis',version:1,units:'mm',coordinates:'Z-up; centered print placement; bed Z=0',sourceMeshFingerprint:'fnv1a32-'+hash.toString(16).padStart(8,'0'),layerHeightMm,toleranceMm,triangleCount:triangles,bounds:{min:lo,max:hi},layerCount:count,layers,qualification:'Mid-slab geometric contours only. No perimeters, infill, supports, toolpaths, G-code or physical printing.'};
}

export function printLayerSvg(analysis,number=1) {
  if(!Number.isInteger(number)||number<1||number>analysis.layerCount)throw new Error('Choose an existing layer number');
  const layer=analysis.layers[number-1],lo=analysis.bounds.min,hi=analysis.bounds.max,w=Math.max(hi[0]-lo[0],0.001),h=Math.max(hi[1]-lo[1],0.001),margin=Math.max(w,h)*.04;
  const paths=layer.objects.map(object=>'<path d="'+object.contours.map(contour=>contour.points.map((p,i)=>(i?'L':'M')+p[0]+' '+(-p[1])).join(' ')+' Z').join(' ')+'" fill="#55d9e5" fill-opacity="0.25" fill-rule="evenodd" stroke="#55d9e5" stroke-width="'+Math.max(w,h)*.003+'"/>').join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[lo[0]-margin,-hi[1]-margin,w+2*margin,h+2*margin].join(' ')+'" role="img" aria-label="Geometric print layer '+number+' contours">'+paths+'</svg>';
}
