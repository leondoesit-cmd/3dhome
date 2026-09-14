/* Recreate scratch/apartment/example.png with the basic wall tool.

 * No room presets. Corners are clicked, lengths and angles are typed in the
 * CAD length entry (17'-4", 19'-9", …), openings and furniture are placed
 * with the cursor, and sizes are typed in the inspector.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { openPage, findChrome } from "../tools/browser_harness.mjs";

const chrome = await findChrome();
const opts = chrome
  ? { timeout: 180000 }
  : { skip: "no Chrome found (set CHROME_PATH)", timeout: 180000 };

const SHOTS = new URL("../scratch/apartment/", import.meta.url).pathname;

async function bootPlanner(page) {
  await page.eval(async () => {
    const [state, inter, plan2d, geom, hud] = await Promise.all([
      import("/js/state.js"), import("/js/interaction.js"),
      import("/js/plan2d.js"), import("/js/geometry.js"),
      import("/js/cad_hud.js"),
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
    window.__apt = {
      S, inter, plan2d, geom, hud, frame,
      clickWorld(x, z) { ev("pointerdown", x, z); ev("pointermove", x, z); ev("pointerup", x, z); },
      async dragWorld(x0, z0, x1, z1) {
        ev("pointerdown", x0, z0);
        await frame();
        for (let i = 1; i <= 8; i++) {
          ev("pointermove", x0 + (x1 - x0) * i / 8, z0 + (z1 - z0) * i / 8);
          await frame();
        }
        ev("pointerup", x1, z1);
        await frame();
      },
      async clickEl(sel) {
        const el = document.querySelector(sel);
        if (!el) throw new Error("missing " + sel);
        el.click();
        await frame();
        return el;
      },
      async typeCad(len, ang) {
        hud.openEntry("");
        await frame();
        const lenEl = document.getElementById("cadLen");
        const angEl = document.getElementById("cadAng");
        if (!lenEl || lenEl.parentElement.hidden) throw new Error("CAD length entry closed");
        lenEl.value = String(len);
        angEl.value = String(ang);
        lenEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await frame();
      },
    };
  });
}

test("draw the kitchen remodel with the wall tool and typed sizes", opts, async () => {
  const page = await openPage({ width: 1440, height: 960, lang: "en", mobile: false, touch: false });
  try {
    await bootPlanner(page);
    await mkdir(SHOTS, { recursive: true });

    const started = await page.eval(async () => {
      const q = window.__apt;
      const start = document.getElementById("start-screen");
      if (start) start.hidden = false;
      await q.clickEl('[data-start="recreate"]');
      const unit = document.querySelector('[data-guide-field="guide_display_unit"]');
      if (unit) { unit.value = "ft"; unit.dispatchEvent(new Event("change", { bubbles: true })); }
      const prop = document.querySelector('[data-guide-field="guide_property"]');
      if (prop) { prop.value = "house"; prop.dispatchEvent(new Event("change", { bubbles: true })); }
      await q.frame();
      return {
        intention: q.S.workspace?.guidance?.intention,
        unit: q.S.workspace?.guidance?.details?.displayUnit,
      };
    });
    assert.equal(started.intention, "recreate");
    assert.equal(started.unit, "ft");

    const drawn = await page.eval(async () => {
      const q = window.__apt;
      const OX = 420, OZ = 180;
      await q.clickEl('[data-tool="wall"]');
      document.querySelector('[data-aid="ortho"]')?.click();
      document.querySelector('[data-wall-preset="generic"]')?.click();
      await q.frame();

      q.clickWorld(OX, OZ);
      await q.frame();
      await q.typeCad("17'-4\"", "0");
      await q.typeCad("28'-3\"", "90");
      await q.typeCad("17'-4\"", "90");
      q.clickWorld(OX, OZ);
      await q.frame();
      q.inter.finishDraw();
      q.plan2d.fitView();
      await q.frame();

      const kitchenE = OX + 528.32;
      const boxS = OZ + 603.25 + 259.08;
      function nearestNode(x, z) {
        let best = null, bestD = 1e9;
        (q.S.nodes || []).forEach((n) => {
          if (!n || n.x == null) return;
          const d = Math.hypot(n.x - x, n.z - z);
          if (d < bestD) { bestD = d; best = n; }
        });
        return best;
      }
      const westWall = q.S.walls.map((w) => {
        const a = q.S.nodes[w.a], b = q.S.nodes[w.b];
        return { w, a, b, mx: (a.x + b.x) / 2, z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
      }).filter((e) => Math.abs(e.mx - OX) < 25 && e.z1 - e.z0 > 100)
        .sort((a, b) => (b.z1 - b.z0) - (a.z1 - a.z0))[0];
      const dinN = (westWall ? westWall.z1 : boxS) - 213.36;
      const startDin = { x: westWall ? westWall.mx : OX, z: dinN };
      await q.clickEl('[data-tool="wall"]');
      await q.frame();
      q.clickWorld(startDin.x, startDin.z);
      await q.frame();
      await q.typeCad("12'-0\"", "180");
      await q.typeCad("7'-0\"", "90");
      await q.typeCad("12'-0\"", "90");
      q.inter.finishDraw();
      q.plan2d.fitView();
      await q.frame();

      const dinNW = nearestNode(startDin.x - 365.76, startDin.z);
      await q.clickEl('[data-tool="wall"]');
      document.querySelector('[data-wall-preset="interior"]')?.click();
      await q.frame();
      q.clickWorld(dinNW.x, dinNW.z);
      await q.frame();
      await q.typeCad("5'-6\"", "180");
      await q.typeCad("6'-6\"", "90");
      await q.typeCad("5'-6\"", "90");
      q.inter.finishDraw();
      await q.frame();

      const powSW = nearestNode(dinNW.x - 167.64, dinNW.z + 198.12);
      await q.clickEl('[data-tool="wall"]');
      await q.frame();
      q.clickWorld(powSW.x, powSW.z);
      await q.frame();
      await q.typeCad("3'-3\"", "0");
      await q.typeCad("4'-0\"", "90");
      await q.typeCad("3'-3\"", "90");
      await q.typeCad("4'-0\"", "90");
      q.inter.finishDraw();
      q.plan2d.fitView();
      q.plan2d.render2DNow();
      await q.frame();

      function mid(w) {
        const a = q.S.nodes[w.a], b = q.S.nodes[w.b];
        return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, wall: w };
      }
      await q.clickEl('[data-tool="select"]');
      for (const w of q.S.walls) {
        const m = mid(w);
        const outer = m.x < OX - 20 || m.x > kitchenE - 20 || m.z < OZ + 20 || m.z > boxS - 20;
        q.clickWorld(m.x, m.z);
        await q.frame();
        if (q.S.sel && q.S.sel.kind === "wall") {
          const th = document.getElementById("w_th");
          if (th) {
            th.value = outer ? "14" : "14";
            th.dispatchEvent(new Event("change", { bubbles: true }));
            await q.frame();
          }
        }
      }
      q.S.sel = null;
      q.plan2d.fitView();
      q.plan2d.render2DNow();
      return {
        walls: q.S.walls.length,
        rooms: q.geom.detectRooms().length,
        nodes: q.S.nodes.length,
      };
    });
    assert.ok(drawn.walls >= 8, JSON.stringify(drawn));
    assert.ok(drawn.rooms >= 3, JSON.stringify(drawn));

    const opened = await page.eval(async () => {
      const q = window.__apt;
      function rooms() { return q.geom.detectRooms(); }
      function box(room) {
        const xs = room.pts.map((p) => p.x), zs = room.pts.map((p) => p.z);
        return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), cx: room.cx, cz: room.cz, room };
      }
      const boxes = rooms().map(box).sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0));
      const kitchen = boxes[0];
      const dining = boxes.find((b) => b !== kitchen && b.x1 < kitchen.x0 + 80) || boxes[1];
      async function put(tool, x, z) {
        await q.clickEl('[data-tool="' + tool + '"]');
        q.clickWorld(x, z);
        await q.frame();
      }
      await put("window", (kitchen.x0 + kitchen.x1) / 2, kitchen.z0 + 2);
      await put("window", kitchen.x1 - 2, kitchen.z0 + 200);
      await put("window", (kitchen.x0 + kitchen.x1) / 2, kitchen.z1 - 2);
      await put("door", (dining.x0 + dining.x1) / 2, dining.z0 + 2);
      await put("passage", dining.x1 - 2, (dining.z0 + dining.z1) / 2);
      const powder = boxes.find((b) => b.x1 < dining.x0 + 40 && b !== dining);
      if (powder) await put("door", (powder.x0 + powder.x1) / 2, powder.z1 - 2);
      await q.clickEl('[data-tool="select"]');
      const opening = q.S.openings.find((o) => o.type === "opening" || o.type === "passage");
      if (opening) {
        q.S.sel = { kind: "opening", ref: opening };
        const ow = document.getElementById("o_w");
        if (ow) {
          ow.value = "126cm";
          ow.dispatchEvent(new Event("change", { bubbles: true }));
        }
        opening.width = 126;
      }
      q.S.sel = null;
      q.plan2d.render2DNow();
      return q.S.openings.map((o) => o.type);
    });
    assert.ok(opened.includes("door"), JSON.stringify(opened));
    assert.ok(opened.includes("window"), JSON.stringify(opened));

    const named = await page.eval(async () => {
      const q = window.__apt;
      const { roomMeasurements } = await import("/js/room_summary.js");
      function boxes() {
        return q.geom.detectRooms().map((room) => {
          const xs = room.pts.map((p) => p.x), zs = room.pts.map((p) => p.z);
          const m = roomMeasurements(q.S, room);
          return {
            room, key: room.key,
            x0: Math.min(...xs), x1: Math.max(...xs),
            z0: Math.min(...zs), z1: Math.max(...zs),
            area: room.area,
            interior: m && m.interior,
          };
        }).sort((a, b) => b.area - a.area);
      }
      async function nameAt(x, z, name) {
        await q.clickEl('[data-tool="select"]');
        q.clickWorld(x, z);
        await q.frame();
        const inp = document.getElementById("r_name");
        if (inp && q.S.sel && q.S.sel.kind === "room") {
          inp.value = name;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (q.S.sel && q.S.sel.kind === "room") {
          const key = q.S.sel.ref;
          q.S.roomMeta[key] = q.S.roomMeta[key] || {};
          q.S.roomMeta[key].name = name;
        } else {
          const hit = q.geom.detectRooms().find((r) => r.pts && r.pts.length >= 3 &&
            r.cx != null && Math.abs(r.cx - x) < 200);
          const room = q.geom.detectRooms().find((r) => {
            const xs = r.pts.map((p) => p.x), zs = r.pts.map((p) => p.z);
            return x >= Math.min(...xs) && x <= Math.max(...xs) && z >= Math.min(...zs) && z <= Math.max(...zs);
          });
          if (room) {
            q.S.roomMeta[room.key] = q.S.roomMeta[room.key] || {};
            q.S.roomMeta[room.key].name = name;
          }
        }
        q.plan2d.render2DNow();
        await q.frame();
      }
      const all = boxes();
      const kitchen = all[0];
      await nameAt((kitchen.x0 + kitchen.x1) / 2, kitchen.z0 + 200, "Kitchen");
      const rest = boxes().filter((b) => (q.S.roomMeta[b.key] || {}).name !== "Kitchen");
      const dining = rest.sort((a, b) => b.area - a.area)[0];
      if (dining) await nameAt((dining.x0 + dining.x1) / 2, (dining.z0 + dining.z1) / 2, "Dining room");
      const left = boxes().filter((b) => {
        const n = (q.S.roomMeta[b.key] || {}).name;
        return n !== "Kitchen" && n !== "Dining room";
      }).sort((a, b) => a.z0 - b.z0);
      if (left[0]) await nameAt((left[0].x0 + left[0].x1) / 2, (left[0].z0 + left[0].z1) / 2, "Powder");
      if (left[1]) await nameAt((left[1].x0 + left[1].x1) / 2, (left[1].z0 + left[1].z1) / 2, "Mud room");
      return boxes().map((b) => ({
        name: (q.S.roomMeta[b.key] || {}).name || null,
        interior: b.interior && { w: Math.round(b.interior.width * 10) / 10, d: Math.round(b.interior.depth * 10) / 10 },
        area: Math.round(b.area / 100) / 100,
      }));
    });
    assert.ok(named.some((r) => r.name === "Kitchen"), JSON.stringify(named));
    assert.ok(named.some((r) => r.name === "Dining room"), JSON.stringify(named));

    const furnished = await page.eval(async () => {
      const q = window.__apt;
      const { roomMeasurements } = await import("/js/room_summary.js");
      document.querySelector('[data-left-tab="library"]')?.click();
      await q.frame();
      function named(name) {
        return q.geom.detectRooms().find((r) => (q.S.roomMeta[r.key] || {}).name === name);
      }
      function boxOf(name) {
        const room = named(name);
        const m = room && roomMeasurements(q.S, room);
        if (m && m.interiorBounds) return m.interiorBounds;
        if (!room) return null;
        const xs = room.pts.map((p) => p.x), zs = room.pts.map((p) => p.z);
        return { x0: Math.min(...xs) + 8, x1: Math.max(...xs) - 8, z0: Math.min(...zs) + 8, z1: Math.max(...zs) - 8 };
      }
      async function pick(type) {
        const search = document.getElementById("furnSearch");
        if (search) {
          search.value = type;
          search.dispatchEvent(new Event("input", { bubbles: true }));
          await q.frame();
        }
        const item = document.querySelector('.furn-item[data-type="' + type + '"]');
        if (!item) throw new Error("catalog item missing " + type);
        item.click();
        await q.frame();
      }
      async function drop(type, x, z) {
        await pick(type);
        q.clickWorld(x, z);
        await q.frame();
        q.S.placeType = null;
        q.inter.setTool("select");
        await q.frame();
        return q.S.items.filter((it) => it.type === type).slice(-1)[0] || null;
      }
      async function typeSize(it, w, d, h, rot) {
        if (!it) return;
        q.inter.setTool("select");
        q.clickWorld(it.x, it.z);
        await q.frame();
        if (w != null) it.w = w;
        if (d != null) it.d = d;
        if (h != null) it.h = h;
        if (rot != null) it.rot = rot;
        const iw = document.getElementById("i_w");
        const id = document.getElementById("i_d");
        const ih = document.getElementById("i_h");
        const ir = document.getElementById("i_rot");
        if (iw && w != null) { iw.value = Math.round(w) + "cm"; iw.dispatchEvent(new Event("blur")); }
        if (id && d != null) { id.value = Math.round(d) + "cm"; id.dispatchEvent(new Event("blur")); }
        if (ih && h != null) { ih.value = Math.round(h) + "cm"; ih.dispatchEvent(new Event("blur")); }
        if (ir && rot != null) { ir.value = String(Math.round(rot)); ir.dispatchEvent(new Event("change", { bubbles: true })); }
        await q.frame();
      }

      const kitchen = boxOf("Kitchen");
      const dining = boxOf("Dining room");
      const powder = boxOf("Powder");
      if (!kitchen) throw new Error("kitchen bounds missing");

      const cabD = 63;
      const east = kitchen.x1 - cabD / 2;
      const kitchenSouth = kitchen.z0 + 603;
      let z = kitchen.z0 + 8;
      const run = [
        ["base", 91, 63],
        ["base", 76, 63],
        ["base", 46, 63],
        ["cooktop", 114, 63],
        ["base", 46, 63],
        ["base", 61, 63],
        ["oven", 76, 63],
        ["fridge", 91, 70],
      ];
      for (const [type, w, d] of run) {
        const it = await drop(type, east, z + w / 2);
        await typeSize(it, w, d, type === "oven" ? 210 : type === "fridge" ? 185 : 90, 90);
        z += w;
      }

      const island = await drop("island", kitchen.x0 + (kitchen.x1 - kitchen.x0) * 0.58, kitchen.z0 + 280);
      await typeSize(island, 244, 97, 90, 90);
      const isl = q.S.items.filter((it) => it.type === "island").slice(-1)[0];
      if (isl) {
        await q.dragWorld(isl.x, isl.z, kitchen.x1 - cabD - 107 - 48, kitchen.z0 + 138 + 122);
        await typeSize(isl, 244, 97, 90, 90);
        await drop("sink", isl.x, isl.z + 10);
        await drop("dishwasher", isl.x, isl.z + 90);
        for (let i = 0; i < 3; i++) {
          await drop("barstool", isl.x - 70, isl.z - 70 + i * 55);
        }
      }

      const benchN = await drop("bench", kitchen.x0 + 150, kitchen.z0 + 22);
      await typeSize(benchN, 220, 40, 45, 0);
      const benchW = await drop("bench", kitchen.x0 + 22, kitchen.z0 + 110);
      await typeSize(benchW, 140, 38, 45, 90);

      const stair = await drop("stairs", kitchen.x0 + 50, kitchen.z0 + 320);
      await typeSize(stair, 90, 220, 200, 0);

      let bath = powder;
      if (!bath) {
        const rooms = q.geom.detectRooms().map((room) => {
          const xs = room.pts.map((p) => p.x), zs = room.pts.map((p) => p.z);
          return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), area: room.area };
        }).sort((a, b) => a.area - b.area);
        bath = rooms.find((r) => r.x1 < kitchen.x0 - 20);
      }
      if (bath) {
        await drop("toilet", bath.x0 + 30, bath.z0 + 45);
        await drop("vanity", bath.x1 - 28, bath.z0 + 50);
      }

      const bevCab = await drop("base", kitchen.x1 - 32, kitchen.z1 - 80);
      await typeSize(bevCab, 180, 60, 90, 90);

      q.S.placeType = null;
      await q.clickEl('[data-tool="select"]');
      q.clickWorld((kitchen.x0 + kitchen.x1) / 2, kitchen.z0 + 400);
      q.S.sel = null;
      const toast = document.getElementById("toast-root");
      if (toast) toast.replaceChildren();
      const search = document.getElementById("furnSearch");
      if (search) { search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true })); }
      q.plan2d.fitView();
      q.plan2d.render2DNow();
      return {
        types: q.S.items.map((it) => it.type),
        kitchen,
        dining,
      };
    });
    await page.screenshot(SHOTS + "example-plan-2d.png");
    assert.ok(furnished.types.includes("island"), JSON.stringify(furnished.types));
    assert.ok(furnished.types.includes("fridge"));
    assert.ok(furnished.types.includes("cooktop"));
    assert.ok(furnished.types.includes("toilet") || furnished.types.includes("vanity"), JSON.stringify(furnished.types));

    const kitchen = named.find((r) => r.name === "Kitchen");
    if (kitchen && kitchen.interior) {
      assert.ok(Math.abs(kitchen.interior.w - 528.3) < 25, JSON.stringify(kitchen));
    }

    await page.screenshot(SHOTS + "example-plan-2d.png");
    await page.eval(async () => {
      const q = window.__apt;
      document.getElementById("view3dBtn")?.click();
      await q.frame();
      await new Promise((r) => setTimeout(r, 300));
    });
    await page.screenshot(SHOTS + "example-view-3d.png");
  } finally {
    await page.close();
  }
});
