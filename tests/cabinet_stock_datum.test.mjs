import test from 'node:test';
import assert from 'node:assert/strict';
import {cabinetCNCBundle} from '../js/cabinet_postprocessor.js';
import {newCabinetShopProfile} from '../js/cabinet_shop_profiles.js';
import {makeSpec,normalizeSpec} from '../js/cabinet.js';
import {cabinetProductionParts} from '../js/cabinet_production_parts.js';
import {cabinetManufacturingReport,cabinetDrillingRecipeDraft} from '../js/cabinet_manufacturing.js';
function fixture(){
 const item={id:'stock',type:'cabsys',w:60,h:100,d:60,x:0,y:0,rot:0,cab:makeSpec('w_classic',60,100,60)};
 item.cab.auto=false;item.cab.cols=[{w:56.4,door:{t:'hinged',leaves:1,hinge:'L'},secs:[{t:'shelves',h:80,n:2}]}];normalizeSpec(item.cab,item.w,item.h,item.d);
 let part=cabinetProductionParts([item]).parts.find(p=>p.role==='side');
 const override={datum:part.datum,topologyBinding:part.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(name=>[name,{thicknessMm:name==='lengthStart'?2:0,stockId:name==='lengthStart'?'abs_white_2':null}])),roughAllowance:{lengthMm:6,widthMm:4}};
 item.cab.productionOverrides={[part.partId]:override};part=cabinetProductionParts([item]).parts.find(p=>p.id===part.id);
 override.machiningDatum={datum:part.datum,topologyBinding:part.topologyBinding,stockSignature:part.stockSignature,reviewedBy:'Shop reviewer',sourceDrawing:'Fixture drawing 1',lengthStartExtraMm:4,widthStartExtraMm:1};
 return {item,part,override};
}
function recipe(item,part){const r=cabinetDrillingRecipeDraft([item])[0];r.partNumber='shop hardware';r.sourceDrawing='shop drawing';for(const p of r.panels){p.noDrillReason='No fixing on this board';if(p.partId===part.partId)p.holes=[{x:50,y:60,d:5,depth:8,through:false,face:'A'},{x:100,y:110,d:5,depth:8,through:false,face:'B'}];}return r;}
test('reviewed stock allocation transforms both faces with one physical datum and updates envelope',()=>{
 const {item,part}=fixture(),r=recipe(item,part);const report=cabinetManufacturingReport([item],[r]);
 assert.ok(!report.issues.some(i=>i.code==='machining-stock-datum'));
 const p=report.items[0].panels.find(p=>p.partId===part.partId);
 assert.equal(p.l,part.rough.length);assert.equal(p.w,part.rough.width);
 assert.equal(p.holes[0].x,52);assert.equal(p.holes[0].y,61);assert.equal(p.holes[1].x,102);assert.equal(p.holes[1].y,111);
 assert.equal(p.datumCode,'reviewed-stock-minimum');
});
test('generic datums, stale stock signatures and invalid surplus allocations remain blocked',()=>{
 const {item,part,override}=fixture();assert.ok(cabinetManufacturingReport([item]).issues.some(i=>i.code==='machining-stock-datum'));
 override.machiningDatum.lengthStartExtraMm=7;assert.ok(cabinetProductionParts([item]).issues.some(i=>i.code==='stock-datum-offset'));
 override.machiningDatum.lengthStartExtraMm=4;override.roughAllowance.lengthMm=7;
 assert.ok(cabinetProductionParts([item]).issues.some(i=>i.code==='stock-datum-stale'));
 const r=recipe(item,part);assert.ok(cabinetManufacturingReport([item],[r]).issues.some(i=>i.code==='stock-datum-stale'));
});
test('cut-stock mapping preserves source drilling edge validation',()=>{
 const {item,part}=fixture(),r=recipe(item,part);r.panels.find(p=>p.partId===part.partId).holes[0].x=1;
 assert.ok(cabinetManufacturingReport([item],[r]).issues.some(i=>i.code==='hole-edge'));
});

test('complete recipe CNC setup uses the reviewed cut-stock dimensions and translated stations',()=>{
 const {item,part}=fixture(),r=recipe(item,part);
 const profile={...newCabinetShopProfile(),name:'Stock datum test',travel:{x:2500,y:1300,z:150},safeZ:15,breakthrough:1,completeRecipes:[r],tools:[{number:1,diameter:5,feed:200,rpm:3000,maxDepth:40,holderDiameter:40,spinupSeconds:2}]};
 const bundle=cabinetCNCBundle([item],profile);assert.deepEqual(bundle.issues,[]);assert.equal(bundle.status,'simulation-ready');
 assert.equal(bundle.setups[0].panelDimensions.l,part.rough.length);assert.equal(bundle.setups[0].operations[0].x,52);
 assert.ok(bundle.files[0].content.includes('G0 X52 Y61'));
});
test('axis-swapped recipes map each station and stock envelope to its declared physical axis',async()=>{
 const {applyCabinetStockMapping}=await import('../js/cabinet_stock_datum.js');
 const {item,part}=fixture();const actual=cabinetProductionParts([item]).parts.find(p=>p.id===part.id);
 const axes=Object.fromEntries(actual.datum.split(';').map(s=>s.split(':')));
 const panel={recipeSource:'source',faceAxis:axes.thickness,xAxis:axes.width,yAxis:axes.length,l:actual.finished.width,w:actual.finished.length,thickness:actual.finished.thickness,holes:[{x:60,y:50,face:'A'}]};
 assert.equal(applyCabinetStockMapping(panel,actual),true);assert.equal(panel.holes[0].x,61);assert.equal(panel.holes[0].y,52);assert.equal(panel.l,actual.rough.width);assert.equal(panel.w,actual.rough.length);
});
test('band deduction supports negative station translation and blocks stock-edge breakout',()=>{
 const {item,part,override}=fixture();override.machiningDatum.lengthStartExtraMm=0;
 let r=recipe(item,part),report=cabinetManufacturingReport([item],[r]);
 assert.equal(report.items[0].panels.find(p=>p.partId===part.partId).holes[0].x,48);
 r.panels.find(p=>p.partId===part.partId).holes[0].x=3;
 report=cabinetManufacturingReport([item],[r]);assert.ok(report.issues.some(i=>i.code==='hole-edge'));
 const profile={...newCabinetShopProfile(),name:'Breakout',travel:{x:2500,y:1300,z:150},safeZ:15,breakthrough:1,completeRecipes:[r],tools:[{number:1,diameter:5,feed:200,rpm:3000,maxDepth:40,holderDiameter:40,spinupSeconds:2}]};
 assert.equal(cabinetCNCBundle([item],profile).files.length,0);
});
