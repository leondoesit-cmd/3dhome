import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSpec, makeBlankSpec, layoutCab, checkCab, cutList, PRESETS, FAM } from '../js/cabinet.js';
import { S } from '../js/state.js';
import { cabinetDefinitionFromItem, finalizeCabinetAdvancedDefinition, requestCabinetDimension, applyCabinetDimension, syncCabinetDefinition } from '../js/parametric_cabinet.js';
import { captureCabinetSession, restoreCabinetSession } from '../js/cabinet_session.js';
import { cabinetSheetNesting, cabinetAdvancedManufacturing } from '../js/core/cabinet_advanced.js';
import { rebuildDefinition } from '../js/core/rebuild.js';
import { rebuildParametricDocument, publishRebuildStatus } from '../js/core/parametric_rebuild.js';
import { cylinderBounds } from '../js/core/cylinder_axis.js';
import { semanticCabinetParts, cabinetLayoutParts } from '../js/core/cabinet_parts.js';

function item(id='test', preset='w_classic', w=120, h=240, d=60) {
  return {id,type:'cabsys',w,h,d,cab:makeSpec(preset,w,h,d)};
}
const errors = (run) => run.issues.filter((issue) => issue.severity === 'error');

test('no resize proposal offers a layout with hard construction errors, including clamps', () => {
  for (const [dimension,value] of [['depth',20],['depth',1],['height',300],['height',999],['width',130],['width',600]]) {
    const source=item(), response=requestCabinetDimension(source,dimension,value,280);
    for(const choice of response.status==='applied'?[response]:response.alternatives || []) {
      const probe=structuredClone(source);probe[{width:'w',height:'h',depth:'d'}[dimension]]=choice.value;probe.cab=choice.spec;
      assert.equal(checkCab(probe,280).filter(issue=>issue.level==='err').length,0,dimension+' '+value);
    }
  }
  assert.equal(requestCabinetDimension(item(),'depth',20,280).alternatives.length,0);
  assert.equal(applyCabinetDimension({items:[]},item(),{status:'applied',dimension:'depth',value:20,spec:item().cab}),null);
});

test('accepted custom layout does not silently replan during the next rebuild',()=>{
 const source=item();source.cab.auto=false;const before=source.cab.cols.map(c=>c.hid);
 const response=requestCabinetDimension(source,'width',160,280);
 const result=applyCabinetDimension({items:[source]},source,response,response.alternatives?.[0]?.id);
 assert.ok(result);layoutCab(source);assert.deepEqual(source.cab.cols.map(c=>c.hid),before);
});

test('dimension edits are instance-specific and session restoration restores linked layouts exactly',()=>{
 const a=item('a'),state={items:[a]};syncCabinetDefinition(state,a);
 const b=structuredClone(a);b.id='b';b.w=140;state.items.push(b);
 const before=captureCabinetSession(state,a);
 const response=requestCabinetDimension(a,'width',130,280);assert.ok(applyCabinetDimension(state,a,response,response.alternatives?.[0]?.id));
 assert.equal(a.w,130);assert.equal(b.w,140);
 const after=captureCabinetSession(state,a);
 restoreCabinetSession(state,a,before);syncCabinetDefinition(state,a);
 assert.deepEqual(captureCabinetSession(state,a),before);
 restoreCabinetSession(state,a,after);syncCabinetDefinition(state,a);
 assert.deepEqual(captureCabinetSession(state,a),after);
});

test('advanced nesting rejects oversized panels, permits exact fits and respects material groups',()=>{
 const row=(id,width,height,materialRole='board')=>({partId:id,classified:true,role:'panel',width,height,materialRole});
 const result=cabinetSheetNesting([row('too-wide',400,100),row('too-tall',100,400),row('fit',280,207),row('small',70,80),row('front',70,80,'front')]);
 assert.deepEqual(result.unplaced,['too-wide','too-tall']);
 for(const sheet of result.sheets) for(const p of sheet.placements){assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=sheet.width&&p.y+p.height<=sheet.height);}
 assert.equal(result.sheets.length,3);
 const bad=cabinetAdvancedManufacturing({addedParts:[{id:'big',kind:'box',role:'panel',materialRole:'board',x0:0,x1:400,y0:0,y1:100,z0:0,z1:1.8}]});
 assert.equal(bad.complete,false);
});

test('advanced nesting has no overlap across row wraps and rotations',()=>{
 const rows=Array.from({length:80},(_,i)=>({partId:String(i),role:'panel',classified:true,width:25+(i*31)%220,height:20+(i*17)%150}));
 const result=cabinetSheetNesting(rows);
 assert.equal(result.unplaced.length,0);
 for(const sheet of result.sheets) for(let i=0;i<sheet.placements.length;i++) for(let j=i+1;j<sheet.placements.length;j++){
  const a=sheet.placements[i],b=sheet.placements[j];assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
 }
});

test('every cabinet preset imports as a valid native model-editor document',()=>{
 for(const preset of PRESETS){const f=FAM[preset.fam],source=item(preset.id,preset.id,f.w,f.h,f.d),def=cabinetDefinitionFromItem(source);
  const run=rebuildParametricDocument(JSON.parse(JSON.stringify(def)));assert.equal(run.ok,true,preset.id+': '+JSON.stringify(errors(run)));
  assert.equal(def.parts.length,layoutCab(source).parts.length);assert.equal(def.w,source.w);assert.equal(def.d,source.d);assert.equal(def.h,source.h);
 }
});

test('cabinet parameter changes regenerate actual panel geometry and keep panel thickness',()=>{
 const def=cabinetDefinitionFromItem(item());
 const run=rebuildParametricDocument(def,{width:160,height:260,depth:70});assert.equal(run.ok,true,JSON.stringify(errors(run)));
 const sides=run.document.parts.filter(p=>p.role==='side');assert.equal(sides[0].x0,-80);assert.equal(sides[1].x1,80);
 assert.ok(Math.abs(sides[0].x1-sides[0].x0-1.8)<1e-8);assert.equal(run.document.metadata.cabSpec.dim.h,260);
 const thick=rebuildDefinition(def,{panelThickness:2.5});assert.equal(thick.ok,true);assert.equal(thick.document.parts.find(p=>p.role==='side').x1,-57.5);
 publishRebuildStatus(def,run);assert.equal(def.parts[0].id,run.document.parts[0].id);assert.equal(def.w,160);
});

test('open-backed and floating cabinets accept zero back thickness in CAD',()=>{
 const source=item();source.cab.carcass='open';source.cab.back=0;
 const run=rebuildParametricDocument(cabinetDefinitionFromItem(source));assert.equal(run.ok,true,JSON.stringify(errors(run)));
});

test('cabinet cylinder conversion preserves centre and direction for rails and legs',()=>{
 const source=item(),layout=layoutCab(source),parts=semanticCabinetParts(layout),roundtrip=cabinetLayoutParts(parts);
 layout.parts.forEach((p,i)=>{if(p.k!=='cyl')return;const q=parts[i],r=roundtrip[i];assert.ok(Math.abs(r.x-p.x)<1e-8);assert.ok(Math.abs(r.y-p.y)<1e-8);assert.ok(Math.abs(r.z-p.z)<1e-8);
  const bounds=cylinderBounds(q);for(const axis of ['x','y','z'])assert.ok(Math.abs((bounds[axis+'0']+bounds[axis+'1'])/2-p[axis])<1e-8);
 });
});

test('model-editor save/reopen preserves authored offsets while untouched panels regenerate',()=>{
 const source=item(),def=cabinetDefinitionFromItem(source);const side=def.parts.find(p=>p.role==='side');side.x0-=.5;side.x1-=.5;
 const saved=finalizeCabinetAdvancedDefinition(def,source),run=rebuildParametricDocument(JSON.parse(JSON.stringify(saved)),{width:160});assert.equal(run.ok,true,JSON.stringify(errors(run)));
 assert.equal(run.document.parts.find(p=>p.id===side.id).x0,-80.5);
 assert.equal(run.document.parts.filter(p=>p.role==='side')[1].x1,80);
 const savedAgain=finalizeCabinetAdvancedDefinition(run.document,{...source,w:160,cab:run.document.metadata.cabSpec});
 assert.equal(savedAgain.w,160);assert.equal(savedAgain.parts.find(p=>p.id===side.id).x0,-80.5);
});

test('no-op cabinet model-editor save does not invent advanced geometry',()=>{
 for(const preset of ['w_classic','k_corner']){
  const source=item('plain',preset),def=cabinetDefinitionFromItem(source),saved=finalizeCabinetAdvancedDefinition(def,source);
  assert.equal(Object.keys(saved.metadata.advancedEdits.partOverrides).length,0);assert.equal(saved.metadata.advancedEdits.addedSketches.length,0);
  assert.deepEqual(saved.metadata.bom,def.metadata.bom);
 }
});

test('edited cabinet board geometry feeds the same BOM used by the designer',()=>{
 const source=item(),def=cabinetDefinitionFromItem(source);const shelf=def.parts.find(p=>p.role==='shelf');shelf.x1-=5;
 const saved=finalizeCabinetAdvancedDefinition(def,source),prior=S.parametric;source.definitionId=saved.id;
 try{S.parametric={definitions:{[saved.id]:saved}};assert.deepEqual(cutList(source),saved.metadata.bom);}
 finally{S.parametric=prior;}
});

test('authored feature and suppression history survive cabinet regeneration and save',()=>{
 const source=item(),def=rebuildParametricDocument(cabinetDefinitionFromItem(source)).document;
 const first=def.history.find(e=>e.kind==='feature');first.suppressed=true;
 const added={id:'user:box',type:'box',name:'Added block',params:{x:0,y:0,z:0,w:2,h:2,d:2},references:{},inputs:[]};
 def.features.push(added);def.history.push({id:'history:user:box',kind:'feature',targetId:added.id});
 def.parameters.width.value=160;
 const run=rebuildParametricDocument(def);assert.equal(run.ok,true,JSON.stringify(errors(run)));
 assert.ok(run.document.features.some(f=>f.id===added.id));
 assert.equal(run.document.history.find(e=>e.id===first.id).suppressed,true);
 const saved=finalizeCabinetAdvancedDefinition(run.document,source);
 assert.ok(saved.features.some(f=>f.id===added.id));
 assert.equal(saved.history.find(e=>e.id===first.id).suppressed,true);
 assert.equal(saved.w,160);
});

test('construction-invalid model parameters fail without mutating the source',()=>{
 const source=item(),def=cabinetDefinitionFromItem(source),before=JSON.stringify(def);
 const run=rebuildParametricDocument(def,{depth:20});
 assert.equal(run.ok,false);assert.ok(errors(run).some(e=>e.code==='cabinet-construction'));
 assert.equal(JSON.stringify(def),before);
});
