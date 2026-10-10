import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PerspectiveCamera,OrthographicCamera,Vector3} from '../vendor/three/three.module.js';
import {switchEditorCamera,pointerCameraRay} from '../js/core/editor_projection.js';
import {sourceFunctionText} from './helpers/source_function.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function rig(){const p=new PerspectiveCamera(45,2,.1,5000),o=new OrthographicCamera(-1,1,1,-1,.1,5000);p.position.set(0,0,50);p.lookAt(0,0,0);p.zoom=1.4;p.updateProjectionMatrix();p.updateMatrixWorld(true);return {p,o};}
test('projection toggles preserve pose and target-plane framing but change depth foreshortening',()=>{
 const {p,o}=rig(),point=new Vector3(5,3,0),before=point.clone().project(p),deep=new Vector3(5,3,20).project(p);
 const c=switchEditorCamera(p,p,o,'orthographic',50);near(point.clone().project(c).x,before.x);near(point.clone().project(c).y,before.y);near(new Vector3(5,3,20).project(c).x,before.x);assert.ok(deep.x>before.x);assert.deepEqual(c.position,p.position);assert.deepEqual(c.quaternion.toArray(),p.quaternion.toArray());
 switchEditorCamera(c,p,o,'perspective',50);near(point.clone().project(p).x,before.x);near(p.zoom,1.4);
});
test('orthographic orbit resize and distance zoom preserve aspect and true pick rays',()=>{
 const {p,o}=rig();p.aspect=1;const c=switchEditorCamera(p,p,o,'orthographic',25);near(c.right,c.top);const target=new Vector3(3,2,0),ndc=target.clone().project(c),ray=pointerCameraRay(c,ndc.x,ndc.y,new Vector3(),new Vector3());const hit=ray.origin.clone().addScaledVector(ray.direction,-ray.origin.z/ray.direction.z);assert.ok(hit.distanceTo(target)<1e-10);near(c.top,25*Math.tan(Math.PI/8));
});
test('invalid projection never mutates camera',()=>{const {p,o}=rig(),before=p.toJSON();assert.throws(()=>switchEditorCamera(p,p,o,'bad',50));assert.deepEqual(p.toJSON(),before);});
test('actual orthographic pick and handle scale stays constant at different object depths',()=>{
 const src=fs.readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8'),start=src.indexOf('view.worldPerPixelAtDistance ='),end=src.indexOf('view.worldPerPixel =',start),{p,o}=rig();switchEditorCamera(p,p,o,'orthographic',50);
 const view={dist:50,big:false};new Function('view','cv','cam','THREE','bigZoom',src.slice(start,end))(view,{clientHeight:500},o,{},()=>1);
 near(view.worldPerPixelAtDistance(10),view.worldPerPixelAtDistance(100));near(view.worldPerPixelAtDistance(10),(o.top-o.bottom)/(o.zoom*500));
});
test('production view switch retains orbit preference while Normal To enforces orthographic',()=>{
 const src=fs.readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8'),chunk=src.slice(src.indexOf('view.getProjection ='),src.indexOf('// Keep every zoom entry'));
 const {p,o}=rig(),view={fixedFrame:{},dist:50,big:false,render(){this.renders=(this.renders||0)+1;}};
 const setup=new Function('view','opts','switchEditorCamera','perspectiveCam','normalCam','cam','bigZoom',`let orbitProjection='perspective';${chunk};return ()=>cam;`);const current=setup(view,{normalToOrthographic:true},switchEditorCamera,p,o,p,()=>1);
 assert.equal(view.setProjection('perspective'),true);assert.equal(current(),o);assert.equal(view.getProjection(),'perspective');view.fixedFrame=null;view.setProjection('orthographic');assert.equal(current(),o);assert.equal(view.getProjection(),'orthographic');view.setProjection('perspective');assert.equal(current(),p);
});
test('ordinary modeler toolbar has accessible checked projection control and no CAD mutation route',()=>{
 const src=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');assert.match(src,/id="mdPerspectiveView" aria-label="Perspective" aria-pressed="true"/);
 const start=src.indexOf('root.querySelector("#mdPerspectiveView").addEventListener'),body=src.slice(start,src.indexOf('root.querySelector("#mdSketchPlaneChip")',start));assert.match(body,/setProjection\(mode\)/);assert.match(body,/localStorage.setItem/);assert.doesNotMatch(body,/pushUndo|createFeature|E\.def\s*=/);
 const sync=sourceFunctionText(src,'syncViewButtons');assert.match(sync,/fixedFrame/);assert.match(sync,/aria-pressed/);
 const css=fs.readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');assert.match(css,/#modeler\.md-assembly\.md-is3d:not\(\.md-isdrawing\) \.md-views \{ display:flex !important; \}/);assert.match(src,/md-vgroup md-projection/);
});
test('actual Normal To with no face/sketch in arbitrary orbit uses Front datum without changing orbit preference',()=>{
 const src=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),{p,o}=rig(),view={dist:50,big:false,render(){},getProjection:()=> 'perspective'};
 const esrc=fs.readFileSync(new URL('../js/editor_view.js',import.meta.url),'utf8'),chunk=esrc.slice(esrc.indexOf('view.getProjection ='),esrc.indexOf('// Keep every zoom entry'));
 new Function('view','opts','switchEditorCamera','perspectiveCam','normalCam','cam','bigZoom',`let orbitProjection='perspective';${chunk}`)(view,{normalToOrthographic:true},switchEditorCamera,p,o,p,()=>1);
 let picked;view.lookAtFrame=f=>{picked=f;view.fixedFrame=f;view.setProjection(view.getProjection());};view.orbitTo=()=>assert.fail('Normal To must not use perspective orbit fallback');
 const E={pv:view,mode:'3d',view:'iso',authoring:{phase:'idle'}},frame={origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:1},yAxis:{x:0,y:1,z:0}};
 new Function('E','faceSketchAttachment','sketchCameraFrame','standardPlaneFrame',sourceFunctionText(src,'orientModelToView')+';orientModelToView(true);')(E,()=>null,()=>null,(name,offset)=>{assert.equal(name,'front');assert.equal(offset,0);return frame;});
 assert.equal(picked,frame);assert.equal(view.cam.isOrthographicCamera,true);assert.equal(view.getProjection(),'perspective');
 const button={classList:{toggle(){}},setAttribute(k,v){this[k]=v;}},root={querySelector:()=>button,querySelectorAll:()=>[]};new Function('E','root','VIEW_PRESETS',sourceFunctionText(src,'syncViewButtons')+';syncViewButtons();')(E,root,[]);assert.equal(button['aria-pressed'],'false');assert.equal(button.disabled,true);
});
