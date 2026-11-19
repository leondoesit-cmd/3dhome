import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceFunctionText } from "./helpers/source_function.mjs";
import { placeLabels } from "../js/drawing_sheet/placement.js";
import { placeLabels as linear } from "./fixtures/placement_linear.mjs";
import { registerHooks } from "node:module";
import { sheetBounds } from "../js/drawing_sheet.js";
import { draftingStandard } from "../js/drafting_standards.js";
import { proPlanParts } from "../js/drawing_sheet/pro_plan.js";
import { labelsSVG } from "../js/drawing_sheet/labels.js";
import { moveSurveyWalker, navigationFloorTransition } from "../js/navigation_geometry.js";
import { layoutCab, makeSpec, SEC } from "../js/cabinet.js";
import { exportSpatialProject } from "../js/core/spatial_project.js";

// Evaluate the actual browser functions with deterministic DOM/GPU boundaries.
function harness(file, names, deps, locals = "", result = names.join(",")) {
  const src = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const body = names.filter(n => src.includes("function " + n + "(")).map(n => sourceFunctionText(src, n)).join("\n");
  return Function(...Object.keys(deps), locals + "\n" + body + "\nreturn {" + result + "};")(...Object.values(deps));
}

test("hidden inspector defers selection work until its canvas appears", () => {
  let expanded = false, tabOpen = true, desktop = false, resized, toggle;
  const calls = [], frames = [], S = {sel: {kind:"item",ref:{id:1}}};
  const host = {prepend(button){toggle=button;},addEventListener(){},classList:{
    contains:()=>expanded,toggle:()=>expanded=!expanded,remove(){}
  }};
  const canvas = {getClientRects:()=>tabOpen && (desktop || expanded) ? [{}] : []};
  const elements = {inspectorPreview:host, inspectorPreviewCanvas:canvas};
  const observed = [];
  const api = harness("inspector_preview.js", ["ensureElements","canvasDisplayed","canvasResized","syncInspectorPreview","keyForSelection","scheduleRender"], {
    S, document:{getElementById:id=>elements[id],createElement:()=>({setAttribute(){}})},
    ResizeObserver:class {constructor(fn){resized=fn;} observe(el){observed.push(el);}},
    window:{addEventListener(){}}, onLangChange(){}, t:key=>key, onPointerDown(){},onPointerMove(){},onPointerUp(){},
    threeHere:()=>(calls.push("three"),true),ensureRenderer:()=>calls.push("renderer"),
    fitSelection:reset=>calls.push(reset),paint(){},requestAnimationFrame:fn=>{calls.push("render");frames.push(fn); }
  }, "let host,canvas,stateEl,resetBtn,roofBtn,resizeObserver,visible,syncPending,resetPending,selectionKey,overlayDirty,renderQueued,SUPPORTED={item:true};","syncInspectorPreview");
  api.syncInspectorPreview();
  S.sel.ref.id++;
  api.syncInspectorPreview();
  assert.deepEqual(calls,[]);
  toggle.onclick();
  assert.deepEqual(calls,["three","renderer",true,"render"]);
  assert.ok(observed.includes(canvas));
  for (const reason of ["tab","breakpoint"]) {
    frames.shift()();
    calls.length = 0;
    if (reason === "tab") tabOpen = false;
    else toggle.onclick();
    S.sel.ref.id++;
    api.syncInspectorPreview();
    assert.deepEqual(calls,[]);
    if (reason === "tab") tabOpen = true;
    else desktop = true;
    resized();
    assert.deepEqual(calls,["three","renderer",true,"render"]);
  }
});

test("dense drawing placements and SVG match linear search with fewer obstacle visits", async () => {
  // Load the same sheet renderer with only its placement import changed.
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === "./placement.js" && context.parentURL.endsWith("pro_plan.js?linear"))
      return { url:new URL("./fixtures/placement_linear.mjs",import.meta.url).href, shortCircuit:true };
    return next(specifier,context);
  }});
  let legacySheet;
  try { legacySheet = (await import("../js/drawing_sheet/pro_plan.js?linear")).proPlanParts; }
  finally { hook.deregister(); }
  for (let seed of [71, 913, 1842]) {
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2**32;
    const coord = () => Math.floor(rand() * 400) - 200;
    const point = () => ({x: coord(), y: coord()});
    const obs = Array.from({length: 400}, (_, i) => {
      const {x,y} = point();
      return i % 2 ? {x0:x, y0:y, x1:x+12, y1:y+8} : {poly:[{x,y},{x:x+20,y},{x,y:y+18}]};
    });
    obs.push(obs[0], {x0:-1e7,y0:0,x1:1e7,y1:5});
    const labels = Array.from({length: 75}, (_, id) => ({id, ...point(), w:18,h:8, maxShift:18,
      priority:id%3, anchors:[point(),point()], tag:{s:String(id)}}));
    const options = {gap:2, segments:Array.from({length:40}, () => ({a:point(),b:point()}))};
    function run(place) {
      let visits = 0;
      const obstacles = structuredClone(obs).map(ob => new Proxy(ob, {get(target, key) {
        if (key === "poly" && !target.poly) visits++;
        return target[key];
      }}));
      return {placed:place(labels, obstacles, options), visits};
    }
    const old = run(linear), cur = run(placeLabels), ctx = {mm:x=>x, sizes:{tag:2}};
    assert.deepEqual(cur.placed, old.placed);
    assert.equal(labelsSVG(labels,cur.placed,ctx), labelsSVG(labels,old.placed,ctx));
    assert.ok(cur.visits < old.visits / 2, cur.visits + " vs " + old.visits);
    const rect = (x,z,w,d) => [{x,z},{x:x+w,z},{x:x+w,z:z+d},{x,z:z+d}];
    const snap = {wallPolys:[rect(0,0,600,12),rect(0,400,600,12)],
      openings:[], rooms:[{key:"room",name:"Kitchen",points:rect(0,12,600,388),area:23,cx:300,cz:200}],
      items:Array.from({length:45}, (_,id)=>({id,type:"sink",w:40,d:50,x:300+coord(),z:200+coord(),rot:coord()}))};
    const optionsSVG = {bounds:sheetBounds(snap,5), standard:draftingStandard("il")};
    const rendered = proPlanParts(snap,optionsSVG), expected = legacySheet(snap,optionsSVG);
    assert.deepEqual(rendered.placed,expected.placed);
    assert.equal(rendered.svg,expected.svg);
  }
});

test("one walking movement scans inactive storey items once and sees edits next tick", () => {
  let reads = 0;
  const stairs = {id:1,type:"stairs",w:120,d:300,h:120,steps:12,x:0,z:0};
  const scene = {get items() { reads++; return [stairs]; }};
  const state = {items:[],workspace:{activeFloor:"G",floors:[{id:"G",elevation:0},{id:"B",elevation:-120,scene}]}};
  const start = {x:300,y:0,z:20}, profile = {radius:10,stepHeight:20};
  assert.deepEqual(moveSurveyWalker(state,start,40,0,profile), {...start,x:340,hit:false});
  assert.equal(reads,1);
  assert.equal(navigationFloorTransition(state,{x:0,z:150},profile)?.floorId,"B");
  stairs.x = 400;
  assert.equal(navigationFloorTransition(state,{x:0,z:150},profile),null);
});

test("serialization borrows spatial data only during stringify and snapshots the floor", () => {
  const S = {items:[{id:"it", nested:[1]}],workspace:{activeFloor:"a",floors:[{id:"a"}]}};
  const modes = [];
  const api = harness("ui.js", ["serialize","sceneObject"], {S,CLEAR_RULE:"v",exportSpatialProject(state,opts) {
    modes.push(opts?.detached !== false); return exportSpatialProject(state,opts);
  }, ensureSmartHome:()=>({}), snapshotSmart:()=>({}), usedCustomModels:()=>[], exportParametricProject:()=>({})});
  const retained = api.sceneObject(true), expected = JSON.stringify(retained);
  assert.equal(api.serialize(),expected);
  assert.deepEqual(modes,[true,false]);
  S.items[0].nested.push(2);
  assert.deepEqual(retained.spatial.instances[0].nested,[1]);
  assert.deepEqual(S.workspace.floors[0].scene.spatial.instances[0].nested,[1]);
});

test("storey teardown disposes every baked buffer once and leaves catalogue resources alone", () => {
  const released = [];
  const {releaseItemLights} = harness("view3d/wall_build.js", ["releaseItemLights"], {
    releaseLight(light) { released.push(light); light.parent.remove(light); }
  });
  const {disposeStorey} = harness("view3d/floor_stack.js", ["disposeStorey"], {releaseItemLights});
  class Mesh {
    constructor(geometry,material) {
      Object.assign(this,{geometry,material,isMesh:true,userData:{},layers:{mask:1}});
    }
  }
  const baked = [];
  const {mergeItemMeshes} = harness("view3d/item_merge.js",["mergeItemMeshes"],{
    meshKey:mesh=>mesh.geometry.key, sameMaterial:(a,b)=>a===b,
    mepBakeGeometries:()=>{const buffer=resource(); baked.push(buffer);return buffer;}
  });
  const resource = key => ({key,count:0,dispose(){this.count++;}});
  const material = resource(), shared = resource(null);
  const sources = [0,0,1,1].map(resource);
  const group = {children:[...sources,shared,shared].map(g=>new Mesh(g,material)),
    add(mesh){this.children.push(mesh);},remove(mesh){this.children.splice(this.children.indexOf(mesh),1);},
    traverse(fn){this.children.forEach(fn);}};
  assert.equal(mergeItemMeshes(group,{Mesh}),2);
  const before = sources.map(buffer=>buffer.count);
  const light = {isLight:true, userData:{pooledLight:true}, parent:group};
  group.add(light);
  disposeStorey(group);
  assert.deepEqual(released,[light]);
  assert.deepEqual(baked.map(buffer=>buffer.count),[1,1]);
  assert.deepEqual(sources.map(buffer=>buffer.count),before);
  assert.deepEqual([shared.count,material.count],[0,0]);
});

test("modern MEP skips connectivity and legacy and partial systems retain assignments", () => {
  for (const sys of ["power","water"]) for (const assigned of [0,1,2]) {
    let searches = 0;
    const {migrateMEPTopology} = harness("mep/topology.js", ["migrateMEPTopology"], {
      nodeKindDef:(s,k)=>({hub:k==="hub"}), nodePos:n=>n, nodeTouchesRun:()=>{searches++;return true;},
      runsTouch:()=>true, MEP_TOUCH:1
    });
    const model = {nodes:[{id:10,k:"hub",sys},...[1,2].map(id=>({id,sys,...(id<=assigned?{sourceId:77}:{})}))],
      runs:[{id:20,sys}],circuits:[],branches:[]};
    const expected = structuredClone(model), missing = expected.nodes.slice(assigned+1);
    if (missing.length) {
      const power = sys === "power", key = power ? "circuitId":"branchId", id = "legacy-"+(power?"circuit":"branch")+"-10";
      const ids = missing.map(n=>n.id);
      if (power) expected.circuits.push({id,number:1,kind:"legacy",panelId:10,deviceIds:ids,estimatedLoadW:0,inferred:true});
      else expected.branches.push({id,sys,kind:"legacy",sourceId:10,deviceIds:ids,inferred:true});
      missing.forEach(n=>Object.assign(n,{sourceId:10,[key]:id},power?{}:{branchIds:[id]}));
      expected.runs[0][key]=id;
    }
    assert.deepEqual(migrateMEPTopology(model),expected);
    assert.equal(searches>0,assigned<2);
  }
});

test("camera frames reuse the front layout and queued edits take precedence", () => {
  const frames = [], commands = [];
  let layouts = 0;
  const cx = new Proxy({}, {
    get(target,key) {
      if (key === "measureText") return text => ({width: String(text).length * 7});
      return (...args) => commands.push([key,...args]);
    },
    set(target,key,value) { commands.push([key,value]); return true; }
  });
  const it = {type:"cabsys",w:120,h:200,d:60,x:0,z:0,rot:0,cab:makeSpec("w_classic",120,200,60)};
  const E = {open:true,axis:"front",vw:500,vh:400,it,cx};
  const {draw,queueDraw,hit,pan} = harness("ui_cabinet_view.js",
    ["draw","queueDraw","hit","drawSecDetail","dimTick","dimTickV"], {
      E,SEC,requestAnimationFrame:f=>frames.push(f), hintPad:x=>x, css:(name,fallback)=>fallback,
      dimLen:String,secLabel:String,legibleInk:()=>"#111",layoutCab:it=>(layouts++,layoutCab(it))
    }, "let viewZoom=1, viewPanX=0, viewPanY=0;", "draw,queueDraw,hit,pan:()=>{viewZoom=1.25;viewPanX=8;viewPanY=-6}");
  draw();
  const first = E.view.L;
  pan();
  commands.length = 0;
  queueDraw(true); queueDraw(true);
  frames.shift()();
  assert.equal(layouts,1);
  assert.equal(E.view.L,first);
  const replay = commands.splice(0);
  const hits = () => [20,50,75,150].map(y => hit({x:5,y}));
  const expectedHits = hits();
  draw();
  assert.deepEqual(commands,replay);
  assert.deepEqual(hits(),expectedHits);
  for (const order of [[true,false],[false,true]]) {
    E.it.w++;
    order.forEach(queueDraw);
    frames.shift()();
    assert.equal(E.view.L.w,E.it.w);
  }
  assert.equal(layouts,4);
});


test("remote avatars sleep at the always-running gait fixed point and wake on pose", () => {
  const handlers = {}, frames = [], limbNames = ["leftLeg","rightLeg","leftArm","rightArm"];
  const p = {cur:{x:0,z:0,yaw:0},lastMove:0,phase:1,body:{userData:{}},
    group:{position:{set(x,y,z){Object.assign(this,{x,y,z});}},rotation:{}}};
  for (const name of limbNames) p.body.userData[name] = {rotation:{x:0}};
  const deps = {players:{p},net:{on:(name,fn)=>handlers[name]=fn},window:{addEventListener(){}},
    document:{hidden:false},ensurePlayer:()=>p,requestRender(){},requestAnimationFrame:fn=>frames.push(fn)};
  const {initPlayers} = harness("players.js",["tick","wake","animateGait","initPlayers"],deps,"let rafOn=false;","initPlayers");
  initPlayers();
  const pose = (x,z,yaw) => handlers.pose({from:"p",pose:{x,z,yaw}});
  pose(0,0,0); pose(50,100,3.4);
  const cur = {x:0,z:0,yaw:0}, limbs = [0,0,0,0];
  let lastMove = 0;
  for (let i=0;i<1700;i++) {
    const t = 1000+i*16, dx=50-cur.x, dz=100-cur.z;
    let dyaw=3.4-cur.yaw;
    while (dyaw>Math.PI) dyaw-=2*Math.PI;
    const moving=Math.hypot(dx,dz)>0.5;
    if (moving || Math.abs(dyaw)>0.01) {cur.x+=dx*.25;cur.z+=dz*.25;cur.yaw+=dyaw*.25;}
    if (moving) lastMove=t;
    const target = Math.sin(t*.012+1)*(t-lastMove<200?.55:0);
    [target,-target,-target*.7,target*.7].forEach((v,j)=>limbs[j]+=(v-limbs[j])*.4);
    frames.shift()?.(t);
    assert.deepEqual(p.cur,cur);
    assert.deepEqual(limbNames.map(n=>p.body.userData[n].rotation.x),limbs);
  }
  assert.equal(frames.length,0);
  pose(51,100,3.4);
  assert.equal(frames.length,1);
  handlers.pose({from:"p",pose:null});
  frames.shift()(30000);
  assert.equal(frames.length,0);
});
