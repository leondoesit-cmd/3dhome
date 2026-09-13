import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheetMetalPart,addEdgeFlange,flatPattern,flatPatternSvg} from '../js/cad_sheet_metal.js';
import {modeledThreadSolid,validateThreadFeature,validateThreadFit} from '../js/cad_thread.js';
import {makeBrepPrimitive,makeBrepLoft,validateBrepForExport,exportStep,exportIges,disposeBrep,compoundBrep} from '../js/cad_kernel.js';
const spec={diameterMm:6,pitchMm:1,lengthMm:3,mode:'modeled'};
const limits=(side)=>({source:'Test shop inspection limits (fixture, not a standards table)',units:'mm',diameterMm:6,pitchMm:1,toleranceClass:side==='external'?'6g':'6H',majorDiameter:side==='external'?{min:5.8,max:5.9}:{min:6,max:6.1},pitchDiameter:side==='external'?{min:5.2,max:5.3}:{min:5.35,max:5.45},minorDiameter:side==='external'?{min:4.7,max:4.8}:{min:4.9,max:5}});
test('measured bend table and hem rule survive document round trips without extrapolation',()=>{
 const sheet=createSheetMetalPart({thickness:.1,insideRadius:.2,base:{width:10,height:5},material:'test steel',bendRule:{type:'table',name:'Fixture brake',source:'Measured test coupon',material:'test steel',units:'mm',rows:[{angle:90,thickness:1,radius:2,deduction:2.2},{kind:'hem',angle:180,thickness:1,radius:2,deduction:1.5,setback:2}]}});
 addEdgeFlange(sheet,'left',2);addEdgeFlange(sheet,'right',2,180);
 const pattern=flatPattern(JSON.parse(JSON.stringify(sheet)));
 assert.ok(Math.abs(Math.max(...pattern.outline.map(p=>p.x))-Math.min(...pattern.outline.map(p=>p.x))-13.63)<1e-9);
 assert.equal(pattern.bends[1].kind,'hem');assert.equal(pattern.bends[0].source,'Measured test coupon');
 assert.throws(()=>addEdgeFlange(sheet,'top',2,45),/matching row/);assert.equal(sheet.flanges.length,2);
 sheet.material='aluminium';assert.throws(()=>flatPattern(sheet),/material/);
});
test('adjacent flanges produce a connected notched cut outline and separate bend lines',()=>{
 const sheet=createSheetMetalPart({thickness:.1,insideRadius:.2,base:{width:10,height:6},cornerRelief:{type:'rectangular',width:.15}});
 for(const edge of ['left','right','top','bottom'])addEdgeFlange(sheet,edge,2);
 const pattern=flatPattern(sheet);assert.equal(pattern.reliefs.length,4);assert.equal(pattern.outline.length,12);
 const area=Math.abs(pattern.outline.reduce((sum,p,i)=>{const q=pattern.outline[(i+1)%pattern.outline.length];return sum+p.x*q.y-q.x*p.y;},0)/2);
 assert.ok(area>60&&area<14*10);
 const svg=flatPatternSvg(sheet);assert.match(svg,/mm"/);assert.match(svg,/id="cut"/);assert.match(svg,/id="bends"/);
 assert.equal((svg.match(/<line /g)||[]).length,4);
});
test('invalid or duplicate flange edits leave the original sheet untouched',()=>{
 const sheet=createSheetMetalPart();addEdgeFlange(sheet,'right',10);
 const snapshot=JSON.stringify(sheet);assert.throws(()=>addEdgeFlange(sheet,'right',10),/one full-width/);
 assert.throws(()=>addEdgeFlange(sheet,'left',Infinity),/finite/);assert.equal(JSON.stringify(sheet),snapshot);
});
test('thread fit uses sourced worst-case dimensional limits and checks handedness and class',()=>{
 const external={...spec,side:'external',fitLimits:limits('external')},internal={...spec,side:'internal',fitLimits:limits('internal')};
 const report=validateThreadFit(external,internal);assert.equal(report.ok,true,JSON.stringify(report.issues));assert.ok(report.clearances.pitchDiameter.min>.049);
 assert.equal(validateThreadFit(external,{...internal,handedness:'lh'}).ok,false);
 assert.equal(validateThreadFit(spec,{...spec,side:'internal'}).ok,false);
 assert.equal(validateThreadFeature({...spec,side:'internal',toleranceClass:'6g'}).ok,false);
 internal.fitLimits.pitchDiameter.min=5.25;assert.equal(validateThreadFit(external,internal).ok,false);
 assert.equal(validateThreadFeature({...spec,runoutStartMm:2,runoutEndMm:2}).ok,false);
});
test('thread runouts taper to points, stay within specified length and build valid solids',async()=>{
 for(const side of ['external','internal']){
  const model=modeledThreadSolid({...spec,side,runoutStartMm:.5,runoutEndMm:.5,axis:{x:0,y:1,z:0}});
  assert.equal(model.sections[0].length,1);assert.equal(model.sections.at(-1).length,1);
  assert.ok(model.sections.flat().every(p=>p.y>=-1e-10&&p.y<=.3+1e-10));
  const body=await makeBrepLoft({sections:model.sections,solid:true,ruled:true,matchProfiles:false});
  try{const report=await validateBrepForExport(body);assert.equal(report.solidCount,1);assert.ok(report.volumeCm3>0);assert.ok((await exportStep(body)).length>100);}finally{disposeBrep(body);}
 }
});
test('export checks solids, rejects empty/open/reversed geometry and writes STEP and IGES',async()=>{
 const box=await makeBrepPrimitive({type:'box',w:2,h:3,d:4});
 const section=y=>[{x:0,y,z:0},{x:1,y,z:0},{x:1,y,z:1},{x:0,y,z:1}];
 const sheet=await makeBrepLoft({sections:[section(0),section(1)],solid:false,ruled:true});
 const mixed=await compoundBrep([box,sheet]);
 const reversed={oc:box.oc,shape:box.shape.Reversed()};
 try{
  const report=await validateBrepForExport(box);assert.ok(Math.abs(report.volumeCm3-24)<1e-9);
  assert.ok((await exportStep(box)).length>100);
  const iges=await exportIges(box);assert.ok(iges.length>100);
  const oc=box.oc,reader=new oc.IGESControl_Reader_1(),progress=new oc.Message_ProgressRange_1();let imported;
  try{
    oc.FS.writeFile('/manufacturing-roundtrip.igs',iges);
    assert.equal(reader.ReadFile('/manufacturing-roundtrip.igs').value,oc.IFSelect_ReturnStatus.IFSelect_RetDone.value);
    reader.TransferRoots(progress);imported={oc,shape:reader.OneShape()};
    const restored=await validateBrepForExport(imported);assert.ok(Math.abs(restored.volumeCm3-24)<1e-7,JSON.stringify(restored));
  }finally{if(imported)disposeBrep(imported);oc.FS.unlink('/manufacturing-roundtrip.igs');reader.delete();progress.delete();}
  await assert.rejects(()=>exportStep(sheet),/no closed solid/);
  await assert.rejects(()=>exportStep(mixed),/outside closed solids/);
  await assert.rejects(()=>exportStep(reversed),/negative|invalid/);
  await assert.rejects(()=>validateBrepForExport(box,{maxToleranceCm:1e-10}),/tolerance/);
  assert.ok((await exportStep(sheet,'surface.step',{allowSurfaces:true})).length>100);
 }finally{[box,sheet,mixed,reversed].forEach(disposeBrep);}
});

test('external thread removes complementary grooves from nominal cylindrical stock',async()=>{
 const {regenerateFeatures,releaseRegeneration}=await import('../js/cad_feature_tree.js');
 const run=await regenerateFeatures({features:[{id:'stock',type:'cylinder',inputs:[],params:{r:.3,h:.3}},{id:'thread',type:'thread',inputs:['stock'],params:{...spec,runoutStartMm:.5,runoutEndMm:.5}}]});
 try{
  assert.equal(run.ok,true,JSON.stringify(run.issues));
  const report=await validateBrepForExport(run.finalShape);
  assert.ok(report.volumeCm3<Math.PI*.3*.3*.3-1e-4);
  assert.ok(report.volumeCm3>Math.PI*.23*.23*.3);
 }finally{releaseRegeneration(run);}
});
