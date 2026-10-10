import test from 'node:test';
import assert from 'node:assert/strict';
import {canCropView,cropSplinePoints,pointInCrop,cropDrawingProjection} from '../js/core/drawing_crop.js';
import {polygonArea,tessellateParts} from '../js/core/part_tessellate.js';
import {createView,createSheetDoc,createProjector,buildSheetScene,sceneToSvg} from '../js/cad_sheet.js';

const sketch={type:'closed-spline',closed:true,points:[{u:-3,v:-3},{u:3,v:-3},{u:3,v:3},{u:-3,v:3}]};
const empty={visible:[],hidden:[],cuts:[],circles:[],surfaces:[]};
test('crop clips crossing visible/hidden/cut edges and retains actual circular arcs only inside boundary',()=>{
  const projection={...empty,visible:[{a:{u:-10,v:0},b:{u:10,v:0}}],hidden:[{a:{u:0,v:-10},b:{u:0,v:10}}],cuts:[{a:{u:-10,v:1},b:{u:10,v:1}}],circles:[{u:0,v:0,radius:1,drawn:'visible'},{u:3,v:0,radius:2,drawn:'hidden'},{u:20,v:0,radius:1,drawn:'visible'}]};
  const result=cropDrawingProjection(projection,sketch),boundary=cropSplinePoints(sketch);
  assert.equal(result.circles.length,1,'fully enclosed circle survives, partial/outside circles do not');
  assert.ok(result.hidden.length>1,'partial circle becomes bounded line spans');
  for(const key of ['visible','hidden','cuts']) for(const edge of result[key]) for(const p of [edge.a,edge.b]) assert.ok(pointInCrop(p,boundary));
  assert.equal(projection.visible[0].a.u,-10,'projection input is unchanged');
});
test('concave closed spline clips shaded geometry with conserved enclosed area',()=>{
  const concave={type:'closed-spline',points:[{u:-4,v:-4},{u:4,v:-4},{u:4,v:4},{u:0,v:1},{u:-4,v:4}]};
  const boundary=cropSplinePoints(concave);
  const result=cropDrawingProjection({...empty,surfaces:[{fill:'#aaa',points:[{u:-10,v:-10,w:2},{u:10,v:-10,w:2},{u:10,v:10,w:2},{u:-10,v:10,w:2}]}]},concave);
  const area=result.surfaces.reduce((sum,s)=>sum+Math.abs(polygonArea(s.points)),0);
  assert.ok(Math.abs(area-Math.abs(polygonArea(boundary)))<1e-6,'triangulated crop preserves concave enclosed area');
  for(const surface of result.surfaces) for(const p of surface.points) {assert.ok(pointInCrop(p,boundary));assert.equal(p.w,2);}
});
test('crop rejects degenerate/nonfinite/self-crossing boundaries and source-forbidden parent types',()=>{
  for(const points of [[{u:0,v:0},{u:1,v:1}], [{u:0,v:0},{u:1,v:0},{u:NaN,v:2}], [{u:0,v:0},{u:2,v:2},{u:0,v:2},{u:2,v:0}]]) assert.throws(()=>cropSplinePoints({type:'closed-spline',points}));
  const parent=createView('iso',{id:'p'}),doc={views:[parent]};
  assert.equal(canCropView(parent,doc),true);
  assert.equal(canCropView({...parent,detail:{}},doc),false);
  assert.equal(canCropView(parent,doc,{exploded:true}),false);
  doc.views.push(createView('iso',{detail:{from:'p'}}));
  assert.equal(canCropView(parent,doc),false);
});
test('cropped Section retains closed-source hatching while rendering only cropped strokes after cold JSON/SVG',()=>{
  const doc=createSheetDoc(),parent=createView('front',{id:'p',primary:true}),section=createView('top',{id:'s',parent:'p',section:{from:'p',axis:'horizontal',at:0},cropSketch:sketch});
  doc.views=[parent,section];
  const bodies=tessellateParts([{kind:'box',x0:-10,x1:10,y0:-5,y1:5,z0:-8,z1:8}]);
  const build=d=>buildSheetScene(d,{projection:createProjector(d,bodies)});
  const warm=build(doc),cold=build(JSON.parse(JSON.stringify(doc)));
  assert.equal(sceneToSvg(warm),sceneToSvg(cold));
  const place=warm.views.find(p=>p.id==='s'),boundary=place.projection.cropBoundary;
  assert.equal(warm.diagnostics.length,0,'closed original section remains valid despite crop intersection');
  const strokes=warm.items.filter(item=>item.viewId==='s'&&['hatch','section','outline'].includes(item.style)&&item.type==='line');
  assert.ok(strokes.some(item=>item.style==='hatch'),'cropping preserves actual hatch strokes');
  for(const item of strokes) for(const p of [{x:item.x1,y:item.y1},{x:item.x2,y:item.y2}]) assert.ok(pointInCrop(place.toModel(p),boundary));
});
