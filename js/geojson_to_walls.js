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
        : ["Polygon", "MultiPolygon", "LineString"].includes(data.type)
          ? [{type:"Feature",geometry:data,properties:{}}] : [];

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

  /* Without an explicit unit the SIZE decides, never where the coordinates
     start. Lon/lat only when they are in range and span a building or a site
     (0.05° is ~5 km): a local plan in metres, 0-12 by 0-3, passed the bare
     range test and imported 1,335 km wide. Anything else is local, in the
     metric unit that makes it home-sized (3-100 m across), as dxfUnits guesses. */
  const UNITS = {m:100,meter:100,cm:1,mm:.1,ft:30.48,in:2.54};
  const explicitUnit = Object.hasOwn(UNITS, options.unit);
  const span = Math.max(maxX - minX, maxY - minY);
  const isGeo = !explicitUnit && span > 0 && span <= 0.05 &&
    Math.abs(minX) <= 180 && Math.abs(maxX) <= 180 && Math.abs(minY) <= 90 && Math.abs(maxY) <= 90;
  const midLat = (minY + maxY) / 2;

  let localScale = explicitUnit ? UNITS[options.unit] : 1;
  if (!explicitUnit && span > 0) {
    let best = Infinity;
    for (const scale of [UNITS.mm, UNITS.cm, UNITS.m]) {
      const score = Math.abs(Math.log(span * scale / 1500));
      if (score < best) { best = score; localScale = scale; }
    }
  }
  const cmPerLng = isGeo ? Math.cos((midLat * Math.PI) / 180) * 111319.5 * 100 : localScale;
  const cmPerLat = isGeo ? 111132.9 * 100 : localScale;

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
      // GeoJSON's y (latitude or northing) points up; the plan's z points down
      const z1 = (maxY - p0[1]) * cmPerLat;
      const x2 = (p1[0] - minX) * cmPerLng;
      const z2 = (maxY - p1[1]) * cmPerLat;

      if (Math.hypot(x2 - x1, z2 - z1) > 1e-6) {
        lines.push({
          x1: x1,
          z1: z1,
          x2: x2,
          z2: z2,
          thickness,
          layer,
          height: Number(props.height) > 0 ? Number(props.height) * 100 : 300,
        });
      }
    }


  });

  const converted = convertCadToWalls({ lines }, {
    singleLineWalls: true,
    minWidth: Infinity,
    defaultThickness: 15,
    height: 300,
    nodeTolerance: .001,
    firstId: options.firstId,
  });

  // Adjacent polygons describe the same party wall from opposite directions.
  const shared=new Set();
  converted.walls=converted.walls.filter(w=>{
    const key=[w.a,w.b].sort((a,b)=>a-b).join(',');
    if(shared.has(key))return false;shared.add(key);return true;
  });
  const on=(p,a,b)=>{
    const dx=b.x-a.x,dz=b.z-a.z,ll=dx*dx+dz*dz;
    if(ll<1e-12)return false;
    const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/ll;
    return t>=-1e-6&&t<=1+1e-6&&Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<.01;
  };
  for(const {ring,props} of rawPolys){
    if(!props.name||ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])continue;
    const points=ring.map(p=>({x:(p[0]-minX)*cmPerLng,z:(maxY-p[1])*cmPerLat}));
    const ids=converted.walls.filter(w=>points.slice(1).some((b,i)=>on(converted.nodes[w.a],points[i],b)&&on(converted.nodes[w.b],points[i],b))).map(w=>w.id);
    if(ids.length>=3)roomMeta[ids.sort((a,b)=>a-b).join(',')]={name:props.name,...(props.color!=null?{color:props.color}:{})};
  }

  return {
    nodes: converted.nodes,
    walls: converted.walls,
    openings: converted.openings,
    nextId: converted.nextId,
    roomMeta,
    bounds: {
      widthCm: (maxX - minX) * cmPerLng,
      depthCm: (maxY - minY) * cmPerLat,
    },
  };
}
