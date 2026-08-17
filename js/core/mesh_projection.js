// Orthographic feature-edge projection for imported/direct triangle meshes.
// The result is intentionally plain data so the sketch canvas, drawing sheet,
// SVG exporter and tests can share it without depending on Three.js.

const cache = new WeakMap();

const vectorForView = (view) => view === "top" ? {x:0,y:1,z:0}
  : view === "front" ? {x:0,y:0,z:1} : {x:1,y:0,z:0};

const pointForView = (point, view) => view === "top" ? {u:point.x,v:point.z}
  : view === "front" ? {u:point.x,v:point.y} : {u:point.z,v:point.y};

const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;

function normalOf(a,b,c) {
  const ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},ac={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
  const normal={x:ab.y*ac.z-ab.z*ac.y,y:ab.z*ac.x-ab.x*ac.z,z:ab.x*ac.y-ab.y*ac.x};
  const size=Math.hypot(normal.x,normal.y,normal.z);
  return size>1e-12 ? {x:normal.x/size,y:normal.y/size,z:normal.z/size} : null;
}

function meshSpan(positions) {
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let index=0;index+2<positions.length;index+=3){
    const x=Number(positions[index]),y=Number(positions[index+1]),z=Number(positions[index+2]);
    if(![x,y,z].every(Number.isFinite))continue;
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
  }
  return Number.isFinite(minX) ? Math.max(maxX-minX,maxY-minY,maxZ-minZ,1) : 1;
}

function meshEdges(meshData) {
  const positions=meshData?.positions || [], tolerance=meshSpan(positions)*1e-6, edges=new Map();
  const keyOf=(point)=>Math.round(point.x/tolerance)+":"+Math.round(point.y/tolerance)+":"+Math.round(point.z/tolerance);
  const add=(a,b,normal)=>{
    const ka=keyOf(a),kb=keyOf(b);if(ka===kb)return;
    const key=ka<kb?ka+"|"+kb:kb+"|"+ka,edge=edges.get(key);
    if(edge)edge.normals.push(normal);else edges.set(key,{a:{...a},b:{...b},normals:[normal]});
  };
  for(let index=0;index+8<positions.length;index+=9){
    const a={x:Number(positions[index]),y:Number(positions[index+1]),z:Number(positions[index+2])};
    const b={x:Number(positions[index+3]),y:Number(positions[index+4]),z:Number(positions[index+5])};
    const c={x:Number(positions[index+6]),y:Number(positions[index+7]),z:Number(positions[index+8])};
    if(![a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z].every(Number.isFinite))continue;
    const normal=normalOf(a,b,c);if(!normal)continue;
    add(a,b,normal);add(b,c,normal);add(c,a,normal);
  }
  return Array.from(edges.values());
}

export function clearMeshProjectionCache(meshData) {
  if(meshData && typeof meshData==="object")cache.delete(meshData);
}

export function projectMeshEdges(meshData, view="top", options={}) {
  if(!meshData?.positions?.length)return {type:"segments",segments:[],bounds:null};
  view=["top","front","side","right"].includes(view)?view:"top";if(view==="side")view="right";
  let views=cache.get(meshData);if(!views){views=new Map();cache.set(meshData,views);}
  const creaseCos=Number.isFinite(options.creaseCos)?Number(options.creaseCos):Math.cos(Math.PI/12);
  const cacheKey=view+":"+creaseCos;
  if(views.has(cacheKey))return views.get(cacheKey);
  const towardCamera=vectorForView(view),epsilon=1e-5,segments=[];
  for(const edge of meshEdges(meshData)){
    const facing=edge.normals.map((normal)=>dot(normal,towardCamera)),front=Math.max(...facing),back=Math.min(...facing);
    let visible=false;
    if(edge.normals.length===1)visible=front>epsilon;
    else if(front>epsilon && back<=epsilon)visible=true; // silhouette or face boundary
    else if(front>epsilon){
      for(let a=0;a<edge.normals.length&&!visible;a++)for(let b=a+1;b<edge.normals.length;b++)if(dot(edge.normals[a],edge.normals[b])<creaseCos){visible=true;break;}
    }
    if(!visible)continue;
    const a=pointForView(edge.a,view),b=pointForView(edge.b,view);
    if(Math.hypot(b.u-a.u,b.v-a.v)>epsilon)segments.push({a,b});
  }
  let bounds=null;
  if(segments.length){
    const points=segments.flatMap((segment)=>[segment.a,segment.b]);
    bounds={u0:Math.min(...points.map((point)=>point.u)),u1:Math.max(...points.map((point)=>point.u)),v0:Math.min(...points.map((point)=>point.v)),v1:Math.max(...points.map((point)=>point.v))};
  }
  const result={type:"segments",segments,bounds};views.set(cacheKey,result);return result;
}
