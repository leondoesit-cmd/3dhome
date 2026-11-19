import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBrepPrimitive, makeBrepExtrusion, booleanBrep, filletBrep, extractBrepTopology,
  validateBrepForExport, shapeToMeshData, disposeBrep,
} from '../js/cad_kernel.js';
import {assemblySourceBodies} from '../js/cad_configured_drawing.js';
import {createSheetDoc, sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';

async function fastenerStack() {
  const owned = [];
  const keep = async promise => { const shape = await promise; owned.push(shape); return shape; };
  // Model units are centimetres. A hex vertex lies on the cutting plane.
  const points = Array.from({length:6}, (_, i) => ({
    u:Math.sin(i * Math.PI / 3), v:Math.cos(i * Math.PI / 3),
  }));
  const hex = () => keep(makeBrepExtrusion({axis:'y', points, from:0, to:.4}));
  const cylinder = (r, h, y=0) => keep(makeBrepPrimitive({type:'cylinder',axis:'y',r,h,y}));
  try {
    const head = await hex(), shaft = await cylinder(.4, 2, .4);
    const blank = await keep(booleanBrep('union', head, shaft));
    extractBrepTopology(blank);
    const rims = blank.topology.filter(e => e.kind === 'edge' && e.descriptor.curve === 'circle');
    assert.equal(rims.length, 2);
    const bolt = await keep(filletBrep(blank, .025, {edgePersistentIds:rims.map(e => e.persistentId)}));
    const washer = await keep(booleanBrep('subtract', await cylinder(.8,.1), await cylinder(.45,.3,-.1)));
    const nut = await keep(booleanBrep('subtract', await hex(), await cylinder(.4,.6,-.1)));
    const components = [];
    for (const [id, shape, y] of [['bolt',bolt,0],['washer',washer,.4],['nut',nut,.5]]) {
      assert.equal((await validateBrepForExport(shape)).valid, true, id);
      const meshData = await shapeToMeshData(shape);
      components.push({id, grounded:id === 'bolt', transform:{y}, def:{parts:[{id:'solid',meshData}]}});
    }
    return assemblySourceBodies({components});
  } finally { owned.reverse().forEach(disposeBrep); }
}

function centerSection(bodies, reverse=false) {
  const doc = createSheetDoc({views:['front'], scale:'2:1'});
  const controller = createDrawingController({
    doc:() => doc, bodies:() => bodies, bodiesToken:() => 1, canvas:() => ({}),
    width:() => 900, height:() => 600, t:key => key,
    pushUndo(){}, markDirty(){}, flash(){}, refresh(){},
  });
  controller.fit();
  const front = controller.scene().views[0];
  const pixel = v => {
    const {x,y} = front.toSheet({u:0,v});
    const {zoom,ox,oy} = controller.state;
    return [x*zoom+ox,y*zoom+oy];
  };
  const top = front.centre.v + front.box.h / front.k * .2;
  const bottom = 2*front.centre.v - top;
  controller.setTool('section');
  controller.pointerDown({button:0}, ...pixel(reverse ? bottom : top));
  controller.pointerMove({button:0}, ...pixel(reverse ? top : bottom));
  controller.pointerUp({button:0}, ...pixel(reverse ? top : bottom));
  const view = doc.views.at(-1);
  assert.equal(view.section?.axis, 'vertical');
  assert.ok(Math.abs(view.section.at) < 1e-9);
  const scene = controller.scene(), placed = scene.views.find(p => p.id === view.id);
  const hatches = scene.items.filter(i => i.viewId === view.id && i.style === 'hatch');
  return {scene, placed, hatches};
}

test('vertical Front section hatches the seated native bolt, washer and nut', async () => {
  const bodies = await fastenerStack();
  assert.deepEqual(bodies.map(body => body.id), ['bolt:solid','washer:solid','nut:solid']);
  for (const body of bodies) assert.deepEqual(centerSection([body]).scene.diagnostics, [], body.id);
  for (const reverse of [false,true]) {
    const {scene, placed, hatches} = centerSection(bodies, reverse);
    assert.deepEqual(scene.diagnostics, []);
    assert.doesNotMatch(sceneToSvg(scene), /hatching omitted/);
    const material = new Set();
    for (const hatch of hatches) {
      for (let i=1; i<20; i++) {
        const {u,v} = placed.toModel({
          x:hatch.x1+(hatch.x2-hatch.x1)*i/20,
          y:hatch.y1+(hatch.y2-hatch.y1)*i/20,
        });
        const radius = Math.abs(u);
        if (v > .426 && v < .499) {
          assert.ok(radius <= .401 || radius >= .449, 'washer clearance stays empty');
          if (radius > .45) material.add('washer');
        }
        if (v > .51 && v < .89 && radius > .41) material.add('nut');
        if (v > 1 && v < 2.3 && radius < .4) material.add('bolt');
      }
    }
    assert.deepEqual(material, new Set(['bolt','washer','nut']));
  }
});

test('two incomplete bodies cannot close each other’s section', () => {
  // Each triangle contributes one side of a square at x=0. Only the combined
  // graph closes, so accepting it would hatch material from two open meshes.
  const triangle = ([y,z], [ey,ez]) => [0,y,z, 0,ey,ez, -1,y,z];
  const p=[0,0], q=[2,0], r=[2,2], s=[0,2];
  const bodies = [
    {positions:[...triangle(p,q), ...triangle(q,r)]},
    {positions:[...triangle(r,s), ...triangle(s,p)]},
  ];
  // Add a discarded-side vertex to the Front extents so a drag at x=0
  // starts inside the parent view for either retained-side convention.
  for (const body of bodies) body.positions.push(1,0,0, 1,1,0, 1,0,1);
  const {scene, hatches} = centerSection(bodies);
  assert.equal(scene.diagnostics.filter(issue => issue.code === 'open-section-boundary').length, 2);
  assert.equal(hatches.length, 0);
  assert.match(sceneToSvg(scene), /Section boundary needs repair/);
});
