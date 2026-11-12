import { blueprintDoorSwing } from './blueprint_door_swing.js';
/* Offline raster recognition. Long, thick, neutral strokes are architectural
 * walls; small text and furniture details are discarded. No model or network
 * service is needed. Coordinates are centimetres after width calibration. */

function runs(values, minimum, gap = 0) {
  const out = [];
  let start = -1, last = -1;
  for (let i = 0; i <= values.length + gap; i++) {
    if (values[i]) { if (start < 0) start = i; last = i; }
    else if (start >= 0 && i - last > gap) {
      if (last - start + 1 >= minimum) out.push([start, last + 1]);
      start = -1;
    }
  }
  return out;
}

function strokes(mask, width, height, vertical, minLength, minThickness) {
  const across = vertical ? width : height, along = vertical ? height : width;
  const bands = [];
  for (let c = 0; c < across; c++) {
    const profile = new Uint8Array(along);
    for (let p = 0; p < along; p++) profile[p] = mask[vertical ? p * width + c : c * width + p];
    for (const [a, b] of runs(profile, minLength, 2)) {
      // One blank column may split a band: thin partitions are drawn as two
      // hairlines with paper between them.
      const band = bands.find(s => c - s.last <= 2 &&Math.min(s.b, b) - Math.max(s.a, a) >= Math.min(s.b - s.a, b - a) * .65);
      if (band) { band.last = c; band.a = Math.min(band.a, a); band.b = Math.max(band.b, b); band.samples.push([a,b]); }
      else bands.push({ first: c, last: c, a, b, samples:[[a,b]] });
    }
  }
  // A band's extent is where enough of its columns carry ink. (A median of
  // the column runs picked one middle piece of a wall whose outline runs
  // the full length but whose fill stops at every window.) Each covered
  // stretch long enough becomes its own stroke; a lone stray column does not.
  return bands.filter(b => b.last - b.first + 1 >= minThickness && b.last - b.first < Math.max(18, Math.min(width, height) * .035))
    .flatMap(b => {
      const thickness = b.last - b.first + 1, need = Math.max(2, Math.ceil(thickness * .2));
      const lo = Math.min(...b.samples.map(s => s[0])), hi = Math.max(...b.samples.map(s => s[1]));
      const cover = new Uint16Array(hi - lo);
      for (const [a, e] of b.samples) for (let p = a; p < e; p++) cover[p - lo]++;
      const out = [];
      let start = -1, last = -1;
      for (let i = 0; i <= cover.length; i++) {
        if (i < cover.length && cover[i] >= need) { if (start < 0) start = i; last = i; }
        else if (start >= 0 && (i === cover.length || i - last > 2)) {
          if (last - start + 1 >= minLength) out.push({ vertical, c: (b.first + b.last) / 2, a: lo + start, b: lo + last, thickness });
          start = -1;
        }
      }
      return out;
    });
}

// Permit plans colour the cut walls by material: red/orange block, blue
// concrete (Israeli convention). The fill is too light for the dark-ink test,
// so strongly saturated red or blue pixels count as wall ink too. Pale tints
// (glazing, room shading) and greens stay out.
export function pocheInk(r, g, b) {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
  if (hi - lo < 70 || lo > 150) return false;
  return r === hi && r - g >= 45 && r - b >= 60 || b === hi && b - r >= 90 && b - g >= 25;
}

// Downsizes to the detector's working size (longest side ≤ maxSide) with
// plain 2×2 bilinear sampling. The browser's own drawImage downscale is a
// wider smoothing filter that bleaches 4–5 px red wall pieces and hairline
// windows below the ink thresholds; this keeps Node tests and the app on the
// same pixels.
export function rasterWorkingImage({ width, height, data }, maxSide = 1000) {
  const factor = Math.min(1, maxSide / Math.max(width, height));
  if (factor === 1) return { image: { width, height, data }, factor };
  const w = Math.round(width * factor), h = Math.round(height * factor), out = new Uint8ClampedArray(w * h * 4);
  const sx = width / w, sy = height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, (y + .5) * sy - .5), y0 = Math.floor(fy), y1 = Math.min(height - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + .5) * sx - .5), x0 = Math.floor(fx), x1 = Math.min(width - 1, x0 + 1), ax = fx - x0, o = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = data[(y0 * width + x0) * 4 + k] * (1 - ax) + data[(y0 * width + x1) * 4 + k] * ax;
        const bottom = data[(y1 * width + x0) * 4 + k] * (1 - ax) + data[(y1 * width + x1) * 4 + k] * ax;
        out[o + k] = top * (1 - ay) + bottom * ay;
      }
      out[o + 3] = 255;
    }
  }
  return { image: { width: w, height: h, data: out }, factor: w / width };
}

export function recognizeRaster({ width, height, data }, { widthCm = 1000, requireRooms = true } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width * height > 1600000 || data?.length !== width * height * 4)
    throw new Error('Use a readable floor-plan image at least 32 pixels wide and high.');
  if (!Number.isFinite(widthCm) || widthCm < 100 || widthCm > 10000) throw new Error('Enter a plan width between 100 and 10000 cm.');
  const mask = new Uint8Array(width * height), glass = new Uint8Array(width * height);
  let grayCount = 0, blackCount = 0;
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (Math.max(r, g, b) < 205 && Math.min(r, g, b) >= 160 && Math.max(r, g, b) - Math.min(r, g, b) < 22) grayCount++;
    // Coloured wall fill is drawn ink too: such a sheet is not a gray plan.
    if (Math.max(r, g, b) < 100 || pocheInk(r, g, b)) blackCount++;
  }
  const grayPlan = grayCount > blackCount * 2;
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    mask[i] = data[i * 4 + 3] > 127 && (grayPlan ? hi < 205 && lo >= 160 && hi - lo < 22 : hi < 140 || pocheInk(r, g, b)) ? 1 : 0;
    glass[i] = data[i * 4 + 3] > 127 && b - r > 8 && g - r > 3 && lo > 175 && hi < 245 ? 1 : 0;
  }
  const minLength = Math.max(24, Math.round(Math.min(width, height) * .08));
  const minThickness = Math.max(3, Math.round(Math.min(width, height) * .007));
  let segments = [...strokes(mask, width, height, false, minLength, minThickness), ...strokes(mask, width, height, true, minLength, minThickness)];
  const longThickness=segments.filter(s=>s.b-s.a>=minLength*2).map(s=>s.thickness).sort((a,b)=>a-b);
  const typicalThickness=longThickness[Math.floor(longThickness.length/2)]||minThickness;
  const shortStrokes = [...strokes(mask, width, height, false, 24, minThickness), ...strokes(mask, width, height, true, 24, minThickness)].filter(s => s.b - s.a < minLength);
  segments.push(...shortStrokes);
  if (grayPlan) {
    const tone = s => {
      const tones = [];
      for (let p = Math.ceil(s.a); p <= s.b; p++) {
        const x = Math.floor(s.vertical ? s.c : p), y = Math.floor(s.vertical ? p : s.c), i = (y * width + x) * 4;
        tones.push(data[i + 2] - data[i]);
      }
      return tones.sort((a, b) => a - b)[Math.floor(tones.length / 2)];
    };
    const tinted = segments.filter(s => s.b - s.a > minLength * 3 && tone(s) > 2).length >= 3;
    if (tinted) {
      const keep = new Set(segments.filter(s => tone(s) > .3));
      for (let pass = 0; pass < 3; pass++) for (const s of segments) {
        if (keep.has(s)) continue;
        if ([...keep].some(q => q.vertical === s.vertical
          ? Math.abs(s.c - q.c) < minThickness * 2 && s.a < q.b + minLength * 2 && s.b > q.a - minLength * 2 && (Math.min(s.b, q.b) > Math.max(s.a, q.a) || Math.max(s.a - q.b, q.a - s.b) > minLength * .65)
          : s.c >= q.a - 12 && s.c <= q.b + 12 && q.c >= s.a - 12 && q.c <= s.b + 12)) keep.add(s);
      }
      segments = segments.filter(s => keep.has(s));
      segments.forEach(s=>{s.wallTone=tone(s);});
      segments=segments.filter(s=>s.wallTone>.3||s.b-s.a>=minLength*2||
        segments.some(q=>q!==s&&q.vertical===s.vertical&&Math.abs(q.c-s.c)<=minThickness&&Math.abs(q.wallTone-s.wallTone)<=2
          &&Math.max(s.a-q.b,q.a-s.b)<=minLength&&Math.max(s.b,q.b)-Math.min(s.a,q.a)>=minLength*2)
        ||['a','b'].every(end=>segments.some(q=>q!==s&&q.vertical!==s.vertical&&Math.abs(s[end]-q.c)<=minThickness&&s.c>=q.a-minThickness&&s.c<=q.b+minThickness)));


    }
  }
  segments.push(...[false, true].flatMap(v => strokes(glass, width, height, v, minLength, 2).map(s => ({ ...s, glazing: true }))));
  // Merge collinear wall pieces across door/window gaps. Store those intervals
  // as openings instead of extruding a solid wall through them.
  const tolerance = Math.max(5, minThickness * 2), gapLimit = Math.min(width, height) * .15;
  const merged = [];
  // Two outlines of one coloured wall can sit a few pixels apart; the
  // tolerance follows the thinner stroke so one wall is not read as two.
  const collinear = (m, s) => Math.abs(m.c - s.c) <= (m.glazing || s.glazing ? tolerance : Math.max(3, minThickness, Math.min(m.thickness, s.thickness) * .75));
  for (const s of segments.sort((a, b) => a.a - b.a)) {
    let m = merged.find(m => m.vertical === s.vertical && collinear(m, s) && s.a <= m.b + gapLimit && s.b >= m.a - gapLimit);
    // A long window drawn as thin lines along the wall axis (no blue glass
    // tint) still continues the wall: bridge it and record it as glazing.
    if (!m && !s.glazing) {
      m = merged.find(m => m.vertical === s.vertical && !m.glazing && collinear(m, s) && s.a > m.b + gapLimit
        && s.a - m.b <= gapLimit * 2.5 && windowLines({ width, height, data }, s.vertical, (m.c + s.c) / 2, Math.max(m.thickness, s.thickness), m.b, s.a));
      if (m) m.spans.push({ a: m.b, b: s.a, glazing: true });
    }
    if (!m) { merged.push({ ...s, weight:s.glazing?0:(s.b-s.a)*s.thickness, spans: [{ a: s.a, b: s.b, glazing: !!s.glazing }] }); continue; }
    if(!s.glazing){
      const weight=(s.b-s.a)*s.thickness;
      if(m.weight)m.c=(m.c*m.weight+s.c*weight)/(m.weight+weight);
      else {m.c=s.c;m.wallTone=s.wallTone;}
      m.weight+=weight;
    }
    m.glazing = m.glazing && s.glazing;
    m.thickness = Math.max(m.thickness, s.thickness);
    m.a = Math.min(m.a, s.a); m.b = Math.max(m.b, s.b);
    m.spans.push({ a: s.a, b: s.b, glazing: !!s.glazing });
  }
  for (const m of merged) if (!m.glazing) for (const w of windowSpans({ width, height, data }, mask, m, Math.max(8, minThickness * 2))) m.spans.push({ ...w, glazing: true });
  segments = merged.filter((s, i) => !merged.some((q, j) => j !== i && q.vertical === s.vertical && Math.abs(s.c - q.c) < Math.max(s.thickness, q.thickness) * 1.6 && q.thickness > s.thickness * 1.5 && Math.min(s.b, q.b) - Math.max(s.a, q.a) > (s.b - s.a) * .75));
  // Blue upholstery is not glazing. A glass-only span may join architecture
  // only when both of its measured ends already meet structural strokes;
  // extending a sofa back across a room manufactures an extra partition.
  segments = segments.filter(s => !s.glazing || ['a','b'].every(end => segments.some(q => !q.glazing && q.vertical !== s.vertical
    && Math.abs(s[end]-q.c)<=tolerance*1.5 && s.c>=q.a-tolerance && s.c<=q.b+tolerance)));
  // Review short neutral strokes only AFTER collinear pieces have joined:
  // two real wall pieces around a door must survive as one architectural run.
  segments=segments.filter(s=>s.glazing||s.wallTone===undefined||s.wallTone>.3||s.b-s.a>=minLength*2||['a','b'].every(end=>
    segments.some(q=>q!==s&&q.vertical!==s.vertical&&Math.abs(s[end]-q.c)<=minThickness
      &&s.c>=q.a-minThickness&&s.c<=q.b+minThickness)));
  // Connect measured T/corner junctions. Prefer the closest crossing; don't
  // extend through a nearer wall to a more distant one.
  for (const s of segments) {
    for (const end of ['a', 'b']) {
      let nearest = null, distance = gapLimit, glazed = false;
      for (const q of segments) {
        if (q.vertical === s.vertical || s.c < q.a - tolerance || s.c > q.b + tolerance) continue;
        if (end === 'a' && q.c > s.a + tolerance || end === 'b' && q.c < s.b - tolerance) continue;
        const d = Math.abs(q.c - s[end]);
        const close=Math.max(s.thickness,typicalThickness)*2;
        let windowRun = false;
        if(d>close){
          const a=s.vertical?{x:s.c,y:s[end]}:{x:s[end],y:s.c};
          const b=s.vertical?{x:s.c,y:q.c}:{x:q.c,y:s.c};
          // A wall that ends in a long window still reaches its corner.
          windowRun = !s.glazing && windowLines({ width, height, data }, s.vertical, s.c, s.thickness, Math.min(s[end], q.c), Math.max(s[end], q.c));
          if(!windowRun&&(d>=gapLimit||!blueprintDoorSwing({width,height,data},a,b,typicalThickness)))continue;
        }
        if (d < distance || windowRun && d <= gapLimit * 2.5 && !nearest) { nearest = q; distance = d; glazed = windowRun; }
      }
      if (nearest) {
        if (glazed) s.spans.push({ a: Math.min(s[end], nearest.c), b: Math.max(s[end], nearest.c), glazing: true });
        s[end] = nearest.c;
      }
    }
  }
  closeDoorCorners(segments, tolerance, gapLimit);
  for (const s of segments) for (const q of segments) {
    if (s.vertical === q.vertical) continue;
    const reach = Math.max(tolerance, s.thickness * 1.5, q.thickness * 1.5);
    if (s.c >= q.a - reach && s.c <= q.b + reach && q.c >= s.a - reach && q.c <= s.b + reach) {
      s.a = Math.min(s.a, q.c); s.b = Math.max(s.b, q.c);
      q.a = Math.min(q.a, s.c); q.b = Math.max(q.b, s.c);
    }
  }
  // Recover short solid returns between offset parallel walls. These are
  // measured colour bands, not extensions across open corridor floor.
  const returns=[];
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const a=segments[i],b=segments[j];if(a.vertical!==b.vertical)continue;
    const gap=Math.abs(a.c-b.c);if(gap<minThickness*2||gap>Math.min(minLength*2,Math.max(a.thickness,b.thickness)*5))continue;
    for(const ae of ['a','b'])for(const be of ['a','b']){
      if(Math.abs(a[ae]-b[be])>Math.max(a.thickness,b.thickness))continue;
      const c=(a[ae]+b[be])/2,lo=Math.min(a.c,b.c),hi=Math.max(a.c,b.c);
      if([...segments,...returns].some(q=>q.vertical!==a.vertical&&Math.abs(q.c-c)<tolerance&&q.a<=lo+tolerance&&q.b>=hi-tolerance))continue;
      let ink=0,total=0,sideInk=0,sideTotal=0;
      for(let t=Math.ceil(lo);t<=hi;t++)for(let d=-1;d<=1;d++){
        const x=Math.round(a.vertical?t:c+d),y=Math.round(a.vertical?c+d:t);if(x<0||y<0||x>=width||y>=height)continue;
        const at=(y*width+x)*4,high=Math.max(data[at],data[at+1],data[at+2]),low=Math.min(data[at],data[at+1],data[at+2]);
        total++;if(high<220&&high-low<30)ink++;
      }
      const sideDistance=Math.min(a.thickness,b.thickness)+3;
      for(let t=Math.ceil(lo);t<=hi;t++)for(const side of [-1,1]){
        const x=Math.round(a.vertical?t:c+side*sideDistance),y=Math.round(a.vertical?c+side*sideDistance:t);
        if(x<0||y<0||x>=width||y>=height)continue;const at=(y*width+x)*4;
        sideTotal++;if(Math.max(data[at],data[at+1],data[at+2])<220)sideInk++;
      }
      if(total&&ink/total>=.75&&sideTotal&&sideInk/sideTotal<.3){
        const thickness=Math.min(a.thickness,b.thickness);returns.push({vertical:!a.vertical,c,a:lo,b:hi,thickness,spans:[{a:lo,b:hi,glazing:false}]});
        a[ae]=c;b[be]=c;
      }
    }
  }
  segments.push(...returns);
  const touches = (s, q) => s.vertical !== q.vertical && s.c >= q.a - tolerance && s.c <= q.b + tolerance && q.c >= s.a - tolerance && q.c <= s.b + tolerance;
  // The main connected architecture wins over detached furniture and inset
  // location diagrams. Reject tiny dangling branches (bed/chair outlines).
  const groups = [], visited = new Set();
  for (const s of segments) {
    if (visited.has(s)) continue;
    const group = [s]; visited.add(s);
    for (let j = 0; j < group.length; j++) for (const q of segments) {
      if (!visited.has(q) && touches(group[j], q)) { visited.add(q); group.push(q); }
    }
    groups.push(group);
  }
  segments = groups.sort((a, b) => b.reduce((n, s) => n + s.b - s.a, 0) - a.reduce((n, s) => n + s.b - s.a, 0))[0] || [];
  segments = segments.filter(s => s.b - s.a >= 24 && (s.b - s.a > minLength * 2 || segments.filter(q => touches(s, q)).length >= 2));
  if (segments.length < 4) throw new Error('No connected walls found. Use a clear, straight-on floor plan or Trace floor plan.');
  const xs = segments.flatMap(s => s.vertical ? [s.c] : [s.a, s.b]), ys = segments.flatMap(s => s.vertical ? [s.a, s.b] : [s.c]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const scale = widthCm / (x1 - x0);
  const point = (s, p, offset = 0) => s.vertical ? { x: (s.c + offset - x0) * scale, z: (p - y0) * scale } : { x: (p - x0) * scale, z: (s.c + offset - y0) * scale };
  const lines = [], doors = [], windows = [];
  segments.forEach((s, i) => {
    const thickness = Math.max(8, Math.min(35, s.thickness * scale));
    // Each pair gets its own layer so the CAD adapter pairs the two faces of
    // THIS wall rather than two nearby architectural centre lines.
    for (const offset of [-thickness / scale / 2, thickness / scale / 2])
      lines.push({ a: point(s, s.a, offset), b: point(s, s.b, offset), layer: 'raster-' + i });
    const spans = s.spans.sort((a, b) => a.a - b.a);
    const gaps = [];
    let last = s.a;
    for (const span of spans) {
      if (span.a - last > tolerance * 2) gaps.push({ a: last, b: span.a });
      if (span.glazing) gaps.push({ a: span.a, b: span.b, glazing: true });
      last = Math.max(last, span.b);
    }
    if (s.b - last > tolerance * 2) gaps.push({ a: last, b: s.b });
    for (const gap of gaps) {
      const lo = Math.max(s.a + 3, gap.a), hi = Math.min(s.b - 3, gap.b), size = (hi - lo) * scale;
      if (size < 40 || size > 450) continue;
      const exterior = s.vertical ? Math.abs(s.c - x0) < tolerance || Math.abs(s.c - x1) < tolerance : Math.abs(s.c - y0) < tolerance || Math.abs(s.c - y1) < tolerance;
      const record = { center: point(s, (lo + hi) / 2), width: size, height: 205, sill: 0 };
      if (gap.glazing || exterior && size > 110) windows.push({ ...record, height: 120, sill: 90 });
      else doors.push(record);
    }
  });
  const rooms = rasterRooms(segments, width, height, x0, y0, scale);
  if (!rooms.length && requireRooms) throw new Error('Walls were found but no enclosed rooms. Use a clearer image or Trace floor plan.');
  const warnings = ['Automatic draft: check walls, doors and windows against the image. Room labels and furniture are not recognized. Set the full detected plan width to calibrate dimensions.'];
  const wallMaterials = sheetWallMaterials({ width, height, data }, segments);
  const wallTypeByLayer = {};
  wallMaterials.forEach((m, i) => { if (m) wallTypeByLayer['raster-' + i] = m; });
  if (wallMaterials.some(Boolean)) warnings.push(WALL_MATERIAL_WARNING);
  return { cad: { lines, doors, windows }, layout: { w: widthCm, d: (y1 - y0) * scale, rooms, doors: [], windows: [] }, floorplan: { rooms, walls: [], warnings }, warnings, repaired: false, imageSize: { width, height }, bounds: { x0, y0, x1, y1 }, segments, wallMaterials, wallTypeByLayer };
}

export const WALL_MATERIAL_WARNING = 'Wall materials follow the sheet colours (blue = reinforced concrete, load-bearing; red = block infill); verify against the structural drawings.';

// Fill colour of one wall run: 'concrete' when blue fill dominates, 'block'
// when red does, null for black/gray or mixed (e.g. a block wall with
// concrete columns merged into one run).
export function wallFill({ width, height, data }, s) {
  const half = Math.max(1, Math.floor(s.thickness / 2));
  let blue = 0, red = 0, total = 0;
  for (let p = Math.ceil(s.a); p <= Math.floor(s.b); p++) for (let d = -half; d <= half; d++) {
    const x = Math.round(s.vertical ? s.c + d : p), y = Math.round(s.vertical ? p : s.c + d);
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    total++;
    if (pocheInk(r, g, b)) b > r ? blue++ : red++;
  }
  if (!total || blue + red < total * .15) return null;
  return blue >= red * 2 ? 'concrete' : red >= blue * 2 ? 'block' : null;
}

// Only a sheet that colours walls in BOTH conventions (Israeli permit plans:
// blue concrete, red block) is read as material information; a sheet that
// is merely blue or red throughout says nothing about structure.
export function sheetWallMaterials(image, segments) {
  const fills = segments.map(s => s.glazing ? null : wallFill(image, s));
  return fills.includes('concrete') && fills.includes('block') ? fills : fills.map(() => null);
}

// A door in a room's corner leaves two free wall ends pointing at the same
// corner (a horizontal end and a vertical end). Extend both to meet: the
// longer reach is the door gap, the shorter one is solid wall.
export function closeDoorCorners(segments, tolerance, gapLimit) {
  const free = (s, end) => !segments.some(q => q !== s && q.vertical !== s.vertical && Math.abs(q.c - s[end]) <= tolerance
    && s.c >= q.a - tolerance && s.c <= q.b + tolerance);
  for (const s of segments) {
    if (s.vertical || s.glazing) continue;
    for (const se of ['a', 'b']) {
      if (!free(s, se)) continue;
      let best = null;
      for (const q of segments) {
        if (!q.vertical || q.glazing) continue;
        for (const qe of ['a', 'b']) {
          // Reach of each wall towards the corner (q.c, s.c); never backwards.
          const ds = se === 'b' ? q.c - s.b : s.a - q.c, dq = qe === 'b' ? s.c - q.b : q.a - s.c;
          if (ds < -tolerance || dq < -tolerance || Math.max(ds, dq) <= tolerance || Math.max(ds, dq) > gapLimit) continue;
          if (!free(q, qe) || best && ds + dq >= best.reach) continue;
          best = { q, qe, ds, dq, reach: ds + dq };
        }
      }
      if (!best) continue;
      const { q, qe, ds, dq } = best, solid = ds < dq ? s : q, from = ds < dq ? s[se] : q[qe], to = ds < dq ? q.c : s.c;
      solid.spans.push({ a: Math.min(from, to), b: Math.max(from, to), glazing: false });
      s[se] = q.c; q[qe] = s.c;
    }
  }
}

// Windows inside one continuous wall stroke: along the wall, positions where
// the cross-section is solid fill vs only parallel hairlines with paper
// between. A hairline stretch with solid wall on both sides is a window; a
// wall that is hairlines throughout is a thin partition and has none.
export function windowSpans({ width, height, data }, mask, s, minRun) {
  const half = Math.ceil(s.thickness / 2), solidRun = Math.max(3, s.thickness * .6), kind = [];
  for (let p = Math.ceil(s.a); p <= Math.floor(s.b); p++) {
    let lines = 0, run = 0, longest = 0, inLine = false;
    for (let d = -half; d <= half; d++) {
      const x = Math.round(s.vertical ? s.c + d : p), y = Math.round(s.vertical ? p : s.c + d);
      const inside = x >= 0 && y >= 0 && x < width && y < height, i = (y * width + x) * 4;
      const ink = inside && (mask[y * width + x] || Math.max(data[i], data[i + 1], data[i + 2]) < 175);
      if (ink && !inLine) lines++;
      run = ink && inside && mask[y * width + x] ? run + 1 : 0; longest = Math.max(longest, run);
      inLine = ink;
    }
    kind.push(longest >= solidRun ? 's' : lines >= 2 ? 'l' : '-');
  }
  const out = [];
  for (let i = 0; i < kind.length;) {
    if (kind[i] !== 'l') { i++; continue; }
    let j = i;
    // A grid or dimension line crossing the window is a 1–2 px interruption.
    while (j < kind.length && (kind[j] === 'l' || kind.slice(j + 1, j + 3).includes('l'))) j++;
    const before = kind.slice(Math.max(0, i - minRun), i).includes('s'), after = kind.slice(j, j + minRun).includes('s');
    if (j - i >= minRun && before && after) out.push({ a: s.a + i, b: s.a + j });
    i = j;
  }
  return out;
}

// True when the band between two wall pieces carries at least two thin lines
// running along the wall for most of its length: the sill/glass lines of a
// window. A door gap is open floor (its swing crosses the band only briefly).
export function windowLines({ width, height, data }, vertical, c, thickness, from, to) {
  const half = Math.ceil(thickness / 2) + 1;
  let lined = 0, total = 0;
  for (let p = Math.ceil(from) + 1; p < to - 1; p++) {
    let lines = 0, inLine = false;
    for (let d = -half; d <= half; d++) {
      const x = Math.round(vertical ? c + d : p), y = Math.round(vertical ? p : c + d);
      if (x < 0 || y < 0 || x >= width || y >= height) { inLine = false; continue; }
      const i = (y * width + x) * 4, ink = Math.max(data[i], data[i + 1], data[i + 2]) < 175;
      if (ink && !inLine) lines++;
      inLine = ink;
    }
    total++;
    if (lines >= 2) lined++;
  }
  return total >= 8 && lined / total >= .75;
}

function rasterRooms(segments, width, height, x0, y0, scale) {
  const blocked = new Uint8Array(width * height), seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  for (const s of segments) for (let p = Math.ceil(s.a); p <= Math.floor(s.b); p++) for (let d = -2; d <= 2; d++) {
    const x = Math.round(s.vertical ? s.c + d : p), y = Math.round(s.vertical ? p : s.c + d);
    if (x >= 0 && y >= 0 && x < width && y < height) blocked[y * width + x] = 1;
  }
  const rooms = [];
  for (let i = 0; i < blocked.length; i++) {
    if (blocked[i] || seen[i]) continue;
    let head = 0, tail = 1, edge = false, minX = width, maxX = 0, minY = height, maxY = 0;
    queue[0] = i; seen[i] = 1;
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (!x || !y || x === width - 1 || y === height - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && !blocked[q] && !seen[q]) { seen[q] = 1; queue[tail++] = q; }
      }
    }
    if (!edge && tail * scale * scale > 15000 && Math.min(maxX - minX, maxY - minY) * scale > 70)
      rooms.push({ name: 'Room ' + (rooms.length + 1), x0: (minX - x0) * scale, z0: (minY - y0) * scale, x1: (maxX - x0) * scale, z1: (maxY - y0) * scale, floor: 'wood' });
  }
  return rooms;
}
