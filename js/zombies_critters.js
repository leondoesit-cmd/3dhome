/* Night Shift critters: Rats (exterior focused) and Crows (perched / sky).
   ---------------------------------------------------------------------------
   Adds reactive ambient wildlife to Night Shift.
     * Rats: Scurry around exterior grounds, near fences, bushes, trash, and doorways.
       Startle on player proximity, gunfire or explosions, squeaking and running into shadows.
     * Crows: Perched on roofs, fences, street lamps, and window sills.
       Caw and flap up into the dark foggy night sky when startled or flying in ambient flocks.
     * Sound: Procedural WebAudio sound effects (squeaks & caws).
*/
import * as THREE from "three";
import { Z, rr, pick, rnd } from "./zombies_state.js";
import { getMainCamera } from "./view3d.js";
import { interiorBounds } from "./zombies_world.js";

var RATS = [];
var CROWS = [];

/* ===========================================================================
   1. PROCEDURAL AUDIO (WebAudio Squeaks & Caws)
   =========================================================================== */
function getAudioCtx() {
  return (Z.audio && Z.audio.ctx && Z.audio.ctx.state === "running") ? Z.audio.ctx : null;
}

function spatialGain(x, y, z, maxDist) {
  var cam = getMainCamera();
  if (!cam) return 0;
  var d = Math.hypot(x - cam.position.x, y - cam.position.y, z - cam.position.z);
  if (d >= maxDist) return 0;
  return Math.max(0.02, (1 - d / maxDist) * 0.4);
}

function playRatSqueak(x, y, z) {
  var ctx = getAudioCtx();
  if (!ctx) return;
  var vol = spatialGain(x, y, z, 1400);
  if (vol <= 0.01) return;

  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();

  osc.type = "sine";
  var baseF = rr(2200, 2800);
  osc.frequency.setValueAtTime(baseF, now);
  osc.frequency.linearRampToValueAtTime(baseF + rr(600, 1100), now + 0.04);
  osc.frequency.exponentialRampToValueAtTime(baseF * 0.8, now + 0.11);

  gain.gain.setValueAtTime(vol * 0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.13);
}

function playCrowCaw(x, y, z) {
  var ctx = getAudioCtx();
  if (!ctx) return;
  var vol = spatialGain(x, y, z, 2200);
  if (vol <= 0.01) return;

  var now = ctx.currentTime;
  var osc = ctx.createOscillator();
  var filter = ctx.createBiquadFilter();
  var gain = ctx.createGain();

  osc.type = "sawtooth";
  var f0 = rr(380, 520);
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.linearRampToValueAtTime(f0 * 0.82, now + 0.24);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(850, now);
  filter.Q.setValueAtTime(3.5, now);

  gain.gain.setValueAtTime(vol * 0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.005, now + 0.26);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.27);
}

/* ===========================================================================
   2. PROCEDURAL 3D MODELS
   =========================================================================== */
function createRatMesh() {
  var g = new THREE.Group();
  var matBody = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.8, metalness: 0.1 });
  var matPink = new THREE.MeshStandardMaterial({ color: 0xc48c7e, roughness: 0.6 });
  var matEye = new THREE.MeshBasicMaterial({ color: 0xff2211 });

  // Body
  var body = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), matBody);
  body.scale.set(0.85, 0.75, 1.6);
  body.position.set(0, 1.1, 0);
  g.add(body);

  // Head & Snout
  var head = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 6), matBody);
  head.rotation.x = Math.PI * 0.5;
  head.position.set(0, 1.3, 1.9);
  g.add(head);

  // Nose tip
  var nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), matPink);
  nose.position.set(0, 1.25, 2.85);
  g.add(nose);

  // Ears
  var earL = new THREE.Mesh(new THREE.SphereGeometry(0.35, 5, 4), matPink);
  earL.position.set(-0.65, 1.8, 1.5);
  var earR = earL.clone();
  earR.position.x = 0.65;
  g.add(earL);
  g.add(earR);

  // Red Glinting Eyes
  var eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), matEye);
  eyeL.position.set(-0.42, 1.5, 2.2);
  var eyeR = eyeL.clone();
  eyeR.position.x = 0.42;
  g.add(eyeL);
  g.add(eyeR);

  // Tail
  var tail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.04, 4.5, 4), matPink);
  tail.rotation.x = Math.PI * 0.45;
  tail.position.set(0, 0.9, -3.2);
  g.add(tail);

  g.scale.set(1.6, 1.6, 1.6);
  return g;
}

function createCrowMesh() {
  var g = new THREE.Group();
  var matFeather = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.7, metalness: 0.2 });
  var matBeak = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: 0.4, metalness: 0.3 });

  // Torso
  var body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), matFeather);
  body.scale.set(0.8, 0.95, 1.6);
  body.position.set(0, 2.0, 0);
  g.add(body);

  // Head
  var head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), matFeather);
  head.position.set(0, 2.7, 1.2);
  g.add(head);

  // Beak
  var beak = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.3, 5), matBeak);
  beak.rotation.x = Math.PI * 0.45;
  beak.position.set(0, 2.65, 2.1);
  g.add(beak);

  // Wings (Hinged for flapping)
  var wingL = new THREE.Group();
  wingL.position.set(-1.1, 2.2, 0.2);
  var wMeshL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.4), matFeather);
  wMeshL.position.set(-1.2, 0, 0);
  wingL.add(wMeshL);
  g.add(wingL);

  var wingR = new THREE.Group();
  wingR.position.set(1.1, 2.2, 0.2);
  var wMeshR = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.4), matFeather);
  wMeshR.position.set(1.2, 0, 0);
  wingR.add(wMeshR);
  g.add(wingR);

  // Tail
  var tail = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 2.2), matFeather);
  tail.position.set(0, 1.7, -2.1);
  tail.rotation.x = -0.2;
  g.add(tail);

  g.userData.wingL = wingL;
  g.userData.wingR = wingR;

  g.scale.set(1.7, 1.7, 1.7);
  return g;
}

/* ===========================================================================
   3. CRITTER LIFECYCLE & AI
   =========================================================================== */
function getExteriorPoint() {
  var bounds = interiorBounds();
  var minx = bounds ? bounds.minx - 120 : -800;
  var maxx = bounds ? bounds.maxx + 120 : 800;
  var minz = bounds ? bounds.minz - 120 : -800;
  var maxz = bounds ? bounds.maxz + 120 : 800;

  var side = pick(["north", "south", "east", "west"]);
  var x = 0, z = 0;
  if (side === "north") { x = rr(minx - 200, maxx + 200); z = minz - rr(60, 400); }
  else if (side === "south") { x = rr(minx - 200, maxx + 200); z = maxz + rr(60, 400); }
  else if (side === "east") { x = maxx + rr(60, 400); z = rr(minz - 200, maxz + 200); }
  else { x = minx - rr(60, 400); z = rr(minz - 200, maxz + 200); }
  return { x: x, z: z };
}

export function initCritters() {
  clearCritters();
  if (!Z.grp) return;

  var n = (Z.renderQuality || 0) >= 2 ? 8 : (Z.renderQuality || 0) >= 1 ? 4 : 2;

  // --- 1. Rats
  for (var i = 0; i < n; i++) {
    var mesh = createRatMesh();
    Z.grp.add(mesh);
    var p = getExteriorPoint();
    mesh.position.set(p.x, 0, p.z);

    RATS.push({
      mesh: mesh,
      x: p.x,
      y: 0,
      z: p.z,
      targetX: p.x + rr(-200, 200),
      targetZ: p.z + rr(-200, 200),
      state: "scamper",
      speed: rr(25, 45),
      animT: rnd() * 10,
      timer: rr(1, 4),
    });
  }

  // --- 2. Crows
  for (var j = 0; j < n; j++) {
    var cMesh = createCrowMesh();
    Z.grp.add(cMesh);
    var cp = getExteriorPoint();
    var perchY = rr(120, 280);

    cMesh.position.set(cp.x, perchY, cp.z);
    cMesh.rotation.y = rnd() * Math.PI * 2;

    CROWS.push({
      mesh: cMesh,
      x: cp.x,
      y: perchY,
      z: cp.z,
      perchY: perchY,
      state: "perched",
      flyVx: 0,
      flyVy: 0,
      flyVz: 0,
      flapT: rnd() * 10,
      headT: rr(1, 3),
    });
  }
}

export function stepCritters(dt) {
  if (!Z.active || Z.paused) return;
  var px = Z.p ? Z.p.x : 0;
  var pz = Z.p ? Z.p.z : 0;

  // --- Update Rats ---
  for (var i = 0; i < RATS.length; i++) {
    var r = RATS[i];
    r.animT += dt * (r.state === "flee" ? 18 : 9);
    r.timer -= dt;

    var dPlayer = Math.hypot(r.x - px, r.z - pz);
    if (dPlayer < 180 && r.state !== "flee") {
      r.state = "flee";
      r.timer = 3.5;
      playRatSqueak(r.x, r.y, r.z);
      var dirX = (r.x - px) / (dPlayer || 1);
      var dirZ = (r.z - pz) / (dPlayer || 1);
      r.targetX = r.x + dirX * 350 + rr(-80, 80);
      r.targetZ = r.z + dirZ * 350 + rr(-80, 80);
    }

    if (r.state === "idle") {
      if (r.timer <= 0) {
        r.state = "scamper";
        r.timer = rr(2, 5);
        var np = getExteriorPoint();
        r.targetX = np.x;
        r.targetZ = np.z;
      }
    } else {
      var dx = r.targetX - r.x;
      var dz = r.targetZ - r.z;
      var dist = Math.hypot(dx, dz);
      var curSpeed = r.state === "flee" ? r.speed * 2.2 : r.speed;

      if (dist < 15 || r.timer <= 0) {
        if (r.state === "flee") {
          var resp = getExteriorPoint();
          r.x = resp.x; r.z = resp.z;
          r.state = "idle";
          r.timer = rr(2, 6);
        } else {
          r.state = "idle";
          r.timer = rr(1.5, 4);
        }
      } else {
        var vx = (dx / dist) * curSpeed;
        var vz = (dz / dist) * curSpeed;
        r.x += vx * dt;
        r.z += vz * dt;
        r.mesh.rotation.y = Math.atan2(vx, vz);
      }
    }

    r.mesh.position.set(r.x, 0, r.z);
    r.mesh.rotation.z = Math.sin(r.animT) * 0.08;
  }

  // --- Update Crows ---
  for (var j = 0; j < CROWS.length; j++) {
    var c = CROWS[j];
    c.flapT += dt;

    var dCam = Math.hypot(c.x - px, c.z - pz);
    if (dCam < 190 && c.state === "perched") {
      c.state = "takeoff";
      playCrowCaw(c.x, c.y, c.z);
      var escAng = Math.atan2(c.x - px, c.z - pz) + rr(-0.4, 0.4);
      c.flyVx = Math.sin(escAng) * rr(70, 110);
      c.flyVy = rr(80, 130);
      c.flyVz = Math.cos(escAng) * rr(70, 110);
    }

    if (c.state === "perched") {
      c.headT -= dt;
      if (c.headT <= 0) {
        c.headT = rr(1.5, 4.5);
        c.mesh.rotation.y += rr(-0.6, 0.6);
      }
      if (c.mesh.userData.wingL) c.mesh.userData.wingL.rotation.z = 0.2;
      if (c.mesh.userData.wingR) c.mesh.userData.wingR.rotation.z = -0.2;
    } else {
      c.x += c.flyVx * dt;
      c.y += c.flyVy * dt;
      c.z += c.flyVz * dt;

      var flap = Math.sin(c.flapT * 22) * 0.75;
      if (c.mesh.userData.wingL) c.mesh.userData.wingL.rotation.z = flap;
      if (c.mesh.userData.wingR) c.mesh.userData.wingR.rotation.z = -flap;

      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y = Math.atan2(c.flyVx, c.flyVz);

      if (c.y > 650 || Math.hypot(c.x - px, c.z - pz) > 1600) {
        var cp = getExteriorPoint();
        c.x = cp.x;
        c.z = cp.z;
        c.y = c.perchY;
        c.state = "perched";
        c.mesh.position.set(c.x, c.y, c.z);
      }
    }
  }
}

export function alertCritters(x, z, radius) {
  for (var i = 0; i < RATS.length; i++) {
    var r = RATS[i];
    if (Math.hypot(r.x - x, r.z - z) < radius * 1.2) {
      if (r.state !== "flee") {
        r.state = "flee";
        r.timer = 4.0;
        playRatSqueak(r.x, r.y, r.z);
        var dirX = (r.x - x) || 1;
        var dirZ = (r.z - z) || 1;
        r.targetX = r.x + dirX * 300;
        r.targetZ = r.z + dirZ * 300;
      }
    }
  }

  for (var j = 0; j < CROWS.length; j++) {
    var c = CROWS[j];
    if (Math.hypot(c.x - x, c.z - z) < radius * 1.5) {
      if (c.state === "perched") {
        c.state = "takeoff";
        playCrowCaw(c.x, c.y, c.z);
        var escAng = Math.atan2(c.x - x, c.z - z) + rr(-0.5, 0.5);
        c.flyVx = Math.sin(escAng) * rr(90, 140);
        c.flyVy = rr(90, 150);
        c.flyVz = Math.cos(escAng) * rr(90, 140);
      }
    }
  }
}

export function clearCritters() {
  RATS.forEach(function (r) {
    if (r.mesh && r.mesh.parent) r.mesh.parent.remove(r.mesh);
  });
  CROWS.forEach(function (c) {
    if (c.mesh && c.mesh.parent) c.mesh.parent.remove(c.mesh);
  });
  RATS = [];
  CROWS = [];
}
