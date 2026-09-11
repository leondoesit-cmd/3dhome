// Canonical measured XYZ faces are triangulated in their own plane. Their
// measured vertices are unchanged; triangulation is presentation only.
export function buildSurveyGeometry(root,THREE,features){
 for(const f of features||[]){
  const pts=f.points.map(p=>new THREE.Vector3(p.x,p.y,p.z));if(!pts.length)continue;
  const group=new THREE.Group();group.userData.surveyFeature=f;
  if(f.kind==='point'){
   const dot=new THREE.Mesh(new THREE.SphereGeometry(2,8,6),new THREE.MeshBasicMaterial({color:0x8197ed}));dot.position.copy(pts[0]);dot.userData.cameraIgnore=true;group.add(dot);
  }else{
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(f.kind==='face'?[...pts,pts[0]]:pts),new THREE.LineBasicMaterial({color:0x8197ed}));line.userData.cameraIgnore=true;group.add(line);
   if(f.kind==='face'){
    const origin=pts[0],u=pts[1].clone().sub(origin).normalize();let normal=null;
    for(let i=2;i<pts.length;i++){const n=new THREE.Vector3().crossVectors(u,pts[i].clone().sub(origin));if(n.length()>.001){normal=n.normalize();break;}}
    if(normal){const v=new THREE.Vector3().crossVectors(normal,u),shape=pts.map(p=>{const d=p.clone().sub(origin);return new THREE.Vector2(d.dot(u),d.dot(v));}),faces=THREE.ShapeUtils.triangulateShape(shape,[]),geometry=new THREE.BufferGeometry().setFromPoints(pts);geometry.setIndex(faces.flat());geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xa4b0d5,side:THREE.DoubleSide,roughness:.8}));mesh.userData.surveyFeature=f;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
   }
  }
  root.add(group);
 }
}
