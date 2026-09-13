// Reconstruct only unambiguous manifold section rings. Tolerance welds nearby
// endpoints geometrically; grid cells are an index, not the weld decision.
export function analyzeSectionBoundaries(segments = [], tolerance = 1e-3) {
  const tol = tolerance > 0 ? tolerance : 1e-3, nodes = [], grid = new Map(), edges = [], issues = [];
  const node = p => {
    const x = Math.floor(p.u / tol), y = Math.floor(p.v / tol);
    for (let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) for(const id of grid.get(`${x+dx}:${y+dy}`)||[]) {
      if(Math.hypot(nodes[id].p.u-p.u,nodes[id].p.v-p.v)<=tol)return id;
    }
    const id=nodes.length;nodes.push({p,edges:[]});const key=`${x}:${y}`;
    if(!grid.has(key))grid.set(key,[]);grid.get(key).push(id);return id;
  };
  const pairs=new Set();
  for(const segment of segments){
    if(![segment?.a?.u,segment?.a?.v,segment?.b?.u,segment?.b?.v].every(Number.isFinite)){issues.push({code:'invalid-section-segment'});continue;}
    const a=node(segment.a),b=node(segment.b);if(a===b)continue;
    const key=[a,b].sort((x,y)=>x-y).join(':');
    if(pairs.has(key)){issues.push({code:'duplicate-section-edge'});continue;}pairs.add(key);
    const id=edges.length;edges.push({a,b});nodes[a].edges.push(id);nodes[b].edges.push(id);
  }
  if(nodes.some(n=>n.edges.length===1))issues.push({code:'open-section-boundary'});
  if(nodes.some(n=>n.edges.length>2))issues.push({code:'non-manifold-section-boundary'});
  const cross=(a,b,c)=>(b.u-a.u)*(c.v-a.v)-(b.v-a.v)*(c.u-a.u);
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<=tol*Math.hypot(b.u-a.u,b.v-a.v)&&p.u>=Math.min(a.u,b.u)-tol&&p.u<=Math.max(a.u,b.u)+tol&&p.v>=Math.min(a.v,b.v)-tol&&p.v<=Math.max(a.v,b.v)+tol;
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    const e=edges[i],f=edges[j];if([e.a,e.b].some(id=>id===f.a||id===f.b))continue;
    const a=nodes[e.a].p,b=nodes[e.b].p,c=nodes[f.a].p,d=nodes[f.b].p;
    if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))issues.push({code:'intersecting-section-boundary',edges:[i,j]});
  }
  const loops=[],used=new Set();
  if(!issues.length)for(let i=0;i<edges.length;i++){
    if(used.has(i))continue;const first=edges[i].a;let current=first,index=i;const points=[nodes[first].p];
    do{used.add(index);const e=edges[index];current=e.a===current?e.b:e.a;points.push(nodes[current].p);index=nodes[current].edges.find(id=>!used.has(id));}while(current!==first&&index!==undefined);
    if(current===first&&points.length>=4)loops.push(points);
  }
  return {ok:issues.length===0,loops,issues};
}
