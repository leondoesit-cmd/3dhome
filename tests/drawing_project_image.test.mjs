import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {drawingProjectImageUrl,importDrawingProjectImage} from '../js/core/drawing_project_image.js';
import {drawingImageAsset,DRAWING_IMAGE_MAX_BYTES} from '../js/core/drawing_image.js';
import {createSheetDoc,ensureSheetDoc,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController,DRAWING_TOOLS} from '../js/modeler_drawing.js';
import {sourceFunctionText} from './helpers/source_function.mjs';

const baseUrl='http://localhost:8765/',url=baseUrl+'scratch/planchard/original-logo-assets/Logo.jpg';
const jpeg=readFileSync(new URL('./fixtures/planchard-logo.jpg',import.meta.url));
const dataUrl='data:image/jpeg;base64,'+jpeg.toString('base64');
const response=(bytes=jpeg,mime='image/jpeg')=>new Response(bytes,{headers:{'content-type':mime}});
async function browserDecode(run,{fail=false}={}) {
  const before=[globalThis.FileReader,globalThis.Image];
  globalThis.FileReader=class {async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
  globalThis.Image=class {set src(value){if(fail){queueMicrotask(()=>this.onerror());return;}const d=drawingImageAsset(value);this.naturalWidth=d.width;this.naturalHeight=d.height;queueMicrotask(()=>this.onload());}};
  try{return await run();}finally{[globalThis.FileReader,globalThis.Image]=before;}
}

test('ordinary project-image importer embeds exact original JPEG bytes with bounded same-origin GET',async()=>{
  await browserDecode(async()=>{
    let request;const asset=await importDrawingProjectImage(url,{baseUrl,fetchImage:async(...args)=>{request=args;return response();}});
    assert.equal(asset.dataUrl,dataUrl);assert.equal(asset.name,'Logo.jpg');assert.deepEqual(Buffer.from(asset.dataUrl.split(',')[1],'base64'),jpeg);
    assert.equal(drawingImageAsset(asset.dataUrl).bytes,12144);
    assert.deepEqual(request,[url,{method:'GET',mode:'same-origin',credentials:'omit',redirect:'error'}]);
    assert.equal(drawingProjectImageUrl('/scratch/planchard/original-logo-assets/Logo.jpg',baseUrl).href,url);
  });
});

test('URL, redirects, MIME, streamed/header size, magic and dimensions fail before authoring',async()=>{
  let fetched=0;const options={baseUrl,fetchImage:async()=>{fetched++;return response();}};
  for(const bad of ['', 'file:///C:/Logo.jpg','data:image/png;base64,AA==','blob:http://localhost:8765/x','https://elsewhere.test/logo.png','http://localhost:8766/logo.png',
    'http://user:pass@localhost:8765/logo.jpg','/api/logo.jpg','/api%2Flogo.jpg','/logo.svg','/logo.jpg?proxy=1','/logo.jpg#fragment'])
    await assert.rejects(importDrawingProjectImage(bad,options));
  assert.equal(fetched,0);
  await assert.rejects(importDrawingProjectImage(url,{...options,fetchImage:async()=>({ok:true,redirected:true})}),/redirect/);
  await assert.rejects(importDrawingProjectImage(url,{...options,fetchImage:async()=>({ok:true,url:baseUrl+'other.jpg'})}),/redirect/);
  await assert.rejects(importDrawingProjectImage(url,{...options,fetchImage:async()=>response(jpeg,'text/html')}),/PNG\/JPEG/);
  const large=new Response(jpeg,{headers:{'content-type':'image/jpeg','content-length':String(DRAWING_IMAGE_MAX_BYTES+1)}});
  await assert.rejects(importDrawingProjectImage(url,{...options,fetchImage:async()=>large}),/2 MiB/);
  let canceled=false;const huge=new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(DRAWING_IMAGE_MAX_BYTES+1));},cancel(){canceled=true;}}),{headers:{'content-type':'image/jpeg'}});
  await assert.rejects(importDrawingProjectImage(url,{...options,fetchImage:async()=>huge}),/2 MiB/);assert.equal(canceled,true);
  await browserDecode(async()=>{
    await assert.rejects(importDrawingProjectImage(url,{...options,fetchImage:async()=>response(Buffer.from('bad'))}),/JPEG/);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr5sAAAAASUVORK5CYII=','base64');png.writeUInt32BE(5000,16);
    await assert.rejects(importDrawingProjectImage(baseUrl+'huge.png',{...options,fetchImage:async()=>response(png,'image/png')}),/dimensions/);
  });
  await browserDecode(()=>assert.rejects(importDrawingProjectImage(url,options),/decoded/),{fail:true});
});

test('ordinary project-image drawing path shares native pixel persistence, normalized Undo, cancel/error/stale guards',async()=>{
  await browserDecode(async()=>{
    const def={name:'Project logo drawing',drawing:createSheetDoc({views:[]})},snapshots=[],messages=[];let controller,choice='valid',answer={x:10,y:20,w:40,h:15},token=1;
    const host={doc:()=>ensureSheetDoc(def),bodies:()=>[],bodiesToken:()=>token,historyToken:()=>snapshots.length,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,
      chooseImage:async()=>{throw new Error('Local upload must remain separate');},chooseProjectImage:async()=>choice==='cancel'?null:importDrawingProjectImage(choice==='valid'?url:choice,{baseUrl,fetchImage:async()=>response()}),
      promptFields:async()=>answer,flash:m=>messages.push(m),refresh(){},markDirty:()=>controller.invalidate(),
      pushUndo:()=>{snapshots.push(JSON.stringify(def.drawing));def.drawing=JSON.parse(JSON.stringify(def.drawing));ensureSheetDoc(def);}};
    controller=createDrawingController(host);controller.state.zoom=1;const click=()=>{controller.setTool('insertprojectimage');controller.pointerDown({button:0},15,25);};const settled=()=>new Promise(r=>setTimeout(r,0));
    click();await settled();assert.equal(def.drawing.images.length,1,messages.join(';'));assert.equal(def.drawing.images[0].dataUrl,dataUrl);assert.equal(snapshots.length,1);
    const svg=controller.svg(),cold=JSON.parse(JSON.stringify(def));ensureSheetDoc(cold);assert.equal(sceneToSvg(buildSheetScene(cold.drawing)),svg);assert.ok(svg.includes(dataUrl));
    choice='cancel';click();await settled();assert.equal(snapshots.length,1);
    choice='file:///C:/Logo.jpg';click();await settled();assert.equal(snapshots.length,1);assert.equal(def.drawing.images.length,1);
    choice='valid';host.promptFields=()=>new Promise(resolve=>{host.finish=resolve;});click();await settled();token++;host.finish(answer);await settled();assert.equal(snapshots.length,1);assert.match(messages.at(-1),/changed/);
    assert.equal(def.drawing.images.length,1);assert.deepEqual(def.drawing.images[0],cold.drawing.images[0]);
  });
});

test('actual ordinary project URL form cancels without fetching and toolbar dispatch is visible',async()=>{
  const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8'),start=source.indexOf('async function chooseDrawingProjectImage()'),end=source.indexOf('function chooseDrawingImage()',start);
  let fields,calls=0;const context={sheetForm:async(title,f)=>{assert.equal(title,'Insert project image');fields=f;return null;},importDrawingProjectImage:async()=>{calls++;}};
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);assert.equal(await context.chooseDrawingProjectImage(),null);assert.equal(calls,0);assert.equal(fields[0].label,'Project image URL');
  context.sheetForm=async()=>({url});context.importDrawingProjectImage=async value=>{assert.equal(value,url);calls++;return {dataUrl};};assert.equal((await context.chooseDrawingProjectImage()).dataUrl,dataUrl);assert.equal(calls,1);
  assert.ok(DRAWING_TOOLS.includes('insertprojectimage'));assert.ok(source.includes('data-drawing-tool="insertprojectimage"'));assert.ok(source.includes('chooseProjectImage: chooseDrawingProjectImage'));
});

test('actual URL and XYWH QuickForm close lifecycle inserts native image without self-invalidating source guards',async()=>{
  await browserDecode(async()=>{
    const source=readFileSync(new URL('../js/modeler.js',import.meta.url),'utf8');
    const element=()=>({children:[],hidden:false,value:'',classList:{add(){},remove(){},contains:()=>false},appendChild(n){this.children.push(n);},setAttribute(){},focus(){},select(){}});
    const panel=element(),buttons=[],fields=[],def={name:'Native source',drawing:createSheetDoc({views:[]})},messages=[];let token=1,controller,previews=0;
    const context={E:{authoring:{},docType:'part',mode:'drawing',def},root:{querySelector:()=>panel,classList:{add(){},remove(){}}},motionPlaybackCancel:null,
      el:element,featureField:(body,field,value)=>{const input={value,focus(){},select(){}};fields.push({field,input});return input;},
      t:x=>x,namedButton:x=>x,btn:(label,callback,cls)=>{const b=element();b.callback=callback;b.cls=cls;buttons.push(b);return b;},
      requestAnimationFrame:fn=>fn(),syncCommandManager(){},document:{body:element()},validateFeatureInputs:()=>true,
      clearFeaturePreview(){},clearLiveDownstream(){},drawSketch(){},syncSheetPanel(){},
      updatePreview(){token++;previews++;},refreshAll(){token++;},
      importDrawingProjectImage:value=>importDrawingProjectImage(value,{baseUrl,fetchImage:async()=>response()})};
    vm.createContext(context);
    for(const name of ['closeFeaturePanel','openQuickForm','sheetForm','chooseDrawingProjectImage'])vm.runInContext(sourceFunctionText(source,name),context);
    let undos=0;const host={doc:()=>ensureSheetDoc(def),bodies:()=>[],bodiesToken:()=>token,historyToken:()=>undos,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,
      chooseProjectImage:()=>context.chooseDrawingProjectImage(),promptFields:(...args)=>context.sheetForm(...args),flash:m=>messages.push(m),refresh(){},markDirty(){},
      pushUndo(){undos++;def.drawing=JSON.parse(JSON.stringify(def.drawing));}};
    controller=createDrawingController(host);controller.state.zoom=1;
    const latestApply=()=>buttons.filter(b=>b.cls==='md-quick-apply').at(-1).callback();
    const tick=()=>new Promise(r=>setTimeout(r,0));
    const click=()=>{controller.setTool('insertprojectimage');controller.pointerDown({button:0},15,25);};
    click();fields.at(-1).input.value=url;await latestApply();await tick();
    assert.equal(token,1,'URL form close does not replace unchanged native drawing bodies');assert.equal(previews,0);
    const geometry=fields.slice(-4);assert.deepEqual(geometry.map(f=>f.field.key),['x','y','w','h']);
    for(const f of geometry)f.input.value=String({x:210,y:145,w:32,h:12}[f.field.key]);
    await latestApply();await tick();assert.equal(undos,1,messages.join(';'));assert.equal(def.drawing.images.length,1);
    assert.equal(def.drawing.images[0].dataUrl,dataUrl);assert.equal(def.drawing.images[0].x,210);assert.equal(def.drawing.images[0].h,12);
    const frozen=JSON.stringify(def.drawing.images);
    click();await buttons.filter(b=>b.cls==='md-quick-cancel').at(-1).callback();await tick();assert.equal(undos,1);
    click();fields.at(-1).input.value=url;await latestApply();await tick();token++;
    await latestApply();await tick();assert.equal(undos,1);assert.equal(JSON.stringify(def.drawing.images),frozen);assert.match(messages.at(-1),/changed/);
  });
});
