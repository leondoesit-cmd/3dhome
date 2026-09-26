/* The garden round the house in the presentation views: a paving apron
   hugging the footprint, a lawn beyond it, and a low hedge along the lawn's
   edge with a gap in front of every outside door so the path is never
   blocked. Pure: rectangles in world cm from the house bounds and the door
   positions; view3d.js turns them into meshes. */

export const PAVE_CM = 110; // same apron width as the 2D presentation plan
export const LAWN_MARGIN = 600;
export const HEDGE = { depth: 55, height: 85, gap: 160 };

/* bb: {minx,maxx,minz,maxz}. doors: [{x,z}] — the outside doors' centres.
   Returns {paving, lawn, hedges[]}; each hedge is an axis-aligned box
   footprint {x0,x1,z0,z1}. */
export function siteLayout(bb, doors) {
  var paving = { x0: bb.minx - PAVE_CM, x1: bb.maxx + PAVE_CM, z0: bb.minz - PAVE_CM, z1: bb.maxz + PAVE_CM };
  var lawn = {
    x0: bb.minx - LAWN_MARGIN, x1: bb.maxx + LAWN_MARGIN,
    z0: bb.minz - LAWN_MARGIN, z1: bb.maxz + LAWN_MARGIN,
  };
  var inset = HEDGE.depth / 2 + 40;
  var e = { x0: lawn.x0 + inset, x1: lawn.x1 - inset, z0: lawn.z0 + inset, z1: lawn.z1 - inset };
  // each door opens a gap on the lawn edge it faces (the nearest house side)
  var gaps = { n: [], s: [], w: [], e: [] };
  (doors || []).forEach(function (d) {
    var dn = Math.abs(d.z - bb.minz), ds = Math.abs(d.z - bb.maxz),
      dw = Math.abs(d.x - bb.minx), de = Math.abs(d.x - bb.maxx),
      m = Math.min(dn, ds, dw, de);
    if (m > 40) return; // an inside door, not on the outline
    if (m === dn) gaps.n.push(d.x);
    else if (m === ds) gaps.s.push(d.x);
    else if (m === dw) gaps.w.push(d.z);
    else gaps.e.push(d.z);
  });
  var hedges = [];
  function run(a0, a1, cuts, make) {
    var spans = [[a0, a1]];
    cuts.forEach(function (c) {
      var g0 = c - HEDGE.gap / 2, g1 = c + HEDGE.gap / 2, next = [];
      spans.forEach(function (sp) {
        if (g1 <= sp[0] || g0 >= sp[1]) return void next.push(sp);
        if (g0 > sp[0]) next.push([sp[0], g0]);
        if (g1 < sp[1]) next.push([g1, sp[1]]);
      });
      spans = next;
    });
    spans.forEach(function (sp) { if (sp[1] - sp[0] > 30) hedges.push(make(sp[0], sp[1])); });
  }
  var h = HEDGE.depth / 2;
  run(e.x0, e.x1, gaps.n, function (a, b) { return { x0: a, x1: b, z0: e.z0 - h, z1: e.z0 + h }; });
  run(e.x0, e.x1, gaps.s, function (a, b) { return { x0: a, x1: b, z0: e.z1 - h, z1: e.z1 + h }; });
  run(e.z0 + h, e.z1 - h, gaps.w, function (a, b) { return { x0: e.x0 - h, x1: e.x0 + h, z0: a, z1: b }; });
  run(e.z0 + h, e.z1 - h, gaps.e, function (a, b) { return { x0: e.x1 - h, x1: e.x1 + h, z0: a, z1: b }; });
  return { paving: paving, lawn: lawn, hedges: hedges };
}
