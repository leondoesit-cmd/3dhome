import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeRaster} from '../js/core/blueprint_raster.js';
import {blueprintSymbols} from '../js/core/blueprint_symbols.js';
import {blueprintDoorSwing} from '../js/core/blueprint_door_swing.js';
import {resolveBlueprintSymbols,symbolClassificationSchema,allowedSymbolTypes,normalizeBlueprintSymbol} from '../server/blueprint_vision.mjs';

function drawing(width=520,height=600){
 const image={width,height,data:new Uint8ClampedArray(width*height*4).fill(255)};
 const rect=(x0,y0,x1,y1,color=[185,184,190])=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)image.data.set([...color,255],(y*width+x)*4);};
 return {image,rect};
}
test('a grey tub band cannot become a partition between thin bathroom walls',()=>{
 const {image,rect}=drawing();
 rect(20,20,480,30);rect(20,550,480,560);rect(20,20,30,560);rect(470,20,480,560);
 rect(20,100,180,106);rect(20,180,180,184);rect(176,100,182,184);
 rect(115,108,125,174,[191,191,191]);
 const result=recognizeRaster(image);
 assert.ok(result.segments.some(s=>!s.vertical&&Math.abs(s.c-103)<5));
 assert.ok(!result.segments.some(s=>s.vertical&&s.c>105&&s.c<135&&s.a<175&&s.b>105));
});
test('a bed-like neutral stroke cannot extend a nearby coloured exterior wall into another room',()=>{
 const {image,rect}=drawing();
 rect(20,20,480,30);rect(470,20,480,560);rect(20,20,30,305);rect(20,295,78,305);rect(68,300,78,560);rect(68,550,480,560);
 rect(64,230,69,280,[190,190,190]);
 const result=recognizeRaster(image);
 assert.ok(!result.segments.some(s=>s.vertical&&s.c>60&&s.c<80&&s.a<290&&s.b>400));
});
test('an open exterior cannot erase visible furniture in the main room',()=>{
 const {image,rect}=drawing(240,200);
 rect(30,60,70,120,[90,90,90]);rect(150,70,195,110,[80,80,80]);
 const walls=[[10,10,230,10,6],[10,190,230,190,6],[10,10,10,190,6],[230,10,230,50,6],[230,150,230,190,6],[100,10,100,190,6]];
 const result=blueprintSymbols(image,walls);
 assert.ok(result.some(s=>Math.abs(s.x-49.5)<1&&Math.abs(s.y-89.5)<1));
 assert.ok(result.some(s=>Math.abs(s.x-172)<1&&Math.abs(s.y-89.5)<1));
});
test('thin swing arcs identify doors while a filled shadow does not',()=>{
 const {image,rect}=drawing(180,180);const a={x:60,y:60},b={x:120,y:60};
 rect(59,60,62,121,[175,175,175]);
 for(let i=0;i<=180;i++){const angle=i/180*Math.PI/2,x=Math.round(60+60*Math.cos(angle)),y=Math.round(60+60*Math.sin(angle));rect(x-1,y-1,x+2,y+2,[175,175,175]);}
 assert.ok(blueprintDoorSwing(image,a,b,4));
 const shadow=drawing(180,180);shadow.rect(50,50,130,130,[175,175,175]);
 assert.equal(blueprintDoorSwing(shadow.image,a,b,4),null);
});
test('classification keeps a counter with its sink but suppresses pillows on a bed',()=>{
 const symbols=[{id:'F0',x:100,y:100,w:50,d:100},{id:'F1',parent:'F0',x:100,y:65,w:20,d:15},
 {id:'F2',x:200,y:200,w:120,d:40,core:{x:205,y:200,w:100,d:40}},{id:'F3',parent:'F2',x:200,y:200,w:25,d:20}];
 const result=resolveBlueprintSymbols(symbols,{F0:'bed',F1:'plant',F2:'base',F3:'sink'});
 assert.deepEqual(result.map(s=>s.type),['bed','base','sink']);assert.equal(result[1].w,100);
 const schema=symbolClassificationSchema([{id:'F0',w:10,d:12}],2);
 assert.equal(schema.properties.furniture.properties.F0.properties.type.type,'string');
 assert.ok(!allowedSymbolTypes({w:10,d:12},2).includes('bed'));
});

test('confirmed scale rejects narrow false beds and a floor-sized table without rejecting real beds',()=>{
 for(const [w,d] of [[23,99],[72,23],[27,100],[41,52]])assert.ok(!allowedSymbolTypes({w,d},2.19,true).includes('bed'));
 for(const [w,d] of [[46,89],[46,90],[89,47],[114,91]])assert.ok(allowedSymbolTypes({w,d},2.19,true).includes('bed'));
 assert.ok(!allowedSymbolTypes({w:211,d:69},2.19,true).includes('table'));
 assert.equal(normalizeBlueprintSymbol({type:'kitchen counter',evidence:'drawn sink and worktop'}),'base');
 assert.equal(normalizeBlueprintSymbol({type:'magenta rectangle'}),'unknown');
});

test('a central compact label cannot swallow an independently measured table surface',()=>{
 const symbols=[{id:'F0',x:200,y:150,w:160,d:110,core:{x:200,y:150,w:110,d:60},greenSurface:false},
 {id:'F1',parent:'F0',x:200,y:150,w:15,d:15},{id:'F2',parent:'F0',x:130,y:150,w:20,d:20},{id:'F3',parent:'F0',x:270,y:150,w:20,d:20}];
 const result=resolveBlueprintSymbols(symbols,{F0:'plant',F1:'plant',F2:'chair',F3:'chair'},[],1);
 assert.deepEqual(result.map(s=>s.type),['table','plant','chair','chair']);
 assert.equal(result[0].w,110);assert.equal(result[1].w,15);
});

test('green parent surfaces retain their leaf clusters; repeated siblings can repair one unknown label',()=>{
 const children=[{id:'F1',parent:'F0',x:200,y:150,w:20,d:20},{id:'F2',parent:'F0',x:140,y:150,w:20,d:20},{id:'F3',parent:'F0',x:260,y:150,w:20,d:20}];
 const parent={id:'F0',x:200,y:150,w:160,d:110,greenSurface:true};
 assert.deepEqual(resolveBlueprintSymbols([parent,...children],{F0:'plant',F1:'plant',F2:'plant',F3:'plant'},[],1).map(s=>s.type),['plant']);
 const result=resolveBlueprintSymbols([{...parent,greenSurface:false},...children],{F0:'unknown',F1:'chair',F2:'chair',F3:'unknown'},[],1);
 assert.equal(result.filter(s=>s.type==='chair').length,3);
});

test('shadow proposals do not duplicate a fixture and a bedside object survives the bed core',()=>{
 const symbols=[{id:'F0',x:100,y:100,w:106,d:46},{id:'F1',x:100,y:100,w:100,d:40},
 {id:'F2',x:250,y:200,w:100,d:120,core:{x:240,y:200,w:70,d:120}},
 {id:'F3',parent:'F2',x:290,y:160,w:20,d:20}];
 const result=resolveBlueprintSymbols(symbols,{F0:'sofa',F1:'sofa',F2:'bed',F3:'nightstand'});
 assert.deepEqual(result.map(s=>s.type),['sofa','bed','nightstand']);
 assert.equal(result[1].w,70);
});
