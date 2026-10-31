import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const main=readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
const source=main.slice(main.indexOf('function maybeInit3D('),main.indexOf('\nconst resizeAll ='));

test('resize events during lazy 3D loading cannot overwrite the imported-plan overview with a second framing callback',async()=>{
  let resolveInit,ready=false,started=0,overviews=0,roomViews=0;
  const pending=new Promise(resolve=>{resolveInit=resolve;}),timers=[];
  const scope={window:{__home3dBooted:true},init3DQueued:false,blueprintOverviewPending:true,
    document:{getElementById:()=>({clientWidth:390,clientHeight:740})},
    has3D:()=>ready,setTimeout:callback=>timers.push(callback),setSize:()=>{},
    init3D:()=>{started++;return pending;},frameDollhouse:()=>overviews++,frameView:()=>roomViews++};
  runInNewContext(source,scope);
  scope.maybeInit3D();timers.shift()();
  for(let i=0;i<5;i++)scope.maybeInit3D();
  while(timers.length)timers.shift()();
  ready=true;resolveInit(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(started,1);assert.equal(overviews,1);assert.equal(roomViews,0);assert.equal(scope.init3DQueued,false);
});

test('a hidden 3D pane can still initialize after it becomes visible',async()=>{
  const pane={clientWidth:0,clientHeight:0},timers=[];let started=0;
  const scope={window:{__home3dBooted:true},init3DQueued:false,blueprintOverviewPending:false,document:{getElementById:()=>pane},
    has3D:()=>false,setTimeout:callback=>timers.push(callback),setSize:()=>{},frameDollhouse:()=>{},frameView:()=>{},
    init3D:()=>{started++;return Promise.resolve(true);}};
  runInNewContext(source,scope);scope.maybeInit3D();timers.shift()();
  assert.equal(started,0);pane.clientWidth=390;pane.clientHeight=740;
  scope.maybeInit3D();timers.shift()();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(started,1);assert.equal(scope.init3DQueued,false);
});

test('a renderer failure releases the initialization guard and can be retried',async()=>{
  const timers=[],errors=[];
  const scope={window:{__home3dBooted:true},init3DQueued:false,blueprintOverviewPending:true,console:{error:(...args)=>errors.push(args)},
    document:{getElementById:()=>({clientWidth:390,clientHeight:740})},has3D:()=>false,
    setTimeout:callback=>timers.push(callback),setSize:()=>{},frameDollhouse:()=>{},frameView:()=>{},
    init3D:()=>Promise.reject(new Error('GPU unavailable'))};
  runInNewContext(source,scope);scope.maybeInit3D();timers.shift()();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(errors.length,1);assert.equal(scope.init3DQueued,false);assert.equal(scope.blueprintOverviewPending,true);
});

test('import overview refits on fold/unfold until the user takes camera control',()=>{
  const start=main.indexOf('const resizeAll = throttle(() => {');
  const end=main.indexOf('\n/* The vertical-span',start);
  const resizeSource=main.slice(start,end).replace('const resizeAll =','var resizeAll =');
  let fits=0,sizes=0;
  const pane={clientWidth:344,clientHeight:780};
  const scope={blueprintOverviewActive:true,throttle:fn=>fn,maybeInit3D:()=>{},has3D:()=>true,
    document:{getElementById:()=>pane},setSize:()=>sizes++,frameDollhouse:()=>fits++,sizeCanvas:()=>{},render2D:()=>{}};
  runInNewContext(resizeSource,scope);scope.resizeAll();
  pane.clientWidth=720;scope.resizeAll();assert.equal(fits,2);assert.equal(sizes,2);
  scope.blueprintOverviewActive=false;scope.resizeAll();assert.equal(fits,2);assert.equal(sizes,3);
});

test('folding and unfolding preserve the active imported 3D view over stale preferences',()=>{
 const start=main.indexOf('function applyPhoneView('),end=main.indexOf('// React to folding/unfolding',start);
 let phone=false,current='max-view-3d',selected=[];
 const scope={VIEWMODE_KEY:'mobile',centerCanvas:{classList:{contains:name=>name===current}},
  isCompactPhoneViewport:()=>phone,sessionStorage:{getItem:()=> 'plan'},localStorage:{getItem:()=> 'plan'},setViewMode:mode=>selected.push(mode)};
 runInNewContext(main.slice(start,end),scope);
 scope.applyPhoneView(true);phone=true;scope.applyPhoneView(true);phone=false;scope.applyPhoneView(true);
 assert.deepEqual(selected,['3d','3d','3d']);
 current='split';phone=true;scope.applyPhoneView(true);assert.equal(selected.at(-1),'plan');
});
