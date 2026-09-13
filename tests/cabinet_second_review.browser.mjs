import test from 'node:test';
import assert from 'node:assert/strict';
import {openPage,findChrome} from '../tools/browser_harness.mjs';
const chrome=await findChrome();
test('plan renderer follows physical corner hinges under unequal scales and omits lift arcs',{skip:!chrome},async()=>{
 const page=await openPage({width:1280,height:720,lang:'en'});
 try{
  const results=await page.eval(async()=>{
   const cab=await import('/js/cabinet.js'),{drawCabinetPlanSwings}=await import('/js/plan2d.js');
   const results=[];
   for(const hinge of ['L','R']){
    const it={id:'corner-plan',type:'cabsys',x:0,z:0,w:90,h:90,d:90,rot:0,cab:cab.makeSpec('k_corner',90,90,90)};
    it.cab.cols[0].door.hinge=hinge;
    const P=cab.planCab(it),paths=[];let path;
    const ctx={save(){},restore(){},setLineDash(){},beginPath(){path=[];paths.push(path)},moveTo(x,z){path.push([x,z])},lineTo(x,z){path.push([x,z])},stroke(){}};
    drawCabinetPlanSwings(ctx,P,2,3);
    const sw=P.swings[0];
    results.push({hinge,sw,paths:structuredClone(paths)});
    it.cab.cols[0].door.t='lift';
    paths.length=0;drawCabinetPlanSwings(ctx,cab.planCab(it),2,3);
    results.push({lift:true,count:paths.length});
   }
   return results;
  });
  for(const result of results){
   if(result.lift){assert.equal(result.count,0);continue;}
   const {sw,paths}=result;assert.equal(paths.length,2);assert.equal(paths[0].length,25);
   assert.deepEqual(paths[1][0],[sw.pivot.x*2,sw.pivot.z*3]);
   for(const [x,z] of paths[0])assert.ok(Math.abs(Math.hypot(x/2-sw.pivot.x,z/3-sw.pivot.z)-sw.reach)<1e-7);
   assert.deepEqual(paths[0].at(-1),paths[1][1]);
   const first=paths[0][0],last=paths[0].at(-1);
   assert.ok(last[0]/2+last[1]/3>first[0]/2+first[1]/3);
  }
 }finally{await page.close();}
});
