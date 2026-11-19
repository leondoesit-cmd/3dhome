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

/* ---- navigation: a grid flow field toward the player ----------------------
   Zombies used to steer straight at the player with a few wall feelers, so a
   wall between rooms (or the house's outer wall, for the ones that spawn under
   a window) stopped them for good. The grid is built once per collision
   snapshot, a few rows per frame; the flow field is a cheap integer search
   from the player's cell. Window links let the undead climb in.            */
export function navGrid(bounds, spacing, margin) {
  const sp = spacing || 40, m = margin || 0;
  const ox = bounds.minx - m, oz = bounds.minz - m;
  const nx = Math.max(1, Math.ceil((bounds.maxx + m - ox) / sp) + 1);
  const nz = Math.max(1, Math.ceil((bounds.maxz + m - oz) / sp) + 1);
  const n = nx * nz;
  return {
    ox, oz, sp, nx, nz, row: 0, ready: false,
    free: new Uint8Array(n), right: new Uint8Array(n), down: new Uint8Array(n),
    links: new Map(),
  };
}

// Fills up to `rows` rows (free cells first, then the edges between them).
// isBlocked(x, z) answers for a body-sized probe. Returns true when complete.
export function navFillRows(grid, isBlocked, rows) {
  const { nx, nz, sp, ox, oz } = grid;
  for (let k = 0; k < rows && grid.row < nz * 2; k++, grid.row++) {
    const r = grid.row;
    if (r < nz) {
      for (let i = 0; i < nx; i++) grid.free[r * nx + i] = isBlocked(ox + i * sp, oz + r * sp) ? 0 : 1;
      continue;
    }
    const j = r - nz, z = oz + j * sp;
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i, x = ox + i * sp;
      if (!grid.free[c]) continue;
      if (i + 1 < nx && grid.free[c + 1] && !isBlocked(x + sp / 2, z)) grid.right[c] = 1;
      if (j + 1 < nz && grid.free[c + nx] && !isBlocked(x, z + sp / 2)) grid.down[c] = 1;
    }
  }
  grid.ready = grid.row >= nz * 2;
  return grid.ready;
}

export function navCell(grid, x, z) {
  const i = Math.round((x - grid.ox) / grid.sp), j = Math.round((z - grid.oz) / grid.sp);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) return -1;
  return j * grid.nx + i;
}

// The cell a body at (x, z) stands in, or its nearest free neighbour when the
// body hugs a wall and its own cell centre is inside the padding.
export function navNearestFree(grid, x, z) {
  const c = navCell(grid, x, z);
  if (c < 0) return -1;
  if (grid.free[c]) return c;
  const ci = c % grid.nx, cj = (c / grid.nx) | 0;
  let best = -1, bestD = Infinity;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= grid.nx || j >= grid.nz) continue;
    const k = j * grid.nx + i;
    if (!grid.free[k]) continue;
    const d = Math.hypot(grid.ox + i * grid.sp - x, grid.oz + j * grid.sp - z);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

// A one-way-or-both shortcut between two free cells (a window to climb).
export function navLink(grid, ax, az, bx, bz, cost, data) {
  const a = navNearestFree(grid, ax, az), b = navNearestFree(grid, bx, bz);
  if (a < 0 || b < 0 || a === b) return false;
  const add = (from, to, x, z) => {
    if (!grid.links.has(from)) grid.links.set(from, []);
    grid.links.get(from).push({ to, cost: Math.max(1, cost | 0), x, z, data });
  };
  add(a, b, bx, bz);
  add(b, a, ax, az);
  return true;
}

function forEachEdge(grid, c, fn) {
  const nx = grid.nx;
  if (grid.right[c]) fn(c + 1, 1, null);
  if (c % nx > 0 && grid.right[c - 1]) fn(c - 1, 1, null);
  if (grid.down[c]) fn(c + nx, 1, null);
  if (c >= nx && grid.down[c - nx]) fn(c - nx, 1, null);
  const links = grid.links.get(c);
  if (links) for (const l of links) fn(l.to, l.cost, l);
}

// Integer-cost shortest walk from (x, z) to every cell (Dial's buckets).
// -1 marks a cell the goal cannot be reached from.
export function navFlow(grid, x, z, out) {
  const n = grid.nx * grid.nz;
  const dist = out && out.length === n ? out : new Int32Array(n);
  dist.fill(-1);
  const goal = navNearestFree(grid, x, z);
  if (goal < 0) return dist;
  const buckets = [[goal]];
  dist[goal] = 0;
  for (let d = 0; d < buckets.length; d++) {
    const b = buckets[d];
    if (!b) continue;
    for (let q = 0; q < b.length; q++) {
      const c = b[q];
      if (dist[c] !== d) continue;
      forEachEdge(grid, c, (to, cost) => {
        const nd = d + cost;
        if (dist[to] !== -1 && dist[to] <= nd) return;
        dist[to] = nd;
        (buckets[nd] || (buckets[nd] = [])).push(to);
      });
    }
  }
  return dist;
}

// Where a body at (x, z) should walk next: `look` cells down the gradient,
// stopping early at a window link so the caller can play the climb.
export function navStep(grid, dist, x, z, look) {
  let c = navNearestFree(grid, x, z);
  if (c < 0 || dist[c] < 0) return null;
  if (dist[c] === 0) return null;
  for (let s = 0; s < (look || 2) && dist[c] > 0; s++) {
    let best = -1, bestD = dist[c], via = null;
    forEachEdge(grid, c, (to, cost, link) => {
      if (dist[to] < 0) return;
      // a link is worth taking only when it really is downhill by its cost
      if (dist[to] + cost - 1 < bestD) { bestD = dist[to] + cost - 1; best = to; via = link; }
    });
    if (best < 0) break;
    if (via) return { x: via.x, z: via.z, link: via, steps: dist[c] };
    c = best;
  }
  return { x: grid.ox + (c % grid.nx) * grid.sp, z: grid.oz + ((c / grid.nx) | 0) * grid.sp, link: null, steps: dist[c] };
}
