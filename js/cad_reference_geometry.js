// Reference Geometry: planes, axes, points, and coordinate systems.

export function createReferencePlane(options = {}) {
  return {
    id: "plane_" + Date.now().toString(36),
    type: "reference_plane",
    name: options.name || "RefPlane",
    origin: options.origin || { x: 0, y: 0, z: 0 },
    normal: options.normal || { x: 0, y: 1, z: 0 },
    offset: Number(options.offset || 0),
    refType: options.refType || "offset", // 'offset', '3point', 'angle', 'midplane'
  };
}

export function createReferenceAxis(options = {}) {
  return {
    id: "axis_" + Date.now().toString(36),
    type: "reference_axis",
    name: options.name || "RefAxis",
    p1: options.p1 || { x: 0, y: 0, z: 0 },
    p2: options.p2 || { x: 0, y: 100, z: 0 },
    refType: options.refType || "2point",
  };
}

export { createHelix } from "./cad_helix.js";

export function createCoordinateSystem(options = {}) {
  return {
    id: "coordsys_" + Date.now().toString(36),
    type: "coordinate_system",
    name: options.name || "CoordSys",
    origin: options.origin || { x: 0, y: 0, z: 0 },
    xAxis: options.xAxis || { x: 1, y: 0, z: 0 },
    yAxis: options.yAxis || { x: 0, y: 1, z: 0 },
    zAxis: options.zAxis || { x: 0, y: 0, z: 1 },
  };
}

