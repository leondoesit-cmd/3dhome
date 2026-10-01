import test from "node:test";
import assert from "node:assert/strict";
import { tessellateParts } from "../js/core/part_tessellate.js";
import { projectSolid, cropProjection } from "../js/core/hidden_line.js";
import { createSheetDoc, createView, createProjector, buildSheetScene, sceneToSvg, resolveNote } from "../js/cad_sheet.js";
import { createDrawingSvg } from "../js/cad_drawings.js";

const box={kind:"box",x0:-2,x1:2,y0:-1,y1:1,z0:0,z1:.2};
test("shaded isometric surfaces use model facets with directional lighting and depth ordering",()=>{
  const p=projectSolid(tessellateParts([box]),"iso",{shaded:true});
  assert.equal(p.surfaces.length,6);
  assert.equal(new Set(p.surfaces.map(s=>s.fill)).size,3);
  assert.ok(p.surfaces.every((s,i)=>!i||s.depth>=p.surfaces[i-1].depth));
  assert.ok(p.surfaces.every(s=>s.points.length===3 && s.points.every(p=>Number.isFinite(p.u))));
  assert.equal(projectSolid(tessellateParts([box]),"iso").surfaces.length,0);
});

test("through hole remains open in shaded front surfaces and detail facets stop at crop",()=>{
  const ring=r=>Array.from({length:32},(_,i)=>({u:Math.cos(i*Math.PI/16)*r,v:Math.sin(i*Math.PI/16)*r}));
  const part={kind:"ext",axis:"z",from:0,to:.2,pts:ring(2),holes:[ring(.5)]};
  const p=projectSolid(tessellateParts([part]),"front",{shaded:true});
  const covers=(s,u,v)=>s.points.every((a,i)=>{const b=s.points[(i+1)%s.points.length];return (b.u-a.u)*(v-a.v)-(b.v-a.v)*(u-a.u)>=-1e-8;});
  assert.ok(p.surfaces.length>20);
  assert.equal(p.surfaces.some(s=>covers(s,0,0)),false);
  assert.ok(p.surfaces.some(s=>covers(s,1.5,.01)));
  const cropped=cropProjection(p,{u:1,v:0,radius:.3});
  assert.ok(cropped.surfaces.length);
  assert.ok(cropped.surfaces.every(s=>s.points.every(q=>Math.hypot(q.u-1,q.v)<=.300001)));
});

test("view style cache switches, persists through copy, and SVG rebuilds real surface geometry",()=>{
  const doc=createSheetDoc({views:["front","iso"],scale:[1,1]});
  const iso=doc.views[1], project=createProjector(doc,tessellateParts([box]));
  assert.equal(project(iso).surfaces.length,0);
  iso.displayStyle="shadedEdges";
  assert.equal(project(iso).surfaces.length,6);
  assert.equal(createView(iso.dir,iso).displayStyle,"shadedEdges");
  const scene=buildSheetScene(doc,{projection:project});
  assert.equal(scene.items.filter(i=>i.shaded).reduce((sum,i)=>sum+i.paths.length,0),6);
  assert.ok(scene.items.some(i=>i.viewId===iso.id&&i.style==="outline"));
  const svg=createDrawingSvg({parts:[box],drawing:doc},{holeCallouts:false});
  assert.match(svg,/<path[^>]+fill="#[a-f0-9]{6}"/);
  assert.doesNotMatch(svg,/<image/);
  const changed=createDrawingSvg({parts:[{...box,z1:2}],drawing:doc},{holeCallouts:false});
  assert.notEqual(changed,svg);
  doc.views[1].displayStyle="shaded";
  const plain=buildSheetScene(doc,{projection:project});
  assert.equal(plain.items.some(i=>i.viewId===iso.id&&i.style==="outline"),false);
  assert.ok(sceneToSvg(plain).includes("<path"));
});

test("arbitrary linked custom properties update and flag missing properties without freezing text",()=>{
  const note={text:"FORMAT",modelLink:{kind:"property",key:"SWFormatSize"}};
  const resolve=props=>resolveNote(note,null,null,null,{},props);
  assert.equal(resolve({SWFormatSize:"8.5in*11in"}).note.text,"FORMAT 8.5in*11in");
  assert.equal(resolve({SWFormatSize:"A4"}).note.text,"FORMAT A4");
  assert.equal(resolve({}).dangling,true);
  assert.equal(note.text,"FORMAT");
  const doc=createSheetDoc({views:["front"]});doc.notes.push({...note,id:"n",x:20,y:20});
  const svg=createDrawingSvg({parts:[box],drawing:doc,customProperties:{SWFormatSize:"8.5in*11in"}},{holeCallouts:false});
  assert.match(svg,/FORMAT 8.5in\*11in/);
});
