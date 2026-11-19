// Test/QA oracle scoring only. This tool is never imported by the application.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function source(document){
 const graph=document.spatial||document.reconstruction||document;
 const cal=document.blueprintTrace||document.referenceCalibration;
 if(!cal?.cmPerPx)throw new Error('A source-image calibration is required for both inputs.');
 const point=p=>({x:(p.x-cal.originX)/cal.cmPerPx,y:(p.z-cal.originZ)/cal.cmPerPx});
 const items=(graph.instances||graph.items||[]).map(i=>{
  const angle=(i.rot||0)*Math.PI/180,w=(Math.abs(Math.cos(angle))*i.w+Math.abs(Math.sin(angle))*i.d)/cal.cmPerPx,
   d=(Math.abs(Math.sin(angle))*i.w+Math.abs(Math.cos(angle))*i.d)/cal.cmPerPx;
  return {type:i.type,...point(i),w,d};
 });
 const walls=(graph.walls||[]).map(w=>({a:point(typeof w.a==='object'?w.a:graph.nodes[w.a]),b:point(typeof w.b==='object'?w.b:graph.nodes[w.b])}));
 return {items,walls};
}
function iou(a,b){
 const area=Math.max(0,Math.min(a.x+a.w/2,b.x+b.w/2)-Math.max(a.x-a.w/2,b.x-b.w/2))*Math.max(0,Math.min(a.y+a.d/2,b.y+b.d/2)-Math.max(a.y-a.d/2,b.y-b.d/2));
 return area/(a.w*a.d+b.w*b.d-area);
}
function distance(p,w){
 const dx=w.b.x-w.a.x,dy=w.b.y-w.a.y,t=Math.max(0,Math.min(1,((p.x-w.a.x)*dx+(p.y-w.a.y)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(p.x-w.a.x-dx*t,p.y-w.a.y-dy*t);
}
function coverage(walls,reference,tolerance){
 let total=0,covered=0;
 for(const wall of walls){const length=Math.hypot(wall.b.x-wall.a.x,wall.b.y-wall.a.y),steps=Math.max(1,Math.ceil(length));
  for(let j=0;j<steps;j++){const t=(j+.5)/steps,p={x:wall.a.x+(wall.b.x-wall.a.x)*t,y:wall.a.y+(wall.b.y-wall.a.y)*t};
   total+=length/steps;if(reference.some(w=>distance(p,w)<=tolerance))covered+=length/steps;
  }
 }
 return {totalPx:Math.round(total),supportedPx:Math.round(covered),unsupportedPx:Math.round(total-covered),fraction:total?covered/total:0};
}
export function scoreBlueprintRecognition(actual,expected,{minIoU=.25,wallTolerancePx=4}={}){
 const a=source(actual),e=source(expected),used=new Set(),types={};
 for(const type of new Set([...e.items,...a.items].map(i=>i.type)))types[type]={expected:e.items.filter(i=>i.type===type).length,detected:a.items.filter(i=>i.type===type).length,matched:0};
 for(const item of e.items){let best=null;for(let i=0;i<a.items.length;i++)if(!used.has(i)&&a.items[i].type===item.type){const overlap=iou(item,a.items[i]);if(overlap>=minIoU&&(!best||overlap>best.overlap))best={i,overlap};}
  if(best){used.add(best.i);types[item.type].matched++;}
 }
 const matched=used.size;
 return {types,fixtureMatches:matched,fixtureRecall:e.items.length?matched/e.items.length:0,fixturePrecision:a.items.length?matched/a.items.length:0,
  actualWallSupport:coverage(a.walls,e.walls,wallTolerancePx),expectedWallCoverage:coverage(e.walls,a.walls,wallTolerancePx)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [actual,expected]=process.argv.slice(2);if(!actual||!expected)throw new Error('Usage: node tools/blueprint_score.mjs actual.json expected.json');
 console.log(JSON.stringify(scoreBlueprintRecognition(JSON.parse(readFileSync(actual,'utf8')),JSON.parse(readFileSync(expected,'utf8'))),null,2));
}
