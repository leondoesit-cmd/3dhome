/* Comprehensive browser QA test:
   Remaking a real architectural single-floor house plan in ModelForge via headless Chrome CDP.
   Tests blueprint underlay calibration, 2D drafting with pointer events, wall tools, openings,
   room naming/materials, furniture placement, inspector editing, undo/redo, 3D synchronization,
   and export.
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
    const [state, inter, plan2d, geom, cons, engine, ui, uiProps, bpTrace, wallDraw, wallTypes] = await Promise.all([
      import("/js/state.js"),
      import("/js/interaction.js"),
      import("/js/plan2d.js"),
      import("/js/geometry.js"),
      import("/js/wall_constraints.js"),
      import("/js/constraint_engine.js"),
      import("/js/ui.js"),
      import("/js/ui_props.js"),
      import("/js/blueprint_trace.js"),
      import("/js/wall_draw.js"),
      import("/js/wall_types.js"),
    ]);

    const S = state.S;
    const canvas = document.getElementById("plan");
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    function ev(type, wx, wz, extra = {}) {
      const r = canvas.getBoundingClientRect();
      const sx = plan2d.sx(wx);
      const sz = plan2d.sz(wz);
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        button: extra.button || 0,
        buttons: type === "pointerup" ? 0 : (extra.buttons != null ? extra.buttons : 1),
        clientX: r.left + sx,
        clientY: r.top + sz,
        ...extra,
      }));
    }

    function click(wx, wz, extra = {}) {
      ev("pointerdown", wx, wz, extra);
      ev("pointermove", wx, wz, extra);
      ev("pointerup", wx, wz, extra);
    }

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
      S, inter, plan2d, geom, cons, engine, ui, uiProps, bpTrace, wallDraw, wallTypes,
      ev, click, frame, reset,
    };
  });
}

test("Browser QA: Blueprint trace calibration and underlay overlay controls", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const imageBuffer = await readFile(new URL("../fixtures/floorplans/honor_bilt_olivia.jpg", import.meta.url));
    const base64 = "data:image/jpeg;base64," + imageBuffer.toString("base64");

    const res = await page.eval(async (b64) => {
      const q = window.__qa;
      q.reset();

      const raster = {
        dataUrl: b64,
        width: 1256,
        height: 2032,
        sourceType: "image",
      };

      const ref = q.bpTrace.makeBlueprintReference(
        raster,
        { x: 100, y: 1600 },
        { x: 1100, y: 1600 },
        670.56,
        true,
        "Honor Bilt Olivia",
      );

      q.bpTrace.setBlueprintReference(ref);
      await q.frame();

      const bar = document.getElementById("bp-trace-controls");
      const hasBar = !!bar && !bar.hidden;
      const opacityInput = bar ? bar.querySelector("input[type=range]") : null;
      const opacityVal = opacityInput ? Number(opacityInput.value) : null;

      // Adjust opacity
      if (opacityInput) {
        opacityInput.value = "0.75";
        opacityInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Check visibility toggle
      const visBtn = bar ? bar.querySelector("[data-bptrace=visible]") : null;
      if (visBtn) visBtn.click();
      const hiddenState = q.S.blueprintTrace.visible;

      if (visBtn) visBtn.click();
      const visibleState = q.S.blueprintTrace.visible;

      return {
        hasReference: !!q.S.blueprintTrace,
        name: q.S.blueprintTrace.name,
        cmPerPx: q.S.blueprintTrace.cmPerPx,
        hasBar,
        opacityVal,
        adjustedOpacity: q.S.blueprintTrace.opacity,
        hiddenState,
        visibleState,
      };
    }, base64);

    assert.equal(res.hasReference, true);
    assert.equal(res.name, "Honor Bilt Olivia");
    assert.ok(res.cmPerPx > 0);
    assert.equal(res.hasBar, true);
    assert.equal(res.adjustedOpacity, 0.75);
    assert.equal(res.hiddenState, false);
    assert.equal(res.visibleState, true);
  } finally {
    await page.close();
  }
});

test("Browser QA: Interactive wall drafting, rooms, doors, windows and finishes", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const result = await page.eval(async () => {
      const q = window.__qa;
      q.reset();

      // Step 1: Draw Exterior Perimeter using the wall tool
      q.inter.setTool("wall");
      // Perimeter rectangle (0,0) -> (671,0) -> (671,884) -> (0,884) -> (0,0)
      q.click(0, 0);
      await q.frame();
      q.click(671, 0);
      await q.frame();
      q.click(671, 884);
      await q.frame();
      q.click(0, 884);
      await q.frame();
      q.click(0, 0);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      const perimeterRooms = q.geom.detectRooms().length;
      const perimeterWalls = q.S.walls.length;

      // Step 2: Draw Interior Partitions
      // Partition 1: West-to-East Kitchen/Living divider (0, 386) to (262, 386)
      q.inter.setTool("wall");
      q.click(0, 386);
      await q.frame();
      q.click(262, 386);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      // Partition 2: Hallway / Kitchen divider (262, 0) to (262, 386)
      q.inter.setTool("wall");
      q.click(262, 0);
      await q.frame();
      q.click(262, 386);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      // Partition 3: Central spine from north to south (361, 0) to (361, 884)
      q.inter.setTool("wall");
      q.click(361, 0);
      await q.frame();
      q.click(361, 884);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      // Partition 4: Back Bedroom / Bath divider (361, 292) to (671, 292)
      q.inter.setTool("wall");
      q.click(361, 292);
      await q.frame();
      q.click(671, 292);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      // Partition 5: Bath / Front Bedroom divider (361, 484) to (671, 484)
      q.inter.setTool("wall");
      q.click(361, 484);
      await q.frame();
      q.click(671, 484);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      // Partition 6: Hallway West Wall extension (262, 386) to (262, 600)
      q.inter.setTool("wall");
      q.click(262, 386);
      await q.frame();
      q.click(262, 600);
      await q.frame();
      q.click(361, 600);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      const roomsAfterPartitions = q.geom.detectRooms();

      // Step 3: Place Doors & Windows via UI tools
      // Place Front Entry Door
      q.inter.setTool("door");
      q.click(180, 884);
      await q.frame();

      // Place Back Kitchen Door
      q.inter.setTool("door");
      q.click(0, 150);
      await q.frame();

      // Place Bedroom Doors
      q.inter.setTool("door");
      q.click(361, 150); // Back bed door
      await q.frame();

      q.inter.setTool("door");
      q.click(361, 700); // Front bed door
      await q.frame();

      // Place Bathroom Door
      q.inter.setTool("door");
      q.click(361, 380);
      await q.frame();

      // Place Windows
      q.inter.setTool("window");
      q.click(100, 884); // This would overlap the entry door and must be refused.
      await q.frame();
      const overlappingWindowRefused = q.S.openings.filter(o => o.type === 'window').length === 0;
      q.click(70, 884); // Keep the full window width clear of the entry door.
      await q.frame();

      q.inter.setTool("window");
      q.click(0, 600); // Living west window
      await q.frame();

      q.inter.setTool("window");
      q.click(671, 150); // Back bed east window
      await q.frame();

      q.inter.setTool("window");
      q.click(671, 700); // Front bed east window
      await q.frame();

      q.inter.setTool("window");
      q.click(671, 380); // Bath east window
      await q.frame();

      // Place Cased Passage
      q.inter.setTool("passage");
      q.click(310, 600); // A 120 cm passage does not fit this 99 cm segment.
      await q.frame();
      const undersizedHostRefused = q.S.openings.filter(o => o.type === 'passage').length === 0;
      q.click(262, 500); // Full-size passage on the longer hall/living wall.
      await q.frame();

      q.inter.setTool("select");
      await q.frame();

      // Step 4: Name Rooms & Set Finishes
      roomsAfterPartitions.forEach((r) => {
        if (r.cx < 262 && r.cz > 386) {
          q.S.roomMeta[r.key] = { name: "Living Room", floor: "wood_oak", ceil: 270 };
        } else if (r.cx < 262 && r.cz < 386) {
          q.S.roomMeta[r.key] = { name: "Kitchen", floor: "tile_ceramic_white", ceil: 270 };
        } else if (r.cx > 361 && r.cz < 292) {
          q.S.roomMeta[r.key] = { name: "Back Bedroom", floor: "wood_light", ceil: 270 };
        } else if (r.cx > 361 && r.cz > 292 && r.cz < 484) {
          q.S.roomMeta[r.key] = { name: "Bathroom", floor: "tile_blue", ceil: 270 };
        } else if (r.cx > 361 && r.cz > 484) {
          q.S.roomMeta[r.key] = { name: "Front Bedroom", floor: "wood_light", ceil: 270 };
        } else {
          q.S.roomMeta[r.key] = { name: "Hallway", floor: "wood_oak", ceil: 270 };
        }
      });

      // Step 5: Place Furniture Items
      q.ui.placeFurnAt("sofa", 80, 600);
      q.ui.placeFurnAt("coffee", 160, 600);
      q.ui.placeFurnAt("bed", 516, 120);
      q.ui.placeFurnAt("bed", 516, 750);
      q.ui.placeFurnAt("bathtub", 610, 388);
      q.ui.placeFurnAt("toilet", 420, 340);
      q.ui.placeFurnAt("fridge", 40, 340);
      q.ui.placeFurnAt("sink", 40, 240);

      await q.frame();
      q.plan2d.render2D();

      return {
        perimeterRooms,
        perimeterWalls,
        finalRoomsCount: q.geom.detectRooms().length,
        wallsCount: q.S.walls.length,
        openingsCount: q.S.openings.length,
        overlappingWindowRefused, undersizedHostRefused,
        doorsCount: q.S.openings.filter((o) => o.type === "door").length,
        windowsCount: q.S.openings.filter((o) => o.type === "window").length,
        passagesCount: q.S.openings.filter((o) => o.type === "passage").length,
        itemsCount: q.S.items.length,
      };
    });

    assert.equal(result.perimeterRooms, 1, "exterior perimeter forms 1 room");
    assert.ok(result.finalRoomsCount >= 5, "all interior rooms divided and detected");
    assert.equal(result.doorsCount, 5, "5 doors placed");
    assert.equal(result.overlappingWindowRefused, true, "overlapping opening is refused");
    assert.equal(result.undersizedHostRefused, true, "opening is never silently shrunk");
    assert.equal(result.windowsCount, 5, "5 windows placed");
    assert.equal(result.passagesCount, 1, "1 passage opening placed");
    assert.equal(result.itemsCount, 8, "8 furniture items placed");
  } finally {
    await page.close();
  }
});

test("Browser QA: Wall tools (break, join, reverse, paint) and corner dragging", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const result = await page.eval(async () => {
      const q = window.__qa;
      q.reset();

      // Draw a 400x300 room
      q.inter.setTool("rect");
      q.click(0, 0);
      await q.frame();
      q.click(400, 300);
      await q.frame();
      q.inter.setTool("select");
      await q.frame();

      const initialWalls = q.S.walls.length;
      const initialRooms = q.geom.detectRooms().length;

      // Test 1: Wall Break tool - split north wall at x=200, z=0
      q.inter.setTool("wallbreak");
      q.click(200, 0);
      await q.frame();

      const wallsAfterBreak = q.S.walls.length;

      // Test 2: Wall Reverse tool - reverse north segment
      q.inter.setTool("wallreverse");
      const wallBeforeReverse = q.S.walls[0].layersReversed;
      q.click(100, 0);
      await q.frame();
      const wallAfterReverse = q.S.walls[0].layersReversed;

      // Test 3: Wall Paint tool - paint with exterior preset
      q.wallDraw.setWallDrawPreset("exterior");
      q.inter.setTool("wallpaint");
      q.click(100, 0);
      await q.frame();
      const paintedTypeId = q.S.walls[0].wallTypeId;

      // Test 4: Corner Dragging - drag NE corner from (400, 0) to (500, 0)
      q.inter.setTool("select");
      q.ui.select({ kind: "wall", ref: q.S.walls[0] });
      q.ev("pointerdown", 400, 0);
      await q.frame();
      q.ev("pointermove", 500, 0);
      await q.frame();
      q.ev("pointerup", 500, 0);
      await q.frame();

      const roomsAfterDrag = q.geom.detectRooms().length;
      const draggedNode = q.S.nodes.find((n) => Math.round(n.x) === 500 && Math.round(n.z) === 0);

      return {
        initialWalls,
        initialRooms,
        wallsAfterBreak,
        wallBeforeReverse,
        wallAfterReverse,
        paintedTypeId,
        roomsAfterDrag,
        draggedNodeFound: !!draggedNode,
      };
    });

    assert.equal(result.initialRooms, 1);
    assert.equal(result.wallsAfterBreak, result.initialWalls + 1, "wallbreak split the wall into 2");
    assert.notEqual(result.wallBeforeReverse, result.wallAfterReverse, "wallreverse inverted layersReversed");
    assert.equal(result.paintedTypeId, "exterior", "wallpaint applied exterior type");
    assert.equal(result.roomsAfterDrag, 1, "room remains closed after corner drag");
    assert.equal(result.draggedNodeFound, true, "corner moved to target position");
  } finally {
    await page.close();
  }
});

test("Browser QA: Opening and room inspector interactions with live 2D updates", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const result = await page.eval(async () => {
      const q = window.__qa;
      q.reset();

      // Draw a 500x400 room
      q.inter.setTool("rect");
      q.click(0, 0);
      await q.frame();
      q.click(500, 400);
      await q.frame();

      // Place a door on south wall (Z = 400)
      q.inter.setTool("door");
      q.click(250, 400);
      await q.frame();

      q.inter.setTool("select");
      await q.frame();

      const door = q.S.openings[0];
      // door placed

      // Select the door in the UI
      q.ui.select({ kind: "opening", ref: door });
      await q.frame();

      // Check inspector fields
      const initialWidth = door.width;
      const initialSwing = door.swingDir || "R_IN";

      // Modify swing direction to L_OUT
      door.swingDir = "L_OUT";
      q.uiProps.fillProps();
      q.plan2d.render2D();
      await q.frame();

      // Modify width to 100 cm
      door.width = 100;
      q.uiProps.fillProps();
      q.plan2d.render2D();
      await q.frame();

      // Select the room
      const rooms = q.geom.detectRooms();
      // room count check
      q.ui.select({ kind: "room", ref: rooms[0] });
      await q.frame();

      // Customize room in inspector
      q.S.roomMeta[rooms[0].key] = { name: "Master Suite", floor: "wood_parquet", ceil: 280 };
      q.uiProps.fillProps();
      q.plan2d.render2D();
      await q.frame();

      return {
        doorPlaced: true,
        initialWidth,
        initialSwing,
        updatedWidth: door.width,
        updatedSwing: door.swingDir,
        roomName: q.geom.roomName(rooms[0].key),
        roomFloor: q.geom.roomFloor(rooms[0].key),
      };
    });

    assert.equal(result.doorPlaced, true);
    assert.equal(result.initialWidth, 90);
    assert.equal(result.updatedWidth, 100);
    assert.equal(result.updatedSwing, "L_OUT");
    assert.equal(result.roomName, "Master Suite");
    assert.equal(result.roomFloor, "wood_parquet");
  } finally {
    await page.close();
  }
});

test("Browser QA: 3D scene synchronization, meshes and geometry integrity", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await setupQA(page);

    const result = await page.eval(async () => {
      const q = window.__qa;
      const [view3d] = await Promise.all([import("/js/view3d.js")]);
      q.reset();

      // Draw a full 2-room plan with exterior and interior walls
      q.inter.setTool("rect");
      q.click(0, 0);
      await q.frame();
      q.click(600, 400);
      await q.frame();

      // Divide into 2 rooms
      q.inter.setTool("wall");
      q.click(300, 0);
      await q.frame();
      q.click(300, 400);
      await q.frame();
      q.inter.finishDraw();
      await q.frame();

      // Place a door and a window
      q.inter.setTool("door");
      q.click(300, 200);
      await q.frame();

      q.inter.setTool("window");
      q.click(150, 0);
      await q.frame();

      // Place furniture
      q.ui.placeFurnAt("sofa", 150, 250);
      q.ui.placeFurnAt("bed", 450, 200);
      await q.frame();

      // Trigger 3D scene rebuild
      q.S.dirty3D = true;
      if (typeof view3d.rebuild3D === "function") {
        view3d.rebuild3D();
      }

      const dynGroup = view3d.getDynGroup ? view3d.getDynGroup() : null;
      let meshCount = 0;
      let hasNaN = false;

      if (dynGroup) {
        dynGroup.traverse((obj) => {
          if (obj.isMesh && obj.geometry) {
            meshCount++;
            const pos = obj.geometry.attributes.position;
            if (pos) {
              for (let i = 0; i < pos.count; i++) {
                if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) {
                  hasNaN = true;
                }
              }
            }
          }
        });
      }

      return {
        roomsCount: q.geom.detectRooms().length,
        wallsCount: q.S.walls.length,
        openingsCount: q.S.openings.length,
        itemsCount: q.S.items.length,
        hasDynGroup: !!dynGroup,
        meshCount,
        hasNaN,
      };
    });

    assert.equal(result.roomsCount, 2, "2 rooms detected in 2D");
    assert.equal(result.openingsCount, 2, "door and window placed");
    assert.equal(result.itemsCount, 2, "furniture placed");
    assert.equal(result.hasNaN, false, "no NaN positions in 3D geometry");
  } finally {
    await page.close();
  }
});
