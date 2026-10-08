// Simultaneous assembly mate solver.
//
// Every mate is turned into a vector of residuals that should be zero, and the
// whole system is solved at once by damped Gauss-Newton — the same method the
// 2D sketch solver uses, over component poses instead of sketch points, with
// the numerics shared from core/least_squares.js.
//
// This replaced a solver that placed one component at a time and repeated the
// list until the poses stopped moving. That scheme could not help but depend on
// the order the mates were listed in, it needed a special case to settle a
// chain written back to front, and on a set of mates with no solution it left
// the components part-placed — poses that were then saved and re-solved, so an
// unsolvable assembly walked a little further on every rebuild. Solving the
// system as one gives an answer that is a function of the document alone: the
// same document solves to the same poses however its mates are ordered and
// however many times it is rebuilt.
//
// Three things fall out of the method that the old one could not do at all:
//
//  * Degrees of freedom. The rank of the Jacobian at the solution says how much
//    of the assembly is still free to move, per cluster and per component, so
//    the editor can say "this bracket can still slide and spin" rather than
//    only "solved" or "broken".
//
//  * Decomposition. Components that no chain of mates connects cannot affect
//    each other, so they are solved as separate systems. A dense solve costs
//    the cube of its variable count, which makes several small systems far
//    cheaper than one big one, and it means a cluster that cannot be solved
//    does not spoil the ones that can.
//
//  * Diagnosis rather than detection. A stalled solve is checked mate by mate,
//    and the system is rebuilt as the maximal consistent subset in newest-first
//    priority, so the assembly lands on the poses its newest mates ask for and
//    only the mates that actually conflict are named. A plain least-squares
//    answer would split the difference and satisfy neither.
//
// Directional mates move `b` and read `a`, preserving reference components.
// A lock instead joins a rigid group: either pick order permits the same motion,
// and a grounded or prescribed member anchors the entire connected group.

import {
  axisAngleMatrix, captureCoupledScrewZero, captureGearPhase, captureLockPose, lockTarget, createFrameResolver, mateFrameSupports, mateFramesSupport, mateRequirementFor, mateResidual,
  mateResidualVector, mateTarget, matrixEuler, mul, normalizePose, normalizeQuat, quatMatrix,
  rotationFromTo, rotationOf, rotationVectorMatrix, setRotation, transpose, apply, FRAME_ISSUE,
} from "./cad_mate_model.js";
import { gaussNewtonStep, normOf, stableColumnRank } from "./core/least_squares.js";
import { ASSEMBLY_ORIGIN_ID, assemblyOriginComponent } from "./core/assembly_structure.js";

const POSE_KEYS = ["x", "y", "z", "rx", "ry", "rz"];
const LEGACY_AXIS = { alignX: "x", alignY: "y", alignZ: "z", distanceX: "x" };

/* Rounded to a millionth of a micron, which is far below any length this
   editor can draw and far above the noise a numerical solve leaves behind. Two
   solves of the same document then agree bit for bit rather than in the first
   twelve digits, which is what makes a saved assembly stable: the document is
   compared, undone and re-solved by value. */
const quantize = (value) => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/* A quaternion's components are bounded by one, so the same numeric step is a
   far coarser angle here than it is on a length or on a degree: rounding them
   to 1e-9 moves the orientation by about 1e-7°, which is a hundred times
   blunter than the 1e-9° the Euler triple used to be rounded to. Three orders
   above the solve's own noise is all this has to be to absorb it. */
const quantizeQuat = (value) => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1e12) / 1e12;
  return Object.is(rounded, -0) ? 0 : rounded;
};

function normalizeTransform(component) {
  if (!component.transform) component.transform = {};
  return normalizePose(component.transform);
}

const poseOf = (component) => {
  const t = normalizeTransform(component);
  return { x: t.x, y: t.y, z: t.z, q: { ...t.q } };
};

const setPose = (component, pose) => {
  const t = normalizeTransform(component);
  t.x = pose.x; t.y = pose.y; t.z = pose.z;
  setRotation(t, quatMatrix(pose.q));
};

/* Mates in the order they are allowed to win. Legacy align/distance mates come
   first because they always lost to the topology mates when the old solver ran
   both — the loser of a contradiction is the earlier one, so listing them
   first keeps that. */
function orderedMates(assembly) {
  const legacy = (Array.isArray(assembly.mates) ? assembly.mates : [])
    .filter((mate) => LEGACY_AXIS[mate.type])
    .map((mate, index) => ({ id: mate.id || "legacy-" + index, legacy: true, mate }));
  const topology = (assembly.topologyMates || [])
    .filter((mate) => !mate.suppressed)
    .map((mate) => ({ id: mate.id, legacy: false, mate }));
  return legacy.concat(topology);
}

/* Everything the solver needs to know about one mate it has accepted: which
   components it reads and moves, and how many residual rows it contributes.
   A mate that cannot be applied at all never gets this far — it is reported as
   an issue instead, and neither of its components is moved on its account. */
function acceptMates(assembly, entries, byId, resolvedFrame, issues) {
  const accepted = [];
  for (const entry of entries) {
    const mate = entry.mate;
    const a = byId.get(entry.legacy ? mate.a : mate.a?.componentId);
    const b = byId.get(entry.legacy ? mate.b : mate.b?.componentId);
    if (!a || !b) { issues.push({ mate: entry.id, code: "missing-component" }); continue; }
    if (b.grounded && mate.type !== "lock") { issues.push({ mate: entry.id, code: "grounded-target" }); continue; }
    normalizeTransform(a); normalizeTransform(b);
    if (entry.legacy) { accepted.push({ ...entry, a, b, width: 1 }); continue; }
    if(mate.type==='lock'){
      captureLockPose(mate,a,b);accepted.push({...entry,a,b,width:12});continue;
    }
    const fa = resolvedFrame(mate.a, a, entry.id, true), fb = resolvedFrame(mate.b, b, entry.id, true);
    if (!fa || !fb) { issues.push({ mate: entry.id, code: "unresolved-topology" }); continue; }
    /* A symmetric mate also reads a third reference: the plane it mirrors
       across. It belongs to a component (or the assembly origin) that the mate
       reads but never moves. */
    let c = null, fc = null;
    if (mate.type === "symmetric") {
      c = byId.get(mate.c?.componentId);
      if (!c) { issues.push({ mate: entry.id, code: "missing-component" }); continue; }
      normalizeTransform(c);
      fc = resolvedFrame(mate.c, c, entry.id, true);
      if (!fc) { issues.push({ mate: entry.id, code: "unresolved-topology" }); continue; }
      if (!mateFrameSupports("planar", fc)) { issues.push({ mate: entry.id, code: FRAME_ISSUE.planar }); continue; }
    }
    /* Both references must carry what this kind of mate needs. The solver and
       the editor's mate buttons ask the same question, so a mate the buttons
       refuse cannot be built by SmartMate and then placed as something else. */
    const requirement = mateRequirementFor(mate.type);
    if (!mateFramesSupport(mate.type, fa, fb)) {
      issues.push({ mate: entry.id, code: FRAME_ISSUE[requirement] || "invalid-face-frame" });
      continue;
    }
    if (mate.type === "gear" || mate.type === "belt") captureGearPhase(mate, fa, fb, a, b);
    if (mate.type === "screw" && mate.coupledMotion) captureCoupledScrewZero(mate, fa, fb, a, b);
    const rows = mateResidualVector(mate, fa, fb, b, { fc, reader: a });
    if (!rows) { issues.push({ mate: entry.id, code: "unresolved-topology" }); continue; }
    accepted.push({ ...entry, a, b, c, width: rows.length });
  }
  return accepted;
}

/* Break the assembly into the smallest systems that can be solved one after
   another, and put them in the order they have to be solved in.
 *
 * A directional mate reads one component and moves another: the one
 * it moves depends on the one it reads. Follow those directions and most
 * assemblies fall apart into small pieces — a chain of forty brackets is forty
 * systems of six variables each, not one system of two hundred and forty, and a
 * dense solve costs the cube of its size. What does not fall apart is a loop,
 * where two components each depend on the other; those have to be solved
 * together, and that is exactly what a simultaneous solver is for. Rigid locks
 * also join both endpoints into one group so their selection order cannot add
 * an artificial fixed component or prevent motion through the lock chain.
 *
 * So: the strongly connected components of the dependency graph, in dependency
 * order. Every one is solved with the ones it depends on already in place, and
 * a loop is solved as one system. Components no chain of mates connects never
 * meet each other in this list at all, which is the other half of the saving.
 *
 * Tarjan's algorithm, which emits each group only after everything reachable
 * from it — the reverse of the order they must be solved in, hence the flip at
 * the end. */
function decompose(accepted) {
  const movable = new Map();
  for (const mate of accepted) {
    if (!mate.b.grounded && !movable.has(mate.b.id)) movable.set(mate.b.id, mate.b);
    if (mate.mate.type === "lock" && !mate.a.grounded && !movable.has(mate.a.id)) movable.set(mate.a.id, mate.a);
  }
  /* A source-only reference is deliberately stationary in a free directional
   * chain, so the picked reference leads and the target follows. Once that
   * chain joins a grounded mechanism, however, leaving the ungrounded source
   * out silently pins it in space. A spindle picked first for its bearing
   * mates then appears to ground the entire slide. Find grounded connections
   * before promoting only those source-only bodies into the physical solve. */
  const neighbours = new Map();
  for (const {a,b} of accepted) {
    if (!neighbours.has(a.id)) neighbours.set(a.id,new Set());
    if (!neighbours.has(b.id)) neighbours.set(b.id,new Set());
    neighbours.get(a.id).add(b.id);
    neighbours.get(b.id).add(a.id);
  }
  const anchored = new Set();
  const queue = [];
  for (const {a,b} of accepted) for (const component of [a,b]) if (component.grounded && !anchored.has(component.id)) {
    anchored.add(component.id);queue.push(component.id);
  }
  for(let at=0;at<queue.length;at++)for(const next of neighbours.get(queue[at])||[])if(!anchored.has(next)){
    anchored.add(next);queue.push(next);
  }
  const sourceOnly = new Set();
  for (const mate of accepted) {
    if (!mate.a.grounded && anchored.has(mate.a.id) && !movable.has(mate.a.id)) {
      movable.set(mate.a.id, mate.a);
      sourceOnly.add(mate.a.id);
    }
  }
  const edges = new Map([...movable.keys()].map((id) => [id, []]));
  for (const mate of accepted) {
    if (movable.has(mate.a.id) && movable.has(mate.b.id) && mate.a.id !== mate.b.id) {
      edges.get(mate.a.id).push(mate.b.id);
      if (mate.mate.type === "lock" || sourceOnly.has(mate.a.id)) edges.get(mate.b.id).push(mate.a.id);
    }
    if (mate.c && movable.has(mate.c.id) && mate.c.id !== mate.b.id) edges.get(mate.c.id).push(mate.b.id);
  }

  /* A grounded component closes a physical linkage even though it contributes
   * no variables. The directed dependency graph alone sees Ground -> Handle ->
   * Link -> Arm and Ground -> Arm as a chain, then solves the free handle before
   * the arm can pull it into loop closure. Find edges that lie on an undirected
   * cycle and let the movable members of that cycle solve together. Bridges
   * keep ordinary long assembly chains in their small, fast clusters. A shared
   * grounded bracket never joins two otherwise independent linkages. */
  const joints = [], cycleNeighbours = new Map(), seenJoints = new Set();
  const addNeighbour = (from, to, edge) => {
    if (!cycleNeighbours.has(from)) cycleNeighbours.set(from, []);
    cycleNeighbours.get(from).push({ to, edge });
  };
  for (const { a, b } of accepted) {
    if (a.id === b.id) continue;
    const pair = [a.id, b.id].sort();
    const key = JSON.stringify(pair);
    if (seenJoints.has(key)) continue; // concentric + axial face is one hinge
    seenJoints.add(key);
    const edge = joints.length;
    joints.push({ a: a.id, b: b.id });
    addNeighbour(a.id, b.id, edge);
    addNeighbour(b.id, a.id, edge);
  }
  const visited = new Map(), lowLink = new Map(), bridges = new Set();
  let visitIndex = 0;
  for (const root of cycleNeighbours.keys()) {
    if (visited.has(root)) continue;
    visited.set(root, visitIndex); lowLink.set(root, visitIndex++);
    const work = [{ node: root, parent: null, incoming: -1, next: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      const edge = cycleNeighbours.get(frame.node)[frame.next++];
      if (edge) {
        if (edge.edge === frame.incoming) continue;
        if (!visited.has(edge.to)) {
          visited.set(edge.to, visitIndex); lowLink.set(edge.to, visitIndex++);
          work.push({ node: edge.to, parent: frame.node, incoming: edge.edge, next: 0 });
        } else {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node), visited.get(edge.to)));
        }
        continue;
      }
      work.pop();
      if (frame.parent !== null) {
        lowLink.set(frame.parent, Math.min(lowLink.get(frame.parent), lowLink.get(frame.node)));
        if (lowLink.get(frame.node) > visited.get(frame.parent)) bridges.add(frame.incoming);
      }
    }
  }
  joints.forEach(({ a, b }, edge) => {
    if (bridges.has(edge) || !movable.has(a) || !movable.has(b)) return;
    edges.get(a).push(b);
    edges.get(b).push(a);
  });

  const index = new Map(), low = new Map(), onStack = new Set(), stack = [], groups = [];
  let counter = 0;
  for (const root of movable.keys()) {
    if (index.has(root)) continue;
    // Iterative, because an assembly deep enough to overflow the call stack is
    // a bad way to find out that the walk was recursive.
    const work = [{ node: root, edge: 0 }];
    index.set(root, counter); low.set(root, counter++); stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1], next = edges.get(frame.node)[frame.edge++];
      if (next !== undefined) {
        if (!index.has(next)) {
          index.set(next, counter); low.set(next, counter++); stack.push(next); onStack.add(next);
          work.push({ node: next, edge: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node), index.get(next)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1].node;
        low.set(parent, Math.min(low.get(parent), low.get(frame.node)));
      }
      if (low.get(frame.node) === index.get(frame.node)) {
        const group = [];
        for (;;) {
          const id = stack.pop();
          onStack.delete(id);
          group.push(movable.get(id));
          if (id === frame.node) break;
        }
        groups.push(group);
      }
    }
  }

  groups.reverse();
  const home = new Map();
  groups.forEach((group, i) => group.forEach((component) => home.set(component.id, i)));
  const clusters = groups.map((group) => ({ components: group, mates: [], sourceOnly }));
  for (const mate of accepted) {
    const owner = home.get(mate.b.id) ?? home.get(mate.a.id);
    if (owner !== undefined) clusters[owner].mates.push(mate);
    else clusters.push({components: [], mates: [mate]});
  }
  return clusters;
}

/* Damped Gauss-Newton over one cluster of components.
 *
 * Each movable component contributes six variables: three for where it is, and
 * three for a rotation vector — an axis whose length is the angle turned about
 * it — applied to the orientation it had when the run started. Euler angles are
 * what the document stores, but they are a poor thing to differentiate: near a
 * quarter turn about the middle axis two of the three angles describe the same
 * motion, and a solver that steps them there goes wild. A rotation vector has
 * no such point anywhere in the range a mate can ask for, and the pose is
 * written back out as Euler angles at every probe. */
function runCluster(cluster, resolvedFrame, settings) {
  const components = cluster.components;
  const bases = components.map((component) => ({
    rotation: rotationOf(component.transform),
    x: component.transform.x, y: component.transform.y, z: component.transform.z,
  }));
  const width = cluster.mates.reduce((sum, mate) => sum + mate.width, 0);
  const variables = components.length * 6;

  const writePose = (vector) => {
    components.forEach((component, index) => {
      const base = bases[index], offset = index * 6;
      const turn = rotationVectorMatrix({ x: vector[offset+3], y: vector[offset+4], z: vector[offset+5] });
      const t = component.transform;
      t.x = base.x + vector[offset]; t.y = base.y + vector[offset+1]; t.z = base.z + vector[offset+2];
      /* The pose the probe asked for, kept whole. This is the step that used
         to round-trip through Euler angles and lose its accuracy at the poles
         (see the note at the head of cad_mate_model.js). */
      setRotation(t, mul(turn, base.rotation));
    });
  };

  const rowsOf = (entry) => entry.legacy ? legacyRows(entry) : mateResidualVector(entry.mate,
    resolvedFrame(entry.mate.a, entry.a, entry.id, false),
    resolvedFrame(entry.mate.b, entry.b, entry.id, false), entry.b, mateContext(entry, resolvedFrame));

  const residualsOf = () => {
    const out = [];
    for (const entry of cluster.mates) {
      const rows = rowsOf(entry);
      for (let i = 0; i < entry.width; i++) out.push(rows && Number.isFinite(rows[i]) ? rows[i] : 0);
    }
    return out;
  };

  const evaluate = (vector) => { writePose(vector); return residualsOf(); };

  /* Which rows each component can move, so a Jacobian does not re-measure the
     whole assembly once per variable. A mate's residuals depend on the two
     components it reads and moves and on nothing else, so a column belonging to
     some other component is zero without being measured. On a chain of forty
     components that is the difference between forty mates re-measured 480 times
     and two of them re-measured 480 times. */
  const index = new Map(components.map((component, i) => [component.id, i]));
  const touching = components.map(() => []);
  let offset = 0;
  for (const entry of cluster.mates) {
    const rows = { entry, offset };
    const a = index.get(entry.a.id), b = index.get(entry.b.id), c = entry.c ? index.get(entry.c.id) : undefined;
    if (a !== undefined) touching[a].push(rows);
    if (b !== undefined && b !== a) touching[b].push(rows);
    if (c !== undefined && c !== a && c !== b) touching[c].push(rows);
    offset += entry.width;
  }

  const sparseJacobian = (vector, base) => {
    const J = Array.from({ length: base.length }, () => Array(variables).fill(0));
    for (let component = 0; component < components.length; component++) {
      for (let axis = 0; axis < 6; axis++) {
        const column = component * 6 + axis, old = vector[column];
        const h = Math.max(1e-5, Math.abs(old) * 1e-6);
        vector[column] = old + h;
        writePose(vector);
        const plus = touching[component].map((row) => rowsOf(row.entry));
        vector[column] = old - h;
        writePose(vector);
        const minus = touching[component].map((row) => rowsOf(row.entry));
        vector[column] = old;
        touching[component].forEach((row, i) => {
          for (let k = 0; k < row.entry.width; k++) {
            const up = plus[i] && Number.isFinite(plus[i][k]) ? plus[i][k] : 0;
            const down = minus[i] && Number.isFinite(minus[i][k]) ? minus[i][k] : 0;
            J[row.offset + k][column] = (up - down) / (2 * h);
          }
        });
      }
    }
    writePose(vector);
    return J;
  };

  const vector = new Array(variables).fill(0);
  let residual = evaluate(vector), error = normOf(residual);
  let damping = 1e-4, iterations = 0, flat = 0;
  // Convergence is per residual, independent of how many redundant rows an
  // assembly contains. The least-squares objective still uses the L2 norm.
  // Summing hundreds of individually sub-tolerance saved-pose roundoff rows
  // can otherwise exhaust a valid closed loop and falsely drop a mate.
  const withinTolerance = rows => rows.every(value => Math.abs(value) < settings.tolerance);
  let converged = withinTolerance(residual), stalled = false;
  for (; iterations < settings.maxIterations && variables && width && !converged && !stalled; iterations++) {
    const J = sparseJacobian(vector, residual);
    const step = gaussNewtonStep(J, residual, damping);
    const previous = vector.slice();
    for (let i = 0; i < variables; i++) vector[i] += step[i];
    const next = evaluate(vector), nextError = normOf(next);
    if (nextError > error) {
      for (let i = 0; i < variables; i++) vector[i] = previous[i];
      evaluate(vector);
      damping *= 10;
      /* Steps this small have stopped buying anything. */
      if (damping > 1e12) stalled = true;
      continue;
    }
    const gain = error - nextError;
    residual = next; error = nextError; damping = Math.max(1e-12, damping * 0.35);
    rebaseline(components, bases, vector);
    residual = evaluate(vector);
    if (withinTolerance(residual)) { converged = true; break; }
    /* Steps that are still accepted but no longer buy anything: the solve has
       reached the closest it can come, which is what a set of mates that
       contradict each other looks like from inside. Left to run it would use
       every iteration it is allowed and then report having run out of them,
       which reads as "too hard" when the truth is "impossible". */
    flat = gain <= Math.max(1e-14, error * 1e-10) ? flat + 1 : 0;
    if (flat >= 3) stalled = true;
  }
  if (!width || !variables) converged = true;
  const outcome = converged ? "converged" : stalled ? "stalled" : "exhausted";

  const jacobian = variables && width ? sparseJacobian(vector, residual) : [];
  /* Rounded once, at the end, and the readable triple re-derived from the
     rounded quaternion rather than rounded beside it: quantising the two
     independently is how a mirror stops mirroring. */
  components.forEach((component) => {
    const t = component.transform;
    for (const key of ["x", "y", "z"]) t[key] = quantize(t[key]);
    const quat = normalizeQuat(t.q);
    t.q = { x: quantizeQuat(quat.x), y: quantizeQuat(quat.y), z: quantizeQuat(quat.z), w: quantizeQuat(quat.w) };
    const euler = matrixEuler(quatMatrix(t.q));
    t.rx = quantize(euler.rx); t.ry = quantize(euler.ry); t.rz = quantize(euler.rz);
  });
  return { converged, outcome, iterations, error, jacobian, variables };
}

/* A rotation vector describes the same turn as one 2π shorter, and the further
   it is from zero the more the step and the turn it produces come apart. After
   an accepted step, any component turned more than a quarter circle has its
   turn folded into the orientation the run measures from and its rotation
   variables set back to zero. The pose is untouched — only the way it is
   written down changes — so the search carries on from where it was. */
function rebaseline(components, bases, vector) {
  components.forEach((component, index) => {
    const offset = index * 6;
    const turn = { x: vector[offset+3], y: vector[offset+4], z: vector[offset+5] };
    if (Math.hypot(turn.x, turn.y, turn.z) < Math.PI / 2) return;
    bases[index].rotation = mul(rotationVectorMatrix(turn), bases[index].rotation);
    vector[offset+3] = 0; vector[offset+4] = 0; vector[offset+5] = 0;
  });
}

/* A starting orientation for the solve.
 *
 * Newton's method follows the slope of the residuals, and an orientation that
 * is exactly wrong has none to follow: two directions a half circle apart are
 * as far from each other as they can get, so every way of turning one towards
 * the other looks equally good and a step measures zero. It is also an ordinary
 * thing to ask for — two flat faces that both point up, mated face to face,
 * start exactly there — and the same applies to a screw asked for half a turn.
 *
 * So each mate turns the component it moves onto the orientation it asks for
 * before the solve begins, taking the mates in order. This is a guess, not the
 * answer: it ignores that the same component may be turned by several mates at
 * once, which is the part only solving the system together can settle. What it
 * guarantees is that the solve starts somewhere it can move away from. A pose
 * that already satisfies its mates is turned by nothing, so seeding a solved
 * assembly changes it not at all. */
function seedCluster(cluster, resolvedFrame) {
  const turn = (component, axis, angle) => {
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-12) return;
    setRotation(component.transform, mul(axisAngleMatrix(axis, angle), rotationOf(component.transform)));
  };
  const targetFor = (entry) => mateTarget(entry.mate,
    resolvedFrame(entry.mate.a, entry.a, entry.id, false),
    resolvedFrame(entry.mate.b, entry.b, entry.id, false), entry.b, entry.a);
  const movable=new Set(cluster.components.map(c=>c.id));
  // Seed rigid followers outward from grounded or motor-prescribed members.
  // Either selection order describes the same physical lock relation.
  const held = new Set();
  const locks = cluster.mates.filter(entry => entry.mate.type === "lock");
  for (const entry of locks) for (const component of [entry.a, entry.b])
    if (!movable.has(component.id)) held.add(component.id);
  const seededLocks = new Set();
  for (let pass = 0; pass < locks.length; pass++) {
    let advanced = false;
    for (const entry of locks) {
      const aHeld = held.has(entry.a.id), bHeld = held.has(entry.b.id);
      if (aHeld === bHeld) continue;
      const moving = aHeld ? entry.b : entry.a;
      if (!movable.has(moving.id)) continue;
      let target;
      if (aHeld) target = lockTarget(entry.mate, entry.a);
      else {
        const relative = entry.mate.relativePose;
        const rotation = mul(rotationOf(entry.b.transform), transpose(relative.rotation));
        const delta = apply(rotation, relative.position), b = entry.b.transform;
        target = {rotation, position: {x:b.x-delta.x, y:b.y-delta.y, z:b.z-delta.z}};
      }
      if (target) { Object.assign(moving.transform, target.position); setRotation(moving.transform, target.rotation); }
      held.add(moving.id); seededLocks.add(entry.id); advanced = true;
    }
    if (!advanced) break;
  }
  const heldDirections=new Map();
  for (const entry of cluster.mates) {
    if (entry.legacy || !movable.has(entry.b.id)) continue;
    if(entry.mate.type==='lock'){
      if (seededLocks.has(entry.id) || held.has(entry.b.id)) continue;
      const target=lockTarget(entry.mate,entry.a);
      if(target){Object.assign(entry.b.transform,target.position);setRotation(entry.b.transform,target.rotation);}
      continue;
    }
    const target = targetFor(entry);
    if (!target || !target.direction) continue;
    const swing = rotationFromTo(target.actualDirection, target.direction);
    // An angle's azimuth is free, but a preceding hinge axis is not. At
    // parallel/opposed plane normals the generic azimuth seed can tilt that
    // axis and strand Newton at a half turn. Seed around the held hinge instead.
    if (target.angle !== undefined) {
      const dot3 = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
      const anchor=(heldDirections.get(entry.b.id)||[]).find(direction =>
        Math.abs(dot3(direction,target.fixedDirection))<1e-6 &&
        Math.abs(dot3(direction,target.actualDirection))<1e-6);
      if (anchor) {
        const a=target.fixedDirection, b=target.actualDirection;
        const cross={x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};
        const current=Math.atan2(dot3(anchor,cross),dot3(a,b));
        swing.axis=anchor;
        swing.angle=(current<0?-1:1)*target.desiredAngle-current;
      }
    }
    /* A half turn has infinitely many valid axes. If an earlier mate already
       aligned a perpendicular direction on this component, use that direction
       as the axis: it stays fixed while the new one flips. The arbitrary first
       axis otherwise breaks the earlier mate and can leave Newton at another
       exact half turn with zero slope. This occurs when an assembly was saved
       after a conflicting face mate and that mate is later removed or flipped. */
    if (Math.abs(swing.angle - Math.PI) < 1e-7) {
      const anchor=(heldDirections.get(entry.b.id)||[]).find((direction) =>
        Math.abs(direction.x*target.direction.x + direction.y*target.direction.y + direction.z*target.direction.z) < 1e-6);
      if (anchor) swing.axis=anchor;
    }
    turn(entry.b, swing.axis, swing.angle);
    if (!heldDirections.has(entry.b.id)) heldDirections.set(entry.b.id, []);
    heldDirections.get(entry.b.id).push(target.direction);
    if(entry.mate.type==="tangent" && !target.tangentPlane){
      const fa=resolvedFrame(entry.mate.a,entry.a,entry.id,false), fb=resolvedFrame(entry.mate.b,entry.b,entry.id,false);
      const axis=target.direction, delta={x:fb.origin.x-fa.origin.x,y:fb.origin.y-fa.origin.y,z:fb.origin.z-fa.origin.z};
      const along=delta.x*axis.x+delta.y*axis.y+delta.z*axis.z;
      if(Math.hypot(delta.x-axis.x*along,delta.y-axis.y*along,delta.z-axis.z*along)<1e-8){
        // At coincident axes radial distance has no derivative. Seed only this
        // singular pose; a valid tangent contact keeps its azimuth and height.
        const seeded=targetFor(entry);
        for(const key of ["x","y","z"])entry.b.transform[key]+=seeded.origin[key]-fb.origin[key];
      }
    }
    // The roll is measured about the mate axis, so it is only meaningful once
    // the component is on that axis — hence a second reading after the swing.
    if (target.roll === undefined) continue;
    const rolled = targetFor(entry);
    if (rolled && rolled.roll !== undefined) turn(entry.b, target.direction, -rolled.roll);
  }
}

function legacyRows(entry) {
  const axis = LEGACY_AXIS[entry.mate.type];
  const offset = entry.mate.type === "distanceX" && Number.isFinite(Number(entry.mate.value))
    ? Number(entry.mate.value) : 0;
  return [entry.b.transform[axis] - entry.a.transform[axis] - offset];
}

function measure(entry, resolvedFrame) {
  if (entry.legacy) return { linear: Math.abs(legacyRows(entry)[0]), angular: 0 };
  return mateResidual(entry.mate,
    resolvedFrame(entry.mate.a, entry.a, entry.id, false),
    resolvedFrame(entry.mate.b, entry.b, entry.id, false), entry.b, mateContext(entry, resolvedFrame));
}

/* What a mate reads besides its two references: the mirror plane of a symmetric
   mate, and the driving component of a gear mate (whose roll is a property of
   the component rather than of a face). */
function mateContext(entry, resolvedFrame) {
  return {
    reader: entry.a,
    fc: entry.c ? resolvedFrame(entry.mate.c, entry.c, entry.id, false) : null,
  };
}

/* Which mates the poses on the table do not honour. Measured from the frames as
   they finally stand rather than from what the solve thought it was doing. */
function violations(mates, resolvedFrame, settings) {
  const out = [];
  for (const entry of mates) {
    const residual = measure(entry, resolvedFrame);
    if (!residual) continue;
    if (residual.linear > settings.linearTolerance || residual.angular > settings.angularTolerance) {
      out.push({ entry, residual });
    }
  }
  return out;
}

/* How much of a solved cluster is still free to move, and which component
   holds that freedom.
   The rank of the Jacobian counts the freedoms the mates take away; a
   component's own share is what the rank loses when its six columns go. */
function analyzeFreedom(cluster, run) {
  // A travel stop rejects an overshoot but still permits returning into the
  // interval. Its positional residual is needed for solving, not an equality
  // that removes sliding freedom. Retain its orientation rows and retain all
  // rows when the two stops coincide (a fixed distance).
  const boundedRows=new Set();
  const rigidRotationRows=[];
  let offset=0;
  for(const entry of cluster.mates){
    const mate=entry.mate;
    if(!entry.legacy && mate.type==='limit' && Number(mate.min)<Number(mate.max))
      for(let row=0;row<Math.min(3,entry.width);row++)boundedRows.add(offset+row);
    // An angle range is the same inequality: it removes no freedom inside its interval.
    if(!entry.legacy && mate.type==='angle' && Number(mate.angleMin)<Number(mate.angleMax))
      for(let row=0;row<entry.width;row++)boundedRows.add(offset+row);
    if (!entry.legacy && mate.type === "lock") {
      // Nine matrix entries describe only three rotational constraints. Map
      // their derivatives to the local angular vector before the rank walk;
      // otherwise near-zero diagonal rows magnify numerical noise when scaled.
      const rotation = rotationOf(entry.b.transform);
      const pairs = [[2,1],[0,2],[1,0]];
      for (const [a,b] of pairs) {
        const row = Array(run.variables).fill(0);
        for (let column=0; column<run.variables; column++) for (let j=0; j<3; j++)
          row[column] += (run.jacobian[offset+3+a*3+j][column]*rotation[b][j]
            -run.jacobian[offset+3+b*3+j][column]*rotation[a][j])/2;
        rigidRotationRows.push(row);
      }
      for (let row=3; row<entry.width; row++) boundedRows.add(offset+row);
    }
    offset+=entry.width;
  }
  const jacobian=run.jacobian.filter((_row,index)=>!boundedRows.has(index)).concat(rigidRotationRows);
  const rank = jacobian.length ? stableColumnRank(jacobian) : 0;
  const report = {
    components: cluster.components.map((component) => component.id),
    variableCount: run.variables, rank, degreesOfFreedom: Math.max(0, run.variables - rank),
    iterations: run.iterations, converged: run.converged, perComponent: {},
  };
  if (run.variables && run.variables <= 60 && jacobian.length) {
    cluster.components.forEach((component, index) => {
      const without = jacobian.map((row) => row.filter((_, column) => column < index * 6 || column >= index * 6 + 6));
      report.perComponent[component.id] = Math.max(0, 6 - (rank - stableColumnRank(without)));
    });
  }
  return report;
}

/* One cluster, solved and — if its mates contradict each other — reduced to
   the maximal consistent subset in priority order. Newest mates are admitted
   first; each older mate is kept if it can coexist with everything newer and
   rejected otherwise. This distinction matters when an old and a new mate
   agree with each other but a mate between them disagrees: dropping whichever
   residual a least-squares compromise happens to violate first would falsely
   reject the agreeing old mate too.

   The common, consistent case still costs one solve. Only a failed cluster
   takes the diagnostic path, and every trial starts from the poses the cluster
   came in with so the outcome depends on the mates rather than the attempts. */
function solveCluster(cluster, resolvedFrame, settings) {
  const startingPoses = cluster.components.map(poseOf);
  const restore = () => cluster.components.forEach((component, index) => setPose(component, startingPoses[index]));
  /* Only components some active mate moves get variables. A component that is
     merely read by the mates that are left has to stay where it is: dropping a
     mate must not free the component that mate used to move, or an assembly
     would rearrange itself around a mate it had already given up on. */
  const movers = (mates) => {
    const moved = new Set(mates.flatMap((entry) => entry.mate.type === "lock" ? [entry.a.id, entry.b.id] :
      cluster.sourceOnly?.has(entry.a.id) ? [entry.a.id, entry.b.id] : [entry.b.id]));
    return cluster.components.filter((component) => moved.has(component.id));
  };
  const tryMates = (mates) => {
    restore();
    const system = { components: movers(mates), mates };
    seedCluster(system, resolvedFrame);
    const run = runCluster(system, resolvedFrame, settings);
    const broken = violations(mates, resolvedFrame, settings);
    // Quantized saved poses can stall below the physical mate tolerances while
    // remaining above the optimizer's much smaller objective threshold. A
    // measured, settled answer is usable; an exhausted search still is not.
    const accepted = !broken.length && (run.converged || run.outcome === "stalled");
    return { system, run, accepted };
  };

  let final = tryMates(cluster.mates);
  if (final.accepted) {
    return { run: final.run, dropped: [], freedom: analyzeFreedom(final.system, final.run) };
  }

  /* Newest first, so `kept` grows towards the oldest mate. Unshifting leaves
     it in the cluster's own order, which is what the next trial re-solves. */
  const kept = [], rejected = new Map();
  for (let index = cluster.mates.length - 1; index >= 0; index--) {
    const candidate = cluster.mates[index];
    const trial = tryMates([candidate].concat(kept));
    if (trial.accepted) kept.unshift(candidate);
    else {
      /* Exhaustion says only that this numerical solve could not establish an
         answer. A stalled solve with measured violations is the ordinary
         signature of contradictory mates. */
      rejected.set(candidate, trial.run.outcome === "exhausted" ? "non-convergent" : "over-constrained");
    }
  }
  final = tryMates(kept);
  const dropped = cluster.mates.filter((entry) => rejected.has(entry))
    .map((entry) => ({ entry, code: rejected.get(entry) }));
  return { run: final.run, dropped, freedom: analyzeFreedom(final.system, final.run) };
}

export function solveAssemblyMates(assembly, options = {}) {
  const settings = {
    tolerance: Number(options.tolerance) || 1e-11,
    maxIterations: Math.max(1, Math.round(Number(options.maxIterations) || 120)),
    linearTolerance: Number(options.linearTolerance) || 1e-3,
    angularTolerance: Number(options.angularTolerance) || 1e-4,
  };
  const sink = { issues: [], rebindings: [] };
  const resolvedFrame = createFrameResolver(sink);
  const components = assembly.components || [];
  const byId = new Map(components.map((component) => [component.id, component]));
  /* The assembly's own Front, Top and Right planes (book steps 162–166): a
     grounded frame at the origin, added only when a mate names it, and always
     the side a mate reads rather than the side it moves. */
  if ((assembly.topologyMates || []).some((mate) => mate?.a?.componentId === ASSEMBLY_ORIGIN_ID || mate?.b?.componentId === ASSEMBLY_ORIGIN_ID || mate?.c?.componentId === ASSEMBLY_ORIGIN_ID)) {
    byId.set(ASSEMBLY_ORIGIN_ID, assemblyOriginComponent());
  }
  components.forEach(normalizeTransform);
  /* Kept for callers that place components of their own before a solve. It
     used to run at the head of every pass because the old align/distance mates
     were applied by hand there; those are residuals in the system now, so once
     is enough and the hook is only a seed for the starting pose. */
  if (typeof options.beforePass === "function") options.beforePass();

  const accepted = acceptMates(assembly, orderedMates(assembly), byId, resolvedFrame, sink.issues);
  const clusters = decompose(accepted);
  const prescribed=new Set(options.fixedComponentIds||[]);
  for(const cluster of clusters)cluster.components=cluster.components.filter(c=>!prescribed.has(c.id));
  const unsatisfied = [], reports = [];
  let settled = true, passes = 1;

  for (const cluster of clusters) {
    const solved = solveCluster(cluster, resolvedFrame, settings);
    passes = Math.max(passes, solved.run.iterations + 1);
    reports.push(solved.freedom);
    if (!solved.run.converged) settled = false;
    for (const loser of solved.dropped) {
      const residual = measure(loser.entry, resolvedFrame) || { linear: 0, angular: 0 };
      unsatisfied.push({
        mate: loser.entry.id, code: loser.code, linear: residual.linear, angular: residual.angular,
      });
    }
  }

  /* Everything that survived is measured once more against the poses as they
     finally stand. A mate can be honoured by the solve and still be wrong here
     if another cluster's answer moved the component it reads. */
  const dropped = new Set(unsatisfied.map((issue) => issue.mate));
  for (const entry of accepted) {
    if (dropped.has(entry.id)) continue;
    const residual = measure(entry, resolvedFrame);
    if (!residual) continue;
    if (residual.linear > settings.linearTolerance || residual.angular > settings.angularTolerance) {
      unsatisfied.push({ mate: entry.id, code: "over-constrained", linear: residual.linear, angular: residual.angular });
    }
  }

  const degreesOfFreedom = reports.reduce((sum, report) => sum + report.degreesOfFreedom, 0);
  return {
    ok: !sink.issues.length && !unsatisfied.length,
    issues: sink.issues, rebindings: sink.rebindings, unsatisfied, settled, passes,
    clusters: reports, degreesOfFreedom,
  };
}
