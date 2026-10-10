import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {drawingImageAsset,drawingImageItem,decodeDrawingImage} from '../js/core/drawing_image.js';
import {createSheetDoc,ensureSheetDoc,buildSheetScene,sceneToSvg,sheetPaper} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {hasSaveableModelContent,drawingOnlyContentSummary} from '../js/core/model_save_policy.js';

const jpeg='data:image/jpeg;base64,'+readFileSync(new URL('./fixtures/planchard-logo.jpg',import.meta.url)).toString('base64');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr5sAAAAASUVORK5CYII=';
const record=(dataUrl=jpeg)=>({id:'logo',name:'Original Logo.jpg',dataUrl,x:10,y:20,w:40,h:15});

test('original supplied logo JPEG and PNG pixels persist in shared SVG with independent paper width/height',()=>{
  const asset=drawingImageAsset(jpeg);assert.equal(asset.bytes,12144);assert.ok(asset.width>0&&asset.height>0);
  assert.deepEqual(drawingImageAsset(png),{width:1,height:1,bytes:68,mime:'image/png'});
  const def={name:'Logo sheet',parts:[],sketches:[],features:[],drawing:createSheetDoc({views:[]})};def.drawing.images=[record(),{...record(png),id:'png',x:60,w:12,h:8}];
  ensureSheetDoc(def);const before=JSON.stringify(def),scene=buildSheetScene(def.drawing),svg=sceneToSvg(scene);
  assert.equal(scene.items.filter(i=>i.type==='image').length,2);assert.ok(svg.includes('preserveAspectRatio="none"'));assert.ok(svg.includes(jpeg));assert.ok(svg.includes(png));
  const cold=JSON.parse(before);ensureSheetDoc(cold);assert.equal(sceneToSvg(buildSheetScene(cold.drawing)),svg);assert.equal(JSON.stringify(def),before);
  assert.equal(hasSaveableModelContent(def),true);assert.deepEqual(drawingOnlyContentSummary(def),{annotations:2,notes:0});
});

test('external URLs, SVG payloads, wrong MIME, invalid raster header/pixels and off-paper geometry reject',()=>{
  for(const url of ['https://example.com/logo.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YmFk','data:image/jpeg;base64,'+Buffer.from('bad').toString('base64')])assert.throws(()=>drawingImageAsset(url));
  const bytes=Buffer.from(png.split(',')[1],'base64');bytes.writeUInt32BE(5000,16);assert.throws(()=>drawingImageAsset('data:image/png;base64,'+bytes.toString('base64')),/4096/);
  for(const change of [{x:-1},{w:0},{h:NaN},{x:400,w:50}])assert.throws(()=>drawingImageItem({...record(),...change},{w:420,h:297}));
  const doc=createSheetDoc({views:[]});doc.images=[{...record(),dataUrl:'https://example.com/logo.png'}];const scene=buildSheetScene(doc);
  assert.equal(scene.items.filter(i=>i.type==='image').length,0);assert.ok(scene.diagnostics.some(d=>d.code==='invalid-drawing-image'));assert.equal(hasSaveableModelContent({drawing:doc}),false);
});

test('ordinary image insertion/edit/removal survives normalizing history callback and cold SVG',async()=>{
  const def={drawing:createSheetDoc({views:[]})},snapshots=[],messages=[];let controller,answer={x:10,y:20,w:40,h:15},token=1;
  const host={doc:()=>ensureSheetDoc(def),bodies:()=>[],bodiesToken:()=>token,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,
    chooseImage:async()=>({dataUrl:jpeg,name:'Logo.jpg'}),promptFields:async()=>answer,flash:m=>messages.push(m),refresh(){},markDirty:()=>controller.invalidate(),
    pushUndo:()=>{snapshots.push(JSON.stringify(def.drawing));def.drawing=JSON.parse(JSON.stringify(def.drawing));ensureSheetDoc(def);}};
  controller=createDrawingController(host);controller.state.zoom=1;
  const click=(tool,x=15,y=25)=>{controller.setTool(tool);controller.pointerDown({button:0},x,y);};
  const settled=()=>new Promise(r=>setImmediate(r));
  click('insertimage');await settled();assert.equal(def.drawing.images.length,1,messages.join(';'));assert.equal(snapshots.length,1);
  answer={x:30,y:40,w:60,h:10};click('editimage');await settled();assert.equal(def.drawing.images[0].w,60);assert.equal(snapshots.length,2);
  const svg=controller.svg(),cold=JSON.parse(JSON.stringify(def));ensureSheetDoc(cold);assert.equal(sceneToSvg(buildSheetScene(cold.drawing)),svg);
  click('removeimage',35,45);assert.equal(def.drawing.images.length,0);assert.equal(snapshots.length,3);
  def.drawing=JSON.parse(snapshots[2]);controller.invalidate();assert.equal(controller.svg(),svg,'real Undo history restores image pixels and geometry');
  answer={x:0,y:0,w:999,h:10};click('editimage',35,45);await settled();assert.equal(snapshots.length,3);assert.equal(def.drawing.images[0].w,60);
  answer=null;click('insertimage');await settled();assert.equal(snapshots.length,3,'cancel leaves history untouched');
  host.promptFields=()=>new Promise(resolve=>{host.finish=resolve;});click('insertimage');await settled();token++;host.finish({x:0,y:0,w:20,h:10});await settled();
  assert.equal(snapshots.length,3);assert.match(messages.at(-1),/changed/);
  assert.ok(sheetPaper(def.drawing).w>60);
});

test('browser importer rejects decoded raster failure before creating an asset',async()=>{
  const previousReader=globalThis.FileReader,previousImage=globalThis.Image;
  try {
    globalThis.FileReader=class {readAsDataURL(){this.result=png;queueMicrotask(()=>this.onload());}};
    globalThis.Image=class {set src(_){queueMicrotask(()=>this.onerror());}};
    await assert.rejects(decodeDrawingImage({type:'image/png',size:68,name:'bad.png'}),/decoded/);
    await assert.rejects(decodeDrawingImage({type:'image/svg+xml',size:20}),/PNG\/JPEG/);
    globalThis.Image=class {naturalWidth=1;naturalHeight=1;set src(_){queueMicrotask(()=>this.onload());}};
    const asset=await decodeDrawingImage({type:'image/png',size:68,name:'pixel.png'});assert.equal(asset.dataUrl,png);
  } finally {globalThis.FileReader=previousReader;globalThis.Image=previousImage;}
});
