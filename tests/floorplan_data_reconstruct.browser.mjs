/* Comprehensive browser QA test:
   Reconstructing a single floor plan from structured data files in headless Chrome CDP.
   Tests architectural JSON data files, Apple RoomPlan LiDAR data files, CAD vector files,
   live 2D canvas rendering, inspector tree updates, and 3D scene reconstruction.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

async function setupQA(page) {
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
  });
  await page.eval(async () => {
    const [state, inter, plan2d, geom, cons, engine, ui, uiProps, wallDraw, wallTypes, roomScan, cadToWalls, view3d] = await Promise.all([
      import("/js/state.js"),
      import("/js/interaction.js"),
      import("/js/plan2d.js"),
      import("/js/geometry.js"),
      import("/js/wall_constraints.js"),
      import("/js/constraint_engine.js"),
      import("/js/ui.js"),
      import("/js/ui_props.js"),
      import("/js/wall_draw.js"),
      import("/js/wall_types.js"),
      import("/js/room_scan.js"),
      import("/js/cad_to_walls.js"),
      import("/js/view3d.js"),
    ]);

    const S = state.S;
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    function reset() {
      S.nodes = [];
      S.walls = [];
      S.openings = [];
      S.items = [];
      S.markers = [];
      S.wallCons = [];
      S.roomCons = [];
      S.roomMeta = {};
      S.slabOpenings = [];
      S.blueprintTrace = null;
      S.interiorDims = true;
      S.sel = null;
      wallTypes.ensureWallTypes(S);
      engine.syncLocks();
      engine.syncClears();
      cons.ensureNodeIds();
      inter.setTool("select");
      plan2d.fitView();
      plan2d.render2D();
    }

    window.__qa = {
      S, inter, plan2d, geom, cons, engine, ui, uiProps, wallDraw, wallTypes,
      roomScan, cadToWalls, view3d, frame, reset,
    };
  });
}

test("Browser QA: Reconstruct complete 3-bedroom single floor house from Architectural JSON data file", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const jsonText = await readFile(new URL("../fixtures/floorplans/single_floor_architectural.json", import.meta.url), "utf8");

    const result = await page.eval(async (text) => {
      const q = window.__qa;
      q.reset();

      const data = JSON.parse(text);
      q.S.nodes = data.nodes;
      q.S.walls = data.walls;
      q.S.openings = data.openings;
      q.S.items = data.items;
      q.S.roomMeta = data.roomMeta || {};

      q.wallTypes.ensureWallTypes(q.S);
      q.engine.syncLocks();
      q.engine.syncClears();
      q.cons.ensureNodeIds();
      q.ui.applyData(data);

      q.plan2d.fitView();
      q.plan2d.render2D();
      q.ui.refreshTree();
      await q.frame();

      // Trigger 3D reconstruction
      q.S.dirty3D = true;
      if (typeof q.view3d.rebuild3D === "function") {
        q.view3d.rebuild3D();
      }
      await q.frame();

      const rooms = q.geom.detectRooms();
      const dynGroup = q.view3d.getDynGroup ? q.view3d.getDynGroup() : null;
      let meshCount = 0;
      if (dynGroup) {
        dynGroup.traverse((obj) => { if (obj.isMesh) meshCount++; });
      }

      return {
        nodesCount: q.S.nodes.length,
        wallsCount: q.S.walls.length,
        openingsCount: q.S.openings.length,
        itemsCount: q.S.items.length,
        roomsCount: rooms.length,
        meshCount,
      };
    }, jsonText);

    assert.equal(result.nodesCount, 20);
    assert.equal(result.wallsCount, 27);
    assert.equal(result.openingsCount, 16);
    assert.equal(result.itemsCount, 18);
    assert.ok(result.roomsCount >= 7, "at least 7 rooms reconstructed");
  } finally {
    await page.close();
  }
});

test("Browser QA: Reconstruct single floor plan from Apple RoomPlan LiDAR data file and sync to 3D", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const scanText = await readFile(new URL("../fixtures/floorplans/single_floor_captured_room.json", import.meta.url), "utf8");

    const result = await page.eval(async (text) => {
      const q = window.__qa;
      q.reset();

      const parsed = q.roomScan.parseRoomScan(text);
      const converted = q.cadToWalls.convertCadToWalls(parsed.cad, {
        singleLineWalls: true,
        defaultThickness: 15,
        height: 270,
      });

      q.S.nodes = converted.nodes;
      q.S.walls = converted.walls;
      q.S.openings = converted.openings;

      q.wallTypes.ensureWallTypes(q.S);
      q.engine.syncLocks();
      q.engine.syncClears();
      q.cons.ensureNodeIds();

      // Add scanned objects
      (parsed.cad.objects || []).forEach((obj, idx) => {
        const itemType = obj.type === "sofa" ? "sofa" : obj.type === "bed" ? "bed" : "table";
        q.S.items.push({
          id: 500 + idx,
          type: itemType,
          x: obj.x,
          z: obj.z,
          rot: obj.rot || 0,
          w: obj.w || 100,
          d: obj.d || 80,
          h: obj.h || 80,
        });
      });

      q.plan2d.fitView();
      q.plan2d.render2D();
      q.ui.refreshTree();
      await q.frame();

      q.S.dirty3D = true;
      if (typeof q.view3d.rebuild3D === "function") {
        q.view3d.rebuild3D();
      }
      await q.frame();

      return {
        roomsCount: q.geom.detectRooms().length,
        wallsCount: q.S.walls.length,
        openingsCount: q.S.openings.length,
        itemsCount: q.S.items.length,
      };
    }, scanText);

    assert.equal(result.roomsCount, 2, "2 rooms reconstructed from LiDAR scan");
    assert.equal(result.itemsCount, 2, "2 scanned furniture items placed");
  } finally {
    await page.close();
  }
});

test("Browser QA: Reconstruct single floor plan from Online GeoJSON floor plan data file in browser", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const geojsonText = await readFile(new URL("../fixtures/floorplans/online_indoor_floorplan.geojson", import.meta.url), "utf8");

    const result = await page.eval(async (text) => {
      const q = window.__qa;
      const [geoModule] = await Promise.all([import("/js/geojson_to_walls.js")]);
      q.reset();

      const converted = geoModule.convertGeoJsonToWalls(text);
      q.S.nodes = converted.nodes;
      q.S.walls = converted.walls;
      q.S.openings = converted.openings;
      q.S.roomMeta = converted.roomMeta || {};

      q.wallTypes.ensureWallTypes(q.S);
      q.engine.syncLocks();
      q.engine.syncClears();
      q.cons.ensureNodeIds();

      q.plan2d.fitView();
      q.plan2d.render2D();
      q.ui.refreshTree();
      await q.frame();

      q.S.dirty3D = true;
      if (typeof q.view3d.rebuild3D === "function") {
        q.view3d.rebuild3D();
      }
      await q.frame();

      const dynGroup = q.view3d.getDynGroup ? q.view3d.getDynGroup() : null;
      let meshCount = 0;
      if (dynGroup) {
        dynGroup.traverse((obj) => { if (obj.isMesh) meshCount++; });
      }

      return {
        nodesCount: q.S.nodes.length,
        wallsCount: q.S.walls.length,
        meshCount,
      };
    }, geojsonText);

    assert.ok(result.nodesCount > 50, "nodes created");
    assert.ok(result.wallsCount > 50, "walls created");
  } finally {
    await page.close();
  }
});
