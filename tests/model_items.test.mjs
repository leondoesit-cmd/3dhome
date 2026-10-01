import test from "node:test";
import assert from "node:assert/strict";
import { createTopologyIndex, measureDim, resolveDim } from "../js/cad_sheet.js";
import { viewBasis } from "../js/core/hidden_line.js";
import { planModelItems } from "../js/core/model_items.js";

const edge = (id, descriptor) => ({ persistentId:id, kind:"edge", descriptor });
const face = (id, y) => ({ persistentId:id, kind:"face", descriptor:{ origin:{x:0,y,z:0} } });
const circle = (id, x, z, radius, axis={x:0,y:1,z:0}) => edge(id,{
  curve:"circle",origin:{x,y:10,z},radius,axis,
});
const geometry = [
  face("base:face:start",0), face("base:face:end",10.414),
  edge("base:edge:profile:line-x:start",{curve:"line",endpoints:[{x:-3.429,y:0,z:-3.429},{x:3.429,y:0,z:-3.429}]}),
  edge("base:edge:profile:line-z:start",{curve:"line",endpoints:[{x:3.429,y:0,z:-3.429},{x:3.429,y:0,z:3.429}]}),
  circle("terminal:tool:edge:profile:61:start",0,0,.635),
  circle("terminal:tool:edge:profile:64:start",-1.796051,-1.796051,.635),
  circle("round-large:edge:generated:circle:1",-2.159,-2.159,1.27),
  circle("round-small:edge:generated:circle:1",-3.175,-2.159,.127,{x:0,y:0,z:1}),
];
const model = {
  features:[
    {id:"base",type:"extrude",params:{operation:"add",sketchId:"base-sk",depth:10.414}},
    {id:"terminal",type:"extrude",params:{operation:"add",sketchId:"term-sk",depth:1.524}},
    {id:"round-large",type:"fillet",params:{radius:1.27}},
    {id:"round-small",type:"fillet",params:{radius:.127}},
  ],
  sketches:[
    {id:"base-sk",entities:[{id:"line-x",type:"line"},{id:"line-z",type:"line"}],constraints:[
      {id:"width",type:"distance",entity:"line-x",value:6.858},
      {id:"depth",type:"distance",entity:"line-z",value:6.858},
    ]},
    {id:"term-sk",entities:[{id:61,type:"circle",c:62},{id:64,type:"circle",c:65}],constraints:[
      {id:"diam",type:"diameter",entity:61,value:1.27},
      {id:"spacing",type:"distance",a:62,b:65,value:2.54},
    ]},
  ],
};
const views = ["front","top","right"].map(dir=>({id:dir,view:{dir},projection:{basis:viewBasis(dir)}}));
const scene = {topologyIndex:createTopologyIndex(geometry),views};

test("Insert Model Items binds sketch, extrusion and fillet dimensions without duplicating manual diameter", () => {
  const manual={type:"diameter",viewId:"detail",radius:.635,refs:[{u:0,v:0}]};
  const doc={dims:[manual]};
  const planned=planModelItems(model,doc,scene);
  const keys=planned.map(dim=>dim.modelItem);
  assert.ok(keys.includes("feature:base:depth"));
  assert.ok(keys.includes("sketch:term-sk:constraint:spacing"));
  assert.ok(keys.includes("feature:round-large:radius"));
  assert.ok(keys.includes("feature:round-small:radius"));
  assert.ok(!keys.includes("sketch:term-sk:constraint:diam"));
  assert.equal(planModelItems(model,{dims:doc.dims.concat(planned)},scene).length,0);
  assert.ok(planned.every(dim=>dim.refs.every(ref=>ref.pid)));
});

test("a model-item depth and fillet callout remeasure renamed topology after editing", () => {
  const planned=planModelItems(model,{dims:[]},scene);
  const depth=planned.find(dim=>dim.modelItem==="feature:base:depth");
  const fillet=planned.find(dim=>dim.modelItem==="feature:round-large:radius");
  assert.ok(depth && fillet);
  const basis=viewBasis("front");
  assert.ok(Math.abs(measureDim(resolveDim(depth,scene.topologyIndex,basis).dim)-10.414)<1e-6);
  const updated=createTopologyIndex(geometry.map(entry=>entry.persistentId==="base:face:end"
    ? face(entry.persistentId,11.176)
    : entry.persistentId==="round-large:edge:generated:circle:1"
      ? circle(entry.persistentId,-2.159,-2.159,1.524)
      : entry));
  assert.ok(Math.abs(measureDim(resolveDim(depth,updated,basis).dim)-11.176)<1e-6);
  assert.ok(Math.abs(measureDim(resolveDim(fillet,updated,viewBasis("top")).dim)-1.524)<1e-6);
  const missing=createTopologyIndex(geometry.filter(entry=>entry.persistentId!=="base:face:end"));
  assert.equal(resolveDim(depth,missing,basis).dangling,true);
});

test("AXLE diameter from a Front-plane sketch is called out in its face-on Front view", () => {
  const axle = {
    features:[{id:"shaft",type:"extrude",params:{operation:"add",sketchId:"round"}}],
    sketches:[{id:"round",entities:[{id:1,type:"circle"}],constraints:[
      {id:"diam",type:"diameter",entity:1,value:.47752},
    ]}],
  };
  const axleScene = {views,topologyIndex:createTopologyIndex([
    edge("shaft:edge:profile:1:start",{curve:"circle",origin:{x:0,y:0,z:-1.74625},
      axis:{x:0,y:0,z:1},radius:.23876}),
  ])};
  const diameter = planModelItems(axle,{dims:[]},axleScene).find(dim => dim.type === "diameter");
  assert.equal(diameter?.viewId,"front");
  assert.equal(diameter?.refs[0].pid,"shaft:edge:profile:1:start");
});

test("annular SHAFT COLLAR inserts both diameters including a generated inner rim", () => {
  const collar = {
    features:[{id:"collar",type:"extrude",params:{sketchId:"ring",axis:"z",from:0,to:.635}}],
    sketches:[{id:"ring",plane:"front",points:[{id:3,x:0,y:0}],entities:[
      {id:1,type:"circle",c:3,r:.55626},{id:2,type:"circle",c:3,r:.23876},
    ],constraints:[{id:"outer",type:"diameter",entity:1,value:1.11252},
      {id:"inner",type:"diameter",entity:2,value:.47752,expr:".188 in"}]}],
  };
  const rim = (id,z,radius,x=0) => edge(id,{curve:"circle",origin:{x,y:0,z},axis:{x:0,y:0,z:1},radius});
  const collarGeometry = [rim("collar:edge:profile:1:start",0,.55626),
    rim("collar:edge:generated:circle:1",0,.23876),rim("collar:edge:generated:circle:2",.635,.23876),
    rim("collar:edge:generated:circle:3",0,.23876,2)];
  const collarScene = {views,topologyIndex:createTopologyIndex(collarGeometry)};
  const planned = planModelItems(collar,{dims:[]},collarScene);
  assert.equal(planned.filter(dim => dim.type === "diameter").length,2);
  const inner = planned.find(dim => dim.modelItem.endsWith(":inner"));
  assert.equal(inner?.viewId,"front");
  assert.equal(inner?.refs[0].pid,"collar:edge:generated:circle:1");
  assert.equal(measureDim(resolveDim(inner,collarScene.topologyIndex,viewBasis("front")).dim),.47752);
  assert.equal(planModelItems(collar,{dims:planned},collarScene).length,0);
  const ambiguous = {...collarScene,topologyIndex:createTopologyIndex(collarGeometry.concat(
    rim("collar:edge:generated:circle:4",0,.23876)))};
  assert.ok(!planModelItems(collar,{dims:[]},ambiguous).some(dim => dim.modelItem.endsWith(":inner")));
});
