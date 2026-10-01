import { analyzeSectionBoundaries } from "./section_boundaries.js";
/* The closed loop a rib's open sketch line becomes.
 *
 * A rib is drawn as a LINE, not as a shape: the user traces where the web runs
 * and states how thick it is. Turning that into something a kernel can extrude
 * means offsetting the polyline to both sides and closing the two offsets into
 * one loop — the same construction a fabricator does with a marking gauge.
 *
 * Corners are mitred: each interior vertex moves along the bisector of its two
 * segment normals, scaled by 1/cos(half-angle) so the offset walls actually
 * meet there instead of leaving a notch. A very sharp corner would send that
 * scale to infinity. Reject corners that exceed the mitre limit or consume
 * an adjacent segment; silently clipping them would change the web thickness.
 *
 * Pure 2D arithmetic on {u,v}: no kernel, no sketch objects, so it is testable
 * on its own and the kernel module stays about OpenCascade.
 */

const MITRE_LIMIT = 4;   // reject excessively sharp corners

function unit(dx, dy) {
  const size = Math.hypot(dx, dy);
  return size > 1e-9 ? { x: dx / size, y: dy / size } : null;
}

/* Consecutive duplicates make a zero-length segment with no direction, and one
   of those is enough to leave a NaN in the middle of the loop. */
function cleaned(points) {
  const out = [];
  (points || []).forEach((point) => {
    const u = Number(point && (point.u ?? point.x)) || 0, v = Number(point && (point.v ?? point.y)) || 0;
    const last = out[out.length - 1];
    if (last && Math.hypot(last.u - u, last.v - v) < 1e-9) return;
    out.push({ u, v });
  });
  return out;
}

/* How far each side of the line is pushed out. "both" is the symmetric web a
   rib normally is; "left"/"right" put the whole thickness on one side of the
   line, which is how a web is drawn flush with a wall it sits against. */
export function ribOffsets(thickness, side) {
  const size = Math.abs(Number(thickness) || 0);
  if (side === "left") return { left: size, right: 0 };
  if (side === "right") return { left: 0, right: size };
  return { left: size / 2, right: size / 2 };
}

export function ribLoop(points, thickness, side) {
  const size = Math.abs(Number(thickness) || 0);
  if (!(size > 1e-6)) throw new Error("Rib needs a non-zero thickness");
  return ribLoopFromOffsets(points, ribOffsets(size, side));
}

/* Parallel-to-sketch ribs keep the traced line as their upper boundary. The
   open ends grow along one in-plane direction to a planar stopping surface;
   thickness is subsequently applied NORMAL to this closed section. */
export function ribGrowthVector(direction) {
  if (direction === "positive-u") return {u:1,v:0};
  if (direction === "negative-u") return {u:-1,v:0};
  if (direction === "positive-v") return {u:0,v:1};
  return {u:0,v:-1};
}

export function ribWebLoop(points, growth, stop) {
  const line = cleaned(points);
  if (line.length < 2) throw new Error("Rib needs an open sketch line of at least two points");
  const denominator = stop.normal.u*growth.u + stop.normal.v*growth.v;
  if (Math.abs(denominator)<1e-9) throw new Error("Rib growth is parallel to the stopping face");
  const project = point => {
    const run=((stop.u-point.u)*stop.normal.u+(stop.v-point.v)*stop.normal.v)/denominator;
    if(run < -1e-6)throw new Error("The rib runs away from the body it braces, so it never reaches it");
    return {u:point.u+growth.u*run,v:point.v+growth.v*run};
  };
  const loop=cleaned([...line,project(line[line.length-1]),project(line[0])]);
  if(loop.length>1 && Math.hypot(loop[0].u-loop.at(-1).u,loop[0].v-loop.at(-1).v)<1e-9)loop.pop();
  const boundary=analyzeSectionBoundaries(loop.map((a,i)=>({a,b:loop[(i+1)%loop.length]})),1e-7);
  if(!boundary.ok || boundary.loops.length!==1)throw new Error("Rib growth creates an overlapping or empty web; change its direction or profile");
  return loop;
}

/* An intentionally open path consumed by Rib is healthy. A broken path or a
   branch must still report the normal sketch warning, even after consumption. */
export function ribSketchReady(sketch,features,chains) {
  if(!sketch || chains?.length!==1)return false;
  const ids=new Set(chains[0].entityIds);
  if((sketch.entities || []).some(entity=>!entity.construction && !ids.has(entity.id)))return false;
  return (features || []).some(feature=>{
    if(feature.type!=="rib")return false;
    const references=(feature.references?.sketches || []).map(reference=>typeof reference==="string"?reference:reference?.id);
    if(feature.params?.sketchId!==sketch.id && !references.includes(sketch.id))return false;
    return (feature.params?.chainEntityIds || []).every(id=>ids.has(id));
  });
}

function ribLoopFromOffsets(points, { left, right }) {
  const line = cleaned(points);
  if (line.length < 2) throw new Error("Rib needs an open sketch line of at least two points");

  const normals = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const direction = unit(line[i + 1].u - line[i].u, line[i + 1].v - line[i].v);
    if (!direction) throw new Error("Rib line has a zero-length segment");
    normals.push({ u: -direction.y, v: direction.x });
  }

  // One offset direction per vertex: the segment normal at the ends, the
  // mitred bisector in between.
  const offsets = line.map((_, index) => {
    const before = normals[index - 1], after = normals[index];
    if (!before) return { u: after.u, v: after.v, scale: 1 };
    if (!after) return { u: before.u, v: before.v, scale: 1 };
    const bisector = unit(before.u + after.u, before.v + after.v);
    // A reversal (the line doubles back) has no bisector at all.
    if (!bisector) return { u: after.u, v: after.v, scale: 1 };
    const cos = bisector.x * after.u + bisector.y * after.v;
    const scale=1 / Math.max(1e-6,cos);
    const along=Math.abs(bisector.x*before.v-bisector.y*before.u)*scale*Math.max(left,right);
    const available=Math.min(Math.hypot(line[index].u-line[index-1].u,line[index].v-line[index-1].v),Math.hypot(line[index+1].u-line[index].u,line[index+1].v-line[index].v));
    if(scale>MITRE_LIMIT || along>=available-1e-9)throw new Error("Rib thickness creates an overlapping corner; reduce thickness or lengthen the path segments");
    return { u: bisector.x, v: bisector.y, scale };
  });

  const along = (distance) => line.map((point, index) => ({
    u: point.u + offsets[index].u * offsets[index].scale * distance,
    v: point.v + offsets[index].v * offsets[index].scale * distance,
  }));
  // left side forward, right side back: one closed ring around the line
  const loop=along(left).concat(along(-right).reverse());
  const boundary=analyzeSectionBoundaries(loop.map((a,i)=>({a,b:loop[(i+1)%loop.length]})),1e-7);
  if(!boundary.ok || boundary.loops.length!==1)throw new Error("Rib thickness creates an overlapping corner; reduce thickness or lengthen the path segments");
  return loop;
}

/* The same loop narrowed by a draft angle after `depth` of run.
 *
 * A drafted rib is a taper, not a prism: the web is full thickness at the
 * sketch plane and every DRAFTED wall leans in by depth*tan(angle) — which is
 * exactly what draftBrep would do to that wall with the sketch plane as its
 * neutral plane and the rib's own run as the pull direction. Building it as the
 * far section of a loft instead of drafting afterwards keeps the result exact
 * and needs no face selection. A positive angle narrows the web away from the
 * sketch plane: draft's own sign convention.
 *
 * A web pushed entirely to one side of the line sits flush against something,
 * so only its free wall is drafted and it narrows by one tangent, not two. */
export function ribDraftedLoop(points, thickness, side, depth, angleDegrees) {
  const angle = ((Number(angleDegrees) || 0) * Math.PI) / 180;
  const run = Math.abs(Number(depth) || 0) * Math.tan(angle);
  const near = ribOffsets(thickness, side);
  const far = {
    left: near.left > 1e-9 ? near.left - run : 0,
    right: near.right > 1e-9 ? near.right - run : 0,
  };
  if (!(far.left + far.right > 1e-6)) throw new Error("Rib draft angle closes the web before it reaches full depth");
  return ribLoopFromOffsets(points, far);
}
