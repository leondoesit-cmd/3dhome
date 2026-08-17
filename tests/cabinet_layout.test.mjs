import test from "node:test";
import assert from "node:assert/strict";
import * as cab from "../js/cabinet.js";
import * as nest from "../js/nest.js";
import * as stock from "../js/stock.js";
import { S } from "../js/state.js";
import { saveCabinetPreset, deleteCabinetPreset, cabinetPresets, setCabinetPresets } from "../js/cabinet_presets.js";
import { installSpatialProject, exportSpatialProject, importSpatialProject } from "../js/core/spatial_project.js";

function mk(preset, w, d, h, tweak) {
  const it = { type: "cabsys", w, d, h, x: 0, z: 0, rot: 0, room: null };
  it.cab = cab.makeSpec(preset, w, h, d);
  if (tweak) tweak(it.cab);
  return it;
}
function world(it) {
  S.items = [it];
  return it;
}

test("cabinet.js is importable in Node without Three.js", () => {
  assert.equal(typeof cab.layoutCab, "function");
  assert.equal(typeof cab.makeSpec, "function");
  const it = mk("w_classic", 200, 60, 240);
  const L = cab.layoutCab(it);
  assert.ok(L.cols.length >= 2);
  assert.ok(L.parts.length > 10);
});

test("every compartment type sets its contract flag", () => {
  const EXPECT = {
    hang: "rails", hangS: "rails", hang2: "rails", shelves: null, shoe: null,
    drawers: "drawers", pullout: "baskets", trouser: "trouser", laundry: "hamper",
    safe: "safe", tv: "tv", appl: "appl", open: null, box: null,
  };
  for (const t of Object.keys(cab.SEC)) {
    const it = world(mk("w_classic", 90, 60, 240, (sp) => {
      sp.auto = false;
      sp.cols = [{ w: 86.4, secs: [{ t, h: 210 }], door: { t: "hinged", leaves: 1, hinge: "R" } }];
    }));
    cab.normalizeSpec(it.cab, 90, 240, 60);
    const L = cab.layoutCab(it), cell = L.cols[0].secs[0], want = EXPECT[t];
    assert.ok(t in EXPECT, `unexpected SEC type ${t}`);
    if (want) assert.ok(cell[want], `${t} should set cell.${want}`);
  }
});

test("door runs leave an open niche uncovered and refuse sliding over it", () => {
  const it = world(mk("w_classic", 90, 60, 240, (sp) => {
    sp.auto = false;
    sp.cols = [{ w: 86.4, secs: [{ t: "shelves", h: 70 }, { t: "open", h: 60 }, { t: "shelves", h: 70 }], door: { t: "hinged", leaves: 1, hinge: "R" } }];
  }));
  cab.normalizeSpec(it.cab, 90, 240, 60);
  const L = cab.layoutCab(it), col = L.cols[0];
  assert.equal(col.runs.length, 2);
  assert.equal(col.secs[1].covered, false);
  assert.ok(col.secs[0].covered && col.secs[2].covered);

  const slide = world(mk("w_classic", 200, 60, 240, (sp) => {
    sp.auto = false;
    sp.cols = [
      { w: 96.4, secs: [{ t: "tv", h: 210 }], door: { t: "sliding" } },
      { w: 96.4, secs: [{ t: "shelves", h: 210 }], door: { t: "sliding" } },
    ];
  }));
  cab.normalizeSpec(slide.cab, 200, 240, 60);
  const Ls = cab.layoutCab(slide);
  assert.equal(cab.doorFit("sliding", cab.fitCtx(Ls, Ls.cols[0])).ok, false);
});

test("kitchen-run worktops do not overlap and profile metres follow the run", () => {
  const base = (x) => { const i = mk("k_base_drawers", 60, 60, 90); i.x = x; return i; };
  S.items = [base(0), base(60), base(120), base(180), base(240)];
  const tops = S.items.flatMap((it) => cab.layoutCab(it).parts.filter((p) => p.role === "worktop").map((p) => [it.x + p.x0, it.x + p.x1]));
  let overlap = 0;
  for (let i = 0; i < tops.length; i++)
    for (let j = i + 1; j < tops.length; j++)
      overlap = Math.max(overlap, Math.min(tops[i][1], tops[j][1]) - Math.max(tops[i][0], tops[j][0]));
  assert.ok(overlap <= 0.01, `overlap ${overlap.toFixed(1)} cm`);
  const edge = S.items.reduce((s, it) => s + cab.profileMeters(it), 0);
  assert.ok(Math.abs(edge - 4.2) < 0.05, `${edge.toFixed(2)} m, wanted 4.20`);
  S.items.forEach((it) => { it.x *= 10; });
  const apart = S.items.reduce((s, it) => s + cab.profileMeters(it), 0);
  assert.ok(Math.abs(apart - 9) < 0.05, `${apart.toFixed(2)} m, wanted 9.00`);
  const a = mk("k_base_drawers", 60, 60, 90), b = mk("k_base_drawers", 60, 60, 120);
  b.x = 60;
  S.items = [a, b];
  assert.equal(cab.cabRun(a).n, 1);
  assert.equal(cab.cabRun(b).n, 1);
});

test("corner unit is a pentagon with cut boards and does not join a run", () => {
  const it = world(mk("k_corner", 90, 90, 90));
  const L = cab.layoutCab(it);
  const poly = cab.cornerPoly(it.cab, 90, 90);
  assert.equal(poly.length, 5);
  assert.ok(L.parts.some((p) => p.k === "poly"));
  assert.ok(cab.cutList(it, L).some((r) => r.cut > 0));
  assert.ok(cab.cabPrice(it) > 0);
  assert.equal(cab.cabRun(it).n, 1);
});

test("System 32 drill plan covers every vertical board", () => {
  const it = world(mk("w_classic", 240, 60, 240));
  const L = cab.layoutCab(it), dp = cab.drillPlan(it, L);
  const boards = L.parts.filter((p) => p.role === "side" || p.role === "divider").length;
  const patterns = dp.filter((e) => e.role === "side" || e.role === "divider").length;
  assert.equal(patterns, boards);
  const holes = dp.flatMap((e) => e.holes.map((h) => ({ ...h, e })));
  assert.ok(holes.length > 0);
  assert.ok(holes.filter((h) => h.kind === "pin").every((h) => Math.abs(h.y - 37) < 0.5 || Math.abs(h.y - (h.e.w - 37)) < 0.5));
  assert.ok(holes.filter((h) => h.kind === "cup").every((h) => h.d === 35 && Math.abs(h.y - 22.5) < 0.5));
  assert.ok(holes.every((h) => h.x >= 0 && h.y >= 0 && h.x <= h.e.l && h.y <= h.e.w));
});

test("nesting places every panel without overlap, grain lock, or quote drift", () => {
  S.items = [mk("w_classic", 200, 60, 240), mk("k_base_drawers", 240, 60, 90), mk("sh_float", 150, 26, 110)];
  S.items[1].x = 400; S.items[2].x = 800;
  const q = nest.quote(S.items);
  assert.equal(q.nest.unplaced.length, 0, q.nest.unplaced.map((p) => p.role).join(", "));
  let bad = null;
  q.nest.groups.forEach((gr) => gr.sheets.forEach((sh) => {
    sh.place.forEach((a) => {
      if (a.x + a.w > gr.sheet.w + 0.01 || a.y + a.h > gr.sheet.l + 0.01) bad = "off the sheet";
    });
    for (let i = 0; i < sh.place.length; i++)
      for (let j = i + 1; j < sh.place.length; j++) {
        const A = sh.place[i], B = sh.place[j];
        if (Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 1e-6 &&
            Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 1e-6) bad = "overlap";
      }
  }));
  assert.equal(bad, null);
  assert.ok(q.nest.groups.every((gr) => gr.sheets.every((sh) => sh.place.every((p) => !(p.p.grain && p.rot)))));
  assert.ok(q.yield > 0.55 && q.yield <= 1, `${(q.yield * 100).toFixed(1)}%`);
  assert.ok(q.nest.groups.every((gr) => gr.sheets.every((sh) => sh.place.every((p) => p.p.no > 0))));
  assert.ok(Math.abs(q.total - (q.net + q.margin + q.vat)) < 1);
  assert.doesNotThrow(() => {
    nest.cutCSV(q, true);
    nest.drillCSV(q.items, true);
    nest.nestDXF(q);
    nest.purchaseOrders(q, true);
    nest.quoteHTML(q, { en: true });
  });
  const html = nest.quoteHTML(q, { en: true });
  assert.equal(/yield|margin|sheets? #/i.test(html.replace(/<style[\s\S]*?<\/style>/, "")), false);
});

test("offcut rack rejects scraps", () => {
  stock.clearOffcuts();
  stock.addOffcuts([{ sheet: "mel_white_18", l: 100, w: 60, from: "qa-layout" }]);
  const banked = stock.offcuts().length;
  assert.equal(banked, 1);
  stock.addOffcuts([{ sheet: "mel_white_18", l: 5, w: 5 }]);
  assert.equal(stock.offcuts().length, banked);
  stock.clearOffcuts();
});

test("copy/paste duplicate hid values are re-tagged in normalizeSpec", () => {
  const it = mk("w_classic", 200, 60, 240);
  cab.normalizeSpec(it.cab, 200, 240, 60);
  const original = it.cab.cols[0].hid;
  assert.ok(original);
  it.cab.cols.push(JSON.parse(JSON.stringify(it.cab.cols[0])));
  cab.normalizeSpec(it.cab, 200, 240, 60);
  const ids = it.cab.cols.map((c) => c.hid);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(it.cab.cols[0].hid, original);
});

test("a legacy spec heals missing stock and carcass fields", () => {
  const old = {
    type: "cabsys", w: 200, d: 60, h: 240, x: 0, z: 0, rot: 0,
    cab: {
      preset: "w_classic", fam: "wardrobe", panel: 1.8, back: 0.8, plinth: 8, plinthType: "recessed", gap: 0.3, open: 0, hw: {},
      cols: [{ w: 96, secs: [{ t: "hang", h: 200 }], door: { t: "hinged" } }, { w: 96, secs: [{ t: "shelves", h: 200 }], door: { t: "hinged" } }],
      auto: false,
    },
  };
  cab.normalizeSpec(old.cab, old.w, old.h, old.d);
  assert.ok(old.cab.stock);
  assert.equal(old.cab.carcass, "full");
  assert.ok(cab.cabPrice(old) > 0);
});

test("user cabinet presets live on the spatial document", () => {
  const state = { workspace: { id: "house", floors: [] }, items: [], nodes: [], walls: [] };
  installSpatialProject(state);
  setCabinetPresets([], state);
  saveCabinetPreset({ name: "Mine", cab: { preset: "blank", fam: "wardrobe" } }, state);
  assert.equal(cabinetPresets(state).length, 1);
  assert.equal(cabinetPresets(state)[0].name, "Mine");
  const saved = exportSpatialProject(state);
  assert.equal(saved.cabinetPresets[0].name, "Mine");
  const restored = { workspace: { id: "other", floors: [] } };
  importSpatialProject(restored, saved);
  assert.equal(restored.spatial.cabinetPresets[0].name, "Mine");
  deleteCabinetPreset(0, state);
  assert.equal(cabinetPresets(state).length, 0);
});

test("sweep: presets × sizes × doors × modes layout without throwing", () => {
  const problems = [];
  let combos = 0;
  const audit = (label, it) => {
    combos++;
    try {
      world(it);
      const L = cab.layoutCab(it);
      L.parts.forEach((p) => {
        if (!p.mat) problems.push(`${label}: ${p.role} has no material`);
        if (p.k !== "box") return;
        if (["door", "doorPanel", "batten", "glazing", "handle", "hinge", "track", "worktop", "filler"].includes(p.role) || p.unit != null) return;
        if (p.x1 - p.x0 <= 0 || p.y1 - p.y0 <= 0 || p.z1 - p.z0 <= 0) problems.push(`${label}: ${p.role} is degenerate`);
        if (p.y0 < -0.6 || p.y1 > it.h + 0.6) problems.push(`${label}: ${p.role} is outside the carcass`);
      });
      L.cols.forEach((col, ci) => col.secs.forEach((cell, si) => {
        const covered = (col.runs || []).some((r) => si >= r.i0 && si <= r.i1);
        if (!!cell.covered !== covered) problems.push(`${label}: col${ci}.${si} covered disagrees with the runs`);
      }));
      cab.cutList(it, L); cab.hardwareList(it, L); cab.cabPrice(it, L);
      cab.checkCab(it, 270); cab.planCab(it); cab.cabSummary(it); cab.drillPlan(it, L);
      nest.quote([it]);
    } catch (e) { problems.push(`${label}: THREW ${e.message}`); }
  };
  cab.PRESETS.forEach((p) => {
    const f = cab.FAM[p.fam];
    [[f.w, f.d, f.h], [Math.max(40, f.w * 0.5), f.d, Math.max(40, f.h * 0.5)], [f.w * 2.4, f.d, f.h]]
      .forEach(([w, d, h]) => audit(`${p.id} ${Math.round(w)}×${Math.round(d)}×${Math.round(h)}`, mk(p.id, Math.round(w), Math.round(d), Math.round(h))));
  });
  Object.keys(cab.SEC).forEach((st) => Object.keys(cab.DOORS).forEach((dt) => [0, 1].forEach((op) => {
    const it = mk("w_classic", 200, 60, 240, (sp) => {
      sp.auto = false;
      sp.cols = [
        { w: 96.4, secs: [{ t: st, h: 210 }], door: { t: dt, leaves: null, hinge: "R" } },
        { w: 96.4, secs: [{ t: "shelves", h: 210 }], door: { t: dt, leaves: null, hinge: "L" } },
      ];
      sp.open = op;
    });
    cab.normalizeSpec(it.cab, 200, 240, 60);
    audit(`sec=${st} door=${dt} open=${op}`, it);
  })));
  Object.keys(cab.FRONTS).forEach((fs) => Object.keys(cab.CARCASS).forEach((cm) => Object.keys(cab.COLKIND).forEach((ck) => {
    const it = mk("book_open", 160, 45, 200, (sp) => {
      sp.auto = false; sp.front = fs; sp.carcass = cm;
      sp.cols[0].kind = ck === "normal" ? undefined : ck;
    });
    cab.normalizeSpec(it.cab, 160, 200, 45);
    audit(`front=${fs} carcass=${cm} kind=${ck}`, it);
  })));
  for (let m = 0; m < 16; m++) {
    const secs = [];
    for (let b = 0; b < 4; b++) secs.push({ t: (m >> b) & 1 ? "open" : "shelves", h: 55 });
    const it = mk("w_classic", 90, 60, 240, (sp) => {
      sp.auto = false;
      sp.cols = [{ w: 86.4, secs, door: { t: "hinged", leaves: 1, hinge: "R" } }];
    });
    cab.normalizeSpec(it.cab, 90, 240, 60);
    audit(`run mask ${m.toString(2).padStart(4, "0")}`, it);
  }
  assert.equal(problems.length, 0, `${combos} combos, ${problems.length} problems\n${[...new Set(problems)].slice(0, 12).join("\n")}`);
  assert.ok(combos > 100);
});
