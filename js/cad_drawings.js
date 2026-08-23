import { projectMeshEdges } from "./core/mesh_projection.js";
import { holeCallout, holeLayoutPoints } from "./cad_hole_wizard.js";

function meshBounds(meshData) {
  const positions = meshData?.positions || [];
  if (positions.length < 3) return null;
  const q = { x0:Infinity, x1:-Infinity, y0:Infinity, y1:-Infinity, z0:Infinity, z1:-Infinity };
  for (let i=0; i+2<positions.length; i+=3) {
    q.x0=Math.min(q.x0,positions[i]); q.x1=Math.max(q.x1,positions[i]);
    q.y0=Math.min(q.y0,positions[i+1]); q.y1=Math.max(q.y1,positions[i+1]);
    q.z0=Math.min(q.z0,positions[i+2]); q.z1=Math.max(q.z1,positions[i+2]);
  }
  return Number.isFinite(q.x0) ? q : null;
}

function boundsOf(parts) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of parts || []) {
    let q;
    if (p.kind === "box") q = { x0:p.x0,x1:p.x1,y0:p.y0,y1:p.y1,z0:p.z0,z1:p.z1 };
    else if (p.kind === "cyl" || p.kind === "sph") {
      const r = p.r || 0, h = p.kind === "cyl" ? p.h : r * 2;
      q = { x0:p.x-r,x1:p.x+r,y0:p.kind === "cyl" ? p.y : p.y-r,y1:p.kind === "cyl" ? p.y+h : p.y+r,z0:p.z-r,z1:p.z+r };
    } else if (p.kind === "ext") {
      const us = (p.pts || []).map((pt) => pt.u), vs = (p.pts || []).map((pt) => pt.v);
      const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
      const lo = Math.min(p.from, p.to), hi = Math.max(p.from, p.to);
      q = p.axis === "z" ? { x0:u0,x1:u1,y0:v0,y1:v1,z0:lo,z1:hi }
        : p.axis === "x" ? { x0:lo,x1:hi,y0:v0,y1:v1,z0:u0,z1:u1 }
        : { x0:u0,x1:u1,y0:lo,y1:hi,z0:v0,z1:v1 };
    } else if ((p.kind === "direct" || p.kind === "mesh") && p.meshData) {
      q = p.bounds && Number.isFinite(p.bounds.x0) ? p.bounds : meshBounds(p.meshData);
    } else continue;
    if (!q) continue;
    for (const k of Object.keys(b)) b[k] = k.endsWith("0") ? Math.min(b[k], q[k]) : Math.max(b[k], q[k]);
  }
  if (!Number.isFinite(b.x0)) return { x0:-10,x1:10,y0:-10,y1:10,z0:-10,z1:10 };
  return b;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const n = (value) => Math.round(value * 1000) / 1000;

function meshViewPath(parts, view, ox, oy, scale, a0, c1) {
  let d = "";
  for (const part of parts || []) {
    if ((part.kind !== "direct" && part.kind !== "mesh") || !part.meshData) continue;
    const projection = projectMeshEdges(part.meshData, view);
    for (const segment of projection.segments || []) {
      const x1=ox+(segment.a.u-a0)*scale;
      const y1=oy+(c1-segment.a.v)*scale;
      const x2=ox+(segment.b.u-a0)*scale;
      const y2=oy+(c1-segment.b.v)*scale;
      d += `M${n(x1)},${n(y1)}L${n(x2)},${n(y2)}`;
    }
  }
  return d;
}

export function collectHoleCallouts(def) {
  const features = def?.features || [];
  return features.filter((feature) => feature.type === "hole" && !feature.suppressed).map((feature, index) => {
    const points = holeLayoutPoints(feature.params);
    return {
      id: feature.id,
      item: index + 1,
      callout: holeCallout(feature.params || {}),
      quantity: points.length,
      points,
    };
  });
}

export function collectBalloons(def) {
  const parts = def?.parts || [];
  return parts.map((part, index) => ({
    item: index + 1,
    name: part.name || part.kind || "Part",
    material: part.materialName || "",
    qty: 1,
  }));
}

function titleBlock(def, options, pageW, pageH, scale) {
  const title = esc(options.title || def.name || "Untitled part");
  const number = esc(options.number || def.partNumber || "");
  const rev = esc(options.revision || def.revision || "A");
  const author = esc(options.author || "");
  const units = esc(options.units || def.context?.units?.length || "cm");
  const scaleLabel = `Scale ${Math.round(scale*100)/100}:1 · ${units}`;
  return `<g class="title-block" transform="translate(${pageW-360},${pageH-105})">
    <rect class="shape" width="330" height="75"/>
    <line x1="0" y1="38" x2="330" y2="38"/>
    <line x1="220" y1="38" x2="220" y2="75"/>
    <text class="title" x="165" y="26">${title}</text>
    <text class="view-title" x="110" y="58">${esc(scaleLabel)}</text>
    <text class="meta" x="110" y="70">${number ? "No. "+number+" · " : ""}Rev ${rev}${author ? " · "+author : ""}</text>
    <text class="meta" x="275" y="58">SHEET</text>
    <text class="view-title" x="275" y="70">1 / 1</text>
  </g>`;
}

function sectionHatch(ox, oy, w, h) {
  let d = "";
  for (let x = -h; x < w; x += 8) d += `M${n(ox+x)},${n(oy)}L${n(ox+x+h)},${n(oy+h)}`;
  return `<clipPath id="sectionClip"><rect x="${ox}" y="${oy}" width="${w}" height="${h}"/></clipPath>
    <path class="hatch" clip-path="url(#sectionClip)" d="${d}"/>`;
}

function calloutLeaders(callouts, view, ox, oy, scale, a0, c1) {
  let body = "";
  callouts.forEach((row, index) => {
    const point = row.points[0] || { u: 0, v: 0 };
    const x = ox + (point.u - a0) * scale;
    const y = oy + (c1 - point.v) * scale;
    const lx = x + 36 + index * 4, ly = y - 18 - index * 10;
    body += `<g class="callout"><line x1="${n(x)}" y1="${n(y)}" x2="${n(lx)}" y2="${n(ly)}"/>
      <circle cx="${n(x)}" cy="${n(y)}" r="2.5"/>
      <text x="${n(lx+4)}" y="${n(ly+3)}">${esc(row.callout)}${row.quantity>1?" ×"+row.quantity:""}</text></g>`;
  });
  return body;
}

function balloonMarkers(balloons, ox, oy) {
  return balloons.map((row, index) => {
    const x = ox + 18, y = oy + 22 + index * 22;
    return `<g class="balloon"><circle cx="${x}" cy="${y}" r="9"/><text x="${x}" y="${y+3.5}">${row.item}</text>
      <text class="balloon-name" x="${x+16}" y="${y+4}">${esc(row.name)}</text></g>`;
  }).join("");
}

export function createDrawingSvg(def, options = {}) {
  const pageW = options.width || 1120, pageH = options.height || 790, margin = 46;
  const b = boundsOf(def.parts), modelW = Math.max(1, b.x1-b.x0), modelD = Math.max(1, b.z1-b.z0), modelH = Math.max(1, b.y1-b.y0);
  const viewW = (pageW - margin * 4) / 2, viewH = (pageH - margin * 3) / 2;
  const scale = Math.min(viewW / Math.max(modelW, modelD), viewH / Math.max(modelH, modelD)) * .72;
  const rect = (x,y,w,h,cls="shape") => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const dim = (x1,y1,x2,y2,label) => `<g class="dim"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><path d="M${x1},${y1}l7,-4v8zM${x2},${y2}l-7,-4v8z"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-6}">${esc(label)}</text></g>`;
  const views = [
    { name:"FRONT", view:"front", x:margin, y:margin, w:modelW, h:modelH, a0:b.x0, a1:b.x1, c0:b.y0, c1:b.y1 },
    { name:"TOP", view:"top", x:margin*2+viewW, y:margin, w:modelW, h:modelD, a0:b.x0, a1:b.x1, c0:b.z0, c1:b.z1 },
    { name:"RIGHT", view:"right", x:margin, y:margin*2+viewH, w:modelD, h:modelH, a0:b.z0, a1:b.z1, c0:b.y0, c1:b.y1 },
  ];
  if (options.section) {
    views.push({ name:"SECTION A-A", view:"front", section:true, x:margin*2+viewW, y:margin*2+viewH, w:modelW, h:modelH, a0:b.x0, a1:b.x1, c0:b.y0, c1:b.y1 });
  }
  const callouts = options.holeCallouts === false ? [] : collectHoleCallouts(def);
  const balloons = options.balloons === false ? [] : (options.balloons === true || def.kind === "assembly" ? collectBalloons(def) : []);
  let body = "";
  for (const v of views) {
    const ox = v.x + (viewW-v.w*scale)/2, oy = v.y + (viewH-v.h*scale)/2;
    const meshPath=meshViewPath(def.parts,v.view,ox,oy,scale,v.a0,v.c1);
    const geometry=meshPath ? `<path class="shape" d="${meshPath}"/>` : rect(ox,oy,v.w*scale,v.h*scale);
    body += `<g><text class="view-title" x="${v.x+viewW/2}" y="${v.y+viewH-8}">${v.name}</text>${geometry}`;
    if (v.section) body += sectionHatch(ox, oy, v.w*scale, v.h*scale);
    body += dim(ox,oy-14,ox+v.w*scale,oy-14,`${Math.round(v.w*100)/100} cm`);
    body += dim(ox+v.w*scale+14,oy,ox+v.w*scale+14,oy+v.h*scale,`${Math.round(v.h*100)/100} cm`);
    if (v.name === "FRONT" && callouts.length) body += calloutLeaders(callouts, v, ox, oy, scale, v.a0, v.c1);
    if (v.name === "RIGHT" && balloons.length) body += balloonMarkers(balloons, v.x + 8, v.y + 8);
    body += "</g>";
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
  <style>.sheet{fill:#fff;stroke:#111}.shape{fill:none;stroke:#111;stroke-width:2}.hatch{fill:none;stroke:#444;stroke-width:.6}.dim line,.dim path{fill:#111;stroke:#111;stroke-width:1}.dim text,.view-title,.title,.meta,.callout text,.balloon text,.balloon-name{font-family:Arial,sans-serif;fill:#111}.dim text,.callout text,.balloon-name,.meta{font-size:12px;text-anchor:middle}.view-title{font-size:13px;font-weight:bold;text-anchor:middle}.title{font-size:18px;font-weight:bold;text-anchor:middle}.callout text{text-anchor:start}.balloon text{font-size:11px;font-weight:bold;text-anchor:middle}.balloon circle{fill:#fff;stroke:#111}.balloon-name{text-anchor:start}</style>
  <rect class="sheet" x="8" y="8" width="${pageW-16}" height="${pageH-16}"/>${body}
  ${titleBlock(def, options, pageW, pageH, scale)}</svg>`;
}

export function downloadDrawing(def, options) {
  const svg = createDrawingSvg(def, options), blob = new Blob([svg], { type:"image/svg+xml" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = (def.name || "drawing").replace(/[^a-z0-9_-]+/gi,"_") + ".svg"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
