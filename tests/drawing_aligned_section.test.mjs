import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAlignedSection,alignedSectionFrame,canAlignedSectionParent} from '../js/core/drawing_aligned_section.js';
import {createSheetDoc,createView,createProjector,buildSheetScene,sceneToSvg,ensureSheetDoc,removeViewFromSheet,measureDim,hatchLoops} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
import {makeBrepExtrusion,shapeToMeshData,disposeBrep} from '../js/cad_kernel.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const modifier=()=>({version:1,from:'p',points:[{u:0,v:2},{u:0,v:0},{u:2,v:0}],tag:'A'});
const docFor=()=>{const doc=createSheetDoc({scale:'1:1',views:[]});doc.views=[createView('front',{id:'p',primary:true}),createView('alignedsection',{id:'a',parent:'p',alignedSection:modifier(),label:'ALIGNED CUT-FACE A-A (UNFOLDED)'})];return doc;};
const box=()=>tessellateParts([{id:'b',kind:'box',x0:-2,x1:2,y0:-2,y1:2,z0:0,z1:2}]);
const area=loop=>Math.abs(loop.reduce((sum,p,i)=>{const q=loop[(i+1)%loop.length];return sum+p.u*q.v-q.u*p.v;},0)/2);

test('two distinct real cut planes unfold at a common hinge without changing source mesh',()=>{
  const doc=docFor(),bodies=box(),bytes=JSON.stringify(bodies),projection=projectAlignedSection(bodies,doc.views[1],doc);
  assert.equal(JSON.stringify(bodies),bytes);assert.deepEqual(projection.bounds,{u0:0,u1:2,v0:-2,v1:2});
  near(projection.sectionRegions.reduce((sum,r)=>sum+r.loops.reduce((s,l)=>s+area(l),0),0),8);
  assert.equal(projection.sectionRegions.length,2);assert.equal(projection.cuts.length,0);
  assert.ok(projection.visible.every(e=>!(Math.abs(e.a.v)<1e-8&&Math.abs(e.b.v)<1e-8)),'no artificial seam drawn');
  const frame=alignedSectionFrame(doc.views[1],doc);assert.deepEqual(frame.basis.right,{x:0,y:0,z:1});
});

test('touching boxes produce separate material regions and hatch on both aligned legs',()=>{
  const doc=docFor(), bodies=tessellateParts([0,1].map(z=>({
    id:'box'+z,kind:'box',x0:-2,x1:2,y0:-2,y1:2,z0:z,z1:z+1,
  })));
  const sceneFor=source=>buildSheetScene(doc,{projection:createProjector(doc,source)});
  for(const body of bodies) assert.ok(sceneFor([body]).items.some(i=>i.viewId==='a'&&i.style==='hatch'));
  const scene=sceneFor(bodies),placed=scene.views.find(v=>v.id==='a');
  assert.deepEqual(scene.diagnostics,[]);
  const regions=placed.projection.sectionRegions;
  assert.equal(regions.length,4);
  for(const leg of [0,1]) for(const bodyIndex of [0,1]) {
    const region=regions.find(r=>r.leg===leg&&r.bodyIndex===bodyIndex);
    assert.ok(region);
    assert.equal(region.loops.length,1);
    near(area(region.loops[0]),2);
    const hatches=scene.items.filter(i=>i.style==='hatch'&&i.alignedSectionLeg===leg);
    const spans=hatches.map(i=>[placed.toModel({x:i.x1,y:i.y1}).u,placed.toModel({x:i.x2,y:i.y2}).u]);
    assert.ok(spans.some(points=>points.every(u=>u>=bodyIndex-1e-8&&u<=bodyIndex+1+1e-8)));
    assert.ok(spans.every(points=>Math.min(...points)>=1-1e-8||Math.max(...points)<=1+1e-8),'no stroke crosses the contact face');
  }
});

test('a body behind the hinge contributes only to the leg that cuts its material',()=>{
  const doc=docFor(), bodies=[...box(),...tessellateParts([{
    kind:'box',x0:-2,x1:1,y0:-3,y1:-1,z0:3,z1:4,
  }])];
  // This box crosses the first full plane behind the hinge and misses the second.
  let projection=projectAlignedSection(bodies,doc.views[1],doc);
  assert.deepEqual(projection.sectionRegions.map(r=>[r.leg,r.bodyIndex]),[[0,0],[1,0]]);
  for(let i=1;i<bodies[1].positions.length;i+=3)bodies[1].positions[i]+=4;
  projection=projectAlignedSection(bodies,doc.views[1],doc);
  assert.deepEqual(projection.sectionRegions.filter(r=>r.bodyIndex===1).map(r=>r.leg),[0]);
});

test('aligned section rejects a box split into open end caps and lateral faces',()=>{
  const doc=docFor(), [{positions}]=box(), caps=[], sides=[];
  for(let i=0;i<positions.length;i+=9) {
    const tri=positions.slice(i,i+9);
    (tri[2]===tri[5]&&tri[5]===tri[8]?caps:sides).push(...tri);
  }
  const bodies=[{positions:caps},{positions:sides}];
  for(const source of [[bodies[0]],[bodies[1]],bodies]) {
    const scene=buildSheetScene(doc,{projection:createProjector(doc,source)});
    assert.ok(scene.diagnostics.some(d=>d.code==='invalid-aligned-section'));
    assert.ok(!scene.items.some(i=>i.viewId==='a'&&i.style==='hatch'));
  }
});

test('six principal parents and non-right-angle radial cut unfold true radial lengths',()=>{
  const bodies=tessellateParts([{id:'b',kind:'box',x0:-2,x1:2,y0:-2,y1:2,z0:-2,z1:2}]);
  for(const dir of ['front','back','top','bottom','left','right']) {
    const doc=docFor();doc.views[0].dir=dir;
    const p=projectAlignedSection(bodies,doc.views[1],doc);near(p.bounds.u0,-2);near(p.bounds.u1,2);near(p.bounds.v0,-2);near(p.bounds.v1,2);
    doc.views[1].alignedSection.points[0]={u:1,v:1};
    const angled=projectAlignedSection(bodies,doc.views[1],doc);near(angled.bounds.v0,-Math.sqrt(8));near(angled.bounds.v1,2);
    near(angled.sectionRegions.reduce((sum,r)=>sum+r.loops.reduce((s,l)=>s+area(l),0),0),4*(Math.sqrt(8)+2));
  }
});

test('native holed extrusion has different genuine voids on each unfolded leg, rebuild drives source depth',async()=>{
  let shape;
  const holes=[[{u:-.2,v:.8},{u:.2,v:.8},{u:.2,v:1.2},{u:-.2,v:1.2}], [{u:.7,v:-.3},{u:1.3,v:-.3},{u:1.3,v:.3},{u:.7,v:.3}]];
  const native=async depth=>{if(shape)disposeBrep(shape);shape=await makeBrepExtrusion({axis:'z',from:0,to:depth,points:[{u:-2,v:-2},{u:2,v:-2},{u:2,v:2},{u:-2,v:2}],holes});const mesh=await shapeToMeshData(shape,{deflection:.01,angle:.1});return [{id:'native',positions:mesh.positions,faceRanges:mesh.faceRanges}];};
  try {
    const doc=docFor();let bodies=await native(2),p=projectAlignedSection(bodies,doc.views[1],doc);
    assert.equal(p.sectionRegions[0].loops.length,2);assert.equal(p.sectionRegions[1].loops.length,2);
    near(p.sectionRegions[0].loops.reduce((s,l)=>s+area(l),0),3.2);near(p.sectionRegions[1].loops.reduce((s,l)=>s+area(l),0),2.8);
    for(const region of p.sectionRegions) {
      const loops=region.loops.map(loop=>loop.map(q=>({x:q.u*10,y:q.v*10})));
      const hatch=hatchLoops(loops,{spacing:1,angle:45});
      const low=region.leg===0?-12:7,high=region.leg===0?-8:13;
      assert.ok(hatch.length);for(const e of hatch){const x=(e.x1+e.x2)/2,y=(e.y1+e.y2)/2;assert.ok(!(x>1e-6&&x<20-1e-6&&y>low+1e-6&&y<high-1e-6),'hatch cannot occupy actual void');}
    }
    bodies=await native(3);p=projectAlignedSection(bodies,doc.views[1],doc);near(p.bounds.u1,3);near(p.sectionRegions[0].loops.reduce((s,l)=>s+area(l),0),4.8);
  } finally {if(shape)disposeBrep(shape);}
});

test('sheet emits genuine hatching and parent path, cold SVG exact and coordinate dimensions true',()=>{
  const doc=docFor(),bodies=box();doc.dims=[{id:'d',viewId:'a',type:'horizontal',refs:[{u:0,v:-2},{u:2,v:-2}],offset:5}];
  const scene=buildSheetScene(doc,{projection:createProjector(doc,bodies)}),svg=sceneToSvg(scene);
  assert.ok(scene.items.some(i=>i.style==='hatch'&&i.viewId==='a'));assert.equal(scene.items.filter(i=>i.alignedSectionMarker&&i.type==='line').length,2);
  near(measureDim(doc.dims[0]),2);assert.match(svg,/ALIGNED CUT-FACE/);
  const cold=JSON.parse(JSON.stringify(doc));assert.equal(sceneToSvg(buildSheetScene(cold,{projection:createProjector(cold,bodies)})),svg);
  doc.dims.push({id:'unsupported',viewId:'a',type:'horizontal',refs:[{pid:'edge',at:'a'},{u:1,v:0}]});
  assert.ok(buildSheetScene(doc,{projection:createProjector(doc,bodies)}).diagnostics.some(d=>d.code==='aligned-section-reference-unavailable'));
  removeViewFromSheet(doc,'p');assert.equal(doc.views.length,0);assert.equal(doc.dims.length,0);
});

test('invalid source, parent, configuration and cutting paths fail closed without normal-view fallback',()=>{
  for(const mutate of [d=>d.views[1].alignedSection.points[2]={u:0,v:-2},d=>d.views[1].alignedSection.points[1]={u:0,v:2},d=>d.views[1].configurationId='other',d=>d.views[0].alternatePosition={},d=>d.views[1].displayStyle='shaded',d=>d.views[1].alternatePosition={},d=>d.views[1].alignedSection.from='missing',d=>d.views[1].alignedSection.points[0].u=NaN]) {
    const doc=docFor();mutate(doc);assert.throws(()=>projectAlignedSection(box(),doc.views[1],doc));assert.ok(createProjector(doc,box())(doc.views[1]).alignedSectionError);
  }
  const doc=docFor();assert.throws(()=>projectAlignedSection([{positions:[NaN,0,0]}],doc.views[1],doc));
  doc.views[1].alignedSection.points=doc.views[1].alignedSection.points.map(p=>({u:p.u+10,v:p.v+10}));assert.throws(()=>projectAlignedSection(box(),doc.views[1],doc));
  assert.equal(canAlignedSectionParent(createView('front',{alignedSection:modifier()})),false);
});

test('actual normalized controller authors through three picks and Enter, one undo, source/cancel guards',()=>{
  const def={drawing:docFor()},bodies=box(),steps=[],messages=[];def.drawing.views.pop();let token=1;
  const host={doc:()=>ensureSheetDoc(def),bodies:()=>bodies,bodiesToken:()=>token,canvas:()=>({}),width:()=>900,height:()=>600,t:x=>x,flash:m=>messages.push(m),refresh(){},markDirty(){},pushUndo:label=>{steps.push({label,snapshot:JSON.stringify(def.drawing)});ensureSheetDoc(def);}};
  const c=createDrawingController(host);c.state.zoom=1;
  const click=p=>{const q=c.scene().views.find(v=>v.id==='p').toSheet(p);c.pointerDown({button:0},q.x,q.y);};
  c.setTool('alignedsection');modifier().points.forEach(click);assert.equal(steps.length,0);assert.equal(c.state.draft.points.length,3);
  c.keyDown({key:'Enter'});assert.equal(steps.length,1,messages.join(';'));assert.equal(host.doc().views.length,2);assert.ok(host.doc().views[1].alignedSection);assert.ok(c.scene().views[1].projection.sectionRegions);
  def.drawing=JSON.parse(steps[0].snapshot);c.invalidate();c.setTool('alignedsection');modifier().points.forEach(click);token++;c.keyDown({key:'Enter'});assert.equal(steps.length,1);assert.match(messages.at(-1),/changed/);
  c.keyDown({key:'Escape'});assert.equal(c.state.draft,null);assert.equal(host.doc().views.length,1);
});
