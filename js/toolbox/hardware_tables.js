// Cabinet, furniture and architectural hardware — millimetre commercial sizes.

import { freezeMap } from "./geom.js";

export const EURO_HINGE = Object.freeze({
  cupDiaMm: 35,
  cupDepthMm: 13,
  cupHoleSpacingMm: 45,
  cupHoleDiaMm: 8,
  plateHoleSpacingMm: 32,
  plateSetbackMm: 37,
  drillingDistanceMm: 5,
  overlays: Object.freeze({
    "full-overlay": { crankMm: 0, label: "Full overlay" },
    "half-overlay": { crankMm: 9.5, label: "Half overlay" },
    inset: { crankMm: 18, label: "Inset" },
  }),
  angles: Object.freeze([95, 110, 155, 165]),
});

export const BUTT_HINGE = freezeMap({
  "75": { size: "75mm", lengthMm: 75, widthMm: 50, thicknessMm: 1.5, knuckleDiaMm: 10, holes: 6, holeDiaMm: 4 },
  "100": { size: "100mm", lengthMm: 100, widthMm: 67, thicknessMm: 2.0, knuckleDiaMm: 12, holes: 8, holeDiaMm: 5 },
  "125": { size: "125mm", lengthMm: 125, widthMm: 80, thicknessMm: 2.5, knuckleDiaMm: 14, holes: 8, holeDiaMm: 5 },
});

export const PIANO_HINGE = Object.freeze({
  widthMm: 32,
  thicknessMm: 1.2,
  holePitchMm: 50,
  holePitchIn: 50.8,
  holeDiaMm: 3.5,
  knuckleDiaMm: 6,
  lengthsMm: Object.freeze([300, 500, 800, 1000, 1500, 2000]),
});

export const DRAWER_SLIDE = Object.freeze({
  ratingKg: 45,
  heightsMm: Object.freeze({ ball: 45, undermount: 28 }),
  sideClearanceMm: 12.7,
  lengthsMm: Object.freeze([250, 300, 350, 400, 450, 500, 550, 600]),
  undermountSidesMm: Object.freeze([16, 19]),
});

export const BAR_PULL_CC_MM = Object.freeze([64, 96, 128, 160, 192, 224, 256, 320, 416, 480]);

export const BAR_PULL = freezeMap(Object.fromEntries(BAR_PULL_CC_MM.map((cc) => [String(cc), {
  size: cc + "mm",
  ccMm: cc,
  barDiaMm: cc >= 256 ? 14 : 12,
  postH: 28,
  postDiaMm: 10,
  projectionMm: 32,
}])));

export const CABINET_KNOB = freezeMap({
  "round-25": { size: "Ø25", kind: "round", diaMm: 25, heightMm: 22, bore: "M4" },
  "round-30": { size: "Ø30", kind: "round", diaMm: 30, heightMm: 25, bore: "M4" },
  "round-35": { size: "Ø35", kind: "round", diaMm: 35, heightMm: 28, bore: "M4" },
  "cylinder-20": { size: "Ø20×25", kind: "cylinder", diaMm: 20, heightMm: 25, bore: "M4" },
  "square-30": { size: "30×30", kind: "square", diaMm: 30, heightMm: 24, bore: "M4" },
});

export const EDGE_PULL = freezeMap({
  "40": { size: "40mm", lengthMm: 40, widthMm: 18, heightMm: 40, lipMm: 8 },
  "80": { size: "80mm", lengthMm: 80, widthMm: 18, heightMm: 40, lipMm: 8 },
  "120": { size: "120mm", lengthMm: 120, widthMm: 18, heightMm: 40, lipMm: 8 },
});

export const FLUSH_PULL = freezeMap({
  "90x45": { size: "90×45", lengthMm: 90, widthMm: 45, depthMm: 12, recessMm: 10 },
  "120x40": { size: "120×40", lengthMm: 120, widthMm: 40, depthMm: 12, recessMm: 10 },
});

export const CAM_LOCK = freezeMap({
  minifix: { size: "Minifix 15", camDiaMm: 15, camH: 12.5, boltDiaMm: 7, boltLengthsMm: [24, 34, 44], housing: "15mm" },
  rafix20: { size: "Rafix 20", camDiaMm: 20, camH: 14.0, boltDiaMm: 8, boltLengthsMm: [24, 34, 44], housing: "20mm" },
  vb36: { size: "VB 36", camDiaMm: 16, camH: 13.5, boltDiaMm: 8, boltLengthsMm: [24, 34], housing: "VB36" },
});

export const CORNER_BRACE = freezeMap({
  "30": { size: "30×30", armMm: 30, widthMm: 16, thicknessMm: 2.0, holes: 2, holeDiaMm: 4.5, csink: true },
  "40": { size: "40×40", armMm: 40, widthMm: 16, thicknessMm: 2.0, holes: 2, holeDiaMm: 5.0, csink: true },
  "60": { size: "60×60", armMm: 60, widthMm: 20, thicknessMm: 2.5, holes: 3, holeDiaMm: 5.5, csink: true },
  "90": { size: "90×90", armMm: 90, widthMm: 25, thicknessMm: 3.0, holes: 4, holeDiaMm: 6.0, csink: true },
  "100": { size: "100×100", armMm: 100, widthMm: 25, thicknessMm: 3.0, holes: 4, holeDiaMm: 6.5, csink: true },
});

export const MENDING_PLATE = freezeMap({
  "80x16": { size: "80×16", lengthMm: 80, widthMm: 16, thicknessMm: 2.0, holes: 4, holeDiaMm: 4.5, shape: "flat" },
  "100x20": { size: "100×20", lengthMm: 100, widthMm: 20, thicknessMm: 2.5, holes: 4, holeDiaMm: 5.0, shape: "flat" },
  "120x20": { size: "120×20", lengthMm: 120, widthMm: 20, thicknessMm: 2.5, holes: 6, holeDiaMm: 5.0, shape: "flat" },
  "t-80": { size: "T 80×80", lengthMm: 80, widthMm: 80, thicknessMm: 2.5, holes: 6, holeDiaMm: 5.0, shape: "T", stemMm: 20 },
});

export const SHELF_SUPPORT = freezeMap({
  "spoon-5": { size: "Ø5 spoon", diameterMm: 5, lengthMm: 12, style: "spoon", padMm: 12 },
  "spoon-3": { size: "Ø3 spoon", diameterMm: 3, lengthMm: 10, style: "spoon", padMm: 8 },
  "pin-5": { size: "Ø5 pin", diameterMm: 5, lengthMm: 16, style: "cylinder", padMm: 0 },
  "lock-5": { size: "Ø5 locking", diameterMm: 5, lengthMm: 12, style: "lock", padMm: 14 },
});
