import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {flattenAssembly} from '../js/core/assembly_structure.js';
import {interferenceDocument} from '../js/core/worker_interference.js';
import {buildCommandCatalog} from '../js/modeler_commands.js';
const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function handlers(E,worker){
 const downloads=[],messages=[];let undo=0;
 const context={E,flattenAssembly,componentDef:c=>c.def,activeParts:d=>d.parts.filter(p=>!p.suppressed),hasSingleToolboxKernelRecipe:()=>false,interferenceDocument,rejectFlexibleSpringPreview:()=>false,cloneData:structuredClone,assemblyPrintInCadWorker:worker,pushUndo:()=>undo++,downloadBytes:(...args)=>downloads.push(args),flash:m=>messages.push(m)};
 context.assemblyPrintRequests=new Function(...Object.keys(context),sourceFunctionText(source,'assemblyPrintRequests')+';return assemblyPrintRequests;')(...Object.values(context));
 const apply=new Function(...Object.keys(context),sourceFunctionText(source,'exportAssemblyPrintDocument')+';return exportAssemblyPrintDocument;')(...Object.values(context));
 return {apply,requests:context.assemblyPrintRequests,downloads,messages,get undo(){return undo;}};
}
function assembly(){const def={metadata:{authoringSystem:'parametric-v1'},parts:[{id:'body',meshData:{positions:[1,2,3]}}],features:[{id:'solid'}]};return {name:'Print tray',components:[{id:1,name:'Group',kind:'assembly',transform:{ry:90,x:3},asm:{components:[{id:2,name:'Leaf',def,transform:{x:2}}]}},{id:3,name:'Second',def:structuredClone(def),transform:{x:-4}},{id:4,name:'Hidden',visible:false,def:{}}],topologyMates:[{id:'unchanged'}]};}

test('actual assembly export handler sends exact nested leaf recipes and occurrence paths without display meshes',async()=>{
 const E={docType:'assembly',assembly:assembly()},before=JSON.stringify(E.assembly);let request;
 const h=handlers(E,async(components,settings)=>{request={components,settings};return {bytes:new Uint8Array([1]),bodies:2};});
 assert.equal(await h.apply({quality:'custom',deviationMm:.01,angleDegrees:5},'3mf',E.assembly),true);
 assert.deepEqual(request.components.map(c=>c.occurrenceId),['1/2','3']);assert.equal(request.components[0].document.parts.length,0);assert.equal(request.components[0].placement.translation.z,-2);
 assert.equal(h.undo,1);assert.equal(h.downloads.length,1);assert.equal(h.downloads[0][1],'Print tray.3mf');
 const clean=structuredClone(E.assembly);delete clean.stlExportSettings;assert.equal(JSON.stringify(clean),before);
 assert.equal(request.settings.format,'3mf');
});

test('native export failure or stale assembly pose commits no settings, Undo or download',async()=>{
 for(const mode of ['failure','stale']){
  const E={docType:'assembly',assembly:assembly()},before=JSON.stringify(E.assembly);
  const h=handlers(E,async()=>{if(mode==='failure')throw Error('Invalid native leaf');E.assembly.components[1].transform.x=-5;return {bytes:new Uint8Array([1]),bodies:2};});
  assert.equal(await h.apply({quality:'fine'},'amf',E.assembly),false);assert.equal(h.undo,0);assert.equal(h.downloads.length,0);assert.equal(E.assembly.stlExportSettings,undefined);
  if(mode==='failure')assert.equal(JSON.stringify(E.assembly),before);
 }
});

test('document switch while assembly print job runs rejects its output without mutating the new part',async()=>{
 const E={docType:'assembly',assembly:assembly(),def:{name:'Part'}},target=E.assembly;
 const h=handlers(E,async()=>{E.docType='part';return {bytes:new Uint8Array([1]),bodies:2};});
 assert.equal(await h.apply({quality:'fine'},'stl',target),false);assert.equal(h.undo,0);assert.equal(h.downloads.length,0);assert.equal(target.stlExportSettings,undefined);assert.deepEqual(E.def,{name:'Part'});
});

test('assembly Print setup actual handler rejects small beds atomically and persists separate settings after valid Apply',async()=>{
 const E={docType:'assembly',assembly:assembly()},before=JSON.stringify(E.assembly);let form,undo=0;
 const requests=()=>[{id:'one',document:{features:[{id:'solid'}]},placement:{x:E.assembly.components[1].transform.x}}];
 const context={E,rejectFlexibleSpringPreview:()=>false,assemblyPrintRequests:requests,assemblyPrintInCadWorker:async()=>({bodies:2,orientations:{top:{widthMm:100,depthMm:40,heightMm:20},front:{widthMm:100,depthMm:20,heightMm:40},right:{widthMm:40,depthMm:20,heightMm:100}}}),flash:()=>{},el:()=>({}),openQuickForm:spec=>{form=spec;return null;},pushUndo:()=>undo++,cloneData:structuredClone};
 const open=new Function(...Object.keys(context),sourceFunctionText(source,'openPrintSetupForm')+';return openPrintSetupForm;')(...Object.values(context));
 await open();assert.match(form.hint,/2 exact visible components/);
 assert.equal(form.onApply({basePlane:'top',bedWidthMm:99,bedDepthMm:40,bedHeightMm:20}),false);assert.equal(undo,0);assert.equal(JSON.stringify(E.assembly),before);
 const settings={basePlane:'top',bedWidthMm:100,bedDepthMm:40,bedHeightMm:20};assert.equal(form.onApply(settings),true);assert.equal(undo,1);
 assert.deepEqual(JSON.parse(JSON.stringify(E.assembly)).printSetup,settings,'serialized saved assembly retains independent print setup');
 const clean=structuredClone(E.assembly);delete clean.printSetup;assert.equal(JSON.stringify(clean),before);
 await open();assert.equal(form.fields.find(x=>x.key==='bedWidthMm').value,100);
 E.assembly.components[1].transform.x=-7;assert.equal(form.onApply({...settings,bedWidthMm:200}),false);assert.equal(undo,1,'stale footprint cannot be committed');
});

test('print commands are available for nonempty assemblies and keep existing part availability',()=>{
 const E={docType:'assembly',assembly:{components:[{id:1}]},def:{parts:[]}};
 const catalog=buildCommandCatalog({t:x=>x,editor:E,activeParts:d=>d.parts,closedSketchProfile:()=>false});
 const commands=catalog.filter(c=>['printsetup','stlout','3mfout','amfout'].includes(c.id));assert.equal(commands.length,4);assert.ok(commands.every(c=>c.available()));
 E.assembly.components=[];assert.ok(commands.every(c=>!c.available()));E.docType='part';assert.ok(commands.every(c=>!c.available()));E.def.parts=[{id:1}];assert.ok(commands.every(c=>c.available()));
});
