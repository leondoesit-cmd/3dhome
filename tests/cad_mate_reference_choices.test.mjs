import test from "node:test";
import assert from "node:assert/strict";
import { exactMateReferenceChoices, planarMateFaceChoices } from "../js/cad_mate_reference_choices.js";
import { mateAlignmentForLockedOrientation } from "../js/cad_mate_reference_choices.js";
import { solveTopologyMates, topologyReference } from "../js/cad_mates.js";
import {createFrameResolver,worldFrame} from '../js/cad_mate_model.js';

test('exact mate chooser exposes real cylinders and circular rims for the book weight-hook mates',()=>{
 const d={origin:{x:0,y:.635,z:0},axis:{x:0,y:1,z:0},radius:.1905};
 const face={kind:'face',persistentId:'stem',ownerFeatureId:'sweep',semantic:'generated-1',descriptor:{...d,surface:'cylinder'}};
 const edge={kind:'edge',persistentId:'rim',ownerFeatureId:'sweep',semantic:'generated-2',descriptor:{...d,curve:'circle'}};
 const choices=exactMateReferenceChoices([face,edge,face,{...edge,persistentId:'fake',descriptor:{curve:'circle'}}],[{id:'sweep',name:'Sweep 1'}]);
 assert.deepEqual(choices.map(choice=>choice.entry.persistentId),['axis:stem','stem','rim']);
 assert.match(choices[0].label,/Sweep 1.*Exact axis/);
 assert.match(choices[1].label,/Sweep 1.*Cylinder.*R 0\.191/);
 assert.match(choices[2].label,/Circular edge.*Y 0\.635/);
 assert.equal(planarMateFaceChoices([face,edge]).length,0);
});

test('registry resolved circular rims retain their planar geometry for coincident seating',()=>{
 const descriptor={curve:'circle',origin:{x:0,y:.635,z:0},axis:{x:0,y:1,z:0},radius:.1905};
 const entry={kind:'edge',persistentId:'rim',ownerFeatureId:'sweep',descriptor};
 const component={id:'hook',topology:[entry],transform:{x:0,y:0,z:0}};
 const resolve=createFrameResolver({issues:[],rebindings:[]});
 const frame=resolve(topologyReference('hook','edge','rim',descriptor),component,'seat',true);
 assert.equal(frame.curve,'circle');assert.deepEqual(frame.axis,{x:0,y:1,z:0});
});

test("exact narrow planar shoulders remain selectable by feature and persistent face ID", () => {
  const plane = (persistentId, feature, z, measure) => ({
    kind: "face", persistentId, ownerFeatureId: feature, semantic: "generated-2",
    descriptor: { surface: "plane", origin: { x: 0, y: 0, z }, normal: { x: 0, y: 0, z: 1 }, measure },
  });
  const shoulder = plane("feature_muk9illb_4:face:generated:plane:2", "feature_muk9illb_4", -5.588, 0.394);
  const cutShoulder = plane("feature_muk9illb_4:cut:bore:face:generated:plane:1", "feature_muk9illb_4:cut:bore", -5.08, 1.43);
  const flange = plane("feature_mukado6b_1:face:generated:plane:2", "feature_mukado6b_1", 0, 0.749);
  const curved = { ...shoulder, persistentId: "round", descriptor: { ...shoulder.descriptor, surface: "cylinder" } };
  const guessed = { ...shoulder, persistentId: "guess", descriptor: { surface: "plane", normal: { x: 0, y: 0, z: 1 } } };
  const lens = planarMateFaceChoices([shoulder, cutShoulder, curved, guessed, shoulder], [{ id: "feature_muk9illb_4", name: "BulbHole" }]);
  const bulb = planarMateFaceChoices([flange], [{ id: "feature_mukado6b_1", name: "Revolve 1" }]);
  assert.deepEqual(lens.map((choice) => choice.entry.persistentId), [shoulder.persistentId, cutShoulder.persistentId]);
  assert.match(lens[0].label, /BulbHole.*Z -5\.588 cm/);
  assert.match(lens[1].label, /BulbHole.*Z -5\.080 cm/);
  assert.deepEqual(bulb.map((choice) => choice.entry.persistentId), [flange.persistentId]);
  assert.match(bulb[0].label, /Revolve 1.*Z 0\.000 cm/);
});

test("the third lens and bulb face mate preserves orientation fixed by two plane mates", () => {
  const point = (x, y, z) => ({ x, y, z });
  const X = point(1, 0, 0), Y = point(0, 1, 0), Z = point(0, 0, 1);
  const plane = (origin, normal) => ({ surface: "plane", origin, normal });
  const ref = (component, id, frame) => topologyReference(component, "face", id, frame);
  const lensFace = plane(point(0, 0, -5.588), Z), bulbFace = plane(point(0, 0, 0), Z);
  const assembly = {
    components: [
      { id: "lens", grounded: true, transform: point(0, 0, 0) },
      { id: "bulb", transform: point(0, 0, 5) },
    ],
    topologyMates: [
      { id: "right", type: "coincident", aligned: true,
        a: ref("lens", "plane:right", plane(point(0, 0, 0), X)),
        b: ref("bulb", "plane:right", plane(point(0, 0, 0), X)) },
      { id: "top", type: "coincident", aligned: true,
        a: ref("lens", "plane:top", plane(point(0, 0, 0), Y)),
        b: ref("bulb", "plane:top", plane(point(0, 0, 0), Y)) },
    ],
  };
  const first = solveTopologyMates(assembly);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.degreesOfFreedom, 1);
  const aligned = mateAlignmentForLockedOrientation(lensFace, bulbFace,
    assembly.components[0].transform, assembly.components[1].transform, first.degreesOfFreedom);
  assert.equal(aligned, true);
  assert.equal(mateAlignmentForLockedOrientation(lensFace,
    plane(point(0, 0, 0), point(0, 0, -1)), {}, {}, 1), false);
  assert.equal(mateAlignmentForLockedOrientation(lensFace, bulbFace, {}, {}, 3), null);
  assembly.topologyMates.push({ id: "shoulder", type: "coincident", aligned,
    a: ref("lens", "feature_muk9illb_4:face:generated:plane:2", lensFace),
    b: ref("bulb", "feature_mukado6b_1:face:generated:plane:2", bulbFace) });
  const final = solveTopologyMates(assembly);
  assert.equal(final.ok, true, JSON.stringify(final));
  assert.equal(final.unsatisfied.length, 0);
  assert.equal(final.degreesOfFreedom, 0);
  assert.ok(Math.abs(assembly.components[1].transform.z + 5.588) < 1e-5);
});

test("removing a conflicting face mate heals two aligned planes from a saved half-turn pose", () => {
  const P = (x, y, z) => ({ x, y, z });
  const F = (normal) => ({ surface: "plane", origin: P(0, 0, 0), normal });
  for (const angles of [[180, 0, 0], [0, 180, 0], [180, 0, 180]]) {
    const assembly = {
      components: [
        { id: "lens", grounded: true, transform: P(0, 0, 0) },
        { id: "bulb", transform: { x: 0, y: 0, z: -5, rx: angles[0], ry: angles[1], rz: angles[2] } },
      ],
      topologyMates: [
        { id: "right", type: "coincident", aligned: true,
          a: topologyReference("lens", "face", "plane:right", F(P(1, 0, 0))),
          b: topologyReference("bulb", "face", "plane:right", F(P(1, 0, 0))) },
        { id: "top", type: "coincident", aligned: true,
          a: topologyReference("lens", "face", "plane:top", F(P(0, 1, 0))),
          b: topologyReference("bulb", "face", "plane:top", F(P(0, 1, 0))) },
      ],
    };
    const result = solveTopologyMates(assembly);
    assert.equal(result.ok, true, `${angles}: ${JSON.stringify(result)}`);
    assert.equal(result.unsatisfied.length, 0);
    assert.equal(result.degreesOfFreedom, 1);
  }
});

test('the book bulb seating keeps glass in the cavity after save and reopening',()=>{
  const P=(x,y,z)=>({x,y,z}), F=(z,normal)=>({surface:'plane',origin:P(0,0,z),normal});
  const lens={id:'lens',grounded:true,transform:P(0,0,0)},bulb={id:'bulb',transform:P(0,0,0)};
  const mate=(id,aligned,frameA,frameB)=>({id,type:'coincident',aligned,a:topologyReference('lens','face',id+':a',frameA),b:topologyReference('bulb','face',id+':b',frameB)});
  const assembly={components:[lens,bulb],topologyMates:[mate('right',true,F(0,P(1,0,0)),F(0,P(1,0,0))),mate('top',false,F(0,P(0,1,0)),F(0,P(0,1,0))),mate('opening',false,F(-4.445,P(0,0,1)),F(0,P(0,0,1)))]};
  for(let round=0;round<2;round++){
    const document=round?structuredClone(assembly):assembly;
    const result=solveTopologyMates(document);
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.degreesOfFreedom,0);
    const component=document.components[1];
    assert.ok(Math.abs(component.transform.z+4.445)<1e-7);
    const glass=worldFrame({origin:P(0,0,-1.4)},component,'component').origin;
    const neck=worldFrame({origin:P(0,0,1.27)},component,'component').origin;
    assert.ok(glass.z>-4.445,'glass extends into shell cavity');
    assert.ok(neck.z<-4.445,'base extends through bore');
  }
});
