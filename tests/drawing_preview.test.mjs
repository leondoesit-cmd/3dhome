import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceFunctionText} from './helpers/source_function.mjs';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {sceneToSvg} from '../js/cad_sheet.js';

const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
function node(tag,text='') {return {tag,textContent:text,style:{},children:[],events:{},appendChild(x){this.children.push(x);},append(...x){this.children.push(...x);},setAttribute(k,v){this[k]=v;},querySelector:()=>null,addEventListener(k,fn){this.events[k]=fn;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();},remove(){this.removed=true;},click(){this.clicked=true;}};}
const compile=(name,context)=>Function(...Object.keys(context),'return ('+sourceFunctionText(source,name)+')')(...Object.values(context));

test('preview displays and downloads the same sheet SVG as native assembly export',async()=>{
  const E={docType:'assembly',assembly:{name:'Fixture assembly',drawingSettings:{size:'Letter',units:'mm',scale:'fit',notes:'VERIFY ROTATION',mass:'3.811 kg'}}};
  const sheet={def:{kind:'assembly',parts:[{kind:'box',x0:0,x1:5,y0:0,y1:8,z0:0,z1:3}]},balloons:[{item:1,name:'FIXTURE',qty:3}],targets:[]};
  const content=compile('drawingSvgContent',{E,assemblyDrawingDocument:()=>sheet,buildDrawingScene,sceneToSvg,assemblyExplodeLines:()=>[],t:x=>x});
  const expected=content();assert.match(expected,/VERIFY ROTATION/);assert.match(expected,/FIXTURE/);assert.match(expected,/3.811 kg/);
  const root=node('root'),links=[],blobs=[],revoked=[],failures=[];
  const context={E,root,document:{createElement:tag=>{const x=node(tag);if(tag==='a')links.push(x);return x;}},
    el:(tag,_cls,text)=>node(tag,text),rejectFlexibleSpringPreview:()=>false,drawingSvgContent:content,
    drawingSvgFilename:compile('drawingSvgFilename',{E}),Blob,URL:{createObjectURL:blob=>{blobs.push(blob);return 'blob:sheet'+blobs.length;},revokeObjectURL:url=>revoked.push(url)},flash:x=>failures.push(x),t:x=>x,setTimeout:()=>{}};
  const preview=compile('showDrawingPreview',context),output=compile('exportDrawingSvg',context);
  assert.equal(preview(),true);output();
  const dialog=root.children[0],view=dialog.children.find(x=>x.tag==='div'),download=dialog.children.find(x=>x.tag==='a');
  assert.equal(view.innerHTML,expected,'rendered preview is the same sheet, not a second renderer');
  assert.equal(await blobs[0].text(),expected);assert.equal(await blobs[1].text(),expected);
  assert.equal(download.download,links[0].download);assert.equal(download.download,'Fixture_assembly.svg');
  assert.equal(links[0].clicked,true);
  dialog.children.find(x=>x.textContent==='Close preview').onclick();
  assert.equal(dialog.removed,true);assert.deepEqual(revoked,['blob:sheet1']);
});

test('preview preserves the scale qualification gate and creates no modal or download on failure',()=>{
  const root=node('root'),messages=[];
  const preview=compile('showDrawingPreview',{root,rejectFlexibleSpringPreview:()=>false,
    drawingSvgContent:()=>{throw new Error('Drawing scale does not fit');},flash:(message)=>messages.push(message)});
  assert.equal(preview(),false);assert.deepEqual(root.children,[]);assert.deepEqual(messages,['Drawing scale does not fit']);
});

test('visible Preview drawing applies dialog settings before generating the preview',()=>{
  const E={assembly:{name:'Fixture',drawingSettings:{}}},root=node('root');let captured;
  const show=compile('showAssemblyDrawingSettings',{E,root,t:key=>key,document:{createElement:node},el:(tag,_cls,text)=>node(tag,text),
    sheetRow:(host,label,field)=>{field.label=label;host.appendChild(field);return field;},sheetSelect:(_choices,value)=>Object.assign(node('select'),{value}),SHEET_SIZES:{Letter:{}},pushUndo(){},setDocumentProperty(){},refreshAll(){},syncHead(){},
    showDrawingPreview:()=>{captured=structuredClone(E.assembly.drawingSettings);return true;}});
  show();const dialog=root.children[0];
  dialog.children.find(x=>x.label==='Sheet scale').value='1:4';
  dialog.children.find(x=>x.label==='Drawing notes').value='VERIFY ROTATION';
  dialog.children.find(x=>x.textContent==='Preview drawing').onclick();
  assert.deepEqual(captured.scale,[1,4]);assert.equal(captured.notes,'VERIFY ROTATION');assert.equal(dialog.open,false);
});
