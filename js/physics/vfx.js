import * as THREE from "three";
import { ctx } from "./registry.js";

const sharedGeom = new THREE.BoxGeometry(2, 2, 2);

export function spawnParticles(position, color, count, container) {
  const mat = new THREE.MeshBasicMaterial({ color: color });
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(sharedGeom, mat);
    mesh.position.copy(position);
    mesh.position.x += (Math.random() - 0.5) * 10;
    mesh.position.y += (Math.random() - 0.5) * 10;
    mesh.position.z += (Math.random() - 0.5) * 10;
    if (container) {
      mesh.updateMatrixWorld(true);
      container.attach(mesh);
      mesh.updateMatrixWorld(true);
    }
    ctx.particles.push({
      mesh: mesh,
      material: mat,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 500,
        Math.random() * 500,
        (Math.random() - 0.5) * 500,
      ),
      life: 1000 + Math.random() * 1000,
    });
  }
}

export function stepParticles(dt) {
  for (let i = ctx.particles.length - 1; i >= 0; i--) {
    const p = ctx.particles[i];
    p.life -= dt * 1000;
    if (p.life <= 0) {
      if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
      ctx.particles.splice(i, 1);
    } else {
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= 981 * dt;
      p.mesh.scale.multiplyScalar(Math.exp(-1.212 * dt));
    }
  }
}

export function clearParticles() {
  ctx.particles.forEach(p => {
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
  });
  ctx.particles = [];
}
