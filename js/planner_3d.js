import { layerRank } from './layers.js';
import { anchorPos, conSatisfied } from './wall_constraints.js';
import { wallPointAt } from './geometry.js';
import { pushHistory } from './history.js';
import { makeArcFromThreePoints, pointAtWall } from './wall_curves.js';
import { offsetGhost } from './wall_draw.js';
import { footprint } from './layout_analysis.js';
import { FURN } from './furniture.js';
import { S, SNAP_GRID } from './state.js';
import { THREE } from './three_lazy.js';
import { getMainCamera, has3D, plannerPointer3D, plannerPlanePoint3D, requestRender, toggleWalk, isWalk, toggleWalkView, walkViewMode, setPlannerRenderHook, setLegacyTouchEdit } from './view3d.js';
import { previewSurveyVertex, surveyVertexPlane, snapSurveyVertex } from './survey_vertex.js';
import { st } from './survey_strings.js';
import { dispatchPlannerInput, cancelPlannerGesture, setPlannerInputView } from './planner_input.js';
import { touchClaims3D, isTouchTap } from './planner_touch.js';
import { onAfterRender, render2D } from './plan2d.js';
import { movePlanToolsTo } from './plan_tools_dock.js';
import { wallGeom, detectRooms } from './geometry.js';
import { t, onLangChange } from './i18n.js';
import { wallsButton } from './ui_wall_view.js';
import { fmtLen } from './display_units.js';

let pane, canvas, hud, modeButton, lookButton, personButton, dragId=null, lastInput=null, look=false, constraintHits=[];
/* Touch in the 3D pane: see planner_touch.js for who owns a finger. A second
   finger always navigates. */
const touchIds=new Set();
let touchTap=null;
const TAP_SLOP=10, TAP_MS=450;
let roofButton;
let vertexHits=[],vertexDrag=null;
let planLayersWereHidden=null;
const LAYERS_3D_KEY='mf_plan_layers_3d';
function saved3DLayersHidden(){
  try { return localStorage.getItem(LAYERS_3D_KEY)!=='0'; } catch (_) { return true; }
}
function splitVisible(){
  const center=document.getElementById('center-canvas');
  return !!center&&!center.classList.contains('max-view-2d')&&!center.classList.contains('max-view-3d');
}
function set3DChrome(active){
  const body=document.body;
  if(active){
    /* Layers are still available from the always-visible workflow button, but
       3D starts with the model unobscured.  Remember the independent 2D
       preference and do not re-hide the card on every canvas pointerdown. */
    if(!body.classList.contains('planner-3d-active')){
      planLayersWereHidden=body.classList.contains('workflow-hide-layers');
      body.classList.add('planner-3d-active');
      body.classList.toggle('workflow-hide-layers',saved3DLayersHidden());
      window.dispatchEvent(new Event('planner-viewport'));
    }
    return;
  }
  if(!body.classList.contains('planner-3d-active'))return;
  body.classList.remove('planner-3d-active');
  body.classList.toggle('workflow-hide-layers',!!planLayersWereHidden);
  planLayersWereHidden=null;
  window.dispatchEvent(new Event('planner-viewport'));
}
function cancelVertex(){vertexDrag=null;requestRender();}
function vertexInput(phase,e){
  if(phase==='down'){
    if(S.tool!=='select')return false;
    const r=pane.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    const hit=vertexHits.map(h=>({...h,distance:Math.hypot(h.x-x,h.y-y)})).filter(h=>h.distance<=(e.pointerType==='touch'?22:12)).sort((a,b)=>a.distance-b.distance)[0];
    const f=hit&&S.surveyFeatures.find(f=>f.id===hit.id);
    if(!f||!previewSurveyVertex(S,f.id,hit.index,f.points[hit.index]))return false;
    vertexDrag={id:f.id,index:hit.index,plane:surveyVertexPlane(f,hit.index),original:JSON.stringify(f),floor:S.workspace?.activeFloor,preview:f};
    return true;
  }
  if(!vertexDrag)return false;
  const d=vertexDrag,current=S.surveyFeatures.find(f=>f.id===d.id);
  if(phase==='cancel'||S.tool!=='select'||d.floor!==S.workspace?.activeFloor||JSON.stringify(current)!==d.original){cancelVertex();return true;}
  const p=plannerPlanePoint3D(e.clientX,e.clientY,d.plane.origin,d.plane.normal);
  const candidate=p&&previewSurveyVertex(S,d.id,d.index,snapSurveyVertex(p,d.plane,S.gsnap?SNAP_GRID:0));
  if(candidate)d.preview=candidate;
  if(phase==='up'){
    if(candidate&&JSON.stringify(candidate)!==d.original){pushHistory(st('edit'));S.surveyFeatures=S.surveyFeatures.map(f=>f.id===d.id?candidate:f);S.dirty3D=true;render2D();}
    cancelVertex();
  }
  requestRender();paintPlanner3D();return true;
}
function gameActive() { return !!document.querySelector('body.zombies-on,body.lava-on,body.rc-on'); }
function activate() {
  if(gameActive()) return;
  /* Split is an editing plan with a live 3D preview. Keep its shared command
     deck in the plan even when a pointer edits the 3D canvas; otherwise every
     click makes the whole menu jump between panes. Only the input surface
     changes for that gesture. */
  if(splitVisible()){
    set3DChrome(false);
    movePlanToolsTo('view-2d');
  }else{
    set3DChrome(true);
    movePlanToolsTo('view-3d');
  }
  document.documentElement.dataset.plannerViewport='3d';
  S.edit3D=true;
  setPlannerInputView({id:'3d',scale:lastInput?.scale||1,width:pane?.clientWidth||1,height:pane?.clientHeight||1});
}
function sample(e) {
  const input=plannerPointer3D(e.clientX,e.clientY);
  const r=pane.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const constraint=constraintHits.find(h=>Math.abs(h.x-x)<=h.w/2&&Math.abs(h.y-y)<=14)?.con||null;
  return input ? {...input,event:e,constraint} : null;
}
function send(phase,e) {
  if(vertexInput(phase,e))return true;
  const input=sample(e) || ((phase==='up'||phase==='cancel') && lastInput ? {...lastInput,event:e} : null);
  if(!input)return false;
  lastInput=input;
  const sent=dispatchPlannerInput(phase,input);
  requestRender(); paintPlanner3D(); return sent;
}
/* Each button is a toggle with a fixed name and an on-state. The names used to
   flip to the other mode ("Walk" became "Orbit", "Look" became "Build / edit"),
   so a pressed button named the mode you were NOT in. The tooltip says what a
   click does next instead. */
function navButton(icon) {
  const b=document.createElement('button');b.type='button';
  const i=document.createElement('i');i.className='ph '+icon;i.setAttribute('aria-hidden','true');
  b.append(i,document.createElement('span'));return b;
}
function setNav(b,label,title,on) {
  const s=b.querySelector('span');if(s.textContent!==label)s.textContent=label;
  b.title=title;b.setAttribute('aria-pressed',String(on));
}
function labels() {
  if(roofButton)setNav(roofButton,t('invisible_roof'),t('invisible_roof_hint'),!!S.invisibleRoof);
  const walking=isWalk();
  setNav(modeButton,t('planner_walk'),t(walking?'planner_orbit':'planner_walk'),walking);
  // first / third person only means something while walking
  if(personButton){setNav(personButton,t('planner_third_person'),t('planner_person'),walking&&walkViewMode()==='tpv');personButton.hidden=!walking;}
  setNav(lookButton,t('planner_look'),t(look?'planner_build':'planner_look'),look);
}
export function syncPlannerViewport(mode) {
  if(!pane)return;
  cancelVertex();cancelPlannerGesture(); dragId=null;
  if(mode==='3d') activate();
  else { set3DChrome(false); movePlanToolsTo('view-2d'); setPlannerInputView(null); document.documentElement.dataset.plannerViewport='plan'; }
  labels(); requestRender();
}
export function initPlanner3D() {
  pane=document.getElementById('view-3d'); canvas=document.getElementById('v3d');
  if(!pane||!canvas)return;
  S.edit3D=true;
  window.addEventListener('keydown',e=>{if(e.key==='Escape')cancelVertex();},true);
  window.addEventListener('blueprint:render',()=>{S.dirty3D=true;requestRender();});
  window.addEventListener('layers:changed',()=>{S.dirty3D=true;requestRender();});
  window.addEventListener('planner-door-toggle',e=>{const o=e.detail.opening;if(o&&S.workspace?.role!=='viewer'){pushHistory();o.open=e.detail.open;S.dirty3D=true;requestRender();}});
  const old=document.getElementById('edit3dBtn');if(old)old.hidden=true;
  hud=document.createElement('canvas');hud.id='planner-3d-hud';hud.setAttribute('aria-hidden','true');pane.append(hud);
  const bar=document.createElement('div');bar.className='planner-navigation';bar.setAttribute('role','toolbar');
  modeButton=navButton('ph-person-simple-walk');modeButton.className='pn-walk';
  modeButton.onclick=()=>{cancelVertex();cancelPlannerGesture();activate();toggleWalk();labels();requestRender();};
  lookButton=navButton('ph-hand-grabbing');lookButton.className='pn-look';lookButton.onclick=()=>{cancelVertex();cancelPlannerGesture();activate();look=!look;labels();};
  const person=navButton('ph-user-focus');personButton=person;person.className='pn-person';person.onclick=()=>{cancelVertex();cancelPlannerGesture();activate();if(!isWalk())toggleWalk(true);toggleWalkView();labels();};
  roofButton=navButton('ph-umbrella-simple');roofButton.className='pn-roof';roofButton.id='planner-invisible-roof';
  roofButton.onclick=()=>{S.invisibleRoof=!S.invisibleRoof;S.dirty3D=true;const cb=document.getElementById('cb_invisible_roof');if(cb)cb.checked=S.invisibleRoof;window.dispatchEvent(new Event('planner-navigation-restored'));labels();requestRender();};
  // Walls: Up / Cutaway / Down and how a cut wall looks (js/ui_wall_view.js)
  bar.append(modeButton,lookButton,person,roofButton,wallsButton());pane.append(bar);
  // a pane too narrow for the names keeps the icons; the names stay on the tooltips
  const fit=()=>{bar.classList.remove('pn-icons');if(bar.scrollWidth>bar.clientWidth+1)bar.classList.add('pn-icons');};
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fit).observe(pane);
  window.addEventListener('walls3d:changed',fit);onLangChange(fit);labels();onLangChange(labels);window.addEventListener('planner-navigation-restored',labels);
  document.getElementById('plan')?.addEventListener('pointerdown',()=>{
    cancelVertex();
    set3DChrome(false);
    movePlanToolsTo('view-2d');setPlannerInputView(null);document.documentElement.dataset.plannerViewport='plan';
  },true);
  canvas.addEventListener('pointerdown',e=>{
    /* The edit handler may stop propagation before the pane's first-use
       listener sees it. Dismiss the onboarding bubble on the real action. */
    document.body.classList.add('used-3d');
    if(!has3D()||gameActive()||e.button!==0||look)return;
    activate();
    if(e.pointerType==='touch'){
      touchIds.add(e.pointerId);
      if(touchIds.size>1){
        // second finger: abandon any edit so the pinch/pan below gets both
        if(dragId!=null){send('cancel',e);if(canvas.hasPointerCapture(dragId))canvas.releasePointerCapture(dragId);dragId=null;}
        touchTap=null;return;
      }
      const input=sample(e);
      if(!touchClaims3D(S.tool,input&&input.hit,S.sel)){touchTap={id:e.pointerId,x:e.clientX,y:e.clientY,t:performance.now()};return;}
    }
    if(send('down',e)){dragId=e.pointerId;canvas.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();}
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!has3D()||gameActive()||look)return;
    if(touchTap&&touchTap.id===e.pointerId&&Math.hypot(e.clientX-touchTap.x,e.clientY-touchTap.y)>TAP_SLOP)touchTap=null;
    if(dragId===e.pointerId||(!e.buttons&&e.pointerType!=='touch'&&document.documentElement.dataset.plannerViewport==='3d'))send('move',e);
  });
  for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>{
    if(e.pointerType==='touch'){
      touchIds.delete(e.pointerId);
      // a still, short touch that did not orbit is a tap: select what is under it
      const tap=touchTap;touchTap=null;
      if(type==='pointerup'&&tap&&tap.id===e.pointerId&&dragId==null&&!touchIds.size&&
        isTouchTap(tap,{x:e.clientX,y:e.clientY},performance.now(),TAP_SLOP,TAP_MS)){
        if(send('down',e))send('up',e);
        return;
      }
    }
    if(dragId!==e.pointerId)return;
    send(type==='pointerup'?'up':'cancel',e);dragId=null;
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  // Suppress legacy mouse edit listeners; navigation continues to its own
  // handlers when Look or the right button is used. Touch is suppressed only
  // while this pane owns the gesture (an edit captured above) — otherwise the
  // view's one-finger orbit and two-finger pinch/pan run as usual.
  setLegacyTouchEdit(false);
  for(const type of ['mousedown','touchstart','touchmove','touchend'])canvas.addEventListener(type,e=>{
    if(gameActive()||look)return;
    if(type.startsWith('touch')?dragId!=null:e.button===0){e.preventDefault();e.stopImmediatePropagation();}
  },{capture:true,passive:false});
  canvas.addEventListener('dblclick',e=>{if(!look&&!gameActive()){send('double',e);e.preventDefault();e.stopImmediatePropagation();}},true);
  /* A 2D paint only has to redraw this pane's overlay canvas. Asking for a 3D
     frame on each one kept the post-processed view from ever going idle: the
     warning glow alone paints the HUD every 45 ms. Model edits reach the 3D
     view through S.dirty3D / S.repaint3D on their own; what a 2D paint can
     change unannounced is the selection (its outline and the cut it keeps), so
     a new selection is the one thing that asks for a frame here. */
  onAfterRender(()=>{paintPlanner3D();if(selectionChanged())requestRender();});
  setPlannerRenderHook(paintPlanner3D);
}
let seenSel=null,seenKind,seenRef,seenRefs,seenCount=0;
function selectionChanged(){
  const s=S.sel||null,refs=s?s.refs:undefined,count=refs?refs.length:0;
  if(s===seenSel&&(!s||(s.kind===seenKind&&s.ref===seenRef&&refs===seenRefs&&count===seenCount)))return false;
  seenSel=s;seenKind=s?s.kind:undefined;seenRef=s?s.ref:undefined;seenRefs=refs;seenCount=count;
  return true;
}
export function paintPlanner3D() {
  if(!hud||!has3D()||gameActive()||!pane.clientWidth||!pane.clientHeight)return;
  const w=pane.clientWidth,h=pane.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
  if(hud.width!==Math.round(w*dpr)||hud.height!==Math.round(h*dpr)){hud.width=Math.round(w*dpr);hud.height=Math.round(h*dpr);}
  const c=hud.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
  constraintHits=[];
  const camera=getMainCamera();if(!camera)return;
  const project=p=>{const v=new THREE.Vector3(p.x,p.y??2,p.z).project(camera);return v.z>=-1&&v.z<=1?{x:(v.x+1)*w/2,y:(1-v.y)*h/2}:null;};
  function path(points,color='#26b99a',closed=false){const ps=points.map(project);if(ps.some(p=>!p))return;c.strokeStyle=color;c.lineWidth=2;c.beginPath();ps.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(closed)c.closePath();c.stroke();}
  function label(p,text){const q=project(p);if(!q)return;c.font='12px system-ui';const tw=c.measureText(text).width;c.fillStyle='#10212ded';c.fillRect(q.x-tw/2-5,q.y-16,tw+10,22);c.fillStyle='#fff';c.textAlign='center';c.fillText(text,q.x,q.y);}
  const end=S.previewPt;
  if(end){const p=project(end);if(p){c.strokeStyle='#26b99a';c.beginPath();c.arc(p.x,p.y,5,0,Math.PI*2);c.stroke();}}
  const start=S.nodes[S.drawFrom];
  if(start&&end&&S.drawing){path([start,end]);path([{...start,y:270},{...end,y:270}]);path([end,{...end,y:270}]);label({x:(start.x+end.x)/2,z:(start.z+end.z)/2},fmtLen(Math.hypot(end.x-start.x,end.z-start.z)));}
  if(S.rectDraft&&end)path([S.rectDraft,{x:end.x,z:S.rectDraft.z},end,{x:S.rectDraft.x,z:end.z}],undefined,true);
  if(S.roomGhost){const r=S.roomGhost.rect;path([{x:r.x0,z:r.z0},{x:r.x1,z:r.z0},{x:r.x1,z:r.z1},{x:r.x0,z:r.z1}],S.roomGhost.blocked?'#ed705a':'#26b99a',true);}
  if(S.arcDraft&&end){const a=S.nodes[S.arcDraft.startNode]||S.arcDraft.startPoint,arc=a&&S.arcDraft.through?makeArcFromThreePoints(a,S.arcDraft.through,end):null;if(arc){const n=Math.max(12,Math.ceil(arc.L/20));path(Array.from({length:n+1},(_,i)=>pointAtWall(arc,arc.L*i/n)));}else if(a)path([a,end]);}
  if(S.offsetDraft){const w=S.walls.find(w=>w.id===S.offsetDraft.hostId),g=w&&offsetGhost(w,S.offsetDraft.dist,S.offsetDraft.side||1);if(g){path([g.a,g.b],'#faac38');label(g.b,fmtLen(g.dist));}}
  if(S.placeType&&end&&FURN[S.placeType])path(footprint({...FURN[S.placeType],...end,rot:0}),'#26b99a',true);
  if(S.markerPreview)label(S.markerPreview,'+');
  if(S.mep?.route){const r=S.mep.route;path([...r.pts,...(r.preview?[r.preview]:[])],'#faac38');}
  if(S.sel?.kind==='wall'){const g=wallGeom(S.sel.ref);if(g){path([g.a,g.b],'#f8be49');label({x:(g.a.x+g.b.x)/2,z:(g.a.z+g.b.z)/2,y:30},fmtLen(g.L));}}
  if(S.sel?.kind==='room'){const r=detectRooms().find(r=>r.key===S.sel.ref);if(r)path(r.pts,'#f8be49',true);}
  const cons=Number.isFinite(layerRank('annotations'))?S.wallCons||[]:[];
  // one lookup per id instead of a scan of every wall per id per constraint
  // (first match wins, as find() did; an opening's wall matches strictly)
  const wallByKey=new Map(),wallById=new Map(),openingByKey=new Map();
  if(cons.length){
    for(const w of S.walls){const k=String(w.id);if(!wallByKey.has(k))wallByKey.set(k,w);if(!wallById.has(w.id))wallById.set(w.id,w);}
    for(const o of S.openings){const k=String(o.id);if(!openingByKey.has(k))openingByKey.set(k,o);}
  }
  for(const con of cons){
    if(con.off&&S.sel?.ref?.id!==con.id)continue;
    const points=[];for(const key of ['a','b','point','joint']){const p=con[key]&&typeof con[key]==='object'?anchorPos(con[key]):null;if(p)points.push(p);}
    for(const id of [con.wall,con.ref,con.w1,con.w2,...(con.walls||[])]){const w=wallByKey.get(String(id));if(w){const g=wallGeom(w);if(g)points.push(wallPointAt(w,g.L/2));}}
    for(const id of [con.opening,...(con.openings||[])]){const o=openingByKey.get(String(id)),w=o&&wallById.get(o.wall);if(w)points.push(wallPointAt(w,o.s));}
    if(!points.length)continue;const at={x:points.reduce((v,p)=>v+p.x,0)/points.length,y:35,z:points.reduce((v,p)=>v+p.z,0)/points.length};
    path(points,conSatisfied(con)?'#709fee':'#f17c6b');const text=con.value!=null?String(Math.round(con.value*100)/100):({parallel:'∥',perpendicular:'⊥',fixed:'●',coincident:'○',equalLength:'='})[con.type]||'↔';
    const q=project(at);if(q){label(at,text);constraintHits.push({con,x:q.x,y:q.y-5,w:Math.max(28,c.measureText(text).width+14)});}
  }
  vertexHits=[];
  for(const original of S.surveyFeatures||[]){
    if(!Number.isFinite(layerRank('structure')))continue;
    const f=vertexDrag?.id===original.id?vertexDrag.preview:original;
    path(f.points,'#93a9fb',f.kind==='face');
    if(S.tool==='select'&&previewSurveyVertex(S,f.id,0,f.points[0]))for(let index=0;index<f.points.length;index++){
      const q=project(f.points[index]);if(!q)continue;
      c.fillStyle='#f8be49';c.fillRect(q.x-5,q.y-5,10,10);vertexHits.push({...q,id:f.id,index});
    }
    if(vertexDrag?.id===f.id){const p=f.points[vertexDrag.index];label(p,`${fmtLen(p.x, { suffix: false })}, ${fmtLen(p.y, { suffix: false })}, ${fmtLen(p.z)}`);}
  }
  window.dispatchEvent(new CustomEvent('planner-overlay-3d',{detail:{context:c,project,path,label,width:w,height:h}}));
}
