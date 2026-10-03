import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {sceneToSvg,titleBlockBox,createSheetDoc,layoutViews,sheetFrame} from '../js/cad_sheet.js';
import {assemblyPartNumber,setDocumentProperty,documentDescription,documentProperty} from '../js/core/custom_properties.js';
import {generateBOM} from '../js/cad_interference.js';
import {createExplodedView,addExplodeStep,applyExplodedView,explodeLines} from '../js/cad_exploded_view.js';
import {flattenAssembly} from '../js/core/assembly_structure.js';

const source=fs.readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function element(tag){return {tag,children:[],style:{},events:{},value:'',appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},setAttribute(key,value){this[key]=value;},addEventListener(key,fn){this.events[key]=fn;},showModal(){this.open=true;},close(){this.open=false;},remove(){},focus(){this.focused=true;}};}
const el=(tag,_class,text)=>Object.assign(element(tag),{textContent:text});
const body={kind:'assembly',parts:[{id:'disc',kind:'box',x0:-3,x1:3,y0:-3,y1:3,z0:-1,z1:1}]};

test('multiline assembly notes export safely and reserve space beneath the isometric view',()=>{
  const scene=buildDrawingScene(body,{size:'Letter',views:['iso'],overallDimensions:false,notes:'REMOVE BURRS & SHARP EDGES\nCHECK <CLEARANCE> BEFORE USE'});
  const text=scene.items.filter(item=>item.type==='text');
  const heading=text.find(item=>item.text==='NOTES');
  assert.ok(heading);
  assert.ok(text.some(item=>item.text==='REMOVE BURRS & SHARP EDGES'));
  assert.ok(text.some(item=>item.text==='CHECK <CLEARANCE> BEFORE USE'));
  for(const view of scene.views)assert.ok(view.box.y+view.box.h<=heading.y);
  const svg=sceneToSvg(scene);
  assert.match(svg,/REMOVE BURRS &amp; SHARP EDGES/);
  assert.match(svg,/CHECK &lt;CLEARANCE&gt; BEFORE USE/);
});

test('long note lines wrap within the notes column and empty input adds no notes',()=>{
  const scene=buildDrawingScene(body,{size:'Letter',views:['iso'],notes:'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(12)});
  const notes=scene.items.filter(item=>item.type==='text'&&item.noteId==='sheet-user-notes');
  assert.ok(notes.length>2);
  const title=titleBlockBox({size:'Letter',orientation:'landscape'});
  for(const item of notes)assert.ok(item.x+item.text.length*item.size*.55<=title.x-8);
  const empty=buildDrawingScene(body,{views:['iso'],notes:'  \n  '});
  assert.ok(!empty.items.some(item=>item.type==='text'&&item.text==='NOTES'));
});

test('assembly drawing settings focus and persist multiline notes through the actual apply handler',()=>{
  const E={assembly:{name:'VALVE',drawingSettings:{notes:'OLD\nNOTE'}}},root=element('root');root.querySelector=()=>null;
  let undo=0,refresh=0;
  const fn=new Function('E','root','document','el','sheetRow','sheetSelect','SHEET_SIZES','pushUndo','setDocumentProperty','refreshAll','exportDrawingSvg','syncHead',sourceFunctionText(source,'showAssemblyDrawingSettings')+';return showAssemblyDrawingSettings;')
    (E,root,{createElement:element},el,(host,label,field)=>{field.label=label;host.appendChild(field);return field;},(_options,value)=>Object.assign(element('select'),{value}),{Letter:{}},()=>undo++,setDocumentProperty,()=>refresh++,()=>{},()=>{});
  fn(true);
  const dialog=root.children[0],notes=dialog.children.find(child=>child.tag==='textarea');
  assert.equal(notes.value,'OLD\nNOTE');assert.ok(notes.focused);
  notes.value='  REMOVE BURRS\nVERIFY FREE ROTATION  ';
  dialog.children.find(child=>child.textContent==='Apply drawing settings').onclick();
  assert.equal(E.assembly.drawingSettings.notes,'REMOVE BURRS\nVERIFY FREE ROTATION');
  assert.equal(JSON.parse(JSON.stringify(E.assembly)).drawingSettings.notes,E.assembly.drawingSettings.notes);
  assert.equal(undo,1);assert.equal(refresh,1);
});

test('component BOM fields update occurrence properties without touching the source geometry',()=>{
  const component={modelKey:'disc',def:{customProperties:{Description:'Old long source description'},parts:[{kind:'box'}]}},host=element('host');
  const original=JSON.stringify(component.def);let undo=0,refresh=0;
  const fn=new Function('el','documentDescription','assemblyPartNumber','pushUndo','setDocumentProperty','refreshSelection',sourceFunctionText(source,'assemblyBomProperties')+';return assemblyBomProperties;')(el,documentDescription,assemblyPartNumber,()=>undo++,setDocumentProperty,()=>refresh++);
  fn(host,component);
  const inputs=host.children.flatMap(row=>row.children).filter(child=>child.tag==='input');
  assert.equal(inputs[0].value,'Old long source description');
  inputs[0].value='DISC';inputs[0].events.change();inputs[1].value='VALVE-003';inputs[1].events.change();
  const bom=generateBOM({components:[component]});
  assert.equal(bom[0].description,'DISC');assert.equal(bom[0].partNumber,'VALVE-003');
  assert.equal(JSON.stringify(component.def),original);assert.equal(undo,2);assert.equal(refresh,2);
});

test('component BOM inspector shows book numbers from fresh browser-exported source models',()=>{
  const render=new Function('el','documentDescription','assemblyPartNumber','pushUndo','setDocumentProperty','refreshSelection',sourceFunctionText(source,'assemblyBomProperties')+';return assemblyBomProperties;')
    (el,documentDescription,assemblyPartNumber,()=>{},setDocumentProperty,()=>{});
  for(const [file,expected] of [['DP01-base','6'],['DP02-bracket','5'],['DP03-brace','2']]){
    const def=JSON.parse(fs.readFileSync(new URL(`../artifacts/planchard/${file}-browser-2026-10-03.mforge`,import.meta.url),'utf8')).mainModel;
    const host=element('host');render(host,{def});
    const inputs=host.children.flatMap(row=>row.children).filter(child=>child.tag==='input');
    assert.equal(inputs[1].value,expected,file);
  }
});

test('viewport and drawing leaders start at assembled world bounds and apply explode offset once',()=>{
  const assembly={components:[{id:1,def:{parts:[]},transform:{x:10,y:20,z:30}}]};
  const view=createExplodedView(assembly,'Sheet');addExplodeStep(view,[1],{x:0,y:15,z:0});applyExplodedView(assembly,view.id);
  const getLines=new Function('E','flattenAssembly','explodeLines','occurrenceWorldBounds',sourceFunctionText(source,'assemblyExplodeLines')+';return assemblyExplodeLines;')
    ({assembly},flattenAssembly,explodeLines,(_component,placement)=>({x0:placement.origin.x-2,x1:placement.origin.x+2,y0:placement.origin.y-3,y1:placement.origin.y+3,z0:placement.origin.z-1,z1:placement.origin.z+1}));
  assert.deepEqual(getLines(),[{id:1,from:{x:10,y:20,z:30},to:{x:10,y:35,z:30}}]);
  assembly.components[0].visible=false;assert.deepEqual(getLines(),[]);
});

test('single assembly isometric uses the upper-right paper beside BOM when the lower band is too short',()=>{
  const doc=createSheetDoc({size:'Letter',views:['iso'],scale:[1,1]});
  doc.assemblyLayout=true;doc.enforceFit=true;doc.bomRowCount=7;doc.notesBandHeight=42;
  const id=doc.views[0].id;
  const layout=layoutViews(doc,new Map([[id,{w:10,h:13}]]));
  const place=layout.placements.get(id),title=titleBlockBox(doc);
  assert.ok(place.x-place.w/2>=16+6+title.w+12);
  assert.ok(place.y-place.h/2>=14);
  assert.ok(place.y+place.h/2<title.y);
  assert.deepEqual(layout.sheetScale,[1,1]);
});

test('assembly drawing export refuses an explicit scale that cannot fit and Fit remains contained',()=>{
  const tall={kind:'assembly',parts:[{id:'lever',kind:'box',x0:0,x1:40,y0:0,y1:80,z0:0,z1:20}]};
  const settings={size:'Letter',views:['iso'],overallDimensions:false,notes:'VERIFY FREE ROTATION',requireFit:true,balloons:Array.from({length:7},(_,i)=>({item:i+1,name:'Part',qty:1}))};
  assert.throws(()=>buildDrawingScene(tall,{...settings,scale:[1,4]}),/does not fit.*Fit to sheet/);
  const fit=buildDrawingScene(tall,{...settings,scale:'fit'});
  const heading=fit.items.find(item=>item.type==='text'&&item.text==='NOTES');
  for(const view of fit.views)assert.ok(view.box.y+view.box.h<heading.y);
});

test('ANSI C exports a physical 22 by 17 inch sheet in both orientations',()=>{
  assert.deepEqual(sheetFrame({size:'ANSI_C',orientation:'landscape'}).paper,{w:558.8,h:431.8,label:'C (ANSI)'});
  assert.deepEqual(sheetFrame({size:'ANSI_C',orientation:'portrait'}).paper,{w:431.8,h:558.8,label:'C (ANSI)'});
  const svg=sceneToSvg(buildDrawingScene(body,{size:'ANSI_C',views:['iso']}));
  assert.match(svg,/width="558\.8mm"/);assert.match(svg,/height="431\.8mm"/);
});
