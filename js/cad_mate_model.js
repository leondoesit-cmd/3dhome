// Assembly mate data model: what a mate references, what geometry each kind of
// mate needs, and how far a mate is from being honoured.
//
// Everything here is a pure reading of the assembly — no component is moved by
// anything in this file. cad_mate_solver.js does the moving, and cad_mates.js
// is the public face both the editor and the tests import. The split exists so
// the solver can measure mates without importing the module that exposes the
// solver.

import { createTopologyRegistry, resolveTopologyReference } from "./core/topology.js";
import { componentTopology, isStandardPlaneId, isSubassembly, standardPlaneEntries } from "./core/assembly_structure.js";

export const rad = (d) => d * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;
export const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
export const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
export const len = (v) => Math.hypot(v.x,v.y,v.z);
export const norm = (v) => { const l=len(v) || 1; return {x:v.x/l,y:v.y/l,z:v.z/l}; };

export const identity = () => [[1,0,0],[0,1,0],[0,0,1]];
export const mul = (a,b) => a.map((row)=>b[0].map((_,column)=>row[0]*b[0][column]+row[1]*b[1][column]+row[2]*b[2][column]));
export const apply = (matrix,vector) => ({
  x:matrix[0][0]*vector.x+matrix[0][1]*vector.y+matrix[0][2]*vector.z,
  y:matrix[1][0]*vector.x+matrix[1][1]*vector.y+matrix[1][2]*vector.z,
  z:matrix[2][0]*vector.x+matrix[2][1]*vector.y+matrix[2][2]*vector.z,
});
export const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
export const transpose = (m) => [[m[0][0],m[1][0],m[2][0]],[m[0][1],m[1][1],m[2][1]],[m[0][2],m[1][2],m[2][2]]];

// Each requirement keeps reporting under the code its own branch always used.
export const FRAME_ISSUE = { planar: "invalid-face-frame", axis: "invalid-axis-frame", round: "invalid-tangent-frame", tangent: "invalid-tangent-frame" };

const finitePoint = (point) => !!point && [point.x, point.y, point.z]
  .every((value) => Number.isFinite(Number(value)));
const finiteDirection = (direction) => finitePoint(direction) && len(direction) > 1e-9;

/* What each kind of mate needs from a reference before it can be placed at
   all. The editor asks this before offering a mate and the solver asks it
   before applying one, so the button gate and the solver cannot disagree about
   what is matable: a normal alone is not a planar face, an axis with nowhere
   to be is not an axis, and nothing can be placed without an origin. */
export const MATE_REQUIREMENT = {
  coincident: "planar", distance: "planar", limit: "planar", angle: "planar",
  concentric: "axis", screw: "axis",
  tangent: "tangent",
};

export function mateRequirementFor(type) {
  return MATE_REQUIREMENT[type] || "planar";
}

/* A circular edge lies in a plane whose normal is the circle's axis. The mate
   buttons and the solver both have to treat that as planar, or picking two
   hole rims — the usual way to coincident or concentric two parts — disables
   every planar mate and then silently refuses the rest. */
export function planarDirection(frame) {
  if (!frame) return null;
  if (frame.surface === "plane" && finiteDirection(frame.normal)) return frame.normal;
  if (frame.curve === "circle" && finiteDirection(frame.axis || frame.normal)) return frame.axis || frame.normal;
  return null;
}

export function mateFrameSupports(requirement, frame) {
  if (!frame || !finitePoint(frame.origin)) return false;
  if (requirement === "axis") return finiteDirection(frame.axis);
  if (requirement === "tangent") return frame.surface==="plane"?!!planarDirection(frame):mateFrameSupports("round",frame);
  if (requirement === "round") {
    return finiteDirection(frame.axis)
      && Number.isFinite(Number(frame.radius)) && Number(frame.radius) > 0;
  }
  return !!planarDirection(frame);
}

/* ---- how a component's orientation is carried -------------------------------
 *
 * `transform.q` — a unit quaternion — IS the orientation. `rx/ry/rz` are a
 * written mirror of it, kept in step so modeler.js can keep handing them to
 * THREE.Euler and so a document stays readable by anything that predates the
 * quaternion.
 *
 * It used to be the other way round, and every probe the solver takes paid for
 * it: a pose was composed as a matrix, written down as Euler angles and read
 * straight back as a matrix, so the accuracy of the whole solve was the
 * accuracy of that round trip. Near ry = ±90° it is poor — `asin` spends its
 * significant digits where its slope goes vertical — and an angle mate asked
 * for 90° could only be honoured to about 1e-11 rad however hard the solver
 * worked. That is far inside any tolerance a person cares about, but it is
 * above the residual target the solve uses to decide it has finished, so the
 * answer was thrown away and the mate reported as contradictory.
 *
 * A quaternion has no such pole: composing and reading one back is exact to
 * the last bit in every orientation.
 *
 * The mirror is still read, and widely — the render group, the bounds box, the
 * pose cache key, the transform inspector. What no longer happens is a pose
 * being reconstructed FROM it: normalizePose() derives it from `q` and never
 * the reverse, so its accuracy stops being the accuracy of the solve and it is
 * free to be chosen for legibility instead. That makes it a guarantee rather
 * than a copy, which is why deriving it is normalizePose's job and not a
 * default the callers each remember to apply.
 */

// Matches THREE.Euler's XYZ convention, which is also what modeler.js uses
// when it renders component transforms.
export function eulerMatrix(transform) {
  const x=rad(Number(transform?.rx)||0), y=rad(Number(transform?.ry)||0), z=rad(Number(transform?.rz)||0);
  const a=Math.cos(x), b=Math.sin(x), c=Math.cos(y), d=Math.sin(y), e=Math.cos(z), f=Math.sin(z);
  return [
    [c*e,-c*f,d],
    [a*f+b*e*d,a*e-b*f*d,-b*c],
    [b*f-a*e*d,b*e+a*f*d,a*c],
  ];
}

/* The inverse of eulerMatrix, and it has to be an EXACT inverse: the solver
   stores every pose it probes as rx/ry/rz and reads it straight back as a
   matrix, so whatever this drops is a motion the assembly cannot make.

   At ry = ±90° the X and Z turns are the same motion and only their sum is
   determined — the classic gimbal lock — so one of them is chosen and the
   other set to zero. That collapse is exact only AT the pole. Guarding it on
   |m02| against a fixed epsilon took the collapsing branch for every pose
   within acos(0.9999999) ≈ 0.026° of the pole as well, where the two turns are
   still distinct and setting one to zero silently threw a real rotation away.
   The solver probes its Jacobian with a 1e-5 rad step, which is deep inside
   that band, so the Z column of any component resting near the pole was
   measured as exactly zero: the rank came out one short and a rigid assembly
   reported a degree of freedom it did not have.

   cos(ry) is what actually vanishes at the pole, and it is what both atan2
   pairs are scaled by, so testing it guards the real singularity and nothing
   else. Recovered from m12/m22 rather than from cos(asin(m02)), which loses
   its significant digits to cancellation exactly where the answer matters. */
export function matrixEuler(matrix) {
  const cosY = Math.hypot(matrix[1][2], matrix[2][2]);
  /* atan2, not asin. Both give ry in [-90°, 90°], but asin spends its
     significant digits exactly where this angle matters most: at ry = 90° its
     slope is vertical, so an m02 one ulp below 1 comes back as 89.99999879°.
     atan2 against cos(ry) — already needed below, and the thing that actually
     goes to zero at the pole — is accurate all the way onto it. */
  const y = Math.atan2(matrix[0][2], cosY);
  if (cosY <= 1e-12) {
    return { rx: deg(Math.atan2(matrix[2][1], matrix[1][1])), ry: deg(y), rz: 0 };
  }
  const principal = {
    rx: deg(Math.atan2(-matrix[1][2], matrix[2][2])),
    ry: deg(y),
    rz: deg(Math.atan2(-matrix[0][1], matrix[0][0])),
  };
  /* Every orientation has a second XYZ triple that describes it exactly as
     well, reached by turning X and Z a half circle and reflecting Y about the
     pole. asin can only return |ry| <= 90°, so a component turned 91° about Y
     comes back as (180, -89, 180): correct, reconstructs the same matrix, and
     unreadable in an inspector.

     Which one is written down is now free to be a matter of legibility,
     because `q` carries the orientation and no pose is rebuilt from these.
     Picking the triple that turns least gives the answer a person would have
     written. */
  const alternate = {
    rx: wrapDegrees(principal.rx + 180),
    ry: wrapDegrees(180 - principal.ry),
    rz: wrapDegrees(principal.rz + 180),
  };
  const travel = (e) => Math.abs(e.rx) + Math.abs(e.ry) + Math.abs(e.rz);
  return travel(alternate) < travel(principal) - 1e-9 ? alternate : principal;
}

// Into (-180, 180], so a wrapped angle never reads as its own reflection.
function wrapDegrees(value) {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/* ---- quaternions ---------------------------------------------------------
   Only what the pose needs: a matrix each way, and the housekeeping that makes
   two solves of the same document agree bit for bit. */

export function normalizeQuat(q) {
  const l = Math.hypot(Number(q?.x) || 0, Number(q?.y) || 0, Number(q?.z) || 0, Number(q?.w) || 0);
  if (!(l > 1e-12)) return { x: 0, y: 0, z: 0, w: 1 };
  /* q and -q are the same orientation, so one of the two is chosen — otherwise
     a document that solves to the same pose can still be saved with every sign
     flipped, and every by-value comparison the editor makes (undo, dirty
     checks, byte-stable saves) sees a change that is not there. */
  const s = (q.w < 0 ? -1 : 1) / l;
  return { x: q.x * s, y: q.y * s, z: q.z * s, w: q.w * s };
}

export function isQuat(q) {
  return !!q && [q.x, q.y, q.z, q.w].every((v) => Number.isFinite(Number(v)))
    && Math.hypot(Number(q.x), Number(q.y), Number(q.z), Number(q.w)) > 1e-9;
}

export function quatMatrix(quat) {
  const { x, y, z, w } = normalizeQuat(quat);
  const xx = x*x, yy = y*y, zz = z*z, xy = x*y, xz = x*z, yz = y*z, wx = w*x, wy = w*y, wz = w*z;
  return [
    [1-2*(yy+zz), 2*(xy-wz),   2*(xz+wy)],
    [2*(xy+wz),   1-2*(xx+zz), 2*(yz-wx)],
    [2*(xz-wy),   2*(yz+wx),   1-2*(xx+yy)],
  ];
}

/* Shepperd's method: the largest of the four diagonal combinations is the one
   whose square root keeps its digits, and one of them is always at least 1/2.
   Taking w unconditionally — the short version of this — divides by something
   near zero for any half-turn, which is exactly the pose a flipped component
   lands on. */
export function matrixQuat(m) {
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = { w: s / 4, x: (m[2][1] - m[1][2]) / s, y: (m[0][2] - m[2][0]) / s, z: (m[1][0] - m[0][1]) / s };
  } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    q = { w: (m[2][1] - m[1][2]) / s, x: s / 4, y: (m[0][1] + m[1][0]) / s, z: (m[0][2] + m[2][0]) / s };
  } else if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    q = { w: (m[0][2] - m[2][0]) / s, x: (m[0][1] + m[1][0]) / s, y: s / 4, z: (m[1][2] + m[2][1]) / s };
  } else {
    const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
    q = { w: (m[1][0] - m[0][1]) / s, x: (m[0][2] + m[2][0]) / s, y: (m[1][2] + m[2][1]) / s, z: s / 4 };
  }
  return normalizeQuat(q);
}

/* The orientation a transform describes. `q` is the truth; the Euler triple is
   the fallback for a document written before there was one, and for a caller
   that sets an angle by hand (cad_motion_study spins a component by writing
   `ry`). Reading the mirror when it disagrees would silently undo the pose the
   solver just found, so `setRotation` always writes both together. */
export function rotationOf(transform) {
  return isQuat(transform?.q) ? quatMatrix(transform.q) : eulerMatrix(transform);
}

/* Brings a transform up to the contract above, and is the ONLY place that
   decides which of the two representations wins.

   `q` wins whenever it is usable, and the mirror is re-derived from it — never
   the other way round, and never by comparing the two and guessing which looks
   newer. A threshold cannot tell a deliberate edit from the mirror's own
   rounding, and getting it wrong in the safe-looking direction is what makes a
   transform carrying nothing but a valid quaternion — the natural shape for
   anything written against this contract — reset itself to identity.

   An editor that lets somebody type an angle therefore has to say so, by
   calling setRotation() at the point of the edit. There are three such places:
   the assembly transform inspector and the drag's pose restore in modeler.js,
   and the rotary motor in cad_motion_study.js. */
export function normalizePose(transform) {
  const t = transform || {};
  for (const key of ["x", "y", "z"]) {
    t[key] = Number.isFinite(Number(t[key])) ? Number(t[key]) : 0;
  }
  if (isQuat(t.q)) return setRotation(t, quatMatrix(t.q));
  for (const key of ["rx", "ry", "rz"]) {
    t[key] = Number.isFinite(Number(t[key])) ? Number(t[key]) : 0;
  }
  return setRotation(t, eulerMatrix(t));
}

/* Writes an orientation to a transform: the quaternion, then the readable
   mirror derived from it. Every editor that changes an orientation goes
   through here, so the mirror is never allowed to fall behind. */
export function setRotation(transform, matrix) {
  const quat = matrixQuat(matrix);
  transform.q = quat;
  const euler = matrixEuler(quatMatrix(quat));
  transform.rx = euler.rx; transform.ry = euler.ry; transform.rz = euler.rz;
  return transform;
}

export function axisAngleMatrix(axis, angle) {
  if (Math.abs(angle) < 1e-10) return identity();
  const n=norm(axis), c=Math.cos(angle), s=Math.sin(angle), t=1-c;
  return [
    [t*n.x*n.x+c,t*n.x*n.y-s*n.z,t*n.x*n.z+s*n.y],
    [t*n.x*n.y+s*n.z,t*n.y*n.y+c,t*n.y*n.z-s*n.x],
    [t*n.x*n.z-s*n.y,t*n.y*n.z+s*n.x,t*n.z*n.z+c],
  ];
}

/* A rotation vector — an axis whose length is the angle turned about it — as a
   matrix. This is the parameterisation the solver moves components with: three
   numbers per component, no gimbal lock anywhere in the range a mate can ask
   for, and an exact identity at zero. Euler angles are what the document
   stores, and they are only written back out at the end of a step. */
export function rotationVectorMatrix(vector) {
  const angle = Math.hypot(vector.x, vector.y, vector.z);
  if (angle < 1e-12) return identity();
  return axisAngleMatrix(vector, angle);
}

export function worldFrame(frame, component, space) {
  if (!frame) return null;
  // Explicit assembly-space frames remain fixed; legacy references without a
  // space marker are migrated by the resolver before reaching this branch.
  if (space !== "component") return structuredClone(frame);
  const transform=component?.transform || {}, rotation=rotationOf(transform), translation={
    x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0,
  };
  /* Shallow: the three fields a pose changes are replaced with new objects
     here, and nothing downstream writes to the rest. A deep clone of every
     frame was measurable — the solver resolves two frames per mate per probe,
     and a Jacobian is hundreds of probes. */
  const out={...frame};
  if (frame.origin) out.origin=add(apply(rotation,frame.origin),translation);
  if (frame.normal) out.normal=norm(apply(rotation,frame.normal));
  if (frame.axis) out.axis=norm(apply(rotation,frame.axis));
  return out;
}

export function componentFrame(frame, component) {
  const transform=component?.transform || {}, rotation=rotationOf(transform), inverse=transpose(rotation),
    translation={x:Number(transform.x)||0,y:Number(transform.y)||0,z:Number(transform.z)||0};
  const out={...structuredClone(frame)};
  if (frame.origin) out.origin=apply(inverse,{x:frame.origin.x-translation.x,y:frame.origin.y-translation.y,z:frame.origin.z-translation.z});
  if (frame.normal) out.normal=norm(apply(inverse,frame.normal));
  if (frame.axis) out.axis=norm(apply(inverse,frame.axis));
  return out;
}

// Any unit vector at right angles to `axis`, chosen the same way every time so
// it can serve as the zero mark a roll is measured from.
export function perpendicular(axis) {
  const a = norm(axis), helper = Math.abs(a.y) < .9 ? {x:0,y:1,z:0} : {x:1,y:0,z:0};
  return norm(cross(a, helper));
}

// Signed angle from `reference` to `marker` about `axis`, both assumed to lie
// in the plane the axis is normal to.
export function signedAngle(axis, reference, marker) {
  return Math.atan2(dot(cross(axis, reference), marker), dot(reference, marker));
}

/* The shortest turn that brings `from` onto `to`. Exactly opposed directions
   have no shortest turn — every half circle about a perpendicular axis does it
   — so one perpendicular is picked the same way every time. A hardcoded axis
   is wrong here: a Y axis cannot flip a pair of ±Y normals, which is exactly
   the case for two flat faces mated on the floor plane. */
export function rotationFromTo(from, to) {
  const a=norm(from), b=norm(to), axis=cross(a,b), s=len(axis), c=Math.max(-1,Math.min(1,dot(a,b)));
  if (s < 1e-8) return { axis: c < 0 ? perpendicular(a) : {x:0,y:1,z:0}, angle:c < 0 ? Math.PI : 0 };
  return { axis:norm(axis), angle:Math.atan2(s,c) };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function topologyReference(componentId, kind, persistentId, frame) {
  return { componentId, kind, persistentId, frameSpace:"component", frame: structuredClone(frame), descriptor: structuredClone(frame), signature: frameSignature(frame) };
}

export function frameSignature(frame) {
  const q = (v) => Math.round(Number(v || 0) * 1000) / 1000;
  return [frame?.surface || "plane", q(frame?.origin?.x),q(frame?.origin?.y),q(frame?.origin?.z),q(frame?.normal?.x),q(frame?.normal?.y),q(frame?.normal?.z)].join(":");
}

// The offset a distance or limit mate asks for, clamped to its bounds. Both
// the solve and the check below have to read it the same way.
export function mateOffset(mate) {
  if (mate.type === "coincident") return 0;
  let offset = Number(mate.value || 0);
  if (mate.type === "limit") {
    const lo = Number(mate.min), hi = Number(mate.max);
    if (Number.isFinite(lo)) offset = Math.max(lo, offset);
    if (Number.isFinite(hi)) offset = Math.min(hi, offset);
  }
  return offset;
}

/* Where a tangent mate wants the moving axis to sit: one radius-sum out from
   the fixed axis, preserving its current azimuth and axial position. Coincident
   axes use a deterministic radial seed. The moving
   radius is passed in rather than stashed on the mate — both callers already
   hold the frame it comes from, and a solver scratch field written onto the
   mate is serialised into every save and every undo snapshot, and shows up in
   the History panel as an edit nobody made. */
export function tangentTarget(mate, fa, movingRadius, movingOrigin = fa.origin) {
  if(fa.surface==='plane'){
    const normal=norm(fa.normal),side=mate.aligned?-1:1;
    const d=dot({x:movingOrigin.x-fa.origin.x,y:movingOrigin.y-fa.origin.y,z:movingOrigin.z-fa.origin.z},normal)-side*movingRadius;
    return {x:movingOrigin.x-normal.x*d,y:movingOrigin.y-normal.y*d,z:movingOrigin.z-normal.z*d};
  }
  const axisA = norm(fa.axis || fa.normal);
  const radiusA = Number(fa.radius) || 0, radiusB = Number(movingRadius) || 0;
  const gap = mate.aligned ? Math.abs(radiusA - radiusB) : radiusA + radiusB;
  const delta={x:movingOrigin.x-fa.origin.x,y:movingOrigin.y-fa.origin.y,z:movingOrigin.z-fa.origin.z};
  const along=dot(delta,axisA), projected={x:delta.x-axisA.x*along,y:delta.y-axisA.y*along,z:delta.z-axisA.z*along};
  const radial=len(projected)>1e-9?norm(projected):perpendicular(axisA);
  return { x: fa.origin.x + axisA.x*along + radial.x * gap, y: fa.origin.y + axisA.y*along + radial.y * gap, z: fa.origin.z + axisA.z*along + radial.z * gap };
}

/* How far a screw has been rolled about its own axis, measured from a zero
   mark that is fixed in assembly space. Rolling about the mate axis is the
   only motion that changes it, which is what makes it a stable measurement
   from one solve to the next. */
export function screwRoll(component, axis) {
  const rotation = rotationOf(component.transform);
  const localAxis = norm(apply(transpose(rotation), axis));
  const marker = norm(apply(rotation, perpendicular(localAxis)));
  return signedAngle(axis, perpendicular(axis), marker);
}

export function screwAdvance(mate) {
  const pitch = Math.max(1e-6, Number(mate.pitch) || 0);
  const turns = Number.isFinite(Number(mate.turns)) ? Number(mate.turns) : Number(mate.value) || 0;
  const handed = mate.handedness === "lh" || mate.handedness === "left" ? -1 : 1;
  return { along: pitch * turns, roll: rad(360 * turns * handed) };
}

export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function angleBetween(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b)))));
}

/* Where a mate wants the moving reference to be, given where the fixed one
   currently is. One reading of each mate type, used both to build the solver's
   residuals and to measure the result afterwards, so the two can never drift
   apart about what a mate means. Returns null for a mate whose frames cannot
   express it. */
export function mateTarget(mate, fa, fb, moving) {
  if (!fa || !fb) return null;
  if (mate.type === "coincident" || mate.type === "distance" || mate.type === "limit") {
    const na = planarDirection(fa), nb = planarDirection(fb);
    if (!fa.origin || !fb.origin || !na || !nb) return null;
    const normal=norm(na), delta={x:fb.origin.x-fa.origin.x,y:fb.origin.y-fa.origin.y,z:fb.origin.z-fa.origin.z};
    const offset = mateOffset(mate), error=dot(delta,normal)-offset;
    return {
      origin: {
        x: fb.origin.x - normal.x * error,
        y: fb.origin.y - normal.y * error,
        z: fb.origin.z - normal.z * error,
      },
      direction: mate.aligned ? norm(na) : {x:-na.x,y:-na.y,z:-na.z},
      actualDirection: norm(nb),
    };
  }
  if (mate.type === "concentric" || mate.type === "screw") {
    const axisA = fa.axis || fa.normal, axisB = fb.axis || fb.normal;
    if (!fa.origin || !fb.origin || !axisA || !axisB) return null;
    const axis = norm(axisA);
    const along = mate.type === "screw" ? screwAdvance(mate).along : dot({x:fb.origin.x-fa.origin.x,y:fb.origin.y-fa.origin.y,z:fb.origin.z-fa.origin.z},axis);
    const out = {
      origin: { x: fa.origin.x + axis.x*along, y: fa.origin.y + axis.y*along, z: fa.origin.z + axis.z*along },
      direction: axis,
      actualDirection: norm(axisB),
    };
    /* A screw also says where in its turn the component stands. Without this
       the roll is a free rotation the solver would leave wherever it started,
       and a screw would no longer wind. */
    if (mate.type === "screw" && moving) {
      out.roll = wrapAngle(screwRoll(moving, axis) - screwAdvance(mate).roll);
    }
    return out;
  }
  if (mate.type === "tangent") {
    if(fa.surface==='plane' || fb.surface==='plane'){
      if(fa.surface==='plane' && fb.surface==='plane')return null;
      const fixedPlane=fa.surface==='plane',plane=fixedPlane?fa:fb,round=fixedPlane?fb:fa;
      if(!mateFrameSupports('round',round))return null;
      const normal=norm(plane.normal),axis=norm(round.axis),actualDirection=fixedPlane?axis:normal,reference=fixedPlane?normal:axis;
      const projection=dot(actualDirection,reference),candidate={x:actualDirection.x-reference.x*projection,y:actualDirection.y-reference.y*projection,z:actualDirection.z-reference.z*projection};
      const direction=len(candidate)>1e-9?norm(candidate):perpendicular(reference);
      const delta={x:round.origin.x-plane.origin.x,y:round.origin.y-plane.origin.y,z:round.origin.z-plane.origin.z};
      const error=dot(delta,normal)-(mate.aligned?-1:1)*round.radius,sign=fixedPlane?-1:1;
      return {tangentPlane:true,offsetResidual:error,orientationResidual:dot(axis,normal),actualDirection,direction,
        origin:{x:fb.origin.x+sign*normal.x*error,y:fb.origin.y+sign*normal.y*error,z:fb.origin.z+sign*normal.z*error}};
    }
    const axisA = fa.axis || fa.normal, axisB = fb.axis || fb.normal;
    if (!fa.origin || !fb.origin || !axisA || !axisB) return null;
    return {
      origin: tangentTarget(mate, fa, fb.radius, fb.origin),
      direction: norm(axisA),
      actualDirection: norm(axisB),
    };
  }
  if (mate.type === "angle") {
    const na = planarDirection(fa) || fa.normal, nb = planarDirection(fb) || fb.normal;
    if (!na || !nb) return null;
    const fixedDirection = norm(na), actualDirection = norm(nb);
    const desiredAngle = rad(Math.max(0, Math.min(180, Number(mate.value) || 0)));
    /* An angle alone does not choose an azimuth around the fixed normal. Keep
       the moving normal's present azimuth when it has one; at the singular
       parallel/opposed poses, choose the same deterministic perpendicular the
       rest of the mate model uses. Besides making the seed predictable, this
       gives Newton's method somewhere with a slope to start from: the unsigned
       angle has zero central-difference derivative at exactly 0 and π. */
    const projection = dot(fixedDirection, actualDirection);
    const tangentPart = {
      x: actualDirection.x - fixedDirection.x * projection,
      y: actualDirection.y - fixedDirection.y * projection,
      z: actualDirection.z - fixedDirection.z * projection,
    };
    const tangent = len(tangentPart) > 1e-8 ? norm(tangentPart) : perpendicular(fixedDirection);
    const direction = {
      x: fixedDirection.x * Math.cos(desiredAngle) + tangent.x * Math.sin(desiredAngle),
      y: fixedDirection.y * Math.cos(desiredAngle) + tangent.y * Math.sin(desiredAngle),
      z: fixedDirection.z * Math.cos(desiredAngle) + tangent.z * Math.sin(desiredAngle),
    };
    return {
      angle: angleBetween(fixedDirection, actualDirection) - desiredAngle,
      desiredAngle, fixedDirection, actualDirection, direction,
    };
  }
  return null;
}

/* How far a mate is from being honoured, measured from the frames as they
   finally stand. This deliberately re-derives the target rather than trusting
   the step that placed it: a mate that another mate has overridden looks
   identical to one that holds unless something checks. */
export function mateResidual(mate, fa, fb, moving) {
  const target = mateTarget(mate, fa, fb, moving);
  if (!target) return null;
  if (target.angle !== undefined) return { linear: 0, angular: Math.abs(target.angle) };
  const angular = angleBetween(target.actualDirection, target.direction);
  return {
    linear: distanceBetween(fb.origin, target.origin),
    angular: target.roll === undefined ? angular : Math.max(angular, Math.abs(target.roll)),
  };
}

/* The same measurement as a signed vector, which is what a Newton step needs:
   a magnitude says how wrong a mate is, but not which way to move to fix it.
 *
 * Angles are multiplied by a length so that one vector can hold both without
 * the solve favouring whichever happens to be in the larger unit. The scale is
 * the size of a mate's own geometry rather than a constant, so a small part and
 * a large one are weighted alike. */
const ANGULAR_SCALE = 10;

export function mateResidualVector(mate, fa, fb, moving) {
  const target = mateTarget(mate, fa, fb, moving);
  if (!target) return null;
  if(target.tangentPlane)return [target.offsetResidual,target.orientationResidual*ANGULAR_SCALE];
  if (target.angle !== undefined) {
    /* At 0° and 180° an angle mate becomes a parallel/anti-parallel
       relation. The scalar unsigned angle has a cusp there, so a central
       Jacobian sees a false zero rank. Direction rows are smooth at the
       solution and correctly count the two rotations those endpoint cases
       constrain. Interior angles remain one scalar constraint. */
    if (target.desiredAngle < 1e-8 || Math.PI - target.desiredAngle < 1e-8) {
      return [
        (target.actualDirection.x - target.direction.x) * ANGULAR_SCALE,
        (target.actualDirection.y - target.direction.y) * ANGULAR_SCALE,
        (target.actualDirection.z - target.direction.z) * ANGULAR_SCALE,
      ];
    }
    return [target.angle * ANGULAR_SCALE];
  }
  const rows = [
    fb.origin.x - target.origin.x,
    fb.origin.y - target.origin.y,
    fb.origin.z - target.origin.z,
    /* A difference of directions rather than their cross product: the cross
       product is zero both when two directions agree and when they are exactly
       opposed, so a mate that needs a half turn would sit at a stationary point
       and the solver would never start turning it. */
    (target.actualDirection.x - target.direction.x) * ANGULAR_SCALE,
    (target.actualDirection.y - target.direction.y) * ANGULAR_SCALE,
    (target.actualDirection.z - target.direction.z) * ANGULAR_SCALE,
  ];
  /* A screw's roll enters as a sine and cosine pair rather than as the angle
     itself. The angle is only defined to within a full turn, so as a residual
     it steps from one side of the turn to the other and a Jacobian measured
     across that step is meaningless. The pair is smooth everywhere, is zero
     only when the roll is exactly right, and — unlike a lone sine — still has
     a slope to follow when the component is a half turn out. */
  if (target.roll !== undefined) {
    rows.push(Math.sin(target.roll) * ANGULAR_SCALE, (Math.cos(target.roll) - 1) * ANGULAR_SCALE);
  }
  return rows;
}

/* Resolves a mate reference to a frame in assembly space, reporting what it
   could not do into `sink`. Built once per solve because it carries that
   report; the solver calls it many times per component as it probes poses. */
export function createFrameResolver(sink) {
  /* Topology does not change while one assembly solve probes component poses.
     Index it once per component instead of rebuilding the persistent-id map
     for both references of every mate, in every Jacobian column. Keep the
     source array beside the registry so a caller that replaces topology from
     inside a solve hook still gets a fresh index. */
  const registries = new WeakMap();
  const registryFor = (component, entries) => {
    const cached = registries.get(component);
    if (cached?.entries === entries) return cached.registry;
    const registry = createTopologyRegistry(entries);
    registries.set(component, { entries, registry });
    return registry;
  };
  /* A sub-assembly's topology is composed from everything inside it. Its
     children do not move while the parent is solved, so compose once per solve. */
  const composed = new WeakMap();
  const partTopology = (part) => part?.topology || part?.def?.lastRebuild?.topology || [];
  const entriesOf = (component) => {
    if (!isSubassembly(component)) return partTopology(component);
    if (!composed.has(component)) composed.set(component, componentTopology(component, partTopology));
    return composed.get(component);
  };
  return function resolvedFrame(reference, component, mateId, collect) {
    // Every component answers for its own Front, Top and Right planes, at its origin.
    if (isStandardPlaneId(reference?.persistentId)) {
      const plane = standardPlaneEntries().find((entry) => entry.persistentId === reference.persistentId);
      return worldFrame(plane.descriptor, component, "component");
    }
    const entries = entriesOf(component);
    if (!entries.length) {
      // One-time migration for assemblies saved by the old editor, whose
      // fallback frames were captured in assembly coordinates. Converting the
      // snapshot to the component's local frame stops it being added again on
      // every viewport rebuild.
      if (!reference.frameSpace && (reference.frame || reference.descriptor)) {
        reference.frame=componentFrame(reference.frame || reference.descriptor,component);
        reference.descriptor=structuredClone(reference.frame);
        reference.frameSpace="component";
        reference.signature=frameSignature(reference.frame);
      }
      return worldFrame(reference.frame || reference.descriptor || null,component,reference.frameSpace);
    }
    const result = resolveTopologyReference(reference, registryFor(component, entries));
    if (result.status === "missing" || result.status === "ambiguous") {
      if (collect) sink.issues.push({mate:mateId,code:result.status+"-topology",reference:reference.persistentId});
      return null;
    }
    if (result.status === "rebound" && collect) sink.rebindings.push({mate:mateId,from:reference.persistentId,to:result.topology.persistentId});
    const descriptor = result.topology.descriptor || {};
    return worldFrame({ surface: descriptor.surface, origin: descriptor.origin, normal: descriptor.normal, axis: descriptor.axis, radius: descriptor.radius, measure: descriptor.measure },component,"component");
  };
}
