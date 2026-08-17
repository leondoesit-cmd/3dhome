import * as THREE from "three";
import { fractureMesh, canFracture } from "../fracture.js";
import { ctx } from "./registry.js";
import {
  DEFAULT_PART_PROPS,
  DEFAULT_STATIC_PROPS,
  DEFAULT_SINGLE_PROPS,
  applyClampToVec,
  hitStress,
  partStress,
} from "./math.js";
import { addPhysicsBody, removePhysicsObject } from "./world.js";
import { markDebris } from "./shapes.js";
import { spawnParticles } from "./vfx.js";
import { applyImpulseCm, getPositionCm, BODY_DYNAMIC, BODY_STATIC, vec3 } from "./native.js";

function attachWorld(container, obj) {
  obj.updateMatrixWorld(true);
  container.attach(obj);
  obj.updateMatrixWorld(true);
}

export function hitObjectAtCenter(camera, scene) {
  if (!ctx.enabled || !ctx.world) return;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  hitAlongRaycaster(raycaster, scene, null);
}

export function hitAlongRay(origin, dir, scene, hit, range) {
  if (!ctx.enabled || !ctx.world) return false;
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(origin.x, origin.y, origin.z),
    new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    0,
    range || 6000,
  );
  return hitAlongRaycaster(raycaster, scene, hit);
}

export function explodeAt(center, radius, power, scene) {
  if (!ctx.enabled || !ctx.world) return 0;
  const c = new THREE.Vector3(center.x, center.y, center.z);
  let touched = 0;
  ctx.physicsBodies.slice().forEach(pb => {
    if (!pb.body || pb.body.type !== BODY_DYNAMIC) return;
    const p = getPositionCm(pb.body);
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    if (d > radius) return;
    const k = (1 - d / radius) * power;
    const dir = vec3((p.x - c.x) / (d || 1), (p.y - c.y) / (d || 1) + 0.45, (p.z - c.z) / (d || 1));
    pb.body.userData.hit = true;
    markDebris(pb.body);
    pb.body.wakeUp();
    applyImpulseCm(pb.body, applyClampToVec(dir.scale(pb.body.mass * 900 * k), pb.body.mass), vec3(0, 0, 0));
    touched++;
  });
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2,
      y = -0.35 + (i % 5) * 0.28;
    const dir = new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize();
    if (hitAlongRaycaster(new THREE.Raycaster(c.clone(), dir, 0, radius), scene, {
      radius: 40,
      stressBase: 150 * power,
      shards: 7,
    }))
      touched++;
  }
  return touched;
}

function hitAlongRaycaster(raycaster, scene, hitOverride) {
  const intersects = raycaster.intersectObjects(scene.children, true);

  for (let i = 0; i < intersects.length; i++) {
    const intersect = intersects[i];
    let hitGroup = intersect.object;
    let physicsObj = null;
    while (hitGroup && hitGroup !== scene) {
      physicsObj = ctx.meshLookup.get(hitGroup);
      if (physicsObj) break;
      hitGroup = hitGroup.parent;
    }

    if (physicsObj && physicsObj.body.type === BODY_DYNAMIC) {
      const mass = Math.max(1, physicsObj.body.mass);
      let impulseMagnitude, hit;
      if (hitOverride) {
        hit = hitOverride;
        impulseMagnitude = Math.min(20000, mass * 40 * (hitOverride.stressBase || 60) / 60);
      } else if (ctx.hitMode === "hammer") {
        impulseMagnitude = Math.min(4000, mass * 200);
        hit = { radius: 12, stressBase: 180, shards: 7 };
      } else {
        impulseMagnitude = Math.min(20000, mass * 800);
        hit = { radius: 30, stressBase: null, shards: 5 };
      }
      const impulse = raycaster.ray.direction.clone().multiplyScalar(impulseMagnitude);
      const cannonImpulse = vec3(impulse.x, impulse.y, impulse.z);
      const point = intersect.point;
      const cannonPoint = vec3(point.x, point.y, point.z);

      physicsObj.body.userData.hit = true;
      shatterObject(physicsObj, cannonImpulse, cannonPoint, hit);
      return true;
    }

    if (physicsObj && physicsObj.body.type === BODY_STATIC) {
      const hit = hitOverride
        ? hitOverride
        : ctx.hitMode === "hammer"
        ? { radius: 12, stressBase: 180, shards: 8 }
        : { radius: 30, stressBase: 45, shards: 5 };
      damageStaticPart(physicsObj, intersect.object, raycaster.ray.direction, intersect.point, hit);
      return true;
    }
  }
  return false;
}

function damageStaticPart(physicsObj, struckMesh, rayDir, point, hit) {
  if (!struckMesh || !struckMesh.isMesh) return;
  const wb = new THREE.Box3().setFromObject(struckMesh);
  const wsize = new THREE.Vector3();
  wb.getSize(wsize);
  if (Math.max(wsize.x, wsize.y, wsize.z) > 500) return;

  const props = struckMesh.userData.physicsProps || DEFAULT_STATIC_PROPS;
  if (hit.immune && hit.immune.indexOf(props.type) >= 0) return;
  if (hit.stressBase <= props.ultimate * ctx.strengthK) return;

  const dynContainer = physicsObj.mesh.parent && physicsObj.mesh.parent.type === "Group"
    ? physicsObj.mesh.parent
    : struckMesh.parent;
  if (!dynContainer) return;
  const impact3 = new THREE.Vector3(point.x, point.y, point.z);

  if (physicsObj.mesh === struckMesh) {
    removePhysicsObject(physicsObj);
  }

  let color = 0xbbbbbb;
  const mat = Array.isArray(struckMesh.material) ? struckMesh.material[0] : struckMesh.material;
  if (mat && mat.color) color = mat.color.getHex();

  const knockOutWhole = () => {
    attachWorld(dynContainer, struckMesh);
    const body = addPhysicsBody(struckMesh, true);
    body.userData.hit = true;
    markDebris(body);
    body.wakeUp();
    const imp = vec3(rayDir.x, rayDir.y - 0.1, rayDir.z).scale(body.mass * 300);
    applyImpulseCm(body, applyClampToVec(imp, body.mass), vec3(0, 0, 0));
    ctx.debris.push({ mesh: struckMesh, body: body });
  };

  if (hit.stressBase > props.shatter * ctx.strengthK && canFracture(struckMesh)) {
    const shards = fractureMesh(struckMesh, impact3, hit.shards + 3);
    if (shards) {
      if (struckMesh.parent) struckMesh.parent.remove(struckMesh);
      shards.forEach(shard => {
        const near = shard.position.distanceTo(impact3) < hit.radius * 2.5;
        attachWorld(dynContainer, shard);
        const body = addPhysicsBody(shard, near);
        if (near) {
          body.userData.hit = true;
          markDebris(body);
          body.wakeUp();
          const imp = vec3(rayDir.x, rayDir.y - 0.2, rayDir.z).scale(body.mass * 400);
          const jitter = vec3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
          applyImpulseCm(body, applyClampToVec(imp, body.mass), jitter);
          ctx.debris.push({ mesh: shard, body: body });
        }
      });
      spawnParticles(impact3, color, 6, dynContainer);
      return;
    }
  }
  knockOutWhole();
  spawnParticles(impact3, color, 3, dynContainer);
}

function spawnFragments(mesh, dynContainer, impactImpulse, impactPoint, targetCount) {
  const impact3 = new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z);
  const shards = fractureMesh(mesh, impact3, targetCount);

  if (!shards) {
    attachWorld(dynContainer, mesh);
    const body = addPhysicsBody(mesh, true);
    body.userData.hit = true;
    markDebris(body);
    body.wakeUp();
    applyImpulseCm(body, applyClampToVec(impactImpulse.clone(), body.mass), vec3(impactPoint.x, impactPoint.y, impactPoint.z));
    return;
  }

  if (mesh.parent) mesh.parent.remove(mesh);

  const impulseLen = impactImpulse.length();
  shards.forEach(shard => {
    const shardWorld = shard.position.clone();
    attachWorld(dynContainer, shard);
    const body = addPhysicsBody(shard, true);
    body.userData.hit = true;
    markDebris(body);
    body.wakeUp();

    const out = vec3(
      shardWorld.x - impactPoint.x,
      shardWorld.y - impactPoint.y + 8,
      shardWorld.z - impactPoint.z,
    );
    out.normalize();
    const share = 1.0 / shards.length;
    const imp = vec3(
      impactImpulse.x * share + out.x * impulseLen * 0.15,
      impactImpulse.y * share + out.y * impulseLen * 0.15,
      impactImpulse.z * share + out.z * impulseLen * 0.15,
    );
    const jitter = vec3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
    );
    applyImpulseCm(body, applyClampToVec(imp, body.mass), jitter);
    ctx.debris.push({ mesh: shard, body: body });
  });
}

function shatterObject(physicsObj, impactImpulse, impactPoint, hit) {
  hit = hit || { radius: 30, stressBase: null, shards: 5 };

  const parentGroup = physicsObj.mesh;
  const dynContainer = parentGroup.parent;
  if (!dynContainer) return;

  const meshes = [];
  parentGroup.traverse(node => {
    if (node.isMesh) meshes.push(node);
  });

  if (meshes.length === 1 && meshes[0] === parentGroup) {
    const props = parentGroup.userData.physicsProps || DEFAULT_SINGLE_PROPS;
    const stress = hitStress(impactImpulse.length(), physicsObj.body.mass, hit.stressBase);

    if (stress > props.shatter * ctx.strengthK && canFracture(parentGroup)) {
      removePhysicsObject(physicsObj);
      spawnFragments(parentGroup, dynContainer, impactImpulse, impactPoint, hit.shards);
    } else {
      physicsObj.body.userData.hit = true;
      physicsObj.body.wakeUp();
      applyImpulseCm(physicsObj.body, applyClampToVec(impactImpulse.clone(), physicsObj.body.mass), vec3(impactPoint.x, impactPoint.y, impactPoint.z));
    }
    return;
  }

  const impactForce = impactImpulse.length();
  const deltaV = impactForce / Math.max(1, physicsObj.body.mass);
  let partsRemoved = false;
  const meshesToProcess = [...meshes];

  meshesToProcess.forEach(mesh => {
    const props = mesh.userData.physicsProps || DEFAULT_PART_PROPS;

    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    const impact3 = new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z);
    const partBox = new THREE.Box3().setFromObject(mesh);
    const distToImpact = Math.max(1, partBox.clampPoint(impact3, new THREE.Vector3()).distanceTo(impact3));

    mesh.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox.getSize(size);
    const vol = Math.max(1, size.x * size.y * size.z);
    const massFactor = Math.max(0.1, vol / 10000);

    const baseStress = hit.stressBase != null ? hit.stressBase : deltaV / 8;
    const stress = partStress(baseStress, hit.radius, distToImpact, vol);

    let color = 0x888888;
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        if (mesh.material.length > 0) color = mesh.material[0].color.getHex();
      } else {
        color = mesh.material.color.getHex();
      }
    }

    if (stress > props.shatter * ctx.strengthK && canFracture(mesh)) {
      partsRemoved = true;
      if (Math.random() > 0.5) spawnParticles(worldPos, color, 3, dynContainer);
      spawnFragments(mesh, dynContainer, impactImpulse, impactPoint, hit.shards);
    } else if (stress > props.ultimate * ctx.strengthK) {
      partsRemoved = true;
      if (Math.random() > 0.7) spawnParticles(worldPos, color, 2, dynContainer);

      attachWorld(dynContainer, mesh);

      const newBody = addPhysicsBody(mesh, true);
      newBody.userData.hit = true;
      markDebris(newBody);
      newBody.wakeUp();

      const outwardVec = vec3(
        worldPos.x - impactPoint.x,
        worldPos.y - impactPoint.y + 10,
        worldPos.z - impactPoint.z,
      );
      outwardVec.normalize();

      const partImpulse = vec3(
        outwardVec.x * impactForce * 0.1 * massFactor,
        outwardVec.y * impactForce * 0.1 * massFactor,
        outwardVec.z * impactForce * 0.1 * massFactor,
      );

      applyImpulseCm(newBody, applyClampToVec(partImpulse, newBody.mass), vec3(0, 0, 0));
      ctx.debris.push({ mesh: mesh, body: newBody });
    } else if (stress > props.yield * ctx.strengthK) {
      const localImpactDir = new THREE.Vector3(impactPoint.x - worldPos.x, impactPoint.y - worldPos.y, impactPoint.z - worldPos.z).normalize();
      if (mesh.parent) {
        mesh.parent.worldToLocal(localImpactDir);
        const axis = new THREE.Vector3(0, 1, 0).cross(localImpactDir).normalize();
        if (axis.lengthSq() > 0.1) {
          const bendAngle = Math.min(Math.PI / 4, (stress - props.yield * ctx.strengthK) * 0.005);
          mesh.rotateOnAxis(axis, -bendAngle);
          mesh.updateMatrix();
        }
      }
    }
  });

  if (partsRemoved) {
    removePhysicsObject(physicsObj);

    let stillHasMeshes = false;
    parentGroup.traverse(node => {
      if (node.isMesh) stillHasMeshes = true;
    });

    if (stillHasMeshes) {
      const newBody = addPhysicsBody(parentGroup, true);
      newBody.userData.hit = true;
      newBody.wakeUp();
      applyImpulseCm(newBody, applyClampToVec(impactImpulse.clone(), newBody.mass), vec3(impactPoint.x, impactPoint.y, impactPoint.z));
    } else {
      if (parentGroup.parent) parentGroup.parent.remove(parentGroup);
    }
  } else {
    physicsObj.body.userData.hit = true;
    physicsObj.body.wakeUp();
    applyImpulseCm(physicsObj.body, applyClampToVec(impactImpulse.clone(), physicsObj.body.mass), vec3(impactPoint.x, impactPoint.y, impactPoint.z));
  }
}

export function drainShatterQueue(queued) {
  queued.forEach(entry => {
    if (!ctx.physicsBodies.includes(entry.obj)) return;
    const impulse = vec3(entry.impulse.x, entry.impulse.y, entry.impulse.z);
    const point = vec3(entry.point.x, entry.point.y, entry.point.z);
    shatterObject(entry.obj, impulse, point);
    if (entry.obj.body && entry.obj.body.userData) entry.obj.body.userData.shatterQueued = false;
  });
}
