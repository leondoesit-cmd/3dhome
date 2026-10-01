import test from 'node:test';
import assert from 'node:assert/strict';
import {solveTopologyMates, topologyReference} from '../js/cad_mates.js';
import {screwRoll, gearRatio, worldFrame, angleBetween} from '../js/cad_mate_model.js';
import {setGearMatePhase} from '../js/cad_gear_motion.js';
import {createMotionStudy,addRotaryMotor,addGearRelation,evaluateMotionStudy} from '../js/cad_motion_study.js';

// Synthetic frames exercise the solver only; they are not an ebook part.
const cyl = (origin, axis) => ({surface:'cylinder', origin, axis, radius:1});
const plane = (origin, normal) => ({surface:'plane', origin, normal});
const ref = (component, id, frame) => topologyReference(component, 'face', id, frame);
const zero = {x:0, y:0, z:0};
const T = (x = 0, y = 0, z = 0, rz = 0, ry = 0) => ({x, y, z, rx:0, ry, rz});
const deg = value => value * 180 / Math.PI;

test('opposed screw axes keep the reversed shaft orientation while turns advance along the fixed bore', () => {
  const assembly = {
    components:[{id:'base',grounded:true,transform:T()},{id:'shaft',transform:T()}],
    topologyMates:[{id:'screw',type:'screw',axisOpposed:true,pitch:1,turns:2,
      a:ref('base','bore',cyl(zero,{x:1,y:0,z:0})),
      b:ref('shaft','shaft',cyl(zero,{x:-1,y:0,z:0}))}],
  };
  for (const turns of [2,3,-1]) {
    assembly.topologyMates[0].turns=turns;
    const result=solveTopologyMates(assembly);
    assert.equal(result.ok,true,JSON.stringify(result));
    const frame=worldFrame(assembly.topologyMates[0].b.frame,assembly.components[1],'component');
    assert.ok(frame.axis.x < -.999999,'shaft remains opposed instead of being flipped');
    assert.ok(Math.abs(frame.origin.x-turns)<1e-6,'pitch advance still follows the fixed axis');
  }
});

function gears(teethA, teethB, reverse = false) {
  return {
    components:[
      {id:'plate', grounded:true, transform:T()},
      {id:'gearA', transform:T(0, 0, 0)},
      {id:'gearB', transform:T(36, 0, 0)},
    ],
    topologyMates:[{
      id:'gear', type:'gear', ratioA:teethA, ratioB:teethB, reverse,
      a:ref('gearA', 'ax-a', cyl(zero, {x:0, y:0, z:1})),
      b:ref('gearB', 'ax-b', cyl(zero, {x:0, y:0, z:1})),
    }],
  };
}

test('gear phase reindexes teeth while preserving ratio and resetting the timeline zero pose',()=>{
  const assembly=gears(20,40);solveTopologyMates(assembly);
  const study=createMotionStudy(assembly);addRotaryMotor(study,'gearA',5,{x:0,y:0,z:1});
  addGearRelation(study,'gearA','gearB',{driverTeeth:20,followerTeeth:40,driverAxis:{x:0,y:0,z:1},followerAxis:{x:0,y:0,z:1}});
  assert.equal(evaluateMotionStudy(assembly,study.id,1).ok,true);
  const before=JSON.stringify(assembly);
  const changed=setGearMatePhase(assembly,'gear',4.5);
  assert.equal(changed.ok,true,JSON.stringify(changed));
  assert.equal(JSON.stringify(assembly),before,'phase adjustment is atomic and leaves its source untouched');
  const phased=changed.assembly;
  assert.ok(Math.abs(deg(screwRoll(phased.components[2],{x:0,y:0,z:1}))+10.5)<1e-4);
  assert.equal(phased.motionStudies[0].time,0);
  assert.equal(phased.motionStudies[0].motors[0].rpm,5);
  assert.equal(phased.motionStudies[0].baseRotations,undefined);
  assert.equal(evaluateMotionStudy(phased,study.id,1).ok,true);
  assert.ok(Math.abs(deg(screwRoll(phased.components[1],{x:0,y:0,z:1}))-60)<1e-4);
  assert.ok(Math.abs(deg(screwRoll(phased.components[2],{x:0,y:0,z:1}))+25.5)<1e-4);
  const reopened=JSON.parse(JSON.stringify(phased));
  assert.equal(evaluateMotionStudy(reopened,study.id,2).ok,true);
  assert.ok(Math.abs(deg(screwRoll(reopened.components[2],{x:0,y:0,z:1}))+40.5)<1e-4);
  assert.equal(setGearMatePhase(assembly,'gear',NaN).ok,false);
});

test('Chapter 8.8 gear mate turns the driven gear by minus the tooth ratio', () => {
  const assembly = gears(24, 12);
  const start = solveTopologyMates(assembly);
  assert.equal(start.ok, true, JSON.stringify(start));
  const [, gearA, gearB] = assembly.components;
  assert.equal(gearRatio(assembly.topologyMates[0]), 2);
  assert.ok(Number.isFinite(assembly.topologyMates[0].rollA0), 'the first solve records the starting rolls');
  for (const drive of [30, 60, 89, -45]) {
    gearA.transform.rz = drive;
    delete gearA.transform.q;
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, JSON.stringify(result));
    // the gear axis is +Z, so the roll about it is the component's rz
    const turnedB = deg(screwRoll(gearB, {x:0, y:0, z:1})) - deg(assembly.topologyMates[0].rollB0);
    const wrapped = ((turnedB + 540) % 360) - 180;
    const expected = (((-2 * drive) + 540) % 360 + 360) % 360 - 180;
    assert.ok(Math.abs(wrapped - expected) < 1e-4, `drive ${drive}: gear B turned ${wrapped}, expected ${expected}`);
    assert.ok(Math.abs(gearB.transform.x - 36) < 1e-6 && Math.abs(gearB.transform.y) < 1e-6, 'only the roll moves');
  }
});

test('gear mate takes one of gear B six freedoms and reverse flips the direction', () => {
  const assembly = gears(20, 20);
  const result = solveTopologyMates(assembly);
  assert.equal(result.degreesOfFreedom, 5);
  assert.equal(result.clusters[0].perComponent.gearB, 5);
  const internal = gears(20, 20, true);
  solveTopologyMates(internal);
  internal.components[1].transform.rz = 40; delete internal.components[1].transform.q;
  solveTopologyMates(internal);
  const turned = deg(screwRoll(internal.components[2], {x:0, y:0, z:1})) - deg(internal.topologyMates[0].rollB0);
  assert.ok(Math.abs(turned - 40) < 1e-4, 'internal / same-direction gears turn the same way');
});

function rollers(z1, z2, kind = 'axis') {
  const mirror = plane(zero, {x:0, y:0, z:1});
  const frame = kind === 'axis' ? cyl(zero, {x:0, y:1, z:0}) : plane(zero, {x:0, y:0, z:1});
  return {
    components:[
      {id:'bracket', grounded:true, transform:T()},
      {id:'r1', transform:T(10, 0, z1)},
      {id:'r2', transform:T(10, 0, z2)},
    ],
    topologyMates:[{
      id:'sym', type:'symmetric',
      a:ref('r1', 'a', frame), b:ref('r2', 'b', frame), c:ref('bracket', 'front', mirror),
    }],
  };
}

test('Chapter 8.7 symmetric mate mirrors one roller across the bracket Front plane', () => {
  for (const [z1, z2] of [[8, -3], [5, 5], [-4, 9]]) {
    const assembly = rollers(z1, z2);
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, JSON.stringify(result));
    const [, r1, r2] = assembly.components;
    assert.ok(Math.abs(r1.transform.z - z1) < 1e-7, 'the driver is not dragged');
    assert.ok(Math.abs(r2.transform.z + z1) < 1e-6, `roller 2 z=${r2.transform.z}, expected ${-z1}`);
    assert.ok(Math.abs(r2.transform.x - 10) < 1e-6);
  }
});

test('symmetric mate follows the driver when it moves, and keeps roller 2 free to spin and slide along its axis', () => {
  const assembly = rollers(8, -8);
  assert.equal(solveTopologyMates(assembly).ok, true);
  for (const z1 of [12, 3, -6]) {
    assembly.components[1].transform.z = z1;
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.ok(Math.abs(assembly.components[2].transform.z + z1) < 1e-6);
  }
  const report = solveTopologyMates(assembly);
  // axis mirror takes 4 of roller 2's six freedoms; the axial slide and the spin remain
  assert.equal(report.clusters[0].perComponent.r2, 2);
});

test('symmetric mate also mirrors planar faces', () => {
  const assembly = rollers(6, -1, 'plane');
  assembly.components[2].transform.z = -1;
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  // the face planes' origins are the component origins: b's plane sits at the mirror of a's
  assert.ok(Math.abs(assembly.components[2].transform.z + 6) < 1e-6);
});

test('symmetric mate refuses a plane paired with an axis and a missing mirror plane', () => {
  const mixed = rollers(6, -6);
  mixed.topologyMates[0].b = ref('r2', 'b', plane(zero, {x:0, y:1, z:0}));
  assert.equal(solveTopologyMates(mixed).ok, false);
  const missing = rollers(6, -6);
  delete missing.topologyMates[0].c;
  assert.equal(solveTopologyMates(missing).ok, false);
});

function hinge(angleStart, mate) {
  const a = {surface:'plane', origin:zero, normal:{x:1, y:0, z:0}};
  const rad = angleStart * Math.PI / 180;
  return {
    components:[{id:'body', grounded:true, transform:T()}, {id:'handle', transform:T(0, 0, 0, angleStart)}],
    topologyMates:[{id:'angle', type:'angle', aligned:true, value:165, ...mate,
      a:ref('body', 'pa', a), b:ref('handle', 'pb', a)}],
    rad,
  };
}
function angleOf(assembly) {
  const rz = assembly.components[1].transform.rz * Math.PI / 180;
  return Math.abs(deg(Math.acos(Math.cos(rz))));
}

test('Chapter 8.6 angle mate holds the handle at 165 degrees', () => {
  const assembly = hinge(20, {});
  const result = solveTopologyMates(assembly);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(Math.abs(angleOf(assembly) - 165) < 1e-4, String(angleOf(assembly)));
});

test('Chapter 8.3 angle range behaves as a limit angle: interior poses stay, overshoots return to the end stop', () => {
  for (const [start, expected] of [[100, 100], [20, 30], [175, 150]]) {
    const assembly = hinge(start, {angleMin:30, angleMax:150});
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, `${start}: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(angleOf(assembly) - expected) < 1e-4, `${start} -> ${angleOf(assembly)}, expected ${expected}`);
  }
  const inside = hinge(100, {angleMin:30, angleMax:150});
  const result = solveTopologyMates(inside);
  assert.ok(result.degreesOfFreedom >= 1, 'a range leaves the swing free between its stops');
});

test('Chapter 8.3 hinge limit recovers an opposed Front plane without tilting its held concentric axis', () => {
  // Synthetic hinge only: opposed Right planes leave an X-axis swing. The
  // drifted Y rotation recreates a saved pose whose sequential plane alignment
  // puts Front normals at a half turn before the angle range is enforced.
  const right=plane(zero,{x:1,y:0,z:0}),front=plane(zero,{x:0,y:0,z:1});
  const assembly={components:[
    {id:'body',grounded:true,transform:T()},
    {id:'handle',transform:T(.37,-2,3,0,-150)},
  ],topologyMates:[
    {id:'hinge-axis',type:'concentric',aligned:false,
      a:ref('body','axis-a',cyl(zero,{x:-1,y:0,z:0})),
      b:ref('handle','axis-b',cyl(zero,{x:1,y:0,z:0}))},
    {id:'centre',type:'coincident',aligned:false,
      a:ref('body','right-a',right),b:ref('handle','right-b',right)},
    {id:'swing',type:'angle',aligned:false,value:120,angleMin:0,angleMax:150,
      a:ref('body','front-a',front),b:ref('handle','front-b',front)},
  ]};
  const result=solveTopologyMates(assembly);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.degreesOfFreedom,1,'the hinge keeps its swing freedom');
  const handle=assembly.components[1],axis=worldFrame(right,handle,'component').normal;
  assert.ok(Math.abs(axis.x+1)<1e-6 && Math.hypot(axis.y,axis.z)<1e-6,
    `the centred hinge axis stays opposed to body Right: ${JSON.stringify(axis)}`);
  assert.ok(Math.hypot(handle.transform.x,handle.transform.y,handle.transform.z)<1e-6,
    'the concentric and centre mates remove the initial translation drift');
  const swing=deg(angleBetween(front.normal,worldFrame(front,handle,'component').normal));
  assert.ok(Math.abs(swing-150)<1e-4,`the opposed Front plane returns to the 150-degree stop: ${swing}`);
  const repeated=solveTopologyMates(assembly);
  assert.equal(repeated.ok,true,JSON.stringify(repeated));
  assert.equal(repeated.degreesOfFreedom,1,'a repeated solve preserves the hinge motion');
});
