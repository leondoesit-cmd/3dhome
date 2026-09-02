// Fastener dimension tables. Values are published nominal / handbook figures
// from ISO, DIN and ASME B18 — millimetres, never interpolated.

import { freezeMap, inchToMm } from "./geom.js";

export const METRIC_COARSE_PITCH = Object.freeze({
  M2: 0.4, "M2.5": 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1.0, M8: 1.25,
  M10: 1.5, M12: 1.75, M14: 2.0, M16: 2.0, M20: 2.5, M24: 3.0,
});

export const PREFERRED_LENGTHS_MM = Object.freeze([
  6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200,
]);

export const IMPERIAL_LENGTHS_MM = Object.freeze(
  [0.25, 0.375, 0.5, 0.625, 0.75, 1, 1.25, 1.5, 2, 2.5, 3].map((inch) => Math.round(inchToMm(inch) * 10) / 10),
);

const SHCS = {
  M2:   { size: "M2",   diameterMm: 2,    pitchMm: 0.4,  headDiaMm: 3.8,  headHeightMm: 2,    hexAfMm: 1.5, socketDepthMm: 1.0 },
  "M2.5": { size: "M2.5", diameterMm: 2.5, pitchMm: 0.45, headDiaMm: 4.5,  headHeightMm: 2.5,  hexAfMm: 2,   socketDepthMm: 1.25 },
  M3:   { size: "M3",   diameterMm: 3,    pitchMm: 0.5,  headDiaMm: 5.5,  headHeightMm: 3,    hexAfMm: 2.5, socketDepthMm: 1.5 },
  M4:   { size: "M4",   diameterMm: 4,    pitchMm: 0.7,  headDiaMm: 7.0,  headHeightMm: 4,    hexAfMm: 3,   socketDepthMm: 2.0 },
  M5:   { size: "M5",   diameterMm: 5,    pitchMm: 0.8,  headDiaMm: 8.5,  headHeightMm: 5,    hexAfMm: 4,   socketDepthMm: 2.5 },
  M6:   { size: "M6",   diameterMm: 6,    pitchMm: 1.0,  headDiaMm: 10.0, headHeightMm: 6,    hexAfMm: 5,   socketDepthMm: 3.0 },
  M8:   { size: "M8",   diameterMm: 8,    pitchMm: 1.25, headDiaMm: 13.0, headHeightMm: 8,    hexAfMm: 6,   socketDepthMm: 4.0 },
  M10:  { size: "M10",  diameterMm: 10,   pitchMm: 1.5,  headDiaMm: 16.0, headHeightMm: 10,   hexAfMm: 8,   socketDepthMm: 5.0 },
  M12:  { size: "M12",  diameterMm: 12,   pitchMm: 1.75, headDiaMm: 18.0, headHeightMm: 12,   hexAfMm: 10,  socketDepthMm: 6.0 },
  M14:  { size: "M14",  diameterMm: 14,   pitchMm: 2.0,  headDiaMm: 21.0, headHeightMm: 14,   hexAfMm: 12,  socketDepthMm: 7.0 },
  M16:  { size: "M16",  diameterMm: 16,   pitchMm: 2.0,  headDiaMm: 24.0, headHeightMm: 16,   hexAfMm: 14,  socketDepthMm: 8.0 },
  M20:  { size: "M20",  diameterMm: 20,   pitchMm: 2.5,  headDiaMm: 30.0, headHeightMm: 20,   hexAfMm: 17,  socketDepthMm: 10.0 },
  M24:  { size: "M24",  diameterMm: 24,   pitchMm: 3.0,  headDiaMm: 36.0, headHeightMm: 24,   hexAfMm: 19,  socketDepthMm: 12.0 },
  "#4-40":  { size: "#4-40",  imperial: true, diameterMm: 2.845, pitchMm: 0.635, tpi: 40, headDiaMm: 4.65,  headHeightMm: 2.85, hexAfMm: 1.59, socketDepthMm: 1.3, standard: "ASME B18.3" },
  "#6-32":  { size: "#6-32",  imperial: true, diameterMm: 3.505, pitchMm: 0.794, tpi: 32, headDiaMm: 5.74,  headHeightMm: 3.51, hexAfMm: 1.98, socketDepthMm: 1.6, standard: "ASME B18.3" },
  "#8-32":  { size: "#8-32",  imperial: true, diameterMm: 4.166, pitchMm: 0.794, tpi: 32, headDiaMm: 6.86,  headHeightMm: 4.17, hexAfMm: 2.38, socketDepthMm: 1.9, standard: "ASME B18.3" },
  "#10-24": { size: "#10-24", imperial: true, diameterMm: 4.826, pitchMm: 1.058, tpi: 24, headDiaMm: 7.94,  headHeightMm: 4.83, hexAfMm: 3.97, socketDepthMm: 2.4, standard: "ASME B18.3" },
  "#10-32": { size: "#10-32", imperial: true, diameterMm: 4.826, pitchMm: 0.794, tpi: 32, headDiaMm: 7.94,  headHeightMm: 4.83, hexAfMm: 3.97, socketDepthMm: 2.4, standard: "ASME B18.3" },
  "1/4-20": { size: "1/4-20", imperial: true, diameterMm: 6.35,  pitchMm: 1.27,  tpi: 20, headDiaMm: 9.53,  headHeightMm: 6.35, hexAfMm: 4.76, socketDepthMm: 3.2, standard: "ASME B18.3" },
  "5/16-18": { size: "5/16-18", imperial: true, diameterMm: 7.938, pitchMm: 1.411, tpi: 18, headDiaMm: 11.91, headHeightMm: 7.94, hexAfMm: 6.35, socketDepthMm: 4.0, standard: "ASME B18.3" },
  "3/8-16": { size: "3/8-16", imperial: true, diameterMm: 9.525, pitchMm: 1.588, tpi: 16, headDiaMm: 14.29, headHeightMm: 9.53, hexAfMm: 7.94, socketDepthMm: 4.8, standard: "ASME B18.3" },
  "1/2-13": { size: "1/2-13", imperial: true, diameterMm: 12.7,  pitchMm: 1.954, tpi: 13, headDiaMm: 19.05, headHeightMm: 12.7, hexAfMm: 9.53, socketDepthMm: 6.4, standard: "ASME B18.3" },
  "5/8-11": { size: "5/8-11", imperial: true, diameterMm: 15.875, pitchMm: 2.309, tpi: 11, headDiaMm: 23.81, headHeightMm: 15.88, hexAfMm: 12.7, socketDepthMm: 8.0, standard: "ASME B18.3" },
  "3/4-10": { size: "3/4-10", imperial: true, diameterMm: 19.05, pitchMm: 2.54,  tpi: 10, headDiaMm: 28.58, headHeightMm: 19.05, hexAfMm: 15.88, socketDepthMm: 9.5, standard: "ASME B18.3" },
};
export const ISO4762_SHCS = freezeMap(SHCS);

export const ISO4017_HEX = freezeMap({
  M2:   { size: "M2",   diameterMm: 2,    pitchMm: 0.4,  af: 4,   h: 1.4 },
  "M2.5": { size: "M2.5", diameterMm: 2.5, pitchMm: 0.45, af: 5,   h: 1.7 },
  M3:   { size: "M3",   diameterMm: 3,    pitchMm: 0.5,  af: 5.5, h: 2.0 },
  M4:   { size: "M4",   diameterMm: 4,    pitchMm: 0.7,  af: 7,   h: 2.8 },
  M5:   { size: "M5",   diameterMm: 5,    pitchMm: 0.8,  af: 8,   h: 3.5 },
  M6:   { size: "M6",   diameterMm: 6,    pitchMm: 1.0,  af: 10,  h: 4.0 },
  M8:   { size: "M8",   diameterMm: 8,    pitchMm: 1.25, af: 13,  h: 5.3 },
  M10:  { size: "M10",  diameterMm: 10,   pitchMm: 1.5,  af: 16,  h: 6.4 },
  M12:  { size: "M12",  diameterMm: 12,   pitchMm: 1.75, af: 18,  h: 7.5 },
  M14:  { size: "M14",  diameterMm: 14,   pitchMm: 2.0,  af: 21,  h: 8.8 },
  M16:  { size: "M16",  diameterMm: 16,   pitchMm: 2.0,  af: 24,  h: 10.0 },
  M20:  { size: "M20",  diameterMm: 20,   pitchMm: 2.5,  af: 30,  h: 12.5 },
  M24:  { size: "M24",  diameterMm: 24,   pitchMm: 3.0,  af: 36,  h: 15.0 },
  "1/4-20": { size: "1/4-20", imperial: true, diameterMm: 6.35, pitchMm: 1.27, af: 11.11, h: 3.97, standard: "ASME B18.2.1" },
  "5/16-18": { size: "5/16-18", imperial: true, diameterMm: 7.938, pitchMm: 1.411, af: 12.7, h: 5.16, standard: "ASME B18.2.1" },
  "3/8-16": { size: "3/8-16", imperial: true, diameterMm: 9.525, pitchMm: 1.588, af: 14.29, h: 6.35, standard: "ASME B18.2.1" },
  "1/2-13": { size: "1/2-13", imperial: true, diameterMm: 12.7, pitchMm: 1.954, af: 19.05, h: 8.33, standard: "ASME B18.2.1" },
  "5/8-11": { size: "5/8-11", imperial: true, diameterMm: 15.875, pitchMm: 2.309, af: 23.81, h: 10.32, standard: "ASME B18.2.1" },
  "3/4-10": { size: "3/4-10", imperial: true, diameterMm: 19.05, pitchMm: 2.54, af: 28.58, h: 12.3, standard: "ASME B18.2.1" },
});

export const ISO4032_NUT = freezeMap({
  M2:   { size: "M2",   diameterMm: 2,    pitchMm: 0.4,  af: 4,   h: 1.6 },
  "M2.5": { size: "M2.5", diameterMm: 2.5, pitchMm: 0.45, af: 5,   h: 2.0 },
  M3:   { size: "M3",   diameterMm: 3,    pitchMm: 0.5,  af: 5.5, h: 2.4 },
  M4:   { size: "M4",   diameterMm: 4,    pitchMm: 0.7,  af: 7,   h: 3.2 },
  M5:   { size: "M5",   diameterMm: 5,    pitchMm: 0.8,  af: 8,   h: 4.7 },
  M6:   { size: "M6",   diameterMm: 6,    pitchMm: 1.0,  af: 10,  h: 5.2 },
  M8:   { size: "M8",   diameterMm: 8,    pitchMm: 1.25, af: 13,  h: 6.8 },
  M10:  { size: "M10",  diameterMm: 10,   pitchMm: 1.5,  af: 16,  h: 8.4 },
  M12:  { size: "M12",  diameterMm: 12,   pitchMm: 1.75, af: 18,  h: 10.8 },
  M14:  { size: "M14",  diameterMm: 14,   pitchMm: 2.0,  af: 21,  h: 12.8 },
  M16:  { size: "M16",  diameterMm: 16,   pitchMm: 2.0,  af: 24,  h: 14.8 },
  M20:  { size: "M20",  diameterMm: 20,   pitchMm: 2.5,  af: 30,  h: 18.0 },
  M24:  { size: "M24",  diameterMm: 24,   pitchMm: 3.0,  af: 36,  h: 21.5 },
});

export const ISO4035_JAM = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, af: 5.5, h: 1.8 },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, af: 7, h: 2.2 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, af: 8, h: 2.7 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, af: 10, h: 3.2 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, af: 13, h: 4.0 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, af: 16, h: 5.0 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, af: 18, h: 6.0 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, af: 24, h: 8.0 },
  M20: { size: "M20", diameterMm: 20, pitchMm: 2.5, af: 30, h: 10.0 },
  M24: { size: "M24", diameterMm: 24, pitchMm: 3.0, af: 36, h: 12.0 },
});

export const ISO7040_NYLOC = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, af: 5.5, h: 4.5, nylonH: 1.5 },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, af: 7, h: 6.0, nylonH: 2.0 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, af: 8, h: 6.7, nylonH: 2.2 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, af: 10, h: 8.0, nylonH: 2.5 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, af: 13, h: 9.5, nylonH: 3.0 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, af: 16, h: 12.0, nylonH: 3.5 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, af: 18, h: 15.0, nylonH: 4.0 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, af: 24, h: 19.0, nylonH: 5.0 },
  M20: { size: "M20", diameterMm: 20, pitchMm: 2.5, af: 30, h: 23.0, nylonH: 6.0 },
  M24: { size: "M24", diameterMm: 24, pitchMm: 3.0, af: 36, h: 28.0, nylonH: 7.0 },
});

export const ISO4161_FLANGE = freezeMap({
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, af: 8, h: 5.0, flangeDiaMm: 11.8, flangeH: 1.0 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, af: 10, h: 6.0, flangeDiaMm: 14.2, flangeH: 1.2 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, af: 13, h: 8.0, flangeDiaMm: 17.9, flangeH: 1.5 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, af: 16, h: 10.0, flangeDiaMm: 21.8, flangeH: 1.8 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, af: 18, h: 12.0, flangeDiaMm: 26.0, flangeH: 2.2 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, af: 24, h: 16.0, flangeDiaMm: 34.5, flangeH: 2.8 },
});

export const DIN315_WING = freezeMap({
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, spanMm: 20, h: 8, bossMm: 7 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, spanMm: 26, h: 10, bossMm: 9 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, spanMm: 33, h: 12, bossMm: 11 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, spanMm: 40, h: 15, bossMm: 13 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, spanMm: 50, h: 18, bossMm: 17 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, spanMm: 60, h: 22, bossMm: 19 },
});

export const DIN1587_ACORN = freezeMap({
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, af: 7, hexH: 3.2, domeH: 4.5, domeDia: 7 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, af: 8, hexH: 4.0, domeH: 5.5, domeDia: 8 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, af: 10, hexH: 5.0, domeH: 7.0, domeDia: 10 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, af: 13, hexH: 6.5, domeH: 9.0, domeDia: 13 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, af: 16, hexH: 8.0, domeH: 12.0, domeDia: 16 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, af: 18, hexH: 10.0, domeH: 15.0, domeDia: 18 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, af: 24, hexH: 13.0, domeH: 19.0, domeDia: 24 },
});

export const ISO7089_WASHER = freezeMap({
  M2: { size: "M2", idMm: 2.2, odMm: 5, h: 0.3 },
  M3: { size: "M3", idMm: 3.2, odMm: 7, h: 0.5 },
  M4: { size: "M4", idMm: 4.3, odMm: 9, h: 0.8 },
  M5: { size: "M5", idMm: 5.3, odMm: 10, h: 1.0 },
  M6: { size: "M6", idMm: 6.4, odMm: 12, h: 1.6 },
  M8: { size: "M8", idMm: 8.4, odMm: 16, h: 1.6 },
  M10: { size: "M10", idMm: 10.5, odMm: 20, h: 2.0 },
  M12: { size: "M12", idMm: 13, odMm: 24, h: 2.5 },
  M14: { size: "M14", idMm: 15, odMm: 28, h: 2.5 },
  M16: { size: "M16", idMm: 17, odMm: 30, h: 3.0 },
  M20: { size: "M20", idMm: 21, odMm: 37, h: 3.0 },
  M24: { size: "M24", idMm: 25, odMm: 44, h: 4.0 },
});

export const ISO7093_FENDER = freezeMap({
  M3: { size: "M3", idMm: 3.2, odMm: 9, h: 0.8 },
  M4: { size: "M4", idMm: 4.3, odMm: 12, h: 1.0 },
  M5: { size: "M5", idMm: 5.3, odMm: 15, h: 1.2 },
  M6: { size: "M6", idMm: 6.4, odMm: 18, h: 1.6 },
  M8: { size: "M8", idMm: 8.4, odMm: 24, h: 2.0 },
  M10: { size: "M10", idMm: 10.5, odMm: 30, h: 2.5 },
  M12: { size: "M12", idMm: 13, odMm: 37, h: 3.0 },
  M16: { size: "M16", idMm: 17, odMm: 50, h: 3.0 },
  M20: { size: "M20", idMm: 21, odMm: 60, h: 4.0 },
  M24: { size: "M24", idMm: 25, odMm: 72, h: 5.0 },
});

export const DIN127_LOCK = freezeMap({
  M3: { size: "M3", idMm: 3.1, odMm: 6.2, h: 1.3 },
  M4: { size: "M4", idMm: 4.1, odMm: 8.0, h: 1.6 },
  M5: { size: "M5", idMm: 5.1, odMm: 9.2, h: 1.8 },
  M6: { size: "M6", idMm: 6.1, odMm: 11.8, h: 2.5 },
  M8: { size: "M8", idMm: 8.1, odMm: 14.8, h: 3.0 },
  M10: { size: "M10", idMm: 10.2, odMm: 18.1, h: 3.5 },
  M12: { size: "M12", idMm: 12.2, odMm: 21.1, h: 4.0 },
  M16: { size: "M16", idMm: 16.2, odMm: 27.4, h: 5.0 },
  M20: { size: "M20", idMm: 20.2, odMm: 33.6, h: 6.0 },
  M24: { size: "M24", idMm: 24.5, odMm: 40.0, h: 7.0 },
});

export const CSINK_FINISH_WASHER = freezeMap({
  M4: { size: "M4", idMm: 4.3, odMm: 12, h: 1.2, angle: 90 },
  M5: { size: "M5", idMm: 5.3, odMm: 15, h: 1.4, angle: 90 },
  M6: { size: "M6", idMm: 6.4, odMm: 18, h: 1.6, angle: 90 },
  M8: { size: "M8", idMm: 8.4, odMm: 22, h: 2.0, angle: 90 },
});

export const ISO10642_CSINK = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, headDiaMm: 6.72, headHeightMm: 1.86, hexAfMm: 2, angle: 90 },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, headDiaMm: 8.96, headHeightMm: 2.48, hexAfMm: 2.5, angle: 90 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, headDiaMm: 11.2, headHeightMm: 3.10, hexAfMm: 3, angle: 90 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, headDiaMm: 13.44, headHeightMm: 3.72, hexAfMm: 4, angle: 90 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, headDiaMm: 17.92, headHeightMm: 4.96, hexAfMm: 5, angle: 90 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, headDiaMm: 22.4, headHeightMm: 6.20, hexAfMm: 6, angle: 90 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, headDiaMm: 26.88, headHeightMm: 7.44, hexAfMm: 8, angle: 90 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, headDiaMm: 33.6, headHeightMm: 8.80, hexAfMm: 10, angle: 90 },
  M20: { size: "M20", diameterMm: 20, pitchMm: 2.5, headDiaMm: 40.32, headHeightMm: 10.16, hexAfMm: 12, angle: 90 },
  "1/4-20": { size: "1/4-20", imperial: true, diameterMm: 6.35, pitchMm: 1.27, headDiaMm: 12.7, headHeightMm: 3.86, hexAfMm: 3.97, angle: 82, standard: "ASME B18.3" },
  "3/8-16": { size: "3/8-16", imperial: true, diameterMm: 9.525, pitchMm: 1.588, headDiaMm: 19.05, headHeightMm: 5.82, hexAfMm: 5.56, angle: 82, standard: "ASME B18.3" },
  "1/2-13": { size: "1/2-13", imperial: true, diameterMm: 12.7, pitchMm: 1.954, headDiaMm: 25.4, headHeightMm: 7.72, hexAfMm: 7.94, angle: 82, standard: "ASME B18.3" },
});

export const ISO7380_BUTTON = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, headDiaMm: 5.7, headHeightMm: 1.65, hexAfMm: 2 },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, headDiaMm: 7.6, headHeightMm: 2.2, hexAfMm: 2.5 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, headDiaMm: 9.5, headHeightMm: 2.75, hexAfMm: 3 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, headDiaMm: 10.5, headHeightMm: 3.3, hexAfMm: 4 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, headDiaMm: 14.0, headHeightMm: 4.4, hexAfMm: 5 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, headDiaMm: 17.5, headHeightMm: 5.5, hexAfMm: 6 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, headDiaMm: 21.0, headHeightMm: 6.6, hexAfMm: 8 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, headDiaMm: 28.0, headHeightMm: 8.8, hexAfMm: 10 },
});

export const ISO7045_PAN = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, headDiaMm: 5.6, headHeightMm: 1.65, drive: "phillips" },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, headDiaMm: 8.0, headHeightMm: 2.4, drive: "phillips" },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, headDiaMm: 9.5, headHeightMm: 2.95, drive: "phillips" },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, headDiaMm: 12.0, headHeightMm: 3.6, drive: "phillips" },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, headDiaMm: 16.0, headHeightMm: 4.8, drive: "phillips" },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, headDiaMm: 20.0, headHeightMm: 6.0, drive: "phillips" },
});

export const ISO7046_CSINK_MACHINE = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, headDiaMm: 6.0, headHeightMm: 1.65, angle: 90, drive: "phillips" },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, headDiaMm: 8.0, headHeightMm: 2.2, angle: 90, drive: "phillips" },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, headDiaMm: 10.0, headHeightMm: 2.5, angle: 90, drive: "phillips" },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, headDiaMm: 12.0, headHeightMm: 3.0, angle: 90, drive: "phillips" },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, headDiaMm: 16.0, headHeightMm: 4.0, angle: 90, drive: "phillips" },
});

export const DIN7997_WOOD = freezeMap({
  "3.0": { size: "3.0", diameterMm: 3.0, pitchMm: 1.3, coreMm: 2.0, headDiaMm: 6.0, headHeightMm: 1.8, angle: 90 },
  "3.5": { size: "3.5", diameterMm: 3.5, pitchMm: 1.5, coreMm: 2.3, headDiaMm: 7.0, headHeightMm: 2.1, angle: 90 },
  "4.0": { size: "4.0", diameterMm: 4.0, pitchMm: 1.8, coreMm: 2.6, headDiaMm: 8.0, headHeightMm: 2.4, angle: 90 },
  "4.5": { size: "4.5", diameterMm: 4.5, pitchMm: 2.0, coreMm: 3.0, headDiaMm: 9.0, headHeightMm: 2.7, angle: 90 },
  "5.0": { size: "5.0", diameterMm: 5.0, pitchMm: 2.2, coreMm: 3.3, headDiaMm: 10.0, headHeightMm: 3.0, angle: 90 },
  "6.0": { size: "6.0", diameterMm: 6.0, pitchMm: 2.6, coreMm: 4.0, headDiaMm: 12.0, headHeightMm: 3.6, angle: 90 },
});

export const DIN571_LAG = freezeMap({
  M6: { size: "M6", diameterMm: 6, pitchMm: 2.5, coreMm: 4.0, af: 10, h: 4.0 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 3.0, coreMm: 5.4, af: 13, h: 5.3 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 3.5, coreMm: 6.8, af: 17, h: 6.4 },
  M12: { size: "M12", diameterMm: 12, pitchMm: 4.0, coreMm: 8.2, af: 19, h: 7.5 },
  M16: { size: "M16", diameterMm: 16, pitchMm: 5.0, coreMm: 11.0, af: 24, h: 10.0 },
});

export const ISO4026_SET = freezeMap({
  M3: { size: "M3", diameterMm: 3, pitchMm: 0.5, hexAfMm: 1.5, point: "flat" },
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, hexAfMm: 2, point: "flat" },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, hexAfMm: 2.5, point: "flat" },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, hexAfMm: 3, point: "flat" },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, hexAfMm: 4, point: "flat" },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, hexAfMm: 5, point: "flat" },
  M12: { size: "M12", diameterMm: 12, pitchMm: 1.75, hexAfMm: 6, point: "flat" },
  M16: { size: "M16", diameterMm: 16, pitchMm: 2.0, hexAfMm: 8, point: "flat" },
});

export const TNUT_WOOD = freezeMap({
  M4: { size: "M4", diameterMm: 4, pitchMm: 0.7, barrelDiaMm: 6.5, barrelH: 8, flangeDiaMm: 19, flangeH: 1.0, prongs: 4, prongL: 6 },
  M5: { size: "M5", diameterMm: 5, pitchMm: 0.8, barrelDiaMm: 7.5, barrelH: 9, flangeDiaMm: 22, flangeH: 1.0, prongs: 4, prongL: 7 },
  M6: { size: "M6", diameterMm: 6, pitchMm: 1.0, barrelDiaMm: 9.0, barrelH: 11, flangeDiaMm: 25, flangeH: 1.2, prongs: 4, prongL: 8 },
  M8: { size: "M8", diameterMm: 8, pitchMm: 1.25, barrelDiaMm: 11.0, barrelH: 13, flangeDiaMm: 28, flangeH: 1.2, prongs: 4, prongL: 9 },
  M10: { size: "M10", diameterMm: 10, pitchMm: 1.5, barrelDiaMm: 13.0, barrelH: 16, flangeDiaMm: 32, flangeH: 1.5, prongs: 4, prongL: 10 },
});

export const TSLOT_NUT = freezeMap({
  "2020-M3": { size: "M3", profile: "2020", diameterMm: 3, pitchMm: 0.5, lengthMm: 10, widthMm: 11, heightMm: 4.5, slotMm: 6 },
  "2020-M4": { size: "M4", profile: "2020", diameterMm: 4, pitchMm: 0.7, lengthMm: 10, widthMm: 11, heightMm: 4.5, slotMm: 6 },
  "2020-M5": { size: "M5", profile: "2020", diameterMm: 5, pitchMm: 0.8, lengthMm: 10, widthMm: 11, heightMm: 4.5, slotMm: 6 },
  "3030-M4": { size: "M4", profile: "3030", diameterMm: 4, pitchMm: 0.7, lengthMm: 12, widthMm: 16, heightMm: 6.5, slotMm: 8 },
  "3030-M5": { size: "M5", profile: "3030", diameterMm: 5, pitchMm: 0.8, lengthMm: 12, widthMm: 16, heightMm: 6.5, slotMm: 8 },
  "3030-M6": { size: "M6", profile: "3030", diameterMm: 6, pitchMm: 1.0, lengthMm: 12, widthMm: 16, heightMm: 6.5, slotMm: 8 },
  "4040-M5": { size: "M5", profile: "4040", diameterMm: 5, pitchMm: 0.8, lengthMm: 16, widthMm: 18, heightMm: 7.5, slotMm: 8 },
  "4040-M6": { size: "M6", profile: "4040", diameterMm: 6, pitchMm: 1.0, lengthMm: 16, widthMm: 18, heightMm: 7.5, slotMm: 8 },
  "4040-M8": { size: "M8", profile: "4040", diameterMm: 8, pitchMm: 1.25, lengthMm: 16, widthMm: 18, heightMm: 7.5, slotMm: 8 },
});

export const PLAIN_BUSHING = freezeMap({
  M3: { size: "M3", innerMm: 3, outerMm: 6, lengthMm: 5 },
  M4: { size: "M4", innerMm: 4, outerMm: 7, lengthMm: 6 },
  M5: { size: "M5", innerMm: 5, outerMm: 8, lengthMm: 7 },
  M6: { size: "M6", innerMm: 6, outerMm: 10, lengthMm: 8 },
  M8: { size: "M8", innerMm: 8, outerMm: 12, lengthMm: 10 },
  M10: { size: "M10", innerMm: 10, outerMm: 14, lengthMm: 12 },
  M12: { size: "M12", innerMm: 12, outerMm: 16, lengthMm: 16 },
  M16: { size: "M16", innerMm: 16, outerMm: 22, lengthMm: 20 },
  M20: { size: "M20", innerMm: 20, outerMm: 28, lengthMm: 25 },
  M24: { size: "M24", innerMm: 24, outerMm: 32, lengthMm: 30 },
});

export const DIN1151_NAIL = freezeMap({
  "1.5x20": { size: "1.5×20", diameterMm: 1.5, lengthMm: 20, headDiaMm: 3.5 },
  "1.8x25": { size: "1.8×25", diameterMm: 1.8, lengthMm: 25, headDiaMm: 4.2 },
  "2.0x30": { size: "2.0×30", diameterMm: 2.0, lengthMm: 30, headDiaMm: 4.6 },
  "2.2x40": { size: "2.2×40", diameterMm: 2.2, lengthMm: 40, headDiaMm: 5.0 },
  "2.5x50": { size: "2.5×50", diameterMm: 2.5, lengthMm: 50, headDiaMm: 5.8 },
  "2.8x60": { size: "2.8×60", diameterMm: 2.8, lengthMm: 60, headDiaMm: 6.4 },
  "3.1x70": { size: "3.1×70", diameterMm: 3.1, lengthMm: 70, headDiaMm: 7.0 },
  "3.4x80": { size: "3.4×80", diameterMm: 3.4, lengthMm: 80, headDiaMm: 7.6 },
  "3.8x90": { size: "3.8×90", diameterMm: 3.8, lengthMm: 90, headDiaMm: 8.4 },
  "4.2x100": { size: "4.2×100", diameterMm: 4.2, lengthMm: 100, headDiaMm: 9.2 },
  "4.6x120": { size: "4.6×120", diameterMm: 4.6, lengthMm: 120, headDiaMm: 10.0 },
  "5.0x140": { size: "5.0×140", diameterMm: 5.0, lengthMm: 140, headDiaMm: 11.0 },
  "5.5x160": { size: "5.5×160", diameterMm: 5.5, lengthMm: 160, headDiaMm: 12.0 },
  "6.0x200": { size: "6.0×200", diameterMm: 6.0, lengthMm: 200, headDiaMm: 13.0 },
  "2d": { size: "2d", imperial: true, diameterMm: 1.83, lengthMm: 25.4, headDiaMm: 4.2, penny: 2 },
  "4d": { size: "4d", imperial: true, diameterMm: 2.59, lengthMm: 38.1, headDiaMm: 5.6, penny: 4 },
  "6d": { size: "6d", imperial: true, diameterMm: 3.05, lengthMm: 50.8, headDiaMm: 6.7, penny: 6 },
  "8d": { size: "8d", imperial: true, diameterMm: 3.33, lengthMm: 63.5, headDiaMm: 7.3, penny: 8 },
  "10d": { size: "10d", imperial: true, diameterMm: 3.76, lengthMm: 76.2, headDiaMm: 8.3, penny: 10 },
  "16d": { size: "16d", imperial: true, diameterMm: 4.11, lengthMm: 88.9, headDiaMm: 9.1, penny: 16 },
  "20d": { size: "20d", imperial: true, diameterMm: 4.88, lengthMm: 101.6, headDiaMm: 10.7, penny: 20 },
  "60d": { size: "60d", imperial: true, diameterMm: 6.65, lengthMm: 152.4, headDiaMm: 14.6, penny: 60 },
});

export const BRAD_NAIL = freezeMap({
  "16GA-32": { size: "16GA×32", gauge: 16, diameterMm: 1.63, lengthMm: 32, headDiaMm: 2.8 },
  "16GA-50": { size: "16GA×50", gauge: 16, diameterMm: 1.63, lengthMm: 50, headDiaMm: 2.8 },
  "16GA-64": { size: "16GA×64", gauge: 16, diameterMm: 1.63, lengthMm: 64, headDiaMm: 2.8 },
  "18GA-15": { size: "18GA×15", gauge: 18, diameterMm: 1.20, lengthMm: 15, headDiaMm: 2.0 },
  "18GA-32": { size: "18GA×32", gauge: 18, diameterMm: 1.20, lengthMm: 32, headDiaMm: 2.0 },
  "18GA-50": { size: "18GA×50", gauge: 18, diameterMm: 1.20, lengthMm: 50, headDiaMm: 2.0 },
  "23GA-15": { size: "23GA×15", gauge: 23, diameterMm: 0.58, lengthMm: 15, headDiaMm: 0.58, headless: true },
  "23GA-25": { size: "23GA×25", gauge: 23, diameterMm: 0.58, lengthMm: 25, headDiaMm: 0.58, headless: true },
  "23GA-32": { size: "23GA×32", gauge: 23, diameterMm: 0.58, lengthMm: 32, headDiaMm: 0.58, headless: true },
});

export const DRYWALL_SCREW = freezeMap({
  "3.5x25": { size: "3.5×25", diameterMm: 3.5, lengthMm: 25, headDiaMm: 8.0, headHeightMm: 2.2, bugle: true },
  "3.5x35": { size: "3.5×35", diameterMm: 3.5, lengthMm: 35, headDiaMm: 8.0, headHeightMm: 2.2, bugle: true },
  "3.5x45": { size: "3.5×45", diameterMm: 3.5, lengthMm: 45, headDiaMm: 8.0, headHeightMm: 2.2, bugle: true },
  "3.5x55": { size: "3.5×55", diameterMm: 3.5, lengthMm: 55, headDiaMm: 8.0, headHeightMm: 2.2, bugle: true },
  "4.2x70": { size: "4.2×70", diameterMm: 4.2, lengthMm: 70, headDiaMm: 8.4, headHeightMm: 2.4, bugle: true },
});

export const CONCRETE_NAIL = freezeMap({
  "2.5x25": { size: "2.5×25", diameterMm: 2.5, lengthMm: 25, headDiaMm: 5.5, fluted: true },
  "3.0x40": { size: "3.0×40", diameterMm: 3.0, lengthMm: 40, headDiaMm: 6.5, fluted: true },
  "3.5x50": { size: "3.5×50", diameterMm: 3.5, lengthMm: 50, headDiaMm: 7.5, fluted: true },
  "4.0x75": { size: "4.0×75", diameterMm: 4.0, lengthMm: 75, headDiaMm: 8.5, fluted: true },
});

export const ISO2338_PIN = freezeMap({
  "3x12": { size: "Ø3×12", diameterMm: 3, lengthMm: 12 },
  "4x16": { size: "Ø4×16", diameterMm: 4, lengthMm: 16 },
  "5x20": { size: "Ø5×20", diameterMm: 5, lengthMm: 20 },
  "6x24": { size: "Ø6×24", diameterMm: 6, lengthMm: 24 },
  "8x30": { size: "Ø8×30", diameterMm: 8, lengthMm: 30 },
  "10x40": { size: "Ø10×40", diameterMm: 10, lengthMm: 40 },
  "12x50": { size: "Ø12×50", diameterMm: 12, lengthMm: 50 },
});

export const WOOD_DOWEL = freezeMap({
  "6x30": { size: "Ø6×30", diameterMm: 6, lengthMm: 30, fluted: true },
  "8x35": { size: "Ø8×35", diameterMm: 8, lengthMm: 35, fluted: true },
  "8x40": { size: "Ø8×40", diameterMm: 8, lengthMm: 40, fluted: true },
  "10x40": { size: "Ø10×40", diameterMm: 10, lengthMm: 40, fluted: true },
  "10x50": { size: "Ø10×50", diameterMm: 10, lengthMm: 50, fluted: true },
});

export function iso4014ThreadLengthMm(diameterMm, lengthMm) {
  const d = Number(diameterMm), l = Number(lengthMm);
  if (l <= 125) return Math.min(l, 2 * d + 6);
  if (l <= 200) return Math.min(l, 2 * d + 12);
  return Math.min(l, 2 * d + 25);
}

export function preferredLengthFor(size, diameterMm) {
  const d = Number(diameterMm) || 8;
  const target = d <= 4 ? 16 : d <= 6 ? 20 : d <= 10 ? 30 : d <= 16 ? 40 : 60;
  const lengths = String(size || "").includes("-") || String(size || "").startsWith("#")
    ? IMPERIAL_LENGTHS_MM
    : PREFERRED_LENGTHS_MM;
  return lengths.reduce((best, mm) => Math.abs(mm - target) < Math.abs(best - target) ? mm : best, lengths[0]);
}
