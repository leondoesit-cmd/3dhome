import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {editorBoundsFitDistance} from '../js/core/editor_view_fit.js';
const preview=readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8');
const boxes=[{x0:-2,x1:2,y0:-1.732,y1:1.732,z0:0,z1:8},{x0:0,x1:8,y0:-1.732,y1:1.732,z0:-2,z1:2}];
function corners(b){const out=[];for(const x of [b.x0,b.x1])for(const y of [b.y0,b.y1])for(const z of [b.z0,b.z1])out.push({x:x-(b.x0+b.x1)/2,y:y-(b.y0+b.y1)/2,z:z-(b.z0+b.z1)/2});return out;}
function screen(p,yaw,pitch,distance,w,h,orthographic=false,zoom=1){
 const x=p.x*Math.cos(yaw)-p.z*Math.sin(yaw),z=p.x*Math.sin(yaw)+p.z*Math.cos(yaw);
 const y=p.y*Math.cos(pitch)-z*Math.sin(pitch),depth=p.y*Math.sin(pitch)+z*Math.cos(pitch);
 const denominator=(orthographic?distance:distance-depth)*Math.tan(Math.PI/8)/zoom;
 return {x:w/2+x/denominator*h/2,y:h/2-y/denominator*h/2};
}
test('phone Fit contains Front and Right datum cylinders with perspective near depth and orthographic zoom',()=>{
 for(const b of boxes)for(const [w,h] of [[390,680],[390,792],[844,340]])for(const orthographic of [false,true])for(const zoom of [1,2]){
  const distance=editorBoundsFitDistance(b,w,h,45,orthographic,zoom);
  for(const yaw of [0,.8,Math.PI/2,2.3])for(const pitch of [-1,.5,1])for(const p of corners(b)){
   const q=screen(p,yaw,pitch,distance,w,h,orthographic,zoom);
   assert.ok(q.x>=24-1e-8&&q.x<=w-24+1e-8&&q.y>=24-1e-8&&q.y<=h-24+1e-8,JSON.stringify({b,w,h,orthographic,zoom,q}));
  }
 }
 const b=boxes[0],oldDistance=Math.hypot(4,3.464,8)*1.5*1.3;
 assert.ok(corners(b).some(p=>{const q=screen(p,.8,.5,oldDistance,390,792);return q.x<24||q.x>366;}),'old diagonal-only fit reproduces the phone edge collision');
});
test('production preview Fit resizes before aspect measurement and applies large-pane distance once',()=>{
 const start=preview.indexOf('view.frame = function (radius,bounds) {'),end=preview.indexOf('\n    };',start)+7;
 assert.ok(start>=0);let resets=0,resized=0;const view={big:true,resize(){resized++;context.lastW=390;context.lastH=792;},target:{set(x,y,z){assert.deepEqual([x,y,z],[0,0,0]);resets++;}}};
 const context={view,editorBoundsFitDistance,lastW:800,lastH:600,cam:{fov:45,zoom:1,isOrthographicCamera:false},bigZoom:()=>1.3,minDist:1,maxDist:2000,clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
 vm.runInNewContext(preview.slice(start,end),context);
 view.frame(1,boxes[0]);assert.equal(resized,1);assert.equal(resets,1);
 assert.ok(Math.abs(view.dist*1.3-editorBoundsFitDistance(boxes[0],390,792))<1e-10);
 view.frame(100,boxes[0]);assert.equal(view.dist,100,'already generous desktop distance remains unchanged');
 view.frame(50);assert.equal(view.dist,50,'other editor callers retain distance-only framing');
  assert.equal(editorBoundsFitDistance(boxes[0],0,0),0,'hidden initial canvas does not invent a tiny viewport');
});
