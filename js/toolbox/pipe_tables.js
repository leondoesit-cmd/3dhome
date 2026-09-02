// Pipe, tube, conduit and fitting dimension tables (EN / ISO / ASTM).

import { freezeMap } from "./geom.js";

export const COPPER_EN1057 = freezeMap({
  "10": { size: "10mm", odMm: 10, wallMm: 0.6, series: "EN 1057" },
  "12": { size: "12mm", odMm: 12, wallMm: 0.6, series: "EN 1057" },
  "15": { size: "15mm", odMm: 15, wallMm: 0.7, series: "EN 1057" },
  "18": { size: "18mm", odMm: 18, wallMm: 0.8, series: "EN 1057" },
  "22": { size: "22mm", odMm: 22, wallMm: 0.9, series: "EN 1057" },
  "28": { size: "28mm", odMm: 28, wallMm: 0.9, series: "EN 1057" },
  "35": { size: "35mm", odMm: 35, wallMm: 1.0, series: "EN 1057" },
  "42": { size: "42mm", odMm: 42, wallMm: 1.2, series: "EN 1057" },
  "54": { size: "54mm", odMm: 54, wallMm: 1.2, series: "EN 1057" },
});

export const COPPER_ASTM_B88 = freezeMap({
  "1/4K": { size: '1/4" K', odMm: 9.53, wallMm: 0.89, type: "K", series: "ASTM B88" },
  "1/4L": { size: '1/4" L', odMm: 9.53, wallMm: 0.76, type: "L", series: "ASTM B88" },
  "1/4M": { size: '1/4" M', odMm: 9.53, wallMm: 0.64, type: "M", series: "ASTM B88" },
  "3/8L": { size: '3/8" L', odMm: 12.70, wallMm: 0.89, type: "L", series: "ASTM B88" },
  "1/2K": { size: '1/2" K', odMm: 15.88, wallMm: 1.24, type: "K", series: "ASTM B88" },
  "1/2L": { size: '1/2" L', odMm: 15.88, wallMm: 1.02, type: "L", series: "ASTM B88" },
  "1/2M": { size: '1/2" M', odMm: 15.88, wallMm: 0.71, type: "M", series: "ASTM B88" },
  "3/4L": { size: '3/4" L', odMm: 22.23, wallMm: 1.14, type: "L", series: "ASTM B88" },
  "1L": { size: '1" L', odMm: 28.58, wallMm: 1.27, type: "L", series: "ASTM B88" },
  "1-1/4L": { size: '1-1/4" L', odMm: 34.93, wallMm: 1.40, type: "L", series: "ASTM B88" },
  "1-1/2L": { size: '1-1/2" L', odMm: 41.28, wallMm: 1.52, type: "L", series: "ASTM B88" },
  "2L": { size: '2" L', odMm: 53.98, wallMm: 1.78, type: "L", series: "ASTM B88" },
});

export const PVC_D1785 = freezeMap({
  "DN15-40": { size: "DN15", dn: 15, nps: '1/2"', odMm: 21.34, wallMm: 2.77, schedule: 40, series: "ASTM D1785" },
  "DN15-80": { size: "DN15", dn: 15, nps: '1/2"', odMm: 21.34, wallMm: 3.73, schedule: 80, series: "ASTM D1785" },
  "DN20-40": { size: "DN20", dn: 20, nps: '3/4"', odMm: 26.67, wallMm: 2.87, schedule: 40, series: "ASTM D1785" },
  "DN20-80": { size: "DN20", dn: 20, nps: '3/4"', odMm: 26.67, wallMm: 3.91, schedule: 80, series: "ASTM D1785" },
  "DN25-40": { size: "DN25", dn: 25, nps: '1"', odMm: 33.40, wallMm: 3.38, schedule: 40, series: "ASTM D1785" },
  "DN25-80": { size: "DN25", dn: 25, nps: '1"', odMm: 33.40, wallMm: 4.55, schedule: 80, series: "ASTM D1785" },
  "DN32-40": { size: "DN32", dn: 32, nps: '1-1/4"', odMm: 42.16, wallMm: 3.56, schedule: 40, series: "ASTM D1785" },
  "DN40-40": { size: "DN40", dn: 40, nps: '1-1/2"', odMm: 48.26, wallMm: 3.68, schedule: 40, series: "ASTM D1785" },
  "DN50-40": { size: "DN50", dn: 50, nps: '2"', odMm: 60.33, wallMm: 3.91, schedule: 40, series: "ASTM D1785" },
  "DN50-80": { size: "DN50", dn: 50, nps: '2"', odMm: 60.33, wallMm: 5.54, schedule: 80, series: "ASTM D1785" },
  "DN80-40": { size: "DN80", dn: 80, nps: '3"', odMm: 88.90, wallMm: 5.49, schedule: 40, series: "ASTM D1785" },
  "DN100-40": { size: "DN100", dn: 100, nps: '4"', odMm: 114.30, wallMm: 6.02, schedule: 40, series: "ASTM D1785" },
  "DN150-40": { size: "DN150", dn: 150, nps: '6"', odMm: 168.28, wallMm: 7.11, schedule: 40, series: "ASTM D1785" },
});

export const PEX_ISO15875 = freezeMap({
  "16x2.0": { size: "16×2.0", odMm: 16, wallMm: 2.0, series: "ISO 15875" },
  "20x2.0": { size: "20×2.0", odMm: 20, wallMm: 2.0, series: "ISO 15875" },
  "25x2.3": { size: "25×2.3", odMm: 25, wallMm: 2.3, series: "ISO 15875" },
  "32x2.9": { size: "32×2.9", odMm: 32, wallMm: 2.9, series: "ISO 15875" },
});

export const STEEL_EN10255 = freezeMap({
  DN15: { size: "DN15", dn: 15, nps: '1/2"', odMm: 21.3, wallMm: 2.6, series: "EN 10255" },
  DN20: { size: "DN20", dn: 20, nps: '3/4"', odMm: 26.9, wallMm: 2.6, series: "EN 10255" },
  DN25: { size: "DN25", dn: 25, nps: '1"', odMm: 33.7, wallMm: 3.2, series: "EN 10255" },
  DN32: { size: "DN32", dn: 32, nps: '1-1/4"', odMm: 42.4, wallMm: 3.2, series: "EN 10255" },
  DN40: { size: "DN40", dn: 40, nps: '1-1/2"', odMm: 48.3, wallMm: 3.2, series: "EN 10255" },
  DN50: { size: "DN50", dn: 50, nps: '2"', odMm: 60.3, wallMm: 3.6, series: "EN 10255" },
  DN65: { size: "DN65", dn: 65, nps: '2-1/2"', odMm: 76.1, wallMm: 3.6, series: "EN 10255" },
  DN80: { size: "DN80", dn: 80, nps: '3"', odMm: 88.9, wallMm: 4.0, series: "EN 10255" },
  DN100: { size: "DN100", dn: 100, nps: '4"', odMm: 114.3, wallMm: 4.5, series: "EN 10255" },
});

export const CONDUIT = freezeMap({
  "emt-16": { size: "16mm EMT", odMm: 16, wallMm: 1.0, kind: "emt", series: "EMT" },
  "emt-20": { size: "20mm EMT", odMm: 20, wallMm: 1.0, kind: "emt", series: "EMT" },
  "emt-25": { size: "25mm EMT", odMm: 25, wallMm: 1.2, kind: "emt", series: "EMT" },
  "emt-32": { size: "32mm EMT", odMm: 32, wallMm: 1.4, kind: "emt", series: "EMT" },
  "pvc-16": { size: "16mm PVC", odMm: 16, wallMm: 1.2, kind: "pvc", series: "EN 61386" },
  "pvc-20": { size: "20mm PVC", odMm: 20, wallMm: 1.5, kind: "pvc", series: "EN 61386" },
  "pvc-25": { size: "25mm PVC", odMm: 25, wallMm: 1.5, kind: "pvc", series: "EN 61386" },
  "pvc-32": { size: "32mm PVC", odMm: 32, wallMm: 1.8, kind: "pvc", series: "EN 61386" },
});

export const ELBOW_RADIUS = Object.freeze({
  "long-radius": 1.5,
  "short-radius": 1.0,
});

export const FLANGE_PN16 = freezeMap({
  DN15: { size: "DN15", dn: 15, odMm: 95, pcdMm: 65, thicknessMm: 14, holes: 4, holeDiaMm: 14, boreMm: 22 },
  DN20: { size: "DN20", dn: 20, odMm: 105, pcdMm: 75, thicknessMm: 16, holes: 4, holeDiaMm: 14, boreMm: 27 },
  DN25: { size: "DN25", dn: 25, odMm: 115, pcdMm: 85, thicknessMm: 16, holes: 4, holeDiaMm: 14, boreMm: 34 },
  DN32: { size: "DN32", dn: 32, odMm: 140, pcdMm: 100, thicknessMm: 16, holes: 4, holeDiaMm: 18, boreMm: 43 },
  DN40: { size: "DN40", dn: 40, odMm: 150, pcdMm: 110, thicknessMm: 16, holes: 4, holeDiaMm: 18, boreMm: 49 },
  DN50: { size: "DN50", dn: 50, odMm: 165, pcdMm: 125, thicknessMm: 18, holes: 4, holeDiaMm: 18, boreMm: 61 },
  DN80: { size: "DN80", dn: 80, odMm: 200, pcdMm: 160, thicknessMm: 20, holes: 8, holeDiaMm: 18, boreMm: 89 },
  DN100: { size: "DN100", dn: 100, odMm: 220, pcdMm: 180, thicknessMm: 20, holes: 8, holeDiaMm: 18, boreMm: 114 },
});

export const FLANGE_CL150 = freezeMap({
  "1/2": { size: '1/2"', nps: '1/2"', odMm: 88.9, pcdMm: 60.3, thicknessMm: 11.1, holes: 4, holeDiaMm: 15.9, boreMm: 21.3 },
  "3/4": { size: '3/4"', nps: '3/4"', odMm: 98.4, pcdMm: 69.9, thicknessMm: 12.7, holes: 4, holeDiaMm: 15.9, boreMm: 26.7 },
  "1": { size: '1"', nps: '1"', odMm: 108.0, pcdMm: 79.4, thicknessMm: 14.3, holes: 4, holeDiaMm: 15.9, boreMm: 33.4 },
  "1-1/2": { size: '1-1/2"', nps: '1-1/2"', odMm: 127.0, pcdMm: 98.4, thicknessMm: 17.5, holes: 4, holeDiaMm: 15.9, boreMm: 48.3 },
  "2": { size: '2"', nps: '2"', odMm: 152.4, pcdMm: 120.7, thicknessMm: 19.1, holes: 4, holeDiaMm: 19.1, boreMm: 60.3 },
  "3": { size: '3"', nps: '3"', odMm: 190.5, pcdMm: 152.4, thicknessMm: 23.9, holes: 4, holeDiaMm: 19.1, boreMm: 88.9 },
  "4": { size: '4"', nps: '4"', odMm: 228.6, pcdMm: 190.5, thicknessMm: 23.9, holes: 8, holeDiaMm: 19.1, boreMm: 114.3 },
});

export const PIPE_LENGTHS_MM = Object.freeze([100, 200, 300, 500, 1000, 1500, 2000, 3000]);

export function pipeIdMm(row) {
  return Number(row.odMm) - 2 * Number(row.wallMm);
}

export function elbowBendRadiusMm(odMm, series = "long-radius") {
  const factor = ELBOW_RADIUS[series] || ELBOW_RADIUS["long-radius"];
  return Number(odMm) * factor;
}

export function reducingBranchRows(runRow, table) {
  if (!runRow || !table) return [];
  return Object.keys(table).map((key) => ({ key, row: table[key] }))
    .filter((item) => item.row && Number(item.row.odMm) < Number(runRow.odMm)
      && (runRow.schedule == null || item.row.schedule == null || item.row.schedule === runRow.schedule))
    .sort((a, b) => Number(b.row.odMm) - Number(a.row.odMm));
}
