/* Pure run rules shared by gameplay and behavioral tests. Units are cm. */
export function awardRunPoints(state, points) {
  state.score = (state.score || 0) + points;
  state.credits = (state.credits || 0) + points;
}

export function encounterCap(maxAlive, houseCap, phase) {
  const hardCap = Math.max(1, Math.min(maxAlive, houseCap));
  return phase === "lull" ? Math.max(1, hardCap - 3) : hardCap;
}

export function securedCount(targets, barricades) {
  return targets.filter(target => barricades.some(b =>
    Math.hypot(b.mx - target.x, b.mz - target.z) < 40 && b.hp >= b.maxHp * 0.75
  )).length;
}

// Flood-fill from the player's actual location; sample every edge so a narrow
// wall cannot be jumped by the navigation grid. Bounded work even on huge plans.
export function reachableFloor(start, bounds, isBlocked, inside, spacing = 40) {
  const points = [{ x: start.x, z: start.z, distance: 0, parent: -1 }];
  const seen = new Set(["0,0"]);
  const indices = [[0, 0]];
  for (let head = 0; head < points.length && points.length < 12000; head++) {
    const p = points[head], [ix, iz] = indices[head];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx, nz = iz + dz, key = nx + "," + nz;
      if (seen.has(key)) continue;
      const x = start.x + nx * spacing, z = start.z + nz * spacing;
      if (bounds && (x < bounds.minx || x > bounds.maxx || z < bounds.minz || z > bounds.maxz)) continue;
      if (!inside(x, z)) continue;
      let blocked = false;
      for (let k = 1; k <= 4; k++) {
        if (isBlocked(p.x + dx * spacing * k / 4, p.z + dz * spacing * k / 4)) { blocked = true; break; }
      }
      if (blocked) continue;
      seen.add(key);
      points.push({ x, z, distance: p.distance + spacing, parent: head });
      indices.push([nx, nz]);
    }
  }
  return points;
}

export function cameraPose(player, settings, motion, dt) {
  const approach = 1 - Math.exp(-10 * Math.min(0.1, Math.max(0, dt)));
  const body = settings.bodycam;
  const aim = player.aim ? 0.18 : 1;
  const bob = settings.bob * player.speedK * aim;
  const targetHeight = player.crouch ? 104 : body ? 145 : 162;
  motion.height = (motion.height ?? targetHeight) + (targetHeight - (motion.height ?? targetHeight)) * approach;
  const targetRoll = Math.max(-0.025, Math.min(0.025, -(player.lookDX || 0) * 0.002)) * settings.shake * aim;
  motion.roll = (motion.roll || 0) + (targetRoll - (motion.roll || 0)) * approach;
  return {
    height: motion.height + Math.sin(player.bob * 2) * (body ? 0.9 : 1.5) * bob,
    roll: (body ? motion.roll : 0) + Math.sin(player.bob) * 0.004 * bob,
    pitch: body ? Math.sin(player.bob * 2) * 0.0025 * bob : 0,
    fov: settings.fov - (player.aim ? 14 : 0) + (player.sprint ? 3 * settings.bob : 0),
  };
}
