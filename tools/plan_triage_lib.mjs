// Pure checks for tools/plan_triage.mjs, which sorts harvested sales-plan
// PDFs into training-ready / review / reject. A recognized plan passes when
// what the sheet itself states agrees with what was recognized: the printed
// apartment area against the walls' footprint, and the room count from the
// link or file name ("4 חדרים") against the enclosed spaces large enough to
// count as rooms. No network, disk or pdf.js here.
import { parseArea } from "../js/plan_recog/room_scale.js";

// Walls in cm ({ a:{x,y}, b:{x,y}, thickness }) -> enclosed spaces and the
// footprint (everything the outside cannot reach, walls included), in m².
// Walls run through doors and windows in the recognizer's output, so rooms
// close; a balcony open on one side floods from outside and is not counted.
export function spacesFromWalls(walls, cell = 5) {
  if (!walls.length) return { spaces: [], footprint: 0, bounds: null };
  const xs = walls.flatMap((w) => [w.a.x, w.b.x]), ys = walls.flatMap((w) => [w.a.y, w.b.y]);
  const pad = 2 * cell + Math.max(...walls.map((w) => w.thickness || 0));
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const w = Math.ceil((Math.max(...xs) + pad - x0) / cell), h = Math.ceil((Math.max(...ys) + pad - y0) / cell);
  if (w * h > 4e6) return { spaces: [], footprint: 0, bounds: null, tooLarge: true };
  const grid = new Uint8Array(w * h); // 1 wall, 2 outside, 0 inside
  for (const wall of walls) {
    const half = Math.max(cell * 0.75, (wall.thickness || 0) / 2);
    const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y, L2 = dx * dx + dy * dy || 1;
    const gx0 = Math.max(0, Math.floor((Math.min(wall.a.x, wall.b.x) - half - x0) / cell));
    const gx1 = Math.min(w - 1, Math.ceil((Math.max(wall.a.x, wall.b.x) + half - x0) / cell));
    const gy0 = Math.max(0, Math.floor((Math.min(wall.a.y, wall.b.y) - half - y0) / cell));
    const gy1 = Math.min(h - 1, Math.ceil((Math.max(wall.a.y, wall.b.y) + half - y0) / cell));
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = x0 + (gx + 0.5) * cell, py = y0 + (gy + 0.5) * cell;
        // distance to the segment, ends extended by half a thickness so corners close
        const t = Math.max(-half / Math.sqrt(L2), Math.min(1 + half / Math.sqrt(L2), ((px - wall.a.x) * dx + (py - wall.a.y) * dy) / L2));
        if (Math.hypot(px - wall.a.x - t * dx, py - wall.a.y - t * dy) <= half) grid[gy * w + gx] = 1;
      }
    }
  }
  const fill = (start, value) => {
    const stack = [start];
    grid[start] = value;
    let n = 0;
    let sx = 0, sy = 0;
    while (stack.length) {
      const i = stack.pop();
      n++;
      sx += i % w;
      sy += (i / w) | 0;
      const x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < w * h && grid[j] === 0) { grid[j] = value; stack.push(j); }
      }
    }
    return { n, cx: x0 + (sx / n + 0.5) * cell, cy: y0 + (sy / n + 0.5) * cell };
  };
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (grid[y * w + x] === 0) fill(y * w + x, 2);
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (grid[y * w + x] === 0) fill(y * w + x, 2);
  const m2 = (cells) => (cells * cell * cell) / 1e4;
  const spaces = [];
  const owner = new Int32Array(w * h).fill(-1);
  let outside = 0;
  for (let i = 0; i < w * h; i++) {
    if (grid[i] === 0) {
      const s = fill(i, 3);
      if (m2(s.n) >= 1) {
        spaces.push({ area: +m2(s.n).toFixed(2), x: Math.round(s.cx), y: Math.round(s.cy) });
        // tag this component's cells (value 3, not yet owned) with its index
        const stack = [i];
        owner[i] = spaces.length - 1;
        while (stack.length) {
          const c = stack.pop();
          const x = c % w;
          for (const j of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
            if (j >= 0 && j < w * h && grid[j] === 3 && owner[j] < 0) { owner[j] = owner[i]; stack.push(j); }
          }
        }
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (grid[i] === 2) outside++;
  // index of the enclosed space at a point (cm), -1 for wall, outside or slivers
  const locate = (x, y) => {
    const gx = Math.floor((x - x0) / cell), gy = Math.floor((y - y0) / cell);
    return gx < 0 || gy < 0 || gx >= w || gy >= h ? -1 : owner[gy * w + gx];
  };
  return { spaces, footprint: +m2(w * h - outside).toFixed(2), bounds: { x0, y0, x1: x0 + w * cell, y1: y0 + h * cell }, locate };
}

const ROOM_LABEL = /שינה|ממ["״]?ד|סלון|דיור|מגורים|מטבח|אוכל|רחצה|אמבט|שירותים|שרות|כביסה|living|bed|kitchen|bath/i;
const OWN_ROOM_LABEL = /שינה|ממ["״]?ד|bed/i; // each of these is its own room

// Where a text item's middle sits (pdf.js items: baseline start, angle, width).
function labelPoint(t) {
  const c = Math.cos(t.angle || 0), s = Math.sin(t.angle || 0), size = t.size || 10;
  return { x: t.x + (c * (t.width || 0)) / 2 + s * size * 0.35, y: t.y + (s * (t.width || 0)) / 2 - c * size * 0.35 };
}

/**
 * Do the sheet's own room names land in the recognized rooms? texts in sheet
 * units, k = cm per sheet unit, locate from spacesFromWalls. Passes when at
 * least 3 room names exist, 85% of them fall inside enclosed spaces, and no
 * two bedrooms / safe rooms share one space (a missing partition).
 */
export function roomLabelCheck(texts, k, locate) {
  const labels = texts.filter((t) => t.str && ROOM_LABEL.test(t.str) && !/מרפס/.test(t.str));
  if (labels.length < 3 || !locate) return { labels: labels.length, ok: null };
  let inside = 0;
  const own = new Map();
  for (const t of labels) {
    const p = labelPoint(t);
    const at = locate(p.x * k, p.y * k);
    if (at < 0) continue;
    inside++;
    if (OWN_ROOM_LABEL.test(t.str)) own.set(at, (own.get(at) || 0) + 1);
  }
  const shared = [...own.values()].filter((n) => n > 1).length;
  const fraction = inside / labels.length;
  return { labels: labels.length, inside: +fraction.toFixed(2), shared, ok: fraction >= 0.85 && shared === 0 };
}

const APARTMENT_WORDS = /דירה|שטח\s*(?:ה?דירה|עיקרי|כולל|ברוטו|נטו)?|עיקרי|ברוטו|נטו|apartment|unit|total/i;
const OTHER_WORDS = /מרפס|גינ|חצר|מחסן|חני|גג|ממ"?ד|ממ״ד|balcon|terrace|garden|storage|parking|roof/i;

/** All text items in content order, joined, with "מ " ר" style splits healed. */
export function textStream(texts) {
  return texts.map((t) => t.str || "").filter((s) => s.trim()).join(" ")
    .replace(/מ\s*["״'׳]\s*ר/g, 'מ"ר').replace(/\s+/g, " ");
}

const NUM = "(\\d{2,3}(?:[.,]\\d{1,2})?)";
const APARTMENT_AFTER = new RegExp(`שטח\\s*(?:ה)?דירה(?!\\s*(?:מרפס|גינ))[^\\d]{0,14}${NUM}`);
const APARTMENT_BEFORE = new RegExp(`${NUM}\\s*מ"ר[^\\d]{0,8}שטח\\s*(?:ה)?דירה`);

/**
 * Areas printed on the sheet, m². pdf.js splits Hebrew labels into pieces
 * ("שטח דירה" | "110.8" | "מ" | '"' | "ר"), so the apartment area is read
 * from the joined text stream: the number right after "שטח דירה" (or right
 * before it, for right-to-left extraction order). Every other "N מ"ר" is
 * kept in `all`. Returns { apartment, others, all }.
 */
export function statedAreas(texts) {
  const stream = textStream(texts);
  const all = [...stream.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*(?:מ"ר|m²|m2)/g)].map((m) => Number(m[1].replace(",", ".")));
  const m = APARTMENT_AFTER.exec(stream) || APARTMENT_BEFORE.exec(stream);
  let apartment = m ? Number(m[1].replace(",", ".")) : null;
  if (apartment !== null && (apartment < 25 || apartment > 400)) apartment = null;
  if (apartment === null) {
    // single strings that carry both the label and the value ("Apartment 98 m²")
    for (const t of texts) {
      const cm2 = t.str && parseArea(t.str);
      if (cm2 && APARTMENT_WORDS.test(t.str) && !OTHER_WORDS.test(t.str) && cm2 / 1e4 >= 25 && cm2 / 1e4 <= 400) apartment = +(cm2 / 1e4).toFixed(2);
    }
  }
  const others = all.filter((v) => v !== apartment);
  return { apartment, others, all };
}

/** Rooms from a link text, file name or title: "4 חדרים", "4.5 חד'", "5-rooms". */
export function roomCountHint(...strings) {
  for (const raw of strings) {
    if (!raw) continue;
    let s = String(raw);
    try { s = decodeURIComponent(s); } catch { /* keep raw */ }
    s = s.replace(/[_+-]+/g, " ");
    const m = /(?:^|[^\d.])(\d(?:\.5)?)\s*(?:חדרים|חדר|חד['׳]?(?=\s|$|\.|,)|ח['׳](?=\s|$)|rooms?\b|r\b)/i.exec(s);
    if (m) return Number(m[1]);
  }
  return null;
}

// Spaces that count as rooms in the Israeli sense (bedrooms, living, safe
// room): big enough to live in. Kitchens open to the living room are part of
// it; bathrooms, corridors and storage fall below the cut.
export const ROOM_MIN_M2 = 7;

export function countedRooms(spaces) {
  return spaces.filter((s) => s.area >= ROOM_MIN_M2).length;
}

/**
 * Verdict for walls read from filled shapes (js/plan_recog/fill_walls.js).
 * fill: { lengthM, footprint } or null. The fills are the drawing's own wall
 * shapes, so once the outline they close agrees with the printed apartment
 * area the interior is taken as right too; without a printed area there is
 * nothing to confirm it. Same statuses as judgePage.
 */
export function judgeFill({ fill, scale, stated, labels, agreement }) {
  if (!fill) return { status: "reject", reasons: ["no wall fills"], checks: {} };
  const reasons = [];
  const checks = { lengthM: fill.lengthM, footprint: fill.footprint };
  if (scale !== "dimensions" && scale !== "scale-note") reasons.push("scale from " + scale);
  if (fill.lengthM < 10) reasons.push("wall fills too short");
  // whole-floor sheets (several flats) are fine training data; site plans are not
  if (fill.footprint < 20 || fill.footprint > 1500) reasons.push("footprint " + fill.footprint + " m²");
  // Confirmation, any one of: the printed area; the sheet's room names in
  // separate rooms of the mask; the outline reader independently finding the
  // same walls. A printed area that disagrees overrules the others.
  const confirmations = [];
  if (stated?.apartment) {
    checks.area = +(fill.footprint / stated.apartment).toFixed(3);
    if (checks.area < 0.85 || checks.area > 1.15) reasons.push("footprint/stated area " + checks.area.toFixed(2));
    else confirmations.push("area");
  }
  if (labels && labels.ok !== null) {
    checks.labels = labels;
    if (labels.ok) confirmations.push("room names");
  }
  if (agreement) {
    checks.agreement = agreement;
    if (agreement.onMask >= 0.8 && agreement.covered >= 0.8) confirmations.push("readers agree");
  }
  checks.confirmedBy = confirmations;
  if (!confirmations.length) reasons.push("nothing confirms the walls");
  return { status: reasons.length ? "review" : "train", reasons, checks };
}

const RANK = { train: 3, review: 2, reject: 1, raster: 0 };
/** The better of two verdicts (train > review > reject). */
export function betterVerdict(a, b) {
  return (RANK[b.status] || 0) > (RANK[a.status] || 0) ? b : a;
}

/**
 * Verdict for one recognized page. rec: { raster, walls, wallMeters, scale,
 * spaces, footprint, stated, roomHint }. Returns { status, reasons, checks }
 * with status "train" (weak labels agree), "review", "reject" or "raster".
 */
export function judgePage(rec) {
  const reasons = [];
  const checks = {};
  if (rec.raster) return { status: "raster", reasons: ["no vector line work"], checks };
  if (rec.walls < 8 || rec.wallMeters < 15) return { status: "reject", reasons: ["too few walls"], checks };
  const strongScale = rec.scale === "dimensions" || rec.scale === "scale-note";
  if (!strongScale) reasons.push("scale from " + rec.scale);
  const rooms = countedRooms(rec.spaces);
  checks.enclosed = rec.spaces.length;
  if (rec.spaces.length < 3) reasons.push("rooms do not close");
  if (rec.footprint > 0 && (rec.footprint < 20 || rec.footprint > 450)) reasons.push("footprint " + rec.footprint + " m²");
  if (rec.stated?.apartment) {
    // Israeli sales plans state the area to the outer wall faces; the
    // footprint here includes the walls, so they should agree closely.
    const ratio = rec.footprint / rec.stated.apartment;
    checks.area = +ratio.toFixed(3);
    if (ratio < 0.85 || ratio > 1.15) reasons.push("footprint/stated area " + ratio.toFixed(2));
  }
  if (rec.roomHint) {
    // a disagreement rejects; agreement alone is too weak to confirm
    checks.rooms = { stated: rec.roomHint, counted: rooms };
    if (Math.abs(rooms - Math.floor(rec.roomHint)) > 1) reasons.push(`rooms ${rooms} vs stated ${rec.roomHint}`);
  }
  // Room names are optional evidence: a sheet whose names sit outside the
  // recognized rooms can still train the walls (room types come later from
  // area, contents and wall thickness). They only confirm a plan that has no
  // printed area, and then most of them must land in rooms.
  if (rec.labels && rec.labels.ok !== null) checks.labels = rec.labels;
  const labelsConfirm = checks.area === undefined && rec.labels?.ok === true;
  // confirmed = the printed area agrees, or (without one) the room names do
  const confirmed = checks.area !== undefined || labelsConfirm;
  if (!reasons.length && confirmed) return { status: "train", reasons, checks };
  if (!confirmed) reasons.push("nothing on the sheet to check against");
  return { status: "review", reasons, checks };
}
