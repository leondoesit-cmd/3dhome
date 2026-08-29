/* Convert GeoJSON indoor floor plans (FeatureCollection / Polygon / MultiPolygon / LineString)
   into architectural nodes, walls, openings, and room metadata. */
import { convertCadToWalls } from "./cad_to_walls.js";

export function convertGeoJsonToWalls(geojson, options = {}) {
  const data = typeof geojson === "string" ? JSON.parse(geojson) : geojson;
  if (!data) return { nodes: [], walls: [], openings: [], roomMeta: {} };

  const features = Array.isArray(data.features)
    ? data.features
    : data.type === "Feature"
      ? [data]
      : Array.isArray(data.geometries)
        ? data.geometries.map((g) => ({ type: "Feature", geometry: g, properties: {} }))
        : [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const rawPolys = [];

  features.forEach((f) => {
    if (!f || !f.geometry) return;
    const geom = f.geometry;
    const props = f.properties || {};
    const type = geom.type;
    const coords = geom.coordinates;

    const rings = [];
    if (type === "Polygon" && Array.isArray(coords)) {
      coords.forEach((r) => rings.push(r));
    } else if (type === "MultiPolygon" && Array.isArray(coords)) {
      coords.forEach((poly) => {
        (poly || []).forEach((r) => rings.push(r));
      });
    } else if (type === "LineString" && Array.isArray(coords)) {
      rings.push(coords);
    }

    rings.forEach((ring) => {
      const cleanRing = [];
      (ring || []).forEach((pt) => {
        if (!Array.isArray(pt) || pt.length < 2) return;
        const x = Number(pt[0]), y = Number(pt[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        cleanRing.push([x, y]);
      });
      if (cleanRing.length >= 2) {
        rawPolys.push({ ring: cleanRing, props });
      }
    });
  });

  if (!rawPolys.length) {
    return { nodes: [], walls: [], openings: [], roomMeta: {} };
  }

  const isGeo = Math.abs(minX) <= 180 && Math.abs(maxX) <= 180 && Math.abs(minY) <= 90 && Math.abs(maxY) <= 90;
  const midLat = (minY + maxY) / 2;

  const cmPerLng = isGeo ? Math.cos((midLat * Math.PI) / 180) * 111319.5 * 100 : (options.unit === "m" || options.unit === "meter" ? 100 : 1);
  const cmPerLat = isGeo ? 111132.9 * 100 : (options.unit === "m" || options.unit === "meter" ? 100 : 1);

  const lines = [];
  const roomMeta = {};

  rawPolys.forEach((item) => {
    const ring = item.ring;
    const props = item.props;
    const isOuter = /outer|exterior|perimeter|boundary/i.test(String(props.name || props.type || props.class || ""));
    const thickness = isOuter ? 25 : 15;
    const layer = isOuter ? "exterior" : "interior";

    for (let i = 0; i < ring.length - 1; i++) {
      const p0 = ring[i], p1 = ring[i + 1];
      const x1 = (p0[0] - minX) * cmPerLng;
      const z1 = isGeo ? -(p0[1] - maxY) * cmPerLat : (p0[1] - minY) * cmPerLat;
      const x2 = (p1[0] - minX) * cmPerLng;
      const z2 = isGeo ? -(p1[1] - maxY) * cmPerLat : (p1[1] - minY) * cmPerLat;

      if (Math.hypot(x2 - x1, z2 - z1) > 10) {
        lines.push({
          x1: Math.round(x1),
          z1: Math.round(z1),
          x2: Math.round(x2),
          z2: Math.round(z2),
          thickness,
          layer,
          height: Number(props.height) > 0 ? Number(props.height) * 100 : 300,
        });
      }
    }

    if (props.name) {
      roomMeta[props.name] = {
        name: props.name,
        color: props.color,
      };
    }
  });

  const converted = convertCadToWalls({ lines }, {
    singleLineWalls: true,
    defaultThickness: 15,
    height: 300,
    nodeTolerance: 5,
    firstId: options.firstId,
  });

  return {
    nodes: converted.nodes,
    walls: converted.walls,
    openings: converted.openings,
    roomMeta,
    bounds: {
      widthCm: (maxX - minX) * cmPerLng,
      depthCm: (maxY - minY) * cmPerLat,
    },
  };
}
