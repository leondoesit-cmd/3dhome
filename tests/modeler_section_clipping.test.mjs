import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
const start=source.indexOf('function applySectionClipping('), end=source.indexOf('\n}',start)+2;
test('section root follows enable, plane replacement and disable without material mutations',()=>{
 const E={pv:{},section:{enabled:true}}, root={isClippingGroup:true};
 let plane={axis:'x',offset:0};
 const apply=vm.runInNewContext('('+source.slice(start,end)+')',{E,sectionPlane:()=>plane});
 apply(root);assert.equal(root.enabled,true);assert.equal(root.clippingPlanes[0],plane);assert.equal(root.clipShadows,true);
 plane={axis:'z',offset:3,flip:true};apply(root);assert.equal(root.clippingPlanes[0],plane);
 const live={};apply(live);assert.equal(Object.keys(live).length,0);
 E.section.enabled=false;apply(root);assert.equal(root.enabled,false);assert.equal(root.clippingPlanes.length,0);assert.equal(root.clipShadows,false);
});
