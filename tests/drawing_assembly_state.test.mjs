import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDrawingScene} from '../js/cad_drawings.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {buildSheetScene,ensureSheetDoc,projectedDimensionBinding,sceneToSvg,viewSourceOwner} from '../js/cad_sheet.js';
import {assemblySourceBodies} from '../js/cad_configured_drawing.js';
import {tessellatePart} from '../js/core/part_tessellate.js';
import {applyExplodedProgress,drawingAssemblyPose} from '../js/cad_exploded_view.js';
import {putAssemblyLibraryRecord} from '../js/core/model_library_store.js';
import {BoxGeometry,CylinderGeometry,ExtrudeGeometry,Group,Matrix4,Mesh,Path,Shape,SphereGeometry,Vector3} from '../vendor/three/three.core.js';
import {projectSolid} from '../js/core/hidden_line.js';
import {curveSegments} from '../js/sketch_profiles.js';

const def = {parts:[{id:'block',kind:'box',x0:0,x1:2,y0:0,y1:2,z0:0,z1:2}]};
function fixture() {
  return {kind:'assembly',key:'asm_view_poses',name:'Assembly',components:[
    {id:'base',def,transform:{}},
    {id:'group',kind:'assembly',transform:{x:4,rz:90},asm:{components:[
      {id:'bolt',def,transform:{}}, {id:'hidden',def,visible:false,transform:{x:100}},
    ]}},
  ],explodedViews:[{id:'pull',steps:[
    {components:['group'],direction:{x:10,y:0,z:0}},
    {components:[['group','bolt']],direction:{x:2,y:3,z:0}},
  ]}]};
}

test('Float32 picks survive a double-precision export, while moved segments and resized circles dangle', () => {
  const doc=ensureSheetDoc({drawing:{views:[{id:'front',dir:'front'}]}});
  const x=11.43, y=3.27, r=1.14;
  const projection=(x,y,r)=>({bounds:{u0:0,u1:x+r,v0:0,v1:y+r},hidden:[],
    visible:[{a:{u:x,v:0},b:{u:x,v:y}}],circles:[{u:x,v:y,radius:r,kind:'round'}]});
  const live=projection(Math.fround(x),Math.fround(y),Math.fround(r)), edge=live.visible[0];
  doc.dims=[
    {id:'line',viewId:'front',type:'vertical',refs:[edge.a,edge.b],offset:3},
    {id:'circle',viewId:'front',type:'diameter',refs:[edge.b],radius:live.circles[0].radius,offset:3},
  ];
  for(const dim of doc.dims)dim.sourceBinding=projectedDimensionBinding(dim,null,live);
  const cold=JSON.parse(JSON.stringify(doc));
  const scene=p=>buildSheetScene(cold,{projection:()=>p});
  const exact=projection(x,y,r);
  exact.visible[0]={a:exact.visible[0].b,b:exact.visible[0].a};
  assert.deepEqual([...scene(exact).dims.values()].map(d=>d.dangling),[false,false]);
  assert.deepEqual([...scene(projection(x+.001,y,r)).dims.values()].map(d=>d.dangling),[true,true]);
  assert.ok(scene(projection(x,y,r+.001)).dims.get('circle').dangling);
});

test('a native edge translated back to the origin keeps its live dimension on export', () => {
  const x=11.43;
  const block={...def.parts[0],x1:x};
  block.meshData={positions:tessellatePart(block).positions};
  const component={id:'placed',def:{parts:[block]},transform:{x:-x}};
  const assembly={kind:'assembly',components:[component],drawing:{views:[{id:'front',dir:'front'}]}};
  const exportScene=()=>buildDrawingScene(JSON.parse(JSON.stringify(assembly)));
  // The live mesh rounds in component space, then applies the occurrence transform.
  const live=structuredClone(assembly);
  live.components[0].def.parts[0].meshData.positions=block.meshData.positions.map(Math.fround);
  const projection=buildDrawingScene(live).views[0].projection;
  const u=Math.fround(x)-x;
  const edge=projection.visible.find(({a,b})=>a.u===u && b.u===u && a.v!==b.v);
  assert.ok(edge);
  const dim={id:'height',viewId:'front',type:'vertical',refs:[edge.a,edge.b],offset:3};
  dim.sourceBinding=projectedDimensionBinding(dim,null,projection);
  assembly.drawing.dims=[dim];
  assert.equal(exportScene().dims.get(dim.id).dangling,false);
  component.transform.x+=0.001;
  assert.equal(exportScene().dims.get(dim.id).dangling,true);
});

function renderedTriangles(mesh) {
  mesh.updateWorldMatrix(true,false);
  const geometry=mesh.geometry, vertices=[];
  for (let i=0; i<(geometry.index?.count ?? geometry.attributes.position.count); i++) {
    const index=geometry.index ? geometry.index.getX(i) : i;
    const point=new Vector3().fromBufferAttribute(geometry.attributes.position,index).applyMatrix4(mesh.matrixWorld);
    vertices.push(point.x,point.y,point.z);
  }
  return vertices;
}

test('a centered primitive box keeps its near-zero host pick through nested export until the occurrence moves', () => {
  const width=11.43, part={...def.parts[0],x1:width};
  const leaf={id:'leaf',def:{parts:[part]},transform:{x:2}};
  const parent={id:'parent',kind:'assembly',asm:{components:[leaf]},transform:{x:-width-2}};
  const assembly={kind:'assembly',components:[parent],drawing:{views:[{id:'front',dir:'front'}]}};
  const mesh=new Mesh(new BoxGeometry(width,2,2));
  mesh.position.set(width/2,1,1);
  const child=new Group(), group=new Group();
  child.position.x=leaf.transform.x;
  group.position.x=parent.transform.x;
  child.add(mesh); group.add(child);
  const projection=projectSolid([{id:'parent/leaf:block',positions:renderedTriangles(mesh)}],'front');
  const u=Math.fround(width/2)-width/2;
  const edge=projection.visible.find(({a,b})=>a.u===u && b.u===u && a.v!==b.v);
  assert.ok(edge);
  const dim={id:'height',viewId:'front',type:'vertical',refs:[edge.a,edge.b],offset:3};
  dim.sourceBinding=projectedDimensionBinding(dim,null,projection);
  assembly.drawing.dims=[dim];
  const dangling=()=>buildDrawingScene(JSON.parse(JSON.stringify(assembly))).dims.get(dim.id).dangling;
  assert.equal(dangling(),false);
  leaf.transform.x+=0.001;
  assert.equal(dangling(),true);
});

for (const mode of ['translated', 'framed pattern']) {
  test(`host extrusion keeps a live edge after reload and dangles after movement (${mode})`, () => {
    const width=11.43, nested=mode==='framed pattern';
    const profile=[[0,0],[width,0],[width,2],[0,2]];
    const part={id:'stock',kind:'ext',axis:'z',pts:profile.map(([u,v])=>({u,v})),from:0,to:2};
    const shape=new Shape();
    profile.forEach(([u,v],i)=>i ? shape.lineTo(u,v) : shape.moveTo(u,v));
    const geometry=new ExtrudeGeometry(shape,{depth:2,bevelEnabled:false});
    const mesh=new Mesh(geometry), child=new Group(), parent=new Group();
    const leaf={id:'leaf',def:{parts:[part]},transform:{x:-width}};
    let components=[leaf], id='leaf:stock';
    if (nested) {
      const angle=0.37, xAxis=new Vector3(Math.cos(angle),0,Math.sin(angle));
      const normal=new Vector3(-Math.sin(angle),0,Math.cos(angle)), yAxis=new Vector3(0,1,0);
      const origin=new Vector3(3.27,0,0);
      part.frame={origin,xAxis,yAxis,normal};
      part.from=2.53; part.to=0.53;
      const start=origin.clone().addScaledVector(normal,part.from);
      geometry.applyMatrix4(new Matrix4().makeBasis(xAxis,yAxis,normal.clone().negate()).setPosition(start));
      const turn=new Group(), back=new Group();
      turn.position.x=1.13; turn.rotation.y=0.58; back.position.x=-1.13;
      part.patternRotations=[{axis:'y',angle:turn.rotation.y,pivot:{x:1.13,y:0,z:0}}];
      child.add(turn); turn.add(back); back.add(mesh);
      parent.position.set(4,1,0); parent.rotation.y=Math.PI/6; parent.add(child);
      components=[{id:'outer',kind:'assembly',transform:{x:4,y:1,ry:30},asm:{components:[leaf]}}];
      id='outer/'+id;
    } else child.add(mesh);
    child.position.x=leaf.transform.x;
    const assembly={kind:'assembly',components,drawing:{views:[{id:'front',dir:'front'}]}};
    const expected=renderedTriangles(mesh);
    const [body]=assemblySourceBodies(assembly,{viewportPrecision:true});
    assert.equal(body.id,id);
    assert.equal(body.positions.length,expected.length);
    assert.ok(expected.every((n,i)=>Math.abs(body.positions[i]-n)<1e-12));
    const projection=projectSolid([{id,positions:expected}],'front');
    const edge=projection.visible.find(({a,b})=>a.u===b.u && a.v!==b.v && (nested || a.u===Math.fround(width)-width));
    assert.ok(edge);
    const dim={id:'height',viewId:'front',type:'vertical',refs:[edge.a,edge.b],offset:3};
    dim.sourceBinding=projectedDimensionBinding(dim,null,projection);
    assembly.drawing.dims=[dim];
    const dangling=()=>buildDrawingScene(JSON.parse(JSON.stringify(assembly))).dims.get(dim.id).dangling;
    assert.equal(dangling(),false);
    leaf.transform.x+=0.001;
    assert.equal(dangling(),true);
  });
}

test('pending X and Y extrusions keep each Float32 transform and active hole', () => {
  for (const axis of ['x','y']) {
    const pts=[[0,0],[11.43,0],[11.43,8],[0,8]], opening=[[1,1],[2,1],[2,2],[1,2]];
    const profile=points=>points.map(([u,v])=>({u,v}));
    const part={id:'stock',kind:'ext',axis,pts:profile(pts),from:13.57,to:2.14,
      holes:[{points:profile(opening)},{pts:profile(opening),suppressed:true}],
      exactPending:true,meshData:{positions:Array(9).fill(0)}};
    const shape=new Shape(), path=new Path();
    for (const [loop,points] of [[shape,pts],[path,opening]]) {
      points.forEach(([u,v],i)=>loop[i?'lineTo':'moveTo'](axis==='x'?-u:u,axis==='y'?-v:v));
    }
    shape.holes.push(path);
    const geometry=new ExtrudeGeometry(shape,{depth:part.from-part.to,bevelEnabled:false});
    if (axis==='x') geometry.rotateY(Math.PI/2).translate(part.to,0,0);
    else geometry.rotateX(-Math.PI/2).translate(0,part.to,0);
    const asm={components:[{id:'leaf',def:{parts:[part]},transform:{}}]};
    const [body]=assemblySourceBodies(asm,{viewportPrecision:true});
    assert.deepEqual(body.positions,renderedTriangles(new Mesh(geometry)));
  }
});

test('a loft without meshData exports both caps and walls at viewport precision', () => {
  const width=11.43, ring=[{u:0,v:0},{u:width,v:0},{u:width,v:2},{u:0,v:2}];
  const loft={id:'loft',kind:'loft',axis:'z',from:1,to:4,pts0:ring,pts1:ring};
  const asm={components:[{id:'leaf',def:{parts:[loft]},transform:{x:-width}}]};
  const [body]=assemblySourceBodies(asm,{viewportPrecision:true});
  assert.equal(body.positions.length,12*9);
  assert.deepEqual(new Set(body.positions.filter((_,i)=>i%3===0)),new Set([-width,Math.fround(width)-width]));
  assert.deepEqual(new Set(body.positions.filter((_,i)=>i%3===2)),new Set([1,4]));
});

test('host round primitives use the renderer rings and local precision before occurrence placement', () => {
  const radius=5.715, top=3.27, height=11.43;
  const axis=new Vector3(1,2,3).normalize();
  const sphere={kind:'sph',x:radius,y:2,z:3,r:radius};
  const cylinder={...sphere,kind:'cyl',r2:top,h:height,axis};
  const sphereMesh=new Mesh(new SphereGeometry(radius,16,12));
  sphereMesh.position.set(sphere.x,sphere.y,sphere.z);
  const cylinderMesh=new Mesh(new CylinderGeometry(top,radius,height,curveSegments(radius,Math.PI*2,24,96)));
  cylinderMesh.position.copy(sphereMesh.position).addScaledVector(axis,height/2);
  cylinderMesh.quaternion.setFromUnitVectors(new Vector3(0,1,0),axis);
  for (const [part,mesh] of [[sphere,sphereMesh],[cylinder,cylinderMesh]]) {
    const group=new Group(), pattern=new Group();
    pattern.rotation.z=Math.PI/3; pattern.add(mesh);
    group.position.set(-radius,1,5); group.add(pattern);
    const copy={...part,patternRotations:[{axis:'z',angle:pattern.rotation.z}]};
    const asm={components:[{id:'placed',def:{parts:[copy]},transform:{x:-radius,y:1,z:5}}]};
    const [body]=assemblySourceBodies(asm,{viewportPrecision:true});
    const expected=renderedTriangles(mesh);
    assert.equal(body.positions.length,expected.length);
    assert.ok(expected.every((n,i)=>Math.abs(n-body.positions[i])<1e-12));
  }
});

test('a referenced subassembly uses the saved-part pick at zero on export', async () => {
  const width=11.43, part={...def.parts[0],x1:width};
  const source={kind:'assembly',key:'asm_primitive_precision'};
  const record={...source,components:[{id:'group',kind:'assembly',transform:{x:-width},
    asm:{components:[{id:'leaf',def:{parts:[part]},transform:{}}]}}]};
  await putAssemblyLibraryRecord(record);
  const owner={parts:[],drawing:{views:[{id:'front',dir:'front',source}]}};
  const projection=projectSolid(assemblySourceBodies(record),'front');
  const edge=projection.visible.find(({a,b})=>a.u===0 && b.u===0 && a.v!==b.v);
  assert.ok(edge);
  const dim={id:'height',viewId:'front',type:'vertical',refs:[edge.a,edge.b],offset:3};
  dim.sourceBinding=projectedDimensionBinding(dim,source,projection);
  owner.drawing.dims=[dim];
  const dangling=()=>buildDrawingScene(JSON.parse(JSON.stringify(owner))).dims.get(dim.id).dangling;
  assert.equal(dangling(),false);
  record.components[0].transform.x+=0.001;
  await putAssemblyLibraryRecord(record);
  assert.equal(dangling(),true);
});

test('Follow exports legacy paths on its first iso, while explicit views own their paths', () => {
  const assembly=fixture();
  applyExplodedProgress(assembly,'pull',0.25);
  delete assembly.exploded; // Older documents can carry live offsets without this flag.
  assembly.drawing={views:[
    {id:'front',dir:'front'}, {id:'closed',dir:'iso',assemblyState:'assembled'},
    {id:'explicit',dir:'front',assemblyState:'pull'}, {id:'follow',dir:'iso'}, {id:'other',dir:'isoleft'},
  ]};
  const scene=buildDrawingScene(assembly,{overallDimensions:false,holeCallouts:false});
  const paths=id=>scene.items.filter(i=>i.explodeLeader && i.viewId===id).map(i=>i.componentId);
  assert.deepEqual(paths('follow'),['group']);
  assert.deepEqual(paths('explicit'),['group','group/bolt']);
  for(const id of ['front','closed','other'])assert.deepEqual(paths(id),[]);
});

test('an existing Alternate Position is suppressed on exploded views in the controller and saved export', () => {
  const assembly=fixture();
  assembly.drawing={views:[{id:'front',dir:'front',assemblyState:'assembled',
    alternatePosition:{version:1,label:'Study',scope:'selected',bodyIds:['base:block'],sourceConfigurationId:null,
      translation:{x:0,y:2,z:0},rotation:{x:0,y:0,z:0},pivot:{x:0,y:0,z:0}}}]};
  const doc=()=>ensureSheetDoc(assembly);
  const controller=createDrawingController({doc,bodies:()=>[],bodiesToken:()=>0,t:key=>key,
    bodiesForView:v=>assemblySourceBodies(drawingAssemblyPose(assembly,v.assemblyState),{includeOffsets:true}),
    isExplodedView:v=>v.assemblyState==='pull' || (!v.assemblyState && assembly.exploded),
    pushUndo(){},refresh(){},markDirty(){}});
  controller.select({kind:'view',id:'front'});
  const check=exploded=>{
    const exported=buildDrawingScene(JSON.parse(JSON.stringify(assembly)),{overallDimensions:false,holeCallouts:false});
    for(const scene of [controller.scene(),exported]){
      assert.equal(scene.diagnostics.some(d=>d.code==='invalid-alternate-position'),exploded);
      assert.equal(scene.items.some(i=>i.alternatePosition),!exploded);
      assert.ok(scene.views[0].projection.visible.length);
    }
  };
  check(false);
  controller.setSheetOption('viewAssemblyState','pull');check(true);
  applyExplodedProgress(assembly,'pull',0.25);
  controller.setSheetOption('viewAssemblyState','');check(true);
  controller.setSheetOption('viewAssemblyState','assembled');check(false);
});

test('saved poses compose nested steps in world space without changing a partial live pose', () => {
  const assembly = fixture();
  applyExplodedProgress(assembly,'pull',0.25);
  const original = structuredClone(assembly);
  assert.equal(drawingAssemblyPose(assembly,null),assembly);
  const assembled = drawingAssemblyPose(assembly,'assembled');
  const exploded = drawingAssemblyPose(assembly,'pull');
  const lines = [];
  const rest = assemblySourceBodies(assembled);
  const moved = assemblySourceBodies(exploded,{includeOffsets:true,lines});
  assert.deepEqual(moved.map(b=>b.id),['base:block','group/bolt:block']);
  assert.deepEqual(moved[0],rest[0]);
  for (let i=0; i<rest[1].positions.length; i++) {
    assert.ok(Math.abs(moved[1].positions[i]-rest[1].positions[i]-[12,3,0][i%3])<1e-8);
  }
  assert.deepEqual(lines.map(l=>[l.id,l.to.x-l.from.x,l.to.y-l.from.y]),[['group',10,0],['group/bolt',12,3]]);
  // Rendering normalizes occurrence transforms in place.
  exploded.components[1].asm.components[0].transform.rx = 42;
  assert.equal(drawingAssemblyPose(assembly,'removed'),null);
  assert.deepEqual(assembly,original);
});

test('switching pose witnesses legacy coordinate dimensions against their own former projections', () => {
  const assembly = fixture();
  assembly.drawing={views:[
    {id:'front',dir:'front',assemblyState:'pull'},
    {id:'detail',dir:'front',detail:{from:'front',u:15,v:4,radius:3}},
    {id:'independent',dir:'front',assemblyState:'pull'},
  ],dims:[]};
  const doc = () => ensureSheetDoc(assembly);
  const controller = createDrawingController({doc,bodies:()=>[],bodiesToken:()=>0,
    bodiesForView:view=>assemblySourceBodies(drawingAssemblyPose(assembly,viewSourceOwner(doc(),view).assemblyState),{includeOffsets:true}),
    t:key=>key,refresh(){},pushUndo(){},markDirty(){}});
  for (const place of controller.scene().views) {
    const edge = place.projection.visible.find(s=>s.a.u>12 && s.b.u>12);
    assert.ok(edge,place.id);
    doc().dims.push({id:place.id,viewId:place.id,type:'aligned',refs:[edge.a,edge.b],offset:5});
  }
  controller.select({kind:'view',id:'front'});
  controller.setSheetOption('viewAssemblyState','assembled');
  const cold = JSON.parse(JSON.stringify(assembly));
  const render = () => buildDrawingScene(cold,{overallDimensions:false,holeCallouts:false});
  let scene = render();
  for (const id of ['front','detail']) {
    assert.ok(scene.dims.get(id).dangling,id);
    assert.ok(scene.dims.get(id).dim.sourceBinding.anchors.every(a=>a.length));
  }
  assert.equal(scene.dims.get('independent').dangling,false);
  cold.drawing.views[0].assemblyState='pull';
  scene = render();
  assert.ok([...scene.dims.values()].every(dim=>!dim.dangling),'restored geometry satisfies the original picks');
});

test('standalone export restores BOM balloon numbers and native anchors for each saved host pose', () => {
  const assembly = structuredClone(fixture());
  assembly.components[0].modelKey='base';
  assembly.components[1].assemblyKey='carriage';
  const bolt=assembly.components[1].asm.components[0];
  bolt.modelKey='bolt';
  bolt.def.parts[0].meshData={positions:[0,0,0, 3,0,0, 0,3,0]};
  assembly.drawingSettings={bomScope:'indented'};
  applyExplodedProgress(assembly,'pull',0.25);
  assembly.drawing={views:['assembled','pull',null].map((state,i)=>({id:'v'+i,dir:'front',assemblyState:state})),
    notes:[0,1,2].map(i=>({id:'n'+i,balloon:true,autoBalloon:true,text:'old',leader:{viewId:'v'+i,u:99,v:99},
      componentBalloon:{path:['group','bolt']}}))};
  const render = a => buildDrawingScene(a,{overallDimensions:false,holeCallouts:false});
  const scene=render(assembly);
  assert.ok(!scene.diagnostics.some(d=>d.code==='missing-component-balloon'));
  const expected=[[3,1],[15,4],[8,1]];
  expected.forEach(([u,v],i)=>{
    const note=scene.notes.get('n'+i).note;
    assert.equal(note.text,'2.1');
    assert.ok(Math.abs(note.leader.u-u)<1e-8 && Math.abs(note.leader.v-v)<1e-8,JSON.stringify(note.leader));
  });
  const cold=JSON.parse(JSON.stringify(assembly));
  assert.equal(sceneToSvg(render(cold)),sceneToSvg(scene));
  cold.components[1].asm.components[0].visible=false;
  assert.equal(render(cold).diagnostics.filter(d=>d.code==='missing-component-balloon').length,3);
});

test('export projects each referenced assembly state, including inherited section geometry and dimensions', async () => {
  const assembly = fixture();
  applyExplodedProgress(assembly,'pull',0.25);
  await putAssemblyLibraryRecord(assembly);
  const source = {kind:'assembly',key:assembly.key};
  const owner = {name:'Sheet',parts:[],drawing:{views:[
    {id:'front',dir:'front',source}, {id:'apart',dir:'front',source,assemblyState:'pull'},
    {id:'cut',dir:'front',section:{from:'apart',axis:'horizontal',at:1}},
    {id:'lost',dir:'iso',source,assemblyState:'deleted'},
  ],dims:[{id:'width',type:'horizontal',viewId:'apart',auto:'extent',refs:[],offset:-8}]}};
  const render = () => buildDrawingScene(owner,{overallDimensions:false,holeCallouts:false});
  const scene = render();
  const width = place => place.projection.bounds.u1-place.projection.bounds.u0;
  assert.equal(width(scene.views[0]),4,'legacy library source uses the assembled pose');
  assert.equal(width(scene.views[1]),16);
  const dim=scene.dims.get('width');
  assert.equal(dim.dangling,false);
  assert.equal(dim.dim.refs[1].u-dim.dim.refs[0].u,16);
  assert.ok(scene.items.some(i=>i.explodeLeader && i.viewId==='apart'));
  assert.equal(scene.views[3].projection.bounds,null);
  assert.ok(scene.diagnostics.some(d=>d.viewId==='lost' && /missing/.test(d.message)));
  const sectionBefore = scene.views[2].projection.bounds;
  owner.drawing.views[1].assemblyState='assembled';
  const rest = render();
  assert.equal(width(rest.views[1]),4);
  assert.notDeepEqual(rest.views[2].projection.bounds, sectionBefore);
  assert.equal(rest.items.filter(i=>i.explodeLeader).length,0);
});
