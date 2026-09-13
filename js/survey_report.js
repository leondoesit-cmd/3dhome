import { wallCurveGeom, pointAtWall } from './wall_curves.js';
import { normalizeSurvey, surveyProgress, surveyScene, normalizeSurveyFeatures } from './survey.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function planSVG(scene,tr){
  const sample=(wall,start=0,end=null)=>{const g=wallCurveGeom(wall,scene.nodes);if(!g)return [];end??=g.length;const steps=g.kind==='arc'?Math.max(2,Math.ceil((end-start)/5)):1;return Array.from({length:steps+1},(_,i)=>pointAtWall(wall,start+(end-start)*i/steps,scene.nodes));};
  const walls=(scene.walls||[]).map(wall=>({wall,points:sample(wall)}));
  const features=normalizeSurveyFeatures(scene.surveyFeatures),pts=[...(scene.nodes||[]),...walls.flatMap(w=>w.points),...features.flatMap(f=>f.points)];if(!pts.length)return '';
  const minx=Math.min(...pts.map(p=>p.x))-30,minz=Math.min(...pts.map(p=>p.z))-30,w=Math.max(100,Math.max(...pts.map(p=>p.x))-minx+30),h=Math.max(100,Math.max(...pts.map(p=>p.z))-minz+30);
  const points=pts=>pts.map(p=>`${p.x},${p.z}`).join(' ');
  const lines=walls.map(({wall,points:pts})=>`<polyline points="${points(pts)}" fill="none" stroke="#243b49" stroke-width="${wall.thickness||10}"/>`).join('');
  const openings=(scene.openings||[]).map(o=>{const wall=scene.walls.find(w=>w.id===o.wall);if(!wall)return '';return `<polyline points="${points(sample(wall,o.s-o.width/2,o.s+o.width/2))}" fill="none" stroke="${o.type==='window'?'#69b9d0':'white'}" stroke-width="${(wall.thickness||10)+1}"/>`;}).join('');
  const shapes=features.map(f=>f.kind==='point'?`<circle cx="${f.points[0].x}" cy="${f.points[0].z}" r="4" fill="#6c68ae"><title>${esc(f.label||f.id)}</title></circle>`:`<${f.kind==='face'?'polygon':'polyline'} points="${f.points.map(p=>`${p.x},${p.z}`).join(' ')}" fill="${f.kind==='face'?'#e6e6fa':'none'}" stroke="#6c68ae" stroke-width="2"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minx} ${minz} ${w} ${h}" role="img" aria-label="${tr('report_plan')}">${shapes}${lines}${openings}</svg>`;
}
function elevations(scene){return (scene.walls||[]).map(w=>{const a=scene.nodes?.[w.a],b=scene.nodes?.[w.b];if(!a||!b)return '';const length=wallCurveGeom(w,scene.nodes)?.length||Math.hypot(b.x-a.x,b.z-a.z),height=w.height||270;return `<figure class="elevation"><figcaption>${esc(w.id)} · ${length.toFixed(1)} × ${height.toFixed(1)} cm</figcaption><svg viewBox="-5 -5 ${length+10} ${height+10}"><rect width="${length}" height="${height}" fill="#eef1f3" stroke="#334b58"/>${(scene.openings||[]).filter(o=>o.wall===w.id).map(o=>`<rect x="${o.s-o.width/2}" y="${height-(o.sill||0)-o.height}" width="${o.width}" height="${o.height}" fill="white" stroke="#437d9b"/>`).join('')}</svg></figure>`;}).join('');}
// Orthographic views use canonical model coordinates, never inferred compass bearings.
function featureViews(scene,tr){
  return normalizeSurveyFeatures(scene.surveyFeatures).map(feature=>{
    const title=esc(feature.label||feature.id),points=feature.points;
    const projections=['x','z'].map(axis=>{
      const projected=points.map(p=>({u:p[axis],v:-p.y}));
      const us=projected.map(p=>p.u),vs=projected.map(p=>p.v);
      const minU=Math.min(...us),maxU=Math.max(...us),minV=Math.min(...vs),maxV=Math.max(...vs);
      const pad=Math.max(12,Math.max(maxU-minU,maxV-minV)*.08);
      const coords=projected.map(p=>`${p.u},${p.v}`).join(' ');
      const label=tr(axis==='x'?'report_xy':'report_zy');
      const shape=feature.kind==='point'?'':`<${feature.kind==='face'?'polygon':'polyline'} points="${coords}" fill="${feature.kind==='face'?'#e6e6fa':'none'}" stroke="#6c68ae" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      const vertices=projected.map((p,i)=>`<circle cx="${p.u}" cy="${p.v}" r="${pad*.1}" fill="#514c91"><title>${i+1}: ${esc(points[i].x)}, ${esc(points[i].y)}, ${esc(points[i].z)} cm</title></circle>`).join('');
      return `<figure class="elevation"><figcaption>${label}</figcaption><svg role="img" aria-label="${title} · ${label}" viewBox="${minU-pad} ${minV-pad} ${Math.max(1,maxU-minU)+2*pad} ${Math.max(1,maxV-minV)+2*pad}">${shape}${vertices}</svg></figure>`;
    }).join('');
    const rows=points.map((p,i)=>`<tr><td>${i+1}</td><td>${p.x}</td><td>${p.y}</td><td>${p.z}</td></tr>`).join('');
    return `<article class="survey-feature"><h3>${title} <small>(${esc(feature.id)})</small></h3><div class="elevations">${projections}</div><table class="coordinates"><caption>${tr('report_coordinates')}</caption><thead><tr><th>#</th><th>X (cm)</th><th>Y (cm)</th><th>Z (cm)</th></tr></thead><tbody>${rows}</tbody></table></article>`;
  }).join('');
}
export function buildSurveyReport(state,photos=[],translate=x=>x,{language='en'}={}){
  const s=normalizeSurvey(state.workspace?.survey),progress=surveyProgress(state),tr=k=>esc(translate(k));
  const floors=state.workspace?.floors?.length?state.workspace.floors:[{id:state.workspace?.activeFloor,name:translate('report_floor')}];
  const floorHtml=floors.map(f=>{const scene=surveyScene(state,f.id);return `<section><h2>${esc(f.name||f.id)}</h2>${scene?`${planSVG(scene,tr)}<div class="elevations">${elevations(scene)}</div>${featureViews(scene,tr)}`:`<p>${tr('report_missing_floor')}</p>`}</section>`;}).join('');
  const rows=progress.observations.map(o=>`<tr><td>${esc(o.target?.floorId)} / ${esc(o.target?.id)}</td><td>${tr(o.field)}</td><td>${o.value??''} ${o.value==null?'':esc(o.unit)}</td><td>${tr(o.reference)}</td><td>${tr(o.source)} / ${tr(o.status)}${o.stale?' · '+tr('stale'):''}</td><td>${esc(o.note)} ${o.photos.map(esc).join(', ')}</td></tr>`).join('');
  const missionHtml=progress.missions.map(m=>`<li>${esc(m.title||translate(m.stage))}: ${tr(m.complete?'checked':m.stale?'stale':m.state)} ${esc(m.note)}</li>`).join('');
  const missingPhotos=photos.filter(p=>p.missing).map(p=>`<p>${esc(p.id)} · ${tr('SURVEY_PHOTO_MISSING')}</p>`).join('');
  const photoHtml=photos.filter(p=>typeof p.data==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(p.data)).map(p=>`<figure><img src="${esc(p.data)}" alt="${esc(p.name)}"/><figcaption>${esc(p.id)} · ${esc(p.name)}</figcaption></figure>`).join('');
  return `<!doctype html><html lang="${language==='he'?'he':'en'}" dir="${language==='he'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${tr('title')}</title><style>body{font:14px system-ui;color:#1a3040;margin:32px auto;max-width:1000px;padding:0 20px}h1{font-size:28px}h2{margin-top:30px}svg{display:block;max-width:100%;max-height:430px;margin:18px auto}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #bbc7cf;padding:7px;text-align:start;overflow-wrap:anywhere}tr{break-inside:avoid}section{break-before:page}.elevations{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.elevation{margin:0;break-inside:avoid}.elevation svg{max-height:140px}figure img{max-width:100%;max-height:280px}figure{break-inside:avoid}.survey-feature{margin-block:24px}.coordinates{direction:ltr;table-layout:fixed}.coordinates caption{direction:inherit;text-align:start;margin-block:8px}html[dir="rtl"] .coordinates caption{direction:rtl}small{font-weight:normal}button{padding:10px 15px}@media(max-width:600px){body{padding:0 12px}.elevations{grid-template-columns:1fr}th,td{padding:4px}table{table-layout:fixed}}@media print{button{display:none}body{margin:0;max-width:none}section{break-before:auto}h2{break-after:avoid}}</style></head><body><button onclick="window.print()">${tr('print')}</button><h1>${tr('title')} — ${esc(state.workspace?.name)}</h1><p>${progress.checked}/${progress.total} ${tr('progress')} · ${esc(new Date().toLocaleDateString(language==='he'?'he-IL':'en-US'))}</p>${progress.checked<progress.total?`<p>${tr('incomplete')}</p>`:''}<p>${tr('unit')}: ${esc(s.unit)} · ${tr('reference')}: ${tr('interior')}</p><ol>${missionHtml}</ol><p>${tr('model_geometry')}</p>${floorHtml}<section><h2>${tr('evidence')}</h2><table><thead><tr><th>${tr('target')}</th><th>${tr('field')}</th><th>${tr('value')}</th><th>${tr('reference')}</th><th>${tr('source')}</th><th>${tr('note')}</th></tr></thead><tbody>${rows}</tbody></table></section><section><h2>${tr('photos')}</h2>${photoHtml}${missingPhotos}</section></body></html>`;
}
