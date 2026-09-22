import test from 'node:test';
import assert from 'node:assert/strict';
import {rectangularFindPlace,rectangularPlace,rectangularOffcuts,validateRectangularNesting} from '../js/nest_rectangular.js';
import {nest,panelsOf,quote,cutCSV,nestDXF} from '../js/nest.js';
import {makeSpec} from '../js/cabinet.js';
import {addOffcuts,clearOffcuts} from '../js/stock.js';
const overlaps=(a,b)=>a.x<b.x+b.w-1e-7&&b.x<a.x+a.w-1e-7&&a.y<b.y+b.h-1e-7&&b.y<a.y+a.h-1e-7;
function pack(list,{w=100,l=100,kerf=1,trim=2,grainLock=true}={}){const opt={kerf,trim,grainLock,minOffcut:0},sh={sheet:{w,l},place:[],free:[{x:trim,y:trim,w:w-2*trim+kerf,h:l-2*trim+kerf}]};for(const p of list){const c=rectangularFindPlace(sh,p,opt);if(c)rectangularPlace(sh,p,c,opt);}return {sh,opt};}
const panel=(id,gl,gw,grain=false)=>({id,gl,gw,grain});
test('rectangular pack respects exact trim bounds and kerf without inflating parts',()=>{
 let {sh,opt}=pack([panel('exact',96,96)]);assert.equal(sh.place.length,1);assert.equal(sh.place[0].w,96);assert.deepEqual(validateRectangularNesting([sh],opt),[]);
 ({sh,opt}=pack([panel('a',96,47.5),panel('b',96,47.5)]));assert.equal(sh.place.length,2);assert.deepEqual(validateRectangularNesting([sh],opt),[]);
 ({sh,opt}=pack([panel('a',96,48),panel('b',96,48)]));assert.equal(sh.place.length,1);
});
test('grain prevents rotation and invalid dimensions cannot be placed',()=>{
 assert.equal(pack([panel('locked',80,110,true)],{w:100,l:120,trim:0}).sh.place.length,0);
 const p=pack([panel('rotate',80,110,false)],{w:100,l:120,trim:0});assert.equal(p.sh.place[0].rot,1);
 for(const size of [0,-1,NaN,Infinity])assert.equal(pack([panel('invalid',size,20)]).sh.place.length,0);
});
test('random deterministic packs and recoverable offcuts are disjoint and within sheet',()=>{
 let seed=7919;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let trial=0;trial<30;trial++){const list=Array.from({length:45},(_,i)=>panel(String(i),5+random()*45,5+random()*35,i%3===0)),{sh,opt}=pack(list,{w:120,l:240,kerf:0.6,trim:1});assert.deepEqual(validateRectangularNesting([sh],opt),[]);
 const free=rectangularOffcuts(sh,opt);for(const [i,r] of free.entries()){assert.ok(r.x>=1&&r.y>=1&&r.x+r.w<=119+1e-6&&r.y+r.h<=239+1e-6);assert.ok(sh.place.every(p=>!overlaps(r,p)));assert.ok(free.slice(i+1).every(other=>!overlaps(r,other)));}
 assert.ok(free.reduce((s,r)=>s+r.w*r.h,0)+sh.place.reduce((s,p)=>s+p.w*p.h,0)<=118*238+1e-6);
 }
});
test('independent validator detects overlaps, gap violations, grain and dimension drift',()=>{
 const {sh,opt}=pack([panel('a',40,40,true),panel('b',40,40)]);sh.place[1].x=sh.place[0].x+40.5;sh.place[1].y=sh.place[0].y;assert.ok(validateRectangularNesting([sh],opt).some(i=>i.code==='panel-spacing'));
 sh.place[0].rot=1;sh.place[0].w=41;assert.ok(validateRectangularNesting([sh],opt).some(i=>i.code==='grain-rotation'));assert.ok(validateRectangularNesting([sh],opt).some(i=>i.code==='panel-size'));
});
test('both algorithms preserve production panel identity, exact sizes and export metadata',()=>{
 const item={id:'router-cab',type:'cabsys',x:0,y:0,w:120.123,h:220,d:60,rot:0,cab:makeSpec('w_classic',120.123,220,60)},panels=panelsOf([item]);
 for(const algorithm of ['guillotine','router-rectangular']){const result=nest(panels,{algorithm,useStock:false});assert.equal(result.machineReady,false);assert.equal(result.unplaced.length,0);const placed=result.groups.flatMap(g=>g.sheets.flatMap(s=>s.place));assert.deepEqual(placed.map(p=>p.p.id).sort(),panels.map(p=>p.id).sort());assert.ok(placed.every(p=>p.p===panels.find(v=>v.id===p.p.id)));assert.deepEqual(validateRectangularNesting(result.groups.flatMap(g=>g.sheets),result.opt),[]);}
 const q=quote([item],{algorithm:'router-rectangular',useStock:false});assert.match(cutCSV(q,true),/router-rectangular/);assert.match(cutCSV(q,true),/Production part ID/);assert.match(nestDXF(q),/RECTANGULAR BLANKS \/ router-rectangular \/ NOT CAM/);
 assert.throws(()=>nest(panels,{kerf:-1}),/nonnegative/);assert.throws(()=>nest(panels,{algorithm:'magic'}),/Unknown/);
});
test('rack pieces use actual dimensions, no second trim, and leftovers preserve grain axes',()=>{
 clearOffcuts();try{const item={id:'rack-cab',type:'cabsys',w:60,h:80,d:60,cab:makeSpec('k_base',60,80,60)},base={...panelsOf([item])[0],sheetId:'mel_oak_18',grain:true};assert.ok(base);
 addOffcuts([{sheet:base.sheetId,l:40,w:80}]);const p={...base,id:'rack-part',gl:40,gw:30,l:40,w:30};const result=nest([p],{algorithm:'router-rectangular',trim:5,kerf:0.4,minOffcut:1});assert.equal(result.stockCount,1);assert.equal(result.sheetCount,0);const sh=result.groups[0].sheets[0];assert.equal(sh.sheet.l,40);assert.equal(sh.place[0].y,0);assert.equal(sh.place[0].x,0);
 assert.ok(result.leftovers.some(r=>r.w>r.l));
 }finally{clearOffcuts();}
});
