import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSpec,cutList} from '../js/cabinet.js';
import {cabinetProductionParts,cabinetPanelDimensions} from '../js/cabinet_production_parts.js';
import {panelsOf,nest} from '../js/nest.js';
const cabinet=(id,w=60.123)=>({id,type:'cabsys',x:0,y:0,rot:0,w,h:80,d:60,cab:makeSpec('k_base',w,80,60)});
test('production IDs survive order and resize; panels share mm precision',()=>{
 const a=cabinet('a'),b=cabinet('b');
 const one=cabinetProductionParts([a,b]),two=cabinetProductionParts([b,a]);
 assert.deepEqual(one.parts.map(p=>p.id),two.parts.map(p=>p.id));
 const before=cabinetProductionParts([a]);a.w+=1;
 assert.deepEqual(before.parts.map(p=>p.id),cabinetProductionParts([a]).parts.map(p=>p.id));
 for(const p of panelsOf([a])) { assert.equal(p.id,p.production.id);assert.ok(Math.abs(p.l*10-p.production.finished.length)<1e-8); }
 assert.ok(before.parts.some(p=>p.finished && p.finished.length%1!==0));
});
test('missing and duplicate IDs explicitly invalidate job identity',()=>{
 assert.ok(cabinetProductionParts([cabinet(undefined)]).issues.some(i=>i.code==='missing-item-id'));
 const r=cabinetProductionParts([cabinet('a'),cabinet('a')]);
 assert.ok(r.issues.some(i=>i.code==='duplicate-item-id'));
 assert.equal(new Set(r.parts.map(p=>p.id)).size,r.parts.length);
});
test('explicit allowances derive substrate and rough; unknowns and invalid data remain visible',()=>{
 const a=cabinet('a'),p=cabinetProductionParts([a]).parts.find(p=>p.geometry==='rectangle');
 assert.equal(p.substrate,null);assert.equal(p.edges,null);
 a.cab.productionOverrides={[p.partId]:{datum:p.datum,topologyBinding:p.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(n=>[n,{thicknessMm:2,stockId:'abs_white_2'}])),roughAllowance:{lengthMm:4,widthMm:6}}};
 let result=cabinetProductionParts([a]).parts.find(x=>x.id===p.id);
 assert.equal(result.substrate.length,p.finished.length-4);assert.equal(result.rough.width,p.finished.width+2);
 a.cab.productionOverrides[p.partId].edges.lengthStart.thicknessMm=-1;
 assert.ok(cabinetProductionParts([a]).issues.some(i=>i.code==='invalid-edge-allowance'));
 assert.equal(cabinetPanelDimensions({k:'authored'}),null);
});
test('cut list keeps fractional millimetres separate',()=>{
 const a=cabinet('a');const rows=cutList(a,{sp:a.cab,parts:[60.123,60.124].map(w=>({k:'box',role:'shelf',mat:'carcass',x0:0,x1:w,y0:0,y1:1.8,z0:0,z1:40}))});
 assert.equal(rows.length,2);assert.equal(rows[0].l,60.123);
});

test('edge provenance and stocked thickness must be explicit; tilted boxes are unsupported',()=>{
 const a=cabinet('a'),p=cabinetProductionParts([a]).parts.find(p=>p.geometry==='rectangle');
 const override={datum:p.datum,topologyBinding:p.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(n=>[n,{thicknessMm:2,stockId:'abs_white_2'}]))};
 a.cab.productionOverrides={[p.partId]:override};
 let parts=panelsOf([a]);const panel=parts.find(q=>q.id===p.id);
 assert.equal(panel.band,(2*p.finished.length+2*p.finished.width)/1000);
 const nested=nest([panel],{useStock:false});assert.equal(nested.bandBy.abs_white_2,panel.band);
 override.edges.lengthStart.stockId='unregistered';
 assert.ok(cabinetProductionParts([a]).issues.some(i=>i.code==='invalid-edge-allowance'));
 override.edges.lengthStart.stockId='abs_white_2';override.datum='length:wrong';
 assert.ok(cabinetProductionParts([a]).issues.some(i=>i.code==='edge-datum-mismatch'));
 const box={k:'box',x0:0,x1:20,y0:0,y1:1.8,z0:0,z1:30};
 assert.equal(cabinetPanelDimensions({...box,tilt:0.1}),null);
 assert.equal(cabinetPanelDimensions({...box,cut:2}),null);
});
test('nest dimensions retain differences smaller than one millimetre',()=>{
 const a=cabinet('a',60.123),b=cabinet('b',60.124);
 const first=panelsOf([a]),second=panelsOf([b]);
 assert.ok(first.some(p=>{const q=second.find(q=>q.partId===p.partId);return q && Math.abs(p.l-q.l)>0.0001 && Math.abs(p.l-q.l)<0.01;}));
});
test('resize across dimension ordering invalidates bound edge allowances',()=>{
 const a=cabinet('a',60),p=cabinetProductionParts([a]).parts.find(p=>p.role==='fixedShelf');
 a.cab.productionOverrides={[p.partId]:{datum:p.datum,topologyBinding:p.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(n=>[n,{thicknessMm:0}]))}};
 assert.ok(cabinetProductionParts([a]).parts.find(q=>q.id===p.id).substrate);
 a.w=40;const after=cabinetProductionParts([a]);
 assert.notEqual(after.parts.find(q=>q.id===p.id).datum,p.datum);
 assert.equal(after.parts.find(q=>q.id===p.id).substrate,null);
 assert.ok(after.issues.some(i=>i.code==='edge-datum-mismatch'));
});
test('unsupported tilted boards explicitly mark partial quote and cut export',async()=>{
 const {quote,cutCSV}=await import('../js/nest.js');
 const it={id:'shoe',type:'cabsys',x:0,y:0,rot:0,w:100,h:120,d:38,cab:makeSpec('shoe',100,120,38)};
 const q=quote([it]);assert.equal(q.manufacturingReviewRequired,true);
 assert.ok(q.productionIssues.some(i=>i.code==='unsupported-geometry'));
 assert.match(cutCSV(q,true),/PARTIAL ESTIMATE/);assert.match(cutCSV(q,true),/unsupported-geometry/);
});
test('topology binding preserves resize but blocks reordered and inserted occurrences',()=>{
 const a=cabinet('a');a.cab.auto=false;
 a.cab.cols=[{hid:'column-a',w:56.523,door:{t:'none'},secs:[{hid:'section-a',t:'shelves',h:25,n:1},{hid:'section-b',t:'shelves',h:35,n:2}]}];
 const p=cabinetProductionParts([a]).parts.find(p=>p.role==='shelf');
 a.cab.productionOverrides={[p.partId]:{datum:p.datum,topologyBinding:p.topologyBinding,edges:Object.fromEntries(['lengthStart','lengthEnd','widthStart','widthEnd'].map(n=>[n,{thicknessMm:0}]))}};
 a.w+=0.5;let r=cabinetProductionParts([a]);assert.ok(r.parts.find(q=>q.id===p.id).substrate);
 a.cab.cols[0].secs.reverse();r=cabinetProductionParts([a]);
 assert.ok(r.issues.some(i=>i.code==='edge-topology-mismatch'));assert.equal(r.parts.find(q=>q.id===p.id).substrate,null);
 a.cab.cols[0].secs.reverse();a.cab.cols[0].secs[0].n=2;r=cabinetProductionParts([a]);assert.ok(r.issues.some(i=>i.code==='edge-topology-mismatch'));
 delete a.cab.productionOverrides[p.partId].topologyBinding;r=cabinetProductionParts([a]);assert.ok(r.issues.some(i=>i.code==='edge-topology-mismatch'));
});
