import { projectMeshEdges } from "./core/mesh_projection.js";

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
  let body = "";
  for (const v of views) {
    const ox = v.x + (viewW-v.w*scale)/2, oy = v.y + (viewH-v.h*scale)/2;
    const meshPath=meshViewPath(def.parts,v.view,ox,oy,scale,v.a0,v.c1);
    const geometry=meshPath ? `<path class="shape" d="${meshPath}"/>` : rect(ox,oy,v.w*scale,v.h*scale);
    body += `<g><text class="view-title" x="${v.x+viewW/2}" y="${v.y+viewH-8}">${v.name}</text>${geometry}`;
    body += dim(ox,oy-14,ox+v.w*scale,oy-14,`${Math.round(v.w*100)/100} cm`);
    body += dim(ox+v.w*scale+14,oy,ox+v.w*scale+14,oy+v.h*scale,`${Math.round(v.h*100)/100} cm`);
    body += "</g>";
  }
  const title = esc(def.name || "Untitled part");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}">
  <style>.sheet{fill:#fff;stroke:#111}.shape{fill:none;stroke:#111;stroke-width:2}.dim line,.dim path{fill:#111;stroke:#111;stroke-width:1}.dim text,.view-title,.title{font-family:Arial,sans-serif;fill:#111;text-anchor:middle}.dim text{font-size:12px}.view-title{font-size:13px;font-weight:bold}.title{font-size:20px;font-weight:bold}</style>
  <rect class="sheet" x="8" y="8" width="${pageW-16}" height="${pageH-16}"/>${body}
  <g transform="translate(${pageW-360},${pageH-105})"><rect class="shape" width="330" height="75"/><text class="title" x="165" y="31">${title}</text><text class="view-title" x="165" y="56">Scale ${Math.round(scale*100)/100}:1 · cm</text></g></svg>`;
}

export function downloadDrawing(def, options) {
  const svg = createDrawingSvg(def, options), blob = new Blob([svg], { type:"image/svg+xml" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = (def.name || "drawing").replace(/[^a-z0-9_-]+/gi,"_") + ".svg"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
