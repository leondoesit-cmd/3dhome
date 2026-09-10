import test from 'node:test';
import assert from 'node:assert/strict';
import { importTrack, room, environment } from './helpers/rc_track.mjs';
const { buildRoad, courseQuality, roomCircuit } = await importTrack();

function checkGeometry(road) {
  assert.ok(road, 'a usable circuit should fit');
  assert.equal(road.quality.valid, true);
  const C = road.center, n = C.length;
  let length = 0;
  for (let i = 0; i < n; i++) {
    const a = C[(i + n - 1) % n], b = C[i], c = C[(i + 1) % n];
    const ab = Math.hypot(a.x - b.x, a.z - b.z), bc = Math.hypot(c.x - b.x, c.z - b.z);
    const ac = Math.hypot(c.x - a.x, c.z - a.z);
    const doubleArea = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
    if (doubleArea > 1e-6) assert.ok(ab * bc * ac / (2 * doubleArea) >= 21.8, 'actual circumradius is too tight');
    assert.ok(bc >= 0.5 && bc <= 12, 'the closing seam must also be continuous');
    length += bc;
    for (let j = i + 13; j < n; j++) {
      if (n - j + i <= 12) continue;
      if (Math.abs(C[j].y - b.y) > 6) continue;
      assert.ok(Math.hypot(C[j].x - b.x, C[j].z - b.z) >= 26, 'distant lanes overlap');
    }
  }
  assert.ok(Math.abs(road.len - length) < 0.01, 'lap length measures the final route');
  assert.equal(road.feats.through, 0);
}

test('automatic room planning uses cycles and omits a dead-end branch', () => {
  const rooms = [room(0, 0, 300, 300), room(300, 0, 300, 300), room(300, 300, 300, 300), room(0, 300, 300, 300), room(600, 300, 300, 300)];
  const connections = [{ a: 0, b: 1, x: 300, z: 150 }, { a: 1, b: 2, x: 450, z: 300 },
    { a: 2, b: 3, x: 300, z: 450 }, { a: 3, b: 0, x: 150, z: 300 }, { a: 2, b: 4, x: 600, z: 450 }];
  const anchors = roomCircuit(rooms, connections);
  assert.equal(anchors.length, 8);
  assert.equal(new Set(anchors.map(p => `${p.x},${p.z}`)).size, anchors.length);
  assert.ok(anchors.every(p => p.x < 600));
  assert.deepEqual(roomCircuit(rooms, connections.slice(0, 3)), []);
});

test('two distinct doorways form a circuit without reusing either doorway', () => {
  const rooms = [room(0, 0, 400, 400), room(400, 0, 400, 400)];
  const doors = [{ a: 0, b: 1, x: 400, z: 100 }, { a: 0, b: 1, x: 400, z: 300 }];
  assert.equal(roomCircuit(rooms, doors).length, 4);
  assert.deepEqual(roomCircuit(rooms, doors.slice(0, 1)), []);
});

test('the old doubled-back two-room tour is replaced by a clear local circuit', () => {
  const rooms = [room(0, 0, 600, 300), room(0, 300, 600, 300)];
  const env = environment(rooms);
  const road = buildRoad([{ x: 300, z: 150 }, { x: 300, z: 300 }, { x: 300, z: 450 }, { x: 300, z: 300 }], rooms, env);
  checkGeometry(road);
  assert.equal(road.feats.rides, 0);
  assert.ok(road.center.every(p => p.z < 300) || road.center.every(p => p.z > 300));
});

test('furniture and wider lanes are checked across the entire course', () => {
  const rooms = [room(0, 0, 700, 500)];
  const rects = [{ x0: 210, z0: 150, x1: 450, z1: 340, y0: 0, y1: 70 }];
  for (const width of [16, 26, 44]) {
    const env = { ...environment(rooms, rects), roadWidth: width };
    const road = buildRoad([], rooms, env);
    checkGeometry(road);
    for (const p of road.center) {
      const d = Math.hypot(Math.max(rects[0].x0 - p.x, 0, p.x - rects[0].x1), Math.max(rects[0].z0 - p.z, 0, p.z - rects[0].z1));
      assert.ok(d > width / 2, 'the lane edge clips furniture');
    }
  }
});

test('a sealed or too-small room fails instead of creating a wall passage', () => {
  const rooms = [room(0, 0, 300, 300)];
  const env = environment(rooms, [{ x0: 0, z0: 0, x1: 300, z1: 300, y0: 0, y1: 200 }]);
  assert.equal(buildRoad([], rooms, env), null);
  const tiny = [room(0, 0, 60, 60)];
  assert.equal(buildRoad([], tiny, environment(tiny)), null);
});

test('quality rejects a tight loop, a crossing, and an obstacle introduced after building', () => {
  // Build independent analytic loops, sampled at approximately 6 cm.
  const loop = radius => {
    const n = Math.ceil(2 * Math.PI * radius / 6);
    return Array.from({ length: n }, (_, i) => ({ x: 250 + radius * Math.cos(i * 2 * Math.PI / n), z: 250 + radius * Math.sin(i * 2 * Math.PI / n), y: 0 }));
  };
  const rooms = [room(0, 0, 500, 500)], env = environment(rooms);
  assert.equal(courseQuality(loop(15), env, rooms).reason, 'turn');
  const C = loop(100);
  assert.equal(courseQuality(C, env, rooms).valid, true);
  assert.equal(courseQuality(C.concat(C), env, rooms).reason, 'overlap');
  assert.equal(courseQuality(C, { ...env, rects: () => [{ x0: 335, z0: 235, x1: 370, z1: 270, y0: 0, y1: 80 }] }, rooms).reason, 'obstacle');
});

test('optional features can be declined without spoiling the validated floor circuit', () => {
  const rooms = [room(0, 0, 700, 500)];
  const env = { ...environment(rooms, [{ x0: 180, z0: 100, x1: 500, z1: 350, y0: 0, y1: 190 }]), homeFeatures: true, hasJump: true };
  const road = buildRoad([], rooms, env);
  checkGeometry(road);
});

test('direction markings cover the floor and identify each segment for upcoming guidance', () => {
  const rooms = [room(0, 0, 600, 400)], env = environment(rooms);
  const road = buildRoad([], rooms, env);
  const guide = road.group.getObjectByName('rcCourseGuide');
  assert.ok(guide);
  assert.equal(guide.userData.courseRanges.length, road.center.length);
  assert.ok(guide.userData.courseRanges.every(r => r.count >= 12), 'centre and both lane boundaries');
  assert.equal(guide.userData.baseColors.length, guide.geometry.getAttribute('color').array.length);
});

test('a crowded starter home still gets a narrow, rounded course', () => {
  const rooms = [room(0, 0, 400, 300)];
  const rects = [[100, 200, 300, 290, 80], [140, 120, 260, 200, 75], [140, 8, 260, 48, 55],
    [35, 230, 75, 270, 120], [15, 12, 75, 72, 90], [70, 12, 150, 72, 90],
    [145, 12, 205, 72, 90], [320, 20, 390, 90, 185], [340, 230, 380, 270, 160]]
    .map(([x0, z0, x1, z1, y1]) => ({ x0, z0, x1, z1, y0: 0, y1 }));
  checkGeometry(buildRoad([], rooms, environment(rooms, rects)));
});

test('an optional furniture climb has broad approaches and markings on both ramps', () => {
  const rooms = [room(0, 0, 1000, 800)];
  const env = { ...environment(rooms, [{ x0: 250, z0: 100, x1: 550, z1: 250, y0: 0, y1: 45 }]), homeFeatures: true };
  const road = buildRoad([], rooms, env);
  checkGeometry(road);
  assert.equal(road.feats.rides, 1);
  assert.ok(road.feats.tour);
  assert.ok(road.center.some(p => p.y >= 45));
  assert.ok(Math.min(...road.center.map(p => p.y)) < 1);
  const ranges = road.group.getObjectByName('rcCourseGuide').userData.courseRanges;
  const rampIndices = road.center.flatMap((p, i) => p.deck ? [i] : []);
  assert.ok(rampIndices.length > 5);
  assert.ok(rampIndices.every(i => ranges.some(r => r.i === i)), 'direction must continue over each ramp');
});

test('an optional jump keeps the validated horizontal course and exact collision gap', () => {
  const rooms = [room(0, 0, 1000, 800)], env = environment(rooms);
  const base = buildRoad([], rooms, env), jump = buildRoad([], rooms, { ...env, hasJump: true });
  checkGeometry(jump);
  assert.equal(jump.feats.jump, true);
  assert.ok(jump.col.gaps.length > 0);
  assert.deepEqual(jump.center.map(p => [p.x, p.z]), base.center.map(p => [p.x, p.z]));
  assert.ok(!base.center.some(p => p.gap));
});

test('a failed build preserves a valid previous track, but removes one invalidated by world edits', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../js/rc_world.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export function buildTrack()'), source.indexOf('export function clearTrack()')).replace('export ', '');
  for (const stillFits of [true, false]) {
    const previous = { center: [], group: {}, col: {} };
    const R = { homeMode: true, track: previous, trackSig: 'same', col: { rects: [], tops: [], segs: [] } };
    const deps = { R, applyPhysicsConfig() {}, detectRooms: () => [room(0, 0, 400, 300)], roomHidden: () => false,
      customAnchors: () => [{ x: 50, z: 50 }, { x: 350, z: 50 }, { x: 350, z: 250 }, { x: 50, z: 250 }],
      findFreeSpot: (x, z) => ({ x, z }), fin: Number.isFinite, blockedAt: () => false, Col2D: { groundAt: () => 0 },
      tourDoors: () => [], buildRoad: () => null, courseQuality: () => ({ valid: stillFits }), planSig: () => 'same',
      clearTrack() { R.track = null; }, hooks: {}, editorSynced() {}, t: k => k };
    const build = Function(...Object.keys(deps), body + '\nreturn buildTrack;')(...Object.values(deps));
    assert.equal(build(), false);
    assert.equal(R.track, stillFits ? previous : null);
    assert.equal(R.trackError, 'rc_course_failed');
  }
});


test('reverse races preserve the safe footprint and reverse waypoint tangents', () => {
  const rooms = [room(0, 0, 600, 400)], env = environment(rooms);
  const forward = buildRoad([], rooms, env), reverse = buildRoad([], rooms, {...env, reverseCourse: true});
  checkGeometry(reverse);
  assert.deepEqual(reverse.center.map(p => [p.x, p.z]), forward.center.map(p => [p.x, p.z]).reverse());
  const p = reverse.center[10], q = reverse.center[11];
  assert.ok(p.ux * (q.x - p.x) + p.uz * (q.z - p.z) > 0);
});

test('house tour prioritizes most furniture and multiple tops over the compact floor fallback', () => {
  const rooms = [room(0,0,400,300)];
  const rects = [[100,200,300,290,80],[140,120,260,200,75],[140,8,260,48,55],
    [35,230,75,270,120],[15,12,75,72,90],[70,12,150,72,90],[145,12,205,72,90],
    [320,20,390,90,185],[340,230,380,270,160]]
    .map(([x0,z0,x1,z1,y1])=>({x0,z0,x1,z1,y0:0,y1}));
  const env = environment(rooms,rects);
  const floor = buildRoad([],rooms,env), tour = buildRoad([],rooms,{...env,homeFeatures:true});
  checkGeometry(tour);
  assert.ok(tour.feats.tour);
  assert.equal(tour.feats.coverage.visited, 9);
  assert.ok(tour.feats.coverage.over >= 3);
  assert.ok(tour.len > floor.len * 2);
  assert.ok(tour.center.every(p=>p.deck));
});

function twoRoomTour(width = 80, height = 210) {
  const rooms = [room(0,0,500,400),room(500,0,500,400)];
  const walls = environment(rooms).segs().filter(s=>s.ax!==500 || s.bx!==500);
  walls.push({ax:500,az:0,bx:500,bz:200-width/2,half:5}, {ax:500,az:200+width/2,bx:500,bz:400,half:5});
  const rects = [{x0:150,z0:150,x1:300,z1:280,y0:0,y1:45}, {x0:650,z0:100,x1:800,z1:200,y0:0,y1:75}];
  const env = {...environment(rooms,rects,walls), homeFeatures:true,
    tourDoors:[{a:0,b:1,x:500,z:200,nx:1,nz:0,ux:0,uz:1,width,height}]};
  return {rooms,env};
}

test('a house with a single doorway gets a flowing tour through both rooms without retracing', () => {
  const {rooms,env} = twoRoomTour();
  const road = buildRoad([],rooms,env);
  checkGeometry(road);
  assert.equal(road.feats.coverage.rooms, 2);
  assert.equal(road.feats.coverage.visited, 2);
  assert.equal(road.feats.coverage.over, 2);
  const crossings = road.center.filter(p=>Math.abs(p.x-500)<3);
  assert.ok(crossings.some(p=>p.z<190));
  assert.ok(crossings.some(p=>p.z>210));
  assert.ok(crossings.every(p=>p.y+10<210));
});

test('tour ramps share endpoint positions and smooth shading normals at every segment including closure', () => {
  const rooms=[room(0,0,1000,800)], env={...environment(rooms,[{x0:250,z0:100,x1:550,z1:250,y0:0,y1:45}]),homeFeatures:true};
  const road=buildRoad([],rooms,env), C=road.center;
  assert.ok(Math.min(...C.map(p=>p.y))<1);
  assert.ok(Math.max(...C.map(p=>p.y))>45);
  const geo=road.group.getObjectByName('rcRoadDeck').geometry;
  const pos=geo.getAttribute('position'), normals=geo.getAttribute('normal');
  const tuple=(a,i)=>[a.getX(i),a.getY(i),a.getZ(i)];
  for(let i=0;i<C.length;i++) {
    const next=(i+1)%C.length;
    // Four quads per slab sample: top, underside, left skirt, right skirt.
    assert.deepEqual(tuple(pos,i*16+1),tuple(pos,next*16));
    assert.deepEqual(tuple(normals,i*16+1),tuple(normals,next*16));
    const a=C[i],b=C[next],c=C[(i+2)%C.length];
    const grade=(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z);
    const nextGrade=(c.y-b.y)/Math.hypot(c.x-b.x,c.z-b.z);
    assert.ok(Math.abs(grade)<=0.56);
    assert.ok(Math.abs(nextGrade-grade)<0.12,'no abrupt crest or ramp seam');
  }
});

test('tour clearance includes ceilings and doorway lintels', () => {
  const {rooms,env}=twoRoomTour();
  const road=buildRoad([],rooms,env);
  const raised=road.center.map(p=>({...p,y:205}));
  assert.equal(courseQuality(raised,env,rooms).reason,'door-height');
  const lowRooms=rooms.map(r=>({...r,ceilH:205}));
  assert.equal(courseQuality(raised,{...env,tourDoors:[]},lowRooms).reason,'ceiling');
});

test('opening an automatic elevated tour does not replace it with manual height constraints', async () => {
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../js/rc_editor.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('export function editorOpen()'),source.indexOf('export function editorClose()')).replace('export ','');
  const accepted=[{x:0,z:0,y:45},{x:100,z:0,y:70},{x:100,z:100,y:45}];
  let writes=0, builds=0;
  const ST={E:{anchors:()=>null,presets:{auto:()=>[]},rooms:()=>[],cfg:{},planSig:()=> 'same',maxView(){},overview(){},msg(){}}};
  const deps={ST,editorActive:()=>false,builtAnchors:()=>accepted,cloneAnchors:a=>a.map(p=>({...p})),window:{},L:(a,b)=>b,
    writeThrough(){writes++;},scheduleBuild(){builds++;}};
  for(const name of ['setViews','sync3d','draw','refreshSelection','refreshFoot','stats','editorStatus','tip','editorSynced',
    'refreshFaces','refreshFollow','refreshHud','facesAdopt','buildDom','build3d','fitView','revalidate','bindKeys']) deps[name]=()=>{};
  Function(...Object.keys(deps),body+'\neditorOpen();')(...Object.values(deps));
  assert.equal(writes,0);
  assert.equal(builds,0);
  assert.deepEqual(ST.D.anchors,accepted);
  assert.equal(ST.E.cfg.customAnchors,undefined);
});
