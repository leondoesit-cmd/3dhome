import test from 'node:test';
import assert from 'node:assert/strict';
import {SECTION_HATCH_PATTERNS,normalizeSectionHatch,sectionHatchSegments} from '../js/core/section_hatch.js';
import {hatchLoops,createSheetDoc,addViewToSheet,ensureSheetDoc,buildSheetScene,createProjector,sceneToSvg} from '../js/cad_sheet.js';
import {createDrawingController} from '../js/modeler_drawing.js';
import {tessellateParts} from '../js/core/part_tessellate.js';
const square=(a,b)=>[{x:a,y:a},{x:b,y:a},{x:b,y:b},{x:a,y:b}];
const loops=[square(0,30),square(10,20)];
for(const {value} of SECTION_HATCH_PATTERNS)test(`${value} clips every solid/broken stroke to outer boundary and excludes hole`,()=>{
 const segments=sectionHatchSegments(loops,value,hatchLoops);assert.ok(segments.length>0);
 for(const s of segments)for(let t=0;t<=1;t+=.05){
  const x=s.x1+(s.x2-s.x1)*t,y=s.y1+(s.y2-s.y1)*t;
  assert.ok(x>=-1e-7&&y>=-1e-7&&x<=30+1e-7&&y<=30+1e-7);
  assert.ok(!(x>10+1e-7&&x<20-1e-7&&y>10+1e-7&&y<20-1e-7),`${value}: ink in bore`);
 }
});

test('six source patterns have distinct geometry and broken rows contain finite gaps',()=>{
 const outputs=SECTION_HATCH_PATTERNS.slice(1).map(p=>JSON.stringify(sectionHatchSegments(loops,p.value,hatchLoops)));
 assert.equal(new Set(outputs).size,6);
 const segments=sectionHatchSegments([square(0,30)],'copper-brass',hatchLoops);
 const broken=segments.filter(s=>Math.abs((((-s.x1+s.y1)/Math.SQRT2)%4.4+4.4)%4.4-2.2)<1e-6);
 assert.ok(broken.length>10);assert.ok(broken.every(s=>Math.hypot(s.x2-s.x1,s.y2-s.y1)<=2+1e-7));
 assert.equal(normalizeSectionHatch('unknown'),'uniform');
});

test('ordinary selected-section setting survives normalization/cold and updates canvas/SVG scene without geometry mutation',()=>{
 const def={name:'Hatch sample',parts:[{kind:'box',x0:-10,x1:10,y0:0,y1:10,z0:-5,z1:5}],drawing:createSheetDoc({views:['top']})};
 const doc=def.drawing,parent=doc.views[0],section=addViewToSheet(doc,'front',{parent:parent.id,section:{axis:'horizontal',at:0,from:parent.id,flip:false,tag:'A'}});
 const body=tessellateParts(def.parts),before=JSON.stringify(def.parts),steps=[];
 const c=createDrawingController({doc:()=>ensureSheetDoc(def),model:()=>def,bodies:()=>body,bodiesToken:()=>1,canvas:()=>({}),width:()=>390,height:()=>844,t:k=>k,pushUndo:()=>steps.push(JSON.stringify(def.drawing)),markDirty(){},refresh(){}});
 c.select({kind:'view',id:section.id});const original=c.svg();
 for(const {value} of SECTION_HATCH_PATTERNS.slice(1)){
  c.setSheetOption('viewHatchPattern',value);
  assert.equal(ensureSheetDoc(def).views.at(-1).hatchPattern,value);
  const warm=c.svg(),cold=JSON.parse(JSON.stringify(def));ensureSheetDoc(cold);
  assert.equal(sceneToSvg(buildSheetScene(cold.drawing,{model:cold,projection:createProjector(cold.drawing,body)})),warm);
  if(value!=='cast-iron')assert.notEqual(warm,original);
 }
 assert.equal(steps.length,6);assert.equal(JSON.stringify(def.parts),before);
 def.drawing=JSON.parse(steps[0]);assert.equal(c.svg(),original,'Undo restores uniform scene');
 def.drawing.views.at(-1).hatchPattern='bad';assert.equal(ensureSheetDoc(def).views.at(-1).hatchPattern,'uniform');
});
