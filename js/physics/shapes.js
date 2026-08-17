import * as THREE from "three";
import { ctx } from "./registry.js";
import {
  GROUP_WORLD,
  GROUP_DEBRIS,
  GROUP_CHARACTER,
  MATERIAL_PROFILES,
  massFromCubicVolume,
  dynamicMargin,
  halfExtentsFor,
} from "./math.js";
import { materialTypeFor } from "./materials.js";
import {
  createBody,
  addBoxShape,
  setPositionCm,
  markDebrisBody,
} from "./native.js";

const inverseRoot = new THREE.Matrix4();
const relative = new THREE.Matrix4();
const partBounds = new THREE.Box3();
const sizeVec = new THREE.Vector3();
const centerVec = new THREE.Vector3();
const worldPos = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();
const worldScale = new THREE.Vector3();

function localPartsFor(mesh) {
  mesh.updateMatrixWorld(true);
  inverseRoot.copy(mesh.matrixWorld).invert();
  const parts = [];
  mesh.traverse(node => {
    if (!node.isMesh || !node.geometry) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    relative.multiplyMatrices(inverseRoot, node.matrixWorld);
    partBounds.copy(node.geometry.boundingBox).applyMatrix4(relative);
    if (partBounds.isEmpty()) return;
    partBounds.getSize(sizeVec);
    partBounds.getCenter(centerVec);
    parts.push({
      sx: sizeVec.x,
      sy: sizeVec.y,
      sz: sizeVec.z,
      cx: centerVec.x,
      cy: centerVec.y,
      cz: centerVec.z,
      type: materialTypeFor(node),
    });
  });
  return parts;
}

export function createPhysicsBody(mesh, isDynamic) {
  if (!ctx.world) return null;
  if (!mesh) return null;

  let parts = localPartsFor(mesh);
  if (!parts.length) {
    parts = [{ sx: 0.2, sy: 0.2, sz: 0.2, cx: 0, cy: 0, cz: 0, type: "standard" }];
  }

  mesh.getWorldPosition(worldPos);
  mesh.getWorldQuaternion(worldQuat);
  mesh.getWorldScale(worldScale);
  const sxAbs = Math.abs(worldScale.x);
  const syAbs = Math.abs(worldScale.y);
  const szAbs = Math.abs(worldScale.z);

  const bodyType = isDynamic ? materialTypeFor(mesh) : (parts[0].type || "standard");
  const profile = MATERIAL_PROFILES[bodyType] || MATERIAL_PROFILES.standard;
  let volume = 0;
  let dominantType = bodyType;
  let dominantVol = 0;

  const cooked = parts.map(part => {
    const sx = part.sx * sxAbs;
    const sy = part.sy * syAbs;
    const sz = part.sz * szAbs;
    const vol = sx * sy * sz;
    volume += vol;
    if (vol > dominantVol) {
      dominantVol = vol;
      dominantType = part.type;
    }
    const margin = isDynamic ? dynamicMargin(sx, sy, sz) : 0;
    return {
      half: halfExtentsFor(sx, sy, sz, margin),
      offset: {
        x: part.cx * worldScale.x,
        y: part.cy * worldScale.y,
        z: part.cz * worldScale.z,
      },
      type: part.type,
      vol,
    };
  });

  const density = (MATERIAL_PROFILES[dominantType] || profile).density;
  const mass = isDynamic ? massFromCubicVolume(volume, density) : 0;
  const material = ctx.materialByType.get(dominantType) || ctx.physicsMaterial;

  const body = createBody({
    isDynamic: !!isDynamic,
    friction: material.friction,
    restitution: material.restitution,
    groups: GROUP_WORLD,
    mask: GROUP_WORLD | GROUP_DEBRIS | GROUP_CHARACTER,
    linearDamping: 0.25,
    angularDamping: 0.35,
  });
  body.userData = { hit: false, materialType: dominantType };

  cooked.forEach(part => {
    const share = isDynamic && volume > 0 ? mass * (part.vol / volume) : 0;
    addBoxShape(body, part.half.x, part.half.y, part.half.z, part.offset.x, part.offset.y, part.offset.z, share);
  });

  setPositionCm(body, worldPos.x, worldPos.y, worldPos.z);
  body.quaternion.copy(worldQuat);
  body.flushToRapier();
  body.pullFromRapier(false);

  const physicsObject = {
    mesh: mesh,
    body: body,
    lastSafePosition: body.position.clone(),
    lastSafeQuaternion: body.quaternion.clone(),
  };
  ctx.physicsBodies.push(physicsObject);
  ctx.bodyLookup.set(body, physicsObject);
  ctx.meshLookup.set(mesh, physicsObject);
  return body;
}

export function removePhysicsObject(obj) {
  if (!obj) return;
  if (ctx.world && obj.body) ctx.world.removeBody(obj.body);
  if (obj.body) ctx.bodyLookup.delete(obj.body);
  if (obj.mesh) ctx.meshLookup.delete(obj.mesh);
  const index = ctx.physicsBodies.indexOf(obj);
  if (index > -1) ctx.physicsBodies.splice(index, 1);
}

export function markDebris(body) {
  markDebrisBody(body);
}

export function retireDebrisBody(obj) {
  const entry = ctx.debris.find(item => item.body === obj.body);
  removePhysicsObject(obj);
  if (entry) entry.body = null;
}
