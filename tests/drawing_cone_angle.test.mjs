import test from 'node:test';
import assert from 'node:assert/strict';
import {coneDraftAngle} from '../js/core/drawing_cone_angle.js';
import {viewBasis} from '../js/core/hidden_line.js';
import {createTopologyIndex,resolveDim,measureDim,ensureSheetDoc} from '../js/cad_sheet.js';
import {planModelItems} from '../js/core/model_items.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {tessellateParts} from '../js/core/part_tessellate.js';

const face=(id='boss',angle=5)=>({kind:'face',persistentId:id+':tool:face:generated:cone:1',descriptor:{surface:'cone',referenceOrigin:{x:0,y:9.906,z:0},axis:{x:0,y:-1,z:0},radius:.635,angle:angle*Math.PI/180,axisRange:[-1.524,0]}});
const feature=id=>({id,type:'extrude',params:{draftAngle:5,depth:1.524}});
const key='feature:boss:draftAngle';
const front=viewBasis('front');
const views=[{id:'top',view:{dir:'top'},projection:{basis:viewBasis('top')}},{id:'front',view:{dir:'front'},projection:{basis:front}},{id:'detail',view:{dir:'front',detail:{u:0,v:10.668,radius:2}},projection:{basis:front}}];

test('native cone face gives genuine side-on5deg arms independent of its arbitrary seam',()=>{
 const source=face(),before=JSON.stringify(source),angle=coneDraftAngle(source,front);
 assert.ok(angle);assert.ok(Math.abs(measureDim({type:'angle',refs:angle.refs})-5)<1e-10);
 assert.ok(Math.abs(angle.refs[0].u-.5016672767864918)<1e-12);
 assert.equal(angle.refs[1].u,.635);assert.equal(angle.refs[1].v,9.906);
 assert.equal(angle.refs[2].u,.635);assert.ok(Math.abs(angle.refs[2].v-11.43)<1e-12);
 assert.equal(coneDraftAngle(source,viewBasis('top')),null,'face-on cone has no true draft silhouette');
 const rotated={...source,descriptor:{...source.descriptor,axis:{x:.6,y:-.8,z:0}}};
 assert.ok(Math.abs(measureDim({type:'angle',refs:coneDraftAngle(rotated,front).refs})-5)<1e-10,'in-plane source rotation preserves native semiangle');
 assert.equal(JSON.stringify(source),before,'native source never rewritten');
});

test('native draft descriptors drive angle and rays after actual face update, including outward cone',()=>{
 const source=face(),result=coneDraftAngle(source,front);
 const dim={type:'angle',refs:result.refs,coneAngle:{faceId:source.persistentId,featureId:'boss',side:1}};
 const changed=face('boss',8),resolved=resolveDim(dim,createTopologyIndex([changed]),front);
 assert.equal(resolved.dangling,false);assert.ok(Math.abs(measureDim(resolved.dim)-8)<1e-10);
 assert.notDeepEqual(resolved.dim.refs,dim.refs);assert.deepEqual(dim.refs,result.refs);
 const outward=coneDraftAngle(face('boss',-5),front,-1);
 assert.ok(outward);assert.ok(Math.abs(measureDim({type:'angle',refs:outward.refs})-5)<1e-10);
});

test('missing, wrong-owner, noncone, tilted axis and nonlinear draft source fail closed',()=>{
 const source=face(),dim={type:'angle',refs:coneDraftAngle(source,front).refs,coneAngle:{faceId:source.persistentId,featureId:'boss'}};
 for(const [entries,basis,projection] of [
  [[],front,null],[[{...source,descriptor:{...source.descriptor,surface:'cylinder'}}],front,null],
  [[source],viewBasis('iso'),null],[[source],front,{nonlinearProjection:true}],
 ])assert.equal(resolveDim(dim,createTopologyIndex(entries),basis,projection).dangling,true);
 assert.equal(resolveDim({...dim,coneAngle:{...dim.coneAngle,featureId:'another'}},createTopologyIndex([source]),front).dangling,true);
 assert.equal(resolveDim(dim,null,front).dangling,true,'no native source cannot certify a cone angle');
 assert.equal(resolveDim(dim,createTopologyIndex([source]),front,null,{features:[]}).dangling,true);
 assert.equal(resolveDim(dim,createTopologyIndex([source]),front,null,{features:[{...feature('boss'),suppressed:true}]}).dangling,true);
 assert.equal(resolveDim(dim,createTopologyIndex([source]),front,null,{features:[{...feature('boss'),params:{draftAngle:8}}]}).dangling,true,'stale native geometry does not certify changed source intent');
});

test('ModelItems selects containing Detail and distinct native boss owners, repeats safely and guards source agreement',()=>{
 const def={features:[feature('boss'),feature('second')]};
 const first=face(),second=face('second');second.descriptor={...second.descriptor,referenceOrigin:{x:-1,y:9.906,z:0}};
 const scene={views,topologyIndex:createTopologyIndex([first,second])};
 const dims=planModelItems(def,{dims:[]},scene);
 assert.equal(dims.length,2);assert.ok(dims.every(d=>d.viewId==='detail'&&d.type==='angle'&&d.coneAngle&&d.text===undefined));
 assert.ok(dims.some(d=>d.modelItem===key));assert.equal(planModelItems(def,{dims},scene).length,0);
 assert.equal(planModelItems({features:[{...feature('boss'),suppressed:true}]},{dims:[]},scene).length,0);
 assert.equal(planModelItems({features:[{...feature('boss'),params:{draftAngle:9}}]},{dims:[]},scene).length,0,'no stale native face vs source parameter mismatch');
 const croppedViews=views.map(v=>v.id==='detail'?{...v,view:{...v.view,detail:{u:9,v:9,radius:.1}}}:v);
 assert.equal(planModelItems({features:[feature('boss')]},{dims:[]},{...scene,views:croppedViews})[0].viewId,'front');
});

test('ordinary InsertModelItems with normalized host persists cold native angle and shared SVG rays',()=>{
 const source=face();let dirty=0,undo=0;
 const def={features:[feature('boss')],sketches:[],parts:[{id:'p',kind:'cyl',x:0,y:9.906,z:0,r:.635,r2:.5016672767864918,h:1.524}]};
 const doc=ensureSheetDoc(def);doc.views=[{id:'front',dir:'front',primary:true},{id:'detail',dir:'front',parent:'front',detail:{from:'front',u:0,v:10.668,radius:2,tag:'A'},scale:1,scaleMode:'custom'}];
 const topology=[source];
 const host=model=>({doc:()=>ensureSheetDoc(model),model:()=>model,bodies:()=>tessellateParts(model.parts),bodiesToken:()=>1,topology:()=>topology,t:s=>s,canvas:()=>({}),width:()=>900,height:()=>600,pushUndo:()=>{undo++;ensureSheetDoc(model);},markDirty:()=>dirty++,flash:()=>{},refresh:()=>{}});
 const controller=createDrawingController(host(def));
 assert.equal(controller.insertModelItems(),1);assert.equal(dirty,1);assert.equal(undo,1);
 const dim=def.drawing.dims.find(d=>d.modelItem===key);assert.equal(dim.viewId,'detail');assert.ok(dim.coneAngle.faceId===source.persistentId);
 assert.match(controller.svg(),/>5°</);assert.equal(controller.insertModelItems(),0);
 controller.select(null);
 const cold=JSON.parse(JSON.stringify(def)),reopened=createDrawingController(host(cold));
 assert.equal(reopened.svg(),controller.svg());assert.equal(reopened.insertModelItems(),0);
 topology[0]=face('boss',8);def.features[0].params.draftAngle=8;controller.invalidate();
 assert.match(controller.svg(),/>8°</);assert.equal(def.drawing.dims[0].text,undefined,'no literal angle override');
});
