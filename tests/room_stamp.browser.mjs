/* Placing and dragging preset rooms, in a real page.
 *
 * The two node suites cover the geometry: room_stamp.test.mjs pins the graph
 * work against a plain object, room_stamp_plan.test.mjs pins names and keys
 * against the real face trace. Neither can reach the gesture the feature is
 * named after — dragging a room until it joins another one — because that
 * lives in interaction.js's pointerup, behind an rAF-throttled pointermove,
 * with a canvas and a selection in the middle. Every bug this drop path has
 * had (a hardcoded 80 cm door, two doors stacked on the welded wall, a room
 * that lost its name when its key changed, walls that overlapped instead of
 * merging because only one of the two was ever cut) was invisible to the node
 * suites and obvious here.
 *
 * Pointer moves go one animation frame apart, and offsetX/offsetY are pinned
 * on every event, for the reasons tests/layers.browser.mjs sets out.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome ? {} : { skip: "no Chrome found (set CHROME_PATH)" };

async function planner(page) {
  await page.eval(() => {
    const start = document.getElementById("start-screen");
    if (start) start.hidden = true;
  });
  await page.eval(async () => {
    const [state, inter, plan2d, geom, layers] = await Promise.all([
      import("/js/state.js"), import("/js/interaction.js"), import("/js/plan2d.js"),
      import("/js/geometry.js"), import("/js/layers.js"),
    ]);
    const S = state.S, canvas = document.getElementById("plan");
    const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    function ev(type, x, z) {
      const r = canvas.getBoundingClientRect();
      const X = plan2d.sx(x), Z = plan2d.sz(z);
      const e = new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
        pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
        clientX: r.left + X, clientY: r.top + Z,
      });
      Object.defineProperty(e, "offsetX", { value: X });
      Object.defineProperty(e, "offsetY", { value: Z });
      canvas.dispatchEvent(e);
    }
    window.__rs = {
      S, inter, plan2d, geom, canvas, frame,
      blank() {
        S.nodes = []; S.walls = []; S.openings = []; S.items = [];
        S.roomMeta = {}; S.markers = []; S.wallCons = []; S.roomCons = [];
        S.sel = null; S.idc = 1;
        layers.resetLayers();
        inter.setTool("select");
        plan2d.fitView(); plan2d.render2DNow();
      },
      select(sel) { S.sel = sel; plan2d.render2DNow(); },
      stamp(preset, x, z) {
        inter.setTool("roomstamp");
        inter.armRoomStamp(preset);
        inter.updateRoomGhost(x, z);
        const out = inter.commitRoomStamp();
        inter.setTool("select");
        plan2d.fitView(); plan2d.render2DNow();
        return out;
      },
      async drag(x0, z0, x1, z1, watch) {
        ev("pointerdown", x0, z0);
        await frame();
        const action = S.action;
        const seen = [];
        for (let i = 1; i <= 10; i++) {
          ev("pointermove", x0 + ((x1 - x0) * i) / 10, z0 + ((z1 - z0) * i) / 10);
          await frame();
          if (watch) seen.push(watch());
        }
        ev("pointerup", x1, z1);
        await frame();
        return watch ? { action, seen } : action;
      },
      wallAt(x) {
        return S.walls.find((w) => Math.abs(S.nodes[w.a].x - x) < 1 && Math.abs(S.nodes[w.b].x - x) < 1);
      },
      /* The wall both rooms bound. Not "the wall on that line" — docking
         splits the neighbour's wall, so that line carries stubs too. */
      partyWall() {
        const keys = geom.detectRooms().map((r) => String(r.key).split(","));
        if (keys.length !== 2) return null;
        const id = keys[0].find((k) => keys[1].indexOf(k) !== -1);
        return id == null ? null : S.walls.find((w) => String(w.id) === id);
      },
      box(room) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        room.pts.forEach((p) => {
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
          z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        });
        return [x0, z0, x1, z1].map(Math.round);
      },
      roomNamed(name) {
        return geom.detectRooms().find((r) => (S.roomMeta[r.key] || {}).name === name);
      },
      report() {
        const rooms = geom.detectRooms();
        const keys = rooms.map((r) => String(r.key).split(","));
        return {
          rooms: rooms.length,
          names: rooms.map((r) => (S.roomMeta[r.key] || {}).name || null),
          shared: keys.length === 2
            ? keys[0].filter((id) => keys[1].indexOf(id) !== -1).length : null,
          openings: S.openings.map((o) => o.type + ":" + Math.round(o.width)),
          orphans: Object.keys(S.roomMeta)
            .filter((k) => !rooms.some((r) => r.key === k)).length,
        };
      },
    };
  });
}

test("a room dragged near another one is pulled flush and joined to it", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs;
      q.blank();
      q.stamp("bedroom", 0, 0);           // centreline 360 x 310 about the origin
      q.stamp("bathroom", 900, 0);        // far enough away to dock against nothing
      const before = q.report();
      // grab the bathroom and shove it towards the bedroom, stopping deliberately
      // short and crooked: 21 cm out and 13 cm high is past the weld tolerance
      const workSet = q.S.workSet;
      const action = await q.drag(900, 0, 180 + 125 + 21, 13);
      return { before, action, workSet, after: q.report() };
    });
    assert.equal(out.before.rooms, 2);
    assert.equal(out.before.shared, 0, "they start out as two separate rooms");
    assert.equal(out.workSet, "structure",
      "picking the room tool moves the work set, or the rooms it stamps cannot be dragged");
    assert.equal(out.action, "room", "the press grabbed the room");
    assert.equal(out.after.rooms, 2, "still two rooms after the drop");
    assert.deepEqual(out.after.names.sort(), ["Bathroom", "Bedroom"],
      "and both of them still know what they are");
    assert.equal(out.after.shared, 1, "one party wall, not two walls on top of each other");
    assert.equal(out.after.orphans, 0);
    assert.deepEqual(out.after.openings, ["door:70"],
      "one door, at the bathroom's own leaf width rather than a fixed 80");
  } finally {
    await page.close();
  }
});

test("two rooms that each already have a door do not end up with two in the wall they share", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs, S = q.S;
      const rs = await import("/js/room_stamp.js");
      q.blank();
      q.stamp("bedroom", 0, 0);
      q.stamp("bathroom", 900, 0);
      const facing = (x) => S.walls.find((w) => S.nodes[w.a].x === x && S.nodes[w.b].x === x);
      rs.cutOpening(S, facing(180).id, { type: "door", width: 80 });
      rs.cutOpening(S, facing(775).id, { type: "door", width: 70 });
      const before = S.openings.length;
      await q.drag(900, 0, 180 + 125 + 15, 0);
      return { before, after: q.report() };
    });
    assert.equal(out.before, 2, "one door in each room's wall to start with");
    assert.equal(out.after.shared, 1);
    assert.equal(out.after.openings.length, 1,
      "the two doors were in the same place; the survivor keeps one");
  } finally {
    await page.close();
  }
});

test("a corridor dropped against a room opens onto it instead of getting a door", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs;
      q.blank();
      q.stamp("bedroom", 0, 0);
      q.stamp("corridor", 900, 0);        // 130 x 330: LONGER than the wall it will meet
      await q.drag(900, 0, 180 + 65 + 12, 0);
      return q.report();
    });
    assert.equal(out.rooms, 2);
    assert.deepEqual(out.names.sort(), ["Bedroom", "Corridor"]);
    assert.equal(out.shared, 1,
      "the longer corridor wall was cut to match, rather than left lying over the room's");
    assert.equal(out.openings.length, 1);
    assert.ok(out.openings[0].indexOf("passage") === 0,
      "circulation opens onto what it serves");
  } finally {
    await page.close();
  }
});

test("the stamp refuses to land on a room and says so", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs, S = q.S;
      q.blank();
      q.stamp("living", 0, 0);
      const before = q.report();
      q.inter.setTool("roomstamp");
      q.inter.armRoomStamp("wc");
      const ghost = q.inter.updateRoomGhost(0, 0);   // dead centre of the living room
      const made = q.inter.commitRoomStamp();
      return { before, blocked: !!ghost.blocked, made: made !== null, after: q.report(), walls: S.walls.length };
    });
    assert.equal(out.blocked, true, "the ghost knows it is over a room");
    assert.equal(out.made, false, "and the click does not commit");
    assert.equal(out.walls, 4, "the plan is exactly as it was");
    assert.deepEqual(out.after, out.before);
  } finally {
    await page.close();
  }
});

test("a selected room can be resized by pulling its side, and stops at its minimum", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs, S = q.S;
      q.blank();
      q.stamp("bedroom", 0, 0);                    // 350 x 300 clear, 360 x 310 centreline
      const key = q.geom.detectRooms()[0].key;
      q.select({ kind: "room", ref: key });
      const ui = await import("/js/ui.js");
      ui.fillProps();
      const typed = {
        shown: document.getElementById("r_size_row").style.display !== "none",
        w: Number(document.getElementById("r_w").value),
        d: Number(document.getElementById("r_d").value),
      };
      const handles = q.geom.roomEdgeHandles(key);
      const right = handles.find((h) => h.axis === "x" && h.ux > 0);
      const size = () => {
        const r = q.geom.detectRooms()[0];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        r.pts.forEach((p) => {
          x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
          z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        });
        return { w: Math.round(x1 - x0 - 10), d: Math.round(z1 - z0 - 10) };
      };
      const before = size();
      // pull the right-hand side out by 100, and 40 off-axis to prove the
      // drag cannot slide the side sideways
      const action = await q.drag(right.x, right.z, right.x + 100, right.z + 40);
      const wider = size();
      // now push the same side well past the preset's minimum
      const h2 = q.geom.roomEdgeHandles(key).find((h) => h.axis === "x" && h.ux > 0);
      await q.drag(h2.x, h2.z, h2.x - 900, h2.z);
      return { action, before, wider, clamped: size(), rooms: q.geom.detectRooms().length, typed };
    });
    assert.equal(out.typed.shown, true, "a rectangular room shows typed W×D");
    assert.deepEqual({ w: out.typed.w, d: out.typed.d }, { w: 350, d: 300 });
    assert.equal(out.action, "wall", "the handle starts a wall drag");
    assert.deepEqual(out.before, { w: 350, d: 300 });
    assert.deepEqual(out.wider, { w: 450, d: 300 },
      "the side moved along its normal only — the depth is untouched");
    assert.equal(out.clamped.d, 300, "still only one axis");
    assert.equal(out.clamped.w, 220, "and it stopped at the bedroom preset's own minimum");
    assert.equal(out.rooms, 1, "the room is still a room");
  } finally {
    await page.close();
  }
});

test("resizing a room into its neighbour joins them instead of overlapping", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs;
      q.blank();
      q.stamp("bedroom", 0, 0);          // right-hand face at x = 180
      q.stamp("bathroom", 600, 0);       // left-hand face at x = 475
      const before = q.report();
      const bedroom = q.geom.detectRooms()
        .find((r) => (q.S.roomMeta[r.key] || {}).name === "Bedroom");
      q.select({ kind: "room", ref: bedroom.key });
      const right = q.geom.roomEdgeHandles(bedroom.key).find((h) => h.axis === "x" && h.ux > 0);
      // pull it out until it meets the bathroom's near face
      await q.drag(right.x, right.z, 475, right.z);
      return { before, after: q.report() };
    });
    assert.equal(out.before.shared, 0);
    assert.equal(out.after.rooms, 2, "still two rooms");
    assert.equal(out.after.shared, 1, "and now one wall between them, not two");
    assert.deepEqual(out.after.names.sort(), ["Bathroom", "Bedroom"]);
    assert.equal(out.after.orphans, 0);
  } finally {
    await page.close();
  }
});

test("biting a span out of the party wall opens one room into the other", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs, S = q.S;
      q.blank();
      q.stamp("livingKitchen", 0, 0);
      q.stamp("bedroom", 265 + 185 + 6, 30);
      const before = q.report();
      q.inter.setTool("wallbite");
      // sweep the middle of the wall the two rooms share
      const party = q.partyWall();
      const g = q.geom.wallGeom(party);
      const line = S.nodes[party.a].x;
      /* Everything standing on that line, which is more than the party wall:
         docking split the living room's side, so a stub of it is up there too. */
      const onLine = () => S.walls
        .filter((w) => Math.abs(S.nodes[w.a].x - line) < 1 && Math.abs(S.nodes[w.b].x - line) < 1)
        .map((w) => Math.round(q.geom.wallGeom(w).L))
        .sort((m, n) => m - n);
      const wallBefore = onLine();
      const a = q.geom.wallPointAt(party, g.L / 2 - 60);
      const b = q.geom.wallPointAt(party, g.L / 2 + 60);
      const action = await q.drag(a.x, a.z, b.x, b.z);
      const after = q.report();
      const total = (list) => list.reduce((sum, n) => sum + n, 0);
      return {
        before, action, after,
        spans: onLine(), stubs: onLine().filter((n) => n === 95).length,
        removed: total(wallBefore) - total(onLine()),
        wallLength: Math.round(g.L),
      };
    });
    assert.equal(out.before.rooms, 2);
    assert.equal(out.action, "wallbite");
    assert.equal(out.after.rooms, 1, "the two spaces became one");
    assert.deepEqual(out.after.names, ["Living / kitchen"],
      "and it kept the name of the larger of the two");
    assert.equal(out.stubs, 2, "a stub either side of the gap");
    assert.equal(out.removed, 120, "and exactly the swept span is gone from that line");
    assert.equal(95 + 120 + 95, out.wallLength, "the two stubs and the gap are the wall");
    assert.equal(out.after.openings.length, 0, "the door that was in the removed span went with it");
    assert.equal(out.after.orphans, 0);
  } finally {
    await page.close();
  }
});

test("a bite too short to be an opening is refused, and the wall is untouched", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs;
      q.blank();
      q.stamp("bedroom", 0, 0);
      const before = q.report();
      const walls = q.S.walls.length;
      q.inter.setTool("wallbite");
      const wall = q.wallAt(180);
      const g = q.geom.wallGeom(wall);
      const a = q.geom.wallPointAt(wall, g.L / 2);
      const b = q.geom.wallPointAt(wall, g.L / 2 + 6);
      await q.drag(a.x, a.z, b.x, b.z);
      return { before, after: q.report(), walls, wallsAfter: q.S.walls.length };
    });
    assert.equal(out.wallsAfter, out.walls, "nothing was cut");
    assert.deepEqual(out.after, out.before);
  } finally {
    await page.close();
  }
});

test("dragging a room off its neighbour leaves the neighbour where it was", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs;
      q.blank();
      q.stamp("bedroom", 0, 0);
      q.stamp("bathroom", 180 + 125 + 5, 0);   // docks: they share a wall
      const docked = q.report();
      const bedBefore = q.box(q.roomNamed("Bedroom"));

      /* Pull the bathroom clear. Its cycle INCLUDES the party wall, whose
         corners are equally the bedroom's, so without a seam break this drags
         the bedroom's side along and stretches it. */
      const bath = q.roomNamed("Bathroom");
      await q.drag(bath.cx, bath.cz, bath.cx + 400, bath.cz);
      const apart = q.report();
      const bedAfter = q.box(q.roomNamed("Bedroom"));

      // and back again, stopping a few centimetres short so the magnet works
      const moved = q.roomNamed("Bathroom");
      await q.drag(moved.cx, moved.cz, moved.cx - 394, moved.cz);
      return { docked, bedBefore, apart, bedAfter, rejoined: q.report() };
    });
    assert.equal(out.docked.shared, 1, "they start out sharing a wall");
    assert.deepEqual(out.bedAfter, out.bedBefore,
      "the room that was not dragged is exactly where it was");
    assert.equal(out.apart.rooms, 2, "both are still rooms");
    assert.deepEqual(out.apart.names.sort(), ["Bathroom", "Bedroom"]);
    assert.equal(out.apart.shared, 0, "and they no longer share anything");
    assert.equal(out.apart.orphans, 0);

    assert.equal(out.rejoined.rooms, 2, "putting it back gives two rooms again");
    assert.equal(out.rejoined.shared, 1, "sharing one wall, not two lying on each other");
    assert.deepEqual(out.rejoined.names.sort(), ["Bathroom", "Bedroom"]);
  } finally {
    await page.close();
  }
});

test("a room held a corridor's width off a wall previews the hallway, then builds it", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs, S = q.S;
      q.blank();
      q.stamp("bedroom", 0, 0);                 // right-hand face at x = 180
      q.stamp("bathroom", 900, 0);              // well clear of it
      const before = q.report();

      /* Drag the bathroom in until it is roughly a corridor's width off the
         bedroom: 180 + 120 gap + half the bathroom's 250 centreline. */
      const bath = q.roomNamed("Bathroom");
      const target = 180 + 120 + 125;
      const watch = () => {
        const d = S.dragRoom && S.dragRoom.dock;
        return {
          mode: d ? d.mode : null,
          corridor: S.dragRoom && S.dragRoom.corridor
            ? Math.round(Math.min(
                S.dragRoom.corridor.x1 - S.dragRoom.corridor.x0,
                S.dragRoom.corridor.z1 - S.dragRoom.corridor.z0)) : null,
        };
      };
      const run = await q.drag(bath.cx, bath.cz, target, bath.cz, watch);
      return { before, run, after: q.report() };
    });
    assert.equal(out.before.rooms, 2);
    const previewed = out.run.seen.filter((f) => f.mode === "corridor");
    assert.ok(previewed.length, "the hallway was previewed before the release");
    assert.ok(previewed.every((f) => f.corridor === 120),
      "and the outline drawn is the corridor's own width");

    assert.equal(out.after.rooms, 3, "bedroom, bathroom and the hallway between them");
    assert.deepEqual(out.after.names.sort(), ["Bathroom", "Bedroom", "Corridor"]);
    assert.equal(out.after.openings.length, 2, "open at both ends");
    assert.ok(out.after.openings.every((o) => o.indexOf("passage") === 0),
      "circulation opens rather than doors");
    assert.equal(out.after.orphans, 0);
  } finally {
    await page.close();
  }
});

test("a room dropped flush still just shares a wall — no hallway appears", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(async () => {
      const q = window.__rs;
      q.blank();
      q.stamp("bedroom", 0, 0);
      q.stamp("bathroom", 900, 0);
      const bath = q.roomNamed("Bathroom");
      await q.drag(bath.cx, bath.cz, 180 + 125 + 14, bath.cz);
      return q.report();
    });
    assert.equal(out.rooms, 2, "no corridor was invented");
    assert.equal(out.shared, 1);
    assert.deepEqual(out.openings, ["door:70"]);
  } finally {
    await page.close();
  }
});

test("a WC stamped inward against a living-room wall inserts instead of colliding", opts, async () => {
  const page = await openPage({ width: 1280, height: 900, mobile: false, touch: false });
  try {
    await planner(page);
    const out = await page.eval(() => {
      const q = window.__rs, S = q.S;
      q.blank();
      q.stamp("livingKitchen", 0, 0);
      const ghost = (() => {
        q.inter.setTool("roomstamp");
        q.inter.armRoomStamp("wc");
        q.inter.updateRoomGhost(185, 0);
        const g = S.roomGhost;
        const placed = q.inter.commitRoomStamp();
        q.inter.setTool("select");
        q.plan2d.render2DNow();
        return { ghost: g && { blocked: g.blocked, mode: g.dock && g.dock.mode }, placed: !!(placed && placed.ok) };
      })();
      const living = q.roomNamed("Living / kitchen");
      const wc = q.roomNamed("WC");
      const door = S.openings[0];
      const wall = door && S.walls.find((w) => w.id === door.wall);
      const doorX = wall ? Math.round((S.nodes[wall.a].x + S.nodes[wall.b].x) / 2) : null;
      return {
        ...ghost,
        rooms: q.geom.detectRooms().length,
        names: q.report().names.sort(),
        openings: q.report().openings,
        doorX,
        livingRect: living ? q.geom.roomClearSize(living.key) : "missing",
        wcSize: wc ? q.geom.roomClearSize(wc.key) : null,
      };
    });
    assert.equal(out.ghost.blocked, null, "the inward snap is not drawn as a collision");
    assert.equal(out.ghost.mode, "insert");
    assert.equal(out.placed, true);
    assert.equal(out.rooms, 2);
    assert.deepEqual(out.names, ["Living / kitchen", "WC"]);
    assert.deepEqual(out.openings, ["door:65"]);
    assert.equal(out.doorX, 105, "door on the new inner wall, not the exterior");
    assert.equal(out.livingRect, null, "the leftover living room is an L");
    assert.equal(out.wcSize && Math.round(out.wcSize.w), 150);
  } finally {
    await page.close();
  }
});
