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
      const band = bands.find(s => c - s.last <= 1 && Math.min(s.b, b) - Math.max(s.a, a) >= Math.min(s.b - s.a, b - a) * .65);
      if (band) { band.last = c; band.a = Math.min(band.a, a); band.b = Math.max(band.b, b); band.samples.push([a,b]); }
      else bands.push({ first: c, last: c, a, b, samples:[[a,b]] });
    }
  }
  return bands.filter(b => b.last - b.first + 1 >= minThickness && b.last - b.first < Math.max(18, Math.min(width, height) * .035))
    .map(b => {
      const median=k=>b.samples.map(s=>s[k]).sort((a,b)=>a-b)[Math.floor(b.samples.length/2)];
      return { vertical, c: (b.first + b.last) / 2, a: median(0), b: median(1)-1, thickness: b.last-b.first+1 };
    });
}

export function recognizeRaster({ width, height, data }, { widthCm = 1000 } = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 32 || height < 32 || width * height > 1600000 || data?.length !== width * height * 4)
    throw new Error('Use a readable floor-plan image at least 32 pixels wide and high.');
  if (!Number.isFinite(widthCm) || widthCm < 100 || widthCm > 10000) throw new Error('Enter a plan width between 100 and 10000 cm.');
  const mask = new Uint8Array(width * height), glass = new Uint8Array(width * height);
  let grayCount = 0, blackCount = 0;
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (Math.max(r, g, b) < 205 && Math.min(r, g, b) >= 160 && Math.max(r, g, b) - Math.min(r, g, b) < 22) grayCount++;
    if (Math.max(r, g, b) < 100) blackCount++;
  }
  const grayPlan = grayCount > blackCount * 2;
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    mask[i] = data[i * 4 + 3] > 127 && (grayPlan ? hi < 205 && lo >= 160 && hi - lo < 22 : hi < 140) ? 1 : 0;
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
  for (const s of segments.sort((a, b) => a.a - b.a)) {
    const m = merged.find(m => m.vertical === s.vertical && Math.abs(m.c - s.c) <= (m.glazing||s.glazing?tolerance:Math.max(3,minThickness)) && s.a <= m.b + gapLimit && s.b >= m.a - gapLimit);
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
      let nearest = null, distance = gapLimit;
      for (const q of segments) {
        if (q.vertical === s.vertical || s.c < q.a - tolerance || s.c > q.b + tolerance) continue;
        if (end === 'a' && q.c > s.a + tolerance || end === 'b' && q.c < s.b - tolerance) continue;
        const d = Math.abs(q.c - s[end]);
        const close=Math.max(s.thickness,typicalThickness)*2;
        if(d>close){
          const a=s.vertical?{x:s.c,y:s[end]}:{x:s[end],y:s.c};
          const b=s.vertical?{x:s.c,y:q.c}:{x:q.c,y:s.c};
          if(!blueprintDoorSwing({width,height,data},a,b,typicalThickness))continue;
        }
        if (d < distance) { nearest = q; distance = d; }
      }
      if (nearest) s[end] = nearest.c;
    }
  }
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
  if (!rooms.length) throw new Error('Walls were found but no enclosed rooms. Use a clearer image or Trace floor plan.');
  const warnings = ['Automatic draft: check walls, doors and windows against the image. Room labels and furniture are not recognized. Set the full detected plan width to calibrate dimensions.'];
  return { cad: { lines, doors, windows }, layout: { w: widthCm, d: (y1 - y0) * scale, rooms, doors: [], windows: [] }, floorplan: { rooms, walls: [], warnings }, warnings, repaired: false, imageSize: { width, height }, bounds: { x0, y0, x1, y1 }, segments };
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
