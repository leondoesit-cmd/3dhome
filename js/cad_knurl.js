// Knurl feature. DIN 82 forms: RAA (straight), RBL/RBR (helical), RGE/RGV
// (diamond raised / recessed). Geometry is a cylindrical band whose radius is
// displaced by a diamond or axial groove lattice. Modeled knurls also emit
// the helical V-groove paths a kernel boolean can subtract.

import { sampleHelix } from "./cad_helix.js";

export const KNURL_TYPES = Object.freeze(["diamond", "straight", "left", "right"]);
export const KNURL_FORMS = Object.freeze({
  diamond: "RGE",
  straight: "RAA",
  left: "RBL",
  right: "RBR",
});

const STANDARD_PITCH_MM = Object.freeze([0.5, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0]);

export function normalizeKnurlSpec(spec = {}) {
  const type = KNURL_TYPES.includes(spec.type) ? spec.type : "diamond";
  const pitchMm = Number(spec.pitchMm) || 1;
  const diameterMm = Number(spec.diameterMm) || (Number(spec.diameter) || 0) * 10;
  const lengthMm = Number(spec.lengthMm) || (Number(spec.length) || Number(spec.height) || 0) * 10;
  const helixAngle = Number.isFinite(Number(spec.helixAngle)) ? Number(spec.helixAngle) : (type === "straight" ? 0 : 30);
  const depthMm = Number(spec.depthMm) || pitchMm * 0.3;
  return {
    type,
    form: KNURL_FORMS[type],
    pitchMm,
    pitch: pitchMm / 10,
    diameterMm,
    diameter: diameterMm / 10,
    radius: diameterMm / 20,
    lengthMm,
    length: lengthMm / 10,
    helixAngle,
    depthMm,
    depth: depthMm / 10,
    origin: spec.origin || { x: 0, y: 0, z: 0 },
    axis: spec.axis || { x: 0, y: 1, z: 0 },
    raised: spec.raised !== false && type === "diamond" ? spec.form !== "RGV" : !!spec.raised,
  };
}

export function validateKnurl(spec) {
  const knurl = normalizeKnurlSpec(spec);
  const issues = [];
  if (!(knurl.diameterMm > 0)) issues.push({ code: "knurl-diameter", message: "Knurl diameter must be positive", field: "diameterMm", severity: "error" });
  if (!(knurl.lengthMm > 0)) issues.push({ code: "knurl-length", message: "Knurl length must be positive", field: "lengthMm", severity: "error" });
  if (!(knurl.pitchMm > 0)) issues.push({ code: "knurl-pitch", message: "Knurl pitch must be positive", field: "pitchMm", severity: "error" });
  if (!STANDARD_PITCH_MM.some((p) => Math.abs(p - knurl.pitchMm) < 1e-6)) {
    issues.push({ code: "knurl-pitch-series", message: "Pitch is not in the DIN 82 preferred series", field: "pitchMm", severity: "warning" });
  }
  if (knurl.depthMm >= knurl.diameterMm / 4) {
    issues.push({ code: "knurl-depth", message: "Knurl depth would consume the cylinder", field: "depthMm", severity: "error" });
  }
  return { ok: issues.every((i) => i.severity !== "error"), issues, spec: knurl };
}

export function knurlStarts(spec) {
  const knurl = normalizeKnurlSpec(spec);
  const circumference = Math.PI * knurl.diameterMm;
  return Math.max(3, Math.round(circumference / knurl.pitchMm));
}

export function knurlGrooveHelices(spec) {
  const knurl = normalizeKnurlSpec(spec);
  const starts = knurlStarts(knurl);
  const families = knurl.type === "straight" ? ["straight"]
    : knurl.type === "left" ? ["left"]
    : knurl.type === "right" ? ["right"]
    : ["left", "right"];
  const pitchAxial = knurl.pitch / Math.cos((knurl.helixAngle * Math.PI) / 180 || 1e-6);
  const grooves = [];
  families.forEach((family) => {
    const handed = family === "left" ? "lh" : "rh";
    const helixPitch = family === "straight" ? 1e6 : pitchAxial * starts;
    for (let i = 0; i < starts; i++) {
      grooves.push({
        family,
        origin: knurl.origin,
        axis: knurl.axis,
        radius: knurl.radius,
        pitch: helixPitch,
        turns: family === "straight" ? 0.001 : knurl.length / helixPitch,
        height: knurl.length,
        handedness: family === "straight" ? "rh" : handed,
        startAngle: (i / starts) * Math.PI * 2,
        depth: knurl.depth,
      });
    }
  });
  return grooves;
}

export function knurlDisplacement(spec, angle, height) {
  const knurl = normalizeKnurlSpec(spec);
  const u = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const v = Math.max(0, Math.min(knurl.length, height));
  const pitch = knurl.pitch || 1e-6;
  if (knurl.type === "straight") {
    const teeth = knurlStarts(knurl);
    const phase = (u * teeth) / (Math.PI * 2);
    const t = Math.abs(phase - Math.round(phase));
    return knurl.depth * Math.max(0, 1 - t * 4);
  }
  const helix = Math.tan((knurl.helixAngle * Math.PI) / 180) * v / knurl.radius;
  const a = ((u + helix) * knurl.radius) / pitch;
  const b = ((u - helix) * knurl.radius) / pitch;
  const da = Math.abs(a - Math.round(a));
  const db = Math.abs(b - Math.round(b));
  const diamond = Math.min(da, db);
  return knurl.depth * Math.max(0, 1 - diamond * 4);
}

export function knurlBandMesh(spec, options = {}) {
  const knurl = normalizeKnurlSpec(spec);
  const nu = Math.max(24, Number(options.around) || knurlStarts(knurl) * 4);
  const nv = Math.max(4, Number(options.along) || Math.ceil(knurl.length / knurl.pitch) * 2 + 1);
  const positions = [], uvs = [];
  const axis = knurl.axis;
  const helper = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const ux = { x: axis.y * helper.z - axis.z * helper.y, y: axis.z * helper.x - axis.x * helper.z, z: axis.x * helper.y - axis.y * helper.x };
  const ul = Math.hypot(ux.x, ux.y, ux.z) || 1;
  ux.x /= ul; ux.y /= ul; ux.z /= ul;
  const vx = { x: axis.y * ux.z - axis.z * ux.y, y: axis.z * ux.x - axis.x * ux.z, z: axis.x * ux.y - axis.y * ux.x };
  for (let j = 0; j <= nv; j++) {
    const h = (j / nv) * knurl.length;
    for (let i = 0; i <= nu; i++) {
      const ang = (i / nu) * Math.PI * 2;
      const dip = knurlDisplacement(knurl, ang, h);
      const r = knurl.radius - dip;
      const cu = Math.cos(ang), sv = Math.sin(ang);
      positions.push(
        knurl.origin.x + axis.x * h + (ux.x * cu + vx.x * sv) * r,
        knurl.origin.y + axis.y * h + (ux.y * cu + vx.y * sv) * r,
        knurl.origin.z + axis.z * h + (ux.z * cu + vx.z * sv) * r,
      );
      uvs.push(i / nu, j / nv);
    }
  }
  const indices = [];
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices), uvs: Float32Array.from(uvs), spec: knurl };
}

export function knurlCallout(spec) {
  const knurl = normalizeKnurlSpec(spec);
  return knurl.form + " " + knurl.pitchMm;
}

export function knurlGroovePolylines(spec) {
  return knurlGrooveHelices(spec).map((groove) => sampleHelix(groove, { segmentsPerTurn: 24 }).points);
}
