// Helix / spiral reference curves. Sampled in document centimetres so a
// thread, knurl or helical sweep can share one path without talking to the
// kernel. Handedness follows the ISO right-hand screw rule: a right-hand
// helix advances along +axis as the angle increases.

const TAU = Math.PI * 2;

export function normalizeHelixRegions(regions,diameter) {
  if(!Array.isArray(regions) || regions.length<2 || regions.length>64)throw new Error("Variable pitch requires 2–64 regions");
  const rows=regions.map(row=>({revolution:Number(row.revolution),pitch:Number(row.pitch),diameter:Number(row.diameter ?? diameter)}));
  rows.forEach((row,index)=>{
    if(!Number.isFinite(row.revolution) || row.revolution<0 || row.revolution>200 || (index===0 ? row.revolution!==0 : row.revolution<=rows[index-1].revolution))throw new Error("Region revolutions must start at 0 and increase");
    if(!(row.pitch>0) || !Number.isFinite(row.pitch) || !(row.diameter>0) || !Number.isFinite(row.diameter))throw new Error("Region pitch and diameter must be positive");
  });
  return rows;
}

// Pitch is axial travel per revolution. Between rows it varies linearly, so
// axial travel is its quadratic integral, not a linear interpolation of height.
export function helixRegionState(rows,revolution) {
  const rev=Math.max(0,Math.min(rows.at(-1).revolution,Number(revolution)||0));
  let height=0;
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i],span=b.revolution-a.revolution,d=Math.min(span,Math.max(0,rev-a.revolution)),s=d/span;
    const pitch=a.pitch+(b.pitch-a.pitch)*s;
    height+=d*(a.pitch+pitch)/2;
    if(rev<=b.revolution)return {height,pitch,radius:(a.diameter+(b.diameter-a.diameter)*s)/2};
  }
  return {height,pitch:rows.at(-1).pitch,radius:rows.at(-1).diameter/2};
}

function vec(x, y, z) { return { x: Number(x) || 0, y: Number(y) || 0, z: Number(z) || 0 }; }

export function normalizeVec(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function orthonormal(axis) {
  const n = normalizeVec(axis);
  const helper = Math.abs(n.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
  const u = normalizeVec({
    x: n.y * helper.z - n.z * helper.y,
    y: n.z * helper.x - n.x * helper.z,
    z: n.x * helper.y - n.y * helper.x,
  });
  const v = {
    x: n.y * u.z - n.z * u.y,
    y: n.z * u.x - n.x * u.z,
    z: n.x * u.y - n.y * u.x,
  };
  return { axis: n, u, v };
}

export function normalizeHelixSpec(spec = {}) {
  const regions=spec.pitchMode==='variable' ? normalizeHelixRegions(spec.pitchRegions,2*Number(spec.radius ?? spec.radiusStart)) : null;
  const derivedPitch = spec.pitch == null && Number(spec.turns)>0 && Number.isFinite(Number(spec.height)) ? Number(spec.height)/Number(spec.turns) : Number(spec.pitch);
  const pitch = Math.max(1e-6, derivedPitch || 0);
  const turns = Number.isFinite(Number(spec.turns)) ? Number(spec.turns) : (Number(spec.height) || pitch) / pitch;
  const height = Number.isFinite(Number(spec.height)) ? Number(spec.height) : pitch * turns;
  const radiusStart = Math.max(0, Number(spec.radius ?? spec.radiusStart) || 0);
  const radiusEnd = Math.max(0, Number(spec.radiusEnd ?? radiusStart) || 0);
  const handed = spec.handedness === "lh" || spec.handedness === "left" ? "lh" : "rh";
  return {
    origin: vec(spec.origin?.x, spec.origin?.y, spec.origin?.z),
    axis: normalizeVec(spec.axis || { x: 0, y: 1, z: 0 }),
    radius: radiusStart,
    radiusStart,
    radiusEnd,
    pitch,
    turns: regions ? regions.at(-1).revolution : Math.max(0, turns),
    height: regions ? helixRegionState(regions,regions.at(-1).revolution).height : height,
    startAngle: Number(spec.startAngle) || 0,
    handedness: handed,
    pitchMode:regions?'variable':'constant',pitchRegions:regions || [],
    ...(regions ? {radius:regions[0].diameter/2,radiusStart:regions[0].diameter/2,radiusEnd:regions.at(-1).diameter/2} : {}),
  };
}

export function helixPoint(spec, t) {
  const h = normalizeHelixSpec(spec);
  const s = Math.max(0, Math.min(1, Number(t) || 0));
  const frame = orthonormal(h.axis);
  const sign = h.handedness === "lh" ? -1 : 1;
  const angle = h.startAngle + sign * h.turns * TAU * s;
  const region=h.pitchMode==='variable' ? helixRegionState(h.pitchRegions,h.turns*s) : null;
  const radius = region ? region.radius : h.radiusStart + (h.radiusEnd - h.radiusStart) * s;
  const along = region ? region.height : h.height * s;
  const cu = Math.cos(angle), sv = Math.sin(angle);
  return {
    x: h.origin.x + frame.axis.x * along + frame.u.x * radius * cu + frame.v.x * radius * sv,
    y: h.origin.y + frame.axis.y * along + frame.u.y * radius * cu + frame.v.y * radius * sv,
    z: h.origin.z + frame.axis.z * along + frame.u.z * radius * cu + frame.v.z * radius * sv,
    t: s,
    angle,
    radius,
  };
}

export function helixSegmentsPerTurn(spec) {
  const h = normalizeHelixSpec(spec);
  const requested = Number(spec.segmentsPerTurn);
  if (Number.isFinite(requested) && requested >= 8) return Math.min(128, Math.round(requested));
  const circumference = TAU * Math.max(h.radiusStart, h.radiusEnd, 0.1);
  return Math.max(16, Math.min(64, Math.round(circumference / Math.max(h.pitch / 4, 0.05))));
}

export function sampleHelix(spec, options = {}) {
  const h = normalizeHelixSpec(spec);
  const perTurn = helixSegmentsPerTurn({ ...h, segmentsPerTurn: options.segmentsPerTurn });
  const count = Math.max(2, Math.round(perTurn * Math.max(h.turns, 1e-6)) + 1);
  const steps=new Set(Array.from({length:count},(_,i)=>i/(count-1)));
  for(const row of h.pitchRegions || [])steps.add(row.revolution/h.turns);
  const points = [...steps].sort((a,b)=>a-b).map(t=>helixPoint(h,t));
  return { spec: h, points, length: helixLength(h) };
}

/* THE SPINE OF A SWEEP ALONG A HELIX IS ONE SMOOTH CURVE, NOT ITS SAMPLES.
   Handed to MakePipeShell as bare points, the path became a polyline of
   straight edges. A straight edge has no curvature, so no orientation mode can
   turn the section: Follow path, Minimum twist and Fixed all built the same
   body, the profile merely translated round the axis. On LENSCAP the thread's
   tip, pointing at the axis where it was pierced, pointed straight out half a
   turn later and broke through the cap wall (r 6.5035 for a 6.2239 anchor).
   One C2 B-spline through the samples — which is also how SOLIDWORKS stores a
   helix — gives the pipe a real Frenet frame whose normal faces the axis, so
   the section keeps its attitude to the axis all the way along. */
export function helixSweepPath(spec, options = {}) {
  const points = sampleHelix(spec, options).points;
  return { path: points, pathSegments: [{ type: "spline", from: points[0], to: points[points.length - 1], points }] };
}

export function helixLength(spec) {
  const h = normalizeHelixSpec(spec);
  if(h.pitchMode==='variable'){
    let length=0;
    for(let i=1;i<h.pitchRegions.length;i++){
      const a=h.pitchRegions[i-1],b=h.pitchRegions[i],span=b.revolution-a.revolution,dr=(b.diameter-a.diameter)/(2*span);
      const speed=s=>Math.hypot(TAU*(a.diameter+(b.diameter-a.diameter)*s)/2,dr,a.pitch+(b.pitch-a.pitch)*s);
      const n=64;let sum=speed(0)+speed(1);for(let j=1;j<n;j++)sum+=(j%2?4:2)*speed(j/n);
      length+=span*sum/(3*n);
    }
    return length;
  }
  const dr=h.radiusEnd-h.radiusStart, omega=TAU*h.turns;
  if(Math.abs(dr)<1e-12)return Math.hypot(omega*h.radiusStart,h.height);
  // Simpson integration of |dP/dt| includes radial travel for tapered helices.
  const speed=t=>Math.hypot(omega*(h.radiusStart+dr*t),dr,h.height);
  const n=128;let sum=speed(0)+speed(1);
  for(let i=1;i<n;i++)sum+=(i%2?4:2)*speed(i/n);
  return sum/(3*n);
}

export function helixFrameAt(spec, t) {
  const h = normalizeHelixSpec(spec);
  const a = helixPoint(h, Math.max(0, t - 1e-4));
  const b = helixPoint(h, Math.min(1, t + 1e-4));
  const tangent = normalizeVec({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
  const point = helixPoint(h, t);
  const basis=orthonormal(h.axis),angle=point.angle;
  const radial={x:basis.u.x*Math.cos(angle)+basis.v.x*Math.sin(angle),y:basis.u.y*Math.cos(angle)+basis.v.y*Math.sin(angle),z:basis.u.z*Math.cos(angle)+basis.v.z*Math.sin(angle)};
  return { origin: point, tangent, radial, axis: h.axis };
}

export function circularHelixSweepProfile(spec,diameter) {
  if(!(Number(diameter)>0))throw new Error('Circular profile diameter must be positive');
  const frame=helixFrameAt(spec,0),n=frame.tangent,dot=frame.radial.x*n.x+frame.radial.y*n.y+frame.radial.z*n.z;
  const u=normalizeVec({x:frame.radial.x-dot*n.x,y:frame.radial.y-dot*n.y,z:frame.radial.z-dot*n.z});
  const v=normalizeVec({x:n.y*u.z-n.z*u.y,y:n.z*u.x-n.x*u.z,z:n.x*u.y-n.y*u.x}),r=Number(diameter)/2;
  const at=a=>({x:frame.origin.x+r*(u.x*Math.cos(a)+v.x*Math.sin(a)),y:frame.origin.y+r*(u.y*Math.cos(a)+v.y*Math.sin(a)),z:frame.origin.z+r*(u.z*Math.cos(a)+v.z*Math.sin(a))});
  return {...helixSweepPath(spec),profile:[0,Math.PI/2,Math.PI,3*Math.PI/2].map(at),profileSegments:[0,1].map(i=>({type:'arc',from:at(i*Math.PI),mid:at((i+.5)*Math.PI),to:at((i+1)*Math.PI)}))};
}

export function createHelix(options = {}) {
  const spec = normalizeHelixSpec(options);
  return {
    id: options.id || "helix_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    type: "reference_helix",
    name: options.name || "Helix",
    ...spec,
  };
}

export function isHelixRecord(item) {
  return !!(item && (item.type === "reference_helix" || item.type === "helix"));
}

export function sweepUsesHelixPath(sketchCount, selectedHelix) {
  return !!(selectedHelix && Number(sketchCount) === 1);
}

export function documentHelixOverlays(def) {
  const seen = new Set();
  const curves = [];
  const add = (ref) => {
    if (!isHelixRecord(ref) || seen.has(ref.id)) return;
    seen.add(ref.id);
    curves.push({ id: ref.id, kind: "helix", name: ref.name, points: sampleHelix(ref).points });
  };
  (def?.referenceGeometry || []).forEach(add);
  (def?.references || []).forEach(add);
  return curves;
}
