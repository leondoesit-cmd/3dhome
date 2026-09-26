import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.core.js';
import { createPlannerDrawing, planDimensionChains } from '../js/planner_drawing.js';

function fixture() {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial());
  root.add(mesh);
  return { root, mesh, drawing: createPlannerDrawing(THREE) };
}

test('drawing preserves crease edges, reuses geometry and follows parent transforms', () => {
  const { root, mesh, drawing } = fixture();
  drawing.sync([root]);
  const line = drawing.group.children[0], geometry = line.geometry;
  assert.equal(geometry.attributes.position.count, 24, '12 box edges, without triangle diagonals');
  root.position.set(12, 3, 8);
  mesh.position.x = 7;
  drawing.sync([root]);
  assert.equal(line.geometry, geometry);
  assert.equal(line.matrix.elements[12], 19);
  assert.equal(line.matrix.elements[13], 3);
  assert.equal(root.children.length, 1, 'model graph is unchanged');
  assert.equal(line.material.depthTest, false, 'the drawing remains visible behind solid surfaces');
  assert.equal(line.material.depthWrite, false);
  drawing.dispose();
});

test('drawing shares edge geometry and disposes only after its last visible user disappears', () => {
  const { root, mesh, drawing } = fixture();
  const clone = mesh.clone();
  root.add(clone);
  drawing.sync([root]);
  const geometry = drawing.group.children[0].geometry;
  assert.equal(drawing.group.children[1].geometry, geometry);
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++);
  mesh.visible = false;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 1);
  assert.equal(disposed, 0);
  root.visible = false;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 0);
  assert.equal(disposed, 1);
  drawing.dispose();
});

test('drawing skips transparent roofs and frees replaced geometry', () => {
  const { root, mesh, drawing } = fixture();
  mesh.material.transparent = true;
  mesh.material.opacity = 0;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 0);
  mesh.material.opacity = 1;
  drawing.sync([root]);
  const old = drawing.group.children[0].geometry;
  let disposed = false;
  old.addEventListener('dispose', () => disposed = true);
  mesh.geometry = new THREE.BoxGeometry(20, 20, 20);
  drawing.sync([root]);
  assert.notEqual(drawing.group.children[0].geometry, old);
  assert.equal(disposed, true);
  drawing.dispose();
});

test('turning drawing off releases its resources without disposing model resources', () => {
  const { root, mesh, drawing } = fixture();
  const scene = new THREE.Scene();
  scene.add(root, drawing.group);
  let modelDisposed = false;
  mesh.geometry.addEventListener('dispose', () => modelDisposed = true);
  drawing.sync([root]);
  drawing.dispose();
  assert.equal(scene.children.length, 1);
  assert.equal(drawing.group.children.length, 0);
  assert.equal(modelDisposed, false);
});

test('drawing refreshes edited vertex buffers and respects hidden ancestors', () => {
  const { root, mesh, drawing } = fixture();
  const scene = new THREE.Scene();
  scene.add(root);
  drawing.sync([root]);
  const old = drawing.group.children[0].geometry;
  mesh.geometry.attributes.position.setX(0, 8);
  mesh.geometry.attributes.position.needsUpdate = true;
  drawing.sync([root]);
  assert.notEqual(drawing.group.children[0].geometry, old);
  scene.visible = false;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 0);
  drawing.dispose();
});

test('instanced furniture follows each instance transform and removed instances disappear', () => {
  const root = new THREE.Group();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial(), 2);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(20, 0, 0));
  root.position.x = 5;
  root.add(mesh);
  const drawing = createPlannerDrawing(THREE);
  drawing.sync([root]);
  assert.deepEqual(drawing.group.children.map(line => line.matrix.elements[12]), [15, 25]);
  mesh.count = 1;
  drawing.sync([root]);
  assert.equal(drawing.group.children.length, 1);
  drawing.dispose();
});

test('canvas drawing projects through the current camera and follows a camera move', () => {
  const { root, drawing } = fixture();
  drawing.sync([root]);
  const strokes = [];
  const ctx = { setTransform(){}, clearRect(){strokes.length=0;}, beginPath(){}, moveTo(x,y){strokes.push([x,y]);}, lineTo(x,y){strokes.push([x,y]);}, stroke(){} };
  const canvas = {width:0,height:0,getContext:()=>ctx};
  const camera = new THREE.PerspectiveCamera(45, 2, .1, 1000);
  camera.position.set(0,0,50); camera.lookAt(0,0,0);
  drawing.draw(canvas,camera,800,400,2);
  assert.equal(canvas.width,1600);
  assert.equal(canvas.height,800);
  assert.equal(strokes.length,24);
  const before = strokes.map(point=>point.slice());
  camera.position.x=20; camera.lookAt(0,0,0);
  drawing.draw(canvas,camera,800,400,2);
  assert.notDeepEqual(strokes,before);
  assert.ok(strokes.flat().every(Number.isFinite));
  drawing.dispose();
});

// The ground-floor sheet the overlay is modelled on (cm; x right, z down).
const SHEET = [
  [200, 0, 600, 0], [200, 0, 200, 300], [600, 0, 600, 300], [600, 300, 600, 500],
  [0, 300, 200, 300], [200, 300, 350, 300], [600, 300, 900, 300],
  [900, 300, 900, 1100], [0, 1100, 900, 1100], [0, 300, 0, 1100],
  [0, 450, 200, 450], [0, 800, 300, 800], [600, 800, 900, 800],
  [400, 800, 400, 1100], [600, 800, 600, 1100],
].map(([ax, az, bx, bz]) => ({ ax, az, bx, bz }));

const spans = chain => chain.stations.slice(1).map((s, i) => s.at - chain.stations[i].at);

test('dimension chains break at exterior corners and skip interior partitions', () => {
  const bySide = Object.fromEntries(planDimensionChains(SHEET).map(c => [c.side, c]));
  assert.deepEqual(spans(bySide.top), [200, 400, 300]);
  assert.deepEqual(spans(bySide.bottom), [400, 200, 300]);
  assert.deepEqual(spans(bySide.right), [300, 500, 300]);
  assert.deepEqual(spans(bySide.left), [300, 150, 350, 300]);
  // The witness line of the 0.00 station on top reaches down to the C.R. corner.
  assert.equal(bySide.top.stations[0].from, 300);
});

test('a lone wall gets a single chain and degenerate input none', () => {
  assert.deepEqual(planDimensionChains([]), []);
  assert.deepEqual(planDimensionChains([{ ax: 0, az: 0, bx: 0, bz: 0 }]), []);
  const chains = planDimensionChains([{ ax: 0, az: 0, bx: 350, bz: 0 }]);
  assert.deepEqual(chains.map(c => c.side), ['top', 'bottom']);
  assert.deepEqual(spans(chains[0]), [350]);
});

test('overlay letters every span plus the overall length through the formatter', () => {
  const drawing = createPlannerDrawing(THREE);
  drawing.setPlan(SHEET, cm => (cm / 100).toFixed(2));
  const texts = [];
  const ctx = { setTransform(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){},
    save(){}, restore(){}, translate(){}, rotate(){}, strokeText(){}, fillText(t){ texts.push(t); } };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const camera = new THREE.OrthographicCamera(-800, 800, 800, -800, 1, 5000);
  camera.position.set(450, 2000, 550); camera.up.set(0, 0, -1); camera.lookAt(450, 0, 550);
  drawing.draw(canvas, camera, 1000, 1000, 1);
  for (const t of ['2.00', '4.00', '3.00', '9.00', '11.00', '5.00', '1.50']) {
    assert.ok(texts.includes(t), `label ${t} drawn`);
  }
  assert.equal(texts.filter(t => t === '9.00').length, 2, 'overall width on top and bottom');
  assert.equal(texts.filter(t => t === '11.00').length, 2, 'overall depth on both sides');
  drawing.dispose();
  assert.deepEqual(drawing.chains, []);
});

function recordingCtx() {
  const texts = [];
  const ctx = { globalAlpha: 1, setTransform(){}, clearRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){},
    save(){}, restore(){}, translate(){}, rotate(){}, strokeText(){}, setLineDash(){},
    fillText(t){ texts.push({ t, alpha: ctx.globalAlpha }); } };
  return { ctx, texts, canvas: { width: 0, height: 0, getContext: () => ctx } };
}

// A 4 x 4 m room of 250 cm walls; the camera stands south of it, low.
function walledRoom() {
  const root = new THREE.Group();
  const wall = (x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 250, d), new THREE.MeshStandardMaterial());
    m.position.set(x, 125, z);
    root.add(m);
  };
  wall(200, 0, 420, 20); wall(200, 400, 420, 20); wall(0, 200, 20, 420); wall(400, 200, 20, 420);
  root.updateMatrixWorld(true);
  const segs = [[0, 0, 400, 0], [400, 0, 400, 400], [400, 400, 0, 400], [0, 400, 0, 0]]
    .map(([ax, az, bx, bz]) => ({ ax, az, bx, bz }));
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
  camera.position.set(200, 180, 1400); camera.lookAt(200, 0, 200); camera.updateMatrixWorld();
  return { root, segs, camera };
}

test('dimension ink behind a wall is dimmed to the hidden opacity, or dropped at zero', () => {
  const { root, segs, camera } = walledRoom();
  const drawing = createPlannerDrawing(THREE);
  drawing.setPlan(segs, cm => (cm / 100).toFixed(2));
  drawing.setOccluders([root]);
  drawing.setOptions({ hiddenOpacity: 0.3 });
  let rec = recordingCtx();
  drawing.draw(rec.canvas, camera, 800, 800, 1);
  const alphas = rec.texts.filter(x => x.t === '4.00').map(x => x.alpha).sort();
  assert.ok(alphas.includes(1), 'the near (south) chain stays solid');
  assert.ok(alphas.some(a => Math.abs(a - 0.3) < 1e-9), 'the far (north) chain is dimmed');
  drawing.setOptions({ hiddenOpacity: 0 });
  rec = recordingCtx();
  drawing.draw(rec.canvas, camera, 800, 800, 1);
  assert.ok(rec.texts.every(x => x.alpha === 1), 'nothing hidden is lettered at 0%');
  drawing.setOccluders([]);
  rec = recordingCtx();
  drawing.draw(rec.canvas, camera, 800, 800, 1);
  assert.ok(rec.texts.filter(x => x.t === '4.00').length >= 3, 'without occluders every side letters');
  drawing.dispose();
});

test('hover sketches a rotated piece with its own width, depth and height', () => {
  const drawing = createPlannerDrawing(THREE);
  const piece = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(200, 90, 80), new THREE.MeshStandardMaterial());
  body.position.y = 45;
  piece.add(body);
  piece.position.set(300, 0, 200);
  piece.rotation.y = 0.6;
  assert.equal(drawing.setHover(piece), true);
  assert.equal(drawing.setHover(piece), false, 'same target is a no-op');
  drawing.setOptions({ hoverOpacity: 0.8 });
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 10000);
  camera.position.set(700, 500, 700); camera.lookAt(300, 0, 200); camera.updateMatrixWorld();
  const rec = recordingCtx();
  drawing.draw(rec.canvas, camera, 900, 900, 1);
  const labels = rec.texts.map(x => x.t);
  for (const t of ['2.00', '0.80', '0.90']) assert.ok(labels.includes(t), `hover measures ${t}`);
  assert.ok(rec.texts.every(x => Math.abs(x.alpha - 0.8) < 1e-9), 'hover ink follows its slider');
  drawing.setHover(null);
  const after = recordingCtx();
  drawing.draw(after.canvas, camera, 900, 900, 1);
  assert.equal(after.texts.length, 0);
  drawing.dispose();
});

test('a wall hover measures its declared run and height, not the mitred mesh box', () => {
  const drawing = createPlannerDrawing(THREE);
  const wall = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(320, 272, 20), new THREE.MeshStandardMaterial());
  mesh.position.set(150, 136, 0); // runs 10 cm past both nodes
  wall.add(mesh);
  wall.userData.drawExtent = { x0: 0, x1: 300, y0: 0, y1: 260 };
  drawing.setHover(wall);
  assert.deepEqual([drawing.hover.min.x, drawing.hover.max.x, drawing.hover.max.y, drawing.hover.max.z], [0, 300, 260, 10]);
  drawing.dispose();
});
