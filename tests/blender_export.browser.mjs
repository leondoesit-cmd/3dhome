/* What the Blender export actually puts in the file (js/blender_export.js).
 *
 * Every claim here is about a THREE object graph and about the glTF JSON that
 * GLTFExporter writes out of it, so there is no way to check any of it against
 * source text: "the wall is 2.7 units tall" is a fact about a scaled
 * BufferGeometry, and "the two chairs share one mesh" is a fact about the
 * exporter's own de-duplication. Both need three loaded and running, which is
 * what this harness has and jsdom does not.
 *
 * No renderer is created and none is needed — buildBlenderScene() takes the
 * subtree to export as an option, so the test builds a stand-in for the live
 * scene with exactly the shapes the real one has (three layer roots, a ghosted
 * wall, an x-rayed slab, two identical pieces of furniture) and reads the
 * result. Headless Chrome here runs with --disable-gpu, so a test that needed
 * init3D() could not run at all. */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

let shared = null;
test.after(async () => {
  if (shared) await shared.close();
});

async function page() {
  if (!shared) shared = await openPage({ width: 1280, height: 800 });
  await shared.goto("/");
  await shared.eval(async () => {
    const lazy = await import("/js/three_lazy.js");
    await lazy.loadThree();
    const THREE = lazy.THREE;
    window.__bx = await import("/js/blender_export.js");
    window.__THREE = THREE;

    /* A stand-in for `dyn`, built to the same shape the renderer builds: three
       layer roots, view aids applied the way the app applies them. */
    const mat = (o) => new THREE.MeshStandardMaterial(o);
    const dyn = new THREE.Group();

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat({ color: 0x808080 }));
    ground.userData.role = "ground";
    dyn.add(ground);

    const structure = new THREE.Group();
    structure.userData.layerRoot = "structure";
    dyn.add(structure);

    // a wall, ghosted the way ghostSwap() ghosts one: the real material parked
    // on userData.ghostBase, a translucent clone on the mesh
    const wall = new THREE.Group();
    wall.userData.wall = { id: "w1", thickness: 12, height: 270 };
    wall.position.set(500, 0, 300);
    const solid = mat({ color: 0xede7dc, roughness: 0.9 });
    const ghost = solid.clone();
    ghost.transparent = true;
    ghost.opacity = 0.35;
    ghost.depthWrite = false;
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(400, 270, 12), ghost);
    wallMesh.position.set(200, 135, 0);
    wallMesh.userData.ghostBase = solid;
    wall.add(wallMesh);
    wall.visible = false; // cut away by the dollhouse view
    wall.userData.seeThrough = true;
    structure.add(wall);

    // a room floor under the MEP x-ray
    const xray = mat({ color: 0xc8b898 });
    xray.transparent = true;
    xray.opacity = 0.18;
    xray.depthWrite = false;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(600, 2, 400), xray);
    floor.position.set(300, -1, 200);
    floor.userData.role = "floor";
    floor.userData.roomLabel = "Kitchen";
    structure.add(floor);

    // the zero-opacity ceiling the builder makes when ceilings are switched off
    const off = mat({ color: 0xffffff });
    off.transparent = true;
    off.opacity = 0;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(600, 2, 400), off);
    ceiling.position.set(300, 270, 200);
    ceiling.userData.role = "ceilingHidden";
    structure.add(ceiling);

    // two identical chairs, each built with its own geometry object, exactly as
    // the per-item furniture cache builds them
    const items = new THREE.Group();
    items.userData.layerRoot = "furniture";
    dyn.add(items);
    const chairMat = mat({ color: 0x6b4b2a });
    [1, 2].forEach((id) => {
      const g = new THREE.Group();
      g.userData.item = { type: "diningChair", id, w: 45, d: 48, h: 90, rot: 0 };
      g.position.set(100 * id, 0, 150);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(45, 4, 48), chairMat);
      seat.position.y = 45;
      g.add(seat);
      items.add(g);
    });

    const mep = new THREE.Group();
    mep.userData.layerRoot = "mep";
    dyn.add(mep);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 300, 8), mat({ color: 0x3070a0 }));
    pipe.position.set(50, 150, 50);
    mep.add(pipe);

    const lamp = new THREE.PointLight(0xffddaa, 196350, 400, 2);
    lamp.position.set(300, 250, 200);
    dyn.add(lamp);

    window.__dyn = dyn;
    // remembered so the "the live scene is not touched" test has something to
    // compare against
    window.__live = { ghost, solid, wallGeo: wallMesh.geometry, xray };
  });
  return shared;
}

/* One build, read many ways. The scene is rebuilt per test rather than shared,
   because every test here is allowed to be destructive in principle and a
   shared graph would make a failure in one show up as a failure in another. */
async function build(options) {
  const p = await page();
  return p.eval((opt) => {
    const THREE = window.__THREE;
    const built = window.__bx.buildBlenderScene(Object.assign({ source: window.__dyn }, opt));
    const byName = {};
    const collections = [];
    built.scene.children.forEach((c) => collections.push(c.name));
    const geoIds = {};
    const nodes = [];
    built.scene.traverse((o) => {
      if (o === built.scene) return;
      if (o.name) byName[o.name] = true;
      if (o.isMesh) geoIds[o.parent.name + "/" + o.name] = o.geometry.uuid;
      nodes.push({
        name: o.name,
        parent: o.parent === built.scene ? "" : o.parent.name,
        scale: [o.scale.x, o.scale.y, o.scale.z],
        isMesh: !!o.isMesh,
        isLight: !!o.isLight,
        extras: o.userData || {},
      });
    });
    const box = new THREE.Box3().setFromObject(built.scene);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());

    function pick(name) {
      let hit = null;
      built.scene.traverse((o) => {
        if (o.name === name) hit = o;
      });
      return hit;
    }
    function matOf(name) {
      const o = pick(name);
      let m = null;
      o.traverse((c) => {
        if (c.isMesh && !m) m = c.material;
      });
      return { name: m.name, opacity: m.opacity, transparent: m.transparent, color: m.color.getHexString() };
    }
    function meshBox(name) {
      const b = new THREE.Box3().setFromObject(pick(name));
      const s = b.getSize(new THREE.Vector3());
      return [s.x, s.y, s.z];
    }
    const lamp = nodes.find((n) => n.isLight);
    const lampObj = lamp ? pick(lamp.name) : null;
    const out = {
      collections,
      names: Object.keys(byName),
      nodes,
      geoIds,
      size: [size.x, size.y, size.z],
      centre: [centre.x, centre.y, centre.z],
      floorY: box.min.y,
      stats: built.stats,
      wallMat: matOf("Wall_w1"),
      floorMat: matOf("Floor_Kitchen"),
      wallSize: meshBox("Wall_w1"),
      lamp: lampObj ? { intensity: lampObj.intensity, distance: lampObj.distance } : null,
      live: {
        ghostOpacity: window.__live.ghost.opacity,
        solidOpacity: window.__live.solid.opacity,
        xrayOpacity: window.__live.xray.opacity,
        wallHeight: (window.__live.wallGeo.computeBoundingBox(), window.__live.wallGeo.boundingBox.max.y - window.__live.wallGeo.boundingBox.min.y),
      },
    };
    built.dispose();
    return out;
  }, options || {});
}

test("the model arrives in metres, at scale 1.0, on the origin", opts, async () => {
  const r = await build();
  // 270 cm of wall is 2.7 m of glTF, and the scale is in the vertices: an
  // object that came in at scale 0.01 would need Ctrl+A before anything else
  assert.ok(Math.abs(r.wallSize[1] - 2.7) < 0.01, `wall height ${r.wallSize[1]}`);
  r.nodes.forEach((n) => {
    n.scale.forEach((s) => assert.ok(Math.abs(s - 1) < 1e-6, `${n.name} scale ${n.scale}`));
  });
  assert.ok(Math.abs(r.centre[0]) < 0.01 && Math.abs(r.centre[2]) < 0.01, `centre ${r.centre}`);
  assert.ok(Math.abs(r.floorY) < 0.02, `floor at ${r.floorY}`); // the building sits ON the ground
  assert.equal(r.stats.units, "m");
});

test("keeping centimetres is still an option, and then nothing is scaled", opts, async () => {
  const r = await build({ units: "cm" });
  assert.ok(Math.abs(r.wallSize[1] - 270) < 1, `wall height ${r.wallSize[1]}`);
});

test("everything is named and filed in a collection", opts, async () => {
  const r = await build();
  assert.deepEqual(r.collections.sort(), ["Floors", "Furniture", "Lights", "MEP", "Walls"].sort());
  ["Wall_w1", "Floor_Kitchen", "DiningChair_1", "DiningChair_2"].forEach((n) =>
    assert.ok(r.names.includes(n), `missing ${n} in ${r.names.join(", ")}`),
  );
  // no anonymous top-level object survives: that is the whole complaint about
  // the old export ("Object.001 ... Object.842")
  r.nodes
    .filter((n) => !n.parent)
    .forEach((n) => assert.ok(n.name && !/^Object($|\.)/.test(n.name), `unnamed ${JSON.stringify(n)}`));
  const chair = r.nodes.find((n) => n.name === "DiningChair_2");
  assert.equal(chair.extras.home3d_id, "2");
  assert.equal(chair.extras.width_cm, 45); // planner dimensions stay in cm, as data
});

test("identical pieces share one mesh instead of carrying a copy each", opts, async () => {
  const shared = await build();
  const ids = Object.entries(shared.geoIds)
    .filter(([k]) => k.startsWith("DiningChair"))
    .map(([, v]) => v);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  // and the sharing is a choice, not an accident of how the scene was built
  const apart = await build({ instances: false });
  const ids2 = Object.entries(apart.geoIds)
    .filter(([k]) => k.startsWith("DiningChair"))
    .map(([, v]) => v);
  assert.notEqual(ids2[0], ids2[1]);
});

test("view aids do not leak into the file", opts, async () => {
  const r = await build();
  // a wall cut away by the dollhouse view is still a wall
  assert.ok(r.names.includes("Wall_w1"));
  // ...wearing the material it had before it was ghosted, at full opacity
  assert.equal(r.wallMat.opacity, 1);
  assert.equal(r.wallMat.transparent, false);
  assert.equal(r.wallMat.color, "ede7dc");
  // ...and the MEP x-ray does not make the floor slab into glass
  assert.equal(r.floorMat.opacity, 1);
  // the ceiling built at opacity 0 because ceilings are off is not in the file
  assert.ok(!r.collections.includes("Ceilings"));
  // nor is the infinite ground plane, unless asked for
  assert.ok(!r.collections.includes("Site"));
  const withGround = await build({ ground: true });
  assert.ok(withGround.collections.includes("Site"));
});

test("solidifying is a switch, so a deliberately translucent export is possible", opts, async () => {
  const r = await build({ solidifyViewAids: false });
  // the x-ray has no original to go back to, so switching the pass off leaves
  // the slab translucent
  assert.ok(r.floorMat.opacity < 0.5, `floor opacity ${r.floorMat.opacity}`);
  /* A ghosted layer is different in kind: ghostSwap() parked the real material
     on the mesh, so the export takes it back whatever this switch says. There
     is no version of "export the model" that wants the throwaway clone. */
  assert.equal(r.wallMat.opacity, 1);
});

test("lamp intensity is corrected for the unit change", opts, async () => {
  const r = await build();
  // candela here is calibrated for centimetre throws; at 1/d^2 a 100x smaller
  // scene needs 10^4 less intensity or every lamp blows out the Blender render
  assert.ok(Math.abs(r.lamp.intensity - 19.635) < 0.01, `intensity ${r.lamp.intensity}`);
  assert.ok(Math.abs(r.lamp.distance - 4) < 1e-6, `range ${r.lamp.distance}`);
  const cm = await build({ units: "cm" });
  assert.ok(Math.abs(cm.lamp.intensity - 196350) < 1, `cm intensity ${cm.lamp.intensity}`);
  const none = await build({ lights: false });
  assert.ok(!none.collections.includes("Lights"));
});

test("the scene on screen is not touched by exporting it", opts, async () => {
  const r = await build();
  // the ghost clone is still a ghost, the real material is still solid, the
  // x-ray is still an x-ray, and no geometry was scaled in place
  assert.equal(r.live.ghostOpacity, 0.35);
  assert.equal(r.live.solidOpacity, 1);
  assert.equal(r.live.xrayOpacity, 0.18);
  assert.equal(r.live.wallHeight, 270);
});

test("the glTF that comes out is one Blender can read", opts, async () => {
  const p = await page();
  const json = await p.eval(async () => {
    const built = window.__bx.buildBlenderScene({ source: window.__dyn });
    const mod = await import("three/addons/exporters/GLTFExporter.js");
    const out = await new mod.GLTFExporter().parseAsync(built.scene, {
      binary: false,
      trs: true,
      onlyVisible: false,
    });
    built.dispose();
    return out;
  });
  assert.equal(json.asset.version, "2.0");
  const names = json.nodes.map((n) => n.name);
  ["Walls", "Furniture", "Wall_w1", "DiningChair_1"].forEach((n) =>
    assert.ok(names.includes(n), `missing node ${n}`),
  );
  // extras are what Blender turns into custom properties on the object
  const chair = json.nodes.find((n) => n.name === "DiningChair_1");
  assert.equal(chair.extras.home3d_type, "diningChair");
  assert.equal(chair.extras.height_cm, 90);
  // lights ride the standard extension, so Blender imports them as lamps
  assert.ok((json.extensionsUsed || []).includes("KHR_lights_punctual"));
  // one mesh for the two chairs, referenced twice
  const chairMeshes = json.nodes.filter((n) => /^DiningChair/.test(n.name));
  const seatMesh = chairMeshes.map((n) => json.nodes[n.children[0]].mesh);
  assert.equal(seatMesh[0], seatMesh[1]);
  // and every material carries a name a human can find in the shader editor
  json.materials.forEach((m) => assert.ok(m.name && m.name.length > 1, JSON.stringify(m)));
});
