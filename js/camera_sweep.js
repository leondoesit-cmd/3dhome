// Camera collision is two-sided and independent of material visibility. The
// BVH is derived, disposable data; neither geometry nor survey evidence changes.
const EPS=1e-9;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const at=(p,v,t)=>({x:p.x+v.x*t,y:p.y+v.y*t,z:p.z+v.z*t});
function roots(a,b,c){
 if(a<EPS)return [];
 const d=b*b-a*c;if(d<0)return [];
 const h=Math.sqrt(d);return [(-b-h)/a,(-b+h)/a];
}
function inTriangle(p,a,b,c,n){
 return dot(cross(sub(b,a),sub(p,a)),n)>=-EPS&&
  dot(cross(sub(c,b),sub(p,b)),n)>=-EPS&&dot(cross(sub(a,c),sub(p,c)),n)>=-EPS;
}
// Direction is a unit vector; the answer is travel in world centimetres.
export function sweepSphereTriangle(origin,direction,radius,a,b,c,limit){
 let hit=Infinity;
 const take=t=>{if(t>=0&&t<=limit&&t<hit)hit=t;};
 const n=cross(sub(b,a),sub(c,a)),normalLength=Math.sqrt(dot(n,n));
 if(normalLength>EPS){
  n.x/=normalLength;n.y/=normalLength;n.z/=normalLength;
  const distance=dot(sub(origin,a),n),speed=dot(direction,n);
  const projected=at(origin,n,-distance);
  if(Math.abs(distance)<=radius&&inTriangle(projected,a,b,c,n))return 0;
  if(Math.abs(speed)>EPS)for(const side of [-1,1]){
   const t=(side*radius-distance)/speed;
   if(t>=0&&t<=limit&&inTriangle(at(at(origin,direction,t),n,-side*radius),a,b,c,n))take(t);
  }
 }
 for(const [p,q] of [[a,b],[b,c],[c,a]]){
  const w=sub(origin,p),edge=sub(q,p),length2=dot(edge,edge),rr=radius*radius;
  if(dot(w,w)<=rr)return 0;
  for(const t of roots(dot(direction,direction),dot(w,direction),dot(w,w)-rr))take(t);
  if(length2<EPS)continue;
  const u=dot(w,edge)/length2,du=dot(direction,edge)/length2;
  const perpendicular=at(w,edge,-u),velocity=at(direction,edge,-du);
  if(u>=0&&u<=1&&dot(perpendicular,perpendicular)<=rr)return 0;
  for(const t of roots(dot(velocity,velocity),dot(perpendicular,velocity),dot(perpendicular,perpendicular)-rr)){
   const station=u+du*t;if(station>=0&&station<=1)take(t);
  }
 }
 return hit;
}
function entry(p,v,bounds,expansion,limit){
 let lo=0,hi=limit;
 for(const axis of ['x','y','z']){
  const min=bounds.min[axis]-expansion[axis],max=bounds.max[axis]+expansion[axis];
  if(Math.abs(v[axis])<EPS){if(p[axis]<min||p[axis]>max)return Infinity;continue;}
  let a=(min-p[axis])/v[axis],b=(max-p[axis])/v[axis];if(a>b)[a,b]=[b,a];
  lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return Infinity;
 }
 return lo;
}
function tree(triangles){
 const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
 for(const triangle of triangles)for(const p of triangle)for(const k of ['x','y','z']){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
 const node={min,max};if(triangles.length<=8){node.triangles=triangles;return node;}
 const axis=['x','y','z'].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];
 triangles.sort((a,b)=>a.reduce((s,p)=>s+p[axis],0)-b.reduce((s,p)=>s+p[axis],0));
 const middle=Math.floor(triangles.length/2);node.left=tree(triangles.slice(0,middle));node.right=tree(triangles.slice(middle));return node;
}
export function createCameraSweep(THREE){
 const cache=new WeakMap(),inverse=new THREE.Matrix4(),instance=new THREE.Matrix4(),world=new THREE.Matrix4();
 const localOrigin=new THREE.Vector3(),localDirection=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 const stats={meshes:0,triangles:0,builds:0};
 function geometryRecord(mesh){
  const geometry=mesh.geometry,position=geometry?.attributes?.position;if(!position)return null;
  const index=geometry.index,start=geometry.drawRange.start||0,count=geometry.drawRange.count;
  const posed=mesh.isSkinnedMesh||mesh.morphTargetInfluences?.some(value=>value!==0);
  const prior=cache.get(geometry);
  if(!posed&&prior&&prior.position===position&&prior.version===position.version&&prior.index===index&&prior.indexVersion===index?.version&&prior.start===start&&prior.count===count)return prior;
  const record={position,version:position.version,index,indexVersion:index?.version,start,count,posed};
  if(!posed){
   const min={x:Infinity,y:Infinity,z:Infinity},max={x:-Infinity,y:-Infinity,z:-Infinity};
   for(let i=0;i<position.count;i++){a.fromBufferAttribute(position,i);for(const key of ['x','y','z'])if(Number.isFinite(a[key])){min[key]=Math.min(min[key],a[key]);max[key]=Math.max(max[key],a[key]);}}
   record.bounds={min,max};cache.set(geometry,record);
  }
  return record;
 }
 function geometryTree(mesh,record){
  if(record.tree!==undefined)return record.tree;
  const {position,index,start,count,posed}=record;
  const triangles=[],end=Math.min(index?index.count:position.count,start+count);
  const read=i=>{const id=index?index.getX(i):i;if(posed)mesh.getVertexPosition(id,a);else a.fromBufferAttribute(position,id);return {x:a.x,y:a.y,z:a.z};};
  for(let i=start;i+2<end;i+=3){const triangle=[read(i),read(i+1),read(i+2)];if(triangle.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)))triangles.push(triangle);}
  const result=triangles.length?tree(triangles):null;stats.builds++;
  record.tree=result;
  return result;
 }
 function distance(roots_,origin,direction,limit,radius){
  stats.meshes=stats.triangles=stats.builds=0;
  if(!(limit>0)||!(radius>=0))return 0;
  let nearest=limit;
  function meshDistance(mesh,matrix){
   if(Math.abs(matrix.determinant())<EPS)return;
   inverse.copy(matrix).invert();const e=inverse.elements;
   localOrigin.copy(origin).applyMatrix4(inverse);
   localDirection.set(e[0]*direction.x+e[4]*direction.y+e[8]*direction.z,e[1]*direction.x+e[5]*direction.y+e[9]*direction.z,e[2]*direction.x+e[6]*direction.y+e[10]*direction.z);
   // Per-axis bounds of the inverse-transformed sphere remain conservative
   // under nonuniform scale and shear. Narrow-phase triangles stay in world space.
   const expansion={x:radius*Math.hypot(e[0],e[4],e[8]),y:radius*Math.hypot(e[1],e[5],e[9]),z:radius*Math.hypot(e[2],e[6],e[10])};
   const record=geometryRecord(mesh);if(!record)return;
   if(record.bounds&&entry(localOrigin,localDirection,record.bounds,expansion,nearest)===Infinity)return;
   const root=geometryTree(mesh,record);if(!root)return;
   if(entry(localOrigin,localDirection,root,expansion,nearest)===Infinity)return;
   stats.meshes++;
   function visit(node){
    if(entry(localOrigin,localDirection,node,expansion,nearest)===Infinity)return;
    if(node.triangles){for(const triangle of node.triangles){
     a.copy(triangle[0]).applyMatrix4(matrix);b.copy(triangle[1]).applyMatrix4(matrix);c.copy(triangle[2]).applyMatrix4(matrix);
     stats.triangles++;nearest=Math.min(nearest,sweepSphereTriangle(origin,direction,radius,a,b,c,nearest));
    }}else{
     const left=entry(localOrigin,localDirection,node.left,expansion,nearest),right=entry(localOrigin,localDirection,node.right,expansion,nearest);
     if(left<=right){visit(node.left);visit(node.right);}else{visit(node.right);visit(node.left);}
    }
   }
   visit(root);
  }
  function walk(object){
   const data=object.userData||{},physical=data.item||data.wall||data.surveyFeature;
   if(data.cameraIgnore||physical?.physical===false||physical?.phase==='demolished')return;
   if(object.isMesh){
    if(object.isInstancedMesh){for(let i=0;i<object.count;i++){object.getMatrixAt(i,instance);world.multiplyMatrices(object.matrixWorld,instance);meshDistance(object,world);}}
    else meshDistance(object,object.matrixWorld);
   }
   for(const child of object.children||[])walk(child);
  }
  for(const root of roots_){if(root){root.updateWorldMatrix(true,true);walk(root);}}
  return Math.max(0,nearest<limit?nearest-.05:limit);
 }
 return {distance,stats};
}
