import test from "node:test";
import assert from "node:assert/strict";
import { holeCallouts } from "../js/core/hole_callout.js";
import { planModelItems } from "../js/core/model_items.js";
import { createTopologyIndex, resolveDim, measureDim, resolveNote, dimensionText } from "../js/cad_sheet.js";
import { viewBasis } from "../js/core/hidden_line.js";

test("FLAT BAR hole callout includes linear feature copies and respects skip/suppression",()=>{
  const pattern={id:"pattern",type:"pattern",params:{scope:"feature",seedFeatureId:"hole",mode:"linear",axisX:true,axisY:false,axisZ:false,countX:3,spacingX:1.27}};
  const def={features:[{id:"hole",type:"hole",params:{layout:"grid",countX:1,countY:1,diameter:.4826,endCondition:"through-all"}},pattern]};
  assert.equal(holeCallouts(def)[0].quantity,3);
  assert.equal(holeCallouts(def)[0].equalSpacing,true);
  pattern.params.skipInstances="2";
  assert.equal(holeCallouts(def)[0].quantity,2);
  assert.equal(holeCallouts(def)[0].equalSpacing,false);
  pattern.suppressed=true;
  assert.equal(holeCallouts(def)[0].quantity,1);
});

test("slot cap radius and construction centre spacing bind to final arcs and remeasure",()=>{
  const sketch={id:"slot",plane:"front",points:[{id:1,x:-1.27,y:0},{id:2,x:1.27,y:0},{id:3,x:-1.27,y:.635},{id:4,x:1.27,y:.635}],entities:[{id:5,type:"arc",c:1,a:3},{id:6,type:"arc",c:2,a:4},{id:7,type:"line",a:1,b:2,construction:true}],constraints:[{id:"r",type:"radius",entity:5,value:.635},{id:"spacing",type:"distance",entity:7,value:2.54}]};
  const arcs=[-1.27,1.27].map((x,i)=>({kind:"edge",persistentId:`base:edge:generated:circle:${i}`,descriptor:{curve:"circle",origin:{x,y:0,z:0},radius:.635,axis:{x:0,y:0,z:1}}}));
  const basis=viewBasis("front"), scene={topologyIndex:createTopologyIndex(arcs),views:[{id:"front",view:{dir:"front"},projection:{basis}}]};
  const planned=planModelItems({features:[{id:"base",type:"extrude",params:{sketchId:"slot",axis:"z"}}],sketches:[sketch]},{dims:[]},scene);
  assert.equal(planned.length,2);
  assert.ok(planned.every(dim=>dim.refs.every(ref=>ref.pid)));
  const spacing=planned.find(dim=>dim.type==="aligned");
  assert.equal(measureDim(resolveDim(spacing,scene.topologyIndex,basis).dim),2.54);
  const changed=createTopologyIndex(arcs.map((arc,i)=>({...arc,descriptor:{...arc.descriptor,origin:{x:i?1.524:-1.524,y:0,z:0}}})));
  assert.equal(measureDim(resolveDim(spacing,changed,basis).dim),3.048);
});

test("smart thickness note follows exact extrusion depth, units, and missing topology",()=>{
  const note={text:"MATERIAL THICKNESS",modelLink:{kind:"extrudeDepth",featureId:"base"}};
  const index=(depth)=>createTopologyIndex([0,depth].map((z,i)=>({kind:"face",persistentId:"base:face:"+(i?"end":"start"),descriptor:{origin:{x:0,y:0,z}}})));
  const doc={units:"in",precision:3,trailingZeros:true,secondaryUnits:"mm",secondaryPrecision:2};
  assert.equal(resolveNote(note,null,index(.2286),null,doc).note.text,"MATERIAL THICKNESS 0.090 [2.29]");
  assert.equal(resolveNote(note,null,index(.1524),null,doc).note.text,"MATERIAL THICKNESS 0.060 [1.52]");
  assert.equal(resolveNote(note,null,new Map(),null,doc).dangling,true);
  assert.equal(note.text,"MATERIAL THICKNESS");
});

test("a radius quantity annotates the measured value without freezing it",()=>{
  const doc={units:"in",precision:3,trailingZeros:true};
  const dim={type:"radius",measure:.635,quantity:2};
  assert.equal(dimensionText(dim,doc),"2X R0.250");
  assert.equal(dimensionText({...dim,measure:.762},doc),"2X R0.300");
});

test("linked depth is normal plane separation even when a drafted face centroid shifts",()=>{
  const index=createTopologyIndex([
    {kind:"face",persistentId:"base:face:start",descriptor:{origin:{x:0,y:0,z:0},normal:{x:0,y:0,z:1}}},
    {kind:"face",persistentId:"base:face:end",descriptor:{origin:{x:5,y:4,z:.2286}}},
  ]);
  const note={text:"MATERIAL THICKNESS",modelLink:{kind:"extrudeDepth",featureId:"base"}};
  assert.equal(resolveNote(note,null,index,null,{units:"in",precision:3,trailingZeros:true}).note.text,"MATERIAL THICKNESS 0.090");
});
