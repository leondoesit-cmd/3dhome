/* Cabinet profile/band metres, box counts, hardware lists, quotes and prices,
   split out of js/cabinet.js. It shares the editor's state through live imports
   from ../cabinet.js. */
import { cutList, leafWeight } from "../cabinet/hardware.js";
import { carcassLabel, doorLabel, frontLabel, kindLabel, secLabel } from "../cabinet/labels_plan.js";
import { layoutCab, sectionOpen } from "../cabinet/layout.js";
import { innerOf } from "../cabinet/presets.js";
import { S } from "../state.js";
import { bandById, bandPPM, laborRate, perM2, profileById, profilePPM, sheetById } from "../stock.js";
import {
  EXTRA_PRICE, FRONTS, FRONT_ROLES, HW, MAT_PRICE, SEC, STD, YIELD, axisOf,
  carcassFit, cornerPoly, doorFit, fitCtx, frontFit, he, isCorner, isFloat,
  kindFit, secFit,
} from "../cabinet.js";

/* Metres of worked worktop edge this unit is responsible for: its own front,
   plus a return for whichever end of the run happens to be its end. Summed over
   a run that is the run's front plus two returns — where the old per-unit
   `w + 2d` billed two returns for every unit in it. */
export function profileMeters(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp;
  if (!sp.top) return 0;
  if (isCorner(sp)) { var top=L.parts.find(function(p){return p.role==="worktop"&&p.k==="poly";});return top ? Math.hypot(top.pts[3].x-top.pts[2].x,top.pts[3].z-top.pts[2].z)/100 : 0; }
  return (it.w + (L.run.first ? it.d : 0) + (L.run.last ? it.d : 0)) / 100;
}

/* How many carcasses a run is really built as. A 3 m wardrobe is not one box:
   it goes on a lorry, through a doorway and up a staircase, so a shop builds it
   in boxes of no more than about 120 cm and joins them on site. This is what
   assembly and fitting are billed per — the same number in the per-unit price
   and in the project quote, so the two can be compared. */
export function boxCount(it, pre) {
  var L = pre || layoutCab(it);
  if (isFloat(L.sp)) return 0; // shelves are fitted one by one, not assembled
  return Math.max(1, Math.ceil(it.w / STD.maxBox));
}

/* Total banding for a piece, in metres, and the cut length its boards need. */
export function bandMeters(it, pre) {
  var m = 0;
  cutList(it, pre).forEach(function (r) {
    m += r.band;
  });
  return Math.round(m * 100) / 100;
}

export function hardwareList(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    c = L.hw,
    out = [];
  function row(label, qty, unit) {
    if (qty > 0) out.push({ label: label, qty: Math.round(qty * 10) / 10, unit: unit, total: qty * unit });
  }
  var hg = HW.hinge[sp.hw.hinge] || HW.hinge.soft,
    sl = HW.slide[sp.hw.slide] || HW.slide.softFull,
    rl = HW.rail[sp.hw.rail] || HW.rail.oval,
    hd = HW.handle[sp.hw.handle] || HW.handle.bar;
  row(he("רגל מתכווננת", "Adjustable cabinet leg"), c.legs, EXTRA_PRICE.leg);
  row(he(hg.he, hg.en), c.hinges, hg.price);
  row(he(sl.he, sl.en) + he(" (זוג)", " (pair)"), c.slides, sl.price);
  row(he(rl.he, rl.en) + he(" · מ'", " · m"), Math.max(0, c.railLen), rl.price);
  row(he(hd.he, hd.en), sp.hw.handle === "push" ? 0 : c.handles, hd.price);
  if (sp.hw.handle === "push") row(he("מנגנון פוש", "Push-to-open latch"), c.handles, 18);
  row(he("פינים למדף", "Shelf pins"), c.pins, 1.2);
  row(he("בריח סמוי למדף צף", "Concealed shelf bracket"), c.brackets, EXTRA_PRICE.bracket);
  row(he("ערכת הזזה לדלת", "Sliding door kit"), c.slidingLeaves, EXTRA_PRICE.slidingKit);
  row(he("סל נשלף", "Pull-out basket"), c.baskets, EXTRA_PRICE.basket);
  row(he("סל כביסה", "Laundry hamper"), c.hampers, EXTRA_PRICE.hamper);
  row(he("מתלה מכנסיים", "Trouser rack"), c.trousers, EXTRA_PRICE.trouser);
  row(he("כספת", "Safe"), c.safes, EXTRA_PRICE.safe);
  row(he("זרוע לטלוויזיה", "TV wall bracket"), c.tvBrackets, EXTRA_PRICE.tvBracket);
  row(he("מעבר כבלים", "Cable grommet"), c.grommets, EXTRA_PRICE.grommet);
  row(he("תאורת LED · מ'", "LED lighting · m"), c.ledLen, EXTRA_PRICE.led);
  if (sp.hw.mirrorInside) row(he("מראה פנימית", "Interior mirror"), 1, EXTRA_PRICE.mirrorInside);
  if (sp.hw.lock) row(he("מנעול", "Lock"), 1, EXTRA_PRICE.lock);
  return out;
}

export function cabQuote(it, pre) {
  var L = pre || layoutCab(it),
    sp = L.sp,
    boards = cutList(it, L),
    styleK = (FRONTS[sp.front] || FRONTS.flat).extra,
    mat = 0,
    bandM = 0,
    cutM = 0,
    slabCutM = 0,
    byMat = {};
  boards.forEach(function (r) {
    var sheet = r.sheet ? sheetById(r.sheet) : null,
      per = sheet ? perM2(sheet) : MAT_PRICE[r.srole === "carcass" ? "carcass" : r.srole] || MAT_PRICE.carcass;
    // a framed or reeded front is more machining than a plain slab
    if (FRONT_ROLES.indexOf(r.role) >= 0) per *= styleK;
    var cost = r.area * per * YIELD;
    mat += cost;
    bandM += r.band;
    var run = (r.qty * (r.l + r.w)) / 100; // two cuts to free each board
    if (sheet && sheet.hand === "slab") slabCutM += run;
    else cutM += run;
    var k = r.sheet || r.srole;
    if (!byMat[k]) byMat[k] = { sheet: r.sheet, srole: r.srole, area: 0, cost: 0 };
    byMat[k].area += r.area;
    byMat[k].cost += cost;
  });

  var band = bandById(sp.band),
    bandCost = bandM * (bandPPM(band) + laborRate("bandPerM")),
    cutCost = cutM * laborRate("cutPerM") + slabCutM * laborRate("slabCutPerM"),
    hwCost = 0;
  hardwareList(it, L).forEach(function (r) {
    hwCost += r.total;
  });

  var c = L.hw,
    boxes = boxCount(it, L),
    fitCost =
      (c.hinges || 0) * laborRate("hingeBore") +
      (c.slides || 0) * laborRate("slideFit") +
      (c.pins || 0) * laborRate("shelfBore") +
      (isFloat(sp)
        ? (c.floatShelves || 0) * laborRate("fitPerShelf")
        : boxes * (laborRate("assemblyPerUnit") + laborRate("fitPerUnit")));

  /* A worked stone edge is charged per metre of exposed run, not per m² — and
     only the edges a person can see. This unit's share is its own front, plus a
     return for each end of the run that happens to be its end: summed over the
     run that comes to the run's front plus two returns, instead of the front
     plus two returns *per unit*, which is what it used to bill. */
  var prof = profileById(sp.profile),
    profM = profileMeters(it, L),
    profCost = prof && prof.id !== "none" ? profM * profilePPM(prof) : 0;

  var net = mat + bandCost + cutCost + hwCost + fitCost + profCost,
    margin = net * laborRate("margin");
  return {
    material: mat, byMat: byMat, boxes: boxes, bandM: Math.round(bandM * 10) / 10, band: bandCost,
    cutM: Math.round((cutM + slabCutM) * 10) / 10, cut: cutCost,
    hardware: hwCost, fitting: fitCost, profileM: Math.round(profM * 10) / 10, profile: profCost,
    net: net, margin: margin, total: net + margin,
  };
}

export function cabPrice(it, pre) {
  return Math.round(cabQuote(it, pre).total / 10) * 10;
}

// the item's local frame → world, matching how view3d places a piece
function toWorld(it, lx, lz) {
  var r = ((it.rot || 0) * Math.PI) / 180,
    c = Math.cos(r),
    s = Math.sin(r);
  return { x: it.x + lx * c - lz * s, z: it.z + lx * s + lz * c };
}

function segHit(a, b, c, d) {
  function cross(p, q, r) {
    return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  }
  var d1 = cross(c, d, a),
    d2 = cross(c, d, b),
    d3 = cross(a, b, c),
    d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// does a segment cross the footprint of another piece (its own rotated box)?
function segHitsItem(a, b, other) {
  var hw = other.w / 2,
    hd = other.d / 2,
    p = [
      toWorld(other, -hw, -hd), toWorld(other, hw, -hd),
      toWorld(other, hw, hd), toWorld(other, -hw, hd),
    ];
  var axis=axisOf(other);
  function inside(q){var dx=q.x-other.x,dz=q.z-other.z;return Math.abs(dx*axis.c+dz*axis.s)<hw && Math.abs(-dx*axis.s+dz*axis.c)<hd;}
  if(inside(a)||inside(b))return true;
  for (var i = 0; i < 4; i++) if (segHit(a, b, p[i], p[(i + 1) % 4])) return true;
  return false;
}

/* Local opening arcs are shared by plan symbols and clearance checks. Each
   arc carries the vertical interval of its actual leaf, not the full cabinet. */
export function cabinetDoorSwings(it, pre) {
  var L=pre||layoutCab(it),out=[],elev=L.sp.elev||0;
  if(isFloat(L.sp))return out;
  if(isCorner(L.sp)) {
    var dr=L.sp.cols[0].door||{},front=(L.fronts||[]).find(function(f){return f.role==="door";});
    if(!front || !["hinged","glass","mirror","folding"].includes(dr.t))return out;
    var poly=cornerPoly(L.sp,L.w,L.d),left=dr.hinge==="L",pivot=poly[left?3:2],closed=poly[left?2:3];
    var start=Math.atan2(closed.z-pivot.z,closed.x-pivot.x),sweep=left?Math.PI/2:-Math.PI/2;
    out.push({pivot:{...pivot},start:start,sweep:sweep,reach:L.cornerFront,col:0,type:dr.t,y0:front.y0+elev,y1:front.y1+elev});
    return out;
  }
  (L.fronts||[]).forEach(function(front){
    var u=L.units[front.unit];
    if(front.role!=="door" || !u || !(u.type==="door" || u.type==="fold" && u.outer))return;
    var left=Math.abs(u.px-front.x0)<0.01;
    var col=L.cols.find(function(c){return (front.x0+front.x1)/2>=c.x0 && (front.x0+front.x1)/2<=c.x1;});
    out.push({pivot:{x:u.px,z:u.pz},start:left?0:Math.PI,sweep:left?Math.PI/2:-Math.PI/2,
      reach:front.x1-front.x0,col:col?.i||0,type:u.type==="fold"?"folding":col?.ref.door?.t||"hinged",y0:front.y0+elev,y1:front.y1+elev});
  });
  return out;
}

/* Each hinged leaf at 90 degrees open, in room coordinates. */
export function doorSweeps(it, pre) {
  return cabinetDoorSwings(it,pre).map(function(sw){
    var angle=sw.start+sw.sweep;
    return {...sw,pivot:toWorld(it,sw.pivot.x,sw.pivot.z),
      tip:toWorld(it,sw.pivot.x+Math.cos(angle)*sw.reach,sw.pivot.z+Math.sin(angle)*sw.reach)};
  });
}

/* The things a joiner would query on the drawing before cutting anything.
   Each finding is {level, msg, col} — `err` is "this will not work", `warn`
   is "this will disappoint", `info` is a suggestion. Nothing here blocks the
   design: it is a second pair of eyes, not a validator. */
export function checkCab(it, ceilH) {
  var L = layoutCab(it),
    sp = L.sp,
    out = [],
    innerD = L.zc - L.zb;
  function add(level, hes, ens, col) {
    out.push({ level: level, msg: he(hes, ens), col: col });
  }
  // for messages that are already in the right language (the fit table's)
  function addMsg(level, msg, col) {
    out.push({ level: level, msg: msg, col: col });
  }

  if (S.parametric?.definitions?.[it.definitionId]?.metadata?.manufacturingReviewRequired)
    add("warn", "שינויי מודל מתקדמים דורשים בדיקת ייצור; כתב הכמויות הוא אומדן חלקי.", "Advanced model edits require manufacturing review; the bill of materials is a partial estimate.");
  if (ceilH && sp.elev + it.h > ceilH + 0.5)
    add("err", "הארון גבוה מהתקרה (" + Math.round(ceilH) + ' ס"מ)', "Taller than the ceiling (" + Math.round(ceilH) + " cm)");
  if (sp.elev > 0 && sp.elev < 40 && sp.plinth > 0)
    add("warn", "יחידה תלויה עם סוקל — בחרו סוקל 'ללא'", "A hung unit with a plinth — set the plinth to none");

  /* What being in a run means for this unit. Worth saying out loud: the run is
     invisible in the drawing (it is a property of where the pieces stand), so a
     worktop that suddenly belongs to the neighbour needs explaining. */
  if (L.run.n > 1) {
    addMsg("info",
      he("יחידה " + (L.run.i + 1) + " מתוך " + L.run.n + " ברצף באורך " + Math.round(L.run.span) + ' ס"מ',
        "Unit " + (L.run.i + 1) + " of " + L.run.n + " in a " + Math.round(L.run.span) + " cm run"));
    if (sp.top && !L.run.first)
      addMsg("info", he("המשטח נמדד על היחידה הראשונה ברצף", "The worktop is costed on the run's first unit"));
  }

  var envelope = innerOf(sp, it.w, it.h);
  var usedW = sp.cols.reduce(function (sum, c) { return sum + c.w; }, 0) + (isFloat(sp) ? 0 : sp.cols.length - 1) * sp.panel;
  if (usedW > envelope.w + 0.1 * sp.cols.length)
    add("err", "החלוקה חורגת מרוחב הארון", "Columns exceed the cabinet's available width");
  sp.cols.forEach(function (c, ci) {
    var usedH = c.secs.reduce(function (sum, section) { return sum + section.h; }, 0) + (c.secs.length - 1 + envelope.boardPerSec) * (sp.shelf || sp.panel);
    if (usedH > envelope.h + 0.1 * c.secs.length)
      add("err", "התאים חורגים מגובה הארון", "Compartments exceed the cabinet's available height", ci);
  });

  // the two cabinet-wide choices, against the same fit table
  var cfc = fitCtx(L, null),
    cfit = carcassFit(sp.carcass || "full", cfc),
    ffit = frontFit(sp.front || "flat", cfc);
  if (!cfit.ok) addMsg("err", carcassLabel(sp.carcass) + " — " + cfit.why);
  if (!ffit.ok) addMsg("warn", frontLabel(sp.front) + " — " + ffit.why);

  /* Floating shelves are a different animal: everything they carry goes into
     the wall, so the span, the board and the wall itself are the whole story. */
  if (isFloat(sp)) {
    L.cols.forEach(function (col, ci) {
      if (col.w > STD.floatSpan)
        add("warn", "מדף צף " + Math.round(col.w) + ' ס"מ — מעל ' + STD.floatSpan + " יש להוסיף בריח או לפצל",
          "Floating shelf " + Math.round(col.w) + " cm — over " + STD.floatSpan + " add a bracket or split it", ci);
    });
    if (sp.panel < 3)
      add("warn", 'מדף צף בעובי ' + sp.panel * 10 + ' מ"מ — לבריח סמוי צריך 30 מ"מ ומעלה',
        "A " + sp.panel * 10 + " mm floating shelf — a concealed bracket needs 30 mm or more");
    if (it.d > 32)
      add("info", "מדף צף בעומק " + Math.round(it.d) + ' ס"מ — עומק מעל 32 מגדיל את המומנט על הקיר',
        "A " + Math.round(it.d) + " cm deep floating shelf loads the wall hard");
    if (sp.elev < 20)
      add("info", "המדף התחתון כמעט על הרצפה — כדאי גובה תלייה גדול יותר",
        "The bottom shelf is almost on the floor — raise the mounting height");
    return out;
  }

  L.cols.forEach(function (col, ci) {
    var n = ci + 1,
      dr = col.ref.door || { t: "none" },
      where = " (" + he("עמודה ", "column ") + n + ")";
    /* The same table the designer greys options out with — so a design that
       arrives from a saved file, or one whose cabinet was resized under it,
       reports the thing that no longer fits instead of quietly building nothing.
       These are errors, not warnings: the part does not exist. */
    var fc = fitCtx(L, col),
      kfit = kindFit(col.kind || "normal", fc);
    if (!kfit.ok) addMsg("err", kindLabel(col.kind) + " — " + kfit.why + where, ci);

    if (col.kind === "filler") {
      if (col.w > 15 && col.w <= 25) add("warn", "פנל מילוי רחב מ-15 ס\"מ (עמודה " + n + ")", "Filler wider than 15 cm (column " + n + ")", ci);
      return;
    }
    if (col.kind === "blind") return;

    var dfit = doorFit(dr.t, fc);
    if (!dfit.ok) addMsg("err", doorLabel(dr.t) + " — " + dfit.why + where, ci);

    if (!isCorner(sp) && col.w > STD.maxSpan)
      add("warn", "מפתח מדף " + Math.round(col.w) + ' ס"מ — מעל ' + STD.maxSpan + " המדף ישקע (עמודה " + n + ")",
        "Shelf span " + Math.round(col.w) + " cm — over " + STD.maxSpan + " it will sag (column " + n + ")", ci);
    // a corner unit's leaf is the diagonal, not the column it spans
    var leafW = isCorner(sp) ? L.cornerFront || col.w : col.w / (col.doorLeaves || 1);
    if (dr.t !== "none" && dr.t !== "drawer" && dr.t !== "sliding" && leafW > STD.maxDoor + 5)
      add("warn", "כנף דלת " + Math.round(leafW) + ' ס"מ — עדיף זוג כנפיים (עמודה ' + n + ")",
        "Door leaf " + Math.round(leafW) + " cm — better as a pair (column " + n + ")", ci);
    /* What the leaf weighs, and whether the ironmongery is up to it. A lacquered
       or glass front is half as heavy again as melamine at the same size. */
    if (dr.t !== "none" && dr.t !== "drawer") {
      var kg = leafWeight(L, col);
      if (kg > 22)
        add("warn", "כנף במשקל " + Math.round(kg) + " ק\"ג (עמודה " + n + ") — צריך שני אנשים לתלייה",
          "A " + Math.round(kg) + " kg leaf (column " + n + ") — two people to hang it", ci);
      if (dr.t === "lift" && kg > 9)
        addMsg("info", he("בוכנת גז ל-" + Math.round(kg) + ' ק"ג', "Gas strut for a " + Math.round(kg) + " kg flap") + where, ci);
      if (kg > 6 * (col.hinges || 2) / (col.doorLeaves || 1))
        addMsg("info", he("שקלו ציר נוסף לכנף של " + Math.round(kg) + ' ק"ג', "Consider another hinge for a " + Math.round(kg) + " kg leaf") + where, ci);
    }

    col.secs.forEach(function (cell) {
      var s = cell.ref,
        H = cell.y1 - cell.y0;
      var sfit = secFit(s.t, col.w, fc.colH, innerD);
      if (!sfit.ok) addMsg("err", secLabel(s.t) + " — " + sfit.why + where, ci);
      if (s.t === "hang" || s.t === "hangS" || s.t === "hang2") {
        // deep enough to hang in at all is covered above; this is the "you will
        // be pressing shirts against the back" margin
        if (innerD >= 49.5 && innerD < 55)
          add("warn", 'עומק ' + Math.round(innerD) + ' ס"מ — קולבים ישתפשפו בגב', "Only " + Math.round(innerD) + " cm deep — verify hanger and clothing clearance", ci);
      }
      if (s.t === "hang" && H < STD.hangLong)
        add("warn", "תלייה ארוכה עם " + Math.round(H) + ' ס"מ פנוי — מעילים צריכים ' + STD.hangLong,
          "Long hang has only " + Math.round(H) + " cm — coats need " + STD.hangLong, ci);
      if (s.t === "hang2" && H < SEC.hang2.min)
        add("warn", "תלייה כפולה צריכה " + SEC.hang2.min + ' ס"מ (יש ' + Math.round(H) + ")",
          "Double hang needs " + SEC.hang2.min + " cm (has " + Math.round(H) + ")", ci);
      if(cell.invalidDrawers)add("err", "אין מקום לתיבת מגירה תקינה", "Drawer dimensions leave no room for a valid drawer box", ci);
      if (cell.drawers) {
        if (col.w > 120) add("warn", "מגירה ברוחב " + Math.round(col.w) + ' ס"מ — מעבר לטווח מסילות רגילות',
          "Drawer " + Math.round(col.w) + " cm wide — beyond standard runners", ci);
        if (cell.drawers.length > 5) add("info", "מעל 5 מגירות בעמודה " + n, "More than 5 drawers in column " + n, ci);
        if (cell.y1 > 145) add("info", "מגירה מעל 145 ס\"מ קשה לשימוש (עמודה " + n + ")",
          "A drawer above 145 cm is hard to use (column " + n + ")", ci);
      }
      /* A pull-out has to clear the door. With a pair of leaves both swing
         away and the whole column opens up; a single narrow leaf is what
         actually traps the drawer. */
      var access = (col.doorLeaves || 1) > 1 ? col.w : leafW;
      if ((cell.drawers || cell.baskets) && dr.t !== "none" && dr.t !== "drawer" && dr.t !== "sliding" && access < 40)
        add("warn", "מגירה/סל מאחורי כנף צרה (" + Math.round(access) + ' ס"מ) — לא ייצא במלואו',
          "Pull-out behind a narrow leaf (" + Math.round(access) + " cm) — it will not clear", ci);
      if (cell.y1 > 230 && s.t !== "box")
        add("info", "התא העליון בעמודה " + n + " מעל 230 ס\"מ — עדיף תא אחסון",
          "Column " + n + " has usable space above 230 cm — better as a storage box", ci);
      if (s.t === "shelves" && cell.shelves === 0 && H > 60)
        add("info", "תא מדפים בלי מדפים (עמודה " + n + ")", "Shelf compartment with no shelves (column " + n + ")", ci);
    });
  });

  /* Where the doors actually end up. A cabinet that cannot be opened is a
     cabinet nobody notices is wrong until it is installed. */
  doorSweeps(it, L).forEach(function (sw) {
    var n = sw.col + 1;
    (S.walls || []).forEach(function (wl) {
      var a = (S.nodes || [])[wl.a],
        b = (S.nodes || [])[wl.b];
      if (!a || !b) return;
      if (segHit(sw.pivot, sw.tip, a, b))
        add("err", "דלת עמודה " + n + " נחסמת על ידי קיר", "The door on column " + n + " is blocked by a wall", sw.col);
    });
    (S.items || []).forEach(function (other) {
      if (other === it || !other.w || !other.d) return;
      var otherBottom = other.cab?.elev ?? other.elev ?? 0;
      if (otherBottom + (other.h || 0) <= sw.y0 || otherBottom >= sw.y1) return;
      if (segHitsItem(sw.pivot, sw.tip, other))
        add("warn", "דלת עמודה " + n + " נפתחת לתוך פריט אחר", "The door on column " + n + " opens into another piece", sw.col);
    });
  });

  /* A niche behind a sliding leaf is not a niche. Buildable, so a warning rather
     than an error — but it is never what was meant. */
  L.cols.forEach(function (col, ci) {
    if ((col.ref.door || {}).t !== "sliding") return;
    col.secs.forEach(function (cell) {
      if (sectionOpen(cell.ref))
        addMsg("warn", secLabel(cell.ref.t) + " " + he("מאחורי דלת הזזה — הכנף תכסה אותו", "behind a sliding leaf — the door will cover it") + " (" + he("עמודה ", "column ") + (ci + 1) + ")", ci);
    });
  });

  // a sliding wardrobe never opens more than one leaf-width at a time
  if (L.sliding) {
    if (L.cols.length < 2) add("err", "דלת הזזה אחת לא נפתחת — צריך לפחות שתיים", "A single sliding leaf cannot open — two minimum");
    L.cols.forEach(function (col, ci) {
      if (col.secs.some(function (c2) { return c2.drawers; }) && ci % 2 === 0)
        add("warn", "מגירות מאחורי כנף הזזה קבועה (עמודה " + (ci + 1) + ") — יהיו חסומות",
          "Drawers behind a fixed sliding leaf (column " + (ci + 1) + ") will be blocked", ci);
    });
  }
  if (sp.plinth === 0 && sp.elev === 0 && (sp.fam === "kitchenBase" || sp.fam === "kitchenTall"))
    add("info", "ארון מטבח בלי סוקל", "A kitchen unit with no plinth");
  /* An open back is a legitimate design (a grid shelf, a room divider) — but it
     is still a box with nothing holding it square, so it needs a cross-brace or
     to be fixed to the wall. Said once, at the level it deserves. */
  if (!sp.back)
    add(sp.carcass === "open" ? "info" : "warn", "אין לוח גב — יש לקבע לקיר או להוסיף חיזוק אלכסוני",
      "No back panel — fix it to the wall or add a brace");
  /* Say each thing once. Two leaves on the same column both hitting the same
     neighbour is one problem, not two. */
  var seen = {};
  return out.filter(function (c) {
    var k = c.level + "|" + c.msg + "|" + c.col;
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
}
