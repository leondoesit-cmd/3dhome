import * as THREE from "three";
import * as CANNON from "cannon-es";
import { fractureMesh, canFracture } from "./fracture.js";
import { safeDeltaSeconds } from "./physics_runtime.js";

export var physicsEnabled = false;
var world = null;
var physicsBodies = [];
var bodyLookup = new Map();
var meshLookup = new WeakMap();
var physicsMaterial = null;
var debrisMaterial = null;
var materialByType = new Map();
var slowMoEnabled = false;
var particles = [];
var debris = [];

const FIXED_STEP = 1 / 120;
const MAX_SUB_STEPS = 3;
const MAX_SETTLE_SPEED = 250;
const MAX_ACTIVE_SPEED = 1200;
const MAX_ANGULAR_SPEED = 30;
const DEBRIS_RETIRE_SECONDS = 2.5;

// Physical character per rendered material. Values are intentionally modest:
// restitution is particularly easy to overstate at the app's centimetre scale.
const MATERIAL_PROFILES = {
  standard: { density: 1.0, friction: 0.6, restitution: 0.05 },
  metal: { density: 2.5, friction: 0.42, restitution: 0.12 },
  masonry: { density: 2.0, friction: 0.82, restitution: 0.02 },
  ceramic: { density: 1.8, friction: 0.55, restitution: 0.08 },
  glass: { density: 1.2, friction: 0.32, restitution: 0.06 },
  wood: { density: 1.0, friction: 0.64, restitution: 0.07 },
  plastic: { density: 0.6, friction: 0.38, restitution: 0.18 },
  fabric: { density: 0.4, friction: 0.92, restitution: 0.01 },
};

// Global structural-strength multiplier (UI slider). Every material
// threshold (yield/ultimate/shatter) is scaled by this: 1 = table values,
// higher = sturdier furniture, lower = everything crumbles.
var strengthK = 1.0;

export function setStrength(k) {
  strengthK = Math.min(5, Math.max(0.2, k));
  return strengthK;
}

// Hit weapon: "punch" delivers fixed momentum over a wide area — light items
// fly, heavy ones barely rock. "hammer" transfers little momentum but crushes
// with intense stress in a small radius — deep local breaks even on heavy or
// strong objects, without launching them.
var hitMode = "punch";

export function toggleHitMode() {
  hitMode = hitMode === "punch" ? "hammer" : "punch";
  return hitMode;
}

export function getHitMode() {
  return hitMode;
}

export function getStrength() {
  return strengthK;
}

export function clearDebris() {
  if (world) {
    debris.forEach(d => {
      if (d.body) {
        const physicsObject = bodyLookup.get(d.body);
        if (physicsObject) removePhysicsObject(physicsObject);
        else world.removeBody(d.body);
      }
      if (d.mesh && d.mesh.parent) {
        d.mesh.parent.remove(d.mesh);
      }
    });
  }
  debris = [];
}

export function toggleSlowMo() {
  slowMoEnabled = !slowMoEnabled;
  return slowMoEnabled;
}

export function togglePhysics(enabled) {
  physicsEnabled = enabled;
  if (!physicsEnabled) {
    clearPhysics();
  }
  const ch = document.getElementById("crosshair");
  if (ch) ch.style.display = physicsEnabled ? "block" : "none";
  return physicsEnabled;
}

export function isPhysicsEnabled() {
  return physicsEnabled;
}

export function isPhysicsBusy() {
  if (!physicsEnabled || !world) return false;
  if (particles.length) return true;
  for (let i = 0; i < physicsBodies.length; i++) {
    const body = physicsBodies[i] && physicsBodies[i].body;
    if (body && body.type === CANNON.Body.DYNAMIC && body.sleepState !== CANNON.Body.SLEEPING)
      return true;
  }
  return false;
}

export function getPhysicsBodies() {
  return physicsBodies;
}

export function initPhysics() {
  if (world) return;
  world = new CANNON.World();
  world.gravity.set(0, -981, 0); // Gravity in cm/s^2 (approx 9.81 m/s^2 -> 981 cm/s^2)
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 12;
  world.solver.tolerance = 1e-4;
  world.quatNormalizeSkip = 0;
  
  materialByType = new Map();
  Object.keys(MATERIAL_PROFILES).forEach(type => {
    materialByType.set(type, new CANNON.Material(type));
  });
  physicsMaterial = materialByType.get("standard");
  const types = Object.keys(MATERIAL_PROFILES);
  for (let i = 0; i < types.length; i++) {
    for (let j = i; j < types.length; j++) {
      const a = MATERIAL_PROFILES[types[i]];
      const b = MATERIAL_PROFILES[types[j]];
      world.addContactMaterial(new CANNON.ContactMaterial(
        materialByType.get(types[i]),
        materialByType.get(types[j]),
        {
          friction: Math.sqrt(a.friction * b.friction),
          restitution: Math.sqrt(a.restitution * b.restitution),
          contactEquationStiffness: 5e7,
          contactEquationRelaxation: 4,
        },
      ));
    }
  }

  // Soft contacts for debris: shards spawn overlapping walls/furniture, and
  // stiff contacts turn that penetration into launch velocity. Low stiffness
  // + high relaxation pushes them out gently over several frames instead.
  debrisMaterial = new CANNON.Material("debris");
  types.forEach(type => {
    const profile = MATERIAL_PROFILES[type];
    world.addContactMaterial(new CANNON.ContactMaterial(debrisMaterial, materialByType.get(type), {
      friction: Math.min(0.55, profile.friction),
      restitution: Math.max(0.04, profile.restitution * 0.7),
      contactEquationStiffness: 1e6,
      contactEquationRelaxation: 10,
    }));
  });
  world.allowSleep = true;

  // Infinite ground plane at floor level: a backstop so thin items (rugs)
  // can't tunnel through the 3cm-thick floor box and fall forever.
  const ground = new CANNON.Body({ mass: 0, material: physicsMaterial });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // face up
  ground.position.set(0, 0, 0);
  world.addBody(ground);

  world.addEventListener("beginContact", (event) => {
    // If two bodies collide with high enough relative velocity, they can shatter each other!
    const bodyA = event.bodyA;
    const bodyB = event.bodyB;
    
    // We can check the relative velocity along the contact normal, but in beginContact it might not be fully resolved.
    // simpler: check if their velocity difference is large.
    const vA = bodyA.velocity;
    const vB = bodyB.velocity;
    const relativeVelocity = new CANNON.Vec3(vA.x - vB.x, vA.y - vB.y, vA.z - vB.z).length();

    // Only shatter as part of a chain started by an explicit user hit —
    // never from bodies settling/de-penetrating on their own.
    const chainHit = bodyA.userData?.hit || bodyB.userData?.hit;
    if (chainHit && relativeVelocity > 500 * strengthK) { // ~5 m/s impact at strength 1
      const pA = bodyLookup.get(bodyA);
      const pB = bodyLookup.get(bodyB);
      
      const impactImpulse = new CANNON.Vec3(vA.x - vB.x, Math.abs(vA.y - vB.y) + 100, vA.z - vB.z).scale(100);
      const impactPoint = new CANNON.Vec3(bodyA.position.x, bodyA.position.y, bodyA.position.z);
      
      // If pA is a full object (not already shattered into 1 mesh), shatter it!
      if (pA && pA.body.type === CANNON.Body.DYNAMIC && pA.mesh.children && pA.mesh.children.length > 0 && !pA.body.userData.shatterQueued) {
        // Only shatter if it hasn't been shattered yet (has multiple children or is a group)
        if (pA.mesh.type === "Group") {
          pA.body.userData.shatterQueued = true;
          setTimeout(() => {
            if (physicsBodies.includes(pA)) {
              shatterObject(pA, impactImpulse.clone().scale(-1), impactPoint);
            }
            if (pA.body && pA.body.userData) pA.body.userData.shatterQueued = false;
          }, 0);
        }
      }
      
      if (pB && pB.body.type === CANNON.Body.DYNAMIC && pB.mesh.children && pB.mesh.children.length > 0 && !pB.body.userData.shatterQueued) {
        if (pB.mesh.type === "Group") {
          pB.body.userData.shatterQueued = true;
          setTimeout(() => {
            if (physicsBodies.includes(pB)) {
              shatterObject(pB, impactImpulse.clone(), impactPoint);
            }
            if (pB.body && pB.body.userData) pB.body.userData.shatterQueued = false;
          }, 0);
        }
      }
    }
  });
}

export function clearPhysics() {
  if (world) {
    physicsBodies.slice().forEach(removePhysicsObject);
    world.accumulator = 0;
  }
  physicsBodies = [];
  bodyLookup.clear();
  meshLookup = new WeakMap();
  particles.forEach(p => {
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
  });
  particles = [];
  debris.forEach(d => {
    if (d.mesh && d.mesh.parent) d.mesh.parent.remove(d.mesh);
  });
  debris = [];
}

export function syncPhysicsToThree(delta) {
  if (!physicsEnabled || !world) return;
  if (!isPhysicsBusy()) return;
  const timeScale = slowMoEnabled ? 0.1 : 1.0;
  const dt = safeDeltaSeconds(delta, 1 / 60) * timeScale;
  if (!dt) return;
  world.step(FIXED_STEP, dt, MAX_SUB_STEPS);
  
  const retire = [];
  physicsBodies.forEach(obj => {
    if (obj.body.type === CANNON.Body.DYNAMIC) {
      // Untouched furniture can only settle, never get launched: overlapping
      // bounding boxes (chair under table, item on rug) would otherwise be
      // ejected at high speed by the de-penetration solver.
      const v = obj.body.velocity;
      if (!bodyIsFinite(obj.body)) restoreSafeBodyState(obj);
      const speed = v.length();
      if (!obj.body.userData?.hit) {
        if (speed > MAX_SETTLE_SPEED) v.scale(MAX_SETTLE_SPEED / speed, v);
      } else {
        if (speed > MAX_ACTIVE_SPEED) v.scale(MAX_ACTIVE_SPEED / speed, v);
      }
      const angularSpeed = obj.body.angularVelocity.length();
      if (angularSpeed > MAX_ANGULAR_SPEED)
        obj.body.angularVelocity.scale(MAX_ANGULAR_SPEED / angularSpeed, obj.body.angularVelocity);
      syncMeshFromBody(obj);
      rememberSafeBodyState(obj);

      if (obj.body.userData?.debris) {
        if (obj.body.sleepState === CANNON.Body.SLEEPING) {
          if (obj.body.userData.sleepSince == null) obj.body.userData.sleepSince = world.time;
          else if (world.time - obj.body.userData.sleepSince >= DEBRIS_RETIRE_SECONDS) retire.push(obj);
        } else obj.body.userData.sleepSince = null;
      }
    }
  });
  retire.forEach(retireDebrisBody);
  
  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.life -= dt * 1000;
    if (p.life <= 0) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      particles.splice(i, 1);
    } else {
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 981 * dt; // gravity
      p.mesh.scale.multiplyScalar(Math.exp(-1.212 * dt)); // frame-rate independent shrink
    }
  }
}



function removePhysicsObject(obj) {
  if (!obj) return;
  if (world && obj.body) world.removeBody(obj.body);
  if (obj.body) bodyLookup.delete(obj.body);
  if (obj.mesh) meshLookup.delete(obj.mesh);
  const index = physicsBodies.indexOf(obj);
  if (index > -1) physicsBodies.splice(index, 1);
}

function materialTypeFor(mesh) {
  let type = mesh?.userData?.physicsProps?.type;
  if (!MATERIAL_PROFILES[type] && mesh?.traverse) {
    mesh.traverse(node => {
      const candidate = node?.userData?.physicsProps?.type;
      if (!MATERIAL_PROFILES[type] && MATERIAL_PROFILES[candidate]) type = candidate;
    });
  }
  return MATERIAL_PROFILES[type] ? type : "standard";
}

// Bounds in the body's own local frame. This avoids temporarily resetting a
// live mesh (which caused visible flashes) and correctly includes nested parts.
function localBoundsFor(mesh) {
  mesh.updateMatrixWorld(true);
  const inverseRoot = mesh.matrixWorld.clone().invert();
  const bounds = new THREE.Box3().makeEmpty();
  const relative = new THREE.Matrix4();
  const partBounds = new THREE.Box3();
  mesh.traverse(node => {
    if (!node.isMesh || !node.geometry) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    relative.multiplyMatrices(inverseRoot, node.matrixWorld);
    partBounds.copy(node.geometry.boundingBox).applyMatrix4(relative);
    bounds.union(partBounds);
  });
  if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.2, 0.2, 0.2));
  return bounds;
}

const syncWorldPosition = new THREE.Vector3();
const syncWorldQuaternion = new THREE.Quaternion();
const syncParentQuaternion = new THREE.Quaternion();

function syncMeshFromBody(obj) {
  const body = obj.body;
  const pos = body.interpolatedPosition || body.position;
  const quat = body.interpolatedQuaternion || body.quaternion;
  syncWorldPosition.set(pos.x, pos.y, pos.z);
  syncWorldQuaternion.set(quat.x, quat.y, quat.z, quat.w);
  if (obj.mesh.parent) {
    obj.mesh.parent.updateMatrixWorld(true);
    obj.mesh.parent.worldToLocal(syncWorldPosition);
    obj.mesh.parent.getWorldQuaternion(syncParentQuaternion).invert();
    syncWorldQuaternion.premultiply(syncParentQuaternion);
  }
  obj.mesh.position.copy(syncWorldPosition);
  obj.mesh.quaternion.copy(syncWorldQuaternion).normalize();
  obj.mesh.updateMatrixWorld(true);
}

function bodyIsFinite(body) {
  const p = body.position, q = body.quaternion, v = body.velocity, a = body.angularVelocity;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, a.x, a.y, a.z]
    .every(Number.isFinite);
}

function rememberSafeBodyState(obj) {
  obj.lastSafePosition.copy(obj.body.position);
  obj.lastSafeQuaternion.copy(obj.body.quaternion);
}

function restoreSafeBodyState(obj) {
  obj.body.position.copy(obj.lastSafePosition);
  obj.body.previousPosition.copy(obj.lastSafePosition);
  obj.body.interpolatedPosition.copy(obj.lastSafePosition);
  obj.body.quaternion.copy(obj.lastSafeQuaternion);
  obj.body.previousQuaternion.copy(obj.lastSafeQuaternion);
  obj.body.interpolatedQuaternion.copy(obj.lastSafeQuaternion);
  obj.body.velocity.setZero();
  obj.body.angularVelocity.setZero();
  obj.body.force.setZero();
  obj.body.torque.setZero();
}

function retireDebrisBody(obj) {
  const entry = debris.find(item => item.body === obj.body);
  removePhysicsObject(obj);
  if (entry) entry.body = null; // keep the settled mesh removable by Clear Debris
}

export function addPhysicsBody(mesh, isDynamic) {
  if (!world) initPhysics();
  if (!mesh) return null;

  const box = localBoundsFor(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();
  mesh.getWorldPosition(worldPos);
  mesh.getWorldQuaternion(worldQuat);
  mesh.getWorldScale(worldScale);
  const scaledSize = size.clone().multiply(new THREE.Vector3(
    Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z),
  ));
  const scaledCenter = center.clone().multiply(worldScale);
  
  // Shrink dynamic bodies slightly so items resting against walls/floor/
  // each other don't start interpenetrating (which the solver would
  // resolve by launching them apart). Static bodies keep full size.
  const margin = isDynamic
    ? Math.min(1.5, scaledSize.x * 0.02, scaledSize.y * 0.02, scaledSize.z * 0.02)
    : 0;
  // Ensure we have some thickness for flat planes
  const halfExtents = new CANNON.Vec3(
    Math.max(scaledSize.x / 2 - margin, 0.1),
    Math.max(scaledSize.y / 2 - margin, 0.1),
    Math.max(scaledSize.z / 2 - margin, 0.1)
  );

  const shape = new CANNON.Box(halfExtents);
  const materialType = materialTypeFor(mesh);
  const profile = MATERIAL_PROFILES[materialType];
  const volumeMass = (scaledSize.x * scaledSize.y * scaledSize.z * profile.density) / 10000;
  // Extreme mass ratios destabilise iterative solvers; these limits still span
  // everything from a small shard to a full wardrobe.
  const mass = isDynamic ? Math.min(500, Math.max(0.05, volumeMass)) : 0;
  
  const body = new CANNON.Body({
    mass: mass,
    material: materialByType.get(materialType) || physicsMaterial,
    linearDamping: 0.25,
    angularDamping: 0.35,
    allowSleep: true,
    sleepSpeedLimit: 20,  // cm/s — settle quickly once nearly at rest
    sleepTimeLimit: 0.4
  });
  body.userData = { hit: false, materialType: materialType };
  body.velocity.setZero();
  body.angularVelocity.setZero();

  // Add shape offset by the local bounding box center
  body.addShape(shape, new CANNON.Vec3(scaledCenter.x, scaledCenter.y, scaledCenter.z));
  if (isDynamic) body.updateMassProperties();
  
  body.position.copy(worldPos);
  body.quaternion.copy(worldQuat);
  // Cannon interpolation assumes these are initialised. Bodies created without
  // constructor positions otherwise interpolate from the world origin once.
  body.previousPosition.copy(body.position);
  body.interpolatedPosition.copy(body.position);
  body.previousQuaternion.copy(body.quaternion);
  body.interpolatedQuaternion.copy(body.quaternion);
  
  world.addBody(body);
  // Untouched furniture must not spend the first seconds de-penetrating every
  // overlapping bounding box. Forced sleep keeps the world cheap until a hit
  // (which already calls wakeUp before applying impulse).
  if (isDynamic) body.sleep();
  
  const physicsObject = {
    mesh: mesh,
    body: body,
    localCenter: center,
    lastSafePosition: body.position.clone(),
    lastSafeQuaternion: body.quaternion.clone(),
  };
  physicsBodies.push(physicsObject);
  bodyLookup.set(body, physicsObject);
  meshLookup.set(mesh, physicsObject);
  
  return body;
}

export function hitObjectAtCenter(camera, scene) {
  if (!physicsEnabled || !world) return;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  hitAlongRaycaster(raycaster, scene, null);
}

// Damage whatever an arbitrary ray strikes. Night Shift fires this per bullet
// so gunfire chews the same structures the hammer does, with the weapon's own
// contact profile instead of punch/hammer.
//   hit: { radius, stressBase, shards } — see hitObjectAtCenter
export function hitAlongRay(origin, dir, scene, hit, range) {
  if (!physicsEnabled || !world) return false;
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(origin.x, origin.y, origin.z),
    new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
    0,
    range || 6000
  );
  return hitAlongRaycaster(raycaster, scene, hit);
}

// Blow a hole in the world: fracture static structure inside the radius and
// throw every loose body outward. Used by frag grenades and fuel-tank cooks.
export function explodeAt(center, radius, power, scene) {
  if (!physicsEnabled || !world) return 0;
  const c = new THREE.Vector3(center.x, center.y, center.z);
  let touched = 0;
  // 1. loose/dynamic bodies take a radial impulse
  physicsBodies.slice().forEach(pb => {
    if (!pb.body || pb.body.type !== CANNON.Body.DYNAMIC) return;
    const p = pb.body.position;
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    if (d > radius) return;
    const k = (1 - d / radius) * power;
    const dir = new CANNON.Vec3((p.x - c.x) / (d || 1), (p.y - c.y) / (d || 1) + 0.45, (p.z - c.z) / (d || 1));
    pb.body.userData.hit = true;
    markDebris(pb.body);
    pb.body.wakeUp();
    pb.body.applyImpulse(clampImpulse(dir.scale(pb.body.mass * 900 * k), pb.body.mass), new CANNON.Vec3(0, 0, 0));
    touched++;
  });
  // 2. static structure inside the blast fractures, worst at the centre
  const rays = 14;
  for (let i = 0; i < rays; i++) {
    // spherical-ish spray so walls, floor and ceiling all get sampled
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
  // Find intersections with all objects in scene
  const intersects = raycaster.intersectObjects(scene.children, true);

  for (let i = 0; i < intersects.length; i++) {
    let intersect = intersects[i];
    let obj = intersect.object;
    
    let hitGroup = obj;
    let physicsObj = null;
    while (hitGroup && hitGroup !== scene) {
      physicsObj = meshLookup.get(hitGroup);
      if (physicsObj) break;
      hitGroup = hitGroup.parent;
    }
    
    if (physicsObj && physicsObj.body.type === CANNON.Body.DYNAMIC) {
      const mass = Math.max(1, physicsObj.body.mass);
      let impulseMagnitude, hit;
      if (hitOverride) {
        // Caller-supplied contact profile (a bullet, a blast) — momentum is
        // scaled from the stress so a rifle round nudges what it shatters.
        hit = hitOverride;
        impulseMagnitude = Math.min(20000, mass * 40 * (hitOverride.stressBase || 60) / 60);
      } else if (hitMode === "hammer") {
        // Small head, little momentum: the object barely moves, but the
        // concentrated stress crushes whatever is within the head's radius —
        // regardless of how heavy the whole object is.
        impulseMagnitude = Math.min(4000, mass * 200);
        hit = { radius: 12, stressBase: 180, shards: 7 };
      } else {
        // Punch: fixed momentum budget. A chair takes off, a wardrobe rocks.
        impulseMagnitude = Math.min(20000, mass * 800);
        hit = { radius: 30, stressBase: null, shards: 5 };
      }
      const impulse = raycaster.ray.direction.clone().multiplyScalar(impulseMagnitude);
      const cannonImpulse = new CANNON.Vec3(impulse.x, impulse.y, impulse.z);
      const point = intersect.point;
      const cannonPoint = new CANNON.Vec3(point.x, point.y, point.z);

      physicsObj.body.userData.hit = true;
      shatterObject(physicsObj, cannonImpulse, cannonPoint, hit);
      return true; // Only hit the first valid object
    }

    if (physicsObj && physicsObj.body.type === CANNON.Body.STATIC) {
      // Walls, windows, mounted items. Static structures don't take momentum,
      // only contact stress: a punch breaks glass but thuds off masonry; a
      // hammer bites a chunk out of the wall itself.
      const hit = hitOverride
        ? hitOverride
        : hitMode === "hammer"
        ? { radius: 12, stressBase: 180, shards: 8 }
        : { radius: 30, stressBase: 45, shards: 5 };
      damageStaticPart(physicsObj, intersect.object, raycaster.ray.direction, intersect.point, hit);
      return true;
    }
  }
  return false;
}

// Re-parent a mesh that is already posed in WORLD space (fracture shards,
// knocked-out parts) without moving it. Plain add() would leave the world
// pose in the child's LOCAL slot, so the container's own transform gets
// applied a second time — furniture roots hang off the identity `dyn` group
// and never showed it, but every wall segment lives in a translated and
// rotated group, so its shards used to be flung to a mirrored position
// somewhere else in the flat (frequently straight into the camera).
function attachWorld(container, obj) {
  obj.updateMatrixWorld(true);
  container.attach(obj);
  obj.updateMatrixWorld(true);
}

// Damage a static structure (wall segment, window pane, mounted item) at the
// struck mesh. Above its shatter threshold the mesh fractures: shards near
// the impact drop out as dynamic debris, far shards stay in place as new
// static bodies — so repeated hammer blows carve a hole through a wall.
// Between ultimate and shatter, the whole piece is knocked out intact.
function damageStaticPart(physicsObj, struckMesh, rayDir, point, hit) {
  if (!struckMesh || !struckMesh.isMesh) return;
  // Skip room-scale slabs (floor/ceiling) — fracturing those is chaos, not fun
  const wb = new THREE.Box3().setFromObject(struckMesh);
  const wsize = new THREE.Vector3();
  wb.getSize(wsize);
  if (Math.max(wsize.x, wsize.y, wsize.z) > 500) return;

  const props = struckMesh.userData.physicsProps || { yield: 50, ultimate: 60, shatter: 70, type: "masonry" };
  // Optional per-weapon exemption: a hit profile can declare material types it
  // simply does not damage, whatever its contact stress. Night Shift uses it to
  // keep small arms off the structure — a rifle round marks a wall, it does not
  // knock a metre of it out of the room.
  if (hit.immune && hit.immune.indexOf(props.type) >= 0) return;
  if (hit.stressBase <= props.ultimate * strengthK) return; // solid thunk

  const dynContainer = physicsObj.mesh.parent && physicsObj.mesh.parent.type === "Group"
    ? physicsObj.mesh.parent
    : struckMesh.parent;
  if (!dynContainer) return;
  const impact3 = new THREE.Vector3(point.x, point.y, point.z);

  // A previously-created static shard wraps exactly this mesh — retire its body
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
    const imp = new CANNON.Vec3(rayDir.x, rayDir.y - 0.1, rayDir.z).scale(body.mass * 300);
    body.applyImpulse(clampImpulse(imp, body.mass), new CANNON.Vec3(0, 0, 0));
    debris.push({ mesh: struckMesh, body: body });
  };

  if (hit.stressBase > props.shatter * strengthK && canFracture(struckMesh)) {
    const shards = fractureMesh(struckMesh, impact3, hit.shards + 3);
    if (shards) {
      if (struckMesh.parent) struckMesh.parent.remove(struckMesh);
      shards.forEach(shard => {
        // world pose first — attachWorld rewrites shard.position into the
        // container's local frame, so the impact test has to read it here
        const near = shard.position.distanceTo(impact3) < hit.radius * 2.5;
        attachWorld(dynContainer, shard);
        const body = addPhysicsBody(shard, near);
        if (near) {
          // Break out and fall, pushed along the swing direction
          body.userData.hit = true;
          markDebris(body);
          body.wakeUp();
          const imp = new CANNON.Vec3(rayDir.x, rayDir.y - 0.2, rayDir.z).scale(body.mass * 400);
          const jitter = new CANNON.Vec3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
          body.applyImpulse(clampImpulse(imp, body.mass), jitter);
          debris.push({ mesh: shard, body: body });
        }
        // far shards stay put as static structure, re-hittable later
      });
      spawnParticles(impact3, color, 6);
      return;
    }
  }
  knockOutWhole();
  spawnParticles(impact3, color, 3);
}

function spawnParticles(position, color, count) {
  const geom = new THREE.BoxGeometry(2, 2, 2);
  const mat = new THREE.MeshBasicMaterial({ color: color });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.copy(position);
    mesh.position.x += (Math.random() - 0.5) * 10;
    mesh.position.y += (Math.random() - 0.5) * 10;
    mesh.position.z += (Math.random() - 0.5) * 10;
    
    // Add to dyn container or scene
    // Since we don't have direct access to dyn here easily, we can find it via physicsBodies or pass it in.
    // For now, let's grab the first dyn container we can find, or we can pass scene to spawnParticles.
    let dynContainer = null;
    if (physicsBodies.length > 0) {
      let node = physicsBodies[0].mesh;
      while (node.parent && node.parent.type === "Group") {
        if (node.parent.name === "dyn" || node.parent.children.length > 0) dynContainer = node.parent;
        node = node.parent;
      }
    }
    // `position` is world space, so re-parent without moving it (this loop
    // walks up to whatever outermost group it finds, which may be transformed)
    if (dynContainer) attachWorld(dynContainer, mesh);

    particles.push({
      mesh: mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 500,
        Math.random() * 500,
        (Math.random() - 0.5) * 500
      ),
      life: 1000 + Math.random() * 1000 // 1-2 seconds
    });
  }
}

// Debris rides in its own collision group and does NOT collide with other
// debris: fracture shards tile the parent's volume, so their bbox collision
// shapes permanently overlap — the de-penetration solver would fountain them
// into the sky at clamp speed forever. They still collide with the floor,
// walls and intact furniture (group 1).
const GROUP_WORLD = 1;
const GROUP_DEBRIS = 2;

// Cap an impulse so it can't give the body more than maxDv of velocity
// change — chain-shatter impulses scale with relative velocity and can hand
// a 0.1-mass splinter six-figure velocities for a single integration step,
// teleporting it kilometers before the per-frame speed clamp sees it.
function clampImpulse(imp, mass, maxDv) {
  maxDv = maxDv || 1200;
  const len = imp.length();
  const max = Math.max(0.01, mass) * maxDv;
  if (len > max && len > 0) imp.scale(max / len, imp);
  return imp;
}

function markDebris(body) {
  body.allowSleep = true;
  body.sleepSpeedLimit = 12;
  body.sleepTimeLimit = 1.2;
  body.userData.debris = true;
  body.userData.sleepSince = null;
  body.collisionFilterGroup = GROUP_DEBRIS;
  body.collisionFilterMask = GROUP_WORLD;
  body.material = debrisMaterial; // soft contacts — see initPhysics
  // Shrink collision shapes: an angled shard's bbox is mostly empty space,
  // and full-size boxes overlap walls/furniture at spawn, which the solver
  // resolves as a violent ejection.
  body.shapes.forEach(s => {
    if (s.halfExtents) {
      s.halfExtents.scale(0.55, s.halfExtents);
      s.updateConvexPolyhedronRepresentation();
    }
  });
  body.updateBoundingRadius();
}

// Fracture a mesh into shards, register each as a rigid body, and fling
// them outward from the impact. Fractures while the mesh is still attached
// (fractureMesh needs a valid world matrix), then removes the original.
function spawnFragments(mesh, dynContainer, impactImpulse, impactPoint, targetCount) {
  const impact3 = new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z);
  const shards = fractureMesh(mesh, impact3, targetCount);

  if (!shards) {
    // Couldn't fracture (degenerate geometry) — fall back to pushing it whole
    attachWorld(dynContainer, mesh);
    const body = addPhysicsBody(mesh, true);
    body.userData.hit = true;
    markDebris(body);
    body.wakeUp();
    body.applyImpulse(clampImpulse(impactImpulse.clone(), body.mass), new CANNON.Vec3(impactPoint.x, impactPoint.y, impactPoint.z));
    return;
  }

  if (mesh.parent) mesh.parent.remove(mesh);

  const impulseLen = impactImpulse.length();
  shards.forEach(shard => {
    // world position before attachWorld localises it — the outward push is a
    // world-space direction
    const shardWorld = shard.position.clone();
    attachWorld(dynContainer, shard);
    const body = addPhysicsBody(shard, true);
    body.userData.hit = true;
    markDebris(body);
    body.wakeUp();

    // Outward from impact plus a share of the hit impulse, scaled by shard mass
    // so small shards fly and heavy ones lumber.
    const out = new CANNON.Vec3(
      shardWorld.x - impactPoint.x,
      shardWorld.y - impactPoint.y + 8,
      shardWorld.z - impactPoint.z
    );
    out.normalize();
    const share = 1.0 / shards.length;
    const imp = new CANNON.Vec3(
      impactImpulse.x * share + out.x * impulseLen * 0.15,
      impactImpulse.y * share + out.y * impulseLen * 0.15,
      impactImpulse.z * share + out.z * impulseLen * 0.15
    );
    const jitter = new CANNON.Vec3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 8
    );
    body.applyImpulse(clampImpulse(imp, body.mass), jitter);
    debris.push({ mesh: shard, body: body });
  });
}

function shatterObject(physicsObj, impactImpulse, impactPoint, hit) {
  // We don't instantly remove the original body here anymore.
  // Instead, we evaluate all parts and determine what breaks.
  // `hit` describes the weapon: contact radius, an optional fixed contact
  // stress (hammer), and shard count. Chain collisions pass nothing and get
  // punch-like momentum-based stress.
  hit = hit || { radius: 30, stressBase: null, shards: 5 };

  const parentGroup = physicsObj.mesh; // THREE.Group for furniture
  const dynContainer = parentGroup.parent;
  if (!dynContainer) return;
  
  const meshes = [];
  parentGroup.traverse(node => {
    if (node.isMesh) meshes.push(node);
  });
  
  if (meshes.length === 1 && meshes[0] === parentGroup) {
    // Single detached piece: fracture if stress > shatter
    const props = parentGroup.userData.physicsProps || { shatter: 55 };
    // Stress from the velocity change this impulse causes (cm/s / 8):
    // a direct crosshair hit is ~62 — shatters glass/board, not solid wood.
    // A hammer applies its fixed contact stress instead.
    const deltaV = impactImpulse.length() / Math.max(1, physicsObj.body.mass);
    const stress = hit.stressBase != null ? hit.stressBase : deltaV / 8;

    if (stress > props.shatter * strengthK && canFracture(parentGroup)) {
      removePhysicsObject(physicsObj);
      spawnFragments(parentGroup, dynContainer, impactImpulse, impactPoint, hit.shards);
    } else {
      // Just push it
      physicsObj.body.userData.hit = true;
      physicsObj.body.wakeUp();
      physicsObj.body.applyImpulse(clampImpulse(impactImpulse.clone(), physicsObj.body.mass), new CANNON.Vec3(impactPoint.x, impactPoint.y, impactPoint.z));
    }
    return;
  }

  // It's a group. Let's calculate stress for each part and decide its fate.
  const impactForce = impactImpulse.length();
  // Velocity change the impulse causes to the whole object (cm/s): the same
  // hit rocks a vase much harder than a wardrobe.
  const deltaV = impactForce / Math.max(1, physicsObj.body.mass);
  let partsRemoved = false;
  
  // Create a copy of meshes array because we might remove them from parentGroup during iteration
  const meshesToProcess = [...meshes];

  meshesToProcess.forEach(mesh => {
    const props = mesh.userData.physicsProps || { yield: 22, ultimate: 35, shatter: 55 }; // engineered board
    
    // Save world transform
    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);
    
    // Distance from the impact to the part's surface (its world bbox), not
    // its center — a hammer landing on a wide tabletop must damage the top
    // even though the slab's center is far from the contact point.
    const impact3 = new THREE.Vector3(impactPoint.x, impactPoint.y, impactPoint.z);
    const partBox = new THREE.Box3().setFromObject(mesh);
    const distToImpact = Math.max(1, partBox.clampPoint(impact3, new THREE.Vector3()).distanceTo(impact3));
    
    // Estimate part size from its bounding box
    mesh.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    mesh.geometry.boundingBox.getSize(size);
    const vol = Math.max(1, size.x * size.y * size.z);
    const massFactor = Math.max(0.1, vol / 10000); // used for break-off impulse below

    // Stress on this part: base stress from the hit (deltaV/8 ≈ 62 for a
    // direct punch; a hammer's fixed contact stress instead), fading with
    // distance from the impact (full within the weapon's contact radius),
    // amplified for small parts — thin legs and knobs snap before big slabs.
    const baseStress = hit.stressBase != null ? hit.stressBase : deltaV / 8;
    const falloff = Math.min(1, hit.radius / distToImpact);
    const sizeFactor = Math.min(3, Math.max(0.5, Math.cbrt(10000 / vol)));
    const stress = baseStress * falloff * sizeFactor;
    
    // Determine color from material
    let color = 0x888888;
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        if (mesh.material.length > 0) color = mesh.material[0].color.getHex();
      } else {
        color = mesh.material.color.getHex();
      }
    }

    if (stress > props.shatter * strengthK && canFracture(mesh)) {
      // SHATTER
      partsRemoved = true;
      if (Math.random() > 0.5) spawnParticles(worldPos, color, 3);
      spawnFragments(mesh, dynContainer, impactImpulse, impactPoint, hit.shards);
      
    } else if (stress > props.ultimate * strengthK) {
      // BREAK OFF
      partsRemoved = true;
      if (Math.random() > 0.7) spawnParticles(worldPos, color, 2);
      
      attachWorld(dynContainer, mesh);

      const newBody = addPhysicsBody(mesh, true);
      newBody.userData.hit = true;
      markDebris(newBody);
      newBody.wakeUp();

      // Push outward (worldPos, not mesh.position — that is now container-local)
      const outwardVec = new CANNON.Vec3(
        worldPos.x - impactPoint.x,
        worldPos.y - impactPoint.y + 10,
        worldPos.z - impactPoint.z
      );
      outwardVec.normalize();
      
      const partImpulse = new CANNON.Vec3(
        outwardVec.x * impactForce * 0.1 * massFactor,
        outwardVec.y * impactForce * 0.1 * massFactor,
        outwardVec.z * impactForce * 0.1 * massFactor
      );
      
      newBody.applyImpulse(clampImpulse(partImpulse, newBody.mass), new CANNON.Vec3(0, 0, 0));
      debris.push({ mesh: mesh, body: newBody });
      
    } else if (stress > props.yield * strengthK) {
      // BEND (Permanently deform relative to parent)
      // We simulate this by rotating the mesh locally away from the impact
      const localImpactDir = new THREE.Vector3(impactPoint.x - worldPos.x, impactPoint.y - worldPos.y, impactPoint.z - worldPos.z).normalize();
      // Transform direction to local space of the mesh's parent
      if (mesh.parent) {
         mesh.parent.worldToLocal(localImpactDir);
         // Rotate slightly away from impact direction
         const axis = new THREE.Vector3(0, 1, 0).cross(localImpactDir).normalize();
         if (axis.lengthSq() > 0.1) {
           const bendAngle = Math.min(Math.PI / 4, (stress - props.yield * strengthK) * 0.005);
           mesh.rotateOnAxis(axis, -bendAngle);
           mesh.updateMatrix();
         }
      }
    }
  });

  if (partsRemoved) {
    // If the group lost parts, we need to recreate its physics body to reflect the new shape
    removePhysicsObject(physicsObj);
    
    // Check if group is empty
    let stillHasMeshes = false;
    parentGroup.traverse(node => {
      if (node.isMesh) stillHasMeshes = true;
    });
    
    if (stillHasMeshes) {
       // Re-add body
       const newBody = addPhysicsBody(parentGroup, true);
       newBody.userData.hit = true;
       newBody.wakeUp();
       newBody.applyImpulse(clampImpulse(impactImpulse.clone(), newBody.mass), new CANNON.Vec3(impactPoint.x, impactPoint.y, impactPoint.z));
    } else {
       if (parentGroup.parent) parentGroup.parent.remove(parentGroup);
    }
  } else {
    // No parts broke off, just apply impulse to the whole object
    physicsObj.body.userData.hit = true;
    physicsObj.body.wakeUp();
    physicsObj.body.applyImpulse(clampImpulse(impactImpulse.clone(), physicsObj.body.mass), new CANNON.Vec3(impactPoint.x, impactPoint.y, impactPoint.z));
  }
}
