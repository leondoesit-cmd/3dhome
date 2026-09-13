import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.core.js';
import {sweepSphereTriangle,createCameraSweep} from '../js/camera_sweep.js';
const point=(x,y,z)=>({x,y,z});
const origin=point(0,0,0),forward=point(0,0,1);
const triangle=[point(-50,-50,20),point(50,-50,20),point(0,50,20)];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('sphere meets both sides of a face at its radius and detects initial overlap',()=>{
 near(sweepSphereTriangle(origin,forward,3,...triangle,100),17);
 near(sweepSphereTriangle(origin,forward,3,...[...triangle].reverse(),100),17);
 near(sweepSphereTriangle(point(0,0,40),point(0,0,-1),3,...triangle,100),17);
 assert.equal(sweepSphereTriangle(point(0,0,19),forward,3,...triangle,100),0);
 assert.equal(sweepSphereTriangle(origin,point(0,0,-1),3,...triangle,100),Infinity);
 assert.equal(sweepSphereTriangle(origin,forward,3,...triangle,10),Infinity);
});

test('edge and vertex contacts catch narrow obstacles between the old sample rays',()=>{
 const a=point(6,6,20),b=point(7,6,20),c=point(6,7,20);
 near(sweepSphereTriangle(origin,forward,10,a,b,c,100),20-Math.sqrt(28));
 const edge=[point(3,-20,20),point(3,20,20),point(30,0,20)];
 near(sweepSphereTriangle(origin,forward,5,...edge,100),16);
 assert.equal(sweepSphereTriangle(origin,forward,8,a,b,c,100),Infinity);
 near(sweepSphereTriangle(origin,forward,5,point(3,0,20),point(3,0,20),point(3,0,20),100),16);
});

function patch(){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([6,6,20,7,6,20,6,7,20],3));
 return new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
}
const sweep=(engine,roots,radius=10,limit=100)=>engine.distance(roots,new THREE.Vector3(),new THREE.Vector3(0,0,1),limit,radius);

test('mesh sweep ignores camera visibility and material sidedness but honours physical exclusions',()=>{
 const engine=createCameraSweep(THREE),group=new THREE.Group(),mesh=patch();group.add(mesh);group.visible=false;
 const before=Array.from(mesh.geometry.attributes.position.array);
 near(sweep(engine,[group]),20-Math.sqrt(28)-.05);
 assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before);
 group.userData.cameraIgnore=true;assert.equal(sweep(engine,[group]),100);
 delete group.userData.cameraIgnore;group.userData.item={physical:false};assert.equal(sweep(engine,[group]),100);
 group.userData.item={};assert.ok(sweep(engine,[group])<20);
});

test('world-space contact stays exact under nonuniform scale, parent rotation and instances',()=>{
 const engine=createCameraSweep(THREE),mesh=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial());
 mesh.scale.set(2,.5,3);mesh.position.z=40;mesh.rotation.z=.4;
 near(sweep(engine,[mesh],5),34.95);
 mesh.rotation.y=Math.PI;near(sweep(engine,[mesh],5),34.95);
 const copies=new THREE.InstancedMesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial(),2);
 copies.setMatrixAt(0,new THREE.Matrix4().makeTranslation(0,0,60));copies.setMatrixAt(1,new THREE.Matrix4().makeTranslation(0,0,30));
 near(sweep(engine,[copies],5),24.95);
});

test('derived mesh cache follows geometry edits and moving obstacles',()=>{
 const engine=createCameraSweep(THREE),mesh=patch();sweep(engine,[mesh]);assert.equal(engine.stats.builds,1);
 sweep(engine,[mesh]);assert.equal(engine.stats.builds,0);
 mesh.position.z=10;near(sweep(engine,[mesh]),30-Math.sqrt(28)-.05);
 const position=mesh.geometry.attributes.position;for(let i=0;i<position.count;i++)position.setZ(i,40);position.needsUpdate=true;
 near(sweep(engine,[mesh]),50-Math.sqrt(28)-.05);assert.equal(engine.stats.builds,1);
 mesh.geometry.setDrawRange(0,0);assert.equal(sweep(engine,[mesh]),100);
});

test('BVH prunes a large distant surface without sacrificing the near contact',()=>{
 const positions=[];for(let i=0;i<5000;i++){const x=1000+i;positions.push(x,0,20,x+1,0,20,x,1,20);}positions.push(6,6,20,7,6,20,6,7,20);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const engine=createCameraSweep(THREE),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
 near(sweep(engine,[mesh]),20-Math.sqrt(28)-.05);assert.ok(engine.stats.triangles<20,JSON.stringify(engine.stats));
 sweep(engine,[mesh]);assert.equal(engine.stats.builds,0);
});

test('off-path geometry is rejected before allocating a triangle tree',()=>{
 const engine=createCameraSweep(THREE),mesh=patch();mesh.position.x=5000;
 assert.equal(sweep(engine,[mesh]),100);assert.deepEqual(engine.stats,{meshes:0,triangles:0,builds:0});
 mesh.position.x=0;assert.ok(sweep(engine,[mesh])<20);assert.equal(engine.stats.builds,1);
});

test('morphing an obstacle uses its current vertices instead of a stale base tree',()=>{
 const engine=createCameraSweep(THREE),mesh=patch();
 mesh.geometry.morphAttributes.position=[new THREE.Float32BufferAttribute([6,6,60,7,6,60,6,7,60],3)];mesh.updateMorphTargets();
 near(sweep(engine,[mesh]),20-Math.sqrt(28)-.05);
 mesh.morphTargetInfluences[0]=1;near(sweep(engine,[mesh]),60-Math.sqrt(28)-.05);
 mesh.morphTargetInfluences[0]=.5;near(sweep(engine,[mesh]),40-Math.sqrt(28)-.05);
 mesh.morphTargetInfluences[0]=0;near(sweep(engine,[mesh]),20-Math.sqrt(28)-.05);
});
