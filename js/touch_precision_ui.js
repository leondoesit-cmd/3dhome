import { t } from "./i18n.js";
import { formatTouchDistance } from "./touch_precision.js";
import { leftHanded, setLeftHanded } from "./side_mirror.js";

var PREFS_KEY = "home3d_touch_precision";
var MODES = ["lens", "rough", "portal"];
var activeSession = null;

function safePrefs() {
  var prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch (_) {}
  return {
    mode: MODES.indexOf(prefs.mode) >= 0 ? prefs.mode : "lens",
    handedness: prefs.handedness === "left" ? "left" : "right",
    refineRatio: [2, 4, 8].indexOf(Number(prefs.refineRatio)) >= 0 ? Number(prefs.refineRatio) : 4,
    portalZoom: Math.max(3, Math.min(6, Number(prefs.portalZoom) || 4)),
  };
}

export function getTouchPrecisionPrefs() { return safePrefs(); }
export function getTouchPrecisionMode() { return safePrefs().mode; }

export function setTouchPrecisionPrefs(next) {
  var prefs = Object.assign({}, safePrefs(), next || {});
  if (MODES.indexOf(prefs.mode) < 0) prefs.mode = "lens";
  prefs.handedness = prefs.handedness === "left" ? "left" : "right";
  prefs.refineRatio = [2, 4, 8].indexOf(Number(prefs.refineRatio)) >= 0 ? Number(prefs.refineRatio) : 4;
  prefs.portalZoom = Math.max(3, Math.min(6, Number(prefs.portalZoom) || 4));
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("touchprecisionmodechange", { detail: prefs }));
  return prefs;
}

function node(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

export function buildTouchPrecisionSettings() {
  var prefs = safePrefs(), root = node("div", "touch-precision-settings");
  var intro = node("div", "touch-settings-intro");
  intro.innerHTML = '<i class="ph ph-crosshair"></i><div><strong>' + t("touch_precision_title") +
    '</strong><p>' + t("touch_precision_intro") + "</p></div>";
  root.appendChild(intro);
  var cards = node("div", "touch-mode-grid");
  [
    { id:"lens", icon:"ph-magnifying-glass", title:"touch_mode_lens", desc:"touch_mode_lens_desc" },
    { id:"rough", icon:"ph-cursor-click", title:"touch_mode_rough", desc:"touch_mode_rough_desc" },
    { id:"portal", icon:"ph-selection-background", title:"touch_mode_portal", desc:"touch_mode_portal_desc" },
  ].forEach(function (spec) {
    var card = node("label", "touch-mode-card" + (prefs.mode === spec.id ? " active" : ""));
    var input = node("input");
    input.type = "radio"; input.name = "touch-precision-mode"; input.value = spec.id;
    input.checked = prefs.mode === spec.id;
    card.appendChild(input);
    var art = node("span", "touch-mode-art touch-mode-art-" + spec.id);
    art.innerHTML = '<i class="ph ' + spec.icon + '"></i><span class="touch-mode-reticle"></span>';
    card.appendChild(art);
    var copy = node("span", "touch-mode-copy");
    copy.innerHTML = "<strong>" + t(spec.title) + "</strong><small>" + t(spec.desc) + "</small>";
    card.appendChild(copy);
    input.onchange = function () {
      prefs = setTouchPrecisionPrefs({ mode: spec.id });
      cards.querySelectorAll(".touch-mode-card").forEach(function (item) {
        item.classList.toggle("active", item.querySelector("input").checked);
      });
      refine.hidden = spec.id !== "rough";
      portal.hidden = spec.id !== "portal";
      lens.hidden = spec.id !== "lens";
    };
    cards.appendChild(card);
  });
  root.appendChild(cards);

  var lens = node("div", "touch-tuning touch-hand-tuning");
  lens.hidden = prefs.mode !== "lens";
  lens.appendChild(node("strong", null, t("touch_lens_hand")));
  var hands = node("div", "touch-segments touch-hand-segments");
  [{id:"right",key:"touch_hand_right"},{id:"left",key:"touch_hand_left"}].forEach(function (hand) {
    var button = node("button", prefs.handedness === hand.id ? "active" : "", t(hand.key));
    button.type = "button";
    button.onclick = function () {
      prefs = setTouchPrecisionPrefs({ handedness:hand.id });
      hands.querySelectorAll("button").forEach(function (item) { item.classList.toggle("active", item === button); });
    };
    hands.appendChild(button);
  });
  lens.appendChild(hands);
  lens.appendChild(node("small", null, t("touch_lens_hand_hint")));
  root.appendChild(lens);

  var refine = node("div", "touch-tuning");
  refine.hidden = prefs.mode !== "rough";
  refine.appendChild(node("strong", null, t("touch_refine_ratio")));
  var ratios = node("div", "touch-segments");
  [2, 4, 8].forEach(function (ratio) {
    var button = node("button", prefs.refineRatio === ratio ? "active" : "", "1:" + ratio);
    button.type = "button";
    button.onclick = function () {
      prefs = setTouchPrecisionPrefs({ refineRatio: ratio });
      ratios.querySelectorAll("button").forEach(function (item) { item.classList.toggle("active", item === button); });
    };
    ratios.appendChild(button);
  });
  refine.appendChild(ratios);
  refine.appendChild(node("small", null, t("touch_refine_ratio_hint")));
  root.appendChild(refine);

  var portal = node("div", "touch-tuning");
  portal.hidden = prefs.mode !== "portal";
  var portalHead = node("div", "touch-tuning-head");
  portalHead.appendChild(node("strong", null, t("touch_portal_zoom")));
  var output = node("output", null, "×" + prefs.portalZoom);
  portalHead.appendChild(output);
  portal.appendChild(portalHead);
  var range = node("input");
  range.type = "range"; range.min = "3"; range.max = "6"; range.step = ".5"; range.value = String(prefs.portalZoom);
  range.oninput = function () { output.textContent = "×" + range.value; setTouchPrecisionPrefs({ portalZoom:Number(range.value) }); };
  portal.appendChild(range);
  portal.appendChild(node("small", null, t("touch_portal_zoom_hint")));
  root.appendChild(portal);

  var note = node("div", "touch-settings-note");
  note.innerHTML = '<i class="ph ph-info"></i><span>' + t("touch_precision_note") + "</span>";
  root.appendChild(note);
  // Tablets and foldables: which side the panels sit on (js/side_mirror.js)
  var side = node("div", "touch-tuning touch-side-tuning");
  side.appendChild(node("strong", null, t("touch_side_title")));
  var sides = node("div", "touch-segments touch-side-segments");
  [{ left: false, key: "touch_side_right" }, { left: true, key: "touch_side_left" }].forEach(function (opt) {
    var button = node("button", leftHanded() === opt.left ? "active" : "", t(opt.key));
    button.type = "button";
    button.setAttribute("aria-pressed", leftHanded() === opt.left ? "true" : "false");
    button.onclick = function () {
      setLeftHanded(opt.left);
      sides.querySelectorAll("button").forEach(function (item) {
        item.classList.toggle("active", item === button);
        item.setAttribute("aria-pressed", item === button ? "true" : "false");
      });
    };
    sides.appendChild(button);
  });
  side.appendChild(sides);
  side.appendChild(node("small", null, t("touch_side_hint")));
  root.appendChild(side);
  return root;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }

function emitPointer(canvas, type, point, pointerId) {
  if (!canvas || typeof PointerEvent === "undefined") return;
  var rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent(type, {
    bubbles:true, cancelable:true, pointerType:"mouse", pointerId:pointerId || 987321,
    button:0, buttons:type === "pointerup" ? 0 : 1,
    clientX:rect.left + point.x, clientY:rect.top + point.y,
  }));
}

export function dispatchPrecisionMove(canvas, point) {
  emitPointer(canvas, "pointermove", point, 987321);
}

export function dispatchPrecisionDown(canvas, point) {
  emitPointer(canvas, "pointerdown", point, 987321);
}

export function dispatchPrecisionUp(canvas, point) {
  emitPointer(canvas, "pointerup", point, 987321);
}

export function dispatchPrecisionCommit(canvas, point) {
  dispatchPrecisionDown(canvas, point);
  dispatchPrecisionUp(canvas, point);
}

function portalBadge(ctx, x, y, text, boundsWidth) {
  ctx.save(); ctx.font = "700 11px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  var w = ctx.measureText(text).width + 12;
  x = clamp(x, w / 2 + 4, boundsWidth - w / 2 - 4);
  ctx.fillStyle = "rgba(15,23,42,.9)"; ctx.strokeStyle = "rgba(255,255,255,.72)"; ctx.lineWidth = 1;
  ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - w / 2, y - 9, w, 18, 8); else ctx.rect(x - w / 2, y - 9, w, 18);
  ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillText(text, x, y + .5); ctx.restore();
}

export function startTouchPrecisionTrial(options) {
  if (!options || !options.canvas || typeof document === "undefined") return null;
  var prefs = safePrefs(), mode = options.mode || prefs.mode;
  if (mode === "lens") return null;
  cancelTouchPrecisionTrial();
  var state = {
    mode:mode, pointerId:options.pointerId, x:Number(options.x)||0, y:Number(options.y)||0,
    initialX:Number(options.x)||0, initialY:Number(options.y)||0,
    ratio:prefs.refineRatio, zoom:prefs.portalZoom, lock:null, xray:false,
    options:options, raf:0,
  };
  var root = node("div", "touch-precision-session " + mode);
  root.setAttribute("role", "dialog"); root.setAttribute("aria-label", t(mode === "portal" ? "touch_mode_portal" : "touch_mode_rough"));
  var surface = node("div", "touch-refine-surface");
  var reticle = node("div", "touch-refine-reticle"); reticle.innerHTML = "<i></i><b></b>";
  var portal = mode === "portal" ? node("div", "touch-portal") : null;
  var portalCanvas = portal ? node("canvas", "touch-portal-canvas") : null;
  if (portal) {
    var portalHead = node("div", "touch-portal-head");
    portalHead.innerHTML = '<span><i class="ph ph-selection-background"></i>' + t("touch_portal_live") + '</span><b>×' + state.zoom + "</b>";
    portal.appendChild(portalHead); portal.appendChild(portalCanvas); root.appendChild(portal);
  }
  root.appendChild(surface); root.appendChild(reticle);

  var panel = node("div", "touch-refine-panel");
  var readout = node("div", "touch-refine-readout");
  readout.innerHTML = "<strong></strong><small></small>"; panel.appendChild(readout);
  var coordinates = node("div", "touch-refine-coordinates");
  var axes = options.axes || ["X", "Y"], inputA = node("input"), inputB = node("input");
  [inputA, inputB].forEach(function (input) {
    input.type = "number"; input.step = ".1"; input.inputMode = "decimal";
    // These coordinates use the caller's sketch/plan units. Keep direct typing:
    // the global dimension dial assumes plan units and sits below this session.
    input.setAttribute("data-knob", "off");
  });
  coordinates.appendChild(node("label", null, axes[0])); coordinates.lastChild.appendChild(inputA);
  coordinates.appendChild(node("label", null, axes[1])); coordinates.lastChild.appendChild(inputB);
  panel.appendChild(coordinates);
  var tools = node("div", "touch-refine-tools");
  function tool(icon, label, action) {
    var button = node("button"); button.type = "button"; button.title = label; button.setAttribute("aria-label", label);
    button.innerHTML = '<i class="ph ' + icon + '"></i><span>' + label + "</span>"; button.onclick = action; tools.appendChild(button); return button;
  }
  var lockH = tool("ph-arrows-left-right", t("touch_lock_horizontal"), function () { state.lock = state.lock === "h" ? null : "h"; sync(); });
  var lockV = tool("ph-arrows-down-up", t("touch_lock_vertical"), function () { state.lock = state.lock === "v" ? null : "v"; sync(); });
  if (options.onSnap) {
    tool("ph-caret-left", t("touch_snap_prev"), function () { var p=options.onSnap(-1,{x:state.x,y:state.y}); if(p)setTarget(p.x,p.y,true); });
    tool("ph-caret-right", t("touch_snap_next"), function () { var p=options.onSnap(1,{x:state.x,y:state.y}); if(p)setTarget(p.x,p.y,true); });
  }
  if (portal && options.onXray) {
    var xray = tool("ph-eye", "X-ray", function () { state.xray=!state.xray; xray.classList.toggle("active",state.xray); options.onXray(state.xray); renderPortal(); });
  }
  panel.appendChild(tools);
  var actions = node("div", "touch-refine-actions");
  var cancel = node("button", "cancel"); cancel.type="button"; cancel.innerHTML='<i class="ph ph-x"></i>'+t("cancel");
  var confirm = node("button", "confirm"); confirm.type="button"; confirm.innerHTML='<i class="ph ph-check"></i>'+t("touch_confirm");
  actions.appendChild(cancel); actions.appendChild(confirm); panel.appendChild(actions); root.appendChild(panel);
  document.body.appendChild(root); document.body.classList.add("touch-precision-active");
  state.root=root; state.surface=surface; state.reticle=reticle; state.portal=portal; state.portalCanvas=portalCanvas;
  activeSession = state;

  function rect() { return options.canvas.getBoundingClientRect(); }
  function modelPoint() { return options.screenToModel ? options.screenToModel({x:state.x,y:state.y}) : {x:state.x,y:state.y}; }
  function syncInputs() {
    var point = modelPoint();
    if (document.activeElement !== inputA) inputA.value = isFinite(point.x) ? String(Math.round(point.x * 10) / 10) : "";
    if (document.activeElement !== inputB) inputB.value = isFinite(point.y) ? String(Math.round(point.y * 10) / 10) : "";
  }
  function sync() {
    var r=rect(), clientX=r.left+state.x, clientY=r.top+state.y;
    surface.style.left=r.left+"px"; surface.style.top=r.top+"px"; surface.style.width=r.width+"px"; surface.style.height=r.height+"px";
    reticle.style.left=clientX+"px"; reticle.style.top=clientY+"px";
    root.classList.toggle("portal-left", clientX >= window.innerWidth/2);
    root.classList.toggle("portal-right", clientX < window.innerWidth/2);
    lockH.classList.toggle("active",state.lock==="h"); lockV.classList.toggle("active",state.lock==="v");
    var desc=options.describe ? options.describe({x:state.x,y:state.y}) : null;
    readout.querySelector("strong").textContent=desc&&desc.primary || t("touch_refine_move");
    readout.querySelector("small").textContent=desc&&desc.secondary || (mode === "rough" ? "1:"+state.ratio : "×"+state.zoom);
    syncInputs(); renderPortal();
  }
  function setTarget(x,y,emit) {
    var r=rect(); x=clamp(Number(x)||0,0,r.width); y=clamp(Number(y)||0,0,r.height);
    if(state.lock==="h")y=state.initialY; if(state.lock==="v")x=state.initialX;
    state.x=x;state.y=y;sync(); if(emit&&options.onMove)options.onMove({x:x,y:y});
  }
  function applyInputs() {
    if(!options.modelToScreen)return; var a=Number(inputA.value),b=Number(inputB.value); if(!isFinite(a)||!isFinite(b))return;
    var point=options.modelToScreen({x:a,y:b}); if(point)setTarget(point.x,point.y,true);
  }
  inputA.onchange=applyInputs; inputB.onchange=applyInputs;

  function dragRelative(target, divisor) {
    target.addEventListener("pointerdown",function(e){
      if(e.button!==0)return; e.preventDefault(); target.setPointerCapture(e.pointerId);
      var start={cx:e.clientX,cy:e.clientY,x:state.x,y:state.y};
      function move(ev){setTarget(start.x+(ev.clientX-start.cx)/divisor,start.y+(ev.clientY-start.cy)/divisor,true);}
      function up(){target.removeEventListener("pointermove",move);target.removeEventListener("pointerup",up);target.removeEventListener("pointercancel",up);}
      target.addEventListener("pointermove",move);target.addEventListener("pointerup",up);target.addEventListener("pointercancel",up);
    });
  }
  if(mode==="rough")dragRelative(surface,state.ratio);
  else {
    surface.addEventListener("pointerdown",function(e){
      if(e.button!==0)return; e.preventDefault(); surface.setPointerCapture(e.pointerId);
      function move(ev){var r=rect();setTarget(ev.clientX-r.left,ev.clientY-r.top,true);}
      move(e); surface.addEventListener("pointermove",move);
      function up(){surface.removeEventListener("pointermove",move);surface.removeEventListener("pointerup",up);surface.removeEventListener("pointercancel",up);}
      surface.addEventListener("pointerup",up);surface.addEventListener("pointercancel",up);
    });
    dragRelative(portalCanvas,state.zoom);
  }

  function renderPortal() {
    if(!portalCanvas || state.raf)return;
    state.raf=requestAnimationFrame(function(){
      state.raf=0;var w=portalCanvas.clientWidth,h=portalCanvas.clientHeight;if(!(w>20&&h>20))return;
      var dpr=Math.min(window.devicePixelRatio||1,2);portalCanvas.width=Math.round(w*dpr);portalCanvas.height=Math.round(h*dpr);
      var ctx=portalCanvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle="#f8fafc";ctx.fillRect(0,0,w,h);
      var editorRect=rect(),clientX=editorRect.left+state.x,clientY=editorRect.top+state.y,zoom=state.zoom;
      var sources=options.sourceCanvases ? options.sourceCanvases() : [options.canvas];
      ctx.save();if(state.xray)ctx.filter="grayscale(.8) contrast(1.5) brightness(1.12)";
      (sources||[]).forEach(function(source){
        if(!source||!source.width||!source.height)return;var sr=source.getBoundingClientRect();if(!(sr.width>0&&sr.height>0))return;
        var left=clientX-sr.left-w/(2*zoom),top=clientY-sr.top-h/(2*zoom),right=left+w/zoom,bottom=top+h/zoom;
        var cl=clamp(left,0,sr.width),ct=clamp(top,0,sr.height),cr=clamp(right,0,sr.width),cb=clamp(bottom,0,sr.height);if(cr<=cl||cb<=ct)return;
        var rx=source.width/sr.width,ry=source.height/sr.height;
        ctx.drawImage(source,cl*rx,ct*ry,(cr-cl)*rx,(cb-ct)*ry,(cl-left)*zoom,(ct-top)*zoom,(cr-cl)*zoom,(cb-ct)*zoom);
      });ctx.restore();
      ctx.strokeStyle=state.xray?"#ef4444":"#e05a46";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(w/2-13,h/2);ctx.lineTo(w/2+13,h/2);ctx.moveTo(w/2,h/2-13);ctx.lineTo(w/2,h/2+13);ctx.stroke();
      var distances=options.getDistances&&options.getDistances({x:state.x,y:state.y});
      if(distances){portalBadge(ctx,w/2,16,"↑ "+formatTouchDistance(distances.up,options.unitLabel),w);portalBadge(ctx,w/2,h-16,"↓ "+formatTouchDistance(distances.down,options.unitLabel),w);portalBadge(ctx,32,h/2,"← "+formatTouchDistance(distances.left,options.unitLabel),w);portalBadge(ctx,w-32,h/2,"→ "+formatTouchDistance(distances.right,options.unitLabel),w);}
    });
  }
  function keydown(e){if(e.key==="Escape"){e.preventDefault();finish(false);}else if(e.key==="Enter"&&!e.isComposing){e.preventDefault();if(e.target===inputA||e.target===inputB)applyInputs();finish(true);}}
  function finish(ok){
    if(activeSession!==state)return;activeSession=null;if(state.raf)cancelAnimationFrame(state.raf);window.removeEventListener("keydown",keydown,true);
    root.remove();document.body.classList.remove("touch-precision-active");if(state.xray&&options.onXray)options.onXray(false);
    if(ok){if(options.onConfirm)options.onConfirm({x:state.x,y:state.y});}else if(options.onCancel)options.onCancel();
  }
  cancel.onclick=function(){finish(false);};
  // Touch confirmation must read the focused field too: its change/blur may
  // arrive after this click, or not arrive before the session removes it.
  confirm.onclick=function(){applyInputs();finish(true);};window.addEventListener("keydown",keydown,true);
  state.setTarget=setTarget;state.finish=finish;sync();setTimeout(function(){if(activeSession===state&&options.onMove)options.onMove({x:state.x,y:state.y});},0);
  return state;
}

export function hasTouchPrecisionTrial() { return !!activeSession; }
export function touchPrecisionTrialOwns(pointerId) { return !!(activeSession && activeSession.pointerId === pointerId); }
export function updateTouchPrecisionTrial(pointerId,x,y) {
  if(!touchPrecisionTrialOwns(pointerId)||!activeSession.setTarget)return false;
  activeSession.setTarget(x,y,true);return true;
}
export function releaseTouchPrecisionTrial(pointerId,cancelled) {
  if(!touchPrecisionTrialOwns(pointerId))return false;
  activeSession.pointerId=null;if(cancelled)activeSession.finish(false);return true;
}
export function cancelTouchPrecisionTrial() { if(activeSession&&activeSession.finish)activeSession.finish(false); }
