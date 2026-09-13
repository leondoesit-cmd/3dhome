import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('corner mesh preserves polygon coordinates, thickness and outward top normals',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:800,lang:'en'});
 try {
  const result=await page.eval(async()=>{
   const {THREE,loadThree}=await import('/js/three_lazy.js');await loadThree();
   const {makeSpec,layoutCab}=await import('/js/cabinet.js'),{buildCab}=await import('/js/cabinet_mesh.js');
   const item={id:'corner-mesh',type:'cabsys',w:100,h:90,d:80,cab:makeSpec('k_corner',100,90,80)};
   const L=layoutCab(item),g=new THREE.Group();buildCab(g,item);
   const polys=L.parts.filter(p=>p.k==='poly'),meshes=[];g.traverse(o=>{if(o.geometry?.type==='ExtrudeGeometry')meshes.push(o);});
   return {boxes:g.children.filter(o=>o.geometry?.type==='BoxGeometry').map(o=>o.geometry.parameters.height),boards:meshes.map((m,i)=>{
    m.geometry.computeBoundingBox();const b=m.geometry.boundingBox,p=polys[i],pos=m.geometry.attributes.position,n=m.geometry.attributes.normal;
    let top=0;for(let j=0;j<pos.count;j++) if(Math.abs(pos.getY(j)-(p.y1+(item.cab.elev||0)))<1e-4&&n.getY(j)>0.99)top++;
    return {actual:[b.min.x,b.max.x,b.min.z,b.max.z,b.min.y,b.max.y],expected:[Math.min(...p.pts.map(q=>q.x)),Math.max(...p.pts.map(q=>q.x)),Math.min(...p.pts.map(q=>q.z)),Math.max(...p.pts.map(q=>q.z)),p.y0+(item.cab.elev||0),p.y1+(item.cab.elev||0)],top};
   })};
  });
  assert.ok(result.boxes.length>0);assert.ok(result.boxes.every(h=>h>0));assert.ok(result.boards.length>2);
  for(const b of result.boards){b.actual.forEach((v,i)=>assert.ok(Math.abs(v-b.expected[i])<1e-4,JSON.stringify(b)));assert.ok(b.top>0);}
 }finally{await page.close();}
});
test('designer respects shelf thickness, corner restrictions and mobile cleanup',{skip:!chrome},async()=>{
 const page=await openPage({width:700,height:850,lang:'en'});
 try {
  const result=await page.eval(async()=>{
   const {S}=await import('/js/state.js'),cab=await import('/js/cabinet.js'),ui=await import('/js/ui_cabinet.js'),inspect=await import('/js/ui_cabinet_inspect.js'),{E}=await import('/js/ui_cabinet_ctx.js');
   const item={id:'ui-review',type:'cabsys',x:100,y:100,w:120,h:240,d:60,rot:0,cab:cab.makeSpec('w_classic',120,240,60)};item.cab.shelf=2.8;S.items=[item];ui.openCabinet(item);
   E.sel={col:0,sec:0};const before=item.cab.cols[0].secs[0].h;inspect.splitSection();const secs=item.cab.cols[0].secs;const split=secs[0].h+secs[1].h+2.8;
   ui.closeCabinet();
   const originalSet=window.setInterval,originalClear=window.clearInterval,active=new Set();
   window.setInterval=(fn,ms,...args)=>{const id=originalSet(fn,ms,...args);if(ms===250)active.add(id);return id;};window.clearInterval=id=>{active.delete(id);return originalClear(id);};
   for(let i=0;i<3;i++){ui.openCabinet(item);ui.closeCabinet();}
   const pending=active.size;window.setInterval=originalSet;window.clearInterval=originalClear;
   item.w=90;item.h=90;item.d=90;item.cab=cab.makeSpec('k_corner',90,90,90);ui.openCabinet(item);E.sel={col:0,sec:0};inspect.splitColumn();inspect.dupColumn();inspect.splitSection();
   const corner=[item.cab.cols.length,item.cab.cols[0].secs.length];ui.closeCabinet();return {before,split,pending,corner};
  });
  assert.ok(Math.abs(result.split-result.before)<0.11);assert.equal(result.pending,0);assert.deepEqual(result.corner,[1,1]);
 }finally{await page.close();}
});
