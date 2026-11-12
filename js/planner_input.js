// View-independent coordinate context for planner gestures. The perspective
// adapter supplies a local metric frame; no hidden canvas or global view state
// is resized or overwritten to execute a tool.
import { S } from './state.js';
import * as flat from './plan_view.js';

let view = null;
let controller = null;
let gestureScale = null;
export function setPlannerInputView(value) { view = value || null; }
export function plannerInputView() { return view; }
export function inputIs3D() { return view?.id === '3d'; }
export function inputScale() { return inputIs3D() ? view.scale : S.SC; }
export function inputBounds(canvas) { return inputIs3D() ? { left:0, top:0, width:view.width, height:view.height } : canvas.getBoundingClientRect(); }
export function sx(x) { return inputIs3D() ? x * view.scale : flat.sx(x); }
export function sz(z) { return inputIs3D() ? z * view.scale : flat.sz(z); }
export function wx(x,y) { return inputIs3D() ? x / view.scale : flat.wx(x,y); }
export function wz(x,y) { return inputIs3D() ? y / view.scale : flat.wz(x,y); }
export function rotatePx(x,y) { return inputIs3D() ? {x,y} : flat.rotatePx(x,y); }
export function toBasePx(x,y) { return inputIs3D() ? {x,y} : flat.toBasePx(x,y); }
export function planRotRad() { return inputIs3D() ? 0 : flat.planRotRad(); }
export function registerPlannerController(value) { controller = value; }
export function dispatchPlannerInput(phase, input) {
  if (!controller?.[phase] || !input?.point || !Number.isFinite(input.point.x) || !Number.isFinite(input.point.z)) return false;
  const scale = phase==='down' ? Number(input.scale) : gestureScale || Number(input.scale);
  if(phase==='down')gestureScale=scale;
  if (!(scale > 0) || !Number.isFinite(scale)) return false;
  setPlannerInputView({ id:'3d', scale, width:input.width, height:input.height, hit:input.hit || null, constraint:input.constraint||null });
  const raw = input.event || {};
  const x = input.point.x * scale, y = input.point.z * scale;
  const event = { type:phase === 'down' ? 'pointerdown' : phase === 'up' ? 'pointerup' : phase === 'cancel' ? 'pointercancel' : 'pointermove',
    clientX:x, clientY:y, offsetX:x, offsetY:y, pointerId:raw.pointerId || 1,
    // touch only for the select tool (wider pick slop, long-press menu): the
    // drawing tools' touch loupe is a 2D-plan overlay with no 3D meaning
    pointerType:raw.pointerType==='touch'&&S.tool==='select'?'touch':'mouse', isTrusted:false, button:0, buttons:raw.buttons || 0,
    shiftKey:!!raw.shiftKey, altKey:!!raw.altKey, ctrlKey:!!raw.ctrlKey, metaKey:!!raw.metaKey,
    preventDefault() {}, stopPropagation() {} };
  controller[phase](event);
  if(phase==='up'||phase==='cancel')gestureScale=null;
  return true;
}
export function cancelPlannerGesture() { controller?.cancel?.({type:'pointercancel'});gestureScale=null; }

export const PLANNER_TOOL_COVERAGE = Object.freeze([
  'select','wall','arcwall','rect','roomstamp','door','window','passage','slabvoid','point','fitcab','erase',
  'walloffset','wallbreak','wallbite','walljoin','wallreverse','wallpaint','mepNode','mepRoute',
]);
