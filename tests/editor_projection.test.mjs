import test from 'node:test';
import assert from 'node:assert/strict';
import {OrthographicCamera, PerspectiveCamera, Vector3} from '../vendor/three/three.module.js';
import {normalToFrustum,pointerCameraRay,orbitTargetFromFrame,frameTargetFromOrbit} from '../js/core/editor_projection.js';

function camera(orthographic) {
  const f = normalToFrustum(50,45,2);
  const c = orthographic ? new OrthographicCamera(f.left,f.right,f.top,f.bottom,1,6000) : new PerspectiveCamera(45,2,1,6000);
  c.position.set(50,0,0);c.up.set(0,1,0);c.lookAt(0,0,0);c.updateMatrixWorld(true);
  return c;
}
test('Normal To aligns off-plane housing corners with the Right-plane sketch',()=>{
  const plane = new Vector3(0,3.6,-14.478),corner = new Vector3(6.5,3.6,-14.478);
  const ortho = camera(true), a=plane.clone().project(ortho),b=corner.clone().project(ortho);
  assert.ok(Math.abs(a.x-b.x)<1e-12 && Math.abs(a.y-b.y)<1e-12);
  const perspective = camera(false),p=plane.clone().project(perspective),q=corner.clone().project(perspective);
  assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>.04,'fixture must reproduce misleading perspective parallax');
});
for(const orthographic of [true,false])test(`${orthographic?'orthographic':'perspective'} pointer ray returns displayed sketch point`,()=>{
  const c=camera(orthographic),point=new Vector3(0,3.6,-14.478),screen=point.clone().project(c);
  const {origin,direction}=pointerCameraRay(c,screen.x,screen.y,new Vector3(),new Vector3());
  const t=-origin.x/direction.x,hit=origin.clone().addScaledVector(direction,t);
  assert.ok(hit.distanceTo(point)<1e-10);
});
test('Normal To target-plane scale follows distance and viewport aspect',()=>{
  const first=normalToFrustum(50,45,2),zoom=normalToFrustum(25,45,1);
  assert.equal(first.top,zoom.top*2);
  assert.equal(first.right,first.top*2);
  assert.equal(zoom.right,zoom.top);
});

test('unlocking an offset sketch keeps the same world look target instead of adding model height twice',()=>{
 const frame={origin:{x:2,y:0,z:0}},pan={x:3,y:3,z:2};
 const target=orbitTargetFromFrame(frame,pan,3);
 assert.deepEqual(target,{x:5,y:0,z:2});
 assert.deepEqual({x:target.x,y:target.y+3,z:target.z},{x:5,y:3,z:2});
});

test('locking Normal To preserves a panned world target and changing offset frames preserves it again',()=>{
 const orbit={x:5,y:1,z:2},frame={origin:{x:2,y:0,z:0}},next={origin:{x:12,y:6,z:4}};
 const locked=frameTargetFromOrbit(frame,orbit,3);
 assert.deepEqual(locked,{x:3,y:4,z:2});
 assert.deepEqual(orbitTargetFromFrame(frame,locked,3),orbit);
 const relocked=frameTargetFromOrbit(next,orbitTargetFromFrame(frame,locked,3),3);
 assert.deepEqual(relocked,{x:-7,y:-2,z:-2});
 assert.deepEqual(orbitTargetFromFrame(next,relocked,3),orbit);
});
