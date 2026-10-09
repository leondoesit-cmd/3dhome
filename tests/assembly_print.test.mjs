import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadWorkerExecutor} from '../js/core/cad_worker_runtime.js';
import {workerAssemblyPrint} from '../js/core/worker_assembly_print.js';
import {createPartDocument,createFeatureDefinition} from '../js/core/parametric_document.js';
import {flattenAssembly} from '../js/core/assembly_structure.js';
import {assemblyPrintPreview} from '../js/core/assembly_print.js';

function packageXml(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
 while(view.getUint32(at,true)===0x04034b50){const length=view.getUint32(at+18,true),nameLength=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),start=at+30+nameLength+extra,name=new TextDecoder().decode(bytes.subarray(at+30,at+30+nameLength));if(name==='3D/3dmodel.model')return new TextDecoder().decode(bytes.subarray(start,start+length));at=start+length;}throw Error('Missing 3MF model');
}
function indexedMeshes(xml){
 return [...xml.matchAll(/<object\b[^>]*>([\s\S]*?)<\/object>/g)].map(m=>{
  const vertices=[...m[1].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map(x=>x.slice(1).map(Number));
  const triangles=[...m[1].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)].map(x=>x.slice(1).map(Number));
  return {vertices,triangles};
 });
}
function volume(mesh){return mesh.triangles.reduce((sum,t)=>{const [a,b,c]=t.map(i=>mesh.vertices[i]);return sum+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;},0);}
const identity=[1,0,0,0,1,0,0,0,1];
function requests(assembly){return flattenAssembly(assembly,{visibleOnly:true}).map(o=>({id:o.component.id,occurrenceId:o.path.join('/'),label:o.parents.concat(o.component).map(x=>x.name).join(' / '),document:o.component.def,placement:{matrix:[o.placement.x.x,o.placement.y.x,o.placement.z.x,o.placement.x.y,o.placement.y.y,o.placement.z.y,o.placement.x.z,o.placement.y.z,o.placement.z.z],translation:o.placement.origin}}));}

test('native nested print layout exports each repeated occurrence, placement and source variant in all three formats',async()=>{
 const document=createPartDocument({metadata:{authoringSystem:'parametric-v1'}});createFeatureDefinition(document,'box',{id:'box',params:{x:0,y:0,z:0,w:1,h:2,d:3}});
 const variant=structuredClone(document);variant.features[0].params.w=2;
 const assembly={components:[{id:1,name:'Left & <part>',def:document,transform:{x:-4}},{id:2,name:'Group',kind:'assembly',asm:{components:[{id:1,name:'Repeated',def:structuredClone(document),transform:{x:2}},{id:3,name:'Wide',def:variant,transform:{x:7}}]},transform:{x:6,ry:90}},{id:4,name:'Hidden invalid',visible:false,def:{}}],mates:[{id:'preserved'}]};
 const before=JSON.stringify(assembly),components=requests(assembly),execute=createCadWorkerExecutor(),settings={quality:'custom',deviationMm:.01,angleDegrees:5,printSetup:{basePlane:'top',bedWidthMm:200,bedDepthMm:200,bedHeightMm:100}};
 const progress=[];const result=await execute({kind:'assembly-print',components,settings:{...settings,format:'3mf',name:'Tray'}},p=>progress.push(p));
 assert.equal(result.bodies,3);assert.deepEqual(result.occurrences.map(x=>x.id),['1','2/1','2/3']);assert.equal(progress.filter(p=>p.stage==='rebuild'&&!p.featureId).length,2,'same source rebuilt once, changed variant separately');
 const xml=packageXml(result.bytes),meshes=indexedMeshes(xml);assert.equal(meshes.length,3);assert.equal((xml.match(/<item objectid=/g)||[]).length,3);assert.match(xml,/Left &amp; &lt;part&gt;/);
 assert.equal((xml.match(/<metadatagroup>/g)||[]).length,3,'3MF object metadata uses Core metadata groups');assert.match(xml,/name="mf:occurrence" preserve="true">2\/1</);
 assert.deepEqual(meshes.map(m=>Math.round(volume(m))),[6000,6000,12000]);
 const centers=meshes.map(m=>[0,1,2].map(i=>(Math.min(...m.vertices.map(p=>p[i]))+Math.max(...m.vertices.map(p=>p[i])))/2));
 assert.ok(Math.abs(centers[2][1]-centers[1][1]-55)<1e-6,'nested parent rotation maps child localX displacement and variant half-width into printY');
 assert.ok(meshes.every(m=>Math.abs(Math.min(...m.vertices.map(p=>p[2])))<1e-6),'all three layout parts sit atZ0');
 const amf=await execute({kind:'assembly-print',components,settings:{...settings,format:'amf'}}),amfXml=new TextDecoder().decode(amf.bytes);assert.equal((amfXml.match(/<object id=/g)||[]).length,3);assert.match(amfXml,/ModelForge:occurrence">2\/1</);assert.match(amfXml,/unit="millimeter"/);
 const stl=await execute({kind:'assembly-print',components,settings:{...settings,format:'stl'}}),view=new DataView(stl.bytes.buffer,stl.bytes.byteOffset,stl.bytes.byteLength);assert.equal(view.getUint32(80,true),36);assert.equal(stl.bytes.length,84+36*50);
 let signed=0;for(let i=0;i<36;i++){const a=Array.from({length:9},(_,j)=>view.getFloat32(84+i*50+12+j*4,true)),p=a.slice(0,3),q=a.slice(3,6),r=a.slice(6);signed+=(p[0]*(q[1]*r[2]-q[2]*r[1])+p[1]*(q[2]*r[0]-q[0]*r[2])+p[2]*(q[0]*r[1]-q[1]*r[0]))/6;}assert.ok(Math.abs(signed-24000)<.01);
 const preview=await execute({kind:'assembly-print',components,settings:{...settings,previewOnly:true}});assert.equal(preview.bytes,undefined);assert.equal(preview.bodies,3);assert.ok(preview.orientations.front.heightMm>preview.orientations.top.heightMm);
 await assert.rejects(execute({kind:'assembly-print',components,settings:{...settings,printSetup:{...settings.printSetup,bedWidthMm:10}}}),/exceeds/);
 assert.equal(JSON.stringify(assembly),before,'export and rejected fit never mutate source definitions, transforms or mates');
});

test('assembly print rejects missing geometry and reflected/scaled placements without silently skipping occurrences',async()=>{
 const execute=createCadWorkerExecutor();await assert.rejects(execute({kind:'assembly-print',components:[{id:'missing'}],settings:{quality:'fine'}}),/exact feature-built/);
 for(const matrix of [[-1,0,0,0,1,0,0,0,1],[2,0,0,0,1,0,0,0,1]])await assert.rejects(workerAssemblyPrint([{id:1,document:{},placement:{matrix,translation:{x:0,y:0,z:0}}}],{quality:'fine'},()=>{throw Error('must fail before rebuild');}),/preserve scale and winding/);
});

test('later invalid print occurrence releases reused source and each placed handle, with no partial export',async()=>{
 let calls=0,rebuilds=0;const released=[],disposed=[];
 await assert.rejects(workerAssemblyPrint([{id:1,document:{},placement:{matrix:identity,translation:{x:0,y:0,z:0}}},{id:2,document:{},placement:{matrix:identity,translation:{x:3,y:0,z:0}}}],{quality:'fine'},async()=>{rebuilds++;return {run:{ok:true,finalShape:{shape:true}}};},()=>{},{compile:()=>({ok:true,document:{},features:[]}),place:async()=>({shape:true}),validate:async()=>{if(++calls===2)throw Error('Invalid BREP');},mesh:async()=>({positions:[0,0,0,1,0,0,0,1,0]}),release:r=>released.push(r),dispose:r=>disposed.push(r)}),/2: Invalid BREP/);
 assert.equal(rebuilds,1);assert.equal(released.length,1);assert.equal(disposed.length,2);
});

test('tray preview distinguishes conservative footprint overlaps from height-separated bodies and clear spacing',()=>{
 const positions=[0,0,0,1,0,0,0,1,1];
 const raised=positions.map((v,i)=>i%3===1?v+2:v);
 const clear=positions.map((v,i)=>i%3===0?v+2:v);
 const result=assemblyPrintPreview([{occurrenceId:'bed',positions},{occurrenceId:'raised',positions:raised},{occurrenceId:'separate',positions:clear}]);
 assert.deepEqual(result.orientations.top.footprintOverlaps,[{a:'bed',b:'raised'}]);
 assert.equal(result.orientations.top.footprints[1].lowestZMm,20);
 assert.equal(result.orientations.top.footprints[2].lowestZMm,0);
});
