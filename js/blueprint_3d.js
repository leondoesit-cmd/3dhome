import { blueprintRaster, pixelToWorld } from './blueprint_trace.js';

export function buildBlueprintUnderlay3D(parent, THREE, ref) {
  if(!ref||ref.visible===false)return null;
  const image=blueprintRaster(ref);if(!image)return null;
  const corners=[[0,0],[ref.width,0],[0,ref.height],[ref.width,ref.height]]
    .map(([x,y])=>pixelToWorld(ref,{x,y}));
  if(corners.some(p=>!p))return null;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(p=>[p.x,.25,p.z]),3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,1,1,1,0,0,1,0],2));
  geometry.setIndex([0,2,1,1,2,3]);geometry.computeVertexNormals();
  const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:ref.opacity??.55,
    depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.addEventListener('dispose',()=>texture.dispose());
  const mesh=new THREE.Mesh(geometry,material);mesh.name='blueprint-underlay';
  // Reference presentation is neither pickable model geometry nor a collider.
  mesh.userData.blueprintUnderlay=true;mesh.userData.exportSkip=true;mesh.raycast=()=>{};parent.add(mesh);return mesh;
}
