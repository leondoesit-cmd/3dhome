import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ensureAssemblyDrawingDoc} from '../js/core/assembly_drawing_settings.js';
import {buildSheetScene,sceneToSvg,SHEET_SIZES} from '../js/cad_sheet.js';

const fixture=()=>({name:'FLASHLIGHT STUDY',components:[{id:'source-leaf'}],mates:[{id:'source-mate'}],explodedViews:[{id:'saved-seven-chains',steps:[{id:'original-chain'}]}],drawingSettings:{size:'Letter',units:'in',scale:[1,4],projection:'third',orientation:'landscape',draftingStandard:'ANSI',title:'FLASHLIGHT ASSEMBLY',number:'10-F123',company:'D&M ENGINEERING',revision:'A',bomScope:'partsOnly'}});

test('first native assembly sheet inherits legacy page/title settings without source or legacy mutation',()=>{
 const assembly=fixture(),source=JSON.stringify(assembly),doc=ensureAssemblyDrawingDoc(assembly);
 assert.equal(doc.size,'Letter');assert.equal(doc.units,'in');assert.equal(doc.scale,'1:4');assert.equal(doc.draftingStandard,'ANSI');assert.equal(doc.title.title,'FLASHLIGHT ASSEMBLY');assert.equal(doc.title.number,'10-F123');
 assert.deepEqual(doc.views.map(v=>v.dir),['front','top','right','iso']);
 assert.equal(JSON.stringify({...assembly,drawing:undefined}),source);
 const svg=sceneToSvg(buildSheetScene(doc,{model:assembly}));assert.match(svg,/279\.4mm/);assert.match(svg,/FLASHLIGHT ASSEMBLY/);assert.match(svg,/10-F123/);
 const cold=JSON.parse(JSON.stringify(assembly));assert.equal(sceneToSvg(buildSheetScene(ensureAssemblyDrawingDoc(cold),{model:cold})),svg);
});

test('existing owned drawing remains authoritative over later legacy settings and empty authored views',()=>{
 const assembly=fixture(),doc=ensureAssemblyDrawingDoc(assembly);
 doc.size='A2';doc.units='mm';doc.scale='1:2';doc.title.title='AUTHORED';doc.views=[];doc.notes=[{id:'note',x:40,y:60,text:'SOURCE NOTE'}];
 const before=JSON.stringify(doc);assembly.drawingSettings={size:'Letter',units:'in',scale:[1,4],title:'LEGACY CHANGED'};
 assert.equal(ensureAssemblyDrawingDoc(assembly),doc);assert.equal(JSON.stringify(doc),before);
});

test('invalid legacy settings use sheet defaults; finite ratio and independent metadata fields are supported',()=>{
 const assembly={name:'SOURCE',drawingSettings:{size:'bad',units:'bad',scale:[1,0],projection:'first',title:'',number:'',precision:3}};
 const doc=ensureAssemblyDrawingDoc(assembly);assert.equal(doc.size,'A3');assert.equal(doc.units,'mm');assert.equal(doc.scale,'fit');assert.equal(doc.projection,'first');assert.equal(doc.title.title,'SOURCE');assert.equal(doc.precision,3);
});

test('actual Assembly drawing dialog offers ordinary native entry after applying settings',()=>{
 const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),start=source.indexOf('function showAssemblyDrawingSettings('),end=source.indexOf('\nasync function exportThreeMfDocument',start);
 const assembly=fixture(),events=[],dialogs=[];
 const node=(tag,text='')=>({tag,text,style:{},children:[],value:'',setAttribute(){},append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},addEventListener(){},showModal(){},close(){events.push('close');},remove(){}});
 const context={E:{assembly},root:{querySelector:()=>null,appendChild:d=>dialogs.push(d)},document:{createElement:tag=>node(tag)},el:(tag,cls,text)=>node(tag,text),SHEET_SIZES,t:k=>k,
  sheetRow:(parent,label,field)=>{parent.appendChild(field);return field;},sheetSelect:(choices,value)=>Object.assign(node('select'),{value}),
  pushUndo:label=>events.push(label),setDocumentProperty:(obj,key,value)=>{obj.customProperties||={};obj.customProperties[key]=value;},syncHead(){},refreshAll(){},showDrawingPreview(){},exportDrawingSvg(){},
  setMode:mode=>{events.push(mode);ensureAssemblyDrawingDoc(assembly);}};
 vm.runInNewContext(source.slice(start,end)+'\nshowAssemblyDrawingSettings();',context);
 const button=dialogs[0].children.find(child=>child.text==='Open native Drawing');assert.ok(button);button.onclick();
 assert.deepEqual(events,['Assembly drawing settings','close','drawing']);assert.equal(assembly.drawing.size,'Letter');assert.equal(assembly.drawing.scale,'1:4');assert.equal(assembly.drawing.title.number,'10-F123');assert.equal(assembly.customProperties.Description,'FLASHLIGHT ASSEMBLY');
});

test('assembly visibility rules hide sketch controls while permitting the native Drawing canvas and mode tabs',()=>{
 const css=readFileSync(new URL('../css/styles.css',import.meta.url),'utf8');
 const assemblyRule=css.slice(css.indexOf('/* Nothing in an assembly is sketched'),css.indexOf('/* the history list scrolls itself'));
 assert.match(assemblyRule,/#modeler\.md-assembly:not\(\.md-isdrawing\) #mdCanvas,/);
 assert.match(assemblyRule,/#modeler\.md-assembly:not\(\.md-isdrawing\) \.md-hint,/);
 assert.match(assemblyRule,/#modeler\.md-assembly:not\(\.md-isdrawing\) \.md-3dhost/);
 assert.doesNotMatch(assemblyRule,/#modeler\.md-assembly #mdModes\s*\{/);
 assert.match(assemblyRule,/button\[data-mode="2d"\]/);assert.match(assemblyRule,/button\[data-mode="split"\]/);
 assert.doesNotMatch(assemblyRule,/button\[data-mode="drawing"\]/);
});
